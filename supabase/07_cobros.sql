-- ---------- cobros ----------
--
-- Un cobro es una intención: "esta empresa va a pagar este plan". Se crea al
-- generar el pedido en la pasarela y se completa —o no— cuando la pasarela
-- avisa.
--
-- Existe por una razón concreta: el aviso de pago trae el `hash_pedido` de
-- Pagopar y nada más. Sin esta tabla no hay forma de saber de qué empresa es
-- la plata que entró. La relación hay que guardarla ANTES de mandar a la
-- persona a pagar, no después.
--
-- Está separada de `pagos` porque son cosas distintas: acá hay muchos intentos
-- y la mayoría se abandona; allá hay plata que entró de verdad.

create table if not exists zentra.cobros (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references zentra.empresas (id) on delete cascade,
  plan          text not null check (plan in ('free', 'emprendedor', 'max')),
  monto         numeric(14, 2) not null check (monto > 0),
  pasarela      text not null default 'pagopar',
  -- Nuestro identificador, el que se le manda a la pasarela al crear el pedido.
  referencia    text not null,
  -- El identificador de la pasarela. Llega en la respuesta de creación, y es
  -- por el que después pregunta el aviso de pago.
  hash_pedido   text,
  estado        text not null default 'pendiente'
    check (estado in ('pendiente', 'pagado', 'cancelado')),
  creado_en     timestamptz not null default now(),
  unique (pasarela, referencia)
);

create unique index if not exists cobros_hash_idx
  on zentra.cobros (pasarela, hash_pedido) where hash_pedido is not null;

-- ---------- registrar un pago ----------
--
-- Todo junto y en una sola transacción, que es el punto: insertar el pago,
-- empujar el vencimiento y marcar el cobro no pueden quedar a medias ni
-- correrse dos veces en paralelo.
--
-- Devuelve qué pasó, para que quien la llame pueda distinguir un pago nuevo de
-- un aviso repetido sin tener que adivinar.

create or replace function zentra.registrar_pago_pasarela(
  p_pasarela    text,
  p_hash        text,
  p_monto       numeric
)
returns table (resultado text, empresa uuid, vence date)
language plpgsql
security definer
set search_path = zentra, public
as $$
declare
  v_cobro   zentra.cobros%rowtype;
  v_nuevo   date;
  v_insertó boolean;
begin
  select * into v_cobro
    from zentra.cobros
   where pasarela = p_pasarela and hash_pedido = p_hash
   -- El lock es lo que impide que dos avisos simultáneos del mismo pago
   -- empujen el vencimiento dos veces.
   for update;

  if not found then
    return query select 'desconocido'::text, null::uuid, null::date;
    return;
  end if;

  -- La clave única sobre (pasarela, referencia) de `pagos` es lo que hace que
  -- esto sea idempotente. La pasarela reintenta el aviso hasta recibir un 200;
  -- sin esto, una caída de media hora le regala meses a un cliente.
  insert into zentra.pagos (empresa_id, referencia, pasarela, monto, plan, periodo_hasta)
    select v_cobro.empresa_id, p_hash, p_pasarela, p_monto, v_cobro.plan, current_date
    on conflict (pasarela, referencia) do nothing;
  get diagnostics v_insertó = row_count;

  if not v_insertó then
    -- Ya estaba registrado: se contesta igual que si fuera nuevo, para que la
    -- pasarela deje de reintentar, pero sin tocar nada.
    select e.vence into v_nuevo from zentra.empresas e where e.id = v_cobro.empresa_id;
    return query select 'repetido'::text, v_cobro.empresa_id, v_nuevo;
    return;
  end if;

  -- Un mes desde el vencimiento, o desde hoy si ya pasó.
  --
  -- El `greatest` es lo que hace justicia en los dos sentidos: quien paga tres
  -- días antes no pierde esos días, y quien paga una semana tarde no se los
  -- lleva de regalo. Son las dos quejas clásicas de cualquier suscripción.
  --
  -- La tabla va con alias y las columnas calificadas (`e.vence`) porque esta
  -- función devuelve una columna que se llama igual. Sin el alias, Postgres no
  -- sabe si `vence` es la columna o el parámetro de salida y corta con
  -- "column reference vence is ambiguous" —después de que la plata entró, que
  -- es el peor momento para enterarse—.
  update zentra.empresas e
     set plan  = v_cobro.plan,
         vence = (greatest(coalesce(e.vence, current_date), current_date) + interval '1 month')::date
   where e.id = v_cobro.empresa_id
   returning e.vence into v_nuevo;

  update zentra.pagos set periodo_hasta = v_nuevo
   where pasarela = p_pasarela and referencia = p_hash;

  update zentra.cobros set estado = 'pagado' where id = v_cobro.id;

  return query select 'pagado'::text, v_cobro.empresa_id, v_nuevo;
end;
$$;

-- Sólo el servidor. La app nunca llama a esto: quien decide que algo se pagó
-- es la pasarela, no el teléfono.
--
-- Y el `grant` de abajo hace falta justamente por el `revoke`: al sacárselo a
-- `public` se lo saca a todos, `service_role` incluido, que es el único que
-- tiene que poder llamarla.
revoke all on function zentra.registrar_pago_pasarela(text, text, numeric) from public, anon, authenticated;
grant execute on function zentra.registrar_pago_pasarela(text, text, numeric) to service_role;

alter table zentra.cobros enable row level security;
-- Sin políticas: nadie llega a esta tabla con la clave pública. Se escribe y se
-- lee sólo desde el servidor, con la clave de servicio.

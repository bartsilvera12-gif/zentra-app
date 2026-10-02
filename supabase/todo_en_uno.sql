-- =============================================================================
-- Zentra Móvil · TODO EN UNO
-- Equivale a correr 01 + 02 + 03 + 04 + 05 en ese orden.
-- Generado automáticamente: no editar a mano, editar los archivos sueltos.
-- =============================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>> 01_schema.sql <<<<<<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- Zentra Móvil · 01 · Esquema
-- Correr en el SQL Editor de Supabase. Es idempotente: se puede correr de nuevo.
--
-- Todo vive en el schema `zentra` y no en `public`, para que estas mismas tablas
-- se puedan instalar dentro del proyecto de un cliente que ya tiene ERP sin
-- pisarle nada.
--
-- Montos en guaraníes: `bigint`. El guaraní no tiene centavos, así que enteros
-- evitan los errores de redondeo de los decimales.
-- Cantidades: `numeric(14,3)`, porque las unidades pesables admiten decimales.
-- =============================================================================

create schema if not exists zentra;

-- ---------- tipos ----------

do $$ begin
  create type zentra.iva as enum ('10%', '5%', 'Exenta');
exception when duplicate_object then null; end $$;

do $$ begin
  create type zentra.estado_registro as enum ('Activo', 'Inactivo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type zentra.origen_cliente as enum ('Venta', 'Manual', 'CRM');
exception when duplicate_object then null; end $$;

do $$ begin
  create type zentra.tipo_movimiento as enum ('ENTRADA', 'SALIDA', 'AJUSTE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type zentra.metodo_valuacion as enum ('CPP', 'FIFO', 'LIFO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type zentra.condicion_pago as enum ('Contado', 'Crédito');
exception when duplicate_object then null; end $$;

do $$ begin
  create type zentra.estado_venta as enum ('Cobrada', 'Pendiente', 'Anulada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type zentra.estado_compra as enum ('Pagada', 'Pendiente', 'Anulada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type zentra.metodo_cobro as enum ('efectivo', 'transferencia', 'cheque');
exception when duplicate_object then null; end $$;

do $$ begin
  create type zentra.moneda as enum ('PYG', 'USD');
exception when duplicate_object then null; end $$;

-- ---------- empresas ----------

create table if not exists zentra.empresas (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (length(btrim(nombre)) >= 2),
  ruc           text,
  direccion     text,
  ciudad        text,
  telefono      text,
  -- Facturación electrónica: se activa por soporte cuando el cliente trae su
  -- certificado y timbrado. Hasta entonces la app emite notas de venta.
  sifen_activo  boolean not null default false,
  timbrado      text,
  creado_en     timestamptz not null default now()
);

-- ---------- usuarios ----------
-- El id es el mismo de auth.users: una identidad, un perfil.

create table if not exists zentra.usuarios (
  id          uuid primary key references auth.users (id) on delete cascade,
  empresa_id  uuid not null references zentra.empresas (id) on delete cascade,
  nombre      text not null default '',
  email       text,
  rol         text not null default 'VENDEDOR',
  estado      zentra.estado_registro not null default 'Activo',
  creado_en   timestamptz not null default now()
);

create index if not exists usuarios_empresa_idx on zentra.usuarios (empresa_id);

-- ---------- clientes ----------

create table if not exists zentra.clientes (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references zentra.empresas (id) on delete cascade,
  nombre              text not null check (length(btrim(nombre)) >= 2),
  doc                 text,
  contacto            text,
  tel                 text,
  email               text,
  estado              zentra.estado_registro not null default 'Activo',
  origen              zentra.origen_cliente not null default 'Manual',
  zona                text,
  direccion           text,
  lista_precios       text not null default 'Mayorista',
  -- null = sin crédito habilitado
  credito_limite      bigint check (credito_limite is null or credito_limite >= 0),
  credito_plazo_dias  int    check (credito_plazo_dias is null or credito_plazo_dias > 0),
  creado_en           timestamptz not null default now()
);

create index if not exists clientes_empresa_idx on zentra.clientes (empresa_id);
create index if not exists clientes_busqueda_idx on zentra.clientes
  using gin (to_tsvector('simple', coalesce(nombre,'') || ' ' || coalesce(doc,'') || ' ' || coalesce(contacto,'')));

-- ---------- proveedores ----------

create table if not exists zentra.proveedores (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references zentra.empresas (id) on delete cascade,
  nombre              text not null check (length(btrim(nombre)) >= 2),
  doc                 text,
  rubro               text,
  ciudad              text,
  contacto            text,
  tel                 text,
  email               text,
  estado              zentra.estado_registro not null default 'Activo',
  entrega_dias        int not null default 1 check (entrega_dias >= 0),
  credito_plazo_dias  int check (credito_plazo_dias is null or credito_plazo_dias > 0),
  creado_en           timestamptz not null default now()
);

create index if not exists proveedores_empresa_idx on zentra.proveedores (empresa_id);

-- ---------- productos ----------

create table if not exists zentra.productos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references zentra.empresas (id) on delete cascade,
  nombre      text not null check (length(btrim(nombre)) >= 2),
  sku         text not null,
  barras      text,
  -- Stock vigente. Lo mantiene el trigger de movimientos, no la app.
  stock       numeric(14,3) not null default 0,
  minimo      numeric(14,3) not null default 0 check (minimo >= 0),
  costo       bigint not null default 0 check (costo >= 0),
  -- Precio de venta CON IVA incluido, como factura Paraguay.
  precio      bigint not null default 0 check (precio >= 0),
  unidad      text not null default 'UNIDAD',
  categoria   text,
  deposito    text,
  iva         zentra.iva not null default '10%',
  metodo      zentra.metodo_valuacion not null default 'CPP',
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  unique (empresa_id, sku)
);

create index if not exists productos_empresa_idx on zentra.productos (empresa_id);
create index if not exists productos_barras_idx on zentra.productos (empresa_id, barras);

-- ---------- movimientos de stock ----------

create table if not exists zentra.movimientos (
  id           bigserial primary key,
  empresa_id   uuid not null references zentra.empresas (id) on delete cascade,
  producto_id  uuid not null references zentra.productos (id) on delete cascade,
  tipo         zentra.tipo_movimiento not null,
  -- Con signo: negativo en salidas y mermas. Nunca cero.
  cantidad     numeric(14,3) not null check (cantidad <> 0),
  origen       text not null default '',
  ref          text,
  usuario_id   uuid references zentra.usuarios (id) on delete set null,
  creado_en    timestamptz not null default now()
);

create index if not exists movimientos_empresa_fecha_idx on zentra.movimientos (empresa_id, creado_en desc);
create index if not exists movimientos_producto_idx on zentra.movimientos (producto_id, creado_en desc);

-- ---------- ventas ----------

create table if not exists zentra.ventas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references zentra.empresas (id) on delete cascade,
  -- Correlativo por empresa. Lo asigna el servidor, nunca el cliente.
  numero        text not null,
  -- null = venta sin nombre
  cliente_id    uuid references zentra.clientes (id) on delete set null,
  cliente_texto text not null default 'Sin nombre',
  cliente_doc   text not null default 'Sin documento',
  fecha         date not null default current_date,
  condicion     zentra.condicion_pago not null,
  metodo        zentra.metodo_cobro,
  plazo_dias    int check (plazo_dias is null or plazo_dias > 0),
  estado        zentra.estado_venta not null,
  moneda        zentra.moneda not null default 'PYG',
  usuario_id    uuid references zentra.usuarios (id) on delete set null,
  creado_en     timestamptz not null default now(),
  unique (empresa_id, numero),
  -- Contado cobra con un método; crédito necesita plazo. Y el crédito exige
  -- cliente identificado: es la regla del ERP, acá queda garantizada.
  constraint venta_pago_coherente check (
    (condicion = 'Contado' and metodo is not null and plazo_dias is null)
    or
    (condicion = 'Crédito' and plazo_dias is not null and cliente_id is not null)
  )
);

create index if not exists ventas_empresa_fecha_idx on zentra.ventas (empresa_id, fecha desc);
create index if not exists ventas_cliente_idx on zentra.ventas (cliente_id);

create table if not exists zentra.venta_lineas (
  id           bigserial primary key,
  venta_id     uuid not null references zentra.ventas (id) on delete cascade,
  producto_id  uuid references zentra.productos (id) on delete set null,
  nombre       text not null,
  cantidad     numeric(14,3) not null check (cantidad > 0),
  -- Precio unitario CON IVA incluido.
  precio       bigint not null check (precio >= 0),
  iva          zentra.iva not null default '10%'
);

create index if not exists venta_lineas_venta_idx on zentra.venta_lineas (venta_id);

-- ---------- compras ----------

create table if not exists zentra.compras (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references zentra.empresas (id) on delete cascade,
  numero        text not null,
  proveedor_id  uuid references zentra.proveedores (id) on delete set null,
  fecha         date not null default current_date,
  condicion     zentra.condicion_pago not null,
  plazo_dias    int check (plazo_dias is null or plazo_dias > 0),
  cuotas        int not null default 1 check (cuotas >= 1),
  estado        zentra.estado_compra not null,
  factura       text,
  timbrado      text,
  moneda        zentra.moneda not null default 'PYG',
  -- Cotización usada si la compra vino en dólares. Se guarda para poder
  -- reconstruir el costo histórico.
  tipo_cambio   numeric(14,4),
  usuario_id    uuid references zentra.usuarios (id) on delete set null,
  creado_en     timestamptz not null default now(),
  unique (empresa_id, numero),
  constraint compra_pago_coherente check (
    (condicion = 'Contado' and plazo_dias is null)
    or
    (condicion = 'Crédito' and plazo_dias is not null)
  ),
  constraint compra_usd_con_cambio check (
    moneda = 'PYG' or tipo_cambio is not null
  )
);

create index if not exists compras_empresa_fecha_idx on zentra.compras (empresa_id, fecha desc);
create index if not exists compras_proveedor_idx on zentra.compras (proveedor_id);

create table if not exists zentra.compra_lineas (
  id           bigserial primary key,
  compra_id    uuid not null references zentra.compras (id) on delete cascade,
  producto_id  uuid references zentra.productos (id) on delete set null,
  nombre       text not null,
  unidad       text not null default 'UNIDAD',
  cantidad     numeric(14,3) not null check (cantidad > 0),
  -- Costo unitario NETO, sin IVA: el proveedor cotiza neto.
  costo        bigint not null check (costo >= 0),
  iva          zentra.iva not null default '10%'
);

create index if not exists compra_lineas_compra_idx on zentra.compra_lineas (compra_id);

-- ---------- numeración correlativa ----------

create table if not exists zentra.numeracion (
  empresa_id  uuid not null references zentra.empresas (id) on delete cascade,
  tipo        text not null,
  proximo     bigint not null default 1 check (proximo > 0),
  primary key (empresa_id, tipo)
);


-- >>>>>>>>>>>>>>>>>>>>>>>> 02_funciones.sql <<<<<<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- Zentra Móvil · 02 · Funciones y disparadores
-- =============================================================================

-- ---------- a qué empresa pertenece quien está pidiendo ----------
-- Toda la seguridad cuelga de acá. `security definer` para que pueda leer
-- `usuarios` sin que la propia política de `usuarios` la llame en bucle.
-- El `search_path` va fijo: si no, alguien podría anteponer un schema propio
-- con una tabla `usuarios` falsa y hacerse pasar por otra empresa.

create or replace function zentra.empresa_actual()
returns uuid
language sql
stable
security definer
set search_path = zentra, pg_catalog
as $$
  select empresa_id from zentra.usuarios where id = auth.uid()
$$;

-- ---------- numeración correlativa ----------
-- La asigna el servidor. Si dos vendedores facturan a la vez, el bloqueo de fila
-- de `update ... returning` serializa: nunca se repite un número.

create or replace function zentra.siguiente_numero(p_empresa uuid, p_tipo text)
returns text
language plpgsql
volatile
security definer
set search_path = zentra, pg_catalog
as $$
declare
  v_n      bigint;
  v_prefijo text;
begin
  insert into zentra.numeracion (empresa_id, tipo, proximo)
  values (p_empresa, p_tipo, 1)
  on conflict (empresa_id, tipo) do nothing;

  update zentra.numeracion
     set proximo = proximo + 1
   where empresa_id = p_empresa and tipo = p_tipo
  returning proximo - 1 into v_n;

  v_prefijo := case p_tipo
    when 'venta'  then 'VTA'
    when 'compra' then 'COMP'
    when 'ajuste' then 'AJU'
    else upper(p_tipo)
  end;

  return v_prefijo || '-' || lpad(v_n::text, 6, '0');
end;
$$;

-- ---------- stock ----------
-- El stock del producto lo mantiene este disparador, no la app: así no puede
-- quedar desincronizado del libro de movimientos.

create or replace function zentra.aplicar_movimiento()
returns trigger
language plpgsql
security definer
set search_path = zentra, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    update zentra.productos
       set stock = stock + new.cantidad
     where id = new.producto_id;
    return new;
  elsif tg_op = 'DELETE' then
    update zentra.productos
       set stock = stock - old.cantidad
     where id = old.producto_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists movimientos_aplicar on zentra.movimientos;
create trigger movimientos_aplicar
  after insert or delete on zentra.movimientos
  for each row execute function zentra.aplicar_movimiento();

-- ---------- alta automática al registrarse ----------
-- Quien baja la app de la tienda y se registra necesita su empresa y su perfil
-- creados en el mismo acto; si no, entra a una app que no sabe quién es.

create or replace function zentra.registrar_usuario()
returns trigger
language plpgsql
security definer
set search_path = zentra, pg_catalog
as $$
declare
  v_empresa uuid;
  v_nombre  text;
begin
  -- Si el usuario fue creado por soporte para una empresa existente, viene con
  -- empresa_id en los metadatos y no se crea una nueva.
  v_empresa := nullif(new.raw_user_meta_data ->> 'empresa_id', '')::uuid;
  v_nombre  := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1));

  if v_empresa is null then
    insert into zentra.empresas (nombre)
    values (coalesce(nullif(btrim(new.raw_user_meta_data ->> 'empresa'), ''), v_nombre))
    returning id into v_empresa;
  end if;

  insert into zentra.usuarios (id, empresa_id, nombre, email, rol)
  values (
    new.id,
    v_empresa,
    v_nombre,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'rol', ''), 'ADMIN')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists usuarios_al_registrarse on auth.users;
create trigger usuarios_al_registrarse
  after insert on auth.users
  for each row execute function zentra.registrar_usuario();

-- ---------- totales ----------
-- El IVA va CONTENIDO en el precio de venta: bruto * r / (1 + r), no bruto * r.
-- Para ₲33.500 al 10% el IVA es ₲3.045, no ₲3.350.

create or replace function zentra.tasa_iva(p zentra.iva)
returns numeric
language sql
immutable
as $$
  select case p when '10%' then 0.10 when '5%' then 0.05 else 0 end
$$;

-- Se suma sin redondear y se redondea UNA sola vez al final. Redondear por línea
-- y después sumar da un guaraní de diferencia (3.046 en vez de 3.045 sobre
-- ₲33.500 al 10%), y entonces la factura y la base dejan de coincidir.

create or replace function zentra.total_venta(p_venta uuid)
returns bigint
language sql
stable
as $$
  select coalesce(round(sum(cantidad * precio)), 0)::bigint
    from zentra.venta_lineas where venta_id = p_venta
$$;

create or replace function zentra.iva_venta(p_venta uuid)
returns bigint
language sql
stable
as $$
  select coalesce(round(sum(
    cantidad * precio * zentra.tasa_iva(iva) / (1 + zentra.tasa_iva(iva))
  )), 0)::bigint
    from zentra.venta_lineas where venta_id = p_venta
$$;

-- Desglose por tasa, que es lo que necesitan el reporte de facturación y SIFEN:
-- no alcanza con el IVA total, hay que declarar gravado e impuesto por cada tasa.
create or replace function zentra.iva_venta_por_tasa(p_venta uuid)
returns table (tasa zentra.iva, gravado bigint, impuesto bigint)
language sql
stable
as $$
  select
    iva,
    round(sum(cantidad * precio / (1 + zentra.tasa_iva(iva))))::bigint,
    round(sum(cantidad * precio * zentra.tasa_iva(iva) / (1 + zentra.tasa_iva(iva))))::bigint
  from zentra.venta_lineas
  where venta_id = p_venta
  group by iva
$$;

-- En compras el IVA va POR ENCIMA del costo: el proveedor cotiza neto.
create or replace function zentra.total_compra(p_compra uuid)
returns bigint
language sql
stable
as $$
  select coalesce(round(sum(
    cantidad * costo * (1 + zentra.tasa_iva(iva))
  )), 0)::bigint
    from zentra.compra_lineas where compra_id = p_compra
$$;


-- >>>>>>>>>>>>>>>>>>>>>>>> 03_permisos.sql <<<<<<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- Zentra Móvil · 03 · Permisos (Row Level Security)
--
-- Esto es lo que separa a una empresa de otra. Sin esto, cualquiera con la clave
-- pública leería los datos de todos. La clave pública NO protege nada: protege
-- esto.
-- =============================================================================

-- El rol anónimo puede ver el schema, pero cada tabla decide qué deja ver.
grant usage on schema zentra to anon, authenticated;

alter table zentra.empresas       enable row level security;
alter table zentra.usuarios       enable row level security;
alter table zentra.clientes       enable row level security;
alter table zentra.proveedores    enable row level security;
alter table zentra.productos      enable row level security;
alter table zentra.movimientos    enable row level security;
alter table zentra.ventas         enable row level security;
alter table zentra.venta_lineas   enable row level security;
alter table zentra.compras        enable row level security;
alter table zentra.compra_lineas  enable row level security;
alter table zentra.numeracion     enable row level security;

-- Nadie entra sin sesión: `anon` no recibe permisos sobre las tablas.
grant select, insert, update, delete on all tables in schema zentra to authenticated;
grant usage, select on all sequences in schema zentra to authenticated;
grant execute on function zentra.siguiente_numero(uuid, text) to authenticated;

-- `dispositivos` es la excepción: la app no escribe esa tabla, el alta la hace
-- zentra.registrar_dispositivo(). El permiso se quita acá además de en 05 para
-- que el orden no importe: sin esto, correr 03 después de 05 le devolvería a la
-- app el permiso de insertar, y con él la posibilidad de registrar un teléfono a
-- nombre de otro usuario.
do $$
begin
  if to_regclass('zentra.dispositivos') is not null then
    revoke insert, update on zentra.dispositivos from authenticated;
  end if;
end $$;

-- ---------- empresas ----------
-- Cada uno ve y edita sólo la suya. Nadie crea ni borra empresas desde la app:
-- las crea el disparador de registro.

drop policy if exists empresas_ver on zentra.empresas;
create policy empresas_ver on zentra.empresas
  for select to authenticated
  using (id = zentra.empresa_actual());

drop policy if exists empresas_editar on zentra.empresas;
create policy empresas_editar on zentra.empresas
  for update to authenticated
  using (id = zentra.empresa_actual())
  with check (id = zentra.empresa_actual());

-- ---------- usuarios ----------
-- Se ven entre compañeros de empresa. Cada uno edita sólo su propia fila, así
-- nadie se cambia el rol ni se muda de empresa.

drop policy if exists usuarios_ver on zentra.usuarios;
create policy usuarios_ver on zentra.usuarios
  for select to authenticated
  using (empresa_id = zentra.empresa_actual());

drop policy if exists usuarios_editar_propio on zentra.usuarios;
create policy usuarios_editar_propio on zentra.usuarios
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and empresa_id = zentra.empresa_actual());

-- ---------- tablas con empresa_id ----------
-- Mismo patrón para todas: se ve y se escribe sólo lo de la empresa propia.
-- El `with check` es tan importante como el `using`: sin él, alguien podría
-- insertar filas con el empresa_id de otro.

do $$
declare t text;
begin
  foreach t in array array['clientes','proveedores','productos','movimientos','ventas','compras','numeracion']
  loop
    execute format('drop policy if exists %I on zentra.%I', t || '_propias', t);
    execute format($f$
      create policy %I on zentra.%I
        for all to authenticated
        using (empresa_id = zentra.empresa_actual())
        with check (empresa_id = zentra.empresa_actual())
    $f$, t || '_propias', t);
  end loop;
end $$;

-- ---------- líneas ----------
-- No tienen empresa_id propio: cuelgan de su cabecera. La política pregunta por
-- la cabecera, así no se puede colar una línea en una venta ajena.

drop policy if exists venta_lineas_propias on zentra.venta_lineas;
create policy venta_lineas_propias on zentra.venta_lineas
  for all to authenticated
  using (exists (
    select 1 from zentra.ventas v
     where v.id = venta_id and v.empresa_id = zentra.empresa_actual()))
  with check (exists (
    select 1 from zentra.ventas v
     where v.id = venta_id and v.empresa_id = zentra.empresa_actual()));

drop policy if exists compra_lineas_propias on zentra.compra_lineas;
create policy compra_lineas_propias on zentra.compra_lineas
  for all to authenticated
  using (exists (
    select 1 from zentra.compras c
     where c.id = compra_id and c.empresa_id = zentra.empresa_actual()))
  with check (exists (
    select 1 from zentra.compras c
     where c.id = compra_id and c.empresa_id = zentra.empresa_actual()));


-- >>>>>>>>>>>>>>>>>>>>>>>> 04_borrar_cuenta.sql <<<<<<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- Zentra Móvil · 04 · Borrado de cuenta
--
-- Las dos tiendas lo exigen si la app permite crear cuenta, y Apple lo hace
-- cumplir. Sin esto no se pasa revisión.
--
-- El borrado tiene que hacerlo una función del servidor: el cliente de la app
-- usa la clave pública y ésa no puede tocar `auth.users`. Por eso va con
-- `security definer`, igual que el resto, y con el `search_path` fijo.
-- =============================================================================

create or replace function zentra.eliminar_mi_cuenta()
returns void
language plpgsql
volatile
security definer
set search_path = zentra, pg_catalog
as $$
declare
  v_uid     uuid := auth.uid();
  v_empresa uuid;
  v_otros   int;
begin
  if v_uid is null then
    raise exception 'No hay sesión iniciada.';
  end if;

  select empresa_id into v_empresa from zentra.usuarios where id = v_uid;

  -- ¿Queda alguien más en la empresa? Si el que se va es el último, la empresa
  -- y todos sus datos se borran con él. Si quedan compañeros, la empresa sigue
  -- viva y sólo se va esta persona.
  select count(*) into v_otros
    from zentra.usuarios
   where empresa_id = v_empresa and id <> v_uid;

  -- Borrar de auth.users arrastra la fila de zentra.usuarios por la clave foránea.
  delete from auth.users where id = v_uid;

  if v_empresa is not null and v_otros = 0 then
    -- Y borrar la empresa arrastra clientes, productos, ventas, compras y
    -- movimientos, todos con `on delete cascade`.
    delete from zentra.empresas where id = v_empresa;
  end if;
end;
$$;

grant execute on function zentra.eliminar_mi_cuenta() to authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>> 05_dispositivos.sql <<<<<<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- Zentra Móvil · 05 · Dispositivos (notificaciones push)
--
-- Firebase Cloud Messaging le da a cada instalación de la app un token. Para
-- mandarle un aviso a alguien hay que saber qué tokens le corresponden, y eso es
-- lo que guarda esta tabla.
--
-- El token identifica al teléfono, no a la persona: cambia si reinstalan la app o
-- limpian los datos, y el mismo teléfono puede pasar de un usuario a otro. De ahí
-- las dos reglas de abajo: el token es único (no se duplica) y la app lo vuelve a
-- guardar en cada arranque.
--
-- Es idempotente: se puede correr de nuevo.
-- =============================================================================

create table if not exists zentra.dispositivos (
  -- El token es la clave natural: un teléfono, una fila. Si el aparato cambia de
  -- dueño, la fila se reasigna en vez de duplicarse; dos filas con el mismo token
  -- harían llegar el aviso dos veces, o al usuario que ya no usa ese teléfono.
  token        text primary key,
  usuario_id   uuid not null references zentra.usuarios(id) on delete cascade,
  empresa_id   uuid not null references zentra.empresas(id) on delete cascade,
  plataforma   text not null check (plataforma in ('android', 'ios', 'web')),
  -- Último arranque que confirmó este token. Sirve para limpiar los que ya no
  -- vuelven: FCM no avisa cuando un token muere, sólo falla al enviarle.
  visto        timestamptz not null default now(),
  creado       timestamptz not null default now()
);

-- Para "a quién le aviso": por usuario y por empresa (un aviso de stock bajo va a
-- todos los de la empresa).
create index if not exists dispositivos_usuario_idx on zentra.dispositivos(usuario_id);
create index if not exists dispositivos_empresa_idx on zentra.dispositivos(empresa_id);

-- ---------- permisos ----------

alter table zentra.dispositivos enable row level security;

-- Sólo lectura y baja. El alta va por la función de abajo: un teléfono que pasa
-- de un empleado a otro necesita reasignar una fila que todavía es de otro, y
-- ninguna política que valga la pena permite eso desde la app.
grant select, delete on zentra.dispositivos to authenticated;
revoke insert, update on zentra.dispositivos from authenticated;

drop policy if exists dispositivos_propios on zentra.dispositivos;

-- Cada uno maneja sólo los suyos. A propósito es más estricto que el resto de las
-- tablas: un compañero de empresa no tiene por qué poder dar de baja el teléfono
-- de otro, ni redirigir sus avisos al suyo.
create policy dispositivos_propios on zentra.dispositivos
  for all
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid() and empresa_id = zentra.empresa_actual());

-- ---------- alta ----------

-- La app llama a esto en cada entrada. Pasa sólo el token y la plataforma: de
-- quién es la fila lo decide el servidor con la sesión, así que no hay forma de
-- registrar un teléfono a nombre de otro ni colgarlo de otra empresa.
--
-- Borra antes de insertar porque el teléfono puede haber sido de otro empleado.
-- Dos filas con el mismo token harían llegar el aviso dos veces, o a quien ya no
-- usa ese teléfono.
create or replace function zentra.registrar_dispositivo(p_token text, p_plataforma text)
returns void
language plpgsql
volatile
security definer
set search_path = zentra, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_empresa uuid;
begin
  if v_uid is null then
    raise exception 'No hay sesión iniciada.';
  end if;
  if coalesce(p_token, '') = '' then
    raise exception 'Falta el token del dispositivo.';
  end if;
  if p_plataforma not in ('android', 'ios', 'web') then
    raise exception 'Plataforma desconocida: %', p_plataforma;
  end if;

  v_empresa := zentra.empresa_actual();
  if v_empresa is null then
    raise exception 'Tu cuenta no tiene empresa en esta instalación.';
  end if;

  delete from zentra.dispositivos where token = p_token;
  insert into zentra.dispositivos (token, usuario_id, empresa_id, plataforma)
  values (p_token, v_uid, v_empresa, p_plataforma);
end;
$$;

grant execute on function zentra.registrar_dispositivo(text, text) to authenticated;

-- ---------- a quién mandarle ----------

-- La usa el servidor que envía los avisos (con la clave de servicio, nunca la
-- app). Devuelve los tokens vivos de una empresa.
create or replace function zentra.tokens_de_empresa(p_empresa uuid)
returns table (token text, plataforma text)
language sql
stable
security definer
set search_path = zentra, pg_catalog
as $$
  select d.token, d.plataforma
    from zentra.dispositivos d
   where d.empresa_id = p_empresa
   order by d.visto desc
$$;

-- No se le da a `authenticated`: es para el backend de envío. Un vendedor no
-- necesita la lista de teléfonos de sus compañeros.
revoke all on function zentra.tokens_de_empresa(uuid) from public, anon, authenticated;


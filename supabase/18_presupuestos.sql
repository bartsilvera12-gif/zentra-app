-- ---------- presupuestos ----------
--
-- Un presupuesto es una venta que todavía no pasó: a quién, qué, a cuánto, y
-- hasta cuándo vale el precio. No mueve stock ni plata —por eso es una tabla
-- aparte y no una venta con un estado más—: si fuera una venta "pendiente",
-- cada reporte, cada saldo de cliente y cada descuento de stock tendría que
-- acordarse de excluirlo, y el día que uno se olvide, el presupuesto que el
-- cliente nunca aceptó aparece como plata por cobrar.
--
-- Cuando el cliente acepta se convierte en una venta de verdad, que se carga
-- por el camino de siempre. El presupuesto queda guardado con `venta_id`
-- apuntando a ella: así se sabe cuáles se cerraron y cuáles no.
--
-- Estados:
--   pendiente   recién hecho, esperando respuesta
--   aceptado    el cliente dijo que sí, todavía no se facturó
--   rechazado   el cliente dijo que no
--   convertido  ya es una venta (`venta_id` dice cuál)
--
-- "Vencido" no es un estado guardado: es un pendiente cuya `valido_hasta` ya
-- pasó, y se calcula al mostrarlo. Guardarlo pediría algo que lo actualice
-- todos los días, y una fecha que se compara no se desincroniza de nada.
--
-- Es idempotente: se puede correr de nuevo.

create table if not exists zentra.presupuestos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references zentra.empresas (id) on delete cascade,
  -- Correlativo por empresa, PRE-000001. Lo asigna `siguiente_numero`.
  numero        text not null,
  -- null = presupuesto sin cliente cargado; el nombre igual queda en el texto.
  cliente_id    uuid references zentra.clientes (id) on delete set null,
  cliente_texto text not null default 'Sin nombre',
  cliente_doc   text not null default 'Sin documento',
  fecha         date not null default current_date,
  valido_hasta  date not null,
  estado        text not null default 'pendiente'
    check (estado in ('pendiente', 'aceptado', 'rechazado', 'convertido')),
  notas         text not null default '',
  moneda        zentra.moneda not null default 'PYG',
  -- La venta en que se convirtió. Si la venta se borra, el presupuesto no.
  venta_id      uuid references zentra.ventas (id) on delete set null,
  usuario_id    uuid references zentra.usuarios (id) on delete set null,
  creado_en     timestamptz not null default now(),
  unique (empresa_id, numero),
  constraint presupuesto_validez check (valido_hasta >= fecha),
  -- Convertido y venta van juntos: un "convertido" sin venta no dice nada.
  constraint presupuesto_convertido check ((estado = 'convertido') = (venta_id is not null))
);

create index if not exists presupuestos_empresa_fecha_idx on zentra.presupuestos (empresa_id, fecha desc);

create table if not exists zentra.presupuesto_lineas (
  id              bigserial primary key,
  presupuesto_id  uuid not null references zentra.presupuestos (id) on delete cascade,
  producto_id     uuid references zentra.productos (id) on delete set null,
  nombre          text not null,
  cantidad        numeric(14,3) not null check (cantidad > 0),
  -- Precio unitario CON IVA incluido, igual que en las ventas.
  precio          bigint not null check (precio >= 0),
  iva             zentra.iva not null default '10%'
);

create index if not exists presupuesto_lineas_idx on zentra.presupuesto_lineas (presupuesto_id);

-- ---------- permisos ----------
-- El mismo patrón que ventas: cada empresa ve y escribe sólo lo suyo, y las
-- líneas cuelgan de su cabecera. El `with check` es tan importante como el
-- `using`: sin él, alguien podría insertar con el empresa_id de otro.

grant select, insert, update, delete on zentra.presupuestos, zentra.presupuesto_lineas to authenticated;
grant usage, select on sequence zentra.presupuesto_lineas_id_seq to authenticated;
grant all on zentra.presupuestos, zentra.presupuesto_lineas to service_role;

alter table zentra.presupuestos enable row level security;
alter table zentra.presupuesto_lineas enable row level security;

drop policy if exists presupuestos_propias on zentra.presupuestos;
create policy presupuestos_propias on zentra.presupuestos
  for all to authenticated
  using (empresa_id = zentra.empresa_actual())
  with check (empresa_id = zentra.empresa_actual());

drop policy if exists presupuesto_lineas_propias on zentra.presupuesto_lineas;
create policy presupuesto_lineas_propias on zentra.presupuesto_lineas
  for all to authenticated
  using (exists (
    select 1 from zentra.presupuestos p
     where p.id = presupuesto_id and p.empresa_id = zentra.empresa_actual()))
  with check (exists (
    select 1 from zentra.presupuestos p
     where p.id = presupuesto_id and p.empresa_id = zentra.empresa_actual()));

-- Para ver que quedaron las dos tablas.
select table_name
  from information_schema.tables
 where table_schema = 'zentra' and table_name in ('presupuestos', 'presupuesto_lineas')
 order by table_name;

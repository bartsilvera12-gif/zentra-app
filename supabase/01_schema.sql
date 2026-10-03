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

-- ---------- instalación compartida ----------
-- Estas tablas pueden vivir solas, en un proyecto propio de la app, o adentro
-- del proyecto de un cliente que ya tiene un ERP. El segundo caso comparte el
-- `auth` con el ERP, y eso cambia dos comportamientos: ver abajo.

create table if not exists zentra.instalacion (
  -- Una sola fila. El check lo garantiza.
  id          boolean primary key default true check (id),
  -- true cuando este proyecto es el de un ERP y la app es un invitado.
  compartida  boolean not null default false
);

insert into zentra.instalacion (id, compartida) values (true, false)
  on conflict (id) do nothing;

create or replace function zentra.es_compartida()
returns boolean
language sql
stable
security definer
set search_path = zentra, pg_catalog
as $$
  select coalesce((select compartida from zentra.instalacion where id), false)
$$;

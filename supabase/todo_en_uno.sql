-- =============================================================================
-- Zentra Móvil · TODO EN UNO
-- Equivale a correr todos los archivos numerados, en orden.
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
--
-- En una instalación compartida el disparador tiene que distinguir: en ese
-- proyecto también se crean los usuarios del ERP, y a ésos no hay que armarles
-- una empresa en zentra. Se reconocen por los metadatos: el registro de la app
-- siempre manda `empresa` o `empresa_id`, y el ERP no.

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
  -- Usuario del ERP en una instalación compartida: no es de la app, se ignora.
  if zentra.es_compartida()
     and coalesce(nullif(btrim(new.raw_user_meta_data ->> 'empresa'), ''), '') = ''
     and nullif(new.raw_user_meta_data ->> 'empresa_id', '') is null then
    return new;
  end if;

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

-- Y el rol de servicio, que es con el que trabaja el server de cobros.
--
-- En un schema propio esto NO viene puesto: `service_role` pasa por encima de
-- RLS, pero RLS es otra cosa que el permiso de entrar al schema. Sin estas
-- líneas, el server contesta `permission denied for schema zentra` y los
-- cobros no funcionan nunca —ni siquiera para leer el precio de un plan—.
grant usage on schema zentra to service_role;
grant all on all tables in schema zentra to service_role;
grant all on all sequences in schema zentra to service_role;
alter default privileges in schema zentra grant all on tables to service_role;
alter default privileges in schema zentra grant all on sequences to service_role;

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

  -- En una instalación compartida el login es el del ERP, y no es de la app
  -- borrarlo: el vendedor que se da de baja de la app no tiene por qué perder
  -- el acceso al sistema de su empresa. Se va su perfil y sus datos; la cuenta
  -- de acceso queda.
  --
  -- Las tiendas igual quedan conformes: lo que exigen es poder borrar la cuenta
  -- de la app y lo que guardó, y eso es exactamente lo que pasa.
  if zentra.es_compartida() then
    delete from zentra.usuarios where id = v_uid;
  else
    -- Borrar de auth.users arrastra la fila de zentra.usuarios por la clave foránea.
    delete from auth.users where id = v_uid;
  end if;

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


-- >>>>>>>>>>>>>>>>>>>>>>>> 06_planes.sql <<<<<<<<<<<<<<<<<<<<<<<<

-- ---------- plan y vencimiento ----------
--
-- La suscripción vive en la empresa, no en el usuario: lo que se contrata es
-- una empresa, y todos sus vendedores trabajan bajo el mismo plan.
--
-- `vence` es la única fecha que mira la app. Cada pago la empuja hacia
-- adelante; si los pagos paran, la fecha llega sola y la empresa cae a Free:
-- sigue viendo todo lo cargado y no puede editar ni cargar más.
--
-- No hay un estado "activa/vencida/cancelada" a propósito. Un estado hay que
-- mantenerlo sincronizado con la pasarela, y cada desincronización es un
-- cliente que pagó y no puede trabajar, o uno que no pagó y sigue entrando.
-- Una fecha que sólo se empuja hacia adelante no se desincroniza de nada.

alter table zentra.empresas
  add column if not exists plan  text not null default 'free'
    check (plan in ('free', 'emprendedor', 'max')),
  -- Nulo es "sin vencimiento": las empresas que todavía no contrataron nada, y
  -- las que tienen un acuerdo aparte. La app no bloquea por una fecha ausente.
  add column if not exists vence date;

comment on column zentra.empresas.plan is
  'Plan contratado. Al vencer, la app se comporta como free sin tocar este campo.';
comment on column zentra.empresas.vence is
  'Hasta cuándo está pago. Nulo = sin vencimiento. Cada pago lo empuja.';

-- ---------- pagos ----------
--
-- El libro de lo cobrado. Sirve para dos cosas, y la segunda es la que importa:
--
--   1. Responder por qué el vencimiento de una empresa dice lo que dice.
--   2. No cobrar dos veces lo mismo. La pasarela reintenta el aviso hasta
--      recibir un 200; si cada reintento empujara la fecha, una caída de media
--      hora le regala meses a un cliente. La clave única sobre la referencia
--      del pago es lo que lo impide, a nivel de base y no de código.

create table if not exists zentra.pagos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references zentra.empresas (id) on delete cascade,
  -- Identificador del pago en la pasarela (el `hash_pedido` de Pagopar).
  referencia     text not null,
  pasarela       text not null default 'pagopar',
  monto          numeric(14, 2) not null check (monto >= 0),
  plan           text not null check (plan in ('free', 'emprendedor', 'max')),
  -- A qué fecha quedó empujado el vencimiento con este pago.
  periodo_hasta  date not null,
  pagado_en      timestamptz not null default now(),
  creado_en      timestamptz not null default now(),
  unique (pasarela, referencia)
);

create index if not exists pagos_empresa_idx on zentra.pagos (empresa_id, pagado_en desc);


-- >>>>>>>>>>>>>>>>>>>>>>>> 07_cobros.sql <<<<<<<<<<<<<<<<<<<<<<<<

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


-- >>>>>>>>>>>>>>>>>>>>>>>> 08_parches_seguridad.sql <<<<<<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- Zentra Móvil · 08 · Tres agujeros de la auditoría
--
-- Los tres son de lo mismo: cosas que la app puede hacer desde el teléfono y
-- que nadie del otro lado está revisando. La clave pública viaja adentro del
-- APK y del .ipa, así que cualquiera que descompile el paquete puede hablarle
-- a PostgREST con ella. Lo único que separa una empresa de otra es lo de acá.
--
-- Es idempotente: se puede correr de nuevo sin romper nada.
--
-- Y es tolerante: cada parche mira si existe lo que va a tocar. En una base que
-- no tiene el schema de la instalación propia —por ejemplo, una que sólo guarda
-- los planes y los cobros— los tres salen por NOTICE diciendo que saltearon, en
-- vez de cortar con "relation does not exist".
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. `zentra.instalacion` quedó sin RLS, y es escribible por cualquiera
--
-- `03_permisos.sql` hace `grant ... on all tables in schema zentra` y después
-- enciende RLS tabla por tabla. `instalacion` no está en esa lista, así que
-- quedó con permiso de escritura y sin ninguna política que la frene.
--
-- Lo que se puede hacer con eso no es menor. `compartida` es el flag que
-- decide cómo se comporta el borrado de cuenta: en una instalación dentro del
-- proyecto de un ERP tiene que estar en `true` para que borrar la cuenta de la
-- app NO borre el login del ERP. Cualquier vendedor logueado puede hacer
--
--     update zentra.instalacion set compartida = false;
--
-- y a partir de ahí el próximo que se dé de baja de la app pierde el acceso al
-- sistema de su empresa. El propio README lo marca como "peligroso".
--
-- No lleva política de lectura a propósito: nadie necesita leer esta tabla
-- desde el cliente. `es_compartida()` es `security definer` y la lee por su
-- cuenta.
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('zentra.instalacion') is null then
    raise notice 'SALTEADO 1 · zentra.instalacion no existe en esta base';
    return;
  end if;
  execute 'alter table zentra.instalacion enable row level security';
  execute 'revoke insert, update, delete on zentra.instalacion from authenticated';
  begin
    execute 'revoke insert, update, delete on zentra.instalacion from anon';
  exception when undefined_object then null;  -- base sin el rol `anon`
  end;
  raise notice 'LISTO 1 · zentra.instalacion ahora tiene RLS y nadie la escribe';
end $$;


-- -----------------------------------------------------------------------------
-- 2. `siguiente_numero()` no comprueba de quién es la empresa
--
-- Es `security definer` y está concedida a `authenticated`, pero recibe la
-- empresa como parámetro y nunca la valida. Cualquier usuario puede llamarla
-- con el id de otra empresa y avanzarle el correlativo, en un bucle si quiere.
--
-- No lee datos ajenos, pero deja huecos en la numeración de facturas de otro
-- cliente. Con timbrado y SIFEN de por medio, un hueco no es cosmético: hay
-- que explicárselo a la SET.
--
-- El parámetro se conserva para no romper a quien ya la llama; lo que cambia
-- es que ahora tiene que coincidir con la empresa de quien llama.
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('zentra.numeracion') is null then
    raise notice 'SALTEADO 2 · zentra.numeracion no existe en esta base';
    return;
  end if;

  execute $f$
create or replace function zentra.siguiente_numero(p_empresa uuid, p_tipo text)
returns text
language plpgsql
volatile
security definer
set search_path = zentra, pg_catalog
as $b$
declare
  v_n       bigint;
  v_prefijo text;
begin
  -- Lo nuevo. El id sigue viniendo por parámetro, pero ya no se le cree.
  if p_empresa is distinct from zentra.empresa_actual() then
    raise exception 'No podés numerar comprobantes de otra empresa.'
      using errcode = '42501';
  end if;

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
$b$;
  $f$;
  raise notice 'LISTO 2 · siguiente_numero() ahora valida la empresa';
end $$;


-- -----------------------------------------------------------------------------
-- 3. El stock sí se puede desincronizar, al contrario de lo que promete el README
--
-- `supabase/README.md` dice: "el stock nunca queda desincronizado del libro".
-- Hoy no es cierto, por dos motivos distintos:
--
--   a) El disparador es `after insert or delete`. No cubre UPDATE, y la app
--      tiene permiso de update sobre `movimientos`. Un
--      `update movimientos set cantidad = 500` cambia el libro y deja
--      `productos.stock` como estaba.
--
--   b) `movimientos.producto_id` no está atado a la misma empresa. La política
--      valida `empresa_id = empresa_actual()`, pero nadie comprueba que el
--      producto sea de esa empresa. Como el disparador es `security definer` y
--      actualiza `productos` sin filtrar, un insert con el `producto_id` de
--      otro tenant le mueve el stock. Hace falta conocer el UUID, que el RLS
--      no deja leer, así que es difícil de explotar — pero el camino existe.
--
-- Se arreglan los dos: el disparador pasa a cubrir UPDATE y a comprobar la
-- empresa del producto.
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('zentra.movimientos') is null or to_regclass('zentra.productos') is null then
    raise notice 'SALTEADO 3 · zentra.movimientos o zentra.productos no existen en esta base';
    return;
  end if;

  execute $f$
create or replace function zentra.aplicar_movimiento()
returns trigger
language plpgsql
security definer
set search_path = zentra, pg_catalog
as $b$
declare
  v_empresa_prod uuid;
begin
  -- El producto tiene que ser de la misma empresa que el movimiento. Sin esto
  -- el disparador, que corre con permisos elevados, mueve stock ajeno.
  if tg_op in ('INSERT', 'UPDATE') then
    select empresa_id into v_empresa_prod
      from zentra.productos where id = new.producto_id;
    if v_empresa_prod is distinct from new.empresa_id then
      raise exception 'El producto no es de esta empresa.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' then
    update zentra.productos
       set stock = stock + new.cantidad
     where id = new.producto_id;
    return new;

  elsif tg_op = 'UPDATE' then
    -- Se descuenta lo viejo y se suma lo nuevo, en vez de recalcular: así
    -- funciona igual si cambió la cantidad, el producto, o los dos.
    update zentra.productos
       set stock = stock - old.cantidad
     where id = old.producto_id;
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
$b$;
  $f$;

  execute 'drop trigger if exists movimientos_aplicar on zentra.movimientos';
  execute 'create trigger movimientos_aplicar
             after insert or update or delete on zentra.movimientos
             for each row execute function zentra.aplicar_movimiento()';
  raise notice 'LISTO 3 · el disparador de stock cubre UPDATE y valida la empresa';
end $$;


-- -----------------------------------------------------------------------------
-- Comprobación
--
-- Las tres consultas de abajo tienen que devolver lo que dice el comentario.
-- Si alguna no coincide, el parche no quedó aplicado.
-- -----------------------------------------------------------------------------

-- Tiene que decir `t`:
--   select relrowsecurity from pg_class where oid = 'zentra.instalacion'::regclass;

-- Tiene que decir `INSERT OR UPDATE OR DELETE`:
--   select string_agg(e, ' OR ') from (
--     select unnest(array['INSERT','DELETE','UPDATE']) e) x
--   where false;  -- ver el disparador con \d zentra.movimientos

-- Tiene que fallar con "No podés numerar comprobantes de otra empresa.":
--   select zentra.siguiente_numero(gen_random_uuid(), 'venta');


-- >>>>>>>>>>>>>>>>>>>>>>>> 08_precios.sql <<<<<<<<<<<<<<<<<<<<<<<<

-- ---------- precios de los planes ----------
--
-- El precio vive en la base y no en el código de la página de pago, por una
-- razón de seguridad y no de comodidad: si el monto lo manda el navegador,
-- cualquiera abre las herramientas de desarrollo y se compra un mes de Max por
-- mil guaraníes. El servidor nunca le cree al cliente cuánto hay que cobrar.
--
-- Que esté en una tabla y no en una constante de la función también permite
-- cambiar un precio sin volver a desplegar nada, y que la página de pago
-- muestre exactamente lo que se va a cobrar: un solo lugar, sin posibilidad de
-- que se desencuentren.

create table if not exists zentra.planes (
  codigo          text primary key check (codigo in ('free', 'emprendedor', 'max')),
  nombre          text not null,
  precio_mensual  numeric(14, 2) not null check (precio_mensual >= 0),
  -- Un plan que se deja de vender pero que los clientes actuales conservan.
  vendible        boolean not null default true,
  actualizado_en  timestamptz not null default now()
);

insert into zentra.planes (codigo, nombre, precio_mensual, vendible) values
  ('free',        'Gratis',      0, false),
  ('emprendedor', 'Emprendedor', 0, false),
  ('max',         'Max',         0, false)
on conflict (codigo) do nothing;

-- Los precios arrancan en cero y `vendible` en false a propósito: hay que
-- cargarlos antes de poder cobrar. Un precio por defecto inventado acá sería
-- el que termina cobrándose el día que alguien se olvida de ponerlo.
--
--   update zentra.planes set precio_mensual = 150000, vendible = true
--    where codigo = 'max';

-- Los precios se muestran en la página de pago, así que se leen sin sesión.
-- No hay nada sensible: es la lista de precios.
alter table zentra.planes enable row level security;

drop policy if exists planes_lectura on zentra.planes;
create policy planes_lectura on zentra.planes for select using (true);


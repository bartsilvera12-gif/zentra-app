-- Prueba de las consultas de docs/API-ERP-CONSULTAS.md.
--
-- Arma una réplica de la estructura del ERP con datos inventados y corre las
-- cuatro consultas. NO toca el ERP: usa su propio schema `erp` sobre una base
-- vacía.
--
--   psql "LA_CADENA" -f docs/consultas-erp-prueba.sql
\set ON_ERROR_STOP on
\set EMP '''aaaa1111-1111-1111-1111-111111111111'''

create schema erp;
create table erp.clientes (
  id uuid primary key default gen_random_uuid(), empresa_id uuid, nombre text, razon_social text,
  empresa text, nombre_contacto text, ruc text, ruc_factura text, documento text, telefono text,
  telefono_secundario text, email text, email_secundario text, ciudad text, direccion text,
  tipo_cliente text, created_at timestamp, deleted_at timestamptz, baja_operativa_at timestamptz
);
create table erp.productos (
  id uuid primary key default gen_random_uuid(), empresa_id uuid, nombre text, sku text,
  costo_promedio numeric, precio_venta numeric, stock_actual numeric, stock_minimo numeric,
  unidad_medida text, metodo_valuacion text, activo boolean, codigo_barras text,
  es_vendible boolean, tipo_iva text
);
create table erp.ventas (
  id uuid primary key default gen_random_uuid(), empresa_id uuid, cliente_id uuid,
  numero_control text, moneda text, monto_iva numeric, total numeric, estado text,
  tipo_venta text, plazo_dias int, fecha timestamptz, created_at timestamptz,
  metodo_pago text, usuario_nombre text, anulada_at timestamptz, idempotency_key text
);
create table erp.ventas_items (
  id uuid primary key default gen_random_uuid(), empresa_id uuid, venta_id uuid, producto_id uuid,
  producto_nombre text, sku text, cantidad numeric, precio_venta numeric, tipo_iva text,
  total_linea numeric, cantidad_total_base numeric
);
create table erp.usuarios (
  id uuid primary key default gen_random_uuid(), empresa_id uuid, nombre text, email text,
  rol text, auth_user_id uuid, activo boolean
);
create table erp.empresas (id uuid primary key, nombre_empresa text, ruc text, data_schema text);

insert into erp.empresas values (:EMP, 'Distribuidora JM', '80012345-6', null);
insert into erp.usuarios (empresa_id, nombre, email, rol, auth_user_id, activo)
  values (:EMP, 'Ulises Gomez', 'u@jm.py', 'vendedor_movil', '11111111-0000-0000-0000-000000000001', true);

insert into erp.clientes (id, empresa_id, razon_social, nombre_contacto, ruc_factura, telefono, ciudad, tipo_cliente, created_at)
  values ('ccc00000-0000-0000-0000-000000000001', :EMP, 'Supermercado Aurora SA', 'Lucia Benitez', '80012345-6', '0981111111', 'Asuncion', 'Mayorista', '2024-03-15');
insert into erp.clientes (empresa_id, nombre, created_at, deleted_at) values (:EMP, 'Borrado', now(), now());

insert into erp.productos (id, empresa_id, nombre, sku, costo_promedio, precio_venta, stock_actual, stock_minimo, unidad_medida, activo, es_vendible, tipo_iva)
  values ('ddd00000-0000-0000-0000-000000000001', :EMP, 'Aceite Girasol 900ml', 'ACE-900', 7800.4, 11500.6, 240, 50, 'UN', true, true, '10%');

insert into erp.ventas (id, empresa_id, cliente_id, numero_control, monto_iva, total, estado, tipo_venta, plazo_dias, fecha, metodo_pago, anulada_at)
values
  ('eee00000-0000-0000-0000-000000000001', :EMP, 'ccc00000-0000-0000-0000-000000000001', 'VTA-000123', 3045.4, 33500.6, 'cobrada', 'contado', null, now(), 'efectivo', null),
  ('eee00000-0000-0000-0000-000000000002', :EMP, 'ccc00000-0000-0000-0000-000000000001', 'VTA-000124', 1000, 11000, 'pendiente', 'credito', 30, now(), null, null),
  ('eee00000-0000-0000-0000-000000000003', :EMP, null, 'VTA-000125', 500, 5500, 'cobrada', 'contado', null, now(), 'efectivo', now());
insert into erp.ventas_items (empresa_id, venta_id, producto_id, producto_nombre, sku, cantidad, precio_venta, tipo_iva, total_linea)
  values (:EMP, 'eee00000-0000-0000-0000-000000000001', 'ddd00000-0000-0000-0000-000000000001', 'Aceite Girasol 900ml', 'ACE-900', 2, 11500.6, '10%', 23001);

\echo ''
\echo '=== GET /perfil ==='
select u.auth_user_id::text as id,
       coalesce(nullif(btrim(u.nombre), ''), split_part(u.email, '@', 1)) as nombre,
       case when u.rol ~* '^admin' then 'ADMIN'
            when u.rol ~* 'vendedor' then 'VENDEDOR'
            when u.rol ~* 'caj' then 'CAJA'
            else upper(replace(coalesce(nullif(btrim(u.rol), ''), 'VENDEDOR'), '_', ' ')) end as rol,
       e.nombre_empresa as empresa
  from erp.usuarios u
  join erp.empresas e on e.id = u.empresa_id
 where u.auth_user_id = '11111111-0000-0000-0000-000000000001'
   and coalesce(u.activo, true) is not false;

\echo ''
\echo '=== GET /clientes ==='
select c.id::text,
       coalesce(nullif(btrim(c.nombre), ''), nullif(btrim(c.razon_social), ''),
                nullif(btrim(c.empresa), ''), c.nombre_contacto, '(sin nombre)') as nombre,
       coalesce(nullif(btrim(c.ruc_factura), ''), nullif(btrim(c.ruc), ''), c.documento) as doc,
       c.nombre_contacto as contacto,
       coalesce(nullif(btrim(c.telefono), ''), c.telefono_secundario) as tel,
       coalesce(nullif(btrim(c.email), ''), c.email_secundario) as email,
       c.ciudad as zona, c.direccion,
       coalesce(nullif(btrim(c.tipo_cliente), ''), 'Mayorista') as lista,
       case when c.baja_operativa_at is null then 'Activo' else 'Inactivo' end as estado,
       coalesce(s.saldo, 0)::bigint as saldo,
       coalesce(s.compras, 0)::int  as compras,
       to_char(c.created_at, 'TMmon YYYY') as desde
  from erp.clientes c
  left join lateral (
    select round(sum(v.total) filter (where v.estado !~* 'cobrad|pagad|cerrad|complet')) as saldo,
           count(*) as compras
      from erp.ventas v
     where v.cliente_id = c.id and v.empresa_id = c.empresa_id and v.anulada_at is null
  ) s on true
 where c.empresa_id = :EMP and c.deleted_at is null
 order by nombre;

\echo ''
\echo '=== GET /productos ==='
select p.id::text, p.nombre, p.sku, p.codigo_barras as barras,
       coalesce(nullif(btrim(p.unidad_medida), ''), 'UN') as unidad,
       round(coalesce(p.costo_promedio, 0))::bigint as costo,
       round(coalesce(p.precio_venta, 0))::bigint    as precio,
       case when p.tipo_iva ~* 'exent|exonerad' then 'Exenta'
            when (regexp_match(p.tipo_iva, '([0-9]+)'))[1] = '10' then '10%'
            when (regexp_match(p.tipo_iva, '([0-9]+)'))[1] = '5'  then '5%'
            else '10%' end as iva,
       coalesce(p.stock_actual, 0) as stock,
       coalesce(p.stock_minimo, 0) as minimo,
       coalesce(nullif(btrim(p.metodo_valuacion), ''), 'CPP') as metodo
  from erp.productos p
 where p.empresa_id = :EMP
   and p.activo is not false and p.es_vendible is not false
 order by p.nombre;

\echo ''
\echo '=== GET /ventas ==='
select v.id::text,
       coalesce(nullif(btrim(v.numero_control), ''), left(v.id::text, 8)) as numero,
       coalesce(v.fecha, v.created_at)::date as fecha,
       v.cliente_id::text as "clienteId",
       coalesce(nullif(btrim(c.nombre), ''), nullif(btrim(c.razon_social), ''), 'Sin nombre') as cliente,
       coalesce(nullif(btrim(c.ruc_factura), ''), nullif(btrim(c.ruc), ''), 'Sin documento') as doc,
       case when v.tipo_venta ~* 'cred|cuota'
            then 'Crédito · ' || coalesce(v.plazo_dias::text, '?') || ' días'
            else 'Contado · ' || coalesce(v.metodo_pago, 'efectivo') end as pago,
       case when v.estado ~* 'cobrad|pagad|cerrad|complet' then 'Cobrada' else 'Pendiente' end as estado,
       coalesce((
         select json_agg(json_build_object(
                  'nombre',   coalesce(nullif(btrim(i.producto_nombre), ''), i.sku, '(sin nombre)'),
                  'cantidad', coalesce(i.cantidad_total_base, i.cantidad, 0),
                  'precio',   round(coalesce(i.precio_venta, 0))::bigint,
                  'iva',      case when i.tipo_iva ~* 'exent' then 'Exenta'
                                   when (regexp_match(i.tipo_iva, '([0-9]+)'))[1] = '5' then '5%'
                                   else '10%' end)
                order by i.producto_nombre)
           from erp.ventas_items i where i.venta_id = v.id
       ), '[]'::json) as lineas
  from erp.ventas v
  left join erp.clientes c on c.id = v.cliente_id
 where v.empresa_id = :EMP and v.anulada_at is null
   and coalesce(v.fecha, v.created_at)::date between '2026-01-01' and '2026-12-31'
 order by coalesce(v.fecha, v.created_at) desc;

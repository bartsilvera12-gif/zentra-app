-- Prueba del mapeo de Distribuidora JM contra una réplica de sus columnas
-- reales. Correr sobre una base limpia, con los roles anon y authenticated
-- creados:
--
--   psql -f supabase/erp/test_mapeo_jm.sql
--
-- No necesita el ERP: arma un schema igual al suyo con datos inventados, y
-- verifica que las vistas devuelvan lo que la app espera.

\set ON_ERROR_STOP on
create schema distribuidorajmerp;
create table distribuidorajmerp.clientes (
  id uuid primary key default gen_random_uuid(), empresa_id uuid, nombre text, telefono text,
  email text, direccion text, created_at timestamp, tipo_cliente text, empresa text, ruc text,
  documento text, telefono_secundario text, email_secundario text, ciudad text, pais text,
  razon_social text, ruc_factura text, nombre_contacto text, estado text, origen text,
  deleted_at timestamptz, baja_operativa_at timestamptz
);
create table distribuidorajmerp.productos (
  id uuid primary key default gen_random_uuid(), empresa_id uuid, nombre text, sku text,
  costo_promedio numeric, precio_venta numeric, stock_actual numeric, stock_minimo numeric,
  unidad_medida text, metodo_valuacion text, activo boolean, codigo_barras text,
  es_vendible boolean, tipo_iva text
);

insert into distribuidorajmerp.clientes
  (empresa_id, nombre, razon_social, empresa, nombre_contacto, ruc_factura, ruc, telefono, ciudad, tipo_cliente, created_at, deleted_at, baja_operativa_at)
values
  ('aaaa1111-1111-1111-1111-111111111111', null, 'Supermercado Aurora SA', null, 'Lucía Benítez', '80012345-6', null, '0981111111', 'Asunción', 'Mayorista', now(), null, null),
  ('aaaa1111-1111-1111-1111-111111111111', 'Despensa Nina', null, null, 'Juan Pérez', null, '4567890-1', null, 'Luque', null, now(), null, now()),
  ('aaaa1111-1111-1111-1111-111111111111', 'Borrado', null, null, null, null, null, null, null, null, now(), now(), null),
  ('bbbb2222-2222-2222-2222-222222222222', 'De otra empresa', null, null, null, null, null, null, null, null, now(), null, null);

insert into distribuidorajmerp.productos
  (empresa_id, nombre, sku, costo_promedio, precio_venta, stock_actual, stock_minimo, unidad_medida, activo, es_vendible, tipo_iva)
values
  ('aaaa1111-1111-1111-1111-111111111111', 'Aceite Girasol 900ml', 'ACE-900', 7800.4, 11500.6, 240, 50, 'UN', true, true, 'IVA 10%'),
  ('aaaa1111-1111-1111-1111-111111111111', 'Leche Larga Vida 1L',  'LEC-1L',  5200,   7300,    80,  20, 'UN', true, true, '5%'),
  ('aaaa1111-1111-1111-1111-111111111111', 'Libro',                'LIB-1',   10000,  15000,   10,  2,  'UN', true, true, 'Exenta'),
  ('aaaa1111-1111-1111-1111-111111111111', 'Insumo interno',       'INS-1',   100,    0,       5,   0,  'UN', true, false, '10%'),
  ('bbbb2222-2222-2222-2222-222222222222', 'De otra empresa',      'OTRO',    1,      1,       1,   0,  'UN', true, true, '10%');

create table distribuidorajmerp.ventas (
  id uuid primary key default gen_random_uuid(), empresa_id uuid, cliente_id uuid,
  numero_control text, moneda text, subtotal numeric, monto_iva numeric, total numeric,
  estado text, tipo_venta text, plazo_dias integer, fecha timestamptz, created_at timestamptz,
  metodo_pago text, usuario_nombre text, anulada_at timestamptz
);
create table distribuidorajmerp.ventas_items (
  id uuid primary key default gen_random_uuid(), empresa_id uuid, venta_id uuid, producto_id uuid,
  producto_nombre text, sku text, cantidad numeric, precio_venta numeric, tipo_iva text,
  subtotal numeric, monto_iva numeric, total_linea numeric, cantidad_total_base numeric
);

insert into distribuidorajmerp.ventas
  (id, empresa_id, numero_control, moneda, monto_iva, total, estado, tipo_venta, plazo_dias, fecha, created_at, metodo_pago, usuario_nombre, anulada_at)
values
  ('cccc0001-0000-0000-0000-000000000001', 'aaaa1111-1111-1111-1111-111111111111', 'VTA-000123', 'PYG', 3045.4, 33500.6, 'cobrada',  'contado', null, now(), now(), 'efectivo',      'Ulises Gómez', null),
  ('cccc0001-0000-0000-0000-000000000002', 'aaaa1111-1111-1111-1111-111111111111', 'VTA-000124', 'PYG', 1000,   11000,   'pendiente','credito', 30,   now(), now(), null,            'Ulises Gómez', null),
  ('cccc0001-0000-0000-0000-000000000003', 'aaaa1111-1111-1111-1111-111111111111', 'VTA-000125', 'PYG', 500,    5500,    'cobrada',  'contado', null, now(), now(), 'transferencia', 'Ulises Gómez', now()),
  ('cccc0001-0000-0000-0000-000000000004', 'bbbb2222-2222-2222-2222-222222222222', 'VTA-999',    'PYG', 1,      1,       'cobrada',  'contado', null, now(), now(), 'efectivo',      'Otro',         null);

insert into distribuidorajmerp.ventas_items
  (empresa_id, venta_id, producto_nombre, sku, cantidad, precio_venta, tipo_iva, total_linea)
values
  ('aaaa1111-1111-1111-1111-111111111111', 'cccc0001-0000-0000-0000-000000000001', 'Aceite Girasol 900ml', 'ACE-900', 2, 11500.6, '10%', 23001),
  ('aaaa1111-1111-1111-1111-111111111111', 'cccc0001-0000-0000-0000-000000000001', 'Leche Larga Vida 1L',  'LEC-1L',  1, 7300,    '5%',  7300),
  ('bbbb2222-2222-2222-2222-222222222222', 'cccc0001-0000-0000-0000-000000000004', 'De otra empresa',      'OTRO',    1, 1,       '10%', 1);

\i supabase/erp/10_tablas.sql
\i supabase/erp/11_generar.sql
\i supabase/erp/12_generar_todas.sql
\i supabase/erp/13_directorio.sql
\i supabase/erp/20_mapeo_jm.sql

select zentra_movil.generar('JM', 'distribuidorajmerp', 'aaaa1111-1111-1111-1111-111111111111');

\echo ''
\echo 'CLIENTES que vería la app:'
select nombre, doc, contacto, tel, zona, lista, estado from zentra_jm.clientes order by nombre;
\echo ''
\echo 'PRODUCTOS que vería la app:'
select nombre, sku, costo, precio, stock, iva from zentra_jm.productos order by nombre;

do $$
declare n int; r record;
begin
  select count(*) into n from zentra_jm.clientes;
  assert n = 2, 'esperaba 2 clientes (uno borrado, uno de otra empresa, fuera), hay ' || n;
  select count(*) into n from zentra_jm.clientes where nombre = 'De otra empresa';
  assert n = 0, 'se filtró mal: aparece un cliente de otra empresa';

  select * into r from zentra_jm.clientes where nombre like 'Supermercado%';
  assert r.doc = '80012345-6', 'doc esperaba el ruc_factura, fue ' || coalesce(r.doc,'(null)');
  select * into r from zentra_jm.clientes where nombre = 'Despensa Nina';
  assert r.estado = 'Inactivo', 'la baja operativa tiene que dar Inactivo, dio ' || r.estado;
  assert r.doc = '4567890-1', 'sin ruc_factura tiene que caer al ruc, fue ' || coalesce(r.doc,'(null)');

  select count(*) into n from zentra_jm.productos;
  assert n = 3, 'esperaba 3 productos vendibles de esta empresa, hay ' || n;
  select * into r from zentra_jm.productos where sku = 'ACE-900';
  assert r.precio = 11501, 'el precio tiene que redondear a entero, fue ' || r.precio;
  assert r.iva = '10%', 'IVA 10% mal mapeado: ' || r.iva;
  select * into r from zentra_jm.productos where sku = 'LEC-1L';
  assert r.iva = '5%', '5% mal mapeado: ' || r.iva;
  select * into r from zentra_jm.productos where sku = 'LIB-1';
  assert r.iva = 'Exenta', 'Exenta mal mapeada: ' || r.iva;
end $$;
\echo ''
\echo 'VENTAS que vería la app:'
select numero, fecha, condicion, metodo, plazo_dias, estado, total, iva from zentra_jm.ventas order by numero;
\echo ''
\echo 'LÍNEAS:'
select nombre, cantidad, precio, iva, total from zentra_jm.venta_lineas order by nombre;

do $$
declare n int; r record;
begin
  select count(*) into n from zentra_jm.ventas;
  assert n = 2, 'esperaba 2 ventas (una anulada y una de otra empresa, fuera), hay ' || n;
  select count(*) into n from zentra_jm.ventas where numero = 'VTA-999';
  assert n = 0, 'aparece una venta de otra empresa';
  select count(*) into n from zentra_jm.ventas where numero = 'VTA-000125';
  assert n = 0, 'aparece una venta anulada';

  select * into r from zentra_jm.ventas where numero = 'VTA-000123';
  assert r.condicion = 'Contado', 'condicion esperaba Contado, fue ' || r.condicion;
  assert r.estado = 'Cobrada', 'estado esperaba Cobrada, fue ' || r.estado;
  assert r.total = 33501, 'el total tiene que redondear, fue ' || r.total;
  assert r.iva = 3045, 'el IVA tiene que redondear, fue ' || r.iva;

  select * into r from zentra_jm.ventas where numero = 'VTA-000124';
  assert r.condicion = 'Crédito', 'credito mal traducido: ' || r.condicion;
  assert r.estado = 'Pendiente', 'pendiente mal traducido: ' || r.estado;
  assert r.plazo_dias = 30, 'se perdió el plazo';

  select count(*) into n from zentra_jm.venta_lineas;
  assert n = 2, 'esperaba 2 líneas de esta empresa, hay ' || n;
  select * into r from zentra_jm.venta_lineas where nombre like 'Aceite%';
  assert r.precio = 11501, 'el precio de la línea tiene que redondear, fue ' || r.precio;
  assert r.iva = '10%', 'IVA de la línea mal mapeado: ' || r.iva;
end $$;
\echo ''
\echo 'Mapeo de JM: todas las comprobaciones pasaron.'

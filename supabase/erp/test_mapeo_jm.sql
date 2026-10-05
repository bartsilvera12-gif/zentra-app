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

\i supabase/erp/10_generador.sql
\i supabase/erp/20_mapeo_jm.sql

select zentra_erp.generar('JM', 'distribuidorajmerp', 'aaaa1111-1111-1111-1111-111111111111');

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
\echo 'Mapeo de JM: todas las comprobaciones pasaron.'

-- =============================================================================
-- Mapeo para el ERP de Distribuidora JM (schema `distribuidorajmerp`)
--
-- Escrito a partir de las columnas reales de ese ERP. Correr DESPUÉS de
-- 10_generador.sql, y después generar:
--
--   select zentra_erp.generar('JM', 'distribuidorajmerp', 'EL-UUID-DE-LA-EMPRESA');
--
-- El uuid es obligatorio: ese schema guarda varias empresas juntas y sin él la
-- app de una vería los clientes de todas. El generador se niega si falta.
-- =============================================================================

-- ---------- de qué tabla sale cada vista ----------

insert into zentra_erp.origen (vista, tabla, filtro) values
  -- `deleted_at` es borrado lógico: esas filas no existen para la app.
  ('clientes',  'clientes',  'deleted_at is null'),
  -- Lo que no es vendible no va al catálogo de una app de ventas.
  ('productos', 'productos', 'activo is not false and es_vendible is not false')
on conflict (vista) do update
  set tabla = excluded.tabla, filtro = excluded.filtro;

-- ---------- clientes ----------
-- El ERP tiene cuatro columnas que podrían ser "el nombre": nombre,
-- razon_social, empresa y nombre_contacto. La app muestra una sola, así que se
-- toma la primera que tenga algo.

insert into zentra_erp.mapeo (vista, campo, expresion, orden) values
  ('clientes', 'id',        'id::text', 1),
  ('clientes', 'nombre',    $$coalesce(nullif(btrim(nombre), ''), nullif(btrim(razon_social), ''), nullif(btrim(empresa), ''), nombre_contacto, '(sin nombre)')$$, 2),
  -- ruc_factura es el que se usa para facturar; ruc y documento son el respaldo.
  ('clientes', 'doc',       $$coalesce(nullif(btrim(ruc_factura), ''), nullif(btrim(ruc), ''), documento)$$, 3),
  ('clientes', 'contacto',  'nombre_contacto', 4),
  ('clientes', 'tel',       $$coalesce(nullif(btrim(telefono), ''), telefono_secundario)$$, 5),
  ('clientes', 'email',     $$coalesce(nullif(btrim(email), ''), email_secundario)$$, 6),
  ('clientes', 'direccion', 'direccion', 7),
  ('clientes', 'zona',      'ciudad', 8),
  ('clientes', 'lista',     $$coalesce(nullif(btrim(tipo_cliente), ''), 'Mayorista')$$, 9),
  -- La baja operativa no borra la fila pero el cliente deja de operar: para la
  -- app es lo mismo que inactivo.
  ('clientes', 'estado',    $$case when baja_operativa_at is null then 'Activo' else 'Inactivo' end$$, 10),
  ('clientes', 'creado_en', 'created_at', 11)
on conflict (vista, campo) do update
  set expresion = excluded.expresion, orden = excluded.orden;

-- ---------- productos ----------

insert into zentra_erp.mapeo (vista, campo, expresion, orden) values
  ('productos', 'id',      'id::text', 1),
  ('productos', 'nombre',  'nombre', 2),
  ('productos', 'sku',     'sku', 3),
  ('productos', 'barras',  'codigo_barras', 4),
  ('productos', 'unidad',  $$coalesce(nullif(btrim(unidad_medida), ''), 'UN')$$, 5),
  -- Los montos en la app son enteros: el guaraní no tiene centavos.
  ('productos', 'costo',   'round(coalesce(costo_promedio, 0))::bigint', 6),
  ('productos', 'precio',  'round(coalesce(precio_venta, 0))::bigint', 7),
  ('productos', 'stock',   'coalesce(stock_actual, 0)', 8),
  ('productos', 'minimo',  'coalesce(stock_minimo, 0)', 9),
  ('productos', 'metodo',  $$coalesce(nullif(btrim(metodo_valuacion), ''), 'CPP')$$, 10),
  -- OJO: la app espera exactamente '10%', '5%' o 'Exenta'. Qué guarda el ERP en
  -- tipo_iva hay que confirmarlo:
  --   select distinct tipo_iva from distribuidorajmerp.productos;
  --
  -- Se extrae el número en vez de buscar el texto suelto. La primera versión
  -- preguntaba si contenía un '0' para decidir "Exenta", y 'IVA 10%' lo contiene:
  -- todos los productos al 10% habrían quedado exentos y las facturas habrían
  -- salido sin IVA. Lo encontró la prueba, no la lectura.
  --
  -- Ante la duda cae en 10%: es la tasa general en Paraguay, y equivocarse para
  -- abajo subfacturaría.
  ('productos', 'iva',     $$case
       when tipo_iva ~* 'exent|exonerad'                 then 'Exenta'
       when (regexp_match(tipo_iva, '([0-9]+)'))[1] = '10' then '10%'
       when (regexp_match(tipo_iva, '([0-9]+)'))[1] = '5'  then '5%'
       when (regexp_match(tipo_iva, '([0-9]+)'))[1] = '0'  then 'Exenta'
       else '10%'
     end$$, 11)
on conflict (vista, campo) do update
  set expresion = excluded.expresion, orden = excluded.orden;

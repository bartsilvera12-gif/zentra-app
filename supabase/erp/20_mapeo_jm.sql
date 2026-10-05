-- =============================================================================
-- Mapeo para el ERP de Distribuidora JM (schema `distribuidorajmerp`)
--
-- Escrito a partir de las columnas reales de ese ERP. Correr DESPUÉS de los
-- cuatro archivos 10 a 13, y después generar:
--
--   select zentra_movil.generar('JM', 'distribuidorajmerp', 'EL-UUID-DE-LA-EMPRESA');
--
-- El uuid es obligatorio: ese schema guarda varias empresas juntas y sin él la
-- app de una vería los clientes de todas. El generador se niega si falta.
-- =============================================================================

-- ---------- de qué tabla sale cada vista ----------

insert into zentra_movil.origen (vista, tabla, filtro, schema_origen) values
  -- `deleted_at` es borrado lógico: esas filas no existen para la app.
  ('clientes',     'clientes',     'deleted_at is null', null),
  -- Lo que no es vendible no va al catálogo de una app de ventas.
  ('productos',    'productos',    'activo is not false and es_vendible is not false', null),
  -- Una venta anulada no es una venta: no puede sumar en los totales del día.
  ('ventas',       'ventas',       'anulada_at is null', null),
  ('venta_lineas', 'ventas_items', null, null),
  -- El perfil de quien entra. Sin esto la app valida la contraseña y después no
  -- sabe quién es: "tu cuenta no tiene perfil en esta instalación".
  ('usuarios',     'usuarios',     'coalesce(activo, true) is not false', null),
  -- `empresas` identifica a la empresa con `id`, no con `empresa_id`, así que el
  -- filtro va explícito: sin él la app vería todas las empresas del ERP.
  ('empresas',     'empresas',     'id = {{empresa_id}}', null)
on conflict (vista) do update
  set tabla = excluded.tabla, filtro = excluded.filtro, schema_origen = excluded.schema_origen;

-- ---------- clientes ----------
-- El ERP tiene cuatro columnas que podrían ser "el nombre": nombre,
-- razon_social, empresa y nombre_contacto. La app muestra una sola, así que se
-- toma la primera que tenga algo.

insert into zentra_movil.mapeo (vista, campo, expresion, orden) values
  ('clientes', 'id',        'id::text', 1),
  ('clientes', 'nombre',    $sql$coalesce(nullif(btrim(nombre), ''), nullif(btrim(razon_social), ''), nullif(btrim(empresa), ''), nombre_contacto, '(sin nombre)')$sql$, 2),
  -- ruc_factura es el que se usa para facturar; ruc y documento son el respaldo.
  ('clientes', 'doc',       $sql$coalesce(nullif(btrim(ruc_factura), ''), nullif(btrim(ruc), ''), documento)$sql$, 3),
  ('clientes', 'contacto',  'nombre_contacto', 4),
  ('clientes', 'tel',       $sql$coalesce(nullif(btrim(telefono), ''), telefono_secundario)$sql$, 5),
  ('clientes', 'email',     $sql$coalesce(nullif(btrim(email), ''), email_secundario)$sql$, 6),
  ('clientes', 'direccion', 'direccion', 7),
  ('clientes', 'zona',      'ciudad', 8),
  ('clientes', 'lista',     $sql$coalesce(nullif(btrim(tipo_cliente), ''), 'Mayorista')$sql$, 9),
  -- La baja operativa no borra la fila pero el cliente deja de operar: para la
  -- app es lo mismo que inactivo.
  ('clientes', 'estado',    $sql$case when baja_operativa_at is null then 'Activo' else 'Inactivo' end$sql$, 10),
  ('clientes', 'creado_en', 'created_at', 11)
on conflict (vista, campo) do update
  set expresion = excluded.expresion, orden = excluded.orden;

-- ---------- productos ----------

insert into zentra_movil.mapeo (vista, campo, expresion, orden) values
  ('productos', 'id',      'id::text', 1),
  ('productos', 'nombre',  'nombre', 2),
  ('productos', 'sku',     'sku', 3),
  ('productos', 'barras',  'codigo_barras', 4),
  ('productos', 'unidad',  $sql$coalesce(nullif(btrim(unidad_medida), ''), 'UN')$sql$, 5),
  -- Los montos en la app son enteros: el guaraní no tiene centavos.
  ('productos', 'costo',   'round(coalesce(costo_promedio, 0))::bigint', 6),
  ('productos', 'precio',  'round(coalesce(precio_venta, 0))::bigint', 7),
  ('productos', 'stock',   'coalesce(stock_actual, 0)', 8),
  ('productos', 'minimo',  'coalesce(stock_minimo, 0)', 9),
  ('productos', 'metodo',  $sql$coalesce(nullif(btrim(metodo_valuacion), ''), 'CPP')$sql$, 10),
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
  ('productos', 'iva',     $sql$case
       when tipo_iva ~* 'exent|exonerad'                 then 'Exenta'
       when (regexp_match(tipo_iva, '([0-9]+)'))[1] = '10' then '10%'
       when (regexp_match(tipo_iva, '([0-9]+)'))[1] = '5'  then '5%'
       when (regexp_match(tipo_iva, '([0-9]+)'))[1] = '0'  then 'Exenta'
       else '10%'
     end$sql$, 11)
on conflict (vista, campo) do update
  set expresion = excluded.expresion, orden = excluded.orden;

-- ---------- ventas ----------
-- El ERP guarda contado/crédito en `tipo_venta` y la app en `condicion`; los
-- valores no tienen por qué coincidir, así que se traducen.

insert into zentra_movil.mapeo (vista, campo, expresion, orden) values
  ('ventas', 'id',          'id::text', 1),
  ('ventas', 'numero',      $sql$coalesce(nullif(btrim(numero_control), ''), left(id::text, 8))$sql$, 2),
  ('ventas', 'cliente_id',  'cliente_id::text', 3),
  ('ventas', 'fecha',       'coalesce(fecha, created_at)::date', 4),
  ('ventas', 'condicion',   $sql$case when tipo_venta ~* 'cred|credito|cuota' then 'Crédito' else 'Contado' end$sql$, 5),
  ('ventas', 'metodo',      'metodo_pago', 6),
  ('ventas', 'plazo_dias',  'plazo_dias', 7),
  -- La app sólo distingue cobrada de pendiente. Todo lo que el ERP no dé por
  -- cerrado queda como pendiente: es el lado seguro, porque una venta pendiente
  -- mostrada como cobrada esconde plata que falta cobrar.
  ('ventas', 'estado',      $sql$case when estado ~* 'cobrad|pagad|cerrad|complet' then 'Cobrada' else 'Pendiente' end$sql$, 8),
  ('ventas', 'moneda',      $sql$coalesce(nullif(btrim(moneda), ''), 'PYG')$sql$, 9),
  ('ventas', 'total',       'round(coalesce(total, 0))::bigint', 10),
  ('ventas', 'iva',         'round(coalesce(monto_iva, 0))::bigint', 11),
  ('ventas', 'usuario',     'usuario_nombre', 12),
  ('ventas', 'creado_en',   'created_at', 13)
on conflict (vista, campo) do update
  set expresion = excluded.expresion, orden = excluded.orden;

-- ---------- líneas de venta ----------
-- `producto_nombre` y `sku` están copiados en la línea: así la factura vieja
-- sigue diciendo lo que decía aunque después le cambien el nombre al producto.
-- Se usa eso y no un join con productos, que además perdería los borrados.

insert into zentra_movil.mapeo (vista, campo, expresion, orden) values
  ('venta_lineas', 'id',          'id::text', 1),
  ('venta_lineas', 'venta_id',    'venta_id::text', 2),
  ('venta_lineas', 'producto_id', 'producto_id::text', 3),
  ('venta_lineas', 'nombre',      $sql$coalesce(nullif(btrim(producto_nombre), ''), sku, '(sin nombre)')$sql$, 4),
  ('venta_lineas', 'cantidad',    'coalesce(cantidad_total_base, cantidad, 0)', 5),
  -- La app trabaja con el precio CON IVA incluido, que es como se factura en
  -- Paraguay. `precio_venta` del ERP ya lo incluye.
  ('venta_lineas', 'precio',      'round(coalesce(precio_venta, 0))::bigint', 6),
  ('venta_lineas', 'iva',         $sql$case
       when tipo_iva ~* 'exent|exonerad'                 then 'Exenta'
       when (regexp_match(tipo_iva, '([0-9]+)'))[1] = '10' then '10%'
       when (regexp_match(tipo_iva, '([0-9]+)'))[1] = '5'  then '5%'
       when (regexp_match(tipo_iva, '([0-9]+)'))[1] = '0'  then 'Exenta'
       else '10%'
     end$sql$, 7),
  ('venta_lineas', 'total',       'round(coalesce(total_linea, 0))::bigint', 8)
on conflict (vista, campo) do update
  set expresion = excluded.expresion, orden = excluded.orden;

-- ---------- usuarios ----------
-- Lo que la app usa para saber quién entró.
--
-- `id` sale de `auth_user_id` y NO del id de la fila: la app busca el perfil por
-- el id de la sesión de Supabase, y son dos uuid distintos. Confundirlos deja al
-- login validando la contraseña y rechazando después por "sin perfil".

insert into zentra_movil.mapeo (vista, campo, expresion, orden) values
  ('usuarios', 'id',         'auth_user_id::text', 1),
  ('usuarios', 'nombre',     $sql$coalesce(nullif(btrim(nombre), ''), split_part(email, '@', 1))$sql$, 2),
  -- El rol se muestra tal cual en el encabezado de la app. El ERP lo guarda en
  -- minúscula y con guión bajo ("vendedor_movil"), que leído en pantalla queda
  -- mal. Se traducen los conocidos y el resto se limpia.
  ('usuarios', 'rol',        $sql$case
       when rol ~* '^admin'    then 'ADMIN'
       when rol ~* 'vendedor'  then 'VENDEDOR'
       when rol ~* 'caj'       then 'CAJA'
       when rol ~* 'deposit|almac' then 'DEPOSITO'
       else upper(replace(coalesce(nullif(btrim(rol), ''), 'VENDEDOR'), '_', ' '))
     end$sql$, 3),
  ('usuarios', 'empresa_id', 'empresa_id::text', 4),
  ('usuarios', 'email',      'email', 5)
on conflict (vista, campo) do update
  set expresion = excluded.expresion, orden = excluded.orden;

-- ---------- empresas ----------
-- Sólo para mostrar el nombre en el encabezado de la app.

insert into zentra_movil.mapeo (vista, campo, expresion, orden) values
  ('empresas', 'id',     'id::text', 1),
  ('empresas', 'nombre', $sql$coalesce(nullif(btrim(nombre_empresa), ''), '(sin nombre)')$sql$, 2),
  ('empresas', 'ruc',    'ruc', 3)
on conflict (vista, campo) do update
  set expresion = excluded.expresion, orden = excluded.orden;

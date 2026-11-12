-- ---------- lo que el producto necesita para la vidriera ----------
--
-- Tres cosas que faltaban para que una ficha de inventario sirva de aviso:
--
--   descripcion   lo que se lee debajo del nombre en el catálogo. El inventario
--                 no la pedía porque para vender en el mostrador alcanza con el
--                 nombre; para vender por internet, no.
--   en_catalogo   si ese producto se publica. Un negocio tiene cosas que no
--                 quiere en la vidriera —insumos, envases, lo que sólo usa
--                 adentro— y esconderlas no puede obligarlo a darlas de baja.
--
-- La foto ya tiene su columna, de `20_catalogo.sql`.
--
-- `en_catalogo` arranca en `true` y no en `false`: quien prende el catálogo
-- espera ver lo que tiene, no una vidriera vacía que hay que ir llenando
-- producto por producto. Lo raro es el insumo que se esconde, no el artículo
-- que se vende.
--
-- Es idempotente: se puede correr de nuevo.

alter table zentra.productos
  add column if not exists descripcion  text,
  add column if not exists en_catalogo  boolean not null default true;

comment on column zentra.productos.descripcion is
  'Lo que se lee bajo el nombre en el catálogo público.';
comment on column zentra.productos.en_catalogo is
  'Si este producto se publica en el catálogo. No tiene nada que ver con darlo de baja.';

-- ---------- la vista pública, con lo nuevo ----------
--
-- Se reescribe entera porque una vista no se parchea. Lo que cambia: sale la
-- descripción, y un producto marcado para no publicarse no aparece.
--
-- Lo que NO cambia, y conviene releer cada vez que se toca esto: acá no entran
-- el costo, el stock ni el proveedor. Es la única puerta abierta y lo que salga
-- por ella lo ve cualquiera.

create or replace view zentra.catalogo_articulos as
  select e.catalogo_slug  as slug,
         p.id,
         p.nombre,
         p.descripcion,
         p.precio,
         p.unidad,
         p.categoria,
         p.imagen_path
    from zentra.productos p
    join zentra.empresas e on e.id = p.empresa_id
   where e.catalogo_activo
     and e.catalogo_slug is not null
     and coalesce(btrim(e.catalogo_whatsapp), '') <> ''
     and p.activo
     and p.en_catalogo
     -- Sin precio no se muestra: un producto en una vidriera sin precio hace
     -- escribir para preguntar, que es justo lo que el catálogo viene a evitar.
     and p.precio > 0;

comment on view zentra.catalogo_articulos is
  'Lo que ve cualquiera en el catálogo público. Nunca costo, stock ni proveedor.';

grant select on zentra.catalogo_articulos to anon, authenticated;

-- ---------- para ver que quedó ----------

select column_name
  from information_schema.columns
 where table_schema = 'zentra' and table_name = 'productos'
   and column_name in ('descripcion', 'en_catalogo', 'imagen_path')
 order by column_name;

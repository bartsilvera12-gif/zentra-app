-- ---------- catálogo público ----------
--
-- Una página que el negocio manda por WhatsApp o pega en la bio de Instagram.
-- El cliente entra, mira los productos, arma un carrito y **el pedido vuelve
-- como un mensaje de WhatsApp**. No hay pedidos que administrar acá: lo que
-- se manda es texto, y el negocio lo atiende donde ya atiende todo.
--
-- Esto es la mitad de la base. Agrega tres cosas:
--
--   1. Una foto por producto. Hoy `zentra.productos` no tiene ninguna, y un
--      catálogo sin fotos no lo mira nadie.
--   2. Los ajustes del catálogo en la empresa: si está prendido, con qué
--      dirección se llega, de qué color es y a qué WhatsApp llegan los pedidos.
--   3. Dos vistas públicas, que son la única puerta que se abre. Por ahí sale
--      lo que va en una vidriera —nombre, foto, precio, categoría— y **nunca**
--      el costo, el stock, el proveedor ni nada de otra empresa.
--
-- Es idempotente: se puede correr de nuevo.

-- ---------- la foto del producto ----------
--
-- Se guarda el camino dentro del bucket, no la URL. La URL se arma al leer:
-- si mañana cambia el dominio del storage, no hay que reescribir una fila.

alter table zentra.productos
  add column if not exists imagen_path text;

comment on column zentra.productos.imagen_path is
  'Camino del archivo dentro del bucket `catalogo`. Nulo = sin foto.';

-- El bucket. Público de lectura: son fotos de vidriera, están para que las vea
-- cualquiera. Escribir sigue necesitando sesión, y la política de abajo encima
-- obliga a que cada empresa escriba sólo en su carpeta.
insert into storage.buckets (id, name, public)
values ('catalogo', 'catalogo', true)
on conflict (id) do update set public = true;

-- Cada empresa escribe sólo en `<empresa_id>/...`.
--
-- Sin esto, cualquiera con sesión podría pisar las fotos de otro negocio: el
-- bucket es uno solo y los nombres de archivo los elige el cliente.
drop policy if exists catalogo_sube_lo_suyo on storage.objects;
create policy catalogo_sube_lo_suyo on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'catalogo'
    and (storage.foldername(name))[1] = zentra.empresa_actual()::text
  );

drop policy if exists catalogo_borra_lo_suyo on storage.objects;
create policy catalogo_borra_lo_suyo on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'catalogo'
    and (storage.foldername(name))[1] = zentra.empresa_actual()::text
  );

drop policy if exists catalogo_lee_cualquiera on storage.objects;
create policy catalogo_lee_cualquiera on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'catalogo');

-- ---------- los ajustes del catálogo ----------

alter table zentra.empresas
  -- Apagado por defecto. Prender la vidriera es una decisión del negocio, no
  -- algo que le pase por actualizar la app.
  add column if not exists catalogo_activo boolean not null default false,
  -- Con qué se llega: catalogo.neura.com.py/?e=mimarca. Único entre todas las
  -- empresas, porque es una dirección.
  add column if not exists catalogo_slug text,
  add column if not exists catalogo_color text,
  add column if not exists catalogo_logo_path text,
  -- A qué WhatsApp llega el pedido. Puede no ser el teléfono de la empresa:
  -- el que factura y el que atiende pedidos no siempre son el mismo.
  add column if not exists catalogo_whatsapp text,
  -- Lo que se lee arriba de todo. Horarios, zona de envío, lo que sea.
  add column if not exists catalogo_mensaje text;

-- Minúsculas, números y guiones. Es una dirección: `Mi Marca` y `mi-marca` no
-- pueden ser dos negocios distintos, y un espacio en una URL se escribe %20 y
-- se vuelve ilegible justo donde hay que poder dictarla por teléfono.
do $$ begin
  alter table zentra.empresas
    add constraint empresas_catalogo_slug_forma
    check (catalogo_slug is null or catalogo_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');
exception when duplicate_object then null; end $$;

create unique index if not exists empresas_catalogo_slug_idx
  on zentra.empresas (catalogo_slug) where catalogo_slug is not null;

-- ---------- la puerta pública ----------
--
-- Dos vistas y nada más. No se le da `select` a `anon` sobre las tablas: una
-- tabla abierta deja ver todas sus columnas, y ahí están el costo, el stock y
-- el proveedor. Lo que sale por acá es lo que iría en una vidriera.
--
-- Las vistas corren con los permisos de su dueño, así que el `where` de abajo
-- es la única reja. Por eso están escritas para no depender de nada más: una
-- empresa que no prendió el catálogo no aparece, y un producto de una empresa
-- apagada tampoco.

create or replace view zentra.catalogo_negocios as
  select e.catalogo_slug           as slug,
         e.nombre,
         e.catalogo_color          as color,
         e.catalogo_logo_path      as logo_path,
         e.catalogo_whatsapp       as whatsapp,
         e.catalogo_mensaje        as mensaje,
         e.ciudad
    from zentra.empresas e
   where e.catalogo_activo
     and e.catalogo_slug is not null
     -- Sin WhatsApp el catálogo es una vidriera sin puerta: se puede mirar y
     -- no se puede pedir. Mejor que no salga a que salga roto.
     and coalesce(btrim(e.catalogo_whatsapp), '') <> '';

create or replace view zentra.catalogo_articulos as
  select e.catalogo_slug  as slug,
         p.id,
         p.nombre,
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
     -- Sin precio no se muestra: un producto en una vidriera sin precio hace
     -- escribir para preguntar, que es justo lo que el catálogo viene a
     -- evitar.
     and p.precio > 0;

comment on view zentra.catalogo_articulos is
  'Lo que ve cualquiera en el catálogo público. Nunca costo, stock ni proveedor.';

-- `anon` sólo lee las vistas. Nunca las tablas.
grant select on zentra.catalogo_negocios, zentra.catalogo_articulos to anon, authenticated;

-- ---------- para ver que quedó ----------

select 'productos.imagen_path' as cosa,
       count(*) filter (where column_name = 'imagen_path') as existe
  from information_schema.columns
 where table_schema = 'zentra' and table_name = 'productos'
union all
select 'empresas.catalogo_slug',
       count(*) filter (where column_name = 'catalogo_slug')
  from information_schema.columns
 where table_schema = 'zentra' and table_name = 'empresas'
union all
select 'vistas publicas',
       count(*)
  from information_schema.views
 where table_schema = 'zentra'
   and table_name in ('catalogo_negocios', 'catalogo_articulos');

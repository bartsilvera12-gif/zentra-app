-- ---------- los campos de Max en productos ----------
--
-- `zentra.productos` se quedó con las columnas del plan Gratis, pero la app
-- escribe y lee tres campos más desde que existe Max:
--
--   precio_mayorista  el precio para quien compra por cantidad
--   vencimiento       la fecha de vencimiento del producto
--   ultimo_ajuste     cuándo se ajustó el stock por última vez
--
-- No era un campo que faltaba y se mostraba vacío: `supabase-datos.ts` los
-- manda en el insert y en el update, así que guardar un producto con cualquiera
-- de los tres contra la base de verdad fallaba con "column does not exist". Y
-- fallaba en el alta, no en una pantalla secundaria.
--
-- `ultimo_ajuste` no es un dato del producto que alguien quiera mirar: es lo
-- que hace real el límite de "un ajuste de stock cada 30 días" de Gratis y
-- Emprendedor. Mientras la columna no existió, el campo volvía siempre nulo,
-- el límite leía "nunca se ajustó" y pasaba siempre. Lo escribe el servidor al
-- registrar el ajuste; la app sólo lo lee.
--
-- Es idempotente: se puede correr de nuevo.

alter table zentra.productos
  add column if not exists precio_mayorista bigint,
  add column if not exists vencimiento      date,
  add column if not exists ultimo_ajuste    timestamptz;

-- El mayorista es plata: mismo criterio que `costo` y `precio`, en guaraníes
-- enteros y nunca negativo. Nulo es "este producto no se vende al por mayor",
-- que no es lo mismo que cero.
do $$ begin
  alter table zentra.productos
    add constraint productos_mayorista_no_negativo
    check (precio_mayorista is null or precio_mayorista >= 0);
exception when duplicate_object then null; end $$;

-- Para ver que quedaron las tres.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'zentra'
   and table_name = 'productos'
   and column_name in ('precio_mayorista', 'vencimiento', 'ultimo_ajuste')
 order by column_name;

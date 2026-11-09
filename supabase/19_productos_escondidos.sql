-- ---------- lo que no entra en el plan se esconde, no se borra ----------
--
-- Quien carga 500 productos en la prueba de Max y vuelve a Gratis, que entran
-- 20, no pierde nada: los 480 siguen en la base y dejan de verse. El día que
-- paga, vuelven todos solos.
--
-- Hasta ahora la regla era otra: se seguían viendo los 500 y no se podía tocar
-- ninguno. Es peor. Un inventario de 500 renglones donde ninguno se deja
-- editar no sirve para trabajar, y encima no se entiende por qué.
--
-- Cuáles 20 quedan a la vista: los fijados primero, y el resto por antigüedad
-- —los primeros que cargó— hasta llenar el tope. Es la única regla que no
-- depende de nada y que se puede explicar en una línea.
--
-- No hay nada acá que esconda: esconder es cosa de las apps, que ya son las
-- que aplican el tope al cargar. Esto sólo agrega dónde guardar la elección,
-- que tiene que seguir a la cuenta y no al teléfono.
--
-- Es idempotente: se puede correr de nuevo.

alter table zentra.productos
  add column if not exists fijado boolean not null default false;

comment on column zentra.productos.fijado is
  'El cliente lo eligió para que quede a la vista cuando el plan no alcanza para todos. Los fijados van primero; el resto, por antigüedad.';

-- Columna nueva y no el `activo` que ya existe, a propósito.
--
-- `activo` es del cliente: lo usa para dar de baja algo que ya no vende. Si
-- esconder usara ese mismo interruptor, el día que paga le reaparecerían todos
-- los productos que él había dado de baja queriendo — y no hay forma de
-- distinguir después cuál apagó quién.

-- Para ordenar sin leer la tabla entera: el listado pide siempre los primeros
-- N de una empresa con este mismo orden.
create index if not exists productos_visibles_idx
  on zentra.productos (empresa_id, fijado desc, creado_en);

-- ---------- para ver que quedó ----------

select count(*) filter (where column_name = 'fijado') as columna_fijado
  from information_schema.columns
 where table_schema = 'zentra' and table_name = 'productos';

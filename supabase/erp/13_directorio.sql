-- Zentra · vistas sobre un ERP · 4 de 4: qué quedó generado.

/** Qué códigos quedaron listos, para armar el directorio de la app. */
-- Lista por la marca que deja el generador, no por el nombre: un schema ajeno
-- que empiece con "zentra_" —y en este ERP hay uno— no tiene por qué aparecer acá.
create or replace view zentra_movil.directorio as
  select replace(n.nspname, 'zentra_', '') as codigo,
         n.nspname                         as schema,
         count(c.oid)                      as vistas
    from pg_namespace n
    left join pg_class c on c.relnamespace = n.oid and c.relkind = 'v'
   where obj_description(n.oid, 'pg_namespace') = 'zentra-movil: vistas generadas, no editar a mano'
   group by n.nspname
   order by 1;

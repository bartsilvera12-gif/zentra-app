-- Zentra · vistas sobre un ERP · 4 de 4: qué quedó generado.

/** Qué códigos quedaron listos, para armar el directorio de la app. */
create or replace view zentra_erp.directorio as
  select replace(n.nspname, 'zentra_', '') as codigo,
         n.nspname                         as schema,
         count(c.oid)                      as vistas
    from pg_namespace n
    left join pg_class c on c.relnamespace = n.oid and c.relkind = 'v'
   where n.nspname like 'zentra\_%' and n.nspname <> 'zentra_erp'
   group by n.nspname
   order by 1;

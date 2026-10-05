-- Sacar del ERP todo lo que dejamos, si se decide ir por API en vez de vistas.
--
-- Borra sólo lo nuestro: los schemas marcados por el generador y su maquinaria.
-- No toca ninguna tabla ni schema del ERP.
--
-- Mirar antes qué se va a borrar:
--   select * from zentra_movil.directorio;

do $fn$
declare r record;
begin
  for r in
    select n.nspname
      from pg_namespace n
     where obj_description(n.oid, 'pg_namespace') = 'zentra-movil: vistas generadas, no editar a mano'
  loop
    execute format('drop schema %I cascade', r.nspname);
    raise notice 'borrado %', r.nspname;
  end loop;
end;
$fn$;

drop schema if exists zentra_movil cascade;

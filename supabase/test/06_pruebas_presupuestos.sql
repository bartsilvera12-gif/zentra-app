-- =============================================================================
-- Presupuestos. Correr después de `todo_en_uno.sql` sobre una base limpia.
-- Cada bloque falla ruidosamente si la regla no se cumple.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off

create or replace function pg_temp.entrar(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p)::text, false)
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ana@almacen.py',  '{"nombre":"Ana","empresa":"Almacén Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'beto@despensa.py','{"nombre":"Beto","empresa":"Despensa Beto"}');

-- ---------- 1. Ana hace un presupuesto con su número ----------
set role authenticated;
do $e$ begin perform pg_temp.entrar('11111111-1111-1111-1111-111111111111'); end $e$;

do $$
declare
  n   text;
  pid uuid;
begin
  n := zentra.siguiente_numero(zentra.empresa_actual(), 'pre');
  assert n = 'PRE-000001', 'el primer número debía ser PRE-000001 y fue ' || n;
  insert into zentra.presupuestos (empresa_id, numero, cliente_texto, valido_hasta)
  values (zentra.empresa_actual(), n, 'Despensa Doña Lucía', current_date + 15)
  returning id into pid;
  insert into zentra.presupuesto_lineas (presupuesto_id, nombre, cantidad, precio, iva)
  values (pid, 'Gaseosa cola 2 L', 24, 12000, '10%');
  assert zentra.siguiente_numero(zentra.empresa_actual(), 'pre') = 'PRE-000002', 'el correlativo no avanzó';
end $$;
\echo '  OK 1 · el presupuesto se guarda con su número PRE-000001'

-- ---------- 2. Beto no lo ve ni lo toca ----------
do $e$ begin perform pg_temp.entrar('22222222-2222-2222-2222-222222222222'); end $e$;
do $$
declare n int;
begin
  select count(*) into n from zentra.presupuestos;
  assert n = 0, 'Beto ve ' || n || ' presupuestos de Ana';
  select count(*) into n from zentra.presupuesto_lineas;
  assert n = 0, 'Beto ve ' || n || ' líneas de Ana';
  update zentra.presupuestos set estado = 'rechazado';
  get diagnostics n = row_count;
  assert n = 0, 'Beto cambió el estado de un presupuesto de Ana';
end $$;
\echo '  OK 2 · otra empresa no ve ni cambia los presupuestos'

-- ---------- 3. Beto no puede colar una línea en un presupuesto de Ana ----------
do $$
declare ajeno uuid;
begin
  reset role;
  select id into ajeno from zentra.presupuestos limit 1;
  set role authenticated;
  begin
    insert into zentra.presupuesto_lineas (presupuesto_id, nombre, cantidad, precio)
    values (ajeno, 'Colado', 1, 1);
    raise exception 'Beto pudo agregar una línea a un presupuesto de Ana';
  exception when insufficient_privilege then null;
  end;
end $$;
\echo '  OK 3 · no se cuelan líneas en un presupuesto ajeno'

-- ---------- 4. convertido exige venta, y la validez no puede ser anterior ----------
do $e$ begin perform pg_temp.entrar('11111111-1111-1111-1111-111111111111'); end $e$;
do $$
begin
  begin
    update zentra.presupuestos set estado = 'convertido';
    raise exception 'quedó convertido sin venta';
  exception when check_violation then null;
  end;
  begin
    insert into zentra.presupuestos (empresa_id, numero, valido_hasta, fecha)
    values (zentra.empresa_actual(), 'PRE-999999', current_date - 1, current_date);
    raise exception 'aceptó una validez anterior a la fecha';
  exception when check_violation then null;
  end;
end $$;
\echo '  OK 4 · convertido va con su venta, y la validez es de hoy en adelante'

reset role;
\echo 'Presupuestos: todas las pruebas pasaron.'

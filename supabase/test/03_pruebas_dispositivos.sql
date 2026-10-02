-- Pruebas de los tokens de notificaciones. Correr sobre una base limpia, después
-- de 00_stub_auth + 01 + 02 + 03 + 04 + 05.

\set ON_ERROR_STOP on

create or replace function pg_temp.entrar(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p)::text, false)
$$;

-- Dos personas en la misma empresa, y una tercera en otra.
insert into auth.users (id, email, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000001', 'jefa@una.py',  '{"nombre":"Jefa","empresa":"Empresa Una"}'),
  ('dddddddd-0000-0000-0000-000000000001', 'otro@dos.py',  '{"nombre":"Otro","empresa":"Empresa Dos"}');

do $$
declare emp uuid;
begin
  select empresa_id into emp from zentra.usuarios where email = 'jefa@una.py';
  insert into auth.users (id, email, raw_user_meta_data)
  values ('cccccccc-0000-0000-0000-000000000002', 'vend@una.py',
          json_build_object('nombre','Vendedor','empresa_id',emp)::jsonb);
end $$;

-- ---------- 1. cada uno registra su teléfono ----------
do $$
declare n int;
begin
  set role authenticated;

  perform pg_temp.entrar('cccccccc-0000-0000-0000-000000000001');
  perform zentra.registrar_dispositivo('tok-jefa', 'android');

  perform pg_temp.entrar('cccccccc-0000-0000-0000-000000000002');
  perform zentra.registrar_dispositivo('tok-vend', 'ios');

  -- Cada uno ve sólo el suyo, aunque sean de la misma empresa.
  select count(*) into n from zentra.dispositivos;
  assert n = 1, 'el vendedor ve ' || n || ' dispositivos, debería ver sólo el suyo';
  reset role;
end $$;
\echo '  OK 1 · cada uno ve y maneja sólo sus propios dispositivos'

-- ---------- 2. el token no se duplica al cambiar de dueño ----------
-- Es el caso del teléfono que pasa de un empleado a otro. Dos filas con el mismo
-- token harían llegar el aviso dos veces, o a quien ya no usa ese teléfono.
do $$
declare n int; dueño uuid;
begin
  set role authenticated;
  perform pg_temp.entrar('cccccccc-0000-0000-0000-000000000002');
  perform zentra.registrar_dispositivo('tok-jefa', 'android');
  reset role;

  select count(*) into n from zentra.dispositivos where token = 'tok-jefa';
  assert n = 1, 'el token se duplicó: hay ' || n || ' filas';
  select usuario_id into dueño from zentra.dispositivos where token = 'tok-jefa';
  assert dueño = 'cccccccc-0000-0000-0000-000000000002', 'el token no se reasignó al nuevo dueño';
end $$;
\echo '  OK 2 · un token es un teléfono: se reasigna, no se duplica'

-- ---------- 3. la app no escribe la tabla directo ----------
-- De quién es la fila lo decide el servidor, no el cliente. Si la app pudiera
-- insertar, podría poner el id de otro y robarle los avisos.
do $$
declare emp uuid; falló boolean := false;
begin
  select empresa_id into emp from zentra.usuarios where email = 'jefa@una.py';
  set role authenticated;
  perform pg_temp.entrar('cccccccc-0000-0000-0000-000000000002');
  begin
    insert into zentra.dispositivos (token, usuario_id, empresa_id, plataforma)
    values ('tok-robado', 'cccccccc-0000-0000-0000-000000000001', emp, 'android');
  exception when others then
    falló := true;
  end;
  reset role;
  assert falló, 'la app pudo insertar en dispositivos sin pasar por la función';
end $$;
\echo '  OK 3 · el alta pasa siempre por el servidor'

-- ---------- 4. sin sesión no se registra nada ----------
do $$
declare falló boolean := false;
begin
  set role authenticated;
  perform set_config('request.jwt.claims', '', false);
  begin
    perform zentra.registrar_dispositivo('tok-sin-sesion', 'android');
  exception when others then
    falló := true;
  end;
  reset role;
  assert falló, 'dejó registrar un dispositivo sin sesión';
end $$;
\echo '  OK 4 · sin sesión no se registra nada'

-- ---------- 5. borrar el usuario se lleva sus dispositivos ----------
-- Si quedaran, el servidor seguiría mandando avisos a un teléfono sin dueño.
do $$
declare n int;
begin
  set role authenticated;
  perform pg_temp.entrar('cccccccc-0000-0000-0000-000000000002');
  perform zentra.eliminar_mi_cuenta();
  reset role;

  select count(*) into n from zentra.dispositivos
   where usuario_id = 'cccccccc-0000-0000-0000-000000000002';
  assert n = 0, 'quedaron ' || n || ' dispositivos de una cuenta borrada';
end $$;
\echo '  OK 5 · al borrar la cuenta se van sus dispositivos'

\echo ''
\echo 'Dispositivos: todas las pruebas pasaron.'

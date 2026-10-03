-- Pruebas de la instalación compartida: nuestras tablas adentro del proyecto de
-- un cliente que ya tiene un ERP, compartiendo el `auth` con él.
--
-- Lo que se verifica es que la app no se meta con lo del ERP. Correr sobre una
-- base limpia, después de 00_stub_auth + todo_en_uno.

\set ON_ERROR_STOP on

create or replace function pg_temp.entrar(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p)::text, false)
$$;

update zentra.instalacion set compartida = true;

-- ---------- 1. un usuario del ERP no entra a zentra ----------
-- El ERP crea sus usuarios en el mismo `auth`. No llevan metadatos nuestros, y
-- no tienen por qué aparecer como empresas de la app.
do $$
declare n int;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('eeeeeeee-0000-0000-0000-000000000001', 'contable@erp.py', '{"cargo":"Contable"}');

  select count(*) into n from zentra.usuarios where id = 'eeeeeeee-0000-0000-0000-000000000001';
  assert n = 0, 'se le creó perfil de zentra a un usuario del ERP';
  select count(*) into n from zentra.empresas;
  assert n = 0, 'se creó una empresa por un usuario del ERP';
end $$;
\echo '  OK 1 · un usuario del ERP no genera empresa ni perfil en zentra'

-- ---------- 2. un usuario de la app sí ----------
do $$
declare n int;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('ffffffff-0000-0000-0000-000000000001', 'vendedor@app.py',
          '{"nombre":"Vendedor","empresa":"Empresa de la App"}');

  select count(*) into n from zentra.usuarios where id = 'ffffffff-0000-0000-0000-000000000001';
  assert n = 1, 'no se creó el perfil del usuario de la app';
  select count(*) into n from zentra.empresas;
  assert n = 1, 'se esperaba 1 empresa, hay ' || n;
end $$;
\echo '  OK 2 · un usuario de la app sí genera empresa y perfil'

-- ---------- 3. borrar la cuenta NO borra el login del ERP ----------
-- Es lo más importante de todo esto: el vendedor que se da de baja de la app no
-- puede perder el acceso al sistema de su empresa.
do $$
declare n int; emp uuid;
begin
  select empresa_id into emp from zentra.usuarios where id = 'ffffffff-0000-0000-0000-000000000001';
  insert into zentra.clientes (empresa_id, nombre) values (emp, 'Cliente de la app');

  set role authenticated;
  perform pg_temp.entrar('ffffffff-0000-0000-0000-000000000001');
  perform zentra.eliminar_mi_cuenta();
  reset role;

  select count(*) into n from zentra.usuarios where id = 'ffffffff-0000-0000-0000-000000000001';
  assert n = 0, 'no se borró el perfil de la app';
  select count(*) into n from auth.users where id = 'ffffffff-0000-0000-0000-000000000001';
  assert n = 1, 'BORRÓ EL LOGIN DEL ERP: quedan ' || n || ' filas en auth.users, se esperaba 1';
  select count(*) into n from zentra.clientes where empresa_id = emp;
  assert n = 0, 'quedaron datos de la app después de borrar la cuenta';
end $$;
\echo '  OK 3 · borrar la cuenta se lleva los datos de la app, no el login del ERP'

-- ---------- 4. sin compartir, el comportamiento es el de siempre ----------
update zentra.instalacion set compartida = false;
do $$
declare n int;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('ffffffff-0000-0000-0000-000000000002', 'solo@app.py',
          '{"nombre":"Solo","empresa":"Empresa Sola"}');

  set role authenticated;
  perform pg_temp.entrar('ffffffff-0000-0000-0000-000000000002');
  perform zentra.eliminar_mi_cuenta();
  reset role;

  select count(*) into n from auth.users where id = 'ffffffff-0000-0000-0000-000000000002';
  assert n = 0, 'en instalación propia sí tiene que borrar el login, quedan ' || n;
end $$;
\echo '  OK 4 · en instalación propia el borrado sigue llevándose el login'

\echo ''
\echo 'Instalación compartida: todas las pruebas pasaron.'

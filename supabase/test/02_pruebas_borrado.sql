-- Pruebas del borrado de cuenta. Correr sobre una base limpia, después de
-- 00_stub_auth + 01 + 02 + 03 + 04.

\set ON_ERROR_STOP on

create or replace function pg_temp.entrar(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p)::text, false)
$$;

-- Dos empresas: una con un solo dueño, otra con dos personas.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'sola@uno.py',  '{"nombre":"Sola","empresa":"Empresa Sola"}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'jefe@dos.py',  '{"nombre":"Jefe","empresa":"Empresa Dos"}');

do $$
declare emp uuid;
begin
  select empresa_id into emp from zentra.usuarios where email = 'jefe@dos.py';
  -- El segundo usuario entra a la empresa que ya existe, vía metadatos.
  insert into auth.users (id, email, raw_user_meta_data)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'vend@dos.py',
          json_build_object('nombre','Vendedor','empresa_id',emp)::jsonb);
end $$;

-- Datos de la empresa que va a quedar sola.
do $$
declare emp uuid;
begin
  select empresa_id into emp from zentra.usuarios where email = 'sola@uno.py';
  insert into zentra.clientes (empresa_id, nombre) values (emp, 'Cliente de Sola');
  insert into zentra.productos (empresa_id, nombre, sku, precio, costo) values (emp, 'Producto', 'PRD', 1000, 500);
end $$;

-- ---------- 1. el último usuario se lleva la empresa y sus datos ----------
do $$
declare emp uuid; n int;
begin
  select empresa_id into emp from zentra.usuarios where email = 'sola@uno.py';

  set role authenticated;
  perform pg_temp.entrar('aaaaaaaa-0000-0000-0000-000000000001');
  perform zentra.eliminar_mi_cuenta();
  reset role;

  select count(*) into n from auth.users where email = 'sola@uno.py';
  assert n = 0, 'la cuenta de auth no se borró';
  select count(*) into n from zentra.usuarios where email = 'sola@uno.py';
  assert n = 0, 'el perfil quedó huérfano';
  select count(*) into n from zentra.empresas where id = emp;
  assert n = 0, 'la empresa quedó viva sin usuarios';
  select count(*) into n from zentra.clientes where empresa_id = emp;
  assert n = 0, 'quedaron clientes de una empresa borrada';
  select count(*) into n from zentra.productos where empresa_id = emp;
  assert n = 0, 'quedaron productos de una empresa borrada';
end $$;
\echo '  OK 1 · el último usuario se lleva su empresa y todos sus datos'

-- ---------- 2. si quedan compañeros, la empresa sobrevive ----------
do $$
declare emp uuid; n int;
begin
  select empresa_id into emp from zentra.usuarios where email = 'vend@dos.py';
  insert into zentra.clientes (empresa_id, nombre) values (emp, 'Cliente de la empresa');

  set role authenticated;
  perform pg_temp.entrar('bbbbbbbb-0000-0000-0000-000000000002');
  perform zentra.eliminar_mi_cuenta();
  reset role;

  select count(*) into n from auth.users where email = 'vend@dos.py';
  assert n = 0, 'el vendedor no se borró';
  select count(*) into n from zentra.empresas where id = emp;
  assert n = 1, 'se borró la empresa aunque quedaba el jefe';
  select count(*) into n from zentra.usuarios where empresa_id = emp;
  assert n = 1, 'quedaron ' || n || ' usuarios, se esperaba 1';
  select count(*) into n from zentra.clientes where empresa_id = emp;
  assert n = 1, 'se perdieron los clientes de la empresa';
end $$;
\echo '  OK 2 · si quedan compañeros, la empresa y sus datos sobreviven'

-- ---------- 3. sin sesión no borra nada ----------
do $$
declare falló boolean := false;
begin
  set role authenticated;
  perform set_config('request.jwt.claims', '', false);
  begin
    perform zentra.eliminar_mi_cuenta();
  exception when others then
    falló := true;
  end;
  reset role;
  assert falló, 'dejó ejecutar el borrado sin sesión';
end $$;
\echo '  OK 3 · sin sesión no borra nada'

\echo ''
\echo 'Borrado de cuenta: todas las pruebas pasaron.'

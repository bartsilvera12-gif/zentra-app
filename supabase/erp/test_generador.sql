-- Prueba del generador contra un ERP simulado. Correr sobre una base limpia:
--   psql -f supabase/erp/test_generador.sql

\set ON_ERROR_STOP on

-- ---------- un ERP inventado, con dos empresas en schemas separados ----------
-- Los nombres de columna imitan los del ERP real: razon_social, tipo_cliente,
-- nombre_contacto. Es justo el desajuste que las vistas tienen que tapar.
create schema erp_jm;
create table erp_jm.clientes (
  id serial primary key,
  razon_social text,
  nombre_contacto text,
  tipo_cliente text,
  ruc text,
  telefono text,
  activo boolean default true
);
insert into erp_jm.clientes (razon_social, nombre_contacto, tipo_cliente, ruc, telefono, activo) values
  ('Supermercado Aurora SA', 'Lucía Benítez', 'Mayorista', '80012345-6', '0981111111', true),
  ('Despensa Vieja',         'Juan Pérez',    'Minorista', '4567890-1',  '0982222222', false);

create schema erp_ferre;
create table erp_ferre.clientes (like erp_jm.clientes including all);
insert into erp_ferre.clientes (razon_social, nombre_contacto, tipo_cliente, ruc, telefono, activo) values
  ('Ferretería del Este', 'Ana Rojas', 'Mayorista', '80099999-9', '0983333333', true);

\i supabase/erp/10_generador.sql

-- ---------- el mapeo: lo único que cambia entre un ERP y otro ----------
insert into zentra_erp.origen (vista, tabla, filtro) values
  ('clientes', 'clientes', 'activo is not false');

insert into zentra_erp.mapeo (vista, campo, expresion, orden) values
  ('clientes', 'id',       'id::text',                                        1),
  ('clientes', 'nombre',   'coalesce(razon_social, nombre_contacto)',         2),
  ('clientes', 'doc',      'ruc',                                             3),
  ('clientes', 'contacto', 'nombre_contacto',                                 4),
  ('clientes', 'tel',      'telefono',                                        5),
  ('clientes', 'lista',    'tipo_cliente',                                    6);

-- ---------- generar ----------
select zentra_erp.generar('JM', 'erp_jm');
select zentra_erp.generar('FERRE', 'erp_ferre');

-- ---------- 1. la vista traduce los nombres ----------
do $$
declare r record;
begin
  select * into r from zentra_jm.clientes order by nombre limit 1;
  assert r.nombre = 'Despensa Vieja' or r.nombre = 'Supermercado Aurora SA',
    'la vista no devolvió el nombre traducido: ' || coalesce(r.nombre, '(null)');
end $$;
do $$
declare n int;
begin
  select count(*) into n from zentra_jm.clientes;
  -- Son dos filas, pero una está inactiva y el filtro la saca.
  assert n = 1, 'esperaba 1 cliente activo, hay ' || n;
  select count(*) into n from information_schema.columns
   where table_schema = 'zentra_jm' and table_name = 'clientes'
     and column_name in ('nombre','doc','contacto','tel','lista','id');
  assert n = 6, 'faltan columnas en la vista, hay ' || n;
end $$;
\echo '  OK 1 · la vista traduce las columnas del ERP y aplica el filtro'

-- ---------- 2. una empresa no ve la otra ----------
do $$
declare n int;
begin
  select count(*) into n from zentra_jm.clientes where nombre like 'Ferreter%';
  assert n = 0, 'la vista de JM está mostrando datos de Ferrecolor';
  select count(*) into n from zentra_ferre.clientes;
  assert n = 1, 'la vista de Ferrecolor no devolvió lo suyo';
end $$;
\echo '  OK 2 · cada schema de vistas ve sólo su empresa'

-- ---------- 3. no toca el ERP ----------
do $$
declare n int;
begin
  select count(*) into n from erp_jm.clientes;
  assert n = 2, 'el ERP cambió: tenía 2 filas y ahora tiene ' || n;
  -- Y las vistas no son escribibles para la app.
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'zentra_jm' and grantee = 'authenticated'
     and privilege_type in ('INSERT','UPDATE','DELETE');
  assert n = 0, 'la app tiene permiso de escritura sobre las vistas';
end $$;
\echo '  OK 3 · sólo lectura, y el ERP queda intacto'

-- ---------- 4. el rol anónimo no llega ----------
do $$
declare falló boolean := false;
begin
  set role anon;
  begin
    perform 1 from zentra_jm.clientes;
  exception when others then
    falló := true;
  end;
  reset role;
  assert falló, 'el rol anónimo pudo leer las vistas';
end $$;
\echo '  OK 4 · sin sesión no se llega a las vistas'

-- ---------- 5. respeta el RLS del ERP ----------
-- security_invoker: si la tabla del ERP filtra por RLS, la vista también.
alter table erp_jm.clientes enable row level security;
create policy solo_mayoristas on erp_jm.clientes
  for select to authenticated using (tipo_cliente = 'Mayorista');
grant usage on schema erp_jm to authenticated;
grant select on erp_jm.clientes to authenticated;

do $$
declare n int;
begin
  set role authenticated;
  select count(*) into n from zentra_jm.clientes;
  reset role;
  assert n = 1, 'con RLS de sólo mayoristas esperaba 1, hubo ' || n;
end $$;
\echo '  OK 5 · la vista hereda el RLS de la tabla del ERP'

-- ---------- 6. regenerar toma el mapeo nuevo ----------
insert into zentra_erp.mapeo (vista, campo, expresion, orden)
values ('clientes', 'zona', '''Central''::text', 7);
select zentra_erp.generar('JM', 'erp_jm');
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'zentra_jm' and table_name = 'clientes' and column_name = 'zona';
  assert n = 1, 'regenerar no agregó la columna nueva';
end $$;
\echo '  OK 6 · cambiar el mapeo y regenerar alcanza'

-- ---------- 7. un schema compartido por varias empresas ----------
-- El schema que no es `erp_*` guarda varias empresas juntas, separadas por una
-- columna empresa_id. Sin filtrar, la app de una vería los clientes de todas.
create schema erp_compartido;
create table erp_compartido.clientes (
  id serial primary key,
  empresa_id uuid,
  razon_social text,
  nombre_contacto text,
  tipo_cliente text,
  ruc text,
  telefono text,
  activo boolean default true
);
insert into erp_compartido.clientes (empresa_id, razon_social, tipo_cliente, activo) values
  ('11111111-1111-1111-1111-111111111111', 'Cliente de la empresa UNO', 'Mayorista', true),
  ('11111111-1111-1111-1111-111111111111', 'Otro de la UNO',            'Mayorista', true),
  ('22222222-2222-2222-2222-222222222222', 'Cliente de la empresa DOS', 'Mayorista', true);

-- Sin el empresa_id tiene que negarse, no generar una vista que no filtra.
do $$
declare falló boolean := false;
begin
  begin
    perform zentra_erp.generar('UNO', 'erp_compartido');
  exception when others then
    falló := true;
  end;
  assert falló, 'generó vistas sobre un schema compartido SIN filtrar por empresa';
end $$;

do $$
declare n int;
begin
  perform zentra_erp.generar('UNO', 'erp_compartido', '11111111-1111-1111-1111-111111111111');
  perform zentra_erp.generar('DOS', 'erp_compartido', '22222222-2222-2222-2222-222222222222');

  select count(*) into n from zentra_uno.clientes;
  assert n = 2, 'la empresa UNO tendría que ver 2 clientes, ve ' || n;
  select count(*) into n from zentra_dos.clientes;
  assert n = 1, 'la empresa DOS tendría que ver 1 cliente, ve ' || n;
  select count(*) into n from zentra_uno.clientes where nombre like '%DOS%';
  assert n = 0, 'la empresa UNO está viendo clientes de la DOS';
end $$;
\echo '  OK 7 · en un schema compartido exige el empresa_id y filtra por él'

-- ---------- 8. todas de una vez, leyendo la tabla de empresas del ERP ----------
create table public.empresas (
  id serial primary key, id_empresa uuid default gen_random_uuid(),
  nombre text, codigo text, data_schema text
);
insert into public.empresas (id_empresa, nombre, codigo, data_schema) values
  (gen_random_uuid(), 'Distribuidora JM', 'JM', 'erp_jm'),
  (gen_random_uuid(), 'Ferrecolor', 'FERRE', 'erp_ferre'),
  -- Una con el schema mal, a propósito: no puede frenar a las demás.
  (gen_random_uuid(), 'Rota', 'ROTA', 'erp_no_existe');

-- Y una sin data_schema: el ERP las manda al schema compartido.
insert into public.empresas (id_empresa, nombre, codigo, data_schema)
  values ('11111111-1111-1111-1111-111111111111', 'Sin schema', 'SINSC', null);

do $$
declare n int;
begin
  perform zentra_erp.generar_todas('public.empresas', 'codigo', 'data_schema', 'id_empresa', 'erp_compartido');

  select count(*) into n from zentra_erp.directorio where codigo in ('jm','ferre');
  assert n = 2, 'esperaba las dos empresas buenas en el directorio, hay ' || n;
  select count(*) into n from zentra_erp.directorio where codigo = 'no_existe';
  assert n = 0, 'generó un schema para una empresa con el schema inexistente';
  select count(*) into n from zentra_erp.directorio where codigo = 'sinsc';
  assert n = 1, 'la empresa sin data_schema tendría que ir al compartido, y no fue';

  select count(*) into n from zentra_erp.generar_todas(
    'public.empresas', 'codigo', 'data_schema', 'id_empresa', 'erp_compartido') where error is not null;
  assert n = 1, 'esperaba exactamente 1 empresa con error, hubo ' || n;
end $$;
\echo '  OK 8 · genera todas de una vez, y una rota no frena a las demás'

\echo ''
\echo 'Generador de vistas: todas las pruebas pasaron.'

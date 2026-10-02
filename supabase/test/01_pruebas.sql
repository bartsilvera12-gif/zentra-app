-- =============================================================================
-- Pruebas de comportamiento. Correr después de 00/01/02/03 sobre una base limpia.
-- Cada bloque falla ruidosamente si la regla no se cumple.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off

-- Simula el login de PostgREST: fija quién está pidiendo.
create or replace function pg_temp.entrar(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p)::text, false)
$$;

-- ---------- 1. registro ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ana@almacen.py',  '{"nombre":"Ana","empresa":"Almacén Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'beto@despensa.py','{"nombre":"Beto","empresa":"Despensa Beto"}');

do $$
declare n int;
begin
  select count(*) into n from zentra.empresas;
  assert n = 2, 'esperaba 2 empresas creadas por el disparador, hay ' || n;
  select count(*) into n from zentra.usuarios;
  assert n = 2, 'esperaba 2 usuarios, hay ' || n;
  assert (select e.nombre from zentra.empresas e
            join zentra.usuarios u on u.empresa_id = e.id
           where u.email = 'ana@almacen.py') = 'Almacén Ana',
         'la empresa de Ana no se llamó como los metadatos';
end $$;
\echo '  OK 1 · registrarse crea empresa y perfil'

-- ---------- 2. aislamiento entre empresas ----------
set role authenticated;
do $e$ begin perform pg_temp.entrar('11111111-1111-1111-1111-111111111111'); end $e$;

insert into zentra.clientes (empresa_id, nombre, doc)
values (zentra.empresa_actual(), 'Cliente de Ana', 'RUC 80011111-1');

insert into zentra.productos (empresa_id, nombre, sku, precio, costo, iva)
values (zentra.empresa_actual(), 'Gaseosa cola 2 L', 'GAS', 12000, 8640, '10%');

do $e$ begin perform pg_temp.entrar('22222222-2222-2222-2222-222222222222'); end $e$;

do $$
declare n int;
begin
  select count(*) into n from zentra.clientes;
  assert n = 0, 'Beto está viendo ' || n || ' clientes de Ana';
  select count(*) into n from zentra.productos;
  assert n = 0, 'Beto está viendo ' || n || ' productos de Ana';
end $$;
\echo '  OK 2 · una empresa no ve los datos de la otra'

-- ---------- 3. no se puede escribir en la empresa ajena ----------
do $$
declare ajena uuid;
begin
  reset role;
  select empresa_id into ajena from zentra.usuarios where email = 'ana@almacen.py';
  set role authenticated;
  perform pg_temp.entrar('22222222-2222-2222-2222-222222222222');
  begin
    insert into zentra.clientes (empresa_id, nombre) values (ajena, 'Infiltrado');
    raise exception 'FALLA: Beto pudo insertar en la empresa de Ana';
  exception when insufficient_privilege then
    null; -- esperado: la política lo rechaza
  end;
end $$;
\echo '  OK 3 · no se puede insertar en la empresa ajena'

-- ---------- 4. numeración correlativa ----------
do $e$ begin perform pg_temp.entrar('11111111-1111-1111-1111-111111111111'); end $e$;
do $$
declare a text; b text; c text;
begin
  a := zentra.siguiente_numero(zentra.empresa_actual(), 'venta');
  b := zentra.siguiente_numero(zentra.empresa_actual(), 'venta');
  c := zentra.siguiente_numero(zentra.empresa_actual(), 'compra');
  assert a = 'VTA-000001', 'primer número de venta fue ' || a;
  assert b = 'VTA-000002', 'segundo número de venta fue ' || b;
  assert c = 'COMP-000001', 'primer número de compra fue ' || c;
end $$;
\echo '  OK 4 · numeración correlativa por empresa y tipo'

-- ---------- 5. IVA contenido en el precio ----------
do $$
declare v uuid; p uuid; emp uuid; total bigint; iva bigint;
begin
  emp := zentra.empresa_actual();
  select id into p from zentra.productos where sku = 'GAS';

  insert into zentra.ventas (empresa_id, numero, condicion, metodo, estado)
  values (emp, zentra.siguiente_numero(emp, 'venta'), 'Contado', 'transferencia', 'Cobrada')
  returning id into v;

  insert into zentra.venta_lineas (venta_id, producto_id, nombre, cantidad, precio, iva)
  values (v, p, 'Gaseosa cola 2 L', 2, 12000, '10%'),
         (v, p, 'Cerveza lata 350 ml', 1, 9500, '10%');

  total := zentra.total_venta(v);
  iva   := zentra.iva_venta(v);
  assert total = 33500, 'total esperado 33500, dio ' || total;
  -- Contenido: 33500 * 0.10 / 1.10 = 3045, no 3350.
  assert iva = 3045, 'IVA contenido esperado 3045, dio ' || iva;
end $$;
\echo '  OK 5 · IVA contenido (33.500 al 10% = 3.045, no 3.350)'

-- ---------- 6. crédito exige cliente identificado ----------
do $$
declare emp uuid;
begin
  emp := zentra.empresa_actual();
  begin
    insert into zentra.ventas (empresa_id, numero, condicion, plazo_dias, estado, cliente_id)
    values (emp, zentra.siguiente_numero(emp, 'venta'), 'Crédito', 30, 'Pendiente', null);
    raise exception 'FALLA: dejó registrar una venta a crédito sin cliente';
  exception when check_violation then
    null; -- esperado
  end;
end $$;
\echo '  OK 6 · venta a crédito sin cliente es rechazada'

-- ---------- 7. el stock lo mantiene el disparador ----------
do $$
declare p uuid; emp uuid; st numeric;
begin
  emp := zentra.empresa_actual();
  select id into p from zentra.productos where sku = 'GAS';

  insert into zentra.movimientos (empresa_id, producto_id, tipo, cantidad, origen)
  values (emp, p, 'ENTRADA', 120, 'Compra');
  insert into zentra.movimientos (empresa_id, producto_id, tipo, cantidad, origen)
  values (emp, p, 'SALIDA', -20, 'Venta');

  select stock into st from zentra.productos where id = p;
  assert st = 100, 'stock esperado 100 (0 + 120 - 20), dio ' || st;
end $$;
\echo '  OK 7 · el stock sigue al libro de movimientos'

-- ---------- 8. compras: IVA por encima del costo ----------
do $$
declare c uuid; emp uuid; total bigint;
begin
  emp := zentra.empresa_actual();
  insert into zentra.compras (empresa_id, numero, condicion, plazo_dias, cuotas, estado)
  values (emp, zentra.siguiente_numero(emp, 'compra'), 'Crédito', 30, 2, 'Pendiente')
  returning id into c;

  insert into zentra.compra_lineas (compra_id, nombre, cantidad, costo, iva)
  values (c, 'Cerveza lata 350 ml', 240, 7800, '10%');

  total := zentra.total_compra(c);
  -- 240 * 7800 * 1.10 = 2.059.200
  assert total = 2059200, 'total de compra esperado 2059200, dio ' || total;
end $$;
\echo '  OK 8 · compras: IVA sobre el costo (240 x 7.800 + 10% = 2.059.200)'

reset role;
\echo ''
\echo 'Todas las pruebas pasaron.'

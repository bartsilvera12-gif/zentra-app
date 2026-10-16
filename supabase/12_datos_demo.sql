-- ---------- datos de ejemplo para la cuenta de revisión ----------
--
-- Google revisa la app entrando con un usuario y una contraseña que uno le
-- deja en Play Console. Si esa cuenta está vacía, lo que ven es una app sin
-- nada: ni un producto, ni una venta, ni un reporte. Una app vacía parece una
-- app rota, y el rechazo más común de todos es justamente "no pudimos ver la
-- funcionalidad".
--
-- Esto carga un comercio de ejemplo creíble: productos con stock, con uno
-- bajo mínimo y otro agotado —para que el aviso de stock se vea—, clientes,
-- un proveedor y seis ventas repartidas en los últimos días, para que los
-- reportes tengan una serie que mostrar.
--
-- Cómo se usa: cambiar el correo de abajo por el de la cuenta de revisión,
-- que tiene que estar creada desde la app ANTES de correr esto, y ejecutar
-- todo junto en el editor SQL de Supabase.
--
-- Es idempotente: si se corre de nuevo no duplica nada. Borra lo que cargó
-- antes para esa empresa y lo vuelve a crear, así se puede dejar la cuenta
-- prolija entre una revisión y otra.
--
-- NO correr esto contra la empresa de un cliente de verdad: borra las ventas
-- y los productos de la empresa que elija. Por eso pide un correo exacto y no
-- acepta "todas".

do $$
declare
  -- ↓↓↓ CAMBIAR POR EL CORREO DE LA CUENTA DE REVISIÓN ↓↓↓
  v_email    text := 'revision@neura.com.py';
  v_empresa  uuid;
  v_usuario  uuid;
  v_cli1     uuid; v_cli2 uuid; v_cli3 uuid;
  v_prov     uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_p6 uuid;
  v_venta    uuid;
  v_n        int;
begin
  select u.id, u.empresa_id into v_usuario, v_empresa
    from zentra.usuarios u
   where lower(u.email) = lower(v_email)
   limit 1;

  if v_empresa is null then
    raise exception
      'No hay ningún usuario con el correo %. Creá la cuenta desde la app primero.', v_email;
  end if;

  -- Max y vencimiento lejano: los revisores tienen que poder ver todo, y una
  -- suscripción que se vence en medio de la revisión es un rechazo.
  update zentra.empresas
     set plan = 'max', vence = '2030-12-31', nombre = coalesce(nullif(btrim(nombre), ''), 'Despensa Doña Lucía')
   where id = v_empresa;

  -- Limpieza: esto es una cuenta de demostración, no un historial.
  delete from zentra.ventas      where empresa_id = v_empresa;
  delete from zentra.compras     where empresa_id = v_empresa;
  delete from zentra.movimientos where empresa_id = v_empresa;
  delete from zentra.productos   where empresa_id = v_empresa;
  delete from zentra.clientes    where empresa_id = v_empresa;
  delete from zentra.proveedores where empresa_id = v_empresa;
  delete from zentra.numeracion  where empresa_id = v_empresa;

  insert into zentra.clientes (empresa_id, nombre, doc, contacto, tel, zona, direccion, lista_precios, credito_limite, credito_plazo_dias)
  values (v_empresa, 'Despensa Doña Lucía', '80012345-6', 'Lucía Benítez', '0981 111 222', 'Barrio Obrero', 'Av. Fernando de la Mora 1234', 'Mayorista', 3000000, 30)
  returning id into v_cli1;

  insert into zentra.clientes (empresa_id, nombre, doc, contacto, tel, zona, direccion, lista_precios)
  values (v_empresa, 'Almacén San Blas', '80098765-1', 'Ramón Ortiz', '0982 333 444', 'Lambaré', 'Calle Last 456', 'Minorista')
  returning id into v_cli2;

  insert into zentra.clientes (empresa_id, nombre, doc, contacto, tel, zona, lista_precios, origen)
  values (v_empresa, 'Minimercado Ykuá', '4.521.330', 'Sofía Ayala', '0983 555 666', 'Fernando de la Mora', 'Minorista', 'Venta')
  returning id into v_cli3;

  insert into zentra.proveedores (empresa_id, nombre, doc, rubro, ciudad, contacto, tel, entrega_dias, credito_plazo_dias)
  values (v_empresa, 'Distribuidora del Este S.A.', '80011223-4', 'Bebidas', 'Ciudad del Este', 'Carlos Rojas', '0971 777 888', 2, 30)
  returning id into v_prov;

  -- Los productos cubren los estados que la pantalla sabe mostrar: normal,
  -- bajo mínimo y agotado. Sin eso, media app no se ve.
  insert into zentra.productos (empresa_id, nombre, sku, barras, minimo, costo, precio, unidad, categoria, deposito, iva)
  values (v_empresa, 'Gaseosa cola 2 L', 'GAS-001', '7790001234567', 24, 8640, 12000, 'UNIDAD', 'Bebidas', 'Depósito central', '10%')
  returning id into v_p1;
  insert into zentra.productos (empresa_id, nombre, sku, barras, minimo, costo, precio, unidad, categoria, deposito, iva)
  values (v_empresa, 'Agua mineral 500 ml ×12', 'AGU-002', '7790001234574', 12, 20160, 28000, 'CAJA', 'Bebidas', 'Depósito central', '10%')
  returning id into v_p2;
  insert into zentra.productos (empresa_id, nombre, sku, barras, minimo, costo, precio, unidad, categoria, deposito, iva)
  values (v_empresa, 'Cerveza lata 350 ml', 'CER-003', '7790001234581', 60, 6840, 9500, 'UNIDAD', 'Bebidas', 'Depósito central', '10%')
  returning id into v_p3;
  insert into zentra.productos (empresa_id, nombre, sku, minimo, costo, precio, unidad, categoria, deposito, iva)
  values (v_empresa, 'Jugo natural 1 L', 'JUG-004', 24, 8280, 11500, 'UNIDAD', 'Bebidas', 'Sucursal Luque', '5%')
  returning id into v_p4;
  insert into zentra.productos (empresa_id, nombre, sku, minimo, costo, precio, unidad, categoria, deposito, iva, metodo)
  values (v_empresa, 'Energizante 500 ml', 'ENE-005', 18, 10800, 15000, 'UNIDAD', 'Bebidas', 'Depósito central', '10%', 'FIFO')
  returning id into v_p5;
  insert into zentra.productos (empresa_id, nombre, sku, minimo, costo, precio, unidad, categoria, deposito, iva)
  values (v_empresa, 'Soda 1,5 L', 'SOD-006', 30, 5040, 7000, 'UNIDAD', 'Bebidas', 'Depósito central', '10%')
  returning id into v_p6;

  -- El stock lo mantiene el trigger de movimientos, no un update al producto:
  -- así el historial que muestra la ficha coincide con el número de arriba.
  insert into zentra.movimientos (empresa_id, producto_id, tipo, cantidad, origen, ref, usuario_id, creado_en) values
    (v_empresa, v_p1, 'ENTRADA', 48,  'Inventario inicial', 'INI-00001', v_usuario, now() - interval '20 days'),
    (v_empresa, v_p2, 'ENTRADA', 30,  'Inventario inicial', 'INI-00001', v_usuario, now() - interval '20 days'),
    (v_empresa, v_p3, 'ENTRADA', 120, 'Inventario inicial', 'INI-00001', v_usuario, now() - interval '20 days'),
    -- Jugo queda en 8 con mínimo 24: bajo mínimo.
    (v_empresa, v_p4, 'ENTRADA', 8,   'Inventario inicial', 'INI-00001', v_usuario, now() - interval '20 days'),
    -- Energizante entra y sale entero: agotado, que es el otro estado.
    (v_empresa, v_p5, 'ENTRADA', 18,  'Inventario inicial', 'INI-00001', v_usuario, now() - interval '20 days'),
    (v_empresa, v_p5, 'SALIDA',  -18, 'Venta',              'VTA-00000', v_usuario, now() - interval '3 days'),
    (v_empresa, v_p6, 'ENTRADA', 72,  'Inventario inicial', 'INI-00001', v_usuario, now() - interval '20 days');

  -- Seis ventas repartidas, para que el reporte tenga una serie y no un palo
  -- solo. Dos a crédito, para que se vea la condición y la cuenta corriente.
  v_n := 1;
  for v_venta in
    select unnest(array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                        gen_random_uuid(), gen_random_uuid(), gen_random_uuid()])
  loop
    insert into zentra.ventas (id, empresa_id, numero, cliente_id, cliente_texto, cliente_doc,
                               fecha, condicion, metodo, plazo_dias, estado, usuario_id, creado_en)
    values (
      v_venta, v_empresa, 'VTA-' || lpad(v_n::text, 6, '0'),
      case when v_n % 3 = 0 then v_cli3 when v_n % 2 = 0 then v_cli2 else v_cli1 end,
      case when v_n % 3 = 0 then 'Minimercado Ykuá' when v_n % 2 = 0 then 'Almacén San Blas' else 'Despensa Doña Lucía' end,
      case when v_n % 3 = 0 then '4.521.330' when v_n % 2 = 0 then '80098765-1' else '80012345-6' end,
      (current_date - (v_n * 2))::date,
      case when v_n = 1 then 'Crédito'::zentra.condicion_pago else 'Contado'::zentra.condicion_pago end,
      case when v_n = 1 then null else 'efectivo'::zentra.metodo_cobro end,
      case when v_n = 1 then 30 else null end,
      case when v_n = 1 then 'Pendiente'::zentra.estado_venta else 'Cobrada'::zentra.estado_venta end,
      v_usuario, now() - (v_n * interval '2 days')
    );

    insert into zentra.venta_lineas (venta_id, producto_id, nombre, cantidad, precio, iva) values
      (v_venta, v_p1, 'Gaseosa cola 2 L', 2 + (v_n % 3), 12000, '10%'),
      (v_venta, v_p3, 'Cerveza lata 350 ml', 6 + v_n, 9500, '10%');

    v_n := v_n + 1;
  end loop;

  raise notice 'Cuenta de demostración lista para % (empresa %)', v_email, v_empresa;
end $$;

-- Para ver que quedó cargado.
select e.nombre as empresa, e.plan, e.vence,
       (select count(*) from zentra.productos p where p.empresa_id = e.id) as productos,
       (select count(*) from zentra.clientes  c where c.empresa_id = e.id) as clientes,
       (select count(*) from zentra.ventas    v where v.empresa_id = e.id) as ventas
  from zentra.empresas e
  join zentra.usuarios u on u.empresa_id = e.id
 where lower(u.email) = lower('revision@neura.com.py');

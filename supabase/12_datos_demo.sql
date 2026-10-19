-- ---------- datos de ejemplo para la cuenta de revisión ----------
--
-- Google y Apple revisan la app entrando con un usuario y una contraseña que
-- uno les deja en la consola de cada tienda. Si esa cuenta está vacía, lo que
-- ven es una app sin nada: ni un producto, ni una venta, ni un reporte. Una
-- app vacía parece una app rota, y el rechazo más común de todos es
-- justamente "no pudimos ver la funcionalidad".
--
-- La misma cuenta sirve para las capturas de las dos fichas, y por eso esto
-- carga un comercio con volumen y no cuatro filas de muestra: una captura de
-- inventario con dos productos y media pantalla en blanco vende peor que no
-- poner captura. Son 30 productos en seis categorías, 15 clientes, cuatro
-- proveedores, seis compras y cuarenta ventas repartidas en el último mes,
-- para que los gráficos tengan una serie de verdad.
--
-- Tres estados de stock quedan armados a mano, porque son los que la pantalla
-- de inventario sabe mostrar y sin ellos media app no se ve: productos
-- normales, dos bajo mínimo y uno agotado.
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
  v_prov     uuid;
  v_compra   uuid;
  v_venta    uuid;
  v_cliente  record;
  v_p        record;
  v_n        int;
  v_lineas   int;
  v_i        int;
  v_cant     numeric;
  v_credito  boolean;
  v_dia      int;
  v_ventas   int := 40;
  v_compras  int := 6;
begin
  select u.id, u.empresa_id into v_usuario, v_empresa
    from zentra.usuarios u
   where lower(u.email) = lower(v_email)
   limit 1;

  if v_empresa is null then
    raise exception
      'No hay ningún usuario con el correo %. Creá la cuenta desde la app primero.', v_email;
  end if;

  -- Max y vencimiento lejano: los revisores tienen que poder ver todo. En
  -- Gratis la mitad de la app aparece con candado, que es exactamente lo que
  -- no queremos que vean ni ellos ni quien mire las capturas. Y una
  -- suscripción que se vence en medio de la revisión es un rechazo.
  update zentra.empresas
     set plan = 'max', vence = '2030-12-31',
         nombre = coalesce(nullif(btrim(nombre), ''), 'Despensa Doña Lucía')
   where id = v_empresa;

  -- Limpieza: esto es una cuenta de demostración, no un historial.
  delete from zentra.ventas      where empresa_id = v_empresa;
  delete from zentra.compras     where empresa_id = v_empresa;
  delete from zentra.movimientos where empresa_id = v_empresa;
  delete from zentra.productos   where empresa_id = v_empresa;
  delete from zentra.clientes    where empresa_id = v_empresa;
  delete from zentra.proveedores where empresa_id = v_empresa;
  delete from zentra.numeracion  where empresa_id = v_empresa;

  -- ---------- clientes ----------
  insert into zentra.clientes (empresa_id, nombre, doc, contacto, tel, zona, direccion, lista_precios, credito_limite, credito_plazo_dias)
  values
    (v_empresa, 'Despensa Doña Lucía',   '80012345-6', 'Lucía Benítez',   '0981 111 222', 'Barrio Obrero',       'Av. Fernando de la Mora 1234', 'Mayorista', 3000000, 30),
    (v_empresa, 'Almacén San Blas',      '80098765-1', 'Ramón Ortiz',     '0982 333 444', 'Lambaré',             'Calle Last 456',               'Minorista', 1500000, 15),
    (v_empresa, 'Minimercado Ykuá',      '4.521.330',  'Sofía Ayala',     '0983 555 666', 'Fernando de la Mora', 'Ruta Mcal. Estigarribia km 8', 'Minorista', null, null),
    (v_empresa, 'Copetín Doña Ramona',   '80055512-3', 'Ramona Cáceres',  '0984 220 110', 'San Lorenzo',         'Mcal. López 2300',             'Minorista', null, null),
    (v_empresa, 'Kiosco La Esquina',     '3.998.122',  'Diego Franco',    '0985 404 505', 'Asunción Centro',     'Palma esq. Alberdi',           'Minorista', null, null),
    (v_empresa, 'Super Avenida S.R.L.',  '80077321-9', 'Nancy Giménez',   '0971 880 990', 'Luque',               'Av. Aviadores del Chaco 980',  'Mayorista', 5000000, 30),
    (v_empresa, 'Despensa Tres Bocas',   '2.776.540',  'Julio Vera',      '0986 121 343', 'Capiatá',             'Km 19,5 Ruta 1',               'Minorista', null, null),
    (v_empresa, 'Rotisería Mboriahu',    '80044120-5', 'Elsa Duarte',     '0981 656 787', 'Ñemby',               'Villarrica 145',               'Minorista', 800000, 15),
    (v_empresa, 'Almacén El Trébol',     '1.884.203',  'Hugo Martínez',   '0982 909 121', 'Villa Elisa',         'Tte. Rojas Silva 67',          'Minorista', null, null),
    (v_empresa, 'Distribuidora Paraná',  '80090011-2', 'Marta Benítez',   '0972 313 424', 'Encarnación',         'Av. Irrazábal 1500',           'Mayorista', 4000000, 30),
    (v_empresa, 'Bar Che Roga',          '5.102.887',  'Aníbal Riquelme', '0983 747 858', 'Asunción Centro',     'Estrella 440',                 'Minorista', null, null),
    (v_empresa, 'Comedor La Familia',    '80033099-7', 'Rosa Alvarenga',  '0984 151 626', 'Mariano Roque Alonso','Ruta 3 km 14',                 'Minorista', 1000000, 15),
    (v_empresa, 'Minimercado Takuary',   '4.337.918',  'Víctor Ramírez',  '0985 262 737', 'Itauguá',             'Ruta 2 km 29',                 'Minorista', null, null),
    (v_empresa, 'Panadería Santa Rita',  '80066254-8', 'Lidia Ferreira',  '0981 838 949', 'San Lorenzo',         'Julia M. Cueto 310',           'Minorista', null, null),
    (v_empresa, 'Almacén Ñu Guasú',      '3.445.601',  'Pedro Ovelar',    '0986 494 050', 'Luque',               'Gral. Aquino 88',              'Minorista', null, null);

  -- ---------- proveedores ----------
  insert into zentra.proveedores (empresa_id, nombre, doc, rubro, ciudad, contacto, tel, entrega_dias, credito_plazo_dias)
  values
    (v_empresa, 'Distribuidora del Este S.A.', '80011223-4', 'Bebidas',    'Ciudad del Este', 'Carlos Rojas',   '0971 777 888', 2, 30),
    (v_empresa, 'Mayorista Central',           '80022334-5', 'Almacén',    'Asunción',        'Mirta Sosa',     '0972 666 999', 1, 15),
    (v_empresa, 'Lácteos del Sur',             '80033445-6', 'Lácteos',    'Encarnación',     'Osvaldo Núñez',  '0973 555 111', 3, 30),
    (v_empresa, 'Limpieza Total S.R.L.',       '80044556-7', 'Limpieza',   'Luque',           'Celeste Portillo','0974 444 222', 2, null);

  -- ---------- productos ----------
  -- Seis categorías a propósito: el filtro de categorías y el reporte por
  -- rubro no se entienden con una sola. `stock_inicial` entra como movimiento
  -- más abajo, nunca como un update al producto.
  create temp table tmp_prod (
    nombre text, sku text, barras text, minimo numeric, costo bigint, precio bigint,
    unidad text, categoria text, deposito text, iva zentra.iva, stock_inicial numeric
  ) on commit drop;

  insert into tmp_prod values
    ('Gaseosa cola 2 L',            'GAS-001','7790001234567', 24,  8640, 12000,'UNIDAD','Bebidas',     'Depósito central','10%', 120),
    ('Agua mineral 500 ml ×12',     'AGU-002','7790001234574', 12, 20160, 28000,'CAJA',  'Bebidas',     'Depósito central','10%',  60),
    ('Cerveza lata 350 ml',         'CER-003','7790001234581', 60,  6840,  9500,'UNIDAD','Bebidas',     'Depósito central','10%', 240),
    ('Jugo natural 1 L',            'JUG-004',null,            24,  8280, 11500,'UNIDAD','Bebidas',     'Sucursal Luque',  '5%',   60),
    ('Energizante 500 ml',          'ENE-005',null,            18, 10800, 15000,'UNIDAD','Bebidas',     'Depósito central','10%',  48),
    ('Soda 1,5 L',                  'SOD-006','7790001234598', 30,  5040,  7000,'UNIDAD','Bebidas',     'Depósito central','10%', 150),
    ('Tereré listo 1 L',            'TER-007',null,            18,  6120,  8500,'UNIDAD','Bebidas',     'Depósito central','10%',  72),
    ('Arroz 1 kg',                  'ARR-010','7790002234561', 40,  5400,  7500,'UNIDAD','Almacén',     'Depósito central','5%',  200),
    ('Aceite girasol 900 ml',       'ACE-011','7790002234578', 30, 11520, 16000,'UNIDAD','Almacén',     'Depósito central','10%', 110),
    ('Fideo guisero 500 g',         'FID-012',null,            36,  3240,  4500,'UNIDAD','Almacén',     'Depósito central','5%',  180),
    ('Azúcar 1 kg',                 'AZU-013','7790002234585', 40,  4320,  6000,'UNIDAD','Almacén',     'Depósito central','5%',  160),
    ('Yerba mate 1 kg',             'YER-014','7790002234592', 24, 14400, 20000,'UNIDAD','Almacén',     'Depósito central','10%',  90),
    ('Harina 000 1 kg',             'HAR-015',null,            30,  3960,  5500,'UNIDAD','Almacén',     'Depósito central','5%',  140),
    ('Sal fina 500 g',              'SAL-016',null,            24,  2160,  3000,'UNIDAD','Almacén',     'Depósito central','5%',  120),
    ('Lentejas 500 g',              'LEN-017',null,            18,  5760,  8000,'UNIDAD','Almacén',     'Depósito central','5%',   70),
    ('Leche entera 1 L',            'LEC-020','7790003234567',36,  6120,  8500,'UNIDAD','Lácteos',      'Depósito central','5%',  130),
    ('Queso Paraguay 500 g',        'QUE-021',null,            12, 21600, 30000,'UNIDAD','Lácteos',      'Depósito central','5%',   40),
    ('Yogur bebible 1 L',           'YOG-022',null,            18,  8640, 12000,'UNIDAD','Lácteos',      'Sucursal Luque',  '5%',   55),
    ('Manteca 200 g',               'MAN-023',null,            12,  9360, 13000,'UNIDAD','Lácteos',      'Depósito central','5%',   36),
    ('Pan felipe ×6',               'PAN-030',null,            20,  4320,  6000,'PAQUETE','Panificados','Depósito central','5%',   80),
    ('Galleta salada 300 g',        'GAL-031','7790004234561',24,  5040,  7000,'UNIDAD','Panificados',  'Depósito central','10%',  96),
    ('Bizcocho dulce ×12',          'BIZ-032',null,            16,  7200, 10000,'PAQUETE','Panificados','Depósito central','10%',  64),
    ('Chipa almidón ×6',            'CHI-033',null,            20,  6480,  9000,'PAQUETE','Panificados','Sucursal Luque',  '5%',   50),
    ('Detergente 750 ml',           'DET-040','7790005234561',24,  7920, 11000,'UNIDAD','Limpieza',     'Depósito central','10%', 100),
    ('Lavandina 1 L',               'LAV-041',null,            30,  3600,  5000,'UNIDAD','Limpieza',     'Depósito central','10%', 140),
    ('Jabón en polvo 800 g',        'JAB-042','7790005234578',18, 13680, 19000,'UNIDAD','Limpieza',     'Depósito central','10%',  72),
    ('Papel higiénico ×4',          'PAP-043','7790005234585',24,  8640, 12000,'PAQUETE','Limpieza',    'Depósito central','10%', 110),
    ('Esponja de cocina ×3',        'ESP-044',null,            20,  2880,  4000,'PAQUETE','Limpieza',    'Depósito central','10%',  85),
    ('Chocolate barra 90 g',        'CHO-050','7790006234561',30,  5760,  8000,'UNIDAD','Golosinas',    'Depósito central','10%', 120),
    ('Caramelo surtido 500 g',      'CAR-051',null,            18,  7200, 10000,'PAQUETE','Golosinas',   'Depósito central','10%',  66);

  insert into zentra.productos (empresa_id, nombre, sku, barras, minimo, costo, precio, unidad, categoria, deposito, iva)
  select v_empresa, nombre, sku, barras, minimo, costo, precio, unidad, categoria, deposito, iva
    from tmp_prod;

  -- El stock lo mantiene el trigger de movimientos, no un update al producto:
  -- así el historial que muestra la ficha coincide con el número de arriba.
  insert into zentra.movimientos (empresa_id, producto_id, tipo, cantidad, origen, ref, usuario_id, creado_en)
  select v_empresa, p.id, 'ENTRADA', t.stock_inicial, 'Inventario inicial', 'INI-000001', v_usuario,
         now() - interval '35 days'
    from tmp_prod t
    join zentra.productos p on p.empresa_id = v_empresa and p.sku = t.sku;

  -- ---------- compras ----------
  -- Cada compra entra stock de verdad, con su movimiento: una compra que no
  -- mueve el inventario se nota apenas alguien abre la ficha de un producto.
  for v_n in 1..v_compras loop
    select id into v_prov from zentra.proveedores
     where empresa_id = v_empresa
     order by nombre offset ((v_n - 1) % 4) limit 1;

    v_credito := (v_n % 2 = 0);
    v_dia := 28 - (v_n * 4);

    insert into zentra.compras (empresa_id, numero, proveedor_id, fecha, condicion, plazo_dias,
                                estado, factura, timbrado, usuario_id, creado_en)
    values (v_empresa, 'COMP-' || lpad(v_n::text, 6, '0'), v_prov,
            (current_date - v_dia)::date,
            case when v_credito then 'Crédito'::zentra.condicion_pago else 'Contado'::zentra.condicion_pago end,
            case when v_credito then 30 else null end,
            case when v_credito then 'Pendiente'::zentra.estado_compra else 'Pagada'::zentra.estado_compra end,
            '001-001-' || lpad((1000 + v_n)::text, 7, '0'), '16985214',
            v_usuario, now() - (v_dia * interval '1 day'))
    returning id into v_compra;

    -- Cuatro renglones por compra, rotando el catálogo.
    for v_p in
      select p.id, p.nombre, p.unidad, p.costo, p.iva
        from zentra.productos p
       where p.empresa_id = v_empresa
       order by p.sku
       offset ((v_n - 1) * 4) limit 4
    loop
      v_cant := 12 + ((v_n * 7) % 24);

      insert into zentra.compra_lineas (compra_id, producto_id, nombre, unidad, cantidad, costo, iva)
      values (v_compra, v_p.id, v_p.nombre, v_p.unidad, v_cant, v_p.costo, v_p.iva);

      insert into zentra.movimientos (empresa_id, producto_id, tipo, cantidad, origen, ref, usuario_id, creado_en)
      values (v_empresa, v_p.id, 'ENTRADA', v_cant, 'Compra',
              'COMP-' || lpad(v_n::text, 6, '0'), v_usuario,
              now() - (v_dia * interval '1 day'));
    end loop;
  end loop;

  -- ---------- ventas ----------
  -- Cuarenta repartidas en el último mes, para que el gráfico tenga una serie
  -- y no un palo solo. Una de cada cinco a crédito, que es lo que hace que se
  -- vea la condición, el plazo y la cuenta corriente del cliente.
  for v_n in 1..v_ventas loop
    -- La cuenta rara es para que no caiga una venta por dia y nada mas. Con un
    -- reparto parejo el grafico son treinta barras identicas y se ve armado;
    -- asi quedan tres dias sin vender y algunos con dos, que es como vende un
    -- comercio de verdad.
    v_dia := (v_n * 17 + (v_n * v_n) % 7) % 30;
    v_credito := (v_n % 5 = 0);

    select id, nombre, doc into v_cliente
      from zentra.clientes
     where empresa_id = v_empresa
     order by nombre offset ((v_n * 3) % 15) limit 1;

    v_venta := gen_random_uuid();

    insert into zentra.ventas (id, empresa_id, numero, cliente_id, cliente_texto, cliente_doc,
                               fecha, condicion, metodo, plazo_dias, estado, usuario_id, creado_en)
    values (
      v_venta, v_empresa, 'VTA-' || lpad(v_n::text, 6, '0'),
      -- Una de cada siete sin cliente: la venta de mostrador es la más común
      -- y tiene que aparecer, pero nunca a crédito, que el esquema no deja.
      case when v_credito or v_n % 7 <> 0 then v_cliente.id else null end,
      case when v_credito or v_n % 7 <> 0 then v_cliente.nombre else 'Sin nombre' end,
      case when v_credito or v_n % 7 <> 0 then v_cliente.doc    else 'Sin documento' end,
      (current_date - v_dia)::date,
      case when v_credito then 'Crédito'::zentra.condicion_pago else 'Contado'::zentra.condicion_pago end,
      case when v_credito then null
           when v_n % 3 = 0 then 'transferencia'::zentra.metodo_cobro
           else 'efectivo'::zentra.metodo_cobro end,
      case when v_credito then 30 else null end,
      case when v_credito then 'Pendiente'::zentra.estado_venta else 'Cobrada'::zentra.estado_venta end,
      v_usuario, now() - (v_dia * interval '1 day')
    );

    -- Entre dos y cuatro renglones, rotando el catálogo para que ningún
    -- producto quede sin vender nunca y el reporte de más vendidos tenga algo.
    v_lineas := 2 + (v_n % 3);
    v_i := 0;
    for v_p in
      select p.id, p.nombre, p.precio, p.iva
        from zentra.productos p
       where p.empresa_id = v_empresa
       order by p.sku
       offset ((v_n * 5) % 30) limit v_lineas
    loop
      v_cant := 1 + ((v_n + v_i) % 5);

      insert into zentra.venta_lineas (venta_id, producto_id, nombre, cantidad, precio, iva)
      values (v_venta, v_p.id, v_p.nombre, v_cant, v_p.precio, v_p.iva);

      insert into zentra.movimientos (empresa_id, producto_id, tipo, cantidad, origen, ref, usuario_id, creado_en)
      values (v_empresa, v_p.id, 'SALIDA', -v_cant, 'Venta',
              'VTA-' || lpad(v_n::text, 6, '0'), v_usuario,
              now() - (v_dia * interval '1 day'));

      v_i := v_i + 1;
    end loop;
  end loop;

  -- ---------- los tres estados del inventario ----------
  -- Hasta acá el stock es el que salió de las compras y las ventas, y son
  -- todos números sanos. Estos ajustes lo llevan a los tres estados que la
  -- pantalla sabe pintar: normal, bajo mínimo y agotado. Sin esto, el aviso de
  -- stock mínimo no se ve nunca, y es una de las cosas que la ficha promete.
  --
  -- Van como AJUSTE y con motivo, que además es lo que muestra la pantalla de
  -- ajustes: dos funciones por el precio de una.
  insert into zentra.movimientos (empresa_id, producto_id, tipo, cantidad, origen, ref, usuario_id, creado_en)
  select v_empresa, p.id, 'AJUSTE', d.objetivo - p.stock, d.motivo, 'AJU-000001', v_usuario,
         now() - interval '1 day'
    from (values
            ('JUG-004', 8::numeric,  'Inventario físico'),
            ('QUE-021', 5::numeric,  'Merma'),
            ('ENE-005', 0::numeric,  'Inventario físico')
         ) as d(sku, objetivo, motivo)
    join zentra.productos p on p.empresa_id = v_empresa and p.sku = d.sku
   where d.objetivo - p.stock <> 0;

  -- ---------- la numeración ----------
  -- Esto no es prolijidad. `siguiente_numero()` arranca en 1, y arriba se
  -- cargaron ventas y compras numeradas desde 1: sin dejar la numeración
  -- adelantada, la PRIMERA venta que cargue quien revisa la app choca contra
  -- la clave única (empresa_id, numero) y falla. O sea, el revisor entra, toca
  -- "Nueva venta", y lo primero que hace la app es romperse.
  insert into zentra.numeracion (empresa_id, tipo, proximo) values
    (v_empresa, 'venta',  v_ventas  + 1),
    (v_empresa, 'compra', v_compras + 1),
    (v_empresa, 'ajuste', 2)
  on conflict (empresa_id, tipo) do update set proximo = excluded.proximo;

  raise notice 'Cuenta de demostración lista para % (empresa %)', v_email, v_empresa;
end $$;

-- Para ver que quedó cargado.
select e.nombre as empresa, e.plan, e.vence,
       (select count(*) from zentra.productos   p where p.empresa_id = e.id) as productos,
       (select count(*) from zentra.clientes    c where c.empresa_id = e.id) as clientes,
       (select count(*) from zentra.proveedores v where v.empresa_id = e.id) as proveedores,
       (select count(*) from zentra.compras     k where k.empresa_id = e.id) as compras,
       (select count(*) from zentra.ventas      v where v.empresa_id = e.id) as ventas,
       (select count(*) from zentra.productos   p where p.empresa_id = e.id and p.stock <= 0) as agotados,
       (select count(*) from zentra.productos   p where p.empresa_id = e.id and p.stock > 0 and p.stock < p.minimo) as bajo_minimo
  from zentra.empresas e
  join zentra.usuarios u on u.empresa_id = e.id
 where lower(u.email) = lower('revision@neura.com.py');

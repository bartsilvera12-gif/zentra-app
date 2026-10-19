-- ---------- repartir las ventas de demostración entre los clientes ----------
--
-- Arregla sólo el reparto, sin tocar productos, compras ni stock. Recalcula
-- para cada venta a qué cliente va y si es a crédito, a partir de su número.
--
-- Se puede correr las veces que haga falta: el resultado depende del número de
-- la venta y no de cómo esté ahora.

do $$
declare
  v_email   text := 'revision@neura.com.py';
  v_empresa uuid;
  v_total   int;
  v_v       record;
  v_cli     record;
  v_n       int;
  v_credito boolean;
begin
  select u.empresa_id into v_empresa
    from zentra.usuarios u
   where lower(u.email) = lower(v_email)
   limit 1;

  if v_empresa is null then
    raise exception 'No hay ningún usuario con el correo %.', v_email;
  end if;

  select count(*) into v_total from zentra.clientes where empresa_id = v_empresa;
  if v_total = 0 then
    raise exception 'Esa empresa no tiene clientes cargados. Corré 12_datos_demo.sql primero.';
  end if;

  for v_v in
    select id, numero from zentra.ventas where empresa_id = v_empresa order by numero
  loop
    -- El número de la venta es lo que manda: VTA-000007 → 7.
    v_n := coalesce(nullif(regexp_replace(v_v.numero, '\D', '', 'g'), '')::int, 0);
    if v_n = 0 then continue; end if;

    -- 7 es primo con 15, así que pasa por los quince clientes. Con 3 —lo que
    -- había— sólo caía en cinco. Y el crédito cada cuatro, que no engrana con
    -- esa cuenta: con cada cinco, y 15 múltiplo de 5, TODAS las ventas a
    -- crédito terminaban en el mismo cliente.
    v_credito := (v_n % 4 = 0);

    select id, nombre, doc into v_cli
      from zentra.clientes
     where empresa_id = v_empresa
     order by nombre offset ((v_n * 7) % v_total) limit 1;

    update zentra.ventas
       set cliente_id    = case when v_credito or v_n % 7 <> 0 then v_cli.id else null end,
           cliente_texto = case when v_credito or v_n % 7 <> 0 then v_cli.nombre else 'Sin nombre' end,
           cliente_doc   = case when v_credito or v_n % 7 <> 0 then v_cli.doc else 'Sin documento' end,
           condicion     = case when v_credito then 'Crédito'::zentra.condicion_pago
                                else 'Contado'::zentra.condicion_pago end,
           -- Contado cobra con un método y sin plazo; crédito al revés. Es la
           -- restricción `venta_pago_coherente` del esquema.
           metodo        = case when v_credito then null
                                when v_n % 3 = 0 then 'transferencia'::zentra.metodo_cobro
                                else 'efectivo'::zentra.metodo_cobro end,
           plazo_dias    = case when v_credito then 30 else null end,
           estado        = case when v_credito then 'Pendiente'::zentra.estado_venta
                                else 'Cobrada'::zentra.estado_venta end
     where id = v_v.id;
  end loop;

  raise notice 'Ventas repartidas entre % clientes.', v_total;
end $$;

-- Tiene que salir una fila por cliente, con 1 a 3 ventas cada uno.
select c.nombre,
       count(v.id) as ventas,
       count(*) filter (where v.estado = 'Pendiente') as pendientes
  from zentra.clientes c
  left join zentra.ventas v on v.cliente_id = c.id
 where c.empresa_id = (select empresa_id from zentra.usuarios
                        where lower(email) = lower('revision@neura.com.py'))
 group by c.nombre
 order by c.nombre;

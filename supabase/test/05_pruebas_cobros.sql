-- =============================================================================
-- Pruebas de cobros. Correr después de 00/01/02/03/06/07/08 sobre una base limpia.
--
-- Existen porque esto falló con la plata ya cobrada: el pago entró en PagoPar,
-- el aviso llegó, y la función cortó con "column reference vence is ambiguous".
-- Un error así no se ve leyendo el código —parece correcto— y se descubre en el
-- peor momento, que es cuando alguien ya pagó.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off

insert into zentra.empresas (id, nombre)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'Empresa de prueba');

update zentra.planes set precio_mensual = 1000, vendible = true where codigo = 'emprendedor';

insert into zentra.cobros (empresa_id, plan, monto, referencia, pasarela, hash_pedido, estado)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'emprendedor', 1000, 'ref-1', 'pagopar', 'hash-1', 'pendiente');

-- ---------- 1. un pago empuja la fecha y deja el cobro pagado ----------
do $$
declare r record; e record;
begin
  select * into r from zentra.registrar_pago_pasarela('pagopar', 'hash-1', 1000);
  assert r.resultado = 'pagado', 'esperaba pagado, vino ' || coalesce(r.resultado, 'null');
  assert r.vence = (current_date + interval '1 month')::date,
    'el vencimiento tiene que ir un mes adelante, quedó ' || coalesce(r.vence::text, 'null');

  select * into e from zentra.empresas where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  assert e.plan = 'emprendedor', 'la empresa quedó en ' || e.plan;
  assert (select estado from zentra.cobros where hash_pedido = 'hash-1') = 'pagado',
    'el cobro no quedó pagado';
  assert (select count(*) from zentra.pagos where referencia = 'hash-1') = 1,
    'el pago no quedó registrado';
end $$;

-- ---------- 2. el aviso repetido no regala un mes ----------
-- PagoPar reintenta hasta recibir un 200. Sin la clave única, una caída de
-- media hora le regalaría meses a un cliente.
do $$
declare r record; v date;
begin
  select vence into v from zentra.empresas where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  select * into r from zentra.registrar_pago_pasarela('pagopar', 'hash-1', 1000);
  assert r.resultado = 'repetido', 'esperaba repetido, vino ' || coalesce(r.resultado, 'null');
  assert (select vence from zentra.empresas where id = 'aaaaaaaa-0000-4000-8000-000000000001') = v,
    'un aviso repetido empujó la fecha otra vez';
  assert (select count(*) from zentra.pagos where referencia = 'hash-1') = 1,
    'se registró el mismo pago dos veces';
end $$;

-- ---------- 3. un hash que no es de nadie no toca nada ----------
do $$
declare r record;
begin
  select * into r from zentra.registrar_pago_pasarela('pagopar', 'no-existe', 1000);
  assert r.resultado = 'desconocido', 'esperaba desconocido, vino ' || coalesce(r.resultado, 'null');
  assert r.empresa is null, 'devolvió una empresa para un hash ajeno';
end $$;

-- ---------- 4. quien paga tarde no se lleva los días de regalo ----------
do $$
declare r record;
begin
  update zentra.empresas set vence = current_date - 40
   where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  insert into zentra.cobros (empresa_id, plan, monto, referencia, pasarela, hash_pedido, estado)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'emprendedor', 1000, 'ref-2', 'pagopar', 'hash-2', 'pendiente');

  select * into r from zentra.registrar_pago_pasarela('pagopar', 'hash-2', 1000);
  assert r.vence = (current_date + interval '1 month')::date,
    'vencido hace rato: el mes arranca hoy, no desde la fecha vieja. Quedó ' || r.vence::text;
end $$;

-- ---------- 5. quien paga antes no pierde los días que le quedaban ----------
do $$
declare r record;
begin
  update zentra.empresas set vence = current_date + 10
   where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  insert into zentra.cobros (empresa_id, plan, monto, referencia, pasarela, hash_pedido, estado)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'emprendedor', 1000, 'ref-3', 'pagopar', 'hash-3', 'pendiente');

  select * into r from zentra.registrar_pago_pasarela('pagopar', 'hash-3', 1000);
  assert r.vence = (current_date + 10 + interval '1 month')::date,
    'pagar antes tiene que sumar al saldo, no reiniciarlo. Quedó ' || r.vence::text;
end $$;

select 'Cobros: todas las pruebas pasaron.' as resultado;

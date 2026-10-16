-- ---------- precios vigentes ----------
--
-- Los montos del documento de planes del 6 de octubre de 2026:
--
--   Gratis       ₲      0   no se vende
--   Emprendedor  ₲ 49.000   por mes
--   Max          ₲ 89.000   por mes
--
-- `08_precios.sql` los deja en cero y con `vendible = false` a propósito, para
-- que nadie cobre un precio inventado por defecto. Esto los carga.
--
-- Es idempotente: se puede correr de nuevo para cambiar un precio.

-- Gratis no se vende: no tiene sentido mandar a alguien a PagoPar a pagar cero.
-- Es a lo que se cae al vencer, no algo que se compre.
update zentra.planes
   set nombre = 'Gratis', precio_mensual = 0, vendible = false, actualizado_en = now()
 where codigo = 'free';

update zentra.planes
   set precio_mensual = 49000, vendible = true, actualizado_en = now()
 where codigo = 'emprendedor';

update zentra.planes
   set precio_mensual = 89000, vendible = true, actualizado_en = now()
 where codigo = 'max';

-- Para mirar cómo quedó. La página de pago muestra exactamente esto: sólo los
-- `vendible = true` con precio mayor a cero, del más barato al más caro.
select codigo, nombre, precio_mensual, vendible from zentra.planes order by precio_mensual;

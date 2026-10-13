-- ---------- precios de los planes ----------
--
-- El precio vive en la base y no en el código de la página de pago, por una
-- razón de seguridad y no de comodidad: si el monto lo manda el navegador,
-- cualquiera abre las herramientas de desarrollo y se compra un mes de Max por
-- mil guaraníes. El servidor nunca le cree al cliente cuánto hay que cobrar.
--
-- Que esté en una tabla y no en una constante de la función también permite
-- cambiar un precio sin volver a desplegar nada, y que la página de pago
-- muestre exactamente lo que se va a cobrar: un solo lugar, sin posibilidad de
-- que se desencuentren.

create table if not exists zentra.planes (
  codigo          text primary key check (codigo in ('free', 'emprendedor', 'max')),
  nombre          text not null,
  precio_mensual  numeric(14, 2) not null check (precio_mensual >= 0),
  -- Un plan que se deja de vender pero que los clientes actuales conservan.
  vendible        boolean not null default true,
  actualizado_en  timestamptz not null default now()
);

insert into zentra.planes (codigo, nombre, precio_mensual, vendible) values
  ('free',        'Gratis',      0, false),
  ('emprendedor', 'Emprendedor', 0, false),
  ('max',         'Max',         0, false)
on conflict (codigo) do nothing;

-- Los precios arrancan en cero y `vendible` en false a propósito: hay que
-- cargarlos antes de poder cobrar. Un precio por defecto inventado acá sería
-- el que termina cobrándose el día que alguien se olvida de ponerlo.
--
--   update zentra.planes set precio_mensual = 150000, vendible = true
--    where codigo = 'max';

-- Los precios se muestran en la página de pago, así que se leen sin sesión.
-- No hay nada sensible: es la lista de precios.
alter table zentra.planes enable row level security;

drop policy if exists planes_lectura on zentra.planes;
create policy planes_lectura on zentra.planes for select using (true);

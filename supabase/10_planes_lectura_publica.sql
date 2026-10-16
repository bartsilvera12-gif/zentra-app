-- ---------- la lista de precios se tiene que poder leer ----------
--
-- `08_precios.sql` le puso a `zentra.planes` la política de lectura pública y
-- se quedó a mitad de camino: en Postgres hacen falta las **dos** cosas.
--
--   · El GRANT dice si el rol puede tocar la tabla.
--   · La política RLS dice qué filas ve de las que puede tocar.
--
-- Sin el GRANT, la política no llega a correr nunca y PostgREST contesta
-- "permission denied for table planes". El síntoma no es un error a la vista:
-- la app pide los precios, no los puede leer, y muestra los planes sin precio
-- —que es el respaldo previsto para cuando no hay red—. Así que la hoja de
-- planes se ve bien y miente por omisión, en las dos apps.
--
-- `anon` y `authenticated` porque la hoja se puede abrir antes y después de
-- entrar, y la página de pago la lee sin sesión.

grant usage on schema zentra to anon, authenticated;
grant select on zentra.planes to anon, authenticated;

-- Para comprobarlo desde afuera, sin sesión:
--
--   curl -s "$SUPABASE_URL/rest/v1/planes?select=codigo,precio_mensual" \
--        -H "apikey: $ANON_KEY" -H "Accept-Profile: zentra"
--
-- Tiene que devolver las tres filas, no un 42501.
select codigo, nombre, precio_mensual, vendible from zentra.planes order by precio_mensual;

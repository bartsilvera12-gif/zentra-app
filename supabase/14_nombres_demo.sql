-- Los nombres que se ven en las capturas de la App Store.
--
-- La cuenta demo se creó con el nombre "Revision" (que era lo que hacía falta
-- para que Apple pudiera entrar) y con la empresa sin nombre de negocio. Las
-- dos cosas salen en la pantalla de Inicio: el saludo usa el nombre de la
-- persona y el encabezado el de la empresa, asi que las capturas mostraban
-- "Hola, Revision" sobre un comercio sin nombre. Nada de eso es un error de
-- la app, pero en la ficha de la tienda se lee como una app a medio hacer.
--
-- Va por el nombre y no por el id porque el id de la cuenta demo cambia en
-- cada instalacion; el `where` igual acota a la empresa de ese usuario, para
-- no tocar a nadie mas si alguna vez hubiera otro "Revision".

update zentra.empresas e
   set nombre = 'Despensa Doña Lucía'
  from zentra.usuarios u
 where u.empresa_id = e.id
   and u.nombre = 'Revision';

update zentra.usuarios
   set nombre = 'Lucía Benítez'
 where nombre = 'Revision';

-- Para ver que quedo: deberia devolver una fila con los dos nombres nuevos.
select u.nombre as usuario, e.nombre as empresa
  from zentra.usuarios u
  join zentra.empresas e on e.id = u.empresa_id
 where u.nombre = 'Lucía Benítez';

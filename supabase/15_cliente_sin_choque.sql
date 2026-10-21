-- Un cliente que se llamaba igual que el negocio.
--
-- El seed le ponia "Despensa Doña Lucía" a la empresa y tambien a uno de sus
-- quince clientes, con "Lucía Benítez" de contacto —la misma persona que
-- ahora es la usuaria de la cuenta—. En la pantalla de Clientes eso se lee
-- como que el negocio se tiene a si mismo de cliente, y es una de las
-- capturas que miran en la revision de la App Store.
--
-- Cambia el cliente y no la empresa porque la empresa es la identidad de la
-- cuenta demo: es el nombre que sale en las facturas.
--
-- El documento alcanza para identificarlo y no cambia; el `where` lo acota
-- igual a la empresa de la demo para no tocar otra cuenta que use ese RUC.

update zentra.clientes c
   set nombre   = 'Despensa Yvoty',
       contacto = 'Marta Giménez'
  from zentra.usuarios u
 where u.empresa_id = c.empresa_id
   and u.nombre = 'Lucía Benítez'
   and c.doc = '80012345-6';

-- Deberia devolver una fila con el nombre nuevo, y ninguna con el viejo.
select nombre, doc, contacto
  from zentra.clientes
 where doc = '80012345-6';

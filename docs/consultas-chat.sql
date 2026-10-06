-- Quién ve qué conversaciones, y por qué.
--
-- Corré las consultas en orden. La primera dice dónde está cada tabla; recién
-- con eso se puede escribir la segunda sin adivinar nombres de schema, que es
-- lo que falla.
--
-- Lo que decide la visibilidad es el ROL, no la cola:
--   admin       todas las conversaciones de la empresa
--   supervisor  las de los agentes a su cargo
--   agente      las suyas
-- Las colas no entran en esa cuenta.


-- 1) Dónde vive cada tabla. Esta corre siempre, en cualquier proyecto.
select table_name, table_schema
  from information_schema.tables
 where table_name in ('usuarios', 'empresas', 'chat_agents', 'chat_empresa_operator_roles')
 order by table_name, table_schema;


-- 2) El rol y las colas de cada usuario.
--
--    Reemplazá CATALOGO por el schema donde la consulta 1 encontró `usuarios`,
--    y DATOS por donde encontró `chat_agents`. Suelen ser distintos: los
--    usuarios son del catálogo, compartido, y el chat es de cada empresa.
--
--    `rol_omnicanal = admin` con `colas = 0` es lo normal para quien
--    administra: ve todo en el ERP por su rol, sin estar en ninguna cola.
select u.nombre,
       u.email,
       coalesce(r.role, '(sin rol)') as rol_omnicanal,
       count(a.id)                   as colas
  from CATALOGO.usuarios u
  left join DATOS.chat_empresa_operator_roles r
         on r.usuario_id = u.id
        and r.empresa_id = u.empresa_id
  left join DATOS.chat_agents a
         on a.usuario_id = u.id
        and a.empresa_id = u.empresa_id
 group by u.nombre, u.email, r.role
 order by rol_omnicanal, u.nombre;


-- 3) Si la 2 no encuentra `chat_empresa_operator_roles`, esa tabla puede no
--    existir todavía en ese schema. Entonces nadie tiene rol cargado y el ERP
--    cae a su regla de respaldo: quien tiene fila en `chat_agents` ve lo suyo.
--    Esto lista quién tiene esa fila:
select u.nombre, u.email, count(a.id) as colas
  from CATALOGO.usuarios u
  join DATOS.chat_agents a
    on a.usuario_id = u.id
   and a.empresa_id = u.empresa_id
 group by u.nombre, u.email
 order by u.nombre;

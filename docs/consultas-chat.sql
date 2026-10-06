-- Quién ve qué conversaciones, y por qué.
--
-- Corré esto en el SQL de Supabase. No tiene marcadores: los nombres de schema
-- están escritos. Si tu empresa usa otro schema de datos, cambiá `neura` por el
-- tuyo (lo dice la consulta 1).
--
-- Lo que decide la visibilidad es el ROL, no la cola:
--   admin       todas las conversaciones de la empresa
--   supervisor  las de los agentes a su cargo
--   agente      las suyas
-- Las colas no entran en esa cuenta.


-- 1) Qué schema de datos usa cada empresa. De acá sale el nombre que va abajo.
select nombre_empresa, data_schema
  from zentra_erp.empresas
 order by nombre_empresa;


-- 2) El rol y las colas de cada usuario.
--
--    `rol_omnicanal = admin` con `colas = 0` es lo normal para quien administra:
--    ve todo en el ERP por su rol, sin estar en ninguna cola.
select u.nombre,
       u.email,
       coalesce(r.role, '(sin rol)') as rol_omnicanal,
       count(a.id)                   as colas
  from zentra_erp.usuarios u
  left join neura.chat_empresa_operator_roles r
         on r.usuario_id = u.id
        and r.empresa_id = u.empresa_id
  left join neura.chat_agents a
         on a.usuario_id = u.id
        and a.empresa_id = u.empresa_id
 group by u.nombre, u.email, r.role
 order by rol_omnicanal, u.nombre;


-- 3) Si la consulta 2 falla con "relation ... does not exist", las tablas de
--    chat de esa empresa están en otro schema. Esto dice en cuáles están:
select table_schema, table_name
  from information_schema.tables
 where table_name in ('chat_agents', 'chat_empresa_operator_roles')
 order by table_schema, table_name;

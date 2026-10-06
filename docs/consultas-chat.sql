-- Quién ve qué conversaciones, y por qué.
--
-- Verificado contra la base de Neura Sistemas: el catálogo de usuarios está en
-- `zentra` y las tablas de chat en `neura`, el schema de datos de esa empresa.
-- Para otra empresa, cambiá `neura` por su `data_schema` (consulta 3).
--
-- Lo que decide la visibilidad es el ROL, no la cola:
--   admin       todas las conversaciones de la empresa
--   supervisor  las de los agentes a su cargo
--   agente      las suyas
--
-- Los datos lo confirman: en Neura el admin y los dos supervisores tienen CERO
-- colas y ven conversaciones igual. Los únicos con cola son los agentes.


-- 1) Quién es quién, con su rol y sus colas.
select u.nombre,
       u.email,
       coalesce(r.role, '(sin rol)') as rol_omnicanal,
       count(a.id)                   as colas
  from zentra.usuarios u
  left join neura.chat_empresa_operator_roles r
         on r.usuario_id = u.id
        and r.empresa_id = u.empresa_id
  left join neura.chat_agents a
         on a.usuario_id = u.id
        and a.empresa_id = u.empresa_id
 group by u.nombre, u.email, r.role
 order by rol_omnicanal, u.nombre;


-- 2) Sin nombres, por si el catálogo está en otro lado. Corre sólo con el
--    schema de la empresa.
select coalesce(r.usuario_id::text, a.usuario_id::text) as usuario_id,
       coalesce(r.role, '(sin rol)')                    as rol_omnicanal,
       count(a.id)                                      as colas
  from neura.chat_empresa_operator_roles r
  full outer join neura.chat_agents a
    on a.usuario_id = r.usuario_id
   and a.empresa_id = r.empresa_id
 group by r.usuario_id, a.usuario_id, r.role
 order by rol_omnicanal;


-- 3) El schema de datos de cada empresa, para adaptar las de arriba.
select nombre_empresa, data_schema
  from zentra.empresas
 order by nombre_empresa;


-- 4) Dónde vive cada tabla, por si algo de lo de arriba no existe. Se excluyen
--    los schemas de empresa —son decenas— para que quede sólo el catálogo.
select table_name, table_schema
  from information_schema.tables
 where table_name in ('usuarios', 'empresas')
   and table_schema not in (
     select table_schema from information_schema.tables where table_name = 'chat_agents'
   )
 order by table_name, table_schema;

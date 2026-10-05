-- Las mismas consultas de API-ERP-CONSULTAS.md, pero contra el ERP de verdad y
-- con los valores puestos, para poder correrlas a mano y ver qué devuelven.
--
--   psql "LA_CADENA" -f docs/consultas-erp-reales.sql
--
-- O pegándolas de a una en el editor. SOLO LECTURA: no escribe nada.
--
-- En el código de la API estos valores van como parámetros, no interpolados.

\set EMP '''058efef5-e1b5-4cab-8a65-238f81823917'''
\set ERP distribuidorajmerp

\echo ''
\echo '=== valores que usa el ERP (para ajustar los case) ==='
select estado, tipo_venta, count(*) as cuantas
  from :ERP.ventas where empresa_id = :EMP
 group by estado, tipo_venta order by cuantas desc;

select distinct metodo_pago from :ERP.ventas where empresa_id = :EMP;
select distinct tipo_iva    from :ERP.ventas_items where empresa_id = :EMP;

\echo ''
\echo '=== GET /clientes ==='
select c.id::text,
       coalesce(nullif(btrim(c.nombre), ''), nullif(btrim(c.razon_social), ''),
                nullif(btrim(c.empresa), ''), c.nombre_contacto, '(sin nombre)') as nombre,
       coalesce(nullif(btrim(c.ruc_factura), ''), nullif(btrim(c.ruc), ''), c.documento) as doc,
       coalesce(nullif(btrim(c.telefono), ''), c.telefono_secundario) as tel,
       c.ciudad as zona,
       case when c.baja_operativa_at is null then 'Activo' else 'Inactivo' end as estado,
       coalesce(s.saldo, 0)::bigint as saldo,
       coalesce(s.compras, 0)::int  as compras
  from :ERP.clientes c
  left join lateral (
    select round(sum(v.total) filter (where v.estado !~* 'cobrad|pagad|cerrad|complet')) as saldo,
           count(*) as compras
      from :ERP.ventas v
     where v.cliente_id = c.id and v.empresa_id = c.empresa_id and v.anulada_at is null
  ) s on true
 where c.empresa_id = :EMP and c.deleted_at is null
 order by nombre
 limit 10;

\echo ''
\echo '=== GET /productos ==='
select p.id::text, p.nombre, p.sku,
       round(coalesce(p.costo_promedio, 0))::bigint as costo,
       round(coalesce(p.precio_venta, 0))::bigint   as precio,
       case when p.tipo_iva ~* 'exent|exonerad' then 'Exenta'
            when (regexp_match(p.tipo_iva, '([0-9]+)'))[1] = '10' then '10%'
            when (regexp_match(p.tipo_iva, '([0-9]+)'))[1] = '5'  then '5%'
            else '10%' end as iva,
       coalesce(p.stock_actual, 0) as stock
  from :ERP.productos p
 where p.empresa_id = :EMP
   and p.activo is not false and p.es_vendible is not false
 order by p.nombre
 limit 10;

\echo ''
\echo '=== GET /ventas ==='
select v.id::text,
       coalesce(nullif(btrim(v.numero_control), ''), left(v.id::text, 8)) as numero,
       coalesce(v.fecha, v.created_at)::date as fecha,
       coalesce(nullif(btrim(c.nombre), ''), nullif(btrim(c.razon_social), ''), 'Sin nombre') as cliente,
       case when v.tipo_venta ~* 'cred|cuota'
            then 'Credito - ' || coalesce(v.plazo_dias::text, '?') || ' dias'
            else 'Contado - ' || coalesce(v.metodo_pago, 'efectivo') end as pago,
       case when v.estado ~* 'cobrad|pagad|cerrad|complet' then 'Cobrada' else 'Pendiente' end as estado,
       round(coalesce(v.total, 0))::bigint as total,
       (select count(*) from :ERP.ventas_items i where i.venta_id = v.id) as lineas
  from :ERP.ventas v
  left join :ERP.clientes c on c.id = v.cliente_id
 where v.empresa_id = :EMP and v.anulada_at is null
 order by coalesce(v.fecha, v.created_at) desc
 limit 10;

# Las consultas de cada endpoint

El SQL concreto detrás de [`API-ERP.md`](API-ERP.md), escrito contra las tablas
reales del ERP de Distribuidora JM y **probado**: se corren contra una réplica de
su estructura y devuelven lo que la app espera.

Dos cosas que valen para todas:

- **`:empresa` sale del token, nunca del cuerpo del pedido.** Si viniera de
  afuera, bastaría cambiarlo para leer otra empresa.
- **El schema depende de la empresa**: `empresas.data_schema`, y cuando está
  vacío es el compartido (`distribuidorajmerp`). El ERP ya resuelve eso con su
  `resolveEmpresaDataSchema`; abajo va como `erp.` para no repetirlo.

---

## `GET /perfil`

```sql
select u.auth_user_id::text as id,
       coalesce(nullif(btrim(u.nombre), ''), split_part(u.email, '@', 1)) as nombre,
       case when u.rol ~* '^admin'    then 'ADMIN'
            when u.rol ~* 'vendedor'  then 'VENDEDOR'
            when u.rol ~* 'caj'       then 'CAJA'
            else upper(replace(coalesce(nullif(btrim(u.rol), ''), 'VENDEDOR'), '_', ' ')) end as rol,
       e.nombre_empresa as empresa
  from erp.usuarios u
  join erp.empresas e on e.id = u.empresa_id
 where u.auth_user_id = :auth_user_id
   and coalesce(u.activo, true) is not false;
```

`id` es el **`auth_user_id`**, no el id de la fila: la app identifica a la
persona por el id de su sesión de Supabase, y son dos uuid distintos.

El rol se limpia porque se muestra tal cual en el encabezado: el ERP guarda
`vendedor_movil`, que en pantalla queda mal.

Sin fila → `401`. Significa que el token es válido pero esa persona no tiene
perfil en esta empresa.

---

## `GET /clientes?q=&estado=`

```sql
select c.id::text,
       coalesce(nullif(btrim(c.nombre), ''), nullif(btrim(c.razon_social), ''),
                nullif(btrim(c.empresa), ''), c.nombre_contacto, '(sin nombre)') as nombre,
       coalesce(nullif(btrim(c.ruc_factura), ''), nullif(btrim(c.ruc), ''), c.documento) as doc,
       c.nombre_contacto as contacto,
       coalesce(nullif(btrim(c.telefono), ''), c.telefono_secundario) as tel,
       coalesce(nullif(btrim(c.email), ''), c.email_secundario) as email,
       c.ciudad as zona,
       c.direccion,
       coalesce(nullif(btrim(c.tipo_cliente), ''), 'Mayorista') as lista,
       case when c.baja_operativa_at is null then 'Activo' else 'Inactivo' end as estado,
       coalesce(s.saldo, 0)::bigint as saldo,
       coalesce(s.compras, 0)::int  as compras,
       to_char(c.created_at, 'TMmon YYYY') as desde
  from erp.clientes c
  left join lateral (
    select round(sum(v.total) filter (where v.estado !~* 'cobrad|pagad|cerrad|complet')) as saldo,
           count(*) as compras
      from erp.ventas v
     where v.cliente_id = c.id and v.empresa_id = c.empresa_id and v.anulada_at is null
  ) s on true
 where c.empresa_id = :empresa
   and c.deleted_at is null
   and (:q is null or c.nombre ilike '%'||:q||'%' or c.razon_social ilike '%'||:q||'%'
        or c.ruc ilike '%'||:q||'%' or c.ruc_factura ilike '%'||:q||'%')
 order by nombre
 limit 200;
```

El `left join lateral` calcula el saldo pendiente y cuántas compras hizo. Si con
muchos clientes se pone lento, conviene materializarlo; con unos cientos no.

**`deleted_at` no se devuelve nunca**: es borrado lógico. `baja_operativa_at` sí
aparece, como `Inactivo`.

---

## `POST /clientes`

```sql
insert into erp.clientes (empresa_id, nombre, ruc_factura, nombre_contacto,
                          telefono, email, ciudad, direccion, tipo_cliente, created_at)
values (:empresa, :nombre, :doc, :contacto, :tel, :email, :zona, :direccion,
        coalesce(:lista, 'Mayorista'), now())
returning id;
```

Y devolver el cliente con la consulta de arriba filtrando por ese `id`, para que
salga con el mismo formato.

---

## `GET /productos?q=&vendibles=`

```sql
select p.id::text, p.nombre, p.sku,
       p.codigo_barras as barras,
       coalesce(nullif(btrim(p.unidad_medida), ''), 'UN') as unidad,
       round(coalesce(p.costo_promedio, 0))::bigint as costo,
       round(coalesce(p.precio_venta, 0))::bigint    as precio,
       case when p.tipo_iva ~* 'exent|exonerad'                then 'Exenta'
            when (regexp_match(p.tipo_iva, '([0-9]+)'))[1] = '10' then '10%'
            when (regexp_match(p.tipo_iva, '([0-9]+)'))[1] = '5'  then '5%'
            else '10%' end as iva,
       coalesce(p.stock_actual, 0) as stock,
       coalesce(p.stock_minimo, 0) as minimo,
       coalesce(nullif(btrim(p.metodo_valuacion), ''), 'CPP') as metodo
  from erp.productos p
 where p.empresa_id = :empresa
   and p.activo is not false
   and (:vendibles is not true or p.es_vendible is not false)
   and (:q is null or p.nombre ilike '%'||:q||'%' or p.sku ilike '%'||:q||'%'
        or p.codigo_barras = :q)
 order by p.nombre
 limit 300;
```

Los montos salen **enteros**: el guaraní no tiene centavos, y la app los trata
como enteros en todos lados.

El IVA se decide extrayendo el número. Confirmado que el ERP guarda `10%` y `5%`,
pero el `case` tolera otras formas. Ante la duda cae en 10%: equivocarse para
abajo subfacturaría.

---

## `GET /ventas?desde=&hasta=&q=&estado=`

```sql
select v.id::text,
       coalesce(nullif(btrim(v.numero_control), ''), left(v.id::text, 8)) as numero,
       coalesce(v.fecha, v.created_at)::date as fecha,
       v.cliente_id::text as "clienteId",
       coalesce(nullif(btrim(c.nombre), ''), nullif(btrim(c.razon_social), ''), 'Sin nombre') as cliente,
       coalesce(nullif(btrim(c.ruc_factura), ''), nullif(btrim(c.ruc), ''), 'Sin documento') as doc,
       case when v.tipo_venta ~* 'cred|cuota'
            then 'Crédito · ' || coalesce(v.plazo_dias::text, '?') || ' días'
            else 'Contado · ' || coalesce(v.metodo_pago, 'efectivo') end as pago,
       case when v.estado ~* 'cobrad|pagad|cerrad|complet' then 'Cobrada' else 'Pendiente' end as estado,
       coalesce((
         select json_agg(json_build_object(
                  'nombre',   coalesce(nullif(btrim(i.producto_nombre), ''), i.sku, '(sin nombre)'),
                  'cantidad', coalesce(i.cantidad_total_base, i.cantidad, 0),
                  'precio',   round(coalesce(i.precio_venta, 0))::bigint,
                  'iva',      case when i.tipo_iva ~* 'exent' then 'Exenta'
                                   when (regexp_match(i.tipo_iva, '([0-9]+)'))[1] = '5' then '5%'
                                   else '10%' end)
                order by i.producto_nombre)
           from erp.ventas_items i where i.venta_id = v.id
       ), '[]'::json) as lineas
  from erp.ventas v
  left join erp.clientes c on c.id = v.cliente_id
 where v.empresa_id = :empresa
   and v.anulada_at is null
   and coalesce(v.fecha, v.created_at)::date between :desde and :hasta
 order by coalesce(v.fecha, v.created_at) desc
 limit 300;
```

**Las anuladas no se devuelven**: sumarían en los totales del día.

El nombre del producto sale de `producto_nombre`, que el ERP copia en la línea, y
no de un join con `productos`. Así una factura vieja sigue diciendo lo que decía
aunque después le cambien el nombre, y no se pierden las líneas de productos
borrados.

> **Esto hay que confirmarlo**: asumí que `ventas.estado` usa palabras como
> `cobrada`/`pendiente` y `tipo_venta` como `contado`/`credito`. Corré
> `select distinct estado, tipo_venta from distribuidorajmerp.ventas;` y ajustá
> los `case` si no coinciden. Lo que no puede pasar es que una pendiente aparezca
> como cobrada: eso esconde plata sin cobrar.

`GET /ventas/:id` es lo mismo con `and v.id = :id`.

---

## `POST /ventas` — el que importa

No es una consulta: es una transacción. En orden.

### 1. Idempotencia, antes que nada

```sql
select id from erp.ventas
 where empresa_id = :empresa and idempotency_key = :clave;
```

Si hay fila → devolver **esa** venta con `200` y terminar. No registrar otra.

Es lo que evita que un vendedor que perdió señal y volvió a tocar el botón genere
dos comprobantes y dos asientos contables.

### 2. Validar, antes de escribir

```sql
-- Crédito exige cliente identificado: es la regla del ERP.
-- Contado exige método de cobro; crédito exige plazo.
-- Y los productos tienen que ser de esta empresa:
select count(*) from erp.productos
 where empresa_id = :empresa and id = any(:prod_ids) and activo is not false;
```

Si no cuadra → `422` con un mensaje que se le pueda mostrar a un vendedor.

### 3. Crear la venta con la lógica del ERP

Acá **no hay un insert que yo pueda escribir**, y es justamente la razón de que
esto sea una API y no una vista: el ERP tiene que hacer lo suyo — numeración,
caja, factura, nota de remisión, asiento contable. Lo que el `POST` tiene que
hacer es llamar a **la misma función que usa el ERP cuando una venta se carga
desde su propia pantalla**.

Si se reimplementa el insert acá, el día que cambien esa lógica la app sigue
haciendo lo viejo en silencio, y se descubre por un asiento que no cierra.

Lo único específico de la app: guardar `idempotency_key = :clave` en la venta.

### 4. Devolver la venta creada

Con la consulta de `GET /ventas/:id`, para que salga en el mismo formato, y con
el número que asignó el ERP.

---

## `GET /set/:doc`

Consulta de RUC en la SET. El ERP ya la tiene resuelta en `lib/sifen/`; se reusa
eso. Devuelve `null` si no existe.

---

## Probarlas

```bash
psql "LA_CADENA_DE_CONEXION" -f docs/consultas-erp-prueba.sql
```

Arma una réplica de la estructura con datos inventados y corre las cuatro
consultas. No toca el ERP.

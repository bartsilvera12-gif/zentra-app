# La API que el ERP tiene que exponer

Para que la app **registre ventas** en un ERP existente, y no sólo lea.

Leer no necesita esto: con vistas sobre las tablas del ERP alcanza, sin servidor
ni código (ver [`supabase/erp/`](../supabase/erp/)). Escribir sí, y la razón está
en las columnas de `ventas` del propio ERP:

```
idempotency_key, factura_id, caja_id, reparto_id,
estado_contable, asiento_contable_id, contab_error, nota_remision_numero
```

Registrar una venta ahí no es insertar una fila: es numeración, caja, factura,
nota de remisión y asiento contable. Esa lógica vive en el código del ERP.
Duplicarla en la app —o en disparadores SQL— la haría divergir en silencio el
día que la cambien de aquel lado, y de eso uno se entera por un asiento que no
cierra.

**Esta API se implementa en el repositorio del ERP.** Este documento es el
contrato: lo que la app ya sabe pedir y entender, verificado por
`npm run test:api` contra una API simulada.

---

## Cómo se autentica

No hay usuarios nuevos ni contraseñas nuevas. La app entra con **Supabase Auth**
—donde ya están los usuarios del ERP— y manda ese token en cada pedido:

```
Authorization: Bearer <access_token de Supabase>
```

La API lo valida contra el mismo proyecto de Supabase y de ahí saca quién es y
de qué empresa. **La app nunca manda el `empresa_id`**: lo decide el servidor a
partir del token. Si lo mandara, bastaría con cambiarlo para leer otra empresa.

---

## Los endpoints

Base: `NEXT_PUBLIC_API_URL`. Todo JSON.

### `GET /perfil`

Quién es el que entró.

```json
{ "id": "uuid", "nombre": "Ulises Gómez", "rol": "VENDEDOR", "empresa": "Distribuidora JM" }
```

### `GET /clientes?q=&estado=`

```json
[{
  "id": "uuid", "nombre": "Supermercado Aurora SA", "doc": "80012345-6",
  "contacto": "Lucía Benítez", "tel": "0981111111", "email": null,
  "zona": "Asunción", "direccion": null, "lista": "Mayorista",
  "estado": "Activo", "saldo": 450000, "compras": 12, "desde": "mar 2024"
}]
```

`saldo` en guaraníes, entero. `compras` es cuántas hizo.

De las columnas del ERP: `nombre` sale del primero con contenido entre `nombre`,
`razon_social`, `empresa` y `nombre_contacto`; `doc` prefiere `ruc_factura` y cae
a `ruc` y `documento`; `estado` es `Inactivo` si tiene `baja_operativa_at`; y las
filas con `deleted_at` no se devuelven.

### `GET /clientes/:id` · `POST /clientes`

El POST recibe los mismos campos y devuelve el cliente creado.

### `GET /set/:doc`

Consulta de RUC en la SET. `null` si no existe.

```json
{ "razonSocial": "SUPERMERCADO AURORA SA", "activo": true }
```

### `GET /productos?q=&filtro=&vendibles=`

```json
[{
  "id": "uuid", "nombre": "Aceite Girasol 900ml", "sku": "ACE-900",
  "barras": "7790...", "unidad": "UN", "categoria": "Almacén",
  "costo": 7800, "precio": 11500, "iva": "10%",
  "stock": 240, "minimo": 50, "metodo": "CPP"
}]
```

**`iva` tiene que ser exactamente `"10%"`, `"5%"` o `"Exenta"`.** El ERP guarda
`10%` y `5%` en `tipo_iva`, así que la traducción es directa.

**`precio` incluye el IVA**, que es como se factura en Paraguay. Y los montos van
**enteros**: el guaraní no tiene centavos.

Con `vendibles=true` devolver sólo lo que se puede vender (`es_vendible`).

### `GET /ventas?desde=&hasta=&q=&estado=`

```json
[{
  "id": "uuid", "numero": "VTA-000123", "fecha": "2026-10-05",
  "clienteId": "uuid", "cliente": "Supermercado Aurora SA", "doc": "80012345-6",
  "pago": "Contado · efectivo", "estado": "Cobrada",
  "lineas": [{ "nombre": "Aceite Girasol 900ml", "cantidad": 2, "precio": 11500, "iva": "10%" }]
}]
```

`estado` es `"Cobrada"` o `"Pendiente"`, nada más. Lo que el ERP no dé por
cerrado conviene que sea `Pendiente`: una pendiente mostrada como cobrada esconde
plata sin cobrar.

Las anuladas no se devuelven.

### `POST /ventas` — el que importa

```json
{
  "clienteId": "uuid o null",
  "lineas": [{ "prodId": "uuid", "cantidad": 2, "precio": 11500, "iva": "10%" }],
  "pago": { "tipo": "contado", "metodo": "efectivo" },
  "moneda": "PYG"
}
```

`pago` es una de dos formas:

```json
{ "tipo": "contado", "metodo": "efectivo" | "transferencia" | "cheque" }
{ "tipo": "credito", "plazoDias": 30 }
```

Devuelve la venta creada, con el mismo formato que `GET /ventas/:id`, y **el
número que asignó el ERP**. La app nunca inventa un número de comprobante.

#### La idempotencia no es opcional

Cada intento viaja con:

```
Idempotency-Key: <uuid distinto por intento>
```

Un vendedor en la calle manda la venta, pierde señal antes de ver la respuesta, y
vuelve a tocar el botón. **Sin esto la venta se registra dos veces**, con dos
números de comprobante y dos asientos contables.

Lo que la API tiene que hacer:

- Clave nueva → registrar y devolver `201`.
- Clave ya vista → devolver **la misma venta** y `200`. No crear otra, no fallar.
- Guardarla con la venta; el ERP ya tiene `ventas.idempotency_key` para eso.

La app genera una clave por intento y la reusa si reintenta. Dos ventas distintas
llevan claves distintas: eso está probado.

#### Reglas que la API tiene que hacer cumplir

No alcanza con que la app se porte bien:

- **Crédito exige cliente identificado.** Una venta sin nombre sólo puede ser al
  contado.
- **Contado exige método de cobro; crédito exige plazo.**
- **El stock y el número los decide el ERP**, nunca lo que mande la app.
- **El `empresa_id` sale del token**, nunca del cuerpo.

### `GET /ventas/:id`

La venta con sus líneas, mismo formato.

---

## Errores

Status HTTP de verdad: `401` sin sesión o con token vencido, `403` sin permiso,
`404` lo que no existe, `422` lo que no cumple una regla, `409` un conflicto de
idempotencia irreconciliable.

El cuerpo, con un mensaje que se le pueda mostrar a un vendedor:

```json
{ "error": "Una venta a crédito necesita un cliente identificado." }
```

La app muestra ese texto tal cual. Un "Internal Server Error" en pantalla no le
dice nada a nadie.

---

## Lo que NO hace falta por ahora

Quedó sin implementar a propósito, y cada uno avisa qué falta en vez de devolver
datos inventados: proveedores, compras, ajustes de inventario, movimientos,
conversaciones, reportes y notificaciones.

Si alguno hace falta después, se agrega sin tocar las pantallas.

---

## Del lado de la app ya está hecho

`src/lib/repo/http.ts` implementa todo esto. Para apuntar ahí:

```
NEXT_PUBLIC_BACKEND=http
NEXT_PUBLIC_API_URL=https://api.ejemplo.com/movil
```

Y las pantallas no se tocan: leen de `repo`, que ya resuelve a esta
implementación.

```bash
npm run test:api
```

Levanta una API simulada que responde como dice este documento y verifica que la
app mande y entienda lo correcto — incluida la idempotencia.

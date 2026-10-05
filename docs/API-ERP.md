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

## Antes de escribir nada: el ERP ya la tiene

Mirando su código, los endpoints existen:

| Lo que la app necesita | Lo que el ERP ya expone |
|---|---|
| perfil | lo resuelve `getUserAndEmpresa` en cada ruta |
| listar y crear clientes | `GET` y `POST /api/clientes`, `GET /api/clientes/[id]` |
| listar productos | `GET /api/productos`, `GET /api/productos/search` |
| listar ventas | `GET /api/ventas` |
| **crear una venta** | `POST /api/ventas/create` |

Y `POST /api/ventas/create` ya hace lo que importa: transacción, caja, reparto,
permisos y numeración, con `createVentaTransaccionalPg`.

**Y acepta `Authorization: Bearer`**, no sólo cookies: su
`resolveApiAuthContext` saca el token de la cabecera. O sea que la app puede
llamarlo con el token de Supabase, igual que este documento describe.

Entonces conviene **apuntar la app a esos endpoints** en vez de escribir una API
nueva. Lo que cambia respecto de lo de abajo:

- Las rutas son las suyas (`/api/ventas/create` en vez de `/ventas`).
- Las respuestas vienen envueltas: `{ "success": true, "data": … }`.
- Los datos salen **crudos de sus tablas** (`select *`), así que la traducción de
  nombres de columna la hace la app en vez del servidor. Es el mismo mapeo que
  está en [`API-ERP-CONSULTAS.md`](API-ERP-CONSULTAS.md), pero en TypeScript.
- `tipo_iva` en sus líneas de venta es `"EXENTA" | "5%" | "10%"` — en mayúscula,
  mientras la app usa `"Exenta"`.

### Lo único que falta del lado del ERP: CORS

No encontré cabeceras `Access-Control-Allow-Origin` en ninguna parte. Sin eso el
navegador bloquea los pedidos de la app, que viene de otro origen — y dentro del
APK el origen es `https://localhost`, no un dominio.

Es un cambio chico, pero **sin él nada de esto funciona**, y el error que se ve
es confuso: parece un problema de red y es una política del navegador.

### Verificado contra dos ERPs distintos (JM y Sistemas Propio)

Los dos tienen los cinco endpoints que la app usa, pero **los archivos
divergieron**: `productos` difiere en 343 líneas, `ventas` en 126,
`ventas/create` en 103. Igual el contrato que la app necesita es el mismo en los
dos. Lo que encontré comparándolos:

- **Los totales de la venta van arriba y son obligatorios.** Los dos hacen
  `Number(o.subtotal)` y cortan con `"Totales inválidos."` si sale `NaN`. Yo no
  los mandaba: **ninguna venta habría entrado, en ningún ERP.**
- **No son decorativos**: son los que el ERP guarda, así que tienen que ser la
  suma exacta de las líneas o la venta queda con un total que no cierra con lo
  que la compone.
- **La respuesta viene envuelta dos veces**: `{ success, data: { venta } }`. Yo
  leía `data` y esperaba la venta ahí.
- **La venta recién creada no trae `estado` ni cliente.** Se deriva del tipo: de
  contado ya está cobrada, a crédito queda pendiente.
- JM pide más cosas que Sistemas Propio (lista de precios, caja, reparto,
  permiso para vender a crédito), pero todo con valor por defecto o resuelto
  solo: JM abre la caja si hace falta. Nada de eso hay que mandarlo.
- **Las columnas de las tablas varían por tenant.** El propio ERP lo dice en un
  comentario: `es_tecnico` existía en 2 de 72 schemas, y pedir una columna que
  falta hace fallar todo el request con 400. Por eso ese endpoint hace `select *`
  — y por eso la app arma cada campo con varias columnas candidatas en vez de
  una sola.

### El perfil no se llama `/perfil`

Yo había escrito `/perfil`. **No existe.** El endpoint real es
`GET /api/usuarios/me`, y tiene dos particularidades que no comparte con los
demás:

- Contesta `{ "usuario": {...} }`, **no** el `{ success, data }` del resto.
- **No devuelve el nombre de la empresa**, sólo su `data_schema`.

El nombre de la empresa se toma del directorio, que ya lo sabe: es el que el
usuario eligió al escribir su código. Mostrar el `data_schema` ahí —`neura`,
`zentra_jm`— sería mostrarle jerga de base de datos a un vendedor.

### Los valores reales, verificados contra la base de JM

No los supuse: salieron de consultar las tablas del ERP de Distribuidora JM.

| Columna | Lo que hay de verdad | Lo que muestra la app |
|---|---|---|
| `ventas.estado` | `completada` | `Cobrada` |
| `ventas.tipo_venta` | `CONTADO` (mayúscula) | `Contado` |
| `ventas.metodo_pago` | `efectivo` (minúscula) | `Contado · efectivo` |
| `productos.tipo_iva` | `5%`, `10%` | `5%`, `10%` |
| `ventas_items.tipo_iva` | `EXENTA`, `5%`, `10%` | `Exenta`, `5%`, `10%` |
| `ventas.moneda` | `GS` | guaraníes |

Tres de esos seis rompen si se escriben como uno esperaría: el ERP llama `GS` a
los guaraníes y no `PYG`, pone `tipo_venta` en mayúscula y `metodo_pago` en
minúscula, y escribe `EXENTA` en las líneas pero `Exenta` no existe. Están
traducidos en `src/lib/repo/http.ts` y cada traducción tiene su prueba en
`test/api-erp.mjs`.

Un cuidado con el IVA: ante un texto que no reconozco asumo **10%**, el más alto.
Equivocarse para abajo subfactura, y eso es un problema con la SET, no un bug.

---

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

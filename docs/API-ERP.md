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

### Cada endpoint envuelve distinto, y no hay regla

Esto costó un error en el celular (`.map is not a function`):

| Endpoint | Dónde viene la lista |
|---|---|
| `/clientes` | `data` pelado |
| `/productos` | `data.productos` |
| `/ventas` | `data.ventas` |
| `/proveedores` | `data.proveedores` |
| `/compras` | `data.compras` |

La app acepta las dos formas y, si no es ninguna, el error nombra el endpoint.
Nunca devuelve una lista vacía en silencio: "no hay productos" se lee como que
el depósito está vacío, y el problema sería otro.

### Y los dos ERPs no devuelven lo mismo en `/ventas`

JM selecciona `estado`; Sistemas Propio **no**. Con el segundo, todas las ventas
se veían pendientes y el reporte mostraba cobranza cero. Cuando no viene, la app
lo deriva del tipo: de contado ya se cobró, a crédito queda por cobrar.

Dos límites de ese endpoint, que conviene tener presentes:

- **Ignora `desde` y `hasta`**: devuelve las últimas 500 y el filtro por fecha lo
  hace la app. Para un rango viejo, puede faltar lo que quedó afuera de esas 500.
- **No trae el cliente** (ni `cliente_id` ni el nombre), así que el historial no
  puede mostrar a quién se le vendió.

Las dos se arreglan del lado del ERP, no acá.

### Conversaciones: una tercera forma de sobre

`/mobile/asesor/conversations` no usa ninguna de las dos anteriores: contesta
`{ ok, is_agent, conversations }`.

Lo importante de ese endpoint es `is_agent`. Cuando es `false`, la lista viene
vacía **y no es que no haya conversaciones**: es que ese usuario no está en
ninguna cola de atención. Son cosas distintas y la app las dice distinto —
mostrar una lista vacía dejaría a alguien esperando un mensaje que nunca le iba
a llegar.

### El ajuste de una línea que falta en el ERP

`GET /api/chat/mobile-inbox` es el endpoint correcto para la app: aplica **el
mismo criterio que el ERP de escritorio** — un administrador ve todas las
conversaciones, un asesor las suyas y las sin asignar de su cola.

Pero hoy **no se puede usar desde el APK**, por esto:

```ts
// src/app/api/chat/mobile-inbox/route.ts, línea 22
ctx = await requireEmpresaTenantServiceRole();
```

Esa función resuelve al usuario por el token `Authorization: Bearer` **si le
pasan el pedido**. Sin el argumento busca una cookie, y en el APK no hay
cookies: contesta 401.

El arreglo es pasarle el pedido:

```ts
ctx = await requireEmpresaTenantServiceRole(request);
```

Nada más. `/api/chat/messages` ya lo hace bien (`getTenantSupabaseFromAuth(request)`)
y por eso los mensajes de una conversación sí se pueden leer.

**Mientras tanto la app no se rompe**: si ese endpoint contesta 401, cae en
`/api/mobile/asesor/conversations`, que sólo trae las conversaciones asignadas
al asesor. Por eso una administradora veía "no hay conversaciones para vos" en
la app mientras en el ERP las tenía todas delante: no está en ninguna cola, y
ese endpoint filtra por cola.

### Escrituras: productos, proveedores y compras

```
POST  /api/productos                 alta            → { producto, warning }
PATCH /api/productos/<id>            corrección      → { producto }
GET   /api/inventario/categorias     catálogo        → { categorias }
POST  /api/inventario/categorias     alta            → { categoria }
GET   /api/inventario/ubicaciones    catálogo        → { ubicaciones }
GET   /api/inventario/movimientos    historial       → { movimientos }
POST  /api/proveedores               alta            → { proveedor }
PATCH /api/proveedores/<id>          corrección      → { proveedor }
GET   /api/proveedores/categorias    rubros          → { categorias }
GET   /api/plan-cuentas/opciones     plan de cuentas → { cuentas }
POST  /api/compras                   alta            → { compra, movimiento_id, warning }
```

**Los catálogos van por id, la app habla por nombre.** La categoría, el
depósito y el rubro se escriben a mano en el formulario. La app resuelve el
nombre contra el catálogo (sin distinguir mayúsculas ni acentos) y, si no
existe, lo da de alta. El ERP normaliza todo a mayúsculas.

**Lo que este ERP no guarda de un producto**, porque no tiene la columna:

| Campo de la app | Qué pasa |
|---|---|
| IVA por producto | No existe. Todo se factura al **10%**. El formulario lo avisa. |
| Precio mayorista | Es de Max; vive en el Supabase de Zentra. |
| Vencimiento | Ídem. |
| Días de entrega del proveedor | No existe. `aProveedor` devuelve `entrega: 0`. |

Y dos traducciones que no se ven venir: la **ciudad** de un proveedor va a
`direccion` (el ERP no tiene columna de ciudad), y el **rubro** son sus
categorías, que viajan como `categoria_ids`.

**El stock no se edita.** `PATCH /api/productos/<id>` acepta `stock_actual`, y
la app **no lo manda nunca**. El stock se mueve con un movimiento, que deja
rastro; pisar el número a mano dejaría un inventario que no se puede explicar.

**La compra necesita contabilidad.** El ERP arma el asiento en el mismo
movimiento que registra la compra, así que exige:

- `nro_timbrado`
- `cuenta_contable_id` en **cada** línea (toma la de la primera para la cabecera)
- `cuenta_contrapartida_id` si es al contado; a crédito puede ir `null` y usa la
  cuenta de proveedores configurada en el ERP
- que la empresa tenga configuradas las cuentas de **IVA crédito 5% y 10%**; si
  no, contesta "Configurá la cuenta de IVA Crédito 10% en Configuración
  Contable" y la compra no entra

Por eso el alta de compra en la app pide dos cuentas cuando hay ERP. No es un
trámite nuestro: elegirlas automáticamente sería escribir en los libros de otro.

La app siempre usa el camino **multilínea** (`items`), incluso con una sola
línea: el camino de una línea exige `precio_venta` mayor a cero —el nuevo precio
de venta del producto— y la app no lo pregunta. Mandar uno inventado le
cambiaría el precio al producto sin que nadie lo decida.

**El historial de movimientos** devuelve los últimos 500 de la empresa y no
acepta filtros, así que el filtrado por producto y por tipo es del lado de la
app. Para un producto con movimientos viejos puede quedar corto.

Cuidado con el tipo: `inventario_inicial` **contiene la palabra "venta"**
(inVENTArio). Al traducirlo hay que sacar "inventario" primero, o el stock
inicial se lee como una salida.

### Lo único que falta del lado del ERP: ajustar stock

```
POST /api/inventario/movimientos    ← { producto_id, tipo, cantidad, motivo }
```

No existe: la ruta sólo tiene `GET`. Es lo que necesita el ajuste de stock de la
app (`inventario.ajustar`), que hoy avisa que no está implementado.

**No se puede resolver con `PATCH /api/productos/<id>`.** Cambiaría el número
sin dejar movimiento, y un inventario que cambia sin que se pueda explicar por
qué es peor que uno desactualizado.

### La ficha del contacto y transferir: ya están, no hay que tocar nada

Dos endpoints que el ERP ya expone con `Authorization: Bearer` y que la app usa
tal cual:

```
GET  /api/chat/contactos/ficha?conversation_id=<uuid>
     → { ok, ficha: { contacto, cliente, proyectos, ultima_tipificacion,
                      conversaciones, linea_tiempo, notas } }

GET  /api/mobile/asesor/conversations/<id>/transfer
     → { ok, queues, agents }
POST /api/mobile/asesor/conversations/<id>/transfer
     ← { queue_id } | { agent_id }
```

Tres cosas que conviene saber antes de tocar la ficha:

1. **Se entra por conversación, no por contacto.** El permiso se valida contra
   un chat que la persona ya está viendo; no hay endpoint por contacto suelto.
2. **`proyectos: null` no es "no tiene proyectos".** Es "esta persona no tiene
   acceso al módulo de proyectos", y entonces la sección no se dibuja. El vacío
   de verdad es `[]`. La app respeta esa diferencia.
3. **El sobre es una cuarta forma**: `{ ok, ficha }`. Ni el array pelado de
   `/clientes`, ni el `{ success, data }` del resto, ni el `{ ok, is_agent,
   conversations }` de las conversaciones.

La transferencia corre las **mismas acciones** que el ERP de escritorio
(`assignConversationToAgent`, `changeConversationQueue`), así que el reparto,
los eventos de ruteo y los avisos salen del mismo lugar: una transferencia
hecha desde la app se ve en la web igual que una hecha ahí.

Y puede transferir tanto el agente asignado como un supervisor que ve la
conversación por su alcance omnicanal — no sólo el dueño del chat.

### Reaccionar: va por el id de WhatsApp, no por el del ERP

```
POST /api/mobile/asesor/conversations/<id>/react
     ← { target_wa_message_id, emoji }     emoji vacío = sacar la reacción
```

`target_wa_message_id` es el **wamid**: el id del mensaje en WhatsApp, no el de
la fila del ERP. `/api/chat/messages` ya lo devuelve en `wa_message_id`, y la
app lo guarda en cada mensaje (`ChatMsg.wamid`). Un mensaje que todavía se está
enviando no lo tiene, y por eso no se le puede reaccionar: WhatsApp todavía no
lo conoce.

La reacción vuelve como **una fila más** del hilo, con `message_type:
"reaction"` — así la manda WhatsApp—, no como un campo del mensaje reaccionado.
Por eso después de reaccionar alcanza con volver a pedir la conversación.

### El inbox pagina, y las cerradas se piden aparte

```
GET /api/chat/mobile-inbox?offset=0&limit=50&only_open=0
    → { conversations: [...], hay_mas }
```

`offset` y `limit` (tope 100). **Sin ellos se comporta como antes**: las 50 más
recientes. Antes los ignoraba, así que la 51 no existía para la app — ni
buscando, porque el buscador filtra lo que ya está cargado.

`hay_mas` se calcula sobre lo que quedó **después** del alcance omnicanal, no
sobre el total de la tabla: ofrecer "cargar más" y devolver vacío es peor que no
ofrecerlo.

`only_open=0` suma las cerradas. La app las pide sólo con el filtro "Cerradas"
puesto: si entraran siempre competirían por los mismos lugares de cada tanda y
taparían lo que hay que atender.

**La ventana a la base crece con el offset** (`offset + limit * 4`, tope 1000)
porque el filtro de alcance corre en el servidor y no en la consulta: hay que
traer de más para que, después de descartar lo que esa persona no puede ver,
siga alcanzando para la página pedida.

### Las colas: el campo que el ERP tiene que mandar

La app divide el listado de conversaciones en pestañas por cola de atención,
igual que el ERP de escritorio. Las pestañas salen de un solo campo por
conversación:

```json
{ "id": "…", "cola_nombre": "Ventas" }
```

También se acepta `queue_nombre` o `cola`, que es como lo llama
`/mobile/asesor/conversations`.

**Si el ERP no manda ese campo, la fila de pestañas no se dibuja** y el listado
queda como antes, en una sola lista. No hay error ni pestaña vacía: es un campo
opcional y la app se comporta como si la empresa no usara colas.

Hoy `/api/chat/mobile-inbox` —el endpoint que la app usa primero— **no lo
manda**. La consulta pide:

```ts
"id, status, last_message_at, last_message_preview, unread_count, contact_id, channel_id"
```

Falta `queue_id`, y después traducirlo a nombre con `chat_queues`. Es el mismo
agregado que ya existe en `/api/mobile/asesor/conversations`, que sí devuelve
`queue_id` por conversación y el catálogo `queues` con `listChatQueues()`.

### Fotos, audios y documentos

Van por `/send-media`, que recibe **`multipart/form-data`** con `file` y un
`caption` opcional. Y acá hay algo que no se ve venir: **los dos caminos de la
app arman el multipart distinto, y ninguno sirve para el otro.**

| | Cómo lo arma |
|---|---|
| Nativo (APK) | Capacitor lo arma en Java desde un arreglo de entradas, con el archivo en base64 |
| Navegador | un `FormData` de verdad, y sin tocar el `Content-Type`: lo pone `fetch` con su `boundary` |

Que el camino nativo sepa multipart es lo que permite mandar fotos y audios
**sin depender de que el ERP agregue CORS**. Si no, habría que volver al
`fetch` del WebView sólo para los archivos.

Los stickers van por `/send-sticker`, que espera `{ sticker_url }` — una URL a
un `.webp`. Está implementado, pero el selector de la app tiene emojis, no
stickers: un emoji se manda como texto, que es lo que de verdad es.

**Los adjuntos recibidos se nombran, no se abren**: una foto aparece como
`📷 Foto`. Mejor que un globo vacío, pero no es ver la foto. Para eso hace falta
que el ERP devuelva la URL del archivo, y hoy no la manda.

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

**Ojo: hay ERPs que la exponen en otra ruta.** El de Amasso —el único donde
encontré la consulta implementada de verdad— usa:

```
GET /set/consulta-ruc?ruc=80012345-6
```

y devuelve lo que manda la DNIT, con `razon_social` y `estado` como texto
(`"ACTIVO"`, `"SUSPENSION TEMPORAL"`, `"CANCELADO"`) en vez de `activo` como
booleano. Contra ese ERP, la ruta documentada arriba da 404, así que el botón
de la SET del alta de cliente nunca funcionó ahí.

La app iOS prueba las dos: primero la documentada, y si contesta 404, 405 o
501, la otra. Android todavía llama sólo a la documentada, y en proveedores ni
eso: `proveedores.consultarSet` es un `pendiente()` que tira "falta definir el
endpoint real".

La clave de la SET es del contribuyente y tiene cupo de consultas, por eso la
llamada la hace el ERP y nunca la app.

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

# Contrato de datos — Zentra Móvil

Qué necesita la app para funcionar con datos reales. Está sacado de lo que las
pantallas efectivamente usan, no de una suposición de cómo debería ser la base.

Sirve para dos cosas: definir el esquema si la base todavía no existe, y verificar
qué falta si ya existe.

---

## Antes que nada: la app no se conecta directo a la base

La app se empaqueta como APK, y un APK se puede descompilar. Cualquier credencial
que viaje adentro del paquete queda expuesta. Por eso **entre la app y la base
siempre tiene que haber una capa HTTP** que valide quién pide qué.

Tres caminos posibles:

| Opción | Cuándo conviene | Qué hay que hacer |
|---|---|---|
| **API del ERP** | Ya existe backend | Mapear los endpoints existentes a los puertos de `src/lib/repo/ports.ts` |
| **Supabase** (u otro BaaS) | No hay backend y se quiere ir rápido | Crear las tablas de abajo, activar Row Level Security, usar el SDK con la anon key |
| **Backend propio** | Se necesita control total | Implementar los endpoints de este documento |

En todos los casos la app queda igual: sólo cambia `src/lib/repo/http.ts`.

---

## Entidades

Los tipos de TypeScript están en `src/lib/types.ts`. Acá van los campos que la app
lee o escribe, con el nombre que usa internamente.

### cliente

| Campo | Tipo | Usado en | Notas |
|---|---|---|---|
| `id` | texto | todas | clave |
| `nombre` | texto | listado, ficha, venta, factura | obligatorio, mín. 2 caracteres |
| `doc` | texto | listado, ficha, factura | RUC o CI, con prefijo (`RUC 80012345-6`) |
| `contacto` | texto | listado, ficha | persona de contacto |
| `tel` | texto | ficha | |
| `email` | texto | ficha, búsqueda | |
| `estado` | `Activo` \| `Inactivo` | listado (filtro), ficha | |
| `origen` | `Venta` \| `Manual` \| `CRM` | listado (badge) | de dónde salió el alta |
| `saldo` | entero | listado, ficha | deuda en guaraníes; 0 = al día |
| `compras` | entero | ficha | cantidad de compras, últimos 90 días |
| `desde` | texto | ficha | "mar 2024" |
| `zona` | texto | listado, ficha | |
| `direccion` | texto | ficha | |
| `lista` | texto | ficha, alta | Mayorista / Minorista / Especial |
| `credito` | texto | ficha | descripción legible, o "No habilitado" |

Para el alta hacen falta además, por separado: **límite de crédito** (entero) y
**plazo en días** (entero). Hoy la app los guarda concatenados en `credito`; si la
base los tiene como columnas propias, mejor — el adaptador los arma.

### proveedor

`id`, `nombre`, `doc` (RUC), `rubro`, `ciudad`, `contacto`, `tel`, `email`,
`estado` (`Activo`/`Inactivo`), `entrega` (días estimados, entero),
`condicion` (texto: "Contado" o "Crédito N días"), `chatId` (texto o nulo).

La **deuda** por proveedor no es una columna: se calcula sumando sus compras en
estado `Pendiente`. Puede venir calculada del backend o resolverse con una query.

### producto (inventario)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | texto | clave |
| `nombre` | texto | |
| `sku` | texto | |
| `barras` | texto | código de barras |
| `stock` | numérico | admite decimales si la unidad es pesable |
| `minimo` | numérico | umbral de reposición |
| `costo` | entero | costo promedio, guaraníes |
| `precio` | entero | precio de venta **con IVA incluido** |
| `unidad` | texto | UNIDAD, CAJA, KG, LT, PAQUETE |
| `categoria` | texto | |
| `deposito` | texto | |
| `iva` | `10%` \| `5%` \| `Exenta` | |
| `metodo` | `CPP` \| `FIFO` \| `LIFO` | método de valuación |

El estado (Normal / Bajo mínimo / Agotado) lo deriva la app comparando `stock`
contra `minimo`. No hace falta guardarlo.

### movimiento de stock

`id`, `prodId`, `tipo` (`ENTRADA`/`SALIDA`/`AJUSTE`), `cant` (con signo: negativo
en salidas y mermas), `origen` (motivo o documento), `ref` (nro. de comprobante),
`fecha`, `usuario`.

Toda alta de producto con stock inicial debe generar un movimiento `ENTRADA` con
origen "Inventario inicial", para que el libro cierre.

### venta

`id`, `numero` (correlativo, lo asigna el backend), `iso` (fecha `YYYY-MM-DD`,
para filtrar por rango), `fecha` (legible), `cliId` (nulo en ventas sin nombre),
`cliente`, `doc`, `pago` (texto: "Efectivo", "Transferencia", "Cheque",
"Crédito N días"), `estado` (`Cobrada`/`Pendiente`), y sus **líneas**:
`nombre`, `qty`, `precio` (unitario con IVA incluido), `iva`.

### compra

`id`, `numero`, `provId`, `fecha`, `pago` (`Contado`/`Crédito`), `plazo` (días),
`cuotas`, `estado` (`Pagada`/`Pendiente`), `factura` (nro. de comprobante),
`timbrado`, y sus **líneas**: `prodId`, `nombre`, `unidad`, `cantidad`,
`costo` (unitario **neto**, sin IVA), `iva`.

### conversación

`id`, `nombre`, `tipo` (`Cliente`/`Proveedor`), `refId` (apunta al cliente o
proveedor), `enLinea`, `hora`, `noLeidos`, y sus **mensajes**: `de` (`yo`/`ellos`),
`texto`, `hora`, `tick`, y opcionalmente `pedido`, `archivo`, `sticker`, `audio`.

Es el módulo más opinado del diseño. Si la mensajería va a salir de WhatsApp
Business API o similar, conviene revisarlo antes de modelar las tablas.

---

## Reglas de negocio que el backend debe respetar

Estas ya están implementadas en `src/lib/calc.ts` del lado de la app. Si el backend
también las calcula, los números tienen que coincidir.

1. **El IVA está contenido en el precio de venta.** El impuesto de una línea es
   `bruto × r / (1 + r)`, no `bruto × r`. Para ₲33.500 al 10 % el IVA es ₲3.045,
   no ₲3.350. Tasas: 10 %, 5 % y exenta.
2. **En compras el IVA va por encima del costo**, porque el proveedor cotiza neto.
   Total de línea = `cantidad × costo × (1 + r)`.
3. **Venta a crédito sólo con cliente identificado.** Una venta sin nombre no puede
   ser a crédito. La app lo bloquea en la UI; el backend debería rechazarlo igual.
4. **Contado cobra ahora, crédito queda pendiente.** El estado de la venta sale de
   ahí: contado → `Cobrada`, crédito → `Pendiente`. Igual en compras.
5. **Compras en USD** se convierten a guaraníes con el tipo de cambio del momento.
   Conviene guardar la cotización usada junto con la compra.
6. **Numeración correlativa** de ventas (`VTA-000148`) y compras (`COMP-000148`):
   la tiene que asignar el backend, no el cliente. Si dos vendedores facturan a la
   vez, el cliente duplicaría números.

---

## Operaciones que la app necesita

Agrupadas como las usa la app. Los nombres salen de `src/lib/repo/ports.ts`; las
rutas son una propuesta, se ajustan a lo que exista.

### Autenticación
- `login(usuario, password)` → token + datos del usuario (nombre, rol, empresa)
- `logout()`
- `sesionActual()` → sesión guardada, para no pedir login en cada arranque
- `recuperarPassword(correo)`

El rol importa: la pantalla de inicio muestra "VENDEDOR" y es razonable que
condicione permisos más adelante.

### Clientes
- `list({ q, estado })` — `q` busca en nombre, documento, contacto y correo
- `get(id)`
- `create(datos)`
- `consultarSet(doc)` → razón social + si está activo

> **`consultarSet` es la única operación que necesita un servicio externo.** Hoy
> está simulada. Hay que definir si se consulta a la SET de verdad, con qué
> credenciales, y qué hacer cuando el servicio no responde.

### Proveedores
- `list({ q, estado, conDeuda })`
- `get(id)`, `create(datos)`, `deuda(id)`, `consultarSet(doc)`

### Inventario
- `list({ q, filtro })` — filtro: Todos / Bajo mínimo / Agotados / Con stock
- `get(id)`, `create(datos)`
- `movimientos({ prodId, tipo })`
- `ajustar({ prodId, tipo, cantidad, motivo })` → movimiento creado

### Ventas
- `productos({ q })` — catálogo vendible con precio y stock
- `list({ desde, hasta, q, estado })`
- `get(id)`, `create(datos)`

### Compras
- `list({ q, estado })`, `get(id)`, `create(datos)`

### Conversaciones
- `list({ q, tipo, soloNoLeidas })`, `get(id)`
- `enviar(chatId, mensaje)`, `marcarLeido(chatId)`

### Reportes
- `resumen(tab, desde, hasta)` donde tab es ventas / inventario / compras

Devuelve serie temporal, total, KPIs, composición de la dona, ranking y tabla.
**Conviene que lo calcule el backend**: hoy la app agrega en memoria sobre los
datos de ejemplo, lo que no escala a un histórico real.

### Dispositivos (notificaciones push)
- `registrar({ token, plataforma })` — se llama en cada entrada
- `baja(token)` — al apagar los avisos y al cerrar sesión

El token lo da Firebase e identifica al **teléfono**, no a la persona: cambia al
reinstalar la app, y el mismo aparato puede pasar de un empleado a otro. El
backend tiene que: tratar el token como clave única (reasignarlo, no duplicarlo),
decidir el dueño por la sesión y nunca por lo que manda el cliente, y borrarlo con
la cuenta. Detalle en [`NOTIFICACIONES.md`](NOTIFICACIONES.md).

---

## Decisiones pendientes

Cosas que no se pueden resolver desde el diseño y hay que definir:

1. **Multi-usuario.** ¿Cada vendedor ve sólo sus ventas o las de toda la empresa?
   Cambia los filtros y los permisos.
2. **Trabajo sin señal.** Un vendedor en la calle se queda sin datos. ¿La app debe
   permitir facturar offline y sincronizar después? Es la decisión más cara de
   cambiar más adelante — conviene definirla antes de escribir el cliente HTTP.
3. **Facturación electrónica.** ¿Las ventas tienen que ir a SIFEN? Si sí, el
   timbrado, el CDC y el KuDE entran en el modelo.
4. **Paginación.** Con cientos de clientes o miles de movimientos, los listados
   necesitan paginar. Hoy los puertos devuelven listas completas; agregar cursor o
   página es un cambio chico si se decide temprano.
5. **Mensajería.** Si sale de WhatsApp Business API, el modelo de conversaciones
   cambia bastante respecto del diseño.

---

## Cómo se conecta, una vez definido

1. Completar `src/lib/repo/http.ts` con los endpoints reales.
2. Crear `.env.local` a partir de `.env.example`:
   ```
   NEXT_PUBLIC_BACKEND=http
   NEXT_PUBLIC_API_URL=https://tu-api
   ```
3. Listo. Las 13 pantallas no se tocan: leen todo de `repo`, que ya apunta a la
   implementación que indique la variable de entorno.

Para volver a los datos de ejemplo, `NEXT_PUBLIC_BACKEND=mock`.

---

## El directorio de empresas (código de empresa)

En el login se pregunta **"¿Tu empresa ya tiene un ERP con nosotros?"**. El campo
del código sólo aparece si contesta que sí — a quien no tiene ERP, un campo suelto
llamado "código de empresa" sólo lo confunde.

- **No** → instalación pública: quien baja la app de la tienda, se registra y
  arranca con todo en blanco.
- **Sí + código** → instalación de un cliente que ya tiene ERP: entra con el mismo
  usuario y contraseña que usa en la web y ve sus datos ya cargados.

Un solo APK sirve para los dos. Lo único que cambia es a qué Supabase le habla.

### Qué tiene que exponer el directorio

Un endpoint público de sólo lectura:

```
GET {NEXT_PUBLIC_DIRECTORIO_URL}/{CODIGO}
```

Respuesta `200`:

```json
{
  "nombre": "Distribuidora JM",
  "supabaseUrl": "https://jm.supabase.ejemplo",
  "anonKey": "eyJ...",
  "ruc": "80012345-0",
  "ciudad": "Asunción · Paraguay"
}
```

Respuesta `404` si el código no existe.

`ruc` y `ciudad` son opcionales y van en la cabecera de la factura. Sin `ruc`, la
factura sale rotulada como comprobante interno y dice qué le falta, en vez de
mostrar un RUC que no es el de esa empresa. Si el campo falta, no pasa nada más
que eso: ningún otro flujo lo usa.

**Nada de esto es secreto.** La URL y la anon key son los mismos datos que viajan
dentro de cualquier APK que use Supabase; lo que protege los datos es RLS del lado
del servidor, no esconder estos valores. El directorio es una libreta de
direcciones, no una caja fuerte.

### Reglas que ya implementa la app

- **Normalización**: `  j-m  ` y `jm` resuelven al mismo código `JM`.
- **Se guarda en el dispositivo**: el vendedor escribe su código una sola vez. Al
  reabrir la app, la pregunta ya viene contestada y el código precargado.
- **Tolera que el directorio se caiga**: si el celular ya resolvió ese código antes,
  usa lo guardado y entra igual. El directorio sólo hace falta la primera vez —
  así no es un punto único de falla para el login.
- **Un código inexistente no usa la caché**: es un error definitivo, con mensaje
  claro para el usuario.
- **Sin `NEXT_PUBLIC_DIRECTORIO_URL`** se usa un directorio demo incluido (`JM` y
  `FERRE`), para poder probar el flujo sin levantar el servicio real.
- **Enlace a soporte**: debajo del campo hay un enlace a WhatsApp con el mensaje ya
  escrito, para quien no tiene su código a mano. El número sale de
  `NEXT_PUBLIC_SOPORTE_WHATSAPP`; si se deja vacío, el enlace no se muestra.

Ver `src/lib/tenant/`.

### Lo que falta definir

- **Quién administra el directorio**: hoy no existe. Puede ser una tabla con un
  endpoint, o incluso un JSON estático servido por CDN.

---

## Conectar la app a un ERP que ya existe

El mecanismo del código de empresa está hecho y se puede probar. Lo que **todavía
no se puede** es apuntar la app al Supabase de un ERP en producción y esperar que
funcione, y conviene entender por qué antes de intentarlo.

### Por qué no alcanza con cambiar la URL

El código del ERP de Distribuidora JM deja ver tres desajustes, en orden de
gravedad:

**1. No existe el schema `zentra`.** El adaptador de la app, después de validar la
contraseña, lee el perfil de `zentra.usuarios` para saber a qué empresa pertenece la
persona. En un proyecto de ERP ese schema no está, así que **el login falla ahí
mismo** con "tu cuenta no tiene perfil en esta instalación" — ni se llega a los
datos. El login en sí sí anda: los dos usan Supabase Auth, así que la contraseña se
valida bien. Es el segundo paso el que se cae.

**2. Las columnas son otras.** Los nombres de tabla coinciden de casualidad
(`clientes`, `productos`, `ventas`, `compras`), pero adentro no se parecen. El ERP
guarda un cliente con `tipo_cliente`, `empresa`, `nombre_contacto`, `razon_social`;
la app espera `nombre`, `doc`, `contacto`, `zona`, `lista_precios`,
`credito_limite`. Ningún `select` de la app funciona contra esas tablas.

**3. Algunos schemas no son alcanzables desde un celular.** El ERP pone cada
empresa en su propio schema (`empresas.data_schema` → `erp_*`) y esos **no están
expuestos en PostgREST**: su propio código los lee con un pool de Postgres desde el
servidor. Un celular no puede abrir una conexión a Postgres —y no debería, ver el
primer punto de este documento—, así que para esas empresas no hay forma de que la
app hable directo con la base, por mucho que se arregle lo anterior.

### Las tres salidas, de peor a mejor

**(a) Instalar el schema `zentra` dentro del proyecto del ERP.** Funciona hoy: se
corren los mismos SQL ahí y listo. El login pasa a ser compartido —el vendedor entra
con la contraseña que ya usa— pero **los datos quedan separados**: la app no vería
los clientes ni los productos del ERP, arrancaría en blanco. Sirve si lo que se
quiere es compartir usuarios, no datos. Para "ver mis datos del ERP en el celular",
no sirve.

**(b) Un adaptador que traduzca a las tablas del ERP.** Una cuarta implementación de
los puertos que mapee `nombre` → `razon_social` y así con todo. Es trabajo real pero
acotado, y **no resuelve el punto 3**: las empresas con schema `erp_*` seguirían
fuera de alcance.

**(c) Una API HTTP en el ERP que hable el contrato de este documento.** La app pasa a
`NEXT_PUBLIC_BACKEND=http` y no se toca nada más: `src/lib/repo/http.ts` está para
eso. El ERP ya tiene el acceso a Postgres resuelto, incluido el caso `erp_*`, así
que es el único camino que cubre a todas las empresas. **Es la salida correcta.**

Esa pieza va **del lado del ERP**, no acá: es su base y su código. Lo que este
repositorio aporta es el contrato —las operaciones listadas más arriba— para que
quien la escriba sepa exactamente qué tiene que devolver.

### Qué se puede probar hoy, entonces

El mecanismo del código, sin tocar ningún ERP: creás un segundo proyecto de
Supabase, le corrés los mismos SQL, y lo publicás en el directorio con un código.
Entrar con ese código tiene que llevarte a ese proyecto, con su propio login y sus
propios datos, y entrar sin código a la instalación pública. Eso valida lo que hay
que validar: la resolución del código, el cambio de proyecto y que las dos sesiones
no se pisen (cada instalación guarda su sesión con una clave distinta).

Sin levantar nada, el directorio demo incluido (códigos `JM` y `FERRE`) deja ver el
flujo de la pantalla, pero apunta a URLs inventadas: sirve para la pregunta y el
campo, no para entrar.

# Ver las conversaciones en la app sin estar en una cola

Es un cambio **en el ERP**, no en esta app. Y es de una palabra.

## El problema

En el ERP de escritorio una administradora ve todas las conversaciones. En la
app veía "no hay conversaciones para vos".

No es un error de la app: hay dos endpoints y no dan lo mismo.

| Endpoint | Qué devuelve |
|---|---|
| `/api/mobile/asesor/conversations` | sólo las asignadas al asesor, **filtradas por cola** |
| `/api/chat/mobile-inbox` | el mismo criterio que el escritorio: **un administrador ve todas** |

El segundo es el que corresponde, y la app ya lo usa primero. Pero desde el APK
contesta **401**.

## Por qué contesta 401

`src/app/api/chat/mobile-inbox/route.ts`, línea 22:

```ts
ctx = await requireEmpresaTenantServiceRole();
```

Esa función **sabe** resolver al usuario por el token `Authorization: Bearer`
—lo hace en `getUsuarioCatalogFromRequest`— pero sólo si le pasan el pedido.
Sin el argumento busca una cookie de sesión, y adentro del APK no hay cookies.

## El arreglo

```ts
ctx = await requireEmpresaTenantServiceRole(request);
```

Eso es todo. `request` ya existe en esa función, es el parámetro del `GET`.

Queda así:

```ts
export async function GET(request: NextRequest) {
  try {
    let ctx;
    try {
      ctx = await requireEmpresaTenantServiceRole(request);
    } catch {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
```

`/api/chat/messages` ya lo hace bien (`getTenantSupabaseFromAuth(request)`), y
por eso los mensajes de una conversación sí se leen desde la app. Es la misma
idea, aplicada a un endpoint que quedó afuera.

## Lo que decide quién ve qué: el rol, no la cola

Hay dos puertas distintas, y ahí está la confusión.

**El ERP de escritorio y `/api/chat/mobile-inbox`** miran el **rol** en
`chat_empresa_operator_roles`:

| Rol | Qué ve |
|---|---|
| `admin` | todas las conversaciones de la empresa |
| `supervisor` | las de los agentes a su cargo |
| `agente` | las suyas |
| sin fila, pero con fila en `chat_agents` | las suyas |

**Las colas no entran en esa cuenta.** Por eso alguien sin ninguna cola asignada
ve todo en el ERP: lo ve por su rol.

**`/api/mobile/asesor/conversations`** usa otra puerta, más estrecha:
`getMyAgentOperationalPresence().in_queues`. Exige estar en una cola, y **el rol
no cuenta**. Un administrador sin cola recibe `is_agent: false` y una lista
vacía.

Esa diferencia es todo el problema. No es que falten permisos: es que el
endpoint que la app podía usar hace una pregunta distinta.

### Verificado contra la base

En Neura Sistemas, al 6 de octubre de 2026:

| Rol | Cuántos | Colas |
|---|---|---|
| `admin` | 1 | **0** |
| `supervisor` | 2 | **0** |
| `agente` | 6 | 1 |

El admin y los dos supervisores no están en ninguna cola y ven conversaciones
igual. Los únicos con cola son los agentes. Eso confirma que la cola no es lo
que decide.

Hay ocho usuarios más con `(sin rol)` y cero colas: esos **no ven
conversaciones tampoco en el ERP**, así que la app mostrándoles una lista vacía
está bien. Es el caso que hay que distinguir del de un administrador, y por eso
el cartel ahora explica la diferencia en vez de decir "pedí que te agreguen a
una cola".

Una precisión sobre `supervisor`: ve las conversaciones de **los agentes a su
cargo**, no todas las de la empresa. Sólo `admin` las ve todas. En la app va a
pasar lo mismo, porque es el ERP el que resuelve el alcance.

### Para ver el rol de cada uno

Las consultas están en [`consultas-chat.sql`](consultas-chat.sql), ya con los
nombres de schema escritos: el catálogo de usuarios es `zentra` y las tablas de
chat viven en el schema de cada empresa (`neura`, `distribuidorajmerp`, …).

Quien tenga `rol_omnicanal = admin` ve todo en el ERP aunque `colas` sea 0. Y
hoy, en la app, no ve nada — hasta el arreglo de arriba.

## Lo que NO resuelve el problema

**Meterse en una cola.** El endpoint de asesor devuelve sólo lo asignado a esa
persona, no las conversaciones de los demás. Una administradora en una cola
seguiría sin ver el resto, y además estaría cambiando cómo está organizado el
ERP por una razón técnica que no tiene nada que ver.

Revisé los demás endpoints de chat del ERP: `mobile-inbox` es el único que lista
conversaciones respetando el rol. No hay otro camino.

## Cómo verificar

Con el token de un usuario administrador:

```sh
curl -s -H "Authorization: Bearer <token>" \
  https://sistemas.neura.com.py/api/chat/mobile-inbox | head -c 300
```

Antes del arreglo contesta `{"success":false,...}` con 401. Después, la lista de
conversaciones.

Desde la app no hay nada que tocar: ya pide ese endpoint primero y cae en el otro
sólo si falla.

---

# Si la lista muestra "Sin nombre" en todas

Pasó en el ERP de Neura y puede pasar en cualquier otro, porque el error es
fácil de cometer y **no se nota desde el servidor**: la app muestra la lista
completa, con la hora y el último mensaje bien, y el nombre vacío en todas.

## Qué está pasando

`/api/chat/mobile-inbox` arma el nombre en dos pasos: lee las conversaciones,
y después busca los contactos por separado para enriquecerlas. Si esa segunda
consulta pide una columna que no existe, PostgREST devuelve error — y el
código suele descartarlo:

```ts
for (const c of (contactsRes.data ?? []) as Array<…>) { … }
//                              ↑ el error se come acá
```

Con `data: null`, el `?? []` deja el mapa vacío y cada conversación sale con
`contact_nombre: null`. No hay excepción, no hay 500, no hay log. Desde
afuera parece que los contactos no tienen nombre cargado.

## Cómo confirmarlo en un minuto

Mirá qué columnas tiene la tabla, en la base de ese ERP:

```sql
select column_name
from information_schema.columns
where table_schema = '<schema de la empresa>'
  and table_name = 'chat_contacts'
order by column_name;
```

Si ahí dice `name` y `phone_number`, y el endpoint pide `nombre` y `telefono`
(o al revés), ese es el problema.

## El arreglo

Dos cosas, y la segunda importa tanto como la primera:

```ts
.select("id, name, phone_number, phone_normalized")   // los nombres reales

if (contactsRes.error) {
  console.warn("[mobile-inbox] no se pudieron leer los contactos:", contactsRes.error.message);
}
```

El log no arregla nada hoy, pero es lo que hace que la próxima vez se vea en
el servidor en vez de descubrirse mirando un celular.

## Qué NO hace la app

La app no inventa el nombre ni lo busca por otro lado: si el ERP devuelve
`contact_nombre: null` y `contact_telefono: null`, muestra "Sin nombre". No
hay de dónde sacarlo — el teléfono y el nombre viven en el ERP.

Por eso esto se arregla en cada ERP que lo tenga, y es un cambio de dos
líneas en un solo archivo.

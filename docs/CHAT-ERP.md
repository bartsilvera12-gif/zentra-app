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

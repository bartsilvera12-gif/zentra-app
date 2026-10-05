# CORS en el ERP: el único cambio que falta

Este es un cambio **en el ERP** (`neura-erp-distribuidorajm`), no en esta app. Yo
no lo toco. Acá está el parche para que lo apliquen de aquel lado.

## Por qué sin esto no funciona nada

El navegador no deja que una página pida datos a otro dominio salvo que ese
dominio diga explícitamente que la deja. La app corre en un origen
(`https://localhost` adentro del APK) y pide a otro (`api.neura.com.py`), así que
el navegador **primero** manda un `OPTIONS` preguntando, y si la respuesta no
trae las cabeceras correctas, descarta el pedido real sin mandarlo.

El error que se ve es confuso: en la consola dice "blocked by CORS policy" o un
`TypeError: Failed to fetch`, y en el log del servidor **no aparece nada**,
porque el pedido nunca llegó. Parece un problema de red y es una política del
navegador.

Hoy el ERP no tiene ninguna cabecera `Access-Control-Allow-Origin` en ninguna
parte. Lo verifiqué buscando en todo el repo.

## Paso a paso

El archivo ya quedó escrito, completo y listo para pegar, en
[`cors-erp-middleware.ts.txt`](cors-erp-middleware.ts.txt). No hay que empalmar
nada a mano: reemplaza todo el contenido de `src/middleware.ts` del ERP.

Está hecho sobre el archivo que el ERP tiene hoy (commit `0192c6d`), y verifiqué
con `diff` que lo único distinto son las dos cosas nuevas: el bloque de CORS
arriba, y la función de siempre renombrada a `sesionYDevice`. Ni una línea de la
lógica actual cambió.

### Por GitHub, desde el navegador (lo más simple)

1. Abrí `src/middleware.ts` en el repo del ERP, en GitHub.
2. Botón del lápiz, arriba a la derecha (*Edit this file*).
3. Seleccioná **todo** lo que hay (Ctrl+A) y borralo.
4. Pegá el contenido completo de `cors-erp-middleware.ts.txt`.
5. Abajo, en el mensaje del commit, poné algo como
   `feat(api): CORS para la app movil`.
6. Elegí **Create a new branch for this commit** y abrí el Pull Request. Así
   alguien lo mira antes de que entre, y si algo sale mal se revierte de una.
7. Mergealo cuando esté revisado.

### Por consola, si preferís

```sh
cd <el repo del ERP>
git checkout -b cors-app-movil
# pegar el archivo sobre src/middleware.ts
npx tsc --noEmit          # que no haya roto tipos
npm run lint
git add src/middleware.ts
git commit -m "feat(api): CORS para la app movil"
git push -u origin cors-app-movil
```

### Después del merge: el deploy

Esto no es una variable de entorno, es código: **no alcanza con reiniciar**, hay
que redeployar en Coolify para que el cambio esté en el servidor. En el servicio
del ERP, *Deploy*, y esperá que termine.

Para saber si el deploy entró de verdad, el ERP tiene `/api/deploy-info`: ahí
aparece el commit que está corriendo, y tiene que ser el del merge.

### Y ahí verificás

Corré el primer `curl` de más abajo. Si devuelve las cabeceras, avisame y cambio
el backend de la app a `http` para probar contra los datos de JM.

Si no las devuelve, no toques nada más y mandame lo que imprimió el `curl`
completo: ahí se ve si no entró el deploy, si quedó en otra rama, o si hay un
proxy adelante comiéndose las cabeceras.

---

## El parche, explicado

Si preferís aplicarlo a mano en vez de pegar el archivo entero, va en
`src/middleware.ts`. Ese archivo ya corre para todas las rutas `/api/*` (su
`matcher` sólo excluye `api/webhooks`), así que es el único lugar donde hay que
tocar: no hace falta editar cada endpoint.

### 1. Arriba del archivo, después de los imports

```ts
/**
 * Orígenes que pueden llamar a /api desde un navegador.
 *
 * Lista cerrada a propósito. Un `*` acá dejaría que cualquier página de
 * internet le haga pedidos al ERP con el token de quien la esté visitando.
 */
const ORIGENES_PERMITIDOS = new Set([
  "https://localhost",     // APK Android: Capacitor sirve el paquete desde ahí
  "capacitor://localhost", // APK iOS
  "http://localhost:3000", // desarrollo
  // Agregar acá el dominio de la app web cuando exista.
]);

/**
 * Las cabeceras que la app manda. Si falta una, el preflight falla y el pedido
 * real no se manda nunca.
 *
 * `idempotency-key` es la que se olvida: es una cabecera propia, no estándar, y
 * el navegador no la deja pasar salvo que esté nombrada acá. Sin ella se cae
 * justo el endpoint que más importa, el de registrar la venta.
 */
const CABECERAS_PERMITIDAS = "authorization, content-type, idempotency-key";

function aplicarCors(res: NextResponse, origen: string): void {
  res.headers.set("Access-Control-Allow-Origin", origen);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", CABECERAS_PERMITIDAS);
  res.headers.set("Access-Control-Max-Age", "86400");
  // La respuesta cambia según quién pregunte. Sin esto, un proxy o CDN puede
  // guardar la respuesta hecha para un origen y servirla a otro, y entonces el
  // CORS falla o pasa según quién entró antes. Es un bug imposible de reproducir.
  res.headers.append("Vary", "Origin");
}
```

### 2. Renombrar la función actual

La función `middleware` que ya está pasa a llamarse `sesionYDevice`, sin tocarle
una línea de adentro:

```ts
async function sesionYDevice(request: NextRequest) {
  // ...todo el cuerpo actual, igual...
}
```

### 3. La nueva `middleware`, que la envuelve

```ts
export async function middleware(request: NextRequest) {
  const esApi = request.nextUrl.pathname.startsWith("/api/");
  const origen = request.headers.get("origin");
  const permitido = esApi && origen && ORIGENES_PERMITIDOS.has(origen) ? origen : null;

  // El preflight: el navegador pregunta antes de mandar el pedido de verdad.
  // No lleva token ni cookies, así que pasarlo por el refresh de sesión de
  // Supabase es una llamada remota al aire. Se contesta y se corta acá.
  if (esApi && request.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    if (permitido) aplicarCors(res, permitido);
    return res;
  }

  const res = await sesionYDevice(request);
  if (permitido) aplicarCors(res, permitido);
  return res;
}
```

Eso es todo. No cambia nada de cómo el ERP funciona hoy: si el pedido no viene de
un navegador (no trae `Origin`) o no es a `/api`, el comportamiento es idéntico
al actual.

## Lo que NO hay que hacer

- **`Access-Control-Allow-Origin: *`.** Con eso cualquier página de internet le
  puede pedir datos al ERP. Y si alguna vez hace falta mandar cookies, el
  navegador directamente lo rechaza: `*` y credenciales no se combinan.
- **`Access-Control-Allow-Credentials: true`.** No hace falta: la app se
  autentica con `Authorization: Bearer`, no con cookies. Agregarlo sólo amplía
  la superficie.
- **Tocar cada endpoint.** El middleware ya los cubre todos.

## Cómo verificar que quedó, sin la app

Desde cualquier terminal, simulando el preflight que manda el navegador:

```sh
curl -i -X OPTIONS https://api.neura.com.py/api/ventas/create \
  -H "Origin: https://localhost" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, content-type, idempotency-key"
```

Tiene que contestar `204` y traer:

```
access-control-allow-origin: https://localhost
access-control-allow-headers: authorization, content-type, idempotency-key
```

Si la primera línea no está, no quedó aplicado. Si está pero falta
`idempotency-key` en la segunda, va a andar todo menos registrar ventas.

Y el control de que la lista está cerrada de verdad:

```sh
curl -i -X OPTIONS https://api.neura.com.py/api/ventas/create \
  -H "Origin: https://sitio-cualquiera.com" \
  -H "Access-Control-Request-Method: POST"
```

Acá **no** tiene que aparecer ninguna cabecera `access-control-allow-origin`. Si
aparece, la lista no está filtrando y el ERP quedó abierto.

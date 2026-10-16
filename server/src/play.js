/**
 * Plomería de la facturación de Google Play.
 *
 * Es el equivalente de `pagopar.js` para el otro lado del negocio: en Android
 * la suscripción se compra adentro de la app, con la caja de Google, y lo
 * único que la app recibe es un `purchaseToken`. Acá se le pregunta a Google
 * si ese token es una compra de verdad.
 *
 * La regla es la misma que con PagoPar y está escrita en `08_precios.sql`: al
 * cliente no se le cree nada. Un `purchaseToken` que manda el teléfono es
 * exactamente igual de falsificable que un monto que manda el navegador —un
 * APK se descompila y se parchea—, así que el token no vale por sí mismo:
 * vale lo que Google contesta cuando le preguntamos por él.
 *
 * No tiene nada de Zentra más allá del mapa de productos: es Play y nada más.
 * Quién es la empresa, cuánto cuesta el plan y qué se activa lo decide
 * `index.js` con la base, igual que en el circuito de PagoPar.
 */
import crypto from "node:crypto";

/**
 * De qué plan es cada producto de Play.
 *
 * Son dos mundos de identificadores: el de Google —que no se puede cambiar
 * después de publicado— y el nuestro, el de `zentra.planes`. El mapa es
 * explícito a propósito: un producto que no esté acá se rechaza. Caer a un
 * plan por defecto sería activar Max porque alguien escribió mal un id.
 */
export const PLANES_POR_PRODUCTO = Object.freeze({
  zentra_emprendedor_mensual: "emprendedor",
  zentra_max_mensual: "max",
});

/** El plan de un producto de Play, o `null` si no lo conocemos. */
export function planDeProducto(productId) {
  const id = String(productId || "").trim();
  if (!id) return null;
  // `Object.freeze` no alcanza: `hasOwn` es lo que impide que un productId
  // llamado "constructor" entre como si fuera un plan.
  return Object.hasOwn(PLANES_POR_PRODUCTO, id) ? PLANES_POR_PRODUCTO[id] : null;
}

/** El paquete de la app Android. Una compra de otro paquete no es nuestra. */
export const PAQUETE = (process.env.PLAY_PACKAGE_NAME || "py.com.zentra.movil").trim();

const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const OAUTH_URL = (process.env.PLAY_OAUTH_URL || "https://oauth2.googleapis.com/token").trim();
const API_BASE = (process.env.PLAY_API_BASE_URL || "https://androidpublisher.googleapis.com")
  .trim()
  .replace(/\/+$/, "");

const CORREO = (process.env.PLAY_SERVICE_ACCOUNT_EMAIL || "").trim();

/**
 * La clave privada de la cuenta de servicio, que llega por entorno y nunca
 * entera de un solo pedazo.
 *
 * Un PEM tiene saltos de línea y los `.env` no los tienen, así que en la
 * práctica llega de dos formas: con los saltos escritos como `\n`, o el PEM
 * entero en base64. Las dos se aceptan porque las dos aparecen, y la
 * alternativa es un despliegue que falla con "no es una clave" sin que nadie
 * sospeche que el problema es un `\n`.
 */
export function limpiarClave(raw) {
  let s = String(raw ?? "").trim();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/\\n/g, "\n");
  if (!s.includes("BEGIN")) {
    try {
      const pem = Buffer.from(s, "base64").toString("utf8");
      if (pem.includes("BEGIN")) s = pem.trim();
    } catch {
      /* no era base64: se devuelve como vino y falla al firmar, con su error */
    }
  }
  return s;
}

const CLAVE = limpiarClave(process.env.PLAY_SERVICE_ACCOUNT_KEY);

/**
 * Qué falta para poder verificar una compra.
 *
 * Devuelve el motivo o `null`. Es el `falta()` de Play: un camino de pago que
 * "funciona" sin poder verificar es peor que uno apagado, porque activa planes
 * contra tokens que nadie miró.
 */
export function faltaConfigPlay() {
  if (!CORREO) return "falta PLAY_SERVICE_ACCOUNT_EMAIL";
  if (!CLAVE) return "falta PLAY_SERVICE_ACCOUNT_KEY";
  if (!CLAVE.includes("BEGIN")) return "PLAY_SERVICE_ACCOUNT_KEY no parece una clave PEM";
  if (!PAQUETE) return "falta PLAY_PACKAGE_NAME";
  return null;
}

/** Para el health: ver que está puesta sin mostrarla. */
export function configPlayALaVista() {
  return {
    paquete: PAQUETE || "(vacío)",
    cuenta: CORREO || "(vacía)",
    clave: CLAVE ? `PEM de ${CLAVE.length} chars` : "(vacía)",
    api: API_BASE,
  };
}

/* ───────────────────────────── el access token ───────────────────────────── */

const base64url = (x) => Buffer.from(x).toString("base64url");

/**
 * El JWT firmado que se cambia por un access token.
 *
 * Es el único lugar donde se usa la clave privada. Se firma a mano con
 * `node:crypto` en vez de traer `googleapis` o `jsonwebtoken`: son veinte
 * líneas y el server tiene tres dependencias a propósito —cada una que se
 * agrega hay que seguirla por parches de seguridad para siempre, y este
 * proceso tiene adentro la `service_role` de Supabase—.
 */
export function firmarJwt({ ahora = Math.floor(Date.now() / 1000) } = {}) {
  const cabecera = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const cuerpo = base64url(
    JSON.stringify({
      iss: CORREO,
      scope: SCOPE,
      aud: OAUTH_URL,
      iat: ahora,
      exp: ahora + 3600,
    }),
  );
  const firma = crypto
    .createSign("RSA-SHA256")
    .update(`${cabecera}.${cuerpo}`)
    .sign(CLAVE)
    .toString("base64url");
  return `${cabecera}.${cuerpo}.${firma}`;
}

/**
 * El token de Google, guardado hasta poco antes de que venza.
 *
 * Sin esto, cada verificación serían dos viajes a Google en vez de uno, con
 * una firma RSA de regalo. Google los da por una hora; se renueva un minuto
 * antes para no salir nunca con uno que venza en el camino.
 */
let guardado = null;

/** Olvidar el token guardado. Lo usan las pruebas. */
export function olvidarToken() {
  guardado = null;
}

export async function tokenDeAcceso() {
  const problema = faltaConfigPlay();
  if (problema) throw new Error(`[play] ${problema}`);

  if (guardado && guardado.vence - 60 > Date.now() / 1000) return guardado.token;

  const r = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: firmarJwt(),
    }).toString(),
  });
  const texto = await r.text();
  if (!r.ok) {
    // El cuerpo de Google acá dice cuál de los tres problemas es —el reloj de
    // la máquina corrido, la clave que no es de esa cuenta, la API sin
    // habilitar— y los tres se arreglan distinto, así que va entero al log.
    throw new Error(`[play] oauth HTTP ${r.status}: ${texto.slice(0, 300)}`);
  }
  let data;
  try {
    data = JSON.parse(texto);
  } catch {
    throw new Error(`[play] oauth no devolvió JSON: ${texto.slice(0, 200)}`);
  }
  const token = String(data?.access_token || "");
  if (!token) throw new Error("[play] oauth no devolvió access_token");
  guardado = { token, vence: Date.now() / 1000 + Number(data.expires_in || 3600) };
  return token;
}

/* ──────────────────────── preguntarle a Google ──────────────────────── */

/**
 * Lo que Google sabe de esta compra (`purchases.subscriptionsv2.get`).
 *
 * Devuelve `null` cuando Google dice que ese token no existe para este
 * paquete: un 404 acá no es una falla nuestra, es la respuesta —y es
 * justamente la que recibe un token inventado—.
 *
 * Ojo con el paquete: va en la URL. Google sólo contesta por la app que la
 * cuenta de servicio tiene autorizada, así que un token de otra app no
 * devuelve datos ajenos, devuelve 404.
 */
export async function traerSuscripcion(purchaseToken, { paquete = PAQUETE } = {}) {
  const token = await tokenDeAcceso();
  const url =
    `${API_BASE}/androidpublisher/v3/applications/${encodeURIComponent(paquete)}` +
    `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const r = await fetch(url, {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
  });
  const texto = await r.text();
  if (r.status === 404 || r.status === 400) {
    console.warn("[play] Google no reconoce el token (HTTP %s): %s", r.status, texto.slice(0, 200));
    return null;
  }
  if (!r.ok) throw new Error(`[play] subscriptionsv2 HTTP ${r.status}: ${texto.slice(0, 300)}`);
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`[play] subscriptionsv2 no devolvió JSON: ${texto.slice(0, 200)}`);
  }
}

/**
 * Reconocer la compra.
 *
 * Esto NO es opcional y no es prolijidad: una compra que no se reconoce dentro
 * de los tres días Google se la reembolsa sola al cliente. La plata se va sin
 * que nadie se entere, porque del lado nuestro todo salió bien.
 */
export async function reconocerCompra(purchaseToken, { productId, paquete = PAQUETE }) {
  const token = await tokenDeAcceso();
  const url =
    `${API_BASE}/androidpublisher/v3/applications/${encodeURIComponent(paquete)}` +
    `/purchases/subscriptions/${encodeURIComponent(productId)}` +
    `/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) {
    const texto = await r.text();
    throw new Error(`[play] acknowledge HTTP ${r.status}: ${texto.slice(0, 300)}`);
  }
  console.info("[play] compra reconocida · %s", productId);
}

/* ──────────────────────────── las reglas ──────────────────────────── */

/**
 * Estados en los que la persona pagó y el período está corriendo.
 *
 * `CANCELED` entra y no es un descuido: en la API v2 significa "apagó la
 * renovación automática", no "se le cortó el acceso" — el mes que pagó lo
 * tiene hasta que termine. `IN_GRACE_PERIOD` es el cobro de la renovación que
 * falló y que Google sigue intentando, y durante esos días Google pide que la
 * persona conserve el acceso.
 *
 * Quedan afuera `PENDING` (todavía no pagó: así llega un pago en efectivo sin
 * acreditar), `ON_HOLD`, `PAUSED` y `EXPIRED`.
 */
const ESTADOS_BUENOS = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  "SUBSCRIPTION_STATE_CANCELED",
]);

/**
 * Si lo que contestó Google habilita activar el plan, y si hay que reconocer.
 *
 * Es una función aparte y sin red adentro porque es la parte que decide, y la
 * parte que decide tiene que poder probarse sin levantar un Google de mentira.
 * Devuelve `{ ok, motivo, hayQueReconocer, vence }`; `motivo` es para mostrar.
 */
export function revisarSuscripcion(sub, { productId, paquete = PAQUETE } = {}) {
  const no = (motivo) => ({ ok: false, motivo, hayQueReconocer: false, vence: null });
  if (!sub || typeof sub !== "object") return no("Google no reconoce esa compra.");

  // El paquete va en la URL, así que esto es un cinturón sobre el tirante: si
  // la respuesta lo trae y no es el nuestro, algo está muy mal y no se activa.
  if (sub.packageName && String(sub.packageName) !== String(paquete)) {
    return no("Esa compra no es de esta app.");
  }

  const estado = String(sub.subscriptionState || "");
  if (!ESTADOS_BUENOS.has(estado)) {
    return no(`Esa suscripción no está activa (${estado || "sin estado"}).`);
  }

  // El producto que dice la app tiene que ser el que se compró. Sin esto, un
  // token de Emprendedor pagado alcanza para pedir que se active Max.
  const lineas = Array.isArray(sub.lineItems) ? sub.lineItems : [];
  const linea = lineas.find((l) => String(l?.productId || "") === String(productId));
  if (!linea) return no("Esa compra no corresponde al plan pedido.");

  return {
    ok: true,
    motivo: null,
    // Google manda `ACKNOWLEDGEMENT_STATE_PENDING` cuando todavía no se
    // reconoció. Cualquier otra cosa —incluso un estado que no conozcamos— se
    // trata como "ya está": reconocer dos veces no rompe nada, pero es un
    // viaje de más en cada reintento de la app.
    hayQueReconocer: String(sub.acknowledgementState || "") === "ACKNOWLEDGEMENT_STATE_PENDING",
    vence: linea.expiryTime ? String(linea.expiryTime) : null,
    // Una compra de un probador autorizado no cobra nada y llega igual que una
    // real. Se activa —probar tiene que recorrer lo mismo que un cliente— pero
    // queda gritada en el log, como el cobro de prueba de PagoPar, para que al
    // revisar la facturación no haya que adivinar por qué entró un Max gratis.
    prueba: sub.testPurchase != null,
  };
}

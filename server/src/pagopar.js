/**
 * Plomería de PagoPar.
 *
 * Este archivo viene de `tienda-aguara-vulka`, donde ya pasó por la pelea real
 * con PagoPar. Se copió tal cual a propósito: lo que tiene adentro son cosas
 * que no se deducen de la documentación y se aprenden fallando —que `respuesta`
 * a veces llega como el texto `"false"`, que `resultado` a veces llega como un
 * string JSON, que una clave pegada del panel puede traer un BOM invisible, y
 * la forma exacta en que PHP escribe el monto dentro de la firma—.
 *
 * Reescribirlo habría sido volver a tropezar con todo eso. Si se arregla algo
 * acá, conviene llevarlo también a la otra repo.
 *
 * No tiene nada de Zentra: es PagoPar y nada más. Lo nuestro vive en
 * `suscripciones.js`.
 */
import crypto from "node:crypto";

/** Hosts documentados para checkout / API de medios de pago (producción). */
export const PAGOPAR_OFFICIAL_PRODUCTION_API_BASE = "https://api.pagopar.com";
export const PAGOPAR_OFFICIAL_PRODUCTION_CHECKOUT_BASE = "https://www.pagopar.com/pagos";

/** Ruta oficial iniciar transacción 2.0 (misma en ambos entornos si PagoPar te da otro host base). */
export const PAGOPAR_INICIAR_TRANSACCION_PATH = "/api/comercios/2.0/iniciar-transaccion";

/** Quita espacios, BOM y comillas típicas al pegar claves desde el panel PagoPar. */
export function stripPagoparSecret(raw) {
  let s = String(raw ?? "").trim();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** Vista parcial de claves en logs (pública o privada). */
export function maskPagoparCredential(key) {
  const s = String(key || "");
  if (!s) return "(vacía)";
  if (s.length <= 8) return `*** (${s.length} chars)`;
  return `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} chars)`;
}

function trimBaseUrl(u) {
  return String(u || "")
    .trim()
    .replace(/\/+$/, "");
}

/**
 * `production` (default) | `staging`.
 * staging: dev, test, desarrollo
 */
export function normalizePagoparEnv(raw) {
  const s = String(raw || "production").trim().toLowerCase();
  if (["staging", "stage", "development", "dev", "test", "desarrollo"].includes(s)) {
    return "staging";
  }
  return "production";
}

let cachedPagoparEndpoints = null;

/**
 * Resuelve API + checkout según PAGOPAR_ENV sin mezclar reglas:
 *
 * - **production**: por defecto hosts oficiales documentados. Opcional override con
 *   `PAGOPAR_API_BASE_URL` / `PAGOPAR_CHECKOUT_BASE_URL` (mismo par para tu despliegue).
 * - **staging**: obligatorio definir `PAGOPAR_API_BASE_URL` y `PAGOPAR_CHECKOUT_BASE_URL`
 *   (URLs que te indique soporte PagoPar), **o** `PAGOPAR_STAGING_USE_OFFICIAL_HOSTS=1` si
 *   probás con credenciales de prueba contra los mismos hosts públicos (caso habitual en la KB).
 */
export function getPagoparEndpoints() {
  if (cachedPagoparEndpoints) return cachedPagoparEndpoints;

  const env = normalizePagoparEnv(process.env.PAGOPAR_ENV);
  const apiOverride = trimBaseUrl(process.env.PAGOPAR_API_BASE_URL);
  const checkoutOverride = trimBaseUrl(process.env.PAGOPAR_CHECKOUT_BASE_URL);
  const stagingOfficial =
    String(process.env.PAGOPAR_STAGING_USE_OFFICIAL_HOSTS || "").trim() === "1";

  if (env === "production") {
    const apiBase = apiOverride || PAGOPAR_OFFICIAL_PRODUCTION_API_BASE;
    const checkoutBase = checkoutOverride || PAGOPAR_OFFICIAL_PRODUCTION_CHECKOUT_BASE;
    cachedPagoparEndpoints = {
      env: "production",
      apiBase,
      checkoutBase,
      iniciarTransaccionUrl: `${apiBase}${PAGOPAR_INICIAR_TRANSACCION_PATH}`,
      stagingUsesOfficialHosts: false,
    };
    return cachedPagoparEndpoints;
  }

  if (apiOverride && checkoutOverride) {
    cachedPagoparEndpoints = {
      env: "staging",
      apiBase: apiOverride,
      checkoutBase: checkoutOverride,
      iniciarTransaccionUrl: `${apiOverride}${PAGOPAR_INICIAR_TRANSACCION_PATH}`,
      stagingUsesOfficialHosts: false,
    };
    return cachedPagoparEndpoints;
  }

  if (stagingOfficial) {
    cachedPagoparEndpoints = {
      env: "staging",
      apiBase: PAGOPAR_OFFICIAL_PRODUCTION_API_BASE,
      checkoutBase: PAGOPAR_OFFICIAL_PRODUCTION_CHECKOUT_BASE,
      iniciarTransaccionUrl: `${PAGOPAR_OFFICIAL_PRODUCTION_API_BASE}${PAGOPAR_INICIAR_TRANSACCION_PATH}`,
      stagingUsesOfficialHosts: true,
    };
    return cachedPagoparEndpoints;
  }

  throw new Error(
    "[pagopar] PAGOPAR_ENV=staging: configurá ambas URLs (PAGOPAR_API_BASE_URL y PAGOPAR_CHECKOUT_BASE_URL) " +
      "según lo que te indique PagoPar, o bien PAGOPAR_STAGING_USE_OFFICIAL_HOSTS=1 si usás credenciales de prueba " +
      "contra los hosts oficiales api.pagopar.com / www.pagopar.com."
  );
}

export function sha1Hex(str) {
  return crypto.createHash("sha1").update(str, "utf8").digest("hex");
}

/**
 * Equivalente a PHP `strval(floatval($monto))` para concatenar en el token de iniciar-transacción.
 * Debe usarse con el mismo valor numérico que se envía en `monto_total` del JSON.
 */
export function phpStrvalFloatval(monto) {
  const n = Number(monto);
  if (!Number.isFinite(n)) throw new Error(`Monto inválido: ${monto}`);
  if (n < 0) throw new Error(`Monto inválido: ${monto}`);
  const f = parseFloat(n);
  const asInt = Math.round(f);
  if (Math.abs(f - asInt) < 1e-9) {
    return String(asInt);
  }
  let s = f.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  return s || "0";
}

/**
 * Partes exactas que entran en SHA1 (misma lógica que buildStartTransactionToken).
 * `plaintextConcat` solo para depuración local; no loguear en producción.
 */
export function getPagoparIniciarTransaccionTokenInputParts(privateKey, idPedidoComercio, montoTotal) {
  const pk = stripPagoparSecret(privateKey);
  const idStr = String(idPedidoComercio);
  const amountStr = phpStrvalFloatval(montoTotal);
  return {
    privateKeySanitizedLength: pk.length,
    idStr,
    amountStr,
    plaintextConcat: `${pk}${idStr}${amountStr}`,
  };
}

/**
 * Documentación PagoPar: sha1(private_key + idPedido + strval(floatval(monto_total)))
 * idPedido = mismo valor que `id_pedido_comercio` en el cuerpo (como string en la concatenación).
 */
export function buildStartTransactionToken(privateKey, idPedidoComercio, montoTotal) {
  const { plaintextConcat } = getPagoparIniciarTransaccionTokenInputParts(
    privateKey,
    idPedidoComercio,
    montoTotal
  );
  return sha1Hex(plaintextConcat);
}

export function buildGenericToken(privateKey, suffix) {
  return sha1Hex(`${stripPagoparSecret(privateKey)}${suffix}`);
}

/** Laravel krugerdavid/laravel-pagopar: sha1(private_key + hash) */
export function verifyWebhookToken(privateKey, hashPedido, tokenRecibido) {
  if (!hashPedido || !tokenRecibido || !privateKey) return false;
  const expected = sha1Hex(`${stripPagoparSecret(privateKey)}${hashPedido}`);
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(String(tokenRecibido), "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return expected === String(tokenRecibido);
  }
}

/** PagoPar a veces devuelve `respuesta` como string `"false"` / `"true"`. */
export function isPagoparRespuestaOk(respuesta) {
  if (respuesta === true) return true;
  const s = String(respuesta ?? "").trim().toLowerCase();
  return s === "true" || s === "t" || s === "1";
}

/**
 * @param {object} options
 * @param {boolean} [options.omitRequestBodyInPagoparModuleLog] — si true, no vuelve a loguear el body (ya logueado en create-payment).
 */
export async function iniciarTransaccion(payload, options = {}) {
  const { omitRequestBodyInPagoparModuleLog = false } = options;
  const { iniciarTransaccionUrl } = getPagoparEndpoints();
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  const bodyStr = JSON.stringify(payload);
  console.info("[pagopar][debug] POST", iniciarTransaccionUrl);
  console.info("[pagopar][debug] headers", JSON.stringify(headers));
  if (omitRequestBodyInPagoparModuleLog) {
    console.info("[pagopar][debug] body omitido aquí (ver [create-payment][pagopar-iniciar]); length=", bodyStr.length);
  } else {
    console.info("[pagopar][debug] body (string length)", bodyStr.length, bodyStr.slice(0, 8000));
  }
  const res = await fetch(iniciarTransaccionUrl, {
    method: "POST",
    headers,
    body: bodyStr,
  });
  const text = await res.text();
  console.info("[pagopar][debug] http status", res.status, "response", text.slice(0, 8000));
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`PagoPar no devolvió JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`PagoPar HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

export function checkoutUrlFromHash(hashPedido) {
  const { checkoutBase } = getPagoparEndpoints();
  const h = String(hashPedido || "").replace(/^\/+/, "");
  return `${checkoutBase.replace(/\/+$/, "")}/${h}`;
}

/** Path oficial: POST …/api/pedidos/1.1/traer (mismo host base que `iniciar-transaccion`). */
export const PAGOPAR_PEDIDOS_TRAER_PATH = "/api/pedidos/1.1/traer";

/**
 * PagoPar envía a veces `resultado` como string JSON, array u objeto; devuelve el primer ítem
 * o el objeto, para mapear `pagado` / `cancelado` como en el webhook.
 * @param {unknown} resultado
 * @returns {object | null}
 */
export function getFirstItemFromResultadoValue(resultado) {
  let r = resultado;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      return null;
    }
  }
  if (r == null) return null;
  if (Array.isArray(r)) {
    return r[0] && typeof r[0] === "object" ? r[0] : null;
  }
  if (typeof r === "object") {
    return r;
  }
  return null;
}

/**
 * Misma lógica que el webhook: `first` = ítem de `resultado` o cuerpo de respuesta.
 * @param {object | null} first
 * @param {object} body
 * @returns {"paid" | "failed" | "pending"}
 */
export function mapPagoparItemToOrderPaymentStatus(first, body) {
  const f = first && typeof first === "object" ? first : {};
  const b = body && typeof body === "object" ? body : {};
  const pagado =
    f.pagado === true ||
    f.pagado === "t" ||
    f.pagado === "true" ||
    String(f.estado_transaccion) === "1" ||
    String(b.pagado) === "true";
  const cancelado =
    f.cancelado === true ||
    f.cancelado === "t" ||
    f.cancelado === "true" ||
    String(b.cancelado) === "true";
  if (pagado) return "paid";
  if (cancelado) return "failed";
  return "pending";
}

/**
 * @param {string} hashPedido
 * @param {{ privateKey: string, publicKey: string }} keys
 */
export async function consultarPedidoPagopar(hashPedido, keys) {
  const h = String(hashPedido || "").trim();
  if (!h) throw new Error("hash_pedido requerido");
  const { apiBase } = getPagoparEndpoints();
  const base = String(apiBase || "")
    .trim()
    .replace(/\/+$/, "");
  const url = `${base}${PAGOPAR_PEDIDOS_TRAER_PATH}`;
  const privateKey = stripPagoparSecret(keys.privateKey);
  const publicKey = stripPagoparSecret(keys.publicKey);
  if (!privateKey || !publicKey) {
    throw new Error("Faltan claves PagoPar (pública / privada)");
  }
  const token = buildGenericToken(keys.privateKey, "CONSULTA");
  const payload = {
    hash_pedido: h,
    token,
    token_publico: publicKey,
  };
  console.info("[pagopar/consulta] POST", url, { hash_prefix: h.slice(0, 6) + "…" });
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.warn("[pagopar/consulta] HTTP", res.status, text.slice(0, 800));
    throw new Error(`PagoPar traer HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`PagoPar traer: no es JSON: ${text.slice(0, 200)}`);
  }
  return data;
}

/** POST …/api/forma-pago/1.1/traer/ — token: sha1(private_key + "FORMA-PAGO") */
export const PAGOPAR_FORMA_PAGO_TRAER_PATH = "/api/forma-pago/1.1/traer";

/**
 * @param {unknown} data
 * @returns {object[]}
 */
function extractResultadoArrayForFormaPago(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const row = /** @type {Record<string, unknown>} */ (data);
  let r = row.resultado;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      return [];
    }
  }
  if (r == null) return [];
  if (Array.isArray(r)) return r.filter((x) => x && typeof x === "object");
  if (typeof r === "object") return [r];
  return [];
}

/**
 * @param {object} o
 */
function normalizeFormaPagoItem(o) {
  if (!o || typeof o !== "object") return null;
  const raw = o;
  const idRaw = raw.forma_pago ?? raw.formaPago;
  if (idRaw === undefined || idRaw === null) return null;
  const idNum = Number(idRaw);
  if (!Number.isFinite(idNum)) return null;
  const mMin = raw.monto_minimo ?? raw.montoMinimo;
  const pCom = raw.porcentaje_comision ?? raw.porcentajeComision;
  return {
    id: Math.floor(idNum),
    title: String(raw.titulo ?? raw.title ?? "").trim() || "Método de pago",
    description: String(raw.descripcion ?? raw.description ?? "").trim(),
    min_amount: mMin != null && mMin !== "" && !Number.isNaN(Number(mMin)) ? Number(mMin) : null,
    commission_percent: pCom != null && pCom !== "" && !Number.isNaN(Number(pCom)) ? Number(pCom) : null,
  };
}

/**
 * Lista de formas de pago (endpoint 1.1/traer).
 * @param {{ privateKey: string, publicKey: string }} keys
 */
export async function traerFormasPagoPagopar(keys) {
  const { apiBase } = getPagoparEndpoints();
  const base = String(apiBase || "")
    .trim()
    .replace(/\/+$/, "");
  let path = PAGOPAR_FORMA_PAGO_TRAER_PATH.trim();
  if (!path.startsWith("/")) path = `/${path}`;
  if (!path.endsWith("/")) path = `${path}/`;
  const url = `${base}${path}`;
  const publicKey = stripPagoparSecret(keys.publicKey);
  const privateKey = stripPagoparSecret(keys.privateKey);
  if (!privateKey || !publicKey) {
    throw new Error("Faltan claves PagoPar (pública / privada)");
  }
  const token = buildGenericToken(keys.privateKey, "FORMA-PAGO");
  const payload = { token, token_publico: publicKey };
  console.info("[pagopar/forma-pago] POST", url);
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.warn("[pagopar/forma-pago] HTTP", res.status, text.slice(0, 600));
    throw new Error(`PagoPar forma-pago HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`PagoPar forma-pago: respuesta no JSON: ${text.slice(0, 200)}`);
  }
  const items = extractResultadoArrayForFormaPago(data);
  if (items.length === 0 && !isPagoparRespuestaOk(data && data.respuesta)) {
    const msg = data && data.mensaje != null ? String(data.mensaje) : "respuesta no ok o sin resultados";
    console.warn("[pagopar/forma-pago] API respuesta", msg);
    throw new Error(msg);
  }
  const methods = [];
  for (const it of items) {
    const n = normalizeFormaPagoItem(/** @type {object} */ (it));
    if (n) methods.push(n);
  }
  return { ok: true, methods, raw: data };
}

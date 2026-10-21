/**
 * La compra de iOS, de punta a punta.
 *
 *   npm run test:apple
 *
 * Levanta el server contra un Supabase de mentira y recorre lo que pasa cuando
 * alguien aprieta "Suscribirme" en un iPhone.
 *
 * Existe porque este camino no se puede probar a mano sin pagar: una compra de
 * la App Store de verdad pasa por App Store Connect, un probador de sandbox y
 * una compilación firmada. Lo que se prueba acá es lo que, cuando está mal, se
 * nota meses después y en la plata: un comprobante falsificado que activa un
 * plan, o una renovación que se trata como repetida y no empuja la fecha.
 *
 * No hace falta un Apple de mentira —esa es la diferencia con Play—: el
 * comprobante viene firmado, así que acá se firma uno con la cadena de
 * `test-apple-cadena.mjs` y se le dice al server que confíe en esa raíz. La
 * prueba que importa es la de al lado: la misma cadena, contra la raíz de
 * Apple de verdad, tiene que ser rechazada.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { setTimeout as esperar } from "node:timers/promises";

import { CLAVE_FIRMANTE, FIRMANTE, INTERMEDIO, RAIZ } from "./test-apple-cadena.mjs";
import { planDeProducto, revisarTransaccion, verificarJws } from "./src/apple.js";

const casos = [];
const t = (n, f) => casos.push([n, f]);

const PUERTO_FALSO = 8896;
const PUERTO_SERVER = 8897;
const PUERTO_SIN_CONFIG = 8898;
const BUNDLE = "py.com.zentra.movil.nativo";

/* ───────────────────── armar comprobantes firmados ───────────────────── */

const b64url = (x) => Buffer.from(x).toString("base64url");
/** El `x5c` del JWS es el certificado en base64 común, sin las líneas de guiones. */
const pelado = (pem) => pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");

const laRaiz = new crypto.X509Certificate(RAIZ);

/**
 * Un comprobante como el que entrega StoreKit: cabecera con la cadena, cuerpo
 * con la transacción, y la firma ES256 encima de los dos.
 */
function firmar(cuerpo, { cadena = [FIRMANTE, INTERMEDIO, RAIZ], alg = "ES256", clave = CLAVE_FIRMANTE } = {}) {
  const cab = b64url(JSON.stringify({ alg, x5c: cadena.map(pelado) }));
  const cue = b64url(JSON.stringify(cuerpo));
  const firma = crypto
    .sign("sha256", Buffer.from(`${cab}.${cue}`), { key: clave, dsaEncoding: "ieee-p1363" })
    .toString("base64url");
  return `${cab}.${cue}.${firma}`;
}

let numero = 2_000_000_001;
const DIA = 86_400_000;

/** Una transacción de suscripción activa, con lo que manda Apple de verdad. */
const compra = (extra = {}) => ({
  transactionId: String(numero++),
  originalTransactionId: "2000000001",
  bundleId: BUNDLE,
  productId: "zentra_emprendedor_mensual",
  type: "Auto-Renewable Subscription",
  purchaseDate: Date.now(),
  expiresDate: Date.now() + 30 * DIA,
  quantity: 1,
  inAppOwnershipType: "PURCHASED",
  environment: "Production",
  ...extra,
});

/* ──────────────── el módulo solo, sin server ni base ──────────────── */

t("un producto que no conocemos no cae a ningún plan", () => {
  if (planDeProducto("zentra_max_mensual") !== "max") throw new Error("no reconoció Max");
  if (planDeProducto("zentra_emprendedor_mensual") !== "emprendedor") throw new Error("no reconoció Emprendedor");
  if (planDeProducto("zentra_max_anual") !== null) throw new Error("aceptó un id que no existe");
  if (planDeProducto("") !== null) throw new Error("aceptó vacío");
  // Lo que `Object.freeze` no tapa y `hasOwn` sí.
  if (planDeProducto("constructor") !== null) throw new Error("aceptó constructor");
  if (planDeProducto("__proto__") !== null) throw new Error("aceptó __proto__");
});

t("un comprobante bien firmado se lee", () => {
  const tx = compra();
  const leido = verificarJws(firmar(tx), { raiz: laRaiz });
  if (leido.transactionId !== tx.transactionId) throw new Error("leyó otra transacción");
  if (leido.productId !== tx.productId) throw new Error("leyó otro producto");
});

t("la misma cadena, contra la raíz de Apple de verdad, se rechaza", () => {
  // Esta es la prueba que importa. Sin ella, todo lo demás comprueba nada más
  // que un comprobante está firmado por quien lo firmó.
  let tiro = null;
  try {
    verificarJws(firmar(compra()));
  } catch (e) {
    tiro = e.message;
  }
  if (!tiro) throw new Error("aceptó una cadena que no es de Apple");
  if (!/raíz de Apple/i.test(tiro)) throw new Error("falló por otra cosa: " + tiro);
});

t("si le cambian el cuerpo, la firma no cierra", () => {
  const jws = firmar(compra({ productId: "zentra_emprendedor_mensual" }));
  const [cab, , firma] = jws.split(".");
  // El truco más obvio: pagar Emprendedor y pedir Max cambiando una palabra.
  const trucho = b64url(JSON.stringify(compra({ productId: "zentra_max_mensual" })));
  let tiro = null;
  try {
    verificarJws(`${cab}.${trucho}.${firma}`, { raiz: laRaiz });
  } catch (e) {
    tiro = e.message;
  }
  if (!tiro) throw new Error("aceptó un cuerpo cambiado");
  if (!/no cierra/i.test(tiro)) throw new Error("falló por otra cosa: " + tiro);
});

t("una firma con otra clave no pasa", () => {
  const otra = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey;
  let tiro = null;
  try {
    verificarJws(firmar(compra(), { clave: otra }), { raiz: laRaiz });
  } catch (e) {
    tiro = e.message;
  }
  if (!tiro) throw new Error("aceptó una firma ajena");
});

t("alg distinto de ES256 no pasa", () => {
  for (const alg of ["none", "HS256", "RS256"]) {
    let tiro = null;
    try {
      verificarJws(firmar(compra(), { alg }), { raiz: laRaiz });
    } catch (e) {
      tiro = e.message;
    }
    // Con `none` la firma sobraría, y con un simétrico la clave para firmar
    // sería la pública, que viaja adentro del mismo mensaje.
    if (!tiro) throw new Error("aceptó alg=" + alg);
    if (!/ES256/.test(tiro)) throw new Error("alg=" + alg + " falló por otra cosa: " + tiro);
  }
});

t("una cadena cortada no pasa", () => {
  // El firmante y la raíz, sin el intermedio: la firma del primero es buena,
  // pero nadie dice que venga de la raíz.
  let tiro = null;
  try {
    verificarJws(firmar(compra(), { cadena: [FIRMANTE, RAIZ] }), { raiz: laRaiz });
  } catch (e) {
    tiro = e.message;
  }
  if (!tiro) throw new Error("aceptó una cadena cortada");
  if (!/se corta/i.test(tiro)) throw new Error("falló por otra cosa: " + tiro);
});

t("un comprobante que no es un JWS muere con un error que se entiende", () => {
  for (const basura of ["", "abc", "a.b", "a.b.c.d", "....", null, undefined, {}]) {
    let tiro = null;
    try {
      verificarJws(basura, { raiz: laRaiz });
    } catch (e) {
      tiro = e.message;
    }
    if (!tiro) throw new Error("aceptó " + JSON.stringify(basura));
    if (!/\[apple\]/.test(tiro)) throw new Error("error sin contexto: " + tiro);
  }
});

t("las reglas de la transacción", () => {
  const id = "zentra_emprendedor_mensual";
  const bien = revisarTransaccion(compra(), { productId: id, bundle: BUNDLE });
  if (!bien.ok) throw new Error("rechazó una compra buena: " + bien.motivo);
  if (!bien.referencia) throw new Error("no devolvió referencia");
  if (!bien.vence) throw new Error("no devolvió vencimiento");
  if (bien.prueba) throw new Error("tomó una de producción por una de prueba");

  const mal = [
    ["una compra de otra app", compra({ bundleId: "py.com.zentra.movil" }), /no es de esta app/i],
    ["un producto que no es el pedido", compra({ productId: "zentra_max_mensual" }), /no corresponde/i],
    ["una compra que no es suscripción", compra({ type: "Consumable" }), /no es una suscripción/i],
    ["una compra devuelta", compra({ revocationDate: Date.now() }), /devuelta/i],
    ["una suscripción vencida", compra({ expiresDate: Date.now() - DIA }), /venció/i],
    ["sin fecha de vencimiento", compra({ expiresDate: 0 }), /hasta cuándo/i],
    ["sin número de transacción", compra({ transactionId: "" }), /número de transacción/i],
    ["nada", null, /no pudimos leer/i],
  ];
  for (const [que, tx, espera] of mal) {
    const r = revisarTransaccion(tx, { productId: id, bundle: BUNDLE });
    if (r.ok) throw new Error("aceptó " + que);
    if (!espera.test(r.motivo)) throw new Error(que + " · dijo: " + r.motivo);
  }

  // Una compra de sandbox se activa —probar tiene que recorrer lo mismo que un
  // cliente— pero queda marcada.
  const caja = revisarTransaccion(compra({ environment: "Sandbox" }), { productId: id, bundle: BUNDLE });
  if (!caja.ok) throw new Error("rechazó una compra de sandbox");
  if (!caja.prueba) throw new Error("no marcó la compra de sandbox");
});

/* ──────────────── el server, con un Supabase de mentira ──────────────── */

/** Lo que pidió cada parte, para poder afirmar sobre eso. */
const pedidos = [];
const rutas = () => pedidos.map((p) => p.ruta);

/** Los pagos ya registrados, por referencia: así se ve el `repetido` de verdad. */
const pagados = new Set();
/** Los cobros creados, para ver que la referencia es el `transactionId`. */
const cobros = [];
/**
 * Cobros que ya estaban en la base antes de la prueba, por referencia.
 *
 * Hace falta para los avisos: una renovación sólo se puede atribuir a una
 * empresa si el cobro de la primera compra existe. Arranca vacío para no
 * cambiarle la respuesta a ninguna prueba vieja.
 */
const sembrados = new Map();

const falso = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  pedidos.push({ metodo: req.method, ruta: url.pathname, query: url.search, cuerpo });

  const json = (o, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(o));
  };

  // ---- Supabase: quién es el dueño del token de sesión
  if (url.pathname === "/auth/v1/user") {
    if (String(req.headers.authorization || "") !== "Bearer sesion-buena") {
      return json({ error: "invalid token" }, 401);
    }
    return json({ id: "u-1", email: "karen@zentra.py" });
  }
  // ---- Supabase (PostgREST)
  if (url.pathname === "/rest/v1/planes") {
    return json(
      [
        { codigo: "emprendedor", nombre: "Emprendedor", precio_mensual: "49000.00", vendible: true },
        { codigo: "max", nombre: "Max", precio_mensual: "89000.00", vendible: true },
      ].filter((p) => !url.search.includes("codigo=eq.") || url.search.includes("codigo=eq." + p.codigo)),
    );
  }
  if (url.pathname === "/rest/v1/usuarios") {
    return json([{ empresa_id: "e-1", nombre: "Karen", email: "karen@zentra.py" }]);
  }
  if (url.pathname === "/rest/v1/empresas") {
    return json([{ id: "e-1", nombre: "Neura", ruc: "", plan: "free", vence: null }]);
  }
  if (url.pathname === "/rest/v1/cobros") {
    if (req.method === "POST") {
      cobros.push(JSON.parse(cuerpo || "{}"));
      return json([{ id: "c-" + cobros.length }], 201);
    }
    if (req.method === "PATCH") return json([]);
    const m = /referencia=eq\.([^&]+)/.exec(url.search);
    const fila = sembrados.get(m ? decodeURIComponent(m[1]) : "");
    return json(fila ? [fila] : []); // si no está sembrado, no hay cobro previo
  }
  if (url.pathname === "/rest/v1/rpc/registrar_pago_pasarela") {
    const d = JSON.parse(cuerpo || "{}");
    // Lo mismo que hace la clave única `(pasarela, referencia)` de `pagos`.
    const clave = d.p_pasarela + "·" + d.p_hash;
    if (pagados.has(clave)) {
      return json([{ resultado: "repetido", empresa: "e-1", vence: "2026-11-18" }]);
    }
    pagados.add(clave);
    return json([{ resultado: "pagado", empresa: "e-1", vence: "2026-11-18" }]);
  }
  return json({}, 404);
});

await new Promise((r) => falso.listen(PUERTO_FALSO, "127.0.0.1", r));

const base = "http://127.0.0.1:" + PUERTO_FALSO;
const comun = {
  ...process.env,
  HOST: "127.0.0.1",
  SUPABASE_URL: base,
  SUPABASE_SERVICE_ROLE_KEY: "service",
  PAGOPAR_PUBLIC_KEY: "pub",
  PAGOPAR_PRIVATE_KEY: "priv",
  PAGOPAR_ENV: "staging",
  PAGOPAR_API_BASE_URL: base,
  PAGOPAR_CHECKOUT_BASE_URL: base + "/pagos",
  // La raíz de mentira. Es lo único que hace que los comprobantes firmados
  // acá sirvan, y por eso hay una prueba de que sin esto no sirven.
  APPLE_ROOT_CA_PEM: RAIZ,
};

const levantar = (env) => {
  const h = spawn(process.execPath, ["src/index.js"], {
    cwd: new URL(".", import.meta.url).pathname,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  h.stdout.on("data", (d) => (salida += d));
  h.stderr.on("data", (d) => (salida += d));
  return h;
};

let salida = "";
const hijo = levantar({ ...comun, PORT: String(PUERTO_SERVER), APPLE_BUNDLE_ID: BUNDLE });
// El mismo server con la raíz ilegible: es la mitad de una prueba.
//
// Vaciar `APPLE_BUNDLE_ID` no sirve para esto, y es a propósito: tiene valor
// por omisión, así que un despliegue que se lo olvide igual cobra bien. La
// falla de verdad es ésta —que no se pueda leer el certificado con el que se
// comprueban las firmas—, y es la que tiene que apagar el camino entero en vez
// de dejarlo aceptando lo que venga.
const hijoSinConfig = levantar({
  ...comun,
  PORT: String(PUERTO_SIN_CONFIG),
  APPLE_ROOT_CA_PEM: "esto no es un certificado",
});

for (const puerto of [PUERTO_SERVER, PUERTO_SIN_CONFIG]) {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${puerto}/apple/health`);
      break;
    } catch {
      await esperar(100);
    }
  }
}

const SRV = "http://127.0.0.1:" + PUERTO_SERVER;

const verificar = (cuerpo, { sesion = "sesion-buena", puerto = PUERTO_SERVER } = {}) =>
  fetch(`http://127.0.0.1:${puerto}/apple/verificar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sesion ? { Authorization: "Bearer " + sesion } : {}),
    },
    body: JSON.stringify(cuerpo),
  });

t("sin sesión no se activa nada", async () => {
  const antes = pedidos.length;
  const r = await verificar({ productId: "zentra_max_mensual", comprobante: firmar(compra()) }, { sesion: "" });
  if (r.status !== 401) throw new Error("status " + r.status);
  // Quién es sale del token: sin token no hay a quién activarle nada, y no se
  // toca la base ni para averiguarlo.
  const despues = rutas().slice(antes).filter((x) => x.startsWith("/rest"));
  if (despues.length) throw new Error("tocó la base: " + despues);
});

t("una sesión que no existe tampoco", async () => {
  const r = await verificar(
    { productId: "zentra_max_mensual", comprobante: firmar(compra()) },
    { sesion: "sesion-inventada" },
  );
  if (r.status !== 401) throw new Error("status " + r.status);
});

t("un producto que no conocemos se rechaza antes de mirar el comprobante", async () => {
  const antes = pedidos.length;
  const r = await verificar({ productId: "zentra_gratis_para_siempre", comprobante: firmar(compra()) });
  if (r.status !== 400) throw new Error("status " + r.status);
  const d = await r.json();
  if (!/no existe/i.test(d.error || "")) throw new Error("dijo: " + d.error);
  if (rutas().slice(antes).includes("/rest/v1/cobros")) throw new Error("creó un cobro igual");
});

t("un comprobante inventado no deja rastro en la base", async () => {
  const antes = pedidos.length;
  const r = await verificar({
    productId: "zentra_max_mensual",
    comprobante: firmar(compra({ productId: "zentra_max_mensual" }), {
      clave: crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey,
    }),
  });
  if (r.status !== 402) throw new Error("status " + r.status);
  const nuevas = rutas().slice(antes);
  if (nuevas.includes("/rest/v1/cobros")) throw new Error("creó un cobro");
  if (nuevas.includes("/rest/v1/rpc/registrar_pago_pasarela")) throw new Error("registró un pago");
});

t("una compra buena activa el plan, con el precio de la base", async () => {
  const tx = compra({ productId: "zentra_max_mensual" });
  const r = await verificar({ productId: "zentra_max_mensual", comprobante: firmar(tx) });
  if (r.status !== 200) throw new Error("status " + r.status + " · " + (await r.text()));
  const d = await r.json();
  if (d.plan !== "max") throw new Error("activó " + d.plan);
  if (d.repetido) throw new Error("dijo repetido la primera vez");
  if (!d.vence) throw new Error("no devolvió vencimiento");

  const cobro = cobros.at(-1);
  // La referencia es el `transactionId`, no el JWS entero: el comprobante son
  // miles de caracteres y cambia de forma cuando Apple rota sus certificados.
  if (cobro.referencia !== tx.transactionId) throw new Error("referencia " + cobro.referencia);
  if (cobro.pasarela !== "apple") throw new Error("pasarela " + cobro.pasarela);
  // El monto sale de `zentra.planes`, nunca del cuerpo del pedido: Apple cobra
  // lo suyo en el teléfono y nosotros no vemos ese número.
  if (Number(cobro.monto) !== 89000) throw new Error("monto " + cobro.monto);
  if (cobro.empresa_id !== "e-1") throw new Error("empresa " + cobro.empresa_id);
});

t("la misma compra dos veces no empuja la fecha dos veces", async () => {
  const tx = compra();
  const jws = firmar(tx);
  const uno = await (await verificar({ productId: tx.productId, comprobante: jws })).json();
  if (uno.repetido) throw new Error("la primera ya dijo repetido");
  // La app reintenta sola: Apple le vuelve a ofrecer la transacción sin
  // terminar cada vez que arranca, así que esto pasa de verdad y seguido.
  const dos = await (await verificar({ productId: tx.productId, comprobante: jws })).json();
  if (!dos.repetido) throw new Error("no lo tomó por repetido");
  if (dos.plan !== uno.plan) throw new Error("cambió de plan en el reintento");
});

t("una renovación sí empuja la fecha", async () => {
  // Mismo `originalTransactionId`, `transactionId` nuevo: es lo que manda
  // Apple el mes que viene. Si se usara el original como referencia, esto
  // daría repetido y el cliente pagaría un mes que no se le acredita.
  const primera = compra();
  await verificar({ productId: primera.productId, comprobante: firmar(primera) });
  const renovacion = compra({
    originalTransactionId: primera.originalTransactionId,
    expiresDate: Date.now() + 60 * DIA,
  });
  const d = await (await verificar({ productId: renovacion.productId, comprobante: firmar(renovacion) })).json();
  if (d.repetido) throw new Error("tomó la renovación por repetida");
});

t("una compra de sandbox se activa y queda gritada en el registro", async () => {
  const antes = salida.length;
  const tx = compra({ environment: "Sandbox" });
  const r = await verificar({ productId: tx.productId, comprobante: firmar(tx) });
  if (r.status !== 200) throw new Error("status " + r.status);
  // Para que al revisar la facturación no haya que adivinar por qué entró un
  // plan sin plata.
  if (!/entorno de pruebas/i.test(salida.slice(antes))) throw new Error("no lo dijo en el registro");
});

t("una compra de la otra app se rechaza", async () => {
  const tx = compra({ bundleId: "py.com.zentra.movil" });
  const r = await verificar({ productId: tx.productId, comprobante: firmar(tx) });
  if (r.status !== 402) throw new Error("status " + r.status);
  const d = await r.json();
  if (!/no es de esta app/i.test(d.error || "")) throw new Error("dijo: " + d.error);
});

t("pagar Emprendedor y pedir Max no alcanza", async () => {
  const tx = compra({ productId: "zentra_emprendedor_mensual" });
  const r = await verificar({ productId: "zentra_max_mensual", comprobante: firmar(tx) });
  if (r.status !== 402) throw new Error("status " + r.status);
  const d = await r.json();
  if (!/no corresponde/i.test(d.error || "")) throw new Error("dijo: " + d.error);
});

t("si no se puede leer la raíz, contesta error y no activa", async () => {
  const antes = pedidos.length;
  const tx = compra();
  const r = await verificar({ productId: tx.productId, comprobante: firmar(tx) }, { puerto: PUERTO_SIN_CONFIG });
  if (r.status !== 500) throw new Error("status " + r.status);
  const d = await r.json();
  if (!/no están configurados/i.test(d.error || "")) throw new Error("dijo: " + d.error);
  if (pedidos.slice(antes).length) throw new Error("habló con alguien: " + rutas().slice(antes));
  // Y lo dice en el health, para que se vea sin tener que comprar nada.
  const h = await (await fetch(`http://127.0.0.1:${PUERTO_SIN_CONFIG}/apple/health`)).json();
  if (h.ok !== false || !h.problema) throw new Error("el health dice que está todo bien");
});

t("el health dice de qué app son las compras y avisa de la raíz cambiada", async () => {
  const h = await (await fetch(SRV + "/apple/health")).json();
  if (h.ok !== true) throw new Error("dice que falta algo: " + h.problema);
  if (h.apple.bundle !== BUNDLE) throw new Error("bundle " + h.apple.bundle);
  if (!h.productos.zentra_max_mensual) throw new Error("no dice qué productos acepta");
  // La prueba corre con la raíz cambiada, y eso no puede pasar desapercibido.
  if (!h.apple.ojo) throw new Error("no avisa que la raíz no es la de Apple");
  if (!/APPLE_ROOT_CA_PEM/.test(salida)) throw new Error("no lo avisó al arrancar");
});

/* ──────────────────── los avisos que manda Apple ──────────────────── */

/** Un aviso firmado, con la transacción firmada adentro. */
const aviso = ({ tipo = "DID_RENEW", subtipo = "", tx = compra(), bundle = BUNDLE, entorno } = {}) =>
  firmar({
    notificationType: tipo,
    ...(subtipo ? { subtype: subtipo } : {}),
    notificationUUID: "uuid-" + Math.random().toString(16).slice(2),
    version: "2.0",
    signedDate: Date.now(),
    data: {
      bundleId: bundle,
      environment: entorno || (tx?.environment ?? "Production"),
      ...(tx ? { signedTransactionInfo: firmar(tx) } : {}),
    },
  });

const avisar = (firmado, { puerto = PUERTO_SERVER } = {}) =>
  fetch(`http://127.0.0.1:${puerto}/apple/avisos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedPayload: firmado }),
  });

t("un aviso sin firma de Apple no mueve nada", async () => {
  const otra = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const falsificado = firmar({ notificationType: "DID_RENEW", data: { bundleId: BUNDLE } }, { clave: otra.privateKey });
  const antes = cobros.length;
  const r = await avisar(falsificado);
  // 400 y no 500: reintentarlo no lo va a volver legítimo.
  if (r.status !== 400) throw new Error("status " + r.status);
  if (cobros.length !== antes) throw new Error("creó un cobro con una firma ajena");
});

t("un aviso de otra app se rechaza sin tocar la base", async () => {
  const antes = cobros.length;
  const r = await avisar(aviso({ tx: compra({ bundleId: "com.otra.app" }), bundle: "com.otra.app" }));
  if (r.status !== 400) throw new Error("status " + r.status);
  if (cobros.length !== antes) throw new Error("creó un cobro para otra app");
});

t("una renovación empuja la fecha de la empresa del cobro original", async () => {
  sembrados.set("2000000777", { id: "c-viejo", empresa_id: "e-1", plan: "emprendedor", estado: "pagado", hash_pedido: "2000000777" });
  const tx = compra({ transactionId: "3000000777", originalTransactionId: "2000000777" });
  const r = await avisar(aviso({ tx }));
  const j = await r.json();
  if (r.status !== 200 || j.accion !== "renovar") throw new Error("status " + r.status + " " + JSON.stringify(j));
  if (j.resultado !== "pagado") throw new Error("resultado " + j.resultado);
  // La referencia del cobro nuevo es el `transactionId` de ESTA renovación, no
  // el original: con el original, el segundo mes chocaría contra la clave
  // única y la fecha no se movería.
  const ultimo = cobros.at(-1);
  if (ultimo?.referencia !== "3000000777") throw new Error("referencia " + ultimo?.referencia);
  if (ultimo?.empresa_id !== "e-1") throw new Error("empresa " + ultimo?.empresa_id);
});

t("el mismo aviso dos veces no cobra dos meses", async () => {
  sembrados.set("2000000888", { id: "c-viejo-2", empresa_id: "e-1", plan: "emprendedor", estado: "pagado", hash_pedido: "2000000888" });
  const tx = compra({ transactionId: "3000000888", originalTransactionId: "2000000888" });
  const firmado = aviso({ tx });
  const uno = await (await avisar(firmado)).json();
  const dos = await (await avisar(firmado)).json();
  if (uno.resultado !== "pagado") throw new Error("la primera no pagó: " + uno.resultado);
  // Apple reenvía el mismo aviso hasta que le contesten 200, así que esto pasa
  // siempre, no es un caso raro.
  if (dos.resultado !== "repetido") throw new Error("la segunda no es repetido: " + dos.resultado);
});

t("una renovación sin cobro original no inventa una empresa, y avisa", async () => {
  const antes = cobros.length;
  const tx = compra({ transactionId: "3000000999", originalTransactionId: "2000000999" });
  const r = await avisar(aviso({ tx }));
  const j = await r.json();
  // 200 porque reintentar no va a hacer aparecer el cobro, pero sin activar
  // nada: no hay a quién atribuirle el mes.
  if (r.status !== 200 || j.accion !== "nada") throw new Error(JSON.stringify(j));
  if (cobros.length !== antes) throw new Error("creó un cobro sin saber de quién era");
  // Una RENOVACION sin cobro previo si es un problema: esa suscripción se
  // renueva sin que nadie empuje la fecha.
  await esperar(150);
  if (!/OJO: una renovación sin cobro previo/.test(salida)) throw new Error("no lo marcó como problema");
});

t("el alta sin cobro previo no grita: la app verifica unos segundos despues", async () => {
  // Apple avisa ANTES de que la app mande el comprobante, asi que en toda
  // compra nueva este aviso llega sin cobro. Si gritara, cada alta dejaria
  // una alarma por algo que funciona.
  const tx = compra({ transactionId: "3000000ccc", originalTransactionId: "2000000ccc" });
  const j = await (await avisar(aviso({ tipo: "SUBSCRIBED", subtipo: "INITIAL_BUY", tx }))).json();
  if (j.accion !== "nada") throw new Error("accion " + j.accion);
  await esperar(150);
  if (!/normal en el alta/.test(salida)) throw new Error("no lo explicó en el registro");
});

t("una devolución no se arregla sola pero queda gritada", async () => {
  sembrados.set("2000000aaa", { id: "c-viejo-3", empresa_id: "e-1", plan: "max", estado: "pagado", hash_pedido: "2000000aaa" });
  const antes = cobros.length;
  const tx = compra({ transactionId: "3000000aaa", originalTransactionId: "2000000aaa", revocationDate: Date.now() });
  const j = await (await avisar(aviso({ tipo: "REFUND", tx }))).json();
  if (j.accion !== "mirar") throw new Error("accion " + j.accion);
  if (cobros.length !== antes) throw new Error("tocó la plata");
  if (!/REVISAR A MANO/.test(salida)) throw new Error("no quedó en el registro");
});

t("los avisos que no mueven plata se contestan y se ignoran", async () => {
  const antes = cobros.length;
  for (const tipo of ["DID_CHANGE_RENEWAL_STATUS", "EXPIRED", "DID_FAIL_TO_RENEW", "TEST"]) {
    const r = await avisar(aviso({ tipo, tx: tipo === "TEST" ? null : compra() }));
    const j = await r.json();
    // 200 siempre: si no, Apple reintenta durante días un aviso que está bien.
    if (r.status !== 200 || j.accion !== "nada") throw new Error(tipo + " → " + r.status + " " + JSON.stringify(j));
  }
  // Que alguien apague la renovación o que una suscripción venza no le corta
  // el acceso a nadie: el plan se cae solo a `free` cuando pasa la fecha.
  if (cobros.length !== antes) throw new Error("alguno movió la plata");
});

t("una renovación vencida o devuelta no empuja la fecha", async () => {
  sembrados.set("2000000bbb", { id: "c-viejo-4", empresa_id: "e-1", plan: "emprendedor", estado: "pagado", hash_pedido: "2000000bbb" });
  const antes = cobros.length;
  for (const extra of [{ expiresDate: Date.now() - DIA }, { revocationDate: Date.now() }, { type: "Consumable" }]) {
    const tx = compra({ transactionId: "4" + Math.random().toString().slice(2, 11), originalTransactionId: "2000000bbb", ...extra });
    const j = await (await avisar(aviso({ tx }))).json();
    if (j.accion !== "nada") throw new Error(JSON.stringify(extra) + " → " + j.accion);
  }
  if (cobros.length !== antes) throw new Error("activó algo que no correspondía");
});

t("sin configurar, el aviso se guarda para después en vez de perderse", async () => {
  const r = await avisar(aviso(), { puerto: PUERTO_SIN_CONFIG });
  // 500 a propósito: Apple reintenta. Un 200 acá perdería un mes pago.
  if (r.status !== 500) throw new Error("status " + r.status);
});

let malas = 0;
for (const [n, f] of casos) {
  try {
    await f();
    console.log("  OK · " + n);
  } catch (e) {
    malas++;
    console.log("  FALLA · " + n + "\n        " + e.message);
  }
}

hijo.kill();
hijoSinConfig.kill();
falso.close();
if (malas) console.log("\n--- salida del server ---\n" + salida.slice(-2000));
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nApp Store: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

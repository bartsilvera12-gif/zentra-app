/**
 * La compra de Android, de punta a punta.
 *
 *   npm run test:play
 *
 * Levanta el server contra un Google y un Supabase de mentira y recorre lo que
 * pasa cuando alguien aprieta "Suscribirme" en el teléfono.
 *
 * Existe porque este camino no se puede probar a mano sin pagar: una compra de
 * Play de verdad pasa por Play Console, un probador autorizado y un APK
 * firmado. Lo que se prueba acá es lo que, cuando está mal, se nota meses
 * después y en la plata: un token falsificado que activa un plan, o una compra
 * que nunca se reconoce y que Google reembolsa sola a los tres días.
 *
 * No necesita red, ni Google, ni Supabase: los dos se reemplazan por un
 * servidor local que contesta lo que contestarían ellos.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { setTimeout as esperar } from "node:timers/promises";

const casos = [];
const t = (n, f) => casos.push([n, f]);

const PUERTO_FALSO = 8893;
const PUERTO_SERVER = 8894;
const PUERTO_SIN_CONFIG = 8895;
const PAQUETE = "py.com.zentra.movil";

/** La clave de la cuenta de servicio, generada acá: nunca hay una de verdad. */
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" });

/** Lo que pidió cada parte, para poder afirmar sobre eso. */
const pedidos = [];
const rutas = () => pedidos.map((p) => p.ruta);

/**
 * Qué contesta Google por cada token. La prueba lo va cambiando.
 * `null` = Google no lo reconoce (404), que es lo que recibe un token inventado.
 */
const compras = new Map();

const activa = (productId, extra = {}) => ({
  subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
  acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
  latestOrderId: "GPA.1234",
  lineItems: [{ productId, expiryTime: "2026-11-15T03:00:00Z" }],
  ...extra,
});

/** Los pagos ya registrados, por referencia: así se ve el `repetido` de verdad. */
const pagados = new Set();

const falso = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  pedidos.push({ metodo: req.method, ruta: url.pathname, query: url.search, cuerpo });

  const json = (o, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(o));
  };

  // ---- Google: cambiar el JWT firmado por un access token
  if (url.pathname === "/token") {
    const assertion = new URLSearchParams(cuerpo).get("assertion") || "";
    const [cab, cue, firma] = assertion.split(".");
    const ok =
      cab &&
      cue &&
      crypto.verify(
        "RSA-SHA256",
        Buffer.from(`${cab}.${cue}`),
        publicKey,
        Buffer.from(firma || "", "base64url"),
      );
    // Si el JWT no está bien firmado, Google contesta esto y nada más.
    if (!ok) return json({ error: "invalid_grant" }, 400);
    return json({ access_token: "ya29.de-mentira", expires_in: 3600, token_type: "Bearer" });
  }

  // ---- Google: la suscripción
  const mGet = url.pathname.match(
    /^\/androidpublisher\/v3\/applications\/([^/]+)\/purchases\/subscriptionsv2\/tokens\/(.+)$/,
  );
  if (mGet) {
    if (String(req.headers.authorization || "") !== "Bearer ya29.de-mentira") {
      return json({ error: { message: "sin credenciales" } }, 401);
    }
    // El paquete va en la URL: Google sólo contesta por la app autorizada.
    if (decodeURIComponent(mGet[1]) !== PAQUETE) return json({ error: { message: "app ajena" } }, 404);
    const sub = compras.get(decodeURIComponent(mGet[2]));
    if (!sub) return json({ error: { message: "purchaseToken no encontrado" } }, 404);
    return json(sub);
  }

  // ---- Google: reconocer la compra
  if (url.pathname.endsWith(":acknowledge")) return json({});

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
        { codigo: "emprendedor", nombre: "Emprendedor", precio_mensual: "80000.00", vendible: true },
        { codigo: "max", nombre: "Max", precio_mensual: "150000.00", vendible: true },
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
    if (req.method === "POST") return json([{ id: "c-1" }], 201);
    return json([]); // todavía no hay cobro para esa referencia
  }
  if (url.pathname === "/rest/v1/rpc/registrar_pago_pasarela") {
    const d = JSON.parse(cuerpo || "{}");
    // Lo mismo que hace la clave única `(pasarela, referencia)` de `pagos`.
    const clave = d.p_pasarela + "·" + d.p_hash;
    if (pagados.has(clave)) {
      return json([{ resultado: "repetido", empresa: "e-1", vence: "2026-11-15" }]);
    }
    pagados.add(clave);
    return json([{ resultado: "pagado", empresa: "e-1", vence: "2026-11-15" }]);
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
  PLAY_API_BASE_URL: base,
  PLAY_OAUTH_URL: base + "/token",
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
const hijo = levantar({
  ...comun,
  PORT: String(PUERTO_SERVER),
  PLAY_PACKAGE_NAME: PAQUETE,
  PLAY_SERVICE_ACCOUNT_EMAIL: "zentra-play@proyecto.iam.gserviceaccount.com",
  PLAY_SERVICE_ACCOUNT_KEY: PEM,
});
// El mismo server sin las credenciales de Play: es la mitad de una prueba.
const hijoSinConfig = levantar({
  ...comun,
  PORT: String(PUERTO_SIN_CONFIG),
  PLAY_SERVICE_ACCOUNT_EMAIL: "",
  PLAY_SERVICE_ACCOUNT_KEY: "",
});

for (const puerto of [PUERTO_SERVER, PUERTO_SIN_CONFIG]) {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${puerto}/play/health`);
      break;
    } catch {
      await esperar(100);
    }
  }
}

const SRV = "http://127.0.0.1:" + PUERTO_SERVER;

const verificar = (cuerpo, { sesion = "sesion-buena", puerto = PUERTO_SERVER } = {}) =>
  fetch(`http://127.0.0.1:${puerto}/play/verificar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sesion ? { Authorization: "Bearer " + sesion } : {}),
    },
    body: JSON.stringify(cuerpo),
  });

const rpcs = () => pedidos.filter((p) => p.ruta === "/rest/v1/rpc/registrar_pago_pasarela");
const acks = () => pedidos.filter((p) => p.ruta.endsWith(":acknowledge"));

t("sin sesión no se verifica nada", async () => {
  const antes = pedidos.length;
  const r = await verificar({ productId: "zentra_max_mensual", purchaseToken: "tok-1" }, { sesion: "" });
  if (r.status !== 401) throw new Error("status " + r.status);
  if (pedidos.slice(antes).some((p) => p.ruta.includes("androidpublisher"))) {
    throw new Error("le preguntó a Google sin saber quién pide");
  }
});

t("un comprobante que Google rechaza no activa nada", async () => {
  // El caso central: el `purchaseToken` sale de un APK y se puede inventar.
  const antes = pedidos.length;
  const r = await verificar({ productId: "zentra_max_mensual", purchaseToken: "tok-inventado" });
  if (r.status === 200) throw new Error("activó una compra que no existe");
  const d = await r.json();
  if (!d.error) throw new Error("no dice el motivo");
  if (pedidos.slice(antes).some((p) => p.ruta === "/rest/v1/rpc/registrar_pago_pasarela")) {
    throw new Error("registró el pago igual");
  }
  if (pedidos.slice(antes).some((p) => p.metodo === "POST" && p.ruta === "/rest/v1/cobros")) {
    throw new Error("dejó un cobro abierto por una compra inexistente");
  }
});

t("un producto desconocido se rechaza sin molestar a Google", async () => {
  const antes = pedidos.length;
  compras.set("tok-raro", activa("zentra_plan_inventado"));
  const r = await verificar({ productId: "zentra_plan_inventado", purchaseToken: "tok-raro" });
  if (r.status !== 400) throw new Error("status " + r.status);
  if (pedidos.slice(antes).some((p) => p.ruta.includes("androidpublisher"))) {
    throw new Error("fue a preguntar por un producto que no es nuestro");
  }
  // Y no se cae a ningún plan: ni el más barato.
  if (pedidos.slice(antes).some((p) => p.ruta === "/rest/v1/rpc/registrar_pago_pasarela")) {
    throw new Error("activó un plan por un producto desconocido");
  }
});

t("una compra de otra app se rechaza", async () => {
  compras.set("tok-ajeno", activa("zentra_max_mensual", { packageName: "com.otra.app" }));
  const r = await verificar({ productId: "zentra_max_mensual", purchaseToken: "tok-ajeno" });
  if (r.status === 200) throw new Error("activó una compra de otra app");
  const d = await r.json();
  if (!/no es de esta app/i.test(d.error || "")) throw new Error("dijo: " + d.error);
});

t("una suscripción que no está activa no activa el plan", async () => {
  // Así llega un pago en efectivo que todavía no se acreditó.
  compras.set("tok-pendiente", {
    ...activa("zentra_max_mensual"),
    subscriptionState: "SUBSCRIPTION_STATE_PENDING",
  });
  const r = await verificar({ productId: "zentra_max_mensual", purchaseToken: "tok-pendiente" });
  if (r.status === 200) throw new Error("activó una compra sin pagar");
});

t("un comprobante de otro plan no sirve para pedir el plan caro", async () => {
  compras.set("tok-barato", activa("zentra_emprendedor_mensual"));
  const r = await verificar({ productId: "zentra_max_mensual", purchaseToken: "tok-barato" });
  if (r.status === 200) throw new Error("pagó Emprendedor y se llevó Max");
});

t("una compra buena activa el plan y dice hasta cuándo", async () => {
  compras.set("tok-ok", activa("zentra_max_mensual"));
  const r = await verificar({ productId: "zentra_max_mensual", purchaseToken: "tok-ok" });
  if (r.status !== 200) throw new Error("status " + r.status + " · " + (await r.text()));
  const d = await r.json();
  if (d.ok !== true) throw new Error("no dijo ok: " + JSON.stringify(d));
  if (d.plan !== "max") throw new Error("activó " + d.plan);
  if (d.vence !== "2026-11-15") throw new Error("no dice hasta cuándo: " + d.vence);
});

t("el monto sale de la base y no del cuerpo del pedido", async () => {
  // Mandar un monto no tiene que cambiar nada: si no, cualquiera parchea el
  // APK y se compra un mes de Max por mil guaraníes.
  compras.set("tok-monto", activa("zentra_max_mensual"));
  await verificar({
    productId: "zentra_max_mensual",
    purchaseToken: "tok-monto",
    monto: 1000,
    precio: 1000,
    plan: "emprendedor",
  });
  const rpc = rpcs().find((p) => p.cuerpo.includes("tok-monto"));
  if (!rpc) throw new Error("no registró el pago");
  const d = JSON.parse(rpc.cuerpo);
  if (Number(d.p_monto) !== 150000) throw new Error("registró " + d.p_monto);
  if (d.p_pasarela !== "play") throw new Error("pasarela " + d.p_pasarela);
  // Y el cobro que se crea antes lleva el monto del plan, no el del cuerpo.
  const cobro = pedidos.find(
    (p) => p.metodo === "POST" && p.ruta === "/rest/v1/cobros" && p.cuerpo.includes("tok-monto"),
  );
  if (!cobro) throw new Error("no creó el cobro previo");
  const c = JSON.parse(cobro.cuerpo);
  if (Number(c.monto) !== 150000) throw new Error("el cobro quedó en " + c.monto);
  if (c.plan !== "max") throw new Error("el cobro quedó en el plan " + c.plan);
  // El `purchaseToken` tiene que quedar como hash: es por el que pregunta
  // `registrar_pago_pasarela`. Sin eso, el pago no encuentra su cobro.
  if (c.hash_pedido !== "tok-monto") throw new Error("sin hash: " + cobro.cuerpo);
});

t("se reconoce la compra cuando Google dice que falta", async () => {
  // Una compra sin reconocer se la reembolsa Google sola a los tres días.
  compras.set("tok-sin-reconocer", {
    ...activa("zentra_emprendedor_mensual"),
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
  });
  const antes = acks().length;
  const r = await verificar({
    productId: "zentra_emprendedor_mensual",
    purchaseToken: "tok-sin-reconocer",
  });
  if (r.status !== 200) throw new Error("status " + r.status + " · " + (await r.text()));
  const nuevos = acks().slice(antes);
  if (nuevos.length !== 1) throw new Error("llamó a acknowledge " + nuevos.length + " veces");
  if (!nuevos[0].ruta.includes("zentra_emprendedor_mensual")) {
    throw new Error("reconoció otro producto: " + nuevos[0].ruta);
  }
});

t("una compra ya reconocida no se vuelve a reconocer", async () => {
  compras.set("tok-reconocida", activa("zentra_max_mensual"));
  const antes = acks().length;
  const r = await verificar({ productId: "zentra_max_mensual", purchaseToken: "tok-reconocida" });
  if (r.status !== 200) throw new Error("status " + r.status);
  if (acks().length !== antes) throw new Error("reconoció una compra que ya estaba reconocida");
});

t("mandar dos veces el mismo comprobante no activa dos veces", async () => {
  // La app reintenta: después de un corte de red, al reinstalar, al restaurar
  // compras. Lo que no puede pasar es que cada intento empuje la fecha.
  compras.set("tok-doble", activa("zentra_max_mensual"));
  const una = await (await verificar({ productId: "zentra_max_mensual", purchaseToken: "tok-doble" })).json();
  const otra = await (await verificar({ productId: "zentra_max_mensual", purchaseToken: "tok-doble" })).json();
  if (una.ok !== true || otra.ok !== true) throw new Error("el reintento no contestó ok");
  if (otra.repetido !== true) throw new Error("no se dio cuenta de que era repetido");
  if (otra.vence !== una.vence) throw new Error("la fecha se movió en el reintento");
  const cuantos = rpcs().filter((p) => p.cuerpo.includes("tok-doble")).length;
  if (cuantos !== 2) throw new Error("llamó " + cuantos + " veces a la función");
  // Dos llamadas, un solo pago: lo decide la base, no el código del server.
  const insertados = pedidos.filter(
    (p) => p.metodo === "POST" && p.ruta === "/rest/v1/cobros" && p.cuerpo.includes("tok-doble"),
  ).length;
  if (insertados !== 2) throw new Error("cobros creados: " + insertados);
});

t("el token de Google se pide una vez y se guarda", async () => {
  // Sin esto, cada verificación serían dos viajes a Google y una firma RSA.
  const cuantos = pedidos.filter((p) => p.ruta === "/token").length;
  if (cuantos !== 1) throw new Error("pidió " + cuantos + " access tokens");
});

t("sin credenciales configuradas, contesta error y no activa", async () => {
  const antes = pedidos.length;
  compras.set("tok-sin-config", activa("zentra_max_mensual"));
  const r = await verificar(
    { productId: "zentra_max_mensual", purchaseToken: "tok-sin-config" },
    { puerto: PUERTO_SIN_CONFIG },
  );
  if (r.status !== 500) throw new Error("status " + r.status);
  const d = await r.json();
  if (!/no están configurados/i.test(d.error || "")) throw new Error("dijo: " + d.error);
  if (pedidos.slice(antes).length) throw new Error("habló con alguien: " + rutas().slice(antes));
  // Y lo dice en el health, para que se vea sin tener que comprar nada.
  const h = await (await fetch(`http://127.0.0.1:${PUERTO_SIN_CONFIG}/play/health`)).json();
  if (h.ok !== false || !h.problema) throw new Error("el health dice que está todo bien");
});

t("el health no muestra la clave privada", async () => {
  const h = await (await fetch(SRV + "/play/health")).json();
  if (h.ok !== true) throw new Error("dice que falta algo: " + h.problema);
  if (h.play.paquete !== PAQUETE) throw new Error("paquete " + h.play.paquete);
  if (JSON.stringify(h).includes("PRIVATE KEY")) throw new Error("se filtró la clave");
  if (!h.productos.zentra_max_mensual) throw new Error("no dice qué productos acepta");
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
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nGoogle Play: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

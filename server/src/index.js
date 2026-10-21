/**
 * El server de cobros de Zentra.
 *
 * Mismo molde que el de `tienda-aguara-vulka`: Express chico en la VPS, bajo
 * `/pagopar`, con las claves en el `.env` de la VPS y Supabase como base.
 *
 * Los endpoints que hacen el trabajo:
 *
 *   POST /pagopar/crear-cobro   la persona quiere pagar → devuelve a dónde ir
 *   POST /pagopar/webhook       PagoPar avisa que pagó  → empuja el vencimiento
 *   POST /play/verificar        la app compró en Android → empuja el vencimiento
 *   POST /apple/verificar       la app compró en iOS     → empuja el vencimiento
 *   POST /apple/avisos          Apple avisa que renovó   → empuja el vencimiento
 *
 * La diferencia con la tienda es qué se vende: allá un pedido de ropa, acá un
 * mes de suscripción. Por eso lo que hace el webhook no es marcar un pedido
 * como pagado sino empujar una fecha.
 *
 * Son tres cajas y una sola fecha. En la web cobra PagoPar, en Android cobra
 * Google y en iOS cobra Apple, porque adentro de la app ni Google ni Apple
 * dejan cobrar por otro lado; pero las tres terminan en
 * `registrar_pago_pasarela`, que es lo único que mueve `empresas.vence`. Si
 * cada caja activara a su manera, el día que se arregle una las otras van a
 * quedar viejas y la fecha va a depender de por dónde pagó cada cliente.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";

import {
  buildStartTransactionToken,
  checkoutUrlFromHash,
  getPagoparEndpoints,
  iniciarTransaccion,
  isPagoparRespuestaOk,
  maskPagoparCredential,
  stripPagoparSecret,
  verifyWebhookToken,
} from "./pagopar.js";
import {
  configPlayALaVista,
  faltaConfigPlay,
  PLANES_POR_PRODUCTO,
  planDeProducto,
  reconocerCompra,
  revisarSuscripcion,
  traerSuscripcion,
} from "./play.js";
import {
  configAppleALaVista,
  faltaConfigApple,
  PLANES_POR_PRODUCTO as PRODUCTOS_DE_APPLE,
  planDeProducto as planDeProductoApple,
  quePideElAviso,
  revisarTransaccion,
  verificarAviso,
  verificarJws,
} from "./apple.js";
import {
  cobroPendiente,
  cobroPorHash,
  cobroPorReferencia,
  configurada,
  crearCobro,
  entrarConClave,
  guardarHash,
  perfilDe,
  planesVendibles,
  planVendible,
  registrarPago,
  usuarioDelToken,
} from "./db.js";
import {
  paginaEliminarCuenta,
  paginaPagar,
  paginaPrivacidad,
  paginaResultado,
  paginaSoporte,
} from "./pagina.js";
import { esCobroDePrueba } from "./cobro-prueba.js";

const PORT = Number(process.env.PORT || 8790);
/**
 * A qué interfaz se asoma.
 *
 * Por defecto sólo a la de adentro (`127.0.0.1`), que en una VPS nueva es la
 * diferencia entre un servicio al que sólo llega el proxy y uno que cualquiera
 * en internet puede golpear directo por el puerto. Si hace falta exponerlo
 * —un contenedor, por ejemplo, donde el proxy vive en otra red— se pone
 * `HOST=0.0.0.0` a conciencia y con firewall.
 */
const HOST = (process.env.HOST || "127.0.0.1").trim();
const PUBLICA = stripPagoparSecret(process.env.PAGOPAR_PUBLIC_KEY);
const PRIVADA = stripPagoparSecret(process.env.PAGOPAR_PRIVATE_KEY);
const ORIGENES = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * El camino de prueba: mismo plan, monto chico. Las reglas viven en
 * `cobro-prueba.js`; acá sólo se leen del entorno.
 */
const CLAVE_PRUEBA = String(process.env.COBRO_PRUEBA_CLAVE || "").trim();
const MONTO_PRUEBA = Number(process.env.COBRO_PRUEBA_MONTO || 1000);

const esPrueba = (clave) => esCobroDePrueba(CLAVE_PRUEBA, MONTO_PRUEBA, clave);

/** Cuántas horas tiene la persona para pagar antes de que el pedido caduque. */
const HORAS = Number(process.env.PAGOPAR_HORAS_PARA_PAGAR || 48);

const app = express();
app.disable("x-powered-by");

// El aviso puede llegar como JSON, como formulario o como texto. Se toma el
// cuerpo crudo antes de parsearlo, porque hay que devolvérselo igual.
app.use("/pagopar/webhook", express.raw({ type: "*/*", limit: "1mb" }), (req, _res, next) => {
  if (Buffer.isBuffer(req.body)) {
    req.rawBody = req.body.toString("utf8");
    try {
      req.body = JSON.parse(req.rawBody);
    } catch {
      const params = new URLSearchParams(req.rawBody);
      const obj = {};
      let huboPayload = false;
      for (const [k, v] of params) {
        obj[k] = v;
        if (k === "payload" || k === "data" || k === "body") {
          try {
            req.body = JSON.parse(v);
            huboPayload = true;
            break;
          } catch {
            /* sigue */
          }
        }
      }
      if (!huboPayload) req.body = Object.keys(obj).length ? obj : req.rawBody;
    }
  }
  next();
});
app.use(express.json({ limit: "1mb" }));
// El formulario de la página de pago llega como `application/x-www-form-urlencoded`.
app.use(express.urlencoded({ extended: false, limit: "64kb" }));
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (ORIGENES.length === 0) return cb(null, true); // dev: sin filtro
      if (ORIGENES.includes(origin)) return cb(null, true);
      return cb(new Error(`[cors] origen no permitido: ${origin}`));
    },
    credentials: false,
  }),
);

/** Para ver de un vistazo si está todo configurado, sin exponer las claves. */
app.get("/pagopar/health", (_req, res) => {
  let endpoints = null;
  try {
    endpoints = getPagoparEndpoints();
  } catch (e) {
    endpoints = { error: e.message };
  }
  res.json({
    ok: true,
    servicio: "zentra-cobros",
    pagopar: {
      publica: maskPagoparCredential(PUBLICA),
      privada: maskPagoparCredential(PRIVADA),
      endpoints,
    },
    base: configurada() ? "configurada" : "FALTA SUPABASE_URL / SERVICE_ROLE_KEY",
  });
});

function falta() {
  if (!PUBLICA || !PRIVADA) return "faltan las claves de PagoPar";
  if (!configurada()) return "falta la configuración de Supabase";
  return null;
}

/* ──────────────────────────── crear el cobro ──────────────────────────── */

/**
 * Un error con cara de respuesta: el código HTTP y lo que se le muestra a la
 * persona. Lo que no se muestra —el motivo técnico— va al log y nada más.
 */
class ErrorDeCobro extends Error {
  constructor(status, mensaje, faltan) {
    super(mensaje);
    this.status = status;
    this.faltan = faltan;
  }
}

/**
 * Arma el cobro y el pedido en PagoPar, y devuelve a dónde mandar a la persona.
 *
 * Vive fuera de los endpoints porque entran por dos puertas —la app, con su
 * token, y la página web, con correo y contraseña— y lo que pasa después tiene
 * que ser exactamente lo mismo. Partirlo en dos copias es la forma más
 * confiable de que dentro de tres meses una cobre bien y la otra no.
 */
async function iniciarCobro({ usuarioId, email, plan, documento, telefono, clave }) {
  if (!plan) throw new ErrorDeCobro(400, "Falta decir qué plan.");

  const perfil = await perfilDe(usuarioId);
  if (!perfil?.empresa?.id) throw new ErrorDeCobro(400, "Tu usuario no tiene empresa asignada.");

  // El precio sale de la base. Si lo mandara el navegador, cualquiera se
  // compra un mes de Max por mil guaraníes.
  const def = await planVendible(plan);
  if (!def) throw new ErrorDeCobro(400, "Ese plan no está a la venta.");

  // El camino de prueba cobra menos por el mismo plan. Lo unico que cambia es
  // el monto: el plan, la empresa y lo que se activa al pagar son los de
  // siempre, porque si no, probar no probaria nada.
  const prueba = esPrueba(clave);
  const monto = prueba ? MONTO_PRUEBA : def.precio_mensual;
  if (prueba) {
    console.warn(
      "[cobro-prueba] plan=%s monto=%s empresa=%s usuario=%s",
      plan,
      monto,
      perfil.empresa.id,
      usuarioId,
    );
  }

  const nombre = String(perfil.nombre || "").trim() || perfil.empresa.nombre || "";
  const correo = email || perfil.email || "";
  const ruc = String(perfil.empresa.ruc || "").trim();
  const doc = String(documento || "").trim() || ruc;

  // Se dice QUÉ falta, no "datos incompletos": quien lo lee tiene que saber
  // qué cargar para poder seguir.
  const faltan = [];
  if (!nombre) faltan.push("el nombre");
  if (!correo) faltan.push("el correo");
  if (!doc) faltan.push("la cédula o el RUC");
  if (faltan.length) throw new ErrorDeCobro(400, `Para cobrar falta ${faltan.join(" y ")}.`, faltan);

  // Un cobro pendiente reciente se reutiliza en vez de abrir otro pedido.
  const desde = new Date(Date.now() - HORAS * 3600_000).toISOString();
  const previo = await cobroPendiente(perfil.empresa.id, plan, monto, desde);
  if (previo?.hash_pedido) {
    return { url: checkoutUrlFromHash(previo.hash_pedido), monto, plan: def.nombre, reutilizado: true };
  }

  // La referencia se guarda ANTES de hablar con PagoPar. Si la llamada se
  // corta, queda un cobro pendiente sin hash y no pasa nada. Al revés, un
  // corte dejaría plata entrando sin saber de quién es.
  const referencia = "ztr" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const cobroId = await crearCobro({ empresaId: perfil.empresa.id, plan, monto, referencia });

  const vence = new Date(Date.now() + HORAS * 3600_000);
  const dos = (n) => String(n).padStart(2, "0");
  const fechaMax =
    `${vence.getFullYear()}-${dos(vence.getMonth() + 1)}-${dos(vence.getDate())} ` +
    `${dos(vence.getHours())}:${dos(vence.getMinutes())}:${dos(vence.getSeconds())}`;

  const cuerpo = {
    token: buildStartTransactionToken(PRIVADA, referencia, monto),
    public_key: PUBLICA,
    monto_total: monto,
    tipo_pedido: "VENTA-COMERCIO",
    fecha_maxima_pago: fechaMax,
    id_pedido_comercio: referencia,
    descripcion_resumen: `Zentra ${def.nombre} · 1 mes`,
    comprador: {
      ruc,
      email: correo,
      ciudad: Number(process.env.PAGOPAR_ITEM_CIUDAD || 1),
      nombre,
      telefono: String(telefono || "").trim(),
      direccion: "",
      documento: doc,
      coordenadas: "",
      razon_social: perfil.empresa.nombre || "",
      direccion_referencia: "",
      tipo_documento: "CI",
    },
    compras_items: [
      {
        ciudad: Number(process.env.PAGOPAR_ITEM_CIUDAD || 1),
        nombre: `Plan ${def.nombre}`,
        descripcion: "Suscripción mensual a Zentra",
        cantidad: 1,
        categoria: Number(process.env.PAGOPAR_ITEM_CATEGORIA || 909),
        public_key: PUBLICA,
        url_imagen: process.env.PAGOPAR_ITEM_IMAGEN_URL || "",
        id_producto: process.env.PAGOPAR_ITEM_PRODUCTO_ID || plan,
        // Total de la línea, no precio unitario.
        precio_total: monto,
        vendedor_telefono: "",
        vendedor_direccion: "",
        vendedor_direccion_referencia: "",
        vendedor_direccion_coordenadas: "",
      },
    ],
  };

  const data = await iniciarTransaccion(cuerpo);
  if (!isPagoparRespuestaOk(data?.respuesta)) {
    // El mensaje de PagoPar va al log y no a la pantalla: habla de tokens y
    // claves, que no le dice nada a quien sólo quiere pagar.
    const motivo = typeof data?.resultado === "string" ? data.resultado : JSON.stringify(data?.resultado);
    console.error("[cobro] PagoPar rechazó:", motivo);
    throw new ErrorDeCobro(502, "PagoPar no aceptó el pedido. Ya estamos viendo.");
  }

  const fila = Array.isArray(data.resultado) ? data.resultado[0] : data.resultado;
  const hash = String(fila?.data || "").trim();
  if (!hash) {
    console.error("[cobro] PagoPar no devolvió hash:", JSON.stringify(data).slice(0, 300));
    throw new ErrorDeCobro(502, "PagoPar no aceptó el pedido. Ya estamos viendo.");
  }

  // Sin el hash guardado no sabríamos de quién es el pago que entre, así que
  // si esto falla no se manda a nadie a pagar.
  await guardarHash(cobroId, hash);

  console.info(`[cobro] empresa ${perfil.empresa.id} · ${plan} · ${monto} · ${hash}`);
  return { url: checkoutUrlFromHash(hash), monto, plan: def.nombre };
}

app.post("/pagopar/crear-cobro", async (req, res) => {
  const problema = falta();
  if (problema) {
    console.error("[crear-cobro]", problema);
    return res.status(500).json({ error: "Los cobros no están configurados todavía." });
  }

  try {
    // Quién es sale del token, no del cuerpo. Si no, cualquiera crearía un
    // cobro a nombre de otra empresa.
    const auth = String(req.headers.authorization || "");
    const usuario = auth.startsWith("Bearer ") ? await usuarioDelToken(auth.slice(7)) : null;
    if (!usuario) return res.status(401).json({ error: "Iniciá sesión." });

    const r = await iniciarCobro({
      usuarioId: usuario.id,
      email: usuario.email,
      plan: String(req.body?.plan || "").trim(),
      documento: req.body?.documento,
      telefono: req.body?.telefono,
      clave: req.body?.clave,
    });
    return res.json(r);
  } catch (e) {
    if (e instanceof ErrorDeCobro) {
      return res.status(e.status).json({ error: e.message, ...(e.faltan ? { faltan: e.faltan } : {}) });
    }
    console.error("[crear-cobro] error:", e?.message || e);
    return res.status(500).json({ error: "No se pudo iniciar el pago. Probá de nuevo." });
  }
});

/* ─────────────────────── la página donde se paga ─────────────────────── */

/**
 * Cuántos intentos fallidos lleva cada IP.
 *
 * Es un formulario con contraseña asomado a internet: sin esto, probar claves
 * a mano alzada sale gratis. En memoria y nada más —se limpia al reiniciar—
 * porque el objetivo es frenar la fuerza bruta, no llevar un registro.
 */
const intentos = new Map();
const TOPE_INTENTOS = 8;
const VENTANA_MS = 10 * 60 * 1000;

function demasiadosIntentos(ip) {
  const x = intentos.get(ip);
  if (!x) return false;
  if (Date.now() - x.desde > VENTANA_MS) {
    intentos.delete(ip);
    return false;
  }
  return x.n >= TOPE_INTENTOS;
}

function anotarFallo(ip) {
  const x = intentos.get(ip);
  if (!x || Date.now() - x.desde > VENTANA_MS) intentos.set(ip, { n: 1, desde: Date.now() });
  else x.n += 1;
}

/**
 * La politica de privacidad.
 *
 * Google Play no publica una app sin una direccion web publica que la
 * explique, y tiene que seguir en pie despues: si el dia que la revisan da
 * 404, la baja es automatica. Por eso vive en el mismo server que ya esta
 * publicado y andando, y no en un sitio aparte que habria que mantener.
 *
 * No pide sesion ni nada: es para que la lea cualquiera.
 */
app.get("/privacidad", (_req, res) => {
  res.type("html").send(
    paginaPrivacidad({
      whatsapp: process.env.SOPORTE_WHATSAPP || "595973989068",
      email: process.env.CONTACTO_EMAIL || "",
    }),
  );
});

/**
 * Como borrar la cuenta.
 *
 * Google la pide aparte de la politica de privacidad y la muestra en la ficha
 * de Play: tiene que poder abrirla alguien que todavia no instalo la app.
 */
app.get("/eliminar-cuenta", (_req, res) => {
  res.type("html").send(
    paginaEliminarCuenta({
      whatsapp: process.env.SOPORTE_WHATSAPP || "595973989068",
      email: process.env.CONTACTO_EMAIL || "",
    }),
  );
});

/**
 * La pagina de soporte.
 *
 * Apple la pide obligatoria para la ficha y la abre durante la revision. Va
 * al lado de las otras dos por la misma razon: son las tres direcciones que
 * mira la tienda y conviene que vivan juntas.
 */
app.get("/soporte", (_req, res) => {
  res.type("html").send(
    paginaSoporte({
      whatsapp: process.env.SOPORTE_WHATSAPP || "595973989068",
      email: process.env.CONTACTO_EMAIL || "",
    }),
  );
});

app.get("/pagar", async (req, res) => {
  // La clave de prueba viaja en la direccion y vuelve a salir en el
  // formulario: sin eso se perderia al enviar y el pago saldria al precio
  // real, que es el error mas caro que puede cometer esta pagina.
  const clave = String(req.query?.clave || "");
  try {
    const planes = await planesVendibles();
    res.type("html").send(paginaPagar({ planes, clave, prueba: esPrueba(clave) ? MONTO_PRUEBA : 0 }));
  } catch (e) {
    console.error("[pagar] no se pudieron leer los planes:", e?.message || e);
    res.status(500).type("html").send(paginaPagar({ planes: [], error: "No pudimos cargar los planes. Probá en un rato." }));
  }
});

app.post("/pagar", async (req, res) => {
  const email = String(req.body?.email || "").trim();
  const plan = String(req.body?.plan || "").trim();
  const documento = String(req.body?.documento || "").trim();
  const clave = String(req.body?.clave || "");
  const ip = req.ip || "";

  const volver = async (error) => {
    const planes = await planesVendibles().catch(() => []);
    res
      .status(400)
      .type("html")
      .send(paginaPagar({ planes, email, plan, error, clave, prueba: esPrueba(clave) ? MONTO_PRUEBA : 0 }));
  };

  if (falta()) return volver("Los cobros no están configurados todavía.");
  if (demasiadosIntentos(ip)) {
    return volver("Demasiados intentos. Esperá diez minutos y probá de nuevo.");
  }

  try {
    const usuario = await entrarConClave(email, String(req.body?.password || ""));
    if (!usuario) {
      anotarFallo(ip);
      // No se dice si falló el correo o la contraseña: decirlo sirve para
      // averiguar qué correos existen.
      return volver("Correo o contraseña incorrectos.");
    }

    const r = await iniciarCobro({ usuarioId: usuario.id, email: usuario.email, plan, documento, clave });
    // 303 y no 302: después de un POST, el navegador tiene que ir con GET. Si
    // no, volver atrás reenvía el formulario y se crea otro pedido.
    return res.redirect(303, r.url);
  } catch (e) {
    if (e instanceof ErrorDeCobro) return volver(e.message);
    console.error("[pagar] error:", e?.message || e);
    return volver("No se pudo iniciar el pago. Probá de nuevo.");
  }
});

/**
 * La vuelta de PagoPar, que en el panel se configura como
 * `https://.../pagopar/resultado/($hash)`.
 *
 * No decide nada: sólo mira cómo quedó el cobro. Quien lo da por pagado es el
 * aviso firmado, que entra por otro lado.
 */
app.get("/pagopar/resultado/:hash", async (req, res) => {
  const hash = String(req.params.hash || "").trim();
  try {
    const cobro = hash ? await cobroPorHash(hash) : null;
    res.type("html").send(paginaResultado(cobro));
  } catch (e) {
    console.error("[resultado] error:", e?.message || e);
    res.status(500).type("html").send(paginaResultado(null));
  }
});

/* ──────────────────────────── el aviso de pago ──────────────────────────── */

app.post("/pagopar/webhook", async (req, res) => {
  try {
    if (!PRIVADA) {
      // Sin la clave no se puede verificar nada, y dar por bueno un aviso sin
      // verificar sería regalar meses a quien sepa la URL. 500 hace que
      // PagoPar reintente: cuando se configure, el aviso entra solo.
      console.error("[webhook] falta PAGOPAR_PRIVATE_KEY");
      return res.status(500).json({ error: "sin configurar" });
    }

    let src = req.body;
    if (typeof src === "string") {
      try {
        src = JSON.parse(src);
      } catch {
        src = {};
      }
    }
    src = src || {};

    // PagoPar manda a veces el objeto suelto y a veces envuelto en `resultado`.
    let inner = src;
    if (Array.isArray(src)) inner = src[0] || {};
    else if (Array.isArray(src.resultado) && src.resultado[0]) inner = src.resultado[0];

    const hash = String(inner.hash_pedido || inner.hash || "").trim();
    const token = String(inner.token || "").trim();
    const pagado = inner.pagado === true || String(inner.pagado).toLowerCase() === "true";
    const cancelado = inner.cancelado === true || String(inner.cancelado).toLowerCase() === "true";

    console.info("[webhook] recibido", { hash: hash || "(vacío)", pagado, cancelado, tieneToken: !!token });

    if (!hash) return res.status(400).json({ error: "sin hash_pedido" });

    // Se verifica la firma antes de mirar nada más: un aviso sin firmar no
    // merece que lo interpretemos.
    if (!verifyWebhookToken(PRIVADA, hash, token)) {
      console.warn("[webhook] token que no corresponde para", hash);
      return res.status(401).json({ error: "token inválido" });
    }

    if (cancelado || !pagado) {
      // Una reversión llega como `pagado: false` sobre un pedido ya pago. NO se
      // devuelve el mes acá: quitarle el acceso a alguien de golpe, desde un
      // webhook, es demasiado grande para automatizarlo. Queda en el log.
      console.info("[webhook] sin acción:", cancelado ? "cancelado" : "todavía no pago");
      return res.json([inner]);
    }

    const monto = Number(String(inner.monto ?? "").replace(/\s/g, "")) || 0;
    if (monto <= 0) {
      console.error("[webhook] monto ilegible:", inner.monto);
      return res.status(400).json({ error: "monto ilegible" });
    }

    const r = await registrarPago(hash, monto);
    console.info(`[webhook] ${r?.resultado} · empresa ${r?.empresa} · vence ${r?.vence}`);

    // El eco que PagoPar espera. Sin esto reintenta cada 10 minutos para
    // siempre, incluso cuando ya se registró bien.
    return res.json([inner]);
  } catch (e) {
    // Error nuestro: 500 a propósito, para que PagoPar reintente. El pago ya se
    // hizo y no se puede perder.
    console.error("[webhook] error:", e?.message || e);
    return res.status(500).json({ error: "error registrando el pago" });
  }
});

/* ───────────────── la compra hecha adentro de la app Android ───────────────── */

/**
 * Qué falta para poder verificar una compra de Play.
 *
 * Aparte de `falta()` porque son dos caminos independientes: que no estén las
 * claves de PagoPar no tiene por qué apagar los cobros de Android, ni al
 * revés. Lo que sí comparten es la base, que no es opcional en ninguno de los
 * dos.
 */
function faltaPlay() {
  const problema = faltaConfigPlay();
  if (problema) return problema;
  if (!configurada()) return "falta la configuración de Supabase";
  return null;
}

/** Para ver de un vistazo si Play está configurado, sin exponer la clave. */
app.get("/play/health", (_req, res) => {
  const problema = faltaPlay();
  res.json({
    ok: !problema,
    servicio: "zentra-cobros",
    play: configPlayALaVista(),
    // Los productos que la app puede mandar. Cuando Play Console y el código
    // no coinciden, esto se ve de un vistazo en vez de deducirse de un 400.
    productos: PLANES_POR_PRODUCTO,
    base: configurada() ? "configurada" : "FALTA SUPABASE_URL / SERVICE_ROLE_KEY",
    ...(problema ? { problema } : {}),
  });
});

/** Un choque con la clave única `(pasarela, referencia)`, y no otra cosa. */
const esDuplicado = (e) => /\b409\b|duplicate key|23505/i.test(String(e?.message || ""));

/**
 * Verifica la compra con Google y activa el plan.
 *
 * El orden de los pasos no es casual:
 *
 *   1. Google dice si la compra existe y está activa. Hasta acá no se toca la
 *      base: un token inventado no deja ni rastro.
 *   2. Se reconoce la compra. Esto va ANTES de registrar el pago porque es lo
 *      que no se puede perder: una compra sin reconocer en tres días se
 *      reembolsa sola. Si después falla la base, la app reintenta y la segunda
 *      vez Google ya la va a dar por reconocida; al revés —activar primero y
 *      que falle el acknowledge— la plata se iría y el plan quedaría activo.
 *   3. El cobro y el pago, con el monto de `zentra.planes`.
 */
async function activarPorPlay({ usuarioId, productId, purchaseToken }) {
  if (!productId || !purchaseToken) throw new ErrorDeCobro(400, "Falta el producto o el comprobante.");

  const plan = planDeProducto(productId);
  // Un id que no conocemos se rechaza y no se cae a ningún plan: inventar uno
  // por defecto es activar Max porque alguien escribió mal un identificador.
  if (!plan) {
    console.warn("[play] producto desconocido: %s", productId);
    throw new ErrorDeCobro(400, "Ese producto no existe.");
  }

  const perfil = await perfilDe(usuarioId);
  if (!perfil?.empresa?.id) throw new ErrorDeCobro(400, "Tu usuario no tiene empresa asignada.");

  // El precio sale de la base, igual que en la web. Google cobra lo suyo en el
  // teléfono y nosotros no vemos ese monto; lo que se anota en el libro es lo
  // que vale el plan, nunca un número que venga en el cuerpo del pedido.
  const def = await planVendible(plan);
  if (!def) throw new ErrorDeCobro(400, "Ese plan no está a la venta.");

  // Nunca le creemos al cliente que la compra existe: el `purchaseToken` sale
  // de un APK, que se descompila y se parchea.
  const sub = await traerSuscripcion(purchaseToken);
  const revision = revisarSuscripcion(sub, { productId });
  if (!revision.ok) {
    console.warn("[play] rechazada · empresa %s · %s · %s", perfil.empresa.id, productId, revision.motivo);
    throw new ErrorDeCobro(402, revision.motivo);
  }
  if (revision.prueba) {
    console.warn(
      "[play] compra de prueba · plan=%s empresa=%s usuario=%s",
      plan,
      perfil.empresa.id,
      usuarioId,
    );
  }

  if (revision.hayQueReconocer) await reconocerCompra(purchaseToken, { productId });

  // El `purchaseToken` es la referencia y el hash a la vez: es el único
  // identificador que hay, y es el que `registrar_pago_pasarela` busca.
  const previo = await cobroPorReferencia("play", purchaseToken);
  if (!previo) {
    try {
      await crearCobro({
        empresaId: perfil.empresa.id,
        plan,
        monto: def.precio_mensual,
        referencia: purchaseToken,
        pasarela: "play",
        hash: purchaseToken,
      });
    } catch (e) {
      // Dos pedidos del mismo token al mismo tiempo: uno de los dos choca con
      // la clave única y está bien que choque. El cobro ya existe, así que se
      // sigue como si lo hubiéramos encontrado.
      if (!esDuplicado(e)) throw e;
      console.info("[play] el cobro ya existía (dos pedidos a la vez)");
    }
  } else if (!previo.hash_pedido) {
    await guardarHash(previo.id, purchaseToken);
  }

  // La idempotencia de verdad vive acá: la clave única `(pasarela, referencia)`
  // de `zentra.pagos`. Mandar dos veces el mismo token devuelve `repetido` y no
  // empuja la fecha otra vez.
  const r = await registrarPago(purchaseToken, def.precio_mensual, "play");
  if (!r || r.resultado === "desconocido") {
    console.error("[play] registrar_pago_pasarela dijo desconocido para %s", purchaseToken.slice(0, 12));
    throw new ErrorDeCobro(500, "No pudimos registrar la compra. Ya estamos viendo.");
  }

  console.info(
    "[play] %s · empresa %s · %s · %s · vence %s",
    r.resultado,
    perfil.empresa.id,
    plan,
    def.precio_mensual,
    r.vence,
  );
  return { ok: true, plan, vence: r.vence, repetido: r.resultado === "repetido" };
}

app.post("/play/verificar", async (req, res) => {
  const problema = faltaPlay();
  if (problema) {
    // No se activa nada. Un camino de pago que "funciona" sin poder verificar
    // es peor que uno apagado: activa planes contra tokens que nadie miró.
    console.error("[play/verificar]", problema);
    return res.status(500).json({ error: "Los cobros por Google Play no están configurados todavía." });
  }

  try {
    // Quién es sale del token, igual que en `/pagopar/crear-cobro`. Si saliera
    // del cuerpo, con una compra propia se le activaría el plan a cualquiera.
    const auth = String(req.headers.authorization || "");
    const usuario = auth.startsWith("Bearer ") ? await usuarioDelToken(auth.slice(7)) : null;
    if (!usuario) return res.status(401).json({ error: "Iniciá sesión." });

    const r = await activarPorPlay({
      usuarioId: usuario.id,
      productId: String(req.body?.productId || "").trim(),
      purchaseToken: String(req.body?.purchaseToken || "").trim(),
    });
    return res.json(r);
  } catch (e) {
    if (e instanceof ErrorDeCobro) return res.status(e.status).json({ error: e.message });
    // Error nuestro o de Google: 502 y que la app reintente. La compra ya se
    // hizo y la plata ya salió; lo que no puede pasar es que se pierda.
    console.error("[play/verificar] error:", e?.message || e);
    return res.status(502).json({ error: "No pudimos confirmar la compra. Probá de nuevo en un rato." });
  }
});

/* ──────────────────────────── los cobros de iOS ──────────────────────────── */

/**
 * Lo que falta para poder cobrar en iOS.
 *
 * Separado de `faltaPlay()` por lo mismo que ése está separado de PagoPar: un
 * despliegue sin el bundle de iOS no tiene por qué apagar los cobros de
 * Android. La lista es corta porque acá no hay credenciales —la firma de Apple
 * se comprueba contra un certificado público que está en el repositorio—, pero
 * la base sigue sin ser opcional.
 */
function faltaApple() {
  const problema = faltaConfigApple();
  if (problema) return problema;
  if (!configurada()) return "falta la configuración de Supabase";
  return null;
}

/** Para ver de un vistazo si los cobros de iOS están en pie. */
app.get("/apple/health", (_req, res) => {
  const problema = faltaApple();
  res.json({
    ok: !problema,
    servicio: "zentra-cobros",
    apple: configAppleALaVista(),
    // Los productos que la app puede mandar. Cuando App Store Connect y el
    // código no coinciden, esto se ve de un vistazo en vez de deducirse de un
    // 400 que dice "ese producto no existe" sin decir cuáles sí.
    productos: PRODUCTOS_DE_APPLE,
    base: configurada() ? "configurada" : "FALTA SUPABASE_URL / SERVICE_ROLE_KEY",
    ...(problema ? { problema } : {}),
  });
});

/**
 * Verifica la compra de iOS y activa el plan.
 *
 * El orden es el mismo que en Android, con un paso menos:
 *
 *   1. Se comprueba la firma de Apple. Hasta acá no se toca la base: un
 *      comprobante inventado no deja ni rastro, y no hay viaje de red que
 *      alguien pueda hacer esperar.
 *   2. El cobro y el pago, con el monto de `zentra.planes`.
 *
 * El paso que falta es el `acknowledge` de Google, y no falta porque no haga
 * falta: en iOS el equivalente lo hace la app, llamando a `finish()` en la
 * transacción. Lo que importa es cuándo: la app tiene que esperar a que este
 * endpoint conteste bien. Una transacción sin terminar Apple la sigue
 * ofreciendo cada vez que arranca la app —así que un reintento recupera la
 * compra—, y una que se termina antes de que nosotros la hayamos registrado
 * desaparece para siempre con la plata ya cobrada.
 */
async function activarPorApple({ usuarioId, productId, comprobante }) {
  if (!productId || !comprobante) throw new ErrorDeCobro(400, "Falta el producto o el comprobante.");

  const plan = planDeProductoApple(productId);
  // Un id que no conocemos se rechaza y no se cae a ningún plan: inventar uno
  // por defecto es activar Max porque alguien escribió mal un identificador.
  if (!plan) {
    console.warn("[apple] producto desconocido: %s", productId);
    throw new ErrorDeCobro(400, "Ese producto no existe.");
  }

  const perfil = await perfilDe(usuarioId);
  if (!perfil?.empresa?.id) throw new ErrorDeCobro(400, "Tu usuario no tiene empresa asignada.");

  // El precio sale de la base, igual que en la web. Apple cobra lo suyo en el
  // teléfono —en la moneda de la cuenta y con sus impuestos— y nosotros no
  // vemos ese monto; lo que se anota en el libro es lo que vale el plan, nunca
  // un número que venga en el cuerpo del pedido.
  const def = await planVendible(plan);
  if (!def) throw new ErrorDeCobro(400, "Ese plan no está a la venta.");

  // Nunca le creemos al cliente que la compra existe. La diferencia con Play
  // es de dónde sale la certeza: allá de preguntarle a Google, acá de la firma
  // de Apple que el comprobante trae adentro.
  let transaccion;
  try {
    transaccion = verificarJws(comprobante);
  } catch (e) {
    // Una firma que no cierra no es "una compra que no sirve": es alguien
    // intentando algo, y va al registro entera para poder mirarla después.
    console.warn("[apple] comprobante rechazado · empresa %s · %s", perfil.empresa.id, e?.message || e);
    throw new ErrorDeCobro(402, "Ese comprobante no es válido.");
  }

  const revision = revisarTransaccion(transaccion, { productId });
  if (!revision.ok) {
    console.warn("[apple] rechazada · empresa %s · %s · %s", perfil.empresa.id, productId, revision.motivo);
    throw new ErrorDeCobro(402, revision.motivo);
  }
  if (revision.prueba) {
    console.warn(
      "[apple] compra del entorno de pruebas · plan=%s empresa=%s usuario=%s",
      plan,
      perfil.empresa.id,
      usuarioId,
    );
  }

  // La referencia es el `transactionId`, no el comprobante entero: el JWS son
  // miles de caracteres y cambia de forma cuando Apple rota sus certificados,
  // así que como identificador no sirve. El `transactionId` es único por cobro
  // y nuevo en cada renovación, que es exactamente lo que hace falta para que
  // el mes que viene se pueda volver a empujar la fecha.
  const referencia = revision.referencia;
  const previo = await cobroPorReferencia("apple", referencia);
  if (!previo) {
    try {
      await crearCobro({
        empresaId: perfil.empresa.id,
        plan,
        monto: def.precio_mensual,
        referencia,
        pasarela: "apple",
        hash: referencia,
      });
    } catch (e) {
      // Dos pedidos de la misma compra al mismo tiempo: uno de los dos choca
      // con la clave única y está bien que choque. El cobro ya existe, así que
      // se sigue como si lo hubiéramos encontrado.
      if (!esDuplicado(e)) throw e;
      console.info("[apple] el cobro ya existía (dos pedidos a la vez)");
    }
  } else if (!previo.hash_pedido) {
    await guardarHash(previo.id, referencia);
  }

  // La idempotencia de verdad vive acá: la clave única `(pasarela, referencia)`
  // de `zentra.pagos`. Mandar dos veces la misma compra devuelve `repetido` y
  // no empuja la fecha otra vez. Y hace falta de verdad: la app reintenta
  // sola, porque Apple le vuelve a ofrecer la transacción sin terminar cada
  // vez que arranca.
  const r = await registrarPago(referencia, def.precio_mensual, "apple");
  if (!r || r.resultado === "desconocido") {
    console.error("[apple] registrar_pago_pasarela dijo desconocido para %s", referencia);
    throw new ErrorDeCobro(500, "No pudimos registrar la compra. Ya estamos viendo.");
  }

  console.info(
    "[apple] %s · empresa %s · %s · %s · vence %s",
    r.resultado,
    perfil.empresa.id,
    plan,
    def.precio_mensual,
    r.vence,
  );
  return { ok: true, plan, vence: r.vence, repetido: r.resultado === "repetido" };
}

app.post("/apple/verificar", async (req, res) => {
  const problema = faltaApple();
  if (problema) {
    // No se activa nada. Un camino de pago que "funciona" sin poder verificar
    // es peor que uno apagado: activa planes contra comprobantes que nadie
    // miró.
    console.error("[apple/verificar]", problema);
    return res.status(500).json({ error: "Los cobros por la App Store no están configurados todavía." });
  }

  try {
    // Quién es sale del token, igual que en los otros dos. Si saliera del
    // cuerpo, con una compra propia se le activaría el plan a cualquiera.
    const auth = String(req.headers.authorization || "");
    const usuario = auth.startsWith("Bearer ") ? await usuarioDelToken(auth.slice(7)) : null;
    if (!usuario) return res.status(401).json({ error: "Iniciá sesión." });

    const r = await activarPorApple({
      usuarioId: usuario.id,
      productId: String(req.body?.productId || "").trim(),
      comprobante: String(req.body?.comprobante || "").trim(),
    });
    return res.json(r);
  } catch (e) {
    if (e instanceof ErrorDeCobro) return res.status(e.status).json({ error: e.message });
    // Error nuestro: 502 y que la app reintente. La compra ya se hizo y la
    // plata ya salió; lo que no puede pasar es que se pierda.
    console.error("[apple/verificar] error:", e?.message || e);
    return res.status(502).json({ error: "No pudimos confirmar la compra. Probá de nuevo en un rato." });
  }
});

/**
 * Los avisos que manda Apple sola, sin que nadie abra la app.
 *
 * Sin esto, el server se entera de una renovación **sólo cuando el cliente
 * vuelve a abrir la app**: alguien que paga puntual y no entra en una semana
 * ve su plan vencido, y la app tiene que ir a verificar para destrabarlo. Con
 * esto, el mes que Apple cobra el 3 se anota el 3.
 *
 * La URL se carga en App Store Connect → Información de la app →
 * "Notificaciones del servidor de App Store", versión 2. Hay una casilla para
 * producción y otra para sandbox, y conviene poner la misma: los avisos del
 * entorno de pruebas llegan marcados y se registran aparte, igual que las
 * compras de prueba.
 *
 * No lleva token ni clave: Apple firma el aviso y la firma es la credencial.
 * Lo que sí importa son los códigos de respuesta, porque Apple reintenta
 * durante días mientras no reciba un 200: 200 cuando el aviso quedó atendido
 * (aunque no hubiera nada que hacer), 400 cuando el aviso no sirve —reintentar
 * no lo va a mejorar— y 500 cuando el que falló fue este server, que es el
 * único caso en el que el reintento ayuda.
 */
app.post("/apple/avisos", async (req, res) => {
  const problema = faltaApple();
  if (problema) {
    // 500 a propósito: que Apple reintente. El aviso es bueno, el que no está
    // listo es este server, y perderlo sería perder un mes pago.
    console.error("[apple/avisos]", problema);
    return res.status(500).json({ error: "Los cobros por la App Store no están configurados todavía." });
  }

  const firmado = String(req.body?.signedPayload || "").trim();
  if (!firmado) return res.status(400).json({ error: "Falta signedPayload." });

  let aviso;
  try {
    aviso = verificarAviso(firmado);
  } catch (e) {
    // Una firma que no cierra no se reintenta: o es un aviso roto o es alguien
    // probando la puerta. Va entero al registro para poder mirarlo después.
    console.warn("[apple/avisos] firma rechazada · %s", e?.message || e);
    return res.status(400).json({ error: "Ese aviso no es válido." });
  }

  const pide = quePideElAviso(aviso);
  const marca = `${aviso.tipo}${aviso.subtipo ? `/${aviso.subtipo}` : ""} · uuid ${aviso.uuid || "?"}`;

  if (pide.accion === "ajeno") {
    console.warn("[apple/avisos] %s · %s", marca, pide.motivo);
    return res.status(400).json({ error: pide.motivo });
  }

  if (pide.accion === "mirar") {
    // Plata que vuelve. No se toca la fecha desde acá —ver AVISOS_PARA_MIRAR—,
    // pero tiene que quedar a la vista de alguien.
    console.error(
      "[apple/avisos] REVISAR A MANO · %s · original %s · producto %s",
      marca,
      aviso.transaccion?.originalTransactionId || "?",
      aviso.transaccion?.productId || "?",
    );
    return res.json({ ok: true, accion: "mirar" });
  }

  if (pide.accion !== "renovar") {
    console.info("[apple/avisos] %s · %s", marca, pide.motivo);
    return res.json({ ok: true, accion: "nada" });
  }

  try {
    const plan = planDeProductoApple(pide.productId);
    if (!plan) {
      // Un producto que este server no conoce. 200 igual: reintentar no lo va
      // a volver conocido, y lo que falta es cargarlo acá.
      console.error("[apple/avisos] producto desconocido: %s · %s", pide.productId, marca);
      return res.json({ ok: true, accion: "nada" });
    }

    // De quién es esta renovación. El aviso no trae usuario ni empresa —Apple
    // no los conoce—, así que se llega por la cadena: el cobro de la primera
    // compra se guardó con el `originalTransactionId` como referencia.
    const raiz = await cobroPorReferencia("apple", pide.original);
    if (!raiz?.empresa_id) {
      // No es un error, y en el alta es lo normal.
      //
      // En una compra nueva Apple avisa ANTES de que la app alcance a mandar
      // el comprobante —medido el 2026-10-21 en una compra de sandbox: el
      // aviso a las 12:57:59 y la verificación a las 12:58:08—, así que
      // cuando este aviso llega todavía no hay ningún cobro con esa
      // referencia. No hace falta hacer nada: quien acaba de comprar tiene la
      // app abierta, y `/apple/verificar` activa el plan unos segundos
      // después. Lo mismo vale para una compra anterior a este endpoint.
      //
      // Por eso el alta va como info y no como warn: si gritara, cada compra
      // nueva dejaria una linea de alarma por algo que funciona bien, y las
      // alarmas que siempre suenan dejan de mirarse. Lo que si tiene que
      // llamar la atencion es una RENOVACION sin cobro previo: ahi el cobro
      // de la primera compra deberia existir, y que falte significa que esa
      // suscripcion se esta renovando sin que nadie le empuje la fecha.
      const alta = pide.tipo === "SUBSCRIBED";
      const avisar = alta ? console.info : console.warn;
      avisar(
        "[apple/avisos] sin cobro previo para la original %s · %s%s",
        pide.original,
        marca,
        alta ? " (normal en el alta: la app verifica enseguida)" : " · OJO: una renovación sin cobro previo",
      );
      return res.json({ ok: true, accion: "nada" });
    }

    const def = await planVendible(plan);
    if (!def) {
      console.error("[apple/avisos] el plan %s no está a la venta · %s", plan, marca);
      return res.json({ ok: true, accion: "nada" });
    }

    if (pide.prueba) {
      console.warn("[apple/avisos] renovación del entorno de pruebas · plan=%s empresa=%s", plan, raiz.empresa_id);
    }

    // Mismo camino que una compra que manda la app: cobro y después
    // `registrar_pago_pasarela`. La idempotencia es la de siempre, la clave
    // única `(pasarela, referencia)`, y acá hace más falta que nunca: Apple
    // reenvía el mismo aviso hasta que le contesten 200.
    const previo = await cobroPorReferencia("apple", pide.referencia);
    if (!previo) {
      try {
        await crearCobro({
          empresaId: raiz.empresa_id,
          plan,
          monto: def.precio_mensual,
          referencia: pide.referencia,
          pasarela: "apple",
          hash: pide.referencia,
        });
      } catch (e) {
        if (!esDuplicado(e)) throw e;
        console.info("[apple/avisos] el cobro ya existía (aviso repetido)");
      }
    } else if (!previo.hash_pedido) {
      await guardarHash(previo.id, pide.referencia);
    }

    const r = await registrarPago(pide.referencia, def.precio_mensual, "apple");
    if (!r || r.resultado === "desconocido") {
      // Acá sí conviene el reintento: el cobro está y el pago no se registró.
      console.error("[apple/avisos] registrar_pago_pasarela dijo desconocido para %s", pide.referencia);
      return res.status(500).json({ error: "No pudimos registrar la renovación." });
    }

    console.info(
      "[apple/avisos] %s · %s · empresa %s · %s · vence %s",
      marca,
      r.resultado,
      raiz.empresa_id,
      plan,
      r.vence,
    );
    return res.json({ ok: true, accion: "renovar", resultado: r.resultado });
  } catch (e) {
    console.error("[apple/avisos] error: %s · %s", e?.message || e, marca);
    return res.status(500).json({ error: "No pudimos procesar el aviso." });
  }
});

app.listen(PORT, HOST, () => {
  console.info(`[zentra-cobros] escuchando en ${HOST}:${PORT}`);
  if (HOST === "0.0.0.0") {
    console.warn("[zentra-cobros] OJO: expuesto a toda interfaz. Revisá el firewall.");
  }
  const problema = falta();
  if (problema) console.warn(`[zentra-cobros] OJO: ${problema}`);
  // Se avisa aparte: los cobros de Android pueden estar apagados mientras los
  // de la web andan, y al revés. Enterarse al arrancar y no cuando alguien
  // compra desde el teléfono.
  const problemaPlay = faltaPlay();
  if (problemaPlay) console.warn(`[zentra-cobros] Google Play apagado: ${problemaPlay}`);
  else console.info("[zentra-cobros] Google Play listo · paquete %s", configPlayALaVista().paquete);
  const problemaApple = faltaApple();
  if (problemaApple) console.warn(`[zentra-cobros] App Store apagada: ${problemaApple}`);
  else console.info("[zentra-cobros] App Store lista · bundle %s", configAppleALaVista().bundle);
  try {
    const ep = getPagoparEndpoints();
    console.info("[zentra-cobros] pagopar env=%s api=%s", ep.env, ep.apiBase);
  } catch (e) {
    console.warn("[zentra-cobros] pagopar sin resolver:", e.message);
  }
});

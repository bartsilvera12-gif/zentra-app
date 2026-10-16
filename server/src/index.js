/**
 * El server de cobros de Zentra.
 *
 * Mismo molde que el de `tienda-aguara-vulka`: Express chico en la VPS, bajo
 * `/pagopar`, con las claves en el `.env` de la VPS y Supabase como base.
 *
 * Dos endpoints hacen el trabajo:
 *
 *   POST /pagopar/crear-cobro   la persona quiere pagar → devuelve a dónde ir
 *   POST /pagopar/webhook       PagoPar avisa que pagó  → empuja el vencimiento
 *
 * La diferencia con la tienda es qué se vende: allá un pedido de ropa, acá un
 * mes de suscripción. Por eso lo que hace el webhook no es marcar un pedido
 * como pagado sino empujar una fecha.
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
  cobroPendiente,
  cobroPorHash,
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
import { paginaEliminarCuenta, paginaPagar, paginaPrivacidad, paginaResultado } from "./pagina.js";
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

app.listen(PORT, HOST, () => {
  console.info(`[zentra-cobros] escuchando en ${HOST}:${PORT}`);
  if (HOST === "0.0.0.0") {
    console.warn("[zentra-cobros] OJO: expuesto a toda interfaz. Revisá el firewall.");
  }
  const problema = falta();
  if (problema) console.warn(`[zentra-cobros] OJO: ${problema}`);
  try {
    const ep = getPagoparEndpoints();
    console.info("[zentra-cobros] pagopar env=%s api=%s", ep.env, ep.apiBase);
  } catch (e) {
    console.warn("[zentra-cobros] pagopar sin resolver:", e.message);
  }
});

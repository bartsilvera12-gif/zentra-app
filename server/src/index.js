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
  configurada,
  crearCobro,
  guardarHash,
  perfilDe,
  planVendible,
  registrarPago,
  usuarioDelToken,
} from "./db.js";

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

    const plan = String(req.body?.plan || "").trim();
    if (!plan) return res.status(400).json({ error: "Falta decir qué plan." });

    const perfil = await perfilDe(usuario.id);
    if (!perfil?.empresa?.id) {
      return res.status(400).json({ error: "Tu usuario no tiene empresa asignada." });
    }

    // El precio sale de la base. Si lo mandara el navegador, cualquiera se
    // compra un mes de Max por mil guaraníes.
    const def = await planVendible(plan);
    if (!def) return res.status(400).json({ error: "Ese plan no está a la venta." });
    const monto = def.precio_mensual;

    const nombre = String(perfil.nombre || "").trim() || perfil.empresa.nombre || "";
    const email = usuario.email || perfil.email || "";
    const ruc = String(perfil.empresa.ruc || "").trim();
    const documento = String(req.body?.documento || "").trim() || ruc;

    // Se dice QUÉ falta, no "datos incompletos": quien lo lee tiene que saber
    // qué cargar para poder seguir.
    const faltan = [];
    if (!nombre) faltan.push("el nombre");
    if (!email) faltan.push("el correo");
    if (!documento) faltan.push("la cédula o el RUC");
    if (faltan.length) {
      return res.status(400).json({ error: `Para cobrar falta ${faltan.join(" y ")}.`, faltan });
    }

    // Un cobro pendiente reciente se reutiliza en vez de abrir otro pedido.
    const desde = new Date(Date.now() - HORAS * 3600_000).toISOString();
    const previo = await cobroPendiente(perfil.empresa.id, plan, monto, desde);
    if (previo?.hash_pedido) {
      return res.json({ url: checkoutUrlFromHash(previo.hash_pedido), monto, reutilizado: true });
    }

    // La referencia se guarda ANTES de hablar con PagoPar. Si la llamada se
    // corta, queda un cobro pendiente sin hash y no pasa nada. Al revés, un
    // corte dejaría plata entrando sin saber de quién es.
    const referencia = "ztr" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const cobroId = await crearCobro({
      empresaId: perfil.empresa.id,
      plan,
      monto,
      referencia,
    });

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
        email,
        ciudad: Number(process.env.PAGOPAR_ITEM_CIUDAD || 1),
        nombre,
        telefono: String(req.body?.telefono || "").trim(),
        direccion: "",
        documento,
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
      console.error("[crear-cobro] PagoPar rechazó:", motivo);
      return res.status(502).json({ error: "PagoPar no aceptó el pedido. Ya estamos viendo." });
    }

    const fila = Array.isArray(data.resultado) ? data.resultado[0] : data.resultado;
    const hash = String(fila?.data || "").trim();
    if (!hash) {
      console.error("[crear-cobro] PagoPar no devolvió hash:", JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ error: "PagoPar no aceptó el pedido. Ya estamos viendo." });
    }

    // Sin el hash guardado no sabríamos de quién es el pago que entre, así que
    // si esto falla no se manda a nadie a pagar.
    await guardarHash(cobroId, hash);

    console.info(`[crear-cobro] empresa ${perfil.empresa.id} · ${plan} · ${monto} · ${hash}`);
    return res.json({ url: checkoutUrlFromHash(hash), monto, plan: def.nombre });
  } catch (e) {
    console.error("[crear-cobro] error:", e?.message || e);
    return res.status(500).json({ error: "No se pudo iniciar el pago. Probá de nuevo." });
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

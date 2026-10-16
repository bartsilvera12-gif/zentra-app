/**
 * La página de pago, de punta a punta.
 *
 *   npm run test:pagina
 *
 * Levanta el server contra un Supabase y un PagoPar de mentira, y recorre lo
 * que hace una persona: entra, elige plan, y termina en el checkout.
 *
 * Existe porque esta pantalla es la única que toca alguien que todavía no es
 * cliente, y porque un error acá no se ve en ningún lado: no hay nadie mirando
 * logs cuando a las once de la noche alguien intenta pagar y no puede.
 *
 * No necesita Supabase, ni PagoPar, ni red: los dos se reemplazan por un
 * servidor local que contesta lo que contestarían ellos.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as esperar } from "node:timers/promises";

const casos = [];
const t = (n, f) => casos.push([n, f]);

const PUERTO_FALSO = 8891;
const PUERTO_SERVER = 8892;
const CHECKOUT = "http://127.0.0.1:" + PUERTO_FALSO + "/pagos";
const CLAVE_PRUEBA = "clave-de-prueba-larga-0001";

/** Lo que pidió cada parte, para poder afirmar sobre eso. */
const pedidos = [];

/** Supabase y PagoPar, lo justo para este recorrido. */
const falso = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  pedidos.push({ metodo: req.method, ruta: url.pathname, query: url.search, cuerpo });

  const json = (o, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(o));
  };

  // ---- Supabase: entrar con correo y contraseña
  if (url.pathname === "/auth/v1/token") {
    const d = JSON.parse(cuerpo || "{}");
    if (d.password !== "buena") return json({ error: "invalid_grant" }, 400);
    return json({ user: { id: "u-1", email: d.email } });
  }
  // ---- Supabase (PostgREST)
  if (url.pathname === "/rest/v1/planes") {
    return json([
      { codigo: "emprendedor", nombre: "Emprendedor", precio_mensual: "80000.00", vendible: true },
      { codigo: "max", nombre: "Max", precio_mensual: "150000.00", vendible: true },
    ].filter((p) => !url.search.includes("codigo=eq.") || url.search.includes("codigo=eq." + p.codigo)));
  }
  if (url.pathname === "/rest/v1/usuarios") {
    return json([{ empresa_id: "e-1", nombre: "Karen", email: "karen@zentra.py" }]);
  }
  if (url.pathname === "/rest/v1/empresas") {
    return json([{ id: "e-1", nombre: "Neura", ruc: "", plan: "emprendedor", vence: "2026-11-15" }]);
  }
  if (url.pathname === "/rest/v1/cobros") {
    if (req.method === "POST") return json([{ id: "c-1" }], 201);
    // El cobro ya pagado que mira la pantalla de resultado.
    if (url.search.includes("hash_pedido=eq.HASHOK")) {
      return json([{ id: "c-1", empresa_id: "e-1", plan: "emprendedor", monto: "80000.00", estado: "pagado" }]);
    }
    return json([]); // no hay cobro pendiente para reutilizar
  }
  // ---- PagoPar
  if (url.pathname === "/api/comercios/2.0/iniciar-transaccion") {
    return json({ respuesta: true, resultado: [{ data: "HASHOK", pedido: "1" }] });
  }
  return json({}, 404);
});

await new Promise((r) => falso.listen(PUERTO_FALSO, "127.0.0.1", r));

const base = "http://127.0.0.1:" + PUERTO_FALSO;
const hijo = spawn(process.execPath, ["src/index.js"], {
  cwd: new URL(".", import.meta.url).pathname,
  env: {
    ...process.env,
    PORT: String(PUERTO_SERVER),
    HOST: "127.0.0.1",
    PAGOPAR_PUBLIC_KEY: "pub",
    PAGOPAR_PRIVATE_KEY: "priv",
    PAGOPAR_ENV: "staging",
    PAGOPAR_API_BASE_URL: base,
    PAGOPAR_CHECKOUT_BASE_URL: CHECKOUT,
    SUPABASE_URL: base,
    SUPABASE_SERVICE_ROLE_KEY: "service",
    COBRO_PRUEBA_CLAVE: CLAVE_PRUEBA,
    COBRO_PRUEBA_MONTO: "1000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let salida = "";
hijo.stdout.on("data", (d) => (salida += d));
hijo.stderr.on("data", (d) => (salida += d));

// Esperar a que escuche.
for (let i = 0; i < 50; i++) {
  try {
    await fetch("http://127.0.0.1:" + PUERTO_SERVER + "/pagopar/health");
    break;
  } catch {
    await esperar(100);
  }
}

const SRV = "http://127.0.0.1:" + PUERTO_SERVER;
const form = (o) => new URLSearchParams(o).toString();
const postPagar = (o) =>
  fetch(SRV + "/pagar", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form(o),
    redirect: "manual",
  });

t("la pantalla de pago muestra los planes con su precio", async () => {
  const html = await (await fetch(SRV + "/pagar")).text();
  if (!html.includes("Emprendedor")) throw new Error("falta el plan");
  // Los guaraníes se escriben como se leen, sin decimales.
  if (!html.includes("Gs. 80.000")) throw new Error("el precio no se ve legible");
  if (html.includes("80000.00")) throw new Error("se coló el número crudo de la base");
  if (!/name="password"/.test(html)) throw new Error("no se puede entrar");
});

t("con los datos bien, termina en el checkout de PagoPar", async () => {
  const r = await postPagar({ email: "karen@zentra.py", password: "buena", plan: "emprendedor", documento: "463255" });
  if (r.status !== 303) throw new Error("esperaba un 303, vino " + r.status);
  const destino = r.headers.get("location") || "";
  if (!destino.startsWith(CHECKOUT)) throw new Error("no manda al checkout: " + destino);
  if (!destino.endsWith("HASHOK")) throw new Error("el link no lleva el hash del pedido: " + destino);
});

t("el hash queda guardado antes de mandar a nadie a pagar", async () => {
  // Sin esto, la plata entra y no se sabe de quién es.
  const patch = pedidos.find((p) => p.metodo === "PATCH" && p.ruta === "/rest/v1/cobros");
  if (!patch) throw new Error("no guardó el hash");
  if (!patch.cuerpo.includes("HASHOK")) throw new Error("guardó otra cosa: " + patch.cuerpo);
});

t("el precio sale de la base, no del formulario", async () => {
  // Mandar un monto por el formulario no tiene que cambiar nada: si no,
  // cualquiera se compra un mes de Max por mil guaraníes.
  const antes = pedidos.length;
  await postPagar({
    email: "karen@zentra.py",
    password: "buena",
    plan: "max",
    documento: "463255",
    monto: "1000",
    precio: "1000",
  });
  const pedido = pedidos
    .slice(antes)
    .find((p) => p.ruta === "/api/comercios/2.0/iniciar-transaccion");
  const d = JSON.parse(pedido.cuerpo);
  if (d.monto_total !== 150000) throw new Error("cobró " + d.monto_total);
});

t("con la clave de prueba se cobra el monto chico, no el del plan", async () => {
  const antes = pedidos.length;
  await postPagar({
    email: "karen@zentra.py",
    password: "buena",
    plan: "max",
    documento: "463255",
    clave: CLAVE_PRUEBA,
  });
  const pedido = pedidos.slice(antes).find((p) => p.ruta === "/api/comercios/2.0/iniciar-transaccion");
  const d = JSON.parse(pedido.cuerpo);
  if (d.monto_total !== 1000) throw new Error("cobró " + d.monto_total);
  // El plan sigue siendo el de verdad: si probar diera otra cosa, no
  // probaría nada.
  if (!d.descripcion_resumen.includes("Max")) throw new Error("cambió el plan: " + d.descripcion_resumen);
});

t("una clave de prueba equivocada paga el precio real", async () => {
  const antes = pedidos.length;
  await postPagar({
    email: "karen@zentra.py",
    password: "buena",
    plan: "max",
    documento: "463255",
    clave: "clave-de-prueba-larga-0002",
  });
  const pedido = pedidos.slice(antes).find((p) => p.ruta === "/api/comercios/2.0/iniciar-transaccion");
  const d = JSON.parse(pedido.cuerpo);
  if (d.monto_total !== 150000) throw new Error("cobró " + d.monto_total);
});

t("con la contraseña mal no se crea ningun pedido", async () => {
  const antes = pedidos.length;
  const r = await postPagar({ email: "karen@zentra.py", password: "mala", plan: "emprendedor" });
  if (r.status !== 400) throw new Error("status " + r.status);
  const html = await r.text();
  if (!html.includes("Correo o contraseña incorrectos")) throw new Error("no lo dice");
  // Y no se dice cuál de los dos falló: eso sirve para averiguar qué correos existen.
  if (/no existe ese correo/i.test(html)) throw new Error("delata qué correos existen");
  if (pedidos.slice(antes).some((p) => p.ruta.includes("iniciar-transaccion"))) {
    throw new Error("habló con PagoPar sin que nadie entrara");
  }
});

t("el correo escrito no se pierde al equivocarse la clave", async () => {
  const html = await (await postPagar({ email: "karen@zentra.py", password: "mala", plan: "max" })).text();
  if (!html.includes('value="karen@zentra.py"')) throw new Error("hay que escribirlo todo de nuevo");
  if (!/value="max"[^>]*checked/.test(html)) throw new Error("se perdió el plan elegido");
});

t("probar claves a lo loco se corta solo", async () => {
  // Es un formulario con contraseña asomado a internet.
  let frenado = false;
  for (let i = 0; i < 12; i++) {
    const html = await (await postPagar({ email: "otro@zentra.py", password: "mala", plan: "max" })).text();
    if (html.includes("Demasiados intentos")) {
      frenado = true;
      break;
    }
  }
  if (!frenado) throw new Error("nunca frenó");
});

t("al volver de pagar, dice hasta cuando quedo pago", async () => {
  const html = await (await fetch(SRV + "/pagopar/resultado/HASHOK")).text();
  if (!html.includes("ya está pago")) throw new Error("no confirma el pago");
  if (!html.includes("2026-11-15")) throw new Error("no dice hasta cuándo");
  if (!html.includes("Neura")) throw new Error("no dice de qué empresa");
});

t("un hash que no existe no inventa un pago", async () => {
  const html = await (await fetch(SRV + "/pagopar/resultado/NOEXISTE")).text();
  if (!html.includes("No encontramos ese pago")) throw new Error("dijo cualquier cosa");
});

t("sin la clave en la direccion, la pagina no habla de pruebas", async () => {
  const html = await (await fetch(SRV + "/pagar")).text();
  if (/prueba/i.test(html)) throw new Error("se ve el modo prueba sin pedirlo");
  if (/name="clave"/.test(html)) throw new Error("dejó el campo de la clave a la vista");
});

t("con la clave en la direccion, lo dice y la conserva al reenviar", async () => {
  const html = await (await fetch(SRV + "/pagar?clave=" + encodeURIComponent(CLAVE_PRUEBA))).text();
  if (!html.includes("Cobro de prueba")) throw new Error("no avisa que es de prueba");
  if (!html.includes("Gs. 1.000")) throw new Error("no muestra el monto de prueba");
  if (!html.includes(`name="clave"`)) throw new Error("se pierde la clave al enviar");
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
falso.close();
if (malas) console.log("\n--- salida del server ---\n" + salida.slice(-1500));
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nPágina de pago: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

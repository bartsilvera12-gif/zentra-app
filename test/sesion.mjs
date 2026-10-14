/**
 * Reabrir la sesión guardada al arrancar.
 *
 *   npm run test:sesion
 *
 * Lo que se cuida acá es el orden: la sesión se guarda con una clave por
 * instalación, así que el tenant tiene que estar activo ANTES de preguntar por
 * ella. Si eso se invierte, la app pide la contraseña teniendo la sesión
 * guardada al lado — que es el problema que esto vino a arreglar.
 */
import { restaurarSesion } from "../src/lib/sesion.ts";

const casos = [];
const t = (n, f) => casos.push([n, f]);

const tenant = { codigo: "jm", supabaseUrl: "https://x", anonKey: "k", schema: "zentra" };
const sesion = { token: "tok", usuario: { id: "u1", nombre: "Karen", rol: "admin", empresa: "JM" } };

function deps(extra = {}) {
  const pasos = [];
  const d = {
    usaSupabase: true,
    ultimoCodigo: () => "jm",
    resolver: async (c) => { pasos.push("resolver:" + c); return tenant; },
    activar: () => pasos.push("activar"),
    sesion: async () => { pasos.push("sesion"); return sesion; },
    ...extra,
  };
  return { d, pasos };
}

t("el tenant se activa ANTES de pedir la sesión", async () => {
  const { d, pasos } = deps();
  const r = await restaurarSesion(d);
  if (r.estado !== "entrada") throw new Error("no entró: " + JSON.stringify(r));
  if (pasos.join(",") !== "resolver:jm,activar,sesion") throw new Error("orden: " + pasos.join(","));
});

t("sin Supabase no se toca nada", async () => {
  const { d, pasos } = deps({ usaSupabase: false });
  const r = await restaurarSesion(d);
  if (r.estado !== "sin-sesion") throw new Error("debería quedarse en el login");
  if (pasos.length) throw new Error("preguntó igual: " + pasos.join(","));
});

t("sin código guardado igual se busca la sesión (instalación pública)", async () => {
  const { d, pasos } = deps({ ultimoCodigo: () => null });
  const r = await restaurarSesion(d);
  if (r.estado !== "entrada") throw new Error("no entró");
  if (r.tenant !== null) throw new Error("inventó un tenant");
  if (pasos.join(",") !== "sesion") throw new Error("pasos: " + pasos.join(","));
});

t("sin sesión guardada se queda en el login", async () => {
  const { d } = deps({ sesion: async () => null });
  const r = await restaurarSesion(d);
  if (r.estado !== "sin-sesion") throw new Error("entró sin sesión");
});

t("si el directorio falla, no se pregunta por la sesión y se queda en el login", async () => {
  const { d, pasos } = deps({ resolver: async () => { throw new Error("sin señal"); } });
  const r = await restaurarSesion(d);
  if (r.estado !== "sin-sesion") throw new Error("entró con el tenant sin resolver");
  // Importante: no se pide la sesión con el cliente apuntando a otra parte.
  if (pasos.includes("sesion")) throw new Error("preguntó la sesión igual");
});

t("si leer la sesión explota, se queda en el login y no tira el error", async () => {
  const { d } = deps({ sesion: async () => { throw new Error("perfil 500"); } });
  const r = await restaurarSesion(d);
  if (r.estado !== "sin-sesion") throw new Error("debería caer al login");
});

t("si un pedido no vuelve nunca, igual se muestra el login", async () => {
  const { d } = deps({
    // El caso real: señal muy mala. Sin corte, la persona queda mirando el logo
    // sin poder escribir la contraseña.
    resolver: () => new Promise(() => {}),
    tiempoLimiteMs: 10,
  });
  const r = await restaurarSesion(d);
  if (r.estado !== "sin-sesion") throw new Error("se quedó esperando");
});

t("el corte no se come una sesión que llegó a tiempo", async () => {
  const { d } = deps({
    sesion: async () => { await new Promise((r) => setTimeout(r, 5)); return sesion; },
    tiempoLimiteMs: 200,
  });
  const r = await restaurarSesion(d);
  if (r.estado !== "entrada") throw new Error("descartó una sesión buena");
});

let fallas = 0;
for (const [nombre, f] of casos) {
  try { await f(); console.log("  ok   " + nombre); }
  catch (e) { fallas++; console.log("  FALLA " + nombre + "\n         " + e.message); }
}
console.log(`\n${casos.length - fallas}/${casos.length} casos`);
process.exit(fallas ? 1 : 0);

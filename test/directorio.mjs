/**
 * Pruebas de la resolución del código de empresa.
 *
 *   npm test
 *
 * Sin navegador y sin red: `fetch` se reemplaza por un doble. Lo que verifican es
 * lo que se rompe en serio si se rompe — que un código mande al Supabase que
 * corresponde, y que un código desconocido falle en vez de mandar a otro lado.
 */
const casos = [];
function t(nombre, fn) { casos.push([nombre, fn]); }

const JSON_DIR = JSON.stringify({
  JM: { nombre: "Distribuidora JM", supabaseUrl: "https://jm.supabase.co", anonKey: "k-jm" },
  " ferre ": { nombre: "Ferrecolor", supabaseUrl: "https://ferre.supabase.co/", anonKey: "k-ferre" },
});

async function cargar(env) {
  for (const k of Object.keys(process.env)) if (k.startsWith("NEXT_PUBLIC_")) delete process.env[k];
  Object.assign(process.env, env);
  const q = "?" + Math.random();
  const { resolverTenant, normalizarCodigo } = await import("../src/lib/tenant/directory.ts" + q);
  return { resolverTenant, normalizarCodigo };
}

t("JSON del paquete: resuelve y normaliza la clave", async () => {
  const { resolverTenant } = await cargar({
    NEXT_PUBLIC_BACKEND: "supabase", NEXT_PUBLIC_DIRECTORIO_JSON: JSON_DIR,
  });
  const a = await resolverTenant("  j-m ");
  if (a.supabaseUrl !== "https://jm.supabase.co") throw new Error("JM: " + a.supabaseUrl);
  if (a.publico) throw new Error("JM quedó marcado como público");
  const b = await resolverTenant("FERRE");
  if (b.supabaseUrl !== "https://ferre.supabase.co") throw new Error("no sacó la barra final: " + b.supabaseUrl);
  if (b.nombre !== "Ferrecolor") throw new Error("nombre: " + b.nombre);
});

t("un código que no está en el directorio no existe", async () => {
  const { resolverTenant } = await cargar({
    NEXT_PUBLIC_BACKEND: "supabase", NEXT_PUBLIC_DIRECTORIO_JSON: JSON.stringify({
      ACME: { nombre: "Acme", supabaseUrl: "https://acme.supabase.co", anonKey: "k" },
    }),
  });
  let kind = null;
  try { await resolverTenant("JM"); } catch (e) { kind = e.kind; }
  if (kind !== "no_encontrado") throw new Error("esperaba no_encontrado, fue " + kind);
});

t("sin directorio configurado, ningún código existe", async () => {
  // Antes había códigos de demostración (JM, FERRE) que resolvían a URLs
  // inventadas: el error llegaba después y decía "revisá tu conexión".
  const { resolverTenant } = await cargar({
    NEXT_PUBLIC_BACKEND: "supabase",
    NEXT_PUBLIC_SUPABASE_URL: "https://publico.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "k-pub",
  });
  for (const codigo of ["JM", "FERRE", "LOQUESEA"]) {
    let kind = null;
    try { await resolverTenant(codigo); } catch (e) { kind = e.kind; }
    if (kind !== "no_encontrado") throw new Error(`${codigo}: esperaba no_encontrado, fue ${kind}`);
  }
});

t("código vacío va al público", async () => {
  const { resolverTenant } = await cargar({
    NEXT_PUBLIC_BACKEND: "supabase",
    NEXT_PUBLIC_SUPABASE_URL: "https://publico.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "k-pub",
    NEXT_PUBLIC_DIRECTORIO_JSON: JSON_DIR,
  });
  const p = await resolverTenant("   ");
  if (!p.publico || p.supabaseUrl !== "https://publico.supabase.co") throw new Error(JSON.stringify(p));
});

t("archivo .json por red: un solo pedido para todas", async () => {
  const { resolverTenant } = await cargar({
    NEXT_PUBLIC_BACKEND: "supabase",
    NEXT_PUBLIC_DIRECTORIO_URL: "https://cdn.ejemplo/empresas.json",
  });
  let pedidos = [];
  globalThis.fetch = async (u) => {
    pedidos.push(String(u));
    return { ok: true, status: 200, json: async () => JSON.parse(JSON_DIR) };
  };
  const a = await resolverTenant("jm");
  if (a.supabaseUrl !== "https://jm.supabase.co") throw new Error(a.supabaseUrl);
  if (pedidos[0] !== "https://cdn.ejemplo/empresas.json") throw new Error("pidió " + pedidos[0]);
  let kind = null;
  try { await resolverTenant("NOEXISTE"); } catch (e) { kind = e.kind; }
  if (kind !== "no_encontrado") throw new Error("esperaba no_encontrado, fue " + kind);
});

t("endpoint por código: pide la ruta con el código", async () => {
  const { resolverTenant } = await cargar({
    NEXT_PUBLIC_BACKEND: "supabase",
    NEXT_PUBLIC_DIRECTORIO_URL: "https://dir.ejemplo/empresas",
  });
  let pedido = "";
  globalThis.fetch = async (u) => {
    pedido = String(u);
    return { ok: true, status: 200, json: async () => ({ nombre: "X", supabaseUrl: "https://x.co", anonKey: "k" }) };
  };
  await resolverTenant("jm");
  if (pedido !== "https://dir.ejemplo/empresas/JM") throw new Error("pidió " + pedido);
});

t("el JSON del paquete gana sobre la red", async () => {
  const { resolverTenant } = await cargar({
    NEXT_PUBLIC_BACKEND: "supabase",
    NEXT_PUBLIC_DIRECTORIO_JSON: JSON_DIR,
    NEXT_PUBLIC_DIRECTORIO_URL: "https://dir.ejemplo/empresas",
  });
  let tocóLaRed = false;
  globalThis.fetch = async () => { tocóLaRed = true; throw new Error("no debería"); };
  const a = await resolverTenant("JM");
  if (tocóLaRed) throw new Error("fue a la red teniendo el código en el paquete");
  if (a.supabaseUrl !== "https://jm.supabase.co") throw new Error(a.supabaseUrl);
});

t("una entrada incompleta se reporta como configuración mala", async () => {
  const { resolverTenant } = await cargar({
    NEXT_PUBLIC_BACKEND: "supabase",
    NEXT_PUBLIC_DIRECTORIO_JSON: JSON.stringify({ JM: { nombre: "JM" } }),
  });
  let kind = null;
  try { await resolverTenant("JM"); } catch (e) { kind = e.kind; }
  if (kind !== "respuesta_invalida") throw new Error("esperaba respuesta_invalida, fue " + kind);
});

t("un JSON mal escrito no deja arrancar la app", async () => {
  for (const k of Object.keys(process.env)) if (k.startsWith("NEXT_PUBLIC_")) delete process.env[k];
  process.env.NEXT_PUBLIC_BACKEND = "supabase";
  process.env.NEXT_PUBLIC_DIRECTORIO_JSON = "{JM: no-es-json}";
  const { assertConfig } = await import("../src/lib/config.ts?" + Math.random());
  let falló = false;
  try { assertConfig(); } catch { falló = true; }
  if (!falló) throw new Error("aceptó un JSON inválido");
});

t("el schema es opcional y por defecto es zentra", async () => {
  const { resolverTenant } = await cargar({
    NEXT_PUBLIC_BACKEND: "supabase",
    NEXT_PUBLIC_DIRECTORIO_JSON: JSON.stringify({
      PROPIA: { nombre: "Propia", supabaseUrl: "https://a.supabase.co", anonKey: "k" },
      VISTAS: { nombre: "Con vistas", supabaseUrl: "https://b.supabase.co", anonKey: "k", schema: "zentra_jm" },
    }),
  });
  const a = await resolverTenant("PROPIA");
  if (a.schema !== "zentra") throw new Error("esperaba zentra, fue " + a.schema);
  const b = await resolverTenant("VISTAS");
  if (b.schema !== "zentra_jm") throw new Error("esperaba zentra_jm, fue " + b.schema);
});

t("el tenant público usa el schema propio", async () => {
  const { resolverTenant } = await cargar({
    NEXT_PUBLIC_BACKEND: "supabase",
    NEXT_PUBLIC_SUPABASE_URL: "https://publico.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "k",
  });
  const p = await resolverTenant("");
  if (p.schema !== "zentra") throw new Error("esperaba zentra, fue " + p.schema);
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nDirectorio: todas las pruebas pasaron.");
process.exit(malas ? 1 : 0);

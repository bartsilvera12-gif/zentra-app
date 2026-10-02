/**
 * Verifica que todo esté en su lugar ANTES de compilar.
 *
 *   npm run check
 *
 * Existe porque los errores de configuración se descubren tarde y caro: compilás
 * un APK, lo pasás al celular, lo instalás, y recién ahí ves que falta exponer un
 * schema. Esto lo dice en dos segundos.
 *
 * Regla que se respeta en todo el archivo: **no decir que algo está bien sin
 * haberlo comprobado.** Si una respuesta no se entiende, se informa como "no se
 * pudo verificar" y nunca como un visto bueno. Un cortafuegos, un proxy de
 * empresa o un portal de wifi contestan con un 200 o un 403 que no viene de
 * Supabase, y un verificador que se los cree miente justo cuando más importa.
 *
 * No necesita dependencias ni el proyecto compilado. Lee `.env.local` a mano para
 * poder correrse suelto.
 */
import { readFileSync, existsSync } from "node:fs";

const SCHEMA = "zentra";
const ROJO = "\x1b[31m", VERDE = "\x1b[32m", AMAR = "\x1b[33m", GRIS = "\x1b[90m", FIN = "\x1b[0m";
let problemas = 0, avisos = 0;

const ok = (m) => console.log(`  ${VERDE}✓${FIN} ${m}`);
const mal = (m, comoArreglar) => {
  problemas++;
  console.log(`  ${ROJO}✗${FIN} ${m}`);
  if (comoArreglar) console.log(`    ${GRIS}${comoArreglar}${FIN}`);
};
const aviso = (m, nota) => {
  avisos++;
  console.log(`  ${AMAR}!${FIN} ${m}`);
  if (nota) console.log(`    ${GRIS}${nota}${FIN}`);
};

/** `.env.local` sin dependencias. Sólo `CLAVE=valor`, que es lo que usa Next. */
function leerEnv(archivo) {
  if (!existsSync(archivo)) return null;
  const env = {};
  for (const linea of readFileSync(archivo, "utf8").split("\n")) {
    const l = linea.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 1) continue;
    let v = l.slice(i + 1).trim();
    // Next no quita comillas, pero la gente las pone igual.
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[l.slice(0, i).trim()] = v;
  }
  return env;
}

/**
 * Un pedido a PostgREST.
 *
 * `Accept-Profile` es obligatorio: las tablas están en `zentra`, no en `public`,
 * y sin esa cabecera PostgREST busca en `public` y contesta que no existen. (El
 * cliente de la app la manda sola, a partir de `db.schema`.)
 *
 * Devuelve además `deSupabase`: si la respuesta tiene forma de PostgREST, sea un
 * resultado o un error suyo. Lo que contesta otra cosa —un proxy, un cortafuegos,
 * una página de login de wifi— no sirve ni para aprobar ni para rechazar.
 */
async function pedir(url, anonKey, ruta) {
  try {
    const res = await fetch(`${url}/rest/v1/${ruta}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Accept-Profile": SCHEMA,
      },
      signal: AbortSignal.timeout(20000),
    });
    const texto = await res.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* no es JSON */ }

    // PostgREST devuelve, o un JSON con los datos, o un JSON de error con `code`
    // o `message`. Nunca texto suelto.
    const esResultado = Array.isArray(json) || (json && typeof json === "object" && ("swagger" in json || "paths" in json));
    const esErrorSuyo = json && typeof json === "object" &&
      ("code" in json || "message" in json || "hint" in json || "details" in json);
    // 405 no trae cuerpo, pero sólo puede venir del servidor de la API.
    const esMetodo = res.status === 405;

    return { status: res.status, texto, json, deSupabase: Boolean(esResultado || esErrorSuyo || esMetodo) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** El mensaje de error, de donde PostgREST lo haya puesto. */
const mensajeDe = (r) =>
  `${r.json?.message ?? ""} ${r.json?.hint ?? ""} ${r.json?.details ?? ""} ${r.texto ?? ""}`;

const TABLAS = [
  "empresas", "usuarios", "clientes", "proveedores", "productos",
  "movimientos", "ventas", "venta_lineas", "compras", "compra_lineas",
  "numeracion", "dispositivos",
];

/** Qué script trae cada cosa, para poder decir exactamente qué falta correr. */
const DE_QUE_SCRIPT = {
  dispositivos: "05_dispositivos.sql",
  registrar_dispositivo: "05_dispositivos.sql",
  eliminar_mi_cuenta: "04_borrar_cuenta.sql",
};

/** Revisa un proyecto de Supabase de punta a punta. */
async function revisarProyecto(etiqueta, url, anonKey) {
  console.log(`\n${etiqueta}`);
  console.log(`  ${GRIS}${url}${FIN}`);

  if (!/^https?:\/\/[^/]+$/.test(url)) {
    mal("La URL no tiene la forma esperada",
        "Tiene que ser https://xxxx.supabase.co, sin barra final ni ruta.");
    return;
  }
  // `http://` se acepta sólo contra la propia máquina o la red local, que es el
  // caso de un Supabase auto-hospedado en desarrollo. En cualquier otro lado,
  // sin TLS la anon key y los datos viajan a la vista.
  if (url.startsWith("http://")) {
    const host = url.slice(7).split(":")[0];
    const local = host === "localhost" || /^127\./.test(host) || /^10\./.test(host) ||
      /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (!local) {
      mal("La URL es http://, sin cifrar",
          "Así la anon key y los datos viajan a la vista. Usá https://.");
      return;
    }
    aviso("Conexión sin cifrar (http://) a la red local",
          "Está bien para probar; para la app publicada tiene que ser https://.");
  }
  if (!anonKey || anonKey.length < 40) {
    mal("Falta la anon key, o está cortada",
        "Settings → API → 'anon public'. Es larga: empieza con eyJ y sigue.");
    return;
  }
  // La service_role abre la base entera, y la app se descompila.
  try {
    const cuerpo = JSON.parse(Buffer.from(anonKey.split(".")[1] || "", "base64").toString());
    if (cuerpo.role && cuerpo.role !== "anon") {
      mal(`Esa clave es '${cuerpo.role}', no 'anon'`,
          "Una service_role dentro de un APK deja la base abierta a cualquiera que lo descompile. Usá la 'anon public'.");
      return;
    }
  } catch {
    // Las claves nuevas (sb_publishable_…) no son JWT: no se puede mirar adentro.
  }

  // --- 1. ¿Nos está contestando Supabase, y está el schema expuesto? ---
  // El índice de la API trae, de una sola vez, las tablas y las funciones que
  // PostgREST publica en el schema. Sin ejecutar nada.
  const indice = await pedir(url, anonKey, "");
  if (indice.error) {
    mal(`No se pudo conectar: ${indice.error}`,
        "Revisá la URL y tu conexión. Si el proyecto estuvo dormido, Supabase tarda unos segundos en despertarlo.");
    return;
  }
  if (!indice.deSupabase) {
    const muestra = (indice.texto || "").replace(/\s+/g, " ").trim().slice(0, 160);
    mal(`Contestó algo que no es Supabase (HTTP ${indice.status})`,
        `No puedo verificar nada así. Suele ser un proxy, un cortafuegos o un portal de wifi en el medio.\n    Respuesta: ${muestra || "(vacía)"}`);
    return;
  }
  const msgIndice = mensajeDe(indice).toLowerCase();
  if (msgIndice.includes("invalid api key") || indice.status === 401) {
    mal("La anon key no es válida para este proyecto",
        "¿Mezclaste la key de un proyecto con la URL de otro? Settings → API, los dos del mismo.");
    return;
  }
  if (msgIndice.includes("schema must be one of") || msgIndice.includes("not exposed")) {
    mal(`El schema '${SCHEMA}' no está expuesto`,
        "Supabase → Settings → API → Exposed schemas → agregar 'zentra'. Sin esto la app no ve ninguna tabla.");
    return;
  }

  const rutas = indice.json && typeof indice.json === "object" ? indice.json.paths : null;
  if (!rutas || typeof rutas !== "object") {
    // No se pudo leer el índice: se cae a preguntar tabla por tabla, que es más
    // lento pero igual de confiable.
    aviso("No se pudo leer el índice de la API; verifico tabla por tabla");
    await revisarUnaPorUna(url, anonKey);
    return;
  }
  ok(`Responde Supabase, y el schema '${SCHEMA}' está expuesto`);

  const publicadas = new Set(Object.keys(rutas).map((r) => r.replace(/^\//, "")));

  // --- 2. Tablas ---
  const faltan = TABLAS.filter((t) => !publicadas.has(t));
  if (faltan.length) {
    const scripts = [...new Set(faltan.map((t) => DE_QUE_SCRIPT[t]).filter(Boolean))];
    mal(`Faltan ${faltan.length} tabla(s): ${faltan.join(", ")}`,
        scripts.length === 1 && faltan.length === 1
          ? `Falta correr supabase/${scripts[0]}.`
          : "Volvé a correr supabase/todo_en_uno.sql completo (es idempotente, no borra datos).");
  } else {
    ok(`Las ${TABLAS.length} tablas están creadas`);
  }

  // --- 3. Funciones del servidor ---
  // Sin ellas la app falla en el peor momento: al activar las notificaciones, o
  // al borrar la cuenta. Se verifican por el índice, sin llamarlas.
  for (const [fn, para] of [
    ["registrar_dispositivo", "activar las notificaciones"],
    ["eliminar_mi_cuenta", "borrar la cuenta (requisito de las dos tiendas)"],
  ]) {
    if (publicadas.has(`rpc/${fn}`)) {
      ok(`${fn}() existe`);
    } else {
      mal(`Falta la función ${fn}()`,
          `Sin esto no se puede ${para}. Correr supabase/${DE_QUE_SCRIPT[fn]}.`);
    }
  }

  // --- 4. RLS ---
  // Es lo único que separa una empresa de otra. La anon key viaja dentro del APK,
  // así que si lee sin sesión, la base está abierta a cualquiera que lo descompile.
  const sinSesion = await pedir(url, anonKey, "clientes?select=id&limit=1");
  if (sinSesion.error || !sinSesion.deSupabase) {
    aviso("No se pudo comprobar el RLS", "Reintentá; es la verificación que más importa.");
  } else if (Array.isArray(sinSesion.json) && sinSesion.json.length > 0) {
    mal("Se pueden leer clientes SIN estar logueado",
        "Falta el RLS: correr supabase/03_permisos.sql. La anon key está dentro del APK, así que esto es la base abierta.");
  } else if (Array.isArray(sinSesion.json)) {
    ok("Sin sesión no se ve nada (RLS activo)");
  } else {
    aviso(`No pude interpretar la prueba de RLS (HTTP ${sinSesion.status})`, mensajeDe(sinSesion).trim().slice(0, 140));
  }
}

/** Camino de respaldo cuando el índice de la API no se puede leer. */
async function revisarUnaPorUna(url, anonKey) {
  const faltan = [], dudosas = [];
  for (const t of TABLAS) {
    const r = await pedir(url, anonKey, `${t}?limit=0`);
    if (r.error || !r.deSupabase) { dudosas.push(t); continue; }
    const m = mensajeDe(r).toLowerCase();
    if (r.status === 404 || m.includes("could not find the table") || m.includes("does not exist")) faltan.push(t);
  }
  if (dudosas.length) {
    aviso(`No se pudo verificar ${dudosas.length} tabla(s): ${dudosas.join(", ")}`);
  }
  if (faltan.length) {
    mal(`Faltan ${faltan.length} tabla(s): ${faltan.join(", ")}`,
        "Volvé a correr supabase/todo_en_uno.sql completo (es idempotente, no borra datos).");
  } else if (!dudosas.length) {
    ok(`Las ${TABLAS.length} tablas están creadas`);
  }
  aviso("Las funciones del servidor no se verificaron por este camino",
        "Si al activar las notificaciones o borrar la cuenta falla, falta correr 04 y 05.");
}

// ---------------------------------------------------------------- arranque

console.log("\nVerificación de configuración — Zentra Móvil");

const env = leerEnv(".env.local");
if (!env) {
  console.log(`\n  ${ROJO}✗${FIN} No existe .env.local`);
  console.log(`    ${GRIS}cp .env.example .env.local   y completá los valores${FIN}\n`);
  process.exit(1);
}

const backend = env.NEXT_PUBLIC_BACKEND || "mock";
console.log(`\nBackend: ${backend}`);
if (backend === "mock") {
  console.log(`  ${AMAR}!${FIN} Está en 'mock': datos de ejemplo, sin tocar la base.`);
  console.log(`    ${GRIS}Para probar contra Supabase: NEXT_PUBLIC_BACKEND=supabase${FIN}`);
  console.log(`    ${GRIS}Un APK compilado así queda con datos de ejemplo para siempre.${FIN}\n`);
  process.exit(0);
}
if (backend !== "supabase") {
  console.log(`  ${AMAR}!${FIN} '${backend}' no se verifica acá; esto revisa el backend 'supabase'.\n`);
  process.exit(0);
}

const urlPub = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
if (urlPub) {
  await revisarProyecto("Instalación pública (quien no pone código)", urlPub, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
} else {
  console.log("\nInstalación pública");
  aviso("Sin NEXT_PUBLIC_SUPABASE_URL",
        "Quien entre sin código de empresa no va a tener a dónde ir. Es el caso de la app de la tienda.");
}

// Cada empresa del directorio es un proyecto más que tiene que estar bien.
if (env.NEXT_PUBLIC_DIRECTORIO_JSON) {
  let mapa = null;
  try { mapa = JSON.parse(env.NEXT_PUBLIC_DIRECTORIO_JSON); } catch (e) {
    console.log("\nDirectorio escrito en el paquete");
    mal(`El JSON está mal escrito: ${e.message}`,
        'Tiene que ir todo en UNA línea: {"JM":{"nombre":"…","supabaseUrl":"https://…","anonKey":"eyJ…"}}');
  }
  if (mapa) {
    for (const [codigo, v] of Object.entries(mapa)) {
      const c = codigo.trim().toUpperCase().replace(/[\s-]/g, "");
      if (!v || typeof v !== "object" || !v.supabaseUrl || !v.anonKey) {
        console.log(`\nCódigo ${c}`);
        mal("La entrada no tiene supabaseUrl y anonKey", "La app va a rechazar ese código.");
        continue;
      }
      await revisarProyecto(
        `Código ${c}${v.nombre ? ` — ${v.nombre}` : ""}`,
        String(v.supabaseUrl).replace(/\/$/, ""),
        String(v.anonKey),
      );
    }
    // Dos destinos al mismo proyecto es el error que hace parecer que el
    // aislamiento entre empresas no funciona.
    const urls = Object.values(mapa).map((v) => v && v.supabaseUrl).filter(Boolean).map((u) => String(u).replace(/\/$/, ""));
    const todas = urlPub ? [urlPub, ...urls] : urls;
    if (new Set(todas).size !== todas.length) {
      console.log("");
      mal("Dos destinos apuntan al MISMO proyecto",
          "Las dos empresas van a ver los mismos datos, y va a parecer que el aislamiento está roto.");
    }
  }
} else if (env.NEXT_PUBLIC_DIRECTORIO_URL) {
  console.log("\nDirectorio por red");
  console.log(`  ${GRIS}${env.NEXT_PUBLIC_DIRECTORIO_URL}${FIN}`);
  aviso("No se verifica desde acá", "Probalo entrando con un código real una vez levantada la app.");
} else {
  console.log("\nCódigo de empresa");
  aviso("Sin directorio configurado: se usa el demo (JM y FERRE)",
        "Apunta a URLs inventadas: sirve para ver la pantalla, no para entrar.");
}

console.log("");
if (problemas) {
  console.log(`${ROJO}${problemas} problema(s) que hay que arreglar antes de compilar.${FIN}\n`);
  process.exit(1);
}
console.log(avisos ? `${VERDE}Sin problemas${FIN} (${avisos} aviso/s).\n` : `${VERDE}Todo en orden.${FIN}\n`);

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
async function pedir(url, anonKey, ruta, opts = {}) {
  const schema = opts.schema || SCHEMA;
  // AbortController a mano, y no AbortSignal.timeout, para poder apagar el
  // temporizador: uno vivo mantiene el proceso en pie y, en Windows, salir con
  // handles pendientes revienta libuv con una aserción.
  const ctrl = new AbortController();
  const corte = setTimeout(() => ctrl.abort(), 20000);
  try {
    // `Authorization` se puede omitir a propósito: sirve para distinguir una
    // clave equivocada de una clave buena que el cliente manda de una forma que
    // el servidor no acepta.
    const headers = { apikey: anonKey, "Accept-Profile": schema };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    else if (!opts.sinAuthorization) headers.Authorization = `Bearer ${anonKey}`;
    const res = await fetch(`${url}/rest/v1/${ruta}`, { headers, signal: ctrl.signal });
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
    const m = e instanceof Error ? e.message : String(e);
    return { error: ctrl.signal.aborted ? "el servidor no respondió en 20 segundos" : m };
  } finally {
    clearTimeout(corte);
  }
}

/**
 * Cierra las conexiones que `fetch` deja abiertas para reusar. Sin esto el
 * proceso queda en pie hasta que vencen solas, y forzar la salida con
 * `process.exit()` teniéndolas abiertas es lo que rompe en Windows.
 */
async function cerrarRed() {
  try {
    const d = globalThis[Symbol.for("undici.globalDispatcher.1")];
    if (d && typeof d.close === "function") await d.close();
  } catch {
    // Si esta versión de node no lo expone, se cierran solas al terminar.
  }
}

/** Todo junto, para buscar palabras clave adentro. */
const mensajeDe = (r) =>
  `${r.json?.message ?? ""} ${r.json?.hint ?? ""} ${r.json?.details ?? ""} ${r.texto ?? ""}`;

/** Lo mismo pero para mostrar: sin repetir el cuerpo crudo si ya hay mensaje. */
function loQueDijo(r) {
  const partes = [r.json?.message, r.json?.hint, r.json?.details].filter(Boolean);
  const texto = partes.length ? partes.join(" — ") : (r.texto || "");
  return texto.replace(/\s+/g, " ").trim().slice(0, 200) || "(sin mensaje)";
}

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

/**
 * Revisa un proyecto de Supabase.
 *
 * Hay un límite que conviene entender: sin iniciar sesión **no se puede ver
 * nada**, y eso es lo correcto. El rol anónimo no tiene permiso sobre ninguna
 * tabla, justamente para que la clave pública que viaja dentro del APK no sirva
 * para leer datos de nadie.
 *
 * Así que la revisión tiene dos niveles:
 *
 *   sin credenciales  comprueba lo que importa para la seguridad: que responda,
 *                     que el schema esté expuesto, que la clave sirva y que sin
 *                     sesión no se pueda leer nada.
 *   con credenciales  además entra de verdad y verifica tablas, funciones y
 *                     perfil, que es lo único que no se puede ver desde afuera.
 */
async function revisarProyecto(etiqueta, url, anonKey, credenciales, schema = SCHEMA) {
  console.log(`\n${etiqueta}`);
  console.log(`  ${GRIS}${url}${FIN}`);

  if (!validarClave(url, anonKey)) return;

  // --- 1. ¿Nos contesta Supabase, está el schema expuesto, sirve la clave? ---
  //
  // Se pregunta por una tabla y no por el índice de la API: ese índice sólo se
  // puede leer con la clave secreta, que jamás puede estar en la app.
  const anon = await pedir(url, anonKey, "clientes?select=id&limit=1", { schema });
  if (anon.error) {
    mal(`No se pudo conectar: ${anon.error}`,
        "Revisá la URL y tu conexión. Si el proyecto estuvo dormido, Supabase tarda unos segundos en despertarlo.");
    return;
  }
  if (!anon.deSupabase) {
    const muestra = (anon.texto || "").replace(/\s+/g, " ").trim().slice(0, 160);
    mal(`Contestó algo que no es Supabase (HTTP ${anon.status})`,
        `No puedo verificar nada así. Suele ser un proxy, un cortafuegos o un portal de wifi en el medio.\n    Respuesta: ${muestra || "(vacía)"}`);
    return;
  }

  const m = mensajeDe(anon).toLowerCase();
  if (m.includes("schema must be one of") || m.includes("not exposed")) {
    mal(`El schema '${schema}' no está expuesto`,
        `Supabase → Settings → API → Exposed schemas → agregar '${schema}'. Sin esto la app no ve ninguna tabla.`);
    return;
  }
  if (m.includes("permission denied for schema")) {
    mal(`Falta darle permiso al schema '${SCHEMA}'`, [
      `Supabase dijo: ${loQueDijo(anon)}`,
      "No es la clave: el rol se reconoció bien, pero no puede ni mirar el schema.",
      "Falta correr supabase/03_permisos.sql, que es el que da los permisos y activa el RLS.",
    ].join("\n    "));
    return;
  }
  if (await claveRechazada(url, anonKey, anon, schema)) return;
  ok(`Responde Supabase, y el schema '${schema}' está expuesto`);

  // --- 2. Lo más importante: que sin sesión no se pueda leer nada ---
  //
  // La clave pública viaja dentro del APK. Si con ella sola se leyeran datos, la
  // base estaría abierta a cualquiera que lo descompile.
  if (m.includes("permission denied for table")) {
    // El rol anónimo ni siquiera tiene permiso de lectura. Es la garantía más
    // fuerte posible, más que devolver una lista vacía.
    ok("Sin sesión no se puede leer nada (permisos correctos)");
  } else if (esFalta(anon)) {
    mal("No existen las tablas: falta correr el SQL",
        "SQL Editor → correr supabase/todo_en_uno.sql.");
    return;
  } else if (Array.isArray(anon.json) && anon.json.length > 0) {
    mal("Se pueden leer clientes SIN estar logueado",
        "Falta el RLS: correr supabase/03_permisos.sql. La clave pública está dentro del APK, así que esto es la base abierta.");
  } else if (Array.isArray(anon.json)) {
    ok("Sin sesión no se ve nada (RLS activo)");
    aviso("El rol anónimo igual tiene permiso de lectura sobre las tablas",
          "Anda bien porque el RLS filtra, pero 03_permisos.sql no se lo da. Si lo agregaste a mano, sacalo: una política mal escrita dejaría de ser inofensiva.");
  } else {
    aviso(`No pude interpretar la prueba sin sesión (HTTP ${anon.status})`, loQueDijo(anon));
  }

  // --- 3. Lo de adentro, que sólo se ve con sesión ---
  if (!credenciales) {
    aviso("Tablas y funciones no se verifican sin credenciales", [
      "Sin sesión no se puede mirar adentro, y así tiene que ser.",
      "Para la revisión completa:  npm run check -- tu@correo.com tuContraseña",
      "Usá una cuenta de prueba de ese proyecto; sólo lee.",
    ].join("\n    "));
    return;
  }
  await revisarConSesion(url, anonKey, credenciales, schema);
}

/** Entra con una cuenta real y verifica lo que sólo se ve desde adentro. */
async function revisarConSesion(url, anonKey, { correo, clave }, schema = SCHEMA) {
  const sesion = await entrar(url, anonKey, correo, clave);
  if (!sesion.token) {
    mal(`No se pudo entrar con ${correo}`, [
      `Supabase dijo: ${sesion.motivo}`,
      "Si el correo y la contraseña son correctos, puede faltar confirmar el correo.",
    ].join("\n    "));
    return;
  }
  ok(`Entró como ${correo}`);

  // El perfil lo crea un disparador al registrarse. Si falta, la app entra pero
  // no sabe de qué empresa es, y todo lo demás falla con un mensaje confuso.
  const perfil = await pedir(url, anonKey, "usuarios?select=id,empresa_id,rol&limit=1", { token: sesion.token, schema });
  if (Array.isArray(perfil.json) && perfil.json.length === 1 && perfil.json[0].empresa_id) {
    ok("La cuenta tiene perfil y empresa");
  } else if (Array.isArray(perfil.json)) {
    mal("La cuenta entró pero no tiene perfil en zentra.usuarios",
        "Lo crea un disparador al registrarse: falta correr supabase/02_funciones.sql.");
  } else {
    aviso("No se pudo leer el perfil", loQueDijo(perfil));
  }

  // --- tablas ---
  const faltan = [], dudosas = [];
  for (const t of TABLAS) {
    const r = await pedir(url, anonKey, `${t}?limit=0`, { token: sesion.token, schema });
    if (r.error || !r.deSupabase) { dudosas.push(t); continue; }
    if (esFalta(r)) faltan.push(t);
  }
  if (dudosas.length) aviso(`No se pudo verificar ${dudosas.length} tabla(s): ${dudosas.join(", ")}`);
  if (faltan.length) {
    const scripts = [...new Set(faltan.map((t) => DE_QUE_SCRIPT[t]).filter(Boolean))];
    mal(`Faltan ${faltan.length} tabla(s): ${faltan.join(", ")}`,
        scripts.length === 1 && scripts.length === faltan.length
          ? `Falta correr supabase/${scripts[0]}.`
          : "Volvé a correr supabase/todo_en_uno.sql completo (es idempotente, no borra datos).");
  } else if (!dudosas.length) {
    ok(`Las ${TABLAS.length} tablas están creadas`);
  }

  // --- funciones ---
  // Se preguntan con GET y con los nombres de sus parámetros. Las dos escriben,
  // y PostgREST no ejecuta una función volátil por GET: contesta 405. O sea que
  // un 405 prueba que existe sin llegar a correrla.
  for (const [fn, args, para] of [
    ["registrar_dispositivo", "?p_token=x&p_plataforma=web", "activar las notificaciones"],
    ["eliminar_mi_cuenta", "", "borrar la cuenta (requisito de las dos tiendas)"],
  ]) {
    const r = await pedir(url, anonKey, `rpc/${fn}${args}`, { token: sesion.token, schema });
    if (r.error || !r.deSupabase) { aviso(`No se pudo verificar ${fn}()`, r.error || ""); continue; }
    if (r.status === 405) { ok(`${fn}() existe`); continue; }
    const msg = mensajeDe(r).toLowerCase();
    if (r.status === 404 || msg.includes("could not find the function")) {
      mal(`Falta la función ${fn}()`,
          `Sin esto no se puede ${para}. Correr supabase/${DE_QUE_SCRIPT[fn]}.`);
    } else {
      ok(`${fn}() existe`);
    }
  }
}

/** Inicia sesión con correo y contraseña. Devuelve el token, o el motivo. */
async function entrar(url, anonKey, correo, clave) {
  const ctrl = new AbortController();
  const corte = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: correo, password: clave }),
      signal: ctrl.signal,
    });
    const texto = await res.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* no es JSON */ }
    if (json && json.access_token) return { token: json.access_token };
    return {
      token: null,
      motivo: (json?.error_description || json?.msg || json?.message || texto || `HTTP ${res.status}`)
        .toString().replace(/\s+/g, " ").trim().slice(0, 160),
    };
  } catch (e) {
    return { token: null, motivo: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(corte);
  }
}

/** ¿La respuesta dice que esa tabla no existe? */
function esFalta(r) {
  const m = mensajeDe(r).toLowerCase();
  return r.status === 404 || m.includes("could not find the table") || m.includes("does not exist");
}

/** Chequeos de forma de la clave, antes de gastar un pedido. */
function validarClave(url, anonKey) {
  if (!/^https?:\/\/[^/]+$/.test(url)) {
    mal("La URL no tiene la forma esperada",
        "Tiene que ser https://xxxx.supabase.co, sin barra final ni ruta.");
    return false;
  }
  // `http://` se acepta sólo contra la propia máquina o la red local, que es el
  // caso de un Supabase auto-hospedado en desarrollo. En cualquier otro lado,
  // sin TLS la clave y los datos viajan a la vista.
  if (url.startsWith("http://")) {
    const host = url.slice(7).split(":")[0];
    const local = host === "localhost" || /^127\./.test(host) || /^10\./.test(host) ||
      /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (!local) {
      mal("La URL es http://, sin cifrar", "Así la clave y los datos viajan a la vista. Usá https://.");
      return false;
    }
    aviso("Conexión sin cifrar (http://) a la red local",
          "Está bien para probar; para la app publicada tiene que ser https://.");
  }

  if (!anonKey) {
    mal("Falta la clave pública",
        "Supabase → Settings → API Keys. La 'publishable' (sb_publishable_…) o, en proyectos viejos, la 'anon public' (eyJ…).");
    return false;
  }

  // Lo primero y más importante: que no sea una clave privada. Va adentro de un
  // APK, y un APK se descompila. Una clave secreta ahí deja la base entera
  // abierta a cualquiera que se baje la app, con el RLS sin efecto.
  if (anonKey.startsWith("sb_secret_")) {
    mal("Esa es la clave SECRETA, no la pública",
        "Nunca puede ir en la app: saltea el RLS y deja la base abierta a cualquiera que descompile el APK.\n    Usá la que empieza con sb_publishable_. Y como ésta ya estuvo en un archivo, conviene rotarla en el panel.");
    return false;
  }
  if (anonKey.startsWith("eyJ")) {
    try {
      const cuerpo = JSON.parse(Buffer.from(anonKey.split(".")[1] || "", "base64").toString());
      if (cuerpo.role && cuerpo.role !== "anon") {
        mal(`Esa clave es '${cuerpo.role}', no 'anon'`,
            "Una service_role dentro de un APK deja la base abierta a cualquiera que lo descompile.\n    Usá la 'anon public'. Y como ésta ya estuvo en un archivo, conviene rotarla en el panel.");
        return false;
      }
    } catch {
      mal("La clave empieza con eyJ pero no se puede leer: está cortada",
          "Copiala de nuevo con el botón de copiar del panel, no seleccionándola con el mouse.");
      return false;
    }
    if (anonKey.length < 100) {
      mal("La clave quedó cortada", "Las claves eyJ… son bastante más largas. Copiala con el botón del panel.");
      return false;
    }
  } else if (anonKey.startsWith("sb_publishable_")) {
    if (anonKey.length < 30) {
      mal("La clave publishable quedó cortada", "Copiala de nuevo con el botón de copiar del panel.");
      return false;
    }
  } else {
    aviso("La clave no tiene un formato conocido",
          "Se esperaba sb_publishable_… o eyJ… . Si Supabase la acepta, está bien igual.");
  }
  return true;
}

/** ¿Supabase rechazó la clave? Devuelve true si ya informó el problema. */
async function claveRechazada(url, anonKey, r, schema = SCHEMA) {
  const m = mensajeDe(r).toLowerCase();
  // "permiso denegado" nunca es un problema de la clave: la clave identificó
  // bien al rol, y el rol no tiene permisos. Lo interpreta quien llama, que
  // sabe si eso era lo esperado (sin sesión lo es) o no.
  if (m.includes("permission denied")) return false;

  // Sólo cuando Supabase realmente habla de la clave. Un 401 suelto no alcanza:
  // PostgREST también lo usa para errores de permisos de Postgres, y culpar a la
  // clave manda a buscar en el lugar equivocado.
  if (!(m.includes("invalid api key") || m.includes("secret api key") || m.includes("jwt") ||
        m.includes("api key"))) {
    if (r.status === 401 || r.status === 403) {
      mal(`Supabase rechazó el pedido (HTTP ${r.status})`, [
        `Supabase dijo: ${loQueDijo(r)}`,
        "No dice que sea la clave, así que no voy a suponerlo. Pegame esta salida y lo miramos.",
      ].join("\n    "));
      return true;
    }
    return false;
  }

  const dijo = loQueDijo(r);

  // Si pide una clave secreta, es un endpoint privilegiado y el error es del
  // verificador, no de la configuración: la clave de la app nunca puede serlo.
  if (m.includes("secret api key")) {
    mal("Se consultó un endpoint que exige la clave secreta", [
      `Supabase dijo: ${dijo}`,
      "Es un error del verificador, no de tu configuración: la clave de la app nunca puede ser la secreta.",
      "Avisame si ves esto, porque significa que quedó una consulta privilegiada en el script.",
    ].join("\n    "));
    return true;
  }

  // ¿Es la clave, o es cómo se la mandamos? El cliente la manda en dos
  // cabeceras: `apikey` y `Authorization: Bearer`. Si sacando la segunda pasa,
  // la clave está bien y el problema es el cliente.
  const soloApikey = await pedir(url, anonKey, "clientes?limit=0", { sinAuthorization: true, schema });
  if (soloApikey.deSupabase && soloApikey.status < 400) {
    mal("La clave es válida, pero el servidor la rechaza en la cabecera Authorization", [
      `Supabase dijo: ${dijo}`,
      "Con sólo `apikey` pasa; al agregar `Authorization: Bearer` falla. La librería manda las dos,",
      "y no expone una opción para cambiarlo.",
      "Salida práctica: usar la clave vieja 'anon public' (eyJ…), si el proyecto la tiene activa.",
      "Si llegaste acá, avisame: es un caso raro y conviene mirarlo bien antes de tocar nada.",
    ].join("\n    "));
    return true;
  }

  mal("Supabase rechaza esa clave", [
    `Supabase dijo: ${dijo}`,
    "Copiala de nuevo del panel: Settings → API Keys. Las causas, en orden:",
    "  1. Quedó cortada al copiar, o se coló un espacio o un salto de línea.",
    anonKey.startsWith("eyJ")
      ? "  2. El proyecto desactivó las claves viejas (eyJ…): copiá la sb_publishable_."
      : "  2. Es de otro proyecto, o no es la 'publishable'.",
    "  3. El proyecto está pausado. En el panel diría 'Project paused'; se reanuda desde ahí.",
  ].join("\n    "));
  return true;
}

// ---------------------------------------------------------------- arranque

/**
 * Devuelve el código de salida en vez de llamar a `process.exit()`: salir a la
 * fuerza con pedidos de red todavía abiertos hace que node aborte con una
 * aserción de libuv en Windows, justo después de imprimir el resultado.
 */
async function main() {
  console.log("\nVerificación de configuración — Zentra Móvil");

  // Opcionales: con ellas se puede mirar adentro, que sin sesión no se puede.
  // Van por la línea de comandos y no en el .env.local, para que una contraseña
  // no termine horneada dentro del APK.
  const [correo, clave] = process.argv.slice(2);
  const credenciales = correo && clave ? { correo, clave } : null;

  const env = leerEnv(".env.local");
  if (!env) {
    console.log(`\n  ${ROJO}✗${FIN} No existe .env.local`);
    console.log(`    ${GRIS}cp .env.example .env.local   y completá los valores${FIN}\n`);
    return 1;
  }

  const backend = env.NEXT_PUBLIC_BACKEND || "mock";
  console.log(`\nBackend: ${backend}`);
  if (backend === "mock") {
    console.log(`  ${AMAR}!${FIN} Está en 'mock': datos de ejemplo, sin tocar la base.`);
    console.log(`    ${GRIS}Para probar contra Supabase: NEXT_PUBLIC_BACKEND=supabase${FIN}`);
    console.log(`    ${GRIS}Un APK compilado así queda con datos de ejemplo para siempre.${FIN}\n`);
    return 0;
  }
  if (backend !== "supabase") {
    console.log(`  ${AMAR}!${FIN} '${backend}' no se verifica acá; esto revisa el backend 'supabase'.\n`);
    return 0;
  }

  const urlPub = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (urlPub) {
    await revisarProyecto("Instalación pública (quien no pone código)", urlPub, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", credenciales);
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
          // Las credenciales son de un proyecto: no sirven en los demás.
          null,
          typeof v.schema === "string" && v.schema.trim() ? v.schema.trim() : SCHEMA,
        );
      }
      // Dos destinos al mismo proyecto: a veces es un error de copiar y pegar,
      // y a veces es a propósito —para probar el flujo del código sin crear un
      // segundo proyecto—. Por eso avisa en vez de frenar.
      const urls = Object.values(mapa).map((v) => v && v.supabaseUrl).filter(Boolean).map((u) => String(u).replace(/\/$/, ""));
      const todas = urlPub ? [urlPub, ...urls] : urls;
      if (new Set(todas).size !== todas.length) {
        console.log("");
        aviso("Dos destinos apuntan al MISMO proyecto", [
          "Si fue sin querer, revisá las URLs.",
          "Si es a propósito para probar el código sin crear otro proyecto, está bien: cada cuenta",
          "sigue viendo sólo lo suyo, porque eso lo separa el RLS por empresa, no el proyecto.",
          "Lo único que no se ejercita así es el salto a OTRO Supabase.",
        ].join("\n    "));
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
    return 1;
  }
  console.log(avisos ? `${VERDE}Sin problemas${FIN} (${avisos} aviso/s).\n` : `${VERDE}Todo en orden.${FIN}\n`);
  return 0;
}

process.exitCode = await main();
await cerrarRed();

/**
 * Resolución del código de empresa.
 *
 * El directorio es una libreta de direcciones: dado un código, devuelve a qué
 * Supabase conectarse. Lo que devuelve (URL y clave anónima) NO es secreto — son
 * los mismos datos que viajan dentro de cualquier APK que use Supabase.
 *
 * Orden de resolución:
 *   1. Código vacío        → tenant público.
 *   2. Directorio escrito en el paquete (`NEXT_PUBLIC_DIRECTORIO_JSON`), si lo hay.
 *   3. Consulta al directorio por red (`NEXT_PUBLIC_DIRECTORIO_URL`).
 *   4. Si la red falló, lo guardado en el dispositivo.
 *
 * El paso 2 permite arrancar sin montar ningún servicio: con dos o tres clientes
 * con ERP alcanza, y no hay nada que se pueda caer. El costo es que agregar una
 * empresa pide recompilar.
 *
 * El paso 4 es lo que evita que el directorio por red sea un punto único de falla:
 * una vez que el celular resolvió un código, puede volver a entrar aunque el
 * directorio esté caído.
 */
import { config } from "../config";
import { guardarTenant, guardarUltimoCodigo, leerTenantGuardado } from "./storage";
import { TenantError, type TenantConfig } from "./types";

/**
 * Normaliza lo que escribe el usuario: mayúsculas, sin espacios ni guiones.
 * Así "jm", " JM " y "j-m" resuelven al mismo código.
 */
export function normalizarCodigo(entrada: string): string {
  return entrada.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function tenantPublico(): TenantConfig {
  return {
    codigo: "",
    nombre: "Zentra",
    supabaseUrl: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    publico: true,
  };
}

/**
 * Directorio de desarrollo, usado cuando no hay `NEXT_PUBLIC_DIRECTORIO_URL`.
 * Permite probar el flujo completo sin levantar el servicio real.
 */
const DIRECTORIO_DEMO: Record<string, Omit<TenantConfig, "publico">> = {
  JM: {
    codigo: "JM",
    nombre: "Distribuidora JM",
    supabaseUrl: "https://demo-jm.supabase.invalid",
    anonKey: "demo-anon-key",
  },
  FERRE: {
    codigo: "FERRE",
    nombre: "Ferrecolor",
    supabaseUrl: "https://demo-ferre.supabase.invalid",
    anonKey: "demo-anon-key",
  },
};

function parseRespuesta(codigo: string, json: unknown): TenantConfig {
  const o = json as Partial<TenantConfig> | null;
  if (!o || typeof o.supabaseUrl !== "string" || typeof o.anonKey !== "string") {
    throw new TenantError("respuesta_invalida", `Directorio devolvió datos incompletos para ${codigo}`);
  }
  return {
    codigo,
    nombre: typeof o.nombre === "string" && o.nombre ? o.nombre : codigo,
    supabaseUrl: o.supabaseUrl.replace(/\/$/, ""),
    anonKey: o.anonKey,
    publico: false,
  };
}

/**
 * Directorio escrito en el paquete. `assertConfig()` ya verificó que el JSON
 * parsea, así que acá un error de formato sólo puede ser de una entrada suelta.
 */
function buscarEnJson(codigo: string): TenantConfig | null {
  if (!config.directorioJson) return null;
  let mapa: Record<string, unknown>;
  try {
    mapa = JSON.parse(config.directorioJson) as Record<string, unknown>;
  } catch {
    return null;
  }
  // Las claves se normalizan igual que lo que escribe el usuario, así que da lo
  // mismo si en el JSON quedó "jm" o " JM ".
  const entrada = Object.entries(mapa).find(([k]) => normalizarCodigo(k) === codigo);
  if (!entrada) return null;
  return parseRespuesta(codigo, entrada[1]);
}

/**
 * Directorio servido por red. Dos formas, según cómo termine la URL:
 *
 *   .../empresas/{CODIGO}   un endpoint por código (un servicio de verdad)
 *   .../empresas.json       un solo archivo con todas (un estático en cualquier CDN)
 *
 * La segunda existe porque no hace falta un servicio para esto: un JSON subido a
 * cualquier lado alcanza, y se actualiza sin recompilar la app.
 */
async function consultarPorRed(codigo: string): Promise<TenantConfig> {
  const esArchivo = /\.json$/i.test(config.directorioUrl);
  const url = esArchivo
    ? config.directorioUrl
    : `${config.directorioUrl}/${encodeURIComponent(codigo)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (res.status === 404 && !esArchivo) {
      throw new TenantError("no_encontrado", `Código ${codigo} no existe`);
    }
    if (!res.ok) {
      throw new TenantError("directorio_inaccesible", `Directorio respondió ${res.status}`);
    }
    const json = await res.json();
    if (!esArchivo) return parseRespuesta(codigo, json);

    const mapa = (json ?? {}) as Record<string, unknown>;
    const entrada = Object.entries(mapa).find(([k]) => normalizarCodigo(k) === codigo);
    if (!entrada) throw new TenantError("no_encontrado", `Código ${codigo} no está en el archivo`);
    return parseRespuesta(codigo, entrada[1]);
  } catch (e) {
    if (e instanceof TenantError) throw e;
    throw new TenantError("directorio_inaccesible", "No se pudo consultar el directorio");
  } finally {
    clearTimeout(timer);
  }
}

async function consultarDirectorio(codigo: string): Promise<TenantConfig> {
  // Lo que está en el paquete gana: no depende de la red ni se puede caer.
  const local = buscarEnJson(codigo);
  if (local) return local;

  if (config.directorioUrl) return consultarPorRed(codigo);

  // Si hay un directorio escrito en el paquete y el código no está ahí, el código
  // no existe. Caer al demo acá sería peor que fallar: mandaría al vendedor a una
  // URL inventada y el error aparecería recién al intentar entrar.
  if (config.directorioJson) {
    throw new TenantError("no_encontrado", `Código ${codigo} no está en el directorio`);
  }

  // Sin directorio configurado de ninguna forma, queda el demo: sirve para ver el
  // flujo de la pantalla, pero apunta a URLs inventadas.
  const demo = DIRECTORIO_DEMO[codigo];
  if (!demo) throw new TenantError("no_encontrado", `Código ${codigo} no está en el directorio`);
  return { ...demo, publico: false };
}

/**
 * Resuelve el código a la configuración de conexión.
 * Lanza `TenantError`; usá `mensajeTenantError` para mostrarlo.
 */
export async function resolverTenant(entrada: string): Promise<TenantConfig> {
  const codigo = normalizarCodigo(entrada);

  if (!codigo) {
    guardarUltimoCodigo("");
    return tenantPublico();
  }

  try {
    const t = await consultarDirectorio(codigo);
    guardarTenant(t);
    guardarUltimoCodigo(codigo);
    return t;
  } catch (e) {
    // Un código inexistente es definitivo: no tiene sentido mirar la caché.
    if (e instanceof TenantError && e.kind === "no_encontrado") throw e;

    // El directorio falló: si este celular ya entró antes con este código, seguimos.
    const guardado = leerTenantGuardado(codigo);
    if (guardado) {
      guardarUltimoCodigo(codigo);
      return guardado;
    }
    throw e;
  }
}

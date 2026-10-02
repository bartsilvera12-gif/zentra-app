/**
 * Resolución del código de empresa.
 *
 * El directorio es una libreta de direcciones: dado un código, devuelve a qué
 * Supabase conectarse. Lo que devuelve (URL y clave anónima) NO es secreto — son
 * los mismos datos que viajan dentro de cualquier APK que use Supabase.
 *
 * Orden de resolución:
 *   1. Código vacío        → tenant público.
 *   2. Consulta al directorio.
 *   3. Si el directorio no responde, lo guardado en el dispositivo.
 *
 * El paso 3 es lo que evita que el directorio sea un punto único de falla: una vez
 * que el celular resolvió un código, puede volver a entrar aunque el directorio
 * esté caído.
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

async function consultarDirectorio(codigo: string): Promise<TenantConfig> {
  if (!config.directorioUrl) {
    const demo = DIRECTORIO_DEMO[codigo];
    if (!demo) throw new TenantError("no_encontrado", `Código ${codigo} no está en el directorio demo`);
    return { ...demo, publico: false };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.timeoutMs);
  try {
    const res = await fetch(`${config.directorioUrl}/${encodeURIComponent(codigo)}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (res.status === 404) {
      throw new TenantError("no_encontrado", `Código ${codigo} no existe`);
    }
    if (!res.ok) {
      throw new TenantError("directorio_inaccesible", `Directorio respondió ${res.status}`);
    }
    return parseRespuesta(codigo, await res.json());
  } catch (e) {
    if (e instanceof TenantError) throw e;
    throw new TenantError("directorio_inaccesible", "No se pudo consultar el directorio");
  } finally {
    clearTimeout(timer);
  }
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

/**
 * Punto único donde se elige la fuente de datos.
 *
 * Las pantallas importan `repo` de acá y no saben qué hay detrás. `NEXT_PUBLIC_BACKEND`
 * elige el modo:
 *
 *   mock      datos de ejemplo, sin red (el valor por defecto)
 *   supabase  contra el proyecto que resuelva el código de empresa
 *   http      siempre contra la API, sin mirar el directorio
 *
 * En modo `supabase` la fuente se decide **por empresa**, no para toda la app:
 * una que tiene ERP se lee por su API, una que no, por nuestras tablas. Son
 * decenas de ERPs, cada uno su deploy, y abajo de la misma app: una sola
 * variable global no alcanzaba para eso.
 */
import { assertConfig, config } from "../config";
import { httpRepo } from "./http";
import { mockRepo } from "./mock";
import { supabaseRepo } from "./supabase";
import { tenantEnUso } from "../supabase/client";
import type { Repo } from "./ports";

assertConfig();

/** Qué implementación corresponde a la empresa que está activa ahora. */
export function implActiva(): Repo {
  if (config.backend === "mock") return mockRepo;
  if (config.backend === "http") return httpRepo;
  // Tener `apiUrl` es lo que distingue a una empresa con ERP: ahí las ventas
  // las registra el ERP, con su numeración, su caja y su asiento contable.
  return tenantEnUso()?.apiUrl ? httpRepo : supabaseRepo;
}

/**
 * Se resuelve en cada uso, no al importar: cuando este módulo se carga todavía
 * no hubo login, así que no se sabe de qué empresa es quien va a entrar.
 */
export const repo: Repo = new Proxy({} as Repo, {
  get: (_t, prop) => implActiva()[prop as keyof Repo],
});

export const usaSupabase = config.backend === "supabase";

export * from "./ports";
export { ApiError } from "./http";
export { AuthError } from "./supabase-auth";
export { registrar } from "./supabase";

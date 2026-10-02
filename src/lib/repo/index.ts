/**
 * Punto único donde se elige la fuente de datos.
 *
 * Las pantallas importan `repo` de acá y no saben si detrás hay datos de ejemplo,
 * Supabase o una API propia. Se elige con `NEXT_PUBLIC_BACKEND` en `.env.local`:
 *
 *   mock      datos de ejemplo, sin red (el valor por defecto)
 *   supabase  contra el proyecto que resuelva el código de empresa
 *   http      contra una API propia (esqueleto, sin terminar)
 */
import { assertConfig, config } from "../config";
import { httpRepo } from "./http";
import { mockRepo } from "./mock";
import { supabaseRepo } from "./supabase";
import type { Repo } from "./ports";

assertConfig();

export const repo: Repo =
  config.backend === "supabase" ? supabaseRepo : config.backend === "http" ? httpRepo : mockRepo;

export const usaSupabase = config.backend === "supabase";

export * from "./ports";
export { ApiError } from "./http";
export { AuthError } from "./supabase-auth";
export { registrar } from "./supabase";

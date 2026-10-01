/**
 * Punto único donde se elige la fuente de datos.
 *
 * Las pantallas importan `repo` de acá y no saben si detrás hay datos de ejemplo
 * o una API. Para conectar el backend real: poner `NEXT_PUBLIC_BACKEND=http` y
 * `NEXT_PUBLIC_API_URL` en `.env.local`, y completar `http.ts`.
 */
import { assertConfig, config } from "../config";
import { httpRepo } from "./http";
import { mockRepo } from "./mock";
import type { Repo } from "./ports";

assertConfig();

export const repo: Repo = config.backend === "http" ? httpRepo : mockRepo;

export * from "./ports";
export { ApiError } from "./http";

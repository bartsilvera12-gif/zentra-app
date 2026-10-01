/**
 * Configuración por entorno. Los valores vienen de `.env.local` (no versionado);
 * ver `.env.example` para la lista completa.
 *
 * Sólo las variables con prefijo `NEXT_PUBLIC_` llegan al cliente, y como esta app
 * se empaqueta como APK, TODO lo que pongas acá queda visible para cualquiera que
 * descompile el paquete. Nunca pongas acá credenciales de base de datos ni claves
 * privadas: sólo la URL de la API y claves públicas (anon key de Supabase y
 * similares, que están pensadas para exponerse y se protegen con permisos del lado
 * del servidor).
 */

/** Qué fuente de datos usa la app. */
export type Backend = "mock" | "http";

export const config = {
  /** "mock" usa los datos de ejemplo; "http" pega contra la API real. */
  backend: (process.env.NEXT_PUBLIC_BACKEND as Backend) || "mock",
  /** URL base de la API, sin barra final. Ej: https://api.zentra.com.py */
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, ""),
  /** Timeout de red en milisegundos. */
  timeoutMs: Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 15000),
} as const;

export function assertConfig(): void {
  if (config.backend === "http" && !config.apiUrl) {
    throw new Error(
      "NEXT_PUBLIC_BACKEND=http requiere NEXT_PUBLIC_API_URL. Revisá tu .env.local.",
    );
  }
}

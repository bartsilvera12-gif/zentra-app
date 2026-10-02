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

  /**
   * Directorio que traduce código de empresa → a qué Supabase conectarse.
   * Vacío usa el directorio demo incluido, para poder probar sin el servicio real.
   */
  directorioUrl: (process.env.NEXT_PUBLIC_DIRECTORIO_URL || "").replace(/\/$/, ""),

  /** Supabase público: el de quien baja la app de la tienda y se registra. */
  supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, ""),
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",

  /**
   * WhatsApp de soporte, en formato internacional y sólo dígitos (595981000450).
   * Vacío oculta los enlaces de contacto en vez de abrir un chat a la nada.
   */
  soporteWhatsapp: (process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP || "595981000450").replace(/\D/g, ""),
} as const;

/**
 * Enlace a WhatsApp con un mensaje ya escrito. Devuelve null si no hay número
 * configurado, para que quien lo use sepa que no tiene que mostrar el enlace.
 */
export function linkWhatsapp(mensaje: string): string | null {
  if (!config.soporteWhatsapp) return null;
  return `https://wa.me/${config.soporteWhatsapp}?text=${encodeURIComponent(mensaje)}`;
}

export function assertConfig(): void {
  if (config.backend === "http" && !config.apiUrl) {
    throw new Error(
      "NEXT_PUBLIC_BACKEND=http requiere NEXT_PUBLIC_API_URL. Revisá tu .env.local.",
    );
  }
}

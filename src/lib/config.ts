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
export type Backend = "mock" | "supabase" | "http";

/**
 * Normaliza la URL base del ERP: sin barra final y terminada en `/api`.
 * Vacío devuelve vacío — `assertConfig` es quien se queja de eso.
 */
export function urlDeApi(crudo: string | undefined): string {
  const base = (crudo || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  return /\/api$/i.test(base) ? base : `${base}/api`;
}

export const config = {
  /** "mock" datos de ejemplo · "supabase" el proyecto real · "http" una API propia. */
  backend: (process.env.NEXT_PUBLIC_BACKEND as Backend) || "mock",
  /**
   * URL base de la API del ERP. Se escribe como el host nomás
   * (`https://api.neura.com.py`) y acá se le agrega el `/api` donde el ERP
   * monta sus rutas, porque es un Next.js: `/api/ventas/create` y compañía.
   *
   * Si alguien ya lo escribe con `/api` al final, no se duplica. Una barra
   * final tampoco molesta. Es la clase de detalle que, mal resuelto, da un 404
   * que parece "el endpoint no existe" cuando en realidad la URL quedó con
   * `/api/api/` en el medio.
   */
  apiUrl: urlDeApi(process.env.NEXT_PUBLIC_API_URL),
  /** Timeout de red en milisegundos. */
  timeoutMs: Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 15000),

  /**
   * Directorio que traduce código de empresa → a qué Supabase conectarse.
   * Vacío usa el directorio demo incluido, para poder probar sin el servicio real.
   */
  directorioUrl: (process.env.NEXT_PUBLIC_DIRECTORIO_URL || "").replace(/\/$/, ""),

  /**
   * Directorio escrito a mano, como JSON, para no depender de ningún servicio.
   *
   *   {"JM":{"nombre":"Distribuidora JM","supabaseUrl":"https://...","anonKey":"eyJ..."}}
   *
   * Sirve para probar el código de empresa hoy, y alcanza en producción mientras
   * los clientes con ERP se cuenten con los dedos. Tiene un costo: agregar una
   * empresa pide recompilar la app, porque esto se hornea en el paquete. Cuando
   * eso moleste, se pasa a `directorioUrl`.
   *
   * Gana sobre `directorioUrl` si están los dos: lo de adentro del paquete no
   * depende de la red.
   */
  directorioJson: process.env.NEXT_PUBLIC_DIRECTORIO_JSON || "",

  /** Supabase público: el de quien baja la app de la tienda y se registra. */
  supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, ""),
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",

  /**
   * WhatsApp de soporte, en formato internacional y sólo dígitos (595981000450).
   * Vacío oculta los enlaces de contacto en vez de abrir un chat a la nada.
   */
  soporteWhatsapp: (process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP || "595981000450").replace(/\D/g, ""),

  /**
   * El commit del que salió este build. Lo pone el workflow.
   *
   * Sin esto, "¿qué versión tenés instalada?" no se puede contestar: dos APK
   * se ven iguales, y uno pierde media hora buscando un error que ya estaba
   * arreglado en el build siguiente.
   */
  build: (process.env.NEXT_PUBLIC_BUILD_SHA || "").slice(0, 7),

  /**
   * La versión que se muestra al usuario. Va acá y no en `data.ts`, que son los
   * datos de ejemplo: el cliente del ERP la manda al registrar el teléfono para
   * las notificaciones, y no tiene por qué importar nada del prototipo para eso.
   */
  version: "2.4.1",
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
  if (
    config.backend === "supabase" &&
    !config.supabaseUrl &&
    !config.directorioUrl &&
    !config.directorioJson
  ) {
    throw new Error(
      "NEXT_PUBLIC_BACKEND=supabase requiere NEXT_PUBLIC_SUPABASE_URL (la instalación " +
        "pública), o NEXT_PUBLIC_DIRECTORIO_JSON o NEXT_PUBLIC_DIRECTORIO_URL (para " +
        "resolver por código de empresa). Revisá tu .env.local.",
    );
  }
  // Un JSON mal escrito dejaría el código de empresa roto sin que nadie se entere
  // hasta que un vendedor no pueda entrar. Mejor que la app no arranque.
  if (config.directorioJson) {
    try {
      const d = JSON.parse(config.directorioJson);
      if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("no es un objeto");
    } catch (e) {
      throw new Error(
        `NEXT_PUBLIC_DIRECTORIO_JSON no es un JSON válido (${
          e instanceof Error ? e.message : "error"
        }). Tiene que ser un objeto {"CODIGO": {...}}.`,
      );
    }
  }
}

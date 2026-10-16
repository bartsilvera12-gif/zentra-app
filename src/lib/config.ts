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
   * WhatsApp de soporte de la app, en formato internacional y sólo dígitos.
   *
   * Es el número de ATC de Zentra, no el de la empresa que usa la app: quien
   * escribe desde acá tiene un problema con la app, y del otro lado contesta
   * el equipo de Zentra.
   *
   * Vacío oculta los enlaces de contacto en vez de abrir un chat a la nada.
   */
  soporteWhatsapp: (process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP || "595973989068").replace(/\D/g, ""),

  /**
   * El commit del que salió este build. Lo pone el workflow.
   *
   * Sin esto, "¿qué versión tenés instalada?" no se puede contestar: dos APK
   * se ven iguales, y uno pierde media hora buscando un error que ya estaba
   * arreglado en el build siguiente.
   */
  build: (process.env.NEXT_PUBLIC_BUILD_SHA || "").slice(0, 7),

  /**
   * Dónde se paga la suscripción.
   *
   * Es una página web, fuera de la app, y no por comodidad: vender una
   * suscripción adentro de una app Android, cobrando a clientes de Paraguay,
   * choca con la política de pagos de Google Play. La apertura a cobros
   * externos de 2026 llega a Estados Unidos, Reino Unido y el EEE; Paraguay
   * no está. Está explicado en docs/COBROS.md.
   */
  cobrosUrl: (process.env.NEXT_PUBLIC_COBROS_URL || "").replace(/\/+$/, ""),

  /**
   * Si la pantalla de suscripción muestra un botón que abre esa página.
   *
   * Apagado por defecto, y es a propósito: lo que Play no permite no es sólo
   * cobrar adentro, es también mandar a pagar afuera. Con esto apagado la app
   * dice cuál es el plan y cuándo vence —informar siempre se puede— y la
   * dirección queda como texto, para escribirla en el navegador.
   *
   * Se prende con `NEXT_PUBLIC_LINK_DE_PAGO=1` en el APK que se reparte por
   * fuera de la tienda, donde esa política no rige. La compilación que sube a
   * Play se arma sin esa variable.
   */
  linkDePago: process.env.NEXT_PUBLIC_LINK_DE_PAGO === "1",

  /**
   * La versión que se muestra al usuario. Va acá y no en `data.ts`, que son los
   * datos de ejemplo: el cliente del ERP la manda al registrar el teléfono para
   * las notificaciones, y no tiene por qué importar nada del prototipo para eso.
   */
  version: "2.4.1",
} as const;

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

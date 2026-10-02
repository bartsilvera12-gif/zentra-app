/**
 * Un "tenant" es a qué instalación se conecta la app: el Supabase público (registro
 * abierto, para quien baja la app de la tienda) o el de un cliente que ya tiene ERP.
 *
 * El usuario lo elige en el login escribiendo su código de empresa. Si lo deja
 * vacío, va al público.
 */
export interface TenantConfig {
  /** Código normalizado. Cadena vacía para el tenant público. */
  codigo: string;
  /** Nombre para mostrar, ej. "Distribuidora JM". */
  nombre: string;
  supabaseUrl: string;
  anonKey: string;
  /** true cuando es la instalación pública, donde el registro está abierto. */
  publico: boolean;
}

export type TenantErrorKind =
  /** El código no existe en el directorio. */
  | "no_encontrado"
  /** El directorio no respondió y no había nada guardado en el dispositivo. */
  | "directorio_inaccesible"
  /** El directorio respondió, pero con datos incompletos. */
  | "respuesta_invalida";

export class TenantError extends Error {
  constructor(
    readonly kind: TenantErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "TenantError";
  }
}

/** Mensaje para mostrarle al usuario, sin jerga técnica. */
export function mensajeTenantError(e: unknown): string {
  if (e instanceof TenantError) {
    switch (e.kind) {
      case "no_encontrado":
        // El enlace de WhatsApp ya está arriba del campo, no hace falta repetirlo.
        return "No encontramos ese código de empresa. Revisalo e intentá de nuevo.";
      case "directorio_inaccesible":
        return "No pudimos verificar el código. Revisá tu conexión e intentá de nuevo.";
      case "respuesta_invalida":
        return "Hubo un problema con la configuración de esa empresa. Escribinos por WhatsApp.";
    }
  }
  return "No pudimos conectar. Revisá tu conexión e intentá de nuevo.";
}

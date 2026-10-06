import type { Plan } from "../planes";

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
  /**
   * Schema de Postgres donde están las tablas. `zentra` por defecto.
   *
   * Es configurable porque una instalación dentro del proyecto de un cliente
   * puede no tener nuestras tablas sino **vistas** que traducen las suyas. Esas
   * vistas viven en su propio schema, y así la app lee los datos que ya tiene
   * ese cliente sin que nadie copie nada.
   */
  schema: string;
  /**
   * API del ERP de esa empresa, si tiene una. Vacío usa `NEXT_PUBLIC_API_URL`.
   *
   * Un ERP puede atender a varias empresas desde un solo dominio: resuelve a qué
   * empresa pertenece quien entra mirando su token, no la URL. En ese caso todas
   * comparten esta URL y no hace falta ponerla por empresa.
   *
   * Pero si mañana un cliente tiene su ERP en su propio dominio, la app tiene que
   * poder apuntar ahí sin recompilarse con otra variable de entorno. Por eso vive
   * en el directorio, al lado del código de empresa.
   */
  apiUrl: string;
  /** true cuando es la instalación pública, donde el registro está abierto. */
  publico: boolean;
  /**
   * RUC y ciudad de quien factura, para la cabecera de la factura.
   *
   * Vacío cuando el directorio no los trae, y entonces la factura lo dice en
   * vez de inventarlos. Una factura con el RUC de otro no es un detalle
   * estético: es un comprobante inválido, y el que la emitió no se enteró.
   */
  ruc: string;
  ciudad: string;
  /**
   * Plan contratado. Sólo importa cuando la empresa **no** tiene ERP: con ERP
   * propio está todo desbloqueado y este campo se ignora.
   *
   * Vive acá, en el directorio, y no en el ERP de cada cliente: así agregar
   * planes no obliga a tocar el sistema de nadie. Si el directorio no lo trae,
   * se asume `free`, que es el que menos deja hacer — ante la duda, no regalar.
   */
  plan: Plan;
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

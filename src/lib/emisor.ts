/**
 * Quién factura: el encabezado de la factura.
 *
 * Esto estaba escrito a mano en las dos vistas de factura, con el nombre y el
 * RUC de un cliente de ejemplo. En una app multiempresa eso no es un detalle
 * estético: toda factura emitida desde cualquier otra empresa salía con el RUC
 * ajeno, lo cual es un comprobante inválido, y el que la emitió no se enteraba.
 *
 * Ahora sale del tenant. Y lo que no está, no se inventa: la factura dice que
 * falta y por qué, que es información útil, mientras un RUC inventado es una
 * mentira que se descubre en la mesa de la DNIT.
 */
import type { TenantConfig } from "./tenant/types";

export interface Emisor {
  nombre: string;
  /** Vacío cuando no está configurado. */
  ruc: string;
  ciudad: string;
  /**
   * Qué le falta para ser un comprobante válido, en texto. `null` cuando no
   * falta nada.
   */
  falta: string | null;
}

export function datosEmisor(tenant: TenantConfig | null, nombreSesion?: string): Emisor {
  // El nombre de la empresa de la sesión gana sobre el del directorio: es el
  // que el propio ERP devuelve, así que es el que el cliente ve en su sistema.
  const nombre = (nombreSesion || "").trim() || tenant?.nombre?.trim() || "";
  const ruc = (tenant?.ruc || "").trim();
  const ciudad = (tenant?.ciudad || "").trim();

  const faltantes: string[] = [];
  if (!nombre) faltantes.push("la razón social");
  if (!ruc) faltantes.push("el RUC");

  return {
    nombre: nombre || "Empresa sin configurar",
    ruc,
    ciudad,
    falta: faltantes.length
      ? `Falta ${faltantes.join(" y ")} de quien factura. Hasta cargarlos, esto es un comprobante interno, no una factura legal.`
      : null,
  };
}

/** La segunda línea del encabezado, con lo que haya. */
export function lineaEmisor(e: Emisor): string {
  const partes = [e.ruc ? "RUC " + e.ruc : "Sin RUC cargado", e.ciudad].filter(Boolean);
  return partes.join(" · ");
}

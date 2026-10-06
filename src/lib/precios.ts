/**
 * Qué precio le corresponde a cada cliente.
 *
 * El producto puede tener dos: el de mostrador y el de quien compra por
 * cantidad. Cuál se usa lo decide la lista del cliente, no quien está
 * cargando la venta: si fuera una elección manual, el precio de un mismo
 * cliente dependería de quién lo atendió ese día.
 *
 * Vive aparte de la pantalla porque lo necesitan dos lugares —el listado de
 * productos y el carrito— y porque es la clase de regla que conviene poder
 * probar sin abrir la app.
 */
import type { Cliente, Producto } from "./types";

/** La lista que marca a un cliente como mayorista. */
const MAYORISTA = /mayor/i;

export function esMayorista(cliente: Cliente | null | undefined): boolean {
  return MAYORISTA.test(cliente?.lista ?? "");
}

/**
 * El precio a cobrar.
 *
 * Sin cliente identificado se cobra el de mostrador: una venta sin nombre no
 * puede ser mayorista, porque no hay a quién corresponderle esa lista.
 *
 * Un producto sin precio mayorista cargado también cae al de mostrador, aunque
 * el cliente sea mayorista. Cobrar cero sería peor que cobrar de más.
 */
export function precioPara(producto: Producto, cliente: Cliente | null | undefined): number {
  if (!esMayorista(cliente)) return producto.precio;
  const mayorista = producto.precioMayorista;
  return typeof mayorista === "number" && mayorista > 0 ? mayorista : producto.precio;
}

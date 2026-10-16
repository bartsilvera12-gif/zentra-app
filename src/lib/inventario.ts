/**
 * Las reglas del alta de productos que no dependen de la pantalla.
 *
 * Viven acá por el mismo motivo que `proveedor.ts`: se pueden probar sin
 * levantar la app, y así la regla no queda escrita dentro de un `onClick` donde
 * nadie la vuelve a leer.
 *
 * Lo que hay acá es lo que se revisa **al guardar**. Un campo escondido o un
 * botón apagado son una ayuda para que la persona no pierda el tiempo, no un
 * límite: el formulario se puede dejar abierto, cambiar de plan, volver y
 * guardar. El límite es el que corre en el guardado.
 */
import type { Motivo } from "./planes";
import { norm } from "./format";

/**
 * Si esa categoría ya existe en el inventario.
 *
 * Compara sin tildes ni mayúsculas, igual que la búsqueda: quien escribe
 * "bebidas" teniendo "Bebidas" no está creando una categoría nueva, está
 * escribiendo mal la que ya tiene. Dejarlo pasar es lo que llenaba el
 * inventario de categorías que eran la misma.
 */
export function categoriaConocida(categoria: string, existentes: string[]): boolean {
  const c = norm(categoria.trim());
  if (!c) return true; // sin categoría no se crea nada
  return existentes.some((e) => norm(e.trim()) === c);
}

/**
 * Por qué no se puede guardar con esta categoría, o `null` si se puede.
 *
 * `bloqueo` es lo que contestó `motivoBloqueo("inventario.categoria", …)`. Si
 * el plan no deja crear categorías, se puede elegir una de las que ya hay —eso
 * no crea nada— pero no escribir una nueva. Antes el texto lo avisaba y nada
 * más: el campo seguía editable y el guardado no miraba, así que en Gratis se
 * creaban categorías igual.
 */
export function motivoCategoria(
  categoria: string,
  existentes: string[],
  bloqueo: Motivo,
): Motivo {
  if (!bloqueo) return null;
  if (categoriaConocida(categoria, existentes)) return null;
  return bloqueo;
}

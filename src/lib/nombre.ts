/**
 * Cómo se muestra el nombre de una persona en una pantalla angosta.
 *
 * El ERP devuelve el nombre como está cargado, que suele ser el legal completo
 * y en mayúsculas: "KAREN MAGNOLIA AYALA URUNAGA". Eso en el encabezado de un
 * celular empuja al nombre de la empresa y se lee como un grito.
 */

/** Partículas que van con el apellido que sigue: "de la Cruz", "Da Silva". */
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "da", "do", "dos", "van", "von", "di", "san"]);

/**
 * Pasa a mayúscula inicial respetando las partículas y lo que ya venía escrito
 * con mayúsculas y minúsculas mezcladas (ahí se asume que está bien y no se toca).
 */
function capitalizar(palabra: string): string {
  if (!palabra) return palabra;
  if (palabra !== palabra.toUpperCase() && palabra !== palabra.toLowerCase()) return palabra;
  const baja = palabra.toLocaleLowerCase("es-PY");
  if (PARTICULAS.has(baja)) return baja;
  // "maría josé" y "ayala-urunaga": cada parte lleva su mayúscula.
  return baja.replace(/(^|[-'’])([a-záéíóúüñ])/g, (_, s, c) => s + c.toLocaleUpperCase("es-PY"));
}

/**
 * Nombre corto para el encabezado: primer nombre y primer apellido.
 *
 *   "KAREN MAGNOLIA AYALA URUNAGA" → "Karen Ayala"
 *
 * En Paraguay lo normal son dos nombres y dos apellidos, así que con cuatro
 * palabras se toma la primera y la tercera. Con menos no se adivina: se
 * devuelven las que haya, porque equivocarse de apellido es peor que mostrar
 * uno de más.
 *
 * Un correo se deja entero: cortarlo lo vuelve otra dirección.
 */
export function nombreCorto(completo: string): string {
  const limpio = (completo || "").trim().replace(/\s+/g, " ");
  if (!limpio) return "";
  if (limpio.includes("@")) return limpio;

  const partes = limpio.split(" ");

  // Una partícula marca dónde arranca el apellido: en "MARIA DE LA CRUZ" el
  // apellido es "de la Cruz", no "La". Cortarlo ahí daría un apellido que no
  // existe, que es peor que uno largo.
  const corte = partes.findIndex((w, i) => i >= 1 && PARTICULAS.has(w.toLocaleLowerCase("es-PY")));
  if (corte >= 1) return [partes[0], ...partes.slice(corte)].map(capitalizar).join(" ");

  const elegidas = partes.length >= 4 ? [partes[0], partes[2]] : partes.slice(0, 2);
  return elegidas.map(capitalizar).join(" ");
}

/** La inicial para el círculo del avatar. */
export function inicialDe(completo: string): string {
  const c = (completo || "").trim();
  return c ? c.slice(0, 1).toLocaleUpperCase("es-PY") : "?";
}

/**
 * El rol como lo escribe el ERP: "vendedor_movil", "VENDEDOR", "cajero".
 * Se muestra "Vendedor móvil".
 */
export function rolLegible(rol: string): string {
  const base = (rol || "").trim().replace(/[_-]+/g, " ").toLocaleLowerCase("es-PY");
  if (!base) return "";
  const conTildes = base
    .replace(/\bmovil\b/g, "móvil")
    .replace(/\badmin\b/g, "administrador");
  return conTildes.charAt(0).toLocaleUpperCase("es-PY") + conTildes.slice(1);
}

/**
 * La fecha de hoy como se escribe acá: "Lun 5 oct 2026".
 *
 * Estaba fija en el código y mostraba siempre el mismo día. Una fecha que no
 * cambia es peor que no mostrar ninguna: alguien la lee y cree que la pantalla
 * quedó vieja — o peor, que los números que están al lado son de ese día.
 */
export function fechaDeHoy(ahora: Date = new Date()): string {
  const texto = new Intl.DateTimeFormat("es-PY", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(ahora);
  // Viene "lun, 5 oct 2026" o "lun, 5 de oct de 2026" según el navegador.
  const limpio = texto.replace(/,/g, "").replace(/\bde\b/g, "").replace(/\./g, "").replace(/\s+/g, " ").trim();
  return limpio.charAt(0).toLocaleUpperCase("es-PY") + limpio.slice(1);
}

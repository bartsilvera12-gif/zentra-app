/**
 * El color del círculo con la inicial, uno por contacto.
 *
 * Veinte conversaciones con el mismo círculo del mismo color se leen como una
 * pared: la inicial es lo único que las distingue y hay que leerla de a una.
 * Con un color por contacto, el ojo encuentra "la celeste" antes de terminar de
 * leer el nombre — y como el color sale del nombre, es siempre el mismo para la
 * misma persona, en este teléfono y en cualquier otro.
 *
 * No es azar de verdad: azar sería un color distinto en cada pantalla, que es
 * peor que no tener color. Es el nombre convertido en número.
 *
 * Dos paletas, porque un pastel sobre fondo negro brilla y un tono profundo
 * sobre fondo blanco se ve sucio. Cada par trae su propia tinta para que la
 * inicial se lea sobre su fondo: eso es lo que no se puede improvisar en la
 * pantalla.
 */

export interface ColorAvatar {
  fondo: string;
  tinta: string;
}

/** Claro: pasteles con tinta oscura. */
const PASTELES: ColorAvatar[] = [
  { fondo: "#DCEFF2", tinta: "#15565F" },
  { fondo: "#D7F0EA", tinta: "#13594F" },
  { fondo: "#D9EAF7", tinta: "#1A4B6E" },
  { fondo: "#DDF0D8", tinta: "#2F5B2A" },
  { fondo: "#FBE7C6", tinta: "#7A5312" },
  { fondo: "#FADFE9", tinta: "#7A2E4B" },
  { fondo: "#E6E2F5", tinta: "#413A6B" },
  { fondo: "#F6DCDC", tinta: "#7E3030" },
];

/** Oscuro: tonos profundos con tinta clara. */
const PROFUNDOS: ColorAvatar[] = [
  { fondo: "#16414A", tinta: "#A9E2EC" },
  { fondo: "#163F38", tinta: "#9FE0D0" },
  { fondo: "#1C3A52", tinta: "#BBDDF2" },
  { fondo: "#26412A", tinta: "#B5E0B8" },
  { fondo: "#4A3A17", tinta: "#F2D79A" },
  { fondo: "#4A2238", tinta: "#F0B8D2" },
  { fondo: "#2E2A4D", tinta: "#C7C0F0" },
  { fondo: "#4A2626", tinta: "#F2B8B8" },
];

/**
 * Número estable a partir del texto (djb2).
 *
 * Tiene que ser estable entre arranques y entre teléfonos: por eso no se usa
 * nada del entorno ni el orden de la lista. El mismo nombre da siempre el mismo
 * número.
 */
function numeroDe(texto: string): number {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * El color de un contacto. `semilla` es lo que lo identifica: el id si lo hay,
 * y si no el nombre.
 */
export function colorAvatar(semilla: string, oscuro: boolean): ColorAvatar {
  const paleta = oscuro ? PROFUNDOS : PASTELES;
  const limpia = (semilla || "").trim();
  // Sin nombre no hay color propio: va el primero, que es el de la marca.
  if (!limpia) return paleta[0];
  return paleta[numeroDe(limpia.toLowerCase()) % paleta.length];
}

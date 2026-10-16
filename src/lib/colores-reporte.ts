/**
 * Los colores de los reportes.
 *
 * Viven acá y no en la pantalla por dos razones. La primera es que son
 * decisiones con reglas, no gustos: hay que poder probarlas. La segunda es que
 * un gráfico elige color por lo que el dato HACE —magnitud, identidad,
 * estado—, y eso es una regla distinta de la del resto de la app, donde el
 * color sólo dice "mirá esto".
 *
 * Siguen las familias de la marca igual que todo lo demás —azul y verde
 * azulado para la identidad, ámbar y naranja para lo que pide atención, rojo
 * para lo que ya es un problema— pero con tonos propios, más profundos.
 *
 * Por qué más profundos: los de la interfaz están pensados para una píldora
 * con texto encima, y en una barra o una porción de dona quedan dos cosas
 * distintas que se leen igual. Los de acá están verificados con el validador
 * de paletas: cada par de colores que se toca se distingue con visión normal y
 * con daltonismo, y todos tienen contraste suficiente contra el fondo.
 *
 * El caso que lo motivó: "Bajo mínimo" (#FFB701) y "Agotados" (#FC8500) eran
 * dos ámbares separados por 11,6 de diferencia percibida, cuando el piso para
 * visión normal es 15. En la dona de inventario eran casi el mismo color —y
 * son justamente los dos estados que hay que distinguir de un vistazo—.
 */

/** Los cuatro colores del sistema, en sus dos versiones. */
export const PALETA = {
  claro: {
    azul: "#0C73A6",
    ambar: "#D99400",
    verde: "#068C7F",
    rojo: "#B23A10",
  },
  oscuro: {
    // No son los mismos aclarados: el modo oscuro tiene su propia banda de
    // luminosidad, más angosta, y un color que funciona sobre blanco se apaga
    // o se quema sobre negro. Están elegidos y verificados aparte.
    azul: "#2E90C4",
    ambar: "#B8871F",
    verde: "#189488",
    rojo: "#B83A2E",
  },
} as const;

export type NombreColor = keyof typeof PALETA.claro;

export function color(nombre: NombreColor, oscuro: boolean): string {
  return PALETA[oscuro ? "oscuro" : "claro"][nombre];
}

/** El color que identifica cada reporte. */
export const COLOR_DE_TAB = {
  ventas: "azul",
  compras: "ambar",
  inventario: "verde",
} as const satisfies Record<string, NombreColor>;

/**
 * La rampa de una barra, de lo más chico a lo más grande.
 *
 * Un solo tono, de claro a oscuro. Es la regla de las escalas de magnitud: el
 * color dice cuánto, y como dice lo mismo que la altura, se lee sin pensar —la
 * barra más alta es también la más intensa—.
 *
 * Lo que NO se hace: un color distinto por barra. Eso sería tratar los días
 * como categorías y el color dejaría de significar nada.
 */
export const RAMPAS: Record<NombreColor, { claro: string[]; oscuro: string[] }> = {
  azul: {
    claro: ["#BFDCEA", "#8FC3DC", "#4E9CC4", "#1E7FAE", "#0C73A6"],
    oscuro: ["#2A5F7E", "#33769B", "#3D8DB8", "#4A9FCC", "#5CB2DD"],
  },
  ambar: {
    claro: ["#F3E0B4", "#E8C878", "#DFB13F", "#D99400", "#B8781A"],
    oscuro: ["#6E5519", "#8A6B1F", "#A68226", "#C09A33", "#D2B150"],
  },
  verde: {
    claro: ["#BCE2DC", "#8CCFC5", "#4FB4A7", "#1C9A8C", "#068C7F"],
    oscuro: ["#1C5E57", "#22756C", "#288C81", "#2FA396", "#44B8AA"],
  },
  rojo: {
    claro: ["#F0C9BC", "#E0A08A", "#CE7154", "#BE4C28", "#B23A10"],
    oscuro: ["#6E352B", "#8A4234", "#A5503E", "#BD5F4C", "#CE735F"],
  },
};

/*
 * El primer paso de las rampas oscuras no es casi negro, y eso es a propósito:
 * una barra chica pintada con un tono apenas más claro que la tarjeta
 * desaparece. En oscuro la escala va de un tono medio a uno brillante, al
 * revés que en claro, porque sobre fondo negro lo que resalta es la luz.
 */

/**
 * Dónde cae un valor en la rampa.
 *
 * Sin escala logarítmica ni nada parecido: la barra más alta se lleva el tono
 * más oscuro y el resto se reparte proporcionalmente. Un día en cero no se
 * pinta del tono más claro sino que queda abajo igual, porque "no hubo nada"
 * no es "hubo poquito".
 */
export function pasoDeRampa(valor: number, max: number, pasos: number): number {
  if (!(max > 0) || !(valor > 0)) return 0;
  const p = Math.ceil((valor / max) * pasos) - 1;
  return Math.min(Math.max(p, 0), pasos - 1);
}

/** El color de una barra según cuánto vale. */
export function colorDeBarra(
  nombre: NombreColor,
  valor: number,
  max: number,
  oscuro: boolean,
): string {
  const rampa = RAMPAS[nombre][oscuro ? "oscuro" : "claro"];
  return rampa[pasoDeRampa(valor, max, rampa.length)];
}

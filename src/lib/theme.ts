import type { ModuleDef, ModuleKey, ThemeName, ThemeTokens } from "./types";

export const THEME: Record<ThemeName, ThemeTokens> = {
  claro: {
    bg: "#f3f5f8",
    card: "#ffffff",
    ink: "#141a2e",
    ink2: "#65707f",
    ink3: "#5b6676",
    dim: "#c3cbd6",
    border: "#e3e7ee",
  },
  /**
   * El oscuro sale de la marca, no de un gris neutro.
   *
   * Antes era un azul grisáceo (#0b0f1c / #151b2e) que no se parecía a nada del
   * resto de la app: cambiando de modo parecía otro producto. Estos tonos son
   * el mismo azul petróleo del encabezado, bajado de luminosidad.
   *
   * `card` separa más de `bg` que antes (1.39 contra 1.12): en el chat los
   * globos recibidos quedaban casi fundidos con el fondo. No se aclara más
   * porque a partir de ahí `ink3` baja de 4.5:1 y el texto secundario deja de
   * cumplir contraste.
   */
  oscuro: {
    bg: "#0A1F2A",
    card: "#143A49",
    ink: "#EAF2F5",
    ink2: "#A8C2CC",
    ink3: "#89A6B2",
    dim: "#3C5A68",
    border: "#1D4252",
  },
};

/**
 * Los colores de la marca, en un solo lugar.
 *
 * Antes cada pantalla de adentro tenía el suyo —azul, oro, violeta, cian— y el
 * encabezado cambiaba de color al navegar: parecía otra app en cada pantalla.
 *
 * Ahora el encabezado es siempre el mismo azul, con un verde de acento. Los
 * dos son de la marca. El ámbar y el naranja quedan para los avisos, que es
 * donde el color tiene que querer decir algo.
 *
 * Los botones del inicio son la excepción y conservan sus seis colores: ahí
 * sirven para encontrar el de siempre sin leer. Ver `MODULES`.
 */
export const MARCA = {
  /** El encabezado de todas las pantallas. */
  header: "#023047",
  /** Un tono más claro, para lo que se superpone al encabezado. */
  headerSuave: "#04617A",
  /** El acento, el mismo verde del ícono de la app. */
  acento: "#1C8C84",
  /** Texto sobre el encabezado o el acento. */
  sobre: "#ffffff",
  /** Etiquetas y texto secundario sobre el encabezado. */
  sobreSuave: "#8ECAE6",

  /**
   * Los dos colores que SÍ gritan, y sólo para eso: algo que requiere una
   * decisión. Ámbar es "mirá esto" (bajo mínimo, por cobrar) y naranja es "ya
   * es un problema" (agotado, vencido).
   *
   * Si se usan de adorno dejan de verse. Ese era el problema de antes.
   */
  aviso: "#FFB701",
  alerta: "#FC8500",
  /** El ámbar oscurecido, para texto sobre fondo claro: el otro no se lee. */
  avisoInk: "#8A5F00",

  /** El azul de la marca, aclarado, para fondos de etiquetas y avisos suaves. */
  suave: "#E2F0F4",
  suaveInk: "#5C7A85",
} as const;

/**
 * Los botones del inicio. Acá el color SÍ se queda.
 *
 * Es la única pantalla donde seis colores ayudan en vez de molestar: son seis
 * destinos uno al lado del otro, siempre en el mismo lugar, y el color es lo
 * que deja encontrar el de siempre sin leer. Un vendedor que entra veinte
 * veces por día va al naranja, no a "Conversaciones".
 *
 * Lo que molestaba era el resto: que cada pantalla de adentro tuviera además
 * su propio acento, y que el encabezado cambiara de color al navegar. Eso se
 * unificó; esto no.
 *
 * `color` es el fondo en reposo y `fill` el que se pinta al tocarlo.
 */
/**
 * Los botones del inicio.
 *
 *   color   el fondo en reposo. Es lo que identifica a cada módulo: se busca
 *           "el morado" sin leer el rótulo.
 *   fill    el punto que crece al apretar. Tiene que ser pariente de `color`
 *           —misma familia, otra luminosidad— porque el mismo texto se lee
 *           sobre los dos.
 *   over    el texto y el ícono.
 *
 * Los seis colores en reposo son distintos a propósito: encontrar el de
 * siempre sin leer es justo para lo que sirve el color acá. Es la excepción al
 * resto de la app, donde el color significa estado y no decoración.
 *
 * `#3D6282` y `#FFD277` no están en la paleta original de cinco: son un tono
 * más claro de `#2A445E` y del ámbar. Hacían falta dos tonos más —seis
 * baldosas, dos tonos cada una— y antes que meter un color nuevo es preferible
 * estirar los que ya están.
 *
 * Contrastes del texto, medidos sobre fondo y sobre relleno: ninguno baja de
 * 5:1. El relleno ámbar es claro y no oscuro porque oscurecerlo dejaba el
 * texto en 3.56, por debajo del mínimo.
 */
export const MODULES: Record<ModuleKey, ModuleDef> = {
  venta: { title: "Nueva venta", color: "#2A445E", fill: "#346B6D", over: "#ffffff" },
  clientes: { title: "Clientes", color: "#346B6D", fill: "#2A445E", over: "#ffffff" },
  compras: { title: "Compras", color: "#F3AA20", fill: "#FFD277", over: "#2A445E" },
  inventario: { title: "Inventario", color: "#58094F", fill: "#841E62", over: "#ffffff" },
  conversaciones: { title: "Conversaciones", color: "#841E62", fill: "#58094F", over: "#ffffff" },
  proveedores: { title: "Proveedores", color: "#3D6282", fill: "#2A445E", over: "#ffffff" },
  reportes: { title: "Reportes", color: "#2A445E", fill: "#346B6D", over: "#ffffff" },
};

/** Brand palette, named so screens stop repeating raw hex. */
export const C = {
  azul: "#023047",
  azulMedio: "#04617A",
  cian: "#209EBB",
  cianClaro: "#8ECAE6",
  teal: "#1C8C84",
  ambar: "#FFB701",
  naranja: "#FC8500",
  oro: "#96731A",
  violeta: "#525890",
  blanco: "#ffffff",
} as const;

/** Status tints. Each pair is (background, ink) as the prototype uses them. */
export const TINT = {
  okBg: "#EAF3EF",
  okInk: "#1F5C46",
  avisoBg: "#FFF3DC",
  avisoInk: "#6B4A00",
  errorBg: "#FBE9E7",
  errorInk: "#8C2F2B",
  infoBg: "#E2F0F4",
  infoInk: "#04617A",
  tealBg: "#E3F1EF",
  tealInk: "#0C5F58",
  crmBg: "#EDE8F7",
  crmInk: "#4B3C86",
} as const;

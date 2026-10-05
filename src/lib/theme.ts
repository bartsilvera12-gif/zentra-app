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
  oscuro: {
    bg: "#0b0f1c",
    card: "#151b2e",
    ink: "#eef1f6",
    ink2: "#a3adbe",
    ink3: "#7d879a",
    dim: "#3b4459",
    border: "#252d42",
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
export const MODULES: Record<ModuleKey, ModuleDef> = {
  venta: { title: "Nueva venta", color: "#023047", fill: "#04617A", over: "#ffffff" },
  clientes: { title: "Clientes", color: "#04617A", fill: "#023047", over: "#ffffff" },
  compras: { title: "Compras", color: "#FFB701", fill: "#FC8500", over: "#023047" },
  inventario: { title: "Inventario", color: "#8ECAE6", fill: "#8ECAE6", over: "#023047" },
  conversaciones: { title: "Conversaciones", color: "#FC8500", fill: "#FFB701", over: "#023047" },
  proveedores: { title: "Proveedores", color: "#209EBB", fill: "#8ECAE6", over: "#023047" },
  reportes: { title: "Reportes", color: "#023047", fill: "#04617A", over: "#ffffff" },
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

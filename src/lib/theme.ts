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
 * Antes cada pantalla tenía el suyo —azul, oro, violeta, cian, naranja— y el
 * inicio seis botones de seis colores distintos. Parecía otra app en cada
 * pantalla, y el color no significaba nada: era decoración. Cuando todo
 * resalta, no resalta nada, y lo que de verdad importa —un stock agotado, una
 * venta sin cobrar— se perdía entre lo demás.
 *
 * Ahora hay un azul para el encabezado y un verde de acento, que son los dos
 * de la marca. El color vuelve a querer decir algo: los avisos.
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
 * Los módulos ya no llevan color propio: el ícono y el nombre alcanzan para
 * distinguirlos. `color` es el fondo en reposo y `fill` el que se pinta al
 * tocarlo.
 */
export const MODULES: Record<ModuleKey, ModuleDef> = {
  venta: { title: "Nueva venta", color: MARCA.header, fill: MARCA.headerSuave, over: MARCA.sobre },
  clientes: { title: "Clientes", color: MARCA.header, fill: MARCA.headerSuave, over: MARCA.sobre },
  compras: { title: "Compras", color: MARCA.header, fill: MARCA.headerSuave, over: MARCA.sobre },
  inventario: { title: "Inventario", color: MARCA.header, fill: MARCA.headerSuave, over: MARCA.sobre },
  conversaciones: { title: "Conversaciones", color: MARCA.header, fill: MARCA.headerSuave, over: MARCA.sobre },
  proveedores: { title: "Proveedores", color: MARCA.header, fill: MARCA.headerSuave, over: MARCA.sobre },
  reportes: { title: "Reportes", color: MARCA.header, fill: MARCA.headerSuave, over: MARCA.sobre },
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

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

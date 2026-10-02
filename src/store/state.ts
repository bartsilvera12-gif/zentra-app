import type { TenantConfig } from "@/lib/tenant/types";
import type {
  CompraLinea,
  Compra,
  Cliente,
  InvProducto,
  Iva,
  IvaVenta,
  ModuleKey,
  MovTipo,
  Movimiento,
  Proveedor,
  RepTab,
  ThemeName,
} from "@/lib/types";

export type Screen =
  | "login"
  | "recupero"
  | "home"
  | "config"
  | "module"
  | "venta"
  | "clientes"
  | "compras"
  | "inventario"
  | "conversaciones"
  | "proveedores"
  | "reportes"
  | "detventas";

export type VentaPaso = "cliente" | "productos" | "resumen" | "pago" | "listo" | "factura";
export type CompraPaso = "proveedor" | "producto" | "condiciones" | "listo";

export interface AppState {
  screen: Screen;
  user: string;
  pass: string;
  error: boolean;
  mod: ModuleKey | null;
  theme: ThemeName;

  /* Elección de instalación (código de empresa) */
  /**
   * Respuesta a "¿ya tenés un ERP con nosotros?". En false la app entra a la
   * instalación pública y ni se muestra el campo del código, que a quien no tiene
   * ERP sólo lo confunde.
   */
  tieneErp: boolean;
  codigoEmpresa: string;
  /** Instalación resuelta. null hasta que se resuelve el código en el login. */
  tenant: TenantConfig | null;
  tenantResolviendo: boolean;
  /** Mensaje listo para mostrar; cadena vacía cuando no hay error. */
  tenantError: string;

  /* Password recovery */
  mail: string;
  sent: boolean;

  /* Sale wizard */
  vPaso: VentaPaso;
  vCliente: string | null;
  vSinNombre: boolean;
  vQuery: string;
  vQCliente: string;
  vCart: Record<string, number>;
  vIva: Record<string, IvaVenta>;
  vMetodo: string | null;
  vCredito: boolean;
  vPlazo: string;
  vMonedaUsd: boolean;

  /* Clientes */
  cSub: "lista" | "detalle" | "nuevo";
  cQuery: string;
  cFiltro: string;
  cSel: string | null;
  cExtra: Cliente[];

  /* Compras */
  kSub: "lista" | "detalle" | "nueva";
  kQuery: string;
  kFiltro: string;
  kSel: string | null;
  kExtra: Compra[];
  kPaso: CompraPaso;
  kQProv: string;
  kProv: string | null;
  kQProd: string;
  kProd: string | null;
  kLineas: CompraLinea[];
  kCant: string;
  kCosto: string;
  kMoneda: "PYG" | "USD";
  kCambio: string;
  kIva: Iva;
  kPago: "Contado" | "Crédito";
  kPlazo: string;
  kCuotas: string;
  kNroFac: string;
  kTimbrado: string;
  kAdjunto: boolean;
  kMargen: number;
  kUltimo: string;

  /* Proveedores */
  vwSub: "lista" | "detalle" | "nuevo";
  vwQuery: string;
  vwFiltro: string;
  vwSel: string | null;
  vwExtra: Proveedor[];
  pfDoc: string;
  pfNombre: string;
  pfRubro: string;
  pfCiudad: string;
  pfContacto: string;
  pfTel: string;
  pfEmail: string;
  pfCredito: boolean;
  pfPlazo: number;
  pfEntrega: string;
  /** Mocked SET lookup result ("razón social"), or null when not queried. */
  pfSet: string | null;
  pfError: boolean;

  /* Reportes */
  rTab: RepTab;
  rDesde: string;
  rHasta: string;
  rPreset: string;
  rExportado: boolean;

  /* Detalle de ventas */
  dvSub: "lista" | "factura";
  dvQuery: string;
  dvFiltro: string;
  dvSel: string | null;
  dvAccion: string;
  dvPdf: boolean;
  dvShare: boolean;

  /* Conversaciones */
  xPanel: "none" | "adj" | "stick";
  xPanelTab: "Emojis" | "Stickers" | "GIF";
  xGrab: boolean;
  xSeg: number;
  xSub: "lista" | "chat" | "nuevo";
  xQuery: string;
  xFiltro: string;
  xSel: string | null;
  xTexto: string;
  xEnviados: Record<string, import("@/lib/types").ChatMsg[]>;
  xLeidos: Record<string, boolean>;
  xnQuery: string;

  /* Inventario */
  iSub: "lista" | "detalle" | "movs" | "ajuste" | "nuevo";
  iQuery: string;
  iFiltro: string;
  iSel: string | null;
  iExtra: InvProducto[];
  iMovExtra: Movimiento[];
  /** Stock deltas applied by manual adjustments, keyed by product id. */
  iDelta: Record<string, number>;
  iMovFiltro: string;

  /* Ajuste de stock */
  ajProd: string | null;
  ajQuery: string;
  ajTipo: MovTipo;
  ajCant: string;
  ajMotivo: string;

  /* Nuevo producto */
  npNombre: string;
  npSku: string;
  npBarras: string;
  npUnidad: string;
  npCategoria: string;
  npDeposito: string;
  npCosto: string;
  npPrecio: string;
  npIva: Iva;
  npStock: string;
  npMinimo: string;
  npMetodo: "CPP" | "FIFO" | "LIFO";
  npError: boolean;

  /* Alta de cliente */
  fDoc: string;
  fNombre: string;
  fSet: string | null;
  fError: boolean;
  /** Where the form was opened from: changes which fields show and where saving returns to. */
  fOrigen: "modulo" | "venta";
  fContacto: string;
  fTel: string;
  fEmail: string;
  fZona: string;
  fDireccion: string;
  fLista: string;
  fCredito: boolean;
  fLimite: string;
  fPlazoCli: string;

  /* Configuración */
  auto: boolean;
  push: boolean;
  stock: boolean;
  resumen: boolean;
  sonido: boolean;

  /* Home dashboard */
  hover: ModuleKey | null;
  /** Index of the visible dashboard page. */
  dash: number;
  /** Animation progress 0→1 used to grow the dashboard charts. */
  dashP: number;
}

export const initialState: AppState = {
  screen: "login",
  user: "",
  pass: "",
  error: false,
  mod: null,
  theme: "claro",

  tieneErp: false,
  codigoEmpresa: "",
  tenant: null,
  tenantResolviendo: false,
  tenantError: "",

  mail: "",
  sent: false,

  vPaso: "cliente",
  vCliente: null,
  vSinNombre: false,
  vQuery: "",
  vQCliente: "",
  vCart: {},
  vIva: {},
  vMetodo: null,
  vCredito: false,
  vPlazo: "30",
  vMonedaUsd: false,

  cSub: "lista",
  cQuery: "",
  cFiltro: "Todos",
  cSel: null,
  cExtra: [],

  kSub: "lista",
  kQuery: "",
  kFiltro: "Todas",
  kSel: null,
  kExtra: [],
  kPaso: "proveedor",
  kQProv: "",
  kProv: null,
  kQProd: "",
  kProd: null,
  kLineas: [],
  kCant: "",
  kCosto: "",
  kMoneda: "PYG",
  kCambio: "7550",
  kIva: "10%",
  kPago: "Contado",
  kPlazo: "30",
  kCuotas: "1",
  kNroFac: "",
  kTimbrado: "",
  kAdjunto: false,
  kMargen: 30,
  kUltimo: "COMP-000148",

  vwSub: "lista",
  vwQuery: "",
  vwFiltro: "Todos",
  vwSel: null,
  vwExtra: [],
  pfDoc: "",
  pfNombre: "",
  pfRubro: "",
  pfCiudad: "",
  pfContacto: "",
  pfTel: "",
  pfEmail: "",
  pfCredito: true,
  pfPlazo: 30,
  pfEntrega: "",
  pfSet: null,
  pfError: false,

  rTab: "ventas",
  rDesde: "2026-09-24",
  rHasta: "2026-09-30",
  rPreset: "7 días",
  rExportado: false,

  dvSub: "lista",
  dvQuery: "",
  dvFiltro: "Todas",
  dvSel: null,
  dvAccion: "",
  dvPdf: false,
  dvShare: false,

  xPanel: "none",
  xPanelTab: "Emojis",
  xGrab: false,
  xSeg: 0,
  xSub: "lista",
  xQuery: "",
  xFiltro: "Todas",
  xSel: null,
  xTexto: "",
  xEnviados: {},
  xLeidos: {},
  xnQuery: "",

  iSub: "lista",
  iQuery: "",
  iFiltro: "Todos",
  iSel: null,
  iExtra: [],
  iMovExtra: [],
  iDelta: {},
  iMovFiltro: "Todos",

  ajProd: null,
  ajQuery: "",
  ajTipo: "ENTRADA",
  ajCant: "",
  ajMotivo: "Inventario físico",

  npNombre: "",
  npSku: "",
  npBarras: "",
  npUnidad: "UNIDAD",
  npCategoria: "",
  npDeposito: "",
  npCosto: "",
  npPrecio: "",
  npIva: "10%",
  npStock: "",
  npMinimo: "",
  npMetodo: "CPP",
  npError: false,

  fDoc: "",
  fNombre: "",
  fSet: null,
  fError: false,
  fOrigen: "modulo",
  fContacto: "",
  fTel: "",
  fEmail: "",
  fZona: "",
  fDireccion: "",
  fLista: "Mayorista",
  fCredito: false,
  fLimite: "",
  fPlazoCli: "30",

  auto: false,
  push: true,
  stock: true,
  resumen: false,
  sonido: true,

  hover: null,
  dash: 0,
  dashP: 1,
};

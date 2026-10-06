import { haceDias, hoyIso } from "@/lib/format";
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

  /** Pantalla de entrada: iniciar sesión o crear cuenta. */
  modoAcceso: "login" | "registro";
  /** Perfil de la sesión abierta. null mientras no haya login. */
  sesion: { nombre: string; rol: string; empresa: string } | null;
  /** Mensaje de error de autenticación, listo para mostrar. */
  authError: string;
  entrando: boolean;

  /* Alta de cuenta (sólo en la instalación pública) */
  regNombre: string;
  regEmpresa: string;
  regMail: string;
  regPass: string;
  /** true cuando Supabase pide confirmar el correo antes de entrar. */
  regConfirmar: boolean;

  /* Borrado de cuenta */
  borrarAbierto: boolean;
  /** Hay que escribir ELIMINAR para habilitar el botón: evita el toque accidental. */
  borrarTexto: string;
  borrando: boolean;
  borrarError: string;

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
  vwSub: "lista" | "detalle" | "nuevo" | "editar";
  pfGuardando: boolean;
  pfErrorTexto: string;
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
  xPanelTab: "Emojis" | "Stickers";
  /**
   * El mensaje que se está citando para responder, resumido en una línea.
   *
   * Es sólo lo que se muestra arriba del campo de escritura: el ERP no tiene
   * endpoint para responder a un mensaje puntual, así que la cita viaja como
   * texto adelante de la respuesta. Es lo mismo que hace alguien a mano cuando
   * escribe "sobre lo del contrato:".
   */
  xCita: string | null;
  xGrab: boolean;
  xSeg: number;
  xSub: "lista" | "chat" | "nuevo";
  /**
   * La foto o el video abiertos a pantalla completa, si hay alguno.
   *
   * Vive acá y no adentro de la pantalla para que el botón "atrás" de Android
   * lo pueda cerrar: `decidirAtras` sólo ve el estado, y si esto fuera local
   * el gesto saldría del chat con el visor todavía abierto encima.
   */
  xVisor: { src: string; tipo: "foto" | "video" } | null;
  /**
   * El motivo por el que algo no se puede, para mostrarlo arriba de todo.
   *
   * Vive en el estado y no en cada pantalla porque lo levantan varias: el
   * inicio al tocar un módulo bloqueado, inventario al llegar al tope, ventas
   * al elegir crédito. El texto ya viene escrito desde `motivoBloqueo`.
   */
  avisoPlan: string | null;
  xQuery: string;
  /** Lo que dijo el ERP si un mensaje no se pudo enviar. */
  xEnvioError: string;
  /** El menú que se abre al tocar la foto de perfil. */
  menuPerfil: boolean;
  xFiltro: string;
  xSel: string | null;
  xTexto: string;
  xEnviados: Record<string, import("@/lib/types").ChatMsg[]>;
  xLeidos: Record<string, boolean>;
  xnQuery: string;

  /* Inventario */
  iSub: "lista" | "detalle" | "movs" | "ajuste" | "nuevo" | "editar";
  /** Precio mayorista y vencimiento: sólo en Max, y por eso opcionales. */
  npBarras: string;
  npMayorista: string;
  npVencimiento: string;
  /** Mientras se guarda contra el backend, para no mandar dos veces. */
  npGuardando: boolean;
  /** El error del backend al guardar, para mostrarlo en el formulario. */
  npErrorTexto: string;
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
  npUnidad: string;
  npCategoria: string;
  npCosto: string;
  npPrecio: string;
  npIva: Iva;
  npStock: string;
  npMinimo: string;
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
  /** Mientras se pide el permiso y el token al sistema. */
  pushOcupado: boolean;
  /** Por qué no se pudieron activar los avisos. Vacío = sin problema. */
  pushAviso: string;

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

  modoAcceso: "login",
  sesion: null,
  authError: "",
  entrando: false,

  regNombre: "",
  regEmpresa: "",
  regMail: "",
  regPass: "",
  regConfirmar: false,

  borrarAbierto: false,
  borrarTexto: "",
  borrando: false,
  borrarError: "",

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
  pfGuardando: false,
  pfErrorTexto: "",
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
  // La semana que termina hoy. Estaba fijo en septiembre de 2026, de cuando
  // los datos eran de ejemplo: con datos reales, Reportes abría en un rango
  // pasado y salía vacío sin que se entendiera por qué.
  rDesde: haceDias(7),
  rHasta: hoyIso(),
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
  xCita: null,
  xGrab: false,
  xSeg: 0,
  xSub: "lista",
  xVisor: null,
  avisoPlan: null,
  xQuery: "",
  xEnvioError: "",
  menuPerfil: false,
  xFiltro: "Todas",
  xSel: null,
  xTexto: "",
  xEnviados: {},
  xLeidos: {},
  xnQuery: "",

  iSub: "lista",
  npBarras: "",
  npMayorista: "",
  npVencimiento: "",
  npGuardando: false,
  npErrorTexto: "",
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
  npUnidad: "UNIDAD",
  npCategoria: "",
  npCosto: "",
  npPrecio: "",
  npIva: "10%",
  npStock: "",
  npMinimo: "",
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

  // Arranca siguiendo al teléfono. El valor de verdad lo pone AppContext al
  // montar, leyendo la preferencia guardada y el tema del sistema.
  auto: true,
  // Arranca apagado: activarlo pide permiso al sistema, y el sistema sólo
  // pregunta una vez. Mostrarlo encendido sin haber pedido nada sería mentir.
  push: false,
  pushOcupado: false,
  pushAviso: "",

  hover: null,
  dash: 0,
  dashP: 1,
};

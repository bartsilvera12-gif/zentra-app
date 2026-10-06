/** Domain types for Zentra Móvil, derived from the Claude Design prototype. */

/** IVA rates as Paraguayan invoicing expresses them. The rate is *contained* in the price. */
export type Iva = "10%" | "5%" | "Exenta";
/** The sale wizard rotates through this upper-cased variant. */
export type IvaVenta = "10%" | "5%" | "EXENTA";

export type ThemeName = "claro" | "oscuro";

export interface ThemeTokens {
  bg: string;
  card: string;
  ink: string;
  ink2: string;
  ink3: string;
  dim: string;
  border: string;
}

export type ModuleKey =
  | "venta"
  | "clientes"
  | "compras"
  | "inventario"
  | "conversaciones"
  | "proveedores"
  | "reportes";

export interface ModuleDef {
  title: string;
  color: string;
  fill: string;
  over: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  doc: string;
  contacto: string;
  tel: string;
  email: string;
  estado: "Activo" | "Inactivo";
  origen: "Venta" | "Manual" | "CRM";
  saldo: number;
  compras: number;
  desde: string;
  zona: string;
  direccion?: string;
  lista?: string;
  credito?: string;
}

export interface Producto {
  id: string;
  nombre: string;
  sku: string;
  stock: number;
  precio: number;
}

export interface VentaLinea {
  nombre: string;
  qty: number;
  precio: number;
  iva: Iva;
}

export interface Venta {
  id: string;
  iso: string;
  numero: string;
  cliId: string | null;
  cliente: string;
  doc: string;
  fecha: string;
  pago: string;
  estado: "Cobrada" | "Pendiente";
  lineas: VentaLinea[];
}

export interface InvProducto {
  id: string;
  nombre: string;
  sku: string;
  stock: number;
  minimo: number;
  costo: number;
  precio: number;
  unidad: string;
  categoria: string;
  deposito: string;
  iva: Iva;
  metodo: "CPP" | "FIFO" | "LIFO";
  barras: string;
}

export type MovTipo = "ENTRADA" | "SALIDA" | "AJUSTE";

export interface Movimiento {
  id: string;
  prodId: string;
  tipo: MovTipo;
  cant: number;
  origen: string;
  ref: string;
  fecha: string;
  usuario: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  doc: string;
  condicion: string;
  rubro: string;
  ciudad: string;
  contacto: string;
  tel: string;
  email: string;
  estado: "Activo" | "Inactivo";
  entrega: number;
  chatId: string | null;
}

export interface CompraLinea {
  prodId: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  costo: number;
  iva: Iva;
}

export interface Compra {
  id: string;
  numero: string;
  provId: string | null;
  producto: string;
  cantidad: number;
  costo: number;
  iva: Iva | "Mixto";
  pago: "Contado" | "Crédito";
  plazo: number;
  cuotas: number;
  estado: "Pendiente" | "Pagada";
  fecha: string;
  factura: string;
  timbrado: string;
  lineas?: CompraLinea[];
}

export interface ChatPedido {
  tag: string;
  total: number;
  detalle: string;
}

export interface ChatArchivo {
  tag: string;
  nombre: string;
  peso: string;
  /** Dónde está el archivo. Sin esto la tarjeta se ve pero no se puede abrir. */
  url?: string;
}

export interface ChatMsg {
  de: "yo" | "ellos";
  texto?: string;
  hora: string;
  tick?: string;
  pedido?: ChatPedido;
  archivo?: ChatArchivo;
  sticker?: string;
  /** Duration label, e.g. "0:07". Present only on voice notes. */
  audio?: string;
  /** El archivo de la nota de voz. Sin esto la onda se dibuja pero no suena. */
  audioUrl?: string;
  /** Foto recibida o enviada: URL servida por el ERP. */
  imagen?: string;
  /** Video, misma idea que `imagen`. */
  video?: string;
  /**
   * El mensaje llegó reenviado de otra conversación. No cambia el contenido,
   * pero sí lo que significa: "me lo mandaron" no es "esto lo escribí yo".
   */
  reenviado?: boolean;
  /** Texto que vino junto a la foto o el documento. */
  epigrafe?: string;
  /**
   * Una reacción no es un mensaje: es un emoji pegado a otro. Viene como fila
   * propia igual, así que se marca para dibujarla suelta y no como globo. Antes
   * se veía un globo que decía "[reaction]", que no le dice nada a nadie.
   */
  reaccion?: string;
}

export interface Chat {
  id: string;
  nombre: string;
  tipo: "Cliente" | "Proveedor";
  refId: string | null;
  enLinea: boolean;
  hora: string;
  noLeidos: number;
  /**
   * Quién atiende la conversación: el agente asignado o, si no hay, la cola.
   * `null` cuando no la tomó nadie todavía.
   */
  responsable?: string | null;
  msgs: ChatMsg[];
}

export interface Adjunto {
  /** Elige el ícono y qué hace al tocarlo. No es decorativo. */
  key: string;
  label: string;
  tag: string;
  nombre: string;
  peso: string;
}


export type RepTab = "ventas" | "inventario" | "compras";

export interface DonaItem {
  label: string;
  pct: number;
  color: string;
}

export interface RankItem {
  label: string;
  valor: string;
  sub: string;
  v: number;
}

export interface RepCfg {
  serieTitulo: string;
  badge: string;
  dona: string;
  donaItems: DonaItem[];
  donaValor: string;
  donaSub: string;
  rankTitulo: string;
  rank: RankItem[];
  tablaTitulo: string;
  nota: string;
}

export interface RepKpi {
  label: string;
  valor: string;
  delta: string;
  /** true = good trend, false = bad trend, null = neutral. */
  up: boolean | null;
}

export interface RepTablaFila {
  k: string;
  sub: string;
  v: string;
}

export interface Paso {
  id: string;
  nombre: string;
}

export interface Metodo {
  value: string;
  label: string;
  tag: string;
}

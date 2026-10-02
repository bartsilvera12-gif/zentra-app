/**
 * Puertos de acceso a datos.
 *
 * Las pantallas nunca leen datos directamente: piden todo a través de estas
 * interfaces. Hoy las implementa `mock.ts` con los datos de ejemplo; cuando esté
 * el backend se agrega otra implementación (`http.ts`) y se cambia qué devuelve
 * `repo/index.ts`. Ninguna pantalla se toca.
 *
 * Las operaciones están definidas por lo que las pantallas necesitan, no por la
 * forma que tenga el backend. El adaptador traduce de la API a estos tipos.
 */
import type {
  Chat,
  ChatMsg,
  Cliente,
  Compra,
  CompraLinea,
  InvProducto,
  Iva,
  MovTipo,
  Movimiento,
  Producto,
  Proveedor,
  RepTab,
  Venta,
} from "../types";

/* ---------- autenticación ---------- */

export interface Sesion {
  /** Token a mandar en cada request. */
  token: string;
  usuario: { id: string; nombre: string; rol: string; empresa: string };
}

export interface AuthRepo {
  login(usuario: string, password: string): Promise<Sesion>;
  logout(): Promise<void>;
  /** Sesión guardada, si la hay. Se usa para no pedir login en cada arranque. */
  sesionActual(): Promise<Sesion | null>;
  recuperarPassword(correo: string): Promise<void>;
  /**
   * Borra la cuenta y sus datos. Es irreversible, y las dos tiendas lo exigen
   * para apps que permiten registrarse.
   */
  eliminarCuenta(): Promise<void>;
}

/* ---------- clientes ---------- */

export interface ClienteInput {
  nombre: string;
  doc: string;
  contacto: string;
  tel: string;
  email: string;
  zona: string;
  direccion: string;
  lista: string;
  /** null = sin crédito habilitado. */
  credito: { limite: number; plazoDias: number } | null;
  origen: Cliente["origen"];
}

export interface ClientesRepo {
  list(params?: { q?: string; estado?: "Activo" | "Inactivo" }): Promise<Cliente[]>;
  get(id: string): Promise<Cliente | null>;
  create(input: ClienteInput): Promise<Cliente>;
  /** Consulta de RUC/CI en la SET. Devuelve null si no se encuentra. */
  consultarSet(doc: string): Promise<{ razonSocial: string; activo: boolean } | null>;
}

/* ---------- proveedores ---------- */

export interface ProveedorInput {
  nombre: string;
  doc: string;
  rubro: string;
  ciudad: string;
  contacto: string;
  tel: string;
  email: string;
  /** null = contado. */
  credito: { plazoDias: number } | null;
  entregaDias: number;
}

export interface ProveedoresRepo {
  list(params?: { q?: string; estado?: "Activo" | "Inactivo"; conDeuda?: boolean }): Promise<Proveedor[]>;
  get(id: string): Promise<Proveedor | null>;
  create(input: ProveedorInput): Promise<Proveedor>;
  /** Saldo pendiente con el proveedor, en guaraníes. */
  deuda(id: string): Promise<number>;
  consultarSet(doc: string): Promise<{ razonSocial: string; activo: boolean } | null>;
}

/* ---------- inventario ---------- */

export interface ProductoInput {
  nombre: string;
  sku: string;
  barras: string;
  unidad: string;
  categoria: string;
  deposito: string;
  costo: number;
  precio: number;
  iva: Iva;
  stockInicial: number;
  minimo: number;
  metodo: InvProducto["metodo"];
}

export interface AjusteInput {
  prodId: string;
  tipo: MovTipo;
  cantidad: number;
  motivo: string;
}

export interface InventarioRepo {
  list(params?: {
    q?: string;
    filtro?: "Todos" | "Bajo mínimo" | "Agotados" | "Con stock";
  }): Promise<InvProducto[]>;
  get(id: string): Promise<InvProducto | null>;
  create(input: ProductoInput): Promise<InvProducto>;
  movimientos(params?: { prodId?: string; tipo?: MovTipo }): Promise<Movimiento[]>;
  /** Registra el ajuste y devuelve el movimiento creado. */
  ajustar(input: AjusteInput): Promise<Movimiento>;
}

/* ---------- ventas ---------- */

export interface VentaLineaInput {
  prodId: string;
  cantidad: number;
  /** Precio unitario con IVA incluido. */
  precio: number;
  iva: Iva;
}

export interface VentaInput {
  /** null para venta sin nombre. */
  clienteId: string | null;
  lineas: VentaLineaInput[];
  pago:
    | { tipo: "contado"; metodo: "efectivo" | "transferencia" | "cheque" }
    | { tipo: "credito"; plazoDias: number };
  moneda: "PYG" | "USD";
}

export interface VentasRepo {
  /** Catálogo vendible, con precio y stock disponible. */
  productos(params?: { q?: string }): Promise<Producto[]>;
  list(params: { desde: string; hasta: string; q?: string; estado?: Venta["estado"] }): Promise<Venta[]>;
  get(id: string): Promise<Venta | null>;
  /** Registra la venta. El número de comprobante lo asigna el backend. */
  create(input: VentaInput): Promise<Venta>;
}

/* ---------- compras ---------- */

export interface CompraInput {
  provId: string;
  lineas: CompraLinea[];
  pago: { tipo: "contado" } | { tipo: "credito"; plazoDias: number; cuotas: number };
  comprobante: { numero: string; timbrado: string };
  moneda: "PYG" | "USD";
  /** Cotización usada si la moneda es USD. */
  tipoCambio?: number;
}

export interface ComprasRepo {
  list(params?: { q?: string; estado?: Compra["estado"] }): Promise<Compra[]>;
  get(id: string): Promise<Compra | null>;
  create(input: CompraInput): Promise<Compra>;
}

/* ---------- conversaciones ---------- */

export interface ChatsRepo {
  list(params?: { q?: string; tipo?: Chat["tipo"]; soloNoLeidas?: boolean }): Promise<Chat[]>;
  get(id: string): Promise<Chat | null>;
  enviar(chatId: string, msg: Omit<ChatMsg, "hora" | "tick">): Promise<ChatMsg>;
  marcarLeido(chatId: string): Promise<void>;
}

/* ---------- reportes ---------- */

export interface ResumenReporte {
  /** Un punto por día del rango. */
  serie: { fecha: string; valor: number }[];
  total: number;
  kpis: { label: string; valor: string; delta: string; up: boolean | null }[];
  dona: { label: string; pct: number; color: string }[];
  ranking: { label: string; valor: number; sub: string }[];
  tabla: { k: string; sub: string; v: string }[];
}

export interface ReportesRepo {
  resumen(tab: RepTab, desde: string, hasta: string): Promise<ResumenReporte>;
}

/* ---------- raíz ---------- */

export interface Repo {
  auth: AuthRepo;
  clientes: ClientesRepo;
  proveedores: ProveedoresRepo;
  inventario: InventarioRepo;
  ventas: VentasRepo;
  compras: ComprasRepo;
  chats: ChatsRepo;
  reportes: ReportesRepo;
}

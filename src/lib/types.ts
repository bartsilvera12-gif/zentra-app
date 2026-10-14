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
  /** Precio por cantidad, si el producto lo tiene. */
  precioMayorista?: number | null;
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
  /**
   * Precio para quien compra por cantidad. Opcional: no todos los negocios
   * venden al por mayor, y donde no existe no se muestra la columna.
   */
  precioMayorista?: number | null;
  /** Vencimiento del producto, en ISO corto (`2026-12-31`). */
  vencimiento?: string | null;
  /**
   * Cuándo se ajustó el stock por última vez, para el límite de un ajuste por
   * mes. Lo escribe el backend al ajustar; la app sólo lo lee.
   */
  ultimoAjuste?: string | null;
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

/**
 * Una cuenta del plan de cuentas del ERP.
 *
 * La compra no se puede registrar sin esto: el ERP arma el asiento contable en
 * el mismo movimiento, y el asiento necesita saber en qué cuenta va el gasto y
 * de dónde sale la plata. Elegirlas automáticamente sería escribir en los
 * libros de otro.
 */
export interface CuentaContable {
  id: string;
  /** El número de cuenta, como lo usa contabilidad ("5.1.01.001"). */
  codigo: string;
  nombre: string;
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
  /**
   * El id del mensaje en WhatsApp.
   *
   * Hace falta para reaccionar: la reacción no apunta a una fila de la base del
   * ERP sino al mensaje de WhatsApp. Sin esto no hay a qué reaccionar. Falta en
   * los mensajes que todavía no salieron (los que están "enviando").
   */
  wamid?: string;
  texto?: string;
  hora: string;
  /** `"✓"` salió, `"✓✓"` llegó. Sólo en los míos. */
  tick?: string;
  /**
   * El otro lo abrió.
   *
   * Es el tercer estado que faltaba: WhatsApp distingue "salió" (un tilde),
   * "llegó al teléfono" (dos tildes grises) y "lo leyó" (dos tildes en color).
   * La app juntaba los dos primeros en un tilde, así que un mensaje entregado
   * se veía igual que uno que todavía estaba saliendo.
   */
  leido?: boolean;
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
  /**
   * A qué mensaje responde este, para dibujar la cita arriba del globo.
   *
   * `texto` es el resumen de lo citado y `mio` de qué lado estaba, que es lo
   * que decide el color de la barrita. Sale de `reply_context` cuando la
   * respuesta la mandamos nosotros, y del nodo `context` de WhatsApp —resuelto
   * contra el hilo— cuando responde el cliente.
   */
  cita?: { texto: string; mio: boolean };
  reaccion?: string;
  /**
   * De qué lado se dibuja la reacción: la del mensaje al que reacciona, no la
   * de quien reaccionó. Si un cliente le pone un pulgar a algo que escribí yo,
   * el emoji va con mi mensaje, a la derecha.
   */
  reaccionSobreMio?: boolean;
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
  /**
   * La cola de atención en la que el ERP puso la conversación ("Ventas",
   * "Soporte"). `undefined` o `null` es "este ERP no informa la cola", y
   * entonces el listado no se divide en pestañas.
   */
  cola?: string | null;
  /**
   * La conversación está cerrada en el ERP: alguien la finalizó y la tipificó.
   *
   * No se mezclan con las abiertas en la lista: compiten por los mismos lugares
   * de cada tanda y taparían lo que hay que atender. Tienen su propio filtro.
   */
  cerrada?: boolean;
  msgs: ChatMsg[];
}

/* ---------- la ficha del contacto del chat ---------- */

/**
 * Quién es la persona del otro lado, y de dónde viene.
 *
 * Es la misma ficha que el ERP muestra al costado del chat en la web. No se
 * arma en la app: la trae el ERP entero por `/chat/contactos/ficha`, porque
 * adentro hay datos con permisos propios (los proyectos) y eso se decide en el
 * servidor, no acá.
 */
export interface FichaContactoChat {
  nombre: string;
  telefono: string;
  /**
   * El "teléfono" es en realidad un código interno de WhatsApp (@lid), no un
   * número al que se pueda llamar. Hay que decirlo: si no, alguien lo marca.
   */
  esCodigoInterno: boolean;
  primerContacto: string | null;
}

export interface FichaClienteChat {
  id: string;
  nombre: string;
  ruc: string | null;
  email: string | null;
  telefono: string | null;
  ciudad: string | null;
  direccion: string | null;
}

/** Un proyecto del cliente: de acá sale "de qué proyecto viene" la conversación. */
export interface FichaProyectoChat {
  id: string;
  nombre: string;
  tipo: string | null;
  estado: string | null;
  /** El color que el ERP le puso al estado. Se respeta para que coincida con la web. */
  estadoColor: string | null;
  /** Terminado o sacado de circulación: se muestra igual, pero apagado y al final. */
  cerrado: boolean;
  responsables: string | null;
}

/** Cómo se cerró la última vez que se atendió a este contacto. */
export interface FichaCierreChat {
  estado: string;
  comentario: string | null;
  fecha: string | null;
  por: string | null;
  /** Se reabrió después de ese cierre: la tipificación quedó vieja. */
  reabierta: boolean;
  /** El cierre es de otra conversación del mismo contacto. */
  deOtraConversacion: boolean;
}

/** Otra conversación del mismo contacto. */
export interface FichaConversacionChat {
  id: string;
  canal: string | null;
  cola: string | null;
  agente: string | null;
  abierta: boolean;
  fecha: string | null;
  /** La que está abierta ahora mismo. */
  actual: boolean;
}

/** Un paso del recorrido: cuándo, qué pasó, quién y a dónde fue. */
export interface FichaPasoChat {
  id: string;
  fecha: string;
  tipo: "ingreso" | "asignado" | "tomado" | "transferido" | "cola" | "cerrado" | "sistema";
  accion: string;
  linea: string | null;
  usuario: string | null;
  destino: string | null;
}

export interface FichaChat {
  contacto: FichaContactoChat;
  cliente: FichaClienteChat | null;
  /**
   * `null` no es "no tiene proyectos": es "esta persona no tiene acceso al
   * módulo de proyectos", y entonces la sección no se dibuja. El vacío es `[]`.
   */
  proyectos: FichaProyectoChat[] | null;
  cierre: FichaCierreChat | null;
  conversaciones: FichaConversacionChat[];
  recorrido: FichaPasoChat[];
  /** Avisos del propio ERP (p. ej. historial incompleto por datos viejos). */
  notas: string[];
}

/* ---------- transferir una conversación ---------- */

export interface ColaDestino {
  id: string;
  nombre: string;
}

export interface AgenteDestino {
  id: string;
  nombre: string;
  colaId: string;
  colaNombre: string;
  /** Está en turno (`ready`): si no, no le entran chats automáticos. */
  disponible: boolean;
  /** Tiene el inbox abierto ahora mismo. */
  enLinea: boolean;
  /** Cuántas conversaciones tiene abiertas. Es la carga, y se mira antes de pasarle otra. */
  activas: number;
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

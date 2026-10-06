/**
 * Seed data for the prototype, ported verbatim from the Claude Design handoff so
 * every figure, label and colour on screen matches the mock. Replace these with
 * real API calls when the backend lands; the screens only read them through the store.
 */
import { config } from "./config";
import type {
  Adjunto,
  Chat,
  Cliente,
  Compra,
  InvProducto,
  Iva,
  IvaVenta,
  Metodo,
  Movimiento,
  Paso,
  Plantilla,
  Producto,
  Proveedor,
  RepCfg,
  RepKpi,
  RepTab,
  RepTablaFila,
  Venta,
} from "./types";

export const CLIENTES: Cliente[] = [
  { id: "c1", nombre: "Despensa Doña Lucía", doc: "RUC 80012345-6", contacto: "Lucía Benítez", tel: "0981 445 210", email: "lucia@despensa.com.py", estado: "Activo", origen: "Venta", saldo: 1250000, compras: 8, desde: "mar 2024", zona: "Barrio Obrero" },
  { id: "c2", nombre: "Almacén San Blas", doc: "RUC 80098765-1", contacto: "Ramón Ortiz", tel: "0972 118 904", email: "sanblas@gmail.com", estado: "Activo", origen: "Manual", saldo: 0, compras: 14, desde: "ago 2023", zona: "Lambaré" },
  { id: "c3", nombre: "Minimercado Ykuá", doc: "CI 4.521.330", contacto: "Sofía Ayala", tel: "0985 330 776", email: "ykua.mini@gmail.com", estado: "Activo", origen: "CRM", saldo: 480000, compras: 5, desde: "ene 2026", zona: "Fernando de la Mora" },
  { id: "c4", nombre: "Copetín El Puente", doc: "RUC 80055512-3", contacto: "Julio Cardozo", tel: "0961 207 441", email: "elpuente@hotmail.com", estado: "Inactivo", origen: "Manual", saldo: 0, compras: 1, desde: "jun 2022", zona: "Luque" },
];

export const PRODUCTOS: Producto[] = [
  { id: "p1", nombre: "Gaseosa cola 2 L", sku: "GAS", stock: 48, precio: 12000 },
  { id: "p2", nombre: "Agua mineral 500 ml ×12", sku: "AGU", stock: 30, precio: 28000 },
  { id: "p3", nombre: "Cerveza lata 350 ml", sku: "CER", stock: 120, precio: 9500 },
  { id: "p4", nombre: "Jugo natural 1 L", sku: "JUG", stock: 64, precio: 11500 },
  { id: "p5", nombre: "Energizante 500 ml", sku: "ENE", stock: 18, precio: 15000 },
  { id: "p6", nombre: "Soda 1,5 L", sku: "SOD", stock: 72, precio: 7000 },
];

export const VENTAS_HIST: Venta[] = [
  { id: "v1", iso: "2026-09-30", numero: "VTA-000147", cliId: "c1", cliente: "Despensa Doña Lucía", doc: "RUC 80012345-6", fecha: "30 sep 2026", pago: "Efectivo", estado: "Cobrada",
    lineas: [{ nombre: "Cerveza lata 350 ml", qty: 48, precio: 9500, iva: "10%" }, { nombre: "Soda 1,5 L", qty: 12, precio: 7000, iva: "10%" }] },
  { id: "v2", iso: "2026-09-30", numero: "VTA-000146", cliId: "c3", cliente: "Minimercado Ykuá", doc: "CI 4.521.330", fecha: "30 sep 2026", pago: "Transferencia", estado: "Cobrada",
    lineas: [{ nombre: "Gaseosa cola 2 L", qty: 24, precio: 12000, iva: "10%" }, { nombre: "Jugo natural 1 L", qty: 6, precio: 11500, iva: "5%" }] },
  { id: "v3", iso: "2026-09-29", numero: "VTA-000145", cliId: "c2", cliente: "Almacén San Blas", doc: "RUC 80098765-1", fecha: "29 sep 2026", pago: "Crédito 30 días", estado: "Pendiente",
    lineas: [{ nombre: "Agua mineral 500 ml ×12", qty: 10, precio: 28000, iva: "10%" }] },
  { id: "v4", iso: "2026-09-29", numero: "VTA-000144", cliId: null, cliente: "Sin nombre", doc: "Sin documento", fecha: "29 sep 2026", pago: "Efectivo", estado: "Cobrada",
    lineas: [{ nombre: "Energizante 500 ml", qty: 18, precio: 15000, iva: "10%" }] },
  { id: "v5", iso: "2026-09-28", numero: "VTA-000143", cliId: "c4", cliente: "Copetín El Puente", doc: "RUC 80055512-3", fecha: "28 sep 2026", pago: "Cheque", estado: "Cobrada",
    lineas: [{ nombre: "Cerveza lata 350 ml", qty: 72, precio: 9500, iva: "10%" }] },
  { id: "v6", iso: "2026-09-27", numero: "VTA-000142", cliId: "c1", cliente: "Despensa Doña Lucía", doc: "RUC 80012345-6", fecha: "27 sep 2026", pago: "Crédito 15 días", estado: "Pendiente",
    lineas: [{ nombre: "Gaseosa cola 2 L", qty: 36, precio: 12000, iva: "10%" }, { nombre: "Agua mineral 500 ml ×12", qty: 4, precio: 28000, iva: "10%" }] },
];

export const REP: Record<RepTab, RepCfg> = {
  ventas: {
    serieTitulo: "Ventas del período", badge: "▲ 12% vs. anterior",
    dona: "Participación por forma de pago",
    donaItems: [
      { label: "Efectivo", pct: 46, color: "#023047" },
      { label: "Transferencia", pct: 31, color: "#209EBB" },
      { label: "Crédito", pct: 18, color: "#FFB701" },
      { label: "Cheque", pct: 5, color: "#8ECAE6" },
    ],
    donaValor: "46%", donaSub: "EFECTIVO",
    rankTitulo: "Top productos vendidos",
    rank: [
      { label: "Cerveza lata 350 ml", valor: "₲ 9.120.000", sub: "960 un. · 38% del total", v: 9120000 },
      { label: "Gaseosa cola 2 L", valor: "₲ 6.240.000", sub: "520 un. · 26% del total", v: 6240000 },
      { label: "Agua mineral 500 ml ×12", valor: "₲ 3.920.000", sub: "140 cajas · 16% del total", v: 3920000 },
      { label: "Soda 1,5 L", valor: "₲ 2.800.000", sub: "400 un. · 12% del total", v: 2800000 },
      { label: "Jugo natural 1 L", valor: "₲ 1.955.000", sub: "170 un. · 8% del total", v: 1955000 },
    ],
    tablaTitulo: "Resumen de facturación",
    nota: "Los importes incluyen IVA. El ticket promedio se calcula sobre facturas emitidas.",
  },
  inventario: {
    serieTitulo: "Rotación semanal (unidades)", badge: "6,2 días de cobertura",
    dona: "Composición del stock por estado",
    donaItems: [
      { label: "Normal", pct: 62, color: "#1C8C84" },
      { label: "Bajo mínimo", pct: 23, color: "#FFB701" },
      { label: "Agotado", pct: 9, color: "#B0322F" },
      { label: "Sin movimiento", pct: 6, color: "#8ECAE6" },
    ],
    donaValor: "62%", donaSub: "NORMAL",
    rankTitulo: "Mayor valor en stock",
    rank: [
      { label: "Cerveza lata 350 ml", valor: "₲ 820.800", sub: "120 un. × ₲ 6.840", v: 820800 },
      { label: "Agua mineral 500 ml ×12", valor: "₲ 604.800", sub: "30 cajas × ₲ 20.160", v: 604800 },
      { label: "Gaseosa cola 2 L", valor: "₲ 414.720", sub: "48 un. × ₲ 8.640", v: 414720 },
      { label: "Soda 1,5 L", valor: "₲ 362.880", sub: "72 un. × ₲ 5.040", v: 362880 },
      { label: "Jugo natural 1 L", valor: "₲ 66.240", sub: "8 un. × ₲ 8.280 · bajo mínimo", v: 66240 },
    ],
    tablaTitulo: "Indicadores de inventario",
    nota: "Valuación a costo promedio ponderado (CPP) al último día del período.",
  },
  compras: {
    serieTitulo: "Compras del período", badge: "▼ 6% vs. anterior",
    dona: "Compras por proveedor",
    donaItems: [
      { label: "Bebidas del Sur", pct: 42, color: "#96731A" },
      { label: "Distribuidora Guaraní", pct: 28, color: "#FFB701" },
      { label: "Lácteos Ñemby", pct: 19, color: "#C28A2A" },
      { label: "Insumos Paraná", pct: 11, color: "#E5C77A" },
    ],
    donaValor: "42%", donaSub: "BEBIDAS",
    rankTitulo: "Mayor gasto por proveedor",
    rank: [
      { label: "Bebidas del Sur S.A.", valor: "₲ 2.059.200", sub: "240 un. · crédito 30 días", v: 2059200 },
      { label: "Distribuidora Guaraní", valor: "₲ 1.240.800", sub: "120 un. · contado", v: 1240800 },
      { label: "Lácteos Ñemby SRL", valor: "₲ 866.880", sub: "96 un. · crédito 15 días", v: 866880 },
      { label: "Insumos Paraná", valor: "₲ 1.260.000", sub: "60 cajas · contado", v: 1260000 },
    ],
    tablaTitulo: "Resumen de compras",
    nota: "Las compras a crédito impactan la caja en su fecha de vencimiento, no en la de emisión.",
  },
};

export const REP_SERIES: Record<RepTab, number[]> = {
  ventas: [1850000, 2420000, 2100000, 3180000, 2760000, 3920000, 4850000],
  inventario: [320, 410, 380, 290, 460, 520, 480],
  compras: [0, 1260000, 0, 866880, 0, 1240800, 2059200],
};

export const REP_KPIS: Record<RepTab, RepKpi[]> = {
  ventas: [
    { label: "Facturado", valor: "₲ 21.080.000", delta: "▲ 12% vs. período anterior", up: true },
    { label: "Ticket promedio", valor: "₲ 186.549", delta: "113 facturas emitidas", up: null },
  ],
  inventario: [
    { label: "Valuación", valor: "₲ 2.269.440", delta: "6 productos · 278 unidades", up: null },
    { label: "Bajo mínimo", valor: "2 prod.", delta: "1 agotado requiere reposición", up: false },
  ],
  compras: [
    { label: "Comprado", valor: "₲ 5.426.880", delta: "▼ 6% vs. período anterior", up: false },
    { label: "Por pagar", valor: "₲ 2.926.080", delta: "2 facturas a crédito", up: false },
  ],
};

export const REP_TABLAS: Record<RepTab, RepTablaFila[]> = {
  ventas: [
    { k: "Gravado 10%", sub: "Base imponible", v: "₲ 17.254.545" },
    { k: "IVA 10%", sub: "Débito fiscal", v: "₲ 1.725.455" },
    { k: "Gravado 5%", sub: "Base imponible", v: "₲ 1.861.905" },
    { k: "IVA 5%", sub: "Débito fiscal", v: "₲ 93.095" },
    { k: "Exentas", sub: "Sin IVA", v: "₲ 145.000" },
  ],
  inventario: [
    { k: "Rotación del período", sub: "Unidades vendidas / stock medio", v: "3,4×" },
    { k: "Cobertura", sub: "Días de stock al ritmo actual", v: "6,2 días" },
    { k: "Mermas registradas", sub: "4 unidades · Jugo natural 1 L", v: "₲ 33.120" },
    { k: "Ajustes del período", sub: "1 ajuste manual", v: "−4 un." },
  ],
  compras: [
    { k: "Contado", sub: "2 facturas", v: "₲ 2.500.800" },
    { k: "Crédito", sub: "2 facturas · 15 y 30 días", v: "₲ 2.926.080" },
    { k: "IVA crédito fiscal", sub: "Deducible del período", v: "₲ 452.240" },
    { k: "Costo promedio actualizado", sub: "4 productos recalculados", v: "4 prod." },
  ],
};

export const CHATS: Chat[] = [
  { id: "x1", nombre: "Despensa Doña Lucía", tipo: "Cliente", refId: "c1", enLinea: true, hora: "11:38", noLeidos: 2,
    msgs: [
      { de: "ellos", texto: "Buen día Ulises, ¿tienen cerveza lata en stock?", hora: "11:30" },
      { de: "yo", texto: "Buen día Lucía. Sí, tenemos 120 unidades disponibles.", hora: "11:33", tick: "✓✓" },
      { de: "ellos", texto: "Perfecto, mandame 48 para hoy a la tarde por favor.", hora: "11:37" },
      { de: "ellos", texto: "¿Me podés pasar el total con el precio mayorista?", hora: "11:38" },
    ] },
  { id: "x2", nombre: "Bebidas del Sur S.A.", tipo: "Proveedor", refId: "pv1", enLinea: false, hora: "10:02", noLeidos: 0,
    msgs: [
      { de: "yo", texto: "Buenas, ¿cuándo llega el pedido de cerveza?", hora: "09:40", tick: "✓✓" },
      { de: "ellos", texto: "Sale mañana temprano, llega antes del mediodía.", hora: "10:02" },
    ] },
  { id: "x3", nombre: "Almacén San Blas", tipo: "Cliente", refId: "c2", enLinea: false, hora: "Ayer", noLeidos: 0,
    msgs: [
      { de: "ellos", texto: "Ya transferí el saldo de la factura anterior.", hora: "17:12" },
      { de: "yo", texto: "Recibido Ramón, gracias. Queda al día.", hora: "17:20", tick: "✓✓" },
    ] },
  { id: "x4", nombre: "Minimercado Ykuá", tipo: "Cliente", refId: "c3", enLinea: true, hora: "Ayer", noLeidos: 1,
    msgs: [
      { de: "yo", texto: "Sofía, te paso el pedido armado para confirmar.", hora: "15:02", tick: "✓✓" },
      { de: "yo", pedido: { tag: "Pedido sugerido", total: 348000, detalle: "24 × Gaseosa cola 2 L · 12 × Soda 1,5 L" }, texto: "Avisame si lo confirmo así.", hora: "15:03", tick: "✓✓" },
      { de: "ellos", texto: "Dale, pero sumale 6 jugos de 1 L.", hora: "15:41" },
    ] },
  { id: "x5", nombre: "Lácteos Ñemby SRL", tipo: "Proveedor", refId: "pv3", enLinea: false, hora: "28 sep", noLeidos: 0,
    msgs: [
      { de: "ellos", texto: "Actualizamos la lista de precios desde el lunes.", hora: "08:15" },
    ] },
];

export const ADJUNTOS: Adjunto[] = [
  { key: "documento", label: "Documento", icono: "≡", bg: "#5478AB", tag: "PDF", nombre: "Lista de precios.pdf", peso: "PDF · 248 KB" },
  { key: "camara", label: "Cámara", icono: "◉", bg: "#B0527A", tag: "JPG", nombre: "Foto 30-09.jpg", peso: "Imagen · 1,2 MB" },
  { key: "galeria", label: "Galería", icono: "▣", bg: "#8E5BC4", tag: "JPG", nombre: "Comprobante.jpg", peso: "Imagen · 860 KB" },
  { key: "audioarch", label: "Audio", icono: "♪", bg: "#D97A33", tag: "MP3", nombre: "Nota de voz.mp3", peso: "Audio · 420 KB" },
  { key: "ubicacion", label: "Ubicación", icono: "◈", bg: "#1C8C84", tag: "MAP", nombre: "Depósito central", peso: "Asunción · Py" },
  { key: "contacto", label: "Contacto", icono: "☻", bg: "#209EBB", tag: "VCF", nombre: "Ulises Gómez.vcf", peso: "Contacto · 2 KB" },
  { key: "pedido", label: "Pedido", icono: "⛁", bg: "#96731A", tag: "", nombre: "", peso: "" },
  { key: "factura", label: "Factura", icono: "₲", bg: "#023047", tag: "PDF", nombre: "VTA-000148.pdf", peso: "PDF · 96 KB" },
];

export const EMOJIS = ["😀", "😅", "😂", "🙂", "😉", "😍", "🤝", "👍", "👌", "🙏", "💪", "🔥", "✅", "❌", "⏰", "📦", "🚚", "🧾", "💰", "📈", "🍺", "🥤", "💧", "🧊"];
export const STICKERS = ["🧾", "📦", "🚚", "🫡", "🤙", "🎉", "😎", "🙌", "💵", "⏳"];
export const GIFS = ["⚡", "🎬", "✨", "🌀", "🎯", "🛎️"];

export const PLANTILLAS: Plantilla[] = [
  { label: "Precio y disponibilidad", texto: "Te confirmo precio y disponibilidad en unos minutos." },
  { label: "Pedido en camino", texto: "Tu pedido ya salió del depósito, llega hoy." },
  { label: "Recordatorio de pago", texto: "Te recuerdo que tenés una factura pendiente de pago." },
  { label: "Gracias por la compra", texto: "¡Gracias por tu compra! Cualquier cosa, escribime." },
];

export const INV: InvProducto[] = [
  { id: "p1", nombre: "Gaseosa cola 2 L", sku: "GAS", stock: 48, minimo: 24, costo: 8640, precio: 12000, unidad: "UNIDAD", categoria: "Bebidas", deposito: "Depósito central", iva: "10%", metodo: "CPP", barras: "7790001234567" },
  { id: "p2", nombre: "Agua mineral 500 ml ×12", sku: "AGU", stock: 30, minimo: 12, costo: 20160, precio: 28000, unidad: "CAJA", categoria: "Bebidas", deposito: "Depósito central", iva: "10%", metodo: "CPP", barras: "7790001887766" },
  { id: "p3", nombre: "Cerveza lata 350 ml", sku: "CER", stock: 120, minimo: 60, costo: 6840, precio: 9500, unidad: "UNIDAD", categoria: "Bebidas", deposito: "Depósito central", iva: "10%", metodo: "CPP", barras: "7790004455112" },
  { id: "p4", nombre: "Jugo natural 1 L", sku: "JUG", stock: 8, minimo: 24, costo: 8280, precio: 11500, unidad: "UNIDAD", categoria: "Bebidas", deposito: "Sucursal Luque", iva: "5%", metodo: "CPP", barras: "7790007788990" },
  { id: "p5", nombre: "Energizante 500 ml", sku: "ENE", stock: 0, minimo: 18, costo: 10800, precio: 15000, unidad: "UNIDAD", categoria: "Bebidas", deposito: "Depósito central", iva: "10%", metodo: "FIFO", barras: "7790009911223" },
  { id: "p6", nombre: "Soda 1,5 L", sku: "SOD", stock: 72, minimo: 30, costo: 5040, precio: 7000, unidad: "UNIDAD", categoria: "Bebidas", deposito: "Depósito central", iva: "10%", metodo: "CPP", barras: "7790002233445" },
];

export const MOVS: Movimiento[] = [
  { id: "m1", prodId: "p3", tipo: "ENTRADA", cant: 240, origen: "Compra", ref: "COMP-000147", fecha: "28 sep", usuario: "Ulises G." },
  { id: "m2", prodId: "p1", tipo: "SALIDA", cant: 12, origen: "Venta", ref: "VTA-000147", fecha: "28 sep", usuario: "Ulises G." },
  { id: "m3", prodId: "p4", tipo: "AJUSTE", cant: -4, origen: "Merma", ref: "AJU-000031", fecha: "27 sep", usuario: "Sofía A." },
  { id: "m4", prodId: "p1", tipo: "ENTRADA", cant: 120, origen: "Compra", ref: "COMP-000146", fecha: "26 sep", usuario: "Ulises G." },
  { id: "m5", prodId: "p5", tipo: "SALIDA", cant: 18, origen: "Venta", ref: "VTA-000144", fecha: "24 sep", usuario: "Ulises G." },
  { id: "m6", prodId: "p2", tipo: "ENTRADA", cant: 60, origen: "Compra", ref: "COMP-000144", fecha: "18 sep", usuario: "Sofía A." },
];

export const UNIDADES = ["UNIDAD", "CAJA", "KG", "LT", "PAQUETE"];
/** Units sold by weight/volume: these accept decimal quantities. */
export const PESABLES = ["KG", "LT", "GR", "ML"];
export const MOTIVOS = ["Merma", "Rotura", "Inventario físico", "Devolución", "Inventario inicial"];

export const PROVEEDORES: Proveedor[] = [
  { id: "pv1", nombre: "Bebidas del Sur S.A.", doc: "RUC 80025431-7", condicion: "Crédito 30 días", rubro: "Bebidas", ciudad: "Asunción", contacto: "Mario Fretes", tel: "021 445 200", email: "ventas@bebidasdelsur.com.py", estado: "Activo", entrega: 2, chatId: "x2" },
  { id: "pv2", nombre: "Distribuidora Guaraní", doc: "RUC 80077120-4", condicion: "Contado", rubro: "Gaseosas y aguas", ciudad: "Lambaré", contacto: "Elena Rojas", tel: "021 338 710", email: "pedidos@guarani.com.py", estado: "Activo", entrega: 1, chatId: null },
  { id: "pv3", nombre: "Lácteos Ñemby SRL", doc: "RUC 80041288-9", condicion: "Crédito 15 días", rubro: "Lácteos y jugos", ciudad: "Ñemby", contacto: "Hugo Medina", tel: "021 962 140", email: "admin@lacteosnemby.com", estado: "Activo", entrega: 3, chatId: "x5" },
  { id: "pv4", nombre: "Insumos Paraná", doc: "RUC 80063901-2", condicion: "Crédito 45 días", rubro: "Envases e insumos", ciudad: "Luque", contacto: "Rocío Vera", tel: "021 570 880", email: "contacto@insumosparana.com", estado: "Inactivo", entrega: 5, chatId: null },
];

export const COMPRAS: Compra[] = [
  { id: "k1", numero: "COMP-000147", provId: "pv1", producto: "Cerveza lata 350 ml", cantidad: 240, costo: 7800, iva: "10%", pago: "Crédito", plazo: 30, cuotas: 2, estado: "Pendiente", fecha: "28 sep 2026", factura: "001-001-0009812", timbrado: "16512345" },
  { id: "k2", numero: "COMP-000146", provId: "pv2", producto: "Gaseosa cola 2 L", cantidad: 120, costo: 9400, iva: "10%", pago: "Contado", plazo: 0, cuotas: 1, estado: "Pagada", fecha: "26 sep 2026", factura: "002-001-0004410", timbrado: "16698001" },
  { id: "k3", numero: "COMP-000145", provId: "pv3", producto: "Jugo natural 1 L", cantidad: 96, costo: 8600, iva: "5%", pago: "Crédito", plazo: 15, cuotas: 1, estado: "Pendiente", fecha: "22 sep 2026", factura: "001-002-0001173", timbrado: "16440233" },
  { id: "k4", numero: "COMP-000144", provId: "pv4", producto: "Agua mineral 500 ml ×12", cantidad: 60, costo: 21000, iva: "Exenta", pago: "Contado", plazo: 0, cuotas: 1, estado: "Pagada", fecha: "18 sep 2026", factura: "003-001-0000902", timbrado: "16781190" },
];

export const PASOS_COMPRA: Paso[] = [
  { id: "proveedor", nombre: "Proveedor" },
  { id: "producto", nombre: "Producto" },
  { id: "condiciones", nombre: "Condiciones" },
];

/** IVA is contained in the price, so the rate divides rather than multiplies. */
export const IVA_RATE: Record<string, number> = { "10%": 0.10, "5%": 0.05, "Exenta": 0 };

export const PASOS_VENTA: Paso[] = [
  { id: "cliente", nombre: "Cliente" },
  { id: "productos", nombre: "Productos" },
  { id: "resumen", nombre: "Resumen" },
  { id: "pago", nombre: "Pago" },
];

export const METODOS: Metodo[] = [
  { value: "efectivo", label: "Efectivo", tag: "EFE" },
  { value: "transferencia", label: "Transferencia", tag: "TRF" },
  { value: "cheque", label: "Cheque", tag: "CHQ" },
];

export const IVAS: IvaVenta[] = ["10%", "5%", "EXENTA"];
export const IVAS_COMPRA: Iva[] = ["10%", "5%", "Exenta"];

export const SOPORTE = [
  { tag: "WA", titulo: "WhatsApp de soporte", detalle: "+595 981 000 450 · lun a sáb, 8 a 18 h" },
  { tag: "@", titulo: "Correo de soporte", detalle: "soporte@zentra.com.py · respuesta en 24 h" },
  { tag: "?", titulo: "Reportar un problema", detalle: "Adjunta captura y datos del dispositivo" },
];

/** The mock is pinned to this date so figures stay reproducible. */
export const HOY_ISO = "2026-09-30";
export const EMPRESA = "Distribuidora JM";
export const USUARIO = { nombre: "Ulises Gómez", rol: "VENDEDOR", inicial: "U" };
/** Una sola fuente: el número vive en `config`, acá sólo se le pone el prefijo. */
export const VERSION = `v ${config.version}`;

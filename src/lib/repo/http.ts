/**
 * Cliente HTTP para la API de un ERP.
 *
 * Se usa cuando la app tiene que **escribir** en un ERP existente: registrar una
 * venta ahí no es insertar una fila, es numeración, caja, factura, asiento
 * contable e idempotencia. Esa lógica vive en el código del ERP, y duplicarla
 * acá —o en disparadores SQL— la haría divergir en silencio el día que la
 * cambien de aquel lado.
 *
 * Para **leer** hay un camino más simple y sin servidor: vistas sobre las tablas
 * del ERP. Ver `supabase/erp/`.
 *
 * El contrato que esta implementación espera está en `docs/API-ERP.md`.
 *
 * La sesión sigue siendo de Supabase: la app entra con Supabase Auth y le manda
 * ese token a la API, que lo valida contra el mismo proyecto. Así no hay un
 * segundo sistema de contraseñas que mantener.
 */
import { config } from "../config";
import { ivaContenido, rateOf } from "../calc";
import { hayTenantActivo, sb, tenantEnUso } from "../supabase/client";
import type { Chat, ChatMsg, Cliente, Compra, InvProducto, Iva, Proveedor, Venta } from "../types";
import type { Repo } from "./ports";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * A qué ERP se le pide. Gana la URL de la empresa activa sobre la global.
 *
 * Un ERP puede atender a varias empresas desde un solo dominio: resuelve a qué
 * empresa pertenece quien entra mirando su token, no la URL. Mientras sea así,
 * la global alcanza para todas. La de la empresa existe para el día que un
 * cliente tenga su ERP en su propio dominio, y para que ese día no haya que
 * recompilar la app con otra variable de entorno.
 */
function baseDeApi(): string {
  const base = tenantEnUso()?.apiUrl || config.apiUrl;
  if (!base) {
    // Sin esto el `new URL()` tira "Invalid URL", que no le dice nada a nadie.
    throw new Error(
      "No hay API configurada para esta empresa. Revisá NEXT_PUBLIC_API_URL, o el " +
        "campo apiUrl de esa empresa en el directorio.",
    );
  }
  return base;
}

/**
 * Saca la lista de la respuesta, venga como venga.
 *
 * Cada endpoint del ERP envuelve distinto, y no hay regla: `/clientes` devuelve
 * el array pelado en `data`, mientras `/productos` lo pone en `data.productos`,
 * `/ventas` en `data.ventas`, y así. Asumir una sola forma reventaba con
 * "(intermediate value).map is not a function", que no le dice nada a nadie.
 *
 * Se acepta cualquiera de las dos y, si no es ninguna, el error nombra el
 * endpoint y lo que llegó.
 */
function comoLista<T>(crudo: unknown, clave: string, ruta: string): T[] {
  if (Array.isArray(crudo)) return crudo as T[];
  if (crudo && typeof crudo === "object") {
    const dentro = (crudo as Record<string, unknown>)[clave];
    if (Array.isArray(dentro)) return dentro as T[];
  }
  // Nada de devolver [] en silencio: una lista vacía se lee como "no hay",
  // y acá el problema es que la respuesta tiene otra forma.
  throw new ApiError(
    `El ERP devolvió algo inesperado en ${ruta} (se esperaba una lista o { ${clave}: [...] }).`,
    200,
    ruta,
  );
}

/**
 * Token de respaldo, para el momento del login: entre que Supabase valida la
 * contraseña y guarda la sesión, el pedido del perfil ya sale.
 */
let token: string | null = null;

export function setToken(t: string | null): void {
  token = t;
}

/**
 * El token que va en cada pedido, leído de la sesión viva y no de una copia.
 *
 * Esto estaba guardado una sola vez al entrar. Supabase renueva el token cada
 * hora, pero nuestra copia se quedaba con el viejo: a la hora, todo pedido al
 * ERP contestaba 401 y la app parecía haber cerrado sesión sola. El vendedor
 * volvía a entrar y le pasaba de nuevo.
 *
 * `getSession` lee de lo guardado en el teléfono; sólo sale a la red si el
 * token ya venció, y ahí lo renueva, que es justo lo que hay que hacer.
 */
async function tokenVigente(): Promise<string | null> {
  if (!hayTenantActivo()) return token;
  try {
    const { data } = await sb().auth.getSession();
    return data.session?.access_token ?? token;
  } catch {
    // Si la renovación falla (sin señal), se manda el que había: el ERP dirá
    // si todavía sirve. Mejor que no mandar nada y forzar un 401 seguro.
    return token;
  }
}

/** Status y cuerpo sin interpretar, igual venga del navegador o de nativo. */
type Respuesta = { status: number; texto: string };

/**
 * ¿Estamos adentro del APK? Capacitor inyecta este global en el WebView.
 *
 * Se mira el global en vez de importar `@capacitor/core` porque este archivo
 * también corre en el navegador y en Node (las pruebas), donde ese paquete no
 * tiene nada que hacer.
 */
function enNativo(): boolean {
  const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof c?.isNativePlatform === "function" && c.isNativePlatform();
}

/**
 * Por dónde va a salir el próximo pedido. Existe para poder probar la decisión:
 * el camino nativo en sí sólo se puede verificar en el celular.
 */
export function transporte(): "nativo" | "navegador" {
  return enNativo() ? "nativo" : "navegador";
}

/**
 * Pide por el HTTP nativo del celular en vez del `fetch` del WebView.
 *
 * Esto es lo que saca al CORS del camino: el pedido no lo hace una página, lo
 * hace la app, y la política de orígenes es del navegador. Sin esto habría que
 * agregar cabeceras CORS en cada uno de los ERPs —son decenas, uno por cliente—
 * y repetirlo cada vez que se suma uno.
 *
 * Se usa sólo acá, para los pedidos al ERP. A propósito NO se activa el parche
 * global de Capacitor (`plugins.CapacitorHttp.enabled`), que reemplaza el
 * `fetch` de toda la app: por ahí pasa también Supabase Auth, y romper el login
 * para arreglar el CORS no es un buen negocio.
 */
async function porNativo(
  url: string,
  metodo: string,
  headers: Record<string, string>,
  body: string | null,
): Promise<Respuesta> {
  const { CapacitorHttp } = await import("@capacitor/core");
  const res = await CapacitorHttp.request({
    url,
    method: metodo,
    headers,
    // El plugin serializa según el Content-Type, así que espera el objeto.
    data: body ? (JSON.parse(body) as unknown) : undefined,
    responseType: "text",
    connectTimeout: config.timeoutMs,
    readTimeout: config.timeoutMs,
  });
  return {
    status: res.status,
    texto: typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? ""),
  };
}

/** El archivo a mandar, ya leído. */
export interface ArchivoAEnviar {
  nombre: string;
  tipo: string;
  /** El contenido en base64, sin el prefijo `data:`. */
  base64: string;
}

/** Lee un archivo del celular a base64, que es como viaja en los dos caminos. */
export async function leerArchivo(f: File | Blob, nombre?: string): Promise<ArchivoAEnviar> {
  const buf = await f.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  // De a pedazos: con un audio de un minuto, pasarle el arreglo entero a
  // `String.fromCharCode` revienta la pila.
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return {
    nombre: nombre || (f instanceof File ? f.name : "archivo"),
    tipo: f.type || "application/octet-stream",
    base64: btoa(bin),
  };
}

/**
 * Manda un archivo como `multipart/form-data`.
 *
 * Los dos caminos arman el multipart distinto y ninguno sirve para el otro:
 *
 *   nativo      Capacitor lo arma en Java desde un arreglo de entradas, donde
 *               el archivo va en base64. No acepta un `FormData` del navegador.
 *   navegador   un `FormData` de verdad, y sin tocar el `Content-Type`: el
 *               `fetch` tiene que poner el suyo con el `boundary`.
 *
 * Que el nativo sepa multipart es lo que permite mandar fotos y audios sin
 * depender de que el ERP agregue CORS.
 */
export async function enviarArchivoAlErp<T>(
  path: string,
  archivo: ArchivoAEnviar,
  campos: Record<string, string> = {},
): Promise<T> {
  const url = baseDeApi() + path;
  const vigente = await tokenVigente();
  const auth: Record<string, string> = vigente ? { Authorization: `Bearer ${vigente}` } : {};

  let res: Respuesta;
  try {
    if (enNativo()) {
      const { CapacitorHttp } = await import("@capacitor/core");
      const entradas = [
        ...Object.entries(campos).map(([key, value]) => ({ type: "string", key, value })),
        {
          type: "base64File",
          key: "file",
          value: archivo.base64,
          fileName: archivo.nombre,
          contentType: archivo.tipo,
        },
      ];
      const r = await CapacitorHttp.request({
        url,
        method: "POST",
        headers: { ...auth, "Content-Type": "multipart/form-data" },
        data: entradas,
        responseType: "text",
        connectTimeout: config.timeoutMs,
        readTimeout: config.timeoutMs,
      });
      res = { status: r.status, texto: typeof r.data === "string" ? r.data : JSON.stringify(r.data ?? "") };
    } else {
      const form = new FormData();
      for (const [k, v] of Object.entries(campos)) form.set(k, v);
      const bytes = Uint8Array.from(atob(archivo.base64), (c) => c.charCodeAt(0));
      form.set("file", new Blob([bytes], { type: archivo.tipo }), archivo.nombre);
      // Sin `Content-Type`: lo pone `fetch` con su boundary.
      const r = await fetch(url, { method: "POST", headers: auth, body: form });
      res = { status: r.status, texto: await r.text() };
    }
  } catch {
    throw new ApiError("No se pudo enviar el archivo.", 0, path);
  }

  if (res.status < 200 || res.status >= 300) {
    let mensaje = res.texto;
    try {
      const j = JSON.parse(res.texto);
      mensaje = j?.error || j?.message || res.texto;
    } catch {
      /* no era JSON */
    }
    throw new ApiError(mensaje || `La API respondió ${res.status}`, res.status, path);
  }
  return (res.texto ? JSON.parse(res.texto) : undefined) as T;
}

/** Pide por el navegador. Acá sí aplica el CORS del ERP. */
async function porNavegador(
  url: string,
  init: RequestInit,
  headers: Record<string, string>,
): Promise<Respuesta> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.timeoutMs);
  try {
    const res = await fetch(url, { ...init, headers, signal: ctrl.signal });
    return { status: res.status, texto: res.status === 204 ? "" : await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hace una request a la API y devuelve el JSON tipado.
 * Lanza `ApiError` con el status para que la UI distinga 401 de 500.
 */
export async function request<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | boolean | undefined> } = {},
): Promise<T> {
  const { query, ...rest } = init;
  const url = new URL(baseDeApi() + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const vigente = await tokenVigente();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(vigente ? { Authorization: `Bearer ${vigente}` } : {}),
    ...((rest.headers as Record<string, string> | undefined) ?? {}),
  };

  let res: Respuesta;
  try {
    res = enNativo()
      ? await porNativo(
          url.toString(),
          (rest.method || "GET").toUpperCase(),
          headers,
          typeof rest.body === "string" ? rest.body : null,
        )
      : await porNavegador(url.toString(), rest, headers);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError("La API no respondió a tiempo.", 408, url.pathname);
    }
    throw new ApiError("No se pudo conectar con la API.", 0, url.pathname);
  }

  if (res.status < 200 || res.status >= 300) {
    // El ERP contesta { success: false, error: "..." }. Ese texto está escrito
    // para mostrarle a una persona, así que se usa tal cual en vez de un
    // "algo falló" genérico.
    let mensaje = res.texto;
    try {
      const j = JSON.parse(res.texto);
      mensaje = j?.error || j?.message || res.texto;
    } catch {
      /* no era JSON */
    }
    throw new ApiError(mensaje || `La API respondió ${res.status}`, res.status, url.pathname);
  }

  if (!res.texto) return undefined as T;

  // El ERP envuelve todo en { success, data }. Se desenvuelve acá para que el
  // resto del archivo trabaje con los datos y no con el sobre.
  let json: unknown;
  try {
    json = JSON.parse(res.texto);
  } catch {
    throw new ApiError("La API devolvió algo que no es JSON.", res.status, url.pathname);
  }
  if (json && typeof json === "object" && "success" in json && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

const pendiente = (op: string): never => {
  throw new Error(
    `httpRepo.${op} todavía no está implementado. ` +
      `Falta definir el endpoint real — ver docs/API-ERP.md.`,
  );
};

/**
 * Identificador único de un intento de operación.
 *
 * Un vendedor en la calle pierde señal justo después de mandar la venta: no sabe
 * si llegó, y vuelve a tocar el botón. Sin esto la venta se registra dos veces.
 * La API tiene que devolver la misma venta ante la misma clave, no crear otra.
 */
function claveDeIntento(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Primer valor con contenido. El ERP reparte el mismo dato en varias columnas. */
function primero(...vs: (string | null | undefined)[]): string {
  for (const v of vs) if (v && v.trim()) return v.trim();
  return "";
}

const entero = (n: unknown): number => Math.round(Number(n) || 0);

/**
 * Una fila de `clientes` tal como la devuelve el ERP: `select *` de su tabla.
 * La traducción de nombres la hace la app porque el ERP no tiene una forma
 * propia para nosotros, y no se la vamos a pedir.
 */
interface ClienteErp {
  id: string;
  nombre?: string | null;
  razon_social?: string | null;
  empresa?: string | null;
  nombre_contacto?: string | null;
  ruc_factura?: string | null;
  ruc?: string | null;
  documento?: string | null;
  telefono?: string | null;
  telefono_secundario?: string | null;
  email?: string | null;
  email_secundario?: string | null;
  ciudad?: string | null;
  direccion?: string | null;
  tipo_cliente?: string | null;
  baja_operativa_at?: string | null;
  created_at?: string | null;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function desdeFecha(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function aCliente(c: ClienteErp): Cliente {
  return {
    id: String(c.id),
    nombre: primero(c.nombre, c.razon_social, c.empresa, c.nombre_contacto) || "(sin nombre)",
    // ruc_factura es el que se usa para facturar; los otros son el respaldo.
    doc: primero(c.ruc_factura, c.ruc, c.documento),
    contacto: c.nombre_contacto || "",
    tel: primero(c.telefono, c.telefono_secundario),
    email: primero(c.email, c.email_secundario),
    zona: c.ciudad || "",
    direccion: c.direccion || "",
    lista: c.tipo_cliente || "Mayorista",
    // La baja operativa no borra la fila, pero el cliente deja de operar.
    estado: c.baja_operativa_at ? "Inactivo" : "Activo",
    // El saldo y la cantidad de compras los calcula el ERP sólo en su pantalla,
    // así que acá salen en cero hasta que los exponga.
    saldo: 0,
    compras: 0,
    desde: desdeFecha(c.created_at),
    origen: "Manual",
  };
}

/**
 * El IVA del ERP a lo que usa la app.
 *
 * El ERP guarda "10%", "5%" y "EXENTA"; la app usa "Exenta" con minúsculas. Se
 * extrae el número en vez de comparar el texto: preguntar si contiene un "0"
 * para decidir exenta haría que "10%" lo sea, y las facturas saldrían sin IVA.
 */
function aIva(v?: string | null): Iva {
  const t = (v || "").trim();
  if (/exent|exonerad/i.test(t)) return "Exenta";
  const n = t.match(/([0-9]+)/)?.[1];
  if (n === "5") return "5%";
  if (n === "0") return "Exenta";
  // Ante la duda, 10%: es la tasa general, y equivocarse para abajo subfactura.
  return "10%";
}

/** Y de vuelta, para mandar una venta: el ERP espera EXENTA en mayúscula. */
function ivaParaErp(iva: Iva): "10%" | "5%" | "EXENTA" {
  if (iva === "5%") return "5%";
  if (iva === "10%") return "10%";
  return "EXENTA";
}

interface ProductoErp {
  id: string;
  nombre?: string | null;
  sku?: string | null;
  codigo_barras?: string | null;
  unidad_medida?: string | null;
  costo_promedio?: number | null;
  precio_venta?: number | null;
  tipo_iva?: string | null;
  stock_actual?: number | null;
  stock_minimo?: number | null;
  metodo_valuacion?: string | null;
}

function aProducto(p: ProductoErp): InvProducto {
  return {
    id: String(p.id),
    nombre: p.nombre || "(sin nombre)",
    sku: p.sku || "",
    barras: p.codigo_barras || "",
    unidad: p.unidad_medida || "UN",
    categoria: "",
    deposito: "",
    // Enteros: el guaraní no tiene centavos.
    costo: entero(p.costo_promedio),
    precio: entero(p.precio_venta),
    iva: aIva(p.tipo_iva),
    // El stock NO se redondea: se vende por kilo y hay medios kilos.
    stock: Number(p.stock_actual) || 0,
    minimo: Number(p.stock_minimo) || 0,
    metodo: (p.metodo_valuacion as InvProducto["metodo"]) || "CPP",
  };
}

interface VentaErp {
  id: string;
  numero_control?: string | null;
  fecha?: string | null;
  created_at?: string | null;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  cliente_doc?: string | null;
  tipo_venta?: string | null;
  metodo_pago?: string | null;
  plazo_dias?: number | null;
  estado?: string | null;
  total?: number | null;
  items?: {
    producto_nombre?: string | null;
    sku?: string | null;
    cantidad?: number | null;
    cantidad_total_base?: number | null;
    precio_venta?: number | null;
    tipo_iva?: string | null;
  }[];
}

function aVenta(v: VentaErp): Venta {
  const fecha = (v.fecha || v.created_at || "").slice(0, 10);
  const credito = /cred|cuota/i.test(v.tipo_venta || "");
  // Los dos ERPs no devuelven lo mismo: JM manda `estado` en el listado y
  // Sistemas Propio no lo selecciona. Sin esto, con el segundo TODAS las
  // ventas se veían pendientes y el reporte mostraba cobranza cero.
  // Sin estado se deriva del tipo, igual que al registrarla: de contado ya se
  // cobró, a crédito queda por cobrar.
  const estado = v.estado || (credito ? "pendiente" : "completada");
  return {
    id: String(v.id),
    iso: fecha,
    numero: v.numero_control || String(v.id).slice(0, 8),
    cliId: v.cliente_id ?? null,
    cliente: v.cliente_nombre || "Sin nombre",
    doc: v.cliente_doc || "Sin documento",
    fecha,
    pago: credito
      ? `Crédito · ${v.plazo_dias ?? "?"} días`
      : `Contado · ${v.metodo_pago || "efectivo"}`,
    // La app sólo distingue cobrada de pendiente. Lo que el ERP no da por
    // cerrado queda pendiente: una pendiente mostrada como cobrada esconde
    // plata sin cobrar. Confirmado que este ERP usa "completada".
    estado: /cobrad|pagad|cerrad|complet/i.test(estado) ? "Cobrada" : "Pendiente",
    // Las líneas traen `total_linea` ya calculado por el ERP; se usa ese y no
    // precio × cantidad, que redondea distinto y haría que la suma del
    // reporte no cierre con la factura.
    lineas: (v.items || []).map((l) => ({
      // El nombre va copiado en la línea: una factura vieja sigue diciendo lo
      // que decía aunque después le cambien el nombre al producto.
      nombre: primero(l.producto_nombre, l.sku) || "(sin nombre)",
      qty: Number(l.cantidad_total_base ?? l.cantidad) || 0,
      precio: entero(l.precio_venta),
      iva: aIva(l.tipo_iva),
    })),
  };
}

/**
 * Una fila de `proveedores`. Este endpoint sí traduce del lado del ERP, así que
 * los nombres vienen limpios — no como `clientes`, que llega crudo.
 */
interface ProveedorErp {
  id: string;
  nombre?: string | null;
  nombre_comercial?: string | null;
  razon_social?: string | null;
  ruc?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  contacto?: string | null;
  estado?: string | null;
  condicion_pago?: string | null;
  plazo_pago_dias?: number | null;
  categorias?: { nombre?: string | null }[] | null;
}

function aProveedor(p: ProveedorErp): Proveedor {
  const credito = (p.condicion_pago || "").toLowerCase().includes("credito");
  return {
    id: String(p.id),
    nombre: primero(p.nombre, p.nombre_comercial, p.razon_social) || "Sin nombre",
    doc: primero(p.ruc) || "Sin documento",
    condicion: credito ? `Crédito ${p.plazo_pago_dias ?? 0} días` : "Contado",
    // Las categorías del ERP hacen de rubro. Si no tiene, no se inventa uno.
    rubro: (p.categorias || []).map((c) => c?.nombre).filter(Boolean).join(", "),
    ciudad: primero(p.direccion),
    contacto: primero(p.contacto),
    tel: primero(p.telefono),
    email: primero(p.email),
    estado: (p.estado || "").toLowerCase() === "inactivo" ? "Inactivo" : "Activo",
    entrega: 0,
    chatId: null,
  };
}

/** Una fila de `compras`, con los nombres de columna del ERP. */
interface CompraErp {
  id: string;
  numero_control?: string | null;
  proveedor_id?: string | null;
  producto_nombre?: string | null;
  cantidad?: number | string | null;
  costo_unitario?: number | string | null;
  iva_tipo?: string | null;
  tipo_pago?: string | null;
  plazo_dias?: number | null;
  cuotas?: number | null;
  estado?: string | null;
  fecha?: string | null;
  numero_comprobante?: string | null;
  nro_timbrado?: string | null;
}

function aCompra(c: CompraErp): Compra {
  const credito = /cred/i.test(c.tipo_pago || "");
  return {
    id: String(c.id),
    numero: primero(c.numero_control) || String(c.id).slice(0, 8),
    provId: c.proveedor_id ?? null,
    producto: primero(c.producto_nombre) || "(sin nombre)",
    cantidad: Number(c.cantidad) || 0,
    costo: entero(c.costo_unitario),
    iva: aIva(c.iva_tipo),
    pago: credito ? "Crédito" : "Contado",
    plazo: Number(c.plazo_dias) || 0,
    cuotas: Number(c.cuotas) || 0,
    // Lo que el ERP no da por pagado queda pendiente: una pagada mostrada como
    // pendiente molesta; al revés, se deja de pagar a un proveedor.
    estado: /pagad|cerrad|complet/i.test(c.estado || "") ? "Pagada" : "Pendiente",
    fecha: (c.fecha || "").slice(0, 10),
    factura: primero(c.numero_comprobante),
    timbrado: primero(c.nro_timbrado),
  };
}

/**
 * Las conversaciones del ERP. Tercera forma de sobre: ni el array pelado de
 * `/clientes` ni el `{ success, data }` del resto, sino `{ ok, ... }`.
 */
interface ConversacionErp {
  id: string;
  status?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  unread_count?: number | null;
  contact_nombre?: string | null;
  contact_telefono?: string | null;
  /** Quién la está atendiendo, y en qué cola está. Pueden venir vacíos. */
  agente_nombre?: string | null;
  cola_nombre?: string | null;
}

interface ConversacionesErp {
  ok?: boolean;
  /** false cuando el usuario no está en ninguna cola de atención. */
  is_agent?: boolean;
  conversations?: ConversacionErp[];
}

interface MensajeErp {
  id: string;
  from_me?: boolean;
  content?: string | null;
  message_type?: string | null;
  created_at?: string | null;
  whatsapp_delivery_status?: string | null;
  /**
   * El sobre crudo de WhatsApp. Acá adentro está lo único que importa para
   * mostrar una foto o un documento: `erp.public_url`, que es la copia que el
   * ERP ya rehosteó. Los enlaces originales de Meta caducan y algunos piden
   * cabeceras de API, así que no sirven para poner en un `<img>`.
   */
  raw_payload?: Record<string, unknown> | null;
}

/** Lo que el ERP dejó en `raw_payload.erp` al rehostear el adjunto. */
function adjuntoDelErp(raw: Record<string, unknown> | null | undefined): {
  url: string | null;
  nombre: string | null;
  epigrafe: string | null;
} {
  const vacio = { url: null, nombre: null, epigrafe: null };
  const erp = raw?.erp;
  if (!erp || typeof erp !== "object" || Array.isArray(erp)) return vacio;
  const o = erp as { public_url?: unknown; filename?: unknown; caption?: unknown };
  const texto = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const url = texto(o.public_url);
  return {
    // Sólo http(s): lo que viene de afuera termina en un `<img src>` o en un
    // enlace, y ahí un `javascript:` no es un adjunto roto sino un agujero.
    url: url && /^https?:\/\//i.test(url) ? url : null,
    nombre: texto(o.filename),
    epigrafe: texto(o.caption),
  };
}

/** Las tres formas en que los proveedores anidan el mensaje dentro del sobre. */
function raicesDelSobre(raw: Record<string, unknown> | null | undefined): Record<string, unknown>[] {
  if (!raw) return [];
  const salida: Record<string, unknown>[] = [];
  for (const r of [raw.whatsappInboundMessage, raw.whatsappMessage, raw]) {
    if (r && typeof r === "object" && !Array.isArray(r)) salida.push(r as Record<string, unknown>);
  }
  return salida;
}

/**
 * El enlace original de WhatsApp, cuando el ERP todavía no rehosteó el archivo.
 *
 * `erp.public_url` es la copia buena, pero la pone una tarea que corre después:
 * los mensajes recién llegados no la tienen, y sin esto se veían como un
 * "[imagen]" de texto. Este enlace puede caducar, así que es el segundo intento
 * y no el primero.
 */
function urlOriginal(raw: Record<string, unknown> | null | undefined): string | null {
  for (const r of raicesDelSobre(raw)) {
    for (const clave of ["image", "video", "audio", "document", "sticker"]) {
      const media = r[clave];
      if (!media || typeof media !== "object" || Array.isArray(media)) continue;
      const link = (media as { link?: unknown }).link;
      if (typeof link === "string" && /^https?:\/\//i.test(link.trim())) return link.trim();
    }
  }
  return null;
}

/**
 * Si el mensaje es un reenvío.
 *
 * WhatsApp lo marca en `context.forwarded`. No cambia el contenido, pero sí lo
 * que significa: "me lo mandaron a mí" no es lo mismo que "esto lo escribí yo".
 */
function esReenviado(raw: Record<string, unknown> | null | undefined): boolean {
  for (const r of raicesDelSobre(raw)) {
    if (r.forwarded === true) return true;
    const ctx = r.context;
    if (ctx && typeof ctx === "object" && !Array.isArray(ctx)) {
      const c = ctx as { forwarded?: unknown; frequently_forwarded?: unknown };
      if (c.forwarded === true || c.frequently_forwarded === true) return true;
    }
  }
  return false;
}

/**
 * El ERP guarda un marcador en `content` cuando el mensaje es un adjunto:
 * "[imagen]", "[documento] contrato.pdf", "[audio]", "[video]", "[sticker]".
 *
 * Eso es para la vista previa de la lista, no para el globo. Mostrarlo tal cual
 * es lo que hacía que un chat con fotos se leyera como una lista de corchetes.
 */
const MARCADOR = /^\s*\[(imagen|image|documento|document|audio|video|sticker|reaction|revoke)\]\s*/i;

/**
 * Lo que el ERP deja en `content` y no es texto que alguien escribió.
 *
 * Al mandar un adjunto, el ERP guarda en el texto del mensaje la URL del
 * archivo y un rótulo del tipo "Video enviado". Eso es para su propia
 * contabilidad: su pantalla lo filtra antes de mostrar. La app no lo hacía, y
 * entonces un video mandado se veía como una URL cruda en el globo, que en el
 * WebView además queda subrayada como un enlace.
 */
const LINEA_DE_ARCHIVO = /\/storage\/v1\/object\/(public|sign)\//i;
const ROTULO_DE_ENVIO = /^(imagen|audio|video|documento|sticker)\s+enviad[oa]$/i;

/**
 * `esMedia` decide si una línea que es sólo una URL se descarta.
 *
 * En un mensaje con adjunto, esa línea es el archivo y no un pie de foto. Pero
 * en un mensaje de texto puede ser el mensaje entero —alguien pasa un enlace de
 * Google Meet y nada más— y descartarla haría desaparecer el mensaje.
 */
function sinMarcador(texto: string | null | undefined, esMedia = false): string | null {
  if (!texto) return null;
  let lineas = texto
    .replace(MARCADOR, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    // Una URL del almacenamiento del ERP nunca es algo que alguien escribió.
    .filter((l) => !LINEA_DE_ARCHIVO.test(l))
    .filter((l) => !ROTULO_DE_ENVIO.test(l));
  if (esMedia) lineas = lineas.filter((l) => !/^https?:\/\/\S+$/i.test(l));
  const limpio = lineas.join("\n").trim();
  return limpio || null;
}

/**
 * La URL que quedó escrita en el texto del mensaje.
 *
 * Es el último recurso para encontrar el archivo: cuando el ERP no rehosteó y
 * el sobre de WhatsApp tampoco trae el enlace, lo que mandamos nosotros sí
 * dejó la URL acá.
 */
function urlEnElTexto(texto: string | null | undefined): string | null {
  if (!texto) return null;
  for (const linea of texto.split(/\r?\n/).map((l) => l.trim())) {
    if (/^https?:\/\/\S+$/i.test(linea)) return linea;
  }
  return null;
}

/**
 * El emoji de una reacción.
 *
 * Viaja en el sobre de WhatsApp, que según el proveedor anida el mensaje un
 * nivel más adentro. Se miran las tres formas conocidas y se corta en la
 * primera que tenga algo.
 */
function emojiDeReaccion(raw: Record<string, unknown> | null | undefined): string | null {
  for (const r of raicesDelSobre(raw)) {
    const reaccion = r.reaction;
    if (!reaccion || typeof reaccion !== "object" || Array.isArray(reaccion)) continue;
    const e = (reaccion as { emoji?: unknown }).emoji;
    if (typeof e === "string" && e.trim()) return e.trim();
  }
  return null;
}

interface DetalleConversacionErp {
  ok?: boolean;
  conversation?: ConversacionErp | null;
  messages?: MensajeErp[];
}

/**
 * El usuario no es agente de ninguna cola de chat.
 *
 * No es un error: es una respuesta válida que la pantalla tiene que mostrar
 * distinto de "no hay conversaciones". A alguien que no atiende chats hay que
 * decirle eso, no dejarlo mirando una lista vacía creyendo que nadie le
 * escribió.
 */
export class SinCola extends Error {
  constructor() {
    super("Tu usuario no está asignado a ninguna cola de atención.");
    this.name = "SinCola";
  }
}

/** `2026-10-05T14:03:00Z` → `14:03`, en la hora del teléfono. */
function horaCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function aChat(c: ConversacionErp): Chat {
  return {
    id: String(c.id),
    nombre: primero(c.contact_nombre, c.contact_telefono) || "Sin nombre",
    // El ERP no distingue cliente de proveedor en el chat; son conversaciones
    // de WhatsApp con quien sea que escribió.
    tipo: "Cliente",
    refId: null,
    enLinea: false,
    hora: horaCorta(c.last_message_at),
    noLeidos: Number(c.unread_count) || 0,
    // Tres estados, no dos. `undefined` es "este ERP no informa de quién es la
    // conversación", y entonces la etiqueta no se dibuja: poner "Sin asignar"
    // en todas sería afirmar algo que no sabemos. `null` sí es "no la tomó
    // nadie", y eso sólo se puede decir si el ERP mandó el campo.
    responsable:
      "agente_nombre" in c || "cola_nombre" in c
        ? primero(c.agente_nombre, c.cola_nombre) || null
        : undefined,
    // El listado trae sólo la vista previa del último mensaje. Los mensajes de
    // verdad llegan al abrir la conversación.
    //
    // La vista previa que guarda el ERP para un adjunto es un marcador de
    // texto: "[audio]", "[documento] x.pdf". Se traduce acá, que si no la
    // lista se lee como una columna de corchetes.
    msgs: c.last_message_preview
      ? [{ de: "ellos", texto: vistaPrevia(c.last_message_preview), hora: horaCorta(c.last_message_at) }]
      : [],
  };
}

/**
 * El marcador del ERP, dicho en castellano.
 *
 *   "[audio]"                 -> "Audio"
 *   "[documento] DDJJ.pdf"    -> "DDJJ.pdf"
 *   "[reaction]"              -> "Reaccionó"
 *   "Hola"                    -> "Hola"
 */
function vistaPrevia(crudo: string): string {
  const m = /^\s*\[(\w+)\]\s*(.*)$/s.exec(crudo);
  if (!m) return crudo;
  const [, clase, resto] = m;
  const limpio = (resto || "").trim();
  if (limpio) return limpio;
  const nombres: Record<string, string> = {
    imagen: "\u{1F4F7} Foto",
    image: "\u{1F4F7} Foto",
    video: "\u{1F3AC} Video",
    audio: "\u{1F3A4} Audio",
    voice: "\u{1F3A4} Audio",
    documento: "\u{1F4CE} Documento",
    document: "\u{1F4CE} Documento",
    sticker: "Sticker",
    reaction: "Reaccion\u00f3",
    revoke: "Mensaje eliminado",
  };
  return nombres[clase.toLowerCase()] ?? crudo;
}

/**
 * Cuántas conversaciones por tanda.
 *
 * La pantalla ofrece "cargar más" cuando una tanda vuelve completa. Es una
 * suposición, no un dato: si el total es múltiplo exacto de esto, el último
 * toque trae cero y el botón desaparece. Una pedida de más es más barato que
 * arrastrar un número de total por toda la cadena.
 */
export const TANDA_CHATS = 50;

/** `Contrato_ERP.pdf` → `PDF`. Es lo que va en el cuadradito de la tarjeta. */
function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  if (punto < 0 || punto === nombre.length - 1) return "DOC";
  const ext = nombre.slice(punto + 1).toUpperCase();
  return ext.length <= 4 ? ext : "DOC";
}

function aMensaje(m: MensajeErp): ChatMsg {
  const tipo = (m.message_type || "text").toLowerCase();
  const base = {
    de: (m.from_me ? "yo" : "ellos") as "yo" | "ellos",
    hora: horaCorta(m.created_at),
    ...(esReenviado(m.raw_payload) ? { reenviado: true } : {}),
  };

  const esMedia = /image|video|audio|voice|document|sticker/.test(tipo);
  const adj = adjuntoDelErp(m.raw_payload);
  // La copia del ERP primero; si la tarea que la hace todavía no corrió, el
  // enlace original, que al menos muestra algo mientras tanto.
  const url = adj.url || urlOriginal(m.raw_payload) || (esMedia ? urlEnElTexto(m.content) : null);
  const epigrafe = adj.epigrafe || sinMarcador(m.content, esMedia);

  // Una reacción es un emoji sobre otro mensaje, no un mensaje.
  if (tipo.includes("reaction")) {
    const emoji = emojiDeReaccion(m.raw_payload) || sinMarcador(m.content) || "";
    return { ...base, reaccion: emoji.trim() || "\u{1F44D}" };
  }

  if (tipo.includes("sticker")) {
    // El sticker del ERP es una imagen; el de la app, un emoji. Sin imagen no se
    // dibuja el "[sticker]" a 46px, que es lo que pasaba: un corchete gigante.
    if (url) return { ...base, imagen: url, sticker: " " };
    const suelto = sinMarcador(m.content);
    return { ...base, sticker: suelto && suelto.length <= 4 ? suelto : "\u{1F642}" };
  }

  if (tipo.includes("image")) {
    if (url) return { ...base, imagen: url, ...(epigrafe ? { epigrafe } : {}) };
    return { ...base, texto: epigrafe || "\u{1F4F7} Foto" };
  }

  if (tipo.includes("video")) {
    if (url) return { ...base, video: url, ...(epigrafe ? { epigrafe } : {}) };
    return { ...base, texto: epigrafe || "\u{1F3AC} Video" };
  }

  if (tipo.includes("audio") || tipo.includes("voice")) {
    // Con el archivo va el reproductor. La duración no viene en la respuesta:
    // la pone la pantalla cuando el audio termina de cargar.
    if (url) return { ...base, audio: "", audioUrl: url };
    return { ...base, texto: epigrafe || "\u{1F3A4} Audio" };
  }

  if (tipo.includes("document")) {
    const nombre = adj.nombre || epigrafe || "Documento";
    if (url) {
      return {
        ...base,
        archivo: { tag: extensionDe(nombre), nombre, peso: "Documento", url },
        ...(adj.epigrafe && adj.epigrafe !== nombre ? { epigrafe: adj.epigrafe } : {}),
      };
    }
    return { ...base, texto: `\u{1F4CE} ${nombre}` };
  }

  return {
    ...base,
    texto: sinMarcador(m.content) || "",
    ...(m.from_me
      ? { tick: /read/i.test(m.whatsapp_delivery_status || "") ? "\u2713\u2713" : "\u2713" }
      : {}),
  };
}

/**
 * Implementación contra la API de un ERP.
 *
 * Está implementado lo que hace falta para el caso que motivó esto: ver clientes
 * y productos, y registrar ventas. El resto avisa qué falta en vez de fallar en
 * silencio o devolver datos inventados.
 */
/**
 * Quién es el que entró, según el ERP.
 *
 * El endpoint es `GET /api/usuarios/me`, y tiene dos particularidades que no
 * comparte con el resto: contesta `{ usuario: {...} }` en vez del
 * `{ success, data }` de los demás, y **no devuelve el nombre de la empresa**,
 * sólo su `data_schema`.
 *
 * Por eso el nombre de la empresa se toma del directorio, que es quien ya lo
 * sabe: es el que el usuario eligió al escribir su código. Mostrar el schema
 * ahí —"neura", "zentra_jm"— sería mostrarle jerga de base de datos a un
 * vendedor.
 */
export async function leerPerfil(): Promise<{ id: string; nombre: string; rol: string; empresa: string }> {
  const r = await request<{
    usuario?: {
      id?: string | null;
      nombre?: string | null;
      rol?: string | null;
      email?: string | null;
    } | null;
  }>("/usuarios/me");
  const u = r?.usuario;
  if (!u) {
    throw new ApiError("El ERP no devolvió el perfil del usuario.", 500, "/usuarios/me");
  }
  return {
    // Sin id no se puede registrar una venta a nombre de nadie.
    id: u.id || "",
    // El ERP puede no tener el nombre cargado; el correo es mejor que un vacío.
    nombre: primero(u.nombre, u.email),
    // Ante la duda, el rol más limitado: que falte un permiso se ve y se
    // arregla; que sobre uno no se ve hasta que alguien hizo algo que no debía.
    rol: u.rol || "VENDEDOR",
    empresa: tenantEnUso()?.nombre || "",
  };
}

export const httpRepo: Repo = {
  auth: {
    async login(usuario, password) {
      // La contraseña la valida Supabase, que es donde ya viven los usuarios del
      // ERP. La API sólo recibe el token y dice quién es.
      const { data, error } = await sb().auth.signInWithPassword({
        email: usuario.trim(),
        password,
      });
      if (error) throw new ApiError(error.message, 401, "/auth");
      if (!data.session) throw new ApiError("No se pudo iniciar sesión.", 401, "/auth");

      setToken(data.session.access_token);
      const perfil = await leerPerfil();

      return { token: data.session.access_token, usuario: perfil };
    },

    async logout() {
      setToken(null);
      await sb().auth.signOut().catch(() => {});
    },

    async sesionActual() {
      const { data } = await sb().auth.getSession();
      if (!data.session) return null;
      setToken(data.session.access_token);
      const perfil = await leerPerfil();
      return { token: data.session.access_token, usuario: perfil };
    },

    async recuperarPassword(correo) {
      const { error } = await sb().auth.resetPasswordForEmail(correo.trim());
      if (error) throw new ApiError(error.message, 400, "/auth");
    },

    async eliminarCuenta() {
      // En una instalación sobre un ERP la cuenta es del ERP, no de la app: el
      // vendedor que se da de baja de la app no puede perder el acceso al
      // sistema de su empresa. Lo da de baja quien administra el ERP.
      throw new ApiError(
        "Tu cuenta es la del sistema de tu empresa, así que no se borra desde acá. " +
          "Pedíselo a quien administra el ERP.",
        400,
        "/cuenta",
      );
    },
  },

  clientes: {
    async list(params) {
      const r = await request<unknown>("/clientes", { query: { q: params?.q, estado: params?.estado } });
      return comoLista<ClienteErp>(r, "clientes", "/clientes").map(aCliente);
    },
    async get(id) {
      const c = await request<ClienteErp | null>(`/clientes/${encodeURIComponent(id)}`);
      return c ? aCliente(c) : null;
    },
    async create(input) {
      const c = await request<ClienteErp>("/clientes", {
        method: "POST",
        headers: { "Idempotency-Key": claveDeIntento() },
        body: JSON.stringify(input),
      });
      return aCliente(c);
    },
    async consultarSet(doc) {
      return request<{ razonSocial: string; activo: boolean } | null>(
        `/set/${encodeURIComponent(doc)}`,
      );
    },
  },

  proveedores: {
    async list() {
      const r = await request<unknown>("/proveedores");
      return comoLista<ProveedorErp>(r, "proveedores", "/proveedores").map(aProveedor);
    },
    async get(id) {
      const r = await request<unknown>("/proveedores");
      const p = comoLista<ProveedorErp>(r, "proveedores", "/proveedores").find((x) => String(x.id) === id);
      return p ? aProveedor(p) : null;
    },
    create: () => pendiente("proveedores.create"),
    update: () => pendiente("proveedores.update"),
    deuda: () => pendiente("proveedores.deuda"),
    consultarSet: () => pendiente("proveedores.consultarSet"),
  },

  inventario: {
    async list(params) {
      const r = await request<unknown>("/productos", { query: { q: params?.q, filtro: params?.filtro } });
      return comoLista<ProductoErp>(r, "productos", "/productos").map(aProducto);
    },
    async get(id) {
      const p = await request<ProductoErp | null>(`/productos/${encodeURIComponent(id)}`);
      return p ? aProducto(p) : null;
    },
    create: () => pendiente("inventario.create"),
    update: () => pendiente("inventario.update"),
    movimientos: () => pendiente("inventario.movimientos"),
    ajustar: () => pendiente("inventario.ajustar"),
  },

  ventas: {
    async productos(params) {
      const r = await request<unknown>("/productos", { query: { q: params?.q, vendibles: true } });
      const filas = comoLista<ProductoErp>(r, "productos", "/productos");
      return filas.map((p) => {
        const inv = aProducto(p);
        return {
          id: inv.id,
          nombre: inv.nombre,
          precio: inv.precio,
          stock: inv.stock,
          iva: inv.iva,
          sku: inv.sku,
        };
      });
    },
    async list(params) {
      const r = await request<unknown>("/ventas", {
        query: { desde: params.desde, hasta: params.hasta, q: params.q, estado: params.estado },
      });
      return comoLista<VentaErp>(r, "ventas", "/ventas").map(aVenta);
    },
    async get(id) {
      const v = await request<VentaErp | null>(`/ventas/${encodeURIComponent(id)}`);
      return v ? aVenta(v) : null;
    },
    async create(input) {
      // El ERP quiere cada línea con sus importes ya calculados, y con los
      // nombres de sus columnas. Los calcula la app con la misma regla que usa
      // en pantalla, así lo que el vendedor ve y lo que se guarda coinciden.
      //
      // EL IVA VA CONTENIDO EN EL PRECIO, que es como se factura en Paraguay:
      // de ₲33.500 al 10% el impuesto son ₲3.045, no ₲3.350. Calcularlo por
      // encima inflaría cada factura.
      const catalogo = await this.productos();
      const porId = new Map(catalogo.map((p) => [p.id, p]));

      const items = input.lineas.map((l) => {
        const prod = porId.get(l.prodId);
        const bruto = Math.round(l.precio * l.cantidad);
        const iva = Math.round(ivaContenido(bruto, rateOf(l.iva)));
        return {
          producto_id: l.prodId,
          producto_nombre: prod?.nombre ?? "",
          sku: prod?.sku ?? "",
          cantidad: l.cantidad,
          precio_venta_original: l.precio,
          precio_venta: l.precio,
          tipo_iva: ivaParaErp(l.iva),
          subtotal: bruto - iva,
          monto_iva: iva,
          total_linea: bruto,
        };
      });

      // Los totales van aparte de las líneas, y son obligatorios: el ERP hace
      // Number(o.subtotal) y si sale NaN corta con "Totales inválidos.". Y no
      // son decorativos — son los que guarda, así que tienen que ser la suma
      // exacta de las líneas o la venta queda con un total que no cierra.
      const totales = items.reduce(
        (a, i) => ({
          subtotal: a.subtotal + i.subtotal,
          monto_iva: a.monto_iva + i.monto_iva,
          total: a.total + i.total_linea,
        }),
        { subtotal: 0, monto_iva: 0, total: 0 },
      );

      const cuerpo: Record<string, unknown> = {
        items,
        ...totales,
        // El ERP llama GS a los guaraníes, la app PYG.
        moneda: input.moneda === "USD" ? "USD" : "GS",
        tipo_venta: input.pago.tipo === "credito" ? "CREDITO" : "CONTADO",
        cliente_id: input.clienteId,
        ...(input.pago.tipo === "credito"
          ? { plazo_dias: input.pago.plazoDias }
          : { metodo_pago: input.pago.metodo }),
      };

      // La clave de intento viaja en la cabecera: si el teléfono pierde señal y
      // se reintenta, el ERP tiene que devolver la misma venta y no crear otra.
      // La respuesta viene doblemente envuelta: { success, data: { venta } }.
      // `request` saca el sobre de afuera; el `venta` de adentro va acá.
      const r = await request<{ venta: VentaErp }>("/ventas/create", {
        method: "POST",
        headers: { "Idempotency-Key": claveDeIntento() },
        body: JSON.stringify(cuerpo),
      });
      const v = r?.venta;
      if (!v?.id) {
        // Una venta sin número es peor que un error: el vendedor se va creyendo
        // que quedó registrada.
        throw new ApiError("El ERP no devolvió la venta registrada.", 500, "/ventas/create");
      }
      // Una venta recién creada no trae estado: el ERP lo deriva del tipo. De
      // contado ya se cobró; a crédito queda por cobrar.
      return aVenta({
        ...v,
        estado: v.estado || (input.pago.tipo === "credito" ? "pendiente" : "completada"),
        metodo_pago: v.metodo_pago ?? (input.pago.tipo === "contado" ? input.pago.metodo : null),
      });
    },
  },

  compras: {
    async list() {
      const r = await request<unknown>("/compras");
      return comoLista<CompraErp>(r, "compras", "/compras").map(aCompra);
    },
    async get(id) {
      const r = await request<unknown>("/compras");
      const c = comoLista<CompraErp>(r, "compras", "/compras").find((x) => String(x.id) === id);
      return c ? aCompra(c) : null;
    },
    create: () => pendiente("compras.create"),
  },

  chats: {
    /**
     * Las conversaciones que esta persona puede ver.
     *
     * Hay dos endpoints y no dan lo mismo:
     *
     *   /chat/mobile-inbox            aplica el mismo criterio que el ERP de
     *                                 escritorio: un administrador ve todas,
     *                                 un asesor las suyas y las sin asignar
     *                                 de su cola.
     *   /mobile/asesor/conversations  sólo las asignadas al asesor.
     *
     * Se prueba el primero. Un administrador en la app veía "no atendés
     * conversaciones" mientras en el ERP las tenía todas delante, porque el
     * segundo filtra por cola y un administrador no está en ninguna.
     *
     * El primero puede fallar con 401 en algunos ERP: no le pasa el pedido a
     * su propia función de autenticación, así que no llega a leer el token y
     * busca una cookie que en el APK no existe. Está anotado en
     * docs/API-ERP.md. Por eso el segundo queda de respaldo.
     */
    async list(params) {
      const desde = Math.max(Number(params?.desde) || 0, 0);
      try {
        const r = await request<unknown>("/chat/mobile-inbox", {
          query: { offset: desde, limit: TANDA_CHATS },
        });
        return comoLista<ConversacionErp>(r, "conversations", "/chat/mobile-inbox").map(aChat);
      } catch (e) {
        // Un error de datos no se tapa con el respaldo: si el endpoint
        // contestó pero con otra forma, el problema es ese y hay que verlo.
        if (e instanceof ApiError && e.status !== 401 && e.status !== 403 && e.status !== 404) throw e;
      }

      // El endpoint viejo no pagina: con él sólo existe la primera tanda.
      if (desde > 0) return [];
      const r = await request<ConversacionesErp>("/mobile/asesor/conversations");
      // `is_agent: false` no es "no tenés conversaciones": es que este usuario
      // no está en ninguna cola de atención. Son cosas distintas y la pantalla
      // las dice distinto, así que acá se marca.
      if (r && r.is_agent === false) throw new SinCola();
      return (r?.conversations ?? []).map(aChat);
    },

    async get(id) {
      // Igual que arriba: este endpoint respeta el rol, el otro exige que la
      // conversación esté asignada a quien pregunta.
      try {
        const r = await request<unknown>("/chat/messages", { query: { conversation_id: id } });
        const msgs = comoLista<MensajeErp>(r, "messages", "/chat/messages");
        return {
          id,
          // Este endpoint devuelve los mensajes y no el contacto; el nombre ya
          // lo trajo el listado.
          nombre: "",
          tipo: "Cliente" as const,
          refId: null,
          enLinea: false,
          hora: "",
          noLeidos: 0,
          msgs: msgs.map(aMensaje),
        };
      } catch (e) {
        if (e instanceof ApiError && e.status !== 401 && e.status !== 403 && e.status !== 404) throw e;
      }

      const r = await request<DetalleConversacionErp>(
        `/mobile/asesor/conversations/${encodeURIComponent(id)}`,
      );
      const c = r?.conversation;
      if (!c) return null;
      return {
        id: String(c.id),
        nombre: primero(c.contact_nombre, c.contact_telefono) || "Sin nombre",
        tipo: "Cliente" as const,
        refId: null,
        enLinea: false,
        hora: "",
        noLeidos: 0,
        msgs: (r.messages ?? []).map(aMensaje),
      };
    },

    async enviar(chatId, msg) {
      if (!msg.texto) {
        // Fotos, audios y stickers van por otros endpoints del ERP
        // (/send-media, /send-sticker). Mejor decirlo que fallar callado.
        throw new ApiError(
          "Por ahora desde la app se pueden mandar sólo mensajes de texto.",
          400,
          "/mobile/asesor/conversations/enviar",
        );
      }
      await request(`/mobile/asesor/conversations/${encodeURIComponent(chatId)}/send`, {
        method: "POST",
        body: JSON.stringify({ message: msg.texto }),
      });
      return { ...msg, hora: horaCorta(new Date().toISOString()), tick: "✓" };
    },

    async enviarArchivo(chatId, archivo, nombre, pie) {
      const leido = await leerArchivo(archivo, nombre);
      await enviarArchivoAlErp(
        `/mobile/asesor/conversations/${encodeURIComponent(chatId)}/send-media`,
        leido,
        pie ? { caption: pie } : {},
      );
      const esAudio = /^audio\//.test(leido.tipo);
      const esImagen = /^image\//.test(leido.tipo);
      return {
        de: "yo",
        hora: horaCorta(new Date().toISOString()),
        tick: "✓",
        texto: pie || (esAudio ? "🎤 Audio" : esImagen ? "📷 Foto" : "📎 " + nombre),
      };
    },

    async enviarSticker(chatId, url) {
      await request(`/mobile/asesor/conversations/${encodeURIComponent(chatId)}/send-sticker`, {
        method: "POST",
        body: JSON.stringify({ sticker_url: url }),
      });
      return { de: "yo", hora: horaCorta(new Date().toISOString()), tick: "✓", sticker: url };
    },

    // El ERP marca leído solo al abrir la conversación; no hay endpoint aparte.
    async marcarLeido() {},
  },

  reportes: {
    resumen: () => pendiente("reportes.resumen"),
  },

  /**
   * El token del teléfono, para que el ERP pueda mandar avisos.
   *
   * Esto faltaba y por eso los avisos nunca sonaron: la app pedía permiso, se
   * registraba en Firebase y obtenía el token, y acá se perdía. El ERP tenía
   * todo lo demás —la tabla, el envío por `firebase-admin`— pero ningún
   * teléfono anotado al que mandarle.
   *
   * El nombre de los campos es el del ERP (`fcm_token`, no `token`): este
   * archivo habla el idioma de la API, y el resto de la app el suyo.
   */
  dispositivos: {
    async registrar(input) {
      await request("/cc/agent/device-token", {
        method: "POST",
        body: JSON.stringify({
          fcm_token: input.token,
          platform: input.plataforma,
          // Para saber desde qué build llegó un token cuando algo no suene.
          // El ERP lo recorta a 40, pero mandarlo ya corto evita depender de eso.
          app_version: `${config.version}${config.build ? ` (${config.build})` : ""}`.slice(0, 40),
        }),
      });
    },

    /**
     * Dar de baja no es opcional: si el token queda activo, el ERP le sigue
     * mandando los avisos de esta empresa a un teléfono que cerró sesión. En
     * uno compartido, eso es que la próxima persona lea lo que no le toca.
     */
    async baja(token) {
      await request("/cc/agent/device-token/deactivate", {
        method: "POST",
        body: JSON.stringify({ fcm_token: token }),
      });
    },
  },
};

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
import { norm } from "../format";
import { citaDe, resolverCitas, type MensajeMapeado } from "../hilo";
import { buildReport } from "../reportes";
import { hayTenantActivo, sb, tenantEnUso } from "../supabase/client";
import type {
  AgenteDestino,
  Chat,
  ChatMsg,
  Cliente,
  ColaDestino,
  Compra,
  FichaChat,
  FichaCierreChat,
  FichaConversacionChat,
  FichaPasoChat,
  FichaProyectoChat,
  InvProducto,
  Iva,
  MovTipo,
  Movimiento,
  Proveedor,
  Venta,
} from "../types";
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

/**
 * El IVA de una línea de compra, como lo quiere el ERP: `"exenta" | "5" | "10"`.
 *
 * No es el mismo formato que en la venta, que espera `"EXENTA"` en mayúscula.
 * El ERP rechaza cualquier otra cosa sin coerción, que está bien: una compra
 * asentada con el IVA equivocado se arrastra a todo el libro.
 */
function ivaDeCompra(iva: Iva): "exenta" | "5" | "10" {
  if (iva === "5%") return "5";
  if (iva === "Exenta") return "exenta";
  return "10";
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
  /**
   * Los catálogos viajan por id, no por nombre. El nombre se resuelve con
   * `cargarCatalogo`: sin eso la app mostraba la categoría y el depósito
   * vacíos aunque el producto los tuviera cargados en el ERP.
   */
  categoria_principal_id?: string | null;
  ubicacion_principal_id?: string | null;
  proveedor_principal_id?: string | null;
}

/**
 * El rubro de la app son las categorías de proveedor del ERP, que viajan por
 * id. Se escriben separadas por coma, igual que las devuelve `aProveedor`.
 */
async function idsDeCategoriasDeProveedor(rubro: string): Promise<string[]> {
  const nombres = (rubro || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (nombres.length === 0) return [];

  let catalogo: Map<string, string>;
  try {
    const r = await request<unknown>("/proveedores/categorias");
    const filas = comoLista<{ id?: unknown; nombre?: string | null }>(
      r,
      "categorias",
      "/proveedores/categorias",
    );
    catalogo = new Map(filas.map((f) => [String(f.id ?? ""), primero(f.nombre)]));
  } catch {
    // Sin catálogo, el proveedor se guarda sin rubro. El rubro es un dato de
    // orden; no guardar el proveedor por eso sería peor.
    return [];
  }

  const ids: string[] = [];
  for (const nombre of nombres) {
    const buscado = norm(nombre);
    let id = "";
    for (const [k, v] of catalogo) if (norm(v) === buscado) id = k;
    if (!id) {
      try {
        const r = await request<{ categoria?: { id?: unknown } } | null>("/proveedores/categorias", {
          method: "POST",
          body: JSON.stringify({ nombre }),
        });
        id = r?.categoria?.id == null ? "" : String(r.categoria.id);
        if (id) catalogo.set(id, nombre);
      } catch {
        continue;
      }
    }
    if (id) ids.push(id);
  }
  return ids;
}

/* ---------- catálogos de inventario (categorías y ubicaciones) ---------- */

/**
 * El ERP guarda la categoría y el depósito de un producto por id, y la app los
 * muestra y los pide por nombre, que es lo que escribe una persona.
 *
 * Se cachean por sesión: son dos listas cortas que no cambian mientras alguien
 * carga productos, y se pedían una vez por producto listado.
 *
 * Sólo se cachea el éxito. Un ERP puede no tener el módulo de catálogos, y
 * guardar ese fallo dejaría la categoría vacía para siempre en esa sesión.
 */
const CATALOGOS = {
  categorias: { ruta: "/inventario/categorias", clave: "categorias", singular: "categoria" },
  ubicaciones: { ruta: "/inventario/ubicaciones", clave: "ubicaciones", singular: "ubicacion" },
} as const;

type Catalogo = keyof typeof CATALOGOS;

const catalogoEnMemoria: Partial<Record<Catalogo, Map<string, string>>> = {};

async function cargarCatalogo(cual: Catalogo): Promise<Map<string, string>> {
  const ya = catalogoEnMemoria[cual];
  if (ya) return ya;
  const { ruta, clave } = CATALOGOS[cual];
  try {
    const r = await request<unknown>(ruta);
    const filas = comoLista<{ id?: unknown; nombre?: string | null }>(r, clave, ruta);
    const m = new Map<string, string>();
    for (const f of filas) {
      const id = f.id == null ? "" : String(f.id);
      if (id) m.set(id, primero(f.nombre));
    }
    catalogoEnMemoria[cual] = m;
    return m;
  } catch {
    // Sin catálogo el producto se muestra sin categoría —como antes— en vez de
    // caerse la pantalla de inventario entera.
    return new Map();
  }
}

/**
 * El id de una categoría o ubicación a partir del nombre escrito.
 *
 * Con `crear`, si no existe la da de alta. Es lo que espera alguien que
 * escribió una categoría nueva en el formulario: el campo es libre y ofrece las
 * que ya hay, así que un nombre que no está en la lista es uno nuevo a propósito.
 * Sin `crear` devuelve `null` y el producto queda sin categoría.
 */
async function idDeCatalogo(cual: Catalogo, nombre: string, crear = false): Promise<string | null> {
  const buscado = norm(nombre.trim());
  if (!buscado) return null;
  const m = await cargarCatalogo(cual);
  for (const [id, n] of m) if (norm(n) === buscado) return id;
  if (!crear) return null;

  const { ruta, singular } = CATALOGOS[cual];
  try {
    const r = await request<Record<string, { id?: unknown; nombre?: string | null } | undefined>>(ruta, {
      method: "POST",
      body: JSON.stringify({ nombre: nombre.trim() }),
    });
    const creada = r?.[singular];
    const id = creada?.id == null ? "" : String(creada.id);
    if (!id) return null;
    m.set(id, primero(creada?.nombre) || nombre.trim());
    return id;
  } catch {
    // No poder crear la categoría no tiene que impedir guardar el producto: se
    // guarda sin ella, que es un dato de orden y no el producto en sí.
    return null;
  }
}

function aProducto(
  p: ProductoErp,
  cats?: Map<string, string>,
  ubis?: Map<string, string>,
): InvProducto {
  return {
    id: String(p.id),
    nombre: p.nombre || "(sin nombre)",
    sku: p.sku || "",
    barras: p.codigo_barras || "",
    unidad: p.unidad_medida || "UN",
    // Vacío cuando el ERP no informa el catálogo: mejor en blanco que un
    // "Sin categoría" que no se sabe si es el dato o la falta del dato.
    categoria: (p.categoria_principal_id && cats?.get(String(p.categoria_principal_id))) || "",
    deposito: (p.ubicacion_principal_id && ubis?.get(String(p.ubicacion_principal_id))) || "",
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

/** Una fila de `movimientos_inventario`, con los nombres del ERP. */
interface MovimientoErp {
  id: string;
  producto_id?: string | null;
  producto_nombre?: string | null;
  producto_sku?: string | null;
  tipo?: string | null;
  cantidad?: number | string | null;
  costo_unitario?: number | string | null;
  origen?: string | null;
  referencia?: string | null;
  fecha?: string | null;
  created_at?: string | null;
  usuario_nombre?: string | null;
}

function aMovimiento(m: MovimientoErp): Movimiento {
  const cant = Number(m.cantidad) || 0;
  return {
    id: String(m.id),
    prodId: String(m.producto_id ?? ""),
    tipo: aTipoDeMovimiento(m.tipo, cant),
    // La cantidad siempre positiva: el signo lo dice el tipo. El ERP guarda
    // las salidas en negativo y la pantalla ya pone el signo según el tipo,
    // así que dejarlo negativo mostraba "−−12".
    cant: Math.abs(cant),
    origen: primero(m.origen) || "ERP",
    ref: primero(m.referencia),
    fecha: (primero(m.fecha, m.created_at) || "").slice(0, 10),
    usuario: primero(m.usuario_nombre),
  };
}

/**
 * El tipo de movimiento, de los nombres del ERP a los tres de la app.
 *
 * El ERP tiene muchos más (`inventario_inicial`, `compra`, `venta`,
 * `ajuste_positivo`…). Lo que la app muestra es si el stock subió, bajó o se
 * corrigió, y `origen` dice el resto.
 */
function aTipoDeMovimiento(t: string | null | undefined, cantidad: number): MovTipo {
  // "inventario" contiene "venta" —inVENTArio—, así que `inventario_inicial`
  // se leía como una salida y el stock inicial aparecía en rojo, restando.
  // La palabra se saca antes de buscar.
  const v = (t || "").toLowerCase().replace(/inventario/g, "");
  if (v.includes("ajuste")) return "AJUSTE";
  // Lo que suma primero: así `devolucion` o `compra` no caen en la rama de
  // abajo por contener otra palabra.
  if (v.includes("inicial") || v.includes("ingreso") || v.includes("entrada") || v.includes("compra") || v.includes("recepcion")) {
    return "ENTRADA";
  }
  if (v.includes("salida") || v.includes("venta") || v.includes("egreso")) return "SALIDA";
  // Sin nombre reconocible manda el signo de la cantidad, que es el dato duro.
  return cantidad < 0 ? "SALIDA" : "ENTRADA";
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
  /**
   * Cuántos sin leer. El nombre del campo cambia según el ERP, así que se
   * miran varios: la app no puede pedirle a cada cliente que renombre una
   * columna para que se vea el globito.
   */
  unread_count?: number | null;
  unread?: number | null;
  unreadCount?: number | null;
  no_leidos?: number | null;
  mensajes_sin_leer?: number | null;
  contact_nombre?: string | null;
  contact_telefono?: string | null;
  /** Quién la está atendiendo, y en qué cola está. Pueden venir vacíos. */
  agente_nombre?: string | null;
  cola_nombre?: string | null;
  /** Como lo manda /mobile/asesor/conversations. */
  queue_nombre?: string | null;
  cola?: string | null;
}

interface ConversacionesErp {
  ok?: boolean;
  /** false cuando el usuario no está en ninguna cola de atención. */
  is_agent?: boolean;
  conversations?: ConversacionErp[];
}

interface MensajeErp {
  id: string;
  /** El id del mensaje en WhatsApp, que es a lo que apunta una reacción. */
  wa_message_id?: string | null;
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
 * Lo que trae una reacción: el emoji y de quién es el mensaje reaccionado.
 *
 * Viaja en el sobre de WhatsApp, que según el proveedor anida el mensaje un
 * nivel más adentro. Se miran las tres formas conocidas y se corta en la
 * primera que tenga el objeto `reaction`.
 *
 * `sobreMio` es lo que faltaba y es lo que descolocaba las reacciones. Una
 * reacción se dibuja colgando del mensaje al que reacciona, no del lado de
 * quien reaccionó: si un cliente le pone un pulgar a algo que escribí yo, el
 * emoji va a la derecha, con mi mensaje. Antes se alineaba por `from_me` del
 * mensaje de reacción —o sea, por quién reaccionó— y quedaba del lado
 * contrario, flotando suelto.
 *
 * `emoji` vacío NO es un error: WhatsApp manda una reacción con el emoji en
 * blanco para decir "le saqué la reacción". Por eso se devuelve `""` y no se
 * rellena acá; quien llame decide, y lo que corresponde es no dibujar nada.
 */
function datosDeReaccion(
  raw: Record<string, unknown> | null | undefined,
): { emoji: string; sobreMio: boolean | null } | null {
  for (const r of raicesDelSobre(raw)) {
    const reaccion = r.reaction;
    if (!reaccion || typeof reaccion !== "object" || Array.isArray(reaccion)) continue;
    const obj = reaccion as { emoji?: unknown; text?: unknown; key?: unknown };
    // Algunos proveedores le dicen `text` en vez de `emoji`.
    const crudo = typeof obj.emoji === "string" ? obj.emoji : typeof obj.text === "string" ? obj.text : "";
    // `key` apunta al mensaje reaccionado. Sin él no se puede saber de qué
    // lado va, y entonces se cae al lado de quien reaccionó, que es lo que
    // había antes: peor que esto, pero es lo único que queda.
    const key = obj.key;
    let sobreMio: boolean | null = null;
    if (key && typeof key === "object" && !Array.isArray(key)) {
      const k = key as { fromMe?: unknown; from_me?: unknown };
      const v = typeof k.fromMe === "boolean" ? k.fromMe : typeof k.from_me === "boolean" ? k.from_me : null;
      if (v !== null) sobreMio = v;
    }
    return { emoji: crudo.trim(), sobreMio };
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

/**
 * Cuántos mensajes sin leer tiene la conversación.
 *
 * Cada ERP le pone un nombre distinto a esta columna y la app no puede pedirle
 * a cada cliente que la renombre: sin esto, el globito con el número no
 * aparece nunca y no hay ningún error que lo explique, que es la peor forma de
 * fallar. Se prueban los nombres conocidos y gana el primero que traiga un
 * número; un `0` legítimo corta la búsqueda igual, porque cero es una
 * respuesta, no un campo ausente.
 */
function cuantosSinLeer(c: ConversacionErp): number {
  // Tipado suelto a propósito: el ERP puede mandar el número como texto, y
  // declararlo `number` acá no impide que llegue `"3"`.
  const candidatos: unknown[] = [c.unread_count, c.unread, c.unreadCount, c.no_leidos, c.mensajes_sin_leer];
  for (const v of candidatos) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 0;
}

/* ---------- la ficha del contacto, como la manda el ERP ---------- */

/**
 * El sobre de la ficha es una cuarta forma: `{ ok, ficha }`. Y adentro los
 * nombres son los del ERP. Se traduce todo acá, de una vez, para que la
 * pantalla no tenga que saber que `es_final` quiere decir "terminado" ni que
 * `linea_tiempo` es el recorrido.
 */
interface FichaErp {
  contacto?: {
    nombre?: string | null;
    telefono?: string | null;
    telefono_real?: string | null;
    es_lid?: boolean | null;
    creado_en?: string | null;
  } | null;
  cliente?: {
    id?: string | null;
    nombre?: string | null;
    ruc?: string | null;
    email?: string | null;
    telefono?: string | null;
    ciudad?: string | null;
    direccion?: string | null;
  } | null;
  proyectos?: Array<{
    id?: string | null;
    nombre?: string | null;
    tipo?: string | null;
    estado?: string | null;
    estado_color?: string | null;
    es_final?: boolean | null;
    archivado?: boolean | null;
    project_manager?: string | null;
    responsable_tecnico?: string | null;
  }> | null;
  ultima_tipificacion?: {
    estado?: string | null;
    subestado?: string | null;
    comentario?: string | null;
    fecha?: string | null;
    por?: string | null;
    reabierta?: boolean | null;
    es_de_esta_conversacion?: boolean | null;
  } | null;
  conversaciones?: Array<{
    id?: string | null;
    canal?: string | null;
    cola?: string | null;
    agente?: string | null;
    estado?: string | null;
    ultimo_mensaje_at?: string | null;
    actual?: boolean | null;
  }> | null;
  linea_tiempo?: Array<{
    id?: string | null;
    fecha?: string | null;
    tipo?: string | null;
    accion?: string | null;
    linea?: string | null;
    usuario?: string | null;
    destino?: string | null;
  }> | null;
  notas?: string[] | null;
}

const TIPOS_PASO: FichaPasoChat["tipo"][] = [
  "ingreso",
  "asignado",
  "tomado",
  "transferido",
  "cola",
  "cerrado",
  "sistema",
];

function aFicha(f: FichaErp): FichaChat {
  const c = f.contacto ?? {};
  const cl = f.cliente ?? null;
  const tip = f.ultima_tipificacion ?? null;

  // El estado y el subestado se leen como una sola cosa ("Perdido · Precio"),
  // que es como lo dice el ERP en la web. El "—" que manda cuando no hay
  // subestado no se muestra: es un relleno de tabla, no un dato.
  const cierre: FichaCierreChat | null = tip
    ? {
        estado: [primero(tip.estado) || "Cerrada", primero(tip.subestado)]
          .filter((x) => x && x !== "—")
          .join(" · "),
        comentario: primero(tip.comentario) || null,
        fecha: primero(tip.fecha) || null,
        por: primero(tip.por) || null,
        reabierta: tip.reabierta === true,
        deOtraConversacion: tip.es_de_esta_conversacion === false,
      }
    : null;

  const proyectos: FichaProyectoChat[] | null = Array.isArray(f.proyectos)
    ? f.proyectos.map((p) => ({
        id: String(p.id ?? ""),
        nombre: primero(p.nombre) || "Proyecto sin nombre",
        tipo: primero(p.tipo) || null,
        estado: primero(p.estado) || null,
        estadoColor: primero(p.estado_color) || null,
        cerrado: p.archivado === true || p.es_final === true,
        responsables:
          [
            primero(p.project_manager) ? `PM: ${primero(p.project_manager)}` : "",
            primero(p.responsable_tecnico) ? `Técnico: ${primero(p.responsable_tecnico)}` : "",
          ]
            .filter(Boolean)
            .join(" · ") || null,
      }))
    : null;

  const conversaciones: FichaConversacionChat[] = (f.conversaciones ?? []).map((v) => ({
    id: String(v.id ?? ""),
    canal: primero(v.canal) || null,
    cola: primero(v.cola) || null,
    agente: primero(v.agente) || null,
    abierta: v.estado !== "closed",
    fecha: primero(v.ultimo_mensaje_at) || null,
    actual: v.actual === true,
  }));

  const recorrido: FichaPasoChat[] = (f.linea_tiempo ?? []).map((e, i) => {
    const tipo = TIPOS_PASO.find((x) => x === e.tipo) ?? "sistema";
    return {
      id: String(e.id ?? i),
      fecha: primero(e.fecha),
      tipo,
      accion: primero(e.accion) || "Movimiento",
      linea: primero(e.linea) || null,
      usuario: primero(e.usuario) || null,
      destino: primero(e.destino) || null,
    };
  });

  return {
    contacto: {
      // El nombre no siempre está: WhatsApp manda el número y nada más hasta
      // que alguien lo carga.
      nombre: primero(c.nombre) || "Sin nombre",
      telefono: primero(c.telefono),
      esCodigoInterno: c.es_lid === true && !primero(c.telefono_real),
      primerContacto: primero(c.creado_en) || null,
    },
    cliente: cl
      ? {
          id: String(cl.id ?? ""),
          nombre: primero(cl.nombre) || "Cliente sin nombre",
          ruc: primero(cl.ruc) || null,
          email: primero(cl.email) || null,
          telefono: primero(cl.telefono) || null,
          ciudad: primero(cl.ciudad) || null,
          direccion: primero(cl.direccion) || null,
        }
      : null,
    proyectos,
    cierre,
    conversaciones,
    recorrido,
    notas: (f.notas ?? []).filter((n): n is string => typeof n === "string" && !!n.trim()),
  };
}

/** Un agente destino, como lo manda el ERP. */
interface AgenteErp {
  id?: string | null;
  nombre?: string | null;
  queue_id?: string | null;
  queue_nombre?: string | null;
  operational_status?: string | null;
  is_online?: boolean | null;
  active_conversations?: number | null;
}

function aAgente(a: AgenteErp): AgenteDestino {
  return {
    id: String(a.id ?? ""),
    nombre: primero(a.nombre) || "Sin nombre",
    colaId: String(a.queue_id ?? ""),
    colaNombre: primero(a.queue_nombre) || "Sin cola",
    // `ready` es el único estado en el que le entran chats. Cualquier otro
    // —`offline`, o uno nuevo que el ERP agregue— se muestra como en pausa.
    disponible: a.operational_status === "ready",
    enLinea: a.is_online === true,
    activas: Number(a.active_conversations ?? 0) || 0,
  };
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
    noLeidos: cuantosSinLeer(c),
    // Tres estados, no dos. `undefined` es "este ERP no informa de quién es la
    // conversación", y entonces la etiqueta no se dibuja: poner "Sin asignar"
    // en todas sería afirmar algo que no sabemos. `null` sí es "no la tomó
    // nadie", y eso sólo se puede decir si el ERP mandó el campo.
    responsable:
      "agente_nombre" in c || "cola_nombre" in c
        ? primero(c.agente_nombre, c.cola_nombre) || null
        : undefined,
    // La cola va aparte del responsable: el responsable es una etiqueta y la
    // cola divide el listado en pestañas, así que no pueden compartir campo.
    // Si el ERP no la manda queda `undefined` y no hay pestañas.
    cola: primero(c.cola_nombre, c.queue_nombre, c.cola) || undefined,
    // El listado trae sólo la vista previa del último mensaje. Los mensajes de
    // verdad llegan al abrir la conversación.
    //
    // La vista previa que guarda el ERP para un adjunto es un marcador de
    // texto: "[audio]", "[documento] x.pdf". Se traduce acá, que si no la
    // lista se lee como una columna de corchetes.
    // El ERP usa "closed"; se mira por prefijo para no atarse a esa palabra
    // exacta si otro ERP dice "cerrada".
    cerrada: /^(clos|cerr)/i.test(c.status || ""),
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

/**
 * Un mensaje del ERP, como lo muestra la app.
 *
 * Devuelve `null` cuando el mensaje no se tiene que dibujar. Hoy el único caso
 * es una reacción retirada, que llega como un mensaje de reacción con el emoji
 * vacío. Antes eso caía en un `|| "👍"` y aparecía un pulgar que nadie puso:
 * sacar una reacción dejaba una reacción.
 */

/**
 * Los tildes de un mensaje propio, con los tres estados de WhatsApp.
 *
 * Antes eran dos: leído o no leído. Un mensaje ENTREGADO —que ya está en el
 * teléfono del cliente— se veía igual que uno que todavía estaba saliendo, así
 * que no había forma de distinguir "no lo vio todavía" de "no le llegó". Son
 * dos problemas distintos y se actúa distinto con cada uno.
 */
function marcasDeEntrega(estado: string | null | undefined): { tick: string; leido?: boolean } {
  const v = (estado || "").toLowerCase();
  if (/read|le[ií]d/.test(v)) return { tick: "\u2713\u2713", leido: true };
  if (/deliver|entreg/.test(v)) return { tick: "\u2713\u2713" };
  return { tick: "\u2713" };
}




function aMensaje(m: MensajeErp): MensajeMapeado | null {
  const tipo = (m.message_type || "text").toLowerCase();
  const base = {
    de: (m.from_me ? "yo" : "ellos") as "yo" | "ellos",
    hora: horaCorta(m.created_at),
    // Sin esto no se puede reaccionar: la reacción apunta al mensaje de
    // WhatsApp, no a la fila del ERP.
    ...(primero(m.wa_message_id) ? { wamid: primero(m.wa_message_id) } : {}),
    ...(() => {
      const c = citaDe(m.raw_payload);
      if (!c) return {};
      if (c.texto) return { cita: { texto: c.texto, mio: c.mio === true } };
      // Queda marcado para resolverlo contra el hilo, que es donde está el
      // texto del mensaje citado.
      return { citaPendiente: c.wamid };
    })(),
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
    const datos = datosDeReaccion(m.raw_payload);
    const emoji = (datos?.emoji || sinMarcador(m.content) || "").trim();
    // Reacción retirada: no se dibuja nada.
    if (!emoji) return null;
    return {
      ...base,
      reaccion: emoji,
      // De qué lado va: del mensaje reaccionado. Si el sobre no lo dice, del
      // lado de quien reaccionó, que es lo único que se sabe.
      reaccionSobreMio: datos?.sobreMio ?? base.de === "yo",
    };
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
    ...(m.from_me ? marcasDeEntrega(m.whatsapp_delivery_status) : {}),
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
    /**
     * Alta de proveedor.
     *
     * Dos traducciones que no son obvias:
     *
     *   - `ciudad` de la app va a `direccion` del ERP. El ERP no tiene columna
     *     de ciudad, y es lo que ya hace `aProveedor` al leer, así que lo que
     *     se escribe vuelve en el mismo campo.
     *   - `rubro` son las categorías de proveedor del ERP, que viajan por id.
     *     Se resuelven por nombre y se dan de alta si no existen, igual que las
     *     categorías de producto.
     *
     * `entregaDias` no se guarda: el ERP no tiene dónde. Por eso `aProveedor`
     * devuelve `entrega: 0` al leer — no es que se pierda al guardar, es que no
     * existe en este ERP.
     */
    async create(input) {
      const categoriaIds = await idsDeCategoriasDeProveedor(input.rubro);
      const r = await request<{ proveedor?: ProveedorErp } | null>("/proveedores", {
        method: "POST",
        body: JSON.stringify({
          nombre: input.nombre,
          ruc: input.doc || null,
          telefono: input.tel || null,
          email: input.email || null,
          direccion: input.ciudad || null,
          contacto: input.contacto || null,
          condicion_pago: input.credito ? "credito" : "contado",
          plazo_pago_dias: input.credito ? input.credito.plazoDias : null,
          categoria_ids: categoriaIds,
        }),
      });
      const creado = r?.proveedor;
      if (!creado) {
        throw new ApiError("El ERP no devolvió el proveedor creado.", 200, "/proveedores");
      }
      return aProveedor(creado);
    },

    /** Corrige una ficha. Sólo viaja lo que cambió, por lo mismo que en productos. */
    async update(id, cambios) {
      const cuerpo: Record<string, unknown> = {};
      if (cambios.nombre !== undefined) cuerpo.nombre = cambios.nombre;
      if (cambios.doc !== undefined) cuerpo.ruc = cambios.doc || null;
      if (cambios.tel !== undefined) cuerpo.telefono = cambios.tel || null;
      if (cambios.email !== undefined) cuerpo.email = cambios.email || null;
      if (cambios.ciudad !== undefined) cuerpo.direccion = cambios.ciudad || null;
      if (cambios.contacto !== undefined) cuerpo.contacto = cambios.contacto || null;
      if (cambios.credito !== undefined) {
        cuerpo.condicion_pago = cambios.credito ? "credito" : "contado";
        cuerpo.plazo_pago_dias = cambios.credito ? cambios.credito.plazoDias : null;
      }
      if (cambios.rubro !== undefined) {
        cuerpo.categoria_ids = await idsDeCategoriasDeProveedor(cambios.rubro);
      }

      const r = await request<{ proveedor?: ProveedorErp } | null>(
        `/proveedores/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify(cuerpo) },
      );
      const prov = r?.proveedor;
      if (!prov) {
        throw new ApiError("El ERP no devolvió el proveedor actualizado.", 200, "/proveedores");
      }
      return aProveedor(prov);
    },

    /**
     * La deuda con un proveedor.
     *
     * Sale del reporte de cuentas por pagar del ERP, que es la misma cifra que
     * ve contabilidad. Ese reporte pide permiso de contabilidad: un vendedor
     * recibe 403, y entonces esto devuelve 0 en vez de romper la pantalla.
     *
     * No es la única fuente: la pantalla de proveedores suma las compras
     * pendientes, que ya funciona sin permisos especiales.
     */
    async deuda(id) {
      try {
        const r = await request<{ totals?: { total?: number | null } } | null>(
          "/reportes/cuentas-por-pagar",
          { query: { proveedor_id: id } },
        );
        return entero(r?.totals?.total);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) return 0;
        throw e;
      }
    },

    consultarSet: () => pendiente("proveedores.consultarSet"),
  },

  inventario: {
    async list(params) {
      // Los tres pedidos van juntos: los catálogos son dos listas cortas y
      // cacheadas, y esperarlas en serie agregaba dos viajes a cada apertura
      // del inventario.
      const [r, cats, ubis] = await Promise.all([
        request<unknown>("/productos", { query: { q: params?.q, filtro: params?.filtro } }),
        cargarCatalogo("categorias"),
        cargarCatalogo("ubicaciones"),
      ]);
      return comoLista<ProductoErp>(r, "productos", "/productos").map((p) => aProducto(p, cats, ubis));
    },
    async get(id) {
      const [p, cats, ubis] = await Promise.all([
        request<ProductoErp | null>(`/productos/${encodeURIComponent(id)}`),
        cargarCatalogo("categorias"),
        cargarCatalogo("ubicaciones"),
      ]);
      return p ? aProducto(p, cats, ubis) : null;
    },

    /**
     * Alta de producto.
     *
     * Dos cosas de este ERP que conviene saber, porque no son un olvido mío:
     *
     *   - **No guarda el IVA por producto.** No existe la columna. Todo se
     *     factura al 10%, que es lo que `aIva` devuelve al leerlo. El selector
     *     de IVA del formulario lo dice en pantalla en modo ERP; mandarlo acá
     *     y que se pierda en silencio sería peor.
     *   - **No guarda precio mayorista ni vencimiento.** Son campos de Max que
     *     viven en el Supabase de Zentra, no en el ERP de un cliente.
     *
     * El movimiento de inventario inicial lo graba el ERP solo, si el stock
     * inicial es mayor a cero.
     */
    async create(input) {
      // Las dos altas de catálogo van antes del producto: si el ERP rechaza el
      // producto, no quedan una categoría y un depósito nuevos colgando.
      const [categoriaId, ubicacionId] = await Promise.all([
        idDeCatalogo("categorias", input.categoria, true),
        idDeCatalogo("ubicaciones", input.deposito, true),
      ]);

      const r = await request<{ producto?: ProductoErp; warning?: string | null } | null>("/productos", {
        method: "POST",
        body: JSON.stringify({
          nombre: input.nombre,
          sku: input.sku,
          codigo_barras: input.barras || null,
          unidad_medida: input.unidad || "UNIDAD",
          costo_promedio: input.costo,
          precio_venta: input.precio,
          stock_actual: input.stockInicial,
          stock_minimo: input.minimo,
          metodo_valuacion: input.metodo,
          categoria_principal_id: categoriaId,
          ubicacion_principal_id: ubicacionId,
        }),
      });
      const creado = r?.producto;
      if (!creado) {
        throw new ApiError("El ERP no devolvió el producto creado.", 200, "/productos");
      }
      const [cats, ubis] = await Promise.all([
        cargarCatalogo("categorias"),
        cargarCatalogo("ubicaciones"),
      ]);
      return aProducto(creado, cats, ubis);
    },

    /**
     * Corrige un producto ya cargado. Sólo viaja lo que cambió: el ERP toma el
     * campo como "cambialo" por el hecho de estar presente, así que mandar todo
     * pisaría con lo que tiene la app lo que alguien editó en la web.
     *
     * El stock no se toca acá —se mueve con `ajustar`, que deja rastro—, ni
     * siquiera cuando viene en `cambios`.
     */
    async update(id, cambios) {
      const cuerpo: Record<string, unknown> = {};
      if (cambios.nombre !== undefined) cuerpo.nombre = cambios.nombre;
      if (cambios.sku !== undefined) cuerpo.sku = cambios.sku;
      if (cambios.barras !== undefined) cuerpo.codigo_barras = cambios.barras || null;
      if (cambios.unidad !== undefined) cuerpo.unidad_medida = cambios.unidad || "UNIDAD";
      if (cambios.costo !== undefined) cuerpo.costo_promedio = cambios.costo;
      if (cambios.precio !== undefined) cuerpo.precio_venta = cambios.precio;
      if (cambios.minimo !== undefined) cuerpo.stock_minimo = cambios.minimo;
      if (cambios.metodo !== undefined) cuerpo.metodo_valuacion = cambios.metodo;
      if (cambios.categoria !== undefined) {
        cuerpo.categoria_principal_id = await idDeCatalogo("categorias", cambios.categoria, true);
      }
      if (cambios.deposito !== undefined) {
        cuerpo.ubicacion_principal_id = await idDeCatalogo("ubicaciones", cambios.deposito, true);
      }

      const r = await request<{ producto?: ProductoErp } | null>(
        `/productos/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify(cuerpo) },
      );
      const prod = r?.producto;
      if (!prod) {
        throw new ApiError("El ERP no devolvió el producto actualizado.", 200, "/productos");
      }
      const [cats, ubis] = await Promise.all([
        cargarCatalogo("categorias"),
        cargarCatalogo("ubicaciones"),
      ]);
      return aProducto(prod, cats, ubis);
    },

    /**
     * Los movimientos de inventario.
     *
     * El ERP devuelve los últimos 500 de la empresa y no acepta filtros, así
     * que el filtrado por producto y por tipo es acá. Para un producto puntual
     * eso puede devolver pocos o ninguno si tiene movimientos más viejos que
     * esos 500; es una limitación del endpoint, no un error de la app.
     */
    async movimientos(params) {
      const r = await request<unknown>("/inventario/movimientos");
      const filas = comoLista<MovimientoErp>(r, "movimientos", "/inventario/movimientos");
      return filas
        .map(aMovimiento)
        .filter((m) => (params?.prodId ? m.prodId === params.prodId : true))
        .filter((m) => (params?.tipo ? m.tipo === params.tipo : true));
    },

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
          precioMayorista: inv.precioMayorista ?? null,
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
    async cuentas() {
      const r = await request<unknown>("/plan-cuentas/opciones");
      const filas = comoLista<{ id?: unknown; cuenta?: string | null; denominacion?: string | null }>(
        r,
        "cuentas",
        "/plan-cuentas/opciones",
      );
      return filas
        .map((c) => ({
          id: String(c.id ?? ""),
          codigo: primero(c.cuenta),
          nombre: primero(c.denominacion) || "(sin denominación)",
        }))
        .filter((c) => c.id);
    },

    /**
     * Registra la compra.
     *
     * Va por el camino multilínea del ERP (`items`), incluso con una sola
     * línea. Dos razones: la app permite varias, y el camino de una sola línea
     * exige `precio_venta` mayor a cero —el nuevo precio de venta del
     * producto—, que la app no pregunta. Mandar un precio inventado ahí le
     * cambiaría el precio al producto sin que nadie lo haya decidido.
     *
     * La cuenta contable es obligatoria y viaja en cada línea; el ERP toma la
     * de la primera para la cabecera. La contrapartida es obligatoria al
     * contado y opcional a crédito, donde el ERP usa su cuenta de proveedores.
     *
     * El IVA va CONTENIDO en el costo, igual que en la venta: el ERP recalcula
     * los montos de su lado y no confía en lo que mande la app. De ₲100.000 al
     * 10%, el impuesto son ₲9.091.
     *
     * Y va con clave de intento: alguien pierde señal después de registrar la
     * compra, vuelve a tocar el botón, y el ERP devuelve la misma compra en vez
     * de duplicar el stock y el asiento.
     */
    async create(input) {
      const cuenta = (input.cuentaContableId || "").trim();
      if (!cuenta) {
        throw new ApiError(
          "Elegí la cuenta contable de la compra: tu ERP la necesita para asentarla.",
          400,
          "/compras",
        );
      }
      const aCredito = input.pago.tipo === "credito" ? input.pago : null;
      const pago = (input.cuentaPagoId || "").trim();
      if (!aCredito && !pago) {
        throw new ApiError(
          "Elegí la cuenta de pago: una compra al contado tiene que decir de dónde salió la plata.",
          400,
          "/compras",
        );
      }

      const prov = await httpRepo.proveedores.get(input.provId);

      const r = await request<{ compra?: CompraErp } | null>("/compras", {
        method: "POST",
        body: JSON.stringify({
          proveedor_id: input.provId,
          proveedor_nombre: prov?.nombre ?? "",
          origen_compra: "directa",
          moneda: input.moneda,
          tipo_cambio: input.moneda === "USD" ? input.tipoCambio || 1 : 1,
          tipo_pago: aCredito ? "credito" : "contado",
          plazo_dias: aCredito ? aCredito.plazoDias : null,
          cuotas: aCredito ? aCredito.cuotas : null,
          nro_timbrado: input.comprobante.timbrado,
          numero_comprobante: input.comprobante.numero || null,
          tipo_comprobante: "Factura",
          cuenta_contrapartida_id: pago || null,
          items: input.lineas.map((l) => ({
            producto_id: l.prodId,
            producto_nombre: l.nombre,
            descripcion: l.nombre,
            cantidad: l.cantidad,
            costo_unitario: l.costo,
            iva_tipo: ivaDeCompra(l.iva),
            cuenta_contable_id: cuenta,
          })),
          idempotency_key: claveDeIntento(),
        }),
      });
      const creada = r?.compra;
      if (!creada) {
        throw new ApiError("El ERP no devolvió la compra registrada.", 200, "/compras");
      }
      return aCompra(creada);
    },
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
          query: {
            offset: desde,
            limit: TANDA_CHATS,
            // El ERP excluye las cerradas salvo que se le pidan.
            ...(params?.incluirCerradas ? { only_open: 0 } : {}),
          },
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
          msgs: resolverCitas(msgs.map(aMensaje).filter((x): x is MensajeMapeado => x !== null)),
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
        msgs: resolverCitas(
          (r.messages ?? []).map(aMensaje).filter((x): x is MensajeMapeado => x !== null),
        ),
      };
    },

    async enviar(chatId, msg, cita) {
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
        body: JSON.stringify({
          message: msg.texto,
          // La cita de verdad: el wamid va a WhatsApp, que es lo que hace que
          // del otro lado se vea el mensaje citado arriba de la respuesta. El
          // contexto es el resumen con el que el ERP la dibuja en su propia
          // pantalla sin tener que ir a buscar el mensaje.
          ...(cita
            ? {
                reply_to_wamid: cita.wamid,
                reply_context: {
                  wa_message_id: cita.wamid,
                  from_me: cita.mio,
                  preview: cita.texto.slice(0, 160),
                },
              }
            : {}),
        }),
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

    /**
     * Decirle al ERP que esta conversación ya se leyó.
     *
     * No hay un endpoint dedicado: el ERP baja el contador como efecto de
     * `GET /mobile/asesor/conversations/<id>`, que es por donde el escritorio
     * abre un chat. La app leía los mensajes por `/chat/messages`, que NO lo
     * baja, así que el globito de no leídos se quedaba puesto para siempre —en
     * la app, en la web y en el teléfono de al lado—.
     *
     * Se ignora la respuesta: lo que importa es el efecto. Y si falla no se
     * levanta error: no poder bajar un contador no tiene que impedirle a nadie
     * leer la conversación que ya tiene abierta.
     */
    async marcarLeido(chatId) {
      try {
        await request(`/mobile/asesor/conversations/${encodeURIComponent(chatId)}`);
      } catch {
        /* el contador se baja en el próximo intento */
      }
    },

    /**
     * Reaccionar a un mensaje.
     *
     * Va contra el mensaje de WhatsApp (`wamid`), no contra la fila del ERP: la
     * reacción se la manda WhatsApp al contacto, y del otro lado la ve pegada a
     * su mensaje igual que si la hubieras puesto desde el teléfono.
     *
     * Emoji vacío saca la reacción, que es como lo entiende WhatsApp.
     */
    async reaccionar(chatId, wamid, emoji) {
      await request(`/mobile/asesor/conversations/${encodeURIComponent(chatId)}/react`, {
        method: "POST",
        body: JSON.stringify({ target_wa_message_id: wamid, emoji }),
      });
    },

    /**
     * La ficha del contacto: la misma que el ERP muestra al costado del chat.
     *
     * Se pide por conversación y no por contacto porque así lo decidió el ERP:
     * el permiso se valida contra un chat que la persona ya está viendo.
     *
     * Un 403 no es un error a mostrar en rojo: es "esta persona no puede ver
     * esta ficha", y la pantalla lo dice con palabras. Un 404 es que el ERP no
     * tiene ficha para esa conversación.
     */
    async ficha(chatId) {
      try {
        const r = await request<{ ok?: boolean; ficha?: unknown } | null>(
          "/chat/contactos/ficha",
          { query: { conversation_id: chatId } },
        );
        const cruda = r?.ficha;
        if (!cruda || typeof cruda !== "object") return null;
        return aFicha(cruda as FichaErp);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },

    async destinos(chatId) {
      const r = await request<{ queues?: unknown; agents?: unknown } | null>(
        `/mobile/asesor/conversations/${encodeURIComponent(chatId)}/transfer`,
      );
      const colas = Array.isArray(r?.queues) ? (r.queues as Array<Record<string, unknown>>) : [];
      const agentes = Array.isArray(r?.agents) ? (r.agents as AgenteErp[]) : [];
      return {
        // Una cola apagada sigue existiendo en el ERP pero no recibe nada:
        // ofrecerla sería mandar la conversación a un lugar sin nadie.
        colas: colas
          .filter((q) => q.is_active !== false)
          .map((q): ColaDestino => ({ id: String(q.id ?? ""), nombre: primero(q.nombre as string) || "Sin nombre" }))
          .filter((q) => q.id),
        agentes: agentes.map(aAgente).filter((a) => a.id),
      };
    },

    async transferir(chatId, a) {
      const cuerpo = a.agenteId ? { agent_id: a.agenteId } : { queue_id: a.colaId };
      await request(`/mobile/asesor/conversations/${encodeURIComponent(chatId)}/transfer`, {
        method: "POST",
        body: JSON.stringify(cuerpo),
      });
    },
  },

  /**
   * Los reportes se arman en la app, con los datos del ERP.
   *
   * El ERP tiene reportes propios —libro de ventas, de compras, cuentas por
   * pagar— pero ninguno devuelve lo que esta pantalla muestra: una serie por
   * día, los KPI con su variación, la dona y el ranking. Y los que hay piden
   * permiso de contabilidad, que un vendedor no tiene.
   *
   * Así que se traen las listas y se calcula con `buildReport`, exactamente la
   * misma función que usa el modo de ejemplo. Un número que no coincida entre
   * los dos modos sería un error de datos, no de cuentas.
   *
   * Las tres listas se piden juntas y cada pestaña usa la que le toca; traerlas
   * siempre es lo que permite que cambiar de pestaña no espere otra vuelta.
   */
  reportes: {
    async resumen(tab, desde, hasta) {
      const [ventas, compras, productos] = await Promise.all([
        httpRepo.ventas.list({ desde, hasta }).catch(() => []),
        httpRepo.compras.list().catch(() => []),
        httpRepo.inventario.list().catch(() => []),
      ]);

      const m = buildReport(tab, desde, hasta, { ventas, compras, productos });
      return {
        serie: m.buckets.map((b) => ({ fecha: b.dia, valor: b.v })),
        total: m.total,
        kpis: m.kpis.map((k) => ({ label: k.label, valor: k.valor, delta: k.delta, up: null })),
        dona: m.dona,
        ranking: m.rank.map((r) => ({ label: r.label, valor: r.v, sub: r.sub })),
        tabla: m.tabla,
      };
    },
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
      const r = await request<{ is_agent?: boolean; agent_id?: string | null } | null>(
        "/cc/agent/device-token",
        {
          method: "POST",
          body: JSON.stringify({
            fcm_token: input.token,
            platform: input.plataforma,
            // Para saber desde qué build llegó un token cuando algo no suene.
            // El ERP lo recorta a 40, pero mandarlo ya corto evita depender de eso.
            app_version: `${config.version}${config.build ? ` (${config.build})` : ""}`.slice(0, 40),
          }),
        },
      );
      // El ERP ya venía contestando esto y la app lo tiraba. Es el dato que
      // explica por qué un teléfono con todo en orden no recibe avisos de
      // chats: sin `agent_id` el despachador no tiene a quién mandárselos.
      return { esAgente: typeof r?.is_agent === "boolean" ? r.is_agent : null };
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

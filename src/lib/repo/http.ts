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
import { sb, tenantEnUso } from "../supabase/client";
import type { Cliente, InvProducto, Iva, Venta } from "../types";
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

let token: string | null = null;

export function setToken(t: string | null): void {
  token = t;
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

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.timeoutMs);

  try {
    const res = await fetch(url.toString(), {
      ...rest,
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...rest.headers,
      },
    });

    if (!res.ok) {
      // El ERP contesta { success: false, error: "..." }. Ese texto está escrito
      // para mostrarle a una persona, así que se usa tal cual en vez de un
      // "algo falló" genérico.
      const crudo = await res.text().catch(() => "");
      let mensaje = crudo;
      try {
        const j = JSON.parse(crudo);
        mensaje = j?.error || j?.message || crudo;
      } catch {
        /* no era JSON */
      }
      throw new ApiError(
        mensaje || `La API respondió ${res.status}`,
        res.status,
        url.pathname,
      );
    }

    if (res.status === 204) return undefined as T;

    // El ERP envuelve todo en { success, data }. Se desenvuelve acá para que el
    // resto del archivo trabaje con los datos y no con el sobre.
    const json = await res.json();
    if (json && typeof json === "object" && "success" in json && "data" in json) {
      return (json as { data: T }).data;
    }
    return json as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError("La API no respondió a tiempo.", 408, url.pathname);
    }
    throw new ApiError("No se pudo conectar con la API.", 0, url.pathname);
  } finally {
    clearTimeout(timer);
  }
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
    estado: /cobrad|pagad|cerrad|complet/i.test(v.estado || "") ? "Cobrada" : "Pendiente",
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
 * Implementación contra la API de un ERP.
 *
 * Está implementado lo que hace falta para el caso que motivó esto: ver clientes
 * y productos, y registrar ventas. El resto avisa qué falta en vez de fallar en
 * silencio o devolver datos inventados.
 */
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
      const perfil = await request<{
        id: string;
        nombre?: string | null;
        rol?: string | null;
        empresa?: string | null;
      }>("/perfil");

      return {
        token: data.session.access_token,
        usuario: {
          id: perfil.id,
          nombre: perfil.nombre || "",
          rol: perfil.rol || "VENDEDOR",
          empresa: perfil.empresa || "",
        },
      };
    },

    async logout() {
      setToken(null);
      await sb().auth.signOut().catch(() => {});
    },

    async sesionActual() {
      const { data } = await sb().auth.getSession();
      if (!data.session) return null;
      setToken(data.session.access_token);
      const perfil = await request<{
        id: string;
        nombre?: string | null;
        rol?: string | null;
        empresa?: string | null;
      }>("/perfil");
      return {
        token: data.session.access_token,
        usuario: {
          id: perfil.id,
          nombre: perfil.nombre || "",
          rol: perfil.rol || "VENDEDOR",
          empresa: perfil.empresa || "",
        },
      };
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
      const filas = await request<ClienteErp[]>("/clientes", {
        query: { q: params?.q, estado: params?.estado },
      });
      return filas.map(aCliente);
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
    list: () => pendiente("proveedores.list"),
    get: () => pendiente("proveedores.get"),
    create: () => pendiente("proveedores.create"),
    deuda: () => pendiente("proveedores.deuda"),
    consultarSet: () => pendiente("proveedores.consultarSet"),
  },

  inventario: {
    async list(params) {
      const filas = await request<ProductoErp[]>("/productos", {
        query: { q: params?.q, filtro: params?.filtro },
      });
      return filas.map(aProducto);
    },
    async get(id) {
      const p = await request<ProductoErp | null>(`/productos/${encodeURIComponent(id)}`);
      return p ? aProducto(p) : null;
    },
    create: () => pendiente("inventario.create"),
    movimientos: () => pendiente("inventario.movimientos"),
    ajustar: () => pendiente("inventario.ajustar"),
  },

  ventas: {
    async productos(params) {
      const filas = await request<ProductoErp[]>("/productos", {
        query: { q: params?.q, vendibles: true },
      });
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
      const filas = await request<VentaErp[]>("/ventas", {
        query: { desde: params.desde, hasta: params.hasta, q: params.q, estado: params.estado },
      });
      return filas.map(aVenta);
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

      const cuerpo: Record<string, unknown> = {
        items,
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
      const v = await request<VentaErp>("/ventas/create", {
        method: "POST",
        headers: { "Idempotency-Key": claveDeIntento() },
        body: JSON.stringify(cuerpo),
      });
      return aVenta(v);
    },
  },

  compras: {
    list: () => pendiente("compras.list"),
    get: () => pendiente("compras.get"),
    create: () => pendiente("compras.create"),
  },

  chats: {
    list: () => pendiente("chats.list"),
    get: () => pendiente("chats.get"),
    enviar: () => pendiente("chats.enviar"),
    marcarLeido: () => pendiente("chats.marcarLeido"),
  },

  reportes: {
    resumen: () => pendiente("reportes.resumen"),
  },

  dispositivos: {
    registrar: () => pendiente("dispositivos.registrar"),
    baja: () => pendiente("dispositivos.baja"),
  },
};

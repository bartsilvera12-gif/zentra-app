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
import { sb } from "../supabase/client";
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
  const url = new URL(config.apiUrl + path);
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
      const cuerpo = await res.text().catch(() => "");
      throw new ApiError(
        cuerpo || `La API respondió ${res.status}`,
        res.status,
        url.pathname,
      );
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
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

/** Lo que la API devuelve para un cliente. Ver docs/API-ERP.md. */
interface ClienteApi {
  id: string;
  nombre: string;
  doc?: string | null;
  contacto?: string | null;
  tel?: string | null;
  email?: string | null;
  zona?: string | null;
  direccion?: string | null;
  lista?: string | null;
  estado?: string | null;
  saldo?: number | null;
  /** Cuántas compras hizo. La ficha del cliente lo muestra. */
  compras?: number | null;
  desde?: string | null;
  origen?: string | null;
}

function aCliente(c: ClienteApi): Cliente {
  return {
    id: c.id,
    nombre: c.nombre,
    doc: c.doc || "",
    contacto: c.contacto || "",
    tel: c.tel || "",
    email: c.email || "",
    zona: c.zona || "",
    direccion: c.direccion || "",
    lista: c.lista || "Mayorista",
    estado: c.estado === "Inactivo" ? "Inactivo" : "Activo",
    saldo: c.saldo ?? 0,
    compras: c.compras ?? 0,
    desde: c.desde || "",
    origen: (c.origen as Cliente["origen"]) || "Manual",
  };
}

interface ProductoApi {
  id: string;
  nombre: string;
  sku?: string | null;
  barras?: string | null;
  unidad?: string | null;
  categoria?: string | null;
  deposito?: string | null;
  costo?: number | null;
  precio?: number | null;
  iva?: string | null;
  stock?: number | null;
  minimo?: number | null;
  metodo?: string | null;
}

function aProducto(p: ProductoApi): InvProducto {
  return {
    id: p.id,
    nombre: p.nombre,
    sku: p.sku || "",
    barras: p.barras || "",
    unidad: p.unidad || "UN",
    categoria: p.categoria || "",
    deposito: p.deposito || "",
    costo: p.costo ?? 0,
    precio: p.precio ?? 0,
    iva: (p.iva as Iva) || "10%",
    stock: p.stock ?? 0,
    minimo: p.minimo ?? 0,
    metodo: (p.metodo as InvProducto["metodo"]) || "CPP",
  };
}

interface VentaApi {
  id: string;
  numero: string;
  fecha: string;
  clienteId?: string | null;
  cliente?: string | null;
  doc?: string | null;
  pago?: string | null;
  estado?: string | null;
  lineas?: {
    nombre: string;
    /** Unidades vendidas. */
    cantidad: number;
    /** Unitario, CON IVA incluido: es como se factura en Paraguay. */
    precio: number;
    iva?: string | null;
  }[];
}

function aVenta(v: VentaApi): Venta {
  return {
    id: v.id,
    iso: v.fecha,
    numero: v.numero,
    cliId: v.clienteId ?? null,
    cliente: v.cliente || "Sin nombre",
    doc: v.doc || "Sin documento",
    fecha: v.fecha,
    pago: v.pago || "",
    estado: v.estado === "Cobrada" ? "Cobrada" : "Pendiente",
    lineas: (v.lineas || []).map((l) => ({
      nombre: l.nombre,
      qty: l.cantidad,
      precio: l.precio,
      iva: (l.iva as Iva) || "10%",
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
      const filas = await request<ClienteApi[]>("/clientes", {
        query: { q: params?.q, estado: params?.estado },
      });
      return filas.map(aCliente);
    },
    async get(id) {
      const c = await request<ClienteApi | null>(`/clientes/${encodeURIComponent(id)}`);
      return c ? aCliente(c) : null;
    },
    async create(input) {
      const c = await request<ClienteApi>("/clientes", {
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
      const filas = await request<ProductoApi[]>("/productos", {
        query: { q: params?.q, filtro: params?.filtro },
      });
      return filas.map(aProducto);
    },
    async get(id) {
      const p = await request<ProductoApi | null>(`/productos/${encodeURIComponent(id)}`);
      return p ? aProducto(p) : null;
    },
    create: () => pendiente("inventario.create"),
    movimientos: () => pendiente("inventario.movimientos"),
    ajustar: () => pendiente("inventario.ajustar"),
  },

  ventas: {
    async productos(params) {
      const filas = await request<ProductoApi[]>("/productos", {
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
      const filas = await request<VentaApi[]>("/ventas", {
        query: { desde: params.desde, hasta: params.hasta, q: params.q, estado: params.estado },
      });
      return filas.map(aVenta);
    },
    async get(id) {
      const v = await request<VentaApi | null>(`/ventas/${encodeURIComponent(id)}`);
      return v ? aVenta(v) : null;
    },
    async create(input) {
      // La clave de intento viaja en la cabecera: si el teléfono pierde señal y
      // se reintenta, la API tiene que devolver la misma venta y no crear otra.
      const v = await request<VentaApi>("/ventas", {
        method: "POST",
        headers: { "Idempotency-Key": claveDeIntento() },
        body: JSON.stringify(input),
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

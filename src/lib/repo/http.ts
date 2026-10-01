/**
 * Cliente HTTP para la API real.
 *
 * ESTADO: esqueleto. Las rutas de abajo son una propuesta derivada de lo que las
 * pantallas necesitan (ver `docs/BACKEND.md`); hay que ajustarlas a los endpoints
 * reales cuando estén definidos. Cada método está sin implementar a propósito:
 * preferimos que falle con un mensaje claro antes que devolver datos inventados.
 */
import { config } from "../config";
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
      `Falta definir el endpoint real — ver docs/BACKEND.md.`,
  );
};

/**
 * Implementación real. Se completa cuando estén definidos los endpoints; hasta
 * entonces cada método avisa qué falta en vez de fallar en silencio.
 */
export const httpRepo: Repo = {
  auth: {
    login: () => pendiente("auth.login"),
    logout: () => pendiente("auth.logout"),
    sesionActual: () => pendiente("auth.sesionActual"),
    recuperarPassword: () => pendiente("auth.recuperarPassword"),
  },
  clientes: {
    list: () => pendiente("clientes.list"),
    get: () => pendiente("clientes.get"),
    create: () => pendiente("clientes.create"),
    consultarSet: () => pendiente("clientes.consultarSet"),
  },
  proveedores: {
    list: () => pendiente("proveedores.list"),
    get: () => pendiente("proveedores.get"),
    create: () => pendiente("proveedores.create"),
    deuda: () => pendiente("proveedores.deuda"),
    consultarSet: () => pendiente("proveedores.consultarSet"),
  },
  inventario: {
    list: () => pendiente("inventario.list"),
    get: () => pendiente("inventario.get"),
    create: () => pendiente("inventario.create"),
    movimientos: () => pendiente("inventario.movimientos"),
    ajustar: () => pendiente("inventario.ajustar"),
  },
  ventas: {
    productos: () => pendiente("ventas.productos"),
    list: () => pendiente("ventas.list"),
    get: () => pendiente("ventas.get"),
    create: () => pendiente("ventas.create"),
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
};

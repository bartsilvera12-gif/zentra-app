/**
 * Implementación de los puertos sobre los datos de ejemplo de `lib/data.ts`.
 *
 * Mantiene los registros creados en memoria durante la sesión (se pierden al
 * recargar), igual que el prototipo. Sirve para desarrollar y demostrar la app
 * sin backend; `http.ts` la reemplaza cuando la API esté lista.
 */
import {
  CHATS,
  CLIENTES,
  COMPRAS,
  INV,
  MOVS,
  PRODUCTOS,
  PROVEEDORES,
  VENTAS_HIST,
} from "../data";
import { ivaContenido, msgsDe, rateOf, stockDe, totalCompra } from "../calc";
import { norm } from "../format";
import { buildReport } from "../reportes";
import type { Chat, ChatMsg, Cliente, Compra, InvProducto, Movimiento, Proveedor, Venta } from "../types";
import type {
  AjusteInput,
  ClienteInput,
  CompraInput,
  ProductoInput,
  ProveedorInput,
  Repo,
  ResumenReporte,
  Sesion,
  VentaInput,
} from "./ports";

/** Latencia simulada, para que los estados de carga se vean como en producción. */
const DEMORA_MS = 120;
const demora = <T,>(v: T): Promise<T> =>
  new Promise((r) => setTimeout(() => r(v), DEMORA_MS));

/** Registros creados durante la sesión. Se pierden al recargar. */
const extra = {
  clientes: [] as Cliente[],
  proveedores: [] as Proveedor[],
  productos: [] as InvProducto[],
  movimientos: [] as Movimiento[],
  compras: [] as Compra[],
  ventas: [] as Venta[],
  mensajes: {} as Record<string, ChatMsg[]>,
  /** Ajustes de stock aplicados, por id de producto. */
  deltas: {} as Record<string, number>,
  /** Tokens de notificaciones registrados, por token. */
  dispositivos: {} as Record<string, "android" | "ios" | "web">,
};

/**
 * Devuelve el producto con el stock ya ajustado. El campo `stock` del puerto es
 * siempre el stock vigente, igual que lo devolvería un backend real: quien lo
 * consume no tiene que saber que existen ajustes aplicados aparte.
 */
const conStockVigente = (p: InvProducto): InvProducto => ({
  ...p,
  stock: stockDe(p, extra.deltas),
});

let sesion: Sesion | null = null;
let seqVenta = 148;
let seqCompra = 148;
let seqAjuste = 32;

export const mockRepo: Repo = {
  auth: {
    async login(usuario, password) {
      if (!usuario.trim() || !password.trim()) {
        throw new Error("Ingresá usuario y contraseña para continuar.");
      }
      sesion = {
        token: "mock-token",
        usuario: { id: "u1", nombre: "Ulises Gómez", rol: "VENDEDOR", empresa: "Distribuidora JM" },
      };
      return demora(sesion);
    },
    async logout() {
      sesion = null;
      await demora(null);
    },
    async sesionActual() {
      return demora(sesion);
    },
    async recuperarPassword() {
      await demora(null);
    },
    async eliminarCuenta() {
      // Sin backend no hay nada que borrar: se cierra la sesión y listo.
      sesion = null;
      await demora(null);
    },
  },

  clientes: {
    async list(params) {
      const q = norm(params?.q?.trim() ?? "");
      const todos = CLIENTES.concat(extra.clientes);
      return demora(
        todos.filter((c) => {
          if (params?.estado && c.estado !== params.estado) return false;
          return norm(c.nombre + " " + c.doc + " " + c.contacto + " " + c.email).indexOf(q) >= 0;
        }),
      );
    },
    async get(id) {
      return demora(CLIENTES.concat(extra.clientes).find((c) => c.id === id) ?? null);
    },
    async create(input: ClienteInput) {
      const nuevo: Cliente = {
        id: "n" + (extra.clientes.length + 1),
        nombre: input.nombre,
        doc: input.doc || "Sin documento",
        contacto: input.contacto || input.nombre,
        tel: input.tel || "—",
        email: input.email || "—",
        estado: "Activo",
        origen: input.origen,
        saldo: 0,
        compras: 0,
        desde: "sep 2026",
        zona: input.zona || "Sin zona",
        direccion: input.direccion || "—",
        lista: input.lista,
        credito: input.credito
          ? `Hasta ₲ ${input.credito.limite} · ${input.credito.plazoDias} días`
          : "No habilitado",
      };
      extra.clientes.push(nuevo);
      return demora(nuevo);
    },
    async consultarSet(doc) {
      const base = doc.replace(/[^0-9]/g, "").slice(0, 8);
      if (!base) return demora(null);
      return demora({ razonSocial: `COMERCIAL ${base} S.A.`, activo: true });
    },
  },

  proveedores: {
    async list(params) {
      const q = norm(params?.q?.trim() ?? "");
      const todos = extra.proveedores.concat(PROVEEDORES);
      const pendientes = extra.compras.concat(COMPRAS).filter((c) => c.estado === "Pendiente");
      const deudaDe = (id: string) =>
        pendientes.filter((c) => c.provId === id).reduce((a, c) => a + totalCompra(c), 0);
      return demora(
        todos.filter((p) => {
          if (params?.estado && p.estado !== params.estado) return false;
          if (params?.conDeuda && deudaDe(p.id) <= 0) return false;
          return norm(p.nombre + " " + p.doc + " " + p.rubro + " " + p.contacto).indexOf(q) >= 0;
        }),
      );
    },
    async get(id) {
      return demora(extra.proveedores.concat(PROVEEDORES).find((p) => p.id === id) ?? null);
    },
    async create(input: ProveedorInput) {
      const nuevo: Proveedor = {
        id: "pvn" + (extra.proveedores.length + 1),
        nombre: input.nombre,
        doc: input.doc || "Sin RUC",
        condicion: input.credito ? `Crédito ${input.credito.plazoDias} días` : "Contado",
        rubro: input.rubro || "Sin rubro",
        ciudad: input.ciudad || "Sin ciudad",
        contacto: input.contacto || input.nombre,
        tel: input.tel || "—",
        email: input.email || "—",
        estado: "Activo",
        entrega: input.entregaDias || 1,
        chatId: null,
      };
      extra.proveedores.unshift(nuevo);
      return demora(nuevo);
    },
    async deuda(id) {
      const pendientes = extra.compras.concat(COMPRAS).filter((c) => c.estado === "Pendiente");
      return demora(
        pendientes.filter((c) => c.provId === id).reduce((a, c) => a + totalCompra(c), 0),
      );
    },
    async consultarSet(doc) {
      const base = doc.replace(/[^0-9]/g, "").slice(0, 8);
      if (!base) return demora(null);
      return demora({ razonSocial: `COMERCIAL ${base} S.A.`, activo: true });
    },
  },

  inventario: {
    async list(params) {
      const q = norm(params?.q?.trim() ?? "");
      const prods = extra.productos.concat(INV);
      return demora(
        prods
          .filter((p) => {
            const st = stockDe(p, extra.deltas);
            const f = params?.filtro;
            if (f === "Bajo mínimo" && !(st > 0 && st <= p.minimo)) return false;
            if (f === "Agotados" && st > 0) return false;
            if (f === "Con stock" && st <= 0) return false;
            return norm(p.nombre + " " + p.sku + " " + p.barras).indexOf(q) >= 0;
          })
          .map(conStockVigente),
      );
    },
    async get(id) {
      const p = extra.productos.concat(INV).find((x) => x.id === id);
      return demora(p ? conStockVigente(p) : null);
    },
    async create(input: ProductoInput) {
      const id = "np" + (extra.productos.length + 1);
      const nuevo: InvProducto = {
        id,
        nombre: input.nombre,
        sku: input.sku.toUpperCase(),
        stock: input.stockInicial,
        minimo: input.minimo,
        costo: input.costo,
        precio: Math.round(input.precio),
        unidad: input.unidad,
        categoria: input.categoria || "Sin categoría",
        deposito: input.deposito || "Depósito central",
        iva: input.iva,
        metodo: input.metodo,
        barras: input.barras || "Interno " + input.sku,
      };
      extra.productos.unshift(nuevo);
      // El stock inicial queda registrado como ENTRADA, para no romper el libro.
      if (input.stockInicial > 0) {
        extra.movimientos.unshift({
          id: "nm" + (extra.movimientos.length + 1),
          prodId: id,
          tipo: "ENTRADA",
          cant: input.stockInicial,
          origen: "Inventario inicial",
          ref: "INI-0000" + extra.productos.length,
          fecha: "30 sep",
          usuario: "Ulises G.",
        });
      }
      return demora(nuevo);
    },
    async movimientos(params) {
      const todos = extra.movimientos.concat(MOVS);
      return demora(
        todos.filter((m) => {
          if (params?.prodId && m.prodId !== params.prodId) return false;
          if (params?.tipo && m.tipo !== params.tipo) return false;
          return true;
        }),
      );
    },
    async ajustar(input: AjusteInput) {
      const signo = input.tipo === "SALIDA" ? -1 : 1;
      extra.deltas[input.prodId] = (extra.deltas[input.prodId] || 0) + signo * input.cantidad;
      const mov: Movimiento = {
        id: "nm" + (extra.movimientos.length + 1),
        prodId: input.prodId,
        tipo: input.tipo,
        cant: signo * input.cantidad,
        origen: input.motivo,
        ref: "AJU-0000" + seqAjuste++,
        fecha: "30 sep",
        usuario: "Ulises G.",
      };
      extra.movimientos.unshift(mov);
      return demora(mov);
    },
  },

  ventas: {
    async productos(params) {
      const q = norm(params?.q?.trim() ?? "");
      return demora(PRODUCTOS.filter((p) => norm(p.nombre + " " + p.sku).indexOf(q) >= 0));
    },
    async list(params) {
      const q = norm(params.q?.trim() ?? "");
      const todas = extra.ventas.concat(VENTAS_HIST);
      return demora(
        todas.filter((v) => {
          if (v.iso < params.desde || v.iso > params.hasta) return false;
          if (params.estado && v.estado !== params.estado) return false;
          return norm(v.numero + " " + v.cliente + " " + v.lineas.map((l) => l.nombre).join(" ")).indexOf(q) >= 0;
        }),
      );
    },
    async get(id) {
      return demora(extra.ventas.concat(VENTAS_HIST).find((v) => v.id === id) ?? null);
    },
    async create(input: VentaInput) {
      const cli = input.clienteId
        ? CLIENTES.concat(extra.clientes).find((c) => c.id === input.clienteId)
        : null;
      const lineas = input.lineas.map((l) => {
        const p = PRODUCTOS.find((x) => x.id === l.prodId);
        return { nombre: p?.nombre ?? "—", qty: l.cantidad, precio: l.precio, iva: l.iva };
      });
      const venta: Venta = {
        id: "nv" + (extra.ventas.length + 1),
        iso: "2026-09-30",
        numero: "VTA-000" + seqVenta++,
        cliId: input.clienteId,
        cliente: cli?.nombre ?? "Sin nombre",
        doc: cli?.doc ?? "Sin documento",
        fecha: "30 sep 2026",
        pago:
          input.pago.tipo === "credito"
            ? `Crédito ${input.pago.plazoDias} días`
            : input.pago.metodo.charAt(0).toUpperCase() + input.pago.metodo.slice(1),
        // A crédito la venta queda pendiente de cobro; al contado entra la plata.
        estado: input.pago.tipo === "credito" ? "Pendiente" : "Cobrada",
        lineas,
      };
      extra.ventas.unshift(venta);
      return demora(venta);
    },
  },

  compras: {
    async list(params) {
      const q = norm(params?.q?.trim() ?? "");
      const provs = extra.proveedores.concat(PROVEEDORES);
      const nombre = (id: string | null) => provs.find((p) => p.id === id)?.nombre ?? "—";
      const todas = extra.compras.concat(COMPRAS);
      return demora(
        todas.filter((c) => {
          if (params?.estado && c.estado !== params.estado) return false;
          return norm(nombre(c.provId) + " " + c.producto + " " + c.numero).indexOf(q) >= 0;
        }),
      );
    },
    async get(id) {
      return demora(extra.compras.concat(COMPRAS).find((c) => c.id === id) ?? null);
    },
    async create(input: CompraInput) {
      const unidades = input.lineas.reduce((a, l) => a + l.cantidad, 0);
      const neto = input.lineas.reduce((a, l) => a + l.cantidad * l.costo, 0);
      const compra: Compra = {
        id: "nk" + (extra.compras.length + 1),
        numero: "COMP-000" + seqCompra++,
        provId: input.provId,
        producto: input.lineas.length === 1 ? input.lineas[0]!.nombre : `${input.lineas.length} productos`,
        lineas: input.lineas,
        cantidad: unidades,
        costo: neto / Math.max(1, unidades),
        iva: input.lineas.length === 1 ? input.lineas[0]!.iva : "Mixto",
        pago: input.pago.tipo === "credito" ? "Crédito" : "Contado",
        plazo: input.pago.tipo === "credito" ? input.pago.plazoDias : 0,
        cuotas: input.pago.tipo === "credito" ? input.pago.cuotas : 1,
        estado: input.pago.tipo === "credito" ? "Pendiente" : "Pagada",
        fecha: "30 sep 2026",
        factura: input.comprobante.numero || "—",
        timbrado: input.comprobante.timbrado || "—",
      };
      extra.compras.push(compra);
      return demora(compra);
    },
  },

  chats: {
    async list(params) {
      const q = norm(params?.q?.trim() ?? "");
      return demora(
        CHATS.filter((c) => {
          if (params?.tipo && c.tipo !== params.tipo) return false;
          if (params?.soloNoLeidas && c.noLeidos === 0) return false;
          return norm(c.nombre).indexOf(q) >= 0;
        }),
      );
    },
    async get(id) {
      const c = CHATS.find((x) => x.id === id);
      if (!c) return demora(null);
      const completo: Chat = { ...c, msgs: msgsDe(c, extra.mensajes) };
      return demora(completo);
    },
    async enviar(chatId, msg) {
      const completo: ChatMsg = { ...msg, hora: "11:42", tick: "✓" };
      extra.mensajes[chatId] = (extra.mensajes[chatId] || []).concat([completo]);
      return demora(completo);
    },
    async marcarLeido() {
      await demora(null);
    },
  },

  reportes: {
    async resumen(tab, desde, hasta): Promise<ResumenReporte> {
      // Los datos de ejemplo alimentan el mismo armado que usa el ERP, así
      // que el reporte se calcula igual en los dos lados.
      const m = buildReport(tab, desde, hasta, {
        ventas: VENTAS_HIST,
        compras: COMPRAS,
        productos: INV,
      });
      return demora({
        serie: m.buckets.map((b) => ({ fecha: b.dia, valor: b.v })),
        total: m.total,
        kpis: m.kpis.map((k) => ({ label: k.label, valor: k.valor, delta: k.delta, up: null })),
        dona: m.dona,
        ranking: m.rank.map((r) => ({ label: r.label, valor: r.v, sub: r.sub })),
        tabla: m.tabla,
      });
    },
  },

  dispositivos: {
    // Sin backend no hay a quién avisar; se guarda en memoria para que la
    // pantalla de Configuración se comporte igual que contra Supabase.
    async registrar(input) {
      extra.dispositivos[input.token] = input.plataforma;
      await demora(null);
    },
    async baja(token) {
      delete extra.dispositivos[token];
      await demora(null);
    },
  },
};

/** Utilidades que sólo usa el mock; el backend real calcula esto del lado del servidor. */
export const mockHelpers = {
  ivaContenido,
  rateOf,
  /** Ajustes de stock aplicados en esta sesión. */
  deltas: () => extra.deltas,
};

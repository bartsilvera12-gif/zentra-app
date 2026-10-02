/**
 * Lectura y escritura contra Supabase.
 *
 * Traduce entre las columnas de la base y los tipos que usan las pantallas. Ese
 * desajuste es a propósito: la base guarda el crédito en dos columnas (límite y
 * plazo) y las pantallas lo muestran como una frase; acá se arma.
 */
import { sb } from "../supabase/client";
import type {
  Chat,
  Cliente,
  Compra,
  InvProducto,
  Iva,
  Movimiento,
  Producto,
  Proveedor,
  Venta,
} from "../types";
import type {
  AjusteInput,
  ChatsRepo,
  ClienteInput,
  ClientesRepo,
  CompraInput,
  ComprasRepo,
  InventarioRepo,
  ProductoInput,
  ProveedorInput,
  ProveedoresRepo,
  ReportesRepo,
  VentaInput,
  VentasRepo,
} from "./ports";
import { AuthError } from "./supabase-auth";

/** Convierte cualquier error de PostgREST en uno con mensaje legible. */
function reventar(contexto: string, error: { message: string } | null): never {
  const m = error?.message ?? "error desconocido";
  if (m.toLowerCase().includes("schema must be one of")) {
    throw new AuthError(
      "Falta exponer el schema `zentra` en Supabase (Project Settings → Data API → Exposed schemas).",
    );
  }
  throw new AuthError(`${contexto}: ${m}`);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `2024-03-15T…` → `mar 2024`, como lo muestra la ficha del cliente. */
function desde(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Escapa las comas, que PostgREST usa como separador dentro de `or(...)`. */
function patron(q: string): string {
  return `%${q.replace(/[,()]/g, " ")}%`;
}

/** La empresa del usuario logueado. Toda escritura la necesita. */
async function empresaId(): Promise<string> {
  const { data: auth } = await sb().auth.getUser();
  if (!auth.user) throw new AuthError("No hay sesión iniciada.");
  const { data, error } = await sb()
    .from("usuarios")
    .select("empresa_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error) reventar("leyendo el perfil", error);
  if (!data) throw new AuthError("Tu cuenta no tiene perfil en esta instalación.");
  return (data as { empresa_id: string }).empresa_id;
}

/* ---------------------------------------------------------------- clientes */

interface FilaCliente {
  id: string;
  nombre: string;
  doc: string | null;
  contacto: string | null;
  tel: string | null;
  email: string | null;
  estado: Cliente["estado"];
  origen: Cliente["origen"];
  zona: string | null;
  direccion: string | null;
  lista_precios: string;
  credito_limite: number | null;
  credito_plazo_dias: number | null;
  creado_en: string;
}

function aCliente(f: FilaCliente, saldo: number, compras: number): Cliente {
  return {
    id: f.id,
    nombre: f.nombre,
    doc: f.doc || "Sin documento",
    contacto: f.contacto || f.nombre,
    tel: f.tel || "—",
    email: f.email || "—",
    estado: f.estado,
    origen: f.origen,
    saldo,
    compras,
    desde: desde(f.creado_en),
    zona: f.zona || "Sin zona",
    direccion: f.direccion || "—",
    lista: f.lista_precios,
    credito:
      f.credito_limite != null
        ? `Hasta ₲ ${f.credito_limite.toLocaleString("es-PY")} · ${f.credito_plazo_dias ?? 0} días`
        : "No habilitado",
  };
}

/**
 * Saldo y cantidad de compras por cliente, en una sola consulta en vez de una
 * por fila. El saldo es la suma de sus ventas a crédito todavía pendientes.
 */
async function resumenPorCliente(): Promise<Map<string, { saldo: number; compras: number }>> {
  const { data, error } = await sb()
    .from("ventas")
    .select("cliente_id, estado, venta_lineas(cantidad, precio)");
  if (error) reventar("calculando saldos", error);

  const mapa = new Map<string, { saldo: number; compras: number }>();
  for (const v of (data ?? []) as unknown as {
    cliente_id: string | null;
    estado: string;
    venta_lineas: { cantidad: number; precio: number }[];
  }[]) {
    if (!v.cliente_id) continue;
    const total = (v.venta_lineas ?? []).reduce((a, l) => a + l.cantidad * l.precio, 0);
    const acc = mapa.get(v.cliente_id) ?? { saldo: 0, compras: 0 };
    acc.compras += 1;
    if (v.estado === "Pendiente") acc.saldo += total;
    mapa.set(v.cliente_id, acc);
  }
  return mapa;
}

export const clientesRepo: ClientesRepo = {
  async list(params) {
    let q = sb().from("clientes").select("*").order("nombre");
    if (params?.estado) q = q.eq("estado", params.estado);
    if (params?.q?.trim()) {
      const p = patron(params.q.trim());
      q = q.or(`nombre.ilike.${p},doc.ilike.${p},contacto.ilike.${p},email.ilike.${p}`);
    }
    const { data, error } = await q;
    if (error) reventar("listando clientes", error);

    const resumen = await resumenPorCliente();
    return (data as FilaCliente[]).map((f) => {
      const r = resumen.get(f.id);
      return aCliente(f, r?.saldo ?? 0, r?.compras ?? 0);
    });
  },

  async get(id) {
    const { data, error } = await sb().from("clientes").select("*").eq("id", id).maybeSingle();
    if (error) reventar("leyendo el cliente", error);
    if (!data) return null;
    const resumen = await resumenPorCliente();
    const r = resumen.get(id);
    return aCliente(data as FilaCliente, r?.saldo ?? 0, r?.compras ?? 0);
  },

  async create(input: ClienteInput) {
    const { data, error } = await sb()
      .from("clientes")
      .insert({
        empresa_id: await empresaId(),
        nombre: input.nombre,
        doc: input.doc || null,
        contacto: input.contacto || null,
        tel: input.tel || null,
        email: input.email || null,
        origen: input.origen,
        zona: input.zona || null,
        direccion: input.direccion || null,
        lista_precios: input.lista,
        credito_limite: input.credito?.limite ?? null,
        credito_plazo_dias: input.credito?.plazoDias ?? null,
      })
      .select()
      .single();
    if (error) reventar("guardando el cliente", error);
    return aCliente(data as FilaCliente, 0, 0);
  },

  async consultarSet(doc) {
    // Pendiente: necesita el servicio real de la SET. Ver docs/BACKEND.md.
    const base = doc.replace(/[^0-9]/g, "").slice(0, 8);
    if (!base) return null;
    return { razonSocial: `COMERCIAL ${base} S.A.`, activo: true };
  },
};

/* ------------------------------------------------------------ proveedores */

interface FilaProveedor {
  id: string;
  nombre: string;
  doc: string | null;
  rubro: string | null;
  ciudad: string | null;
  contacto: string | null;
  tel: string | null;
  email: string | null;
  estado: Proveedor["estado"];
  entrega_dias: number;
  credito_plazo_dias: number | null;
}

function aProveedor(f: FilaProveedor): Proveedor {
  return {
    id: f.id,
    nombre: f.nombre,
    doc: f.doc || "Sin RUC",
    condicion: f.credito_plazo_dias ? `Crédito ${f.credito_plazo_dias} días` : "Contado",
    rubro: f.rubro || "Sin rubro",
    ciudad: f.ciudad || "Sin ciudad",
    contacto: f.contacto || f.nombre,
    tel: f.tel || "—",
    email: f.email || "—",
    estado: f.estado,
    entrega: f.entrega_dias,
    chatId: null,
  };
}

export const proveedoresRepo: ProveedoresRepo = {
  async list(params) {
    let q = sb().from("proveedores").select("*").order("nombre");
    if (params?.estado) q = q.eq("estado", params.estado);
    if (params?.q?.trim()) {
      const p = patron(params.q.trim());
      q = q.or(`nombre.ilike.${p},doc.ilike.${p},rubro.ilike.${p},contacto.ilike.${p}`);
    }
    const { data, error } = await q;
    if (error) reventar("listando proveedores", error);

    let filas = (data as FilaProveedor[]).map(aProveedor);
    if (params?.conDeuda) {
      const conDeuda = await Promise.all(
        filas.map(async (p) => ((await proveedoresRepo.deuda(p.id)) > 0 ? p.id : null)),
      );
      const ids = new Set(conDeuda.filter(Boolean) as string[]);
      filas = filas.filter((p) => ids.has(p.id));
    }
    return filas;
  },

  async get(id) {
    const { data, error } = await sb().from("proveedores").select("*").eq("id", id).maybeSingle();
    if (error) reventar("leyendo el proveedor", error);
    return data ? aProveedor(data as FilaProveedor) : null;
  },

  async create(input: ProveedorInput) {
    const { data, error } = await sb()
      .from("proveedores")
      .insert({
        empresa_id: await empresaId(),
        nombre: input.nombre,
        doc: input.doc || null,
        rubro: input.rubro || null,
        ciudad: input.ciudad || null,
        contacto: input.contacto || null,
        tel: input.tel || null,
        email: input.email || null,
        entrega_dias: input.entregaDias || 1,
        credito_plazo_dias: input.credito?.plazoDias ?? null,
      })
      .select()
      .single();
    if (error) reventar("guardando el proveedor", error);
    return aProveedor(data as FilaProveedor);
  },

  async deuda(id) {
    const { data, error } = await sb()
      .from("compras")
      .select("compra_lineas(cantidad, costo, iva)")
      .eq("proveedor_id", id)
      .eq("estado", "Pendiente");
    if (error) reventar("calculando la deuda", error);
    const tasa = (iva: string) => (iva === "10%" ? 0.1 : iva === "5%" ? 0.05 : 0);
    return (
      (data ?? []) as unknown as { compra_lineas: { cantidad: number; costo: number; iva: string }[] }[]
    ).reduce(
      (a, c) =>
        a + (c.compra_lineas ?? []).reduce((s, l) => s + l.cantidad * l.costo * (1 + tasa(l.iva)), 0),
      0,
    );
  },

  async consultarSet(doc) {
    const base = doc.replace(/[^0-9]/g, "").slice(0, 8);
    if (!base) return null;
    return { razonSocial: `COMERCIAL ${base} S.A.`, activo: true };
  },
};

/* ------------------------------------------------------------- inventario */

interface FilaProducto {
  id: string;
  nombre: string;
  sku: string;
  barras: string | null;
  stock: number;
  minimo: number;
  costo: number;
  precio: number;
  unidad: string;
  categoria: string | null;
  deposito: string | null;
  iva: InvProducto["iva"];
  metodo: InvProducto["metodo"];
}

function aProducto(f: FilaProducto): InvProducto {
  return {
    id: f.id,
    nombre: f.nombre,
    sku: f.sku,
    stock: Number(f.stock),
    minimo: Number(f.minimo),
    costo: Number(f.costo),
    precio: Number(f.precio),
    unidad: f.unidad,
    categoria: f.categoria || "Sin categoría",
    deposito: f.deposito || "Depósito central",
    iva: f.iva,
    metodo: f.metodo,
    barras: f.barras || "",
  };
}

interface FilaMovimiento {
  id: number;
  producto_id: string;
  tipo: Movimiento["tipo"];
  cantidad: number;
  origen: string;
  ref: string | null;
  creado_en: string;
}

function aMovimiento(f: FilaMovimiento, usuario: string): Movimiento {
  const d = new Date(f.creado_en);
  return {
    id: String(f.id),
    prodId: f.producto_id,
    tipo: f.tipo,
    cant: Number(f.cantidad),
    origen: f.origen,
    ref: f.ref || "",
    fecha: isNaN(d.getTime()) ? "" : `${d.getDate()} ${MESES[d.getMonth()]}`,
    usuario,
  };
}

export const inventarioRepo: InventarioRepo = {
  async list(params) {
    let q = sb().from("productos").select("*").eq("activo", true).order("nombre");
    if (params?.q?.trim()) {
      const p = patron(params.q.trim());
      q = q.or(`nombre.ilike.${p},sku.ilike.${p},barras.ilike.${p}`);
    }
    const { data, error } = await q;
    if (error) reventar("listando productos", error);

    let prods = (data as FilaProducto[]).map(aProducto);
    // Los filtros de stock se resuelven acá porque comparan dos columnas entre sí,
    // que PostgREST no expresa directamente.
    const f = params?.filtro;
    if (f === "Bajo mínimo") prods = prods.filter((p) => p.stock > 0 && p.stock <= p.minimo);
    else if (f === "Agotados") prods = prods.filter((p) => p.stock <= 0);
    else if (f === "Con stock") prods = prods.filter((p) => p.stock > 0);
    return prods;
  },

  async get(id) {
    const { data, error } = await sb().from("productos").select("*").eq("id", id).maybeSingle();
    if (error) reventar("leyendo el producto", error);
    return data ? aProducto(data as FilaProducto) : null;
  },

  async create(input: ProductoInput) {
    const emp = await empresaId();
    const { data, error } = await sb()
      .from("productos")
      .insert({
        empresa_id: emp,
        nombre: input.nombre,
        sku: input.sku,
        barras: input.barras || null,
        minimo: input.minimo,
        costo: input.costo,
        precio: input.precio,
        unidad: input.unidad,
        categoria: input.categoria || null,
        deposito: input.deposito || null,
        iva: input.iva,
        metodo: input.metodo,
      })
      .select()
      .single();
    if (error) reventar("guardando el producto", error);

    const prod = aProducto(data as FilaProducto);
    // El stock inicial entra como movimiento, no como columna: así el libro queda
    // completo y el disparador de la base lo refleja en `productos.stock`.
    if (input.stockInicial > 0) {
      const { error: e2 } = await sb().from("movimientos").insert({
        empresa_id: emp,
        producto_id: prod.id,
        tipo: "ENTRADA",
        cantidad: input.stockInicial,
        origen: "Inventario inicial",
      });
      if (e2) reventar("registrando el stock inicial", e2);
      prod.stock = input.stockInicial;
    }
    return prod;
  },

  async movimientos(params) {
    let q = sb().from("movimientos").select("*").order("creado_en", { ascending: false }).limit(200);
    if (params?.prodId) q = q.eq("producto_id", params.prodId);
    if (params?.tipo) q = q.eq("tipo", params.tipo);
    const { data, error } = await q;
    if (error) reventar("listando movimientos", error);
    return (data as FilaMovimiento[]).map((f) => aMovimiento(f, ""));
  },

  async ajustar(input: AjusteInput) {
    const signo = input.tipo === "SALIDA" ? -1 : 1;
    const emp = await empresaId();
    const { data: ref } = await sb().rpc("siguiente_numero", {
      p_empresa: emp,
      p_tipo: "ajuste",
    });
    const { data, error } = await sb()
      .from("movimientos")
      .insert({
        empresa_id: emp,
        producto_id: input.prodId,
        tipo: input.tipo,
        cantidad: signo * input.cantidad,
        origen: input.motivo,
        ref: (ref as string) ?? null,
      })
      .select()
      .single();
    if (error) reventar("registrando el ajuste", error);
    return aMovimiento(data as FilaMovimiento, "");
  },
};

/* ----------------------------------------------------------------- ventas */

interface FilaVenta {
  id: string;
  numero: string;
  cliente_id: string | null;
  cliente_texto: string;
  cliente_doc: string;
  fecha: string;
  condicion: "Contado" | "Crédito";
  metodo: string | null;
  plazo_dias: number | null;
  estado: Venta["estado"];
  venta_lineas: { nombre: string; cantidad: number; precio: number; iva: Venta["lineas"][0]["iva"] }[];
}

function aVenta(f: FilaVenta): Venta {
  const d = new Date(f.fecha + "T12:00:00");
  return {
    id: f.id,
    iso: f.fecha,
    numero: f.numero,
    cliId: f.cliente_id,
    cliente: f.cliente_texto,
    doc: f.cliente_doc,
    fecha: isNaN(d.getTime())
      ? f.fecha
      : `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`,
    pago:
      f.condicion === "Crédito"
        ? `Crédito ${f.plazo_dias ?? 0} días`
        : (f.metodo ?? "").charAt(0).toUpperCase() + (f.metodo ?? "").slice(1),
    estado: f.estado,
    lineas: (f.venta_lineas ?? []).map((l) => ({
      nombre: l.nombre,
      qty: Number(l.cantidad),
      precio: Number(l.precio),
      iva: l.iva,
    })),
  };
}

const SELECT_VENTA =
  "id, numero, cliente_id, cliente_texto, cliente_doc, fecha, condicion, metodo, plazo_dias, estado, venta_lineas(nombre, cantidad, precio, iva)";

export const ventasRepo: VentasRepo = {
  async productos(params) {
    const prods = await inventarioRepo.list({ q: params?.q, filtro: "Todos" });
    return prods.map(
      (p): Producto => ({ id: p.id, nombre: p.nombre, sku: p.sku, stock: p.stock, precio: p.precio }),
    );
  },

  async list(params) {
    let q = sb()
      .from("ventas")
      .select(SELECT_VENTA)
      .gte("fecha", params.desde)
      .lte("fecha", params.hasta)
      .order("fecha", { ascending: false });
    if (params.estado) q = q.eq("estado", params.estado);
    const { data, error } = await q;
    if (error) reventar("listando ventas", error);

    let ventas = (data as unknown as FilaVenta[]).map(aVenta);
    if (params.q?.trim()) {
      // La búsqueda incluye los nombres de las líneas, que ya vienen con la venta:
      // filtrar acá evita una consulta aparte por cada una.
      const t = params.q.trim().toLowerCase();
      ventas = ventas.filter((v) =>
        (v.numero + " " + v.cliente + " " + v.lineas.map((l) => l.nombre).join(" "))
          .toLowerCase()
          .includes(t),
      );
    }
    return ventas;
  },

  async get(id) {
    const { data, error } = await sb().from("ventas").select(SELECT_VENTA).eq("id", id).maybeSingle();
    if (error) reventar("leyendo la venta", error);
    return data ? aVenta(data as unknown as FilaVenta) : null;
  },

  async create(input: VentaInput) {
    const emp = await empresaId();

    let cliNombre = "Sin nombre";
    let cliDoc = "Sin documento";
    if (input.clienteId) {
      const c = await clientesRepo.get(input.clienteId);
      if (c) {
        cliNombre = c.nombre;
        cliDoc = c.doc;
      }
    }

    const { data: numero, error: eNum } = await sb().rpc("siguiente_numero", {
      p_empresa: emp,
      p_tipo: "venta",
    });
    if (eNum) reventar("asignando el número de venta", eNum);

    const { data: venta, error } = await sb()
      .from("ventas")
      .insert({
        empresa_id: emp,
        numero: numero as string,
        cliente_id: input.clienteId,
        cliente_texto: cliNombre,
        cliente_doc: cliDoc,
        condicion: input.pago.tipo === "credito" ? "Crédito" : "Contado",
        metodo: input.pago.tipo === "contado" ? input.pago.metodo : null,
        plazo_dias: input.pago.tipo === "credito" ? input.pago.plazoDias : null,
        // Contado cobra ahora; crédito queda pendiente de cobro.
        estado: input.pago.tipo === "credito" ? "Pendiente" : "Cobrada",
        moneda: input.moneda,
      })
      .select("id")
      .single();
    if (error) reventar("registrando la venta", error);

    const ventaId = (venta as { id: string }).id;
    const nombres = new Map((await ventasRepo.productos()).map((p) => [p.id, p.nombre]));

    const { error: eLineas } = await sb().from("venta_lineas").insert(
      input.lineas.map((l) => ({
        venta_id: ventaId,
        producto_id: l.prodId,
        nombre: nombres.get(l.prodId) ?? "",
        cantidad: l.cantidad,
        precio: l.precio,
        iva: l.iva,
      })),
    );
    if (eLineas) reventar("guardando las líneas de la venta", eLineas);

    // La venta descuenta stock: un movimiento de SALIDA por línea.
    const { error: eMovs } = await sb().from("movimientos").insert(
      input.lineas.map((l) => ({
        empresa_id: emp,
        producto_id: l.prodId,
        tipo: "SALIDA",
        cantidad: -l.cantidad,
        origen: "Venta",
        ref: numero as string,
      })),
    );
    if (eMovs) reventar("descontando el stock", eMovs);

    const creada = await ventasRepo.get(ventaId);
    if (!creada) throw new AuthError("La venta se registró pero no se pudo leer de vuelta.");
    return creada;
  },
};

/* ---------------------------------------------------------------- compras */

interface FilaCompra {
  id: string;
  numero: string;
  proveedor_id: string | null;
  fecha: string;
  condicion: "Contado" | "Crédito";
  plazo_dias: number | null;
  cuotas: number;
  estado: Compra["estado"];
  factura: string | null;
  timbrado: string | null;
  compra_lineas: {
    producto_id: string | null;
    nombre: string;
    unidad: string;
    cantidad: number;
    costo: number;
    iva: Compra["iva"];
  }[];
}

function aCompra(f: FilaCompra): Compra {
  const lineas = (f.compra_lineas ?? []).map((l) => ({
    prodId: l.producto_id ?? "",
    nombre: l.nombre,
    unidad: l.unidad,
    cantidad: Number(l.cantidad),
    costo: Number(l.costo),
    iva: l.iva as Iva,
  }));
  const unidades = lineas.reduce((a, l) => a + l.cantidad, 0);
  const neto = lineas.reduce((a, l) => a + l.cantidad * l.costo, 0);
  const d = new Date(f.fecha + "T12:00:00");
  return {
    id: f.id,
    numero: f.numero,
    provId: f.proveedor_id,
    producto: lineas.length === 1 ? lineas[0]!.nombre : `${lineas.length} productos`,
    cantidad: unidades,
    costo: unidades > 0 ? neto / unidades : 0,
    iva: lineas.length === 1 ? lineas[0]!.iva : "Mixto",
    pago: f.condicion,
    plazo: f.plazo_dias ?? 0,
    cuotas: f.cuotas,
    estado: f.estado,
    fecha: isNaN(d.getTime())
      ? f.fecha
      : `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`,
    factura: f.factura || "—",
    timbrado: f.timbrado || "—",
    lineas,
  };
}

const SELECT_COMPRA =
  "id, numero, proveedor_id, fecha, condicion, plazo_dias, cuotas, estado, factura, timbrado, compra_lineas(producto_id, nombre, unidad, cantidad, costo, iva)";

export const comprasRepo: ComprasRepo = {
  async list(params) {
    let q = sb().from("compras").select(SELECT_COMPRA).order("fecha", { ascending: false });
    if (params?.estado) q = q.eq("estado", params.estado);
    const { data, error } = await q;
    if (error) reventar("listando compras", error);

    let compras = (data as unknown as FilaCompra[]).map(aCompra);
    if (params?.q?.trim()) {
      const t = params.q.trim().toLowerCase();
      compras = compras.filter((c) => (c.numero + " " + c.producto).toLowerCase().includes(t));
    }
    return compras;
  },

  async get(id) {
    const { data, error } = await sb()
      .from("compras")
      .select(SELECT_COMPRA)
      .eq("id", id)
      .maybeSingle();
    if (error) reventar("leyendo la compra", error);
    return data ? aCompra(data as unknown as FilaCompra) : null;
  },

  async create(input: CompraInput) {
    const emp = await empresaId();
    const { data: numero, error: eNum } = await sb().rpc("siguiente_numero", {
      p_empresa: emp,
      p_tipo: "compra",
    });
    if (eNum) reventar("asignando el número de compra", eNum);

    const { data: compra, error } = await sb()
      .from("compras")
      .insert({
        empresa_id: emp,
        numero: numero as string,
        proveedor_id: input.provId,
        condicion: input.pago.tipo === "credito" ? "Crédito" : "Contado",
        plazo_dias: input.pago.tipo === "credito" ? input.pago.plazoDias : null,
        cuotas: input.pago.tipo === "credito" ? input.pago.cuotas : 1,
        estado: input.pago.tipo === "credito" ? "Pendiente" : "Pagada",
        factura: input.comprobante.numero || null,
        timbrado: input.comprobante.timbrado || null,
        moneda: input.moneda,
        tipo_cambio: input.moneda === "USD" ? (input.tipoCambio ?? null) : null,
      })
      .select("id")
      .single();
    if (error) reventar("registrando la compra", error);

    const compraId = (compra as { id: string }).id;
    const { error: eLineas } = await sb().from("compra_lineas").insert(
      input.lineas.map((l) => ({
        compra_id: compraId,
        producto_id: l.prodId || null,
        nombre: l.nombre,
        unidad: l.unidad,
        cantidad: l.cantidad,
        costo: l.costo,
        iva: l.iva,
      })),
    );
    if (eLineas) reventar("guardando las líneas de la compra", eLineas);

    // La compra suma stock.
    const conProducto = input.lineas.filter((l) => l.prodId);
    if (conProducto.length > 0) {
      const { error: eMovs } = await sb().from("movimientos").insert(
        conProducto.map((l) => ({
          empresa_id: emp,
          producto_id: l.prodId,
          tipo: "ENTRADA",
          cantidad: l.cantidad,
          origen: "Compra",
          ref: numero as string,
        })),
      );
      if (eMovs) reventar("sumando el stock", eMovs);
    }

    const creada = await comprasRepo.get(compraId);
    if (!creada) throw new AuthError("La compra se registró pero no se pudo leer de vuelta.");
    return creada;
  },
};

/* --------------------------------------------------- conversaciones (falta) */

const noImplementado = (): never => {
  throw new AuthError(
    "Las conversaciones todavía no están conectadas. Falta definir si salen de WhatsApp Business API; ver docs/BACKEND.md.",
  );
};

export const chatsRepo: ChatsRepo = {
  async list(): Promise<Chat[]> {
    return [];
  },
  async get() {
    return null;
  },
  enviar: noImplementado,
  marcarLeido: async () => {},
};

/* -------------------------------------------------------------- reportes */

export const reportesRepo: ReportesRepo = {
  async resumen() {
    // Pendiente: conviene que lo agregue Postgres, no el celular. Ver docs/BACKEND.md.
    throw new AuthError(
      "Los reportes todavía no están conectados: falta la agregación del lado del servidor.",
    );
  },
};

/**
 * Armado de los reportes, con datos del ERP.
 *
 * Antes sólo las ventas eran reales. Inventario y compras se proyectaban de una
 * serie semanal inventada y se escalaban para que el total "quedara creíble" en
 * cualquier rango: números verosímiles y falsos, que es la peor clase, porque
 * nadie los sospecha. Ahora los tres salen de lo que devuelve el ERP, y el
 * escalado se fue: lo que no se puede calcular, no se muestra.
 *
 * Hay una diferencia de fondo entre las solapas. Ventas y compras son hechos
 * con fecha, así que tienen serie en el tiempo. **El inventario es una foto de
 * ahora**: no existe el stock "del martes pasado" para consultar. Por eso su
 * gráfico muestra los productos de mayor valuación en vez de días, y el rango
 * de fechas no lo afecta — y la pantalla lo aclara, para que nadie lea esos
 * números como si fueran del período elegido.
 */
import { REP } from "./data";
import { neto, totalVenta } from "./calc";
import { diaMes, gs, isoOf } from "./format";
import type { Compra, DonaItem, InvProducto, Iva, RepCfg, RepTab, Venta } from "./types";

/** Lo que el ERP devolvió, ya cargado por la pantalla. */
export interface DatosReporte {
  ventas: Venta[];
  compras: Compra[];
  productos: InvProducto[];
}

export interface Kpi {
  label: string;
  valor: string;
  delta: string;
}

export interface Bucket {
  v: number;
  /** La etiqueta del eje: un día, o un nombre de producto en inventario. */
  dia: string;
}

export interface ReportModel {
  cfg: RepCfg;
  dias: number;
  total: number;
  buckets: Bucket[];
  max: number;
  kpis: Kpi[];
  dona: DonaItem[];
  donaValor: string;
  donaSub: string;
  rank: { label: string; v: number; sub: string }[];
  rankMax: number;
  tabla: { k: string; sub: string; v: string }[];
  acento: string;
  acentoSuave: string;
  conic: string;
  facturas: number;
  /** El inventario es una foto: su gráfico no depende del rango de fechas. */
  esFoto: boolean;
  /** Qué mide el eje del gráfico, para rotularlo sin que se preste a confusión. */
  serieNota: string;
}

const VACIO = "—";

/** Los días del rango, como fechas. */
function fechasDe(desde: string, hasta: string): { fechas: Date[]; dias: number } {
  const d0 = new Date(desde + "T12:00:00");
  const d1 = new Date(hasta + "T12:00:00");
  const crudo =
    isNaN(d0.getTime()) || isNaN(d1.getTime())
      ? 7
      : Math.round((d1.getTime() - d0.getTime()) / 86400000) + 1;
  const dias = Math.max(1, Math.min(400, crudo));
  const fechas: Date[] = [];
  for (let i = 0; i < dias; i++) fechas.push(new Date(d0.getTime() + i * 86400000));
  return { fechas, dias };
}

/** Hasta 10 días va una barra por día; más largo se junta en 7 tramos. */
function aBuckets(fechas: Date[], valores: number[]): Bucket[] {
  if (fechas.length <= 10) return fechas.map((d, i) => ({ v: valores[i] ?? 0, dia: diaMes(d) }));
  const tam = Math.ceil(fechas.length / 7);
  const out: Bucket[] = [];
  for (let i = 0; i < fechas.length; i += tam) {
    out.push({
      v: valores.slice(i, i + tam).reduce((a, b) => a + b, 0),
      dia: diaMes(fechas[i]!),
    });
  }
  return out;
}

const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0);

/** El total de una compra: cantidad por costo unitario. */
const totalCompra = (c: Compra) => c.cantidad * c.costo;

/** Nombre corto para que entre bajo una barra. */
const corto = (s: string, n = 10) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function buildReport(
  tab: RepTab,
  desde: string,
  hasta: string,
  datos: DatosReporte = { ventas: [], compras: [], productos: [] },
): ReportModel {
  const cfg = REP[tab];
  const { fechas, dias } = fechasDe(desde, hasta);
  const acento = tab === "compras" ? "#96731A" : tab === "inventario" ? "#1C8C84" : "#023047";
  const acentoSuave = tab === "compras" ? "#E5C77A" : tab === "inventario" ? "#8ED3C6" : "#8ECAE6";

  const armado =
    tab === "ventas"
      ? deVentas(datos.ventas, desde, hasta, fechas)
      : tab === "compras"
        ? deCompras(datos.compras, desde, hasta, fechas)
        : deInventario(datos.productos);

  const rankMax = Math.max(...armado.rank.map((r) => r.v), 1);
  const max = Math.max(...armado.buckets.map((b) => b.v), 1);

  let acum = 0;
  const conic = armado.dona.length
    ? "conic-gradient(" +
      armado.dona
        .map((d) => {
          const ini = acum;
          acum += d.pct;
          return `${d.color} ${ini}% ${acum}%`;
        })
        .join(", ") +
      ")"
    : // Sin datos, un anillo gris: un gráfico lleno de colores sobre cero
      // inventa una composición que no existe.
      "conic-gradient(rgba(128,128,128,.18) 0 100%)";

  return {
    cfg,
    dias,
    max,
    rankMax,
    acento,
    acentoSuave,
    conic,
    ...armado,
  };
}

/* ---------- ventas ---------- */

function deVentas(ventas: Venta[], desde: string, hasta: string, fechas: Date[]) {
  const enRango = ventas.filter((v) => v.iso >= desde && v.iso <= hasta);
  const porDia = new Map<string, number>();
  for (const v of enRango) porDia.set(v.iso, (porDia.get(v.iso) ?? 0) + totalVenta(v));
  const valores = fechas.map((d) => porDia.get(isoOf(d)) ?? 0);
  const total = valores.reduce((a, b) => a + b, 0);
  const facturas = enRango.length;

  const cobradas = enRango.filter((v) => v.estado === "Cobrada").reduce((a, v) => a + totalVenta(v), 0);
  const pendientes = total - cobradas;

  const mapa = new Map<string, { v: number; un: number }>();
  for (const v of enRango) {
    for (const l of v.lineas) {
      const a = mapa.get(l.nombre) ?? { v: 0, un: 0 };
      a.v += l.qty * l.precio;
      a.un += l.qty;
      mapa.set(l.nombre, a);
    }
  }
  const rank = [...mapa.entries()]
    .sort((a, b) => b[1].v - a[1].v)
    .slice(0, 5)
    .map(([label, r]) => ({ label, v: r.v, sub: `${r.un} un. · ${pct(r.v, total)}% del total` }));

  const bases: Record<Iva, number> = { "10%": 0, "5%": 0, Exenta: 0 };
  for (const v of enRango) {
    for (const l of v.lineas) {
      const k: Iva = bases[l.iva] === undefined ? "Exenta" : l.iva;
      bases[k] += l.qty * l.precio;
    }
  }

  return {
    total,
    facturas,
    esFoto: false,
    serieNota: "Un punto por día del período elegido.",
    buckets: aBuckets(fechas, valores),
    kpis: [
      { label: "Facturado", valor: total ? gs(total) : VACIO, delta: `${facturas} en el período` },
      {
        label: "Ticket promedio",
        valor: facturas > 0 ? gs(total / facturas) : VACIO,
        delta: `${facturas} ${facturas === 1 ? "factura emitida" : "facturas emitidas"}`,
      },
    ],
    dona: total
      ? ([
          { label: "Cobrado", pct: pct(cobradas, total), color: "#023047" },
          { label: "Por cobrar", pct: pct(pendientes, total), color: "#FFB701" },
        ].filter((d) => d.pct > 0) as DonaItem[])
      : [],
    donaValor: total ? `${pct(cobradas, total)}%` : VACIO,
    donaSub: "COBRADO",
    rank,
    tabla: [
      { k: "Gravado 10%", sub: "Base imponible", v: gs(neto(bases["10%"], 0.1)) },
      { k: "IVA 10%", sub: "Débito fiscal", v: gs(bases["10%"] - neto(bases["10%"], 0.1)) },
      { k: "Gravado 5%", sub: "Base imponible", v: gs(neto(bases["5%"], 0.05)) },
      { k: "IVA 5%", sub: "Débito fiscal", v: gs(bases["5%"] - neto(bases["5%"], 0.05)) },
      { k: "Exentas", sub: "Sin IVA", v: gs(bases.Exenta) },
    ],
  };
}

/* ---------- compras ---------- */

function deCompras(compras: Compra[], desde: string, hasta: string, fechas: Date[]) {
  const enRango = compras.filter((c) => c.fecha >= desde && c.fecha <= hasta);
  const porDia = new Map<string, number>();
  for (const c of enRango) porDia.set(c.fecha, (porDia.get(c.fecha) ?? 0) + totalCompra(c));
  const valores = fechas.map((d) => porDia.get(isoOf(d)) ?? 0);
  const total = valores.reduce((a, b) => a + b, 0);

  const pendientes = enRango.filter((c) => c.estado === "Pendiente");
  const porPagar = pendientes.reduce((a, c) => a + totalCompra(c), 0);
  const contado = enRango.filter((c) => c.pago === "Contado").reduce((a, c) => a + totalCompra(c), 0);

  const mapa = new Map<string, { v: number; un: number }>();
  for (const c of enRango) {
    const a = mapa.get(c.producto) ?? { v: 0, un: 0 };
    a.v += totalCompra(c);
    a.un += c.cantidad;
    mapa.set(c.producto, a);
  }
  const rank = [...mapa.entries()]
    .sort((a, b) => b[1].v - a[1].v)
    .slice(0, 5)
    .map(([label, r]) => ({ label, v: r.v, sub: `${r.un} un. · ${pct(r.v, total)}% del total` }));

  return {
    total,
    facturas: enRango.length,
    esFoto: false,
    serieNota: "Un punto por día del período elegido.",
    buckets: aBuckets(fechas, valores),
    kpis: [
      { label: "Comprado", valor: total ? gs(total) : VACIO, delta: `${enRango.length} en el período` },
      {
        label: "Por pagar",
        valor: porPagar ? gs(porPagar) : VACIO,
        delta: `${pendientes.length} ${pendientes.length === 1 ? "compra pendiente" : "compras pendientes"}`,
      },
    ],
    dona: total
      ? ([
          { label: "Contado", pct: pct(contado, total), color: "#96731A" },
          { label: "Crédito", pct: pct(total - contado, total), color: "#E5C77A" },
        ].filter((d) => d.pct > 0) as DonaItem[])
      : [],
    donaValor: total ? `${pct(contado, total)}%` : VACIO,
    donaSub: "CONTADO",
    rank,
    tabla: [
      { k: "Compras del período", sub: "Cantidad", v: String(enRango.length) },
      { k: "Pagadas", sub: "Cantidad", v: String(enRango.length - pendientes.length) },
      { k: "Pendientes", sub: "Cantidad", v: String(pendientes.length) },
      { k: "Por pagar", sub: "Saldo", v: gs(porPagar) },
    ],
  };
}

/* ---------- inventario ---------- */

function deInventario(productos: InvProducto[]) {
  const valuacion = productos.reduce((a, p) => a + p.stock * p.costo, 0);
  const agotados = productos.filter((p) => p.stock <= 0);
  // "Bajo mínimo" es que le queda poco, no que no le queda: un agotado ya se
  // cuenta aparte, y sumarlo en los dos lados abulta el problema.
  const bajos = productos.filter((p) => p.stock > 0 && p.minimo > 0 && p.stock <= p.minimo);
  const normales = productos.length - agotados.length - bajos.length;

  const porValor = [...productos]
    .map((p) => ({ label: p.nombre, v: p.stock * p.costo, un: p.stock, unidad: p.unidad }))
    .sort((a, b) => b.v - a.v);

  return {
    total: valuacion,
    facturas: productos.length,
    // Una foto: no hay stock "del martes pasado" que consultar.
    esFoto: true,
    serieNota: "Los productos de mayor valuación, hoy. No depende del período.",
    buckets: porValor.slice(0, 7).map((p) => ({ v: p.v, dia: corto(p.label) })),
    kpis: [
      { label: "Valuación", valor: productos.length ? gs(valuacion) : VACIO, delta: `${productos.length} productos` },
      {
        label: "Bajo mínimo",
        valor: productos.length ? String(bajos.length) : VACIO,
        delta: `${agotados.length} ${agotados.length === 1 ? "agotado" : "agotados"}`,
      },
    ],
    dona: productos.length
      ? ([
          { label: "Normal", pct: pct(normales, productos.length), color: "#1C8C84" },
          { label: "Bajo mínimo", pct: pct(bajos.length, productos.length), color: "#FFB701" },
          { label: "Agotados", pct: pct(agotados.length, productos.length), color: "#FC8500" },
        ].filter((d) => d.pct > 0) as DonaItem[])
      : [],
    donaValor: productos.length ? `${pct(normales, productos.length)}%` : VACIO,
    donaSub: "EN NORMAL",
    rank: porValor.slice(0, 5).map((p) => ({
      label: p.label,
      v: p.v,
      sub: `${p.un} ${p.unidad} · ${pct(p.v, valuacion)}% de la valuación`,
    })),
    tabla: [
      { k: "Productos", sub: "Cantidad", v: String(productos.length) },
      { k: "Bajo mínimo", sub: "Cantidad", v: String(bajos.length) },
      { k: "Agotados", sub: "Cantidad", v: String(agotados.length) },
      { k: "Valuación", sub: "Stock × costo", v: gs(valuacion) },
    ],
  };
}

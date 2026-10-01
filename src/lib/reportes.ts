/**
 * Report aggregation. Sales figures are real (summed from VENTAS_HIST over the
 * selected range); inventory and purchases are projected from a weekly base
 * series, then scaled so the totals stay plausible for any range the user picks.
 */
import { REP, REP_SERIES, VENTAS_HIST } from "./data";
import { neto, totalVenta } from "./calc";
import { diaMes, gs, isoOf } from "./format";
import type { Iva, RepCfg, RepKpi, RepTab, Venta } from "./types";

export interface Bucket {
  v: number;
  dia: string;
}

export interface ReportModel {
  cfg: RepCfg;
  dias: number;
  enRango: Venta[];
  total: number;
  buckets: Bucket[];
  max: number;
  /** Scale factor between the selected range and the reference period. */
  factor: number;
  esc: (n: number) => number;
  rank: { label: string; v: number; sub: string }[];
  rankMax: number;
  tabla: { k: string; sub: string; v: string }[];
  acento: string;
  acentoSuave: string;
  conic: string;
  facturas: number;
}

/** Deterministic daily value derived from the weekday base plus a date seed. */
function diario(d: Date, base: number[]): number {
  const dow = d.getDay();
  const semilla = (d.getDate() * 37 + (d.getMonth() + 1) * 101) % 29;
  const v = base[dow === 0 ? 6 : dow - 1]!;
  return Math.round(v * (0.78 + semilla / 64));
}

function soloDigitos(txt: string): number {
  return Number(String(txt).replace(/[^0-9]/g, "")) || 0;
}

export function buildReport(tab: RepTab, desde: string, hasta: string): ReportModel {
  const cfg = REP[tab];
  const d0 = new Date(desde + "T12:00:00");
  const d1 = new Date(hasta + "T12:00:00");
  const diasRaw = isNaN(d0.getTime()) || isNaN(d1.getTime())
    ? 7
    : Math.round((d1.getTime() - d0.getTime()) / 86400000) + 1;
  const dias = Math.max(1, Math.min(400, diasRaw));

  const fechas: Date[] = [];
  for (let i = 0; i < dias; i++) fechas.push(new Date(d0.getTime() + i * 86400000));

  const base = REP_SERIES[tab];
  const enRango = VENTAS_HIST.filter((v) => v.iso >= desde && v.iso <= hasta);

  const ventasDia = (d: Date) => {
    const k = isoOf(d);
    return VENTAS_HIST.filter((v) => v.iso === k).reduce((a, v) => a + totalVenta(v), 0);
  };

  const valores = tab === "ventas" ? fechas.map(ventasDia) : fechas.map((d) => diario(d, base));
  const total = valores.reduce((a, b) => a + b, 0);

  // Up to 10 days shows one bar per day; longer ranges collapse into 7 buckets.
  const buckets: Bucket[] = (() => {
    if (dias <= 10) return fechas.map((d, i) => ({ v: valores[i]!, dia: diaMes(d) }));
    const n = 7;
    const tam = Math.ceil(dias / n);
    const out: Bucket[] = [];
    for (let i = 0; i < dias; i += tam) {
      const trozo = valores.slice(i, i + tam);
      out.push({ v: trozo.reduce((a, b) => a + b, 0), dia: diaMes(fechas[i]!) });
    }
    return out;
  })();

  const max = Math.max(...buckets.map((b) => b.v), 1);

  const refTotal =
    (tab === "ventas"
      ? VENTAS_HIST.reduce((a, v) => a + totalVenta(v), 0)
      : base.reduce((a, b) => a + b, 0)) || 1;
  const factor = total / refTotal;
  const esc = (n: number) => Math.round(n * factor);

  // Sales ranking is computed from the actual lines in range; the others scale.
  const rankVentas = (() => {
    const mapa: Record<string, { label: string; v: number; un: number }> = {};
    enRango.forEach((v) =>
      v.lineas.forEach((l) => {
        mapa[l.nombre] ??= { label: l.nombre, v: 0, un: 0 };
        mapa[l.nombre]!.v += l.qty * l.precio;
        mapa[l.nombre]!.un += l.qty;
      }),
    );
    return Object.values(mapa)
      .sort((a, b) => b.v - a.v)
      .slice(0, 5)
      .map((r) => ({
        label: r.label,
        v: r.v,
        sub: `${r.un} un. · ${total > 0 ? Math.round((r.v / total) * 100) : 0}% del total`,
      }));
  })();

  const rank =
    tab === "ventas" ? rankVentas : cfg.rank.map((r) => ({ label: r.label, sub: r.sub, v: esc(r.v) }));
  const rankMax = Math.max(...rank.map((r) => r.v), 1);

  const tablaVentas = (() => {
    const bases: Record<Iva, number> = { "10%": 0, "5%": 0, Exenta: 0 };
    enRango.forEach((v) =>
      v.lineas.forEach((l) => {
        const key: Iva = bases[l.iva] === undefined ? "Exenta" : l.iva;
        bases[key] += l.qty * l.precio;
      }),
    );
    return [
      { k: "Gravado 10%", sub: "Base imponible", v: gs(neto(bases["10%"], 0.1)) },
      { k: "IVA 10%", sub: "Débito fiscal", v: gs(bases["10%"] - neto(bases["10%"], 0.1)) },
      { k: "Gravado 5%", sub: "Base imponible", v: gs(neto(bases["5%"], 0.05)) },
      { k: "IVA 5%", sub: "Débito fiscal", v: gs(bases["5%"] - neto(bases["5%"], 0.05)) },
      { k: "Exentas", sub: "Sin IVA", v: gs(bases.Exenta) },
    ];
  })();

  const acento = tab === "compras" ? "#96731A" : tab === "inventario" ? "#1C8C84" : "#023047";
  const acentoSuave = tab === "compras" ? "#E5C77A" : tab === "inventario" ? "#8ED3C6" : "#8ECAE6";

  let acum = 0;
  const conic =
    "conic-gradient(" +
    cfg.donaItems
      .map((d) => {
        const ini = acum;
        acum += d.pct;
        return `${d.color} ${ini}% ${acum}%`;
      })
      .join(", ") +
    ")";

  return {
    cfg,
    dias,
    enRango,
    total,
    buckets,
    max,
    factor,
    esc,
    rank,
    rankMax,
    tabla: tab === "ventas" ? tablaVentas : [],
    acento,
    acentoSuave,
    conic,
    facturas: enRango.length,
  };
}

/** KPI value, with sales figures recomputed and the rest scaled to the range. */
export function kpiValor(k: RepKpi, tab: RepTab, m: ReportModel): string {
  if (tab === "inventario" && k.label !== "Valuación") return k.valor;
  if (k.label === "Facturado") return gs(m.total);
  if (k.label === "Ticket promedio") return m.facturas > 0 ? gs(m.total / m.facturas) : "—";
  return gs(m.esc(soloDigitos(k.valor)));
}

export function kpiDelta(k: RepKpi, m: ReportModel): string {
  if (k.label === "Ticket promedio") {
    return `${m.facturas} ${m.facturas === 1 ? "factura emitida" : "facturas emitidas"}`;
  }
  if (k.label === "Por pagar") {
    const n = Math.max(1, Math.round(2 * m.factor));
    return `${n} ${n === 1 ? "factura a crédito" : "facturas a crédito"}`;
  }
  return k.delta;
}

/** Scale a table figure that is an amount; pass through anything else (ratios, counts). */
export function tablaValor(v: string, m: ReportModel): string {
  return String(v).indexOf("₲") === 0 ? gs(m.esc(soloDigitos(v))) : v;
}

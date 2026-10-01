/**
 * Business rules shared by the screens. The key one: IVA is *contained* in the
 * price, so tax is `bruto × r / (1 + r)` and never `bruto × r`.
 */
import { IVA_RATE } from "./data";
import type { Chat, ChatMsg, Compra, InvProducto, Venta } from "./types";

export function rateOf(iva: string): number {
  return IVA_RATE[iva] ?? 0;
}

/** Tax contained in a gross amount at the given rate. */
export function ivaContenido(bruto: number, rate: number): number {
  return (bruto * rate) / (1 + rate);
}

/** Net (taxable base) of a gross amount at the given rate. */
export function neto(bruto: number, rate: number): number {
  return bruto / (1 + rate);
}

/* ---------- ventas ---------- */

export function totalVenta(v: Venta): number {
  return v.lineas.reduce((a, l) => a + l.qty * l.precio, 0);
}

export function ivaVenta(v: Venta): number {
  return v.lineas.reduce((a, l) => a + ivaContenido(l.qty * l.precio, rateOf(l.iva)), 0);
}

/** One-line summary of a sale's contents, as the list rows show it. */
export function detalleVenta(v: Venta): string {
  if (v.lineas.length === 1) {
    const l = v.lineas[0]!;
    return `${l.qty} × ${l.nombre}`;
  }
  const un = v.lineas.reduce((a, l) => a + l.qty, 0);
  return `${v.lineas.length} productos · ${un} un.`;
}

/* ---------- compras ---------- */

/**
 * Purchase totals add IVA on top of cost, because supplier costs are quoted net.
 * Multi-line purchases sum their lines; legacy single-product rows use the flat fields.
 */
export function totalCompra(c: Compra): number {
  if (c.lineas) {
    return c.lineas.reduce((a, l) => a + l.cantidad * l.costo * (1 + rateOf(l.iva)), 0);
  }
  return c.cantidad * c.costo * (1 + rateOf(String(c.iva)));
}

export function lineasDeCompra(c: Compra) {
  return (
    c.lineas ?? [
      { nombre: c.producto, cantidad: c.cantidad, costo: c.costo, iva: c.iva as never, prodId: "", unidad: "un." },
    ]
  );
}

/* ---------- inventario ---------- */

/** Stock after manual adjustments recorded in this session. */
export function stockDe(p: InvProducto, delta: Record<string, number>): number {
  return (p.stock || 0) + (delta[p.id] || 0);
}

export function margenPct(costo: number, precio: number): number {
  if (precio <= 0) return 0;
  return Math.round((1 - costo / precio) * 100);
}

/* ---------- conversaciones ---------- */

/** A chat's messages, including anything sent during this session. */
export function msgsDe(c: Chat, enviados: Record<string, ChatMsg[]>): ChatMsg[] {
  const extra = enviados[c.id];
  return extra ? c.msgs.concat(extra) : c.msgs;
}

export function noLeidosDe(c: Chat, leidos: Record<string, boolean>): number {
  return leidos[c.id] ? 0 : c.noLeidos;
}

/** Preview line for the chat list: prefixes "Vos:" on your own last message. */
export function ultimoDe(c: Chat, enviados: Record<string, ChatMsg[]>): string {
  const arr = msgsDe(c, enviados);
  const last = arr[arr.length - 1];
  if (!last) return "";
  const cuerpo = last.sticker
    ? "Sticker"
    : last.audio
      ? `♪ Nota de voz (${last.audio})`
      : last.archivo
        ? `📎 ${last.archivo.nombre}`
        : (last.texto ?? "");
  return (last.de === "yo" ? "Vos: " : "") + cuerpo;
}

/** Deterministic pseudo-waveform for voice notes, so it renders identically every time. */
export function ondaArr(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(5 + ((i * 7 + 3) % 13));
  return out;
}

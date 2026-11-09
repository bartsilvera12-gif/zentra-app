/**
 * Lo que hace falta saber de un presupuesto para mostrarlo y mandarlo.
 *
 * Está fuera de la pantalla para poder probarlo sin pantalla: qué estado se
 * muestra, cuánto suma y qué texto le llega al cliente por WhatsApp son las
 * tres cosas que, si salen mal, salen mal delante del cliente.
 */
import { gs } from "./format";
import { fechaVencida } from "./planes";
import type { EstadoPresupuesto, Presupuesto } from "./types";

/** Lo que se muestra, que es lo guardado más "vencido". */
export type EstadoVisible = EstadoPresupuesto | "vencido";

/**
 * El estado que se ve.
 *
 * "Vencido" no se guarda: es un pendiente cuya validez ya pasó. Se calcula
 * con la misma regla que el vencimiento de los planes —el último día todavía
 * vale— para que "válido hasta el 15" quiera decir lo mismo en toda la app.
 * Un aceptado no vence: el cliente ya dijo que sí a ese precio.
 */
export function estadoVisible(p: Pick<Presupuesto, "estado" | "validoHasta">, ahora?: Date): EstadoVisible {
  if (p.estado === "pendiente" && fechaVencida(p.validoHasta, ahora)) return "vencido";
  return p.estado;
}

/** El rótulo de cada estado, como se lee en la lista. */
export const ROTULO_ESTADO: Record<EstadoVisible, string> = {
  pendiente: "Pendiente",
  aceptado: "Aceptado",
  rechazado: "Rechazado",
  convertido: "Vendido",
  vencido: "Vencido",
};

/** Lo que suma, con IVA incluido —los precios ya lo traen—. */
export function totalPresupuesto(p: Pick<Presupuesto, "lineas">): number {
  return p.lineas.reduce((a, l) => a + l.precio * l.qty, 0);
}

/** Las opciones de validez que se ofrecen al armarlo, en días. */
export const VALIDECES = [7, 15, 30] as const;

/** `2026-11-15` → `15/11/2026`. */
function dia(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * El presupuesto como texto, para mandarlo por WhatsApp.
 *
 * WhatsApp es por donde se mandan los presupuestos acá, y un texto llega a
 * cualquier teléfono sin pedirle a nadie que abra un PDF. Se escribe con el
 * formato de WhatsApp (`*negrita*`) y una línea por producto, que es lo que el
 * cliente revisa.
 *
 * El nombre del negocio va arriba: sin él, el mensaje llega como un número
 * desconocido mandando precios.
 */
export function textoParaCompartir(p: Presupuesto, negocio: string): string {
  const lineas = p.lineas.map((l) => `• ${l.qty} × ${l.nombre}: ${gs(l.precio * l.qty)}`);
  const partes = [
    negocio.trim() ? `*${negocio.trim()}*` : "",
    `Presupuesto ${p.numero}`,
    p.cliente && p.cliente !== "Sin nombre" ? `Para: ${p.cliente}` : "",
    "",
    ...lineas,
    "",
    `*Total: ${gs(totalPresupuesto(p))}* (IVA incluido)`,
    `Válido hasta el ${dia(p.validoHasta)}.`,
    p.notas.trim() ? "" : null,
    p.notas.trim() ? p.notas.trim() : null,
  ];
  return partes
    .filter((x): x is string => x !== null)
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * El enlace que abre WhatsApp con el texto ya escrito.
 *
 * Con el teléfono del cliente va directo a su chat; sin teléfono, WhatsApp
 * deja elegir a quién mandarlo. El teléfono se normaliza a formato
 * internacional de Paraguay (595…) porque así se cargan casi siempre:
 * "0981 445 210", con el cero adelante y espacios.
 */
export function enlaceWhatsApp(texto: string, telefono?: string | null): string {
  let tel = String(telefono ?? "").replace(/\D/g, "");
  if (tel.startsWith("0")) tel = "595" + tel.slice(1);
  else if (tel && !tel.startsWith("595") && tel.length <= 9) tel = "595" + tel;
  const base = tel.length >= 11 ? `https://wa.me/${tel}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(texto)}`;
}

/**
 * Las colas de atención del chat, para dividir el listado como en el ERP.
 *
 * El ERP reparte las conversaciones en colas ("Ventas", "Soporte", …). En el
 * escritorio se ve una pestaña por cola; en la app estaba todo en una sola
 * lista, así que para encontrar lo de Ventas había que pasar por encima de lo
 * de Soporte.
 *
 * Las colas no se piden aparte: salen de las conversaciones que ya están en
 * pantalla. Es a propósito. Un catálogo completo mostraría una pestaña vacía
 * por cada cola que existe en la empresa, y la mayoría de las empresas tienen
 * colas que no usan. Acá sólo aparece la cola que tiene algo adentro.
 *
 * Y si el ERP no informa la cola de ninguna conversación —hay versiones que no
 * mandan el campo—, `colasDe` devuelve una lista vacía y la pantalla no dibuja
 * la fila de pestañas. Mejor eso que una fila con una sola pestaña que no
 * filtra nada.
 */
import type { Chat } from "./types";

/** El rótulo de la pestaña "sin filtro". No es el nombre de ninguna cola. */
export const TODAS = "Todas";

/** El rótulo de las conversaciones que el ERP no puso en ninguna cola. */
export const SIN_COLA = "Sin cola";

export interface Cola {
  /** Lo que se escribe en la pestaña. */
  nombre: string;
  /** Cuántas conversaciones caen acá. */
  total: number;
  /** Cuántas de ésas tienen mensajes sin leer. */
  sinLeer: number;
}

/** El nombre de cola de una conversación, o `null` si el ERP no lo informó. */
export function colaDe(c: Chat): string | null {
  const n = typeof c.cola === "string" ? c.cola.trim() : "";
  return n ? n : null;
}

/**
 * Las colas presentes en estas conversaciones, en orden alfabético, con "Sin
 * cola" al final.
 *
 * Devuelve `[]` cuando ninguna conversación trae cola: no hay nada que dividir.
 */
export function colasDe(chats: Chat[], noLeidos: (c: Chat) => number): Cola[] {
  const conCola = chats.some((c) => colaDe(c) !== null);
  if (!conCola) return [];

  const por = new Map<string, Cola>();
  for (const c of chats) {
    const nombre = colaDe(c) ?? SIN_COLA;
    const acc = por.get(nombre) ?? { nombre, total: 0, sinLeer: 0 };
    acc.total += 1;
    if (noLeidos(c) > 0) acc.sinLeer += 1;
    por.set(nombre, acc);
  }

  return [...por.values()].sort((a, b) => {
    // "Sin cola" no es una cola: va última aunque la S caiga antes.
    if (a.nombre === SIN_COLA) return 1;
    if (b.nombre === SIN_COLA) return -1;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

/** ¿Esta conversación entra en la pestaña elegida? */
export function enCola(c: Chat, elegida: string): boolean {
  if (!elegida || elegida === TODAS) return true;
  return (colaDe(c) ?? SIN_COLA) === elegida;
}

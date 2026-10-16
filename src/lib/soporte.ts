/**
 * El soporte de la app: a quién se le escribe y con qué.
 *
 * Lo que manda la app es el PRIMER mensaje, el que escribe quien tiene el
 * problema. Está armado para que del otro lado no haya que preguntar tres
 * veces lo mismo: quién es, de qué empresa, qué versión tiene instalada. Esa
 * vuelta —"¿qué versión usás?", "¿en qué pantalla?"— es la que convierte diez
 * minutos de soporte en dos días de ida y vuelta.
 *
 * El mensaje arranca con una marca, `[Zentra App]`, que es lo que permite del
 * otro lado mandarlo a la cola de ATC de la app en vez de mezclarlo con los
 * clientes del ERP.
 */

/** La marca con la que entra todo lo que sale de acá. */
export const MARCA_SOPORTE = "[Zentra App]";

/** Qué quiere quien escribe. Cambia el texto y la cola del otro lado. */
export type MotivoSoporte = "ayuda" | "mejora";

export interface DatosDeContacto {
  nombre?: string | null;
  empresa?: string | null;
  version: string;
  /** El commit del build. Sin esto, "ya lo arreglamos" no se puede verificar. */
  build?: string | null;
}

/**
 * El mensaje con el que arranca la conversación.
 *
 * Termina en dos puntos y un renglón en blanco a propósito: el teclado se abre
 * con el cursor ahí, y lo único que queda por hacer es contar el problema. Un
 * mensaje que ya viene "completo" se manda tal cual y no dice nada.
 */
export function mensajeDeSoporte(motivo: MotivoSoporte, d: DatosDeContacto): string {
  const quien = [d.nombre?.trim(), d.empresa?.trim()].filter(Boolean).join(" · ");
  const version = `v${d.version}${d.build ? ` (${d.build})` : ""}`;
  const encabezado = `${MARCA_SOPORTE} ${quien ? `${quien} · ` : ""}${version}`;

  return motivo === "mejora"
    ? `${encabezado}\n\nQuiero sugerir una mejora:\n`
    : `${encabezado}\n\nNecesito ayuda con:\n`;
}

/**
 * El saludo con el que contesta soporte, para configurar del lado del ERP.
 *
 * Vive acá y no en el ERP porque es parte de cómo se presenta Zentra, y porque
 * si está escrito en un solo lugar no termina diciendo una cosa en la app y
 * otra en el chat.
 *
 * Sin "buenas tardes": el mensaje puede salir a cualquier hora y nada queda
 * peor que un "buenas tardes" automático a las nueve de la mañana. Y sin
 * "¿en qué podemos ayudarte?" solo, que obliga a una respuesta más: se pide
 * de entrada lo que de todos modos se va a preguntar.
 */
export const SALUDO_SOPORTE =
  "¡Hola! Soy del equipo de Zentra, gracias por escribirnos. " +
  "Contanos qué necesitás y lo vemos enseguida. " +
  "Si es algo que no te funciona, ayuda mucho que nos mandes una captura y en qué pantalla estabas.";

/** El enlace de WhatsApp listo, o `null` si no hay número configurado. */
export function linkDeSoporte(
  numero: string,
  motivo: MotivoSoporte,
  d: DatosDeContacto,
): string | null {
  const limpio = (numero || "").replace(/\D/g, "");
  if (!limpio) return null;
  return `https://wa.me/${limpio}?text=${encodeURIComponent(mensajeDeSoporte(motivo, d))}`;
}

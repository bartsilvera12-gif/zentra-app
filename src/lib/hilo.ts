/**
 * Cuándo mover la vista del hilo de mensajes.
 *
 * Son dos decisiones chicas y las dos ya fallaron una vez, así que viven acá
 * afuera donde se pueden probar sin navegador.
 */

/** Lo que hace falta saber de la caja que scrollea. */
export interface Caja {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

/**
 * Si la vista está al final (o lo bastante cerca).
 *
 * El margen existe porque "al final" nunca es exacto: el teclado, una imagen
 * que terminó de cargar o un rebote del scroll dejan unos píxeles de
 * diferencia, y sin tolerancia la vista deja de seguir la conversación por
 * tres píxeles.
 */
export function alFinal(caja: Caja, margen = 120): boolean {
  return caja.scrollHeight - caja.scrollTop - caja.clientHeight < margen;
}

/**
 * Si hay que bajar al último mensaje porque la conversación recién se abre.
 *
 * El detalle que importa —y que estuvo mal— es `mensajes`: al abrir, la
 * pantalla se dibuja antes de que la conversación llegue del ERP. Si en esa
 * primera pasada se da por bajada, cuando los mensajes aparecen ya nadie baja
 * y el hilo queda mostrando el mensaje más viejo. Hay que esperar a que haya
 * algo a donde bajar.
 */
export function debeBajarAlAbrir(
  bajadoPara: string | null,
  chatId: string | null,
  mensajes: number,
): boolean {
  if (!chatId) return false;
  if (bajadoPara === chatId) return false;
  return mensajes > 0;
}

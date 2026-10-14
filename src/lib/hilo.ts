/**
 * Decisiones chicas del hilo de mensajes.
 *
 * Todas ya fallaron alguna vez en el teléfono, así que viven acá afuera donde
 * se pueden probar sin navegador.
 */
import type { ChatMsg } from "./types";

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

/**
 * Si el mensaje va SIN globo alrededor.
 *
 * Una foto sola, o un sticker: el marco no agrega nada y le roba ancho, que en
 * un celular es lo que falta.
 *
 * Pero una foto CON texto sí lleva globo, y ese era el error: el pie de una
 * foto de WhatsApp no viaja en `texto` sino en `epigrafe`, así que una foto con
 * mensaje seguía contando como "foto sola". Resultado: la imagen y abajo el
 * texto suelto sobre el fondo del hilo, sin globo, sin color, sin hora y sin
 * tilde — se veía como si la app se hubiera roto a la mitad del chat.
 */
export function vaSinGlobo(m: ChatMsg): boolean {
  if (m.sticker) return true;
  const hayMedio = !!(m.imagen || m.video);
  if (!hayMedio) return false;
  const hayAlgoMas = !!(m.texto || m.epigrafe || m.archivo || m.audio || m.audioUrl || m.pedido);
  return !hayAlgoMas;
}

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
 *
 * Lo mismo con una cita: la referencia al mensaje anterior se dibuja arriba del
 * contenido y necesita el globo para apoyarse.
 */
export function vaSinGlobo(m: ChatMsg): boolean {
  if (m.cita) return false;
  if (m.sticker) return true;
  const hayMedio = !!(m.imagen || m.video);
  if (!hayMedio) return false;
  const hayAlgoMas = !!(m.texto || m.epigrafe || m.archivo || m.audio || m.audioUrl || m.pedido);
  return !hayAlgoMas;
}

/** El primero de varios textos que no esté vacío. */
function primero(...vs: (string | null | undefined)[]): string {
  for (const v of vs) if (v && v.trim()) return v.trim();
  return "";
}

/**
 * La cita de un mensaje: a cuál responde.
 *
 * Dos orígenes distintos y los dos hacen falta:
 *
 *   `reply_context`  lo deja el ERP cuando la respuesta la mandamos nosotros,
 *                    con el resumen ya adentro.
 *   `context`        es lo que manda WhatsApp cuando responde el cliente: sólo
 *                    el wamid del mensaje citado, sin texto. Ese hay que
 *                    buscarlo en el hilo.
 *
 * Devuelve el texto listo, o el wamid a resolver después.
 */
export function citaDe(raw: Record<string, unknown> | null | undefined): {
  texto?: string;
  mio?: boolean;
  wamid?: string;
} | null {
  if (!raw || typeof raw !== "object") return null;

  const ctx = raw.reply_context;
  if (ctx && typeof ctx === "object" && !Array.isArray(ctx)) {
    const o = ctx as Record<string, unknown>;
    const texto = primero(typeof o.preview === "string" ? o.preview : null);
    if (texto) return { texto, mio: o.from_me === true };
  }

  // El nodo de WhatsApp, con sus variantes según por dónde entró el mensaje.
  const candidatos: unknown[] = [raw.context];
  for (const k of ["whatsappInboundMessage", "whatsappMessage", "message"]) {
    const sub = raw[k];
    if (sub && typeof sub === "object" && !Array.isArray(sub)) {
      candidatos.push((sub as Record<string, unknown>).context);
    }
  }
  for (const c of candidatos) {
    if (!c || typeof c !== "object" || Array.isArray(c)) continue;
    const o = c as Record<string, unknown>;
    const id = primero(
      typeof o.id === "string" ? o.id : null,
      typeof o.message_id === "string" ? o.message_id : null,
      typeof o.messageId === "string" ? o.messageId : null,
      typeof o.wamid === "string" ? o.wamid : null,
    );
    // Sólo wamids: otro id no sirve para encontrar el mensaje y dibujaría una
    // cita vacía, que confunde más que no mostrar nada.
    if (id.startsWith("wamid.")) return { wamid: id };
  }
  return null;
}

/**
 * El resumen de un mensaje, para mostrarlo citado arriba de otro.
 *
 * Una foto citada tiene que decir "Foto", no quedar en blanco: la cita existe
 * para saber a qué se está respondiendo.
 */
export function resumenDeMensaje(m: ChatMsg): string {
  if (m.texto?.trim()) return m.texto.trim();
  if (m.epigrafe?.trim()) return m.epigrafe.trim();
  if (m.imagen) return "\u{1F4F7} Foto";
  if (m.video) return "\u{1F3AC} Video";
  if (m.audioUrl || m.audio !== undefined) return "\u{1F3A4} Nota de voz";
  if (m.archivo) return `\u{1F4CE} ${m.archivo.nombre}`;
  if (m.sticker) return "Sticker";
  return "Mensaje";
}

/**
 * Completa las citas que llegaron sólo con el wamid.
 *
 * Es una segunda pasada porque el mensaje citado puede estar más arriba o más
 * abajo en la lista, y recién con el hilo entero se lo puede encontrar. Si no
 * está —quedó fuera del tramo que trajo el ERP— la cita se descarta: una cita
 * vacía confunde más que ninguna.
 */
export function resolverCitas(msgs: MensajeMapeado[]): ChatMsg[] {
  const porWamid = new Map<string, ChatMsg>();
  for (const m of msgs) if (m.wamid) porWamid.set(m.wamid, m);

  return msgs.map((m) => {
    if (!m.citaPendiente) {
      const { citaPendiente: _, ...limpio } = m;
      return limpio;
    }
    const citado = porWamid.get(m.citaPendiente);
    const { citaPendiente: _, ...limpio } = m;
    if (!citado) return limpio;
    return { ...limpio, cita: { texto: resumenDeMensaje(citado), mio: citado.de === "yo" } };
  });
}

/**
 * Un mensaje recién mapeado, antes de resolver las citas.
 *
 * `citaPendiente` es el wamid de un mensaje citado cuyo texto todavía no se
 * conoce: WhatsApp manda sólo el id. Se resuelve contra el hilo entero, que es
 * lo único que tiene ese texto, y para eso hacen falta todos los mensajes.
 */
export type MensajeMapeado = ChatMsg & { citaPendiente?: string };

let nLocal = 0;

/**
 * Una marca para el globo que la app dibuja antes de que el ERP conteste.
 *
 * Es lo único que permite sacarlo después, cuando el mensaje vuelve del
 * servidor: sin marca no hay forma de saber cuál de los globos del hilo era el
 * provisorio, y quedaban los dos.
 *
 * Lleva el reloj y un contador porque dos mensajes seguidos pueden salir en el
 * mismo milisegundo —una foto y su pie, por ejemplo—.
 */
export function marcaLocal(): string {
  nLocal += 1;
  return `local-${Date.now()}-${nLocal}`;
}

/**
 * Cuelga cada reacción del mensaje al que reacciona.
 *
 * WhatsApp manda la reacción como una fila más del hilo, así que la app la
 * dibujaba como una fila más: un emoji suelto al final de la conversación,
 * alineado por quien reaccionó. Si yo le ponía un corazón a lo que escribió el
 * cliente, el corazón aparecía a la derecha —mi lado— y lejos del mensaje. No
 * se entendía a qué le había reaccionado.
 *
 * Ahora la reacción entra adentro del mensaje reaccionado, que es donde se
 * dibuja, y la fila suelta desaparece.
 *
 * Una reacción por persona, la última: así funciona WhatsApp, y así llegan
 * —cambiar de emoji manda otra fila, y sacarla manda una con el emoji vacío—.
 * Si el mensaje reaccionado no está en el tramo que trajo el ERP, la fila se
 * deja como estaba: mostrar el emoji suelto es menos malo que perderlo.
 */
export function pegarReacciones(msgs: ChatMsg[]): ChatMsg[] {
  // De cada mensaje, qué puso cada lado. Map para conservar el orden en que
  // llegaron.
  const porMensaje = new Map<string, Map<string, string>>();
  for (const m of msgs) {
    if (m.reaccion === undefined || !m.reaccionSobre) continue;
    const quien = m.de;
    const suyas = porMensaje.get(m.reaccionSobre) ?? new Map<string, string>();
    if (m.reaccion) suyas.set(quien, m.reaccion);
    else suyas.delete(quien);
    porMensaje.set(m.reaccionSobre, suyas);
  }

  // Qué mensajes están de verdad en el tramo: una reacción a uno que quedó
  // afuera no se puede colgar de ningún lado.
  const presentes = new Set<string>();
  for (const m of msgs) if (m.wamid && m.reaccion === undefined) presentes.add(m.wamid);

  const salida: ChatMsg[] = [];
  for (const m of msgs) {
    // La fila de reacción se va, salvo que no se haya podido ubicar.
    if (m.reaccion !== undefined && m.reaccionSobre) {
      if (presentes.has(m.reaccionSobre)) continue;
      // Sin mensaje del que colgar: si era una retirada, no se dibuja nada.
      if (!m.reaccion) continue;
    }
    const puestas = m.wamid ? [...(porMensaje.get(m.wamid)?.values() ?? [])] : [];
    salida.push(puestas.length ? { ...m, reacciones: puestas } : m);
  }
  return salida;
}

/** Alto mínimo del cuadro de escritura, en píxeles: una línea. */
export const ALTO_MINIMO_ESCRITURA = 38;

/**
 * Alto máximo: unas cinco líneas. De ahí para arriba el cuadro se queda quieto
 * y el texto scrollea adentro, porque un cuadro que sigue creciendo se come la
 * conversación entera.
 */
export const ALTO_MAXIMO_ESCRITURA = 116;

/**
 * Qué alto tiene que tener el cuadro de escritura para el texto que hay.
 *
 * Era de alto fijo, de una línea: escribir un párrafo largo corría el texto
 * hacia la izquierda y lo que se había escrito antes no se veía más. No se
 * podía releer lo que uno estaba por mandar.
 *
 * `contenido` es el `scrollHeight` del campo medido con el alto en automático,
 * que es lo único que sabe cuántas líneas entraron.
 */
export function altoDeEscritura(
  contenido: number,
  min = ALTO_MINIMO_ESCRITURA,
  max = ALTO_MAXIMO_ESCRITURA,
): number {
  if (!Number.isFinite(contenido) || contenido <= 0) return min;
  return Math.max(min, Math.min(Math.round(contenido), max));
}

/**
 * Qué decirle a quien manda un archivo cuando algo falla.
 *
 * El navegador avisa en inglés y hablando de otra cosa: "The requested file
 * could not be read, typically due to permission problems…" apareció tal cual
 * en la pantalla de un vendedor. No es un permiso de Android —la app no pide
 * ninguno para esto— sino el archivo elegido, que dejó de estar al alcance.
 * Elegirlo de nuevo alcanza, y eso es lo que hay que decir.
 *
 * Lo que viene del ERP ya está en castellano y se deja pasar tal cual: ahí el
 * mensaje dice algo útil ("el video es muy largo", "se requiere archivo").
 */
export function mensajeDeArchivo(e: unknown): string {
  const texto = e instanceof Error ? e.message : "";
  if (!texto) return "No se pudo enviar el archivo.";
  if (/could not be read|NotReadable|NotFound|permission/i.test(texto)) {
    return "No pudimos leer ese archivo. Probá elegirlo de nuevo.";
  }
  return texto;
}

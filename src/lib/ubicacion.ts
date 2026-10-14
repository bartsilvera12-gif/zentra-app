/**
 * Mandar la ubicación por el chat.
 *
 * WhatsApp tiene un tipo de mensaje "ubicación" —el mapita con el pin— pero el
 * ERP todavía no lo sabe mandar: su endpoint de envío acepta texto, media y
 * stickers, y nada más. Así que la ubicación viaja como lo que sí llega
 * siempre: un enlace de mapa. Del otro lado se toca y abre el mapa del
 * teléfono, que es para lo que se manda.
 *
 * Cuando el ERP tenga por dónde, esto cambia en un solo lugar.
 */

/** Una posición, con la precisión que informó el GPS. */
export interface Posicion {
  lat: number;
  lng: number;
  /** Radio en metros dentro del que está la posición, si el GPS lo dio. */
  precision?: number;
}

/**
 * Seis decimales: ~11 cm. Más es ruido del GPS escrito como si fuera dato, y
 * de paso el enlace queda legible.
 */
function coordenada(n: number): string {
  return n.toFixed(6).replace(/\.?0+$/, "");
}

/**
 * El enlace de mapa, con el formato que entienden los tres: Google Maps,
 * el mapa de Android y el de iPhone.
 */
export function enlaceDeMapa(p: Posicion): string {
  return `https://www.google.com/maps?q=${coordenada(p.lat)},${coordenada(p.lng)}`;
}

/**
 * El mensaje tal como lo va a leer el cliente.
 *
 * Con el pin adelante para que se entienda de un vistazo qué es, incluso en la
 * notificación, donde no se ve más que la primera línea.
 */
export function textoDeUbicacion(p: Posicion): string {
  return `\u{1F4CD} Mi ubicación: ${enlaceDeMapa(p)}`;
}

/** Si la posición sirve para mandar. El GPS puede devolver cualquier cosa. */
export function posicionValida(p: Posicion | null | undefined): p is Posicion {
  if (!p) return false;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
  // Fuera de rango no es una ubicación, es un error de lectura.
  if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return false;
  // 0,0 es el Golfo de Guinea: nadie manda eso desde Paraguay, y es lo que
  // devuelven algunos GPS cuando todavía no fijaron posición.
  return !(p.lat === 0 && p.lng === 0);
}

function esNativo(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform();
}

/**
 * Dónde está el teléfono.
 *
 * Adentro del APK va por el plugin, que es el que pide el permiso al sistema;
 * en el navegador por el `navigator.geolocation` de siempre. Diez segundos de
 * espera: un GPS adentro de un depósito puede tardar, pero más que eso es una
 * app colgada.
 *
 * Lanza con un mensaje para mostrar tal cual: que el permiso esté negado no es
 * un error del programa, es una respuesta.
 */
export async function ubicacionActual(): Promise<Posicion> {
  if (esNativo()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    let permiso = await Geolocation.checkPermissions().catch(() => null);
    if (permiso?.location !== "granted") {
      permiso = await Geolocation.requestPermissions().catch(() => null);
    }
    if (permiso?.location !== "granted") {
      throw new Error("Necesitamos permiso para usar la ubicación.");
    }
    const r = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    }).catch(() => null);
    const p = r
      ? { lat: r.coords.latitude, lng: r.coords.longitude, precision: r.coords.accuracy }
      : null;
    if (!posicionValida(p)) throw new Error("No pudimos tomar tu ubicación. Probá de nuevo al aire libre.");
    return p;
  }

  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (!nav?.geolocation) throw new Error("Este teléfono no da la ubicación.");
  const p = await new Promise<Posicion | null>((resolver) => {
    nav.geolocation.getCurrentPosition(
      (r) => resolver({ lat: r.coords.latitude, lng: r.coords.longitude, precision: r.coords.accuracy }),
      () => resolver(null),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
  if (!posicionValida(p)) throw new Error("No pudimos tomar tu ubicación.");
  return p;
}

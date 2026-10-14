/**
 * Achicar una foto antes de mandarla.
 *
 * El teléfono saca fotos de 3 o 4 MB. Esas se mandaban tal cual, y encima el
 * camino nativo las codifica en base64, que agrega un tercio: 3,6 MB de foto
 * salen como 4,8 MB de subida. Con datos móviles en la calle eso es medio
 * minuto mirando una pantalla que no dice nada, y después el ERP la vuelve a
 * subir al Storage y a WhatsApp.
 *
 * Así que se achica antes, igual que hace WhatsApp: 1600 píxeles del lado más
 * largo es más de lo que muestra cualquier teléfono, y una foto de depósito o
 * un comprobante quedan perfectamente legibles en 300 KB.
 *
 * Lo que NO se toca: lo que ya pesa poco (un ticket de 63 KB no mejora nada
 * pasando por el canvas), lo que no es foto, y los documentos. Un PDF de
 * factura tiene que llegar byte por byte.
 */

/** Lado máximo, en píxeles, de una foto que sale de la app. */
export const LADO_MAXIMO = 1600;

/**
 * A partir de acá vale la pena achicar. Abajo de medio mega la subida ya es
 * rápida y recomprimir sólo agrega una pérdida de calidad sin ganar nada.
 */
export const PESO_MINIMO = 500 * 1024;

/** Si conviene achicar este archivo. */
export function necesitaAchicar(tipo: string, peso: number): boolean {
  if (!/^image\/(jpeg|jpg|png|webp)$/i.test(tipo)) return false;
  return peso > PESO_MINIMO;
}

/**
 * La medida nueva, manteniendo la proporción.
 *
 * Nunca agranda: una foto chica que se estira pesa más y se ve peor.
 */
export function medidaAchicada(
  ancho: number,
  alto: number,
  max = LADO_MAXIMO,
): { ancho: number; alto: number } {
  const lado = Math.max(ancho, alto);
  if (!Number.isFinite(lado) || lado <= 0 || lado <= max) {
    return { ancho: Math.round(ancho), alto: Math.round(alto) };
  }
  const f = max / lado;
  return { ancho: Math.max(1, Math.round(ancho * f)), alto: Math.max(1, Math.round(alto * f)) };
}

/** El nombre que le queda a una foto recomprimida a JPEG. */
export function nombreAchicado(nombre: string): string {
  if (/\.jpe?g$/i.test(nombre)) return nombre;
  return nombre.replace(/\.[^.]+$/, "") + ".jpg";
}

/**
 * Devuelve la foto achicada, o la original si no hace falta —o si el teléfono
 * no pudo—. Nunca falla: no poder achicar no es razón para no mandar nada.
 */
export async function achicarImagen(
  f: File | Blob,
  nombre: string,
): Promise<{ archivo: File | Blob; nombre: string }> {
  const original = { archivo: f, nombre };
  if (!necesitaAchicar(f.type || "", f.size)) return original;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return original;

  try {
    const bitmap = await createImageBitmap(f);
    const { ancho, alto } = medidaAchicada(bitmap.width, bitmap.height);
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close?.();

    const chica = await new Promise<Blob | null>((r) => lienzo.toBlob(r, "image/jpeg", 0.82));
    // Si la vuelta quedó más pesada que la original —pasa con capturas de
    // pantalla planas— se manda la original: achicar es para que pese menos.
    if (!chica || chica.size >= f.size) return original;
    return { archivo: chica, nombre: nombreAchicado(nombre) };
  } catch {
    return original;
  }
}

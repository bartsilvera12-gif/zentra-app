/**
 * Grabar una nota de voz con el micrófono del celular.
 *
 * El contador de segundos ya existía, pero no grababa nada: al soltar el botón
 * se mandaba un mensaje que decía "0:07" y no tenía audio. Esto graba de
 * verdad y devuelve el archivo.
 *
 * Vive aparte de la pantalla para poder probar la decisión del formato sin un
 * micrófono, que es la parte que puede romperse en un celular distinto.
 */

/**
 * El formato que el navegador del celular puede grabar.
 *
 * WhatsApp quiere ogg/opus; los WebView de Android graban webm/opus y algunos
 * sólo mp4. Se toma el primero que el aparato soporte: mandar uno que no
 * soporta no da error, graba un archivo vacío.
 */
export function formatoSoportado(
  soporta: (t: string) => boolean = (t) =>
    typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t),
): { mime: string; ext: string } {
  const candidatos = [
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "m4a" },
  ];
  for (const c of candidatos) if (soporta(c.mime)) return c;
  // Sin ninguno, se graba con el que el aparato elija solo.
  return { mime: "", ext: "webm" };
}

export interface Grabacion {
  blob: Blob;
  nombre: string;
  /** Segundos, para mostrar la duración. */
  segundos: number;
}

export class Grabador {
  private rec: MediaRecorder | null = null;
  private trozos: Blob[] = [];
  private desde = 0;

  /** Pide permiso y arranca. Lanza si el usuario lo niega. */
  async arrancar(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const { mime } = formatoSoportado();
    this.rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    this.trozos = [];
    this.desde = Date.now();
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.trozos.push(e.data);
    };
    this.rec.start();
  }

  /**
   * Corta y devuelve lo grabado. `null` si no se grabó nada.
   *
   * Siempre suelta el micrófono: si no, en Android queda el punto rojo
   * prendido en la barra de estado y la gente cree que la app los escucha.
   */
  async detener(): Promise<Grabacion | null> {
    const rec = this.rec;
    if (!rec) return null;
    this.rec = null;

    const fin = new Promise<void>((listo) => {
      rec.onstop = () => listo();
    });
    try {
      rec.stop();
      await fin;
    } finally {
      rec.stream.getTracks().forEach((t) => t.stop());
    }

    if (!this.trozos.length) return null;
    const tipo = this.trozos[0]!.type || formatoSoportado().mime || "audio/webm";
    const { ext } = formatoSoportado();
    return {
      blob: new Blob(this.trozos, { type: tipo }),
      nombre: `nota-de-voz.${ext}`,
      segundos: Math.max(1, Math.round((Date.now() - this.desde) / 1000)),
    };
  }

  /** Corta sin devolver nada, soltando el micrófono. */
  cancelar(): void {
    const rec = this.rec;
    this.rec = null;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* ya estaba parado */
    }
    rec.stream.getTracks().forEach((t) => t.stop());
  }
}

/**
 * Si estamos adentro del APK o en un navegador.
 *
 * Estaba copiado en cuatro archivos, con la misma línea escrita cuatro veces.
 * Es la clase de cosa que se arregla en tres de los cuatro lugares el día que
 * cambie.
 */
export function esNativo(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform();
}

/**
 * Qué compilación es esta.
 *
 * La pantalla siempre mostró "versión 2.4.1", que es el nombre que elegimos
 * nosotros y que no cambia entre una subida y la siguiente. Sirve para
 * decirle a alguien qué producto tiene; no sirve para nada cuando hay que
 * averiguar por qué algo no anda.
 *
 * El número que importa es el de la compilación —el `versionCode`—, que sube
 * en cada subida a Play. Sin eso, ante "ya actualicé y sigue igual" no hay
 * forma de distinguir un error del código de una actualización que todavía no
 * llegó al teléfono. Nos pasó, y se fue media tarde en adivinar.
 *
 * En el navegador no existe y se devuelve vacío: ahí no hay compilación que
 * numerar.
 */
import { esNativo } from "./nativo";

export async function numeroDeCompilacion(): Promise<string> {
  if (!esNativo()) return "";
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    return String(info?.build || "");
  } catch {
    return "";
  }
}

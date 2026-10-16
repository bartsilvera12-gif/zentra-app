/**
 * Que la pantalla no afirme lo que no hizo.
 *
 *   npm run test:impresion
 *
 * Esto no prueba lógica: prueba que no vuelva una mentira que ya estuvo. El
 * botón "Reimprimir" guardaba una palabra en el estado y la pantalla decía "La
 * factura se envió a la impresora térmica vinculada". No hay plugin de
 * impresión, ni Bluetooth, ni ESC/POS en el proyecto: no se envió nada a
 * ningún lado. Quien atiende el mostrador entregaba la mercadería convencido
 * de que el ticket había salido. Lo mismo el adjunto "PDF · 96 KB", que no
 * correspondía a ningún archivo.
 *
 * Es facilísimo de reintroducir: alguien quiere que el botón "dé feedback",
 * escribe el ✓ y el texto lindo, y la función sigue sin existir.
 */
import { readFileSync } from "node:fs";

/**
 * Lo que se revisa es lo que la pantalla muestra, no lo que explica.
 *
 * Los comentarios de estos archivos nombran la mentira vieja a propósito —"acá
 * decía que se envió a la impresora térmica"— y eso es justo lo que hay que
 * dejar escrito para que nadie la reponga. Si la prueba leyera los
 * comentarios, el único modo de pasarla sería borrar la explicación.
 */
const codigo = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");

const DET = codigo("src/mobile/screens/DetVentasScreen.tsx");
const VENTA = codigo("src/mobile/screens/VentaScreen.tsx");

const casos = [];
const t = (nombre, fn) => casos.push([nombre, fn]);

/** Lo que el texto NO puede decir, y por qué no. */
const PROHIBIDO = [
  [/impresora térmica/i, "no hay ninguna impresora vinculada"],
  [/se envió a la impresora/i, "no se envía nada a ninguna impresora"],
  [/Enviado a imprimir/i, "nada se envió a imprimir"],
  [/PDF generado/i, "no hay generador de PDF en el proyecto"],
  [/PDF listo/i, "no hay ningún PDF"],
  [/se guardó el PDF/i, "no se guarda ningún archivo"],
  [/Listo para enviar/i, "no quedó nada listo para enviar"],
];

t("la pantalla de ventas no dice que imprimió ni que generó un PDF", () => {
  for (const [re, porque] of PROHIBIDO) {
    if (re.test(DET)) throw new Error(`dice "${re.source}" y ${porque}`);
  }
});

t("el adjunto del chat no es un PDF inventado", () => {
  // `nombre: det.numero + ".pdf"` con `peso: "PDF · 96 KB"`: una tarjeta que
  // mostraba un peso falso y no abría ningún archivo.
  if (/\.pdf"/.test(DET)) throw new Error("sigue armando un nombre de archivo que no existe");
  if (/peso:/.test(DET)) throw new Error("sigue inventando el peso de un archivo");
  if (/archivo:\s*\{/.test(DET)) throw new Error("sigue adjuntando un archivo que no existe");
});

t("la hora del mensaje es la del reloj y no una fija", () => {
  const fija = DET.match(/hora:\s*"[^"]+"/);
  if (fija) throw new Error("hora escrita a mano: " + fija[0]);
  if (!/hora:\s*new Date\(\)/.test(DET)) throw new Error("tiene que salir del reloj");
});

t("imprimir pregunta primero por el plan", () => {
  // El mismo patrón que la venta a crédito: el motivo se muestra en `avisoPlan`
  // y la acción no se ejecuta.
  if (!/motivoBloqueo\(\s*"facturacion\.autoImpresor"/.test(DET)) {
    throw new Error("la acción del plan está declarada y nadie la consulta");
  }
  if (!/avisoPlan:\s*sinImpresion/.test(DET)) throw new Error("el motivo no llega a la pantalla");
});

t("adentro del APK avisa que no se puede imprimir, en vez de simularlo", () => {
  // El WebView de Android define `window.print` y no imprime nada: preguntar
  // por la función haría creer que se abrió un diálogo que no existe.
  if (!/esNativo\(\)/.test(DET)) throw new Error("no distingue el APK del navegador");
  if (!/window\.print\(\)/.test(DET)) throw new Error("en el navegador sí hay impresión del sistema: usala");
  const i = DET.indexOf("esNativo()) return"), j = DET.indexOf("window.print()");
  if (i < 0 || j < 0 || i > j) throw new Error("tiene que cortar antes de llamar a print()");
});

t("compartir comparte lo que de verdad hay: texto", () => {
  if (!/navigator\.clipboard|nav\.share/.test(DET)) throw new Error("no comparte nada de verdad");
  if (!/Compartir en texto/.test(DET)) throw new Error("el botón tiene que decir qué comparte");
});

t("las dos vistas de factura avisan cuando es un comprobante interno", () => {
  for (const [nombre, txt] of [["DetVentasScreen", DET], ["VentaScreen", VENTA]]) {
    if (!/emisor\.falta/.test(txt)) throw new Error(nombre + " no muestra lo que falta del emisor");
    if (!/tituloComprobante\(emisor\)/.test(txt)) throw new Error(nombre + " llama factura a lo que puede no serlo");
    if (/>\s*FACTURA\s*</.test(txt)) throw new Error(nombre + " sigue con el FACTURA escrito a mano");
  }
});

t("ninguna de las dos pantallas tiene un RUC escrito a mano", () => {
  for (const [nombre, txt] of [["DetVentasScreen", DET], ["VentaScreen", VENTA]]) {
    const m = txt.match(/\b\d{6,8}-\d\b/);
    if (m) throw new Error(nombre + " tiene un RUC de ejemplo: " + m[0]);
  }
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nImpresión y comprobantes: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

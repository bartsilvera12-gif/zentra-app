/**
 * Que la pantalla no afirme lo que no hizo.
 *
 *   npm run test:impresion
 *
 * Esto no prueba lógica: prueba que no vuelva una mentira que ya estuvo. El
 * botón "Reimprimir" guardaba una palabra en el estado y la pantalla decía "La
 * factura se envió a la impresora térmica vinculada". No había plugin de
 * impresión, ni Bluetooth, ni ESC/POS en el proyecto: no se envió nada a ningún
 * lado. Quien atiende el mostrador entregaba la mercadería convencido de que el
 * ticket había salido. Lo mismo el adjunto "PDF · 96 KB", que no correspondía a
 * ningún archivo.
 *
 * Ahora la impresora existe —`src/lib/impresora.ts`, térmica por Bluetooth— y
 * por eso esta prueba cambió de forma, no de fondo. Antes alcanzaba con prohibir
 * la palabra "impresora térmica", porque no había ninguna. Hoy la hay, así que
 * lo que se prueba es lo que de verdad importaba todo este tiempo: que lo que
 * dice la pantalla salga de lo que informó el aparato, y que los dos casos se
 * digan distinto.
 *
 *   impreso   la impresora confirmó. Pasa con los SDK de fabricante.
 *   enviado   el ticket salió hacia la impresora y nada más. Es lo que pasa con
 *             una ESC/POS genérica por Bluetooth —la de casi todos los
 *             comercios de acá—, porque ese canal es de ida: la app escribe
 *             bytes y la impresora no contesta. Redondear esto a "impreso" es
 *             la misma mentira de antes con otro traje.
 *
 * Es facilísimo de reintroducir: alguien quiere que el botón "dé feedback",
 * escribe el ✓ y el texto lindo, y lo que informó la impresora no se mira.
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
const LIB = codigo("src/lib/impresora.ts");
const PANTALLAS = [
  ["DetVentasScreen", DET],
  ["VentaScreen", VENTA],
];

const casos = [];
const t = (nombre, fn) => casos.push([nombre, fn]);

/** Lo que el texto NO puede decir, y por qué no. */
const PROHIBIDO = [
  [/se envió a la impresora/i, "nadie sabe si llegó: lo que se sabe es que salió de acá"],
  [/Enviado a imprimir/i, "no es lo que la impresora informó, es lo que la pantalla supuso"],
  [/PDF generado/i, "no hay generador de PDF en el proyecto"],
  [/PDF listo/i, "no hay ningún PDF"],
  [/se guardó el PDF/i, "no se guarda ningún archivo"],
  [/Listo para enviar/i, "no quedó nada listo para enviar"],
  [/✓\s*Impres/i, "el tilde lo pone el resultado, no el botón"],
];

t("ninguna de las dos pantallas afirma de más", () => {
  for (const [nombre, txt] of PANTALLAS) {
    for (const [re, porque] of PROHIBIDO) {
      if (re.test(txt)) throw new Error(`${nombre} dice "${re.source}" y ${porque}`);
    }
  }
});

t("el ticket lo manda la impresora de verdad, no la pantalla", () => {
  // Las pantallas no hablan con el plugin: llaman a `imprimirTicket`, que es
  // el único lugar donde se decide qué se puede afirmar.
  for (const [nombre, txt] of PANTALLAS) {
    if (!/imprimirTicket\(/.test(txt)) throw new Error(nombre + " no usa la impresora de la app");
    if (/printText\(|ThermalPrinter/.test(txt)) {
      throw new Error(nombre + " le habla al plugin por su cuenta: ahí se vuelve a poder afirmar de más");
    }
  }
});

t("los dos resultados se distinguen, y se dicen distinto", () => {
  for (const [nombre, txt] of PANTALLAS) {
    if (!/r\.estado === "impreso"/.test(txt)) throw new Error(nombre + " no mira si la impresora confirmó");
    if (!/r\.estado === "enviado"/.test(txt)) {
      throw new Error(nombre + ' trata "salió hacia la impresora" igual que "imprimió"');
    }
    // El texto del caso sin confirmación tiene que decir que no hay
    // confirmación. Si dijera "imprimió", distinguir los casos no serviría de
    // nada.
    const desde = txt.indexOf('r.estado === "enviado"');
    const hasta = txt.indexOf("impAvisoGrave", desde);
    const texto = txt.slice(desde, hasta > desde ? hasta : desde + 600);
    if (!/no confirma/.test(texto)) {
      throw new Error(nombre + ": el caso sin confirmación tiene que decir que la impresora no confirma");
    }
    if (/confirmó/.test(texto)) throw new Error(nombre + ": ahí no hubo ninguna confirmación");
  }
});

t("la falla se muestra como falla, con el motivo que vino", () => {
  for (const [nombre, txt] of PANTALLAS) {
    if (!/impAvisoGrave: r\.estado === "error"/.test(txt)) {
      throw new Error(nombre + " no distingue una falla de un resultado");
    }
    // El motivo lo escribe `impresora.ts`, que es el que sabe qué falló. Un
    // "no se pudo imprimir" genérico no le sirve a nadie parado frente a la
    // impresora.
    if (!/: r\.motivo/.test(txt)) throw new Error(nombre + " se come el motivo de la falla");
  }
});

t("la impresora que no confirma nunca se cuenta como impresa", () => {
  // Es la regla de fondo, y vive en un solo lugar para que no se pueda
  // relajar en una pantalla sin que se note en la otra.
  if (!/interpretarResultado/.test(LIB)) throw new Error("falta la función que decide qué se puede afirmar");
  if (!/deIda \? "enviado" : "impreso"/.test(LIB)) {
    throw new Error("un canal de ida (ESC/POS, TCP crudo) no puede devolver 'impreso'");
  }
  if (!/state === "failed" \|\| trabajo\.state === "hold"/.test(LIB)) {
    throw new Error("un trabajo frenado por falta de papel se estaría tomando como éxito");
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
  for (const [nombre, txt] of PANTALLAS) {
    if (!/motivoBloqueo\(\s*"facturacion\.autoImpresor"/.test(txt)) {
      throw new Error(nombre + ": la acción del plan está declarada y nadie la consulta");
    }
    if (!/avisoPlan:\s*sinImpresion/.test(txt)) throw new Error(nombre + ": el motivo no llega a la pantalla");
  }
});

t("adentro del APK no se finge el diálogo del sistema", () => {
  // El WebView de Android define `window.print` y no imprime nada: llamarla
  // haría creer que se abrió un diálogo que no existe. Adentro del APK el
  // camino es la impresora térmica; en el navegador, el diálogo del sistema,
  // que ahí sí existe.
  for (const [nombre, txt] of PANTALLAS) {
    if (!/esNativo\(\)/.test(txt)) throw new Error(nombre + " no distingue el APK del navegador");
    for (let i = txt.indexOf("window.print()"); i >= 0; i = txt.indexOf("window.print()", i + 1)) {
      const antes = txt.slice(Math.max(0, i - 400), i);
      if (!/esNativo\(\)/.test(antes)) {
        throw new Error(nombre + ": hay un window.print() al que se llega sin preguntar si estamos en el APK");
      }
    }
  }
});

t("en el navegador sí se usa la impresión del sistema", () => {
  // Es lo único que hay ahí, y es útil: no se saca por haber agregado la
  // térmica.
  if (!/window\.print\(\)/.test(DET)) throw new Error("en el navegador hay impresión del sistema: usala");
});

t("compartir comparte lo que de verdad hay: texto", () => {
  if (!/navigator\.clipboard|nav\.share/.test(DET)) throw new Error("no comparte nada de verdad");
  if (!/Compartir en texto/.test(DET)) throw new Error("el botón tiene que decir qué comparte");
});

t("las dos vistas de factura avisan cuando es un comprobante interno", () => {
  for (const [nombre, txt] of PANTALLAS) {
    if (!/emisor\.falta/.test(txt)) throw new Error(nombre + " no muestra lo que falta del emisor");
    if (!/tituloComprobante\(emisor\)/.test(txt)) throw new Error(nombre + " llama factura a lo que puede no serlo");
    if (/>\s*FACTURA\s*</.test(txt)) throw new Error(nombre + " sigue con el FACTURA escrito a mano");
  }
});

t("ninguna de las dos pantallas tiene un RUC escrito a mano", () => {
  for (const [nombre, txt] of PANTALLAS) {
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

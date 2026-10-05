/**
 * Pruebas del grabador de notas de voz.
 *
 *   npm run test:grabador
 *
 * El contador de segundos ya existía, pero no grababa nada: al soltar el botón
 * se mandaba un mensaje que decía "0:07" y no tenía audio.
 *
 * Lo que se puede probar sin un micrófono es la elección del formato, que es
 * justo lo que se rompe en un celular distinto: pedir uno que el aparato no
 * soporta no da error, graba un archivo vacío.
 */
import { formatoSoportado } from "../src/lib/grabador.ts";

const casos = [];
function t(n, f) { casos.push([n, f]); }
function igual(a, b, q) { if (a !== b) throw new Error(`${q}: esperaba ${b}, fue ${a}`); }

t("prefiere ogg/opus, que es lo que WhatsApp quiere", () => {
  const r = formatoSoportado(() => true);
  igual(r.mime, "audio/ogg;codecs=opus", "mime");
  igual(r.ext, "ogg", "extensión");
});

t("en un Android que sólo graba webm, cae en webm", () => {
  const r = formatoSoportado((tipo) => tipo.startsWith("audio/webm"));
  igual(r.mime, "audio/webm;codecs=opus", "mime");
  igual(r.ext, "webm", "extensión");
});

t("en un iPhone que sólo graba mp4, cae en m4a", () => {
  const r = formatoSoportado((tipo) => tipo === "audio/mp4");
  igual(r.mime, "audio/mp4", "mime");
  igual(r.ext, "m4a", "extensión");
});

t("si no soporta ninguno, deja elegir al aparato en vez de forzar uno", () => {
  // Forzar un formato que no soporta no da error: graba un archivo vacío, y
  // del otro lado llega un audio que no suena.
  const r = formatoSoportado(() => false);
  igual(r.mime, "", "mime vacío");
  igual(r.ext, "webm", "extensión por defecto");
});

let malas = 0;
for (const [n, f] of casos) {
  try { await f(); console.log("  OK · " + n); }
  catch (e) { malas++; console.log("  FALLA · " + n + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nGrabador: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

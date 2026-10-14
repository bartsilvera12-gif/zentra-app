/**
 * El color del círculo de cada contacto.
 *
 *   npm run test:avatar
 *
 * Lo que importa no es qué color toca, sino que sea SIEMPRE el mismo para la
 * misma persona: un color que cambia en cada arranque es peor que no tener
 * color, porque uno aprende a buscar "la celeste" y deja de estar.
 */
import { colorAvatar } from "../src/lib/avatar.ts";

const casos = [];
const t = (n, f) => casos.push([n, f]);

t("el mismo nombre da siempre el mismo color", () => {
  const a = colorAvatar("Despensa Doña Lucía", false);
  const b = colorAvatar("Despensa Doña Lucía", false);
  if (a.fondo !== b.fondo || a.tinta !== b.tinta) throw new Error("cambió entre llamadas");
});

t("no depende de mayúsculas ni de espacios de más", () => {
  const a = colorAvatar("Carlos Manzoni", true);
  const b = colorAvatar("  carlos manzoni  ", true);
  if (a.fondo !== b.fondo) throw new Error("el mismo contacto con otro color");
});

t("nombres distintos no caen todos en el mismo color", () => {
  const nombres = ["Normi", "Osvaldo Reinoso", "Ferreteria Republica", "Carlos Manzoni",
    "mariacristina", "Viviana Acosta", "Jose Martinez", "CM7", "595984861066", "Max"];
  const distintos = new Set(nombres.map((n) => colorAvatar(n, false).fondo));
  if (distintos.size < 4) throw new Error("demasiado parejo: " + distintos.size + " colores en 10 nombres");
});

t("en oscuro y en claro son paletas distintas", () => {
  const claro = colorAvatar("Normi", false);
  const oscuro = colorAvatar("Normi", true);
  if (claro.fondo === oscuro.fondo) throw new Error("mismo fondo en los dos temas");
});

t("sin nombre no se rompe", () => {
  for (const v of ["", "   "]) {
    const c = colorAvatar(v, false);
    if (!c || !c.fondo || !c.tinta) throw new Error("devolvió algo inservible");
  }
});

t("la tinta contrasta con su fondo", () => {
  // Luminancia relativa simple: alcanza para atrapar un par invertido, que es
  // el error facil al agregar un color nuevo a la paleta.
  const lum = (hex) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const nombres = ["a", "bb", "ccc", "dddd", "eeeee", "ffffff", "ggg", "hh", "iii", "jjjj", "kk", "l"];
  for (const oscuro of [false, true]) {
    for (const n of nombres) {
      const c = colorAvatar(n, oscuro);
      const d = Math.abs(lum(c.fondo) - lum(c.tinta));
      if (d < 0.3) throw new Error(`${c.fondo} con ${c.tinta} no se lee (${d.toFixed(2)})`);
    }
  }
});

let fallas = 0;
for (const [nombre, f] of casos) {
  try { f(); console.log("  ok   " + nombre); }
  catch (e) { fallas++; console.log("  FALLA " + nombre + "\n         " + e.message); }
}
console.log(`\n${casos.length - fallas}/${casos.length} casos`);
process.exit(fallas ? 1 : 0);

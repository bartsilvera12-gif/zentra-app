/**
 * Que el color salga de la paleta y no de un literal suelto.
 *
 *   npm run test:colores
 *
 * Cada pantalla había terminado con el suyo —azul, oro, violeta, cian,
 * naranja— y el inicio con seis botones de seis colores. Parecía otra app en
 * cada pantalla, y el color no significaba nada: era decoración. Cuando todo
 * resalta, no resalta nada, y un stock agotado se perdía entre lo demás.
 *
 * Es fácil de reintroducir: alguien copia un color de otra pantalla para que
 * "combine" y se vuelve al mismo lugar.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * La regla no es una lista de hexadecimales: son familias de color.
 *
 * Una lista cerrada obliga a anotar cada tono nuevo —un hover, una variante
 * del tema oscuro— y termina siendo un trámite que alguien saltea. Lo que de
 * verdad importa es que el color pertenezca a la paleta:
 *
 *   azules y verdes azulados   la identidad (encabezados, acentos, superficies)
 *   ámbar y naranja            "mirá esto" y "ya es un problema"
 *   rojo                       "esto falló"
 *
 * Un violeta, un magenta o un verde manzana no entran en ninguna, y eso es
 * justo lo que hacía que la app pareciera siete apps distintas: cada pantalla
 * con el color que a alguien le pareció lindo.
 */
const FAMILIAS = [
  { nombre: "ámbar/naranja", de: 18, a: 52 },
  { nombre: "azul/verde azulado", de: 150, a: 215 },
  { nombre: "rojo", de: 348, a: 16 },
];

/** Tono en grados, como en la rueda de color. */
function tono(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h =
    max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const enFamilia = (h) =>
  FAMILIAS.some(({ de, a }) => (de <= a ? h >= de && h <= a : h >= de || h <= a));

/**
 * Grises, blancos y negros: no son identidad, son superficie. El umbral de 34
 * cubre los tonos pizarra del tema (#5b6676, #242c40, #39415a) sin dejar pasar
 * un color elegido con intención.
 */
const ok = (c) => {
  const h = c.toUpperCase().replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  if (Math.max(r, g, b) - Math.min(r, g, b) <= 34) return true;
  return enFamilia(tono(r, g, b));
};

let malas = 0;
const malas_detalle = [];
for (const dir of ["src/mobile/screens", "src/mobile/ui", "src/mobile/layout"]) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".tsx"))) {
    const txt = readFileSync(join(dir, f), "utf8");
    for (const m of txt.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      const c = m[0].toUpperCase();
      if (ok(c)) continue;
      malas++;
      const h = c.replace("#", "");
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      malas_detalle.push(`${f}: ${m[0]} (tono ${Math.round(tono(r, g, b))}°)`);
    }
  }
}
for (const d of malas_detalle) {
  console.log("  FALLA · " + d);
  console.log("           No es de ninguna familia de la paleta. Usá MARCA de src/lib/theme.ts.");
}
if (!malas) console.log("  OK · todo el color pertenece a la paleta de la marca");
console.log(malas ? `\n${malas} color(es) fuera de la paleta.` : "\nColores: todo en orden.");
process.exitCode = malas ? 1 : 0;

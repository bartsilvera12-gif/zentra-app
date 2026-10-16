/**
 * Los colores de los reportes.
 *
 *   npm run test:colores-reporte
 *
 * Estas reglas no son de gusto. Dos colores que se tocan en una dona tienen
 * que distinguirse de verdad —con visión normal y con daltonismo—, y una
 * escala de magnitud tiene que ir de claro a oscuro sin saltos ni vueltas.
 *
 * El caso que las motivó: "Bajo mínimo" y "Agotados" eran dos ámbares a 11,6
 * de diferencia percibida, con el piso en 15. En la dona de inventario se
 * leían como el mismo color.
 */
import { PALETA, RAMPAS, colorDeBarra, pasoDeRampa } from "../src/lib/colores-reporte.ts";
import { buildReport } from "../src/lib/reportes.ts";

const casos = [];
const t = (n, f) => casos.push([n, f]);

/** sRGB → OKLab, para medir diferencia percibida y no distancia de hexadecimales. */
function oklab(hex) {
  const v = hex.replace("#", "");
  const l = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = l;
  const m = [
    Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b),
  ];
  return [
    0.2104542553 * m[0] + 0.793617785 * m[1] - 0.0040720468 * m[2],
    1.9779984951 * m[0] - 2.428592205 * m[1] + 0.4505937099 * m[2],
    0.0259040371 * m[0] + 0.7827717662 * m[1] - 0.808675766 * m[2],
  ];
}

const dif = (a, b) => {
  const x = oklab(a), y = oklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
};

const PISO = 15;

/**
 * Los juegos que de verdad comparten un gráfico.
 *
 * No se comparan todos contra todos: azul y verde nunca caen en la misma dona
 * —el verde es sólo de inventario— y exigir que se distingan entre sí sería
 * pedirle al sistema algo que no necesita, a costa de tonos peores en los
 * pares que sí conviven.
 */
const JUEGOS = {
  "ventas y compras": ["azul", "ambar"],
  inventario: ["verde", "ambar", "rojo"],
};

for (const modo of ["claro", "oscuro"]) {
  for (const [donde, nombres] of Object.entries(JUEGOS)) {
    t(`en ${modo}, los colores de ${donde} se distinguen entre si`, () => {
      for (let i = 0; i < nombres.length; i++) {
        for (let j = i + 1; j < nombres.length; j++) {
          const a = PALETA[modo][nombres[i]], b = PALETA[modo][nombres[j]];
          const d = dif(a, b);
          if (d < PISO) throw new Error(`${nombres[i]} y ${nombres[j]} a ${d.toFixed(1)}, piso ${PISO}`);
        }
      }
    });
  }

  t(`las rampas de ${modo} van de claro a oscuro sin volver`, () => {
    for (const [nombre, r] of Object.entries(RAMPAS)) {
      const luces = r[modo].map((c) => oklab(c)[0]);
      // En claro la rampa se oscurece; en oscuro se aclara, que es como se lee
      // sobre un fondo negro.
      const ordenada = modo === "claro"
        ? luces.every((l, i) => i === 0 || l < luces[i - 1])
        : luces.every((l, i) => i === 0 || l > luces[i - 1]);
      if (!ordenada) throw new Error(`${nombre} (${modo}) da vueltas: ${luces.map((l) => l.toFixed(2))}`);
    }
  });
}

t("la dona de inventario distingue bajo minimo de agotado", () => {
  // Es el error que motivó todo esto: son los dos estados que hay que
  // separar de un vistazo.
  for (const oscuro of [false, true]) {
    const m = buildReport(
      "inventario",
      "2026-10-01",
      "2026-10-15",
      {
        ventas: [],
        compras: [],
        productos: [
          { id: "1", nombre: "A", stock: 10, minimo: 2, precio: 1000, costo: 500 },
          { id: "2", nombre: "B", stock: 1, minimo: 5, precio: 1000, costo: 500 },
          { id: "3", nombre: "C", stock: 0, minimo: 5, precio: 1000, costo: 500 },
        ],
      },
      oscuro,
    );
    const bajo = m.dona.find((d) => d.label === "Bajo mínimo").color;
    const agotado = m.dona.find((d) => d.label === "Agotados").color;
    const d = dif(bajo, agotado);
    if (d < PISO) throw new Error(`${oscuro ? "oscuro" : "claro"}: a ${d.toFixed(1)}, piso ${PISO}`);
  }
});

t("la barra mas alta es la mas intensa", () => {
  const rampa = RAMPAS.azul.claro;
  if (colorDeBarra("azul", 100, 100, false) !== rampa[rampa.length - 1]) throw new Error("el máximo no se lleva el tono más fuerte");
  if (colorDeBarra("azul", 1, 100, false) !== rampa[0]) throw new Error("lo más chico no se lleva el más suave");
});

t("un dia sin movimiento no se pinta como si hubiera habido poco", () => {
  // Cero no es "poquito": no se le da el primer paso de la rampa por quedar
  // bien, se queda abajo igual.
  if (pasoDeRampa(0, 100, 5) !== 0) throw new Error("el cero se movió de lugar");
  if (pasoDeRampa(5, 0, 5) !== 0) throw new Error("sin máximo no hay escala");
});

t("la rampa no se sale de sus pasos", () => {
  for (const v of [-10, 0, 1, 50, 99, 100, 500]) {
    const p = pasoDeRampa(v, 100, 5);
    if (p < 0 || p > 4) throw new Error(`valor ${v} cayó en el paso ${p}`);
  }
});

let malas = 0;
for (const [n, f] of casos) {
  try { await f(); console.log("  OK · " + n); }
  catch (e) { malas++; console.log("  FALLA · " + n + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nColores de reporte: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

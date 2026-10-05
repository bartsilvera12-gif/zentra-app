/**
 * Pruebas de la preferencia de tema.
 *
 *   npm run test:tema
 *
 * El interruptor "Seguir al sistema" existía en Configuración y no hacía nada:
 * `auto` no se leía en ninguna parte. Un switch decorativo es peor que no
 * tenerlo — alguien lo apaga, no cambia nada, y deja de confiar en el resto de
 * la pantalla.
 */
import { leerPreferencia, guardarPreferencia, temaDelSistema } from "../src/lib/tema.ts";

const casos = [];
function t(n, f) { casos.push([n, f]); }
function igual(a, b, q) { if (a !== b) throw new Error(`${q}: esperaba ${JSON.stringify(b)}, fue ${JSON.stringify(a)}`); }

/** Un localStorage y un matchMedia de mentira, para no depender del navegador. */
function entorno({ guardado, oscuro }) {
  const datos = new Map(guardado ? [["zentra_tema_v1", guardado]] : []);
  globalThis.localStorage = {
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => datos.set(k, v),
  };
  globalThis.window = { matchMedia: (q) => ({ matches: oscuro && q.includes("dark") }) };
  return datos;
}

t("sin nada guardado, arranca siguiendo al teléfono", () => {
  entorno({ oscuro: true });
  const p = leerPreferencia();
  igual(p.auto, true, "auto");
  igual(p.tema, "oscuro", "tema");

  entorno({ oscuro: false });
  igual(leerPreferencia().tema, "claro", "tema claro");
});

t("una elección a mano se respeta aunque el sistema diga otra cosa", () => {
  // El teléfono está en oscuro y la persona eligió claro: manda la persona.
  entorno({ oscuro: true, guardado: JSON.stringify({ auto: false, tema: "claro" }) });
  const p = leerPreferencia();
  igual(p.auto, false, "auto");
  igual(p.tema, "claro", "tema");
});

t("la elección sobrevive a cerrar la app", () => {
  const datos = entorno({ oscuro: false });
  guardarPreferencia({ auto: false, tema: "oscuro" });
  // Otra corrida, mismo almacenamiento.
  globalThis.localStorage = {
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => datos.set(k, v),
  };
  const p = leerPreferencia();
  igual(p.auto, false, "auto");
  igual(p.tema, "oscuro", "tema");
});

t("un guardado roto no deja la app sin tema", () => {
  entorno({ oscuro: true, guardado: "{ esto no es json" });
  const p = leerPreferencia();
  igual(p.auto, true, "vuelve a seguir al sistema");
  igual(p.tema, "oscuro", "tema");
});

t("sin matchMedia —un WebView viejo— se asume claro y no revienta", () => {
  entorno({ oscuro: false });
  globalThis.window = {};
  igual(temaDelSistema(), "claro", "tema");
});

let malas = 0;
for (const [n, f] of casos) {
  try { await f(); console.log("  OK · " + n); }
  catch (e) { malas++; console.log("  FALLA · " + n + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nTema: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

/**
 * Que el marco del teléfono no aparezca adentro de la app.
 *
 *   npm run test:marco
 *
 * En pantalla grande, la app se dibuja adentro de un teléfono: es la maqueta
 * del diseño. Adentro del APK eso no va, y la regla que lo sacaba miraba el
 * ancho (440 px). Alcanzaba mientras la app viviera sólo en celulares; en una
 * tablet, que es más ancha, el APK mostraba un teléfono dibujado en el medio
 * de la pantalla y abajo el texto de ayuda de la maqueta.
 *
 * Es una prueba sobre el CSS y no sobre una pantalla porque el síntoma vive
 * ahí, y porque sólo se ve en un aparato que no tenemos.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const css = readFileSync("src/app/globals.css", "utf8");
const ctx = readFileSync("src/store/AppContext.tsx", "utf8");

test("hay una regla que saca el marco sin mirar el ancho", () => {
  assert.match(css, /\.zt-nativo \.zt-marco/, "falta la regla del marco");
  assert.match(css, /\.zt-nativo \.zt-maqueta \{ display: none; \}/, "el texto de la maqueta sigue a la vista");
});

test("alguien le pone esa clase al documento", () => {
  // Una regla CSS que nadie activa es peor que no tenerla: parece arreglado.
  assert.match(ctx, /classList\.add\("zt-nativo"\)/);
  assert.match(ctx, /esNativo\(\)/);
});

test("la regla del ancho sigue, para el navegador", () => {
  // En el navegador la maqueta tiene sentido y no se toca.
  assert.match(css, /@media \(max-width: 440px\)/);
});

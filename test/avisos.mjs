/**
 * El aviso de stock bajo el mínimo.
 *
 *   npm run test:avisos
 *
 * Lo que importa probar acá no es que avise, sino que **no** avise de más: un
 * aviso que sale cada vez que se abre la pantalla deja de leerse a la tercera.
 */
import { bajoMinimo, hayNovedad, textoAviso } from "../src/lib/avisos.ts";

const casos = [];
const t = (nombre, fn) => casos.push([nombre, fn]);
const p = (id, nombre, stock, minimo) => ({
  id, nombre, stock, minimo, sku: id.toUpperCase(), costo: 0, precio: 0,
  unidad: "UNIDAD", categoria: "", deposito: "", iva: "10%", metodo: "CPP", barras: "",
});

t("bajo el mínimo incluye el que está justo en el mínimo", () => {
  const r = bajoMinimo([p("a", "A", 5, 10), p("b", "B", 10, 10), p("c", "C", 11, 10)]);
  if (r.map((x) => x.id).join() !== "a,b") throw new Error("mal: " + r.map((x) => x.id).join());
});

t("un producto sin mínimo cargado no cuenta", () => {
  if (bajoMinimo([p("a", "A", 0, 0)]).length !== 0) throw new Error("un mínimo en cero no es un umbral");
});

t("con un solo producto el aviso lo nombra", () => {
  const txt = textoAviso([p("a", "Cerveza lata 350 ml", 2, 10)]);
  if (!txt.cuerpo.includes("Cerveza lata 350 ml")) throw new Error("no nombró el producto");
  if (!txt.cuerpo.includes("2") || !txt.cuerpo.includes("10")) throw new Error("no dijo cuánto queda ni el mínimo");
});

t("con varios dice cuántos son", () => {
  const txt = textoAviso([p("a", "A", 1, 5), p("b", "B", 0, 5), p("c", "C", 2, 5)]);
  if (!txt.titulo.includes("3")) throw new Error("no dijo cuántos: " + txt.titulo);
});

t("sin productos bajos no hay aviso", () => {
  if (textoAviso([]) !== null) throw new Error("no debería haber texto");
});

t("no avisa dos veces por lo mismo", () => {
  const bajos = [p("a", "A", 1, 5)];
  if (hayNovedad(bajos, [])) {
    // primera vez sí
  } else throw new Error("la primera vez tiene que avisar");
  if (hayNovedad(bajos, ["a"])) throw new Error("ya se había avisado por 'a'");
});

t("avisa de nuevo cuando cae otro producto", () => {
  const bajos = [p("a", "A", 1, 5), p("b", "B", 2, 5)];
  if (!hayNovedad(bajos, ["a"])) throw new Error("'b' es nuevo, tiene que avisar");
});

t("si uno se recupera y vuelve a caer, vuelve a avisar", () => {
  // Se avisó por 'a'; se repuso (ya no está en la lista) y después volvió a bajar.
  const despuesDeReponer = [];
  const avisados = despuesDeReponer.map((x) => x.id); // queda vacío
  if (!hayNovedad([p("a", "A", 1, 5)], avisados)) throw new Error("tiene que volver a avisar");
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nAvisos: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

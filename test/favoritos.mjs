/**
 * Los favoritos de la bandeja de emojis.
 *
 *   npm run test:favoritos
 *
 * Lo que importa acá es que la pantalla no se rompa cuando el almacenamiento
 * del teléfono no está: en una ventana privada `localStorage` tira excepción al
 * leerlo, y sin esto la bandeja no abriría.
 */
import { alternarFavorito, guardarFavoritos, leerFavoritos, ordenarPorFavoritos } from "../src/lib/favoritos.ts";

const casos = [];
const t = (nombre, fn) => casos.push([nombre, fn]);

t("marcar y desmarcar", () => {
  let f = [];
  f = alternarFavorito(f, "🔥");
  if (f.length !== 1) throw new Error("no marcó");
  f = alternarFavorito(f, "👍");
  if (f.length !== 2) throw new Error("no marcó el segundo");
  f = alternarFavorito(f, "🔥");
  if (f.join() !== "👍") throw new Error("no desmarcó");
});

t("los favoritos van primero y nada se repite ni se pierde", () => {
  const todos = ["a", "b", "c", "d"];
  const r = ordenarPorFavoritos(todos, ["c", "a"]);
  if (r.join() !== "c,a,b,d") throw new Error("orden equivocado: " + r.join());
  if (r.length !== todos.length) throw new Error("cambió la cantidad");
});

t("un favorito que ya no está en la lista no inventa un botón", () => {
  const r = ordenarPorFavoritos(["a", "b"], ["z", "a"]);
  if (r.join() !== "a,b") throw new Error("coló uno que no existe: " + r.join());
});

t("sin localStorage no revienta: devuelve vacío y guardar no tira", () => {
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new Error("almacenamiento bloqueado"); },
  });
  try {
    if (leerFavoritos().length !== 0) throw new Error("debería ser vacío");
    guardarFavoritos(["🔥"]); // no debe tirar
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
  }
});

t("un guardado roto no deja la bandeja sin abrir", () => {
  const guardado = {};
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => "{ esto no es json", setItem: (k, v) => (guardado[k] = v) },
  });
  if (leerFavoritos().length !== 0) throw new Error("debería ignorar el guardado roto");
});

t("un guardado que no es una lista de textos se descarta", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => JSON.stringify([1, "🔥", null]), setItem: () => {} },
  });
  if (leerFavoritos().join() !== "🔥") throw new Error("no filtró lo que no es texto");
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nFavoritos: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

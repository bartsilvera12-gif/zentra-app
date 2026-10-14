/**
 * Las pestañas de colas del listado de conversaciones.
 *
 *   npm run test:colas
 *
 * Lo que se cuida acá es que la fila de pestañas no aparezca cuando el ERP no
 * informa la cola: esa es la mitad de los ERP, y una pestaña "Todas" sola
 * ocupa lugar sin hacer nada.
 */
import { SIN_COLA, TODAS, colaDe, colasDe, enCola } from "../src/lib/colas.ts";

const casos = [];
const t = (n, f) => casos.push([n, f]);

const chat = (id, cola, noLeidos = 0) => ({
  id,
  nombre: id,
  tipo: "Cliente",
  refId: null,
  enLinea: false,
  hora: "",
  noLeidos,
  cola,
  msgs: [],
});
const sinLeer = (c) => c.noLeidos;

t("sin colas informadas no hay pestañas", () => {
  const r = colasDe([chat("a", null), chat("b", undefined)], sinLeer);
  if (r.length !== 0) throw new Error("no habia nada que dividir: " + JSON.stringify(r));
});

t("una cola vacia de texto es no informada", () => {
  if (colaDe(chat("a", "   ")) !== null) throw new Error("espacios no son una cola");
});

t("cuenta conversaciones y sin leer por cola", () => {
  const r = colasDe([chat("a", "Ventas", 3), chat("b", "Ventas", 0), chat("c", "Soporte", 1)], sinLeer);
  const ventas = r.find((c) => c.nombre === "Ventas");
  if (ventas.total !== 2 || ventas.sinLeer !== 1) throw new Error(JSON.stringify(ventas));
});

t("orden alfabetico y 'Sin cola' al final", () => {
  const r = colasDe([chat("a", null), chat("b", "Ventas"), chat("c", "Soporte")], sinLeer);
  const nombres = r.map((c) => c.nombre);
  if (nombres.join("|") !== "Soporte|Ventas|" + SIN_COLA) throw new Error(nombres.join("|"));
});

t("'Todas' no filtra nada", () => {
  if (!enCola(chat("a", "Ventas"), TODAS)) throw new Error("Todas tiene que dejar pasar todo");
  if (!enCola(chat("a", null), "")) throw new Error("sin eleccion tambien pasa todo");
});

t("la pestaña de una cola deja pasar solo la suya", () => {
  if (!enCola(chat("a", "Ventas"), "Ventas")) throw new Error("la suya tiene que pasar");
  if (enCola(chat("b", "Soporte"), "Ventas")) throw new Error("la de otra cola no");
});

t("las que no tienen cola caen en 'Sin cola'", () => {
  if (!enCola(chat("a", null), SIN_COLA)) throw new Error("tiene que caer en Sin cola");
  if (enCola(chat("a", null), "Ventas")) throw new Error("no es de Ventas");
});

let fallas = 0;
for (const [nombre, f] of casos) {
  try {
    f();
    console.log("  ok   " + nombre);
  } catch (e) {
    fallas++;
    console.log("  FALLA " + nombre + "\n         " + e.message);
  }
}
console.log(`\n${casos.length - fallas}/${casos.length} casos`);
process.exit(fallas ? 1 : 0);

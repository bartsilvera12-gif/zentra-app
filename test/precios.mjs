/**
 * Qué precio le corresponde a cada cliente.
 *
 *   npm run test:precios
 *
 * Es una regla de plata: si se equivoca, se cobra de menos a todo el mundo o
 * de más a un mayorista. Por eso vive aparte de la pantalla y se prueba sola.
 */
import { esMayorista, precioPara } from "../src/lib/precios.ts";

const casos = [];
const t = (nombre, fn) => casos.push([nombre, fn]);
const prod = (precio, mayorista) => ({ id: "p", nombre: "x", sku: "X", stock: 1, precio, precioMayorista: mayorista });
const cli = (lista) => ({ id: "c", nombre: "C", doc: "", contacto: "", tel: "", email: "", estado: "Activo", origen: "Manual", saldo: 0, compras: 0, desde: "", zona: "", lista });

t("sin cliente identificado se cobra el de mostrador", () => {
  if (precioPara(prod(12000, 9000), null) !== 12000) throw new Error("una venta sin nombre no es mayorista");
});

t("un cliente mayorista paga el mayorista", () => {
  if (precioPara(prod(12000, 9000), cli("Mayorista")) !== 9000) throw new Error("no aplicó el mayorista");
});

t("un cliente minorista paga el de mostrador", () => {
  if (precioPara(prod(12000, 9000), cli("Minorista")) !== 12000) throw new Error("no debería aplicar mayorista");
});

t("la lista se reconoce sin importar mayúsculas ni la palabra exacta", () => {
  for (const l of ["mayorista", "MAYORISTA", "Lista mayorista", "Mayoristas"]) {
    if (!esMayorista(cli(l))) throw new Error("no reconoció: " + l);
  }
});

t("un producto sin mayorista cargado cae al de mostrador, no a cero", () => {
  if (precioPara(prod(12000, null), cli("Mayorista")) !== 12000) throw new Error("cobró mal");
  if (precioPara(prod(12000, undefined), cli("Mayorista")) !== 12000) throw new Error("cobró mal");
});

t("un mayorista en cero no se cobra: es un dato sin cargar, no un regalo", () => {
  if (precioPara(prod(12000, 0), cli("Mayorista")) !== 12000) throw new Error("cobró cero");
});

t("un cliente sin lista paga el de mostrador", () => {
  if (precioPara(prod(12000, 9000), cli(undefined)) !== 12000) throw new Error("sin lista es mostrador");
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nPrecios: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

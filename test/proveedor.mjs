/**
 * El proveedor que se carga desde el teléfono.
 *
 *   npm run test:proveedor
 *
 * Ahora se carga desde dos lados —Proveedores y el paso de proveedor de una
 * compra— y los dos tienen que dejar la misma ficha. Esto es lo que lo asegura.
 */
import { idLocal, nombreValido, nuevoProveedor } from "../src/lib/proveedor.ts";

const casos = [];
const t = (nombre, fn) => casos.push([nombre, fn]);

t("un nombre de una letra no es un nombre", () => {
  if (nombreValido("A")) throw new Error("debería rechazarlo");
  if (nombreValido("   ")) throw new Error("espacios no son nombre");
  if (!nombreValido(" Don Luis ")) throw new Error("debería aceptarlo");
});

t("el id no choca con los del ERP", () => {
  if (!idLocal([]).startsWith("pvn")) throw new Error("falta el prefijo local");
  const a = idLocal([]);
  const b = idLocal([{ id: a }]);
  if (a === b) throw new Error("dos proveedores con el mismo id");
});

t("con sólo el nombre queda una ficha completa", () => {
  const p = nuevoProveedor({ nombre: "Distribuidora del Este" }, []);
  if (p.nombre !== "Distribuidora del Este") throw new Error("perdió el nombre");
  if (p.doc !== "Sin RUC") throw new Error("el RUC vacío debería decir Sin RUC");
  if (p.rubro !== "Sin rubro" || p.ciudad !== "Sin ciudad") throw new Error("huecos sin texto");
  if (p.tel !== "—" || p.email !== "—") throw new Error("los vacíos deberían ser guión");
  if (p.estado !== "Activo") throw new Error("un proveedor nuevo está activo");
  if (p.entrega !== 1) throw new Error("la entrega por defecto es un día");
  if (p.chatId !== null) throw new Error("no tiene conversación todavía");
});

t("sin contacto, el contacto es el nombre", () => {
  const p = nuevoProveedor({ nombre: "Don Luis" }, []);
  if (p.contacto !== "Don Luis") throw new Error("el contacto quedó vacío");
});

t("el RUC lleva el prefijo una sola vez", () => {
  const p = nuevoProveedor({ nombre: "Comercial Sur", doc: " 80012345-6 " }, []);
  if (p.doc !== "RUC 80012345-6") throw new Error("mal armado: " + p.doc);
});

t("contado y crédito dejan la condición escrita", () => {
  if (nuevoProveedor({ nombre: "Uno" }, []).condicion !== "Contado") throw new Error("por defecto es contado");
  const c = nuevoProveedor({ nombre: "Dos", credito: true, plazo: 45 }, []);
  if (c.condicion !== "Crédito 45 días") throw new Error("mal la condición: " + c.condicion);
  const sinPlazo = nuevoProveedor({ nombre: "Tres", credito: true }, []);
  if (sinPlazo.condicion !== "Crédito 30 días") throw new Error("el plazo por defecto son 30 días");
});

t("una entrega con basura no rompe la ficha", () => {
  if (nuevoProveedor({ nombre: "Cuatro", entrega: "ocho" }, []).entrega !== 1) throw new Error("debería caer en 1");
  if (nuevoProveedor({ nombre: "Cinco", entrega: "7" }, []).entrega !== 7) throw new Error("no leyó el número");
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nProveedor: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

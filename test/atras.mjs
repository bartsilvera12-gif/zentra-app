/**
 * Pruebas del botón "atrás" de Android.
 *
 *   npm run test:atras
 *
 * Sin esto, el gesto más usado del sistema cerraba la app desde cualquier
 * pantalla: mirabas un cliente, volvías por costumbre, y te sacaba afuera.
 */
import { decidirAtras } from "../src/lib/atras.ts";
import { initialState } from "../src/store/state.ts";

const casos = [];
function t(nombre, fn) { casos.push([nombre, fn]); }
const base = (extra) => ({ ...initialState, ...extra });

t("con el menú de la cuenta abierto, atrás lo cierra y nada más", () => {
  // Lo primero que cierra "atrás" es lo último que se abrió.
  const r = decidirAtras(base({ screen: "clientes", cSub: "detalle", menuPerfil: true }));
  if (r === "fondo") throw new Error("se salió de la app");
  if (r.menuPerfil !== false) throw new Error("no cerró el menú");
  if (r.cSub) throw new Error("además se llevó la pantalla puesta");
});

t("desde un detalle vuelve a la lista, no se sale", () => {
  const r = decidirAtras(base({ screen: "clientes", cSub: "detalle", cSel: "c1" }));
  if (r === "fondo") throw new Error("se salió de la app");
  if (r.cSub !== "lista") throw new Error("no volvió a la lista");
  // El seleccionado se limpia: volver y que siga abierto el de antes confunde.
  if (r.cSel !== null) throw new Error("dejó el cliente seleccionado");
});

t("desde la lista de un módulo vuelve al inicio", () => {
  const r = decidirAtras(base({ screen: "clientes", cSub: "lista" }));
  if (r === "fondo") throw new Error("se salió de la app");
  if (r.screen !== "home") throw new Error("no fue al inicio: " + JSON.stringify(r));
});

t("desde el inicio manda la app al fondo, no la cierra", () => {
  // Cerrar pierde el carrito a medio armar. Nadie espera que "atrás" borre
  // lo que estaba cargando.
  if (decidirAtras(base({ screen: "home" })) !== "fondo") throw new Error("no mandó al fondo");
});

t("en el login sí corresponde salir", () => {
  if (decidirAtras(base({ screen: "login" })) !== "fondo") throw new Error("debería salir");
});

t("cada módulo con subpantalla vuelve a su propia lista", () => {
  const pares = [
    ["inventario", "iSub", "detalle"],
    ["compras", "kSub", "detalle"],
    ["proveedores", "vwSub", "detalle"],
    ["detventas", "dvSub", "factura"],
  ];
  for (const [screen, campo, sub] of pares) {
    const r = decidirAtras(base({ screen, [campo]: sub }));
    if (r === "fondo") throw new Error(`${screen}: se salió`);
    if (r[campo] !== "lista") throw new Error(`${screen}: no volvió a la lista`);
  }
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nBotón atrás: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

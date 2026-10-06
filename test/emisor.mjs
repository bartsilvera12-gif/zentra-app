/**
 * Quién sale en la cabecera de la factura.
 *
 *   npm run test:emisor
 *
 * Esto estaba escrito a mano con el nombre y el RUC de un cliente de ejemplo:
 * toda factura emitida desde cualquier otra empresa salía con el RUC ajeno. Lo
 * que estas pruebas aseguran es que lo que no está configurado no se invente.
 */
import { datosEmisor, lineaEmisor } from "../src/lib/emisor.ts";

const casos = [];
const t = (nombre, fn) => casos.push([nombre, fn]);
const tenant = (o = {}) => ({
  codigo: "JM", nombre: "", supabaseUrl: "", anonKey: "", schema: "zentra",
  apiUrl: "", publico: false, plan: "max", ruc: "", ciudad: "", ...o,
});

t("sin nada configurado, la factura lo dice", () => {
  const e = datosEmisor(null);
  if (!e.falta) throw new Error("debería avisar que falta todo");
  if (!/razón social/.test(e.falta) || !/RUC/.test(e.falta)) throw new Error("no nombra qué falta: " + e.falta);
  if (e.ruc !== "") throw new Error("no debe inventar un RUC");
});

t("el nombre de la sesión gana sobre el del directorio", () => {
  const e = datosEmisor(tenant({ nombre: "Del directorio" }), "Del ERP");
  if (e.nombre !== "Del ERP") throw new Error("ganó el del directorio: " + e.nombre);
});

t("sin sesión, se usa el del directorio", () => {
  if (datosEmisor(tenant({ nombre: "Del directorio" })).nombre !== "Del directorio") throw new Error("lo perdió");
  if (datosEmisor(tenant({ nombre: "Del directorio" }), "   ").nombre !== "Del directorio") throw new Error("espacios no son nombre");
});

t("con nombre pero sin RUC sigue faltando el RUC", () => {
  const e = datosEmisor(tenant({ nombre: "Comercial Sur" }));
  if (!e.falta || !/RUC/.test(e.falta)) throw new Error("debería faltar el RUC");
  if (/razón social/.test(e.falta)) throw new Error("la razón social sí está");
});

t("con nombre y RUC no falta nada", () => {
  const e = datosEmisor(tenant({ nombre: "Comercial Sur", ruc: "80012345-6", ciudad: "Asunción" }));
  if (e.falta !== null) throw new Error("no debería faltar nada: " + e.falta);
});

t("la ciudad no es obligatoria", () => {
  const e = datosEmisor(tenant({ nombre: "Comercial Sur", ruc: "80012345-6" }));
  if (e.falta !== null) throw new Error("la ciudad no hace inválido el comprobante");
});

t("la línea del encabezado dice la verdad cuando no hay RUC", () => {
  const sin = lineaEmisor(datosEmisor(tenant({ nombre: "X" })));
  if (!/Sin RUC cargado/.test(sin)) throw new Error("debería decirlo: " + sin);
  const con = lineaEmisor(datosEmisor(tenant({ nombre: "X", ruc: "80012345-6", ciudad: "Asunción" })));
  if (con !== "RUC 80012345-6 · Asunción") throw new Error("mal armada: " + con);
  const sinCiudad = lineaEmisor(datosEmisor(tenant({ nombre: "X", ruc: "80012345-6" })));
  if (sinCiudad !== "RUC 80012345-6") throw new Error("separador colgado: " + sinCiudad);
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nEmisor: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

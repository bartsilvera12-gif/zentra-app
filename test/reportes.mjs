/**
 * Pruebas del armado de los reportes.
 *
 *   npm run test:reportes
 *
 * Lo que se cuida acá es que ningún número salga de la nada. Antes inventario y
 * compras se proyectaban de una serie fija y se escalaban "para que el total
 * quedara creíble": se leían perfecto y eran mentira.
 */
import { buildReport } from "../src/lib/reportes.ts";
import { isoOf as isoOfLocal } from "../src/lib/format.ts";

const casos = [];
function t(n, f) { casos.push([n, f]); }
function igual(a, b, q) { if (a !== b) throw new Error(`${q}: esperaba ${JSON.stringify(b)}, fue ${JSON.stringify(a)}`); }

const venta = (iso, qty, precio, iva, estado) => ({
  id: "v" + iso + qty, iso, fecha: iso, numero: "VTA-1", cliId: null, cliente: "x", doc: "x",
  pago: "Contado · efectivo", estado,
  lineas: [{ nombre: "GASEOSA", qty, precio, iva }],
});
const compra = (fecha, cantidad, costo, estado, pago) => ({
  id: "k" + fecha + cantidad, numero: "CMP-1", provId: "p1", producto: "GASEOSA",
  cantidad, costo, iva: "10%", pago, plazo: 0, cuotas: 0, estado, fecha, factura: "", timbrado: "",
});
const prod = (nombre, stock, minimo, costo) => ({
  id: nombre, nombre, sku: nombre, stock, minimo, costo, precio: costo * 2,
  unidad: "UNIDAD", categoria: "", deposito: "", iva: "10%", metodo: "CPP", barras: "",
});

const vacio = { ventas: [], compras: [], productos: [] };

t("ventas: suma el rango y separa cobrado de por cobrar", () => {
  const m = buildReport("ventas", "2026-10-01", "2026-10-03", {
    ...vacio,
    ventas: [
      venta("2026-10-01", 2, 10000, "10%", "Cobrada"),
      venta("2026-10-02", 1, 30000, "10%", "Pendiente"),
      // Fuera del rango: no tiene que entrar en ningún total.
      venta("2026-09-30", 5, 99999, "10%", "Cobrada"),
    ],
  });
  igual(m.total, 50000, "total");
  igual(m.facturas, 2, "facturas");
  igual(m.donaValor, "40%", "cobrado");
  igual(m.buckets.length, 3, "un punto por día");
});

t("compras: el total es cantidad por costo, y separa lo que falta pagar", () => {
  const m = buildReport("compras", "2026-10-01", "2026-10-02", {
    ...vacio,
    compras: [
      compra("2026-10-01", 10, 5000, "Pagada", "Contado"),
      compra("2026-10-02", 2, 25000, "Pendiente", "Crédito"),
    ],
  });
  igual(m.total, 100000, "total");
  const porPagar = m.kpis.find((k) => k.label === "Por pagar");
  igual(porPagar.valor.replace(/[^0-9]/g, ""), "50000", "por pagar");
  igual(m.donaValor, "50%", "contado");
});

t("inventario: valúa stock por costo y no cuenta dos veces lo agotado", () => {
  const m = buildReport("inventario", "2026-10-01", "2026-10-31", {
    ...vacio,
    productos: [
      prod("A", 10, 5, 1000),  // normal
      prod("B", 3, 5, 2000),   // bajo mínimo
      prod("C", 0, 5, 3000),   // agotado
    ],
  });
  igual(m.total, 16000, "valuación");
  const bajo = m.kpis.find((k) => k.label === "Bajo mínimo");
  // El agotado se cuenta aparte: sumarlo en los dos lados abulta el problema.
  igual(bajo.valor, "1", "bajo mínimo");
  igual(bajo.delta, "1 agotado", "agotados");
  // Es una foto: el gráfico no depende del rango de fechas.
  igual(m.esFoto, true, "esFoto");
});

t("sin datos no inventa: ni totales, ni porcentajes, ni composición", () => {
  for (const tab of ["ventas", "compras", "inventario"]) {
    const m = buildReport(tab, "2026-10-01", "2026-10-07", vacio);
    igual(m.total, 0, tab + " total");
    igual(m.rank.length, 0, tab + " ranking");
    // Una dona de colores sobre cero inventa una composición que no existe.
    igual(m.dona.length, 0, tab + " dona");
    igual(m.kpis[0].valor, "—", tab + " kpi");
  }
});

t("el rango largo se junta en 7 tramos, no en 60 barras ilegibles", () => {
  const m = buildReport("ventas", "2026-08-01", "2026-09-29", vacio);
  if (m.buckets.length > 7) throw new Error("tramos: " + m.buckets.length);
});

t("los presets cuentan desde hoy, no desde una fecha escrita en el codigo", async () => {
  const { haceDias, hoyIso, inicioDeMes, isoOf } = await import("../src/lib/format.ts");
  const hoy = new Date();
  igual(hoyIso(), isoOf(hoy), "hoy");
  // "7 dias" incluye hoy: son hoy y los seis anteriores.
  const hace6 = new Date(hoy); hace6.setDate(hace6.getDate() - 6);
  igual(haceDias(7), isoOf(hace6), "7 dias");
  igual(haceDias(1), hoyIso(), "hoy es un solo dia");
  igual(inicioDeMes().slice(8), "01", "el mes arranca el 1");
});

t("isoOf usa la fecha local, no UTC", () => {
  // En Paraguay (UTC-3), a las 22:00 toISOString() ya devuelve el dia
  // siguiente: "Hoy" pasaba a ser maniana y el rango salia vacio.
  const tarde = new Date(2026, 9, 5, 22, 30);
  igual(isoOfLocal(tarde), "2026-10-05", "la noche del 5 sigue siendo el 5");
});

let malas = 0;
for (const [n, f] of casos) {
  try { await f(); console.log("  OK · " + n); }
  catch (e) { malas++; console.log("  FALLA · " + n + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nReportes: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

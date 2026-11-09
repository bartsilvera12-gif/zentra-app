/**
 * Presupuestos: qué estado se muestra, cuánto suma y qué le llega al cliente.
 *
 *   npm run test:presupuestos
 *
 * Son las tres cosas que, si salen mal, salen mal delante del cliente.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { enlaceWhatsApp, estadoVisible, textoParaCompartir, totalPresupuesto } from "../src/lib/presupuestos.ts";
import { motivoBloqueo } from "../src/lib/planes.ts";

const HOY = new Date(2026, 10, 9); // 9 de noviembre de 2026

const ejemplo = (cambios = {}) => ({
  id: "x",
  numero: "PRE-000007",
  iso: "2026-11-01",
  fecha: "1 nov 2026",
  validoHasta: "2026-11-15",
  cliId: "c1",
  cliente: "Despensa Doña Lucía",
  doc: "RUC 80012345-6",
  estado: "pendiente",
  notas: "",
  ventaId: null,
  lineas: [
    { prodId: "p1", nombre: "Gaseosa cola 2 L", qty: 24, precio: 12000, iva: "10%" },
    { prodId: "p4", nombre: "Jugo natural 1 L", qty: 2, precio: 11500, iva: "5%" },
  ],
  ...cambios,
});

test("un pendiente vence al pasar su último día, no antes", () => {
  assert.equal(estadoVisible(ejemplo({ validoHasta: "2026-11-09" }), HOY), "pendiente");
  assert.equal(estadoVisible(ejemplo({ validoHasta: "2026-11-08" }), HOY), "vencido");
});

test("lo aceptado, vendido o rechazado no vence", () => {
  // El cliente ya contestó: que pase la fecha no cambia lo que dijo.
  for (const estado of ["aceptado", "convertido", "rechazado"]) {
    assert.equal(estadoVisible(ejemplo({ estado, validoHasta: "2026-01-01" }), HOY), estado);
  }
});

test("el total es cantidad por precio, con el IVA ya incluido", () => {
  assert.equal(totalPresupuesto(ejemplo()), 24 * 12000 + 2 * 11500);
});

test("el texto de WhatsApp lleva negocio, número, productos, total y validez", () => {
  const t = textoParaCompartir(ejemplo({ notas: "Entrega sin costo." }), "Distribuidora JM");
  assert.match(t, /^\*Distribuidora JM\*/);
  assert.match(t, /Presupuesto PRE-000007/);
  assert.match(t, /Para: Despensa Doña Lucía/);
  assert.match(t, /• 24 × Gaseosa cola 2 L: ₲ 288\.000/);
  assert.match(t, /\*Total: ₲ 311\.000\* \(IVA incluido\)/);
  assert.match(t, /Válido hasta el 15\/11\/2026\./);
  assert.match(t, /Entrega sin costo\.$/);
  assert.doesNotMatch(t, /\n{3,}/, "no deja renglones vacíos de más");
});

test("sin cliente ni negocio el texto igual queda prolijo", () => {
  const t = textoParaCompartir(ejemplo({ cliente: "Sin nombre" }), "");
  assert.match(t, /^Presupuesto PRE-000007/);
  assert.doesNotMatch(t, /Para:/);
});

test("el enlace va al chat del cliente con su número en formato de Paraguay", () => {
  assert.match(enlaceWhatsApp("hola", "0981 445 210"), /^https:\/\/wa\.me\/595981445210\?text=hola$/);
  assert.match(enlaceWhatsApp("hola", "595981445210"), /^https:\/\/wa\.me\/595981445210\?/);
  // Sin teléfono, WhatsApp deja elegir a quién mandarlo.
  assert.match(enlaceWhatsApp("hola", null), /^https:\/\/wa\.me\/\?text=hola$/);
  // El texto va codificado: los saltos de línea y los asteriscos sobreviven.
  assert.match(enlaceWhatsApp("*a*\nb", null), /text=\*a\*%0Ab$/);
});

test("presupuestos es de Emprendedor y Max, no del gratis", () => {
  const ctx = (plan) => ({ conErp: false, plan });
  assert.ok(motivoBloqueo("presupuestos.modulo", ctx("free")));
  assert.equal(motivoBloqueo("presupuestos.modulo", ctx("emprendedor")), null);
  assert.equal(motivoBloqueo("presupuestos.modulo", ctx("max")), null);
});

test("Inicio muestra Conversaciones sólo con ERP, y Presupuestos sin él", () => {
  const home = readFileSync("src/mobile/screens/HomeScreen.tsx", "utf8");
  assert.match(home, /usaApiDelErp\(\) \?\s*\(\s*<Tile[\s\S]*?k="conversaciones"[\s\S]*?\) : \(\s*<Tile[\s\S]*?k="presupuestos"/);
});

test("ningún plan vende el chat: sin ERP no existe", () => {
  const planes = readFileSync("src/lib/planes.ts", "utf8");
  const pagina = readFileSync("server/src/pagina.js", "utf8");
  assert.doesNotMatch(planes, /"Chat de WhatsApp"/);
  assert.doesNotMatch(pagina, /"Conversaciones de WhatsApp"/);
});

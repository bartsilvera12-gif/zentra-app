/**
 * Que "Exportar" exporte.
 *
 *   npm run test:exportar
 *
 * El botón existía desde el prototipo y no hacía nada: cambiaba un booleano y
 * escribía "✓ Exportado" sin que hubiera ningún archivo. Las pruebas de acá
 * son sobre el contenido —que estén los números que se vieron en pantalla— y
 * sobre las tres salidas posibles, que es donde está la parte difícil: en el
 * APK se comparte, en el navegador se descarga, y si no se puede ninguna de
 * las dos queda copiado.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { celda, csvDeReporte, exportarArchivo, nombreDeArchivo } from "../src/lib/exportar.ts";

const MODELO = {
  dias: 7,
  total: 2675000,
  kpis: [{ label: "Facturado", valor: "₲ 2.675.000", delta: "" }],
  buckets: [{ dia: "10 oct", v: 500000 }, { dia: "11 oct", v: 0 }],
  rank: [{ label: "Gaseosa cola 2 L", v: 120000, sub: "10 un." }],
  dona: [{ label: "Cobrado", pct: 69 }],
  tabla: [{ k: "VTA-000147", sub: "Despensa Doña Lucía", v: "₲ 445.833" }],
  esFoto: false,
};

const opc = { tab: "ventas", desde: "2026-10-10", hasta: "2026-10-16" };

test("el archivo lleva los numeros que se vieron en pantalla", () => {
  const csv = csvDeReporte(MODELO, opc);
  for (const debe of ["Facturado", "2675000", "10 oct", "Gaseosa cola 2 L", "VTA-000147", "Cobrado"]) {
    assert.ok(csv.includes(debe), "falta: " + debe);
  }
  assert.ok(csv.includes("2026-10-10") && csv.includes("2026-10-16"), "no dice de qué período es");
});

test("los montos van sin separador de miles", () => {
  // Con puntos, la planilla los lee como texto y no se pueden sumar, que es
  // justo lo que se va a hacer con un reporte exportado.
  const csv = csvDeReporte(MODELO, opc);
  assert.ok(csv.includes(";500000"), "el monto del día no es un número");
  assert.ok(!/;500\.000/.test(csv), "quedó un monto con puntos");
});

test("el archivo abre bien en Excel en español", () => {
  const csv = csvDeReporte(MODELO, opc);
  assert.ok(csv.startsWith("﻿"), "sin BOM los acentos salen rotos");
  assert.ok(csv.includes(";"), "con coma, Excel mete todo en una columna");
});

test("un punto y coma adentro de un texto no corre las columnas", () => {
  assert.equal(celda("Gaseosa; 2 L"), '"Gaseosa; 2 L"');
  assert.equal(celda('Marca "X"'), '"Marca ""X"""');
  assert.equal(celda(1000), "1000");
});

test("el nombre del archivo dice que es y de cuando", () => {
  assert.equal(nombreDeArchivo("ventas", "2026-10-10", "2026-10-16"), "zentra-ventas-2026-10-10_2026-10-16.csv");
});

test("en el telefono se comparte", async () => {
  let compartido = null;
  const r = await exportarArchivo("a.csv", "hola", {
    nav: { canShare: () => true, share: async (d) => { compartido = d; } },
  });
  assert.equal(r, "compartido");
  assert.ok(compartido, "no llamó a compartir");
});

test("cancelar el menu de compartir no es un error", async () => {
  // Quien cancela decidió no mandarlo: no hay nada que avisar ni que
  // reintentar por otro camino.
  const r = await exportarArchivo("a.csv", "hola", {
    nav: {
      canShare: () => true,
      share: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; },
    },
  });
  assert.equal(r, null);
});

test("sin compartir, queda el portapapeles antes que no hacer nada", async () => {
  let copiado = "";
  const r = await exportarArchivo("a.csv", "hola", {
    nav: { clipboard: { writeText: async (t) => { copiado = t; } } },
  });
  assert.equal(r, "copiado");
  assert.equal(copiado, "hola");
});

test("si no se puede de ninguna forma, se dice", async () => {
  const r = await exportarArchivo("a.csv", "hola", { nav: {} });
  assert.equal(r, "error");
});

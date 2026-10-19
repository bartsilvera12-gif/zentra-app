/**
 * La impresora térmica: lo que se puede probar sin impresora.
 *
 *   npm run test:impresora
 *
 * Buscar, conectar e imprimir no se pueden probar acá: no hay Bluetooth ni
 * impresora en ninguna máquina que corra esto. Lo que sí se puede probar, y es
 * lo que más veces va a hacer falta, es lo de alrededor:
 *
 *   1. Que lo que la app afirma sea lo que el plugin informó. Un canal ESC/POS
 *      por Bluetooth es de ida: que los bytes salgan no es que el papel salga.
 *   2. Que cada falla se diga con su nombre. El único que va a poder
 *      diagnosticar es alguien parado frente a la impresora leyendo la
 *      pantalla, y "no se pudo imprimir" ahí no sirve de nada.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { estadoLegible, interpretarResultado, motivoDeError } from "../src/lib/impresora.ts";

const salioBien = (adapter) => ({
  success: true,
  printerId: "bluetooth:AA:BB",
  adapter,
  jobId: "j1",
  state: "completed",
});

test("con un SDK del fabricante, completado es impreso", () => {
  // Acá sí hay confirmación del aparato: el SDK espera su callback de fin.
  for (const adapter of ["epson", "star", "brother", "zebra"]) {
    assert.deepEqual(interpretarResultado(salioBien(adapter), null), { estado: "impreso" });
  }
});

test("con ESC/POS genérico lo máximo que se puede decir es enviado", () => {
  // Es el caso común en Paraguay: una térmica Bluetooth sin marca. El canal no
  // devuelve nada, así que decir "impreso" sería inventar la confirmación. Es
  // exactamente la mentira que la app ya dijo una vez.
  for (const adapter of ["escpos", "rawTcp"]) {
    assert.deepEqual(interpretarResultado(salioBien(adapter), null), { estado: "enviado" });
  }
});

test("un trabajo frenado no es un ticket entregado, aunque la promesa resuelva", () => {
  // `hold` es la impresora parada esperando papel o tapa. Si esto se tomara
  // como éxito, quien atiende entrega la mercadería con el ticket a medio
  // imprimir adentro de la impresora.
  const r = interpretarResultado(salioBien("epson"), {
    jobId: "j1",
    printerId: "p",
    state: "hold",
    holdReason: "paper_empty",
    updatedAt: 1,
  });
  assert.equal(r.estado, "error");
  assert.match(r.motivo, /sin papel/i);
  assert.equal(r.reintentable, true);
});

test("la tapa abierta y el papel por terminarse se dicen distinto", () => {
  const tapa = interpretarResultado(null, {
    jobId: "j",
    printerId: "p",
    state: "hold",
    holdReason: "cover_open",
    updatedAt: 1,
  });
  assert.match(tapa.motivo, /tapa/i);
  const casi = interpretarResultado(null, {
    jobId: "j",
    printerId: "p",
    state: "hold",
    holdReason: "paper_near_end",
    updatedAt: 1,
  });
  assert.match(casi.motivo, /rollo|papel/i);
  assert.notEqual(tapa.motivo, casi.motivo);
});

test("el código de error del trabajo gana sobre el motivo de la retención", () => {
  // El código es más preciso: "sin papel" en vez de "frenó y no dijo por qué".
  const r = interpretarResultado(null, {
    jobId: "j",
    printerId: "p",
    state: "failed",
    errorCode: "PRINTER_OFFLINE",
    updatedAt: 1,
  });
  assert.match(r.motivo, /apagada|fuera de alcance/i);
});

test("sin resultado y sin trabajo no se afirma nada", () => {
  const r = interpretarResultado(null, null);
  assert.equal(r.estado, "error");
  assert.match(r.motivo, /no confirmó/i);
});

test("un resultado que no dice completado tampoco es impreso", () => {
  for (const state of ["pending", "printing", "canceled", "failed"]) {
    assert.equal(interpretarResultado({ ...salioBien("epson"), state }, null).estado, "error");
  }
  assert.equal(interpretarResultado({ ...salioBien("epson"), success: false }, null).estado, "error");
});

test("cada falla tiene su propio texto, y dice qué hacer", () => {
  const casos = [
    ["BLUETOOTH_DISABLED", /bluetooth del teléfono está apagado/i],
    ["PERMISSION_DENIED", /permiso/i],
    ["PRINTER_OFFLINE", /apagada o fuera de alcance/i],
    ["PRINTER_NOT_FOUND", /volvé a elegirla/i],
    ["PAPER_EMPTY", /rollo/i],
    ["COVER_OPEN", /tapa/i],
    ["TIMEOUT", /medio ticket/i],
    ["PAIRING_REQUIRED", /vincular/i],
  ];
  const vistos = new Set();
  for (const [code, re] of casos) {
    const { motivo } = motivoDeError({ code });
    assert.match(motivo, re, code);
    // Dos fallas distintas con el mismo texto dejan al que está frente a la
    // impresora sin saber cuál de las dos le pasó.
    assert.ok(!vistos.has(motivo), `"${motivo}" se repite en ${code}`);
    vistos.add(motivo);
  }
});

test("el bluetooth apagado y el permiso negado no se confunden", () => {
  // Confundirlos manda a alguien a revisar los permisos cuando lo único que
  // hay que hacer es prender el Bluetooth, y al revés.
  const apagado = motivoDeError({ code: "BLUETOOTH_DISABLED" }).motivo;
  const negado = motivoDeError({ code: "PERMISSION_DENIED" }).motivo;
  assert.ok(!/permiso/i.test(apagado));
  assert.ok(!/apagado/i.test(negado));
});

test("un error que no conocemos se admite, no se disfraza", () => {
  const r = motivoDeError(new Error("java.io.IOException: broken pipe"));
  assert.match(r.motivo, /no sabemos por qué/i);
  // El detalle crudo va igual: es lo único que le sirve a quien tenga que
  // mirarlo después.
  assert.match(r.motivo, /broken pipe/);
  assert.equal(r.reintentable, true);
});

test("lo que no se puede reintentar no invita a reintentar", () => {
  assert.equal(motivoDeError({ code: "UNSUPPORTED_PRINTER" }).reintentable, false);
  assert.equal(motivoDeError({ code: "PERMISSION_DENIED" }).reintentable, false);
  assert.equal(motivoDeError({ code: "CONNECTION_FAILED" }).reintentable, true);
});

test("el estado del aparato prioriza lo que impide imprimir", () => {
  const st = (x) => estadoLegible({ id: "p", connection: "connected", online: true, paper: "ok", checkedAt: 1, ...x });
  assert.equal(st({ paper: "empty" }), "Sin papel");
  // Sin papel gana sobre "conectada": conectada y sin papel no imprime.
  assert.equal(st({ paper: "empty", coverOpen: true }), "Sin papel");
  assert.equal(st({ coverOpen: true }), "Tapa abierta");
  assert.equal(st({ paper: "near_end" }), "Casi sin papel");
  assert.equal(st({ online: false }), "Apagada o fuera de alcance");
  assert.equal(st({}), "Conectada");
});

test("cuando no se sabe el estado, no se muestra ninguno", () => {
  // Muchas ESC/POS no informan nada. "Conectada" porque la conexión abrió es
  // afirmar lo que no se sabe.
  assert.equal(estadoLegible(null), null);
});

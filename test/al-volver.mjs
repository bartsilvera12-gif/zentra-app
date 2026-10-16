/**
 * Volver a la app tiene que releer el plan.
 *
 * La prueba es del enganche, no de Capacitor: en el navegador el aviso es
 * `visibilitychange`, y eso se puede simular. Lo que importa es que al volver
 * se llame, que al irse NO se llame —si no, cada vez que alguien cambia de
 * pestaña se dispara una consulta— y que desuscribirse corte de verdad: un
 * listener que queda vivo después de cerrar sesión sigue pidiendo el perfil de
 * alguien que ya no está.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { alVolver } from "../src/lib/alVolver.ts";

function documentoFalso() {
  const oyentes = new Map();
  globalThis.document = {
    visibilityState: "visible",
    addEventListener: (n, f) => oyentes.set(n, f),
    removeEventListener: (n) => oyentes.delete(n),
  };
  return {
    cambiarA(estado) {
      globalThis.document.visibilityState = estado;
      oyentes.get("visibilitychange")?.();
    },
    get cuantos() {
      return oyentes.size;
    },
  };
}

test("al volver al frente se avisa", () => {
  const doc = documentoFalso();
  let veces = 0;
  alVolver(() => veces++);
  doc.cambiarA("hidden");
  assert.equal(veces, 0, "irse no es volver");
  doc.cambiarA("visible");
  assert.equal(veces, 1);
});

test("desuscribirse saca el oyente", () => {
  const doc = documentoFalso();
  let veces = 0;
  const cortar = alVolver(() => veces++);
  cortar();
  doc.cambiarA("visible");
  assert.equal(veces, 0, "siguió avisando después de cortar");
  assert.equal(doc.cuantos, 0, "quedó el oyente colgado");
});

/**
 * Comprar el plan con la facturación de Google.
 *
 *   npm run test:compras-play
 *
 * Lo que se prueba acá es lo que pasa alrededor de la compra, que es donde
 * está el daño: qué se hace cuando la persona cancela, cuando la plata salió
 * y el servidor no contestó, y cuando el comprobante no llega. La compra en
 * sí la hace Google y no se puede probar sin un teléfono.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { avisarCompra, PRODUCTO_DE_PLAN, productoDe } from "../src/lib/compras-play.ts";

test("cada plan pago tiene su producto, y el gratis no", () => {
  // Si estos ids no coinciden con los de Play Console, la compra falla con
  // "producto no disponible" y no hay forma de verlo desde el código.
  assert.equal(productoDe("emprendedor"), "zentra_emprendedor_mensual");
  assert.equal(productoDe("max"), "zentra_max_mensual");
  assert.equal(productoDe("free"), null);
  assert.equal(Object.keys(PRODUCTO_DE_PLAN).length, 2);
});

test("el aviso al servidor manda el comprobante y la sesion", async () => {
  let visto = null;
  globalThis.fetch = async (url, opc) => {
    visto = { url, headers: opc.headers, cuerpo: JSON.parse(opc.body) };
    return { ok: true, json: async () => ({ ok: true, plan: "max", vence: "2026-11-15" }) };
  };
  const r = await avisarCompra("https://cobros.test/", "tok-sesion", "zentra_max_mensual", "comprobante-1");
  assert.equal(r.plan, "max");
  assert.equal(r.vence, "2026-11-15");
  assert.equal(visto.url, "https://cobros.test/play/verificar");
  assert.equal(visto.headers.Authorization, "Bearer tok-sesion");
  assert.equal(visto.cuerpo.purchaseToken, "comprobante-1");
});

test("si el servidor no confirma, se levanta el error que mando", async () => {
  // No se puede devolver "listo" igual: el plan no se activó, y decir que sí
  // deja a alguien que pagó creyendo que tiene Max.
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: "Esa compra no figura en Google." }) });
  await assert.rejects(
    () => avisarCompra("https://cobros.test", "t", "zentra_max_mensual", "x"),
    /no figura en Google/,
  );
});

test("un 200 sin ok tampoco es una compra confirmada", async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ plan: "max" }) });
  await assert.rejects(() => avisarCompra("https://cobros.test", "t", "zentra_max_mensual", "x"));
});

test("se pide el tipo suscripcion, no compra de una vez", () => {
  // El plugin, si no se lo dicen, pregunta por productos `inapp`. Nuestros
  // planes existen como `subs`, asi que Google contestaba "no hay ninguno" y
  // la app mostraba que no habia nada para comprar, con todo bien
  // configurado en Play Console. El sintoma no apunta a ningun lado.
  const fuente = readFileSync("src/lib/compras-play.ts", "utf8");
  const llamadas = fuente.match(/NativePurchases\.(getProducts|purchaseProduct)\(\{[^}]*\}/gs) || [];
  // No se fija un número: se fija que TODAS lo lleven. Cuando se agregó la
  // tercera llamada (el diagnóstico), esta prueba la cazó — por eso está
  // escrita así y no contando.
  assert.ok(llamadas.length >= 2, "no encontré las llamadas al plugin: revisá esta prueba");
  for (const l of llamadas) {
    assert.match(l, /productType:\s*TIPO_SUSCRIPCION/, "falta el tipo en: " + l.slice(0, 60));
  }
  assert.match(fuente, /TIPO_SUSCRIPCION\s*=\s*"subs"/);
});

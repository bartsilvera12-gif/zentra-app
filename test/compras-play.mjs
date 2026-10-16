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

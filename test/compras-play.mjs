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
import {
  avisarCompra,
  consultarPlanes,
  interpretarProductos,
  razonDe,
  PLAN_BASE,
  PRODUCTO_DE_PLAN,
  productoDe,
} from "../src/lib/compras-play.ts";

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

test("un plan sin precio de texto igual se puede comprar", () => {
  // Google devuelve el producto pero, en una suscripcion, el precio vive en
  // el plan base: el campo de texto puede venir vacio. Tratar eso como "no
  // hay nada que comprar" es el error que nos costo una semana.
  const r = interpretarProductos([
    { planIdentifier: "zentra_max_mensual", identifier: "mensual", priceString: "" },
  ]);
  assert.deepEqual(r.max, { precio: "", base: "mensual" });
});

test("los campos vienen dados vuelta en las suscripciones de Android", () => {
  // El plugin devuelve una fila por plan base, y da vuelta los dos campos:
  // `identifier` es el plan base y `planIdentifier` es el producto. Lo dice
  // su propia documentacion. Nosotros buscabamos por `identifier`, asi que
  // los dos planes llegaban con "mensual" y ninguno coincidia: el
  // diagnostico decia "Google devolvio 2" y la app no mostraba nada para
  // comprar. Esta es la prueba de ese error.
  const r = interpretarProductos([
    { planIdentifier: "zentra_emprendedor_mensual", identifier: "mensual", priceString: "Gs 49.000" },
    { planIdentifier: "zentra_max_mensual", identifier: "mensual", priceString: "Gs 99.000" },
  ]);
  assert.deepEqual(Object.keys(r).sort(), ["emprendedor", "max"]);
  assert.equal(r.emprendedor.precio, "Gs 49.000");
  assert.equal(r.max.base, "mensual");
});

test("sin campos dados vuelta, `identifier` es el producto", () => {
  // Compras de pago unico y iOS: ahi no hay vuelta de campos. Si se buscara
  // solo por `planIdentifier`, dejaria de funcionar.
  const r = interpretarProductos([{ identifier: "zentra_max_mensual", priceString: "Gs 99.000" }]);
  assert.equal(r.max.precio, "Gs 99.000");
  // Sin plan base en la respuesta vale el que tenemos escrito.
  assert.equal(r.max.base, PLAN_BASE);
});

test("lo que no es nuestro no entra", () => {
  const r = interpretarProductos([
    { planIdentifier: "otra_app_mensual", identifier: "mensual" },
    { identifier: "mensual" },
    {},
  ]);
  assert.deepEqual(r, {});
});

test("la compra manda el plan base: sin el, el plugin la rechaza", () => {
  // `planIdentifier` es obligatorio en las suscripciones de Android. El
  // plugin corta antes de abrir nada: "planIdentifier cannot be empty if
  // productType is subs". Google no vende el producto, vende un plan base.
  const fuente = readFileSync("src/lib/compras-play.ts", "utf8");
  const compra = fuente.match(/NativePurchases\.purchaseProduct\(\{[^}]*\}/s);
  assert.ok(compra, "no encontre la llamada de compra: revisa esta prueba");
  assert.match(compra[0], /planIdentifier:/);
});

test("la razon dice que ninguno coincide cuando Google trae otros ids", () => {
  // Este es el caso que nos costo una semana: Google contestando, con
  // productos, y nosotros buscandolos por el campo equivocado. El
  // diagnostico decia "devolvio 2" y no alcanzaba para verlo.
  const r = razonDe({ soporta: true, planes: {}, vistos: ["mensual", "mensual"], error: "", intentos: 1 });
  assert.match(r, /ninguno es nuestro/);
  assert.match(r, /mensual, mensual/);
});

test("la razon separa los tres motivos de no poder comprar", () => {
  assert.match(
    razonDe({ soporta: false, planes: {}, vistos: [], error: "Product not found", intentos: 3 }),
    /No se pudo consultar a Google: Product not found/,
  );
  assert.match(
    razonDe({ soporta: false, planes: {}, vistos: [], error: "", intentos: 1 }),
    /no tiene la facturación de Google/,
  );
  // Facturacion si, productos no: cuenta los intentos, porque la Play Store
  // tarda en tenerlos listos despues de instalar o actualizar.
  assert.match(
    razonDe({ soporta: true, planes: {}, vistos: [], error: "", intentos: 3 }),
    /ningún plan \(3 intentos\)/,
  );
});

test("con planes comprables la razon los nombra", () => {
  const r = razonDe({
    soporta: true,
    planes: { max: { precio: "", base: "mensual" } },
    vistos: ["zentra_max_mensual"],
    error: "",
    intentos: 1,
  });
  assert.match(r, /Listo: Google devolvió 1 plan para comprar \(max\)/);
});

test("fuera del APK no se pregunta nada", async () => {
  // Sin Capacitor no hay plugin: tiene que contestar sin intentar importarlo.
  const c = await consultarPlanes();
  assert.equal(c.soporta, false);
  assert.deepEqual(c.planes, {});
  assert.equal(c.intentos, 0);
});

test("una sola consulta a la vez, y una sola pregunta a Google", () => {
  // El plugin tiene UN cliente de facturacion que cada llamada abre y cierra.
  // Dos llamadas al mismo tiempo se pisan: a veces llegan los productos y a
  // veces vuelve vacio ("product not found"). Por eso las pantallas tienen
  // que pasar por `consultarPlanes` y no preguntar por su cuenta.
  const fuente = readFileSync("src/lib/compras-play.ts", "utf8");
  assert.match(fuente, /if \(enVuelo\) return enVuelo;/, "se perdio la cola de una sola consulta");
  for (const p of ["src/mobile/ui/AvisoPlan.tsx", "src/mobile/screens/ConfigScreen.tsx"]) {
    const pantalla = readFileSync(p, "utf8");
    assert.doesNotMatch(pantalla, /NativePurchases/, p + " habla con el plugin por su cuenta");
    assert.doesNotMatch(pantalla, /diagnosticoDeCompras|planesDePlay|sePuedeComprar/, p + " hace su propia consulta");
  }
});

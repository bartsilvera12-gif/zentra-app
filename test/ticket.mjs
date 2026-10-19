/**
 * El ticket que sale por la impresora térmica.
 *
 *   npm run test:ticket
 *
 * De toda la impresión, esto es lo único que se puede verificar sin hardware:
 * no hay Bluetooth, ni permisos, ni plugin, son cuentas y cuántos caracteres
 * entran en el papel. Así que se prueba acá con todo lo que en la vida real
 * rompe un ticket: nombres de producto largos, montos que tienen que quedar
 * alineados, acentos y ñ, una venta de un renglón y una de veinte.
 *
 * Lo que NO se prueba acá es que el papel salga. Eso no lo sabe nadie hasta que
 * haya una impresora adelante, y por eso la pantalla no lo afirma.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  ANCHO_POR_DEFECTO,
  COLUMNAS,
  anchoValido,
  centrar,
  desgloseIva,
  dosColumnas,
  itemsDeTicket,
  lineasDePrueba,
  lineasDeTicket,
  monto,
  partir,
  recortar,
  textoDeTicket,
} from "../src/lib/ticket.ts";
import { datosEmisor } from "../src/lib/emisor.ts";

/**
 * El ticket con los espacios colapsados.
 *
 * El contenido se busca sobre esto y no sobre el texto crudo porque el ticket
 * parte las líneas al ancho del papel: "no es una factura legal" puede estar
 * repartido en dos renglones y seguir estando. Lo que se mide con el texto
 * crudo es el ancho, que es la otra prueba.
 */
const plano = (texto) => texto.replace(/\s+/g, " ");

const EMISOR = datosEmisor({ nombre: "Despensa Ña Cándida", ruc: "80012345-6", ciudad: "Asunción" });
const SIN_RUC = datosEmisor({ nombre: "Despensa Ña Cándida", ruc: "", ciudad: "Asunción" });

const venta = (lineas, extra = {}) => ({
  id: "v1",
  iso: "2026-10-19",
  numero: "001-001-0000123",
  cliId: "c1",
  cliente: "Juan Pérez",
  doc: "1234567-8",
  fecha: "19 oct 2026",
  pago: "Contado",
  estado: "Cobrada",
  lineas,
  ...extra,
});

const UNA = venta([{ nombre: "Gaseosa 2L", qty: 2, precio: 15000, iva: "10%" }]);

/** Veinte renglones, con nombres de largo variable como los de verdad. */
const VEINTE = venta(
  Array.from({ length: 20 }, (_, i) => ({
    nombre: i % 3 === 0 ? "Yerba mate compuesta con hierbas serranas 1 kg" : `Producto ${i + 1}`,
    qty: i + 1,
    precio: 1000 * (i + 1),
    iva: i % 2 ? "5%" : "10%",
  })),
);

test("los dos anchos son los dos rollos, y son los que entran en la fuente A", () => {
  // 384 y 576 puntos a 203 dpi, dividido 12 puntos de ancho de la fuente A.
  assert.equal(COLUMNAS[58], 32);
  assert.equal(COLUMNAS[80], 48);
  assert.equal(ANCHO_POR_DEFECTO, 58);
});

test("ante la duda, el papel angosto", () => {
  // Un ticket de 32 columnas en un rollo de 80 mm sale angosto y se lee. Uno de
  // 48 en un rollo de 58 sale partido y no se entiende.
  assert.equal(anchoValido(null), 58);
  assert.equal(anchoValido(undefined), 58);
  assert.equal(anchoValido(0), 58);
  assert.equal(anchoValido(58), 58);
  assert.equal(anchoValido(112), 58);
  assert.equal(anchoValido(80), 80);
});

test("ninguna línea se pasa del ancho del papel", () => {
  for (const mm of [58, 80]) {
    for (const [que, v] of [["una línea", UNA], ["veinte líneas", VEINTE]]) {
      for (const l of lineasDeTicket(v, { emisor: EMISOR, ancho: mm })) {
        assert.ok(
          [...l].length <= COLUMNAS[mm],
          `${que} a ${mm} mm: "${l}" mide ${[...l].length} y entran ${COLUMNAS[mm]}`,
        );
      }
    }
  }
});

test("un nombre larguísimo se parte, no desborda ni desaparece", () => {
  const largo = "Yerba mate compuesta con hierbas serranas y menta edición especial 1 kg";
  const lineas = lineasDeTicket(venta([{ nombre: largo, qty: 1, precio: 35000, iva: "10%" }]), {
    emisor: EMISOR,
    ancho: 58,
  });
  const texto = lineas.join("\n");
  // Que entre en el papel no puede significar que se pierdan palabras del
  // medio: lo que no entra en una línea va en la siguiente.
  for (const palabra of largo.split(" ")) assert.ok(texto.includes(palabra), `se perdió "${palabra}"`);
});

test("una palabra sola más larga que el papel se corta donde decidimos nosotros", () => {
  // Si se deja pasar, la impresora la corta donde quiere y arrastra la línea
  // siguiente.
  const pegado = "GASEOSACOCACOLARETORNABLEDOSLITROSPACKSEIS";
  const l = partir(pegado, 32);
  assert.equal(l[0].length, 32);
  assert.equal(l.join(""), pegado);
});

test("los montos quedan pegados al borde derecho", () => {
  for (const mm of [58, 80]) {
    const cols = COLUMNAS[mm];
    const lineas = lineasDeTicket(VEINTE, { emisor: EMISOR, ancho: mm });
    const conMonto = lineas.filter((l) => / {2}\d+ x /.test(l));
    assert.equal(conMonto.length, 20, "tiene que haber un renglón de cuenta por producto");
    for (const l of conMonto) {
      assert.equal([...l].length, cols, `"${l}" no llega al borde`);
      assert.ok(!l.endsWith(" "), `"${l}" tiene el monto suelto en el medio`);
    }
    // El total también, que es el número que todos buscan primero.
    const total = lineas.find((l) => l.startsWith("TOTAL"));
    assert.equal([...total].length, cols);
    assert.match(total, /Gs [\d.]+$/);
  }
});

test("el rótulo se recorta antes que el monto", () => {
  // Al nombre se le adivina el resto; al número no.
  const l = dosColumnas("Un rótulo larguísimo que no entra ni de casualidad", "999.999", 32);
  assert.equal(l.length, 32);
  assert.ok(l.endsWith("999.999"));
});

test("el símbolo del guaraní no va al papel", () => {
  // ₲ (U+20B2) no existe en Windows-1252, que es la página de código que
  // entienden estas impresoras: saldría un carácter cualquiera en el total.
  const texto = textoDeTicket(VEINTE, { emisor: EMISOR, ancho: 80 });
  assert.ok(!texto.includes("₲"), "el ₲ no se imprime: va 'Gs'");
  assert.ok(texto.includes("Gs "), "el total tiene que decir en qué moneda está");
});

test("los acentos y la ñ llegan enteros y bien contados", () => {
  const v = venta([{ nombre: "Ñandutí artesanal de Itauguá", qty: 1, precio: 90000, iva: "10%" }], {
    cliente: "María Núñez",
  });
  const lineas = lineasDeTicket(v, { emisor: EMISOR, ancho: 58 });
  const texto = plano(lineas.join("\n"));
  assert.ok(texto.includes("Ñandutí"));
  assert.ok(texto.includes("María Núñez"));
  assert.ok(texto.includes("Ña Cándida"));
  // Normalizado: la ñ tiene que ser UN carácter, o mide doble y además no
  // tiene lugar en la página de código de la impresora.
  assert.ok(!/̃|́/.test(texto), "quedaron tildes combinadas sin componer");
  for (const l of lineas) assert.ok([...l].length <= 32);
});

test("una ñ escrita con tilde combinada se compone igual", () => {
  // Es lo que escriben algunos teclados de Android, y no se ve la diferencia
  // en pantalla: se ve cuando sale el papel.
  const descompuesta = "Nañandu";
  assert.equal(recortar(descompuesta, 10), "Nañandu");
  assert.equal(partir(descompuesta, 32)[0], "Nañandu");
});

test("el desglose separa 10, 5 y exentas, con el IVA contenido en el precio", () => {
  const v = venta([
    { nombre: "Gravado diez", qty: 1, precio: 110000, iva: "10%" },
    { nombre: "Gravado cinco", qty: 1, precio: 105000, iva: "5%" },
    { nombre: "Exento", qty: 1, precio: 50000, iva: "Exenta" },
  ]);
  const d = desgloseIva(v);
  assert.deepEqual(
    d.map((x) => x.tasa),
    ["10%", "5%", "Exenta"],
  );
  // 110.000 con IVA incluido del 10% son 100.000 de base y 10.000 de impuesto.
  // La otra cuenta —110.000 × 10%— daría 11.000 y es la que está mal.
  assert.equal(Math.round(d[0].base), 100000);
  assert.equal(Math.round(d[0].iva), 10000);
  assert.equal(Math.round(d[1].base), 100000);
  assert.equal(Math.round(d[1].iva), 5000);
  assert.equal(Math.round(d[2].iva), 0);

  const texto = plano(textoDeTicket(v, { emisor: EMISOR, ancho: 80 }));
  assert.match(texto, /IVA 10%/);
  assert.match(texto, /IVA 5%/);
  assert.match(texto, /Exentas/);
});

test("una tasa que la venta no tiene no se imprime en cero", () => {
  // Un "IVA 5%: 0" en un ticket de productos al 10% hace dudar de todo el
  // resto de los números.
  const texto = plano(textoDeTicket(UNA, { emisor: EMISOR, ancho: 58 }));
  assert.match(texto, /IVA 10%/);
  assert.ok(!texto.includes("IVA 5%"));
  assert.ok(!texto.includes("Exentas"));
});

test("el total es la suma de los renglones", () => {
  const texto = plano(textoDeTicket(VEINTE, { emisor: EMISOR, ancho: 80 }));
  const esperado = VEINTE.lineas.reduce((a, l) => a + l.qty * l.precio, 0);
  assert.ok(texto.includes("Gs " + monto(esperado)), "el total no coincide con los renglones");
});

test("sin RUC el ticket dice comprobante interno, y lo dice en el papel", () => {
  const texto = plano(textoDeTicket(UNA, { emisor: SIN_RUC, ancho: 58 }));
  assert.ok(texto.includes("Comprobante interno"), "el título tiene que decir qué es");
  assert.ok(!texto.includes("Factura"), "sin RUC no es una factura");
  assert.ok(texto.includes("Sin RUC cargado"), "no se inventa un RUC");
  // El que se lleva el ticket tiene que poder leer que no es legal, no sólo el
  // que lo emitió desde la app.
  assert.ok(texto.includes("no una factura legal"), "el aviso del emisor tiene que viajar en el papel");
  assert.ok(texto.includes("001-001-0000123"), "el número va igual");
});

test("con RUC sí es factura, y el RUC es el del emisor", () => {
  const texto = plano(textoDeTicket(UNA, { emisor: EMISOR, ancho: 58 }));
  assert.ok(texto.includes("Factura 001-001-0000123"));
  assert.ok(texto.includes("RUC 80012345-6"));
  assert.ok(!texto.includes("Comprobante interno"));
});

test("van el cliente, la fecha, la condición de pago y el pie", () => {
  const texto = plano(textoDeTicket(UNA, { emisor: EMISOR, ancho: 58 }));
  assert.ok(texto.includes("Cliente: Juan Pérez"));
  assert.ok(texto.includes("RUC/CI: 1234567-8"));
  assert.ok(texto.includes("Fecha: 19 oct 2026"));
  assert.ok(texto.includes("Contado"));
  assert.ok(texto.includes("Gracias por su compra"));
});

test("una venta sin documento del cliente no imprime un rótulo vacío", () => {
  const texto = plano(textoDeTicket(venta(UNA.lineas, { doc: "" }), { emisor: EMISOR, ancho: 58 }));
  assert.ok(!texto.includes("RUC/CI:"));
});

test("el centrado reparte los espacios y no se pasa", () => {
  assert.equal(centrar("abcd", 10), "   abcd");
  assert.equal([...centrar("abcd", 10)].length, 7);
  assert.equal(centrar("0123456789012", 10), "0123456789");
});

test("lo que se manda a imprimir son exactamente las líneas que se probaron", () => {
  const opc = { emisor: EMISOR, ancho: 58 };
  const lineas = lineasDeTicket(UNA, opc);
  const items = itemsDeTicket(UNA, opc);
  const textos = items.filter((i) => i.type === "text");
  assert.deepEqual(
    textos.map((i) => i.value),
    lineas,
    "si el envío reformatea algo, lo que se probó acá no es lo que sale",
  );
  // La fuente A es la que hace que 32 columnas sean 32 columnas.
  for (const i of textos) {
    assert.equal(i.style.font, "A");
    assert.equal(i.style.encoding, "WPC1252");
  }
  // Avanzar antes de cortar: el cabezal y la cuchilla no están en el mismo
  // lugar, y sin esto la cuchilla corta arriba del total.
  const i = items.findIndex((x) => x.type === "feed");
  const j = items.findIndex((x) => x.type === "cut");
  assert.ok(i >= 0 && j > i, "el feed tiene que ir antes del corte");
});

test("el ticket de prueba lleva la regla que delata el ancho equivocado", () => {
  for (const mm of [58, 80]) {
    const lineas = lineasDePrueba(mm);
    const regla = lineas.find((l) => l.startsWith("1234567890"));
    assert.equal([...regla].length, COLUMNAS[mm], "la regla tiene que llegar al borde del papel");
    assert.ok(lineas.some((l) => l.includes(`${COLUMNAS[mm]} columnas`)));
    for (const l of lineas) assert.ok([...l].length <= COLUMNAS[mm]);
  }
});

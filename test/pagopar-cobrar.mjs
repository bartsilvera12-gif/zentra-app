/**
 * El pedido que se le manda a Pagopar.
 *
 *   npm run test:pagopar-cobrar
 *
 * Lo que más importa acá es la firma: `strval(floatval($monto))` de PHP tiene
 * una forma particular de escribir el monto, y basta mandar "150000.00" en vez
 * de "150000" para que Pagopar conteste "token inválido" sin decir por qué.
 */
import {
  cuerpoDePedido, faltaDelComprador, fechaPagopar, leerRespuesta,
  montoParaToken, sha1, tokenDePedido, urlDePago,
} from "../supabase/functions/pagopar-cobrar/logica.ts";

const casos = [];
const t = (nombre, fn) => casos.push([nombre, fn]);

const PUB = "clave-publica";
const PRIV = "clave-privada";
const comprador = { nombre: "Karen Ayala", email: "k@neura.com.py", documento: "1234567" };

t("el monto se escribe como lo escribe PHP", () => {
  // strval(floatval("150000")) === "150000", no "150000.00"
  if (montoParaToken(150000) !== "150000") throw new Error("entero: " + montoParaToken(150000));
  // strval(floatval("150000.50")) === "150000.5", un solo decimal
  if (montoParaToken(150000.5) !== "150000.5") throw new Error("decimal: " + montoParaToken(150000.5));
  if (montoParaToken(0.1) !== "0.1") throw new Error("menor a uno");
});

t("la firma es sha1 de clave + referencia + monto, en ese orden", async () => {
  const esperado = await sha1(PRIV + "ref123" + "150000");
  if (await tokenDePedido(PRIV, "ref123", 150000) !== esperado) throw new Error("mal armada");
  // Cambiar cualquiera de los tres cambia la firma.
  if (await tokenDePedido(PRIV, "ref124", 150000) === esperado) throw new Error("la referencia cuenta");
  if (await tokenDePedido(PRIV, "ref123", 150001) === esperado) throw new Error("el monto cuenta");
  if (await tokenDePedido("otra", "ref123", 150000) === esperado) throw new Error("la clave cuenta");
});

t("la fecha va como la pide Pagopar", () => {
  const f = fechaPagopar(new Date(2026, 10, 13, 9, 5, 3));
  if (f !== "2026-11-13 09:05:03") throw new Error("formato: " + f);
});

t("el cuerpo lleva lo que Pagopar exige", async () => {
  const c = await cuerpoDePedido(
    { referencia: "ref123", montoTotal: 150000, plan: "max", nombrePlan: "Max", comprador,
      vencePago: new Date(2026, 10, 15, 12, 0, 0) },
    PUB, PRIV,
  );
  if (c.public_key !== PUB) throw new Error("falta la clave publica");
  if (c.monto_total !== 150000) throw new Error("falta el monto");
  if (c.id_pedido_comercio !== "ref123") throw new Error("falta la referencia");
  if (c.tipo_pedido !== "VENTA-COMERCIO") throw new Error("tipo de pedido");
  if (c.token !== await tokenDePedido(PRIV, "ref123", 150000)) throw new Error("firma mal puesta");
  if (c.comprador.tipo_documento !== "CI") throw new Error("tipo_documento siempre CI");
  if (c.comprador.email !== comprador.email) throw new Error("el correo es obligatorio");
  if (!Array.isArray(c.compras_items) || c.compras_items.length !== 1) throw new Error("un item");
  // El total de la linea, no el unitario.
  if (c.compras_items[0].precio_total !== 150000) throw new Error("precio_total de la linea");
});

t("la clave privada NO viaja en el cuerpo", async () => {
  const c = await cuerpoDePedido(
    { referencia: "r", montoTotal: 1000, plan: "max", nombrePlan: "Max", comprador,
      vencePago: new Date() },
    PUB, PRIV,
  );
  if (JSON.stringify(c).includes(PRIV)) throw new Error("la clave privada se filtro al cuerpo");
});

t("una respuesta buena da el hash", () => {
  const r = leerRespuesta({ respuesta: true, resultado: [{ data: "hash-abc", pedido: "1750" }] });
  if (!r.ok || r.hash !== "hash-abc") throw new Error("no leyo el hash");
});

t("un rechazo de Pagopar se lee como error, no como exito", () => {
  const r = leerRespuesta({ respuesta: false, resultado: "Token no coincide" });
  if (r.ok) throw new Error("no deberia dar ok");
  if (!/token/i.test(r.error)) throw new Error("se perdio el motivo: " + r.error);
});

t("una respuesta sin hash es un error, no una URL rota", () => {
  for (const malo of [
    { respuesta: true, resultado: [{}] },
    { respuesta: true, resultado: [] },
    { respuesta: true },
    null, "texto",
  ]) {
    if (leerRespuesta(malo).ok) throw new Error("deberia fallar: " + JSON.stringify(malo));
  }
});

t("la URL de pago es la de Pagopar con el hash", () => {
  if (urlDePago("abc") !== "https://www.pagopar.com/pagos/abc") throw new Error("mal armada");
});

t("se dice QUE falta, no 'datos incompletos'", () => {
  const f = faltaDelComprador({ nombre: "Karen" });
  if (!f.some((x) => /correo/.test(x))) throw new Error("falta el correo");
  if (!f.some((x) => /dula|RUC/.test(x))) throw new Error("falta el documento");
  if (faltaDelComprador(comprador).length) throw new Error("con todo cargado no falta nada");
  if (faltaDelComprador({ ...comprador, nombre: "   " }).length !== 1) throw new Error("espacios no son nombre");
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nPagopar (cobrar): todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

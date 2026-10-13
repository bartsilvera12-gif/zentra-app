/**
 * Las cuentas finas de PagoPar.
 *
 *   npm test
 *
 * Son pocas y puntuales: lo que se prueba acá es lo que, cuando está mal, hace
 * que PagoPar conteste "token no corresponde" sin decir por qué.
 */
import {
  buildStartTransactionToken, isPagoparRespuestaOk, phpStrvalFloatval,
  sha1Hex, stripPagoparSecret, verifyWebhookToken,
} from "./src/pagopar.js";

const casos = [];
const t = (n, f) => casos.push([n, f]);
const PRIV = "clave-privada";

t("el monto se escribe como lo escribe PHP", () => {
  // strval(floatval("1000")) === "1000", no "1000.00"
  if (phpStrvalFloatval(1000) !== "1000") throw new Error("entero: " + phpStrvalFloatval(1000));
  if (phpStrvalFloatval("1000") !== "1000") throw new Error("entero como texto");
  if (phpStrvalFloatval(1000.5) !== "1000.5") throw new Error("decimal: " + phpStrvalFloatval(1000.5));
  if (phpStrvalFloatval(150000) !== "150000") throw new Error("sin separadores de miles");
});

t("la firma del pedido es clave + referencia + monto, en ese orden", () => {
  const esperado = sha1Hex(PRIV + "ref123" + "1000");
  if (buildStartTransactionToken(PRIV, "ref123", 1000) !== esperado) throw new Error("mal armada");
  if (buildStartTransactionToken(PRIV, "ref124", 1000) === esperado) throw new Error("la referencia cuenta");
  if (buildStartTransactionToken(PRIV, "ref123", 1001) === esperado) throw new Error("el monto cuenta");
});

t("una clave pegada con comillas o espacios se limpia sola", () => {
  if (stripPagoparSecret('  "abc"  ') !== "abc") throw new Error("comillas y espacios");
  if (stripPagoparSecret("﻿abc") !== "abc") throw new Error("BOM invisible");
});

t("el token del aviso es clave + hash", () => {
  const bueno = sha1Hex(PRIV + "hash-abc");
  if (!verifyWebhookToken(PRIV, "hash-abc", bueno)) throw new Error("deberia aceptar el bueno");
  if (verifyWebhookToken(PRIV, "hash-abc", sha1Hex("otra" + "hash-abc"))) throw new Error("clave ajena");
  // Una firma valida de OTRO pedido no sirve para este.
  if (verifyWebhookToken(PRIV, "hash-abc", sha1Hex(PRIV + "otro"))) throw new Error("la firma es por pedido");
  if (verifyWebhookToken(PRIV, "hash-abc", "")) throw new Error("sin token no entra");
});

t("PagoPar manda `respuesta` como texto a veces", () => {
  if (!isPagoparRespuestaOk(true)) throw new Error("booleano");
  if (!isPagoparRespuestaOk("true")) throw new Error("texto 'true'");
  if (isPagoparRespuestaOk("false")) throw new Error("texto 'false' NO es ok");
  if (isPagoparRespuestaOk(false) || isPagoparRespuestaOk(undefined)) throw new Error("falso es falso");
});

let malas = 0;
for (const [n, f] of casos) {
  try { await f(); console.log("  OK · " + n); }
  catch (e) { malas++; console.log("  FALLA · " + n + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nCobros: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

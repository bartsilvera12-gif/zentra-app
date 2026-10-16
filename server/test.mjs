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

import { claveCoincide, claveUsable, esCobroDePrueba, LARGO_MINIMO } from "./src/cobro-prueba.js";

import { limpiarClave, planDeProducto, revisarSuscripcion } from "./src/play.js";

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

t("sin clave configurada, el cobro de prueba no existe", () => {
  if (claveUsable("", 1000)) throw new Error("se habilito sin clave");
  if (claveUsable(undefined, 1000)) throw new Error("se habilito sin clave");
  if (esCobroDePrueba("", 1000, "")) throw new Error("clave vacia contra clave vacia dio verdadero");
});

t("una clave corta no habilita nada", () => {
  const corta = "a".repeat(LARGO_MINIMO - 1);
  if (claveUsable(corta, 1000)) throw new Error("acepto una clave de " + corta.length);
  // Y aunque la manden exacta: la configuracion esta mal, no se cobra barato.
  if (esCobroDePrueba(corta, 1000, corta)) throw new Error("cobro barato con clave corta");
});

t("un monto de prueba invalido apaga el camino", () => {
  const clave = "x".repeat(LARGO_MINIMO);
  if (claveUsable(clave, 0)) throw new Error("monto cero");
  if (claveUsable(clave, -1)) throw new Error("monto negativo");
  if (claveUsable(clave, Number.NaN)) throw new Error("monto no numerico");
});

t("la clave se compara entera, no por pedazos", () => {
  const clave = "clave-de-prueba-larga-0001";
  if (!claveCoincide(clave, clave)) throw new Error("no reconocio la propia");
  if (claveCoincide(clave, clave.slice(0, -1))) throw new Error("acepto un prefijo");
  if (claveCoincide(clave, clave + "x")) throw new Error("acepto con cola");
  if (claveCoincide(clave, clave.toUpperCase())) throw new Error("ignoro mayusculas");
  if (claveCoincide(clave, " " + clave)) throw new Error("ignoro un espacio");
});

/* ───────────────────────── las reglas de Google Play ───────────────────────── */

const SUB = (extra = {}) => ({
  subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
  acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
  lineItems: [{ productId: "zentra_max_mensual", expiryTime: "2026-11-15T03:00:00Z" }],
  ...extra,
});
const MAX = { productId: "zentra_max_mensual", paquete: "py.com.zentra.movil" };

t("los productos de Play se mapean a planes, y uno desconocido no", () => {
  if (planDeProducto("zentra_max_mensual") !== "max") throw new Error("max");
  if (planDeProducto("zentra_emprendedor_mensual") !== "emprendedor") throw new Error("emprendedor");
  // Nada de caer a un plan por defecto: eso activa Max por un id mal escrito.
  if (planDeProducto("zentra_max") !== null) throw new Error("acepto un id parecido");
  if (planDeProducto("") !== null) throw new Error("acepto vacio");
  // Y un id con nombre de propiedad heredada tampoco es un plan.
  if (planDeProducto("constructor") !== null) throw new Error("acepto 'constructor'");
  if (planDeProducto("toString") !== null) throw new Error("acepto 'toString'");
});

t("sin respuesta de Google no se activa nada", () => {
  if (revisarSuscripcion(null, MAX).ok) throw new Error("activo con null");
  if (revisarSuscripcion("si", MAX).ok) throw new Error("activo con texto");
});

t("una compra de otro paquete no es nuestra", () => {
  const r = revisarSuscripcion(SUB({ packageName: "com.otra.app" }), MAX);
  if (r.ok) throw new Error("activo una compra ajena");
});

t("solo activan los estados en los que el periodo esta pago", () => {
  for (const estado of [
    "SUBSCRIPTION_STATE_ACTIVE",
    // Apago la renovacion automatica, pero el mes que pago lo tiene.
    "SUBSCRIPTION_STATE_CANCELED",
    // El cobro de la renovacion fallo y Google sigue intentando: conserva acceso.
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  ]) {
    if (!revisarSuscripcion(SUB({ subscriptionState: estado }), MAX).ok) throw new Error("rechazo " + estado);
  }
  for (const estado of [
    // Asi llega un pago en efectivo que todavia no se acredito.
    "SUBSCRIPTION_STATE_PENDING",
    "SUBSCRIPTION_STATE_ON_HOLD",
    "SUBSCRIPTION_STATE_PAUSED",
    "SUBSCRIPTION_STATE_EXPIRED",
    "SUBSCRIPTION_STATE_UNSPECIFIED",
    "",
  ]) {
    if (revisarSuscripcion(SUB({ subscriptionState: estado }), MAX).ok) throw new Error("activo " + estado);
  }
});

t("el comprobante tiene que ser del plan que se pide", () => {
  // Sin esto, un mes de Emprendedor pagado alcanza para pedir Max.
  const r = revisarSuscripcion(SUB(), { ...MAX, productId: "zentra_emprendedor_mensual" });
  if (r.ok) throw new Error("activo un plan que no se compro");
  if (revisarSuscripcion(SUB({ lineItems: [] }), MAX).ok) throw new Error("activo sin items");
});

t("se reconoce solo cuando Google dice que falta reconocer", () => {
  const falta = revisarSuscripcion(SUB({ acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING" }), MAX);
  if (!falta.hayQueReconocer) throw new Error("no iba a reconocer una compra pendiente");
  if (revisarSuscripcion(SUB(), MAX).hayQueReconocer) throw new Error("reconoce una ya reconocida");
  // Un estado que no conocemos se trata como "ya esta": reconocer de nuevo no
  // rompe nada, pero es un viaje de mas en cada reintento de la app.
  if (revisarSuscripcion(SUB({ acknowledgementState: "" }), MAX).hayQueReconocer) {
    throw new Error("reconoce sin que Google lo pida");
  }
});

t("la clave de la cuenta de servicio se limpia como llega del entorno", () => {
  const pem = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";
  // Un .env no tiene saltos de linea: llegan escritos como \n.
  if (limpiarClave(pem.replace(/\n/g, "\\n")) !== pem) throw new Error("no deshizo los \\n");
  if (limpiarClave('"' + pem + '"') !== pem) throw new Error("no saco las comillas");
  // O el PEM entero en base64, que es la otra forma en que llega.
  if (limpiarClave(Buffer.from(pem).toString("base64")) !== pem) throw new Error("no deshizo el base64");
});

let malas = 0;
for (const [n, f] of casos) {
  try { await f(); console.log("  OK · " + n); }
  catch (e) { malas++; console.log("  FALLA · " + n + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nCobros: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

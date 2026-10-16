/**
 * Preguntarle a PagoPar como quedo un pedido.
 *
 *   node --env-file=.env src/consulta.js            (el ultimo cobro con hash)
 *   node --env-file=.env src/consulta.js <hash>     (uno en particular)
 *
 * Existe por dos razones.
 *
 * La primera es el circuito de PagoPar: para pasar a produccion piden tres
 * pasos, y el tercero es "el sitio web del comercio consulta el estado de un
 * pedido". Ese paso no se completa pagando de nuevo —el pago es el paso dos—
 * sino llamando al endpoint de consulta al menos una vez. Esto lo llama.
 *
 * La segunda es operativa: cuando un aviso de PagoPar no llega —se cayo el
 * server, el dominio estaba detras del proxy, lo que sea—, la plata entro y
 * la base no se entero. Preguntar es la forma de saber que paso sin tener que
 * creerle al aviso que nunca vino.
 *
 * No escribe nada. Dice lo que PagoPar contesta y, si hay base configurada,
 * lo compara con lo que tenemos guardado: cuando los dos no dicen lo mismo,
 * eso es justamente lo que hay que ver.
 */
import { configurada, cobroPorHash, ultimoCobroConHash } from "./db.js";
import {
  consultarPedidoPagopar,
  getFirstItemFromResultadoValue,
  mapPagoparItemToOrderPaymentStatus,
  maskPagoparCredential,
  stripPagoparSecret,
} from "./pagopar.js";

const ROJO = "\x1b[31m", VERDE = "\x1b[32m", AMBAR = "\x1b[33m", GRIS = "\x1b[90m", FIN = "\x1b[0m";

const PUB = stripPagoparSecret(process.env.PAGOPAR_PUBLIC_KEY);
const PRIV = stripPagoparSecret(process.env.PAGOPAR_PRIVATE_KEY);

if (!PUB || !PRIV) {
  console.log(`\n${ROJO}Faltan las claves de PagoPar.${FIN}\n\n  node --env-file=.env src/consulta.js\n`);
  process.exit(1);
}

let hash = (process.argv[2] || "").trim();
let cobro = null;

if (!hash) {
  if (!configurada()) {
    console.log(`\n${ROJO}Sin base configurada no se cual es el ultimo pedido.${FIN}

Pasale el hash a mano:

  node --env-file=.env src/consulta.js <hash>
`);
    process.exit(1);
  }
  cobro = await ultimoCobroConHash();
  if (!cobro) {
    console.log(`\n${AMBAR}No hay ningun cobro con hash todavia.${FIN}
Creá uno desde la pagina de pago y volve a correr esto.\n`);
    process.exit(1);
  }
  hash = cobro.hash_pedido;
  console.log(`${GRIS}Ultimo cobro: ${cobro.plan} · Gs ${cobro.monto} · ${cobro.creado_en}${FIN}`);
} else if (configurada()) {
  cobro = await cobroPorHash(hash);
}

console.log(`${GRIS}Clave publica: ${maskPagoparCredential(PUB)}${FIN}`);
console.log(`${GRIS}Hash: ${hash}${FIN}\n`);

let data;
try {
  data = await consultarPedidoPagopar(hash, { privateKey: PRIV, publicKey: PUB });
} catch (e) {
  console.log(`\n${ROJO}PagoPar no contesto bien:${FIN} ${e.message}\n`);
  process.exit(1);
}

const item = getFirstItemFromResultadoValue(data?.resultado);
const estado = mapPagoparItemToOrderPaymentStatus(item, data ?? {});
const comoLoVe = { paid: `${VERDE}pagado${FIN}`, failed: `${ROJO}cancelado${FIN}`, pending: `${AMBAR}pendiente${FIN}` }[estado];

console.log(`PagoPar dice: ${comoLoVe}`);
if (item?.forma_pago) console.log(`${GRIS}Forma de pago: ${item.forma_pago}${FIN}`);
if (item?.monto) console.log(`${GRIS}Monto: ${item.monto}${FIN}`);

if (cobro) {
  const nuestro = cobro.estado;
  const esperado = { paid: "pagado", failed: "cancelado", pending: "pendiente" }[estado];
  const igual = nuestro === esperado;
  console.log(`Nosotros tenemos: ${igual ? VERDE : ROJO}${nuestro}${FIN}`);
  if (!igual) {
    console.log(`
${ROJO}No dicen lo mismo.${FIN} El aviso de PagoPar no llego o no se pudo
escribir. Mira el log del server a la hora del pago:

  sudo journalctl -u zentra-cobros --since today | grep -i pagopar
`);
  }
}

console.log(`\n${GRIS}Respuesta completa:${FIN}`);
console.log(JSON.stringify(data, null, 2).slice(0, 2000));
console.log();

/**
 * Probar las claves de PagoPar sin desplegar ni cobrar nada.
 *
 *   node --env-file=.env src/prueba.js
 *   PAGOPAR_PUBLIC_KEY=xxx PAGOPAR_PRIVATE_KEY=yyy node src/prueba.js
 *
 * Crea un pedido de prueba de verdad —mil guaraníes, caduca en una hora— y
 * dice si PagoPar lo aceptó.
 *
 * Existe para separar dos preguntas que de otro modo se mezclan: ¿están bien
 * mis claves?, o ¿está mal armado el pedido? Sin separarlas, un "token no
 * corresponde" puede ser la clave mal copiada, las claves del ambiente
 * equivocado, o el comercio todavía sin habilitar, y no hay forma de saber
 * cuál mirando los logs del server.
 *
 * Usa el mismo `pagopar.js` que el server, así que lo que pase acá es lo que
 * va a pasar allá. No toca la base.
 */
import {
  buildStartTransactionToken,
  checkoutUrlFromHash,
  getPagoparEndpoints,
  iniciarTransaccion,
  isPagoparRespuestaOk,
  maskPagoparCredential,
  stripPagoparSecret,
} from "./pagopar.js";

const PUB = stripPagoparSecret(process.env.PAGOPAR_PUBLIC_KEY);
const PRIV = stripPagoparSecret(process.env.PAGOPAR_PRIVATE_KEY);
const ROJO = "\x1b[31m", VERDE = "\x1b[32m", GRIS = "\x1b[90m", FIN = "\x1b[0m";

if (!PUB || !PRIV) {
  console.log(`\n${ROJO}Faltan las claves.${FIN}

Salen del panel de PagoPar, en "Integrar con mi sitio web".

  node --env-file=.env src/prueba.js
`);
  process.exit(1);
}

console.log(`\n${GRIS}pública ${maskPagoparCredential(PUB)} · privada ${maskPagoparCredential(PRIV)}${FIN}`);
try {
  const ep = getPagoparEndpoints();
  console.log(`${GRIS}ambiente ${ep.env} · ${ep.apiBase}${FIN}`);
} catch (e) {
  console.log(`\n${ROJO}${e.message}${FIN}\n`);
  process.exit(1);
}

// Referencia nueva en cada corrida: PagoPar exige que no se repita, y un
// "pedido duplicado" se confundiría con un problema de claves.
const referencia = "prueba" + Date.now().toString(36);
const monto = 1000;

const cuerpo = {
  token: buildStartTransactionToken(PRIV, referencia, monto),
  public_key: PUB,
  monto_total: monto,
  tipo_pedido: "VENTA-COMERCIO",
  fecha_maxima_pago: new Date(Date.now() + 3600_000).toISOString().slice(0, 19).replace("T", " "),
  id_pedido_comercio: referencia,
  descripcion_resumen: "Prueba de claves",
  comprador: {
    ruc: "", email: "prueba@zentra.com.py", ciudad: 1, nombre: "Prueba Zentra",
    telefono: "", direccion: "", documento: "1234567", coordenadas: "",
    razon_social: "", direccion_referencia: "", tipo_documento: "CI",
  },
  compras_items: [{
    ciudad: 1, nombre: "Prueba", descripcion: "Prueba de claves", cantidad: 1,
    categoria: 909, public_key: PUB, url_imagen: "", id_producto: "prueba",
    precio_total: monto, vendedor_telefono: "", vendedor_direccion: "",
    vendedor_direccion_referencia: "", vendedor_direccion_coordenadas: "",
  }],
};

let data;
try {
  data = await iniciarTransaccion(cuerpo);
} catch (e) {
  console.log(`\n${ROJO}No se pudo contactar a PagoPar.${FIN}\n  ${e.message}\n`);
  process.exit(1);
}

if (isPagoparRespuestaOk(data?.respuesta)) {
  const fila = Array.isArray(data.resultado) ? data.resultado[0] : data.resultado;
  console.log(`\n${VERDE}Las claves andan.${FIN}`);
  console.log(`\nCheckout:\n  ${checkoutUrlFromHash(fila?.data)}\n`);
  console.log(`${GRIS}Caduca solo en una hora. No pagues nada.${FIN}\n`);
  process.exit(0);
}

const motivo = typeof data?.resultado === "string" ? data.resultado : JSON.stringify(data?.resultado);
console.log(`\n${ROJO}PagoPar rechazó el pedido:${FIN}\n  ${motivo}\n`);
if (/token/i.test(String(motivo))) {
  console.log(`${GRIS}Un token rechazado suele ser una de tres:

  1. La clave privada mal copiada (un espacio o un BOM alcanza).
  2. Claves del ambiente equivocado: las de desarrollo no sirven en
     producción ni al revés. Mirá PAGOPAR_ENV.
  3. El comercio todavía sin habilitar para producción. Eso lo destraba
     el soporte de PagoPar, no se arregla desde el código.${FIN}
`);
}
process.exit(1);

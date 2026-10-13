/**
 * Probar las claves de Pagopar sin desplegar nada.
 *
 *   PAGOPAR_PUBLIC_KEY=... PAGOPAR_PRIVATE_KEY=... npm run pagopar:prueba
 *
 * Crea un pedido de prueba de verdad contra Pagopar y muestra qué contestó.
 * Existe para separar dos preguntas que de otro modo se mezclan:
 *
 *   ¿están bien mis claves y mi firma?   ← esto
 *   ¿está bien desplegada mi función?    ← lo otro
 *
 * Sin esto, un "token inválido" puede ser la clave mal copiada, el monto mal
 * escrito en la firma, o el comercio todavía en modo desarrollo, y no hay
 * forma de distinguirlos. Usa el mismo código que la función, así que lo que
 * pruebe acá es lo que va a pasar allá.
 *
 * No crea nada en la base ni cobra nada: el pedido queda abierto en Pagopar y
 * caduca solo en una hora.
 */
import { cuerpoDePedido, leerRespuesta, urlDePago } from "../supabase/functions/pagopar-cobrar/logica.ts";

const PUB = (process.env.PAGOPAR_PUBLIC_KEY ?? "").trim();
const PRIV = (process.env.PAGOPAR_PRIVATE_KEY ?? "").trim();
const API = "https://api.pagopar.com/api/comercios/2.0/iniciar-transaccion";

const ROJO = "\x1b[31m", VERDE = "\x1b[32m", GRIS = "\x1b[90m", FIN = "\x1b[0m";

if (!PUB || !PRIV) {
  console.log(`\n${ROJO}Faltan las claves.${FIN}

Salen del panel de Pagopar, en "Integrar con mi sitio web".

  Linux/Mac:  PAGOPAR_PUBLIC_KEY=xxx PAGOPAR_PRIVATE_KEY=yyy npm run pagopar:prueba
  Windows:    set PAGOPAR_PUBLIC_KEY=xxx && set PAGOPAR_PRIVATE_KEY=yyy && npm run pagopar:prueba
`);
  process.exit(1);
}

// Una referencia nueva en cada corrida: Pagopar exige que no se repita, y un
// "pedido duplicado" se confundiría con un problema de claves.
const referencia = "prueba" + Date.now();
const monto = 1000;

const cuerpo = await cuerpoDePedido(
  {
    referencia,
    montoTotal: monto,
    plan: "max",
    nombrePlan: "Max",
    comprador: {
      nombre: "Prueba Zentra",
      email: "prueba@zentra.com.py",
      documento: "1234567",
    },
    vencePago: new Date(Date.now() + 3600_000),
  },
  PUB,
  PRIV,
);

console.log(`\n${GRIS}Pedido ${referencia} por Gs. ${monto.toLocaleString("es-PY")}${FIN}`);
// La firma se muestra para poder compararla a mano con la del soporte de
// Pagopar si hace falta. La clave privada NO se muestra nunca.
console.log(`${GRIS}Firma: ${cuerpo.token}${FIN}`);

let json;
try {
  const r = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  json = await r.json();
} catch (e) {
  console.log(`\n${ROJO}No se pudo contactar a Pagopar.${FIN}\n  ${e.message}\n`);
  process.exit(1);
}

const leido = leerRespuesta(json);

if (leido.ok) {
  console.log(`\n${VERDE}Las claves andan.${FIN}`);
  console.log(`\nAbrí esto para ver el checkout:\n  ${urlDePago(leido.hash)}\n`);
  console.log(`${GRIS}El pedido caduca solo en una hora. No pagues nada.${FIN}\n`);
  process.exit(0);
}

console.log(`\n${ROJO}Pagopar rechazó el pedido:${FIN}\n  ${leido.error}\n`);

if (/token/i.test(leido.error)) {
  console.log(`${GRIS}Un token rechazado suele ser una de tres:

  1. La clave privada está mal copiada (un espacio de más alcanza).
  2. Las claves son de otro ambiente: las de desarrollo no sirven en
     producción y al revés tampoco.
  3. El comercio todavía no está habilitado para producción. Eso lo
     destraba el soporte de Pagopar, no se arregla desde el código.

La firma se arma como sha1(clave_privada + referencia + monto), con el monto
escrito "1000" y no "1000.00". Eso ya está probado de nuestro lado.${FIN}
`);
}
process.exit(1);

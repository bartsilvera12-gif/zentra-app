/**
 * El cobro de prueba.
 *
 * Para probar el circuito en produccion hay que pagar de verdad, y pagar
 * Gs 89.000 cada vez que se toca algo no es una opcion. Esto cobra el plan
 * que se eligio pero por un monto chico.
 *
 * NO es un plan. Pensarlo como "un plan de mil guaranies que da todo" seria
 * agregar un cuarto codigo a la tabla de planes, a los dos `check` de la base
 * y a la app, y dejarlo ahi para siempre: un plan que da Max por mil, a un
 * descuido de aparecer en la lista. Asi no: se cobra `max`, la empresa queda
 * en `max` igual que con una compra real, y lo unico distinto es el monto.
 * Probar tiene que recorrer lo mismo que recorre un cliente, o no prueba
 * nada.
 *
 * Esta apagado salvo que `COBRO_PRUEBA_CLAVE` tenga una clave larga, y esa
 * clave vive solo en el `.env` del server. Quien la tenga se compra un mes de
 * Max por mil guaranies: esa es la contra de que exista, y es por eso que la
 * clave tiene minimo y que cada cobro asi queda gritado en el log.
 *
 * Vive en su propio archivo porque es la clase de regla que hay que poder
 * probar sin levantar el server.
 */
import crypto from "node:crypto";

/**
 * Lo corto se adivina. Dieciseis caracteres no es un numero magico: es el
 * largo abajo del cual alguien con tiempo y un script llega.
 */
export const LARGO_MINIMO = 16;

/** Si la configuracion habilita el camino de prueba. */
export function claveUsable(clave, monto) {
  return String(clave || "").trim().length >= LARGO_MINIMO && Number.isFinite(monto) && monto > 0;
}

/**
 * Compara sin delatar por el tiempo que tarda cuantos caracteres acerto.
 * Dos claves de largo distinto no se comparan: ahi el largo ya se filtro, y
 * no hay nada que ocultar porque no coinciden igual.
 */
export function claveCoincide(guardada, recibida) {
  const a = Buffer.from(String(guardada ?? ""), "utf8");
  const b = Buffer.from(String(recibida ?? ""), "utf8");
  if (a.length === 0 || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Si este pedido va por el camino de prueba. */
export function esCobroDePrueba(guardada, monto, recibida) {
  return claveUsable(guardada, monto) && claveCoincide(guardada, recibida);
}

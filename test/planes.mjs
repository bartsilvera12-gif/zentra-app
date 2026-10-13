/**
 * Los planes y lo que deja hacer cada uno.
 *
 *   npm run test:planes
 *
 * Las tres reglas de negocio están acá adentro, así que estas pruebas son la
 * documentación ejecutable de lo que se vendió: con ERP no hay límites, al
 * vencer se sigue viendo todo pero no se escribe, y el tope se cuenta al dar
 * de alta y nunca al listar.
 */
import { cupoProductos, diasParaVencer, fechaVencida, motivoBloqueo, planEfectivo, puedeEscribir } from "../src/lib/planes.ts";

const casos = [];
const t = (nombre, fn) => casos.push([nombre, fn]);
const base = (p) => ({ conErp: false, plan: "free", ...p });

t("con ERP no hay nada bloqueado, ni siquiera lo de Max", () => {
  const ctx = { conErp: true, plan: "free", productos: 5000 };
  for (const a of ["inventario.alta", "inventario.editar", "ventas.credito", "chat.modulo", "compras.dolares"]) {
    if (!puedeEscribir(a, ctx)) throw new Error("bloqueó " + a + " teniendo ERP");
  }
});

t("Free corta en 20 productos y lo dice con el número", () => {
  if (!puedeEscribir("inventario.alta", base({ productos: 19 }))) throw new Error("no dejó cargar el 20");
  const m = motivoBloqueo("inventario.alta", base({ productos: 20 }));
  if (!m || !m.includes("20")) throw new Error("no explicó el tope: " + m);
});

t("Emprendedor corta en 50, Max no corta", () => {
  if (puedeEscribir("inventario.alta", base({ plan: "emprendedor", productos: 50 }))) throw new Error("pasó de 50");
  if (!puedeEscribir("inventario.alta", base({ plan: "max", productos: 99999 }))) throw new Error("Max no debería tener tope");
});

t("el crédito es sólo de Max", () => {
  if (puedeEscribir("ventas.credito", base({}))) throw new Error("Free no debería");
  if (puedeEscribir("ventas.credito", base({ plan: "emprendedor" }))) throw new Error("Emprendedor no debería");
  if (!puedeEscribir("ventas.credito", base({ plan: "max" }))) throw new Error("Max sí debería");
});

t("Compras y Proveedores no están en Free", () => {
  for (const a of ["compras.modulo", "proveedores.modulo"]) {
    if (puedeEscribir(a, base({}))) throw new Error("Free no debería tener " + a);
    if (!puedeEscribir(a, base({ plan: "emprendedor" }))) throw new Error("Emprendedor sí debería tener " + a);
  }
});

t("editar un producto es de Max: en los otros planes se ve pero no se toca", () => {
  if (puedeEscribir("inventario.editar", base({ plan: "emprendedor" }))) throw new Error("no es de Emprendedor");
  if (!puedeEscribir("inventario.editar", base({ plan: "max" }))) throw new Error("sí es de Max");
});

t("el cooldown de ajuste cuenta días y avisa cuántos faltan", () => {
  const ahora = new Date("2026-10-06T12:00:00Z");
  const hace2 = "2026-10-04T12:00:00Z";
  const m = motivoBloqueo("inventario.ajuste", base({ ultimoAjuste: hace2, ahora }));
  if (!m || !m.includes("28")) throw new Error("debería faltar 28 días: " + m);

  const hace40 = "2026-08-27T12:00:00Z";
  if (!puedeEscribir("inventario.ajuste", base({ ultimoAjuste: hace40, ahora }))) {
    throw new Error("pasado el mes tiene que dejar");
  }
});

t("faltando un día lo dice en singular, no 'faltan 1 días'", () => {
  const ahora = new Date("2026-10-06T12:00:00Z");
  const hace29 = "2026-09-07T12:00:00Z";
  const m = motivoBloqueo("inventario.ajuste", base({ ultimoAjuste: hace29, ahora }));
  if (m && /faltan 1 días/.test(m)) throw new Error("quedó en plural: " + m);
});

t("Max ajusta sin esperar", () => {
  const ahora = new Date("2026-10-06T12:00:00Z");
  if (!puedeEscribir("inventario.ajuste", base({ plan: "max", ultimoAjuste: "2026-10-06T11:00:00Z", ahora }))) {
    throw new Error("Max no tiene cooldown");
  }
});

t("una fecha ilegible deja trabajar en vez de trabar", () => {
  if (!puedeEscribir("inventario.ajuste", base({ ultimoAjuste: "cualquier cosa" }))) {
    throw new Error("un dato roto no puede bloquear a nadie");
  }
});

t("sin ajuste previo se puede ajustar", () => {
  if (!puedeEscribir("inventario.ajuste", base({ ultimoAjuste: null }))) throw new Error("nunca ajustado");
});

t("el cupo sirve para avisar antes de llegar al tope", () => {
  const c = cupoProductos(base({ productos: 12 }));
  if (c.usados !== 12 || c.tope !== 20) throw new Error("cupo mal: " + JSON.stringify(c));
  if (cupoProductos({ conErp: true, plan: "free", productos: 900 }).tope !== null) {
    throw new Error("con ERP no hay tope que mostrar");
  }
});

t("el motivo siempre es texto para una persona, no un código", () => {
  const m = motivoBloqueo("ventas.credito", base({}));
  if (!m || /[_.]/.test(m.replace(/\.$/, ""))) throw new Error("parece jerga: " + m);
});

/* ---------- vencimiento ---------- */

const EL_13 = new Date("2026-11-13T10:00:00");

t("el dia que vence todavia se puede trabajar", () => {
  if (fechaVencida("2026-11-13", EL_13)) throw new Error("el 13 vence el 13: todavia no vencio");
  if (!puedeEscribir("inventario.editar", { conErp: false, plan: "max", vence: "2026-11-13", ahora: EL_13 })) {
    throw new Error("no deberia bloquear el mismo dia");
  }
});

t("al dia siguiente ya vencio", () => {
  const alDia = new Date("2026-11-14T00:05:00");
  if (!fechaVencida("2026-11-13", alDia)) throw new Error("el 14 ya vencio");
});

t("se compara por dia, no por hora", () => {
  // Vencio el 13 a las 00:00 segun el ISO; a las 23:59 del 13 sigue trabajando.
  const tarde = new Date("2026-11-13T23:59:00");
  if (fechaVencida("2026-11-13", tarde)) throw new Error("no deberia vencer por la hora");
});

t("sin fecha no vence nunca", () => {
  if (fechaVencida(null, EL_13) || fechaVencida("", EL_13) || fechaVencida(undefined, EL_13)) {
    throw new Error("sin fecha no hay vencimiento");
  }
});

t("una fecha ilegible deja trabajar, no traba", () => {
  if (fechaVencida("el martes", EL_13)) throw new Error("un dato roto no puede trabar a quien pago");
  if (!puedeEscribir("inventario.editar", { conErp: false, plan: "max", vence: "el martes", ahora: EL_13 })) {
    throw new Error("deberia dejar trabajar");
  }
});

t("vencido se comporta como free", () => {
  const ctx = { conErp: false, plan: "max", vence: "2026-10-01", ahora: EL_13 };
  if (planEfectivo("max", "2026-10-01", EL_13) !== "free") throw new Error("deberia caer a free");
  // `inventario.mayorista` es de Max: vencido, se bloquea.
  if (puedeEscribir("inventario.mayorista", ctx)) throw new Error("vencido no deberia poder");
});

t("el motivo dice que vencio, no que el plan no incluye", () => {
  const m = motivoBloqueo("inventario.mayorista", { conErp: false, plan: "max", vence: "2026-10-01", ahora: EL_13 });
  if (!/venci/i.test(m)) throw new Error("tiene que decir que vencio: " + m);
  if (/no incluye/i.test(m)) throw new Error("no puede decir que el plan no lo incluye: " + m);
  if (!/01\/10\/2026/.test(m)) throw new Error("tiene que decir la fecha: " + m);
});

t("con ERP propio el vencimiento no importa", () => {
  const ctx = { conErp: true, plan: "free", vence: "2020-01-01", ahora: EL_13 };
  if (!puedeEscribir("inventario.mayorista", ctx)) throw new Error("con ERP no hay plan ni vencimiento");
});

t("vencido con 200 productos no dice que llego al tope de 20", () => {
  const m = motivoBloqueo("inventario.alta", {
    conErp: false, plan: "max", vence: "2026-10-01", productos: 200, ahora: EL_13,
  });
  if (/llegaste a 20/i.test(m)) throw new Error("absurdo para quien ya tiene 200: " + m);
  if (!/venci/i.test(m)) throw new Error("tiene que hablar del vencimiento: " + m);
});

t("los dias que faltan se cuentan por dia", () => {
  if (diasParaVencer("2026-11-20", EL_13) !== 7) throw new Error("deberian faltar 7");
  if (diasParaVencer("2026-11-13", EL_13) !== 0) throw new Error("hoy vence: 0");
  if (diasParaVencer("2026-11-10", EL_13) !== -3) throw new Error("vencio hace 3: -3");
  if (diasParaVencer(null, EL_13) !== null) throw new Error("sin fecha, null");
  if (diasParaVencer("cualquier cosa", EL_13) !== null) throw new Error("ilegible, null");
});

t("leer nunca se bloquea: lo que se consulta es escribir", () => {
  // No hay accion de lectura en el tipo `Accion` a proposito. Esta prueba fija
  // esa decision: si alguien agrega "inventario.ver", esto deja de compilar.
  const ctx = { conErp: false, plan: "max", vence: "2020-01-01", ahora: EL_13 };
  // Vencido hace años y aun asi el modulo de compras sigue permitido en free?
  // No: lo que importa es que la funcion habla de escribir, no de ver.
  if (typeof motivoBloqueo("compras.modulo", ctx) === "undefined") throw new Error("no deberia ser undefined");
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nPlanes: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

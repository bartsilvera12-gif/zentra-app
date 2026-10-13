/**
 * El aviso de que el plan vence.
 *
 *   npm run test:vencimiento
 *
 * Lo que se prueba acá es sobre todo cuándo NO avisar: un aviso de cobranza
 * repetido todos los días se ignora justo el día que importa.
 */
import { hayQueAvisar, hitoDeHoy, textoVencimiento } from "../src/lib/vencimiento.ts";

const casos = [];
const t = (nombre, fn) => casos.push([nombre, fn]);
const EL_13 = new Date("2026-11-13T10:00:00");

t("avisa una semana antes, a los tres dias, el dia antes y el dia que vence", () => {
  if (hitoDeHoy("2026-11-20", EL_13) !== 7) throw new Error("falta el de 7 dias");
  if (hitoDeHoy("2026-11-16", EL_13) !== 3) throw new Error("falta el de 3 dias");
  if (hitoDeHoy("2026-11-14", EL_13) !== 1) throw new Error("falta el de mañana");
  if (hitoDeHoy("2026-11-13", EL_13) !== 0) throw new Error("falta el de hoy");
});

t("no avisa todos los dias", () => {
  // Faltan 5: no es hito, no se avisa.
  if (hitoDeHoy("2026-11-18", EL_13) !== null) throw new Error("no deberia avisar faltando 5");
  if (hitoDeHoy("2026-11-15", EL_13) !== null) throw new Error("no deberia avisar faltando 2");
});

t("sin fecha no avisa nada", () => {
  if (hitoDeHoy(null, EL_13) !== null) throw new Error("sin fecha, sin aviso");
  if (hitoDeHoy("cualquier cosa", EL_13) !== null) throw new Error("ilegible, sin aviso");
});

t("vencido avisa una sola vez, no todos los dias", () => {
  const avisado = { vence: "2026-11-01", hito: -1 };
  if (hitoDeHoy("2026-11-01", EL_13) !== -1) throw new Error("vencido deberia dar -1");
  if (hayQueAvisar("2026-11-01", avisado, EL_13) !== null) throw new Error("ya se aviso: no insistir");
});

t("no repite el mismo hito", () => {
  const avisado = { vence: "2026-11-20", hito: 7 };
  if (hayQueAvisar("2026-11-20", avisado, EL_13) !== null) throw new Error("ya aviso el de 7");
});

t("pero si avisa el siguiente, que es mas urgente", () => {
  const avisado = { vence: "2026-11-16", hito: 7 };
  // Hoy faltan 3: mas urgente que el 7 ya avisado.
  if (hayQueAvisar("2026-11-16", avisado, EL_13) !== 3) throw new Error("deberia avisar el de 3");
});

t("al renovar vuelve a avisar, porque la fecha es otra", () => {
  // Se habia avisado todo para noviembre; renovo y ahora vence en diciembre.
  const avisado = { vence: "2026-11-13", hito: -1 };
  if (hayQueAvisar("2026-12-20", avisado, new Date("2026-12-13T10:00:00")) !== 7) {
    throw new Error("una fecha nueva empieza de cero");
  }
});

t("los textos hablan como una persona y dicen que hacer", () => {
  if (!/mañana/i.test(textoVencimiento(1).titulo)) throw new Error("el de 1 dia dice mañana");
  if (/1 días/.test(textoVencimiento(1).titulo)) throw new Error("'1 días' no se dice");
  if (!/hoy/i.test(textoVencimiento(0).titulo)) throw new Error("el de hoy dice hoy");
  if (!/7 días/.test(textoVencimiento(7).titulo)) throw new Error("el de 7 dice 7 dias");
  const v = textoVencimiento(-1);
  if (!/venci/i.test(v.titulo)) throw new Error("el de vencido lo dice");
  // La regla de negocio: se sigue viendo, no se puede escribir.
  if (!/ver|viendo/i.test(v.cuerpo)) throw new Error("tiene que aclarar que se sigue viendo: " + v.cuerpo);
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nVencimiento: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

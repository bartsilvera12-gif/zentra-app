/**
 * El soporte de la app: con qué llega un mensaje del otro lado.
 *
 *   npm run test:soporte
 *
 * Lo que se prueba acá no es cosmética. Un mensaje de soporte sin la versión
 * ni la empresa obliga a preguntar lo mismo tres veces, y esa vuelta convierte
 * diez minutos en dos días.
 */
import { linkDeSoporte, mensajeDeSoporte, MARCA_SOPORTE, SALUDO_SOPORTE } from "../src/lib/soporte.ts";

const casos = [];
const t = (n, f) => casos.push([n, f]);
const datos = { nombre: "Karen", empresa: "Neura", version: "2.4.1", build: "abc1234" };

t("el mensaje se reconoce como de la app, para mandarlo a su cola", () => {
  const m = mensajeDeSoporte("ayuda", datos);
  if (!m.startsWith(MARCA_SOPORTE)) throw new Error("sin la marca se mezcla con los clientes del ERP: " + m);
});

t("lleva quien escribe, de que empresa y que version tiene", () => {
  const m = mensajeDeSoporte("ayuda", datos);
  for (const dato of ["Karen", "Neura", "2.4.1", "abc1234"]) {
    if (!m.includes(dato)) throw new Error("falta " + dato + ": " + m);
  }
});

t("sin sesion igual sale, con lo que se sepa", () => {
  // Alguien que no pudo entrar es justamente quien más necesita escribir.
  const m = mensajeDeSoporte("ayuda", { version: "2.4.1" });
  if (!m.startsWith(MARCA_SOPORTE)) throw new Error("perdió la marca");
  if (!m.includes("2.4.1")) throw new Error("perdió la versión");
  if (/ · ·|undefined|null/.test(m)) throw new Error("quedaron huecos: " + m);
});

t("ayuda y mejora no dicen lo mismo", () => {
  const ayuda = mensajeDeSoporte("ayuda", datos);
  const mejora = mensajeDeSoporte("mejora", datos);
  if (ayuda === mejora) throw new Error("el mismo texto para las dos cosas");
  if (!/mejora/i.test(mejora)) throw new Error("la sugerencia no se anuncia como tal");
});

t("el mensaje queda abierto, para que lo termine quien escribe", () => {
  // Uno "completo" se manda tal cual y no dice nada.
  const m = mensajeDeSoporte("ayuda", datos);
  if (!m.trimEnd().endsWith(":")) throw new Error("no invita a seguir escribiendo: " + m);
});

t("el link va al numero de ATC de la app", () => {
  const url = linkDeSoporte("+595 973 989068", "ayuda", datos);
  if (!url.startsWith("https://wa.me/595973989068?text=")) throw new Error(url);
  // El texto va escapado: un salto de línea sin escapar corta el enlace.
  if (/\s/.test(url)) throw new Error("el enlace tiene espacios sin escapar");
});

t("sin numero no se ofrece un chat a la nada", () => {
  if (linkDeSoporte("", "ayuda", datos) !== null) throw new Error("devolvió un link sin número");
});

t("el saludo no se casa con una hora del dia", () => {
  // Un "buenas tardes" automático a las nueve de la mañana deja peor parado
  // que no saludar.
  if (/buenas (tardes|noches)|buen día/i.test(SALUDO_SOPORTE)) throw new Error(SALUDO_SOPORTE);
  if (!/captura/i.test(SALUDO_SOPORTE)) throw new Error("no pide lo que de todos modos se va a pedir");
});

let malas = 0;
for (const [n, f] of casos) {
  try { await f(); console.log("  OK · " + n); }
  catch (e) { malas++; console.log("  FALLA · " + n + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nSoporte: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

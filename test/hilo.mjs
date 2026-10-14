/**
 * Cuándo se mueve la vista del hilo.
 *
 *   npm run test:hilo
 *
 * Existe porque esto ya se rompió dos veces: una al abrir el chat arriba del
 * todo, y otra cuando el refresco automático empezó a tirar la vista al final
 * mientras alguien leía historial.
 */
import { alFinal, debeBajarAlAbrir, vaSinGlobo } from "../src/lib/hilo.ts";

const casos = [];
const t = (n, f) => casos.push([n, f]);

t("al abrir NO se baja hasta que lleguen los mensajes", () => {
  // Esta es la que estaba mal: la pantalla se dibuja antes que la respuesta
  // del ERP. Si acá dijera true, se daria por bajada con la lista vacia y
  // despues nadie bajaria.
  if (debeBajarAlAbrir(null, "c1", 0)) throw new Error("sin mensajes no hay a donde bajar");
});

t("cuando llegan, se baja", () => {
  if (!debeBajarAlAbrir(null, "c1", 12)) throw new Error("deberia bajar");
});

t("una sola vez por conversacion", () => {
  if (debeBajarAlAbrir("c1", "c1", 12)) throw new Error("ya se bajo para c1");
});

t("al cambiar de conversacion se vuelve a bajar", () => {
  if (!debeBajarAlAbrir("c1", "c2", 5)) throw new Error("c2 es otra conversacion");
});

t("sin conversacion abierta no se hace nada", () => {
  if (debeBajarAlAbrir(null, null, 10)) throw new Error("no hay chat abierto");
});

t("al final es al final", () => {
  if (!alFinal({ scrollHeight: 1000, scrollTop: 800, clientHeight: 200 })) throw new Error("justo al final");
  // Tres pixeles de diferencia siguen siendo "al final": el teclado o una
  // imagen que termino de cargar los mueven solos.
  if (!alFinal({ scrollHeight: 1000, scrollTop: 797, clientHeight: 200 })) throw new Error("con margen");
});

t("leyendo historial NO es al final", () => {
  if (alFinal({ scrollHeight: 5000, scrollTop: 100, clientHeight: 600 })) {
    throw new Error("subio a leer: no hay que moverle la vista");
  }
});

t("una conversacion mas corta que la pantalla esta siempre al final", () => {
  if (!alFinal({ scrollHeight: 300, scrollTop: 0, clientHeight: 600 })) {
    throw new Error("si entra entera, estas al final");
  }
});

/* ───── el globo de los mensajes con imagen ───── */

t("una foto sola va sin globo", () => {
  if (!vaSinGlobo({ de: "ellos", hora: "10:00", imagen: "https://x/y.jpg" })) {
    throw new Error("el marco alrededor de una foto sola sobra");
  }
});

t("una foto CON pie va con globo", () => {
  // El pie de una foto de WhatsApp viaja en `epigrafe`, no en `texto`. Sin
  // esto, quedaba la imagen y abajo el texto suelto sobre el fondo del hilo:
  // sin globo, sin hora y sin tilde. Parecia la app rota a la mitad del chat.
  if (vaSinGlobo({ de: "ellos", hora: "10:00", imagen: "https://x/y.jpg", epigrafe: "mira esto" })) {
    throw new Error("la foto con pie necesita globo");
  }
});

t("una foto con texto va con globo", () => {
  if (vaSinGlobo({ de: "yo", hora: "10:00", imagen: "https://x/y.jpg", texto: "ahi va" })) {
    throw new Error("la foto con texto necesita globo");
  }
});

t("un video con pie tambien", () => {
  if (vaSinGlobo({ de: "ellos", hora: "10:00", video: "https://x/y.mp4", epigrafe: "el local" })) {
    throw new Error("el video con pie necesita globo");
  }
});

t("un sticker va sin globo", () => {
  if (!vaSinGlobo({ de: "ellos", hora: "10:00", sticker: "https://x/s.webp" })) {
    throw new Error("el sticker no lleva marco");
  }
});

t("un mensaje de texto va con globo", () => {
  if (vaSinGlobo({ de: "ellos", hora: "10:00", texto: "hola" })) throw new Error("el texto lleva globo");
});

let malas = 0;
for (const [n, f] of casos) {
  try { await f(); console.log("  OK · " + n); }
  catch (e) { malas++; console.log("  FALLA · " + n + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nHilo: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

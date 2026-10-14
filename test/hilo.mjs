/**
 * Cuándo se mueve la vista del hilo.
 *
 *   npm run test:hilo
 *
 * Existe porque esto ya se rompió dos veces: una al abrir el chat arriba del
 * todo, y otra cuando el refresco automático empezó a tirar la vista al final
 * mientras alguien leía historial.
 */
import { alFinal, altoDeEscritura, citaDe, debeBajarAlAbrir, marcaLocal, pegarReacciones, resolverCitas, resumenDeMensaje, vaSinGlobo } from "../src/lib/hilo.ts";

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

t("una foto citando otro mensaje lleva globo", () => {
  if (vaSinGlobo({ de: "yo", hora: "10:00", imagen: "https://x/f.jpg", cita: { texto: "hola", mio: false } })) {
    throw new Error("la cita se dibuja arriba del contenido y necesita el globo");
  }
});

t("la cita con resumen del ERP no necesita buscar nada", () => {
  const c = citaDe({ reply_context: { wa_message_id: "wamid.AAA", from_me: true, preview: "el precio" } });
  if (c?.texto !== "el precio" || c.mio !== true) throw new Error("no leyó reply_context");
});

t("la cita de WhatsApp llega sólo con el wamid", () => {
  const c = citaDe({ context: { id: "wamid.BBB" } });
  if (c?.wamid !== "wamid.BBB" || c.texto) throw new Error("no leyó el nodo context");
});

t("un id que no es wamid no arma cita", () => {
  // Un id de la base no sirve para encontrar el mensaje: dibujaría una cita
  // vacía, que confunde más que no mostrar ninguna.
  if (citaDe({ context: { id: "42" } })) throw new Error("aceptó un id que no es de WhatsApp");
});

t("una foto citada se resume como Foto", () => {
  if (resumenDeMensaje({ de: "ellos", hora: "10:00", imagen: "https://x/f.jpg" }) !== "\u{1F4F7} Foto") {
    throw new Error("una foto citada no puede quedar en blanco");
  }
});

t("la segunda pasada completa la cita con el mensaje del hilo", () => {
  const hilo = resolverCitas([
    { de: "ellos", hora: "10:00", texto: "cuánto sale", wamid: "wamid.CCC" },
    { de: "yo", hora: "10:01", texto: "120.000", citaPendiente: "wamid.CCC" },
  ]);
  if (hilo[1].cita?.texto !== "cuánto sale" || hilo[1].cita.mio !== false) {
    throw new Error("no encontró el mensaje citado");
  }
  if ("citaPendiente" in hilo[1]) throw new Error("quedó el pendiente adentro del mensaje");
});

t("una cita a un mensaje que no está en el tramo se descarta", () => {
  const hilo = resolverCitas([{ de: "yo", hora: "10:01", texto: "ok", citaPendiente: "wamid.ZZZ" }]);
  if (hilo[0].cita) throw new Error("una cita vacía confunde más que ninguna");
});

t("dos globos provisorios del mismo instante no comparten marca", () => {
  // Una foto y su pie salen en el mismo milisegundo: si compartieran marca,
  // sacar uno sacaría el otro.
  if (marcaLocal() === marcaLocal()) throw new Error("la marca se repite");
});

t("la reaccion se cuelga del mensaje reaccionado y la fila suelta se va", () => {
  const hilo = pegarReacciones([
    { de: "ellos", hora: "13:52", texto: "muchisimas gracias", wamid: "wamid.A" },
    { de: "yo", hora: "13:53", reaccion: "\u2764\uFE0F", reaccionSobre: "wamid.A" },
  ]);
  if (hilo.length !== 1) throw new Error("quedó la fila suelta de la reacción");
  if (hilo[0].reacciones?.[0] !== "\u2764\uFE0F") throw new Error("la reacción no quedó en el mensaje");
});

t("sacar la reaccion la saca de la app", () => {
  // WhatsApp avisa con una fila de reacción con el emoji vacío.
  const hilo = pegarReacciones([
    { de: "ellos", hora: "13:52", texto: "gracias", wamid: "wamid.A" },
    { de: "yo", hora: "13:53", reaccion: "\u2764\uFE0F", reaccionSobre: "wamid.A" },
    { de: "yo", hora: "13:54", reaccion: "", reaccionSobre: "wamid.A" },
  ]);
  if (hilo.length !== 1) throw new Error("quedaron filas sueltas");
  if (hilo[0].reacciones) throw new Error("la reacción retirada sigue puesta");
});

t("cambiar de emoji no deja los dos", () => {
  const hilo = pegarReacciones([
    { de: "ellos", hora: "13:52", texto: "gracias", wamid: "wamid.A" },
    { de: "yo", hora: "13:53", reaccion: "\u{1F44D}", reaccionSobre: "wamid.A" },
    { de: "yo", hora: "13:54", reaccion: "\u2764\uFE0F", reaccionSobre: "wamid.A" },
  ]);
  if (hilo[0].reacciones?.length !== 1) throw new Error("quedaron dos emojis del mismo lado");
  if (hilo[0].reacciones[0] !== "\u2764\uFE0F") throw new Error("se quedó con el viejo");
});

t("cada lado tiene la suya", () => {
  const hilo = pegarReacciones([
    { de: "ellos", hora: "13:52", texto: "gracias", wamid: "wamid.A" },
    { de: "yo", hora: "13:53", reaccion: "\u2764\uFE0F", reaccionSobre: "wamid.A" },
    { de: "ellos", hora: "13:54", reaccion: "\u{1F44D}", reaccionSobre: "wamid.A" },
  ]);
  if (hilo[0].reacciones?.length !== 2) throw new Error("se pisaron entre lados");
});

t("si el mensaje reaccionado no esta, la reaccion se sigue viendo", () => {
  // Quedó fuera del tramo que trajo el ERP: mostrarla suelta es menos malo
  // que perderla.
  const hilo = pegarReacciones([{ de: "yo", hora: "13:53", reaccion: "\u2764\uFE0F", reaccionSobre: "wamid.NOESTA" }]);
  if (hilo.length !== 1 || !hilo[0].reaccion) throw new Error("se perdió la reacción");
});

t("el cuadro de escritura crece con el texto", () => {
  const una = altoDeEscritura(38);
  const tres = altoDeEscritura(80);
  if (!(tres > una)) throw new Error("no creció");
});

t("una linea sola no deja el cuadro mas chico de lo que es", () => {
  if (altoDeEscritura(12) !== 38) throw new Error("se achicó abajo del mínimo");
  if (altoDeEscritura(0) !== 38) throw new Error("sin medida tendría que quedar en una línea");
});

t("un parrafo largo no se come la conversacion", () => {
  // De cinco líneas para arriba el cuadro se queda quieto y scrollea adentro.
  if (altoDeEscritura(900) !== 116) throw new Error("creció sin límite: " + altoDeEscritura(900));
});

let malas = 0;
for (const [n, f] of casos) {
  try { await f(); console.log("  OK · " + n); }
  catch (e) { malas++; console.log("  FALLA · " + n + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nHilo: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

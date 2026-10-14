/**
 * La ubicación que se manda por el chat.
 *
 *   npm run test:ubicacion
 *
 * El GPS devuelve cualquier cosa cuando todavía no fijó posición, y mandarle a
 * un cliente un pin en el Golfo de Guinea es peor que decirle que no se pudo.
 */
import { enlaceDeMapa, posicionValida, textoDeUbicacion } from "../src/lib/ubicacion.ts";

const casos = [];
const t = (n, f) => casos.push([n, f]);

t("el enlace lleva las coordenadas en el formato que abren los mapas", () => {
  const u = enlaceDeMapa({ lat: -25.2637, lng: -57.5759 });
  if (u !== "https://www.google.com/maps?q=-25.2637,-57.5759") throw new Error(u);
});

t("no se escriben mas decimales de los que significan algo", () => {
  // Seis decimales son ~11 cm: lo que sigue es ruido del GPS escrito como dato.
  const u = enlaceDeMapa({ lat: -25.26371234567, lng: -57.5759 });
  if (u !== "https://www.google.com/maps?q=-25.263712,-57.5759") throw new Error(u);
});

t("el mensaje se entiende en la notificacion, donde se ve una linea sola", () => {
  const txt = textoDeUbicacion({ lat: -25.2637, lng: -57.5759 });
  if (!txt.startsWith("\u{1F4CD} Mi ubicación: https://")) throw new Error(txt);
});

t("una posicion de verdad pasa", () => {
  if (!posicionValida({ lat: -25.2637, lng: -57.5759 })) throw new Error("rechazó una posición válida");
});

t("cero cero no es una ubicacion, es un GPS que todavia no fijo", () => {
  if (posicionValida({ lat: 0, lng: 0 })) throw new Error("aceptó el Golfo de Guinea");
});

t("fuera de rango no se manda", () => {
  if (posicionValida({ lat: 91, lng: 0 })) throw new Error("aceptó una latitud imposible");
  if (posicionValida({ lat: 0, lng: -181 })) throw new Error("aceptó una longitud imposible");
});

t("sin posicion no se inventa nada", () => {
  if (posicionValida(null) || posicionValida({ lat: NaN, lng: 0 })) throw new Error("aceptó una lectura vacía");
});

let malas = 0;
for (const [n, f] of casos) {
  try { await f(); console.log("  OK · " + n); }
  catch (e) { malas++; console.log("  FALLA · " + n + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nUbicación: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

/**
 * Achicar la foto antes de mandarla.
 *
 *   npm run test:imagen
 *
 * Una foto del teléfono pesa 3 o 4 MB y el camino nativo le suma un tercio al
 * codificarla: la subida se hacía eterna con datos móviles.
 */
import { medidaAchicada, necesitaAchicar, nombreAchicado } from "../src/lib/imagen.ts";

const casos = [];
const t = (n, f) => casos.push([n, f]);

t("una foto del telefono se achica", () => {
  if (!necesitaAchicar("image/jpeg", 3605 * 1024)) throw new Error("no achicó una foto de 3,6 MB");
});

t("un ticket chico se manda tal cual", () => {
  // Pasarlo por el canvas no mejora nada y le saca calidad.
  if (necesitaAchicar("image/png", 63 * 1024)) throw new Error("tocó una imagen de 63 KB");
});

t("un documento no se toca nunca", () => {
  // Una factura tiene que llegar byte por byte.
  if (necesitaAchicar("application/pdf", 9_000_000)) throw new Error("recomprimió un PDF");
  if (necesitaAchicar("video/mp4", 9_000_000)) throw new Error("tocó un video");
});

t("la proporcion se mantiene", () => {
  const m = medidaAchicada(4000, 3000);
  if (m.ancho !== 1600 || m.alto !== 1200) throw new Error(`${m.ancho}x${m.alto}`);
});

t("la foto vertical se mide por el lado largo", () => {
  const m = medidaAchicada(3000, 4000);
  if (m.ancho !== 1200 || m.alto !== 1600) throw new Error(`${m.ancho}x${m.alto}`);
});

t("una foto chica no se agranda", () => {
  // Estirarla pesaría más y se vería peor.
  const m = medidaAchicada(800, 600);
  if (m.ancho !== 800 || m.alto !== 600) throw new Error(`${m.ancho}x${m.alto}`);
});

t("el nombre dice lo que el archivo es", () => {
  if (nombreAchicado("IMG_20261014.png") !== "IMG_20261014.jpg") throw new Error(nombreAchicado("IMG_20261014.png"));
  if (nombreAchicado("foto.jpeg") !== "foto.jpeg") throw new Error("renombró un jpeg que ya estaba bien");
});

let malas = 0;
for (const [n, f] of casos) {
  try { await f(); console.log("  OK · " + n); }
  catch (e) { malas++; console.log("  FALLA · " + n + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nImagen: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

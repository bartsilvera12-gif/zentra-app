/**
 * Que las notas de voz se escuchen enteras.
 *
 *   npm run test:notas-de-voz
 *
 * Dos cosas las cortaban a la mitad, y las dos son de cómo se dibuja la
 * lista, no del audio: se prueban leyendo el código porque el reproductor
 * necesita un navegador de verdad.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const CHAT = readFileSync("src/mobile/screens/ConversacionesScreen.tsx", "utf8");

test("los globos se identifican por el mensaje, no por la posición", () => {
  // Con `key={i}`, al entrar un mensaje o cargar los anteriores las
  // posiciones se corrían y el reproductor que sonaba recibía otro audio.
  assert.doesNotMatch(CHAT, /^\s*key=\{i\}/m);
  assert.match(CHAT, /m\.wamid \? `w:\$\{m\.wamid\}`/);
});

test("mientras suena, el reproductor no cambia de archivo", () => {
  // El enlace cambia solo cuando el ERP copia el audio a su almacenamiento.
  // Cambiar el `src` en medio lo recarga desde cero.
  const nota = CHAT.slice(CHAT.indexOf("function NotaDeVoz"), CHAT.indexOf("const ICONO_ADJUNTO"));
  assert.match(nota, /src=\{src\}/, "el <audio> tiene que usar el archivo que ya tiene");
  assert.doesNotMatch(nota, /src=\{url\}/, "volvió a seguir el último enlace aunque esté sonando");
  assert.match(nota, /a\.paused\) setSrc\(url\)/, "el cambio tiene que esperar a que no esté sonando");
});

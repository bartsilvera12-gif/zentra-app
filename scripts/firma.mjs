/**
 * Enchufar la llave de firma al `build.gradle` que genera Capacitor.
 *
 * Vive aparte de `android-init.mjs` para poder probarlo: el archivo se genera
 * en la máquina que compila, así que el único momento en que se puede mirar el
 * resultado es en una prueba.
 */

/** El bloque que Android Gradle usa para el build de depuración. */
export function bloqueDeFirma(ruta = "../../firma/debug.keystore") {
  return [
    "    signingConfigs {",
    "        debug {",
    `            storeFile file('${ruta}')`,
    "            storePassword 'android'",
    "            keyAlias 'androiddebugkey'",
    "            keyPassword 'android'",
    "        }",
    "    }",
    "",
  ].join("\n");
}

/**
 * Devuelve el `build.gradle` con la firma puesta.
 *
 * Si ya tiene un `signingConfigs` se devuelve igual: puede ser el de release de
 * una configuración de verdad, y pisarlo sería firmar la app de la tienda con
 * una llave de pruebas.
 */
export function conFirma(gradle, ruta) {
  if (/^\s*signingConfigs\s*\{/m.test(gradle)) return gradle;
  const i = gradle.indexOf("android {");
  if (i < 0) return gradle;
  const corte = gradle.indexOf("\n", i) + 1;
  if (corte <= 0) return gradle;
  return gradle.slice(0, corte) + bloqueDeFirma(ruta) + gradle.slice(corte);
}

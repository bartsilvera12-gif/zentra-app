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

/**
 * La llave con la que se firma lo que va a Google Play.
 *
 * No está en el repositorio y no puede estarlo: quien la tenga puede publicar
 * una actualización de la app a nombre nuestro. Se pasa por el entorno, que es
 * lo que entienden igual una máquina local y un servidor de compilación.
 *
 *   ZENTRA_LLAVE        ruta al .jks
 *   ZENTRA_LLAVE_CLAVE  la contraseña (del almacén y de la clave)
 *   ZENTRA_LLAVE_ALIAS  el alias, por defecto "zentra"
 *
 * Sin esas variables no se agrega nada y `bundleRelease` sale sin firmar, que
 * es lo correcto: mejor un archivo que la tienda rechaza que uno firmado con
 * la llave de pruebas, que la tienda acepta una vez y después deja la app
 * atada a una contraseña pública que está escrita en este repositorio.
 */
export function bloqueDeRelease(env = process.env) {
  const ruta = String(env.ZENTRA_LLAVE || "").trim();
  const clave = String(env.ZENTRA_LLAVE_CLAVE || "").trim();
  if (!ruta || !clave) return "";
  const alias = String(env.ZENTRA_LLAVE_ALIAS || "zentra").trim();
  return [
    "        release {",
    `            storeFile file('${ruta}')`,
    `            storePassword '${clave}'`,
    `            keyAlias '${alias}'`,
    `            keyPassword '${clave}'`,
    "        }",
  ].join("\n");
}

/**
 * Engancha la firma de release al `buildTypes { release { … } }`.
 *
 * Se hace en dos pasos —el `signingConfigs` y el `buildTypes`— porque declarar
 * la llave no alcanza: Gradle compila igual, sin firmar, y el error recién
 * aparece al subir el archivo a la tienda.
 */
export function conRelease(gradle, env = process.env) {
  const bloque = bloqueDeRelease(env);
  if (!bloque) return gradle;
  if (gradle.includes("signingConfig signingConfigs.release")) return gradle;

  let salida = gradle;
  if (/signingConfigs\s*\{/.test(salida)) {
    salida = salida.replace(/(signingConfigs\s*\{\n)/, `$1${bloque}\n`);
  } else {
    const i = salida.indexOf("android {");
    if (i < 0) return gradle;
    const corte = salida.indexOf("\n", i) + 1;
    salida =
      salida.slice(0, corte) +
      "    signingConfigs {\n" +
      bloque +
      "\n    }\n\n" +
      salida.slice(corte);
  }

  return salida.replace(
    /(buildTypes\s*\{\s*\n\s*release\s*\{\n)/,
    "$1            signingConfig signingConfigs.release\n",
  );
}

/**
 * La versión que ve Google Play.
 *
 * `versionName` es lo que lee una persona y sale de `src/lib/config.ts`, para
 * que la pantalla de Configuración y la ficha de la tienda no digan cosas
 * distintas. `versionCode` es un entero que Play usa para saber qué build es
 * más nuevo: tiene que subir en cada subida, y dos subidas con el mismo número
 * se rechazan.
 */
export function conVersion(gradle, { versionCode, versionName }) {
  let salida = gradle;
  if (Number.isInteger(versionCode) && versionCode > 0) {
    salida = salida.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  }
  if (versionName) {
    salida = salida.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
  }
  return salida;
}

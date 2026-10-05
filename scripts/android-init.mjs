/**
 * Prepara el proyecto Android nativo.
 *
 *   npm run android:init
 *
 * `android/` no se versiona —la genera Capacitor— salvo un archivo:
 * `android/app/google-services.json`, la configuración de Firebase, que no se
 * regenera sino que se baja de la consola. Por eso `npx cap add android` a secas
 * falla: se encuentra la carpeta ya creada.
 *
 * Esto lo resuelve: guarda ese archivo, genera el proyecto y lo devuelve a su
 * lugar.
 */
import { existsSync, mkdirSync, copyFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const GS = "android/app/google-services.json";
// La copia va a un archivo, no a una variable en memoria: si esto se corta a la
// mitad —un Ctrl+C, una terminal que se cierra— la configuración de Firebase
// tiene que sobrevivir. Ya pasó una vez.
const COPIA = ".google-services.json.bak";

function correr(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

if (existsSync(GS)) {
  copyFileSync(GS, COPIA);
  console.log(`Configuración de Firebase guardada en ${COPIA}`);
} else if (existsSync(COPIA)) {
  console.log(`Usando la copia de ${COPIA} de una corrida anterior.`);
} else {
  console.log(`Aviso: no está ${GS}.`);
  console.log("El APK va a andar igual, pero sin notificaciones.");
  console.log("Si debería estar, recuperalo con:  git checkout " + GS);
}

if (existsSync("android")) {
  console.log("Borrando android/ para regenerarla…");
  rmSync("android", { recursive: true, force: true });
}

// El proyecto nativo copia lo que haya en `out`, así que primero hay que compilar.
correr("npm run build");
correr("npx cap add android");

// Los íconos del lanzador NO salen del manifiesto web: viven en android/res, que
// `cap add` acaba de rellenar con el logo genérico de Capacitor. Se regeneran
// desde assets/ en cada corrida, porque cada `cap add` los pisa de nuevo.
correr(
  "npx @capacitor/assets generate --android" +
    " --iconBackgroundColor '#1c8c84' --iconBackgroundColorDark '#1c8c84'" +
    " --splashBackgroundColor '#1c8c84' --splashBackgroundColorDark '#023047'",
);

/**
 * Gradle necesita saber dónde está el SDK de Android, y lo lee de
 * `android/local.properties`. Ese archivo lo escribe Android Studio la primera
 * vez — pero acá se borra `android/` en cada corrida, así que vuelve a faltar
 * siempre y el build muere con "SDK location not found".
 *
 * No se versiona a propósito: la ruta es distinta en cada máquina.
 */
function escribirLocalProperties() {
  if (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT) {
    console.log("\nSDK tomado de ANDROID_HOME; no hace falta local.properties.");
    return;
  }

  const casa = homedir();
  const candidatos =
    platform() === "win32"
      ? [join(casa, "AppData", "Local", "Android", "Sdk")]
      : platform() === "darwin"
        ? [join(casa, "Library", "Android", "sdk")]
        : [join(casa, "Android", "Sdk"), "/usr/lib/android-sdk", "/opt/android-sdk"];

  const sdk = candidatos.find((d) => existsSync(d));
  if (!sdk) {
    console.log("\nAviso: no encontré el SDK de Android en los lugares de siempre.");
    console.log("Si el build falla con 'SDK location not found', creá android/local.properties con:");
    console.log("  sdk.dir=<la ruta de tu SDK>   (en Windows, con barras dobles)");
    return;
  }

  // En Windows las barras simples son escapes dentro de un .properties: la
  // ruta queda partida y el error no menciona las barras por ningún lado.
  const ruta = sdk.replace(/\\/g, "\\\\");
  writeFileSync("android/local.properties", `sdk.dir=${ruta}\n`);
  console.log(`\nandroid/local.properties escrito con sdk.dir=${sdk}`);
}

escribirLocalProperties();

if (existsSync(COPIA)) {
  mkdirSync("android/app", { recursive: true });
  copyFileSync(COPIA, GS);
  unlinkSync(COPIA);
  console.log(`\nConfiguración de Firebase devuelta a ${GS}`);
}

console.log(`
Listo. Ahora:

  npm run android        compila y abre Android Studio
                         (Build → Build Bundle(s)/APK(s) → Build APK(s))

El APK sale en android/app/build/outputs/apk/debug/app-debug.apk
`);

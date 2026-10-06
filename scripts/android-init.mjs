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
import { existsSync, mkdirSync, copyFileSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
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

/**
 * De qué commit sale este APK.
 *
 * En CI la pone el workflow. Compilando a mano no la pone nadie, y entonces la
 * pantalla de Configuración no muestra ningún build: dos APK distintos se ven
 * iguales y no hay forma de saber cuál está instalado. Perdimos media hora así,
 * discutiendo si un arreglo del ERP estaba activo cuando el problema era que el
 * APK del celular era anterior al cambio de la app.
 *
 * Con el árbol sucio se agrega `+`: lo compilado no es ese commit, y decir que
 * sí es peor que no decir nada.
 */
function shaDelBuild() {
  const yaViene = process.env.NEXT_PUBLIC_BUILD_SHA?.trim();
  if (yaViene) return yaViene;
  try {
    const sha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    const sucio = execSync("git status --porcelain", { encoding: "utf8" }).trim() !== "";
    // 6 + `+` y no 7 + `+`: la pantalla corta a 7 caracteres, y un octavo se
    // perdería justo la marca que importa.
    return sucio ? `${sha.slice(0, 6)}+` : sha;
  } catch {
    // Sin git —un zip descargado, por ejemplo— se sigue igual: esto identifica
    // el build, no es un requisito para compilarlo.
    return "";
  }
}

/**
 * Que estén instaladas las dependencias que el código pide.
 *
 * `git pull` trae código nuevo pero no instala nada. Si alguien agregó un
 * paquete, el build muere con "module not found" y un rastro de webpack que no
 * menciona npm por ningún lado: se busca el problema en el import, que está
 * bien.
 */
function verificarDependencias() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const pedidas = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const faltan = pedidas.filter((d) => !existsSync(join("node_modules", d)));
  if (!faltan.length) return;

  console.log("\nFaltan dependencias instaladas:");
  for (const d of faltan) console.log(`  - ${d}`);
  console.log("\nCorré esto y volvé a intentar:\n\n  npm install\n");
  process.exit(1);
}

verificarDependencias();

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
// La variable se setea en el proceso, no en la línea de comandos: `VAR=x cmd` no
// existe en el `cmd` de Windows, y `execSync` hereda este entorno igual en los dos.
const sha = shaDelBuild();
if (sha) {
  process.env.NEXT_PUBLIC_BUILD_SHA = sha;
  console.log(
    `\nBuild: ${sha.slice(0, 7)}${sha.endsWith("+") ? " — con cambios sin commitear" : ""}`
  );
}
correr("npm run build");
correr("npx cap add android");

// Los íconos del lanzador NO salen del manifiesto web: viven en android/res, que
// `cap add` acaba de rellenar con el logo genérico de Capacitor. Se regeneran
// desde assets/ en cada corrida, porque cada `cap add` los pisa de nuevo.
correr(
  // Comillas DOBLES, no simples.
  //
  // El `cmd` de Windows no saca las comillas simples: el color le llega al
  // generador como `'#1c8c84'`, con las comillas adentro, y corta con
  // "Unable to parse color from string". Entonces no genera ningún ícono y el
  // APK sale con el genérico de Capacitor.
  //
  // En Linux y Mac andaba, porque ahí el shell sí las saca. Por eso el error
  // sólo aparecía en una de las dos máquinas, que es lo peor que puede pasar:
  // el que compila ve el ícono mal y el que revisa el código lo ve bien.
  //
  // Sin comillas tampoco sirve: en bash, un `#` después de un espacio arranca
  // un comentario y se come el resto de la línea. Las dobles funcionan en los
  // dos.
  'npx @capacitor/assets generate --android' +
    ' --iconBackgroundColor "#1c8c84" --iconBackgroundColorDark "#1c8c84"' +
    ' --splashBackgroundColor "#1c8c84" --splashBackgroundColorDark "#023047"',
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

/**
 * Permisos que el proyecto generado no trae.
 *
 * `cap add android` escribe un manifiesto mínimo, así que esto se vuelve a
 * perder en cada corrida. Sin `RECORD_AUDIO` el micrófono falla **sólo en el
 * APK**: en el navegador anda, porque ahí el permiso lo da el navegador. Es la
 * clase de cosa que se descubre con la app ya instalada.
 *
 * `CAMERA` NO se agrega a propósito: sacar una foto con `<input capture>` abre
 * la app de cámara del sistema, que tiene su propio permiso. Declararlo acá
 * haría que Android se lo pida a nuestra app sin necesidad, y un permiso de
 * cámara que no se usa es una pregunta de más en la tienda.
 */
/**
 * Borra los íconos que trae la plantilla de Capacitor.
 *
 * `cap add android` deja un `drawable/ic_launcher_background.xml` y un
 * `drawable-v24/ic_launcher_foreground.xml` —el ícono genérico— que quedan
 * dentro del APK aunque nadie los use, porque el ícono adaptativo apunta a
 * `@mipmap/*`, que es lo que generamos nosotros.
 *
 * No rompen nada, pero son la primera sospecha cuando el ícono no cambia y
 * hacen perder tiempo. Si algo los necesitara, el build falla y nos enteramos.
 */
function borrarIconosDePlantilla() {
  const restos = [
    "android/app/src/main/res/drawable/ic_launcher_background.xml",
    "android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml",
  ];
  for (const r of restos) {
    if (existsSync(r)) {
      rmSync(r);
      console.log(`Icono de la plantilla borrado: ${r.split("/res/")[1]}`);
    }
  }
}

borrarIconosDePlantilla();

function agregarPermisos() {
  const RUTA = "android/app/src/main/AndroidManifest.xml";
  if (!existsSync(RUTA)) return;
  const permisos = [
    "android.permission.RECORD_AUDIO",
    "android.permission.MODIFY_AUDIO_SETTINGS",
  ];
  let xml = readFileSync(RUTA, "utf8");
  const faltan = permisos.filter((p) => !xml.includes(p));
  if (!faltan.length) return;

  const lineas = faltan.map((p) => `    <uses-permission android:name="${p}" />`).join("\n");
  xml = xml.replace("</manifest>", `${lineas}\n</manifest>`);
  writeFileSync(RUTA, xml);
  console.log(`\nPermisos agregados al manifiesto: ${faltan.join(", ")}`);
}

agregarPermisos();

/**
 * Que los íconos generados sean los nuestros y no los de la plantilla.
 *
 * `@capacitor/assets` puede terminar sin error y haber escrito poco: si falta
 * un archivo en `assets/`, o la versión no entiende un parámetro, el proyecto
 * queda con el ícono genérico de Capacitor. Eso no se nota hasta que la app
 * está instalada en un teléfono, y para entonces ya nadie se acuerda de este
 * paso.
 */
async function verificarIcono() {
  const RUTA = "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_background.png";
  if (!existsSync(RUTA)) {
    console.log("\nERROR: no se generaron los íconos. El APK saldría con el de Capacitor.");
    process.exit(1);
  }
  const { default: sharp } = await import("sharp");
  const { data } = await sharp(RUTA).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0, r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 10) { n++; r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  }
  const medio = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  const MARCA = [28, 140, 132]; // #1C8C84
  if (medio.some((c, i) => Math.abs(c - MARCA[i]) > 12)) {
    console.log(`\nERROR: el ícono generado es ${medio}, se esperaba ${MARCA}.`);
    console.log("Probablemente quedó el genérico de Capacitor. Revisá assets/.");
    process.exit(1);
  }
  console.log(`\nOK: el ícono es el de la marca (${medio}).`);
}

await verificarIcono();

if (existsSync(COPIA)) {
  mkdirSync("android/app", { recursive: true });
  copyFileSync(COPIA, GS);
  unlinkSync(COPIA);
  console.log(`\nConfiguración de Firebase devuelta a ${GS}`);
}

console.log(`
Listo. Ahora:

  npm run apk            arma el APK de una, sin abrir nada

El APK sale en android/app/build/outputs/apk/debug/app-debug.apk
`);

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
import { join, resolve, sep } from "node:path";

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

/**
 * Borra `android/`, con los dos motivos por los que en Windows no se puede.
 *
 * Node tira `EPERM` a secas, que no dice nada útil. Las causas reales son dos y
 * las dos tienen arreglo en diez segundos; sin esto uno se queda mirando un
 * stack de `node:fs` buscando un problema de permisos que no existe.
 */
function borrarAndroid() {
  if (!existsSync("android")) return;

  // Windows no deja borrar la carpeta donde está parada una consola. `INIT_CWD`
  // es desde dónde se corrió `npm run`, que puede no ser la raíz del proyecto.
  // Se compara con el separador al final: si no, una carpeta hermana llamada
  // `android-viejo` contaría como "adentro de android".
  const dir = resolve("android");
  const desde = process.env.INIT_CWD ? resolve(process.env.INIT_CWD) : "";
  if (desde === dir || (desde && desde.startsWith(dir + sep))) {
    console.error("\nEstás parado adentro de android/, y esa carpeta se borra para regenerarla.");
    console.error("Windows no deja borrar el directorio donde está una consola.");
    console.error("Salí de ahí y volvé a correrlo:\n");
    console.error("  cd ..");
    console.error("  npm run android:init\n");
    process.exit(1);
  }

  console.log("Borrando android/ para regenerarla…");
  try {
    rmSync("android", { recursive: true, force: true });
  } catch (e) {
    if (e?.code !== "EPERM" && e?.code !== "EBUSY") throw e;
    console.error("\nNo se pudo borrar android/: hay algo que la tiene abierta.");
    console.error("Casi siempre es una de estas:\n");
    console.error("  - Android Studio abierto con el proyecto → cerralo.");
    console.error("  - El demonio de Gradle sigue vivo → cd android && gradlew.bat --stop && cd ..");
    console.error("  - Una consola parada adentro de android/ → salí con cd ..\n");
    console.error(`Detalle: ${e.message}`);
    process.exit(1);
  }
}

borrarAndroid();

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
 * Qué versión de Java hay en una carpeta, leyendo su archivo `release`.
 *
 * Se lee el archivo en vez de ejecutar `java -version` porque el que está en el
 * PATH puede no ser el de esta carpeta, que es justo el problema que esto
 * resuelve. `1.8.0_292` es Java 8: el esquema viejo ponía un `1.` adelante.
 */
function versionDeJava(dir) {
  try {
    const txt = readFileSync(join(dir, "release"), "utf8");
    const m = /^JAVA_VERSION="?([0-9._]+)/m.exec(txt);
    if (!m) return 0;
    const partes = m[1].split(".");
    const mayor = Number(partes[0]);
    return mayor === 1 ? Number(partes[1] || 0) : mayor;
  } catch {
    return 0;
  }
}

/**
 * Gradle corre con el Java que encuentra, y si ese es un Java 8 el build muere
 * con "Dependency requires at least JVM runtime version 11" sin decir dónde
 * cambiarlo. Pasa seguido en Windows, donde suele quedar un Java 8 viejo en el
 * PATH de hace años.
 *
 * Android Studio trae su propio JDK (el `jbr`) justamente para no depender de
 * eso. Acá se busca y se deja anotado en `android/gradle.properties`, que es de
 * dónde Gradle lo lee. Como `android/` se regenera en cada corrida, esto se
 * vuelve a escribir solo; a mano habría que acordarse siempre.
 */
function escribirJdk() {
  const casa = homedir();
  const candidatos =
    platform() === "win32"
      ? [
          "C:\\Program Files\\Android\\Android Studio\\jbr",
          join(casa, "AppData", "Local", "Programs", "Android Studio", "jbr"),
          "C:\\Program Files\\Android\\Android Studio\\jre",
        ]
      : platform() === "darwin"
        ? [
            "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
            "/Applications/Android Studio.app/Contents/jre/Contents/Home",
          ]
        : [
            "/opt/android-studio/jbr",
            join(casa, "android-studio", "jbr"),
          ];

  // El JAVA_HOME de la máquina va último: si sirve, se usa; si es el Java 8
  // viejo, gana el de Android Studio, que es lo que queremos.
  const deLaMaquina = process.env.JAVA_HOME?.trim();
  const lista = deLaMaquina ? [...candidatos, deLaMaquina] : candidatos;

  const jdk = lista.find((d) => existsSync(d) && versionDeJava(d) >= 11);
  if (!jdk) {
    if (deLaMaquina && versionDeJava(deLaMaquina) > 0) {
      console.log(`\nAviso: tu JAVA_HOME es Java ${versionDeJava(deLaMaquina)}, y Gradle necesita 11 o más.`);
    } else {
      console.log("\nAviso: no encontré un JDK 11 o superior.");
    }
    console.log("Instalá Android Studio (trae el suyo) o apuntá JAVA_HOME a un JDK 17.");
    return;
  }

  const ruta = jdk.replace(/\\/g, "\\\\");
  const archivo = "android/gradle.properties";
  const previo = existsSync(archivo) ? readFileSync(archivo, "utf8") : "";
  // Si `cap add` ya dejó la línea, se reemplaza en vez de agregar otra: Gradle
  // toma la última, pero dos líneas iguales con rutas distintas es una trampa.
  const limpio = previo.replace(/^org\.gradle\.java\.home=.*$\n?/gm, "");
  writeFileSync(
    archivo,
    `${limpio}${limpio.endsWith("\n") || limpio === "" ? "" : "\n"}org.gradle.java.home=${ruta}\n`,
  );
  console.log(`\nJDK para Gradle: ${jdk} (Java ${versionDeJava(jdk)})`);
}

escribirJdk();

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
 *
 * `POST_NOTIFICATIONS` tampoco está acá, y sí hace falta en Android 13+: lo
 * declara el propio `@capacitor/local-notifications` en su manifiesto y el
 * merge de Gradle lo trae al de la app. Repetirlo sería ruido. Si algún día se
 * saca ese plugin, hay que agregarlo a mano o los avisos dejan de salir sin
 * ningún error visible.
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

/**
 * Que lo que va a entrar al APK sea lo que se acaba de compilar.
 *
 * Capacitor copia `out/` a los assets del proyecto nativo. Si esa copia no pasó
 * —porque `cap add` fallo, o porque alguien corrió Gradle sobre una carpeta
 * `android/` vieja sin pasar por acá— el APK compila igual, sin un solo error,
 * con el código de la vez anterior. Es la falla mas cara de todas: todo
 * "funciona" y uno busca el problema en el lugar equivocado.
 *
 * El sha del build es la prueba: tiene que estar adentro de los assets.
 */
function verificarAssets() {
  const dir = join("android", "app", "src", "main", "assets", "public");
  if (!existsSync(dir)) {
    console.log("\nERROR: Capacitor no dejó los assets web en el proyecto nativo.");
    console.log(`Falta ${dir}. El APK saldría vacío o con lo de la corrida anterior.`);
    process.exit(1);
  }
  if (!sha) return; // sin git no hay con qué comparar; el resto ya se verificó

  const corto = sha.slice(0, 7);
  const salida = execSync(
    platform() === "win32"
      ? `findstr /s /m /c:"${corto}" "${dir}\\*.js"`
      : `grep -rl "${corto}" "${dir}" || true`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();

  if (!salida) {
    console.log(`\nERROR: los assets del proyecto nativo no tienen el build ${corto}.`);
    console.log("Quedó una copia vieja: el APK tendría el código de antes.");
    console.log("Borrá android/ y volvé a correr este script.");
    process.exit(1);
  }
  console.log(`\nOK: los assets del APK son el build ${corto}.`);
}

verificarAssets();

console.log(`
Listo. Ahora:

  npm run apk            arma el APK de una, sin abrir nada

El APK sale en android/app/build/outputs/apk/debug/app-debug.apk
`);

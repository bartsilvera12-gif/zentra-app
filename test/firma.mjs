/**
 * Que el APK se firme siempre con la misma llave.
 *
 *   npm run test:firma
 *
 * Esto existe porque el síntoma no se ve compilando: se ve en el teléfono, al
 * intentar instalar la actualización y que Android conteste "conflicto con un
 * paquete existente". Y el archivo que hay que tocar lo genera Capacitor en la
 * máquina que compila, así que acá es el único lugar donde se puede mirar el
 * resultado.
 */
import { conFirma, conRelease, conVersion } from "../scripts/firma.mjs";

const casos = [];
const t = (n, f) => casos.push([n, f]);

// Como lo genera Capacitor, recortado.
const GRADLE = `apply plugin: 'com.android.application'

android {
    namespace "py.com.zentra.movil"
    compileSdk rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "py.com.zentra.movil"
        minSdkVersion rootProject.ext.minSdkVersion
    }
    buildTypes {
        release {
            minifyEnabled false
        }
    }
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
}
`;

t("mete la firma adentro del bloque android, no antes", () => {
  const r = conFirma(GRADLE);
  const iAndroid = r.indexOf("android {");
  const iFirma = r.indexOf("signingConfigs");
  const iCierre = r.indexOf("dependencies {");
  if (iFirma < iAndroid) throw new Error("quedó afuera, antes del bloque");
  if (iFirma > iCierre) throw new Error("quedó después de android {}");
});

t("la ruta de la llave es relativa a android/app", () => {
  const r = conFirma(GRADLE);
  // build.gradle vive en android/app, así que dos niveles arriba es la raíz.
  if (!r.includes("file('../../firma/debug.keystore')")) {
    throw new Error("ruta mal: " + (/storeFile[^\n]*/.exec(r)?.[0] ?? "no está"));
  }
});

t("el bloque se llama debug, que es el nombre que Gradle busca solo", () => {
  const r = conFirma(GRADLE);
  if (!/signingConfigs\s*\{\s*debug\s*\{/.test(r)) throw new Error("no es el config 'debug'");
});

t("no se aplica dos veces", () => {
  const una = conFirma(GRADLE);
  const dos = conFirma(una);
  if (una !== dos) throw new Error("volvió a meter el bloque");
});

t("si ya hay una firma de verdad, no se toca", () => {
  // Pisar un signingConfigs existente sería firmar la app de la tienda con una
  // llave de pruebas, y eso no se puede deshacer una vez publicado.
  const propio = GRADLE.replace("android {", "android {\n    signingConfigs {\n        release { storeFile file('real.jks') }\n    }");
  if (conFirma(propio) !== propio) throw new Error("pisó la firma de release");
});

t("un build.gradle sin bloque android se devuelve igual", () => {
  const otro = "apply plugin: 'com.android.library'\n";
  if (conFirma(otro) !== otro) throw new Error("tocó algo que no debía");
});


t("sin llave de release no se firma nada", () => {
  // Preferimos un archivo que la tienda rechaza a uno firmado con la llave de
  // pruebas: esa contraseña está escrita en el repositorio, y la app quedaría
  // atada a ella para siempre.
  const r = conRelease(GRADLE, {});
  if (r !== GRADLE) throw new Error("agregó una firma de release sin llave");
  if (r.includes("signingConfigs.release")) throw new Error("engancho una firma que no existe");
});

t("con llave, se declara Y se engancha al buildType", () => {
  const r = conRelease(GRADLE, {
    ZENTRA_LLAVE: "/ruta/zentra.jks",
    ZENTRA_LLAVE_CLAVE: "secreta",
  });
  if (!r.includes("storeFile file('/ruta/zentra.jks')")) throw new Error("no declaró la llave");
  if (!r.includes("keyAlias 'zentra'")) throw new Error("no usó el alias por defecto");
  // Declararla y no engancharla es el error silencioso: compila igual, sin
  // firmar, y recién se ve al subir el archivo a la tienda.
  if (!r.includes("signingConfig signingConfigs.release")) throw new Error("no la enganchó al release");
});

t("correrlo dos veces no duplica la firma", () => {
  const env = { ZENTRA_LLAVE: "/ruta/zentra.jks", ZENTRA_LLAVE_CLAVE: "secreta" };
  const una = conRelease(GRADLE, env);
  const dos = conRelease(una, env);
  if (una !== dos) throw new Error("la segunda corrida cambió el archivo");
});

// El GRADLE de arriba está recortado y no trae las líneas de versión; éstas
// son las que escribe Capacitor, tal cual.
const CON_VERSION = GRADLE.replace(
  'applicationId "py.com.zentra.movil"',
  'applicationId "py.com.zentra.movil"\n        versionCode 1\n        versionName "1.0"',
);

t("la version se reemplaza, no se agrega al lado", () => {
  const r = conVersion(CON_VERSION, { versionCode: 7, versionName: "2.4.1" });
  if (!r.includes("versionCode 7")) throw new Error("no cambió el código");
  if (!r.includes('versionName "2.4.1"')) throw new Error("no cambió el nombre");
  if (r.includes("versionCode 1\n")) throw new Error("quedó el viejo");
  if (r.includes('versionName "1.0"')) throw new Error("quedó el nombre viejo");
});

t("sin datos de version se deja lo que habia", () => {
  // Un build sin ZENTRA_VERSION_CODE no tiene por qué romper nada.
  const r = conVersion(CON_VERSION, { versionCode: undefined, versionName: "" });
  if (r !== CON_VERSION) throw new Error("tocó el archivo sin que le dieran versión");
});

let fallas = 0;
for (const [nombre, f] of casos) {
  try { f(); console.log("  ok   " + nombre); }
  catch (e) { fallas++; console.log("  FALLA " + nombre + "\n         " + e.message); }
}
console.log(`\n${casos.length - fallas}/${casos.length} casos`);
process.exit(fallas ? 1 : 0);

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
import { conFirma } from "../scripts/firma.mjs";

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

let fallas = 0;
for (const [nombre, f] of casos) {
  try { f(); console.log("  ok   " + nombre); }
  catch (e) { fallas++; console.log("  FALLA " + nombre + "\n         " + e.message); }
}
console.log(`\n${casos.length - fallas}/${casos.length} casos`);
process.exit(fallas ? 1 : 0);

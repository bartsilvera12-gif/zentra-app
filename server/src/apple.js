/**
 * Plomería de la facturación de la App Store.
 *
 * Es el hermano de `play.js`: en iOS la suscripción se compra adentro de la
 * app, con la caja de Apple, y lo único que la app recibe es un comprobante.
 * Acá se revisa si ese comprobante es una compra de verdad.
 *
 * La regla es la misma que con PagoPar y con Play, y está escrita en
 * `08_precios.sql`: al cliente no se le cree nada. Un comprobante que manda
 * el teléfono es exactamente igual de falsificable que un monto que manda el
 * navegador, así que no vale por sí mismo: vale lo que se puede comprobar de
 * él.
 *
 * Y acá está la única diferencia grande con Google. Google devuelve un
 * `purchaseToken` opaco, un número de guardarropa: no dice nada, hay que ir a
 * preguntarle a Google qué guardó —y para preguntar hace falta una cuenta de
 * servicio, su clave privada y dos viajes de red—. Apple, con StoreKit 2,
 * entrega la transacción ya firmada por Apple: un JWS que trae adentro la
 * cadena de certificados con la que se firmó. Comprobarlo es verificar esa
 * firma contra el certificado raíz de Apple, que es público y está al lado de
 * este archivo. No hay red, no hay clave privada nuestra, no hay un secreto
 * más que rotar. Falsificar un comprobante es falsificar una firma de Apple.
 *
 * No tiene nada de Zentra más allá del mapa de productos: es la App Store y
 * nada más. Quién es la empresa, cuánto cuesta el plan y qué se activa lo
 * decide `index.js` con la base, igual que en los otros dos circuitos.
 */
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * De qué plan es cada producto de la App Store.
 *
 * Los identificadores son los mismos que en Play por decisión, no porque
 * tengan que serlo: son dos catálogos separados y Apple no sabe nada de los
 * de Google. Que coincidan es para que una sola línea de un registro alcance
 * para saber qué se compró, sin tener dos mapas en la cabeza.
 *
 * El mapa es explícito a propósito: un producto que no esté acá se rechaza.
 * Caer a un plan por defecto sería activar Max porque alguien escribió mal un
 * identificador en App Store Connect.
 */
export const PLANES_POR_PRODUCTO = Object.freeze({
  zentra_emprendedor_mensual: "emprendedor",
  zentra_max_mensual: "max",
});

/** El plan de un producto de Apple, o `null` si no lo conocemos. */
export function planDeProducto(productId) {
  const id = String(productId || "").trim();
  if (!id) return null;
  // `Object.freeze` no alcanza: `hasOwn` es lo que impide que un productId
  // llamado "constructor" entre como si fuera un plan.
  return Object.hasOwn(PLANES_POR_PRODUCTO, id) ? PLANES_POR_PRODUCTO[id] : null;
}

/**
 * El bundle de la app iOS. Una compra de otra app no es nuestra.
 *
 * No es el mismo que el paquete de Android: la nativa de iOS es
 * `py.com.zentra.movil.nativo` —la `.movil` sin sufijo es la otra app, la del
 * WebView—, y confundirlos hace que todas las compras se rechacen con "esa
 * compra no es de esta app" sin ninguna otra pista.
 */
export const BUNDLE = (process.env.APPLE_BUNDLE_ID || "py.com.zentra.movil.nativo").trim();

/* ─────────────────────── el certificado raíz de Apple ─────────────────────── */

/**
 * El ancla de toda la verificación.
 *
 * Va en el repositorio y no en el entorno porque no es un secreto —es el
 * certificado público de Apple, el mismo que viene en cualquier sistema
 * operativo— y porque es lo único que no puede faltar: sin raíz no se puede
 * comprobar nada, y una variable de entorno que alguien se olvide de poner
 * apagaría los cobros de iOS en un despliegue cualquiera.
 *
 * Se descarga de https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
 * y vence en 2039. Si alguna vez hay que cambiarlo, es ese archivo.
 */
const RUTA_RAIZ = fileURLToPath(new URL("./apple-root-ca-g3.pem", import.meta.url));

/**
 * La raíz se puede cambiar por entorno, y es sólo para poder probar.
 *
 * Armar un comprobante que termine en la raíz de verdad es justamente lo que
 * no se puede hacer, así que sin esto el camino bueno —el que mueve la
 * plata— no se podría probar sin pagar una suscripción real. Queda a la vista
 * en `/apple/health` y grita en el registro al arrancar: una raíz cambiada en
 * producción significa que los comprobantes se comprueban contra una firma
 * que no es de Apple, y eso tiene que ser imposible de no notar.
 */
const RAIZ_PUESTA = (process.env.APPLE_ROOT_CA_PEM || "").trim();

let raizGuardada = null;
let avisada = false;

/** El certificado raíz, leído una vez. */
export function raizDeApple() {
  if (!raizGuardada) {
    if (RAIZ_PUESTA) {
      if (!avisada) {
        avisada = true;
        console.warn(
          "[apple] OJO: APPLE_ROOT_CA_PEM está puesta. Los comprobantes NO se " +
            "comprueban contra la raíz de Apple. Esto es para pruebas.",
        );
      }
      raizGuardada = new crypto.X509Certificate(RAIZ_PUESTA);
    } else {
      raizGuardada = new crypto.X509Certificate(readFileSync(RUTA_RAIZ));
    }
  }
  return raizGuardada;
}

/**
 * Qué falta para poder verificar una compra.
 *
 * Devuelve el motivo o `null`. Es el `faltaConfigPlay()` de Apple, y es una
 * lista mucho más corta justamente porque no hay credenciales: alcanza con
 * saber de qué app son las compras y poder leer la raíz.
 */
export function faltaConfigApple() {
  if (!BUNDLE) return "falta APPLE_BUNDLE_ID";
  try {
    raizDeApple();
  } catch (e) {
    return `no se pudo leer apple-root-ca-g3.pem (${e?.message || e})`;
  }
  return null;
}

/** Para el health: ver qué está puesto. Acá no hay nada que ocultar. */
export function configAppleALaVista() {
  let raiz = "(no se pudo leer)";
  try {
    const c = raizDeApple();
    raiz = `${c.subject.replace(/\n/g, " · ")} · vence ${c.validTo}`;
  } catch {
    /* el motivo lo da `faltaConfigApple()` */
  }
  return {
    bundle: BUNDLE || "(vacío)",
    raiz,
    ...(RAIZ_PUESTA ? { ojo: "APPLE_ROOT_CA_PEM está puesta: la raíz NO es la de Apple" } : {}),
  };
}

/* ────────────────────────── comprobar la firma ────────────────────────── */

const deBase64Url = (s) => Buffer.from(String(s), "base64url");

/**
 * Las tres partes de un JWS, o un error que se entiende.
 *
 * Un comprobante cortado o de otro formato tiene que morir acá y no cinco
 * líneas más abajo con un "undefined no es un objeto".
 */
function partesDelJws(jws) {
  const partes = String(jws || "").split(".");
  if (partes.length !== 3 || partes.some((p) => !p)) {
    throw new Error("[apple] el comprobante no tiene la forma de un JWS");
  }
  return partes;
}

/**
 * La cadena de certificados que viene en la cabecera del JWS.
 *
 * Apple manda tres: el que firmó, el intermedio y la raíz. Se verifica de
 * abajo hacia arriba, y la de arriba tiene que ser byte por byte la raíz que
 * tenemos nosotros.
 *
 * Eso último es todo el punto. Sin comparar contra nuestra raíz, cualquiera
 * se genera una cadena propia de tres certificados, firma con ella un
 * comprobante que diga "Max, vence en 2040", y la verificación daría bien:
 * estaríamos comprobando que el comprobante está firmado por quien lo firmó.
 */
function cadenaDe(cabecera, raiz) {
  const x5c = Array.isArray(cabecera?.x5c) ? cabecera.x5c : [];
  if (x5c.length < 2) throw new Error("[apple] el comprobante no trae la cadena de certificados");

  // El `x5c` es base64 común —así lo define el RFC del JWS—, no base64url
  // como el resto del comprobante. Leerlo con el decodificador equivocado da
  // "no se pudo leer" en certificados perfectamente buenos.
  const certs = x5c.map((b64, i) => {
    try {
      return new crypto.X509Certificate(Buffer.from(String(b64), "base64"));
    } catch {
      throw new Error(`[apple] el certificado ${i} de la cadena no se pudo leer`);
    }
  });

  const ultimo = certs[certs.length - 1];
  if (!ultimo.raw.equals(raiz.raw)) {
    throw new Error("[apple] la cadena no termina en el certificado raíz de Apple");
  }

  const ahora = Date.now();
  for (const [i, c] of certs.entries()) {
    if (Date.parse(c.validFrom) > ahora || Date.parse(c.validTo) < ahora) {
      throw new Error(`[apple] el certificado ${i} de la cadena está fuera de fecha`);
    }
  }

  // Cada uno tiene que estar emitido y firmado por el siguiente. Las dos
  // cosas: `checkIssued` mira los nombres, `verify` mira la firma, y sin la
  // segunda un certificado que sólo *dice* venir de Apple pasaría.
  for (let i = 0; i < certs.length - 1; i++) {
    const hijo = certs[i];
    const padre = certs[i + 1];
    if (!hijo.checkIssued(padre) || !hijo.verify(padre.publicKey)) {
      throw new Error(`[apple] la cadena se corta entre el certificado ${i} y el ${i + 1}`);
    }
  }

  return certs[0];
}

/**
 * Lo que dice el comprobante, si de verdad lo firmó Apple.
 *
 * Tira error si la firma no cierra. No devuelve `null` ni un `{ ok: false }`
 * a propósito: una firma que no verifica no es "una compra que no sirve", es
 * alguien intentando algo, y tiene que cortar el camino en seco.
 *
 * `raiz` se puede cambiar, y es sólo para las pruebas: sin eso no hay forma de
 * probar el camino bueno, porque armar un comprobante que termine en la raíz
 * de verdad es justamente lo que no se puede hacer. Nadie se lo pasa en
 * producción —`index.js` llama con un argumento— y hay una prueba que
 * comprueba que, sin cambiarla, una cadena propia se rechaza.
 */
export function verificarJws(jws, { raiz = raizDeApple() } = {}) {
  const [cab, cuerpo, firma] = partesDelJws(jws);

  let cabecera;
  try {
    cabecera = JSON.parse(deBase64Url(cab).toString("utf8"));
  } catch {
    throw new Error("[apple] la cabecera del comprobante no es JSON");
  }
  // Apple firma con ES256 y nada más. Aceptar otro algoritmo es la puerta
  // vieja de los JWT: con `alg: "none"` la firma sobra, y con un simétrico la
  // clave para firmar sería la pública, que está adentro del mismo mensaje.
  if (String(cabecera?.alg) !== "ES256") {
    throw new Error(`[apple] el comprobante no está firmado con ES256 (${cabecera?.alg})`);
  }

  const firmante = cadenaDe(cabecera, raiz);

  // `ieee-p1363` no es un detalle: en un JWS la firma son los dos números
  // pegados y en crudo, mientras que `node:crypto` por defecto espera la
  // versión envuelta en DER. Sin esto, una firma buena da por falsa.
  const cierra = crypto.verify(
    "sha256",
    Buffer.from(`${cab}.${cuerpo}`),
    { key: firmante.publicKey, dsaEncoding: "ieee-p1363" },
    deBase64Url(firma),
  );
  if (!cierra) throw new Error("[apple] la firma del comprobante no cierra");

  let datos;
  try {
    datos = JSON.parse(deBase64Url(cuerpo).toString("utf8"));
  } catch {
    throw new Error("[apple] el cuerpo del comprobante no es JSON");
  }
  if (!datos || typeof datos !== "object") throw new Error("[apple] el comprobante viene vacío");
  return datos;
}

/* ──────────────────────────── las reglas ──────────────────────────── */

/**
 * Si lo que dice el comprobante habilita activar el plan.
 *
 * Es una función aparte y sin firma ni red adentro porque es la parte que
 * decide, y la parte que decide tiene que poder probarse armando un objeto a
 * mano. Devuelve `{ ok, motivo, vence, referencia, prueba }`; `motivo` es
 * para mostrar.
 *
 * Lo que NO se puede saber desde el comprobante: si una suscripción vencida
 * está en el período de gracia que Apple da cuando falla el cobro de la
 * renovación. Para eso hace falta la API de estado de suscripciones, que sí
 * pide una clave privada. Mientras no esté, una renovación que falla se
 * trata como vencida, que es lo estricto y no lo cómodo: el día que aparezca
 * alguien reclamando esos días, es acá donde se arregla.
 */
export function revisarTransaccion(tx, { productId, bundle = BUNDLE, ahora = Date.now() } = {}) {
  const no = (motivo) => ({ ok: false, motivo, vence: null, referencia: null, prueba: false });
  if (!tx || typeof tx !== "object") return no("No pudimos leer esa compra.");

  if (String(tx.bundleId || "") !== String(bundle)) return no("Esa compra no es de esta app.");

  // El producto que dice la app tiene que ser el que se compró. Sin esto, un
  // comprobante de Emprendedor pagado alcanza para pedir que se active Max.
  if (String(tx.productId || "") !== String(productId)) {
    return no("Esa compra no corresponde al plan pedido.");
  }

  // Un consumible o una compra única no renuevan nada, y no hay plan mensual
  // que empujar con ellos.
  const tipo = String(tx.type || "");
  if (tipo !== "Auto-Renewable Subscription") return no(`Esa compra no es una suscripción (${tipo || "sin tipo"}).`);

  // Devuelta, reembolsada o dada de baja por Apple. Que haya pagado alguna vez
  // no alcanza: esto es exactamente la plata que ya no está.
  if (tx.revocationDate) return no("Esa compra fue devuelta.");

  const vence = Number(tx.expiresDate || 0);
  if (!vence) return no("Esa compra no dice hasta cuándo vale.");
  if (vence <= ahora) return no("Esa suscripción ya venció.");

  // `transactionId` y no `originalTransactionId`: cada renovación trae uno
  // nuevo, y es justo lo que queremos como referencia. Con el original, la
  // segunda renovación choparía contra la clave única `(pasarela, referencia)`
  // de `zentra.pagos` y se trataría como repetida: el cliente pagaría el mes
  // y la fecha no se movería.
  const referencia = String(tx.transactionId || "").trim();
  if (!referencia) return no("Esa compra no trae número de transacción.");

  return {
    ok: true,
    motivo: null,
    vence: new Date(vence).toISOString(),
    referencia,
    // Una compra del entorno de pruebas no cobra nada y llega firmada igual
    // que una real. Se activa —probar tiene que recorrer lo mismo que un
    // cliente— pero queda gritada en el registro, como el cobro de prueba de
    // PagoPar y la compra de probador de Play, para que al revisar la
    // facturación no haya que adivinar por qué entró un Max gratis.
    prueba: String(tx.environment || "") !== "Production",
  };
}

/* ───────────────── los avisos que manda Apple sola ───────────────── */

/**
 * Los avisos ante los que hay algo que hacer.
 *
 * `SUBSCRIBED` es la primera compra y la resuscripción de alguien que se
 * había ido; `DID_RENEW`, el mes que se renovó solo. Los dos traen plata
 * nueva y una fecha de vencimiento más lejos, que es lo único que mueve el
 * acceso.
 */
export const AVISOS_QUE_RENUEVAN = Object.freeze(["SUBSCRIBED", "DID_RENEW"]);

/**
 * Los avisos que piden que un humano mire.
 *
 * Son los que sacan plata que ya se contó: Apple devolvió el mes, o le quitó
 * el acceso a alguien de un grupo familiar. No se arreglan solos acá porque
 * acortar un vencimiento no es empujarlo —`registrar_pago_pasarela` sólo sabe
 * sumar— y bajarle el plan a una empresa por un mensaje mal leído es peor que
 * regalarle los días que faltan. Quedan gritados en el registro.
 */
export const AVISOS_PARA_MIRAR = Object.freeze(["REFUND", "REVOKE"]);

/**
 * Abre el aviso firmado que manda Apple y devuelve lo de adentro.
 *
 * Son tres JWS, uno dentro del otro: el sobre trae el tipo de aviso, y adentro
 * viajan la transacción y el estado de la renovación, cada una firmada por
 * separado. Las tres firmas se revisan contra la misma raíz, porque verificar
 * sólo el sobre dejaría que cualquiera cambie la transacción de adentro.
 *
 * No hay secreto compartido ni token que mirar: **la firma es la
 * autenticación**. Si cierra contra la raíz de Apple, lo mandó Apple.
 */
export function verificarAviso(signedPayload, { raiz = raizDeApple() } = {}) {
  const sobre = verificarJws(signedPayload, { raiz });
  const datos = sobre?.data && typeof sobre.data === "object" ? sobre.data : {};

  // Las dos de adentro pueden faltar según el tipo de aviso (el de prueba no
  // trae ninguna), así que se abren sólo si están.
  const transaccion = datos.signedTransactionInfo
    ? verificarJws(String(datos.signedTransactionInfo), { raiz })
    : null;
  const renovacion = datos.signedRenewalInfo ? verificarJws(String(datos.signedRenewalInfo), { raiz }) : null;

  return {
    tipo: String(sobre?.notificationType || ""),
    subtipo: String(sobre?.subtype || ""),
    // Apple reenvía el mismo aviso hasta que le contesten 200, y el uuid es el
    // mismo en cada reintento: sirve para encontrar los repetidos en el log.
    uuid: String(sobre?.notificationUUID || ""),
    bundle: String(datos.bundleId || ""),
    entorno: String(datos.environment || ""),
    transaccion,
    renovacion,
  };
}

/**
 * Qué corresponde hacer con un aviso ya abierto.
 *
 * Aparte y sin red adentro por lo mismo que `revisarTransaccion`: es la parte
 * que decide, y se prueba armando un objeto a mano.
 *
 * Devuelve `renovar` cuando hay que empujar la fecha, `mirar` cuando hace
 * falta un humano y `nada` para todo lo demás. Ese "todo lo demás" es la
 * mayoría y es a propósito: que alguien apague la renovación automática
 * (`DID_CHANGE_RENEWAL_STATUS`) o que una suscripción venza (`EXPIRED`) no
 * pide ninguna acción, porque el plan ya se cae solo a `free` cuando la fecha
 * pasa. Actuar ahí sería adelantarse a cortarle el acceso a alguien que pagó
 * hasta fin de mes.
 */
export function quePideElAviso(aviso, { bundle = BUNDLE } = {}) {
  const nada = (motivo) => ({ accion: "nada", motivo });
  if (!aviso || typeof aviso !== "object") return nada("Aviso ilegible.");

  if (String(aviso.bundle || "") !== String(bundle)) {
    // No es de esta app. Puede ser otra app de la misma cuenta apuntando por
    // error a esta URL; se ignora en vez de activarle el plan a alguien.
    return { accion: "ajeno", motivo: `El aviso es de otra app (${aviso.bundle || "sin bundle"}).` };
  }

  const tipo = String(aviso.tipo || "");
  if (tipo === "TEST") return nada("Aviso de prueba de App Store Connect.");
  if (AVISOS_PARA_MIRAR.includes(tipo)) return { accion: "mirar", motivo: `${tipo}${aviso.subtipo ? ` · ${aviso.subtipo}` : ""}` };
  if (!AVISOS_QUE_RENUEVAN.includes(tipo)) return nada(`${tipo || "sin tipo"} no mueve la fecha.`);

  const tx = aviso.transaccion;
  if (!tx) return nada(`${tipo} llegó sin transacción adentro.`);

  // La transacción se revisa con las mismas reglas que una compra que manda la
  // app: mismo bundle, suscripción de verdad, no devuelta y con fecha por
  // delante. El `productId` sale de la propia transacción porque acá no hay
  // nadie pidiendo un plan: Apple avisa lo que cobró.
  const revision = revisarTransaccion(tx, { productId: String(tx.productId || ""), bundle });
  if (!revision.ok) return nada(revision.motivo);

  // El primero de la cadena. Es por donde se encuentra a quién pertenece esta
  // renovación: el cobro inicial se guardó con esa referencia, porque en la
  // primera compra el `transactionId` y el `originalTransactionId` son el
  // mismo número.
  const original = String(tx.originalTransactionId || "").trim();
  if (!original) return nada(`${tipo} no trae la transacción original.`);

  return {
    accion: "renovar",
    motivo: null,
    // Para distinguir el alta de la renovación. Las dos empujan la fecha
    // igual, pero no se registran igual cuando no se encuentra al dueño: en
    // el alta es lo esperado y en una renovación es un problema.
    tipo,
    productId: String(tx.productId || ""),
    referencia: revision.referencia,
    original,
    vence: revision.vence,
    prueba: revision.prueba,
  };
}

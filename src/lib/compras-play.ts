/**
 * Comprar el plan adentro de la app, con la facturación de Google Play.
 *
 * Existe porque Google no deja otra cosa: vender una suscripción adentro de
 * una app de Play obliga a cobrar con su sistema, y mandar a pagar afuera
 * —con un botón, un enlace o hasta un texto en el registro— está prohibido.
 * El cobro por la web con Pagopar sigue existiendo y sigue siendo mejor
 * negocio (no hay comisión), pero la app no puede mencionarlo.
 *
 * Lo que la app NO hace: activar el plan. La compra termina con un
 * comprobante que la app le manda al servidor, y es el servidor el que le
 * pregunta a Google si es real. Ese comprobante es tan falsificable como el
 * monto que nunca le creímos a Pagopar: quien tenga las herramientas de
 * desarrollo abiertas puede inventar uno y, si la app activara el plan por su
 * cuenta, se compraría Max gratis.
 */
import type { PURCHASE_TYPE } from "@capgo/native-purchases";
import { esNativo } from "./nativo";
import type { Plan } from "./planes";

/**
 * Que lo que vendemos son suscripciones y no compras de una vez.
 *
 * Hay que decirlo en cada llamada. El plugin, cuando no se lo dicen, pregunta
 * por productos de pago único, y Google contesta que no existe ninguno con
 * nuestros ids —porque no existen: existen como suscripciones—. El síntoma es
 * el peor posible: todo bien configurado en Play Console, y la app mostrando
 * que no hay nada para comprar.
 */
// El tipo se importa como tipo y el valor va escrito: un `import` normal del
// plugin acá arriba lo cargaría también en el navegador, donde no existe, y
// todo este archivo está escrito para no tocarlo salvo adentro del APK.
const TIPO_SUSCRIPCION = "subs" as PURCHASE_TYPE;

/**
 * Los identificadores de los productos, tal cual están creados en Play
 * Console. Si no coinciden carácter por carácter, la compra falla con "este
 * producto no está disponible" y no hay forma de darse cuenta mirando el
 * código.
 */
export const PRODUCTO_DE_PLAN: Partial<Record<Plan, string>> = {
  emprendedor: "zentra_emprendedor_mensual",
  max: "zentra_max_mensual",
};

/**
 * El id del plan base, tal cual está creado adentro de cada suscripción en
 * Play Console. Google no vende el producto: vende un plan base del producto,
 * y sin decirle cuál la compra no arranca. Lleva guion y no guion bajo porque
 * Play Console no acepta guion bajo en los ids de plan base.
 */
export const PLAN_BASE = "mensual";

/** El plan gratuito no se compra: no hay producto para él, y está bien así. */
export function productoDe(plan: Plan): string | null {
  return PRODUCTO_DE_PLAN[plan] ?? null;
}

/** Cómo terminó el intento, para poder decirlo en pantalla. */
export type ResultadoCompra =
  | { estado: "listo"; plan: Plan; vence: string | null }
  | { estado: "cancelado" }
  | { estado: "error"; motivo: string };

/**
 * Si en este dispositivo se puede comprar.
 *
 * Tres condiciones, y las tres hacen falta. Fuera del APK no hay plugin. En
 * un teléfono sin Play Store —pasa, y en Paraguay no es raro con teléfonos
 * importados— el plugin está pero la facturación no responde. Y en la
 * compilación que no va a la tienda el camino está apagado a propósito.
 */
export async function sePuedeComprar(): Promise<boolean> {
  if (!esNativo()) return false;
  try {
    const { NativePurchases } = await import("@capgo/native-purchases");
    const r = await NativePurchases.isBillingSupported();
    return Boolean(r?.isBillingSupported);
  } catch {
    return false;
  }
}

/**
 * Un plan comprable, como lo devuelve Google.
 *
 * `base` es el id del plan base. Hace falta guardarlo: la compra no se lanza
 * con el producto solo, y el plan base que tiene Google es la verdad —si
 * alguna vez se renombra en Play Console, esto sigue funcionando sin tocar el
 * código.
 */
export type PlanDePlay = { precio: string; base: string };

/**
 * El id del producto de una respuesta de Google.
 *
 * Acá estuvo el error que costó una semana más. En las suscripciones de
 * Android, el plugin devuelve una fila por plan base y **da vuelta los dos
 * campos**: `identifier` es el id del plan base (`mensual`) y
 * `planIdentifier` es el id del producto (`zentra_max_mensual`). Lo dice su
 * propia documentación: "si agrupás por `identifier`, estás agrupando por
 * plan base".
 *
 * Nosotros buscábamos nuestros productos por `identifier`. Google devolvía
 * los dos planes —el diagnóstico decía "devolvió 2"— y la búsqueda no
 * encontraba ninguno, porque los dos venían con `identifier` igual a
 * "mensual". De ahí salía todo lo que se veía en el teléfono: ningún plan
 * comprable, ninguna tarjeta que responda al toque, y la app cayendo al
 * camino de la web.
 *
 * En compras de pago único y en iOS no hay vuelta de campos: `identifier` es
 * el producto. Por eso el orden es `planIdentifier` primero y `identifier`
 * después, y no uno de los dos.
 */
function idDeProducto(p: { identifier?: string; planIdentifier?: string }): string {
  return String(p.planIdentifier || p.identifier || "");
}

/** El plan base que trajo Google; si no lo trae, el que tenemos escrito. */
function basePlanDe(p: { identifier?: string; planIdentifier?: string }): string {
  // Sólo cuando los campos vienen dados vuelta —suscripción de Android—
  // `identifier` es el plan base. Si no, no sabemos y vale el escrito.
  return p.planIdentifier && p.identifier ? String(p.identifier) : PLAN_BASE;
}

/**
 * Qué planes se pueden comprar acá, y a qué precio los muestra Google.
 *
 * Devuelve una entrada por cada plan que Google reconoció. El precio puede
 * venir vacío, y eso NO quiere decir que no se pueda comprar: en una
 * suscripción el precio vive en el plan base, no en el producto, así que el
 * campo de texto del producto puede volver en blanco aunque la compra esté
 * perfectamente disponible.
 *
 * Antes esto devolvía sólo precios, y la pantalla usaba "hay precio" como
 * sinónimo de "se puede comprar". Resultado: Google devolvía los dos planes,
 * sin texto de precio, y la app mostraba que no había nada que comprar.
 * Costó una semana encontrarlo, y el error no estaba en Play Console ni en la
 * publicación: estaba en haber mezclado dos preguntas distintas en un solo
 * dato.
 *
 * Cuando Google trae el precio se muestra el de Google, que es el que se va a
 * cobrar de verdad: cobra en la moneda del país de la cuenta y le suma sus
 * impuestos, así que puede no coincidir con `zentra.planes`.
 */
export async function planesDePlay(): Promise<Partial<Record<Plan, PlanDePlay>>> {
  if (!(await sePuedeComprar())) return {};
  try {
    const { NativePurchases } = await import("@capgo/native-purchases");
    const ids = Object.values(PRODUCTO_DE_PLAN).filter(Boolean) as string[];
    // `productType` no es opcional en la práctica: el plugin, si no se lo
    // decís, pregunta por productos de pago único (`inapp`). Nuestros planes
    // son suscripciones, así que Google contestaba que no existe ninguno y la
    // app se caía —bien— al camino de la web. Una hora de buscar el error en
    // Play Console por una palabra que no estaba acá.
    const r = await NativePurchases.getProducts({
      productIdentifiers: ids,
      productType: TIPO_SUSCRIPCION,
    });
    return interpretarProductos(r?.products ?? []);
  } catch {
    return {};
  }
}

/**
 * Pasar lo que contestó Google a nuestros planes.
 *
 * Está separado de la consulta a propósito: la consulta necesita un teléfono
 * y acá no se puede probar, pero esta parte —que es donde estuvo el error— se
 * prueba sola con una respuesta escrita a mano.
 */
export function interpretarProductos(
  productos: readonly { identifier?: string; planIdentifier?: string; priceString?: string }[],
): Partial<Record<Plan, PlanDePlay>> {
  const salida: Partial<Record<Plan, PlanDePlay>> = {};
  for (const p of productos) {
    const producto = idDeProducto(p);
    const plan = (Object.keys(PRODUCTO_DE_PLAN) as Plan[]).find((k) => PRODUCTO_DE_PLAN[k] === producto);
    if (!plan) continue;
    // Una suscripción vuelve una vez por plan base. Nos quedamos con el
    // primero: hoy hay uno solo por producto.
    if (salida[plan]) continue;
    // La condición es que el producto EXISTA, no que traiga precio: en una
    // suscripción el precio vive en el plan base y el campo de texto del
    // producto puede venir vacío.
    salida[plan] = { precio: String(p.priceString || ""), base: basePlanDe(p) };
  }
  return salida;
}

/**
 * Comprar, y después avisarle al servidor.
 *
 * `autoAcknowledgePurchases: false` es deliberado: el reconocimiento de la
 * compra lo hace el servidor, después de verificarla contra Google. Si lo
 * hiciera la app, estaríamos confirmándole a Google una compra que todavía no
 * sabemos si es nuestra.
 *
 * El plazo importa: una compra que nadie reconoce dentro de los tres días
 * Google se la reembolsa sola al cliente. Por eso, si el aviso al servidor
 * falla, no se traga el error: se dice, porque alguien tiene que reintentar.
 */
export async function comprarPlan(
  plan: Plan,
  avisarAlServidor: (productId: string, purchaseToken: string) => Promise<{ plan: Plan; vence: string | null }>,
  // El plan base que devolvió Google para este producto. Se recibe en vez de
  // consultarlo de nuevo: la pantalla ya lo tiene, y preguntar dos veces
  // abriría la puerta a comprar un plan base distinto del que se mostró.
  planBase: string = PLAN_BASE,
): Promise<ResultadoCompra> {
  const producto = productoDe(plan);
  if (!producto) return { estado: "error", motivo: "Ese plan no se compra desde la app." };

  let token = "";
  try {
    const { NativePurchases } = await import("@capgo/native-purchases");
    const t = await NativePurchases.purchaseProduct({
      productIdentifier: producto,
      // Obligatorio en las suscripciones de Android, y el plugin lo rechaza de
      // entrada si falta: "planIdentifier cannot be empty if productType is
      // subs". Google no vende el producto, vende un plan base del producto.
      planIdentifier: planBase,
      productType: TIPO_SUSCRIPCION,
      autoAcknowledgePurchases: false,
    });
    token = String(t?.purchaseToken || t?.transactionId || "");
  } catch (e) {
    // Cancelar no es fallar. Google no distingue el cancelado con un código
    // propio en todos los casos, así que se mira el mensaje: es feo, y es
    // mejor que tratar "me arrepentí" como un error y asustar a la persona.
    const msg = String((e as Error)?.message || e);
    if (/cancel|abort/i.test(msg)) return { estado: "cancelado" };
    // El motivo de Google va escrito. Es en inglés y no es lindo, pero el
    // "no se pudo completar la compra" solo nos dejó una semana a ciegas:
    // sin esto, un producto que no existe y una tarjeta rechazada se ven
    // exactamente iguales desde este lado del teléfono.
    return { estado: "error", motivo: `No se pudo completar la compra. ${msg.slice(0, 120)}` };
  }

  if (!token) {
    return {
      estado: "error",
      motivo: "La compra se hizo pero no llegó el comprobante. Escribinos antes de volver a intentar.",
    };
  }

  try {
    const r = await avisarAlServidor(producto, token);
    return { estado: "listo", plan: r.plan, vence: r.vence };
  } catch {
    // Lo peor que puede pasar: la plata salió y el plan no se activó. No se
    // puede tapar con un "intentá de nuevo", porque intentar de nuevo cobra
    // otra vez.
    return {
      estado: "error",
      motivo: "Se cobró, pero no pudimos activar el plan. No vuelvas a comprar: escribinos y lo resolvemos.",
    };
  }
}

/**
 * Avisarle al servidor que se compró.
 *
 * El servidor es el que decide: le pregunta a Google si el comprobante es
 * real, lo reconoce, y recién ahí activa el plan. La app no puede hacer
 * ninguna de esas tres cosas, y no debería poder.
 */
export async function avisarCompra(
  base: string,
  token: string,
  productId: string,
  purchaseToken: string,
): Promise<{ plan: Plan; vence: string | null }> {
  const r = await fetch(`${base.replace(/\/+$/, "")}/play/verificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ productId, purchaseToken }),
  });
  const d = (await r.json().catch(() => null)) as
    | { ok?: boolean; plan?: Plan; vence?: string | null; error?: string }
    | null;
  if (!r.ok || !d?.ok || !d.plan) {
    throw new Error(d?.error || "No pudimos confirmar la compra.");
  }
  return { plan: d.plan, vence: d.vence ?? null };
}

/**
 * Por qué no se puede comprar acá.
 *
 * Cuando el botón no aparece, desde afuera se ven todos los casos iguales: la
 * app muestra la dirección de la web y no dice nada. Pero las causas son
 * distintas y se arreglan en lugares distintos —el teléfono, Play Console, o
 * nuestro código— y sin esto hay que adivinar cuál es, con una persona del
 * otro lado probando a ciegas.
 *
 * Devuelve una frase corta, para mostrar en Configuración. No es para el
 * cliente final: es para poder contestar "¿por qué no me sale?" sin pedirle
 * capturas de pantalla durante media hora.
 */
export async function diagnosticoDeCompras(): Promise<string> {
  if (!esNativo()) return "En el navegador no se compra: sólo adentro de la app.";
  try {
    const { NativePurchases } = await import("@capgo/native-purchases");
    const soporta = await NativePurchases.isBillingSupported();
    if (!soporta?.isBillingSupported) {
      return "Este teléfono no tiene la facturación de Google disponible.";
    }
    const ids = Object.values(PRODUCTO_DE_PLAN).filter(Boolean) as string[];
    const r = await NativePurchases.getProducts({
      productIdentifiers: ids,
      productType: TIPO_SUSCRIPCION,
    });
    const productos = r?.products ?? [];
    const encontrados = productos.length;
    if (!encontrados) {
      return (
        "Google no devolvió ningún plan. Suele ser que la app no se instaló " +
        "desde Play, que los productos no están publicados, o que recién se " +
        "publicaron y todavía no llegaron."
      );
    }
    // Los ids van escritos. Cuando el diagnóstico decía sólo "devolvió 2", la
    // app igual no mostraba nada para comprar, y esa cuenta no alcanzaba para
    // saber por qué: faltaba ver que lo que devolvía no eran los ids que
    // buscábamos.
    const reconocidos = Object.keys(await planesDePlay()).join(", ");
    const vistos = productos.map((p) => idDeProducto(p) || "?").join(", ");
    return (
      `Listo: Google devolvió ${encontrados} plan${encontrados === 1 ? "" : "es"} (${vistos}). ` +
      (reconocidos ? `Comprables: ${reconocidos}.` : "Ninguno coincide con nuestros productos.")
    );
  } catch (e) {
    return "No se pudo consultar a Google: " + String((e as Error)?.message || e).slice(0, 120);
  }
}

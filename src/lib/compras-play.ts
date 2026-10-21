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
 * Lo que Google dice que sale cada plan.
 *
 * El precio lo pone Play Console, no nosotros: Google cobra en la moneda del
 * país de la cuenta y le aplica sus impuestos, así que el número que ve la
 * persona puede no ser el mismo que figura en `zentra.planes`. Mostramos el
 * de Google, que es el que se le va a cobrar.
 */
export async function preciosDePlay(): Promise<Partial<Record<Plan, string>>> {
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
    const porId = new Map((r?.products ?? []).map((p) => [p.identifier, p.priceString]));
    const salida: Partial<Record<Plan, string>> = {};
    for (const [plan, id] of Object.entries(PRODUCTO_DE_PLAN)) {
      const precio = id ? porId.get(id) : undefined;
      if (precio) salida[plan as Plan] = String(precio);
    }
    return salida;
  } catch {
    return {};
  }
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
): Promise<ResultadoCompra> {
  const producto = productoDe(plan);
  if (!producto) return { estado: "error", motivo: "Ese plan no se compra desde la app." };

  let token = "";
  try {
    const { NativePurchases } = await import("@capgo/native-purchases");
    const t = await NativePurchases.purchaseProduct({
      productIdentifier: producto,
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
    return { estado: "error", motivo: "No se pudo completar la compra." };
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
    const encontrados = (r?.products ?? []).length;
    if (!encontrados) {
      return (
        "Google no devolvió ningún plan. Suele ser que la app no se instaló " +
        "desde Play, que los productos no están publicados, o que recién se " +
        "publicaron y todavía no llegaron."
      );
    }
    return `Listo: Google devolvió ${encontrados} plan${encontrados === 1 ? "" : "es"}.`;
  } catch (e) {
    return "No se pudo consultar a Google: " + String((e as Error)?.message || e).slice(0, 120);
  }
}

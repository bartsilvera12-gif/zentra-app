/**
 * Avisar que el plan vence, y que venció.
 *
 * Va como notificación **local**, igual que el aviso de stock: la arma el
 * teléfono. Eso importa porque todavía no hay un servidor que mande avisos de
 * cobranza, y esto funciona sin él. Cuando lo haya, el aviso del servidor llega
 * igual y éste no estorba: se agrupan en una sola notificación que se reemplaza
 * a sí misma.
 *
 * La contra es la de siempre: sólo puede salir con la app abierta. Para un
 * vencimiento eso alcanza — se avisa varios días antes y la persona abre la app
 * todos los días para trabajar.
 */
import { diasParaVencer } from "./planes";

/**
 * Los días en que se avisa.
 *
 * No es todos los días: un aviso diario durante una semana se vuelve ruido y
 * se ignora justo el día que importa. Una semana antes para que dé tiempo a
 * pagar, tres días antes porque la primera ya se olvidó, el día anterior, y el
 * día que venció.
 */
export const HITOS = [7, 3, 1, 0] as const;

/**
 * Qué aviso corresponde hoy, o `null` si hoy no hay que avisar.
 *
 * Después del vencimiento avisa una sola vez más, no todos los días: ya cayó a
 * Free y la app se lo dice sola en cada pantalla. Insistir sería castigar.
 */
export function hitoDeHoy(vence: string | null | undefined, ahora?: Date): number | null {
  const dias = diasParaVencer(vence, ahora);
  if (dias === null) return null;
  if (dias < 0) return -1; // vencido: un único aviso
  return HITOS.includes(dias as (typeof HITOS)[number]) ? dias : null;
}

export function textoVencimiento(hito: number): { titulo: string; cuerpo: string } {
  if (hito < 0) {
    return {
      titulo: "Tu plan venció",
      cuerpo: "Seguís viendo todo lo cargado, pero para editar o cargar hay que renovar.",
    };
  }
  if (hito === 0) {
    return { titulo: "Tu plan vence hoy", cuerpo: "Renovalo para seguir cargando y editando." };
  }
  if (hito === 1) {
    return { titulo: "Tu plan vence mañana", cuerpo: "Renovalo para no quedarte sin cargar ni editar." };
  }
  return {
    titulo: `Tu plan vence en ${hito} días`,
    cuerpo: "Renovalo cuando puedas y seguís como estás.",
  };
}

const CLAVE = "zentra.avisadoVencimiento";

/**
 * Qué hito ya se avisó para esta fecha de vencimiento.
 *
 * Se guarda junto con la fecha, no suelto: al renovar, el vencimiento cambia y
 * los avisos de la fecha anterior ya no cuentan. Sin eso, alguien que renueva
 * no volvería a recibir aviso nunca.
 */
function leer(): { vence: string; hito: number } | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const v = JSON.parse(crudo) as { vence?: unknown; hito?: unknown };
    if (typeof v?.vence !== "string" || typeof v?.hito !== "number") return null;
    return { vence: v.vence, hito: v.hito };
  } catch {
    return null;
  }
}

function guardar(vence: string, hito: number): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ vence, hito }));
  } catch {
    /* sin almacenamiento se avisa de más, que es mejor que no avisar */
  }
}

/** Si hoy toca avisar algo que no se avisó ya para esta misma fecha. */
export function hayQueAvisar(
  vence: string | null | undefined,
  avisado: { vence: string; hito: number } | null,
  ahora?: Date,
): number | null {
  const hito = hitoDeHoy(vence, ahora);
  if (hito === null || !vence) return null;
  if (!avisado || avisado.vence !== vence) return hito;
  // Los hitos van hacia abajo (7, 3, 1, 0, -1): sólo se avisa si el de hoy es
  // más urgente que el último avisado para esta fecha.
  return hito < avisado.hito ? hito : null;
}

/**
 * Muestra el aviso si corresponde. Devuelve el hito avisado, o `null`.
 *
 * Todo lo que puede fallar está adentro: sin el plugin —en el navegador— o sin
 * permiso, no pasa nada. Un aviso que no se puede dar nunca es motivo para
 * romper una pantalla.
 */
export async function avisarVencimiento(
  vence: string | null | undefined,
  ahora?: Date,
): Promise<number | null> {
  const hito = hayQueAvisar(vence, leer(), ahora);
  if (hito === null || !vence) return null;
  guardar(vence, hito);

  try {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (typeof cap?.isNativePlatform !== "function" || !cap.isNativePlatform()) return null;

    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const permiso = await LocalNotifications.checkPermissions();
    if (permiso.display !== "granted") return null;

    const texto = textoVencimiento(hito);
    await LocalNotifications.schedule({
      // Id propio, distinto del de stock (1001): son dos noticias distintas y
      // una no tiene que tapar a la otra.
      notifications: [{ id: 1002, title: texto.titulo, body: texto.cuerpo }],
    });
    return hito;
  } catch {
    return null;
  }
}

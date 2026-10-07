/**
 * Notificaciones push.
 *
 * Firebase Cloud Messaging entrega los avisos, y Capacitor expone el plugin
 * nativo. En el navegador el plugin no existe, así que todo acá tiene que
 * degradar a nada: la app web tiene que seguir funcionando igual.
 *
 * El flujo es siempre el mismo:
 *
 *   1. pedir permiso al sistema (Android 13+ e iOS lo exigen)
 *   2. registrarse en FCM, que devuelve un token del dispositivo
 *   3. guardar ese token en la base, atado al usuario y a su empresa
 *
 * El token identifica al dispositivo, no a la persona: cambia si se reinstala la
 * app o se limpian los datos, así que hay que volver a guardarlo en cada arranque
 * y no asumir que el de ayer sigue sirviendo.
 */
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { repo } from "../repo";

export type Plataforma = "android" | "ios" | "web";

/** El plugin nativo sólo existe dentro del APK o del `.ipa`. */
export function pushDisponible(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("PushNotifications");
}

export function plataforma(): Plataforma {
  const p = Capacitor.getPlatform();
  return p === "android" || p === "ios" ? p : "web";
}

/** Token de la sesión actual. Se guarda para poder darlo de baja al salir. */
let tokenActual: string | null = null;

/**
 * Espera el token que FCM entrega por evento. El plugin no lo devuelve de
 * `register()`: avisa después por `registration`, o por `registrationError` si
 * el dispositivo no tiene Google Play Services o falta la configuración.
 */
function esperarToken(timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    let listo = false;
    const corte = setTimeout(() => {
      if (listo) return;
      listo = true;
      // El mensaje nombra la causa probable a propósito. Cuando esto falla, lo
      // que se ve es "no me llegan las notificaciones", y sin esta pista se
      // busca en la base de datos y en el ERP — que es donde no está. La causa
      // más común es un APK compilado sin `google-services.json`: Gradle no lo
      // avisa y el APK anda en todo lo demás.
      reject(
        new Error(
          "Firebase no respondió con el token. Puede que este APK se haya " +
            "compilado sin la configuración de Firebase, o que el teléfono no " +
            "tenga Google Play Services.",
        ),
      );
    }, timeoutMs);

    const terminar = (fn: () => void) => {
      if (listo) return;
      listo = true;
      clearTimeout(corte);
      fn();
    };

    PushNotifications.addListener("registration", (t) => terminar(() => resolve(t.value)));
    PushNotifications.addListener("registrationError", (e) =>
      terminar(() =>
        reject(
          new Error(
            String(e?.error || "Error registrando el dispositivo.") +
              " (Si dice que falta el FirebaseApp o el google_app_id, el APK se " +
              "compiló sin la configuración de Firebase.)",
          ),
        ),
      ),
    );
    PushNotifications.register().catch((e: unknown) => terminar(() => reject(e as Error)));
  });
}

/**
 * Activa las notificaciones: pide permiso, obtiene el token y lo guarda.
 *
 * Devuelve `false` cuando la persona rechazó el permiso. Eso no es un error: el
 * sistema no vuelve a preguntar, hay que mandarla a los ajustes del teléfono.
 */
export interface ResultadoPush {
  /** Si quedó activado: permiso dado y token guardado. */
  ok: boolean;
  /**
   * Si el backend reconoce a este usuario como agente de conversaciones.
   *
   * `false` significa que los avisos de chats no van a llegar nunca, aunque
   * todo lo demás esté bien: el ERP elige a quién mandárselos por su
   * `agent_id`, y quien no es agente no tiene ninguno. `null` es "no se sabe".
   */
  esAgente: boolean | null;
}

export async function activarPush(): Promise<ResultadoPush> {
  if (!pushDisponible()) return { ok: false, esAgente: null };

  const estado = await PushNotifications.checkPermissions();
  const permiso =
    estado.receive === "granted"
      ? estado
      : await PushNotifications.requestPermissions();
  if (permiso.receive !== "granted") return { ok: false, esAgente: null };

  const token = await esperarToken();
  tokenActual = token;
  const alta = await repo.dispositivos.registrar({ token, plataforma: plataforma() });
  return { ok: true, esAgente: alta.esAgente };
}

/**
 * Desactiva las notificaciones para este dispositivo.
 *
 * Borra el token de la base en vez de sólo apagar un switch local: si el token
 * queda guardado, el servidor sigue mandando avisos que el teléfono recibe de
 * todas formas.
 */
export async function desactivarPush(): Promise<void> {
  if (!pushDisponible()) return;
  const token = tokenActual;
  tokenActual = null;
  if (token) await repo.dispositivos.baja(token).catch(() => {});
  await PushNotifications.unregister().catch(() => {});
}

/**
 * Al cerrar sesión hay que dar de baja el token, o el próximo que entre en ese
 * teléfono recibiría los avisos de quien se fue.
 */
export async function olvidarDispositivo(): Promise<void> {
  await desactivarPush();
}

/**
 * Qué hacer cuando llega un aviso. Se registra una sola vez, al arrancar.
 *
 * `pushNotificationReceived` es con la app abierta; `pushNotificationActionPerformed`
 * es cuando la tocan desde la bandeja, y ahí el `data.pantalla` dice adónde ir.
 */
export async function escucharAvisos(
  onAbrir: (pantalla: string, datos: Record<string, string>) => void,
): Promise<void> {
  if (!pushDisponible()) return;
  await PushNotifications.addListener("pushNotificationActionPerformed", (accion) => {
    const datos = (accion.notification.data || {}) as Record<string, string>;
    if (datos.pantalla) onAbrir(datos.pantalla, datos);
  });
}

/* ---------- preferencia guardada en el dispositivo ---------- */

const KEY_PUSH = "zentra_push_v1";

/**
 * Si la persona ya activó los avisos en este teléfono. Hace falta guardarlo:
 * sin esto, cada arranque mostraría el switch apagado y habría que activarlo de
 * nuevo. Va en try/catch como todo lo demás que toca `localStorage`.
 */
export function pushPreferido(): boolean {
  try {
    return localStorage.getItem(KEY_PUSH) === "1";
  } catch {
    return false;
  }
}

export function guardarPreferenciaPush(on: boolean): void {
  try {
    localStorage.setItem(KEY_PUSH, on ? "1" : "0");
  } catch {
    // Sin persistencia la app anda igual: sólo vuelve a preguntar.
  }
}

/**
 * Vuelve a registrar el token si la persona ya tenía los avisos activados.
 *
 * Se llama después de entrar, en cada arranque: el token cambia al reinstalar la
 * app, y la fila de la base está atada al usuario de la sesión. No pide permiso
 * de nuevo —ya lo tiene— ni molesta si falla: un error acá no tiene que impedir
 * usar la app.
 */
export async function reanudarPush(): Promise<boolean> {
  if (!pushDisponible() || !pushPreferido()) return false;
  try {
    return (await activarPush()).ok;
  } catch {
    return false;
  }
}

/**
 * Volver a entrar sin escribir la contraseña otra vez.
 *
 * La sesión de Supabase ya se guardaba en el teléfono —`persistSession: true`—
 * y el token se renueva solo. Lo que faltaba era leerla al arrancar: la app
 * abría siempre en el login, así que cada vez que Android descartaba la app en
 * segundo plano —que es todo el tiempo— había que volver a escribir usuario y
 * contraseña. Hasta el comentario de `cerrarSesion` daba por hecho que el
 * arranque reabría la sesión; nadie había escrito esa parte.
 *
 * El orden importa y es la razón de que esto sea una función aparte y probada:
 * la sesión se guarda con una clave por instalación (`zentra-auth-<codigo>`),
 * así que hay que resolver y activar el tenant ANTES de preguntar por ella. Al
 * revés, el cliente mira la clave equivocada, no encuentra nada y la app pide
 * la contraseña teniendo la sesión guardada al lado.
 */
import type { Sesion } from "./repo/ports";
import type { TenantConfig } from "./tenant/types";

export interface DepsRestauro {
  /** Sin Supabase —modo de ejemplo— no hay sesión que restaurar. */
  usaSupabase: boolean;
  /** El código de instalación que usó este teléfono la última vez. */
  ultimoCodigo: () => string | null;
  resolver: (codigo: string) => Promise<TenantConfig>;
  activar: (t: TenantConfig) => void;
  sesion: () => Promise<Sesion | null>;
  /**
   * Cuánto se espera antes de mostrar el login igual.
   *
   * Sin esto, un pedido que no vuelve nunca —señal muy mala, el directorio
   * colgado— deja a la persona mirando el logo sin poder escribir la
   * contraseña. Que la app tarde en reabrir la sesión es un detalle; que no se
   * pueda entrar, no.
   */
  tiempoLimiteMs?: number;
}

export type Restauro =
  | { estado: "sin-sesion" }
  | { estado: "entrada"; tenant: TenantConfig | null; sesion: Sesion };

/**
 * Intenta reabrir la sesión guardada.
 *
 * Cualquier fallo —sin señal, el directorio caído, el perfil que no contesta—
 * termina en `sin-sesion`, sin mensaje de error: es un intento silencioso, y lo
 * que corresponde es mostrar el login como siempre. Mostrar "no pudimos
 * restaurar tu sesión" en el arranque sería ruido para algo que la persona no
 * pidió.
 */
export async function restaurarSesion(d: DepsRestauro): Promise<Restauro> {
  if (!d.usaSupabase) return { estado: "sin-sesion" };

  const sinSesion: Restauro = { estado: "sin-sesion" };
  let cortar: ReturnType<typeof setTimeout> | undefined;
  const corte = new Promise<Restauro>((resolve) => {
    cortar = setTimeout(() => resolve(sinSesion), d.tiempoLimiteMs ?? 6000);
  });

  try {
    return await Promise.race([intentar(d), corte]);
  } finally {
    clearTimeout(cortar);
  }
}

async function intentar(d: DepsRestauro): Promise<Restauro> {
  try {
    let tenant: TenantConfig | null = null;
    const codigo = d.ultimoCodigo();
    if (codigo) {
      tenant = await d.resolver(codigo);
      // Antes de preguntar por la sesión: la clave de guardado depende de esto.
      d.activar(tenant);
    }

    const sesion = await d.sesion();
    if (!sesion) return { estado: "sin-sesion" };
    return { estado: "entrada", tenant, sesion };
  } catch {
    return { estado: "sin-sesion" };
  }
}

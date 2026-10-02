/**
 * Autenticación contra Supabase.
 *
 * Son dos pasos, igual que en el ERP: `signInWithPassword` resuelve QUIÉN es, y
 * después la fila de `zentra.usuarios` dice de qué empresa y con qué rol. Sin el
 * segundo paso la app no sabe qué datos mostrar.
 */
import { sb } from "../supabase/client";
import type { AuthRepo, Sesion } from "./ports";

/** Error con un mensaje ya listo para mostrarle al usuario. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/** Traduce los mensajes de Supabase, que vienen en inglés y en jerga. */
function traducir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Usuario o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Falta confirmar tu correo. Revisá tu bandeja de entrada.";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "Ya existe una cuenta con ese correo. Probá entrar o recuperar la contraseña.";
  if (m.includes("password should be at least")) return "La contraseña tiene que tener al menos 6 caracteres.";
  if (m.includes("unable to validate email") || m.includes("invalid format"))
    return "Ese correo no parece válido.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Demasiados intentos. Esperá un momento y probá de nuevo.";
  if (m.includes("schema must be one of"))
    return "Falta exponer el schema `zentra` en Supabase (Project Settings → Data API → Exposed schemas).";
  if (m.includes("failed to fetch") || m.includes("networkerror"))
    return "No pudimos conectar. Revisá tu conexión.";
  return msg;
}

/**
 * Lee el perfil del usuario. Se reintenta una vez porque el disparador que crea
 * la empresa corre junto con el alta: en el primer registro la fila puede no
 * estar visible todavía.
 */
async function leerPerfil(userId: string, reintentar = true): Promise<Sesion["usuario"]> {
  const { data, error } = await sb()
    .from("usuarios")
    .select("id, nombre, rol, empresa_id, empresas(nombre)")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new AuthError(traducir(error.message));

  if (!data) {
    if (reintentar) {
      await new Promise((r) => setTimeout(r, 600));
      return leerPerfil(userId, false);
    }
    throw new AuthError(
      "Tu cuenta existe pero no tiene perfil en esta instalación. Escribinos a soporte.",
    );
  }

  const fila = data as unknown as {
    id: string;
    nombre: string | null;
    rol: string | null;
    empresa_id: string;
    empresas: { nombre: string } | { nombre: string }[] | null;
  };
  const emp = Array.isArray(fila.empresas) ? fila.empresas[0] : fila.empresas;

  return {
    id: fila.id,
    nombre: fila.nombre || "",
    rol: fila.rol || "VENDEDOR",
    empresa: emp?.nombre || "",
  };
}

export const supabaseAuth: AuthRepo = {
  async login(usuario, password) {
    const { data, error } = await sb().auth.signInWithPassword({
      email: usuario.trim(),
      password,
    });
    if (error) throw new AuthError(traducir(error.message));
    if (!data.session || !data.user) throw new AuthError("No se pudo iniciar sesión.");

    return {
      token: data.session.access_token,
      usuario: await leerPerfil(data.user.id),
    };
  },

  async logout() {
    const { error } = await sb().auth.signOut();
    if (error) throw new AuthError(traducir(error.message));
  },

  async sesionActual() {
    const { data } = await sb().auth.getSession();
    if (!data.session) return null;
    return {
      token: data.session.access_token,
      usuario: await leerPerfil(data.session.user.id),
    };
  },

  async recuperarPassword(correo) {
    // `redirectTo` tiene que estar en la lista de URLs permitidas de Supabase.
    // En el APK es el deep link; en web, la propia página.
    const { error } = await sb().auth.resetPasswordForEmail(correo.trim(), {
      redirectTo:
        typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
    });
    if (error) throw new AuthError(traducir(error.message));
  },
};

/**
 * Alta de cuenta. Sólo tiene sentido en la instalación pública: en la de un
 * cliente con ERP los usuarios los da de alta el dueño, no se auto-registran.
 *
 * `nombre` y `empresa` viajan en los metadatos: el disparador de la base los usa
 * para crear la empresa y el perfil en el mismo acto.
 */
export async function registrar(
  correo: string,
  password: string,
  nombre: string,
  empresa: string,
): Promise<{ necesitaConfirmar: boolean }> {
  const { data, error } = await sb().auth.signUp({
    email: correo.trim(),
    password,
    options: { data: { nombre: nombre.trim(), empresa: empresa.trim() } },
  });
  if (error) throw new AuthError(traducir(error.message));

  // Sin sesión en la respuesta, Supabase está esperando que confirme el correo.
  return { necesitaConfirmar: !data.session };
}

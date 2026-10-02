/**
 * Cliente de Supabase, atado a la instalación elegida en el login.
 *
 * No puede ser un cliente único creado al arrancar: a qué proyecto se conecta la
 * app depende del código de empresa, y eso recién se sabe cuando el usuario entra.
 * Por eso se crea al resolver el tenant y se guarda uno por configuración.
 *
 * Las tablas viven en el schema `zentra`, no en `public`: hay que decírselo al
 * cliente, si no PostgREST busca en `public` y no encuentra nada.
 */
import { createClient } from "@supabase/supabase-js";
import type { TenantConfig } from "../tenant/types";

export const SCHEMA = "zentra";

function crear(t: TenantConfig) {
  return createClient(t.supabaseUrl, t.anonKey, {
    db: { schema: SCHEMA },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // El enlace del correo de recuperación vuelve como fragmento de URL; en el
      // APK lo maneja el deep link, así que no lo detectamos acá.
      detectSessionInUrl: false,
      storageKey: `zentra-auth-${t.codigo || "publico"}`,
    },
  });
}

/**
 * El tipo sale de `crear` en vez de escribirse a mano: `SupabaseClient` por
 * defecto asume el schema `public` y acá usamos `zentra`.
 */
export type ClienteZentra = ReturnType<typeof crear>;

/** Un cliente por URL: cambiar de instalación no debe reusar la sesión anterior. */
const clientes = new Map<string, ClienteZentra>();

let activo: ClienteZentra | null = null;
let tenantActivo: TenantConfig | null = null;

/** Deja listo el cliente de esa instalación. Lo llama el login al resolver el código. */
export function activarTenant(t: TenantConfig): ClienteZentra {
  if (!t.supabaseUrl || !t.anonKey) {
    throw new Error(
      `La instalación "${t.nombre}" no tiene URL o clave configuradas. ` +
        `Revisá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY, o el directorio.`,
    );
  }
  let c = clientes.get(t.supabaseUrl);
  if (!c) {
    c = crear(t);
    clientes.set(t.supabaseUrl, c);
  }
  activo = c;
  tenantActivo = t;
  return c;
}

/** Cliente de la instalación activa. Falla claro si se usa antes del login. */
export function sb(): ClienteZentra {
  if (!activo) {
    throw new Error("No hay instalación activa: hay que pasar por el login primero.");
  }
  return activo;
}

export function tenantEnUso(): TenantConfig | null {
  return tenantActivo;
}

export function hayTenantActivo(): boolean {
  return activo !== null;
}

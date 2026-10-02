/**
 * Guardado en el dispositivo. Todo va envuelto en try/catch porque `localStorage`
 * puede fallar o venir vacío (ventana privada, datos borrados, WebView restringido):
 * la app tiene que seguir funcionando igual, sólo que pidiendo el código otra vez.
 */
import type { TenantConfig } from "./types";

const KEY_TENANT = "zentra_tenant_v1";
const KEY_ULTIMO_CODIGO = "zentra_ultimo_codigo_v1";

export function leerTenantGuardado(codigo: string): TenantConfig | null {
  try {
    const raw = localStorage.getItem(`${KEY_TENANT}:${codigo}`);
    if (!raw) return null;
    const t = JSON.parse(raw) as TenantConfig;
    // Una entrada guardada sin URL no sirve para conectarse.
    if (!t || typeof t.supabaseUrl !== "string") return null;
    return t;
  } catch {
    return null;
  }
}

export function guardarTenant(t: TenantConfig): void {
  try {
    localStorage.setItem(`${KEY_TENANT}:${t.codigo}`, JSON.stringify(t));
  } catch {
    // Sin persistencia la app anda igual: sólo vuelve a pedir el código.
  }
}

export function leerUltimoCodigo(): string {
  try {
    return localStorage.getItem(KEY_ULTIMO_CODIGO) ?? "";
  } catch {
    return "";
  }
}

export function guardarUltimoCodigo(codigo: string): void {
  try {
    localStorage.setItem(KEY_ULTIMO_CODIGO, codigo);
  } catch {
    /* ver nota en guardarTenant */
  }
}

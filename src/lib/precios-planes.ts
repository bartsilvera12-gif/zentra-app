/**
 * Cuánto sale cada plan.
 *
 * El precio no está escrito en la app, a propósito: vive en `zentra.planes` y
 * el server de cobros lo lee de ahí para cobrar. Si la app tuviera su propia
 * copia, el día que cambie un precio habría dos verdades y la que se le
 * muestra a la gente sería la vieja. Ya pasó: el código decía 49.000 y 89.000
 * mientras la base decía 80.000 y 150.000.
 *
 * La tabla se lee sin sesión —su política de lectura es pública, es una lista
 * de precios—, así que esto funciona incluso antes de entrar.
 *
 * Si no se puede leer se devuelve vacío y la hoja muestra los planes sin
 * precio. Mejor eso que un número inventado.
 */
import type { Plan } from "./planes";
import { hayTenantActivo, sb } from "./supabase/client";

export type PreciosDePlan = Partial<Record<Plan, number>>;

/**
 * Se pide una vez y queda: son tres números que no cambian mientras la app
 * está abierta, y la hoja puede abrirse muchas veces seguidas.
 */
let cache: PreciosDePlan | null = null;
let pidiendo: Promise<PreciosDePlan> | null = null;

function esPlan(v: unknown): v is Plan {
  return v === "free" || v === "emprendedor" || v === "max";
}

export async function preciosDePlanes(): Promise<PreciosDePlan> {
  if (cache) return cache;
  if (pidiendo) return pidiendo;

  pidiendo = (async () => {
    if (!hayTenantActivo()) return {};
    try {
      const { data, error } = await sb().from("planes").select("codigo, precio_mensual");
      if (error || !Array.isArray(data)) return {};
      const out: PreciosDePlan = {};
      for (const f of data as { codigo?: unknown; precio_mensual?: unknown }[]) {
        const n = Number(f.precio_mensual);
        if (esPlan(f.codigo) && Number.isFinite(n)) out[f.codigo] = n;
      }
      cache = out;
      return out;
    } catch {
      return {};
    } finally {
      pidiendo = null;
    }
  })();

  return pidiendo;
}

/** Al cerrar sesión: la próxima instalación puede tener otros precios. */
export function olvidarPreciosDePlanes(): void {
  cache = null;
  pidiendo = null;
}

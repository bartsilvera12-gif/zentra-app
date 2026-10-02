import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Propaga el ?N del padre a los hijos: así cada corrida de la prueba carga su
// propio árbol de módulos y `config.ts` vuelve a leer process.env.
export function resolve(spec, ctx, next) {
  if (spec.startsWith(".") || spec.startsWith("@/")) {
    const qPadre = ctx.parentURL ? (ctx.parentURL.split("?")[1] || "") : "";
    const qPropio = spec.includes("?") ? spec.split("?")[1] : "";
    const q = qPropio || qPadre;
    const limpio = spec.split("?")[0];
    const base = limpio.startsWith("@/")
      ? new URL("../src/" + limpio.slice(2), import.meta.url)
      : new URL(limpio, (ctx.parentURL || import.meta.url).split("?")[0]);
    for (const ext of ["", ".ts", ".tsx", "/index.ts"]) {
      const u = new URL(base.href + ext);
      if (existsSync(fileURLToPath(u))) {
        return next(u.href + (q ? "?" + q : ""), ctx);
      }
    }
  }
  return next(spec, ctx);
}

/** Strip accents and lower-case, so search matches regardless of tildes. */
export function norm(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Format an amount in guaraníes, e.g. `₲ 1.250.000`. */
export function gs(n: number): string {
  return "₲ " + Math.round(n).toLocaleString("es-PY");
}

/** Thousands-separated integer without the currency mark. */
export function num(n: number): string {
  return n.toLocaleString("es-PY");
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `2026-09-30` → `30 sep`. Returns an em dash for anything unparseable. */
export function fmtIso(iso: string): string {
  const p = (iso || "").split("-");
  if (p.length !== 3) return "—";
  const mes = MESES[Number(p[1]) - 1];
  if (!mes) return "—";
  return Number(p[2]) + " " + mes;
}

export function diaMes(d: Date): string {
  return d.getDate() + " " + MESES[d.getMonth()];
}

export function isoOf(d: Date): string {
  // Partes locales, no `toISOString()`: eso convierte a UTC, y en Paraguay
  // (UTC-3) a partir de las 21:00 devolvía el día siguiente. "Hoy" en el
  // reporte pasaba a ser mañana, y un rango de ventas de hoy salía vacío.
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Hoy, en la fecha del teléfono, que es la que el vendedor tiene en la cabeza. */
export function hoyIso(): string {
  return isoOf(new Date());
}

/** `n` días atrás contando hoy: `haceDias(7)` es la semana que incluye hoy. */
export function haceDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  return isoOf(d);
}

/** El primero del mes en curso. */
export function inicioDeMes(): string {
  const d = new Date();
  return isoOf(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Seconds → `m:ss`, for the voice-note timer. */
export function fmtSeg(n: number): string {
  return Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0");
}

/** Pluralize in Spanish by picking one of two words. */
export function plural(n: number, uno: string, varios: string): string {
  return n + " " + (n === 1 ? uno : varios);
}

/**
 * El recuadro con el código del producto.
 *
 * Estaba pensado para SKUs cortos —"73", "2590"— y los del ERP son códigos
 * largos como `PIN_ACRI_0001`: el texto se salía del recuadro y se metía abajo
 * del nombre del producto.
 *
 * Ahora el texto se achica según lo largo que sea, parte por los separadores
 * (`_`, `-`, `.`) y, si aun así no entra, se corta. El código completo siempre
 * se muestra además en la línea de abajo de cada fila: el recuadro es para
 * reconocer de un vistazo, no para leer el código entero.
 */
"use client";
import type { ThemeTokens } from "@/lib/types";

/**
 * Cuánto achicar la letra según el largo del código. Son los tamaños que
 * entran en un recuadro de ~42px partiendo en dos líneas.
 */
function tamaño(largo: number, caja: number): number {
  const base = caja >= 52 ? 13 : caja >= 42 ? 12 : 11;
  if (largo <= 4) return base;
  if (largo <= 7) return base - 2;
  if (largo <= 11) return base - 3.5;
  return base - 4.5;
}

export function Sku({
  sku,
  t,
  caja = 42,
  onDark = false,
}: {
  sku: string;
  t: ThemeTokens;
  caja?: number;
  /** Sobre el encabezado de color, donde el texto va blanco. */
  onDark?: boolean;
}) {
  const texto = (sku || "").trim();
  return (
    <span
      style={{
        width: caja,
        height: caja,
        flex: "0 0 auto",
        borderRadius: caja >= 52 ? 14 : 12,
        background: onDark ? "rgba(255,255,255,.18)" : t.bg,
        color: onDark ? "#fff" : t.ink3,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 3,
        boxSizing: "border-box",
        overflow: "hidden",
        // `anywhere` parte también donde no hay separador: un código de una
        // sola palabra, sin esto, se sale igual.
        overflowWrap: "anywhere",
        wordBreak: "break-all",
        font: `600 ${tamaño(texto.length, caja)}px/1.05 var(--font-barlow),Barlow,sans-serif`,
      }}
    >
      {texto || "—"}
    </span>
  );
}

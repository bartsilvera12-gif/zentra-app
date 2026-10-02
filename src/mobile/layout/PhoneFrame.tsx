import type { ReactNode } from "react";

/**
 * El marco del dispositivo que envuelve cada pantalla.
 *
 * En una pantalla grande es la maqueta del diseño: bisel oscuro, esquinas
 * redondeadas y 372×740 fijos, que es lo que hace que los valores en píxeles del
 * diseño queden exactos.
 *
 * En un celular de verdad el marco **desaparece**: un teléfono dibujado dentro de
 * un teléfono se ve a escala de juguete y desperdicia la mitad de la pantalla.
 * Eso lo resuelve `globals.css` con una media query, no este archivo, porque los
 * estilos inline no admiten media queries.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="zt-marco">
      <div className="zt-pantalla">{children}</div>
    </div>
  );
}

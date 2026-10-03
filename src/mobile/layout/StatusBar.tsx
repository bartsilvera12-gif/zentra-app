/**
 * El espacio contra el borde superior de la pantalla.
 *
 * Antes acá iba una barra de estado dibujada, con un reloj que siempre marcaba
 * las 9:41 y una batería al 65%. En la maqueta del diseño se veía bien; en un
 * celular de verdad quedaba justo debajo del reloj real del sistema, marcando
 * una hora distinta.
 *
 * Lo que sí hacía falta de aquella barra es el espacio: sin él los encabezados
 * quedan pegados al borde, y en un teléfono con muesca, debajo de ella. Por eso
 * esto no desapareció, se volvió lo que realmente era.
 *
 * `bg` mantiene el color del encabezado de cada pantalla, para que el espacio no
 * se note como una franja aparte.
 */
export function StatusBar({ bg }: { bg?: string }) {
  return <div className="zt-espacio-superior" style={{ background: bg }} />;
}

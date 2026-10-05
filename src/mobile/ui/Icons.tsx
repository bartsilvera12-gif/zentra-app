/** Line icons lifted from the prototype's inline SVGs, kept at their original geometry. */

interface IconProps {
  size?: number;
  stroke?: string;
  width?: number;
}

export function IconInicio({ size = 24, stroke = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10.5L12 4l8 6.5V20H4z" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export function IconReportes({ size = 24, stroke = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 20v-6M12.5 20V8.5M17 20v-9" />
    </svg>
  );
}

export function IconConfig({ size = 24, stroke = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 3.6v2.2M12 18.2v2.2M4.6 7.8l1.9 1.1M17.5 15.1l1.9 1.1M4.6 16.2l1.9-1.1M17.5 8.9l1.9-1.1" />
    </svg>
  );
}

export function IconCampana({ size = 21, stroke = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.7} strokeLinecap="round">
      <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9z" />
      <path d="M10.5 18a1.8 1.8 0 0 0 3 0" />
    </svg>
  );
}

export function IconFactura({ size = 27, stroke = "#ffffff" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

export function IconClientes({ size = 26, stroke = "#ffffff" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3.2 2.5-5 5.5-5s5.5 1.8 5.5 5" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19c0-2.2-.6-3.8-1.6-4.7" />
    </svg>
  );
}

export function IconCompras({ size = 26, stroke = "#023047" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {/* El carrito: el asa que baja al canasto, el canasto, y las ruedas
          separadas de la base. Antes el canasto arrancaba adentro del asa y
          se leía como dos trazos cruzados en vez de un carrito. */}
      <path d="M2.8 3.8h2.3l2.6 11.3h9.7" />
      <path d="M6.5 6.9h14.2l-1.9 6.2H7.9" />
      <circle cx="9.2" cy="19.2" r="1.5" />
      <circle cx="17.2" cy="19.2" r="1.5" />
    </svg>
  );
}

export function IconInventario({ size = 26, stroke = "#023047" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 4.3v9.4L12 21l-8-4.3V7.3z" />
      <path d="M4 7.3l8 4.3 8-4.3M12 11.6V21" />
    </svg>
  );
}

export function IconConversaciones({ size = 26, stroke = "#023047" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {/* Dos globos en diagonal, grandes y bien separados, cada uno con su
          colita. Un solo globo se confunde con "una nota"; dos se leen como
          conversación.
          
          Superpuestos quedaban los trazos cruzados, y chicos se veían como dos
          cuadraditos apretados: a 26px, que es el tamaño real, el detalle fino
          desaparece y sólo queda la silueta. Por eso van grandes. */}
      <path d="M13.4 3h5.3A2.3 2.3 0 0 1 21 5.3v3.9a2.3 2.3 0 0 1-2.3 2.3h-.6v2.4l-2.7-2.4h-2A2.3 2.3 0 0 1 11.1 9.2V5.3A2.3 2.3 0 0 1 13.4 3z" />
      <path d="M5.3 12.8h5.3a2.3 2.3 0 0 1 2.3 2.3V19a2.3 2.3 0 0 1-2.3 2.3h-2L5.9 23.7v-2.4h-.6A2.3 2.3 0 0 1 3 19v-3.9a2.3 2.3 0 0 1 2.3-2.3z" />
    </svg>
  );
}

export function IconProveedores({ size = 26, stroke = "#023047" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 7h10v9h-10z" />
      <path d="M12.5 10.5H17l3 3V16h-7.5z" />
      <circle cx="6.5" cy="18.4" r="1.5" />
      <circle cx="16.4" cy="18.4" r="1.5" />
    </svg>
  );
}

/** The arrow that slides in on a module tile's hover state. */
export function IconFlecha({ size = 19 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h13" />
      <path d="M12.5 6.5L19 12l-6.5 5.5" />
    </svg>
  );
}

export function IconLupa({ size = 16, stroke = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.9} strokeLinecap="round">
      <circle cx="11" cy="11" r="6.4" />
      <path d="M15.8 15.8L20 20" />
    </svg>
  );
}

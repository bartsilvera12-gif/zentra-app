/**
 * El ticket, como dato: el contenido que va a salir por la impresora térmica,
 * armado antes de hablar con ninguna impresora.
 *
 * Está separado de `impresora.ts` a propósito. Lo que se imprime es la única
 * parte de todo esto que se puede verificar sin hardware: acá no hay Bluetooth,
 * ni permisos, ni plugin, ni teléfono. Son cuentas y cuántos caracteres entran
 * en el papel. Lo otro —que el rollo salga— no lo sabe nadie hasta que haya un
 * rollo adelante.
 *
 * Dos anchos, porque son los dos rollos que se usan en los comercios de acá:
 *
 *   58 mm → 32 columnas
 *   80 mm → 48 columnas
 *
 * Los números no son elegidos: a 203 dpi el papel de 58 mm tiene 384 puntos
 * imprimibles y el de 80 mm, 576. La fuente A del ESC/POS mide 12 puntos de
 * ancho, así que entran 384/12 = 32 y 576/12 = 48. Por eso el ticket se arma en
 * texto monoespaciado y se imprime con la fuente A: lo que se cuenta acá es
 * exactamente lo que cabe allá. Con otra fuente, cada línea que se pase se
 * parte sola en el lugar equivocado y el monto de la derecha aparece abajo.
 *
 * El guaraní se escribe "Gs" y no "₲". El símbolo no existe en la página de
 * código que entienden estas impresoras (Windows-1252, que es la que cubre
 * nuestros acentos y la ñ), así que saldría un carácter cualquiera en el lugar
 * del total. Es la clase de detalle que no se ve hasta que sale el papel.
 */
import type { PrintItem } from "@delicity/capacitor-thermal-printer";
import { ivaContenido, neto, rateOf } from "./calc";
import { lineaEmisor, tituloComprobante, type Emisor } from "./emisor";
import type { Venta } from "./types";

/** Los dos rollos. No hay un tercero en la calle. */
export type AnchoPapel = 58 | 80;

export const COLUMNAS: Record<AnchoPapel, number> = { 58: 32, 80: 48 };

/** El ancho que se usa cuando no se sabe cuál es: el más angosto. */
export const ANCHO_POR_DEFECTO: AnchoPapel = 58;

/**
 * Un ancho válido, salga de donde salga.
 *
 * El plugin deduce el ancho del modelo y devuelve `null` cuando no lo reconoce
 * —que con las ESC/POS genéricas es lo habitual—. Ante la duda, 58: un ticket
 * de 32 columnas sale bien en un rollo de 80 mm, apenas angosto; uno de 48
 * columnas en un rollo de 58 mm sale partido a la mitad y no se entiende.
 */
export function anchoValido(mm: number | null | undefined): AnchoPapel {
  return mm === 80 ? 80 : ANCHO_POR_DEFECTO;
}

/**
 * El texto, en la forma en la que se puede contar y encodear.
 *
 * NFC junta la letra y su tilde en un solo carácter. Hace falta por dos
 * razones: "ñ" escrita como n + tilde combinada mide dos caracteres y corre
 * toda la línea, y además no tiene lugar en Windows-1252, así que la impresora
 * recibe basura justo en los nombres propios, que es donde más se nota.
 */
function txt(s: string | null | undefined): string {
  return (s ?? "").normalize("NFC");
}

/** Cuánto ocupa en el papel, en caracteres de la fuente A. */
export function ancho(s: string): number {
  return [...txt(s)].length;
}

/** Lo que entra, y lo que no entra se corta. Para una celda de ancho fijo. */
export function recortar(s: string, cols: number): string {
  const c = [...txt(s)];
  return c.length <= cols ? c.join("") : c.slice(0, cols).join("");
}

/**
 * El texto en varias líneas, cortando por palabra.
 *
 * Una palabra más larga que el papel —un nombre de producto pegado, un código—
 * se parte igual: dejarla salir corre la línea y la impresora la corta donde
 * quiere, que es siempre peor que cortarla donde decidimos nosotros.
 */
export function partir(s: string, cols: number): string[] {
  const limpio = txt(s).replace(/\s+/g, " ").trim();
  if (!limpio) return [];
  const salida: string[] = [];
  let linea = "";
  for (const palabra of limpio.split(" ")) {
    let p = palabra;
    // La palabra sola no entra: se llena línea por línea hasta que lo que
    // queda sí entra.
    while (ancho(p) > cols) {
      if (linea) {
        salida.push(linea);
        linea = "";
      }
      salida.push(recortar(p, cols));
      p = [...txt(p)].slice(cols).join("");
    }
    if (!p) continue;
    if (!linea) linea = p;
    else if (ancho(linea) + 1 + ancho(p) <= cols) linea += " " + p;
    else {
      salida.push(linea);
      linea = p;
    }
  }
  if (linea) salida.push(linea);
  return salida;
}

/** Centrado con espacios. No hay otra forma: el papel no sabe de márgenes. */
export function centrar(s: string, cols: number): string {
  const t = recortar(s, cols);
  const sobra = cols - ancho(t);
  return " ".repeat(Math.floor(sobra / 2)) + t;
}

/**
 * Rótulo a la izquierda, monto a la derecha, pegado al borde del papel.
 *
 * Los montos van alineados a la derecha porque es la única forma de poder
 * sumarlos de un vistazo: con la coma bailando, una columna de precios no se
 * lee. Cuando los dos no entran, lo que se recorta es el rótulo —el nombre se
 * adivina, el monto no—.
 */
export function dosColumnas(izq: string, der: string, cols: number): string {
  const d = recortar(der, cols);
  const lugar = cols - ancho(d) - 1;
  if (lugar <= 0) return d.padStart(cols, " ");
  const i = recortar(izq, lugar);
  return i + " ".repeat(cols - ancho(i) - ancho(d)) + d;
}

/** Una línea de guiones de punta a punta. */
export function separador(cols: number, char = "-"): string {
  return char.repeat(cols);
}

/**
 * Un monto en guaraníes, sin el símbolo.
 *
 * Redondeado al entero: el guaraní no tiene centavos, y un ticket con
 * decimales es un ticket que alguien va a venir a preguntar.
 */
export function monto(n: number): string {
  return Math.round(n).toLocaleString("es-PY");
}

/** Lo que hace falta además de la venta para armar el papel. */
export interface OpcionesTicket {
  emisor: Emisor;
  ancho?: AnchoPapel;
  /** La última línea, la del agradecimiento. */
  pie?: string;
}

const PIE_POR_DEFECTO = "¡Gracias por su compra!";

/**
 * El desglose de IVA de la venta.
 *
 * El IVA está *contenido* en el precio —así se factura en Paraguay— así que la
 * base de cada tasa es el bruto menos el impuesto, no el bruto. Es la misma
 * cuenta de `calc.ts` y no se repite acá: equivocarla en el ticket y no en la
 * pantalla sería la peor versión del error, porque el papel es el que queda.
 */
export function desgloseIva(v: Venta): { tasa: string; base: number; iva: number }[] {
  const salida: { tasa: string; base: number; iva: number }[] = [];
  for (const tasa of ["10%", "5%", "Exenta"]) {
    const r = rateOf(tasa);
    const lineas = v.lineas.filter((l) => l.iva === tasa);
    if (!lineas.length) continue;
    const bruto = lineas.reduce((a, l) => a + l.qty * l.precio, 0);
    salida.push({ tasa, base: neto(bruto, r), iva: ivaContenido(bruto, r) });
  }
  return salida;
}

/**
 * El ticket entero, línea por línea, ya recortado al ancho del papel.
 *
 * Devuelve texto y no comandos de impresora porque así se puede leer en una
 * prueba y mirar con los ojos. Lo que `itemsDeTicket` manda a imprimir son
 * estas mismas líneas, sin tocarlas: si acá entra, allá entra.
 */
export function lineasDeTicket(v: Venta, opc: OpcionesTicket): string[] {
  const cols = COLUMNAS[opc.ancho ?? ANCHO_POR_DEFECTO];
  const e = opc.emisor;
  const l: string[] = [];

  for (const linea of partir(e.nombre, cols)) l.push(centrar(linea, cols));
  // Sin RUC esto no dice "RUC": lo dice `lineaEmisor`, que escribe "Sin RUC
  // cargado". Inventarle uno al papel es exactamente el problema que esa
  // función vino a resolver.
  for (const linea of partir(lineaEmisor(e), cols)) l.push(centrar(linea, cols));
  l.push(separador(cols));

  // El título sale de `tituloComprobante`: sin RUC es un comprobante interno y
  // no una factura, y el papel es el que termina en la mano del cliente. Va
  // partido y no en una línea sola porque "Comprobante interno" más el número
  // son 35 caracteres y en 58 mm entran 32: así el número baja a la línea de
  // abajo en vez de perderse.
  for (const linea of partir(`${tituloComprobante(e)} ${v.numero}`, cols)) l.push(linea);
  l.push(`Fecha: ${txt(v.fecha)}`);
  for (const linea of partir(`Cliente: ${v.cliente}`, cols)) l.push(linea);
  if (txt(v.doc)) for (const linea of partir(`RUC/CI: ${v.doc}`, cols)) l.push(linea);
  l.push(separador(cols));

  for (const li of v.lineas) {
    // El nombre arriba, en todo el ancho, y abajo la cuenta: cantidad por
    // precio a la izquierda y el total pegado a la derecha. Al revés —nombre y
    // monto en la misma línea— los nombres de productos reales no entran y el
    // ticket queda lleno de nombres cortados a la mitad.
    for (const linea of partir(li.nombre, cols)) l.push(linea);
    l.push(dosColumnas(`  ${li.qty} x ${monto(li.precio)}`, monto(li.qty * li.precio), cols));
  }
  l.push(separador(cols));

  for (const d of desgloseIva(v)) {
    if (d.tasa === "Exenta") {
      l.push(dosColumnas("Exentas", monto(d.base), cols));
      continue;
    }
    l.push(dosColumnas(`Gravado ${d.tasa}`, monto(d.base), cols));
    l.push(dosColumnas(`IVA ${d.tasa}`, monto(d.iva), cols));
  }
  l.push(separador(cols));

  const total = v.lineas.reduce((a, li) => a + li.qty * li.precio, 0);
  l.push(dosColumnas("TOTAL", `Gs ${monto(total)}`, cols));
  l.push(separador(cols));

  l.push(dosColumnas(txt(v.pago), txt(v.estado), cols));
  l.push("");
  for (const linea of partir(opc.pie ?? PIE_POR_DEFECTO, cols)) l.push(centrar(linea, cols));
  // Lo que falta para ser una factura va en el papel, no sólo en la pantalla:
  // el que se lleva el ticket tiene que poder leer que no es un comprobante
  // legal, igual que el que lo emitió.
  if (e.falta) {
    l.push("");
    for (const linea of partir(e.falta, cols)) l.push(centrar(linea, cols));
  }

  return l;
}

/**
 * El ticket como se lo manda al plugin.
 *
 * Una línea por item y nada más: ni negritas, ni doble alto, ni centrado por
 * comando. Todo el formato ya está en el texto —los espacios del centrado, el
 * relleno de los montos— y mezclar las dos cosas rompe la cuenta de columnas,
 * porque un texto en doble ancho ocupa el doble y la línea de 32 pasa a 16.
 *
 * `WPC1252` es la página de código: es la que tiene los acentos y la ñ. Sin
 * esto los nombres salen con símbolos en el lugar de las tildes.
 *
 * El `feed` antes del corte existe porque el cabezal y la cuchilla no están en
 * el mismo lugar: sin avanzar el papel, la cuchilla corta arriba del total.
 */
export function itemsDeTicket(v: Venta, opc: OpcionesTicket): PrintItem[] {
  const lineas = lineasDeTicket(v, opc);
  const items: PrintItem[] = lineas.map((value) => ({
    type: "text",
    value,
    style: { align: "left", font: "A", encoding: "WPC1252" },
  }));
  items.push({ type: "feed", lines: 3 });
  items.push({ type: "cut", mode: "full" });
  return items;
}

/** El ticket en texto plano, para mirarlo sin impresora. */
export function textoDeTicket(v: Venta, opc: OpcionesTicket): string {
  return lineasDeTicket(v, opc).join("\n");
}

/* ---------- el ticket de prueba ---------- */

/**
 * Lo que sale cuando se prueba la impresora recién elegida.
 *
 * Tres cosas, y cada una contesta una pregunta que de otro modo se descubre con
 * un cliente esperando:
 *
 *   1. La regla de columnas. Si los números no llegan justo al borde del papel,
 *      el ancho configurado no es el del rollo que está puesto.
 *   2. Los acentos y la ñ. Si salen símbolos raros, la impresora no está en la
 *      página de código que le mandamos, y todos los nombres propios van a
 *      salir mal.
 *   3. El corte. Si el papel no se corta, la impresora no tiene cuchilla y hay
 *      que arrancarlo a mano, que conviene saber antes.
 */
export function lineasDePrueba(mm: AnchoPapel): string[] {
  const cols = COLUMNAS[mm];
  const l: string[] = [];
  for (const linea of partir("Zentra · prueba de impresión", cols)) l.push(centrar(linea, cols));
  l.push(separador(cols));
  // Un dígito por columna: el último tiene que caer justo en el borde.
  l.push(Array.from({ length: cols }, (_, i) => String((i + 1) % 10)).join(""));
  l.push(`${cols} columnas · papel de ${mm} mm`);
  l.push(separador(cols));
  for (const linea of partir("Acentos y ñ: ñandutí, Caazapá, Ñemby", cols)) l.push(linea);
  l.push(dosColumnas("Monto de prueba", `Gs ${monto(1250000)}`, cols));
  l.push(separador(cols));
  for (const linea of partir("Si leés esto, imprime.", cols)) l.push(centrar(linea, cols));
  return l;
}

export function itemsDePrueba(mm: AnchoPapel): PrintItem[] {
  const items: PrintItem[] = lineasDePrueba(mm).map((value) => ({
    type: "text",
    value,
    style: { align: "left", font: "A", encoding: "WPC1252" },
  }));
  items.push({ type: "feed", lines: 3 });
  items.push({ type: "cut", mode: "full" });
  return items;
}

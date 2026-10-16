/**
 * Llevarse el reporte afuera de la app.
 *
 * El botón "Exportar" existía desde el prototipo y no exportaba nada: cambiaba
 * un booleano y escribía "✓ Exportado". Quien lo tocaba se iba a buscar el
 * archivo a la carpeta de descargas y no había archivo. Peor que no tener el
 * botón, porque además hace perder tiempo buscando.
 *
 * Sale CSV y no PDF ni Excel por una razón: lo que se hace con un reporte
 * exportado es abrirlo en una planilla y seguir sacando cuentas. Un PDF es una
 * foto de la pantalla que ya se está mirando.
 *
 * El separador es punto y coma y el archivo arranca con BOM. Los dos son por
 * Excel en español: con coma, Excel en configuración regional de Paraguay mete
 * todo en una columna, y sin BOM los acentos salen rotos. Es feo y es lo que
 * hace que el archivo se abra bien al doble clic.
 */
import type { ReportModel } from "./reportes";
import type { RepTab } from "./types";

const SEP = ";";
const BOM = "﻿";

/**
 * Una celda, escapada.
 *
 * Los textos llevan punto y coma adentro más seguido de lo que uno cree —un
 * nombre de producto, un motivo— y uno solo corre todas las columnas de esa
 * fila.
 */
export function celda(v: string | number): string {
  const s = String(v ?? "");
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const fila = (...celdas: (string | number)[]) => celdas.map(celda).join(SEP);

/**
 * El reporte como planilla.
 *
 * Va todo lo que la pantalla muestra, en secciones separadas por una línea en
 * blanco: los indicadores de arriba, la serie del gráfico, el ranking, la
 * participación de la dona y la tabla del detalle. No se exporta "lo
 * importante": quien abre esto en una planilla quiere los números que vio, y
 * lo que falte lo va a venir a pedir.
 *
 * Los montos van sin separador de miles a propósito: con puntos, la planilla
 * los lee como texto y no se pueden sumar.
 */
export function csvDeReporte(
  m: ReportModel,
  { tab, desde, hasta }: { tab: RepTab; desde: string; hasta: string },
): string {
  const l: string[] = [];

  l.push(fila(`Zentra · Reporte de ${tab}`));
  l.push(fila("Desde", desde, "Hasta", hasta, `${m.dias} días`));
  l.push("");

  l.push(fila("Indicador", "Valor"));
  for (const k of m.kpis) l.push(fila(k.label, k.valor));
  l.push(fila("Total", m.total));
  l.push("");

  if (m.buckets.length) {
    l.push(fila(m.esFoto ? "Producto" : "Día", "Monto"));
    for (const b of m.buckets) l.push(fila(b.dia, b.v));
    l.push("");
  }

  if (m.rank.length) {
    l.push(fila("Ranking", "Monto", "Detalle"));
    for (const r of m.rank) l.push(fila(r.label, r.v, r.sub));
    l.push("");
  }

  if (m.dona.length) {
    l.push(fila("Participación", "Porcentaje"));
    for (const d of m.dona) l.push(fila(d.label, d.pct));
    l.push("");
  }

  if (m.tabla.length) {
    l.push(fila("Detalle", "Referencia", "Valor"));
    for (const f of m.tabla) l.push(fila(f.k, f.sub, f.v));
  }

  return BOM + l.join("\r\n") + "\r\n";
}

/** `zentra-ventas-2026-01-01_2026-10-16.csv` */
export function nombreDeArchivo(tab: RepTab, desde: string, hasta: string): string {
  return `zentra-${tab}-${desde}_${hasta}.csv`;
}

/** Cómo terminó el intento, para poder decirlo en pantalla. */
export type ResultadoExportar = "descargado" | "compartido" | "copiado" | "error";

/**
 * Sacar el archivo del teléfono.
 *
 * Tres caminos, en este orden, porque no hay uno que funcione en todos lados:
 *
 * 1. **Compartir.** Adentro del APK es el único que lleva a algo útil: abre el
 *    menú del sistema y la persona elige WhatsApp, Drive o guardar. Una
 *    descarga en el WebView de Android no siempre llega a ningún lado.
 * 2. **Descargar.** En el navegador es lo esperable: el archivo cae en
 *    Descargas.
 * 3. **Copiar.** El último recurso. No es lo mismo, pero es mejor que un botón
 *    que no hace nada, que es justo lo que estamos arreglando.
 *
 * Cancelar el menú de compartir no es un error y no se trata como tal: la
 * persona decidió no mandarlo.
 */
export async function exportarArchivo(
  nombre: string,
  contenido: string,
  entorno: {
    nav?: Navigator;
    doc?: Document;
  } = {},
): Promise<ResultadoExportar | null> {
  const nav = entorno.nav ?? (typeof navigator !== "undefined" ? navigator : undefined);
  const doc = entorno.doc ?? (typeof document !== "undefined" ? document : undefined);
  const tipo = "text/csv;charset=utf-8";

  if (nav && typeof File === "function" && nav.canShare && nav.share) {
    const archivo = new File([contenido], nombre, { type: tipo });
    if (nav.canShare({ files: [archivo] })) {
      try {
        await nav.share({ files: [archivo], title: nombre });
        return "compartido";
      } catch (e) {
        // Cancelar no es fallar: no se intenta nada más ni se avisa nada.
        if ((e as { name?: string })?.name === "AbortError") return null;
      }
    }
  }

  if (doc && typeof URL?.createObjectURL === "function") {
    try {
      const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
      const a = doc.createElement("a");
      a.href = url;
      a.download = nombre;
      // Tiene que estar en el documento: un ancla suelta no dispara la
      // descarga en todos los navegadores.
      doc.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return "descargado";
    } catch {
      /* sigue al portapapeles */
    }
  }

  // Se comprueba que exista antes de usarlo: `await undefined` no falla, y sin
  // esto la función decía "copiado" sin haber copiado nada. Que es
  // exactamente el problema que vinimos a arreglar, una capa más abajo.
  const escribir = nav?.clipboard?.writeText;
  if (typeof escribir !== "function") return "error";
  try {
    await escribir.call(nav!.clipboard, contenido);
    return "copiado";
  } catch {
    return "error";
  }
}

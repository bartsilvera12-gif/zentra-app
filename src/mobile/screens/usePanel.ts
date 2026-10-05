/**
 * Los números del panel de inicio, sacados del ERP.
 *
 * Antes estaban escritos en el código: 1.248 ítems, 82% óptimo, 37 bajo mínimo,
 * Gs. 4.850.000 de ventas. Se veían bien y eran mentira. Alguien podía mirar el
 * teléfono y creer que vendió cinco millones.
 *
 * Mientras cargan no se muestra un número provisorio: se muestra que está
 * cargando. Y si el ERP falla, se dice que no se pudo. Un cero inventado es
 * indistinguible de un cero real.
 */
import { useEffect, useState } from "react";
import { repo } from "@/lib/repo";

export interface Panel {
  inventario: { total: number; bajoMinimo: number; agotados: number; pctOptimo: number } | null;
  ventas: { hoy: number; facturas: number; serie: number[]; deltaPct: number | null } | null;
  cargando: boolean;
  error: string | null;
}

/** `yyyy-mm-dd` en la hora del teléfono, que es la que el vendedor tiene en la cabeza. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Los últimos 7 días, de más viejo a hoy. */
function ultimos7(hoy: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() - (6 - i));
    return iso(d);
  });
}

export function usePanel(activo: boolean): Panel {
  const [p, setP] = useState<Panel>({ inventario: null, ventas: null, cargando: true, error: null });

  useEffect(() => {
    if (!activo) return;
    let vivo = true;

    (async () => {
      const hoy = new Date();
      const dias = ultimos7(hoy);

      // Por separado: que no haya ventas cargadas no es razón para esconder el
      // inventario, ni al revés.
      const [inv, ven] = await Promise.allSettled([
        repo.inventario.list(),
        repo.ventas.list({ desde: dias[0], hasta: dias[6] }),
      ]);
      if (!vivo) return;

      let inventario: Panel["inventario"] = null;
      if (inv.status === "fulfilled") {
        const prods = inv.value;
        const agotados = prods.filter((x) => x.stock <= 0).length;
        // Bajo mínimo es "le queda poco", no "no le queda": un agotado ya se
        // cuenta aparte y sumarlo en los dos lados abulta el problema.
        const bajoMinimo = prods.filter((x) => x.stock > 0 && x.minimo > 0 && x.stock <= x.minimo).length;
        const total = prods.length;
        inventario = {
          total,
          bajoMinimo,
          agotados,
          pctOptimo: total ? Math.round(((total - agotados - bajoMinimo) / total) * 100) : 0,
        };
      }

      let ventas: Panel["ventas"] = null;
      if (ven.status === "fulfilled") {
        const porDia = new Map(dias.map((d) => [d, 0]));
        let facturas = 0;
        for (const v of ven.value) {
          const d = (v.iso || v.fecha || "").slice(0, 10);
          if (!porDia.has(d)) continue;
          const monto = v.lineas.reduce((a, l) => a + l.precio * l.qty, 0);
          porDia.set(d, (porDia.get(d) ?? 0) + monto);
          if (d === dias[6]) facturas++;
        }
        const serie = dias.map((d) => porDia.get(d) ?? 0);
        const hoyTotal = serie[6];
        const ayer = serie[5];
        ventas = {
          hoy: hoyTotal,
          facturas,
          serie,
          // Sin nada ayer no hay porcentaje que calcular: "subió 100%" desde
          // cero no quiere decir nada.
          deltaPct: ayer > 0 ? Math.round(((hoyTotal - ayer) / ayer) * 100) : null,
        };
      }

      const fallo = inv.status === "rejected" && ven.status === "rejected";
      setP({
        inventario,
        ventas,
        cargando: false,
        error: fallo ? "No pudimos cargar los datos. Revisá tu conexión." : null,
      });
    })();

    return () => {
      vivo = false;
    };
  }, [activo]);

  return p;
}

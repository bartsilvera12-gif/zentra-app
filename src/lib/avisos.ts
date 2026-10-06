/**
 * El aviso de stock bajo el mínimo.
 *
 * Es una notificación **local**: la arma el teléfono, no el servidor. Esa es
 * la diferencia que importa y conviene tenerla clara:
 *
 *   - No hace falta que ningún ERP mande nada. Funciona igual con ERP propio
 *     y sin él, y no hay que pedirle a ningún cliente que agregue un webhook.
 *   - Sólo puede dispararse cuando la app está corriendo y acaba de leer el
 *     inventario. No va a avisar a las 3 de la mañana.
 *
 * O sea: sirve para enterarse al abrir la app o después de una venta, no para
 * reemplazar un aviso del servidor. Donde el ERP ya manda avisos de stock, los
 * suyos llegan igual por push y éste no estorba, porque se agrupa en una sola
 * notificación que se reemplaza a sí misma.
 */
import type { InvProducto } from "./types";

/** Los que están en el mínimo o por debajo, y no agotados hace rato. */
export function bajoMinimo(productos: InvProducto[]): InvProducto[] {
  return productos.filter((p) => p.minimo > 0 && p.stock <= p.minimo);
}

/**
 * El texto del aviso.
 *
 * Con un solo producto se lo nombra: "Cerveza lata 350 ml" dice mucho más que
 * "1 producto". Con varios no entran todos, así que va el número y el primero
 * como ejemplo.
 */
export function textoAviso(bajos: InvProducto[]): { titulo: string; cuerpo: string } | null {
  if (bajos.length === 0) return null;
  if (bajos.length === 1) {
    const p = bajos[0];
    return {
      titulo: "Stock bajo",
      cuerpo: `${p.nombre}: quedan ${p.stock} y el mínimo es ${p.minimo}.`,
    };
  }
  return {
    titulo: `${bajos.length} productos bajo el mínimo`,
    cuerpo: `${bajos[0].nombre} y ${bajos.length - 1} más.`,
  };
}

/**
 * Qué productos son novedad respecto de la última vez que se avisó.
 *
 * Sin esto, cada vez que se abre inventario sale el mismo aviso por los
 * mismos productos, y a la tercera vez nadie lo mira. Sólo se avisa cuando
 * cayó alguno que antes estaba bien.
 */
export function hayNovedad(bajos: InvProducto[], avisadosAntes: string[]): boolean {
  return bajos.some((p) => !avisadosAntes.includes(p.id));
}

const CLAVE = "zentra.avisadosStock";

export function leerAvisados(): string[] {
  try {
    const crudo = localStorage.getItem(CLAVE);
    const v = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function guardarAvisados(ids: string[]): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(ids));
  } catch {
    /* sin almacenamiento se avisa de más, que es mejor que no avisar */
  }
}

/**
 * Muestra el aviso si corresponde. Devuelve si lo mostró.
 *
 * Todo lo que puede fallar está adentro: sin el plugin —en el navegador— o sin
 * permiso, no pasa nada y la pantalla sigue andando. Un aviso que no se puede
 * dar nunca es motivo para romper el inventario.
 */
export async function avisarStockBajo(productos: InvProducto[]): Promise<boolean> {
  const bajos = bajoMinimo(productos);
  const antes = leerAvisados();

  // Lo que se recuperó sale de la lista, para que vuelva a avisar si cae otra vez.
  const ids = bajos.map((p) => p.id);
  guardarAvisados(ids);

  if (!hayNovedad(bajos, antes)) return false;
  const texto = textoAviso(bajos);
  if (!texto) return false;

  try {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (typeof cap?.isNativePlatform !== "function" || !cap.isNativePlatform()) return false;

    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const permiso = await LocalNotifications.checkPermissions();
    const ok =
      permiso.display === "granted" ? permiso : await LocalNotifications.requestPermissions();
    if (ok.display !== "granted") return false;

    await LocalNotifications.schedule({
      notifications: [
        {
          // Id fijo: el aviso nuevo reemplaza al anterior en vez de apilarse.
          // Diez avisos de stock en la barra no son diez noticias, es una.
          id: 1001,
          title: texto.titulo,
          body: texto.cuerpo,
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Carga una lista del backend que corresponda a la empresa activa.
 *
 * Las pantallas antes leían constantes del archivo de ejemplo. Se veían llenas
 * y mostraban clientes y productos que no existen en ninguna parte. Esto las
 * conecta a los datos de verdad y, cuando no hay, lo dice.
 *
 * Tres estados y ninguno se confunde con otro:
 *   cargando        todavía no se sabe
 *   error           se intentó y no se pudo — NO es "no hay"
 *   datos vacíos    se pudo, y no hay nada
 *
 * Esa distinción es el punto. Una lista vacía por un error de red se lee como
 * "no tengo clientes cargados", y alguien sale a vender creyendo eso.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface Remoto<T> {
  datos: T[];
  cargando: boolean;
  /** Mensaje para mostrar; null si salió bien. */
  error: string | null;
  /** Para el botón de reintentar. */
  recargar: () => void;
  /**
   * Vuelve a pedir los datos sin que se note.
   *
   * La diferencia con `recargar` es todo: `recargar` enciende `cargando` y la
   * pantalla se vacía un instante, que es lo correcto cuando alguien apretó un
   * botón, y es inaceptable cada diez segundos. Y si el pedido falla, éste se
   * queda con lo que ya estaba en pantalla en vez de borrarlo: una conversación
   * no se tiene que vaciar porque el teléfono pasó un segundo por un túnel.
   */
  refrescar: () => Promise<void>;
}

export function useRemoto<T>(cargar: () => Promise<T[]>, deps: unknown[] = []): Remoto<T> {
  const [datos, setDatos] = useState<T[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  // `cargar` suele venir como función nueva en cada render; las deps que
  // importan las declara quien llama.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fn = useCallback(cargar, deps);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    fn()
      .then((r) => {
        if (vivo) setDatos(r);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        // Los datos viejos se descartan: mostrarlos al lado de un error hace
        // creer que siguen vigentes.
        setDatos([]);
        const msg = e instanceof Error ? e.message : "";
        setError(msg || "No pudimos cargar los datos.");
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [fn, intento]);

  // La última versión de la función de carga, para que `refrescar` no quede
  // con la de cuando se montó la pantalla.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refrescar = useCallback(async () => {
    try {
      const r = await fnRef.current();
      setDatos(r);
      setError(null);
    } catch {
      // A propósito en silencio. Un refresco de fondo que falla no es una
      // noticia: lo que está en pantalla sigue siendo lo último que se supo, y
      // el próximo latido vuelve a intentar.
    }
  }, []);

  return { datos, cargando, error, recargar: () => setIntento((n) => n + 1), refrescar };
}

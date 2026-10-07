/**
 * Volver a pedir algo cada tanto, mientras la pantalla se esté mirando.
 *
 * El chat no se actualizaba solo: para ver un mensaje nuevo había que salir de
 * la conversación y volver a entrar. En una app de mensajes eso no es un
 * detalle, es la función.
 *
 * Lo importante de este hook es cuándo NO late:
 *
 *   - Con la app en segundo plano. Un teléfono en el bolsillo pidiendo al ERP
 *     cada ocho segundos gasta batería y datos de alguien, y multiplicado por
 *     todos los vendedores de todas las empresas le pega al ERP sin que nadie
 *     esté mirando.
 *   - Mientras el pedido anterior sigue en camino. Con señal mala los pedidos
 *     se encimarían y cada uno pisaría al anterior.
 *
 * Al volver del segundo plano pide una vez enseguida, sin esperar el intervalo:
 * el momento en que alguien vuelve a la app es justo cuando quiere ver lo que
 * se perdió.
 */
import { useEffect, useRef } from "react";

export function useLatido(fn: () => Promise<void>, ms: number, activo: boolean): void {
  // La función cambia en cada render; el intervalo no se tiene que rearmar por
  // eso, o con un render por tecla no llegaría a latir nunca.
  const ref = useRef(fn);
  ref.current = fn;

  useEffect(() => {
    if (!activo || ms <= 0) return;

    let corriendo = false;
    let parado = false;

    const latir = async () => {
      if (corriendo || parado) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      corriendo = true;
      try {
        await ref.current();
      } finally {
        corriendo = false;
      }
    };

    const id = setInterval(latir, ms);

    // Al volver a la app, una pedida inmediata.
    const alVolver = () => {
      if (document.visibilityState === "visible") void latir();
    };
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      parado = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [ms, activo]);
}

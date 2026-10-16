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
import { esNativo } from "@/lib/nativo";
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
    /**
     * Si la app está adelante.
     *
     * Arranca en `true` a propósito: si el estado no se puede saber, latir de
     * más es molesto y no latir nunca deja el chat quieto, que es el problema
     * que este hook existe para resolver.
     *
     * Y por eso adentro del APK se pregunta al plugin y NO a
     * `document.visibilityState`: el WebView de Android lo reporta `hidden` en
     * situaciones en que la app está perfectamente adelante —cambio de
     * actividad, teclado, una notificación que pasa— y ahí el latido se
     * apagaba y no volvía a arrancar hasta reabrir la app.
     */
    let adelante = true;

    const latir = async () => {
      if (corriendo || parado || !adelante) return;
      corriendo = true;
      try {
        await ref.current();
      } finally {
        corriendo = false;
      }
    };

    const id = setInterval(latir, ms);
    const soltar: (() => void)[] = [];

    if (esNativo()) {
      void import("@capacitor/app").then(({ App }) => {
        if (parado) return;
        void App.getState().then((e) => {
          adelante = e.isActive;
        });
        void App.addListener("appStateChange", (e) => {
          adelante = e.isActive;
          // Al volver a la app, una pedida inmediata.
          if (e.isActive) void latir();
        }).then((sub) => {
          if (parado) void sub.remove();
          else soltar.push(() => void sub.remove());
        });
      });
    } else if (typeof document !== "undefined") {
      adelante = document.visibilityState !== "hidden";
      const alCambiar = () => {
        adelante = document.visibilityState !== "hidden";
        if (adelante) void latir();
      };
      document.addEventListener("visibilitychange", alCambiar);
      soltar.push(() => document.removeEventListener("visibilitychange", alCambiar));
    }

    return () => {
      parado = true;
      clearInterval(id);
      for (const q of soltar) q();
    };
  }, [ms, activo]);
}

/**
 * Hacer algo cuando la app vuelve al frente.
 *
 * Existe por el pago. Pagar un plan pasa afuera de la app: se abre el
 * navegador, se paga, y se vuelve. Hasta ahora, al volver, la app seguía
 * creyendo lo que había leído al entrar —el plan viejo, la fecha de
 * vencimiento vieja— y la única forma de ver lo que acababa de pagar era
 * cerrar sesión y entrar de nuevo. Alguien que acaba de pagar no tiene por qué
 * saber eso, y lo razonable es pensar que el pago no entró.
 *
 * Adentro del APK el aviso lo da Capacitor. En el navegador,
 * `visibilitychange`, que es lo mismo visto desde la web: cambiar de pestaña y
 * volver. El WebView de Android también dispara `visibilitychange`, pero no
 * siempre y no cuando uno espera —de ahí que en nativo se use el plugin y no
 * el evento—.
 *
 * Devuelve la función para desuscribirse. Se puede llamar antes de que el
 * plugin termine de cargar: si eso pasa, la suscripción se cancela apenas
 * llega.
 */
import { esNativo } from "./nativo";

export function alVolver(hacer: () => void): () => void {
  let cortado = false;
  const soltar: (() => void)[] = [];

  if (esNativo()) {
    void import("@capacitor/app").then(({ App }) => {
      if (cortado) return;
      void App.addListener("appStateChange", (e) => {
        if (e.isActive) hacer();
      }).then((sub) => {
        if (cortado) void sub.remove();
        else soltar.push(() => void sub.remove());
      });
    });
  } else if (typeof document !== "undefined") {
    const alCambiar = () => {
      if (document.visibilityState !== "hidden") hacer();
    };
    document.addEventListener("visibilitychange", alCambiar);
    soltar.push(() => document.removeEventListener("visibilitychange", alCambiar));
  }

  return () => {
    cortado = true;
    for (const q of soltar) q();
    soltar.length = 0;
  };
}

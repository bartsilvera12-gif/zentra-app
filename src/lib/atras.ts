/**
 * El botón "atrás" de Android.
 *
 * Sin esto, el gesto de volver cierra la app desde cualquier pantalla: estás
 * mirando un cliente, volvés por costumbre, y te saca afuera. En Android es el
 * gesto más usado que existe, así que la app se sentía rota.
 *
 * Lo que hace ahora, en orden:
 *   1. Si hay una subpantalla abierta (un detalle, un formulario), la cierra.
 *   2. Si no, vuelve al inicio.
 *   3. Desde el inicio, manda la app al fondo en vez de cerrarla, que es lo
 *      que hace cualquier app de Android: volver a abrirla la encuentra donde
 *      estaba.
 *
 * En el login no se intercepta: ahí sí corresponde salir.
 */
import type { AppState } from "@/store/state";

/** Un cambio parcial del estado, como lo toma `set`. */
type Parche = Partial<AppState>;

/**
 * Qué hacer con el "atrás" según dónde esté parado el usuario.
 * Devuelve el cambio de estado, o `"fondo"` para mandar la app al fondo.
 *
 * Es una función aparte de Capacitor para poder probarla sin un celular.
 */
export function decidirAtras(s: AppState): Parche | "fondo" {
  if (s.screen === "login") return "fondo";

  // Cada módulo con subpantallas vuelve a su lista antes de salir del módulo.
  const subs: [keyof AppState, string, Parche][] = [
    ["cSub", "lista", { cSub: "lista", cSel: null }],
    ["kSub", "lista", { kSub: "lista", kSel: null }],
    ["iSub", "lista", { iSub: "lista", iSel: null }],
    ["vwSub", "lista", { vwSub: "lista", vwSel: null }],
    ["xSub", "lista", { xSub: "lista", xSel: null }],
    ["dvSub", "lista", { dvSub: "lista", dvSel: null }],
  ];
  for (const [campo, base, patch] of subs) {
    if (s[campo] !== undefined && s[campo] !== base) return patch;
  }

  if (s.screen !== "home") return { screen: "home" };
  return "fondo";
}

/**
 * Conecta el botón físico. Devuelve una función para desconectarlo.
 * Fuera del APK no hace nada: en el navegador el botón es el del navegador.
 */
export async function conectarAtras(
  leer: () => AppState,
  aplicar: (p: Parche) => void,
): Promise<() => void> {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (typeof cap?.isNativePlatform !== "function" || !cap.isNativePlatform()) {
    return () => {};
  }
  const { App } = await import("@capacitor/app");
  const sub = await App.addListener("backButton", () => {
    const r = decidirAtras(leer());
    if (r === "fondo") {
      // minimizeApp, no exitApp: cerrar la app pierde el carrito a medio
      // armar, y nadie espera que "atrás" borre lo que estaba cargando.
      void App.minimizeApp();
      return;
    }
    aplicar(r);
  });
  return () => void sub.remove();
}

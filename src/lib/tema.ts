/**
 * El tema: el del sistema, o el que la persona haya elegido.
 *
 * La app arranca siguiendo al teléfono. El interruptor "Seguir al sistema"
 * existía en Configuración pero no hacía nada: era un switch decorativo, que es
 * peor que no tenerlo —alguien lo apaga, no cambia nada, y deja de confiar en
 * el resto de la pantalla—.
 *
 * Elegir un tema a mano apaga el seguimiento, que es lo que esa elección
 * quiere decir. Y la preferencia se guarda: alguien que eligió oscuro no tiene
 * que volver a elegirlo cada vez que abre la app.
 */
import type { ThemeName } from "./types";

const KEY = "zentra_tema_v1";

export interface PreferenciaTema {
  /** Seguir al sistema. Cuando es true, `tema` se ignora. */
  auto: boolean;
  tema: ThemeName;
}

/** Lo que el teléfono tiene puesto ahora. */
export function temaDelSistema(): ThemeName {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
  } catch {
    // Sin `matchMedia` —un WebView viejo— se asume claro, que es lo que la
    // mayoría tiene y lo que menos sorprende.
    return "claro";
  }
}

/**
 * Avisa cuando el sistema cambia de tema, mientras la app está abierta.
 * Devuelve la función para dejar de escuchar.
 */
export function escucharTemaDelSistema(cuando: (t: ThemeName) => void): () => void {
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = (e: MediaQueryListEvent) => cuando(e.matches ? "oscuro" : "claro");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  } catch {
    return () => {};
  }
}

/** Lo guardado, o seguir al sistema si no hay nada. */
export function leerPreferencia(): PreferenciaTema {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { auto: true, tema: temaDelSistema() };
    const p = JSON.parse(raw) as Partial<PreferenciaTema>;
    const tema: ThemeName = p.tema === "oscuro" ? "oscuro" : "claro";
    // `auto` ausente se trata como true: es el valor con el que se arranca.
    return { auto: p.auto !== false, tema };
  } catch {
    return { auto: true, tema: temaDelSistema() };
  }
}

export function guardarPreferencia(p: PreferenciaTema): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Sin persistencia la app anda igual: vuelve a seguir al sistema.
  }
}

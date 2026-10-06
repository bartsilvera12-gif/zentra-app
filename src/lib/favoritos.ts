/**
 * Los emojis que cada uno marcó como favoritos.
 *
 * Vive en el teléfono y no en el ERP: es una preferencia de quien usa la app,
 * no un dato de la empresa. Mandarlo al servidor sería pedirle a cada cliente
 * que guarde algo que no le importa.
 *
 * Todo pasa por try/catch: en una ventana privada o con el almacenamiento
 * bloqueado, leerlo tira excepción. Sin favoritos la bandeja funciona igual, y
 * eso es mejor que una pantalla que no abre.
 */
const CLAVE = "zentra.favoritos";

export function leerFavoritos(): string[] {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return [];
    const v = JSON.parse(crudo);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function guardarFavoritos(lista: string[]): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento se pierden al cerrar, y es aceptable */
  }
}

/** Agrega o saca, y devuelve la lista nueva. */
export function alternarFavorito(lista: string[], emoji: string): string[] {
  return lista.includes(emoji) ? lista.filter((e) => e !== emoji) : [...lista, emoji];
}

/** Los favoritos primero, sin repetir. */
export function ordenarPorFavoritos(todos: string[], favoritos: string[]): string[] {
  const fav = favoritos.filter((f) => todos.includes(f));
  return [...fav, ...todos.filter((e) => !fav.includes(e))];
}

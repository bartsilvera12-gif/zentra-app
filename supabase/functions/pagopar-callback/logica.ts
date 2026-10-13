/**
 * Lo que decide qué hacer con un aviso de Pagopar.
 *
 * Vive aparte del `index.ts` para poder probarlo sin levantar nada: acá no hay
 * red, ni base, ni Deno. Entra el cuerpo del aviso, sale una decisión.
 *
 * Todo lo de este archivo corre también en Node, así que las pruebas lo
 * importan tal cual. `crypto.subtle` es estándar en los dos.
 */

/** Una fila del `resultado` que manda Pagopar. */
export interface AvisoPagopar {
  pagado?: boolean;
  cancelado?: boolean;
  hash_pedido?: string;
  monto?: string | number;
  token?: string;
  forma_pago?: string;
  fecha_pago?: string | null;
  [k: string]: unknown;
}

export type Decision =
  | { tipo: "registrar"; hash: string; monto: number }
  /** Llegó bien pero no hay nada que hacer: todavía no se pagó, o se canceló. */
  | { tipo: "ignorar"; porque: string }
  /** No viene de Pagopar, o viene roto. */
  | { tipo: "rechazar"; porque: string };

/** SHA1 en hexadecimal, que es como firma Pagopar. */
export async function sha1(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-1", datos);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compara dos tokens sin filtrar cuánto coinciden por el tiempo que tarda.
 *
 * Una comparación normal corta en la primera letra distinta, y eso deja
 * adivinar el token de a un carácter midiendo la demora. Con 40 caracteres
 * hexadecimales es un ataque lento pero real, y la alternativa cuesta tres
 * líneas.
 */
export function igualSinFiltrar(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/** El primer elemento de `resultado`, que es donde viene todo. */
export function primerAviso(cuerpo: unknown): AvisoPagopar | null {
  if (!cuerpo || typeof cuerpo !== "object") return null;
  const r = (cuerpo as { resultado?: unknown }).resultado;
  if (Array.isArray(r)) return (r[0] as AvisoPagopar) ?? null;
  // Algún proveedor manda el objeto suelto; no cuesta nada aceptarlo.
  if (r && typeof r === "object") return r as AvisoPagopar;
  return null;
}

/** El monto, venga como número o como texto. */
export function montoDe(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Qué hacer con un aviso.
 *
 * El orden importa: primero se verifica que venga de Pagopar y recién después
 * se mira qué dice. Un aviso sin firmar no merece que lo leamos.
 */
export async function decidir(cuerpo: unknown, clavePrivada: string): Promise<Decision> {
  const aviso = primerAviso(cuerpo);
  if (!aviso) return { tipo: "rechazar", porque: "cuerpo sin resultado" };

  const hash = typeof aviso.hash_pedido === "string" ? aviso.hash_pedido.trim() : "";
  if (!hash) return { tipo: "rechazar", porque: "sin hash_pedido" };

  const token = typeof aviso.token === "string" ? aviso.token.trim().toLowerCase() : "";
  if (!token) return { tipo: "rechazar", porque: "sin token" };

  const esperado = await sha1(clavePrivada + hash);
  if (!igualSinFiltrar(token, esperado)) {
    return { tipo: "rechazar", porque: "token que no corresponde" };
  }

  // Desde acá sabemos que es Pagopar.

  if (aviso.cancelado === true) return { tipo: "ignorar", porque: "pedido cancelado" };

  // Una reversión llega con `pagado: false` sobre un pedido que ya estaba
  // pago. NO se devuelve el mes acá: quitarle el acceso a alguien de golpe,
  // desde un webhook, es una decisión demasiado grande para tomarla sola.
  // Queda anotado en el log y se resuelve a mano.
  if (aviso.pagado !== true) return { tipo: "ignorar", porque: "todavía no está pago" };

  const monto = montoDe(aviso.monto);
  if (monto === null || monto <= 0) return { tipo: "rechazar", porque: "monto ilegible" };

  return { tipo: "registrar", hash, monto };
}

/**
 * Lo que hay que contestarle a Pagopar.
 *
 * Pide que se le devuelva el mismo `resultado` que mandó, tal cual. Si no
 * recibe eso con un 200, reintenta cada 10 minutos para siempre.
 */
export function respuestaParaPagopar(cuerpo: unknown): string {
  const r = (cuerpo as { resultado?: unknown })?.resultado;
  return JSON.stringify(r ?? []);
}

/**
 * Armar el pedido que se le manda a Pagopar.
 *
 * Igual que en el callback, esto no toca red ni base: entra lo que sabemos,
 * sale el cuerpo del pedido y su firma. Así se puede probar sin levantar nada.
 */

export interface Comprador {
  nombre: string;
  email: string;
  /** Cédula o RUC. Pagopar lo exige. */
  documento: string;
  telefono?: string;
  ruc?: string;
  razonSocial?: string;
}

export interface PedidoNuevo {
  referencia: string;
  montoTotal: number;
  plan: string;
  nombrePlan: string;
  comprador: Comprador;
  /** Hasta cuándo se puede pagar. Pasado eso, Pagopar lo cancela. */
  vencePago: Date;
}

export async function sha1(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-1", datos);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * El monto, escrito como lo espera la firma.
 *
 * Pagopar documenta el token como `sha1(clave . idPedido . strval(floatval($monto)))`.
 * Eso en PHP convierte `"150000"` en `150000.0` y después en `"150000"` —sin
 * decimales, sin separadores—, y `150000.50` en `"150000.5"`, con un solo
 * decimal. `String(Number(x))` hace exactamente lo mismo.
 *
 * Parece un detalle y es la causa número uno de que Pagopar conteste "token
 * inválido": basta mandar `"150000.00"` para que la firma no coincida.
 */
export function montoParaToken(monto: number): string {
  return String(Number(monto));
}

export async function tokenDePedido(
  clavePrivada: string,
  referencia: string,
  monto: number,
): Promise<string> {
  return sha1(clavePrivada + referencia + montoParaToken(monto));
}

/** `2026-11-13 14:30:00`, que es el formato que pide Pagopar. */
export function fechaPagopar(f: Date): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return (
    `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())} ` +
    `${dos(f.getHours())}:${dos(f.getMinutes())}:${dos(f.getSeconds())}`
  );
}

/**
 * El cuerpo de `iniciar-transaccion`.
 *
 * Varios campos van vacíos o con valores fijos a propósito: `ciudad: 1` y
 * `categoria: 909` son lo que Pagopar indica para los comercios que no usan su
 * servicio de envíos, y nosotros vendemos una suscripción, no una caja.
 */
export async function cuerpoDePedido(
  p: PedidoNuevo,
  clavePublica: string,
  clavePrivada: string,
): Promise<Record<string, unknown>> {
  return {
    token: await tokenDePedido(clavePrivada, p.referencia, p.montoTotal),
    public_key: clavePublica,
    monto_total: p.montoTotal,
    tipo_pedido: "VENTA-COMERCIO",
    fecha_maxima_pago: fechaPagopar(p.vencePago),
    id_pedido_comercio: p.referencia,
    descripcion_resumen: `Zentra ${p.nombrePlan} · 1 mes`,
    comprador: {
      ruc: p.comprador.ruc ?? "",
      email: p.comprador.email,
      ciudad: 1,
      nombre: p.comprador.nombre,
      telefono: p.comprador.telefono ?? "",
      direccion: "",
      documento: p.comprador.documento,
      coordenadas: "",
      razon_social: p.comprador.razonSocial ?? "",
      direccion_referencia: "",
      tipo_documento: "CI",
    },
    compras_items: [
      {
        ciudad: 1,
        nombre: `Plan ${p.nombrePlan}`,
        descripcion: "Suscripción mensual a Zentra",
        cantidad: 1,
        categoria: 909,
        public_key: clavePublica,
        url_imagen: "",
        id_producto: p.plan,
        // Es el total de la línea, no el precio unitario.
        precio_total: p.montoTotal,
        vendedor_telefono: "",
        vendedor_direccion: "",
        vendedor_direccion_referencia: "",
        vendedor_direccion_coordenadas: "",
      },
    ],
  };
}

export type RespuestaPedido =
  | { ok: true; hash: string }
  | { ok: false; error: string };

/**
 * Lee lo que contestó Pagopar.
 *
 * El éxito viene como `{ respuesta: true, resultado: [{ data: "<hash>" }] }`, y
 * el error como `respuesta: false` con `resultado` siendo un texto. Son dos
 * formas distintas para el mismo campo, así que hay que mirar las dos.
 */
export function leerRespuesta(json: unknown): RespuestaPedido {
  if (!json || typeof json !== "object") return { ok: false, error: "respuesta ilegible" };
  const o = json as { respuesta?: unknown; resultado?: unknown };

  if (o.respuesta !== true) {
    const r = o.resultado;
    const motivo = typeof r === "string" ? r : Array.isArray(r) ? String(r[0] ?? "") : "";
    return { ok: false, error: motivo || "Pagopar rechazó el pedido" };
  }

  const fila = Array.isArray(o.resultado) ? o.resultado[0] : o.resultado;
  const hash = (fila as { data?: unknown } | null)?.data;
  if (typeof hash !== "string" || !hash.trim()) {
    // Sin hash no hay a dónde mandar a pagar. Mejor fallar acá que devolver
    // una URL rota.
    return { ok: false, error: "Pagopar no devolvió el identificador del pedido" };
  }
  return { ok: true, hash: hash.trim() };
}

/** A dónde se manda a la persona a pagar. */
export function urlDePago(hash: string): string {
  return `https://www.pagopar.com/pagos/${hash}`;
}

/** Qué le falta al comprador para que Pagopar acepte el pedido. */
export function faltaDelComprador(c: Partial<Comprador>): string[] {
  const falta: string[] = [];
  if (!c.nombre?.trim()) falta.push("el nombre");
  if (!c.email?.trim()) falta.push("el correo");
  if (!c.documento?.trim()) falta.push("la cédula o el RUC");
  return falta;
}

import type { AppState } from "@/store/state";

/**
 * El armado de venta en blanco: sin cliente, sin productos, sin cobro.
 *
 * Lo usan la venta y el presupuesto, que comparten los mismos pasos. Está en
 * un solo lugar porque cada campo que se olvida de limpiar es algo de la venta
 * anterior que aparece en la siguiente: ya pasó con el número del comprobante
 * y con el aviso de la impresora.
 */
export const ARMADO_VACIO: Partial<AppState> = {
  vPaso: "cliente",
  vCliente: null,
  vSinNombre: false,
  vCart: {},
  vIva: {},
  vMetodo: null,
  vCredito: false,
  vQuery: "",
  vQCliente: "",
  vVenta: null,
  vErrorAlta: "",
  vValidez: 15,
  vNotas: "",
  vDePresupuesto: null,
  vPrecio: {},
  impAviso: "",
  impAvisoGrave: false,
};

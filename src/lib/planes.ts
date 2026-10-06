/**
 * Los planes de suscripción y qué deja hacer cada uno.
 *
 * Tres reglas de negocio que vale la pena tener a la vista, porque explican
 * casi todo lo que hay acá abajo:
 *
 *   1. Quien conecta su propio ERP no tiene plan: tiene todo. Los planes son
 *      para quien usa Zentra sola, con los datos guardados del lado nuestro.
 *   2. Al vencer, lo cargado se sigue viendo. Lo que se bloquea es escribir.
 *      Alguien con 200 productos que cae a Free sigue viendo los 200: no puede
 *      editarlos ni cargar el 201. Son datos suyos.
 *   3. Por lo anterior, "¿puede?" no es una sola pregunta. Leer siempre se
 *      puede; lo que se consulta acá es si puede escribir.
 *
 * Nada de esto viaja a ningún ERP. El plan vive en el directorio de empresas,
 * que es nuestro, así que agregar planes no obliga a tocar el sistema de
 * ningún cliente.
 */

export type Plan = "free" | "emprendedor" | "max";

/** Lo que una pantalla puede querer hacer y el plan puede negar. */
export type Accion =
  | "inventario.alta"
  | "inventario.editar"
  | "inventario.ajuste"
  | "inventario.categoria"
  | "inventario.barras"
  | "inventario.minimo"
  | "inventario.mayorista"
  | "inventario.vencimiento"
  | "ventas.credito"
  | "compras.modulo"
  | "compras.dolares"
  | "compras.nuevoProveedor"
  | "proveedores.modulo"
  | "proveedores.alta"
  | "proveedores.editar"
  | "chat.modulo"
  | "dashboard.inventario"
  | "dashboard.compras"
  | "facturacion.autoImpresor"
  | "facturacion.electronica";

interface Limites {
  /** Máximo de productos cargados. `null` es sin tope. */
  productos: number | null;
  /**
   * Días que tienen que pasar entre dos ajustes de stock del mismo producto.
   * `null` es sin espera.
   *
   * El plan dice "1 vez al mes, reset el día 1". Se guarda como días y no como
   * "una vez por mes calendario" porque un ajuste el 31 y otro el 1 serían dos
   * meses distintos con horas de diferencia, y eso no es lo que se vendió.
   */
  esperaAjusteDias: number | null;
}

interface DefinicionPlan {
  nombre: string;
  precioMensual: number;
  limites: Limites;
  permite: ReadonlySet<Accion>;
}

const FREE: Accion[] = ["inventario.alta", "inventario.ajuste"];

const EMPRENDEDOR: Accion[] = [
  ...FREE,
  "compras.modulo",
  "proveedores.modulo",
  "proveedores.alta",
  "dashboard.compras",
  "facturacion.autoImpresor",
  "inventario.categoria",
];

const MAX: Accion[] = [
  ...EMPRENDEDOR,
  "inventario.editar",
  "inventario.barras",
  "inventario.minimo",
  "inventario.mayorista",
  "inventario.vencimiento",
  "ventas.credito",
  "compras.dolares",
  "compras.nuevoProveedor",
  "proveedores.editar",
  "chat.modulo",
  "dashboard.inventario",
  "facturacion.electronica",
];

export const PLANES: Record<Plan, DefinicionPlan> = {
  free: {
    nombre: "Básico",
    precioMensual: 0,
    limites: { productos: 20, esperaAjusteDias: 30 },
    permite: new Set(FREE),
  },
  emprendedor: {
    nombre: "Emprendedor",
    precioMensual: 49000,
    limites: { productos: 50, esperaAjusteDias: 30 },
    permite: new Set(EMPRENDEDOR),
  },
  max: {
    nombre: "Max",
    precioMensual: 89000,
    limites: { productos: null, esperaAjusteDias: null },
    permite: new Set(MAX),
  },
};

/** Lo que hay que saber para decidir. Lo arma la pantalla con lo que tiene. */
export interface Contexto {
  /**
   * La empresa tiene ERP propio. Es la primera pregunta y la que corta: con
   * ERP no hay plan que consultar.
   */
  conErp: boolean;
  plan: Plan;
  /** Productos ya cargados, para el tope. Sólo hace falta en `inventario.alta`. */
  productos?: number;
  /** Cuándo se ajustó por última vez ese producto, en ISO. Para el cooldown. */
  ultimoAjuste?: string | null;
  /** Hoy, para poder probar el cooldown sin esperar un mes. */
  ahora?: Date;
}

/** Por qué no se puede, listo para mostrar. `null` cuando sí se puede. */
export type Motivo = string | null;

/**
 * Si se puede escribir, y si no, por qué.
 *
 * Devuelve el motivo en vez de un booleano a propósito: la pantalla tiene que
 * poder decir *por qué* el botón está apagado. Un botón gris sin explicación
 * hace que la persona crea que la app se rompió.
 */
export function motivoBloqueo(accion: Accion, ctx: Contexto): Motivo {
  // Regla 1: con ERP, todo.
  if (ctx.conErp) return null;

  const def = PLANES[ctx.plan];

  if (!def.permite.has(accion)) {
    return `Tu plan ${def.nombre} no incluye esto.`;
  }

  if (accion === "inventario.alta" && def.limites.productos !== null) {
    const cargados = ctx.productos ?? 0;
    if (cargados >= def.limites.productos) {
      return `Llegaste a ${def.limites.productos} productos, el tope del plan ${def.nombre}.`;
    }
  }

  if (accion === "inventario.ajuste" && def.limites.esperaAjusteDias !== null && ctx.ultimoAjuste) {
    const faltan = diasQueFaltan(ctx.ultimoAjuste, def.limites.esperaAjusteDias, ctx.ahora);
    if (faltan > 0) {
      return faltan === 1
        ? "Ya ajustaste este producto este mes. Podés volver mañana."
        : `Ya ajustaste este producto este mes. Faltan ${faltan} días.`;
    }
  }

  return null;
}

/** Atajo para cuando sólo importa si se puede. */
export function puedeEscribir(accion: Accion, ctx: Contexto): boolean {
  return motivoBloqueo(accion, ctx) === null;
}

/**
 * Cuántos días faltan para poder ajustar de nuevo.
 *
 * Una fecha ilegible se trata como "nunca se ajustó": ante la duda, dejar
 * trabajar. El plan es un límite comercial, no una medida de seguridad, y
 * trabar a alguien por un dato mal guardado es peor que dejarlo pasar.
 */
function diasQueFaltan(ultimoIso: string, espera: number, ahora = new Date()): number {
  const ultimo = new Date(ultimoIso);
  if (isNaN(ultimo.getTime())) return 0;
  const transcurridos = Math.floor((ahora.getTime() - ultimo.getTime()) / 86400000);
  return Math.max(espera - transcurridos, 0);
}

/**
 * Cuántos productos más entran.
 *
 * Para mostrar "12 de 20" en la pantalla: el tope avisa antes de llegar, y no
 * de golpe cuando ya no se puede.
 */
export function cupoProductos(ctx: Contexto): { usados: number; tope: number | null } {
  const tope = ctx.conErp ? null : PLANES[ctx.plan].limites.productos;
  return { usados: ctx.productos ?? 0, tope };
}

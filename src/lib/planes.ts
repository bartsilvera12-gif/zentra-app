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
  /**
   * Sacar el comprobante por impresora. Es lo que la hoja de planes vende como
   * "facturación con auto-impresor", y la consulta `DetVentasScreen` antes de
   * abrir la impresión del sistema.
   *
   * Estuvo declarada un buen rato sin que nadie la mirara: la facturación no
   * estaba gateada en ningún lado, así que el plan Gratis imprimía igual. Una
   * acción que existe y nadie consulta es peor que no tenerla, porque parece
   * que la regla está puesta.
   */
  | "facturacion.autoImpresor"
  /**
   * Factura electrónica (la de la DNIT). No la consulta nadie, y está bien así
   * hasta que haya qué gatear: la app no emite ningún documento electrónico ni
   * habla con la DNIT. Colgarla de la impresión o de la vista de factura sería
   * inventarle un lugar y hacer creer que la emisión existe y que es cuestión
   * de pagar Max.
   */
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
  limites: Limites;
  permite: ReadonlySet<Accion>;
  /**
   * Lo que suma este plan, en castellano, para la hoja de planes.
   *
   * Escrito a mano y no generado de `permite`: ahí los nombres son de código
   * —"inventario.mayorista"— y lo que hay que leer es qué cambia en el día a
   * día. Sale de docs/PLANES.md.
   */
  resumen: string[];
}

/** De menos a más: el orden en que se muestran. */
export const ORDEN_PLANES: Plan[] = ["free", "emprendedor", "max"];

/**
 * El precio NO está acá, y lo que incluye cada plan está en docs/PLANES.md.
 *
 * El precio estuvo acá, no lo usaba nadie, y decía 49.000 y 89.000 mientras la
 * base decía 80.000 y 150.000. Los correctos eran estos —coinciden con la
 * documentación de planes— pero igual no van en el código: el que se cobra es
 * el de `zentra.planes`, que es de donde lo lee el server, y un precio en dos
 * lugares es un precio que en algún momento dice dos cosas distintas.
 */

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
    // "Gratis", que es como se llama en `zentra.planes` y como se lo ve en la
    // página de pago. Decía "Básico" sólo acá, y el mismo plan terminaba con
    // dos nombres según dónde lo leyeras.
    nombre: "Gratis",
    limites: { productos: 20, esperaAjusteDias: 30 },
    permite: new Set(FREE),
    resumen: ["Inventario hasta 20 productos", "Ventas al contado", "Dashboard de ventas"],
  },
  emprendedor: {
    nombre: "Emprendedor",
    limites: { productos: 50, esperaAjusteDias: 30 },
    permite: new Set(EMPRENDEDOR),
    resumen: [
      "Inventario hasta 50 productos",
      "Compras y proveedores",
      "Dashboard de compras",
      "Facturación con auto-impresor",
    ],
  },
  max: {
    nombre: "Max",
    limites: { productos: null, esperaAjusteDias: null },
    permite: new Set(MAX),
    resumen: [
      "Inventario sin tope y sin espera",
      "Chat de WhatsApp",
      "Ventas a crédito y compras en dólares",
      "Stock mínimo, código de barras y vencimiento",
      "Factura electrónica",
    ],
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
  /**
   * Hasta cuándo está pago el plan, en ISO corto (`2026-11-13`).
   *
   * Vacío o ausente es "sin vencimiento": la empresa no tiene suscripción que
   * controlar y no se le bloquea nada por esto. Sólo se carga cuando hay una
   * suscripción de verdad.
   */
  vence?: string | null;
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

  const vencioEl = fechaVencida(ctx.vence, ctx.ahora);
  // Regla 2: vencido se comporta como Free. Lo cargado se sigue viendo —de eso
  // no se ocupa esta función, que sólo habla de escribir— pero no se puede
  // tocar más de lo que el plan gratis permite.
  const def = PLANES[vencioEl ? "free" : ctx.plan];

  if (!def.permite.has(accion)) {
    // El motivo tiene que decir la verdad. "Tu plan Free no incluye esto" a
    // alguien que pagó Max el mes pasado es desconcertante y hace pensar que
    // la app se equivocó; lo que pasó es que se le venció y tiene arreglo.
    return vencioEl
      ? `Tu plan venció el ${enCriollo(vencioEl)}. Seguís viendo todo lo cargado, pero para editar o cargar hay que renovar.`
      : `Tu plan ${def.nombre} no incluye esto.`;
  }

  if (accion === "inventario.alta" && def.limites.productos !== null) {
    const cargados = ctx.productos ?? 0;
    if (cargados >= def.limites.productos) {
      // Quien venció con 200 productos cargados ve el tope de Free, que ya
      // superó hace rato. Decirle "llegaste a 20" sería absurdo.
      return vencioEl
        ? `Tu plan venció el ${enCriollo(vencioEl)}. Para cargar más productos hay que renovar.`
        : `Llegaste a ${def.limites.productos} productos, el tope del plan ${def.nombre}.`;
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

/**
 * Si el plan está vencido, y desde cuándo.
 *
 * Devuelve la fecha de vencimiento cuando ya pasó, y `null` cuando no. Que
 * devuelva la fecha y no un booleano es para poder decirla en el mensaje:
 * "venció el 13 de noviembre" se entiende, "tu plan venció" deja pensando.
 *
 * Tres casos se tratan como NO vencido, y los tres por la misma razón:
 *
 *   - sin fecha      la empresa no tiene suscripción que controlar
 *   - fecha ilegible un dato mal cargado de nuestro lado
 *   - hoy mismo      el día que vence todavía se puede trabajar
 *
 * El plan es un límite comercial, no una medida de seguridad. Dejar trabajar a
 * alguien de más por un dato roto es un problema nuestro; trabar a alguien que
 * pagó es un problema suyo, y bastante peor.
 */
export function fechaVencida(vence: string | null | undefined, ahora?: Date): string | null {
  if (!vence) return null;
  const limite = new Date(vence);
  if (isNaN(limite.getTime())) return null;
  // Se compara por día, no por instante: alguien que vence el 13 trabaja todo
  // el 13, no hasta la hora en que se grabó la fecha.
  const hoy = ahora ?? new Date();
  const d = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  return d(hoy) > d(limite) ? vence : null;
}

/**
 * Cuántos días faltan para que venza. Negativo si ya venció, `null` sin fecha.
 *
 * Es lo que decide si hay que avisar y con qué texto.
 */
export function diasParaVencer(vence: string | null | undefined, ahora?: Date): number | null {
  if (!vence) return null;
  const limite = new Date(vence);
  if (isNaN(limite.getTime())) return null;
  const hoy = ahora ?? new Date();
  const d = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  return Math.round((d(limite) - d(hoy)) / 86400000);
}

/** El plan que rige de verdad: el contratado, o Free si venció. */
export function planEfectivo(plan: Plan, vence?: string | null, ahora?: Date): Plan {
  return fechaVencida(vence, ahora) ? "free" : plan;
}

/** `2026-11-13` → `13/11/2026`, para decirlo en un mensaje. */
function enCriollo(iso: string): string {
  const f = new Date(iso);
  if (isNaN(f.getTime())) return iso;
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(f.getDate())}/${dos(f.getMonth() + 1)}/${f.getFullYear()}`;
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

/**
 * Qué mostrar en la pantalla de suscripción.
 *
 * Tres estados y ninguno más: con ERP no hay nada que decir, vencido es
 * urgente, y al día es informativo. La pantalla no decide nada —sólo dibuja lo
 * que esto devuelve— para que el texto que lee alguien que pagó ayer y el que
 * lee alguien que no paga hace un mes estén decididos en el mismo lugar.
 */
export function estadoDeSuscripcion(ctx: {
  conErp: boolean;
  plan: Plan;
  vence: string | null | undefined;
  ahora?: Date;
}): { plan: string; estado: string; detalle: string; urgente: boolean } | null {
  if (ctx.conErp) return null;

  const def = PLANES[ctx.plan];
  const dias = diasParaVencer(ctx.vence, ctx.ahora);

  // Sin fecha: nunca pagó. No es un error ni una deuda, es el plan gratis.
  if (dias === null) {
    return ctx.plan === "free"
      ? {
          plan: def.nombre,
          estado: "Gratis, sin vencimiento",
          detalle: "Pagando un plan se habilitan compras, reportes y el resto de los módulos.",
          urgente: false,
        }
      : {
          plan: def.nombre,
          estado: "Sin fecha de vencimiento",
          detalle: "Tu plan está activo. Si creés que esto no es correcto, escribinos.",
          urgente: false,
        };
  }

  if (dias < 0) {
    const d = Math.abs(dias);
    return {
      plan: def.nombre,
      estado: d === 1 ? "Venció ayer" : `Venció hace ${d} días`,
      // Lo que importa no es que venció: es qué se puede seguir haciendo. Nadie
      // pierde lo cargado, y decirlo evita la llamada asustada.
      detalle: "Podés seguir viendo todo lo que cargaste, pero no cargar más hasta renovar.",
      urgente: true,
    };
  }

  if (dias === 0) {
    return { plan: def.nombre, estado: "Vence hoy", detalle: "Renová para no quedarte sin cargar mañana.", urgente: true };
  }

  return {
    plan: def.nombre,
    estado: dias === 1 ? "Vence mañana" : `Vence en ${dias} días`,
    detalle: `Pagado hasta el ${formatoDia(ctx.vence)}.`,
    urgente: dias <= 7,
  };
}

/** `2026-11-15` → `15/11/2026`. Como se escribe una fecha acá. */
function formatoDia(v: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v ?? "");
}

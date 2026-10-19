/**
 * La impresora térmica Bluetooth: buscarla, guardarla y mandarle el ticket.
 *
 * Esto existe porque el botón "Imprimir" del detalle de venta no imprimía. En
 * su momento decía que mandaba el ticket "a la impresora térmica vinculada" sin
 * que hubiera plugin, Bluetooth ni ESC/POS en el proyecto; después se arregló
 * diciendo la verdad —que adentro del APK no se podía imprimir— y ahora se
 * construye la impresora de verdad. La regla de aquella vez no cambia: la
 * pantalla no puede afirmar que imprimió si no le consta.
 *
 * Y acá "constarle" es más difícil de lo que parece. Las impresoras que usan
 * los comercios de acá son ESC/POS genéricas por Bluetooth, y ese canal es de
 * ida: la app escribe bytes y la impresora no contesta. Que los bytes hayan
 * salido no es que el papel haya salido —puede estar sin rollo, con la tapa
 * abierta, o puede haberse cortado a mitad del ticket—. Por eso hay dos
 * resultados distintos y no uno: `impreso`, cuando el aparato confirmó, y
 * `enviado`, cuando lo único que sabemos es que el ticket salió de acá. Están
 * escritos distinto en la pantalla a propósito.
 *
 * Nada de esto se puede probar sin una impresora adelante. Lo que sí se prueba
 * —y es lo que más veces va a hacer falta— es que cada falla se diga con su
 * nombre: el único que va a poder diagnosticar es alguien parado frente a la
 * impresora leyendo lo que dice la pantalla, y "no se pudo imprimir" ahí no
 * sirve de nada.
 */
import type {
  DiscoveredPrinter,
  PrintItem,
  PrinterProfile,
  PrinterStatus,
  PrintJobStatus,
  PrintResult,
} from "@delicity/capacitor-thermal-printer";
import { esNativo } from "./nativo";
import { anchoValido, itemsDePrueba, itemsDeTicket, type AnchoPapel, type OpcionesTicket } from "./ticket";
import type { Venta } from "./types";

/** Cargar el plugin recién cuando hace falta, igual que el resto de lo nativo. */
async function plugin() {
  const { ThermalPrinter } = await import("@delicity/capacitor-thermal-printer");
  return ThermalPrinter;
}

/**
 * Si en este dispositivo hay por dónde imprimir.
 *
 * Fuera del APK no hay plugin nativo: el Bluetooth del navegador no llega a
 * una impresora SPP. En la computadora sigue estando la impresión del sistema,
 * que es otra cosa y se ofrece aparte.
 */
export function sePuedeImprimir(): boolean {
  return esNativo();
}

/* ---------- el ancho del papel ---------- */

const CLAVE_ANCHO = "zentra_impresora_ancho_v1";

/**
 * Qué rollo tiene puesto.
 *
 * Se guarda acá y no se le pregunta a la impresora porque la impresora no lo
 * sabe: el plugin lo deduce del modelo y con las genéricas devuelve `null`. El
 * rollo lo ve la persona que lo cambia, así que se elige una vez en
 * Configuración y queda.
 */
export function anchoGuardado(): AnchoPapel {
  try {
    return anchoValido(Number(localStorage.getItem(CLAVE_ANCHO)));
  } catch {
    return anchoValido(null);
  }
}

export function guardarAncho(mm: AnchoPapel): void {
  try {
    localStorage.setItem(CLAVE_ANCHO, String(mm));
  } catch {
    // Sin persistencia se imprime igual, en 58, que es lo que entra en los dos
    // rollos.
  }
}

/* ---------- lo que la pantalla necesita saber ---------- */

/** Una impresora encontrada, con lo justo para poder elegirla. */
export interface ImpresoraVista {
  id: string;
  nombre: string;
  /** "Bluetooth · Epson TM-m30", para distinguir dos aparatos parecidos. */
  detalle: string;
  guardada: boolean;
  conectada: boolean;
}

/** Cómo salió algo que podía no salir. `motivo` ya está escrito para mostrar. */
export type Resultado<T> = { ok: true; dato: T } | { ok: false; motivo: string; reintentable: boolean };

/**
 * Qué pasó con el ticket.
 *
 *   impreso        la impresora confirmó que terminó de imprimir.
 *   enviado        el ticket salió hacia la impresora y no hubo error, pero el
 *                  canal no devuelve confirmación: si el papel no salió, lo
 *                  sabe quien está mirando el rollo, no nosotros.
 *   error          no salió, y por qué.
 */
export type ResultadoImpresion =
  | { estado: "impreso" }
  | { estado: "enviado" }
  | { estado: "error"; motivo: string; reintentable: boolean };

/* ---------- los errores, con nombre y apellido ---------- */

/**
 * El código del plugin en castellano, para que alguien pueda arreglarlo.
 *
 * Está escrito como tabla y no como `if` encadenados para que se vea de un
 * golpe qué falta cubrir cuando el plugin agregue un código. Cada texto dice
 * qué hacer, no qué pasó: "no se pudo imprimir" es información para nosotros,
 * "la impresora está sin papel" es información para el que atiende.
 */
const MOTIVOS: Record<string, string> = {
  PRINTER_NOT_FOUND:
    "No encontramos la impresora guardada. Prendela, acercate, y si sigue sin aparecer volvé a elegirla en Configuración.",
  PRINTER_OFFLINE: "La impresora no responde: puede estar apagada o fuera de alcance.",
  CONNECTION_FAILED:
    "No pudimos conectarnos a la impresora. Fijate que esté prendida, cerca, y que no esté conectada a otro teléfono.",
  PERMISSION_DENIED:
    "Falta el permiso de Bluetooth. Se habilita en los ajustes del teléfono, en los permisos de Zentra.",
  BLUETOOTH_DISABLED: "El Bluetooth del teléfono está apagado. Prendelo y volvé a intentar.",
  WIFI_NOT_CONNECTED: "La impresora está en la red y el teléfono no: conectate al wifi del local.",
  PAIRING_REQUIRED:
    "Hay que vincular la impresora desde los ajustes de Bluetooth del teléfono antes de usarla acá.",
  UNSUPPORTED_TRANSPORT: "Este teléfono no puede hablar con esa impresora.",
  UNSUPPORTED_PRINTER: "Esa impresora no entiende los tickets que manda Zentra.",
  PAPER_EMPTY: "La impresora se quedó sin papel. Cambiá el rollo y volvé a imprimir.",
  COVER_OPEN: "La tapa de la impresora está abierta. Cerrala y volvé a imprimir.",
  PRINT_FAILED: "La impresora rechazó el ticket.",
  TIMEOUT:
    "La impresora dejó de contestar a mitad del envío. Si salió medio ticket, es esto: revisá el papel antes de reimprimir.",
  SDK_NOT_AVAILABLE: "Esa impresora necesita la aplicación de su fabricante, que no está instalada.",
  IMAGE_INVALID: "El ticket no se pudo armar para esta impresora.",
  IMAGE_TOO_LARGE: "El ticket no se pudo armar para esta impresora.",
};

/** Los que tiene sentido reintentar sin cambiar nada del aparato. */
const REINTENTABLES = new Set([
  "PRINTER_OFFLINE",
  "CONNECTION_FAILED",
  "TIMEOUT",
  "PAPER_EMPTY",
  "COVER_OPEN",
  "PRINT_FAILED",
  "BLUETOOTH_DISABLED",
]);

/**
 * El motivo de una falla, salga de donde salga.
 *
 * El plugin normaliza sus errores con un `code`, pero no todo lo que llega acá
 * es uno de ellos: puede ser un error del WebView, del import dinámico, o algo
 * que el plugin no previó. En ese caso se dice que no sabemos qué pasó, que es
 * la verdad, en vez de inventarle una causa que haga buscar donde no hay nada.
 */
export function motivoDeError(e: unknown): { motivo: string; reintentable: boolean } {
  const code = String((e as { code?: unknown })?.code ?? "");
  const conocido = MOTIVOS[code];
  if (conocido) return { motivo: conocido, reintentable: REINTENTABLES.has(code) };
  const detalle = String((e as Error)?.message || "").trim();
  return {
    motivo: detalle
      ? `La impresora falló y no sabemos por qué. Dice: "${detalle}".`
      : "La impresora falló y no sabemos por qué.",
    reintentable: true,
  };
}

/**
 * Lo que el plugin informó, traducido a lo que podemos afirmar.
 *
 * Es el corazón de la regla de no mentir, y es una función aparte justamente
 * para poder probarla sin impresora:
 *
 *   - Si el último estado del trabajo es `failed` o `hold`, no se imprimió,
 *     aunque la promesa haya resuelto: `hold` es la impresora frenada esperando
 *     papel o tapa, y eso NO es un ticket entregado.
 *   - Si el adapter es un SDK del fabricante, `completed` es una confirmación
 *     real del aparato y recién ahí se dice "impreso".
 *   - Si es ESC/POS genérico o TCP crudo, el canal es de ida: lo máximo que se
 *     puede decir es "enviado". Es el caso común en Paraguay, y es el que la
 *     tentación de redondear a "listo" arruina.
 */
export function interpretarResultado(r: PrintResult | null, trabajo: PrintJobStatus | null): ResultadoImpresion {
  if (trabajo && (trabajo.state === "failed" || trabajo.state === "hold")) {
    const porElCodigo = trabajo.errorCode ? motivoDeError({ code: trabajo.errorCode }) : null;
    const porLaRetencion = trabajo.holdReason ? MOTIVOS_RETENCION[trabajo.holdReason] : undefined;
    return {
      estado: "error",
      motivo:
        porElCodigo?.motivo ??
        porLaRetencion ??
        "La impresora frenó el ticket y no dijo por qué. Revisá el papel y la tapa.",
      reintentable: true,
    };
  }
  if (!r || !r.success || r.state !== "completed") {
    return {
      estado: "error",
      motivo: "La impresora no confirmó la impresión. Revisá el papel antes de volver a mandar el ticket.",
      reintentable: true,
    };
  }
  const deIda = r.adapter === "escpos" || r.adapter === "rawTcp";
  return { estado: deIda ? "enviado" : "impreso" };
}

/** Por qué la impresora frenó el trabajo, cuando no vino un código de error. */
const MOTIVOS_RETENCION: Record<string, string> = {
  paper_empty: MOTIVOS.PAPER_EMPTY!,
  paper_near_end: "A la impresora casi no le queda papel y frenó el ticket. Cambiá el rollo.",
  cover_open: MOTIVOS.COVER_OPEN!,
  buffer_full: "La impresora no da abasto y frenó el ticket. Esperá unos segundos y reintentá.",
  offline: MOTIVOS.PRINTER_OFFLINE!,
  unknown: "La impresora frenó el ticket y no dijo por qué. Revisá el papel y la tapa.",
};

/**
 * El estado del aparato, en una línea para mostrar al lado del nombre.
 *
 * Devuelve `null` cuando no hay nada que decir con fundamento: muchas ESC/POS
 * no informan estado, y escribir "Conectada" porque la conexión abrió es
 * justamente afirmar lo que no se sabe.
 */
export function estadoLegible(st: PrinterStatus | null): string | null {
  if (!st) return null;
  if (st.paper === "empty") return "Sin papel";
  if (st.coverOpen) return "Tapa abierta";
  if (st.paper === "near_end") return "Casi sin papel";
  if (st.connection === "error") return "Con falla";
  if (!st.online) return "Apagada o fuera de alcance";
  if (st.connection === "connected") return "Conectada";
  if (st.connection === "connecting") return "Conectando…";
  return "Sin conectar";
}

/* ---------- permisos, cuando se usan ---------- */

/**
 * Pedir Bluetooth en el momento de usarlo, no al abrir la app.
 *
 * Es lo que ya hace la ubicación (`ubicacion.ts`) y lo que Google espera ver:
 * un permiso pedido en frío, sin que la persona haya tocado nada que lo
 * explique, se niega y queda negado para siempre. Y acá son dos permisos
 * distintos: conectar y buscar. Buscar sólo hace falta la primera vez, así que
 * no se pide al imprimir.
 *
 * Android 12+ pide `BLUETOOTH_CONNECT` y `BLUETOOTH_SCAN` en tiempo de
 * ejecución; en Android 11 y anteriores la búsqueda de dispositivos pasa por la
 * ubicación, y por eso también se mira.
 */
export async function pedirPermisos(opc: { buscando?: boolean } = {}): Promise<Resultado<true>> {
  if (!sePuedeImprimir()) {
    return {
      ok: false,
      motivo: "La impresora Bluetooth funciona con la app instalada. En el navegador usá la impresión del sistema.",
      reintentable: false,
    };
  }
  try {
    const p = await plugin();
    let st = await p.checkPermissions();
    const falta = () =>
      st.bluetoothConnect !== "granted" || (opc.buscando === true && st.bluetoothScan !== "granted");
    if (falta()) st = await p.requestPermissions();

    if (st.bluetoothConnect !== "granted") {
      return {
        ok: false,
        motivo:
          st.bluetoothConnect === "denied"
            ? "El permiso de Bluetooth está negado. Se habilita en los ajustes del teléfono, en los permisos de Zentra."
            : "Sin el permiso de Bluetooth no podemos hablar con la impresora.",
        reintentable: st.bluetoothConnect !== "denied",
      };
    }
    if (opc.buscando && st.bluetoothScan !== "granted" && st.location !== "granted") {
      // En Android 11 y anteriores buscar dispositivos pide ubicación: no es
      // que queramos saber dónde está nadie, y conviene decirlo, porque el
      // cartel del sistema pregunta justo eso.
      return {
        ok: false,
        motivo:
          "Para buscar impresoras el teléfono pide permiso de Bluetooth y, en las versiones viejas de Android, " +
          "también de ubicación. No usamos la ubicación para nada más.",
        reintentable: true,
      };
    }

    const { enabled } = await p.isBluetoothEnabled();
    // El permiso concedido y el Bluetooth apagado son dos cosas distintas, y
    // el plugin las separa a propósito. Confundirlas manda a alguien a revisar
    // los permisos cuando lo único que hay que hacer es prender el Bluetooth.
    if (!enabled) return { ok: false, motivo: MOTIVOS.BLUETOOTH_DISABLED!, reintentable: true };

    return { ok: true, dato: true };
  } catch (e) {
    const m = motivoDeError(e);
    return { ok: false, motivo: m.motivo, reintentable: m.reintentable };
  }
}

/* ---------- elegir la impresora, una vez ---------- */

const vista = (p: DiscoveredPrinter): ImpresoraVista => ({
  id: p.id,
  nombre: p.name || p.model || "Impresora sin nombre",
  detalle: [p.transport === "ble" ? "Bluetooth" : p.transport, p.brand, p.model].filter(Boolean).join(" · "),
  guardada: p.isDefault,
  conectada: p.isConnected,
});

const vistaDePerfil = (p: PrinterProfile): ImpresoraVista => ({
  id: p.id,
  nombre: p.name || p.model || "Impresora sin nombre",
  detalle: [p.transport === "ble" ? "Bluetooth" : p.transport, p.brand, p.model].filter(Boolean).join(" · "),
  guardada: p.isDefault,
  conectada: false,
});

/**
 * Buscar impresoras.
 *
 * `alEncontrar` recibe cada una mientras el scan corre, porque ocho segundos
 * mirando una pantalla quieta es mucho tiempo: la persona necesita ver que algo
 * está pasando. El listado completo vuelve al final igual.
 */
export async function buscarImpresoras(
  alEncontrar?: (i: ImpresoraVista) => void,
): Promise<Resultado<ImpresoraVista[]>> {
  const permiso = await pedirPermisos({ buscando: true });
  if (!permiso.ok) return permiso;
  try {
    const p = await plugin();
    const sub = alEncontrar
      ? await p.addListener("printerFound", (e) => alEncontrar(vista(e.printer)))
      : null;
    try {
      // Bluetooth y BLE nada más: el scan de red TCP recorre el segmento
      // entero y en el wifi de un comercio tarda una eternidad para encontrar
      // lo que acá nadie tiene.
      const { printers } = await p.discoverPrinters({
        sources: ["bluetooth", "ble"],
        timeoutMs: 8000,
        includePaired: true,
      });
      return { ok: true, dato: printers.map(vista) };
    } finally {
      await sub?.remove();
    }
  } catch (e) {
    const m = motivoDeError(e);
    return { ok: false, motivo: m.motivo, reintentable: m.reintentable };
  }
}

/**
 * Elegir una y dejarla guardada.
 *
 * `setAsDefault` va junto con la conexión a propósito: el plugin sólo la
 * guarda si la conexión funcionó. Guardar una impresora a la que no se pudo
 * conectar es guardar un problema para la primera venta apurada.
 *
 * El ancho se manda en la conexión —queda como ancho propio de esa impresora—
 * y además se guarda de este lado, porque es el que decide cuántas columnas
 * tiene el ticket que armamos nosotros.
 */
export async function elegirImpresora(id: string, mm: AnchoPapel): Promise<Resultado<ImpresoraVista>> {
  const permiso = await pedirPermisos();
  if (!permiso.ok) return permiso;
  try {
    const p = await plugin();
    const r = await p.connectPrinter({ printerId: id, paperWidthMm: mm, setAsDefault: true });
    if (!r.connected) {
      return { ok: false, motivo: MOTIVOS.CONNECTION_FAILED!, reintentable: true };
    }
    // `printerId` puede no ser el que se pidió: cuando la impresora también la
    // reconoce el SDK de su fabricante, el plugin reconecta por ahí y devuelve
    // otro id. El que vale para imprimir después es este.
    guardarAncho(mm);
    const { profile } = await p.getDefaultPrinter();
    return {
      ok: true,
      dato: profile
        ? vistaDePerfil(profile)
        : { id: r.printerId, nombre: r.printerId, detalle: r.adapter, guardada: true, conectada: true },
    };
  } catch (e) {
    const m = motivoDeError(e);
    return { ok: false, motivo: m.motivo, reintentable: m.reintentable };
  }
}

/** La guardada, o `null` si todavía no se eligió ninguna. */
export async function impresoraGuardada(): Promise<ImpresoraVista | null> {
  if (!sePuedeImprimir()) return null;
  try {
    const p = await plugin();
    const { profile } = await p.getDefaultPrinter();
    return profile ? vistaDePerfil(profile) : null;
  } catch {
    // No saber si hay impresora guardada no es un error que valga contarle a
    // nadie: la pantalla se comporta como si no hubiera, que es lo que hay que
    // hacer igual.
    return null;
  }
}

/** Las que quedaron guardadas de otras veces, para poder volver a una. */
export async function impresorasGuardadas(): Promise<ImpresoraVista[]> {
  if (!sePuedeImprimir()) return [];
  try {
    const p = await plugin();
    const { profiles } = await p.getSavedPrinters();
    return profiles.map(vistaDePerfil);
  } catch {
    return [];
  }
}

/** Sacarla de la lista. Vuelve a preguntar la próxima vez que se imprima. */
export async function olvidarImpresora(id: string): Promise<Resultado<true>> {
  try {
    const p = await plugin();
    await p.removePrinter({ printerId: id });
    return { ok: true, dato: true };
  } catch (e) {
    const m = motivoDeError(e);
    return { ok: false, motivo: m.motivo, reintentable: m.reintentable };
  }
}

/**
 * Cómo está la impresora ahora.
 *
 * `null` cuando no se puede saber, que no es lo mismo que "está bien". Muchas
 * ESC/POS genéricas no informan nada, y en ese caso la pantalla no muestra
 * ningún estado en vez de mostrar uno inventado.
 */
export async function estadoDeImpresora(id?: string): Promise<string | null> {
  if (!sePuedeImprimir()) return null;
  try {
    const p = await plugin();
    return estadoLegible(await p.getPrinterStatus({ printerId: id }));
  } catch {
    return null;
  }
}

/* ---------- imprimir ---------- */

const SIN_APP =
  "La impresora Bluetooth funciona con la app instalada. En el navegador usá la impresión del sistema.";

/**
 * El envío, que es igual para el ticket de una venta y para el de prueba.
 *
 * Mientras imprime se escucha `printJobStatus`: es el único que sabe si la
 * impresora frenó el trabajo esperando papel. Sin eso, un ticket que quedó a
 * mitad de camino se vería igual que uno que salió.
 *
 * El estado del trabajo se guarda adentro de un objeto y no en una variable
 * suelta porque lo escribe el callback del plugin: con una variable, el
 * compilador da por sentado que sigue valiendo `null` —nunca ve correr el
 * callback— y el caso de "frenó por falta de papel" quedaría muerto.
 */
async function mandar(items: PrintItem[], mm: AnchoPapel, printerId: string): Promise<ResultadoImpresion> {
  const trabajo: { ultimo: PrintJobStatus | null } = { ultimo: null };
  try {
    const p = await plugin();
    const sub = await p.addListener("printJobStatus", (e) => {
      trabajo.ultimo = e.job;
    });
    try {
      const r = await p.printText({
        printerId,
        items,
        paperWidthMm: mm,
        encoding: "WPC1252",
        autoReconnect: true,
        timeoutMs: 20000,
      });
      return interpretarResultado(r, trabajo.ultimo);
    } finally {
      await sub.remove();
    }
  } catch (e) {
    // Un error con el trabajo ya en `hold` dice más que el error solo: "sin
    // papel" en vez de "falló la impresión".
    if (trabajo.ultimo) return interpretarResultado(null, trabajo.ultimo);
    const m = motivoDeError(e);
    return { estado: "error", motivo: m.motivo, reintentable: m.reintentable };
  }
}

/**
 * Todo lo que hay que tener antes de mandar un ticket: plugin, permisos,
 * Bluetooth prendido e impresora elegida.
 *
 * Si no hay impresora guardada no se intenta nada: se devuelve el motivo para
 * que la pantalla lleve a elegir una. Nadie quiere elegir impresora en cada
 * venta, pero la primera vez hay que elegirla.
 */
async function listaParaImprimir(): Promise<Resultado<{ id: string; mm: AnchoPapel }>> {
  if (!sePuedeImprimir()) return { ok: false, motivo: SIN_APP, reintentable: false };

  const permiso = await pedirPermisos();
  if (!permiso.ok) return permiso;

  const guardada = await impresoraGuardada();
  if (!guardada) {
    return {
      ok: false,
      motivo: "Todavía no elegiste impresora. Se elige una vez, en Configuración.",
      reintentable: false,
    };
  }
  return { ok: true, dato: { id: guardada.id, mm: anchoGuardado() } };
}

/** Mandar el ticket de una venta. */
export async function imprimirTicket(
  v: Venta,
  opc: Omit<OpcionesTicket, "ancho"> & { ancho?: AnchoPapel },
): Promise<ResultadoImpresion> {
  const lista = await listaParaImprimir();
  if (!lista.ok) return { estado: "error", motivo: lista.motivo, reintentable: lista.reintentable };
  const mm = opc.ancho ?? lista.dato.mm;
  return mandar(itemsDeTicket(v, { ...opc, ancho: mm }), mm, lista.dato.id);
}

/**
 * Un ticket de prueba, para saber si la impresora quedó bien elegida sin tener
 * que hacer una venta.
 *
 * Lleva la regla de columnas impresa: si los números de la regla no llegan
 * justo al borde del papel, el ancho configurado no es el del rollo, y eso se
 * ve de un vistazo en vez de descubrirse con el primer cliente esperando.
 */
export async function imprimirPrueba(mm: AnchoPapel): Promise<ResultadoImpresion> {
  const lista = await listaParaImprimir();
  if (!lista.ok) return { estado: "error", motivo: lista.motivo, reintentable: lista.reintentable };
  return mandar(itemsDePrueba(mm), mm, lista.dato.id);
}

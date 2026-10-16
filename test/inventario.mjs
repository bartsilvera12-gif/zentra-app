/**
 * Las reglas del alta de productos que corren al guardar.
 *
 *   npm run test:inventario
 *
 * Las dos que se probaban solas desde el botón y no desde el guardado:
 *
 *   - La categoría nueva es de los planes pagos. En Gratis el formulario lo
 *     avisaba con un texto gris, el campo seguía editable y el guardado no
 *     miraba: se creaban categorías igual.
 *   - El tope de productos. El botón se apagaba al llegar, y el guardado no
 *     revisaba nada. Un botón apagado no es un límite: el formulario se puede
 *     dejar abierto, cambiar de plan, volver y guardar.
 */
import { categoriaConocida, motivoCategoria } from "../src/lib/inventario.ts";
import { motivoBloqueo } from "../src/lib/planes.ts";

const casos = [];
const t = (nombre, fn) => casos.push([nombre, fn]);

/** Lo que diría la pantalla en Gratis: no puede crear categorías. */
const SIN_CATEGORIA = motivoBloqueo("inventario.categoria", { conErp: false, plan: "free" });

t("en Gratis no se puede crear una categoría que no existe", () => {
  if (!SIN_CATEGORIA) throw new Error("Gratis no debería incluir crear categorías");
  const motivo = motivoCategoria("Fiambrería", ["Bebidas", "Limpieza"], SIN_CATEGORIA);
  if (!motivo) throw new Error("dejó crear una categoría nueva en Gratis");
});

t("en Gratis sí se puede elegir una categoría que ya está", () => {
  if (motivoCategoria("Bebidas", ["Bebidas", "Limpieza"], SIN_CATEGORIA))
    throw new Error("elegir una que ya existe no crea nada");
});

t("dejar la categoría vacía no es crear una categoría", () => {
  if (motivoCategoria("", ["Bebidas"], SIN_CATEGORIA)) throw new Error("un hueco no crea nada");
  if (motivoCategoria("   ", ["Bebidas"], SIN_CATEGORIA)) throw new Error("espacios tampoco");
});

t("escribir la misma categoría con otras mayúsculas o tildes no crea otra", () => {
  if (!categoriaConocida("bebidas", ["Bebidas"])) throw new Error("es la misma categoría");
  if (!categoriaConocida("FIAMBRERIA", ["Fiambrería"])) throw new Error("las tildes no la cambian");
  if (!categoriaConocida("  Limpieza  ", ["Limpieza"])) throw new Error("los espacios tampoco");
  if (categoriaConocida("Perfumería", ["Bebidas"])) throw new Error("ésa no existe");
});

t("en Max se puede crear la categoría que haga falta", () => {
  const bloqueo = motivoBloqueo("inventario.categoria", { conErp: false, plan: "max" });
  if (motivoCategoria("Fiambrería", [], bloqueo)) throw new Error("Max no tiene este límite");
});

t("con ERP propio no hay plan que opine de las categorías", () => {
  const bloqueo = motivoBloqueo("inventario.categoria", { conErp: true, plan: "free" });
  if (motivoCategoria("Lo que sea", [], bloqueo)) throw new Error("con ERP no hay plan");
});

t("el tope cuenta todo lo cargado, no sólo lo del último pedido", () => {
  // Es el error que tenía la pantalla: contaba sólo lo que había devuelto el
  // backend, y lo cargado en el teléfono no sumaba. El contador no se movía
  // nunca y en Gratis entraban cien productos.
  const ctx = (productos) => ({ conErp: false, plan: "free", productos });
  if (motivoBloqueo("inventario.alta", ctx(19))) throw new Error("con 19 todavía entra uno");
  const topado = motivoBloqueo("inventario.alta", ctx(20));
  if (!topado) throw new Error("con 20 cargados el tope de Gratis está alcanzado");
  if (!topado.includes("20")) throw new Error("el motivo tiene que decir el tope: " + topado);
  if (!motivoBloqueo("inventario.alta", ctx(85)))
    throw new Error("pasado el tope sigue sin poder cargar");
});

t("sin plan pago, un ajuste de este mes bloquea el siguiente", () => {
  // Y esto sólo funciona si el backend fecha `ultimo_ajuste` al ajustar. Con el
  // campo vacío el límite pasaba siempre, que es como estaba.
  const ahora = new Date("2026-10-16T12:00:00Z");
  const hace3 = "2026-10-13T12:00:00Z";
  const hace40 = "2026-09-06T12:00:00Z";
  const ctx = (ultimoAjuste) => ({ conErp: false, plan: "emprendedor", ultimoAjuste, ahora });

  if (!motivoBloqueo("inventario.ajuste", ctx(hace3)))
    throw new Error("ajustó hace 3 días: tiene que esperar");
  if (motivoBloqueo("inventario.ajuste", ctx(hace40)))
    throw new Error("pasaron más de 30 días: puede ajustar");
  if (motivoBloqueo("inventario.ajuste", ctx(null)))
    throw new Error("sin fecha es 'nunca se ajustó', y se puede");
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nInventario: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

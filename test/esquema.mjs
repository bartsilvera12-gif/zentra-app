/**
 * Que la base tenga las columnas que la app escribe.
 *
 *   npm run test:esquema
 *
 * Esto no prueba lógica: prueba que no vuelva un error que ya pasó. La app
 * mandaba `precio_mayorista`, `vencimiento` y `ultimo_ajuste` en el alta y en la
 * edición de un producto, y en `zentra.productos` no existía ninguna de las
 * tres. Guardar un producto con cualquiera de ellas fallaba contra la base de
 * verdad —"column does not exist"— y fallaba en el alta, que es lo primero que
 * hace alguien que instala la app.
 *
 * Pasa de nuevo fácil: se agrega un campo al puerto, se escribe en
 * `supabase-datos.ts`, y la migración queda para después.
 *
 * La segunda prueba es del pegado único. `todo_en_uno.sql` se genera con un
 * glob que decía `0*.sql`, así que dejaba afuera todo lo que pasara del 09: el
 * archivo 10 no estaba, y quien instalaba de un solo pegado se quedaba sin la
 * lista de precios sin enterarse.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase";
const PEGADO = "todo_en_uno.sql";

const casos = [];
const t = (nombre, fn) => casos.push([nombre, fn]);

/** Los archivos numerados, en el orden en que se corren. */
const numerados = readdirSync(DIR)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort();

/**
 * Lo que está numerado pero NO va en el instalador.
 *
 * `12_datos_demo.sql` carga un comercio de mentira para que los revisores de
 * Google vean algo, y antes de cargarlo borra las ventas, los productos y los
 * clientes de la empresa que elija. En la instalación de un cliente eso no es
 * "datos de ejemplo de más": es borrarle el negocio.
 */
const FUERA_DEL_INSTALADOR = ["12_datos_demo.sql", "13_repartir_ventas_demo.sql"];

/** Los que sí tienen que estar en el pegado único. */
const delInstalador = numerados.filter((f) => !FUERA_DEL_INSTALADOR.includes(f));

/** Todo el SQL de la instalación, junto, para buscar una columna. */
const sql = numerados.map((f) => readFileSync(join(DIR, f), "utf8")).join("\n");

const datos = readFileSync("src/lib/repo/supabase-datos.ts", "utf8");

/**
 * Las columnas que la app escribe, sacadas del propio adaptador.
 *
 * Se leen del código y no de una lista a mano: una lista a mano se actualiza
 * justo tan poco como la migración que falta.
 */
function columnasQueEscribimos() {
  const cols = new Set();
  // Las correcciones: `fila.precio_mayorista = …`
  for (const m of datos.matchAll(/fila\.([a-z_]+)\s*=/g)) cols.add(m[1]);
  // Los `insert({ … })` y `update({ … })`, con las claves en snake_case.
  for (const m of datos.matchAll(/\.(?:insert|update)\(\{([\s\S]*?)\}\)/g)) {
    for (const c of m[1].matchAll(/^\s*([a-z][a-z0-9_]*):/gm)) cols.add(c[1]);
  }
  return [...cols].filter((c) => c.includes("_") || /^(nombre|sku|barras|minimo|costo|precio|unidad|categoria|deposito|iva|metodo|doc|tel|email|origen|zona|direccion|numero|estado|moneda|factura|timbrado|cuotas|fecha|condicion|cantidad|ref|token|plataforma)$/.test(c));
}

t("toda columna que la app escribe existe en el esquema", () => {
  const faltan = columnasQueEscribimos().filter(
    (c) => !new RegExp(`(^|[\\s(,])${c}([\\s,)]|$)`, "m").test(sql),
  );
  if (faltan.length)
    throw new Error(
      `la app escribe columnas que la base no tiene: ${faltan.join(", ")}.\n` +
        "        Falta la migración, o la columna está mal escrita.",
    );
});

t("los tres campos de Max están en productos", () => {
  for (const c of ["precio_mayorista", "vencimiento", "ultimo_ajuste"]) {
    if (!sql.includes(c)) throw new Error(`falta ${c} en el esquema`);
  }
});

t("el pegado único trae todos los archivos numerados", () => {
  const pegado = readFileSync(join(DIR, PEGADO), "utf8");
  const faltan = delInstalador.filter((f) => !pegado.includes(f));
  if (faltan.length)
    throw new Error(
      `todo_en_uno.sql no trae ${faltan.join(", ")}.\n` +
        "        Correr supabase/generar_todo_en_uno.sh.",
    );
});

t("el pegado único no se editó a mano", () => {
  const pegado = readFileSync(join(DIR, PEGADO), "utf8");
  for (const f of delInstalador) {
    const suelto = readFileSync(join(DIR, f), "utf8").trimEnd();
    if (!pegado.includes(suelto))
      throw new Error(
        `${f} no coincide con lo que hay en todo_en_uno.sql.\n` +
          "        Se edita el archivo suelto y se vuelve a generar el pegado.",
      );
  }
});

t("el pegado único no trae los datos de demostración", () => {
  // Al revés que las otras dos: acá lo que se verifica es una ausencia. Si
  // esto alguna vez empieza a fallar, alguien le sacó el filtro al generador
  // y el instalador de un cliente va a borrarle las ventas.
  const pegado = readFileSync(join(DIR, PEGADO), "utf8");
  for (const f of FUERA_DEL_INSTALADOR) {
    if (pegado.includes(f)) throw new Error(`${f} se coló en todo_en_uno.sql`);
  }
  if (/delete from zentra\.ventas/i.test(pegado))
    throw new Error("el instalador tiene un borrado de ventas adentro");
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nEsquema: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

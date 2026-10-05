/**
 * Que ninguna pantalla muestre datos de ejemplo.
 *
 *   npm run test:sin-ejemplo
 *
 * Esto no prueba lógica: prueba que no vuelva un error que ya pasó. La app se
 * instaló, alguien entró con su empresa de verdad, y vio clientes, productos y
 * ventas que no existen en ninguna parte. Se veía perfecta y era mentira.
 *
 * Es fácil de reintroducir: alguien agrega una pantalla, la llena con el
 * catálogo de ejemplo para verla andar, y se olvida de sacarlo.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "src/mobile/screens";

/**
 * Lo que NO puede salir de `@/lib/data` en una pantalla: son datos de una
 * empresa inventada.
 */
const PROHIBIDO = new Set([
  "CLIENTES", "PRODUCTOS", "INV", "VENTAS_HIST", "COMPRAS", "PROVEEDORES", "MOVS", "CHATS",
]);

/**
 * Lo que sí puede: catálogos y textos que no dependen de ninguna empresa.
 * Un IVA del 10% es 10% en todas, y los pasos de un formulario también.
 */
const PERMITIDO = new Set([
  "METODOS", "PASOS_VENTA", "PASOS_COMPRA", "IVA_RATE", "IVAS", "MOTIVOS", "UNIDADES",
  "PESABLES", "EMOJIS", "GIFS", "STICKERS", "PLANTILLAS", "ADJUNTOS",
  "REP_KPIS", "REP_TABLAS", "VERSION", "SOPORTE", "EMPRESA", "USUARIO",
]);

/** Las que pueden nombrar un prohibido porque lo usan sólo sin ERP. */
const CON_GUARDA = new Map([
  // Movimientos de stock: la API no los expone, así que con ERP se muestran
  // sólo los hechos desde la app.
  ["InventarioScreen.tsx", new Set(["MOVS"])],
  // Conversaciones: con ERP la pantalla entera avisa que no está conectada.
  ["ConversacionesScreen.tsx", new Set(["CHATS"])],
  // Compartir factura por WhatsApp: con ERP no busca chat.
  ["DetVentasScreen.tsx", new Set(["CHATS"])],
]);

let malas = 0;
for (const archivo of readdirSync(DIR).filter((f) => f.endsWith(".tsx"))) {
  const txt = readFileSync(join(DIR, archivo), "utf8");
  const m = txt.match(/import\s*\{([^}]*)\}\s*from\s*"@\/lib\/data"/);
  if (!m) continue;

  const importados = m[1].split(",").map((x) => x.trim()).filter(Boolean);
  const guardados = CON_GUARDA.get(archivo) ?? new Set();

  for (const nombre of importados) {
    if (PROHIBIDO.has(nombre) && !guardados.has(nombre)) {
      malas++;
      console.log(`  FALLA · ${archivo} importa ${nombre} de los datos de ejemplo.`);
      console.log(`           Tiene que salir del repo (repo.*), o avisar que no hay.`);
    } else if (!PROHIBIDO.has(nombre) && !PERMITIDO.has(nombre)) {
      malas++;
      console.log(`  FALLA · ${archivo} importa ${nombre}, que no está clasificado.`);
      console.log(`           Si es un catálogo sin empresa, agregalo a PERMITIDO en esta prueba.`);
    }
  }

  // Una guarda sin la llamada que la implementa es peor que no tenerla.
  if (guardados.size && !txt.includes("usaApiDelErp")) {
    malas++;
    console.log(`  FALLA · ${archivo} está en CON_GUARDA pero no llama a usaApiDelErp().`);
  }
}

if (!malas) console.log("  OK · ninguna pantalla muestra datos de ejemplo con un ERP conectado");
console.log(malas ? `\n${malas} problema(s).` : "\nSin datos de ejemplo: todo en orden.");
process.exitCode = malas ? 1 : 0;

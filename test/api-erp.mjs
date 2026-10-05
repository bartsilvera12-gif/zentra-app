/**
 * Pruebas del cliente HTTP contra una API simulada.
 *
 *   npm run test:api
 *
 * No necesita el ERP: levanta un servidor que responde como dice
 * docs/API-ERP.md, y verifica que la app mande y entienda lo que corresponde.
 * Lo que más importa acá es la idempotencia: un reintento no puede duplicar una
 * venta.
 */
import { createServer } from "node:http";

const casos = [];
function t(nombre, fn) { casos.push([nombre, fn]); }

/** Lo que recibió el servidor, para poder afirmar sobre el pedido y no sólo sobre la respuesta. */
const recibido = [];
const ventasPorClave = new Map();

const server = createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (d) => (cuerpo += d));
  req.on("end", () => {
    const u = new URL(req.url, "http://x");
    recibido.push({
      metodo: req.method,
      ruta: u.pathname,
      query: Object.fromEntries(u.searchParams),
      auth: req.headers.authorization || null,
      idempotencia: req.headers["idempotency-key"] || null,
      cuerpo: cuerpo ? JSON.parse(cuerpo) : null,
    });
    const json = (c, b) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };

    // El ERP envuelve todo en { success, data } y devuelve sus columnas crudas.
    const ok = (data) => json(200, { success: true, data });

    if (u.pathname === "/perfil") {
      return ok({ id: "u1", nombre: "Ulises Gomez", rol: "VENDEDOR", empresa: "Distribuidora JM" });
    }
    if (u.pathname === "/clientes" && req.method === "GET") {
      return ok([{
        id: "c1", nombre: null, razon_social: "Supermercado Aurora SA", empresa: null,
        nombre_contacto: "Lucia Benitez", ruc_factura: "80012345-6", ruc: "999",
        telefono: null, telefono_secundario: "0981", ciudad: "Asuncion",
        tipo_cliente: "Mayorista", baja_operativa_at: null, created_at: "2024-03-15T00:00:00Z",
      }]);
    }
    if (u.pathname === "/productos") {
      return ok([
        { id: "p1", nombre: "MUSLO PAQUETE CONG. POR KG", sku: "73", precio_venta: 10650.6,
          costo_promedio: 8800.4, stock_actual: 0.5, stock_minimo: 0, tipo_iva: "5%", unidad_medida: "KG" },
        { id: "p2", nombre: "PAPAS PRE FRITAS", sku: "2590", precio_venta: 15900,
          costo_promedio: 13100, stock_actual: 1, stock_minimo: 0, tipo_iva: "10%" },
        { id: "p3", nombre: "LIBRO", sku: "LIB", precio_venta: 20000,
          costo_promedio: 15000, stock_actual: 2, stock_minimo: 0, tipo_iva: "EXENTA" },
      ]);
    }
    if (u.pathname === "/ventas/create" && req.method === "POST") {
      const clave = req.headers["idempotency-key"];
      // Lo que tiene que hacer el ERP: misma clave, misma venta.
      if (ventasPorClave.has(clave)) return json(200, { success: true, data: ventasPorClave.get(clave) });
      const v = {
        id: "v" + (ventasPorClave.size + 1),
        numero_control: "VTA-00000" + (ventasPorClave.size + 7),
        fecha: "2026-10-05T10:00:00Z",
        cliente_nombre: "Supermercado Aurora SA",
        cliente_doc: "80012345-6",
        estado: "completada",
        tipo_venta: "CONTADO",
        metodo_pago: "efectivo",
        items: [{ producto_nombre: "MUSLO PAQUETE CONG. POR KG", cantidad: 0.5, precio_venta: 10650, tipo_iva: "5%" }],
      };
      ventasPorClave.set(clave, v);
      return json(201, { success: true, data: v });
    }
    if (u.pathname === "/ventas" && req.method === "GET") return ok([]);
    if (u.pathname === "/falla") return json(500, { success: false, error: "La caja no esta abierta." });
    return json(404, { success: false, error: "no existe" });
  });
});
await new Promise((r) => server.listen(5610, "127.0.0.1", r));

process.env.NEXT_PUBLIC_BACKEND = "http";
process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:5610";
const { httpRepo, setToken } = await import("../src/lib/repo/http.ts");
setToken("token-de-prueba");

t("clientes: arma el nombre y el documento con las columnas del ERP", async () => {
  const [c] = await httpRepo.clientes.list({ q: "aurora" });
  // El ERP reparte el nombre en cuatro columnas; `nombre` viene vacío acá.
  if (c.nombre !== "Supermercado Aurora SA") throw new Error("nombre: " + c.nombre);
  // ruc_factura gana sobre ruc: es el que se usa para facturar.
  if (c.doc !== "80012345-6") throw new Error("doc: " + c.doc);
  if (c.tel !== "0981") throw new Error("no cayó al telefono_secundario: " + c.tel);
  if (c.desde !== "mar 2024") throw new Error("desde: " + c.desde);
  const ult = recibido.at(-1);
  if (ult.auth !== "Bearer token-de-prueba") throw new Error("no mandó el token: " + ult.auth);
});

t("productos: enteros en plata, decimales en stock", async () => {
  const ps = await httpRepo.inventario.list();
  const kg = ps.find((p) => p.sku === "73");
  // La plata se redondea: el guaraní no tiene centavos.
  if (kg.precio !== 10651) throw new Error("precio: " + kg.precio);
  // El stock NO: se vende por kilo y hay medios kilos.
  if (kg.stock !== 0.5) throw new Error("el stock se redondeó: " + kg.stock);
  if (kg.iva !== "5%") throw new Error("iva: " + kg.iva);
});

t("el IVA del ERP se traduce, incluido EXENTA en mayúscula", async () => {
  const ps = await httpRepo.inventario.list();
  const esperado = { "73": "5%", "2590": "10%", LIB: "Exenta" };
  for (const p of ps) {
    if (p.iva !== esperado[p.sku]) {
      throw new Error(`${p.nombre}: esperaba ${esperado[p.sku]}, dio ${p.iva}`);
    }
  }
});

t("venta: manda el cuerpo que el ERP espera, con el IVA contenido", async () => {
  const v = await httpRepo.ventas.create({
    clienteId: "c1",
    lineas: [{ prodId: "p2", cantidad: 2, precio: 15900, iva: "10%" }],
    pago: { tipo: "contado", metodo: "efectivo" },
    moneda: "PYG",
  });
  if (!v.numero.startsWith("VTA-")) throw new Error("numero: " + v.numero);
  if (v.estado !== "Cobrada") throw new Error("'completada' tiene que ser Cobrada, dio " + v.estado);

  const b = recibido.at(-1).cuerpo;
  if (b.moneda !== "GS") throw new Error("el ERP llama GS a los guaranies, mandó " + b.moneda);
  if (b.tipo_venta !== "CONTADO") throw new Error("tipo_venta: " + b.tipo_venta);
  if (b.metodo_pago !== "efectivo") throw new Error("metodo_pago: " + b.metodo_pago);

  const [l] = b.items;
  if (l.tipo_iva !== "10%") throw new Error("tipo_iva: " + l.tipo_iva);
  if (l.producto_nombre !== "PAPAS PRE FRITAS") throw new Error("no completó el nombre del producto");
  // 2 x 15.900 = 31.800. El IVA va CONTENIDO: 31800 x .10/1.10 = 2891, no 3180.
  if (l.total_linea !== 31800) throw new Error("total_linea: " + l.total_linea);
  if (l.monto_iva !== 2891) throw new Error("el IVA tiene que ir contenido, dio " + l.monto_iva);
  if (l.subtotal !== 31800 - 2891) throw new Error("subtotal: " + l.subtotal);
});

t("una venta a crédito manda el plazo y no el método", async () => {
  await httpRepo.ventas.create({
    clienteId: "c1",
    lineas: [{ prodId: "p2", cantidad: 1, precio: 15900, iva: "10%" }],
    pago: { tipo: "credito", plazoDias: 30 },
    moneda: "PYG",
  });
  const b = recibido.at(-1).cuerpo;
  if (b.tipo_venta !== "CREDITO") throw new Error("tipo_venta: " + b.tipo_venta);
  if (b.plazo_dias !== 30) throw new Error("plazo_dias: " + b.plazo_dias);
  if ("metodo_pago" in b) throw new Error("mandó metodo_pago en una venta a credito");
});

t("dos ventas distintas llevan claves distintas", async () => {
  const antes = recibido.length;
  await httpRepo.ventas.create({ clienteId: "c1", lineas: [], pago: { tipo: "contado", metodo: "efectivo" }, moneda: "PYG" });
  await httpRepo.ventas.create({ clienteId: "c1", lineas: [], pago: { tipo: "contado", metodo: "efectivo" }, moneda: "PYG" });
  const [a, b] = recibido.slice(antes).filter((r) => r.ruta === "/ventas/create");
  if (!a.idempotencia || !b.idempotencia) throw new Error("falta clave");
  if (a.idempotencia === b.idempotencia) {
    throw new Error("dos ventas distintas salieron con la MISMA clave: la segunda se perdería");
  }
});

t("el mensaje del ERP se muestra tal cual, no un 'algo falló'", async () => {
  const { request, ApiError } = await import("../src/lib/repo/http.ts");
  let err = null;
  try { await request("/falla"); } catch (e) { err = e; }
  if (!(err instanceof ApiError)) throw new Error("no fue ApiError");
  if (err.status !== 500) throw new Error("status: " + err.status);
  // El ERP escribe mensajes para mostrarle a una persona; se usan tal cual.
  if (err.message !== "La caja no esta abierta.") throw new Error("mensaje: " + err.message);
});

t("lo que no está implementado lo dice, no inventa datos", async () => {
  let msg = "";
  try { await httpRepo.compras.list(); } catch (e) { msg = e.message; }
  if (!/no está implementado/.test(msg)) throw new Error("mensaje poco claro: " + msg);
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
server.close();
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nAPI del ERP: todas las pruebas pasaron.");
process.exit(malas ? 1 : 0);

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

    if (u.pathname === "/perfil") {
      return json(200, { id: "u1", nombre: "Ulises Gomez", rol: "VENDEDOR", empresa: "Distribuidora JM" });
    }
    if (u.pathname === "/clientes" && req.method === "GET") {
      return json(200, [
        { id: "c1", nombre: "Supermercado Aurora", doc: "80012345-6", tel: "0981", zona: "Asuncion", saldo: 450000, compras: 12 },
      ]);
    }
    if (u.pathname === "/productos") {
      return json(200, [
        { id: "p1", nombre: "Aceite Girasol 900ml", sku: "ACE-900", precio: 11500, stock: 240, iva: "10%", costo: 7800, minimo: 50 },
      ]);
    }
    if (u.pathname === "/ventas" && req.method === "POST") {
      const clave = req.headers["idempotency-key"];
      // Lo que tiene que hacer la API real: misma clave, misma venta.
      if (ventasPorClave.has(clave)) return json(200, ventasPorClave.get(clave));
      const v = {
        id: "v" + (ventasPorClave.size + 1),
        numero: "VTA-00012" + (ventasPorClave.size + 3),
        fecha: "2026-10-05",
        cliente: "Supermercado Aurora",
        doc: "80012345-6",
        estado: "Cobrada",
        pago: "Contado · efectivo",
        lineas: [{ nombre: "Aceite Girasol 900ml", cantidad: 2, precio: 11500, iva: "10%" }],
      };
      ventasPorClave.set(clave, v);
      return json(201, v);
    }
    if (u.pathname === "/ventas" && req.method === "GET") return json(200, []);
    if (u.pathname === "/falla") return json(500, { error: "roto" });
    return json(404, { error: "no existe" });
  });
});
await new Promise((r) => server.listen(5610, "127.0.0.1", r));

process.env.NEXT_PUBLIC_BACKEND = "http";
process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:5610";
const { httpRepo, setToken } = await import("../src/lib/repo/http.ts");
setToken("token-de-prueba");

t("clientes: traduce los campos de la API", async () => {
  const [c] = await httpRepo.clientes.list({ q: "aurora" });
  if (c.nombre !== "Supermercado Aurora") throw new Error("nombre: " + c.nombre);
  if (c.saldo !== 450000) throw new Error("saldo: " + c.saldo);
  if (c.compras !== 12) throw new Error("compras: " + c.compras);
  if (c.estado !== "Activo") throw new Error("estado por defecto: " + c.estado);
  const ult = recibido.at(-1);
  if (ult.query.q !== "aurora") throw new Error("no mandó el filtro q");
  if (ult.auth !== "Bearer token-de-prueba") throw new Error("no mandó el token: " + ult.auth);
});

t("productos: lo que no viene toma un valor razonable", async () => {
  const [p] = await httpRepo.inventario.list();
  if (p.precio !== 11500 || p.stock !== 240) throw new Error(JSON.stringify(p));
  if (p.unidad !== "UN") throw new Error("unidad por defecto: " + p.unidad);
  if (p.metodo !== "CPP") throw new Error("metodo por defecto: " + p.metodo);
});

t("venta: se registra y vuelve traducida", async () => {
  const v = await httpRepo.ventas.create({
    clienteId: "c1",
    lineas: [{ prodId: "p1", cantidad: 2, precio: 11500, iva: "10%" }],
    pago: { tipo: "contado", metodo: "efectivo" },
    moneda: "PYG",
  });
  if (!v.numero.startsWith("VTA-")) throw new Error("numero: " + v.numero);
  if (v.lineas[0].qty !== 2) throw new Error("la cantidad tiene que llegar como qty");
  const ult = recibido.at(-1);
  if (!ult.idempotencia) throw new Error("la venta salió SIN clave de idempotencia");
  if (ult.cuerpo.pago.tipo !== "contado") throw new Error("no mandó el pago");
});

t("dos ventas distintas llevan claves distintas", async () => {
  const antes = recibido.length;
  await httpRepo.ventas.create({ clienteId: "c1", lineas: [], pago: { tipo: "contado", metodo: "efectivo" }, moneda: "PYG" });
  await httpRepo.ventas.create({ clienteId: "c1", lineas: [], pago: { tipo: "contado", metodo: "efectivo" }, moneda: "PYG" });
  const [a, b] = recibido.slice(antes);
  if (!a.idempotencia || !b.idempotencia) throw new Error("falta clave");
  if (a.idempotencia === b.idempotencia) {
    throw new Error("dos ventas distintas salieron con la MISMA clave: la segunda se perdería");
  }
});

t("un error de la API llega con su status, no como 'algo falló'", async () => {
  const { request, ApiError } = await import("../src/lib/repo/http.ts");
  let err = null;
  try { await request("/falla"); } catch (e) { err = e; }
  if (!(err instanceof ApiError)) throw new Error("no fue ApiError");
  if (err.status !== 500) throw new Error("status: " + err.status);
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

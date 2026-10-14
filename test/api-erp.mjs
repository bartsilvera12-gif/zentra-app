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
/** Lo pone en true la prueba que simula un usuario fuera de toda cola. */
let fueraDeCola = false;
/** Lo pone en true la prueba que simula el ERP sin el arreglo de una línea. */
let inboxCaido = false;
const ventasPorClave = new Map();
const comprasPorClave = new Map();
/** Catálogos del ERP: arrancan con una categoría ya creada, en mayúsculas. */
const catsProducto = [{ id: "cat1", nombre: "BEBIDAS" }];
const catsProveedor = [{ id: "pcat1", nombre: "BEBIDAS" }];

const server = createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (d) => (cuerpo += d));
  req.on("end", () => {
    const u = new URL(req.url, "http://x");
    // El ERP es un Next.js: sus rutas viven bajo /api. El servidor simulado
    // monta igual, así se prueba también que la app arme bien la URL base.
    if (!u.pathname.startsWith("/api/")) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ success: false, error: "fuera de /api: " + u.pathname }));
    }
    const ruta = u.pathname.slice("/api".length);
    recibido.push({
      metodo: req.method,
      ruta,
      query: Object.fromEntries(u.searchParams),
      auth: req.headers.authorization || null,
      idempotencia: req.headers["idempotency-key"] || null,
      // El multipart no es JSON; se guarda crudo para poder mirarlo.
      cuerpo: cuerpo ? (cuerpo.trimStart().startsWith("{") ? JSON.parse(cuerpo) : cuerpo) : null,
    });
    const json = (c, b) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };

    // El ERP envuelve todo en { success, data } y devuelve sus columnas crudas.
    const ok = (data) => json(200, { success: true, data });

    // El perfil NO viene envuelto en { success, data } como el resto, y no
    // trae el nombre de la empresa: sólo su data_schema.
    if (ruta === "/usuarios/me") {
      return json(200, {
        usuario: {
          id: "u1", nombre: "Ulises Gomez", rol: "vendedor_movil",
          email: "ulises@jm.com.py", data_schema: "zentra_jm",
          es_project_manager: false,
        },
      });
    }
    // Un usuario del ERP sin el nombre cargado.
    if (ruta === "/usuarios/me-sin-nombre") {
      return json(200, { usuario: { id: "u2", nombre: null, email: "sinnombre@jm.com.py" } });
    }
    if (ruta === "/clientes" && req.method === "GET") {
      return ok([{
        id: "c1", nombre: null, razon_social: "Supermercado Aurora SA", empresa: null,
        nombre_contacto: "Lucia Benitez", ruc_factura: "80012345-6", ruc: "999",
        telefono: null, telefono_secundario: "0981", ciudad: "Asuncion",
        tipo_cliente: "Mayorista", baja_operativa_at: null, created_at: "2024-03-15T00:00:00Z",
      }]);
    }
    if (ruta === "/productos" && req.method === "GET") {
      return ok([
        { id: "p1", nombre: "MUSLO PAQUETE CONG. POR KG", sku: "73", precio_venta: 10650.6,
          costo_promedio: 8800.4, stock_actual: 0.5, stock_minimo: 0, tipo_iva: "5%", unidad_medida: "KG" },
        { id: "p2", nombre: "PAPAS PRE FRITAS", sku: "2590", precio_venta: 15900,
          costo_promedio: 13100, stock_actual: 1, stock_minimo: 0, tipo_iva: "10%" },
        { id: "p3", nombre: "LIBRO", sku: "LIB", precio_venta: 20000,
          costo_promedio: 15000, stock_actual: 2, stock_minimo: 0, tipo_iva: "EXENTA" },
      ]);
    }
    if (ruta === "/ventas/create" && req.method === "POST") {
      const o = JSON.parse(cuerpo);
      // Los dos ERPs hacen Number(o.subtotal) y cortan si sale NaN. Si la app
      // no manda los totales arriba, ninguna venta entra.
      const declarados = [o.subtotal, o.monto_iva, o.total].map(Number);
      if (declarados.some((n) => Number.isNaN(n))) {
        return json(400, { success: false, error: "Totales inválidos." });
      }
      const clave = req.headers["idempotency-key"];
      // Lo que tiene que hacer el ERP: misma clave, misma venta.
      if (ventasPorClave.has(clave)) {
        return json(200, { success: true, data: { venta: ventasPorClave.get(clave) } });
      }
      // Como lo devuelven de verdad: sin estado ni cliente, y envuelto dos
      // veces — { success, data: { venta } }.
      const v = {
        id: "v" + (ventasPorClave.size + 1),
        numero_control: "VTA-00000" + (ventasPorClave.size + 7),
        fecha: "2026-10-05T10:00:00Z",
        moneda: o.moneda,
        tipo_venta: o.tipo_venta,
        plazo_dias: o.plazo_dias,
        subtotal: declarados[0], monto_iva: declarados[1], total: declarados[2],
        items: o.items,
      };
      ventasPorClave.set(clave, v);
      return json(201, { success: true, data: { venta: v } });
    }
    // Como lo devuelve Sistemas Propio: en su sobre, sin estado y sin cliente.
    if (ruta === "/ventas" && req.method === "GET") {
      return ok({ ventas: [
        { id: "vh1", numero_control: "VTA-000100", fecha: "2026-10-05T09:00:00Z",
          tipo_venta: "CONTADO", moneda: "GS", total: 31800,
          items: [{ producto_nombre: "PAPAS PRE FRITAS", cantidad: 2, precio_venta: 15900, tipo_iva: "10%" }] },
        { id: "vh2", numero_control: "VTA-000101", fecha: "2026-10-04T09:00:00Z",
          tipo_venta: "CREDITO", plazo_dias: 30, moneda: "GS", total: 20000,
          items: [{ producto_nombre: "LIBRO", cantidad: 1, precio_venta: 20000, tipo_iva: "EXENTA" }] },
      ] });
    }
    // Estos dos sí traducen del lado del ERP, y van en su propio sobre.
    if (ruta === "/proveedores" && req.method === "GET") {
      return ok({ proveedores: [{
        id: "pr1", nombre: "Distribuidora del Este", ruc: "80011222-3",
        telefono: "0981 111 222", email: null, direccion: "Ciudad del Este",
        contacto: "Mario Ruiz", estado: "activo",
        condicion_pago: "credito", plazo_pago_dias: 30,
        categorias: [{ nombre: "Bebidas" }],
      }] });
    }
    if (ruta === "/compras" && req.method === "GET") {
      return ok({ compras: [{
        id: "k1", numero_control: "CMP-000045", proveedor_id: "pr1",
        producto_nombre: "GASEOSA 2L", cantidad: 24, costo_unitario: 48000.4,
        iva_tipo: "10%", tipo_pago: "CREDITO", plazo_dias: 30, cuotas: 1,
        estado: "pendiente", fecha: "2026-10-01T00:00:00Z",
        numero_comprobante: "001-001-0000045", nro_timbrado: "12345678",
      }] });
    }
    // El endpoint que respeta el rol. En los ERP de hoy contesta 401 desde el
    // APK porque no le pasa el pedido a su propia autenticación.
    if (ruta === "/chat/mobile-inbox") {
      if (inboxCaido) return json(401, { success: false, error: "No autenticado" });
      return ok({ conversations: [
        { id: "c1", status: "open", last_message_at: "2026-10-05T14:03:00Z",
          last_message_preview: "Buenas, tenes stock?", unread_count: 2,
          contact_nombre: "Lucia Benitez", contact_telefono: "0981 555 123" },
        { id: "c2", status: "open", last_message_at: "2026-10-05T15:00:00Z",
          last_message_preview: "Gracias!", unread_count: 0,
          contact_nombre: "Edgar Maldonado", contact_telefono: "0973 549 547" },
        // Los ERP no se ponen de acuerdo en como se llama esta columna, y sin
        // el numero el globito de no leidos no aparece nunca.
        { id: "c3", contact_nombre: "Otro ERP", no_leidos: 5 },
        { id: "c4", contact_nombre: "ERP en camello", unreadCount: "7" },
      ] });
    }
    if (ruta === "/chat/messages") {
      if (inboxCaido) return json(401, { success: false, error: "No autenticado" });
      if (u.searchParams.get("conversation_id") === "con-foto") {
        return ok([{ id: "m1", from_me: false, content: "", message_type: "image", created_at: "2026-10-05T14:03:00Z" }]);
      }
      if (u.searchParams.get("conversation_id") === "con-reacciones") {
        return ok([
          // Mio, y el cliente le reacciona: el emoji va de MI lado.
          { id: "m1", from_me: true, content: "Te paso precios", message_type: "text", created_at: "2026-10-05T14:00:00Z" },
          { id: "m2", from_me: false, content: "[reaction]", message_type: "reaction", created_at: "2026-10-05T14:01:00Z",
            raw_payload: { reaction: { emoji: "\u{1F44D}", key: { fromMe: true, id: "w1" } } } },
          // De el, y yo le reacciono: va de SU lado.
          { id: "m3", from_me: false, content: "Gracias!", message_type: "text", created_at: "2026-10-05T14:02:00Z" },
          { id: "m4", from_me: true, content: "[reaction]", message_type: "reaction", created_at: "2026-10-05T14:03:00Z",
            raw_payload: { whatsappMessage: { reaction: { text: "\u{2764}", key: { from_me: false, id: "w3" } } } } },
          // Reaccion retirada: emoji vacio. No se dibuja nada.
          { id: "m5", from_me: false, content: "[reaction]", message_type: "reaction", created_at: "2026-10-05T14:04:00Z",
            raw_payload: { reaction: { emoji: "", key: { fromMe: true, id: "w1" } } } },
          // Sin `key`: no se sabe de que lado, se cae al de quien reacciono.
          { id: "m6", from_me: true, content: "[reaction]", message_type: "reaction", created_at: "2026-10-05T14:05:00Z",
            raw_payload: { reaction: { emoji: "\u{1F602}" } } },
        ]);
      }
      return ok([
        { id: "m1", from_me: false, content: "Buenas, tenes stock?", message_type: "text", created_at: "2026-10-05T14:03:00Z" },
        { id: "m2", from_me: true, content: "Si, te paso precios", message_type: "text", created_at: "2026-10-05T14:05:00Z", whatsapp_delivery_status: "read" },
      ]);
    }
    // Las conversaciones usan su propio sobre: { ok, ... }
    if (ruta === "/mobile/asesor/conversations") {
      // Como contesta el ERP a alguien que no atiende chats: lista vacía, pero
      // con la bandera que explica por qué.
      if (fueraDeCola) return json(200, { ok: true, is_agent: false, conversations: [] });
      return json(200, { ok: true, is_agent: true, conversations: [{
        id: "c1", status: "open", last_message_at: "2026-10-05T14:03:00Z",
        last_message_preview: "Buenas, tenes stock?", unread_count: 2,
        contact_nombre: "Lucia Benitez", contact_telefono: "0981 555 123",
      }] });
    }
    if (ruta === "/mobile/asesor/conversations/c1") {
      return json(200, { ok: true,
        conversation: { id: "c1", contact_nombre: "Lucia Benitez", contact_telefono: "0981 555 123" },
        messages: [
          { id: "m1", from_me: false, content: "Buenas, tenes stock?", message_type: "text", created_at: "2026-10-05T14:03:00Z" },
          { id: "m2", from_me: true, content: "Si, te paso precios", message_type: "text", created_at: "2026-10-05T14:05:00Z", whatsapp_delivery_status: "read" },
        ] });
    }
    if (ruta === "/mobile/asesor/conversations/sin-nombre") {
      return json(200, { ok: true,
        conversation: { id: "x", contact_nombre: null, contact_telefono: "0981 555 123" }, messages: [] });
    }
    if (ruta === "/mobile/asesor/conversations/con-foto") {
      return json(200, { ok: true, conversation: { id: "f", contact_nombre: "Ana" },
        messages: [{ id: "m1", from_me: false, content: "", message_type: "image", created_at: "2026-10-05T14:03:00Z" }] });
    }
    if (/\/mobile\/asesor\/conversations\/[^/]+\/send-media$/.test(ruta) && req.method === "POST") {
      return json(200, { ok: true });
    }
    if (/\/mobile\/asesor\/conversations\/[^/]+\/send-sticker$/.test(ruta) && req.method === "POST") {
      const o = JSON.parse(cuerpo || "{}");
      if (!o.sticker_url) return json(400, { ok: false, error: "Se requiere sticker_url" });
      return json(200, { ok: true });
    }
    // ── Catálogos de inventario: el ERP los guarda por id, no por nombre ──
    if (ruta === "/inventario/categorias" && req.method === "GET") {
      return ok({ categorias: catsProducto });
    }
    if (ruta === "/inventario/categorias" && req.method === "POST") {
      const o = JSON.parse(cuerpo || "{}");
      if (!o.nombre) return json(400, { success: false, error: "El nombre es obligatorio." });
      // El ERP normaliza a mayúsculas, como hace de verdad.
      const row = { id: "cat" + (catsProducto.length + 1), nombre: String(o.nombre).toUpperCase() };
      catsProducto.push(row);
      return ok({ categoria: row });
    }
    if (ruta === "/inventario/ubicaciones" && req.method === "GET") {
      return ok({ ubicaciones: [{ id: "ubi1", nombre: "DEPOSITO CENTRAL" }] });
    }
    if (ruta === "/proveedores/categorias" && req.method === "GET") {
      return ok({ categorias: catsProveedor });
    }
    if (ruta === "/proveedores/categorias" && req.method === "POST") {
      const o = JSON.parse(cuerpo || "{}");
      const row = { id: "pcat" + (catsProveedor.length + 1), nombre: String(o.nombre).toUpperCase() };
      catsProveedor.push(row);
      return ok({ categoria: row });
    }
    // ── Alta y corrección de producto ──
    if (ruta === "/productos" && req.method === "POST") {
      const o = JSON.parse(cuerpo || "{}");
      if (!o.nombre) return json(400, { success: false, error: "El nombre es obligatorio." });
      if (!o.sku) return json(400, { success: false, error: "El SKU es obligatorio." });
      return ok({ producto: { ...o, id: "pnuevo" }, warning: null });
    }
    if (ruta === "/productos/p1" && req.method === "PATCH") {
      const o = JSON.parse(cuerpo || "{}");
      return ok({ producto: { id: "p1", nombre: "MUSLO", sku: "73", ...o } });
    }
    // ── Alta y corrección de proveedor ──
    if (ruta === "/proveedores" && req.method === "POST") {
      const o = JSON.parse(cuerpo || "{}");
      if (!o.nombre) return json(400, { success: false, error: "La razón social es obligatoria." });
      if (o.ruc === "80011222-3") {
        return json(409, { success: false, error: 'Ya existe un proveedor con el mismo RUC ("Distribuidora del Este").' });
      }
      return ok({ proveedor: { ...o, id: "prnuevo", estado: "activo", categorias: catsProveedor.filter((c) => (o.categoria_ids || []).includes(c.id)) } });
    }
    if (ruta === "/proveedores/pr1" && req.method === "PATCH") {
      const o = JSON.parse(cuerpo || "{}");
      return ok({ proveedor: { id: "pr1", nombre: "Distribuidora del Este", ...o } });
    }
    // ── Movimientos de inventario ──
    if (ruta === "/inventario/movimientos") {
      return ok({ movimientos: [
        { id: "mv1", producto_id: "p1", tipo: "inventario_inicial", cantidad: 10,
          origen: "Alta de producto", referencia: "INI-1", fecha: "2026-10-01T08:00:00Z", usuario_nombre: "Karen" },
        // El ERP guarda las salidas en negativo; la app muestra el signo por el tipo.
        { id: "mv2", producto_id: "p1", tipo: "venta", cantidad: -3,
          origen: "Venta VTA-000100", referencia: "VTA-000100", fecha: "2026-10-02T08:00:00Z" },
        { id: "mv3", producto_id: "p2", tipo: "ajuste_negativo", cantidad: -1,
          origen: "Ajuste", referencia: "AJ-1", fecha: "2026-10-03T08:00:00Z" },
        // Un tipo que la app no conoce: manda el signo de la cantidad.
        { id: "mv4", producto_id: "p2", tipo: "transferencia_entre_depositos", cantidad: 5,
          origen: "Traslado", referencia: "TR-1", fecha: "2026-10-04T08:00:00Z" },
      ] });
    }
    // ── Plan de cuentas y alta de compra ──
    if (ruta === "/plan-cuentas/opciones") {
      return ok({ cuentas: [
        { id: "pc1", cuenta: "1.1.03.001", denominacion: "Mercaderías" },
        { id: "pc2", cuenta: "1.1.01.001", denominacion: "Caja" },
      ] });
    }
    if (ruta === "/compras" && req.method === "POST") {
      const o = JSON.parse(cuerpo || "{}");
      if (!o.nro_timbrado) return json(400, { success: false, error: "Falta el N° de timbrado." });
      if (!Array.isArray(o.items) || o.items.length === 0) {
        return json(400, { success: false, error: "Falta el producto." });
      }
      for (const [i, it] of o.items.entries()) {
        if (!it.cuenta_contable_id) {
          return json(400, { success: false, error: `Línea ${i + 1}: seleccioná la cuenta contable.` });
        }
        if (!["exenta", "5", "10"].includes(it.iva_tipo)) {
          return json(400, { success: false, error: `Línea ${i + 1}: tipo de IVA inválido.` });
        }
      }
      // Misma clave, misma compra: el reintento no duplica el stock.
      if (o.idempotency_key && comprasPorClave.has(o.idempotency_key)) {
        return ok({ compra: comprasPorClave.get(o.idempotency_key) });
      }
      const total = o.items.reduce((a, it) => a + it.cantidad * it.costo_unitario, 0);
      const compra = {
        id: "knuevo", numero_control: "CMP-000046", proveedor_id: o.proveedor_id,
        producto_nombre: o.items[0].producto_nombre, cantidad: o.items.reduce((a, it) => a + it.cantidad, 0),
        costo_unitario: o.items[0].costo_unitario, iva_tipo: o.items[0].iva_tipo === "exenta" ? "EXENTA" : o.items[0].iva_tipo + "%",
        tipo_pago: o.tipo_pago, plazo_dias: o.plazo_dias, cuotas: o.cuotas,
        estado: o.tipo_pago === "credito" ? "pendiente" : "pagada",
        fecha: "2026-10-14T00:00:00Z", total,
        numero_comprobante: o.numero_comprobante, nro_timbrado: o.nro_timbrado,
      };
      if (o.idempotency_key) comprasPorClave.set(o.idempotency_key, compra);
      return ok({ compra });
    }
    if (ruta === "/falla") return json(500, { success: false, error: "La caja no esta abierta." });
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

t("la venta manda los totales arriba, y son la suma exacta de las líneas", async () => {
  const antes = recibido.length;
  await httpRepo.ventas.create({
    clienteId: "c1", moneda: "PYG",
    pago: { tipo: "contado", metodo: "efectivo" },
    lineas: [
      { prodId: "p2", cantidad: 2, precio: 15900, iva: "10%" },
      { prodId: "p3", cantidad: 1, precio: 20000, iva: "Exenta" },
    ],
  });
  const env = recibido.slice(antes).find((r) => r.ruta === "/ventas/create").cuerpo;

  // Sin estos tres el ERP corta con "Totales inválidos." y no entra ninguna venta.
  for (const k of ["subtotal", "monto_iva", "total"]) {
    if (typeof env[k] !== "number") throw new Error("falta " + k);
  }
  // Y no son decorativos: son los que el ERP guarda. Si no cierran con las
  // líneas, la venta queda con un total que no coincide con lo que la compone.
  const suma = env.items.reduce(
    (a, i) => ({ s: a.s + i.subtotal, i: a.i + i.monto_iva, t: a.t + i.total_linea }),
    { s: 0, i: 0, t: 0 },
  );
  if (env.subtotal !== suma.s) throw new Error(`subtotal ${env.subtotal} vs ${suma.s}`);
  if (env.monto_iva !== suma.i) throw new Error(`monto_iva ${env.monto_iva} vs ${suma.i}`);
  if (env.total !== suma.t) throw new Error(`total ${env.total} vs ${suma.t}`);

  // 2 x 15.900 al 10% = 2.891 de IVA contenido; el libro va exento.
  if (env.total !== 51800) throw new Error("total: " + env.total);
  if (env.monto_iva !== 2891) throw new Error("iva: " + env.monto_iva);
});

t("la venta creada se saca del { venta } de adentro, con su número", async () => {
  const v = await httpRepo.ventas.create({
    clienteId: "c1", moneda: "PYG",
    pago: { tipo: "contado", metodo: "efectivo" },
    lineas: [{ prodId: "p2", cantidad: 1, precio: 15900, iva: "10%" }],
  });
  // El número lo asigna el ERP: la app nunca inventa un comprobante.
  if (!/^VTA-/.test(v.numero)) throw new Error("numero: " + v.numero);
  // Recién creada no trae estado; de contado ya está cobrada.
  if (v.estado !== "Cobrada") throw new Error("estado: " + v.estado);
});

t("una venta a crédito queda pendiente, no cobrada", async () => {
  const v = await httpRepo.ventas.create({
    clienteId: "c1", moneda: "PYG",
    pago: { tipo: "credito", plazoDias: 30 },
    lineas: [{ prodId: "p2", cantidad: 1, precio: 15900, iva: "10%" }],
  });
  // Mostrar una venta a crédito como cobrada esconde plata sin cobrar.
  if (v.estado !== "Pendiente") throw new Error("estado: " + v.estado);
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

t("la URL base se escribe como host y termina en /api, sin duplicar", async () => {
  const { urlDeApi } = await import("../src/lib/config.ts");
  const esperado = "https://api.neura.com.py/api";
  for (const crudo of [
    "https://api.neura.com.py",
    "https://api.neura.com.py/",
    "https://api.neura.com.py///",
    "  https://api.neura.com.py/  ",
    // Quien ya lo escribió con /api no termina con /api/api/, que da un 404 que
    // parece "el endpoint no existe".
    "https://api.neura.com.py/api",
    "https://api.neura.com.py/api/",
  ]) {
    const vista = urlDeApi(crudo);
    if (vista !== esperado) throw new Error(`${JSON.stringify(crudo)} -> ${vista}`);
  }
  // Vacío queda vacío: de eso se queja assertConfig, no esta función.
  if (urlDeApi(undefined) !== "" || urlDeApi("  ") !== "") throw new Error("vacío no quedó vacío");
});

t("el perfil sale de /usuarios/me, que no viene envuelto", async () => {
  const { leerPerfil } = await import("../src/lib/repo/http.ts");
  const p = await leerPerfil();
  if (p.id !== "u1") throw new Error("id: " + p.id);
  if (p.nombre !== "Ulises Gomez") throw new Error("nombre: " + p.nombre);
  if (p.rol !== "vendedor_movil") throw new Error("rol: " + p.rol);
  // El ERP no manda el nombre de la empresa, sólo su data_schema. Mostrarle
  // "zentra_jm" a un vendedor seria mostrarle jerga de base de datos.
  if (p.empresa !== "") throw new Error("empresa deberia salir del directorio: " + p.empresa);
});

t("sin nombre cargado, el perfil cae al correo y no queda vacio", async () => {
  const { request } = await import("../src/lib/repo/http.ts");
  const r = await request("/usuarios/me-sin-nombre");
  // Se arma igual que leerPerfil, pero sobre la fila sin nombre.
  const nombre = r.usuario.nombre || r.usuario.email;
  if (nombre !== "sinnombre@jm.com.py") throw new Error("nombre: " + nombre);
});

t("proveedores y compras salen del sobre { proveedores } y { compras }", async () => {
  const provs = await httpRepo.proveedores.list();
  if (provs.length !== 1) throw new Error("proveedores: " + provs.length);
  if (provs[0].nombre !== "Distribuidora del Este") throw new Error("nombre: " + provs[0].nombre);
  // condicion_pago credito + plazo arma el texto que ve la persona.
  if (provs[0].condicion !== "Crédito 30 días") throw new Error("condicion: " + provs[0].condicion);
  if (provs[0].estado !== "Activo") throw new Error("estado: " + provs[0].estado);

  const compras = await httpRepo.compras.list();
  if (compras.length !== 1) throw new Error("compras: " + compras.length);
  // Lo que el ERP no da por pagado queda pendiente: al reves se deja de pagar
  // a un proveedor.
  if (compras[0].estado !== "Pendiente") throw new Error("estado: " + compras[0].estado);
  if (compras[0].pago !== "Crédito") throw new Error("pago: " + compras[0].pago);
  if (compras[0].costo !== 48000) throw new Error("costo: " + compras[0].costo);
});

t("sin estado en el listado, se deriva del tipo y no queda todo pendiente", async () => {
  // Sistemas Propio no selecciona `estado`; JM sí. Con el primero, TODAS las
  // ventas se veían pendientes y el reporte mostraba cobranza cero.
  const vs = await httpRepo.ventas.list({ desde: "2026-10-01", hasta: "2026-10-31" });
  if (vs.length !== 2) throw new Error("ventas: " + vs.length);
  if (vs[0].estado !== "Cobrada") throw new Error("la de contado tenía que estar cobrada");
  if (vs[1].estado !== "Pendiente") throw new Error("la de crédito tenía que estar pendiente");
  if (vs[0].numero !== "VTA-000100") throw new Error("numero: " + vs[0].numero);
  // El listado viene en su sobre, igual que productos y proveedores.
  if (vs[0].lineas.length !== 1) throw new Error("no leyó las líneas");
});

t("un administrador ve todas: se usa el endpoint que respeta el rol", async () => {
  const cs = await httpRepo.chats.list();
  // El de asesor devuelve una sola; el que respeta el rol, las cuatro.
  if (cs.length !== 4) throw new Error("conversaciones: " + cs.length);
  if (cs[0].nombre !== "Lucia Benitez") throw new Error("nombre: " + cs[0].nombre);
  if (cs[0].noLeidos !== 2) throw new Error("no leidos: " + cs[0].noLeidos);
});

t("el numero de no leidos se lee aunque el ERP le diga de otra forma", async () => {
  const cs = await httpRepo.chats.list();
  const por = (n) => cs.find((c) => c.nombre === n);
  if (por("Otro ERP").noLeidos !== 5) throw new Error("no_leidos: " + por("Otro ERP").noLeidos);
  // Y como texto, que es como lo manda mas de uno.
  if (por("ERP en camello").noLeidos !== 7) throw new Error("unreadCount: " + por("ERP en camello").noLeidos);
  // Cero sigue siendo cero, no "no vino el campo".
  if (por("Edgar Maldonado").noLeidos !== 0) throw new Error("cero deberia quedar en cero");
});

t("la reaccion se alinea con el mensaje al que reacciona, no con quien reacciono", async () => {
  const d = await httpRepo.chats.get("con-reacciones");
  const reacciones = d.msgs.filter((m) => m.reaccion);
  // Son tres: la retirada no se dibuja.
  if (reacciones.length !== 3) throw new Error("reacciones dibujadas: " + reacciones.length);

  // El cliente reacciona a MI mensaje: el emoji va de mi lado.
  const pulgar = reacciones.find((m) => m.reaccion === "\u{1F44D}");
  if (!pulgar) throw new Error("se perdio el pulgar");
  if (pulgar.de !== "ellos") throw new Error("reacciono el cliente, no yo");
  if (pulgar.reaccionSobreMio !== true) throw new Error("tenia que ir de mi lado");

  // Yo reacciono al mensaje DE EL: va de su lado. Y el emoji viene en `text`.
  const corazon = reacciones.find((m) => m.reaccion === "\u{2764}");
  if (!corazon) throw new Error("no leyo el emoji de `text`");
  if (corazon.reaccionSobreMio !== false) throw new Error("tenia que ir de su lado");

  // Sin `key` no se sabe: se cae al lado de quien reacciono, que fui yo.
  const risa = reacciones.find((m) => m.reaccion === "\u{1F602}");
  if (risa.reaccionSobreMio !== true) throw new Error("sin key deberia caer en quien reacciono");
});

t("sacar una reaccion no deja un pulgar que nadie puso", async () => {
  const d = await httpRepo.chats.get("con-reacciones");
  // El mensaje m5 es una reaccion con el emoji vacio: es un retiro.
  if (d.msgs.some((m) => m.reaccion === "\u{1F44D}" && m.reaccionSobreMio === true && m.de === "ellos" && m.hora === "14:04")) {
    throw new Error("el retiro se dibujo como pulgar");
  }
  if (d.msgs.length !== 5) throw new Error("tenian que quedar 5 de 6: " + d.msgs.length);
});

t("si ese endpoint no autentica, cae en el de asesor en vez de romperse", async () => {
  // Es lo que pasa hoy en los ERP sin el arreglo de una linea.
  inboxCaido = true;
  try {
    const cs = await httpRepo.chats.list();
    if (cs.length !== 1) throw new Error("no cayo en el respaldo: " + cs.length);
    const d = await httpRepo.chats.get("c1");
    if (d.msgs.length !== 2) throw new Error("mensajes: " + d.msgs.length);
  } finally {
    inboxCaido = false;
  }
});

t("sin contacto cargado, la conversacion se nombra por el telefono", async () => {
  // El nombre sale del listado: el endpoint de mensajes no trae el contacto.
  inboxCaido = true;
  try {
    const d = await httpRepo.chats.get("sin-nombre");
    if (d.nombre !== "0981 555 123") throw new Error("nombre: " + d.nombre);
  } finally {
    inboxCaido = false;
  }
});

t("quien no esta en ninguna cola no ve una lista vacia, ve por que", async () => {
  // "No tenes conversaciones" y "no atendes chats" son cosas distintas: con la
  // primera alguien se queda esperando un mensaje que nunca le iba a llegar.
  const { SinCola } = await import("../src/lib/repo/http.ts");
  // Hace falta que los dos caminos digan lo suyo: el que respeta el rol sin
  // autenticar, y el de asesor avisando que no hay cola.
  inboxCaido = true;
  fueraDeCola = true;
  try {
    let err = null;
    try { await httpRepo.chats.list(); } catch (e) { err = e; }
    if (!(err instanceof SinCola)) throw new Error("no avisó que está fuera de cola: " + err);
  } finally {
    fueraDeCola = false;
    inboxCaido = false;
  }
  // Y con el endpoint que respeta el rol, la lista sale completa.
  if ((await httpRepo.chats.list()).length !== 4) throw new Error("tenía que listarlas todas");
});

t("al abrir una conversacion llegan sus mensajes, con el tick del propio", async () => {
  const d = await httpRepo.chats.get("c1");
  void d;
  if (!d) throw new Error("no trajo la conversacion");
  // El listado sólo trae la vista previa: sin esto se veria un solo globo.
  if (d.msgs.length !== 2) throw new Error("mensajes: " + d.msgs.length);
  if (d.msgs[1].de !== "yo") throw new Error("el segundo era nuestro");
  if (d.msgs[1].tick !== "✓✓") throw new Error("leido lleva doble tilde: " + d.msgs[1].tick);
});

t("una foto no queda como globo vacio: dice que era", async () => {
  const d = await httpRepo.chats.get("con-foto");
  if (!/Foto/.test(d.msgs[0].texto)) throw new Error("texto: " + d.msgs[0].texto);
});

t("una foto viaja como multipart, con su nombre y su tipo", async () => {
  const antes = recibido.length;
  const foto = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
  const m = await httpRepo.chats.enviarArchivo("c1", foto, "comprobante.png");
  const env = recibido.slice(antes).find((r) => /send-media/.test(r.ruta));
  if (!env) throw new Error("no llegó a send-media");
  // Lo que importa del multipart: el archivo con su nombre y su tipo.
  if (!/name="file"/.test(env.cuerpo)) throw new Error("falta el campo file");
  if (!/filename="comprobante.png"/.test(env.cuerpo)) throw new Error("falta el nombre");
  if (!/image\/png/.test(env.cuerpo)) throw new Error("falta el tipo");
  // Y el globo que se ve dice qué era, no queda vacío.
  if (m.texto !== "📷 Foto") throw new Error("vista previa: " + m.texto);
});

t("un audio se reconoce por su tipo, no por el nombre del archivo", async () => {
  const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/ogg" });
  const m = await httpRepo.chats.enviarArchivo("c1", audio, "x.bin");
  if (m.texto !== "🎤 Audio") throw new Error("vista previa: " + m.texto);
});

t("el pie del archivo manda como caption y reemplaza al globo generico", async () => {
  const antes = recibido.length;
  const foto = new Blob([new Uint8Array([1])], { type: "image/jpeg" });
  const m = await httpRepo.chats.enviarArchivo("c1", foto, "f.jpg", "Te paso el comprobante");
  const env = recibido.slice(antes).find((r) => /send-media/.test(r.ruta));
  if (!/name="caption"/.test(env.cuerpo)) throw new Error("no mandó el caption");
  if (m.texto !== "Te paso el comprobante") throw new Error("vista previa: " + m.texto);
});

t("el sticker manda su URL, que es lo que el ERP pide", async () => {
  const antes = recibido.length;
  const m = await httpRepo.chats.enviarSticker("c1", "https://x.com/s.webp");
  const env = recibido.slice(antes).find((r) => /send-sticker/.test(r.ruta));
  if (env.cuerpo.sticker_url !== "https://x.com/s.webp") throw new Error("url: " + env.cuerpo.sticker_url);
  if (m.sticker !== "https://x.com/s.webp") throw new Error("el mensaje no quedó con el sticker");
});

t("adentro del APK sale por nativo, y así el CORS no aplica", async () => {
  const { transporte } = await import("../src/lib/repo/http.ts");
  if (transporte() !== "navegador") throw new Error("sin Capacitor debería ser navegador");

  // Lo que Capacitor inyecta en el WebView del APK.
  globalThis.Capacitor = { isNativePlatform: () => true };
  try {
    if (transporte() !== "nativo") throw new Error("con Capacitor debería ser nativo");
  } finally {
    delete globalThis.Capacitor;
  }

  // Y una app web no se cuelga del global: ahí sí hace falta CORS.
  globalThis.Capacitor = { isNativePlatform: () => false };
  try {
    if (transporte() !== "navegador") throw new Error("en web debería ser navegador");
  } finally {
    delete globalThis.Capacitor;
  }
});

t("lo que no está implementado lo dice, no inventa datos", async () => {
  let msg = "";
  // Queda el ajuste de stock: el ERP no tiene POST de movimientos.
  try { await httpRepo.inventario.ajustar({ prodId: "p1", tipo: "AJUSTE", cantidad: 1, motivo: "x" }); }
  catch (e) { msg = e.message; }
  if (!/no está implementado/.test(msg)) throw new Error("mensaje poco claro: " + msg);
});

/* ─────────────── escrituras al ERP ─────────────── */

t("el alta de producto manda lo que el ERP pide y resuelve la categoría por nombre", async () => {
  const p = await httpRepo.inventario.create({
    nombre: "Gaseosa 2L", sku: "G2L", barras: "7790001", unidad: "UNIDAD",
    // Escrita en minúsculas y con otro acento: tiene que encontrar la que ya existe.
    categoria: "bebidas", deposito: "",
    costo: 10000, precio: 15000, iva: "10%", stockInicial: 12, minimo: 2, metodo: "CPP",
  });
  const env = recibido.filter((r) => r.ruta === "/productos" && r.metodo === "POST").at(-1);
  if (!env) throw new Error("no se mandó el alta");
  if (env.cuerpo.categoria_principal_id !== "cat1") {
    throw new Error("no reusó la categoría existente: " + env.cuerpo.categoria_principal_id);
  }
  if (env.cuerpo.stock_actual !== 12) throw new Error("no mandó el stock inicial");
  if (env.cuerpo.ubicacion_principal_id !== null) throw new Error("inventó un depósito");
  if (p.id !== "pnuevo") throw new Error("no devolvió el producto del ERP");
  // La categoría vuelve por nombre, no por id: es lo que se muestra en pantalla.
  if (p.categoria !== "BEBIDAS") throw new Error("categoría sin resolver: " + p.categoria);
});

t("una categoría que no existe se da de alta", async () => {
  await httpRepo.inventario.create({
    nombre: "Pan", sku: "PAN", barras: "", unidad: "UNIDAD",
    categoria: "Panificados", deposito: "",
    costo: 1000, precio: 2000, iva: "10%", stockInicial: 0, minimo: 0, metodo: "CPP",
  });
  const alta = recibido.find((r) => r.ruta === "/inventario/categorias" && r.metodo === "POST");
  if (!alta) throw new Error("no creó la categoría nueva");
  const env = recibido.filter((r) => r.ruta === "/productos" && r.metodo === "POST").at(-1);
  if (!env.cuerpo.categoria_principal_id) throw new Error("mandó el producto sin la categoría nueva");
});

t("la corrección manda sólo lo que cambió, y nunca el stock", async () => {
  await httpRepo.inventario.update("p1", { precio: 11000, minimo: 3 });
  const env = recibido.filter((r) => r.ruta === "/productos/p1" && r.metodo === "PATCH").at(-1);
  const claves = Object.keys(env.cuerpo).sort().join(",");
  if (claves !== "precio_venta,stock_minimo") throw new Error("mandó de más: " + claves);
  // El stock se mueve con un ajuste, que deja rastro. Pisarlo acá lo borraría.
  if ("stock_actual" in env.cuerpo) throw new Error("pisó el stock");
});

t("los movimientos vienen del ERP, en positivo y con el tipo traducido", async () => {
  const todos = await httpRepo.inventario.movimientos();
  if (todos.length !== 4) throw new Error("se perdieron movimientos: " + todos.length);
  const venta = todos.find((m) => m.id === "mv2");
  if (venta.tipo !== "SALIDA") throw new Error("una venta es una salida");
  if (venta.cant !== 3) throw new Error("la cantidad va en positivo: " + venta.cant);
  if (todos.find((m) => m.id === "mv1").tipo !== "ENTRADA") throw new Error("el inicial es entrada");
  if (todos.find((m) => m.id === "mv3").tipo !== "AJUSTE") throw new Error("el ajuste es ajuste");
  // Tipo desconocido: manda el signo, que es el dato duro.
  if (todos.find((m) => m.id === "mv4").tipo !== "ENTRADA") throw new Error("sin tipo, decide el signo");
  const deP1 = await httpRepo.inventario.movimientos({ prodId: "p1" });
  if (deP1.length !== 2) throw new Error("no filtró por producto");
  const salidas = await httpRepo.inventario.movimientos({ tipo: "SALIDA" });
  if (salidas.length !== 1) throw new Error("no filtró por tipo");
});

t("el alta de proveedor traduce ciudad, crédito y rubro", async () => {
  const pr = await httpRepo.proveedores.create({
    nombre: "Lacteos del Sur", doc: "80099888-1", rubro: "Bebidas, Lácteos",
    ciudad: "Encarnación", contacto: "Ana", tel: "0981 777 888", email: "ana@sur.com.py",
    credito: { plazoDias: 45 }, entregaDias: 3,
  });
  const env = recibido.filter((r) => r.ruta === "/proveedores" && r.metodo === "POST").at(-1);
  // El ERP no tiene columna de ciudad: es `direccion`, y es de donde la lee la app.
  if (env.cuerpo.direccion !== "Encarnación") throw new Error("perdió la ciudad");
  if (env.cuerpo.condicion_pago !== "credito" || env.cuerpo.plazo_pago_dias !== 45) {
    throw new Error("perdió el crédito");
  }
  // Dos rubros: uno ya existía, el otro se creó.
  if (env.cuerpo.categoria_ids.length !== 2) {
    throw new Error("rubros: " + JSON.stringify(env.cuerpo.categoria_ids));
  }
  if (pr.id !== "prnuevo") throw new Error("no devolvió el proveedor del ERP");
});

t("un RUC repetido se cuenta con las palabras del ERP", async () => {
  let msg = "";
  try {
    await httpRepo.proveedores.create({
      nombre: "Otro", doc: "80011222-3", rubro: "", ciudad: "", contacto: "", tel: "", email: "",
      credito: null, entregaDias: 1,
    });
  } catch (e) { msg = e.message; }
  if (!/mismo RUC/.test(msg)) throw new Error("mensaje perdido: " + msg);
});

t("la compra sin cuenta contable se frena antes de llegar al ERP", async () => {
  const antes = recibido.filter((r) => r.ruta === "/compras" && r.metodo === "POST").length;
  let msg = "";
  try {
    await httpRepo.compras.create({
      provId: "pr1", lineas: [{ prodId: "p1", nombre: "X", unidad: "UN", cantidad: 1, costo: 1000, iva: "10%" }],
      pago: { tipo: "contado" }, comprobante: { numero: "001", timbrado: "123" }, moneda: "PYG",
    });
  } catch (e) { msg = e.message; }
  if (!/cuenta contable/.test(msg)) throw new Error("mensaje poco claro: " + msg);
  const despues = recibido.filter((r) => r.ruta === "/compras" && r.metodo === "POST").length;
  if (despues !== antes) throw new Error("le pegó al ERP igual");
});

t("una compra al contado sin cuenta de pago tampoco sale", async () => {
  let msg = "";
  try {
    await httpRepo.compras.create({
      provId: "pr1", lineas: [{ prodId: "p1", nombre: "X", unidad: "UN", cantidad: 1, costo: 1000, iva: "10%" }],
      pago: { tipo: "contado" }, comprobante: { numero: "001", timbrado: "123" }, moneda: "PYG",
      cuentaContableId: "pc1",
    });
  } catch (e) { msg = e.message; }
  if (!/cuenta de pago/.test(msg)) throw new Error("mensaje poco claro: " + msg);
});

t("la compra va por el camino multilínea, con el IVA como lo quiere el ERP", async () => {
  const c = await httpRepo.compras.create({
    provId: "pr1",
    lineas: [
      { prodId: "p1", nombre: "Gaseosa", unidad: "UN", cantidad: 24, costo: 48000, iva: "10%" },
      { prodId: "p3", nombre: "Libro", unidad: "UN", cantidad: 2, costo: 20000, iva: "Exenta" },
      { prodId: "p2", nombre: "Papas", unidad: "KG", cantidad: 1, costo: 13100, iva: "5%" },
    ],
    pago: { tipo: "credito", plazoDias: 30, cuotas: 3 },
    comprobante: { numero: "001-001-0000046", timbrado: "16512345" },
    moneda: "PYG",
    cuentaContableId: "pc1",
    cuentaPagoId: "",
  });
  const env = recibido.filter((r) => r.ruta === "/compras" && r.metodo === "POST").at(-1);
  // Siempre `items`, aunque sea una sola línea: el camino de una exige el nuevo
  // precio de venta del producto, que la app no pregunta.
  if (!Array.isArray(env.cuerpo.items)) throw new Error("no usó el camino multilínea");
  const ivas = env.cuerpo.items.map((i) => i.iva_tipo).join(",");
  if (ivas !== "10,exenta,5") throw new Error("IVA mal traducido: " + ivas);
  if (env.cuerpo.items.some((i) => i.cuenta_contable_id !== "pc1")) {
    throw new Error("la cuenta no viaja en cada línea");
  }
  // A crédito la contrapartida puede ir vacía: el ERP usa su cuenta de proveedores.
  if (env.cuerpo.cuenta_contrapartida_id !== null) throw new Error("inventó una contrapartida");
  if (env.cuerpo.cuotas !== 3 || env.cuerpo.plazo_dias !== 30) throw new Error("perdió el crédito");
  if (!env.cuerpo.idempotency_key) throw new Error("sin clave de intento, un reintento duplica el stock");
  if (c.numero !== "CMP-000046") throw new Error("no devolvió la compra del ERP");
  if (c.pago !== "Crédito" || c.estado !== "Pendiente") throw new Error("mapeo de la compra: " + JSON.stringify(c));
});

t("el plan de cuentas se lee con el número y la denominación juntos", async () => {
  const cuentas = await httpRepo.compras.cuentas();
  if (cuentas.length !== 2) throw new Error("no leyó las cuentas");
  if (cuentas[0].codigo !== "1.1.03.001" || cuentas[0].nombre !== "Mercaderías") {
    throw new Error("mapeo: " + JSON.stringify(cuentas[0]));
  }
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
server.close();
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nAPI del ERP: todas las pruebas pasaron.");
process.exit(malas ? 1 : 0);

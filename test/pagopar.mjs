/**
 * El aviso de pago de Pagopar.
 *
 *   npm run test:pagopar
 *
 * Acá se decide si entra plata o no, así que lo que más se prueba es el
 * rechazo: un aviso sin firma, con firma ajena, o con el monto roto no puede
 * empujar el vencimiento de nadie.
 */
import { decidir, igualSinFiltrar, montoDe, respuestaParaPagopar, sha1 }
  from "../supabase/functions/pagopar-callback/logica.ts";

const casos = [];
const t = (nombre, fn) => casos.push([nombre, fn]);

const CLAVE = "clave-privada-de-prueba";
const HASH = "abc123hash";

/** Un aviso bien firmado, como lo manda Pagopar. */
async function aviso(extra = {}) {
  const base = {
    pagado: true, cancelado: false, hash_pedido: HASH, monto: "150000",
    forma_pago: "Tarjeta", fecha_pago: "2026-11-13 10:00:00",
  };
  const campos = { ...base, ...extra };
  const hash = campos.hash_pedido ?? "";
  return { respuesta: true, resultado: [{ ...campos, token: await sha1(CLAVE + hash) }] };
}

t("un aviso bien firmado y pago se registra", async () => {
  const d = await decidir(await aviso(), CLAVE);
  if (d.tipo !== "registrar") throw new Error("deberia registrar: " + JSON.stringify(d));
  if (d.hash !== HASH) throw new Error("hash mal leido: " + d.hash);
  if (d.monto !== 150000) throw new Error("monto mal leido: " + d.monto);
});

t("sin token se rechaza", async () => {
  const c = await aviso();
  delete c.resultado[0].token;
  if ((await decidir(c, CLAVE)).tipo !== "rechazar") throw new Error("sin firma no entra");
});

t("con el token de otra clave se rechaza", async () => {
  const c = await aviso();
  c.resultado[0].token = await sha1("otra-clave" + HASH);
  const d = await decidir(c, CLAVE);
  if (d.tipo !== "rechazar") throw new Error("firma ajena no entra");
});

t("un token valido para OTRO pedido no sirve para este", async () => {
  // El ataque obvio: reusar la firma de un pago real en otro hash.
  const c = await aviso();
  c.resultado[0].token = await sha1(CLAVE + "otro-pedido");
  if ((await decidir(c, CLAVE)).tipo !== "rechazar") throw new Error("la firma es por pedido");
});

t("el token se compara sin importar mayusculas", async () => {
  const c = await aviso();
  c.resultado[0].token = c.resultado[0].token.toUpperCase();
  if ((await decidir(c, CLAVE)).tipo !== "registrar") throw new Error("deberia aceptar mayusculas");
});

t("todavia no pago: no se hace nada, pero no es un error", async () => {
  const d = await decidir(await aviso({ pagado: false }), CLAVE);
  if (d.tipo !== "ignorar") throw new Error("deberia ignorar: " + JSON.stringify(d));
});

t("cancelado no empuja el vencimiento", async () => {
  const d = await decidir(await aviso({ cancelado: true }), CLAVE);
  if (d.tipo !== "ignorar") throw new Error("un pedido cancelado no paga");
});

t("una reversion no quita el mes sola", async () => {
  // Llega como `pagado: false` sobre un pedido que ya estaba pago. Sacarle el
  // acceso a alguien desde un webhook es demasiado grande para automatizarlo.
  const d = await decidir(await aviso({ pagado: false, fecha_pago: null }), CLAVE);
  if (d.tipo !== "ignorar") throw new Error("no debe registrar ni revertir solo");
});

t("sin hash no se puede saber de quien es", async () => {
  const c = await aviso({ hash_pedido: "" });
  if ((await decidir(c, CLAVE)).tipo !== "rechazar") throw new Error("sin hash no entra");
});

t("un monto ilegible se rechaza en vez de entrar como cero", async () => {
  for (const malo of ["", "gratis", null, 0, -500]) {
    const d = await decidir(await aviso({ monto: malo }), CLAVE);
    if (d.tipo === "registrar") throw new Error("no deberia registrar con monto " + malo);
  }
});

t("el monto se lee venga como texto o como numero", () => {
  if (montoDe("150000") !== 150000) throw new Error("texto");
  if (montoDe(150000) !== 150000) throw new Error("numero");
  if (montoDe("150000.50") !== 150000.5) throw new Error("con decimales");
  if (montoDe("abc") !== null) throw new Error("basura es null");
});

t("un cuerpo que no es de Pagopar se rechaza", async () => {
  for (const basura of [null, {}, { resultado: [] }, { resultado: "hola" }, "texto"]) {
    const d = await decidir(basura, CLAVE);
    if (d.tipo !== "rechazar") throw new Error("deberia rechazar: " + JSON.stringify(basura));
  }
});

t("la comparacion de tokens no corta en la primera diferencia", () => {
  if (igualSinFiltrar("abc", "abd")) throw new Error("distintos");
  if (igualSinFiltrar("abc", "abcd")) throw new Error("largos distintos");
  if (!igualSinFiltrar("abc", "abc")) throw new Error("iguales");
});

t("se le devuelve a Pagopar el mismo resultado que mando", async () => {
  const c = await aviso();
  const r = JSON.parse(respuestaParaPagopar(c));
  if (!Array.isArray(r) || r.length !== 1) throw new Error("tiene que ser el array tal cual");
  if (r[0].hash_pedido !== HASH) throw new Error("el contenido tiene que ir igual");
  // Sin esto, Pagopar reintenta cada 10 minutos para siempre.
  if (JSON.stringify(r) !== JSON.stringify(c.resultado)) throw new Error("no es identico");
});

t("sha1 da lo que dice la documentacion de Pagopar", async () => {
  // Valor conocido, para que un cambio en la implementacion se note.
  if (await sha1("abc") !== "a9993e364706816aba3e25717850c26c9cd0d89d") {
    throw new Error("sha1 incorrecto");
  }
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nPagopar: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;

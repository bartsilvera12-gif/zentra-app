/**
 * Crea el pedido de pago de una suscripción y devuelve a dónde ir a pagar.
 *
 *   supabase functions deploy pagopar-cobrar
 *
 * Esta SÍ verifica la sesión (al revés que el callback): la llama la persona
 * desde la página de pago, con su sesión de Supabase.
 *
 * Secretos:
 *   PAGOPAR_PUBLIC_KEY
 *   PAGOPAR_PRIVATE_KEY
 *
 * Dos cosas no se le creen nunca a quien llama, y son las que hacen que esto
 * sea seguro:
 *
 *   1. **El monto.** Sale de `zentra.planes`, no del pedido. Si lo mandara el
 *      navegador, cualquiera se compra un mes de Max por mil guaraníes.
 *   2. **La empresa.** Sale de la sesión, no del cuerpo. Si no, se podría
 *      crear un cobro a nombre de otro.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  cuerpoDePedido,
  faltaDelComprador,
  leerRespuesta,
  urlDePago,
  type Comprador,
} from "./logica.ts";

const PUBLICA = Deno.env.get("PAGOPAR_PUBLIC_KEY") ?? "";
const PRIVADA = Deno.env.get("PAGOPAR_PRIVATE_KEY") ?? "";
const PAGOPAR = "https://api.pagopar.com/api/comercios/2.0/iniciar-transaccion";

/** Cuántas horas tiene la persona para pagar antes de que el pedido caduque. */
const HORAS_PARA_PAGAR = 48;

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  if (!PUBLICA || !PRIVADA) {
    console.error("[pagopar-cobrar] faltan las claves del comercio");
    return json({ error: "Los cobros no están configurados todavía." }, 500);
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Iniciá sesión" }, 401);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const { data: auth0, error: errAuth } = await sb.auth.getUser(auth.slice(7));
  if (errAuth || !auth0?.user) return json({ error: "Iniciá sesión" }, 401);
  const usuarioId = auth0.user.id;

  let cuerpo: { plan?: string; documento?: string; telefono?: string };
  try {
    cuerpo = await req.json();
  } catch {
    cuerpo = {};
  }

  const plan = String(cuerpo.plan ?? "").trim();
  if (!plan) return json({ error: "Falta decir qué plan" }, 400);

  // La empresa sale de la sesión. Nunca del cuerpo.
  const { data: perfil } = await sb
    .from("usuarios")
    .select("empresa_id, nombre, email")
    .eq("id", usuarioId)
    .maybeSingle();
  const empresaId = (perfil as { empresa_id?: string } | null)?.empresa_id;
  if (!empresaId) return json({ error: "Tu usuario no tiene empresa asignada." }, 400);

  // El precio sale de la base. Nunca del cuerpo.
  const { data: fila } = await sb
    .from("planes")
    .select("codigo, nombre, precio_mensual, vendible")
    .eq("codigo", plan)
    .maybeSingle();
  const def = fila as
    | { codigo: string; nombre: string; precio_mensual: number; vendible: boolean }
    | null;
  if (!def || !def.vendible) return json({ error: "Ese plan no está a la venta." }, 400);
  const monto = Number(def.precio_mensual);
  if (!Number.isFinite(monto) || monto <= 0) {
    // Un precio en cero es casi siempre un plan sin cargar, no un regalo.
    console.error(`[pagopar-cobrar] el plan ${plan} no tiene precio cargado`);
    return json({ error: "Ese plan todavía no tiene precio. Escribinos." }, 409);
  }

  const { data: emp } = await sb
    .from("empresas")
    .select("nombre, ruc")
    .eq("id", empresaId)
    .maybeSingle();
  const empresa = emp as { nombre?: string; ruc?: string } | null;

  const comprador: Comprador = {
    nombre: (perfil as { nombre?: string } | null)?.nombre?.trim() || empresa?.nombre || "",
    email: auth0.user.email ?? (perfil as { email?: string } | null)?.email ?? "",
    // El documento lo puede mandar la página de pago; si no, el RUC de la
    // empresa, que es lo que casi siempre hay cargado.
    documento: String(cuerpo.documento ?? "").trim() || (empresa?.ruc ?? "").trim(),
    telefono: String(cuerpo.telefono ?? "").trim(),
    ruc: (empresa?.ruc ?? "").trim(),
    razonSocial: empresa?.nombre ?? "",
  };

  const falta = faltaDelComprador(comprador);
  if (falta.length) {
    // Se dice qué falta en vez de un "datos incompletos": quien lo lee tiene
    // que saber qué cargar para poder seguir.
    return json({ error: `Para cobrar falta ${falta.join(" y ")}.`, falta }, 400);
  }

  // Un cobro pendiente reciente del mismo plan se reutiliza en vez de crear
  // otro. Sin esto, tocar "Pagar" tres veces deja tres pedidos abiertos en
  // Pagopar y dos de ellos no se van a pagar nunca.
  const desde = new Date(Date.now() - HORAS_PARA_PAGAR * 3600_000).toISOString();
  const { data: previo } = await sb
    .from("cobros")
    .select("hash_pedido")
    .eq("empresa_id", empresaId)
    .eq("plan", plan)
    .eq("estado", "pendiente")
    .eq("monto", monto)
    .gte("creado_en", desde)
    .not("hash_pedido", "is", null)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  const hashPrevio = (previo as { hash_pedido?: string } | null)?.hash_pedido;
  if (hashPrevio) return json({ url: urlDePago(hashPrevio), reutilizado: true });

  // La referencia es nuestra y se guarda ANTES de hablar con Pagopar: si la
  // llamada se corta a mitad, el cobro queda pendiente sin hash y no pasa
  // nada. Al revés —pedir primero y guardar después— un corte dejaría plata
  // entrando sin saber de quién es.
  const referencia = crypto.randomUUID().replace(/-/g, "");
  const { data: cobro, error: errCobro } = await sb
    .from("cobros")
    .insert({ empresa_id: empresaId, plan, monto, pasarela: "pagopar", referencia })
    .select("id")
    .single();
  if (errCobro || !cobro) {
    console.error("[pagopar-cobrar] creando el cobro:", errCobro?.message);
    return json({ error: "No se pudo iniciar el pago. Probá de nuevo." }, 500);
  }

  const vencePago = new Date(Date.now() + HORAS_PARA_PAGAR * 3600_000);
  const pedido = await cuerpoDePedido(
    { referencia, montoTotal: monto, plan, nombrePlan: def.nombre, comprador, vencePago },
    PUBLICA,
    PRIVADA,
  );

  let respuesta: unknown;
  try {
    const r = await fetch(PAGOPAR, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pedido),
    });
    respuesta = await r.json();
  } catch (e) {
    console.error("[pagopar-cobrar] Pagopar no respondió:", e);
    return json({ error: "No pudimos contactar a Pagopar. Probá de nuevo." }, 502);
  }

  const leido = leerRespuesta(respuesta);
  if (!leido.ok) {
    // El mensaje de Pagopar va al log y no a la pantalla: suele hablar de
    // tokens y claves, que no le dice nada a quien quiere pagar.
    console.error("[pagopar-cobrar] Pagopar rechazó el pedido:", leido.error);
    return json({ error: "Pagopar no aceptó el pedido. Ya estamos viendo." }, 502);
  }

  // El hash es lo que después permite saber de quién es el pago que entra.
  const { error: errHash } = await sb
    .from("cobros")
    .update({ hash_pedido: leido.hash })
    .eq("id", cobro.id);
  if (errHash) {
    // El pedido ya existe en Pagopar y la persona podría pagarlo, pero sin el
    // hash guardado no sabríamos de quién es. Mejor no mandarla a pagar.
    console.error("[pagopar-cobrar] no se pudo guardar el hash:", errHash.message);
    return json({ error: "No se pudo iniciar el pago. Probá de nuevo." }, 500);
  }

  return json({ url: urlDePago(leido.hash), monto, plan: def.nombre });
});

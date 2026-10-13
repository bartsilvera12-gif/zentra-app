/**
 * El aviso de pago de Pagopar.
 *
 *   supabase functions deploy pagopar-callback --no-verify-jwt
 *
 * Va con `--no-verify-jwt` a propósito: quien llama es Pagopar, que no tiene
 * ninguna sesión de Supabase. Lo que autentica el pedido es la firma SHA1 con
 * la clave privada, que se verifica abajo antes de mirar nada del contenido.
 *
 * Secretos que necesita (`supabase secrets set`):
 *   PAGOPAR_PRIVATE_KEY   la clave privada del comercio
 *   SUPABASE_URL          las pone Supabase solas al desplegar
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * La clave privada nunca sale de acá. Con ella se pueden firmar pedidos y
 * falsificar avisos de pago, así que no va en la app ni en el ERP de nadie.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decidir, respuestaParaPagopar } from "./logica.ts";

const CLAVE = Deno.env.get("PAGOPAR_PRIVATE_KEY") ?? "";

/**
 * Contestar 200 con el mismo `resultado` es lo que hace que Pagopar deje de
 * reintentar. Se usa tanto para un pago registrado como para uno repetido o
 * uno que no nos toca: en los tres casos el aviso llegó bien y no hay nada más
 * que Pagopar pueda hacer.
 */
function ok(cuerpo: unknown): Response {
  return new Response(respuestaParaPagopar(cuerpo), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });

  if (!CLAVE) {
    // Sin la clave no se puede verificar nada, y dar por bueno un aviso sin
    // verificar sería regalar meses a quien sepa la URL. Se corta con 500, que
    // además hace que Pagopar reintente: cuando se configure el secreto, el
    // aviso entra solo.
    console.error("[pagopar] falta PAGOPAR_PRIVATE_KEY");
    return new Response("Sin configurar", { status: 500 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return new Response("Cuerpo ilegible", { status: 400 });
  }

  const decision = await decidir(cuerpo, CLAVE);

  if (decision.tipo === "rechazar") {
    // 401 y no 200: si no es Pagopar, no hay nada que confirmarle. Y si fuera
    // Pagopar con algo roto, queremos enterarnos por el error y no por un
    // cliente que no puede trabajar.
    console.warn("[pagopar] rechazado:", decision.porque);
    return new Response("No autorizado", { status: 401 });
  }

  if (decision.tipo === "ignorar") {
    console.log("[pagopar] sin acción:", decision.porque);
    return ok(cuerpo);
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Todo el trabajo —registrar el pago, empujar el vencimiento, marcar el
  // cobro— pasa adentro de esta función, en una sola transacción y con el
  // cobro bloqueado. Dos avisos simultáneos del mismo pago no pueden empujar
  // el vencimiento dos veces.
  const { data, error } = await sb.rpc("registrar_pago_pasarela", {
    p_pasarela: "pagopar",
    p_hash: decision.hash,
    p_monto: decision.monto,
  });

  if (error) {
    // Sin 200, Pagopar reintenta en diez minutos. Es exactamente lo que
    // queremos ante un error nuestro: el pago ya se hizo y no se puede perder.
    console.error("[pagopar] registrando el pago:", error.message);
    return new Response("Error registrando el pago", { status: 500 });
  }

  const fila = (Array.isArray(data) ? data[0] : data) as
    | { resultado?: string; empresa?: string; vence?: string }
    | null;

  if (fila?.resultado === "desconocido") {
    // El hash no corresponde a ningún cobro nuestro. Puede ser un pedido de
    // otro sistema que comparte el comercio de Pagopar. Se contesta 200 para
    // que no reintente para siempre, pero queda anotado.
    console.warn("[pagopar] hash sin cobro asociado:", decision.hash);
    return ok(cuerpo);
  }

  console.log(
    `[pagopar] ${fila?.resultado} · empresa ${fila?.empresa} · vence ${fila?.vence}`,
  );
  return ok(cuerpo);
});

/**
 * La base, por PostgREST.
 *
 * Mismo enfoque que en `tienda-aguara-vulka`: `fetch` contra PostgREST en vez
 * de `@supabase/supabase-js`, para que el server quede liviano. Se escribe con
 * la SERVICE_ROLE_KEY, así que pasa por encima de RLS — por eso este archivo
 * nunca se ejecuta en el teléfono ni en el navegador.
 *
 * El schema no es `public`, de ahí los headers `Content-Profile` /
 * `Accept-Profile`.
 *
 * A diferencia de la tienda, acá la persistencia NO es opcional: si no se
 * puede escribir, no hay que cobrar. Un pago que entra sin quedar registrado
 * es plata que nadie sabe de quién es.
 */

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SCHEMA = (process.env.SUPABASE_SCHEMA || "zentra").trim();

export function configurada() {
  return Boolean(URL_BASE && SERVICE_KEY);
}

function headers(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: "Bearer " + SERVICE_KEY,
    "Content-Type": "application/json",
    "Content-Profile": SCHEMA,
    "Accept-Profile": SCHEMA,
    ...extra,
  };
}

async function rest(path, opts = {}) {
  const r = await fetch(URL_BASE + "/rest/v1" + path, { ...opts, headers: headers(opts.headers) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

const uno = (x) => (Array.isArray(x) ? (x[0] ?? null) : x);

/**
 * Quién es el dueño de este token.
 *
 * Se le pregunta a Supabase en vez de abrir el JWT por nuestra cuenta: así la
 * firma, el vencimiento y una sesión cerrada los valida quien corresponde.
 * Devuelve `null` si el token no sirve.
 */
export async function usuarioDelToken(token) {
  if (!token) return null;
  const r = await fetch(URL_BASE + "/auth/v1/user", {
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + token },
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u?.id ? { id: u.id, email: u.email ?? "" } : null;
}

/** El perfil y la empresa de un usuario. */
export async function perfilDe(usuarioId) {
  const fila = uno(
    await rest(`/usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=empresa_id,nombre,email&limit=1`),
  );
  if (!fila?.empresa_id) return null;
  const emp = uno(
    await rest(`/empresas?id=eq.${encodeURIComponent(fila.empresa_id)}&select=id,nombre,ruc&limit=1`),
  );
  return { ...fila, empresa: emp ?? null };
}

/** El plan y su precio, como están en la base. Nunca lo que diga el cliente. */
export async function planVendible(codigo) {
  const fila = uno(
    await rest(`/planes?codigo=eq.${encodeURIComponent(codigo)}&select=codigo,nombre,precio_mensual,vendible&limit=1`),
  );
  if (!fila || fila.vendible !== true) return null;
  const precio = Number(fila.precio_mensual);
  if (!Number.isFinite(precio) || precio <= 0) return null;
  return { ...fila, precio_mensual: precio };
}

/**
 * Un cobro pendiente reciente del mismo plan y monto, si lo hay.
 *
 * Sin esto, tocar "Pagar" tres veces deja tres pedidos abiertos en PagoPar y
 * dos no se van a pagar nunca.
 */
export async function cobroPendiente(empresaId, plan, monto, desdeIso) {
  return uno(
    await rest(
      `/cobros?empresa_id=eq.${empresaId}&plan=eq.${encodeURIComponent(plan)}` +
        `&monto=eq.${monto}&estado=eq.pendiente&hash_pedido=not.is.null` +
        `&creado_en=gte.${encodeURIComponent(desdeIso)}` +
        `&select=id,hash_pedido&order=creado_en.desc&limit=1`,
    ),
  );
}

/** Crea el cobro ANTES de hablar con PagoPar. Devuelve el id. */
export async function crearCobro({ empresaId, plan, monto, referencia }) {
  const fila = uno(
    await rest("/cobros", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        empresa_id: empresaId,
        plan,
        monto,
        pasarela: "pagopar",
        referencia,
      }),
    }),
  );
  if (!fila?.id) throw new Error("no se obtuvo el id del cobro");
  return fila.id;
}

/** Guarda el hash que devolvió PagoPar: es por el que después pregunta el aviso. */
export async function guardarHash(cobroId, hash) {
  await rest(`/cobros?id=eq.${encodeURIComponent(cobroId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ hash_pedido: hash }),
  });
}

/**
 * Registra el pago y empuja el vencimiento.
 *
 * Todo adentro de la función de Postgres, en una transacción y con el cobro
 * bloqueado: dos avisos simultáneos del mismo pago no pueden empujar el
 * vencimiento dos veces. Devuelve `pagado`, `repetido` o `desconocido`.
 */
export async function registrarPago(hash, monto) {
  const r = await rest("/rpc/registrar_pago_pasarela", {
    method: "POST",
    body: JSON.stringify({ p_pasarela: "pagopar", p_hash: hash, p_monto: monto }),
  });
  return uno(r);
}

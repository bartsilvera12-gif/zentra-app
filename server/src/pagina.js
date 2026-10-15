/**
 * Las pantallas del cobro, en HTML.
 *
 * Esto no es la app: es la página donde se paga, y vive acá por una razón que
 * no es técnica. Vender una suscripción adentro de una app Android, cobrando a
 * clientes de Paraguay, choca con la política de pagos de Google Play —la
 * apertura a cobros externos de 2026 llega a Estados Unidos, Reino Unido y el
 * EEE, no acá—. Así que la app informa y el cobro vive afuera, en el navegador.
 *
 * HTML servido desde el servidor y nada más: sin framework, sin JavaScript, sin
 * una sola llamada a otro dominio. Son dos pantallas que se usan una vez por
 * mes; cargar medio megabyte de librerías para eso sería trabajar en contra de
 * quien entra con datos móviles.
 *
 * Y sin JavaScript, el formulario funciona igual en un teléfono viejo o con la
 * conexión a medias. Es lo que uno quiere de la pantalla donde la gente paga.
 */

const MARCA = "#1C8C84";
const TINTA = "#143244";

/** Nada de lo que escribe alguien entra crudo en el HTML. */
function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 150000 → "150.000". Los guaraníes no llevan decimales. */
export function gs(n) {
  return "Gs. " + Math.round(Number(n) || 0).toLocaleString("es-PY");
}

function marco(titulo, cuerpo) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(titulo)} · Zentra</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px 16px 48px;
    background: #F2F5F7;
    color: ${TINTA};
    font: 400 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    display: flex;
    justify-content: center;
  }
  .caja { width: 100%; max-width: 420px; }
  .tarjeta {
    background: #fff;
    border-radius: 14px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(20,50,68,.12);
  }
  h1 { font-size: 21px; margin: 0 0 4px; }
  p.sub { margin: 0 0 20px; color: #5B7383; font-size: 14.5px; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 14px 0 5px; }
  input[type=email], input[type=password], input[type=text] {
    width: 100%;
    padding: 11px 12px;
    border: 1px solid #CBD8DF;
    border-radius: 10px;
    font-size: 16px; /* 16 o menos hace que el iPhone haga zoom al tocar */
    color: ${TINTA};
    background: #fff;
  }
  .plan {
    display: flex;
    align-items: center;
    gap: 11px;
    border: 1px solid #CBD8DF;
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 8px;
    cursor: pointer;
  }
  .plan:has(input:checked) { border-color: ${MARCA}; background: #F0F8F7; }
  .plan input { accent-color: ${MARCA}; width: 18px; height: 18px; flex: 0 0 auto; }
  .plan .nom { font-weight: 600; }
  .plan .precio { margin-left: auto; font-weight: 700; white-space: nowrap; }
  button {
    width: 100%;
    margin-top: 20px;
    padding: 13px;
    border: 0;
    border-radius: 10px;
    background: ${MARCA};
    color: #fff;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
  }
  .error {
    background: #FBE9E8;
    color: #7A2220;
    border-radius: 10px;
    padding: 11px 13px;
    font-size: 14px;
    margin-bottom: 16px;
  }
  .ok { font-size: 44px; line-height: 1; text-align: center; margin-bottom: 8px; }
  .dato { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-top: 1px solid #E6EDF1; font-size: 14.5px; }
  .dato span:first-child { color: #5B7383; }
  .dato span:last-child { font-weight: 600; text-align: right; }
  .pie { margin-top: 18px; text-align: center; font-size: 13px; color: #5B7383; }
  .marca { text-align: center; font-weight: 700; letter-spacing: .14em; color: ${MARCA}; margin-bottom: 14px; font-size: 13px; }
</style>
</head>
<body><div class="caja"><div class="marca">ZENTRA</div>${cuerpo}</div></body>
</html>`;
}

/**
 * La pantalla donde se paga: entrar y elegir plan, todo junto.
 *
 * En un solo paso a propósito. Partirlo en "iniciá sesión" y después "elegí
 * plan" son dos pantallas y dos esperas para algo que se hace una vez por mes,
 * y cada paso de más es gente que lo deja por la mitad.
 */
export function paginaPagar({ planes, email = "", plan = "", error = "" }) {
  const opciones = planes
    .map(
      (p) => `
      <label class="plan">
        <input type="radio" name="plan" value="${esc(p.codigo)}"${
          plan === p.codigo || (!plan && planes.length === 1) ? " checked" : ""
        } required>
        <span class="nom">${esc(p.nombre)}</span>
        <span class="precio">${esc(gs(p.precio_mensual))} / mes</span>
      </label>`,
    )
    .join("");

  const sinPlanes = `<div class="error">Todavía no hay planes a la venta. Escribinos y lo resolvemos.</div>`;

  return marco(
    "Pagar",
    `<div class="tarjeta">
      <h1>Pagar tu plan</h1>
      <p class="sub">Entrá con los datos de tu cuenta de Zentra. El pago lo cobra PagoPar.</p>
      ${error ? `<div class="error">${esc(error)}</div>` : ""}
      ${
        planes.length === 0
          ? sinPlanes
          : `<form method="post" action="/pagar">
        <label for="email">Correo</label>
        <input id="email" type="email" name="email" value="${esc(email)}" required autocomplete="email" autocapitalize="off" spellcheck="false">

        <label for="clave">Contraseña</label>
        <input id="clave" type="password" name="password" required autocomplete="current-password">

        <label>Plan</label>
        ${opciones}

        <label for="doc">Cédula o RUC</label>
        <input id="doc" type="text" name="documento" inputmode="numeric" autocomplete="off" placeholder="Para la factura de PagoPar">

        <button type="submit">Ir a pagar</button>
      </form>`
      }
      <div class="pie">Un mes de servicio. Se renueva pagando de nuevo, no se debita solo.</div>
    </div>`,
  );
}

/**
 * La vuelta de PagoPar.
 *
 * El aviso del pago y la vuelta de la persona son dos caminos distintos y
 * pueden llegar en cualquier orden: lo normal es que el aviso gane por unos
 * segundos, pero no está garantizado. Por eso esta pantalla no afirma nada que
 * no haya visto en la base — y si el cobro todavía figura pendiente lo dice
 * así, en vez de inventar un "listo" que a lo mejor no pasó.
 */
export function paginaResultado(cobro) {
  if (!cobro) {
    return marco(
      "Pago",
      `<div class="tarjeta">
        <h1>No encontramos ese pago</h1>
        <p class="sub">Puede que el link esté incompleto. Si el dinero salió de tu cuenta, escribinos con el número de ticket y lo resolvemos a mano.</p>
      </div>`,
    );
  }

  const pagado = cobro.estado === "pagado";
  const vence = cobro.empresa?.vence;

  return marco(
    pagado ? "Pago acreditado" : "Pago en camino",
    `<div class="tarjeta">
      <div class="ok">${pagado ? "✅" : "⏳"}</div>
      <h1 style="text-align:center">${pagado ? "Listo, ya está pago" : "Estamos confirmando el pago"}</h1>
      <p class="sub" style="text-align:center">
        ${
          pagado
            ? "Ya podés volver a la app y seguir trabajando."
            : "PagoPar nos avisa en unos segundos. Podés cerrar esto y volver a la app: cuando el aviso llegue, tu plan se activa solo."
        }
      </p>
      <div class="dato"><span>Empresa</span><span>${esc(cobro.empresa?.nombre || "—")}</span></div>
      <div class="dato"><span>Plan</span><span>${esc(cobro.empresa?.plan || cobro.plan)}</span></div>
      <div class="dato"><span>Monto</span><span>${esc(gs(cobro.monto))}</span></div>
      ${pagado && vence ? `<div class="dato"><span>Pagado hasta</span><span>${esc(vence)}</span></div>` : ""}
      <div class="pie">Guardá el correo que te manda PagoPar: es tu comprobante.</div>
    </div>`,
  );
}

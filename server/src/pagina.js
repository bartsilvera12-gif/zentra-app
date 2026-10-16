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

function marco(titulo, cuerpo, ancha = false, indexable = false) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${indexable ? "" : '<meta name="robots" content="noindex">'}
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
  .caja.ancha { max-width: 1040px; }
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

  /* ---------- la grilla de planes ----------
   *
   * El diseno viene de un componente de React con framer-motion, confetti y
   * digitos animados. Nada de eso entra acá, y no es por falta de ganas: esta
   * es la pantalla donde la gente paga, y tiene que abrir en un telefono viejo
   * con datos moviles y media barra de senal. Lo que se puede hacer con CSS
   * —las tarjetas, el realce de la recomendada, los tildes, la entrada— esta
   * todo; lo que exigia JavaScript quedo afuera a proposito.
   */
  .planes {
    display: grid; gap: 16px; margin: 26px 0 8px;
    grid-template-columns: 1fr;
  }
  @media (min-width: 760px) {
    .planes { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); align-items: center; }
    /* Las de los costados un poco mas chicas, como en el diseno. */
    .pl:not(.destacado) { transform: scale(.955); }
  }
  .pl {
    position: relative; display: flex; flex-direction: column;
    background: #fff; border: 1px solid #E2EAEF; border-radius: 18px;
    padding: 24px 22px; text-align: center;
    animation: subir .5s cubic-bezier(.22,1,.36,1) both;
  }
  .pl:nth-child(2) { animation-delay: .07s; }
  .pl:nth-child(3) { animation-delay: .14s; }
  @keyframes subir { from { opacity: 0; transform: translateY(26px) scale(.96); } }
  /* Quien pidio menos movimiento no lo recibe. */
  @media (prefers-reduced-motion: reduce) { .pl { animation: none; } }

  .pl.destacado { border: 2px solid ${MARCA}; z-index: 2; }
  .pl .cinta {
    position: absolute; top: 0; right: 0; display: flex; align-items: center; gap: 5px;
    background: ${MARCA}; color: #fff; font-size: 12px; font-weight: 700;
    padding: 5px 11px; border-radius: 0 16px 0 14px;
  }
  .pl .nombre {
    font-size: 13px; font-weight: 700; letter-spacing: .12em;
    text-transform: uppercase; color: #5B7383;
  }
  .pl .monto {
    margin-top: 16px; font-size: 40px; font-weight: 800; letter-spacing: -.02em;
    color: ${TINTA}; line-height: 1;
  }
  .pl .porMes { font-size: 13px; font-weight: 600; color: #5B7383; margin-top: 6px; }
  .pl ul { list-style: none; padding: 0; margin: 18px 0 0; text-align: left; }
  .pl li {
    display: flex; gap: 9px; align-items: flex-start;
    font-size: 14px; line-height: 1.45; padding: 4px 0; color: ${TINTA};
  }
  .pl li svg { flex: 0 0 auto; margin-top: 3px; }
  .pl .separa { border: 0; border-top: 1px solid #E6EDF1; margin: 18px 0 0; }
  .pl .elegir {
    margin-top: 18px; width: 100%; border: 1px solid #CFDBE3; border-radius: 12px;
    background: #fff; color: ${TINTA}; font-size: 16px; font-weight: 700;
    padding: 13px 16px; cursor: pointer; transition: background .18s, color .18s, border-color .18s;
  }
  .pl.destacado .elegir { background: ${MARCA}; border-color: ${MARCA}; color: #fff; }
  .pl .elegir:hover { background: ${MARCA}; border-color: ${MARCA}; color: #fff; }
  .pl.elegido { box-shadow: 0 0 0 3px rgba(28,140,132,.18); }
  /* Oculto a la vista, no para un lector de pantalla. */
  .oculto {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  .pl .nota { margin-top: 12px; font-size: 12px; line-height: 1.45; color: #5B7383; }
  .datos { max-width: 420px; margin: 0 auto; }
  h1.centro { text-align: center; font-size: 30px; }
  p.sub.centro { text-align: center; max-width: 560px; margin-left: auto; margin-right: auto; }

  .marca { text-align: center; font-weight: 700; letter-spacing: .14em; color: ${MARCA}; margin-bottom: 14px; font-size: 13px; }
</style>
</head>
<body><div class="caja${ancha ? " ancha" : ""}"><div class="marca">ZENTRA</div>${cuerpo}</div></body>
</html>`;
}

/**
 * La pantalla donde se paga: entrar y elegir plan, todo junto.
 *
 * En un solo paso a propósito. Partirlo en "iniciá sesión" y después "elegí
 * plan" son dos pantallas y dos esperas para algo que se hace una vez por mes,
 * y cada paso de más es gente que lo deja por la mitad.
 */
/**
 * Qué incluye cada plan, para mostrarlo en su tarjeta.
 *
 * La fuente de verdad de lo que cada plan **permite** es `src/lib/planes.ts`
 * en la app. Esto es su traducción a algo que se lea sin saber nada del
 * sistema: "inventario.mayorista" no le dice nada a nadie, "precio mayorista
 * por cliente" sí.
 *
 * Si allá se agrega una acción, acá hay que agregar la línea. No se genera
 * solo a propósito: el texto que ve quien va a pagar merece estar escrito, no
 * derivado de un identificador.
 */
const INCLUYE = {
  free: [
    "Hasta 20 productos",
    "Ventas y clientes sin límite",
    "Ajuste de stock 1 vez al mes",
    "Reportes de ventas",
  ],
  emprendedor: [
    "Hasta 50 productos",
    "Módulo de compras y proveedores",
    "Alta de proveedores",
    "Categorías de inventario",
    "Panel de compras",
    "Factura con auto-impresor",
  ],
  max: [
    "Productos sin límite",
    "Ajuste de stock sin espera",
    "Editar productos y proveedores",
    "Código de barras, mínimos y vencimientos",
    "Precio mayorista por cliente",
    "Ventas a crédito",
    "Compras en dólares",
    "Conversaciones de WhatsApp",
    "Factura electrónica (SIFEN)",
  ],
};

/** El tilde de cada característica. En línea, para no pedir otro archivo. */
const TILDE =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="' +
  MARCA +
  '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

const ESTRELLA =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>';

export function paginaPagar({ planes, email = "", plan = "", error = "", clave = "", prueba = 0 }) {
  // El más caro se marca como recomendado. No es un invento de marketing: es
  // el único que trae conversaciones y factura electrónica, que es por lo que
  // la gente pregunta.
  const tope = planes.length ? planes[planes.length - 1].codigo : "";

  const tarjetas = planes
    .map((p) => {
      const destacado = p.codigo === tope && planes.length > 1;
      const items = (INCLUYE[p.codigo] || [])
        .map((f) => `<li>${TILDE}<span>${esc(f)}</span></li>`)
        .join("");
      const elegido = plan === p.codigo;
      return `
      <label class="pl${destacado ? " destacado" : ""}${elegido ? " elegido" : ""}">
        ${destacado ? `<div class="cinta">${ESTRELLA} Recomendado</div>` : ""}
        <!--
          El radio y el botón dicen lo mismo, y los dos hacen falta.

          El botón es lo que se toca y lo que manda el plan al enviar. El radio
          es lo que **recuerda** cuál se había elegido: si la contraseña sale
          mal, la página se vuelve a dibujar y sin él la persona no sabría
          dónde estaba parada. Va oculto a la vista pero no para quien usa
          lector de pantalla.
        -->
        <input class="oculto" type="radio" name="plan" value="${esc(p.codigo)}"${elegido ? " checked" : ""}>
        <p class="nombre">${esc(p.nombre)}</p>
        <div class="monto">${esc(gs(prueba || p.precio_mensual))}</div>
        <p class="porMes">${prueba ? `de prueba · normalmente ${esc(gs(p.precio_mensual))}` : "por mes"}</p>
        <ul>${items}</ul>
        <hr class="separa">
        <button class="elegir" type="submit" name="plan" value="${esc(p.codigo)}">
          Pagar ${esc(p.nombre)}
        </button>
        <p class="nota">Un mes de servicio. No se debita solo.</p>
      </label>`;
    })
    .join("");

  const sinPlanes = `<div class="error">Todavía no hay planes a la venta. Escribinos y lo resolvemos.</div>`;

  return marco(
    "Pagar",
    `<h1 class="centro">Elegí tu plan</h1>
    <p class="sub centro">Entrá con los datos de tu cuenta de Zentra. El pago lo cobra PagoPar.</p>
    ${error ? `<div class="error datos">${esc(error)}</div>` : ""}
    ${
      planes.length === 0
        ? sinPlanes
        : `<form method="post" action="/pagar">
      ${
        prueba
          ? `<div class="error datos">Cobro de prueba: se cobra ${esc(gs(prueba))} y queda el plan completo.
             Es un pago real, con tarjeta real.</div>`
          : ""
      }
      ${
        // La clave de prueba vuelve a salir acá porque el formulario se
        // reenvía a sí mismo: sin esto, equivocarse la contraseña una vez
        // haría que el segundo intento salga al precio real.
        //
        // El comentario va en el código y no en el HTML: una página que le
        // cuenta a cualquiera que existe un camino de prueba es media pista
        // regalada.
        clave ? `<input type="hidden" name="clave" value="${esc(clave)}">` : ""
      }
      <div class="tarjeta datos">
        <label for="email">Correo</label>
        <input id="email" type="email" name="email" value="${esc(email)}" required autocomplete="email" autocapitalize="off" spellcheck="false">

        <label for="clave">Contraseña</label>
        <input id="clave" type="password" name="password" required autocomplete="current-password">

        <label for="doc">Cédula o RUC</label>
        <input id="doc" type="text" name="documento" inputmode="numeric" autocomplete="off" placeholder="Para la factura de PagoPar">
      </div>

      <!-- Cada tarjeta manda su propio plan con el botón: así no hace falta
           JavaScript para saber cuál se eligió, y el que no tenga el campo
           marcado no puede quedar a medias. -->
      <div class="planes">${tarjetas}</div>
    </form>`
    }`,
    true,
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

/**
 * La política de privacidad.
 *
 * Google Play no publica una app sin una dirección web pública que la
 * explique. No sirve un PDF, ni un documento de Drive, ni un texto adentro de
 * la app: tiene que ser una página que cualquiera pueda abrir sin cuenta.
 *
 * Vive en el server de cobros y no en un sitio aparte por una razón práctica:
 * es el único dominio nuestro que ya está publicado, con certificado y
 * andando. Una política que se cae el día que alguien mira es peor que no
 * tenerla.
 *
 * Lo que dice tiene que coincidir con lo declarado en el formulario de
 * "Seguridad de los datos" de Play (ver `docs/PLAY-STORE.md`). Si dicen cosas
 * distintas, es motivo de rechazo, así que los dos se cambian juntos o no se
 * cambia ninguno.
 *
 * El correo de contacto sale del entorno porque no es del código: si no está
 * configurado, queda sólo el WhatsApp, que es un contacto real. Inventar una
 * casilla que nadie lee sería peor que no poner ninguna.
 */
export function paginaPrivacidad({ whatsapp = "", email = "", actualizada = "" } = {}) {
  const tel = String(whatsapp || "").replace(/\D/g, "");
  const contacto = [
    tel ? `<li>WhatsApp: <a href="https://wa.me/${esc(tel)}">+${esc(tel)}</a></li>` : "",
    email ? `<li>Correo: <a href="mailto:${esc(email)}">${esc(email)}</a></li>` : "",
  ]
    .filter(Boolean)
    .join("");

  return marco(
    "Política de privacidad",
    `<h1>Política de privacidad de Zentra</h1>
    <p class="sub">Última actualización: ${esc(actualizada || "16 de octubre de 2026")}</p>

    <div class="tarjeta datos">
      <h2>Quiénes somos</h2>
      <p>Zentra es una aplicación para manejar las ventas, el inventario y los
      clientes de un comercio, desarrollada por Neura, en Paraguay. Esta
      política explica qué datos usa la app, para qué, y cómo se piden de
      vuelta.</p>

      <h2>Qué datos tratamos</h2>
      <ul>
        <li><strong>De tu cuenta:</strong> nombre, correo electrónico y la
        empresa a la que pertenecés. Hacen falta para que puedas entrar y para
        saber qué datos te corresponden.</li>
        <li><strong>Del negocio:</strong> lo que cargás en la app — productos,
        ventas, compras, clientes y proveedores, con sus datos de contacto y
        su RUC o cédula. Son tuyos: nosotros los guardamos para que puedas
        usarlos desde cualquier dispositivo.</li>
        <li><strong>Fotos, archivos y audios:</strong> sólo los que elegís
        enviar por el chat. La app no recorre tu galería ni tus archivos.</li>
        <li><strong>Ubicación:</strong> sólo en el momento en que tocás
        "Ubicación" para mandarla por el chat. No se registra ubicación en
        segundo plano ni mientras la app está cerrada.</li>
        <li><strong>Mensajes:</strong> las conversaciones de WhatsApp de tu
        negocio, si usás esa función.</li>
        <li><strong>Identificador del dispositivo:</strong> un código que
        entrega Google para poder mandarte notificaciones. Si no activás las
        notificaciones, no se guarda.</li>
      </ul>

      <h2>Para qué los usamos</h2>
      <p>Únicamente para que la aplicación funcione: mostrarte tus datos,
      registrar tus operaciones, mandarte los avisos que pediste y darte
      soporte cuando lo pedís.</p>

      <h2>Con quién se comparten</h2>
      <p><strong>Con nadie.</strong> No vendemos datos, no los cedemos a
      terceros y no los usamos para publicidad. Los proveedores de
      infraestructura que almacenan la información —la base de datos y el
      servicio de notificaciones— la procesan por cuenta nuestra y no pueden
      usarla para otra cosa.</p>

      <h2>Cuánto tiempo los guardamos</h2>
      <p>Mientras tengas la cuenta abierta. Si la eliminás, se borran.</p>

      <h2>Cómo eliminar tus datos</h2>
      <p>Desde la app: <strong>Configuración → Eliminar mi cuenta</strong>. Se
      borra la cuenta y los datos asociados. También podés pedirlo por
      cualquiera de los contactos de abajo.</p>

      <h2>Seguridad</h2>
      <p>Todo viaja cifrado por HTTPS. El acceso a los datos de una empresa
      está restringido a los usuarios de esa empresa.</p>

      <h2>Menores</h2>
      <p>Zentra es una herramienta de trabajo y no está dirigida a menores de
      18 años.</p>

      <h2>Cambios</h2>
      <p>Si esta política cambia, se actualiza esta misma página con una fecha
      nueva arriba.</p>

      <h2>Contacto</h2>
      <ul>${contacto || "<li>Escribinos desde la app, en Configuración → Escribir a soporte.</li>"}</ul>
    </div>`,
    false,
    true,
  );
}

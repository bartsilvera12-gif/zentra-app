"use client";

import { config } from "@/lib/config";
import { MARCA } from "@/lib/theme";
import { guardarPreferencia, temaDelSistema } from "@/lib/tema";
import type { ThemeName } from "@/lib/types";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EMPRESA, SOPORTE, VERSION } from "@/lib/data";
import { activarPush, desactivarPush, guardarPreferenciaPush, pushDisponible } from "@/lib/push";
import {
  anchoGuardado,
  buscarImpresoras,
  elegirImpresora,
  estadoDeImpresora,
  guardarAncho,
  imprimirPrueba,
  impresoraGuardada,
  olvidarImpresora,
  sePuedeImprimir,
  type ImpresoraVista,
} from "@/lib/impresora";
import type { AnchoPapel } from "@/lib/ticket";
import { estadoDeSuscripcion, motivoBloqueo } from "@/lib/planes";
import { numeroDeCompilacion } from "@/lib/compilacion";
import { diagnosticoDeCompras, planesDePlay } from "@/lib/compras-play";
import { esNativo } from "@/lib/nativo";
import { linkDeSoporte, type MotivoSoporte } from "@/lib/soporte";
import { repo } from "@/lib/repo";
import { useApp } from "@/store/AppContext";
import { BottomNav } from "../layout/BottomNav";
import { StatusBar } from "../layout/StatusBar";
import { IconBurbuja, IconIdea } from "../ui/Icons";
import { Card, GhostButton, Notice, SectionLabel, Toggle } from "../ui/primitives";

function IconSol({ stroke }: { stroke: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.7} strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7" />
    </svg>
  );
}

function IconLuna({ stroke }: { stroke: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />
    </svg>
  );
}

export function ConfigScreen() {
  // El número de compilación, que es el que cambia en cada subida a Play.
  // Vive al lado de la versión porque la pregunta que resuelve siempre
  // aparece junta con ella: "¿ya tenés la última?".
  const [build, setBuild] = useState("");
  // Por qué no aparece el botón de comprar, cuando no aparece. Se consulta al
  // abrir Configuración, que es donde alguien va a buscar cuando algo de la
  // suscripción no cierra.
  const [porQue, setPorQue] = useState("");
  // Si los planes se pueden comprar acá adentro. Mientras no se sepa, no se
  // muestra ninguno de los dos caminos: mostrar la dirección de la web y
  // reemplazarla un segundo después por un botón se ve como un parpadeo.
  const [hayCompra, setHayCompra] = useState<boolean | null>(null);
  // Adentro del APK la dirección de la web no se muestra nunca, conteste lo
  // que conteste Google. No es un detalle de diseño: la política de pagos de
  // Play prohíbe mandar a pagar afuera desde la app, y además dependía de una
  // consulta que puede tardar o fallar —y cuando fallaba, la app volvía a
  // ofrecer el link, que es exactamente lo que no puede hacer.
  const enApk = esNativo();
  useEffect(() => {
    let vivo = true;
    void numeroDeCompilacion().then((b) => vivo && setBuild(b));
    void diagnosticoDeCompras().then((d) => vivo && setPorQue(d));
    void planesDePlay().then((p) => vivo && setHayCompra(Object.keys(p).length > 0));
    return () => {
      vivo = false;
    };
  }, []);

  const { s, t, set, cerrarSesion, plan } = useApp();

  /**
   * El estado de la suscripción, o `null` si no corresponde mostrarla.
   *
   * El contexto se arma donde ya vive —`plan()` del store— para que esta
   * pantalla no vuelva a decidir de dónde sale el plan: ese cálculo ya estuvo
   * mal una vez.
   */
  /**
   * El enlace de WhatsApp, con el mensaje ya armado.
   *
   * Va con los datos de quien escribe y la versión instalada adentro: del otro
   * lado, la primera pregunta siempre es quién sos y qué versión tenés, y esa
   * vuelta convierte diez minutos de soporte en dos días.
   *
   * Es un enlace y no un botón con `window.open` a propósito: adentro del APK
   * lo que está probado que abre la app que corresponde es un `<a href>` —es
   * lo que usa la tarjeta de archivo del chat—, mientras que `window.open`
   * depende de cómo el WebView trate las ventanas nuevas.
   */
  const linkSoporte = (motivo: MotivoSoporte) =>
    linkDeSoporte(config.soporteWhatsapp, motivo, {
      nombre: s.sesion?.nombre,
      empresa: s.sesion?.empresa || s.tenant?.nombre,
      version: config.version,
      build: config.build,
    });

  const suscripcion = (() => {
    const ctx = plan();
    return estadoDeSuscripcion({ conErp: ctx.conErp, plan: ctx.plan, vence: ctx.vence });
  })();

  /** A labelled switch row. */
  const claro = s.theme === "claro";

  /**
   * Elegir un tema a mano apaga el seguimiento al sistema, que es lo que esa
   * elección quiere decir: si no, el teléfono lo pisaría al rato y parecería
   * que el botón no funciona.
   */
  const elegirTema = (tema: ThemeName) => {
    set({ theme: tema, auto: false });
    guardarPreferencia({ auto: false, tema });
  };

  const seguirAlSistema = () => {
    const auto = !s.auto;
    set({ auto, ...(auto ? { theme: temaDelSistema() } : {}) });
    guardarPreferencia({ auto, tema: auto ? temaDelSistema() : s.theme });
  };

  // Escribir la palabra evita el borrado accidental de un toque. Es irreversible.
  const confirmado = s.borrarTexto.trim().toUpperCase() === "ELIMINAR";

  const eliminarCuenta = async () => {
    if (!confirmado || s.borrando) return;
    set({ borrando: true, borrarError: "" });
    try {
      await repo.auth.eliminarCuenta();
      set({
        borrando: false,
        borrarAbierto: false,
        borrarTexto: "",
        screen: "login",
        user: "",
        pass: "",
        sesion: null,
        modoAcceso: "login",
      });
    } catch (e) {
      set({
        borrando: false,
        borrarError:
          e instanceof Error && e.message ? e.message : "No pudimos borrar la cuenta.",
      });
    }
  };

  /**
   * El switch de avisos push no es una preferencia local: prender pide permiso al
   * sistema y guarda el token del teléfono; apagar borra ese token. Si sólo
   * cambiara el switch, el servidor seguiría mandando avisos que el teléfono
   * mostraría igual.
   */
  const cambiarPush = async () => {
    if (s.pushOcupado) return;
    const prender = !s.push;

    if (!pushDisponible()) {
      // En el navegador no hay plugin nativo. Se deja cambiar el switch para que
      // la pantalla se pueda probar, pero se avisa que no va a llegar nada.
      set({
        push: prender,
        pushAviso: prender ? "En el navegador no llegan avisos: hace falta la app instalada." : "",
        pushAvisoGrave: prender,
      });
      return;
    }

    set({ pushOcupado: true, pushAviso: "" });
    try {
      if (prender) {
        const { ok, esAgente } = await activarPush();
        guardarPreferenciaPush(ok);
        set({
          push: ok,
          pushOcupado: false,
          /*
           * El aviso de "no sos agente" decía que los avisos de chats no iban a
           * llegar. Es falso, y lo dije con todas las letras en una pantalla.
           *
           * El ERP tiene DOS caminos para avisar de un mensaje: uno por
           * `agent_id`, para el asesor que tiene la conversación asignada, y
           * otro por usuario, para quien ve esa conversación por su rol
           * —supervisión, PM, administración—. No ser agente deja afuera del
           * primero, no del segundo. Un administrador recibe avisos de todo lo
           * que ve, y eso es exactamente lo que pasaba mientras la app le
           * decía que no le iba a llegar nada.
           *
           * Así que ahora se dice qué significa, sin prometer ni negar: es un
           * dato útil —explica por qué no llegan los de una conversación
           * puntual asignada a otro— y no una sentencia.
           */
          pushAviso: !ok
            ? "Falta el permiso de notificaciones. Se habilita en los ajustes del teléfono."
            : esAgente === false
              ? "Listo. Tu usuario no está dado de alta como agente de conversaciones, " +
                "así que vas a recibir avisos de los chats que ves por tu rol, no de los " +
                "asignados a vos."
              : "",
          // Sin permiso no llega nada: eso sí es un problema. Lo del agente es
          // una aclaración, y va en gris.
          pushAvisoGrave: !ok,
        });
      } else {
        await desactivarPush();
        guardarPreferenciaPush(false);
        set({ push: false, pushOcupado: false, pushAviso: "", pushAvisoGrave: false });
      }
    } catch (e) {
      guardarPreferenciaPush(false);
      set({
        push: false,
        pushOcupado: false,
        pushAviso: e instanceof Error && e.message ? e.message : "No pudimos activar los avisos.",
      });
    }
  };

  /* ---------- impresora térmica ---------- */

  // Imprimir el ticket es lo que el plan vende como "facturación con
  // auto-impresor". Se pregunta acá igual que en el detalle de venta: elegir
  // impresora con un plan que no imprime es hacer perder el tiempo.
  const sinImpresion = motivoBloqueo("facturacion.autoImpresor", plan());
  const hayPlugin = sePuedeImprimir();
  /** Lo que el scan fue encontrando, para no perder un aviso con otro. */
  const halladas = useRef<ImpresoraVista[]>([]);

  /**
   * Lo que ya está elegido, leído del perfil que guarda el plugin.
   *
   * Se lee al abrir Configuración y no al arrancar la app: es una llamada
   * nativa, y nadie necesita saber si hay impresora hasta que mira esta
   * pantalla o manda un ticket.
   */
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const guardada = await impresoraGuardada();
      if (!vivo) return;
      set({ impGuardada: guardada, impLeyendo: false, impAncho: anchoGuardado() });
      // El estado es aparte porque muchas impresoras no lo informan: si no
      // vuelve nada, no se muestra nada en vez de mostrar "Conectada".
      const estado = guardada ? await estadoDeImpresora(guardada.id) : null;
      if (vivo) set({ impEstado: estado ?? "" });
    })();
    return () => {
      vivo = false;
    };
    // `set` es estable y el efecto corre una vez: volver a leer en cada render
    // dispararía un scan de estado por tecla tocada en la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buscar = async () => {
    if (sinImpresion) return set({ avisoPlan: sinImpresion });
    if (s.impBuscando) return;
    halladas.current = [];
    set({ impBuscando: true, impEncontradas: [], impAviso: "", impAvisoGrave: false });
    // Las que van apareciendo se muestran en el momento: ocho segundos mirando
    // una pantalla quieta se sienten como que la app se colgó.
    //
    // La lista se acumula en una referencia y no leyendo el estado porque el
    // plugin avisa varias veces en el mismo instante y `set` recibe un parche,
    // no una función: con dos avisos juntos, el segundo pisaría al primero.
    const r = await buscarImpresoras((i) => {
      if (halladas.current.some((x) => x.id === i.id)) return;
      halladas.current = halladas.current.concat(i);
      set({ impEncontradas: halladas.current });
    });
    if (!r.ok) return set({ impBuscando: false, impAviso: r.motivo, impAvisoGrave: true });
    set({
      impBuscando: false,
      impEncontradas: r.dato,
      // Un scan que no encontró nada no es una falla: es un dato, y lo que
      // sigue es prender la impresora o acercarse.
      impAviso: r.dato.length
        ? ""
        : "No apareció ninguna impresora. Fijate que esté prendida, con el Bluetooth del teléfono prendido, y a menos de unos metros.",
      impAvisoGrave: false,
    });
  };

  const elegir = async (id: string) => {
    if (sinImpresion) return set({ avisoPlan: sinImpresion });
    set({ impAviso: "", impAvisoGrave: false });
    const r = await elegirImpresora(id, s.impAncho);
    if (!r.ok) return set({ impAviso: r.motivo, impAvisoGrave: true });
    const estado = await estadoDeImpresora(r.dato.id);
    set({
      impGuardada: r.dato,
      impEncontradas: [],
      impEstado: estado ?? "",
      // Se dice que quedó guardada, que es lo que pasó. Que imprima bien se
      // sabe con el ticket de prueba, no con la conexión.
      impAviso: "Impresora guardada. Probala con un ticket de prueba antes de la primera venta.",
      impAvisoGrave: false,
    });
  };

  const quitar = async () => {
    const id = s.impGuardada?.id;
    if (!id) return;
    const r = await olvidarImpresora(id);
    set({
      impGuardada: r.ok ? null : s.impGuardada,
      impEstado: "",
      impAviso: r.ok ? "Se quitó la impresora. La próxima vez que imprimas hay que elegir una." : r.motivo,
      impAvisoGrave: !r.ok,
    });
  };

  /**
   * El ancho del rollo.
   *
   * Lo elige la persona y no se le pregunta a la impresora porque la impresora
   * no lo sabe: el plugin lo deduce del modelo y con las genéricas no lo
   * reconoce. El rollo lo ve quien lo cambia.
   */
  const cambiarAncho = (mm: AnchoPapel) => {
    set({ impAncho: mm, impAviso: "", impAvisoGrave: false });
    // Se guarda acá y no sólo al conectar: el rollo se puede elegir antes de
    // tener impresora, y esa elección tiene que seguir valiendo al volver.
    guardarAncho(mm);
    // Si ya hay una elegida hay que reconectar para que el ancho quede también
    // del lado del plugin; mientras no se reconecte, el ticket se arma con el
    // ancho nuevo igual, que es el que decide las columnas.
    if (s.impGuardada) void elegirImpresora(s.impGuardada.id, mm);
  };

  const probar = async () => {
    if (sinImpresion) return set({ avisoPlan: sinImpresion });
    if (s.impImprimiendo) return;
    set({ impImprimiendo: true, impAviso: "", impAvisoGrave: false });
    const r = await imprimirPrueba(s.impAncho);
    set({
      impImprimiendo: false,
      // Los tres resultados son distintos y se dicen distinto. "Enviado" no es
      // "impreso": en una ESC/POS por Bluetooth el canal es de ida y lo único
      // que sabemos es que el ticket salió de acá.
      impAviso:
        r.estado === "impreso"
          ? "La impresora confirmó que imprimió el ticket de prueba."
          : r.estado === "enviado"
            ? "El ticket de prueba salió hacia la impresora. Esta impresora no confirma la impresión, así que mirá el papel: si la regla de números no llega al borde, cambiá el ancho del rollo."
            : r.motivo,
      impAvisoGrave: r.estado === "error",
    });
  };

  const temaBtn = (
    activo: boolean,
    label: string,
    icon: ReactNode,
    bg: string,
    border: string,
    ink: string,
    onClick: () => void,
  ) => (
    <button
      onClick={onClick}
      style={{
        borderRadius: 13,
        padding: "14px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        background: bg,
        border: `2px solid ${border}`,
        color: ink,
      }}
      aria-pressed={activo}
    >
      {icon}
      <span style={{ font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif" }}>{label}</span>
    </button>
  );

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        animation: "zt-fade .22s ease",
        background: t.bg,
      }}
    >
      <StatusBar bg={t.card} />

      <div style={{ padding: "10px 16px 14px", background: t.card, borderBottom: `1px solid ${t.border}` }}>
        <div style={{ font: "600 20px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Configuración</div>
        <div style={{ font: "400 12.5px/1.3 var(--font-barlow),Barlow,sans-serif", marginTop: 2, color: t.ink2 }}>
          Preferencias visuales y avisos
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "16px 14px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {suscripcion && (
          <Card gap={10}>
            <SectionLabel>Suscripción</SectionLabel>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <span style={{ font: "700 18px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                {suscripcion.plan}
              </span>
              <span
                style={{
                  font: "600 12.5px/1 var(--font-barlow),Barlow,sans-serif",
                  padding: "5px 9px",
                  borderRadius: 999,
                  // El rojo se guarda para lo que ya venció. Un "vence en 5
                  // días" en rojo es la alarma gritando todos los días.
                  background: suscripcion.urgente ? "#FBE9E8" : MARCA.suave,
                  color: suscripcion.urgente ? "#7A2220" : MARCA.suaveInk,
                }}
              >
                {suscripcion.estado}
              </span>
            </div>
            <div style={{ font: "400 13px/1.45 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
              {suscripcion.detalle}
            </div>

            {/* Dónde se paga. Mismo orden que en la app nativa de iOS: primero
                el botón, y abajo la dirección en letra chica para quien
                prefiera escribirla en la computadora.

                El botón se apaga con NEXT_PUBLIC_LINK_DE_PAGO=0 en la
                compilación que va a Google Play, que no permite mandar a pagar
                afuera. Apagado queda la dirección sola, que es informar — eso
                sí se puede. Está en docs/COBROS.md. */}
            {/* Si se puede comprar adentro, acá va el botón que abre la hoja
                de planes y nada más: con la compra disponible en la app,
                mandar a pagar afuera lo prohíbe la política de pagos de Play.
                La dirección de la web queda sólo para cuando no hay compra
                adentro. */}
            {(enApk || hayCompra) && (
              <button
                onClick={() => set({ avisoPlan: "Elegí el plan que te sirve." })}
                style={{
                  marginTop: 4,
                  padding: "13px",
                  border: 0,
                  borderRadius: 10,
                  background: MARCA.acento,
                  color: "#fff",
                  cursor: "pointer",
                  font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
                }}
              >
                Ver planes
              </button>
            )}

            {!enApk && config.cobrosUrl && (
              <div style={{ paddingTop: 4, display: "flex", flexDirection: "column", gap: 8 }}>
                {config.linkDePago && (
                  <a
                    href={`${config.cobrosUrl}/pagar`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "block",
                      // Sin `width: 100%`: con relleno de 13px, el 100% es el
                      // ancho de adentro MÁS el relleno, y el botón se sale de
                      // la tarjeta. Un `block` ya ocupa todo el ancho solo.
                      padding: "13px",
                      borderRadius: 10,
                      background: MARCA.acento,
                      color: "#fff",
                      cursor: "pointer",
                      textAlign: "center",
                      textDecoration: "none",
                      font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
                    }}
                  >
                    Ver planes y pagar
                  </a>
                )}
                <div style={{ font: "400 12px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
                  Se paga en {config.cobrosUrl.replace(/^https?:\/\//, "")}/pagar, desde el navegador.
                </div>
                {porQue && (
                  <div style={{ font: "400 11.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
                    {porQue}
                  </div>
                )}
              </div>
            )}

            {/* En el APK, cuando Google no devuelve los productos, no hay nada
                que ofrecer: ni compra adentro ni dirección afuera. Queda la
                razón escrita, que es lo único que sirve para arreglarlo. */}
            {enApk && hayCompra === false && porQue && (
              <div style={{ font: "400 11.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
                {porQue}
              </div>
            )}
          </Card>
        )}

        <Card gap={12}>
          <SectionLabel>Apariencia</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {temaBtn(
              claro,
              "Modo claro",
              <IconSol stroke={t.ink} />,
              claro ? "#e6f2f1" : t.card,
              claro ? MARCA.acento : t.border,
              t.ink,
              () => elegirTema("claro"),
            )}
            {temaBtn(
              !claro,
              "Modo oscuro",
              <IconLuna stroke={t.ink} />,
              claro ? t.card : "#1e2438",
              claro ? t.border : MARCA.acento,
              t.ink,
              () => elegirTema("oscuro"),
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
            <div>
              <div style={{ font: "600 14.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Seguir al sistema</div>
              <div style={{ font: "400 12px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>Usar el tema del teléfono</div>
            </div>
            <Toggle on={s.auto} onToggle={seguirAlSistema} label="Seguir al sistema" />
          </div>
        </Card>

        <Card gap={14}>
          <SectionLabel>Notificaciones</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ font: "600 14.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Avisos push</div>
              {/* Decía "Ventas, cobros y entregas", que daba a entender que
                  había categorías y que los mensajes no entraban. No hay
                  filtro: el interruptor anota este teléfono y punto, y qué
                  avisos manda lo decide el ERP de la empresa. */}
              <div style={{ font: "400 12px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                {s.pushOcupado ? "Pidiendo permiso…" : "Mensajes nuevos y avisos del sistema"}
              </div>
            </div>
            <Toggle on={s.push} onToggle={cambiarPush} label="Avisos push" />
          </div>
          {s.pushAviso ? (
            <Notice
              bg={s.pushAvisoGrave ? (claro ? "#fdf1f1" : "#3a2328") : claro ? "#eef2f6" : t.card}
              ink={s.pushAvisoGrave ? "#9e3b3b" : t.ink2}
              border={s.pushAvisoGrave ? undefined : t.border}
            >
              {s.pushAviso}
            </Notice>
          ) : null}
          {/* "Stock bajo" y "Resumen diario" estaban acá y no hacían nada:
              prendían un estado que ninguna parte del código leía. Un
              interruptor que promete un aviso que nunca llega es peor que no
              tenerlo, porque alguien se queda esperando. Vuelven cuando el
              aviso exista de verdad. */}
          {/* "Sonido y vibración" también se va: no lo leía nadie, y además no
              es nuestro para controlar — el sonido de una notificación lo
              maneja Android por canal, desde los ajustes del teléfono. */}
        </Card>

        {/* La impresora se elige una vez y queda. Nadie quiere elegir
            impresora en cada venta, y por eso vive acá y no en el mostrador. */}
        <Card gap={12}>
          <SectionLabel>Impresora de tickets</SectionLabel>

          {!hayPlugin ? (
            // En el navegador no hay plugin nativo: el Bluetooth del navegador
            // no llega a una impresora SPP. Decirlo es más útil que un botón
            // que no va a encontrar nada nunca.
            <Notice bg={claro ? "#eef2f6" : t.card} ink={t.ink2} border={t.border}>
              La impresora Bluetooth funciona con la app instalada en el teléfono. Desde el navegador queda la
              impresión del sistema, en el detalle de la venta.
            </Notice>
          ) : (
            <>
              <div style={{ font: "400 12.5px/1.45 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                Para impresoras térmicas Bluetooth, de las de rollo de 58 y 80 mm.
              </div>

              {s.impGuardada ? (
                <div
                  style={{
                    borderRadius: 12,
                    padding: "11px 12px",
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div style={{ font: "600 14px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                    {s.impGuardada.nombre}
                  </div>
                  <div style={{ font: "400 11.5px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                    {/* El estado sólo sale si el aparato lo informó. Muchas
                        ESC/POS no informan nada, y en ese caso no se escribe
                        "Conectada", que sería afirmarlo sin saberlo. */}
                    {[s.impGuardada.detalle, s.impEstado].filter(Boolean).join(" · ")}
                  </div>
                </div>
              ) : (
                <div style={{ font: "400 12.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                  {s.impLeyendo ? "Viendo si hay una guardada…" : "Todavía no elegiste ninguna."}
                </div>
              )}

              {/* El ancho del rollo: es el que decide cuántas columnas tiene el
                  ticket, y elegirlo mal se ve en el papel y en ningún otro
                  lado. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                  Ancho del rollo
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  {([58, 80] as AnchoPapel[]).map((mm) => {
                    const on = s.impAncho === mm;
                    return (
                      <button
                        key={mm}
                        onClick={() => cambiarAncho(mm)}
                        aria-pressed={on}
                        style={{
                          flex: 1,
                          height: 42,
                          borderRadius: 11,
                          cursor: "pointer",
                          font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif",
                          background: on ? MARCA.suave : t.card,
                          border: `1.5px solid ${on ? MARCA.acento : t.border}`,
                          color: on ? MARCA.acento : t.ink2,
                        }}
                      >
                        {mm} mm
                      </button>
                    );
                  })}
                </div>
              </div>

              {s.impEncontradas.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <SectionLabel>Encontradas</SectionLabel>
                  {s.impEncontradas.map((i) => (
                    <button
                      key={i.id}
                      onClick={() => void elegir(i.id)}
                      style={{
                        borderRadius: 12,
                        padding: "11px 12px",
                        textAlign: "left",
                        cursor: "pointer",
                        background: t.card,
                        border: `1px solid ${t.border}`,
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                      }}
                    >
                      <span style={{ font: "600 13.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                        {i.nombre}
                      </span>
                      <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                        {i.detalle}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {s.impAviso && (
                <Notice
                  bg={s.impAvisoGrave ? (claro ? "#fdf1f1" : "#3a2328") : claro ? "#eef2f6" : t.card}
                  ink={s.impAvisoGrave ? "#9e3b3b" : t.ink2}
                  border={s.impAvisoGrave ? undefined : t.border}
                >
                  {s.impAviso}
                </Notice>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <GhostButton
                  label={s.impBuscando ? "Buscando…" : s.impGuardada ? "Cambiar impresora" : "Buscar impresoras"}
                  flex={1}
                  onClick={() => void buscar()}
                />
                {s.impGuardada && (
                  <GhostButton
                    label={s.impImprimiendo ? "Imprimiendo…" : "Imprimir prueba"}
                    flex={1}
                    onClick={() => void probar()}
                  />
                )}
              </div>
              {s.impGuardada && (
                <button
                  onClick={() => void quitar()}
                  style={{
                    borderRadius: 12,
                    padding: "11px 14px",
                    textAlign: "left",
                    cursor: "pointer",
                    font: "600 13px/1 var(--font-barlow),Barlow,sans-serif",
                    background: "transparent",
                    border: `1px solid ${t.border}`,
                    color: "#9e3b3b",
                  }}
                >
                  Quitar la impresora guardada
                </button>
              )}
            </>
          )}
        </Card>

        <Card gap={14}>
          <SectionLabel>Soporte</SectionLabel>
          {SOPORTE.map((sp) => (
            <a
              key={sp.tag}
              href={linkSoporte(sp.motivo) ?? undefined}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                textAlign: "left",
                textDecoration: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              {/* Un ícono y no las letras "WA": en la app nativa de iOS son
                  íconos, y dos letras adentro de un cuadrado se leen como una
                  sigla que hay que descifrar. */}
              <span
                style={{
                  width: 38,
                  height: 38,
                  flex: "0 0 auto",
                  borderRadius: 11,
                  background: MARCA.suave,
                  color: MARCA.acento,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {sp.motivo === "mejora" ? (
                  <IconIdea size={20} stroke={MARCA.acento} />
                ) : (
                  <IconBurbuja size={20} stroke={MARCA.acento} />
                )}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ font: "600 14px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{sp.titulo}</span>
                <span style={{ font: "400 11.5px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>{sp.detalle}</span>
              </span>
              <span style={{ font: "600 16px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>›</span>
            </a>
          ))}
          <div
            style={{
              font: "400 11px/1.4 var(--font-barlow),Barlow,sans-serif",
              color: t.ink3,
              borderTop: `1px solid ${t.border}`,
              paddingTop: 12,
            }}
          >
            Zentra ERP · versión {VERSION.replace("v ", "")}{build ? ` (${build})` : ""}
            {config.build && ` · build ${config.build}`} ·{" "}
            {s.sesion?.empresa || s.tenant?.nombre || EMPRESA}
          </div>
        </Card>

        {/* Borrar la cuenta es requisito de las dos tiendas cuando la app permite
            registrarse, y Apple lo hace cumplir. */}
        <Card gap={12}>
          <SectionLabel>Cuenta</SectionLabel>

          {!s.borrarAbierto ? (
            <button
              onClick={() => set({ borrarAbierto: true, borrarTexto: "", borrarError: "" })}
              style={{
                borderRadius: 12,
                padding: "13px 14px",
                textAlign: "left",
                cursor: "pointer",
                font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif",
                background: "transparent",
                border: `1px solid ${t.border}`,
                color: "#9e3b3b",
              }}
            >
              Eliminar mi cuenta
            </button>
          ) : (
            <>
              <Notice bg="#FBE9E7" ink="#8C2F2B" border="#E8B4AE">
                Se borran tu cuenta y todos tus datos: clientes, productos, ventas,
                compras y movimientos. <strong>No se puede deshacer.</strong>
              </Notice>

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                  Escribí ELIMINAR para confirmar
                </span>
                <input
                  type="text"
                  value={s.borrarTexto}
                  onChange={(e) => set({ borrarTexto: e.target.value, borrarError: "" })}
                  placeholder="ELIMINAR"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{
                    height: 44,
                    borderRadius: 11,
                    padding: "0 13px",
                    fontSize: 14.5,
                    outline: "none",
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    color: t.ink,
                    letterSpacing: ".08em",
                  }}
                />
              </label>

              {s.borrarError && (
                <span style={{ font: "500 12.5px/1.35 var(--font-barlow),Barlow,sans-serif", color: "#9e3b3b" }}>
                  {s.borrarError}
                </span>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => set({ borrarAbierto: false, borrarTexto: "", borrarError: "" })}
                  style={{
                    flex: 1,
                    height: 46,
                    borderRadius: 13,
                    cursor: "pointer",
                    font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif",
                    background: t.card,
                    border: `1px solid ${t.border}`,
                    color: t.ink,
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={eliminarCuenta}
                  disabled={!confirmado || s.borrando}
                  style={{
                    flex: 1,
                    height: 46,
                    border: 0,
                    borderRadius: 13,
                    cursor: confirmado && !s.borrando ? "pointer" : "default",
                    font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif",
                    background: confirmado && !s.borrando ? "#B0322F" : "#C9A8A6",
                    color: "#fff",
                  }}
                >
                  {s.borrando ? "Borrando…" : "Eliminar"}
                </button>
              </div>
            </>
          )}
        </Card>

        <button
          onClick={cerrarSesion}
          style={{
            borderRadius: 14,
            padding: 15,
            cursor: "pointer",
            font: "600 14.5px/1 var(--font-barlow),Barlow,sans-serif",
            background: "none",
            color: "#9e3b3b",
            border: `1px solid ${t.border}`,
          }}
        >
          Cerrar sesión
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

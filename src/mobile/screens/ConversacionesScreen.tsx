"use client";

import { CHAT, MARCA } from "@/lib/theme";
import { ADJUNTOS, CHATS, EMOJIS, STICKERS } from "@/lib/data";
import { alternarFavorito, guardarFavoritos, leerFavoritos, ordenarPorFavoritos } from "@/lib/favoritos";
import {
  IconActualizar,
  IconBurbuja,
  IconEtiqueta,
  IconAudio,
  IconCamara,
  IconDocumento,
  IconGaleria,
  IconUbicacion,
} from "../ui/Icons";
import { repo, SinCola, TANDA_CHATS, usaApiDelErp } from "@/lib/repo";
import { useRemoto } from "./useRemoto";
import { useLatido } from "./useLatido";
import { alFinal, debeBajarAlAbrir, resumenDeMensaje, vaSinGlobo } from "@/lib/hilo";
import { colorAvatar } from "@/lib/avatar";
import { TODAS, colasDe, enCola } from "@/lib/colas";
import { FichaChatPanel } from "./FichaChatPanel";
import { TransferirPanel } from "./TransferirPanel";
import { Cargando, Falla } from "../ui/Estado";
import { msgsDe, noLeidosDe, ondaArr, ultimoDe } from "@/lib/calc";
import { fmtSeg, gs, norm } from "@/lib/format";
import { nombreCorto } from "@/lib/nombre";
import { useEffect, useMemo, useRef, useState } from "react";
import { Grabador } from "@/lib/grabador";
import type { Chat, ChatMsg, ThemeTokens } from "@/lib/types";
import { useApp } from "@/store/AppContext";
import { BottomNav } from "../layout/BottomNav";
import { StatusBar } from "../layout/StatusBar";
import { Badge, ChipRow, EmptyState, ScrollBody, SearchInput } from "../ui/primitives";

const VIOLETA = MARCA.header;
const VIOLETA_INK = MARCA.headerSuave;

/**
 * Los emojis de la barra de reacciones.
 *
 * Son los seis de WhatsApp y en el mismo orden: quien reacciona no está
 * eligiendo de una paleta, está buscando el que ya conoce en el lugar donde lo
 * conoce.
 */
const REACCIONES = ["\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F62E}", "\u{1F622}", "\u{1F64F}"];

/** Los dos filtros que no son una cola. "Todas" sale de lib/colas. */
const SIN_LEER = "No leídas";
const CERRADAS = "Cerradas";

/** El puntito del filtro de no leídas. Un círculo no amerita un SVG. */
function Punto({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{ width: 8, height: 8, borderRadius: "50%", background: color, flex: "0 0 auto" }}
    />
  );
}

/**
 * El visor de fotos y videos, a pantalla completa y adentro de la app.
 *
 * Antes la foto era un enlace: tocarla sacaba a la persona de la app y la
 * dejaba en el navegador, con la barra de direcciones y el botón de atrás del
 * sistema como única vuelta.
 *
 * El zoom es a mano y no con la lupa del navegador porque adentro del APK no
 * hay barra ni gesto de página: `touch-action: none` apaga el zoom del WebView
 * y los dos dedos los maneja esto. Se arrastra sólo con zoom aplicado; sin
 * zoom, arrastrar no hace nada y el toque cierra, que es lo que uno espera.
 */
function Visor({ src, tipo, onCerrar }: { src: string; tipo: "foto" | "video"; onCerrar: () => void }) {
  const [escala, setEscala] = useState(1);
  const [desp, setDesp] = useState({ x: 0, y: 0 });
  // Entre eventos no se puede guardar en estado: llegan muchos por segundo y
  // cada `set` llegaría tarde. Van en refs, que se leen al instante.
  const pellizco = useRef<{ dist: number; escala: number } | null>(null);
  const arrastre = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const movido = useRef(false);

  const distancia = (t: React.TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const reset = () => {
    setEscala(1);
    setDesp({ x: 0, y: 0 });
  };

  return (
    <div
      onClick={() => {
        // Un toque cierra; el final de un arrastre o un pellizco, no.
        if (!movido.current) onCerrar();
        movido.current = false;
      }}
      onTouchStart={(e) => {
        if (e.touches.length === 2) {
          pellizco.current = { dist: distancia(e.touches), escala };
          movido.current = true;
        } else if (e.touches.length === 1 && escala > 1) {
          arrastre.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: desp.x, dy: desp.y };
        }
      }}
      onTouchMove={(e) => {
        if (e.touches.length === 2 && pellizco.current) {
          const f = distancia(e.touches) / (pellizco.current.dist || 1);
          setEscala(Math.min(Math.max(pellizco.current.escala * f, 1), 5));
          movido.current = true;
        } else if (e.touches.length === 1 && arrastre.current) {
          const a = arrastre.current;
          setDesp({ x: a.dx + (e.touches[0].clientX - a.x), y: a.dy + (e.touches[0].clientY - a.y) });
          movido.current = true;
        }
      }}
      onTouchEnd={(e) => {
        if (e.touches.length === 0) {
          pellizco.current = null;
          arrastre.current = null;
          // Al volver a 1 se recentra: si no, la foto queda corrida y parece rota.
          if (escala <= 1) setDesp({ x: 0, y: 0 });
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        touchAction: "none",
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCerrar();
        }}
        aria-label="Cerrar"
        style={{
          position: "absolute",
          top: "calc(12px + env(safe-area-inset-top, 0px))",
          right: 12,
          width: 38,
          height: 38,
          borderRadius: "50%",
          border: 0,
          background: "rgba(255,255,255,.16)",
          color: "#fff",
          font: "600 18px/1 var(--font-barlow),Barlow,sans-serif",
          cursor: "pointer",
          zIndex: 1,
        }}
      >
        ✕
      </button>

      {escala > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            reset();
          }}
          style={{
            position: "absolute",
            bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
            left: "50%",
            transform: "translateX(-50%)",
            border: 0,
            borderRadius: 999,
            padding: "8px 16px",
            background: "rgba(255,255,255,.16)",
            color: "#fff",
            font: "500 13px/1 var(--font-barlow),Barlow,sans-serif",
            cursor: "pointer",
            zIndex: 1,
          }}
        >
          Ajustar
        </button>
      )}

      {tipo === "video" ? (
        <video
          src={src}
          controls
          autoPlay
          playsInline
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: "100%", maxHeight: "100%" }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="Foto"
          onDoubleClick={() => (escala > 1 ? reset() : setEscala(2.5))}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            transform: `translate(${desp.x}px, ${desp.y}px) scale(${escala})`,
            transformOrigin: "center",
            // Sin transición mientras se pellizca: con ella el gesto se siente pegajoso.
            transition: pellizco.current || arrastre.current ? "none" : "transform .18s ease-out",
            userSelect: "none",
          }}
          draggable={false}
        />
      )}
    </div>
  );
}

/**
 * Una nota de voz que se puede escuchar.
 *
 * Antes era un dibujo: una onda fija y un `▶` que no hacía nada, porque el
 * archivo nunca llegaba a la pantalla. Ahora la onda es la barra de progreso y
 * se puede tocar para moverse dentro del audio.
 *
 * `etiqueta` es la duración de las notas que graba uno mismo, que ya se conoce
 * antes de mandarlas. Para las que llegan del ERP no viene en la respuesta: se
 * lee del archivo cuando el navegador la sabe, y mientras tanto no se muestra
 * nada en vez de un `0:00` que miente.
 */
function NotaDeVoz({
  url,
  etiqueta,
  mio,
  t,
  oscuro,
  tinta,
}: {
  url?: string;
  etiqueta?: string;
  mio: boolean;
  t: ThemeTokens;
  oscuro: boolean;
  /** El color del texto del globo propio, que lo decide el chat y no el tema. */
  tinta: string;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [sonando, setSonando] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  // Un webm sin índice puede declarar duración `Infinity` hasta que termina de
  // leerse. Mostrar eso es peor que no mostrar nada.
  const duracionUtil = Number.isFinite(dur) && dur > 0 ? dur : 0;
  const avance = duracionUtil > 0 ? Math.min(pos / duracionUtil, 1) : 0;
  const barras = ondaArr(14);

  const alternar = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      void a.play().catch(() => setSonando(false));
    } else {
      a.pause();
    }
  };

  const tiempo = duracionUtil > 0 ? fmtSeg(Math.round(sonando || pos > 0 ? pos : duracionUtil)) : etiqueta || "";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 170 }}>
      {url && (
        <audio
          ref={ref}
          src={url}
          preload="metadata"
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
          onDurationChange={(e) => setDur(e.currentTarget.duration)}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
          onPlay={() => setSonando(true)}
          onPause={() => setSonando(false)}
          onEnded={() => {
            setSonando(false);
            setPos(0);
          }}
        />
      )}
      <button
        onClick={alternar}
        disabled={!url}
        aria-label={sonando ? "Pausar" : "Escuchar"}
        style={{
          width: 30,
          height: 30,
          flex: "0 0 auto",
          border: 0,
          borderRadius: "50%",
          background: mio ? VIOLETA_INK : "#6E97A8",
          color: "#fff",
          cursor: url ? "pointer" : "default",
          font: "600 11px/1 var(--font-barlow),Barlow,sans-serif",
        }}
      >
        {sonando ? "❚❚" : "▶"}
      </button>
      <span
        onClick={(e) => {
          const a = ref.current;
          if (!a || duracionUtil <= 0) return;
          const caja = e.currentTarget.getBoundingClientRect();
          a.currentTime = duracionUtil * Math.min(Math.max((e.clientX - caja.left) / caja.width, 0), 1);
        }}
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 2,
          flex: 1,
          height: 20,
          cursor: url && duracionUtil > 0 ? "pointer" : "default",
        }}
      >
        {barras.map((h, j) => (
          <span
            key={j}
            style={{
              flex: 1,
              height: h,
              borderRadius: 1,
              // Lo ya escuchado queda marcado; el resto, apagado.
              background:
                j / barras.length < avance
                  ? mio
                    ? "#17384A"
                    : MARCA.acento
                  : mio
                    ? "#6E97A8"
                    : oscuro
                      ? "#3E5A6B"
                      : "#AFD0DE",
            }}
          />
        ))}
      </span>
      <span style={{ font: "500 11px/1 var(--font-barlow),Barlow,sans-serif", color: mio ? tinta : t.ink3, flex: "0 0 auto" }}>
        {tiempo}
      </span>
    </div>
  );
}

/** El dibujo de cada adjunto, por `key`. Los datos ya no traen el ícono. */
const ICONO_ADJUNTO: Record<string, React.ReactNode> = {
  documento: <IconDocumento />,
  camara: <IconCamara />,
  galeria: <IconGaleria />,
  audioarch: <IconAudio />,
  ubicacion: <IconUbicacion />,
};

export function ConversacionesScreen() {
  const { s, t, set, abrirChat, pushMsg, startGrab, stopGrab } = useApp();
  // El chat tiene su propio juego de colores: acá el fondo del globo dice de
  // qué lado está el mensaje, así que no sale del tema general.
  const ch = s.theme === "oscuro" ? CHAT.oscuro : CHAT.claro;

  /**
   * Los favoritos de la bandeja de emojis y stickers.
   *
   * Se leen una sola vez al abrir la pantalla: están en el teléfono, no en la
   * red, y releerlos en cada dibujo no agrega nada.
   */
  const [favoritos, setFavoritos] = useState<string[]>([]);
  useEffect(() => setFavoritos(leerFavoritos()), []);
  const marcar = (emoji: string) => {
    const nueva = alternarFavorito(favoritos, emoji);
    setFavoritos(nueva);
    guardarFavoritos(nueva);
  };

  // Las conversaciones salen del ERP: son los chats de WhatsApp asignados a
  // este asesor. Sin ERP quedan las de ejemplo, para poder ver la pantalla.
  const conErp = usaApiDelErp();
  /**
   * Las cerradas van en su propio filtro y no mezcladas con el resto.
   *
   * El ERP las excluye salvo que se le pidan, y devuelve de a tandas: si
   * entraran siempre, competirían por los mismos lugares y taparían lo que hay
   * que atender. Pedirlas cambia la consulta, así que el filtro no es un
   * colador sobre lo cargado como los otros dos: vuelve a preguntar.
   */
  const verCerradas = s.xFiltro === CERRADAS;
  const { datos, cargando, error, recargar, refrescar: refrescarLista } = useRemoto(
    () => (conErp ? repo.chats.list({ incluirCerradas: verCerradas }) : Promise.resolve(CHATS)),
    [conErp, verCerradas],
  );
  // No es lo mismo "no tenés conversaciones" que "no atendés chats": a quien no
  // está en ninguna cola hay que decirle eso, no dejarlo mirando una lista
  // vacía creyendo que nadie le escribió.
  const sinCola = error === new SinCola().message;

  /**
   * Las tandas que se fueron pidiendo con "Cargar más", aparte de la primera.
   *
   * El ERP responde de a 50. Una empresa con cientos de conversaciones abiertas
   * veía sólo las 50 más recientes y no había forma de llegar al resto.
   *
   * Se guardan por separado de `datos` porque "Actualizar" vuelve a traer la
   * primera tanda, y las de abajo tienen que irse con ella: si no, quedarían
   * conversaciones viejas pegadas debajo de una lista recién refrescada.
   */
  const [extra, setExtra] = useState<Chat[]>([]);
  const [trayendo, setTrayendo] = useState(false);
  const [finDeLista, setFinDeLista] = useState(false);

  /** A dónde se fue la última conversación transferida, para decirlo en la lista. */
  const [transferido, setTransferido] = useState<string | null>(null);

  // Cambiar a "Cerradas" (o volver) es otra consulta: lo que se trajo con
  // "Cargar más" de la anterior no pertenece a esta lista.
  useEffect(() => {
    setExtra([]);
    setFinDeLista(false);
  }, [verCerradas]);

  const CHATS_VIVOS = useMemo(() => {
    // Una conversación puede aparecer en dos tandas si llegó un mensaje nuevo
    // entre una pedida y la otra: se queda con la primera, que es la más fresca.
    const vistos = new Set<string>();
    return [...datos, ...extra].filter((c) => (vistos.has(c.id) ? false : (vistos.add(c.id), true)));
  }, [datos, extra]);

  const actualizar = () => {
    setExtra([]);
    setFinDeLista(false);
    recargar();
  };

  const cargarMas = async () => {
    if (trayendo) return;
    setTrayendo(true);
    try {
      const mas = await repo.chats.list({ desde: CHATS_VIVOS.length, incluirCerradas: verCerradas });
      // Un ERP que no entiende `offset` devuelve siempre la misma tanda. Sin
      // esto el botón quedaría para siempre trayendo lo mismo: si nada de lo
      // que llegó es nuevo, se terminó.
      const conocidos = new Set(CHATS_VIVOS.map((c) => c.id));
      const nuevos = mas.filter((c) => !conocidos.has(c.id));
      if (nuevos.length === 0 || mas.length < TANDA_CHATS) setFinDeLista(true);
      if (nuevos.length > 0) setExtra((v) => [...v, ...nuevos]);
    } catch {
      // Un fallo acá no rompe lo que ya está en pantalla. Se deja de ofrecer
      // "cargar más" en vez de dejar un botón que no hace nada.
      setFinDeLista(true);
    } finally {
      setTrayendo(false);
    }
  };

  /**
   * Lo leído a mano dura hasta que llega una lista nueva.
   *
   * Era permanente: una vez abierta la conversación, su globito no volvía a
   * aparecer en toda la sesión. Si el cliente escribía otra vez, el mensaje
   * entraba en la lista pero sin marcar — y esa es justamente la conversación
   * que hay que contestar.
   *
   * La cuenta del ERP es la que vale; esto es sólo para que el globito se vaya
   * en el acto al abrir, sin esperar la vuelta del servidor.
   */
  useEffect(() => {
    if (datos.length > 0) set({ xLeidos: {} });
    // `set` es estable y `datos` cambia con cada respuesta del ERP.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos]);

  const noLeidosTotal = CHATS_VIVOS.reduce((a, c) => a + noLeidosDe(c, s.xLeidos), 0);
  const xq = norm(s.xQuery.trim());

  /**
   * Las colas de atención, como en el ERP de escritorio.
   *
   * Salen de las conversaciones que están en pantalla, no de un catálogo: así
   * no aparece una pestaña por cada cola que la empresa tiene creada y no usa.
   * Si el ERP no informa la cola, `colas` queda vacío y la fila no se dibuja.
   */
  const colas = useMemo(
    () => colasDe(CHATS_VIVOS, (c) => noLeidosDe(c, s.xLeidos)),
    [CHATS_VIVOS, s.xLeidos],
  );

  /**
   * Un solo filtro, no dos.
   *
   * Había dos filas de filtros —"Todas / No leídas" por un lado y las colas por
   * otro— y las dos empezaban con "Todas". Dos botones iguales, uno al lado del
   * otro, que hacían cosas distintas: imposible de adivinar cuál era cuál.
   *
   * Ahora es una sola fila con una sola selección. Se pierde "no leídas DE una
   * cola", que es un cruce que casi nadie hace, y se gana que el filtro se
   * entienda de un vistazo.
   */
  const soloNoLeidas = s.xFiltro === SIN_LEER;
  // Si la cola elegida se queda sin conversaciones —se cerró la última, o
  // cambió de empresa— se vuelve a "Todas" en vez de mostrar una lista vacía
  // sin explicación.
  const colaActiva = colas.some((c) => c.nombre === s.xFiltro) ? s.xFiltro : TODAS;

  const filtrados = CHATS_VIVOS.filter((c) => {
    // Una cerrada no aparece entre las abiertas aunque el ERP la haya mandado.
    if (verCerradas ? !c.cerrada : c.cerrada) return false;
    if (!enCola(c, colaActiva)) return false;
    if (soloNoLeidas && noLeidosDe(c, s.xLeidos) === 0) return false;
    return norm(c.nombre + " " + ultimoDe(c, s.xEnviados)).indexOf(xq) >= 0;
  });

  const det = CHATS_VIVOS.find((c) => c.id === s.xSel) ?? null;

  // El listado sólo trae la vista previa del último mensaje; la conversación
  // entera se pide al abrirla. Sin esto se vería un solo globo y parecería que
  // no hay historial.
  const { datos: conversacion, refrescar: refrescarChat } = useRemoto(
    () => (conErp && s.xSel ? repo.chats.get(s.xSel).then((c) => (c ? [c] : [])) : Promise.resolve([])),
    [conErp, s.xSel],
  );

  /**
   * El chat se actualiza solo.
   *
   * Antes no: para ver un mensaje nuevo había que salir de la conversación y
   * volver a entrar. En una app de mensajes eso no es un detalle que falta, es
   * la función.
   *
   * Ocho segundos en la conversación abierta, veinticinco en el listado. La
   * conversación abierta es donde alguien está esperando una respuesta ahora
   * mismo; el listado puede tardar un poco más sin que se note. Los dos se
   * frenan con la app en segundo plano y vuelven a pedir apenas se vuelve.
   *
   * Esto no reemplaza a las notificaciones push: con la app cerrada no corre
   * nada. Sirve para el rato en que se está mirando la pantalla, que es
   * justamente cuando una espera de treinta segundos se siente eterna.
   */
  useLatido(refrescarChat, 8000, conErp && s.xSub === "chat" && !!s.xSel);
  useLatido(refrescarLista, 25000, conErp && s.xSub === "lista");
  const detMsgs = conErp
    ? [...(conversacion[0]?.msgs ?? []), ...(s.xEnviados[s.xSel ?? ""] ?? [])]
    : det
      ? msgsDe(det, s.xEnviados)
      : [];

  /**
   * Abrir un chat deja la vista abajo, en lo último.
   *
   * Antes abría arriba del todo: con 245 mensajes sin leer había que arrastrar
   * un rato hasta llegar a lo que acababan de escribirte.
   *
   * `auto` y no `smooth` a propósito: al abrir tiene que estar abajo ya, no
   * verse el viaje. Va en un efecto porque los mensajes llegan después del
   * primer dibujo, cuando la respuesta del ERP vuelve.
   */
  // Un nodo por globo, para moverlo con el dedo sin volver a dibujar la lista
  // entera en cada cuadro del gesto.
  const cajas = useRef<(HTMLDivElement | null)[]>([]);
  const hilo = useRef<HTMLDivElement | null>(null);

  /**
   * La pulsación larga sobre un globo abre la barra de emojis.
   *
   * El temporizador vive en un ref y no en estado: se arranca y se cancela
   * decenas de veces mientras alguien baja por el hilo, y cada `set` sería un
   * dibujado de la pantalla entera para nada.
   */
  const pulsacion = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soltarPulsacion = () => {
    if (pulsacion.current) {
      clearTimeout(pulsacion.current);
      pulsacion.current = null;
    }
  };
  // El contenido del hilo, aparte de la caja que scrollea: lo que se observa
  // para saber que creció.
  const contenido = useRef<HTMLDivElement | null>(null);

  /**
   * Si la vista tiene que seguir pegada a lo último.
   *
   * Se prende al abrir y mientras se esté mirando el final; se apaga en cuanto
   * alguien sube a leer historial.
   *
   * Hace falta un estado propio —no alcanza con preguntar "¿está al final?" en
   * el momento— porque las fotos entran sin alto: la app baja al último
   * mensaje, la imagen termina de cargar y de golpe agrega 300px arriba. Para
   * cuando se puede medir, la vista ya quedó a mitad del hilo, así que
   * preguntar ahí daría "no, no estaba al final" y no bajaría nunca. De eso
   * venía que la conversación se abriera mostrando el mensaje más viejo.
   */
  const anclado = useRef(true);

  /**
   * Abajo del todo, sin animación.
   *
   * `scrollTop = scrollHeight` y no `scrollIntoView`: el ancla del final mide
   * cero píxeles y en el WebView de Android eso dejaba la vista unos globos
   * antes.
   */
  const pegarAbajo = () => {
    const caja = hilo.current;
    if (caja) caja.scrollTop = caja.scrollHeight;
  };
  // Qué conversación estaba abierta la última vez que se dibujó, para saber si
  // esto es "se abrió" o "llegó un mensaje a la que ya estaba abierta".
  /**
   * Para qué conversación ya se bajó al último mensaje.
   *
   * No alcanza con "cambió el chat": la pantalla se dibuja antes de que la
   * conversación llegue del ERP, así que en la primera pasada no hay a dónde
   * bajar. Se marca recién cuando hay mensajes.
   */
  const bajadoPara = useRef<string | null>(null);
  useEffect(() => {
    if (s.xSub !== "chat") {
      // Al salir se olvida, para que volver a entrar vuelva a bajar.
      bajadoPara.current = null;
      return;
    }

    // Otra conversación: se vuelve a mirar lo último.
    if (bajadoPara.current !== s.xSel) anclado.current = true;

    // Al abrir, al último mensaje: es lo que te acaban de escribir.
    if (debeBajarAlAbrir(bajadoPara.current, s.xSel, detMsgs.length)) {
      bajadoPara.current = s.xSel;
      pegarAbajo();
      return;
    }

    /**
     * Con la conversación ya abierta, sólo si estabas mirando el final.
     *
     * Ahora que el chat se refresca solo, bajar siempre sería peor que no
     * bajar nunca: estás leyendo algo de hace dos semanas, entra un mensaje, y
     * la pantalla te arranca al final. Perdés dónde estabas y no sabés por
     * qué. Es lo mismo que hace WhatsApp: si estás al final te sigue; si
     * subiste a leer, te deja donde estás.
     */
    if (anclado.current) pegarAbajo();
  }, [s.xSub, s.xSel, detMsgs.length]);

  /**
   * Mientras se mire el final, la vista se mantiene abajo sola.
   *
   * El hilo cambia de alto después de dibujarse y no sólo cuando llega un
   * mensaje: una foto que termina de cargar, un audio que calcula su duración,
   * el teclado que abre y cierra. Cada una de esas empujaba el final fuera de
   * la pantalla sin que ningún efecto se enterara, y el chat quedaba mostrando
   * cualquier parte del medio.
   */
  useEffect(() => {
    const caja = hilo.current;
    const dentro = contenido.current;
    if (s.xSub !== "chat" || !caja || !dentro) return;
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (anclado.current) caja.scrollTop = caja.scrollHeight;
    });
    ro.observe(dentro);
    return () => ro.disconnect();
  }, [s.xSub, s.xSel]);

  const contactos = CHATS_VIVOS.map((c) => ({
    nombre: c.nombre,
    tipo: c.tipo,
    chatId: c.id,
    detalle: c.tipo === "Cliente" ? "Cliente · conversación abierta" : "Proveedor · conversación abierta",
  }));
  const contactosFiltrados = contactos.filter(
    (c) => norm(c.nombre).indexOf(norm(s.xnQuery.trim())) >= 0,
  );

  // Sin "Clientes" y "Proveedores": en el chat del ERP todas son conversaciones
  // de WhatsApp y `tipo` era siempre "Cliente", así que un filtro no devolvía
  // nada y el otro no filtraba nada.
  /**
   * Una fila de filtros, con las colas adentro.
   *
   * El orden es el de uso: primero el que no filtra, después el corte por
   * estado, y al final las colas, que son las que cambian de empresa a empresa.
   */
  /**
   * El valor y el texto son distintos a propósito: el chip de una cola muestra
   * "Ventas (3)" y el filtro guarda "Ventas". Si se guardara el texto, el
   * contador formaría parte del nombre, al llegar un mensaje cambiaría solo y
   * la cola elegida dejaría de coincidir con ninguna.
   */
  const chip = (valor: string, texto: string, icono?: React.ReactNode) => {
    const on = (s.xFiltro || TODAS) === valor;
    return {
      label: texto,
      icono,
      bg: on ? MARCA.acento : t.card,
      fg: on ? "#ffffff" : t.ink2,
      border: on ? MARCA.acento : t.border,
      pick: () => set({ xFiltro: valor }),
    };
  };

  const chips = [
    chip(TODAS, TODAS, <IconBurbuja stroke="currentColor" />),
    chip(SIN_LEER, SIN_LEER, <Punto color={soloNoLeidas ? "#ffffff" : MARCA.acento} />),
    chip(CERRADAS, CERRADAS),
    // Las colas sólo si el ERP las informa; si no, la fila queda como antes.
    ...colas.map((c) =>
      chip(
        c.nombre,
        c.sinLeer > 0 ? `${c.nombre} (${c.sinLeer > 99 ? "99+" : c.sinLeer})` : c.nombre,
        <IconEtiqueta stroke="currentColor" />,
      ),
    ),
  ];



  // Los favoritos primero: es para lo que sirve marcarlos.
  const panelLista = ordenarPorFavoritos(s.xPanelTab === "Emojis" ? EMOJIS : STICKERS, favoritos);

  /**
   * Pone (o saca) la reacción y cierra la barra.
   *
   * No se dibuja nada por adelantado: la reacción vuelve del ERP como una fila
   * más del hilo —así la manda WhatsApp— y el refresco la trae en el acto. Si
   * se pintara acá y el envío fallara, quedaría un emoji que el cliente nunca
   * vio.
   */
  const reaccionar = async (emoji: string) => {
    const wamid = s.xReaccion;
    const chatId = s.xSel;
    set({ xReaccion: null });
    if (!wamid || !chatId) return;
    try {
      await repo.chats.reaccionar(chatId, wamid, emoji);
      refrescarChat();
    } catch (e) {
      set({ xEnvioError: e instanceof Error ? e.message : "No se pudo reaccionar." });
    }
  };

  const enviarTexto = () => {
    const escrito = s.xTexto.trim();
    if (!escrito || !det) return;

    /**
     * La cita de verdad: el wamid del mensaje citado viaja aparte y WhatsApp
     * dibuja la cita del otro lado, igual que cuando uno responde desde el
     * celular.
     *
     * Si el mensaje no tiene wamid —viejo, o el ERP no lo guardó con id— no hay
     * a qué apuntar, y ahí sí la cita va como texto adelante de la respuesta,
     * recortada a 120 porque citar tres párrafos arriba de dos palabras es
     * ruido. Es lo único que se podía hacer antes, y sigue siendo mejor que
     * perder la referencia.
     */
    const resumenCita = s.xCita?.trim();
    const cita =
      resumenCita && s.xCitaId
        ? { wamid: s.xCitaId, texto: resumenCita, mio: s.xCitaMio }
        : undefined;
    const texto =
      resumenCita && !cita
        ? `> ${resumenCita.length > 120 ? resumenCita.slice(0, 119) + "\u2026" : resumenCita}\n${escrito}`
        : escrito;

    // Se muestra enseguida y se manda en paralelo: en la calle la señal va y
    // viene, y esperar la respuesta del servidor para ver lo que uno escribió
    // hace sentir que la app se colgó.
    const hora = new Date().toTimeString().slice(0, 5);
    pushMsg(det.id, {
      de: "yo",
      texto,
      hora,
      tick: conErp ? "…" : "✓",
      ...(cita ? { cita: { texto: cita.texto, mio: cita.mio } } : {}),
    });
    set({ xCita: null, xCitaId: null, xCitaMio: false });
    if (!conErp) return;

    repo.chats
      .enviar(det.id, { de: "yo", texto }, cita)
      .then(() => set({ xEnvioError: "" }))
      .catch((e: unknown) => {
        // Si no salió hay que decirlo: un mensaje que se ve en la pantalla y
        // nunca llegó es peor que un error, porque el vendedor se queda
        // esperando una respuesta que no va a venir.
        set({ xEnvioError: e instanceof Error ? e.message : "No se pudo enviar el mensaje." });
      });
  };

  /**
   * Manda un archivo de verdad al ERP.
   *
   * Se muestra enseguida y se sube en paralelo, igual que el texto: una foto
   * puede tardar varios segundos y la pantalla no puede quedarse quieta.
   */
  const subir = (archivo: File | Blob, nombre: string, vistaPrevia: ChatMsg) => {
    if (!det) return;
    pushMsg(det.id, { ...vistaPrevia, tick: conErp ? "…" : "✓" });
    if (!conErp) return;
    repo.chats
      .enviarArchivo(det.id, archivo, nombre)
      .then(() => set({ xEnvioError: "" }))
      .catch((e: unknown) =>
        set({ xEnvioError: e instanceof Error ? e.message : "No se pudo enviar el archivo." }),
      );
  };

  /** Abre el selector del celular. `captura` usa la cámara directo. */
  const elegirArchivo = (accept: string, captura?: boolean) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    if (captura) input.capture = "environment";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const esImagen = /^image\//.test(f.type);
      subir(f, f.name, {
        de: "yo",
        hora: new Date().toTimeString().slice(0, 5),
        texto: "",
        archivo: {
          tag: esImagen ? "IMG" : (f.name.split(".").pop() || "DOC").toUpperCase().slice(0, 4),
          nombre: f.name,
          peso: `${esImagen ? "Imagen" : "Archivo"} · ${Math.max(1, Math.round(f.size / 1024))} KB`,
        },
      });
    };
    input.click();
  };

  // El micrófono vive acá y no en el estado: un MediaRecorder no es dato, es
  // un aparato prendido, y si se guarda en el estado React lo recrea.
  const grabador = useRef<Grabador | null>(null);

  const arrancarAudio = async () => {
    try {
      const g = new Grabador();
      await g.arrancar();
      grabador.current = g;
      startGrab();
    } catch {
      // Negar el permiso es una respuesta válida, no un error que esconder.
      set({ xEnvioError: "Necesitamos permiso para usar el micrófono." });
    }
  };

  const enviarAudio = async () => {
    stopGrab();
    set({ xGrab: false, xSeg: 0 });
    const g = grabador.current;
    grabador.current = null;
    if (!g || !det) return;

    const grabado = await g.detener();
    // Un toque sin querer no manda un audio vacío.
    if (!grabado) return;
    subir(grabado.blob, grabado.nombre, {
      de: "yo",
      hora: new Date().toTimeString().slice(0, 5),
      texto: "",
      audio: fmtSeg(grabado.segundos),
    });
  };

  const cancelarAudio = () => {
    stopGrab();
    grabador.current?.cancelar();
    grabador.current = null;
    set({ xGrab: false, xSeg: 0 });
  };

  const topBg = s.xSub === "lista" ? t.card : VIOLETA;

  /** One message bubble. Handles text, order cards, stickers, voice notes and files. */
  const burbuja = (m: ChatMsg, i: number) => {
    const mio = m.de === "yo";
    const esSticker = !!m.sticker;
    // Una foto sola va sin globo; una foto con pie, no. La regla está en
    // lib/hilo con sus pruebas: acá adentro ya se escribió mal una vez.
    const desnudo = vaSinGlobo(m);

    // La reacción no es un mensaje: es un emoji suelto, chico, del lado de
    // quien reaccionó. Antes se veía un globo que decía "[reaction]".
    if (m.reaccion) {
      // De qué lado va: del mensaje reaccionado, no de quien reaccionó. Ese era
      // el descuadre — un pulgar que un cliente le ponía a mi mensaje aparecía
      // a la izquierda, lejos del globo del que cuelga.
      const ladoDerecho = m.reaccionSobreMio ?? mio;
      return (
        // El `gap` de la lista deja 9px entre globos; una reacción tiene que
        // quedar pegada al mensaje de arriba, no flotando a media altura.
        // `marginTop: -11` se come ese hueco y suma un poco de solape, que es
        // como se ve en WhatsApp.
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: ladoDerecho ? "flex-end" : "flex-start",
            marginTop: -11,
            // Un poco adentro del borde: la reacción cuelga del globo, no de la pantalla.
            paddingRight: ladoDerecho ? 10 : 0,
            paddingLeft: ladoDerecho ? 0 : 10,
          }}
        >
          <span
            style={{
              fontSize: 15,
              lineHeight: 1,
              padding: "4px 7px",
              borderRadius: 999,
              background: t.card,
              border: `1px solid ${t.border}`,
              // Despega la píldora del globo del que cuelga. Sin esto, sobre un
              // globo del mismo color se leía como parte del mensaje.
              boxShadow: "0 1px 3px rgba(0,0,0,.18)",
            }}
            title={`Reaccionó ${m.reaccion}`}
          >
            {m.reaccion}
          </span>
        </div>
      );
    }

    /**
     * Deslizar el globo hacia adentro lo cita para responder.
     *
     * Es el gesto que ya existe en cualquier app de mensajes, así que nadie
     * tiene que aprenderlo. Arrastra sólo hasta 64px y vuelve solo al soltar:
     * el globo no se va a ninguna parte, lo que hace el gesto es elegirlo.
     *
     * Se exige un movimiento más horizontal que vertical antes de tomar el
     * gesto; si no, al bajar por el hilo los globos se irían de costado.
     */
    const inicio = { x: 0, y: 0, tomado: false };
    const mover = (dx: number) => {
      const caja = cajas.current[i];
      if (caja) caja.style.transform = `translateX(${dx}px)`;
    };

    return (
      <div
        key={i}
        style={{ display: "flex", flexDirection: "column", alignItems: mio ? "flex-end" : "flex-start" }}
        onTouchStart={(e) => {
          inicio.x = e.touches[0].clientX;
          inicio.y = e.touches[0].clientY;
          inicio.tomado = false;
          // Mantener apretado abre las reacciones, como en WhatsApp. Sólo con
          // ERP y sólo si el mensaje ya salió: a uno que todavía se está
          // enviando no se le puede reaccionar porque WhatsApp no lo conoce.
          soltarPulsacion();
          if (conErp && m.wamid) {
            pulsacion.current = setTimeout(() => set({ xReaccion: m.wamid ?? null }), 480);
          }
        }}
        onTouchMove={(e) => {
          const dx = e.touches[0].clientX - inicio.x;
          const dy = e.touches[0].clientY - inicio.y;
          // Si el dedo se movió, era un gesto y no una pulsación larga.
          if (Math.abs(dx) > 8 || Math.abs(dy) > 8) soltarPulsacion();
          if (!inicio.tomado) {
            if (Math.abs(dy) > Math.abs(dx)) return; // está bajando por el hilo
            if (Math.abs(dx) < 8) return;
            inicio.tomado = true;
          }
          // Hacia adentro: los míos se arrastran a la izquierda, los suyos a la derecha.
          const haciaAdentro = mio ? Math.min(dx, 0) : Math.max(dx, 0);
          mover(Math.max(Math.min(haciaAdentro, 64), -64));
        }}
        onTouchEnd={() => {
          soltarPulsacion();
          const caja = cajas.current[i];
          const dx = caja ? Number((/-?\d+(\.\d+)?/.exec(caja.style.transform) ?? ["0"])[0]) : 0;
          if (caja) {
            caja.style.transition = "transform .18s ease-out";
            caja.style.transform = "translateX(0)";
            setTimeout(() => (caja.style.transition = ""), 200);
          }
          if (Math.abs(dx) >= 44) {
            set({ xCita: resumenDeMensaje(m), xCitaId: m.wamid ?? null, xCitaMio: m.de === "yo" });
          }
        }}
      >
        <div
          ref={(el) => {
            cajas.current[i] = el;
          }}
          style={{
            maxWidth: "82%",
            borderRadius: mio ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            background: desnudo ? "transparent" : mio ? ch.mio : ch.suyo,
            border: `1px solid ${desnudo ? "transparent" : mio ? ch.bordeMio : ch.bordeSuyo}`,
            padding: desnudo ? 0 : "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {m.cita && (
            // La cita del mensaje al que este responde. Arriba del contenido,
            // con la barrita al costado: es como se lee en WhatsApp, y la idea
            // es que no haya que aprender nada nuevo.
            <div
              style={{
                display: "flex",
                gap: 7,
                borderRadius: 7,
                padding: "6px 8px",
                background: mio ? "rgba(0,0,0,.06)" : t.bg,
                maxWidth: "100%",
              }}
            >
              <span
                style={{
                  width: 3,
                  alignSelf: "stretch",
                  borderRadius: 2,
                  flex: "0 0 auto",
                  background: MARCA.acento,
                }}
              />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span
                  style={{
                    font: "600 11px/1.1 var(--font-barlow),Barlow,sans-serif",
                    color: MARCA.acento,
                  }}
                >
                  {m.cita.mio ? "Vos" : det?.nombre || "Cliente"}
                </span>
                <span
                  style={{
                    font: "400 12.5px/1.3 var(--font-barlow),Barlow,sans-serif",
                    color: mio ? ch.tintaMia : t.ink2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.cita.texto}
                </span>
              </span>
            </div>
          )}

          {m.reenviado && (
            // Dice de dónde viene el mensaje. En oscuro con `t.ink3`, que sale
            // del tema: un gris fijo acá era de los que casi no se leían.
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                font: "500 11.5px/1 var(--font-barlow),Barlow,sans-serif",
                fontStyle: "italic",
                color: mio ? ch.tintaMia : t.ink3,
              }}
            >
              <span aria-hidden style={{ fontStyle: "normal" }}>↪</span> Reenviado
            </span>
          )}

          {m.pedido && (
            <div
              style={{
                borderRadius: 10,
                padding: "10px 11px",
                background: mio ? "#D5E6EC" : t.bg,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              <span
                style={{
                  font: "600 9.5px/1 var(--font-barlow),Barlow,sans-serif",
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: mio ? ch.tintaMia : t.ink2,
                }}
              >
                {m.pedido.tag}
              </span>
              <span style={{ font: "700 15px/1.1 var(--font-barlow),Barlow,sans-serif", color: mio ? ch.tintaMia : t.ink }}>
                {gs(m.pedido.total)}
              </span>
              <span style={{ font: "400 11px/1.3 var(--font-barlow),Barlow,sans-serif", color: mio ? ch.tintaMia : t.ink2 }}>
                {m.pedido.detalle}
              </span>
            </div>
          )}

          {esSticker && !m.imagen && <span style={{ fontSize: 46, lineHeight: 1 }}>{m.sticker}</span>}

          {m.imagen && (
            // Tocarla la abre en grande, que es lo que uno intenta hacer. El
            // `alt` dice qué es: si el enlace cae, queda un texto y no un ícono roto.
            <button
              onClick={() => set({ xVisor: { src: m.imagen as string, tipo: "foto" } })}
              style={{ display: "block", lineHeight: 0, border: 0, padding: 0, background: "none", cursor: "pointer" }}
              aria-label="Ver la foto"
            >
              {/* `next/image` no sirve acá: la app se exporta estática y corre
                  adentro del APK, donde no hay servidor que optimice. Además la
                  foto vive en el dominio del ERP de cada cliente, que no se
                  puede declarar de antemano. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.imagen}
                alt={m.epigrafe || (esSticker ? "Sticker" : "Foto")}
                loading="lazy"
                style={{
                  display: "block",
                  width: esSticker ? 128 : "100%",
                  maxWidth: esSticker ? 128 : 260,
                  maxHeight: 320,
                  objectFit: "cover",
                  borderRadius: esSticker ? 0 : 10,
                  background: t.bg,
                }}
              />
            </button>
          )}

          {m.video && (
            // La miniatura es el primer cuadro: `preload="metadata"` lo trae sin
            // bajar el video entero, que en datos móviles importa.
            <button
              onClick={() => set({ xVisor: { src: m.video as string, tipo: "video" } })}
              style={{ position: "relative", display: "block", lineHeight: 0, border: 0, padding: 0, background: "none", cursor: "pointer" }}
              aria-label="Ver el video"
            >
              <video
                src={m.video}
                preload="metadata"
                muted
                playsInline
                style={{ display: "block", width: "100%", maxWidth: 260, maxHeight: 320, borderRadius: 10, background: "#000" }}
              />
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  font: "600 26px/1 var(--font-barlow),Barlow,sans-serif",
                  textShadow: "0 1px 6px rgba(0,0,0,.6)",
                }}
              >
                ▶
              </span>
            </button>
          )}

          {m.epigrafe && (
            <span style={{ font: "400 15px/1.4 var(--font-barlow),Barlow,sans-serif", color: mio ? ch.tintaMia : t.ink }}>
              {m.epigrafe}
            </span>
          )}

          {(m.audio || m.audioUrl) && (
            <NotaDeVoz
              url={m.audioUrl}
              etiqueta={m.audio}
              mio={mio}
              t={t}
              oscuro={s.theme === "oscuro"}
              tinta={ch.tintaMia}
            />
          )}

          {m.archivo &&
            (() => {
              // Con URL es un enlace de verdad: se toca y el teléfono lo abre
              // con la app que corresponda. Sin URL queda la misma tarjeta pero
              // muerta, que es honesto: se ve que llegó algo y que no se puede abrir.
              const Caja = m.archivo.url ? "a" : "div";
              return (
                <Caja
                  {...(m.archivo.url ? { href: m.archivo.url, target: "_blank", rel: "noreferrer" } : {})}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textDecoration: "none",
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: 36,
                      height: 36,
                      flex: "0 0 auto",
                      borderRadius: 9,
                      background: mio ? VIOLETA_INK : "#04617A",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      font: "600 10px/1 var(--font-barlow),Barlow,sans-serif",
                    }}
                  >
                    {m.archivo.tag || "DOC"}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span
                      style={{
                        font: "600 13.5px/1.25 var(--font-barlow),Barlow,sans-serif",
                        color: mio ? ch.tintaMia : t.ink,
                        // Un nombre largo no puede empujar el globo fuera de la
                        // pantalla: se corta con puntos suspensivos.
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.archivo.nombre}
                    </span>
                    <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: mio ? ch.tintaMia : t.ink3 }}>
                      {m.archivo.peso}
                    </span>
                  </span>
                </Caja>
              );
            })()}

          {!!m.texto && m.texto.length > 0 && (
            <span
              style={{
                font: "400 15px/1.45 var(--font-barlow),Barlow,sans-serif",
                color: mio ? ch.tintaMia : t.ink,
                // Un link o una palabra sin espacios no tiene que desbordar.
                overflowWrap: "anywhere",
              }}
            >
              {m.texto}
            </span>
          )}

          {!desnudo && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, alignSelf: "flex-end" }}>
              <span style={{ font: "400 11px/1 var(--font-barlow),Barlow,sans-serif", color: mio ? ch.tintaMia : t.ink3 }}>
                {m.hora}
              </span>
              {mio && (
                <span
                  style={{
                    font: "600 11px/1 var(--font-barlow),Barlow,sans-serif",
                    // El color es lo que separa "llegó" de "lo leyó": los dos
                    // llevan dos tildes, como en WhatsApp.
                    color: m.leido ? VIOLETA_INK : "#6E97A8",
                  }}
                >
                  {m.tick ?? "✓"}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    );
  };

  if (sinCola) {
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
        <StatusBar bg={topBg} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ font: "600 14px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
              No hay conversaciones para vos
            </div>
            <div style={{ font: "400 13px/1.5 var(--font-barlow),Barlow,sans-serif", color: t.ink2, paddingTop: 8 }}>
              Tu usuario no está en ninguna cola de atención, así que no tiene
              conversaciones asignadas.
            </div>
            {/* Decía "pedile a quien administra que te agregue", y quien veía
                esto solía ser justamente la administradora: en el ERP las
                tenía todas delante. Decir por qué difieren evita esa vuelta. */}
            <div style={{ font: "400 12px/1.5 var(--font-barlow),Barlow,sans-serif", color: t.ink3, paddingTop: 10 }}>
              Si en el ERP sí las ves, es porque ahí un administrador ve todas
              las colas. Para verlas también acá hace falta un ajuste en el
              ERP — está anotado en docs/API-ERP.md.
            </div>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

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
      <StatusBar bg={topBg} />

      {/* ---------- chat list ---------- */}
      {s.xSub === "lista" && (
        <>
          <div
            style={{
              padding: "6px 14px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 11,
              background: t.card,
              borderBottom: `1px solid ${t.border}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* El ícono de la app, que de paso hace de botón para volver al
                  inicio: en el encabezado de una pantalla principal una flecha
                  "‹" sugiere que hay algo atrás, y acá no lo hay. */}
              <button
                onClick={() => set({ screen: "home" })}
                aria-label="Ir al inicio"
                style={{
                  width: 44,
                  height: 44,
                  flex: "0 0 auto",
                  padding: 0,
                  border: 0,
                  borderRadius: 13,
                  overflow: "hidden",
                  cursor: "pointer",
                  background: "transparent",
                  display: "block",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/icono-192.png"
                  alt=""
                  style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
                />
              </button>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ font: "700 19px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Conversaciones</span>
                <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                  {noLeidosTotal > 0
                    ? `${noLeidosTotal} ${noLeidosTotal === 1 ? "mensaje sin leer" : "mensajes sin leer"}`
                    : "Todo al día"}
                </span>
              </div>
              {/* Actualizar a mano. La lista se trae al abrir la pantalla, así
                  que sin esto había que salir y volver a entrar para ver si
                  llegó algo. */}
              <button
                onClick={actualizar}
                disabled={cargando}
                aria-label="Actualizar la lista"
                style={{
                  flex: "0 0 auto",
                  width: 38,
                  height: 38,
                  border: `1px solid ${t.border}`,
                  borderRadius: 999,
                  background: t.card,
                  color: t.ink2,
                  cursor: cargando ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: cargando ? 0.5 : 1,
                }}
              >
                <IconActualizar size={18} stroke="currentColor" />
              </button>
              {/* Redondo y sólo con el "+": con el ícono de la app a la
                  izquierda, dos botones con texto no entran al lado del
                  título en una pantalla angosta. */}
              <button
                onClick={() => set({ xSub: "nuevo", xnQuery: "" })}
                aria-label="Nueva conversación"
                style={{
                  flex: "0 0 auto",
                  width: 38,
                  height: 38,
                  border: 0,
                  borderRadius: 999,
                  background: MARCA.acento,
                  color: "#fff",
                  cursor: "pointer",
                  font: "600 19px/1 var(--font-barlow),Barlow,sans-serif",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                +
              </button>
            </div>
            <SearchInput
              value={s.xQuery}
              onChange={(v) => set({ xQuery: v })}
              placeholder="Buscar conversación…"
            />
            <ChipRow chips={chips} />
            {/* Una transferencia no deja rastro en pantalla: la conversación
                desaparece de la lista y listo. Sin esto parece que se perdió. */}
            {transferido && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 11,
                  background: `${MARCA.acento}14`,
                  border: `1px solid ${MARCA.acento}3D`,
                  padding: "9px 11px",
                  font: "500 12px/1.35 var(--font-barlow),Barlow,sans-serif",
                  color: t.ink,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>Conversación transferida a {transferido}.</span>
                <button
                  onClick={() => setTransferido(null)}
                  aria-label="Entendido"
                  style={{
                    flex: "0 0 auto",
                    border: 0,
                    background: "transparent",
                    color: t.ink2,
                    cursor: "pointer",
                    font: "600 13px/1 var(--font-barlow),Barlow,sans-serif",
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Sin separación entre filas y sin margen lateral: la lista es una
              lista, no una pila de tarjetas. Cada conversación era una caja con
              borde y esquinas redondeadas, y veinte cajas seguidas es lo que se
              veía cuadrado. Ahora las filas van pegadas, separadas por una
              línea finita, como en cualquier app de mensajes. */}
          <ScrollBody padding="0" gap={0}>
            {/* La lista va sin padding para que las filas lleguen de borde a
                borde; todo lo que no es una fila se lo pone por su cuenta. */}
            {cargando && (
              <div style={{ padding: "12px 14px" }}>
                <Cargando t={t} que="las conversaciones" />
              </div>
            )}
            {!cargando && error && (
              <div style={{ padding: "12px 14px" }}>
                <Falla t={t} mensaje={error} onReintentar={recargar} />
              </div>
            )}
            {!cargando && !error && filtrados.map((c, idx) => {
              const nl = noLeidosDe(c, s.xLeidos);
              // El color sale del contacto, no del tipo: en el chat del ERP
              // todas son "Cliente", así que el tipo pintaba todo igual.
              const color = colorAvatar(c.id || c.nombre, s.theme === "oscuro");
              return (
                <button
                  key={c.id}
                  onClick={() => abrirChat(c.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    textAlign: "left",
                    padding: "11px 14px",
                    cursor: "pointer",
                    background: t.card,
                    border: 0,
                    // La línea arranca después del avatar, como en WhatsApp: así
                    // el ojo sigue la columna de nombres y no se corta la fila
                    // entera. La primera no lleva, que si no parece un borde.
                    borderTop: idx === 0 ? 0 : `1px solid ${t.border}`,
                  }}
                >
                  <span style={{ position: "relative", flex: "0 0 auto" }}>
                    <span
                      style={{
                        width: 48,
                        height: 48,
                        // Redondo, no cuadrado con las puntas limadas.
                        borderRadius: "50%",
                        background: color.fondo,
                        color: color.tinta,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        font: "700 18px/1 var(--font-barlow),Barlow,sans-serif",
                      }}
                    >
                      {c.nombre.slice(0, 1)}
                    </span>
                    {c.enLinea && (
                      <span
                        style={{
                          position: "absolute",
                          right: 0,
                          bottom: 0,
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: MARCA.acento,
                          border: `2px solid ${t.card}`,
                        }}
                      />
                    )}
                  </span>

                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span
                        style={{
                          font: `${nl > 0 ? 700 : 600} 15.5px/1.2 var(--font-barlow),Barlow,sans-serif`,
                          color: t.ink,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          minWidth: 0,
                        }}
                      >
                        {c.nombre}
                      </span>
                      {/* Antes acá decía "Cliente" en todas, que no distinguía
                          nada. Ahora dice de quién es la conversación: el agente
                          asignado, o la cola si todavía no la tomó nadie. */}
                      {c.responsable === undefined ? null : c.responsable ? (
                        <Badge bg={MARCA.suave} ink={VIOLETA_INK}>
                          {nombreCorto(c.responsable)}
                        </Badge>
                      ) : (
                        <Badge bg={t.bg} ink={t.ink3}>
                          Sin asignar
                        </Badge>
                      )}
                    </span>
                    <span
                      style={{
                        font: nl > 0 ? "600 13px/1.3 var(--font-barlow),Barlow,sans-serif" : "400 13px/1.3 var(--font-barlow),Barlow,sans-serif",
                        color: nl > 0 ? t.ink : t.ink2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ultimoDe(c, s.xEnviados)}
                    </span>
                  </span>

                  <span
                    style={{
                      flex: "0 0 auto",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 6,
                    }}
                  >
                    {/* La hora en verde cuando hay sin leer: es el mismo par de
                        señales que usa WhatsApp —hora en color y globito— y se
                        entiende de un vistazo sin leer el número. */}
                    <span
                      style={{
                        font: `${nl > 0 ? 600 : 400} 11.5px/1 var(--font-barlow),Barlow,sans-serif`,
                        color: nl > 0 ? MARCA.acento : t.ink3,
                      }}
                    >
                      {c.hora}
                    </span>
                    {nl > 0 && (
                      <span
                        style={{
                          minWidth: 21,
                          height: 21,
                          borderRadius: 11,
                          background: MARCA.acento,
                          color: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          font: "700 12px/1 var(--font-barlow),Barlow,sans-serif",
                          padding: "0 6px",
                        }}
                      >
                        {/* Más de 99 no entra y tampoco importa: lo que dice es
                            "muchos". Sin esto, un número de cuatro cifras
                            estiraba el globito y descuadraba la fila. */}
                        {nl > 99 ? "99+" : nl}
                      </span>
                    )}
                  </span>

                  {/* La flecha dice que la fila se abre. Sin ella, una fila con
                      borde arriba y abajo se lee como un renglón de tabla. */}
                  <span
                    aria-hidden
                    style={{
                      flex: "0 0 auto",
                      color: t.ink3,
                      font: "400 17px/1 var(--font-barlow),Barlow,sans-serif",
                    }}
                  >
                    ›
                  </span>
                </button>
              );
            })}
            {!cargando && !error && filtrados.length === 0 && (
              <div style={{ padding: "12px 14px" }}>
                <EmptyState
                  titulo="Sin conversaciones"
                  detalle={
                    colaActiva !== TODAS
                      ? `No hay nada en ${colaActiva} con este filtro. Tocá “Todas” para ver el resto.`
                      : "Probá con otro término o cambiá el filtro."
                  }
                />
              </div>
            )}

            {/* Traer la tanda siguiente. No aparece mientras se busca: ahí lo
                que se ve es un filtro sobre lo que ya está, y un botón que trae
                más de abajo confundiría. Tampoco si la última tanda vino
                incompleta, que quiere decir que no queda nada. */}
            {conErp && !cargando && !error && !finDeLista && !xq && CHATS_VIVOS.length > 0 && (
              <button
                onClick={cargarMas}
                disabled={trayendo}
                style={{
                  border: `1px solid ${t.border}`,
                  borderRadius: 12,
                  background: t.card,
                  color: trayendo ? t.ink3 : t.ink2,
                  padding: "13px 0",
                  margin: "12px 14px 14px",
                  cursor: trayendo ? "default" : "pointer",
                  font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif",
                }}
              >
                {trayendo ? "Cargando…" : "Cargar más"}
              </button>
            )}
          </ScrollBody>
        </>
      )}

      {/* ---------- chat thread ---------- */}
      {s.xSub === "chat" && det && (
        <>
          <div style={{ background: VIOLETA, padding: "4px 14px 14px", display: "flex", alignItems: "center", gap: 11 }}>
            <button
              onClick={() => set({ xSub: "lista", xSel: null })}
              style={{
                width: 32,
                height: 32,
                flex: "0 0 auto",
                border: 0,
                borderRadius: 10,
                background: "rgba(255,255,255,.18)",
                color: "#fff",
                font: "600 17px/1 var(--font-barlow),Barlow,sans-serif",
                cursor: "pointer",
              }}
            >
              ‹
            </button>
            <span
              style={{
                width: 38,
                height: 38,
                flex: "0 0 auto",
                borderRadius: 11,
                background: "rgba(255,255,255,.18)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: "700 15px/1 var(--font-barlow),Barlow,sans-serif",
              }}
            >
              {det.nombre.slice(0, 1)}
            </span>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span
                style={{
                  font: "600 17px/1.2 var(--font-barlow),Barlow,sans-serif",
                  color: "#fff",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {det.nombre}
              </span>
              <span style={{ font: "400 12px/1.2 var(--font-barlow),Barlow,sans-serif", color: "rgba(255,255,255,.75)" }}>
                {(det.enLinea ? "En línea" : `Últ. vez ${det.hora}`) + " · " + det.tipo}
              </span>
            </div>
            {/* Transferir y ver la ficha, los dos sobre el encabezado.
                Transferir va sólo con el símbolo: en un teléfono dos botones
                con texto no entran al lado de un nombre largo. */}
            <button
              onClick={() => set({ xTransferir: det.id })}
              aria-label="Transferir conversación"
              style={{
                flex: "0 0 auto",
                width: 34,
                height: 34,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,.3)",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
                font: "600 14px/1 var(--font-barlow),Barlow,sans-serif",
              }}
            >
              ⇄
            </button>
            <button
              onClick={() => set({ xFicha: det.id })}
              style={{
                flex: "0 0 auto",
                borderRadius: 999,
                padding: "7px 12px",
                border: "1px solid rgba(255,255,255,.3)",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
                font: "600 12.5px/1 var(--font-barlow),Barlow,sans-serif",
                whiteSpace: "nowrap",
              }}
            >
              Ficha
            </button>
          </div>

          <div
            ref={hilo}
            onScroll={() => {
              // Quién manda la vista: si estás al final, el hilo te sigue; si
              // subiste a leer, te deja donde estás.
              const caja = hilo.current;
              if (caja) anclado.current = alFinal(caja);
            }}
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              padding: "14px",
              // El lienzo del hilo también es del chat: con el fondo general
              // los globos propios quedaban flotando sin apoyo.
              background: ch.lienzo,
            }}
          >
            {/* Los globos van en su propia caja, adentro de la que scrollea:
                es la que se mide para saber que el hilo creció. */}
            <div ref={contenido} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <div style={{ textAlign: "center", font: "500 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>Hoy</div>
              {detMsgs.map(burbuja)}
            </div>
          </div>

          {/* Attachment tray */}
          {s.xPanel === "adj" && (
            <div
              style={{
                padding: "12px 14px",
                background: t.card,
                borderTop: `1px solid ${t.border}`,
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 12,
              }}
            >
              {ADJUNTOS.map((a) => (
                <button
                  key={a.key}
                  onClick={() => {
                    set({ xPanel: "none" });
                    // Cámara, galería, audio y documento abren el selector del
                    // celular y mandan el archivo de verdad.
                    if (a.key === "camara") return elegirArchivo("image/*", true);
                    if (a.key === "galeria") return elegirArchivo("image/*");
                    if (a.key === "audioarch") return elegirArchivo("audio/*");
                    if (a.key === "documento") return elegirArchivo("*/*");

                    // Ubicación y contacto no son archivos: necesitan lo suyo
                    // (GPS, agenda) y todavía no están. Se dice, en vez de
                    // mandar un adjunto inventado.
                    if (conErp) {
                      set({ xEnvioError: `Todavía no se puede mandar ${a.label.toLowerCase()} desde la app.` });
                      return;
                    }
                    pushMsg(det.id, {
                      de: "yo",
                      hora: "11:42",
                      tick: "✓",
                      texto: "",
                      archivo: { tag: a.tag, nombre: a.nombre, peso: a.peso },
                    });
                  }}
                  style={{
                    border: 0,
                    background: "none",
                    padding: 0,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 15,
                      // Un solo color para los seis. Seis fondos distintos
                      // competían entre sí y no decían nada: el que diferencia
                      // es el dibujo, no el color.
                      background: MARCA.headerSuave,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {ICONO_ADJUNTO[a.key] ?? <IconDocumento />}
                  </span>
                  <span style={{ font: "500 11px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink2, textAlign: "center" }}>
                    {a.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Emoji / sticker / GIF tray */}
          {s.xPanel === "stick" && (
            <div
              style={{
                padding: "12px 14px",
                background: t.card,
                borderTop: `1px solid ${t.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", gap: 7 }}>
                {(["Emojis", "Stickers"] as const).map((k) => {
                  const on = s.xPanelTab === k;
                  return (
                    <button
                      key={k}
                      onClick={() => set({ xPanelTab: k })}
                      style={{
                        borderRadius: 999,
                        padding: "7px 13px",
                        cursor: "pointer",
                        font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif",
                        background: on ? MARCA.suave : t.card,
                        color: on ? VIOLETA_INK : t.ink2,
                        border: `1px solid ${on ? "#C3DCE6" : t.border}`,
                      }}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  maxHeight: 148,
                  overflowY: "auto",
                }}
              >
                {panelLista.map((g, i) => {
                  const esEmoji = s.xPanelTab === "Emojis";
                  const esFavorito = favoritos.includes(g);
                  return (
                    <button
                      key={`${g}-${i}`}
                      onClick={() => {
                        if (esEmoji) return set({ xTexto: s.xTexto + g });
                        // Nuestros "stickers" son emojis, no archivos .webp.
                        // Con ERP van como texto, que es lo que de verdad son
                        // y lo que llega bien a WhatsApp. El endpoint de
                        // stickers del ERP espera una URL, y para eso haría
                        // falta un catálogo de stickers que la app no tiene.
                        if (conErp) {
                          const hora = new Date().toTimeString().slice(0, 5);
                          pushMsg(det.id, { de: "yo", texto: g, hora, tick: "…" });
                          repo.chats
                            .enviar(det.id, { de: "yo", texto: g })
                            .then(() => set({ xEnvioError: "" }))
                            .catch((e: unknown) =>
                              set({ xEnvioError: e instanceof Error ? e.message : "No se pudo enviar." }),
                            );
                          set({ xPanel: "none" });
                          return;
                        }
                        pushMsg(det.id, { de: "yo", hora: "11:42", tick: "✓", texto: "", sticker: g });
                      }}
                      // Mantener apretado lo marca como favorito. Es el gesto
                      // que ya se usa para esto en cualquier teclado, y no roba
                      // el toque corto, que es mandar.
                      onContextMenu={(e) => {
                        e.preventDefault();
                        marcar(g);
                      }}
                      title={esFavorito ? "Mantené apretado para quitar de favoritos" : "Mantené apretado para marcar como favorito"}
                      style={{
                        position: "relative",
                        width: esEmoji ? 40 : 58,
                        height: esEmoji ? 40 : 58,
                        borderRadius: 12,
                        cursor: "pointer",
                        fontSize: esEmoji ? 22 : 30,
                        lineHeight: 1,
                        background: esFavorito ? MARCA.suave : esEmoji ? "transparent" : t.bg,
                        border: `1px solid ${esFavorito ? MARCA.acento : esEmoji ? "transparent" : t.border}`,
                      }}
                    >
                      {g}
                      {esFavorito && (
                        <span
                          aria-hidden
                          style={{
                            position: "absolute",
                            top: 1,
                            right: 3,
                            fontSize: 9,
                            lineHeight: 1,
                            color: MARCA.acento,
                          }}
                        >
                          ★
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Un mensaje que se ve en la pantalla y nunca salió es peor que un
              error: el vendedor se queda esperando una respuesta que no va a
              venir. El mensaje del ERP va tal cual. */}
          {s.xEnvioError && (
            <div
              style={{
                padding: "9px 14px",
                background: "#FBE9E7",
                color: "#8C2F2B",
                borderTop: "1px solid #E8B4AE",
                font: "500 12px/1.4 var(--font-barlow),Barlow,sans-serif",
              }}
            >
              {s.xEnvioError}
            </div>
          )}

          {/* El mensaje que se está citando. Deslizar un globo hacia adentro lo
              trae acá; la X lo saca. */}
          {s.xCita && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 14px",
                background: ch.lienzo,
                borderTop: `1px solid ${t.border}`,
              }}
            >
              <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: MARCA.acento, flex: "0 0 auto" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    font: "600 11px/1 var(--font-barlow),Barlow,sans-serif",
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: MARCA.acento,
                  }}
                >
                  Respondiendo a
                </span>
                <span
                  style={{
                    font: "400 13px/1.3 var(--font-barlow),Barlow,sans-serif",
                    color: t.ink2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.xCita}
                </span>
              </span>
              <button
                onClick={() => set({ xCita: null, xCitaId: null, xCitaMio: false })}
                aria-label="No responder a ese mensaje"
                style={{
                  width: 28,
                  height: 28,
                  flex: "0 0 auto",
                  border: 0,
                  borderRadius: "50%",
                  background: "transparent",
                  color: t.ink3,
                  cursor: "pointer",
                  font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Composer */}
          <div
            style={{
              padding: "10px 14px 13px",
              background: t.card,
              borderTop: `1px solid ${t.border}`,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {s.xGrab ? (
              <>
                <button
                  onClick={cancelarAudio}
                  style={{
                    width: 38,
                    height: 38,
                    flex: "0 0 auto",
                    borderRadius: 12,
                    cursor: "pointer",
                    font: "600 14px/1 var(--font-barlow),Barlow,sans-serif",
                    background: "#FBE9E7",
                    border: "1px solid #E8B4AE",
                    color: "#8C2F2B",
                  }}
                  aria-label="Cancelar grabación"
                >
                  ✕
                </button>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    borderRadius: 12,
                    padding: "0 12px",
                    height: 40,
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#B0322F",
                      animation: "zt-pulso 1s ease-in-out infinite",
                      flex: "0 0 auto",
                    }}
                  />
                  <span style={{ display: "flex", alignItems: "flex-end", gap: 2, flex: 1, height: 18 }}>
                    {ondaArr(14).map((h, j) => (
                      <span key={j} style={{ flex: 1, height: h, borderRadius: 1, background: "#AFD0DE" }} />
                    ))}
                  </span>
                  <span style={{ font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2, flex: "0 0 auto" }}>
                    {fmtSeg(s.xSeg)}
                  </span>
                </div>
                <button
                  onClick={enviarAudio}
                  style={{
                    width: 40,
                    height: 40,
                    flex: "0 0 auto",
                    border: 0,
                    borderRadius: 12,
                    cursor: "pointer",
                    font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
                    background: VIOLETA,
                    color: "#fff",
                  }}
                  aria-label="Enviar nota de voz"
                >
                  ↑
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => set({ xPanel: s.xPanel === "adj" ? "none" : "adj" })}
                  style={{
                    width: 38,
                    height: 38,
                    flex: "0 0 auto",
                    borderRadius: 12,
                    cursor: "pointer",
                    font: "600 18px/1 var(--font-barlow),Barlow,sans-serif",
                    background: s.xPanel === "adj" ? MARCA.suave : t.bg,
                    border: `1px solid ${t.border}`,
                    color: s.xPanel === "adj" ? VIOLETA_INK : t.ink2,
                  }}
                  aria-label="Adjuntar"
                >
                  +
                </button>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    borderRadius: 12,
                    padding: "0 6px 0 12px",
                    height: 40,
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  <input
                    type="text"
                    value={s.xTexto}
                    onChange={(e) => set({ xTexto: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") enviarTexto();
                    }}
                    placeholder="Escribí un mensaje…"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: 0,
                      background: "transparent",
                      outline: "none",
                      fontSize: 15.5,
                      color: t.ink,
                    }}
                  />
                  <button
                    onClick={() => set({ xPanel: s.xPanel === "stick" ? "none" : "stick" })}
                    style={{
                      width: 30,
                      height: 30,
                      flex: "0 0 auto",
                      border: 0,
                      borderRadius: 9,
                      cursor: "pointer",
                      fontSize: 16,
                      lineHeight: 1,
                      background: s.xPanel === "stick" ? MARCA.suave : "transparent",
                    }}
                    aria-label="Emojis y stickers"
                  >
                    ☺
                  </button>
                </div>
                {s.xTexto.trim().length > 0 ? (
                  <button
                    onClick={enviarTexto}
                    style={{
                      width: 40,
                      height: 40,
                      flex: "0 0 auto",
                      border: 0,
                      borderRadius: 12,
                      cursor: "pointer",
                      font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
                      background: VIOLETA,
                      color: "#fff",
                    }}
                    aria-label="Enviar"
                  >
                    ↑
                  </button>
                ) : (
                  <button
                    onClick={arrancarAudio}
                    style={{
                      width: 40,
                      height: 40,
                      flex: "0 0 auto",
                      border: 0,
                      borderRadius: 12,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: MARCA.headerSuave,
                      color: "#fff",
                    }}
                    aria-label="Grabar nota de voz"
                  >
                    {/* Un micrófono, no una nota musical: lo que hace el botón
                        es grabar la voz, no reproducir música. */}
                    <IconAudio size={21} />
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ---------- new conversation ---------- */}
      {s.xSub === "nuevo" && (
        <>
          <div style={{ background: VIOLETA, padding: "4px 14px 16px", display: "flex", alignItems: "center", gap: 11 }}>
            <button
              onClick={() => set({ xSub: "lista", xSel: null })}
              style={{
                width: 32,
                height: 32,
                flex: "0 0 auto",
                border: 0,
                borderRadius: 10,
                background: "rgba(255,255,255,.18)",
                color: "#fff",
                font: "600 17px/1 var(--font-barlow),Barlow,sans-serif",
                cursor: "pointer",
              }}
            >
              ‹
            </button>
            <div style={{ font: "600 17px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>Nueva conversación</div>
          </div>

          <div style={{ padding: "12px 14px 0" }}>
            <SearchInput
              value={s.xnQuery}
              onChange={(v) => set({ xnQuery: v })}
              placeholder="Buscar cliente o proveedor…"
            />
          </div>

          <ScrollBody>
            {contactosFiltrados.map((c) => {
              const color = colorAvatar(c.chatId || c.nombre, s.theme === "oscuro");
              return (
                <button
                  key={c.chatId}
                  onClick={() => abrirChat(c.chatId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    textAlign: "left",
                    borderRadius: 14,
                    padding: 13,
                    cursor: "pointer",
                    background: t.card,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      flex: "0 0 auto",
                      borderRadius: 12,
                      background: color.fondo,
                      color: color.tinta,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      font: "700 15px/1 var(--font-barlow),Barlow,sans-serif",
                    }}
                  >
                    {c.nombre.slice(0, 1)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ font: "600 14px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{c.nombre}</span>
                    <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>{c.detalle}</span>
                  </span>
                  <span style={{ font: "600 16px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>›</span>
                </button>
              );
            })}
            {contactosFiltrados.length === 0 && (
              <EmptyState titulo="Sin contactos" detalle="Probá con otro nombre." />
            )}
          </ScrollBody>
        </>
      )}

      {s.xSub === "lista" && <BottomNav />}

      {s.xVisor && <Visor src={s.xVisor.src} tipo={s.xVisor.tipo} onCerrar={() => set({ xVisor: null })} />}

      {/* La barra de reacciones. Abajo, que es donde llega el pulgar. */}
      {s.xReaccion && (
        <div
          role="presentation"
          onClick={() => set({ xReaccion: null })}
          style={{ position: "fixed", inset: 0, zIndex: 56, background: "rgba(0,0,0,.3)", display: "flex", alignItems: "flex-end" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              background: t.card,
              borderRadius: "20px 20px 0 0",
              padding: "14px 12px",
              paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
            }}
          >
            {REACCIONES.map((e) => (
              <button
                key={e}
                onClick={() => void reaccionar(e)}
                aria-label={`Reaccionar con ${e}`}
                style={{
                  flex: 1,
                  border: 0,
                  background: "none",
                  cursor: "pointer",
                  fontSize: 30,
                  lineHeight: 1,
                  padding: "6px 0",
                }}
              >
                {e}
              </button>
            ))}
            {/* Sacar la reacción es mandar un emoji vacío: así lo entiende
                WhatsApp, y es lo que espera quien se arrepintió. */}
            <button
              onClick={() => void reaccionar("")}
              aria-label="Sacar la reacción"
              style={{
                flex: "0 0 auto",
                width: 40,
                height: 40,
                border: `1px solid ${t.border}`,
                borderRadius: 999,
                background: t.bg,
                color: t.ink2,
                cursor: "pointer",
                font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {s.xFicha && (
        <FichaChatPanel
          chatId={s.xFicha}
          onCerrar={() => set({ xFicha: null })}
          onAbrirCliente={(clienteId) =>
            set({ xFicha: null, screen: "clientes", cSub: "detalle", cSel: clienteId })
          }
        />
      )}

      {s.xTransferir && (
        <TransferirPanel
          chatId={s.xTransferir}
          onCerrar={() => set({ xTransferir: null })}
          onTransferido={(aDonde) => {
            // La conversación ya no es de quien la tenía: quedarse adentro del
            // chat sería mirar algo que dejó de ser suyo. Se vuelve a la lista
            // y se la vuelve a pedir, que es lo que decide qué sigue visible.
            setTransferido(aDonde);
            set({ xTransferir: null, xFicha: null, xSub: "lista", xSel: null });
            actualizar();
          }}
        />
      )}
    </div>
  );
}

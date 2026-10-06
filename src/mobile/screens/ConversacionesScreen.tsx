"use client";

import { MARCA } from "@/lib/theme";
import { ADJUNTOS, CHATS, EMOJIS, GIFS, STICKERS } from "@/lib/data";
import {
  IconAudio,
  IconCamara,
  IconDocumento,
  IconGaleria,
  IconUbicacion,
} from "../ui/Icons";
import { repo, SinCola, usaApiDelErp } from "@/lib/repo";
import { useRemoto } from "./useRemoto";
import { Cargando, Falla } from "../ui/Estado";
import { msgsDe, noLeidosDe, ondaArr, ultimoDe } from "@/lib/calc";
import { fmtSeg, gs, norm } from "@/lib/format";
import { useRef, useState } from "react";
import { Grabador } from "@/lib/grabador";
import type { ChatMsg, ThemeTokens } from "@/lib/types";
import { useApp } from "@/store/AppContext";
import { BottomNav } from "../layout/BottomNav";
import { StatusBar } from "../layout/StatusBar";
import { Badge, ChipRow, EmptyState, ScrollBody, SearchInput } from "../ui/primitives";

const VIOLETA = MARCA.header;
const VIOLETA_INK = MARCA.headerSuave;

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
}: {
  url?: string;
  etiqueta?: string;
  mio: boolean;
  t: ThemeTokens;
  oscuro: boolean;
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
      <span style={{ font: "500 11px/1 var(--font-barlow),Barlow,sans-serif", color: mio ? "#4A7284" : t.ink3, flex: "0 0 auto" }}>
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

  // Las conversaciones salen del ERP: son los chats de WhatsApp asignados a
  // este asesor. Sin ERP quedan las de ejemplo, para poder ver la pantalla.
  const conErp = usaApiDelErp();
  const { datos, cargando, error, recargar } = useRemoto(
    () => (conErp ? repo.chats.list() : Promise.resolve(CHATS)),
    [conErp],
  );
  // No es lo mismo "no tenés conversaciones" que "no atendés chats": a quien no
  // está en ninguna cola hay que decirle eso, no dejarlo mirando una lista
  // vacía creyendo que nadie le escribió.
  const sinCola = error === new SinCola().message;
  const CHATS_VIVOS = datos;

  const noLeidosTotal = CHATS_VIVOS.reduce((a, c) => a + noLeidosDe(c, s.xLeidos), 0);
  const xq = norm(s.xQuery.trim());

  const filtrados = CHATS_VIVOS.filter((c) => {
    if (s.xFiltro === "No leídas" && noLeidosDe(c, s.xLeidos) === 0) return false;
    if (s.xFiltro === "Clientes" && c.tipo !== "Cliente") return false;
    if (s.xFiltro === "Proveedores" && c.tipo !== "Proveedor") return false;
    return norm(c.nombre + " " + ultimoDe(c, s.xEnviados)).indexOf(xq) >= 0;
  });

  const det = CHATS_VIVOS.find((c) => c.id === s.xSel) ?? null;

  // El listado sólo trae la vista previa del último mensaje; la conversación
  // entera se pide al abrirla. Sin esto se vería un solo globo y parecería que
  // no hay historial.
  const { datos: conversacion } = useRemoto(
    () => (conErp && s.xSel ? repo.chats.get(s.xSel).then((c) => (c ? [c] : [])) : Promise.resolve([])),
    [conErp, s.xSel],
  );
  const detMsgs = conErp
    ? [...(conversacion[0]?.msgs ?? []), ...(s.xEnviados[s.xSel ?? ""] ?? [])]
    : det
      ? msgsDe(det, s.xEnviados)
      : [];

  const contactos = CHATS_VIVOS.map((c) => ({
    nombre: c.nombre,
    tipo: c.tipo,
    chatId: c.id,
    detalle: c.tipo === "Cliente" ? "Cliente · conversación abierta" : "Proveedor · conversación abierta",
  }));
  const contactosFiltrados = contactos.filter(
    (c) => norm(c.nombre).indexOf(norm(s.xnQuery.trim())) >= 0,
  );

  const chips = ["Todas", "No leídas", "Clientes", "Proveedores"].map((k) => {
    const on = s.xFiltro === k;
    return {
      label: k,
      bg: on ? VIOLETA : t.card,
      fg: on ? "#ffffff" : t.ink2,
      border: on ? VIOLETA : t.border,
      pick: () => set({ xFiltro: k }),
    };
  });

  const panelLista =
    s.xPanelTab === "Emojis" ? EMOJIS : s.xPanelTab === "Stickers" ? STICKERS : GIFS;

  const enviarTexto = () => {
    const texto = s.xTexto.trim();
    if (!texto || !det) return;

    // Se muestra enseguida y se manda en paralelo: en la calle la señal va y
    // viene, y esperar la respuesta del servidor para ver lo que uno escribió
    // hace sentir que la app se colgó.
    const hora = new Date().toTimeString().slice(0, 5);
    pushMsg(det.id, { de: "yo", texto, hora, tick: conErp ? "…" : "✓" });
    if (!conErp) return;

    repo.chats
      .enviar(det.id, { de: "yo", texto })
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
    // Una foto sola va sin globo: el marco alrededor de una imagen no agrega
    // nada y le roba ancho, que en un celular es lo que falta.
    const soloFoto = !!m.imagen && !m.texto && !m.archivo && !m.audio && !m.pedido;
    const desnudo = esSticker || soloFoto;

    // La reacción no es un mensaje: es un emoji suelto, chico, del lado de
    // quien reaccionó. Antes se veía un globo que decía "[reaction]".
    if (m.reaccion) {
      return (
        <div key={i} style={{ display: "flex", justifyContent: mio ? "flex-end" : "flex-start", marginTop: -4 }}>
          <span
            style={{
              fontSize: 20,
              lineHeight: 1,
              padding: "3px 7px",
              borderRadius: 999,
              background: t.card,
              border: `1px solid ${t.border}`,
            }}
            title={`Reaccionó ${m.reaccion}`}
          >
            {m.reaccion}
          </span>
        </div>
      );
    }

    return (
      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: mio ? "flex-end" : "flex-start" }}>
        <div
          style={{
            maxWidth: "82%",
            borderRadius: mio ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            background: desnudo ? "transparent" : mio ? MARCA.suave : t.card,
            border: `1px solid ${desnudo ? "transparent" : mio ? "#C3DCE6" : t.border}`,
            padding: desnudo ? 0 : "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
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
                  color: mio ? VIOLETA_INK : t.ink2,
                }}
              >
                {m.pedido.tag}
              </span>
              <span style={{ font: "700 15px/1.1 var(--font-barlow),Barlow,sans-serif", color: mio ? "#17384A" : t.ink }}>
                {gs(m.pedido.total)}
              </span>
              <span style={{ font: "400 11px/1.3 var(--font-barlow),Barlow,sans-serif", color: mio ? VIOLETA_INK : t.ink2 }}>
                {m.pedido.detalle}
              </span>
            </div>
          )}

          {esSticker && !m.imagen && <span style={{ fontSize: 46, lineHeight: 1 }}>{m.sticker}</span>}

          {m.imagen && (
            // Tocarla la abre en grande, que es lo que uno intenta hacer. El
            // `alt` dice qué es: si el enlace cae, queda un texto y no un ícono roto.
            <a href={m.imagen} target="_blank" rel="noreferrer" style={{ display: "block", lineHeight: 0 }}>
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
            </a>
          )}

          {m.epigrafe && (
            <span style={{ font: "400 15px/1.4 var(--font-barlow),Barlow,sans-serif", color: mio ? "#17384A" : t.ink }}>
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
                        color: mio ? "#17384A" : t.ink,
                        // Un nombre largo no puede empujar el globo fuera de la
                        // pantalla: se corta con puntos suspensivos.
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.archivo.nombre}
                    </span>
                    <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: mio ? "#4A7284" : t.ink3 }}>
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
                color: mio ? "#17384A" : t.ink,
                // Un link o una palabra sin espacios no tiene que desbordar.
                overflowWrap: "anywhere",
              }}
            >
              {m.texto}
            </span>
          )}

          {!desnudo && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, alignSelf: "flex-end" }}>
              <span style={{ font: "400 11px/1 var(--font-barlow),Barlow,sans-serif", color: mio ? "#4A7284" : t.ink3 }}>
                {m.hora}
              </span>
              {mio && (
                <span
                  style={{
                    font: "600 11px/1 var(--font-barlow),Barlow,sans-serif",
                    color: m.tick === "✓✓" ? VIOLETA_INK : "#6E97A8",
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
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <button
                onClick={() => set({ screen: "home" })}
                style={{
                  width: 32,
                  height: 32,
                  flex: "0 0 auto",
                  border: 0,
                  borderRadius: 10,
                  cursor: "pointer",
                  font: "600 17px/1 var(--font-barlow),Barlow,sans-serif",
                  background: t.bg,
                  color: t.ink,
                }}
              >
                ‹
              </button>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ font: "700 19px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Conversaciones</span>
                <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                  {noLeidosTotal > 0
                    ? `${noLeidosTotal} ${noLeidosTotal === 1 ? "mensaje sin leer" : "mensajes sin leer"}`
                    : "Todo al día"}
                </span>
              </div>
              <button
                onClick={() => set({ xSub: "nuevo", xnQuery: "" })}
                style={{
                  flex: "0 0 auto",
                  border: 0,
                  borderRadius: 999,
                  background: VIOLETA,
                  color: "#fff",
                  padding: "9px 15px",
                  cursor: "pointer",
                  font: "600 13px/1 var(--font-barlow),Barlow,sans-serif",
                  whiteSpace: "nowrap",
                }}
              >
                + Nueva
              </button>
            </div>
            <SearchInput
              value={s.xQuery}
              onChange={(v) => set({ xQuery: v })}
              placeholder="Buscar conversación…"
            />
            <ChipRow chips={chips} />
          </div>

          <ScrollBody>
            {cargando && <Cargando t={t} que="las conversaciones" />}
            {!cargando && error && <Falla t={t} mensaje={error} onReintentar={recargar} />}
            {!cargando && !error && filtrados.map((c) => {
              const nl = noLeidosDe(c, s.xLeidos);
              const esCliente = c.tipo === "Cliente";
              return (
                <button
                  key={c.id}
                  onClick={() => abrirChat(c.id)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 11,
                    textAlign: "left",
                    borderRadius: 16,
                    padding: 13,
                    cursor: "pointer",
                    background: nl > 0 ? (s.theme === "oscuro" ? "#1b2238" : "#F4F3FA") : t.card,
                    border: `1px solid ${nl > 0 ? "#AFD0DE" : t.border}`,
                  }}
                >
                  <span style={{ position: "relative", flex: "0 0 auto" }}>
                    <span
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 13,
                        background: esCliente ? "#E2F0F4" : MARCA.suave,
                        color: esCliente ? "#04617A" : VIOLETA_INK,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        font: "700 16px/1 var(--font-barlow),Barlow,sans-serif",
                      }}
                    >
                      {c.nombre.slice(0, 1)}
                    </span>
                    {c.enLinea && (
                      <span
                        style={{
                          position: "absolute",
                          right: -2,
                          bottom: -2,
                          width: 11,
                          height: 11,
                          borderRadius: "50%",
                          background: "#1C8C84",
                          border: `2px solid ${t.card}`,
                        }}
                      />
                    )}
                  </span>

                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span
                        style={{
                          font: "600 15.5px/1.2 var(--font-barlow),Barlow,sans-serif",
                          color: t.ink,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.nombre}
                      </span>
                      <Badge
                        bg={esCliente ? "#E2F0F4" : MARCA.suave}
                        ink={esCliente ? "#04617A" : VIOLETA_INK}
                      >
                        {c.tipo}
                      </Badge>
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
                      gap: 5,
                    }}
                  >
                    <span style={{ font: "400 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>{c.hora}</span>
                    {nl > 0 && (
                      <span
                        style={{
                          minWidth: 18,
                          height: 18,
                          borderRadius: 9,
                          background: VIOLETA,
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          font: "700 10.5px/1 var(--font-barlow),Barlow,sans-serif",
                          padding: "0 5px",
                        }}
                      >
                        {nl}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {!cargando && !error && filtrados.length === 0 && (
              <EmptyState titulo="Sin conversaciones" detalle="Probá con otro término o cambiá el filtro." />
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
            <button
              onClick={() => {
                if (det.tipo === "Cliente") return set({ screen: "clientes", cSub: "detalle", cSel: det.refId });
                set({ screen: "compras", kSub: "lista", kQuery: "" });
              }}
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
              {det.tipo === "Cliente" ? "Ver ficha" : "Ver compras"}
            </button>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: 9,
            }}
          >
            <div style={{ textAlign: "center", font: "500 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>Hoy</div>
            {detMsgs.map(burbuja)}
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
                {(["Emojis", "Stickers", "GIF"] as const).map((k) => {
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
                      style={{
                        width: esEmoji ? 40 : 58,
                        height: esEmoji ? 40 : 58,
                        borderRadius: 12,
                        cursor: "pointer",
                        fontSize: esEmoji ? 22 : 30,
                        lineHeight: 1,
                        background: esEmoji ? "transparent" : t.bg,
                        border: `1px solid ${esEmoji ? "transparent" : t.border}`,
                      }}
                    >
                      {g}
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
              const esCliente = c.tipo === "Cliente";
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
                      background: esCliente ? "#E2F0F4" : MARCA.suave,
                      color: esCliente ? "#04617A" : VIOLETA_INK,
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
    </div>
  );
}

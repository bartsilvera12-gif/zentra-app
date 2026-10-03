"use client";

import { ADJUNTOS, CHATS, EMOJIS, GIFS, PLANTILLAS, STICKERS } from "@/lib/data";
import { msgsDe, noLeidosDe, ondaArr, ultimoDe } from "@/lib/calc";
import { fmtSeg, gs, norm } from "@/lib/format";
import type { ChatMsg } from "@/lib/types";
import { useApp } from "@/store/AppContext";
import { BottomNav } from "../layout/BottomNav";
import { StatusBar } from "../layout/StatusBar";
import { Badge, ChipRow, EmptyState, ScrollBody, SearchInput } from "../ui/primitives";

const VIOLETA = "#525890";
const VIOLETA_INK = "#4B3C86";

export function ConversacionesScreen() {
  const { s, t, set, abrirChat, pushMsg, startGrab, stopGrab } = useApp();

  const noLeidosTotal = CHATS.reduce((a, c) => a + noLeidosDe(c, s.xLeidos), 0);
  const xq = norm(s.xQuery.trim());

  const filtrados = CHATS.filter((c) => {
    if (s.xFiltro === "No leídas" && noLeidosDe(c, s.xLeidos) === 0) return false;
    if (s.xFiltro === "Clientes" && c.tipo !== "Cliente") return false;
    if (s.xFiltro === "Proveedores" && c.tipo !== "Proveedor") return false;
    return norm(c.nombre + " " + ultimoDe(c, s.xEnviados)).indexOf(xq) >= 0;
  });

  const det = CHATS.find((c) => c.id === s.xSel) ?? null;
  const detMsgs = det ? msgsDe(det, s.xEnviados) : [];

  const contactos = CHATS.map((c) => ({
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
    pushMsg(det.id, { de: "yo", texto, hora: "11:42", tick: "✓" });
  };

  const enviarAudio = () => {
    stopGrab();
    const dur = fmtSeg(Math.max(1, s.xSeg));
    if (det) pushMsg(det.id, { de: "yo", hora: "11:42", tick: "✓", texto: "", audio: dur });
    set({ xGrab: false, xSeg: 0 });
  };

  const cancelarAudio = () => {
    stopGrab();
    set({ xGrab: false, xSeg: 0 });
  };

  const topBg = s.xSub === "lista" ? t.card : VIOLETA;

  /** One message bubble. Handles text, order cards, stickers, voice notes and files. */
  const burbuja = (m: ChatMsg, i: number) => {
    const mio = m.de === "yo";
    const esSticker = !!m.sticker;
    return (
      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: mio ? "flex-end" : "flex-start" }}>
        <div
          style={{
            maxWidth: "82%",
            borderRadius: mio ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            background: esSticker ? "transparent" : mio ? "#E8E6F5" : t.card,
            border: `1px solid ${esSticker ? "transparent" : mio ? "#C9C5E4" : t.border}`,
            padding: esSticker ? 0 : "9px 11px",
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
                background: mio ? "#D7D3EE" : t.bg,
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
              <span style={{ font: "700 15px/1.1 var(--font-barlow),Barlow,sans-serif", color: mio ? "#2E2A52" : t.ink }}>
                {gs(m.pedido.total)}
              </span>
              <span style={{ font: "400 11px/1.3 var(--font-barlow),Barlow,sans-serif", color: mio ? VIOLETA_INK : t.ink2 }}>
                {m.pedido.detalle}
              </span>
            </div>
          )}

          {esSticker && <span style={{ fontSize: 46, lineHeight: 1 }}>{m.sticker}</span>}

          {m.audio && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 150 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  flex: "0 0 auto",
                  borderRadius: "50%",
                  background: mio ? VIOLETA_INK : "#8A85AD",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "600 11px/1 var(--font-barlow),Barlow,sans-serif",
                }}
              >
                ▶
              </span>
              <span style={{ display: "flex", alignItems: "flex-end", gap: 2, flex: 1, height: 20 }}>
                {ondaArr(14).map((h, j) => (
                  <span
                    key={j}
                    style={{
                      flex: 1,
                      height: h,
                      borderRadius: 1,
                      background: mio ? "#8A85AD" : s.theme === "oscuro" ? "#4b5570" : "#B9BBD9",
                    }}
                  />
                ))}
              </span>
              <span style={{ font: "500 10.5px/1 var(--font-barlow),Barlow,sans-serif", color: mio ? "#6A648F" : t.ink3 }}>
                {m.audio}
              </span>
            </div>
          )}

          {m.archivo && (
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span
                style={{
                  width: 32,
                  height: 32,
                  flex: "0 0 auto",
                  borderRadius: 9,
                  background: mio ? VIOLETA_INK : "#5478AB",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "600 9px/1 var(--font-barlow),Barlow,sans-serif",
                }}
              >
                {m.archivo.tag || "DOC"}
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ font: "600 12px/1.2 var(--font-barlow),Barlow,sans-serif", color: mio ? "#2E2A52" : t.ink }}>
                  {m.archivo.nombre}
                </span>
                <span style={{ font: "400 10.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: mio ? "#6A648F" : t.ink3 }}>
                  {m.archivo.peso}
                </span>
              </span>
            </div>
          )}

          {!!m.texto && m.texto.length > 0 && (
            <span style={{ font: "400 13px/1.4 var(--font-barlow),Barlow,sans-serif", color: mio ? "#2E2A52" : t.ink }}>
              {m.texto}
            </span>
          )}

          {!esSticker && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, alignSelf: "flex-end" }}>
              <span style={{ font: "400 9.5px/1 var(--font-barlow),Barlow,sans-serif", color: mio ? "#6A648F" : t.ink3 }}>
                {m.hora}
              </span>
              {mio && (
                <span
                  style={{
                    font: "600 9.5px/1 var(--font-barlow),Barlow,sans-serif",
                    color: m.tick === "✓✓" ? VIOLETA_INK : "#8A85AD",
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
            {filtrados.map((c) => {
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
                    border: `1px solid ${nl > 0 ? "#B9BBD9" : t.border}`,
                  }}
                >
                  <span style={{ position: "relative", flex: "0 0 auto" }}>
                    <span
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 13,
                        background: esCliente ? "#E2F0F4" : "#EDE8F7",
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
                          font: "600 14px/1.2 var(--font-barlow),Barlow,sans-serif",
                          color: t.ink,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.nombre}
                      </span>
                      <Badge
                        bg={esCliente ? "#E2F0F4" : "#EDE8F7"}
                        ink={esCliente ? "#04617A" : VIOLETA_INK}
                      >
                        {c.tipo}
                      </Badge>
                    </span>
                    <span
                      style={{
                        font: nl > 0 ? "600 12px/1.3 var(--font-barlow),Barlow,sans-serif" : "400 12px/1.3 var(--font-barlow),Barlow,sans-serif",
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
                    <span style={{ font: "400 10.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>{c.hora}</span>
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
            {filtrados.length === 0 && (
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
                  font: "600 15px/1.2 var(--font-barlow),Barlow,sans-serif",
                  color: "#fff",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {det.nombre}
              </span>
              <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: "rgba(255,255,255,.75)" }}>
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
                font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif",
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
            <div style={{ textAlign: "center", font: "500 10.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>Hoy</div>
            {detMsgs.map(burbuja)}
          </div>

          {/* Quick-reply templates, shown only when no panel is open */}
          {s.xPanel === "none" && !s.xGrab && (
            <div
              className="zt-no-scrollbar"
              style={{ display: "flex", gap: 7, overflowX: "auto", padding: "0 14px 8px" }}
            >
              {PLANTILLAS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => set({ xTexto: p.texto, xPanel: "none" })}
                  style={{
                    flex: "0 0 auto",
                    borderRadius: 999,
                    padding: "7px 12px",
                    cursor: "pointer",
                    font: "500 11.5px/1 var(--font-barlow),Barlow,sans-serif",
                    whiteSpace: "nowrap",
                    background: t.card,
                    border: `1px solid ${t.border}`,
                    color: t.ink2,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

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
                    if (a.key === "pedido") {
                      pushMsg(det.id, {
                        de: "yo",
                        hora: "11:42",
                        tick: "✓",
                        texto: "Te adjunto el pedido armado para confirmar.",
                        pedido: { tag: "Pedido sugerido", total: 456000, detalle: "48 × Cerveza lata 350 ml" },
                      });
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
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: a.bg,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      font: "600 17px/1 var(--font-barlow),Barlow,sans-serif",
                    }}
                  >
                    {a.icono}
                  </span>
                  <span style={{ font: "500 10px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink2, textAlign: "center" }}>
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
                        background: on ? "#E8E6F5" : t.card,
                        color: on ? VIOLETA_INK : t.ink2,
                        border: `1px solid ${on ? "#C9C5E4" : t.border}`,
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
                      <span key={j} style={{ flex: 1, height: h, borderRadius: 1, background: "#B9BBD9" }} />
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
                    background: s.xPanel === "adj" ? "#E8E6F5" : t.bg,
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
                      fontSize: 14,
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
                      background: s.xPanel === "stick" ? "#E8E6F5" : "transparent",
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
                    onClick={startGrab}
                    style={{
                      width: 40,
                      height: 40,
                      flex: "0 0 auto",
                      border: 0,
                      borderRadius: 12,
                      cursor: "pointer",
                      fontSize: 16,
                      lineHeight: 1,
                      background: "#8E92B4",
                      color: "#fff",
                    }}
                    aria-label="Grabar nota de voz"
                  >
                    ♪
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
                      background: esCliente ? "#E2F0F4" : "#EDE8F7",
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

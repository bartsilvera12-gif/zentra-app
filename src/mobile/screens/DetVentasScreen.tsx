"use client";

import { MARCA } from "@/lib/theme";
import { CHATS } from "@/lib/data";
import { repo, usaApiDelErp } from "@/lib/repo";
import { useRemoto } from "./useRemoto";
import { Cargando, Falla } from "../ui/Estado";
import { detalleVenta, ivaVenta, totalVenta } from "@/lib/calc";
import { fmtIso, gs, norm, plural } from "@/lib/format";
import { useApp } from "@/store/AppContext";
import { datosEmisor, lineaEmisor } from "@/lib/emisor";
import { tenantEnUso } from "@/lib/supabase/client";
import { StatusBar } from "../layout/StatusBar";
import {
  Badge,
  Card,
  ChipRow,
  EmptyState,
  GhostButton,
  KeyValue,
  Notice,
  ScrollBody,
  SectionLabel,
} from "../ui/primitives";

const AZUL = MARCA.header;
const VIOLETA = MARCA.headerSuave;

export function DetVentasScreen() {
  const { s, t, set, pushMsg, abrirChat } = useApp();
  // Quién factura: del tenant y la sesión, no escrito a mano acá.
  const emisor = datosEmisor(tenantEnUso(), s.sesion?.empresa);

  const dvq = norm(s.dvQuery.trim());
  // El historial sale del ERP, ya filtrado por el rango que se eligió.
  const { datos: VENTAS_HIST, cargando, error, recargar } = useRemoto(
    () => repo.ventas.list({ desde: s.rDesde, hasta: s.rHasta }),
    [s.rDesde, s.rHasta],
  );
  const enRango = VENTAS_HIST.filter((v) => v.iso >= s.rDesde && v.iso <= s.rHasta);
  const filtradas = enRango.filter((v) => {
    if (s.dvFiltro === "Cobradas" && v.estado !== "Cobrada") return false;
    if (s.dvFiltro === "Pendientes" && v.estado !== "Pendiente") return false;
    if (s.dvFiltro === "Crédito" && v.pago.indexOf("Crédito") < 0) return false;
    return norm(v.numero + " " + v.cliente + " " + v.lineas.map((l) => l.nombre).join(" ")).indexOf(dvq) >= 0;
  });

  const det = VENTAS_HIST.find((v) => v.id === s.dvSel) ?? null;

  const chips = ["Todas", "Cobradas", "Pendientes", "Crédito"].map((k) => {
    const on = s.dvFiltro === k;
    return {
      label: k,
      bg: on ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.1)",
      fg: on ? AZUL : "rgba(255,255,255,.85)",
      border: on ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.24)",
      pick: () => set({ dvFiltro: k }),
    };
  });

  /**
   * Sharing the invoice over WhatsApp: when the client has an open conversation we
   * drop the PDF into it and jump there; otherwise we just report it was saved.
   */
  const enviarWhatsapp = () => {
    if (!det) return;
    // Con ERP no hay conversaciones conectadas: buscar acá mandaría la factura
    // de un cliente al chat de ejemplo de otro.
    const chat = usaApiDelErp() ? undefined : CHATS.find((c) => c.refId === det.cliId);
    if (chat) {
      pushMsg(chat.id, {
        de: "yo",
        hora: "11:42",
        tick: "✓",
        texto: "Te paso la factura de tu última compra.",
        archivo: { tag: "PDF", nombre: det.numero + ".pdf", peso: "PDF · 96 KB" },
      });
      abrirChat(chat.id);
      return;
    }
    set({ dvAccion: "whatsapp" });
  };

  const avisoTexto =
    s.dvAccion === "imprimir"
      ? "La factura se envió a la impresora térmica vinculada."
      : s.dvAccion === "compartir"
        ? "PDF generado: ya podés compartirlo por el medio que quieras."
        : "Este cliente no tiene conversación abierta: se guardó el PDF para compartir.";

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
      <StatusBar bg={VIOLETA} />

      {/* ---------- invoice list ---------- */}
      {s.dvSub === "lista" && (
        <>
          <div style={{ background: VIOLETA, padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={() => set({ screen: "reportes" })}
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
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ font: "700 18px/1.1 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>Detalle de ventas</span>
                <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: "rgba(255,255,255,.75)" }}>
                  {fmtIso(s.rDesde)} — {fmtIso(s.rHasta)}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <div
                style={{
                  flex: 1,
                  borderRadius: 13,
                  padding: "11px 12px",
                  background: "rgba(255,255,255,.12)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                <span
                  style={{
                    font: "600 9.5px/1 var(--font-barlow),Barlow,sans-serif",
                    letterSpacing: ".14em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,.72)",
                  }}
                >
                  Facturas
                </span>
                <span style={{ font: "700 16px/1.1 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>
                  {plural(filtradas.length, "factura", "facturas")}
                </span>
              </div>
              <div
                style={{
                  flex: 1,
                  borderRadius: 13,
                  padding: "11px 12px",
                  background: "rgba(255,255,255,.12)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                <span
                  style={{
                    font: "600 9.5px/1 var(--font-barlow),Barlow,sans-serif",
                    letterSpacing: ".14em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,.72)",
                  }}
                >
                  Total
                </span>
                <span style={{ font: "700 16px/1.1 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>
                  {gs(filtradas.reduce((a, v) => a + totalVenta(v), 0))}
                </span>
              </div>
            </div>

            <input
              type="text"
              value={s.dvQuery}
              onChange={(e) => set({ dvQuery: e.target.value })}
              placeholder="N.° de factura, cliente o producto"
              className="zt-dark-field"
              style={{
                height: 42,
                borderRadius: 12,
                padding: "0 13px",
                fontSize: 14,
                outline: "none",
                background: "rgba(255,255,255,.14)",
                border: "1px solid rgba(255,255,255,.26)",
                color: "#fff",
              }}
            />
            <ChipRow chips={chips} />
          </div>

          <ScrollBody>
            {cargando && <Cargando t={t} que="las ventas" />}
            {!cargando && error && <Falla t={t} mensaje={error} onReintentar={recargar} />}
            {!cargando && !error && filtradas.map((v) => {
              const esCredito = v.pago.indexOf("Crédito") >= 0;
              const cobrada = v.estado === "Cobrada";
              return (
                <button
                  key={v.id}
                  onClick={() => set({ dvSub: "factura", dvSel: v.id, dvAccion: "" })}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    textAlign: "left",
                    borderRadius: 16,
                    padding: 13,
                    cursor: "pointer",
                    background: t.card,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "flex-start", gap: 11, width: "100%" }}>
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ font: "600 14px/1.25 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{v.cliente}</span>
                      <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                        {detalleVenta(v)}
                      </span>
                    </span>
                    <span
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 3,
                        flex: "0 0 auto",
                      }}
                    >
                      <span style={{ font: "700 14px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                        {gs(totalVenta(v))}
                      </span>
                      <span style={{ font: "400 10.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>{v.fecha}</span>
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Badge
                      bg={cobrada ? "#EAF3EF" : "#FFF3DC"}
                      ink={cobrada ? "#1F5C46" : "#6B4A00"}
                      dot={cobrada ? "#1C8C84" : "#B08A20"}
                    >
                      {v.estado}
                    </Badge>
                    <Badge bg={esCredito ? "#FFF3DC" : "#E2F0F4"} ink={esCredito ? "#6B4A00" : "#04617A"}>
                      {v.pago}
                    </Badge>
                    <span style={{ font: "400 10px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>{v.numero}</span>
                  </span>
                </button>
              );
            })}
            {!cargando && !error && filtradas.length === 0 && (
              <EmptyState titulo="Sin facturas" detalle="No hay ventas en el rango con ese filtro." />
            )}
          </ScrollBody>

          <div
            style={{
              padding: "11px 14px 13px",
              display: "flex",
              gap: 10,
              background: t.card,
              borderTop: `1px solid ${t.border}`,
            }}
          >
            <GhostButton
              label={s.dvPdf ? "✓ PDF generado" : "Exportar PDF"}
              flex={1}
              onClick={() => set({ dvPdf: !s.dvPdf })}
            />
            <GhostButton
              label={s.dvShare ? "✓ Listo para enviar" : "Compartir lista"}
              flex={1}
              onClick={() => set({ dvShare: !s.dvShare })}
            />
          </div>
        </>
      )}

      {/* ---------- single invoice ---------- */}
      {s.dvSub === "factura" && det && (
        <>
          <div style={{ background: VIOLETA, padding: "4px 14px 16px", display: "flex", alignItems: "center", gap: 11 }}>
            <button
              onClick={() => set({ dvSub: "lista", dvSel: null, dvAccion: "" })}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ font: "600 17px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>{det.numero}</span>
              <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: "rgba(255,255,255,.75)" }}>
                {det.fecha} · {det.pago}
              </span>
            </div>
          </div>

          <ScrollBody padding="14px" gap={12}>
            {emisor.falta && (
              <div
                style={{
                  borderRadius: 12,
                  background: "#FFF3DC",
                  padding: "10px 12px",
                  font: "500 11.5px/1.4 var(--font-barlow),Barlow,sans-serif",
                  color: "#6B4A00",
                }}
              >
                {emisor.falta}
              </div>
            )}
            <div
              style={{
                borderRadius: 16,
                padding: 18,
                background: "#ffffff",
                border: "1px solid #d9e0e6",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  borderBottom: "1px solid #e4e9ee",
                  paddingBottom: 12,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ font: "700 14px/1.2 var(--font-barlow),Barlow,sans-serif", color: AZUL }}>{emisor.nombre}</span>
                  <span style={{ font: "400 11px/1.3 var(--font-barlow),Barlow,sans-serif", color: "#5b6676" }}>
                    {lineaEmisor(emisor)}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                  <span style={{ font: "600 10px/1 var(--font-barlow),Barlow,sans-serif", letterSpacing: ".14em", color: "#5b6676" }}>
                    FACTURA
                  </span>
                  <span style={{ font: "700 13px/1.2 var(--font-barlow),Barlow,sans-serif", color: AZUL }}>{det.numero}</span>
                  <span style={{ font: "400 10.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#5b6676" }}>{det.fecha}</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span
                  style={{
                    font: "600 10px/1 var(--font-barlow),Barlow,sans-serif",
                    letterSpacing: ".14em",
                    textTransform: "uppercase",
                    color: "#5b6676",
                  }}
                >
                  Cliente
                </span>
                <span style={{ font: "600 13px/1.3 var(--font-barlow),Barlow,sans-serif", color: AZUL }}>{det.cliente}</span>
                <span style={{ font: "400 11.5px/1.3 var(--font-barlow),Barlow,sans-serif", color: "#5b6676" }}>
                  {det.doc} · Condición: {det.pago}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #e4e9ee", paddingTop: 12 }}>
                {det.lineas.map((l, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ font: "500 12.5px/1.25 var(--font-barlow),Barlow,sans-serif", color: AZUL }}>{l.nombre}</span>
                      <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#5b6676" }}>
                        {l.qty} × {gs(l.precio)} · IVA {l.iva}
                      </span>
                    </div>
                    <span style={{ font: "600 12.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: AZUL }}>
                      {gs(l.qty * l.precio)}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid #e4e9ee", paddingTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ font: "400 12px/1 var(--font-barlow),Barlow,sans-serif", color: "#5b6676" }}>IVA incluido</span>
                  <span style={{ font: "500 12px/1 var(--font-barlow),Barlow,sans-serif", color: AZUL }}>{gs(ivaVenta(det))}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ font: "600 14px/1 var(--font-barlow),Barlow,sans-serif", color: AZUL }}>Total</span>
                  <span style={{ font: "700 20px/1 var(--font-barlow),Barlow,sans-serif", color: AZUL }}>{gs(totalVenta(det))}</span>
                </div>
              </div>
            </div>

            <Card gap={11}>
              <SectionLabel>Datos de la venta</SectionLabel>
              <KeyValue k="Estado" v={det.estado} />
              <KeyValue k="Forma de pago" v={det.pago} />
              <KeyValue k="Documento" v={det.doc} />
            </Card>

            {s.dvAccion && (
              <Notice bg="#E6F1F5" ink="#0A4A5C" border="#A9CEDB">
                {avisoTexto}
              </Notice>
            )}

            <GhostButton
              label={s.dvAccion === "imprimir" ? "✓ Enviado a imprimir" : "Reimprimir"}
              onClick={() => set({ dvAccion: "imprimir" })}
            />
            <GhostButton
              label={s.dvAccion === "compartir" ? "✓ PDF listo" : "Compartir PDF"}
              onClick={() => set({ dvAccion: "compartir" })}
            />
            <button
              onClick={enviarWhatsapp}
              style={{
                height: 48,
                border: 0,
                borderRadius: 13,
                background: VIOLETA,
                color: "#fff",
                font: "600 14.5px/1 var(--font-barlow),Barlow,sans-serif",
                cursor: "pointer",
                flex: "0 0 auto",
              }}
            >
              {s.dvAccion === "whatsapp" ? "✓ Abierto en conversación" : "Enviar por WhatsApp"}
            </button>
          </ScrollBody>
        </>
      )}
    </div>
  );
}

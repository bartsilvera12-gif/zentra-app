"use client";

import { useEffect } from "react";
import { esNativo } from "@/lib/nativo";
import { anchoGuardado, imprimirTicket, impresoraGuardada } from "@/lib/impresora";
import { MARCA } from "@/lib/theme";
import { CHATS } from "@/lib/data";
import { repo, usaApiDelErp } from "@/lib/repo";
import { useRemoto } from "./useRemoto";
import { Cargando, Falla } from "../ui/Estado";
import { detalleVenta, ivaVenta, totalVenta } from "@/lib/calc";
import { fmtIso, gs, norm, plural } from "@/lib/format";
import { useApp } from "@/store/AppContext";
import { motivoBloqueo } from "@/lib/planes";
import { datosEmisor, lineaEmisor, tituloComprobante } from "@/lib/emisor";
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

/**
 * ¿Estamos adentro del APK?
 *
 * Hace falta para la impresión y no se puede averiguar preguntando por
 * `window.print`: el WebView de Android la define y no imprime nada, así que
 * la función existe y el papel no sale. Lo único que distingue los dos mundos
 * es este global que inyecta Capacitor.
 */

/**
 * Qué pasó de verdad, para decirlo tal cual.
 *
 * Acá decía "La factura se envió a la impresora térmica vinculada" cuando no
 * había impresora, ni plugin, ni Bluetooth, ni ESC/POS en el proyecto: el botón
 * sólo guardaba una palabra en el estado. Era la mentira más cara que podía
 * decir esta pantalla, porque quien atiende el mostrador entrega la mercadería
 * convencido de que el ticket salió, y nunca salió nada.
 *
 * Ahora la impresora existe —`src/lib/impresora.ts`, por Bluetooth— y la regla
 * no cambió: lo que se dice es lo que el aparato informó. Por eso el resultado
 * de imprimir NO está en esta tabla: lo escribe `impresora.ts` según lo que
 * contestó la impresora, y la pantalla sólo lo muestra. Acá quedan los avisos
 * de lo que esta pantalla sí decide sola.
 */
const AVISOS: Record<string, string> = {
  imprimir:
    "Se abrió el diálogo de impresión del sistema: imprime lo que estás viendo en pantalla. Zentra no le manda nada a ninguna impresora por su cuenta.",
  "lista-sin-impresora":
    "La impresora térmica imprime tickets de venta, no la lista del rango: el rollo es de 58 u 80 mm y la tabla no entra. Compartila en texto, o abrí Zentra en el navegador de la computadora para imprimirla.",
  compartido: "Se abrió el menú de compartir con el comprobante en texto. No se generó ningún PDF: eso todavía no existe.",
  copiado: "El comprobante se copió en texto, listo para pegar donde quieras. No se generó ningún PDF: eso todavía no existe.",
  "sin-compartir": "Este teléfono no deja compartir desde la app, así que no se compartió nada. Podés pasarlo por WhatsApp.",
  whatsapp:
    "Este cliente no tiene conversación abierta, así que no se envió nada. Abrí su chat en Conversaciones y pegá ahí el comprobante.",
};

export function DetVentasScreen() {
  const { s, t, set, pushMsg, abrirChat, plan } = useApp();
  // Quién factura: del tenant y la sesión, no escrito a mano acá.
  const emisor = datosEmisor(tenantEnUso(), s.sesion?.empresa);
  // Imprimir el comprobante es lo que el plan vende como "facturación con
  // auto-impresor". Se pregunta primero que nada para que, cuando el plan no lo
  // incluya, el motivo hable del plan y no de la impresora que falta.
  const sinImpresion = motivoBloqueo("facturacion.autoImpresor", plan());

  /**
   * Si hay impresora elegida, para que el botón diga qué va a hacer.
   *
   * Se lee acá y no al arrancar la app: es una llamada nativa, y hasta que
   * alguien mira una venta no hace falta. Mientras no se sepa, el botón dice
   * "Imprimir" —que es lo que va a pasar en la mayoría de los casos— y si no
   * hay impresora el resultado lo dice.
   */
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const g = await impresoraGuardada();
      if (vivo) set({ impGuardada: g, impLeyendo: false, impAncho: anchoGuardado() });
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
   * El comprobante en texto.
   *
   * Es lo único que hoy se puede compartir de verdad. Antes se armaba un
   * adjunto —`det.numero + ".pdf"`, `"PDF · 96 KB"`— que no correspondía a
   * ningún archivo: no hay generador de PDF en el proyecto, así que la tarjeta
   * del chat mostraba un peso inventado y no se podía abrir nada.
   *
   * Si falta el RUC va el aviso adentro del texto: el que lo recibe tiene que
   * poder leer que no es una factura legal, igual que el que lo mira en la app.
   */
  const textoComprobante = (): string => {
    if (!det) return "";
    return [
      emisor.nombre + " · " + lineaEmisor(emisor),
      `${tituloComprobante(emisor)} ${det.numero} · ${det.fecha}`,
      `Cliente: ${det.cliente} · ${det.doc}`,
      ...det.lineas.map((l) => `${l.qty} × ${l.nombre} · ${gs(l.qty * l.precio)}`),
      `IVA incluido: ${gs(ivaVenta(det))}`,
      `Total: ${gs(totalVenta(det))}`,
      `${det.pago} · ${det.estado}`,
      emisor.falta ?? "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  /** La lista del rango en texto, para el botón de compartir de abajo. */
  const textoLista = (): string =>
    [
      `${emisor.nombre} · ventas del ${fmtIso(s.rDesde)} al ${fmtIso(s.rHasta)}`,
      ...filtradas.map((v) => `${v.numero} · ${v.fecha} · ${v.cliente} · ${gs(totalVenta(v))} · ${v.estado}`),
      `Total: ${gs(filtradas.reduce((a, v) => a + totalVenta(v), 0))}`,
    ].join("\n");

  /**
   * Imprimir la lista del rango.
   *
   * No es un ticket: en un rollo de 58 mm no entra una tabla. Adentro del APK
   * se dice eso en vez de mandarle a la térmica algo que va a salir cortado.
   */
  const imprimirLista = () => {
    if (sinImpresion) return set({ avisoPlan: sinImpresion });
    if (esNativo()) return set({ dvAccion: "lista-sin-impresora" });
    set({ dvAccion: "imprimir" });
    window.print();
  };

  /**
   * Imprimir el ticket de esta venta.
   *
   * El plan primero —es lo que se vende como "facturación con auto-impresor"—,
   * después la impresora térmica si estamos en el APK, y en el navegador el
   * diálogo del sistema, que es lo que ahí existe.
   *
   * Lo que queda escrito en pantalla es lo que informó la impresora, ni más ni
   * menos: `impresora.ts` distingue "imprimió" de "el ticket salió hacia la
   * impresora y esta no confirma", y acá no se redondea ninguno de los dos.
   */
  const imprimirTicketDeVenta = async () => {
    if (!det) return;
    if (sinImpresion) return set({ avisoPlan: sinImpresion });
    if (!esNativo()) {
      set({ dvAccion: "imprimir", impAviso: "" });
      window.print();
      return;
    }
    if (s.impImprimiendo) return;
    set({ impImprimiendo: true, impAviso: "", impAvisoGrave: false, dvAccion: "" });
    const r = await imprimirTicket(det, { emisor, ancho: s.impAncho });
    set({
      impImprimiendo: false,
      impAviso:
        r.estado === "impreso"
          ? "La impresora confirmó que imprimió el ticket."
          : r.estado === "enviado"
            ? "El ticket salió hacia la impresora. Esta impresora no confirma la impresión, así que fijate que el papel haya salido entero antes de entregar."
            : r.motivo,
      impAvisoGrave: r.estado === "error",
    });
  };

  /**
   * Compartir en texto: el menú del sistema si está, y si no el portapapeles.
   *
   * Cada camino deja su propio aviso porque no son lo mismo para quien está
   * atendiendo: "se abrió el menú" y "quedó copiado" piden cosas distintas
   * después. Cancelar el menú no deja aviso: no pasó nada que contar.
   */
  const compartir = async (texto: string) => {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text: string }) => Promise<void> };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ text: texto });
        return set({ dvAccion: "compartido" });
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(texto);
      set({ dvAccion: "copiado" });
    } catch {
      set({ dvAccion: "sin-compartir" });
    }
  };

  /**
   * Pasar el comprobante por WhatsApp.
   *
   * Cuando el cliente tiene conversación abierta, el texto queda en el hilo y
   * se salta ahí. Cuando no, antes decía que "se guardó el PDF": no se guardaba
   * nada en ninguna parte, y la persona se iba a buscar un archivo que no
   * existía. Ahora dice que no se envió.
   */
  const enviarWhatsapp = () => {
    if (!det) return;
    // Con ERP no hay conversaciones conectadas: buscar acá mandaría la factura
    // de un cliente al chat de ejemplo de otro.
    const chat = usaApiDelErp() ? undefined : CHATS.find((c) => c.refId === det.cliId);
    if (chat) {
      pushMsg(chat.id, {
        de: "yo",
        // La hora del reloj, no una fija: un mensaje que sale a las 19:30 y
        // dice 11:42 es un dato falso más.
        hora: new Date().toTimeString().slice(0, 5),
        tick: "✓",
        texto: textoComprobante(),
      });
      abrirChat(chat.id);
      return;
    }
    set({ dvAccion: "whatsapp" });
  };

  const avisoTexto = AVISOS[s.dvAccion] ?? "";

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
                  onClick={() => set({ dvSub: "factura", dvSel: v.id, dvAccion: "", impAviso: "" })}
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
              flexDirection: "column",
              gap: 10,
              background: t.card,
              borderTop: `1px solid ${t.border}`,
            }}
          >
            {/* El aviso va junto a los botones: es el que dice qué pasó, y sin
                él los botones vuelven a afirmar por su cuenta. */}
            {avisoTexto && (
              <Notice bg="#E6F1F5" ink="#0A4A5C" border="#A9CEDB">
                {avisoTexto}
              </Notice>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <GhostButton label="Imprimir la lista" flex={1} onClick={imprimirLista} />
              <GhostButton label="Compartir en texto" flex={1} onClick={() => compartir(textoLista())} />
            </div>
          </div>
        </>
      )}

      {/* ---------- single invoice ---------- */}
      {s.dvSub === "factura" && det && (
        <>
          <div style={{ background: VIOLETA, padding: "4px 14px 16px", display: "flex", alignItems: "center", gap: 11 }}>
            <button
              onClick={() => set({ dvSub: "lista", dvSel: null, dvAccion: "", impAviso: "" })}
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
                    {/* "FACTURA" en letras grandes sobre un comprobante sin
                        RUC contradecía al aviso de arriba. */}
                    {tituloComprobante(emisor).toUpperCase()}
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

            {avisoTexto && (
              <Notice bg="#E6F1F5" ink="#0A4A5C" border="#A9CEDB">
                {avisoTexto}
              </Notice>
            )}

            {/* Cómo salió la impresión, con el texto que escribió
                `impresora.ts`: el rojo queda para lo que falló. */}
            {s.impAviso && (
              <Notice
                bg={s.impAvisoGrave ? "#FBE9E7" : "#E6F1F5"}
                ink={s.impAvisoGrave ? "#8C2F2B" : "#0A4A5C"}
                border={s.impAvisoGrave ? "#E8B4AE" : "#A9CEDB"}
              >
                {s.impAviso}
              </Notice>
            )}

            {/* Los botones ya no dicen "✓ Enviado a imprimir" ni "✓ PDF listo":
                ninguna de las dos cosas pasaba. Lo que pasó lo cuenta el aviso,
                que es el único que sabe cómo salió. */}
            <GhostButton
              label={s.impImprimiendo ? "Imprimiendo…" : "Imprimir"}
              onClick={() => void imprimirTicketDeVenta()}
            />
            {/* Si no hay impresora elegida, el camino es ir a elegirla: una
                vez, no en cada venta. */}
            {esNativo() && !s.impLeyendo && !s.impGuardada && (
              <GhostButton label="Elegir impresora" onClick={() => set({ screen: "config" })} />
            )}
            <GhostButton label="Compartir en texto" onClick={() => compartir(textoComprobante())} />
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
              {/* Decía "✓ Abierto en conversación" justo cuando NO había
                  conversación que abrir: `dvAccion` queda en "whatsapp"
                  únicamente en el caso en que no se pudo mandar nada. */}
              Pasar por WhatsApp
            </button>
          </ScrollBody>
        </>
      )}
    </div>
  );
}

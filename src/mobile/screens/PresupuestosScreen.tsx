"use client";

import { useState } from "react";
import { gs, norm } from "@/lib/format";
import { motivoBloqueo } from "@/lib/planes";
import {
  enlaceWhatsApp,
  estadoVisible,
  ROTULO_ESTADO,
  textoParaCompartir,
  totalPresupuesto,
  type EstadoVisible,
} from "@/lib/presupuestos";
import { repo } from "@/lib/repo";
import { MARCA } from "@/lib/theme";
import type { Presupuesto, ThemeTokens } from "@/lib/types";
import { Cargando, Falla } from "@/mobile/ui/Estado";
import { useApp } from "@/store/AppContext";
import { BottomNav } from "../layout/BottomNav";
import { StatusBar } from "../layout/StatusBar";
import {
  Badge,
  Card,
  ChipRow,
  EmptyState,
  KeyValue,
  ListHeader,
  ScrollBody,
  SearchInput,
  SectionLabel,
  StatTile,
} from "../ui/primitives";
import { ARMADO_VACIO } from "./armado";
import { useRemoto } from "./useRemoto";

const HEADER = MARCA.header;

/**
 * El color de cada estado. Las etiquetas tienen fondo claro propio, así que
 * los mismos colores sirven en los dos temas.
 */
const COLOR: Record<EstadoVisible, { bg: string; ink: string; dot: string }> = {
  pendiente: { bg: "#FFF3DC", ink: "#6B4A00", dot: "#B08A20" },
  aceptado: { bg: "#E2F0F4", ink: "#023047", dot: "#04617A" },
  convertido: { bg: "#EAF3EF", ink: "#1F5C46", dot: "#1C8C84" },
  rechazado: { bg: "#EDEFF3", ink: "#5b6676", dot: "#9aa3b2" },
  vencido: { bg: "#FBE9E7", ink: "#8C2F2B", dot: "#C0504A" },
};

/**
 * Presupuestos: la lista, y el detalle desde donde se mandan y se cierran.
 *
 * Armarlos no es acá: se arman con los mismos pasos que una venta
 * (`VentaScreen` en modo presupuesto), para que el cliente, el precio
 * mayorista y el IVA salgan exactamente igual. Esta pantalla es lo de antes
 * y lo de después: ver qué hay abierto, mandarlo por WhatsApp, anotar qué
 * contestó el cliente, y convertirlo en venta cuando dice que sí.
 */
export function PresupuestosScreen() {
  const { s, t, set, plan } = useApp();
  const { datos: todos, cargando, error, recargar } = useRemoto(() => repo.presupuestos.list(), []);
  const { datos: clientes } = useRemoto(() => repo.clientes.list(), []);
  const [cambiando, setCambiando] = useState(false);
  const [falla, setFalla] = useState("");

  const bloqueo = motivoBloqueo("presupuestos.modulo", plan());

  const det = todos.find((p) => p.id === s.pSel) ?? null;
  const estados = new Map(todos.map((p) => [p.id, estadoVisible(p)]));

  const abiertos = todos.filter((p) => {
    const e = estados.get(p.id);
    return e === "pendiente" || e === "aceptado";
  });
  const vendidos = todos.filter((p) => p.estado === "convertido");

  const filtrados = todos.filter((p) => {
    const e = estados.get(p.id);
    const pasa =
      s.pFiltro === "Todos" ||
      (s.pFiltro === "Pendientes" && (e === "pendiente" || e === "vencido")) ||
      (s.pFiltro === "Aceptados" && e === "aceptado") ||
      (s.pFiltro === "Vendidos" && e === "convertido");
    return pasa && norm(p.numero + " " + p.cliente).indexOf(norm(s.pQuery.trim())) >= 0;
  });

  const chips = (["Todos", "Pendientes", "Aceptados", "Vendidos"] as const).map((k) => {
    const on = s.pFiltro === k;
    return {
      label: k,
      bg: on ? HEADER : t.card,
      fg: on ? "#ffffff" : t.ink2,
      border: on ? HEADER : t.border,
      pick: () => set({ pFiltro: k }),
    };
  });

  /** Armar uno nuevo: los pasos de la venta, en blanco y en modo presupuesto. */
  const nuevo = () => {
    if (bloqueo) return set({ avisoPlan: bloqueo });
    set({ ...ARMADO_VACIO, vModo: "presupuesto", screen: "venta", mod: "venta" });
  };

  /**
   * Convertirlo en venta.
   *
   * Carga el armado de venta con lo presupuestado y va directo al resumen: el
   * cliente y los productos ya están, lo que falta es cobrar. Los precios van
   * fijados —el cliente aceptó ésos, y si la lista cambió en el medio la
   * venta no puede salir con otros—, salvo que el presupuesto esté vencido:
   * ahí rige el precio de hoy, y se avisa antes.
   */
  const convertir = (p: Presupuesto) => {
    const vencido = estadoVisible(p) === "vencido";
    const vCart: Record<string, number> = {};
    const vIva: Record<string, "10%" | "5%" | "EXENTA"> = {};
    const vPrecio: Record<string, number> = {};
    for (const l of p.lineas) {
      if (!l.prodId) continue;
      vCart[l.prodId] = (vCart[l.prodId] ?? 0) + l.qty;
      vIva[l.prodId] = l.iva === "Exenta" ? "EXENTA" : l.iva;
      if (!vencido) vPrecio[l.prodId] = l.precio;
    }
    set({
      ...ARMADO_VACIO,
      vModo: "venta",
      vCliente: p.cliId,
      vSinNombre: !p.cliId,
      vCart,
      vIva,
      vPrecio,
      vDePresupuesto: p.id,
      vPaso: "resumen",
      screen: "venta",
      mod: "venta",
    });
  };

  const cambiarEstado = async (p: Presupuesto, estado: "pendiente" | "aceptado" | "rechazado") => {
    if (cambiando) return;
    setCambiando(true);
    setFalla("");
    try {
      await repo.presupuestos.cambiarEstado(p.id, estado);
      recargar();
    } catch (e) {
      setFalla(e instanceof Error ? e.message : "No se pudo cambiar el estado. Probá de nuevo.");
    } finally {
      setCambiando(false);
    }
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
      <StatusBar bg={s.pSub === "lista" ? t.card : HEADER} />

      {s.pSub === "lista" && (
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
            <ListHeader
              titulo="Presupuestos"
              resumen={`${todos.length} hechos · ${abiertos.length} abiertos`}
              onBack={() => set({ screen: "home" })}
              accion={{ label: "+ Nuevo", onClick: nuevo, bg: HEADER, fg: "#ffffff" }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <StatTile label="Abiertos" valor={gs(abiertos.reduce((a, p) => a + totalPresupuesto(p), 0))} valorInk={t.marca} />
              <StatTile label="Vendidos" valor={`${vendidos.length} de ${todos.length}`} />
            </div>
            <SearchInput value={s.pQuery} onChange={(v) => set({ pQuery: v })} placeholder="Cliente o N.° de presupuesto" />
            <ChipRow chips={chips} />
          </div>

          <ScrollBody>
            {cargando && <Cargando t={t} que="presupuestos" />}
            {error && <Falla t={t} mensaje={error} onReintentar={recargar} />}
            {!cargando &&
              !error &&
              filtrados.map((p) => (
                <Fila key={p.id} p={p} estado={estados.get(p.id)!} t={t} abrir={() => set({ pSub: "detalle", pSel: p.id })} />
              ))}
            {!cargando && !error && filtrados.length === 0 && (
              <EmptyState
                titulo={todos.length ? "Sin presupuestos acá" : "Todavía no hiciste presupuestos"}
                detalle={
                  todos.length
                    ? "Probá con otro término o cambiá el filtro."
                    : "Tocá “+ Nuevo”, elegí el cliente y los productos, y mandalo por WhatsApp."
                }
              />
            )}
          </ScrollBody>
          <BottomNav />
        </>
      )}

      {s.pSub === "detalle" && cargando && !det && (
        <ScrollBody>
          <Cargando t={t} que="el presupuesto" />
        </ScrollBody>
      )}

      {s.pSub === "detalle" && det && (
        <Detalle
          p={det}
          estado={estados.get(det.id)!}
          t={t}
          // El nombre de la empresa de la sesión, y si no hay —una instalación
          // sin sesión de Supabase—, el de la instalación. Un presupuesto que
          // llega sin decir de quién es parece un mensaje de un desconocido.
          negocio={s.sesion?.empresa || s.tenant?.nombre || ""}
          telefono={clientes.find((c) => c.id === det.cliId)?.tel ?? null}
          cambiando={cambiando}
          falla={falla}
          volver={() => set({ pSub: "lista", pSel: null })}
          convertir={() => convertir(det)}
          cambiarEstado={(e) => void cambiarEstado(det, e)}
        />
      )}
    </div>
  );
}

function Fila({ p, estado, t, abrir }: { p: Presupuesto; estado: EstadoVisible; t: ThemeTokens; abrir: () => void }) {
  const c = COLOR[estado];
  const productos = p.lineas.length;
  return (
    <button
      onClick={abrir}
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
          <span style={{ font: "600 14px/1.25 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{p.cliente}</span>
          <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
            {productos === 1 ? `${p.lineas[0]!.qty} × ${p.lineas[0]!.nombre}` : `${productos} productos`}
          </span>
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flex: "0 0 auto" }}>
          <span style={{ font: "700 14px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{gs(totalPresupuesto(p))}</span>
          <span style={{ font: "400 10.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>{p.fecha}</span>
        </span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Badge bg={c.bg} ink={c.ink} dot={c.dot}>
          {ROTULO_ESTADO[estado]}
        </Badge>
        <span style={{ font: "400 10px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
          {p.numero} · válido hasta {diaCorto(p.validoHasta)}
        </span>
      </span>
    </button>
  );
}

function Detalle({
  p,
  estado,
  t,
  negocio,
  telefono,
  cambiando,
  falla,
  volver,
  convertir,
  cambiarEstado,
}: {
  p: Presupuesto;
  estado: EstadoVisible;
  t: ThemeTokens;
  negocio: string;
  telefono: string | null;
  cambiando: boolean;
  falla: string;
  volver: () => void;
  convertir: () => void;
  cambiarEstado: (e: "pendiente" | "aceptado" | "rechazado") => void;
}) {
  const total = totalPresupuesto(p);
  const sinProducto = p.lineas.filter((l) => !l.prodId).length;
  const abierto = estado === "pendiente" || estado === "aceptado" || estado === "vencido";
  const c = COLOR[estado];

  return (
    <>
      <div style={{ padding: "4px 14px 18px", display: "flex", flexDirection: "column", gap: 12, background: HEADER }}>
        <button
          onClick={volver}
          aria-label="Volver a la lista"
          style={{
            width: 32,
            height: 32,
            border: 0,
            borderRadius: 10,
            background: "rgba(255,255,255,.2)",
            color: "#fff",
            font: "600 17px/1 var(--font-barlow),Barlow,sans-serif",
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          ‹
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ font: "700 18px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>{p.numero}</span>
            <Badge bg={c.bg} ink={c.ink} dot={c.dot}>
              {ROTULO_ESTADO[estado]}
            </Badge>
          </span>
          <span style={{ font: "400 12px/1.2 var(--font-barlow),Barlow,sans-serif", color: "rgba(255,255,255,.78)" }}>
            {p.cliente} · {p.fecha}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <StatTile label="Total" valor={gs(total)} onDark />
          <StatTile label="Válido hasta" valor={diaCorto(p.validoHasta)} onDark />
        </div>
      </div>

      <ScrollBody padding="14px" gap={12}>
        <Card gap={12}>
          <SectionLabel>Productos</SectionLabel>
          {p.lineas.map((l, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ font: "600 13px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{l.nombre}</span>
                <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                  {l.qty} × {gs(l.precio)} · IVA {l.iva}
                </span>
              </div>
              <span style={{ font: "700 13px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{gs(l.qty * l.precio)}</span>
            </div>
          ))}
          <div
            style={{
              borderTop: `1px solid ${t.border}`,
              paddingTop: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ font: "600 14px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Total (IVA incluido)</span>
            <span style={{ font: "700 20px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{gs(total)}</span>
          </div>
        </Card>

        {(p.notas || p.doc !== "Sin documento") && (
          <Card gap={10}>
            <SectionLabel>Datos</SectionLabel>
            {p.doc !== "Sin documento" && <KeyValue k="Documento" v={p.doc} />}
            {p.notas && (
              <div style={{ font: "400 13px/1.45 var(--font-barlow),Barlow,sans-serif", color: t.ink, whiteSpace: "pre-wrap" }}>
                {p.notas}
              </div>
            )}
          </Card>
        )}

        {/* Mandarlo: lo primero que se quiere hacer con un presupuesto. Un
            enlace y no un botón con `window.open`: así abre WhatsApp tanto en
            el navegador como adentro de la app. */}
        <a
          href={enlaceWhatsApp(textoParaCompartir(p, negocio), telefono)}
          target="_blank"
          rel="noreferrer"
          style={{
            height: 50,
            borderRadius: 13,
            background: "#1C8C84",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
          }}
        >
          Enviar por WhatsApp
        </a>
        {!telefono && (
          <span style={{ font: "400 11.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink3, textAlign: "center", marginTop: -4 }}>
            El cliente no tiene teléfono cargado: WhatsApp te va a dejar elegir a quién mandarlo.
          </span>
        )}

        {abierto && (
          <>
            {estado === "vencido" && (
              <div
                style={{
                  borderRadius: 10,
                  background: "#FFF3DC",
                  padding: "9px 11px",
                  font: "500 12px/1.4 var(--font-barlow),Barlow,sans-serif",
                  color: "#6B4A00",
                }}
              >
                Venció el {diaCorto(p.validoHasta)}. Si lo convertís en venta, va con los precios de hoy.
              </div>
            )}
            {sinProducto > 0 && (
              <div
                style={{
                  borderRadius: 10,
                  background: "#FFF3DC",
                  padding: "9px 11px",
                  font: "500 12px/1.4 var(--font-barlow),Barlow,sans-serif",
                  color: "#6B4A00",
                }}
              >
                {sinProducto === 1
                  ? "Un producto de este presupuesto ya no está en el inventario y no va a pasar a la venta."
                  : `${sinProducto} productos de este presupuesto ya no están en el inventario y no van a pasar a la venta.`}
              </div>
            )}
            <button
              onClick={convertir}
              disabled={sinProducto === p.lineas.length}
              style={{
                height: 50,
                border: 0,
                borderRadius: 13,
                background: sinProducto === p.lineas.length ? "#5C7A85" : "#04617A",
                color: "#fff",
                font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
                cursor: sinProducto === p.lineas.length ? "default" : "pointer",
              }}
            >
              Convertir en venta
            </button>
          </>
        )}

        {(estado === "pendiente" || estado === "vencido") && (
          <div style={{ display: "flex", gap: 10 }}>
            <Boton t={t} label="El cliente aceptó" onClick={() => cambiarEstado("aceptado")} disabled={cambiando} />
            <Boton t={t} label="Lo rechazó" onClick={() => cambiarEstado("rechazado")} disabled={cambiando} />
          </div>
        )}
        {(estado === "aceptado" || estado === "rechazado") && (
          <Boton t={t} label="Volver a pendiente" onClick={() => cambiarEstado("pendiente")} disabled={cambiando} />
        )}
        {estado === "convertido" && (
          <span style={{ font: "400 12.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink2, textAlign: "center" }}>
            Este presupuesto ya se convirtió en venta. La ves en Reportes → Detalle de ventas.
          </span>
        )}
        {falla && (
          <div
            style={{
              borderRadius: 10,
              background: "#FBE9E8",
              padding: "9px 11px",
              font: "500 12px/1.35 var(--font-barlow),Barlow,sans-serif",
              color: "#7A2220",
            }}
          >
            {falla}
          </div>
        )}
      </ScrollBody>
    </>
  );
}

function Boton({ t, label, onClick, disabled }: { t: ThemeTokens; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        height: 46,
        borderRadius: 13,
        cursor: disabled ? "default" : "pointer",
        font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif",
        background: t.card,
        border: `1px solid ${t.border}`,
        color: t.ink,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}

/** `2026-11-15` → `15/11/2026`. */
function diaCorto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { EMPRESA, USUARIO } from "@/lib/data";
import { fechaDeHoy, inicialDe, nombreCorto, rolLegible } from "@/lib/nombre";
import { usePanel } from "./usePanel";
import { MARCA, MODULES } from "@/lib/theme";
import type { ModuleKey } from "@/lib/types";
import { useApp } from "@/store/AppContext";
import { BottomNav } from "../layout/BottomNav";
import { StatusBar } from "../layout/StatusBar";
import {
  IconCampana,
  IconClientes,
  IconCompras,
  IconConversaciones,
  IconFactura,
  IconFlecha,
  IconInventario,
  IconProveedores,
} from "../ui/Icons";

const BASE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  position: "relative",
  zIndex: 2,
  transition: "transform .32s cubic-bezier(.4,0,.2,1), opacity .28s ease",
};

const OVER: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 3,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
  transition: "transform .32s cubic-bezier(.4,0,.2,1), opacity .28s ease",
};

interface TileProps {
  k: ModuleKey;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Secondary caption, only the sale tile has one. */
  nota?: string;
  labelSize?: number;
  gap?: number;
}

/** Cuánto tiene que durar el toque para que la animación se alcance a ver. */
const MINIMO_VISIBLE = 190;

function Tile({ k, label, icon, onClick, nota, labelSize = 15, gap = 10 }: TileProps) {
  const { s, set } = useApp();
  const def = MODULES[k];
  const on = s.hover === k;
  const apretadoEn = useRef(0);

  /**
   * La animación se dispara con el dedo, no sólo con el mouse.
   *
   * Estaba atada a `onMouseEnter`, que en un celular no existe: el WebView a
   * veces inventa un `mouseenter` después del toque, cuando la pantalla ya
   * cambió. O sea que en el teléfono —que es donde se usa la app— la animación
   * del diseño no se veía nunca.
   *
   * Los eventos de puntero cubren mouse, dedo y lápiz con el mismo código.
   */
  const apretar = () => {
    apretadoEn.current = Date.now();
    set({ hover: k });
  };
  const soltar = () => set({ hover: null });

  /**
   * Un toque rápido dura menos que la animación. Se espera lo que falte antes
   * de cambiar de pantalla: sin esto el dedo la dispara y la tapa en el mismo
   * gesto, que es igual a no tenerla.
   */
  const tocar = () => {
    const falta = MINIMO_VISIBLE - (Date.now() - apretadoEn.current);
    if (falta <= 0) return onClick();
    setTimeout(onClick, falta);
  };

  return (
    <button
      onClick={tocar}
      onPointerDown={apretar}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onPointerLeave={soltar}
      onMouseEnter={apretar}
      onMouseLeave={soltar}
      style={{
        border: 0,
        borderRadius: 14,
        background: def.color,
        color: def.over,
        padding: "24px 12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap,
        cursor: "pointer",
        minHeight: 112,
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* The dot grows to fill the tile on hover, revealing the arrow label. */}
      <div
        style={{
          position: "absolute",
          borderRadius: 12,
          background: def.fill,
          transition: "all .36s cubic-bezier(.4,0,.2,1)",
          ...(on
            ? { left: "-6%", top: "-6%", width: "112%", height: "112%", opacity: 1 }
            : { left: "20%", top: "42%", width: 9, height: 9, opacity: 0 }),
        }}
      />
      <div style={{ ...BASE, ...(on ? { transform: "translateX(44px)", opacity: 0 } : { transform: "none", opacity: 1 }) }}>
        {icon}
        <span style={{ font: `600 ${labelSize}px/1.1 var(--font-barlow),Barlow,sans-serif` }}>{label}</span>
        {nota && <span style={{ font: "400 12px/1 var(--font-barlow),Barlow,sans-serif", opacity: 0.7 }}>{nota}</span>}
      </div>
      <div
        style={{
          ...OVER,
          color: def.over,
          ...(on ? { transform: "none", opacity: 1 } : { transform: "translateX(44px)", opacity: 0 }),
        }}
      >
        <span>{label}</span>
        <IconFlecha />
      </div>
    </button>
  );
}

export function HomeScreen() {
  const { s, t, set, runDash } = useApp();
  const p = s.dashP;

  const roleInk = s.theme === "oscuro" ? MARCA.aviso : MARCA.avisoInk;
  // Con código de empresa el nombre sale de la instalación resuelta; en la
  // instalación pública todavía sale de los datos de ejemplo.
  // Con sesión real, empresa y usuario salen del perfil; si no, de los datos de ejemplo.
  const empresa = s.sesion?.empresa || (s.tenant && !s.tenant.publico ? s.tenant.nombre : EMPRESA);
  const usuario = s.sesion ?? USUARIO;
  // El ERP devuelve el nombre legal completo y en mayúsculas. Entero empuja al
  // nombre de la empresa y se lee como un grito.
  const nombre = nombreCorto(usuario.nombre);
  const inicial = inicialDe(usuario.nombre);
  const rol = rolLegible(usuario.rol);
  const fecha = fechaDeHoy();

  // Los números salen del ERP. Antes estaban escritos acá y eran mentira.
  const panel = usePanel(true);
  const pct = (panel.inventario?.pctOptimo ?? 0) * p;
  const tope = Math.max(1, ...(panel.ventas?.serie ?? [0]));
  const barras = (panel.ventas?.serie ?? Array(7).fill(0)).map((v) => (v / tope) * 100);
  const gs = (n: number) => "Gs. " + Math.round(n).toLocaleString("es-PY");

  const onDashScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== s.dash) {
      set({ dash: i });
      runDash(1800, true);
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
      <StatusBar bg={t.card} />

      {/* Header: company, date, user */}
      <div
        style={{
          padding: "10px 16px 12px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: t.card,
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/zentra-mark-teal.png"
            alt="Zentra"
            style={{ height: 20, width: "auto", display: "block", flex: "0 0 auto" }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ font: "600 15.5px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{empresa}</span>
            <span style={{ font: "400 11px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink2, whiteSpace: "nowrap" }}>
              {fecha}
            </span>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            <span
              style={{
                font: "600 13px/1.1 var(--font-barlow),Barlow,sans-serif",
                color: t.ink,
                // Un nombre largo empujaba el de la empresa fuera de la
                // pantalla. Acá se corta con puntos suspensivos.
                maxWidth: 150,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {nombre}
            </span>
            <span style={{ font: "600 10.5px/1 var(--font-barlow),Barlow,sans-serif", letterSpacing: ".12em", color: roleInk }}>
              {rol}
            </span>
          </div>
          <IconCampana stroke={t.ink2} />
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "#04617A",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "600 13px/1 var(--font-barlow),Barlow,sans-serif",
            }}
          >
            {inicial}
          </div>
        </div>
      </div>

      {/* Swipeable dashboard cards */}
      <div style={{ padding: "16px 0 8px" }}>
        <div
          onScroll={onDashScroll}
          className="zt-no-scrollbar"
          style={{
            display: "flex",
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            gap: 12,
            padding: "0 14px",
          }}
        >
          {/* Card 1 — inventory health donut */}
          <div
            style={{
              flex: "0 0 100%",
              scrollSnapAlign: "center",
              borderRadius: 20,
              background: "#023047",
              padding: 20,
              display: "flex",
              alignItems: "center",
              gap: 20,
              minHeight: 150,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                position: "relative",
                width: 96,
                height: 96,
                flex: "0 0 auto",
                borderRadius: "50%",
                display: "flex",
                background: `conic-gradient(${MARCA.acento} 0 ${pct.toFixed(1)}%, rgba(255,255,255,.16) ${pct.toFixed(1)}% 100%)`,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "#023047",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                }}
              >
                <span style={{ font: "700 24px/1 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>
                  {panel.inventario ? `${Math.round(pct)}%` : "—"}
                </span>
                <span style={{ font: "500 10px/1 var(--font-barlow),Barlow,sans-serif", letterSpacing: ".1em", color: MARCA.sobreSuave }}>
                  ÓPTIMO
                </span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
              <div
                style={{
                  font: "600 10.5px/1 var(--font-barlow),Barlow,sans-serif",
                  letterSpacing: ".16em",
                  textTransform: "uppercase",
                  color: MARCA.sobreSuave,
                }}
              >
                Inventario
              </div>
              <div style={{ font: "700 25px/1 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>
                {panel.inventario
                  ? `${Math.round(panel.inventario.total * p).toLocaleString("es-PY")} ítems`
                  : panel.cargando
                    ? "…"
                    : "sin datos"}
              </div>
              <div style={{ display: "flex", gap: 14 }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ font: "600 18px/1.1 var(--font-barlow),Barlow,sans-serif", color: MARCA.aviso }}>
                    {panel.inventario ? panel.inventario.bajoMinimo : "—"}
                  </span>
                  <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: "rgba(255,255,255,.72)" }}>
                    bajo mínimo
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ font: "600 18px/1.1 var(--font-barlow),Barlow,sans-serif", color: MARCA.alerta }}>
                    {panel.inventario ? panel.inventario.agotados : "—"}
                  </span>
                  <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: "rgba(255,255,255,.72)" }}>
                    agotados
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2 — today's sales with a 7-day bar chart */}
          <div
            style={{
              flex: "0 0 100%",
              scrollSnapAlign: "center",
              borderRadius: 20,
              background: "#04617A",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minHeight: 150,
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    font: "600 10.5px/1 var(--font-barlow),Barlow,sans-serif",
                    letterSpacing: ".16em",
                    textTransform: "uppercase",
                    color: MARCA.sobreSuave,
                  }}
                >
                  Ventas de hoy
                </div>
                <div style={{ font: "700 26px/1 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>
                  {panel.ventas ? gs(panel.ventas.hoy * p) : panel.cargando ? "…" : "sin datos"}
                </div>
                <div style={{ font: "500 12.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: MARCA.sobreSuave }}>
                  {panel.ventas
                    ? [
                        // Sin ventas ayer no hay con qué comparar: "subió 100%"
                        // desde cero no dice nada.
                        panel.ventas.deltaPct === null
                          ? null
                          : `${panel.ventas.deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(panel.ventas.deltaPct)}% vs. ayer`,
                        `${panel.ventas.facturas} ${panel.ventas.facturas === 1 ? "factura" : "facturas"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : ""}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 68, paddingTop: 6 }}>
                {barras.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      width: 9,
                      borderRadius: 2,
                      transition: `height .8s cubic-bezier(.22,1,.36,1) ${(i * 0.07).toFixed(2)}s`,
                      background: i === barras.length - 1 ? MARCA.acento : "rgba(255,255,255,.35)",
                      height: `${h * p}%`,
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: "rgba(255,255,255,.7)" }}>
              Últimos 7 días
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 6, paddingTop: 10 }}>
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                width: s.dash === i ? 18 : 6,
                height: 6,
                borderRadius: 3,
                transition: "all .25s ease",
                background: s.dash === i ? MARCA.acento : t.dim,
              }}
            />
          ))}
        </div>
      </div>

      {/* Module grid */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "4px 14px 10px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          // Las filas se reparten el alto que sobra, en vez de quedar de un
          // tamaño fijo y dejar un hueco abajo. El mínimo evita que en una
          // pantalla chica queden tan aplastadas que no se lea el texto: ahí
          // la grilla vuelve a desbordar y se puede hacer scroll, que es
          // preferible a un botón que no se entiende.
          gridAutoRows: "minmax(96px, 1fr)",
          gap: 12,
        }}
      >
        <Tile
          k="venta"
          label="Nueva venta"
          nota="(Factura)"
          labelSize={16}
          gap={8}
          icon={<IconFactura />}
          onClick={() => set({ screen: "venta", mod: "venta" })}
        />
        <Tile
          k="clientes"
          label="Clientes"
          icon={<IconClientes />}
          onClick={() => set({ screen: "clientes", cSub: "lista", cSel: null })}
        />
        <Tile
          k="compras"
          label="Compras"
          icon={<IconCompras />}
          onClick={() => set({ screen: "compras", kSub: "lista", kSel: null })}
        />
        <Tile
          k="inventario"
          label="Inventario"
          icon={<IconInventario />}
          onClick={() => set({ screen: "inventario", iSub: "lista", iSel: null })}
        />
        <Tile
          k="conversaciones"
          label="Conversaciones"
          icon={<IconConversaciones />}
          onClick={() => set({ screen: "conversaciones", xSub: "lista", xSel: null })}
        />
        <Tile
          k="proveedores"
          label="Proveedores"
          icon={<IconProveedores />}
          onClick={() => set({ screen: "proveedores", vwSub: "lista", vwSel: null })}
        />
      </div>

      <BottomNav />
    </div>
  );
}

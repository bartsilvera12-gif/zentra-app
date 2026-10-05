"use client";

import { fmtIso, gs, haceDias, hoyIso, inicioDeMes } from "@/lib/format";
import { buildReport } from "@/lib/reportes";
import { repo } from "@/lib/repo";
import { useRemoto } from "./useRemoto";
import { Cargando, Falla } from "../ui/Estado";
import type { RepTab } from "@/lib/types";
import { useApp } from "@/store/AppContext";
import { BottomNav } from "../layout/BottomNav";
import { StatusBar } from "../layout/StatusBar";
import { Card, ScrollBody, SectionLabel } from "../ui/primitives";

const AZUL = "#023047";
const VIOLETA = "#8E92B4";

export function ReportesScreen() {
  const { s, t, set } = useApp();
  // Los tres reportes salen del ERP. Se pide sólo lo que la solapa necesita:
  // abrir Reportes no tiene por qué traer el inventario entero.
  const { datos: ventas, cargando: cV, error: eV, recargar: rV } = useRemoto(
    () => (s.rTab === "ventas" ? repo.ventas.list({ desde: s.rDesde, hasta: s.rHasta }) : Promise.resolve([])),
    [s.rTab, s.rDesde, s.rHasta],
  );
  const { datos: compras, cargando: cC, error: eC, recargar: rC } = useRemoto(
    () => (s.rTab === "compras" ? repo.compras.list() : Promise.resolve([])),
    [s.rTab],
  );
  const { datos: productos, cargando: cI, error: eI, recargar: rI } = useRemoto(
    () => (s.rTab === "inventario" ? repo.inventario.list() : Promise.resolve([])),
    [s.rTab],
  );

  const cargando = s.rTab === "ventas" ? cV : s.rTab === "compras" ? cC : cI;
  const error = s.rTab === "ventas" ? eV : s.rTab === "compras" ? eC : eI;
  const recargar = s.rTab === "ventas" ? rV : s.rTab === "compras" ? rC : rI;

  const m = buildReport(s.rTab, s.rDesde, s.rHasta, { ventas, compras, productos });
  const hayDatos = true;

  const trackBg = s.theme === "oscuro" ? "#242c40" : "#E7ECF2";
  const tabla = m.tabla;

  const presets: [string, number][] = [
    ["Hoy", 1],
    ["7 días", 7],
    ["30 días", 30],
    ["Este mes", 0],
  ];

  const aplicarPreset = (label: string, dias: number) => {
    // Contado desde hoy. Estaba clavado al 30 de septiembre de 2026, de cuando
    // los datos eran de ejemplo: "Hoy" mostraba un día de hace meses y el
    // reporte salía vacío sin que se entendiera por qué.
    set({
      rPreset: label,
      rDesde: label === "Este mes" ? inicioDeMes() : haceDias(dias),
      rHasta: hoyIso(),
    });
  };

  /** El rango aplicado, en palabras. Dos fechas ISO no se leen de un vistazo. */
  const rangoEnPalabras = (() => {
    if (s.rDesde === s.rHasta) return fmtIso(s.rDesde);
    return `${fmtIso(s.rDesde)} — ${fmtIso(s.rHasta)} · ${m.dias} ${m.dias === 1 ? "día" : "días"}`;
  })();

  const dateInput = {
    height: 40,
    borderRadius: 11,
    padding: "0 11px",
    fontSize: 13.5,
    outline: "none",
    background: "rgba(255,255,255,.14)",
    border: "1px solid rgba(255,255,255,.26)",
    color: "#fff",
    minWidth: 0,
  } as const;

  const darkLabel = {
    font: "600 9.5px/1 var(--font-barlow),Barlow,sans-serif",
    letterSpacing: ".14em",
    textTransform: "uppercase" as const,
    color: "rgba(255,255,255,.72)",
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
      <StatusBar bg={AZUL} />

      <div style={{ background: AZUL, padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => set({ screen: "home" })}
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
            <span style={{ font: "700 18px/1.1 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>Reportes</span>
            <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: "rgba(255,255,255,.75)" }}>
              {fmtIso(s.rDesde)} — {fmtIso(s.rHasta)} · {m.dias} {m.dias === 1 ? "día" : "días"}
            </span>
          </div>
          <div style={{ flex: "0 0 auto", display: "flex", gap: 6 }}>
            {/* Only the sales tab has an invoice-level drill-down. */}
            {s.rTab === "ventas" && (
              <button
                onClick={() => set({ screen: "detventas", dvSub: "lista", dvSel: null, dvQuery: "", dvAccion: "" })}
                style={{
                  borderRadius: 999,
                  padding: "8px 13px",
                  border: 0,
                  background: VIOLETA,
                  color: "#fff",
                  cursor: "pointer",
                  font: "600 12px/1 var(--font-barlow),Barlow,sans-serif",
                  whiteSpace: "nowrap",
                }}
              >
                Detalle
              </button>
            )}
            <button
              onClick={() => set({ rExportado: !s.rExportado })}
              style={{
                borderRadius: 999,
                padding: "8px 13px",
                border: "1px solid rgba(255,255,255,.3)",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
                font: "600 12px/1 var(--font-barlow),Barlow,sans-serif",
                whiteSpace: "nowrap",
              }}
            >
              {s.rExportado ? "✓ Exportado" : "Exportar"}
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            background: "rgba(255,255,255,.12)",
            borderRadius: 11,
            padding: 4,
          }}
        >
          {([["ventas", "Ventas"], ["inventario", "Inventario"], ["compras", "Compras"]] as [RepTab, string][]).map(
            ([k, label]) => {
              const on = s.rTab === k;
              return (
                <button
                  key={k}
                  onClick={() => set({ rTab: k })}
                  style={{
                    flex: 1,
                    border: 0,
                    borderRadius: 9,
                    padding: "10px 6px",
                    cursor: "pointer",
                    font: "600 12.5px/1 var(--font-barlow),Barlow,sans-serif",
                    background: on ? "#8ECAE6" : "transparent",
                    color: on ? AZUL : "rgba(255,255,255,.8)",
                  }}
                >
                  {label}
                </button>
              );
            },
          )}
        </div>

        {/* El inventario es la foto de ahora: el rango de fechas no lo cambia.
            En vez de dejar controles que no hacen nada, se dice. */}
        {m.esFoto ? (
          <div
            style={{
              borderRadius: 11,
              padding: "10px 12px",
              background: "rgba(255,255,255,.10)",
              border: "1px solid rgba(255,255,255,.18)",
              font: "500 11.5px/1.4 var(--font-barlow),Barlow,sans-serif",
              color: "rgba(255,255,255,.82)",
            }}
          >
            El inventario es la foto de ahora: no depende del período.
          </div>
        ) : (
          <>
        <div className="zt-no-scrollbar" style={{ display: "flex", gap: 6, overflowX: "auto" }}>
          {presets.map(([label, dias]) => {
            const on = s.rPreset === label;
            return (
              <button
                key={label}
                onClick={() => aplicarPreset(label, dias)}
                style={{
                  flex: "0 0 auto",
                  borderRadius: 999,
                  // Más alto para el pulgar: 7px de relleno quedaba chico para
                  // tocar sin errar, que es como se usa esto en la calle.
                  padding: "9px 14px",
                  minHeight: 34,
                  cursor: "pointer",
                  font: `${on ? 600 : 500} 12px/1 var(--font-barlow),Barlow,sans-serif`,
                  whiteSpace: "nowrap",
                  background: on ? "#fff" : "rgba(255,255,255,.08)",
                  color: on ? AZUL : "rgba(255,255,255,.8)",
                  border: `1px solid ${on ? "#fff" : "rgba(255,255,255,.2)"}`,
                  transition: "background .16s ease, color .16s ease",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <label style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={darkLabel}>Desde</span>
            <input
              type="date"
              value={s.rDesde}
              max={s.rHasta}
              onChange={(e) => set({ rDesde: e.target.value, rPreset: "" })}
              style={dateInput}
            />
          </label>
          <label style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={darkLabel}>Hasta</span>
            <input
              type="date"
              value={s.rHasta}
              // No deja elegir un "hasta" anterior al "desde", ni una fecha
              // futura: un rango al revés devuelve vacío y parece que no hay
              // datos.
              min={s.rDesde}
              max={hoyIso()}
              onChange={(e) => set({ rHasta: e.target.value, rPreset: "" })}
              style={dateInput}
            />
          </label>
        </div>

        {/* Qué rango quedó aplicado, en palabras: dos fechas en formato ISO no
            se leen de un vistazo, y el preset no alcanza cuando alguien tocó
            las fechas a mano. */}
        <span style={{ font: "500 11px/1.3 var(--font-barlow),Barlow,sans-serif", color: "rgba(255,255,255,.74)" }}>
          {rangoEnPalabras}
        </span>
          </>
        )}
      </div>

      <ScrollBody padding="14px" gap={12}>
        {hayDatos && cargando && <Cargando t={t} que="el reporte" />}
        {hayDatos && !cargando && error && <Falla t={t} mensaje={error} onReintentar={recargar} />}

        {hayDatos && !cargando && !error && (
          <>
        {/* KPIs */}
        <div style={{ display: "flex", gap: 10 }}>
          {m.kpis.map((k) => (
            <Card key={k.label} style={{ flex: 1, minWidth: 0, padding: 14 }} gap={4}>
              <SectionLabel>{k.label}</SectionLabel>
              <span style={{ font: "700 18px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                {k.valor}
              </span>
              {/* Sin flechita de "subió/bajó": sería una comparación contra un
                  período anterior que no se está calculando. */}
              <span style={{ font: "500 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                {k.delta}
              </span>
            </Card>
          ))}
        </div>

        {/* Time series */}
        <Card gap={14}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <SectionLabel>{m.cfg.serieTitulo}</SectionLabel>
              <span style={{ font: "700 20px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                {gs(m.total)}
              </span>
            </div>
            <span
              style={{
                borderRadius: 999,
                padding: "5px 10px",
                font: "600 10.5px/1 var(--font-barlow),Barlow,sans-serif",
                whiteSpace: "nowrap",
                background: s.rTab === "compras" ? "#FBE9E7" : "#EAF3EF",
                color: s.rTab === "compras" ? "#8C2F2B" : "#1F5C46",
              }}
            >
              {m.esFoto ? "foto de hoy" : `${m.dias} ${m.dias === 1 ? "día" : "días"}`}
            </span>
          </div>
          {/* Qué mide el eje. En inventario importa: es una foto de hoy, no del
              período elegido, y sin decirlo alguien lee esas barras como si
              fueran del rango. */}
          <span style={{ font: "400 10.5px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
            {m.serieNota}
          </span>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 118 }}>
            {m.buckets.map((b, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  justifyContent: "flex-end",
                  height: "100%",
                }}
              >
                <span style={{ font: "600 9px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
                  {b.v === m.max ? "●" : ""}
                </span>
                <div
                  style={{
                    width: "100%",
                    borderRadius: "5px 5px 2px 2px",
                    background: b.v === m.max ? m.acento : m.acentoSuave,
                    height: Math.max(3, Math.round((b.v / m.max) * 86)),
                    transition: "height .5s cubic-bezier(.22,1,.36,1)",
                  }}
                />
                <span
                  style={{
                    font: "500 9px/1 var(--font-barlow),Barlow,sans-serif",
                    whiteSpace: "nowrap",
                    color: t.ink3,
                  }}
                >
                  {b.dia}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Donut breakdown */}
        <Card gap={14}>
          <SectionLabel>{m.cfg.dona}</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                position: "relative",
                width: 104,
                height: 104,
                flex: "0 0 auto",
                borderRadius: "50%",
                background: m.conic,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 22,
                  top: 22,
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  background: t.card,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                }}
              >
                <span style={{ font: "700 16px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{m.donaValor}</span>
                <span
                  style={{
                    font: "500 8.5px/1 var(--font-barlow),Barlow,sans-serif",
                    letterSpacing: ".1em",
                    color: t.ink2,
                  }}
                >
                  {m.donaSub}
                </span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {m.dona.map((d) => (
                <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{ width: 9, height: 9, flex: "0 0 auto", borderRadius: 3, background: d.color }}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      font: "500 12px/1.2 var(--font-barlow),Barlow,sans-serif",
                      color: t.ink2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {d.label}
                  </span>
                  <span style={{ flex: "0 0 auto", font: "600 12px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                    {d.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Ranking */}
        <Card gap={14}>
          <SectionLabel>{m.cfg.rankTitulo}</SectionLabel>
          {m.rank.map((r, i) => (
            <div key={r.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    font: "600 12.5px/1.2 var(--font-barlow),Barlow,sans-serif",
                    color: t.ink,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.label}
                </span>
                <span style={{ flex: "0 0 auto", font: "700 12.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                  {gs(r.v)}
                </span>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: trackBg, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.max(6, Math.round((r.v / m.rankMax) * 100))}%`,
                    background: i === 0 ? m.acento : m.acentoSuave,
                    borderRadius: 4,
                    transition: "width .5s cubic-bezier(.22,1,.36,1)",
                  }}
                />
              </div>
              <span style={{ font: "400 10.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>{r.sub}</span>
            </div>
          ))}
          {m.rank.length === 0 && (
            <span style={{ font: "400 12.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
              No hay movimientos en el rango elegido.
            </span>
          )}
        </Card>

        {/* Tax / indicator table */}
        <Card gap={12}>
          <SectionLabel>{m.cfg.tablaTitulo}</SectionLabel>
          {tabla.map((f) => (
            <div key={f.k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ font: "600 12.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{f.k}</span>
                <span style={{ font: "400 10.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>{f.sub}</span>
              </span>
              <span style={{ flex: "0 0 auto", font: "700 13px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{f.v}</span>
            </div>
          ))}
          <span style={{ font: "400 10.5px/1.45 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>{m.cfg.nota}</span>
        </Card>
          </>
        )}
      </ScrollBody>

      <BottomNav />
    </div>
  );
}

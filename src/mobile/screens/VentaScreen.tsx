"use client";

import { CLIENTES, METODOS, PASOS_VENTA, PRODUCTOS } from "@/lib/data";
import { ivaContenido } from "@/lib/calc";
import { gs, norm } from "@/lib/format";
import { useApp } from "@/store/AppContext";
import { StatusBar } from "../layout/StatusBar";
import { WizardSteps } from "../ui/WizardSteps";

export function VentaScreen() {
  const { s, t, set, qty, rotarIva } = useApp();

  const todos = CLIENTES.concat(s.cExtra);
  const cli = todos.find((c) => c.id === s.vCliente) ?? null;
  const idxPaso = Math.max(0, PASOS_VENTA.findIndex((x) => x.id === s.vPaso));

  // Cart lines, with IVA extracted from the (tax-inclusive) price.
  const lineas = PRODUCTOS.filter((pr) => (s.vCart[pr.id] || 0) > 0).map((pr) => {
    const q = s.vCart[pr.id]!;
    const ivaTipo = s.vIva[pr.id] || "10%";
    const rate = ivaTipo === "10%" ? 0.1 : ivaTipo === "5%" ? 0.05 : 0;
    const tot = q * pr.precio;
    return { id: pr.id, nombre: pr.nombre, qty: q, precio: pr.precio, total: tot, ivaTipo, iva: ivaContenido(tot, rate) };
  });
  const renglones = lineas.length;
  const total = lineas.reduce((a, l) => a + l.total, 0);
  const ivaTotal = lineas.reduce((a, l) => a + l.iva, 0);

  const puede =
    s.vPaso === "cliente"
      ? !!cli || s.vSinNombre
      : s.vPaso === "productos"
        ? renglones > 0
        : s.vPaso === "resumen"
          ? true
          : s.vPaso === "pago"
            ? s.vCredito
              ? Number(s.vPlazo) > 0
              : !!s.vMetodo
            : true;

  const forma = s.vCredito
    ? `A crédito · ${s.vPlazo || 0} días`
    : (METODOS.find((m) => m.value === s.vMetodo)?.label ?? "—");

  const clientesFiltrados = todos.filter(
    (c) => norm(c.nombre + " " + c.doc).indexOf(norm(s.vQCliente.trim())) >= 0,
  );
  const productosFiltrados = PRODUCTOS.filter(
    (pr) => norm(pr.nombre + " " + pr.sku).indexOf(norm(s.vQuery.trim())) >= 0,
  );

  const vClienteNombre = cli ? cli.nombre : s.vSinNombre ? "Sin nombre" : "—";
  const vTitulo = s.vPaso === "listo" ? "Venta realizada" : s.vPaso === "factura" ? "Factura" : "Nueva venta";
  const vTotal = gs(total);
  const vNumero = "VTA-000148";

  const back = () => {
    if (s.vPaso === "factura") return set({ vPaso: "listo" });
    if (s.vPaso === "cliente" || s.vPaso === "listo") return set({ screen: "home" });
    set({ vPaso: PASOS_VENTA[Math.max(0, idxPaso - 1)]!.id as typeof s.vPaso });
  };

  const next = () => {
    if (!puede) return;
    if (s.vPaso === "pago") return set({ vPaso: "listo" });
    set({ vPaso: PASOS_VENTA[idxPaso + 1]!.id as typeof s.vPaso });
  };

  const input = {
    height: 44,
    borderRadius: 12,
    padding: "0 14px",
    fontSize: 14.5,
    outline: "none",
    background: t.card,
    border: `1px solid ${t.border}`,
    color: t.ink,
  } as const;

  const uppercaseLabel = {
    font: "600 10.5px/1 var(--font-barlow),Barlow,sans-serif",
    letterSpacing: ".16em",
    textTransform: "uppercase" as const,
    color: t.ink2,
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
      <StatusBar ink="#fff" dim="rgba(255,255,255,.45)" bg="#023047" />

      <div style={{ background: "#023047", padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={back}
            style={{
              width: 32,
              height: 32,
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
          <div style={{ font: "600 17px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>{vTitulo}</div>
        </div>

        {s.vPaso !== "listo" && s.vPaso !== "factura" && (
          <WizardSteps
            pasos={PASOS_VENTA.map((p, i) => {
              const done = i < idxPaso;
              const act = i === idxPaso;
              return {
                nombre: p.nombre,
                mark: done ? "✓" : String(i + 1),
                bg: act ? "#8ECAE6" : done ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.12)",
                fg: act ? "#023047" : done ? "#fff" : "rgba(255,255,255,.55)",
                label: act ? "#fff" : "rgba(255,255,255,.65)",
                go: () => {
                  if (done) set({ vPaso: p.id as typeof s.vPaso });
                },
              };
            })}
          />
        )}

        {s.vPaso !== "cliente" && s.vPaso !== "listo" && s.vPaso !== "factura" && (
          <div
            style={{
              borderRadius: 9,
              background: "rgba(255,255,255,.12)",
              padding: "7px 11px",
              font: "400 12px/1.2 var(--font-barlow),Barlow,sans-serif",
              color: "rgba(255,255,255,.85)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Cliente: <strong style={{ fontWeight: 600, color: "#fff" }}>{vClienteNombre}</strong>
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 14 }}>
        {/* Step 1 — client */}
        {s.vPaso === "cliente" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={() => set({ vSinNombre: true, vCliente: null, vCredito: false, vQCliente: "" })}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                textAlign: "left",
                borderRadius: 14,
                padding: 13,
                cursor: "pointer",
                background: t.card,
                border: `2px solid ${s.vSinNombre ? "#04617A" : t.border}`,
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 38,
                  flex: "0 0 auto",
                  borderRadius: 11,
                  background: t.bg,
                  color: t.ink2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "600 13px/1 var(--font-barlow),Barlow,sans-serif",
                }}
              >
                S/N
              </span>
              <span style={{ flex: 1, font: "600 14px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Sin nombre</span>
            </button>

            {s.vSinNombre && (
              <div
                style={{
                  borderRadius: 12,
                  background: "#E6F1F5",
                  border: "1px solid #A9CEDB",
                  padding: "11px 13px",
                  font: "400 12px/1.45 var(--font-barlow),Barlow,sans-serif",
                  color: "#0A4A5C",
                }}
              >
                Se genera comprobante sin nombre según normativa vigente. El crédito no está disponible para ventas sin
                cliente identificado.
              </div>
            )}

            <div style={uppercaseLabel}>Cliente identificado</div>

            <input
              type="text"
              value={s.vQCliente}
              onChange={(e) => set({ vQCliente: e.target.value })}
              placeholder="Buscar por nombre, RUC o CI…"
              style={input}
            />

            <button
              onClick={() =>
                set({
                  screen: "clientes",
                  cSub: "nuevo",
                  fOrigen: "venta",
                  fDoc: "",
                  fNombre: "",
                  fSet: null,
                  fError: false,
                })
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                textAlign: "left",
                borderRadius: 14,
                padding: 13,
                cursor: "pointer",
                background: t.card,
                border: "1.5px dashed #04617A",
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 38,
                  flex: "0 0 auto",
                  borderRadius: 11,
                  background: "#E2F0F4",
                  color: "#04617A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "600 18px/1 var(--font-barlow),Barlow,sans-serif",
                }}
              >
                +
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                <span style={{ font: "600 14px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Registrar nuevo cliente</span>
                <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>RUC o cédula y nombre</span>
              </span>
              <span style={{ font: "600 16px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>›</span>
            </button>

            {clientesFiltrados.map((c) => (
              <button
                key={c.id}
                onClick={() => set({ vCliente: c.id, vSinNombre: false })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  textAlign: "left",
                  borderRadius: 14,
                  padding: 13,
                  cursor: "pointer",
                  background: t.card,
                  border: `2px solid ${s.vCliente === c.id ? "#04617A" : t.border}`,
                }}
              >
                <span
                  style={{
                    width: 38,
                    height: 38,
                    flex: "0 0 auto",
                    borderRadius: 11,
                    background: "#E2F0F4",
                    color: "#04617A",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    font: "600 14px/1 var(--font-barlow),Barlow,sans-serif",
                  }}
                >
                  {c.nombre.slice(0, 1)}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                  <span style={{ font: "600 14px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{c.nombre}</span>
                  <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>{c.doc}</span>
                </span>
                <span style={{ font: "600 16px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>›</span>
              </button>
            ))}

            {clientesFiltrados.length === 0 && (
              <div
                style={{
                  borderRadius: 14,
                  padding: "22px 16px",
                  textAlign: "center",
                  background: t.card,
                  border: `1px dashed ${t.border}`,
                  font: "500 13px/1.45 var(--font-barlow),Barlow,sans-serif",
                  color: t.ink2,
                }}
              >
                {s.vQCliente.trim()
                  ? `Ningún cliente coincide con “${s.vQCliente.trim()}”.`
                  : "Todavía no hay clientes cargados."}
              </div>
            )}
          </div>
        )}

        {/* Step 2 — products */}
        {s.vPaso === "productos" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="text"
              value={s.vQuery}
              onChange={(e) => set({ vQuery: e.target.value })}
              placeholder="Buscar producto…"
              style={input}
            />
            {productosFiltrados.map((p) => {
              const q = s.vCart[p.id] || 0;
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    borderRadius: 14,
                    padding: 11,
                    background: t.card,
                    border: `1.5px solid ${q > 0 ? "#04617A" : t.border}`,
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      flex: "0 0 auto",
                      borderRadius: 11,
                      background: t.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      font: "600 12px/1 var(--font-barlow),Barlow,sans-serif",
                      color: t.ink3,
                    }}
                  >
                    {p.sku}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ font: "600 13.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{p.nombre}</span>
                    <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>Stock: {p.stock} un.</span>
                    <span style={{ font: "700 13.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#04617A" }}>{gs(p.precio)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flex: "0 0 auto" }}>
                    <button
                      onClick={() => qty(p.id, -1)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 9,
                        cursor: "pointer",
                        font: "600 16px/1 var(--font-barlow),Barlow,sans-serif",
                        background: t.bg,
                        border: `1px solid ${t.border}`,
                        color: t.ink,
                      }}
                    >
                      −
                    </button>
                    <span style={{ minWidth: 18, textAlign: "center", font: "600 14px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                      {q}
                    </span>
                    <button
                      onClick={() => qty(p.id, 1)}
                      style={{
                        width: 30,
                        height: 30,
                        border: 0,
                        borderRadius: 9,
                        cursor: "pointer",
                        font: "600 16px/1 var(--font-barlow),Barlow,sans-serif",
                        background: "#04617A",
                        color: "#fff",
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
            {productosFiltrados.length === 0 && (
              <div
                style={{
                  borderRadius: 14,
                  padding: "22px 16px",
                  textAlign: "center",
                  background: t.card,
                  border: `1px dashed ${t.border}`,
                  font: "500 13px/1.45 var(--font-barlow),Barlow,sans-serif",
                  color: t.ink2,
                }}
              >
                {s.vQuery.trim()
                  ? `Ningún producto coincide con “${s.vQuery.trim()}”.`
                  : "No hay stock disponible para vender."}
              </div>
            )}
          </div>
        )}

        {/* Step 3 — summary */}
        {s.vPaso === "resumen" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={uppercaseLabel}>Resumen de venta</div>
            {lineas.map((l) => (
              <div
                key={l.id}
                style={{
                  borderRadius: 14,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 9,
                  background: t.card,
                  border: `1px solid ${t.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ font: "600 13.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{l.nombre}</span>
                    <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                      {l.qty} × {gs(l.precio)}
                    </span>
                  </div>
                  <span style={{ font: "700 14px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{gs(l.total)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <button
                      onClick={() => qty(l.id, -1)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 9,
                        cursor: "pointer",
                        font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
                        background: t.bg,
                        border: `1px solid ${t.border}`,
                        color: t.ink,
                      }}
                    >
                      −
                    </button>
                    <span style={{ minWidth: 16, textAlign: "center", font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                      {l.qty}
                    </span>
                    <button
                      onClick={() => qty(l.id, 1)}
                      style={{
                        width: 28,
                        height: 28,
                        border: 0,
                        borderRadius: 9,
                        cursor: "pointer",
                        font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
                        background: "#04617A",
                        color: "#fff",
                      }}
                    >
                      +
                    </button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ font: "500 11px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>IVA</span>
                    <button
                      onClick={() => rotarIva(l.id)}
                      style={{
                        borderRadius: 8,
                        padding: "5px 9px",
                        cursor: "pointer",
                        font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif",
                        background: t.bg,
                        border: `1px solid ${t.border}`,
                        color: t.ink,
                      }}
                    >
                      {l.ivaTipo}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div
              style={{
                borderRadius: 14,
                padding: 14,
                background: t.card,
                border: `1px solid ${t.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 7,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ font: "400 13px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>IVA incluido</span>
                <span style={{ font: "500 13px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{gs(ivaTotal)}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: `1px solid ${t.border}`,
                  paddingTop: 9,
                }}
              >
                <span style={{ font: "600 14px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Total</span>
                <span style={{ font: "700 21px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{vTotal}</span>
              </div>
            </div>
            <button
              onClick={() => set({ vMonedaUsd: !s.vMonedaUsd })}
              style={{
                borderRadius: 12,
                padding: "12px 14px",
                textAlign: "left",
                cursor: "pointer",
                font: "500 12px/1 var(--font-barlow),Barlow,sans-serif",
                background: t.card,
                border: `1px solid ${t.border}`,
                color: t.ink2,
              }}
            >
              Moneda: {s.vMonedaUsd ? "USD" : "GS"} · cambiar
            </button>
          </div>
        )}

        {/* Step 4 — payment */}
        {s.vPaso === "pago" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => set({ vCredito: false })}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  borderRadius: 12,
                  padding: "13px 10px",
                  cursor: "pointer",
                  font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif",
                  background: !s.vCredito ? "#E2F0F4" : t.card,
                  color: t.ink,
                  border: `2px solid ${!s.vCredito ? "#04617A" : t.border}`,
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1C8C84" }} />
                Contado
              </button>
              <button
                onClick={() => {
                  // Credit requires an identified client, per the ERP's rule.
                  if (!s.vSinNombre) set({ vCredito: true });
                }}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  borderRadius: 12,
                  padding: "13px 10px",
                  font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif",
                  background: s.vCredito ? "#FFF3DC" : t.card,
                  color: t.ink,
                  border: `2px solid ${s.vCredito ? "#96731A" : t.border}`,
                  cursor: s.vSinNombre ? "not-allowed" : "pointer",
                  opacity: s.vSinNombre ? 0.45 : 1,
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#96731A" }} />
                Crédito
              </button>
            </div>

            <div style={{ font: "400 11.5px/1.35 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
              {s.vSinNombre
                ? "El crédito es solo para clientes identificados."
                : s.vCredito
                  ? "Se cobra después: no entra plata a la caja ahora."
                  : "Se cobra ahora."}
            </div>

            <div style={uppercaseLabel}>{s.vCredito ? "Plazo" : "Con qué se cobra"}</div>

            {!s.vCredito && (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {METODOS.map((m) => {
                  const on = s.vMetodo === m.value;
                  return (
                    <button
                      key={m.value}
                      onClick={() => set({ vMetodo: m.value })}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        textAlign: "left",
                        borderRadius: 14,
                        padding: 13,
                        cursor: "pointer",
                        background: t.card,
                        border: `2px solid ${on ? "#04617A" : t.border}`,
                      }}
                    >
                      <span
                        style={{
                          width: 34,
                          height: 34,
                          flex: "0 0 auto",
                          borderRadius: 10,
                          background: t.bg,
                          color: t.ink2,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          font: "600 11px/1 var(--font-barlow),Barlow,sans-serif",
                        }}
                      >
                        {m.tag}
                      </span>
                      <span style={{ flex: 1, font: "600 14px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{m.label}</span>
                      <span
                        style={{
                          width: 17,
                          height: 17,
                          borderRadius: "50%",
                          flex: "0 0 auto",
                          background: on ? "#04617A" : "transparent",
                          border: `2px solid ${on ? "#04617A" : t.dim}`,
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            )}

            {s.vCredito && (
              <div
                style={{
                  borderRadius: 14,
                  padding: 14,
                  background: t.card,
                  border: `1px solid ${t.border}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                }}
              >
                <span style={{ font: "500 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>Plazo en días</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={s.vPlazo}
                  onChange={(e) => set({ vPlazo: e.target.value.replace(/[^0-9]/g, "") })}
                  placeholder="30"
                  style={{
                    height: 42,
                    borderRadius: 11,
                    padding: "0 13px",
                    fontSize: 14.5,
                    outline: "none",
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    color: t.ink,
                  }}
                />
              </div>
            )}

            <div
              style={{
                borderRadius: 14,
                padding: 16,
                textAlign: "center",
                background: t.card,
                border: `1px solid ${t.border}`,
              }}
            >
              <div style={uppercaseLabel}>Total a cobrar</div>
              <div style={{ font: "700 28px/1 var(--font-barlow),Barlow,sans-serif", marginTop: 7, color: t.ink }}>{vTotal}</div>
            </div>
          </div>
        )}

        {/* Invoice view */}
        {s.vPaso === "factura" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                  <span style={{ font: "700 14px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#023047" }}>
                    Distribuidora JM S.A.
                  </span>
                  <span style={{ font: "400 11px/1.3 var(--font-barlow),Barlow,sans-serif", color: "#5b6676" }}>
                    RUC 80012345-0
                    <br />
                    Asunción · Paraguay
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                  <span style={{ font: "600 10px/1 var(--font-barlow),Barlow,sans-serif", letterSpacing: ".14em", color: "#5b6676" }}>
                    FACTURA
                  </span>
                  <span style={{ font: "700 13px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#023047" }}>{vNumero}</span>
                  <span style={{ font: "400 10.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#5b6676" }}>
                    25/09/2026 · 11:42
                  </span>
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
                <span style={{ font: "600 13px/1.3 var(--font-barlow),Barlow,sans-serif", color: "#023047" }}>{vClienteNombre}</span>
                <span style={{ font: "400 11.5px/1.3 var(--font-barlow),Barlow,sans-serif", color: "#5b6676" }}>
                  Condición: {forma}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  borderTop: "1px solid #e4e9ee",
                  paddingTop: 12,
                }}
              >
                {lineas.map((l) => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ font: "500 12.5px/1.25 var(--font-barlow),Barlow,sans-serif", color: "#023047" }}>{l.nombre}</span>
                      <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#5b6676" }}>
                        {l.qty} × {gs(l.precio)} · IVA {l.ivaTipo}
                      </span>
                    </div>
                    <span style={{ font: "600 12.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#023047" }}>{gs(l.total)}</span>
                  </div>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  borderTop: "1px solid #e4e9ee",
                  paddingTop: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ font: "400 12px/1 var(--font-barlow),Barlow,sans-serif", color: "#5b6676" }}>IVA incluido</span>
                  <span style={{ font: "500 12px/1 var(--font-barlow),Barlow,sans-serif", color: "#023047" }}>{gs(ivaTotal)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ font: "600 14px/1 var(--font-barlow),Barlow,sans-serif", color: "#023047" }}>Total</span>
                  <span style={{ font: "700 20px/1 var(--font-barlow),Barlow,sans-serif", color: "#023047" }}>{vTotal}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => set({ vPaso: "listo" })}
              style={{
                height: 48,
                borderRadius: 13,
                cursor: "pointer",
                font: "600 14.5px/1 var(--font-barlow),Barlow,sans-serif",
                background: t.card,
                border: `1px solid ${t.border}`,
                color: t.ink,
              }}
            >
              Volver al resumen
            </button>
          </div>
        )}

        {/* Confirmation */}
        {s.vPaso === "listo" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                borderRadius: 16,
                padding: "22px 18px",
                textAlign: "center",
                background: t.card,
                border: `1px solid ${t.border}`,
              }}
            >
              <div
                style={{
                  width: 58,
                  height: 58,
                  margin: "0 auto",
                  borderRadius: "50%",
                  background: "#E3F1EF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "700 26px/1 var(--font-barlow),Barlow,sans-serif",
                  color: "#1C8C84",
                }}
              >
                ✓
              </div>
              <div style={{ font: "700 16px/1.3 var(--font-barlow),Barlow,sans-serif", marginTop: 12, color: t.ink }}>
                ¡Venta registrada!
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 16, textAlign: "left" }}>
                {[
                  ["N.° de comprobante", vNumero],
                  ["Cliente", vClienteNombre],
                  ["Forma de pago", forma],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ font: "400 13px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>{k}</span>
                    <span style={{ font: "600 13px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{v}</span>
                  </div>
                ))}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    borderTop: `1px solid ${t.border}`,
                    paddingTop: 9,
                  }}
                >
                  <span style={{ font: "600 14px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Total</span>
                  <span style={{ font: "700 20px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{vTotal}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => set({ vPaso: "factura" })}
              style={{
                height: 48,
                border: 0,
                borderRadius: 13,
                background: "#04617A",
                color: "#fff",
                font: "600 14.5px/1 var(--font-barlow),Barlow,sans-serif",
                cursor: "pointer",
              }}
            >
              Ver factura
            </button>
            <button
              onClick={() =>
                set({
                  vPaso: "cliente",
                  vCliente: null,
                  vSinNombre: false,
                  vCart: {},
                  vIva: {},
                  vMetodo: null,
                  vCredito: false,
                  vQuery: "",
                })
              }
              style={{
                height: 48,
                borderRadius: 13,
                cursor: "pointer",
                font: "600 14.5px/1 var(--font-barlow),Barlow,sans-serif",
                background: t.card,
                border: "1.5px solid #04617A",
                color: "#04617A",
              }}
            >
              Nueva venta
            </button>
            <button
              onClick={() => set({ screen: "home" })}
              style={{
                height: 46,
                borderRadius: 13,
                cursor: "pointer",
                font: "500 13.5px/1 var(--font-barlow),Barlow,sans-serif",
                background: t.card,
                border: `1px solid ${t.border}`,
                color: t.ink2,
              }}
            >
              Volver al inicio
            </button>
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      {s.vPaso !== "listo" && s.vPaso !== "factura" && (
        <div
          style={{
            padding: "11px 14px 13px",
            display: "flex",
            flexDirection: "column",
            gap: 9,
            background: t.card,
            borderTop: `1px solid ${t.border}`,
          }}
        >
          {s.vPaso === "productos" && renglones > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ font: "400 13px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                {renglones} {renglones === 1 ? "producto" : "productos"}
              </span>
              <span style={{ font: "700 14px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{vTotal}</span>
            </div>
          )}
          {!puede && s.vPaso === "pago" && (
            <div
              style={{
                borderRadius: 10,
                background: "#FFF3DC",
                padding: "9px 11px",
                font: "500 11.5px/1.35 var(--font-barlow),Barlow,sans-serif",
                color: "#6B4A00",
              }}
            >
              {s.vCredito ? "Ingresá el plazo en días para la venta a crédito." : "Elegí con qué se cobra la venta."}
            </div>
          )}
          <button
            onClick={next}
            style={{
              height: 50,
              border: 0,
              borderRadius: 13,
              color: "#fff",
              font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
              cursor: "pointer",
              background: puede ? "#04617A" : "#5C7A85",
            }}
          >
            {s.vPaso === "pago" ? "Confirmar venta" : "Continuar"}
          </button>
        </div>
      )}
    </div>
  );
}

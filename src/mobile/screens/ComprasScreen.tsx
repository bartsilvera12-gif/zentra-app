"use client";

import { MARCA } from "@/lib/theme";
import { IVA_RATE, PASOS_COMPRA } from "@/lib/data";
import { repo } from "@/lib/repo";
import { Sku } from "../ui/Sku";
import { useRemoto } from "./useRemoto";
import { Cargando, Falla } from "@/mobile/ui/Estado";
import { lineasDeCompra, stockDe, totalCompra } from "@/lib/calc";
import { gs, norm } from "@/lib/format";
import type { Compra, CompraLinea, Iva } from "@/lib/types";
import { useApp } from "@/store/AppContext";
import { BottomNav } from "../layout/BottomNav";
import { StatusBar } from "../layout/StatusBar";
import {
  Badge,
  Card,
  ChipRow,
  EmptyState,
  FormField,
  KeyValue,
  ListHeader,
  ScrollBody,
  SearchInput,
  SectionLabel,
  StatTile,
} from "../ui/primitives";
import { WizardSteps } from "../ui/WizardSteps";

const ORO = MARCA.header;

export function ComprasScreen() {
  const { s, t, set, kQty, kRotarIva } = useApp();

  // Las tres listas salen del ERP. Las compras son lo que se muestra; los
  // proveedores y el catálogo hacen falta para cargar una nueva.
  const { datos: comprasErp, cargando, error, recargar } = useRemoto(() => repo.compras.list(), []);
  const { datos: provsErp } = useRemoto(() => repo.proveedores.list(), []);
  const { datos: prodsErp } = useRemoto(() => repo.inventario.list(), []);
  const provs = s.vwExtra.concat(provsErp);
  const prods = s.iExtra.concat(prodsErp);
  const provName = (id: string | null) => provs.find((x) => x.id === id)?.nombre ?? "—";

  const todas = s.kExtra.concat(comprasErp);
  const pend = todas.filter((c) => c.estado === "Pendiente");
  const kq = norm(s.kQuery.trim());
  const filtradas = todas.filter((c) => {
    if (s.kFiltro === "Pendientes" && c.estado !== "Pendiente") return false;
    if (s.kFiltro === "Pagadas" && c.estado !== "Pagada") return false;
    return norm(provName(c.provId) + " " + c.producto + " " + c.numero).indexOf(kq) >= 0;
  });

  const det = todas.find((c) => c.id === s.kSel) ?? null;
  const detLineas = det ? lineasDeCompra(det) : [];

  const kIdx = Math.max(0, PASOS_COMPRA.findIndex((x) => x.id === s.kPaso));
  const provFiltrados = provs.filter(
    (p) => norm(p.nombre + " " + p.doc).indexOf(norm(s.kQProv.trim())) >= 0,
  );
  const prodFiltrados = prods.filter(
    (p) => norm(p.nombre + " " + p.sku).indexOf(norm(s.kQProd.trim())) >= 0,
  );
  const prov = provs.find((p) => p.id === s.kProv) ?? null;
  const prodObj = prods.find((p) => p.id === s.kProd) ?? null;

  // Costs may be quoted in dollars; everything downstream is guaraníes.
  const costoPyg = (Number(s.kCosto) || 0) * (s.kMoneda === "USD" ? Number(s.kCambio) || 0 : 1);
  const sub = (Number(s.kCant) || 0) * costoPyg;
  const draftOk = !!s.kProd && Number(s.kCant) > 0 && costoPyg > 0;

  const neto = s.kLineas.reduce((a, l) => a + l.cantidad * l.costo, 0);
  const ivaMonto = s.kLineas.reduce((a, l) => a + l.cantidad * l.costo * (IVA_RATE[l.iva] ?? 0), 0);
  const totalNuevo = neto + ivaMonto;
  const unidades = s.kLineas.reduce((a, l) => a + l.cantidad, 0);
  const cuotasNum = Number(s.kCuotas) || 0;

  const puede =
    s.kPaso === "proveedor"
      ? !!s.kProv
      : s.kPaso === "producto"
        ? s.kLineas.length > 0
        : s.kPaso === "condiciones"
          ? s.kPago === "Contado" || (Number(s.kPlazo) > 0 && cuotasNum > 0)
          : true;

  const chips = ["Todas", "Pendientes", "Pagadas"].map((k) => {
    const on = s.kFiltro === k;
    const n = k === "Todas" ? todas.length : k === "Pendientes" ? pend.length : todas.length - pend.length;
    return {
      label: `${k} (${n})`,
      bg: on ? ORO : t.card,
      fg: on ? "#ffffff" : t.ink2,
      border: on ? ORO : t.border,
      pick: () => set({ kFiltro: k }),
    };
  });

  const nueva = () =>
    set({
      kSub: "nueva",
      kPaso: "proveedor",
      kProv: null,
      kProd: null,
      kLineas: [],
      kQProv: "",
      kQProd: "",
      kCant: "",
      kCosto: "",
      kMoneda: "PYG",
      kIva: "10%",
      kPago: "Contado",
      kPlazo: "30",
      kCuotas: "1",
      kNroFac: "",
      kTimbrado: "",
      kAdjunto: false,
      kMargen: 30,
    });

  const agregarLinea = () => {
    if (!draftOk || !prodObj) return;
    const linea: CompraLinea = {
      prodId: prodObj.id,
      nombre: prodObj.nombre,
      unidad: prodObj.unidad || "un.",
      cantidad: Number(s.kCant),
      costo: costoPyg,
      iva: s.kIva,
    };
    set({ kLineas: s.kLineas.concat([linea]), kProd: null, kCant: "", kCosto: "", kQProd: "" });
  };

  const back = () => {
    if (s.kPaso === "proveedor" || s.kPaso === "listo") return set({ kSub: "lista" });
    set({ kPaso: PASOS_COMPRA[Math.max(0, kIdx - 1)]!.id as typeof s.kPaso });
  };

  const next = () => {
    if (!puede) return;
    if (s.kPaso === "condiciones") {
      const seq = 148 + s.kExtra.length;
      const numero = "COMP-000" + seq;
      const nuevaCompra: Compra = {
        id: "n" + (s.kExtra.length + 1),
        numero,
        provId: s.kProv,
        producto: s.kLineas.length === 1 ? s.kLineas[0]!.nombre : `${s.kLineas.length} productos`,
        lineas: s.kLineas,
        cantidad: unidades,
        costo: neto / Math.max(1, unidades),
        iva: s.kLineas.length === 1 ? s.kLineas[0]!.iva : "Mixto",
        pago: s.kPago,
        plazo: Number(s.kPlazo) || 0,
        cuotas: cuotasNum || 1,
        // Cash purchases settle immediately; credit ones stay open.
        estado: s.kPago === "Crédito" ? "Pendiente" : "Pagada",
        fecha: "30 sep 2026",
        factura: s.kNroFac || "—",
        timbrado: s.kTimbrado || "—",
      };
      set({ kExtra: s.kExtra.concat([nuevaCompra]), kPaso: "listo", kUltimo: numero });
      return;
    }
    set({ kPaso: PASOS_COMPRA[kIdx + 1]!.id as typeof s.kPaso });
  };

  const topBg = s.kSub === "lista" ? t.card : ORO;

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

      {/* ---------- list ---------- */}
      {s.kSub === "lista" && (
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
              titulo="Compras"
              resumen={`${todas.length} registradas · ${pend.length} por pagar`}
              onBack={() => set({ screen: "home" })}
              accion={{ label: "+ Nueva", onClick: nueva, bg: ORO, fg: "#ffffff" }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <StatTile label="Total del mes" valor={gs(todas.reduce((a, c) => a + totalCompra(c), 0))} />
              <StatTile
                label="Por pagar"
                valor={gs(pend.reduce((a, c) => a + totalCompra(c), 0))}
                valorInk={ORO}
              />
            </div>
            <SearchInput
              value={s.kQuery}
              onChange={(v) => set({ kQuery: v })}
              placeholder="Proveedor, producto o N.° de compra"
            />
            <ChipRow chips={chips} />
          </div>

          <ScrollBody>
            {cargando && <Cargando t={t} que="compras" />}
            {error && <Falla t={t} mensaje={error} onReintentar={recargar} />}
            {!cargando && !error && filtradas.map((c) => {
              const pagada = c.estado === "Pagada";
              return (
                <button
                  key={c.id}
                  onClick={() => set({ kSub: "detalle", kSel: c.id })}
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
                      <span style={{ font: "600 14px/1.25 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                        {provName(c.provId)}
                      </span>
                      <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                        {c.lineas && c.lineas.length > 1
                          ? `${c.producto} · ${c.cantidad} un.`
                          : `${c.cantidad} × ${c.producto}`}
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
                        {gs(totalCompra(c))}
                      </span>
                      <span style={{ font: "400 10.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>{c.fecha}</span>
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Badge
                      bg={pagada ? "#EAF3EF" : "#FFF3DC"}
                      ink={pagada ? "#1F5C46" : "#6B4A00"}
                      dot={pagada ? "#1C8C84" : "#B08A20"}
                    >
                      {c.estado}
                    </Badge>
                    <Badge bg={s.theme === "oscuro" ? "#242c40" : "#EDEFF3"} ink={t.ink2}>
                      {c.pago === "Crédito" ? `Crédito ${c.plazo} d` : "Contado"}
                    </Badge>
                    <span style={{ font: "400 10px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
                      {c.numero} · IVA {c.iva}
                    </span>
                  </span>
                </button>
              );
            })}
            {!cargando && !error && filtradas.length === 0 && (
              <EmptyState titulo="Sin compras" detalle="Probá con otro término o cambiá el filtro." />
            )}
          </ScrollBody>
        </>
      )}

      {/* ---------- detail ---------- */}
      {s.kSub === "detalle" && det && (
        <>
          <div style={{ padding: "4px 14px 18px", display: "flex", flexDirection: "column", gap: 12, background: ORO }}>
            <button
              onClick={() => set({ kSub: "lista", kSel: null })}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ font: "700 18px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>{det.numero}</span>
              <span style={{ font: "400 12px/1.2 var(--font-barlow),Barlow,sans-serif", color: "rgba(255,255,255,.78)" }}>
                {provName(det.provId)} · {det.fecha}
              </span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <StatTile label="Total" valor={gs(totalCompra(det))} onDark />
              <StatTile label="Condición" valor={det.pago === "Crédito" ? `Crédito ${det.plazo} d` : "Contado"} onDark />
            </div>
          </div>

          <ScrollBody padding="14px" gap={12}>
            <Card gap={12}>
              <SectionLabel>Productos</SectionLabel>
              {detLineas.map((l, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ font: "600 13px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{l.nombre}</span>
                    <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                      {l.cantidad} un. × {gs(l.costo)} · IVA {l.iva}
                    </span>
                  </div>
                  <span style={{ font: "700 13px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                    {gs(l.cantidad * l.costo * (1 + (IVA_RATE[String(l.iva)] ?? 0)))}
                  </span>
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
                <KeyValue
                  k={`IVA ${det.iva}`}
                  v={gs(totalCompra(det) - detLineas.reduce((a, l) => a + l.cantidad * l.costo, 0))}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ font: "600 14px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Total</span>
                  <span style={{ font: "700 20px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{gs(totalCompra(det))}</span>
                </div>
              </div>
            </Card>

            <Card gap={11}>
              <SectionLabel>Comprobante</SectionLabel>
              <KeyValue k="N.° de factura" v={det.factura} />
              <KeyValue k="Timbrado" v={det.timbrado} />
              <KeyValue k="Condición" v={det.pago} />
              <KeyValue k="Estado" v={det.estado} />
              <KeyValue
                k="Entrada de stock"
                v={`+${det.cantidad} un. en ${detLineas.length} ${detLineas.length === 1 ? "producto" : "productos"}`}
              />
              <KeyValue k="Costo unitario promedio" v={gs(det.costo)} />
            </Card>
          </ScrollBody>
        </>
      )}

      {/* ---------- wizard ---------- */}
      {s.kSub === "nueva" && (
        <>
          <div style={{ background: ORO, padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
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
              <div style={{ font: "600 17px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>
                {s.kPaso === "listo" ? "Compra registrada" : "Nueva compra"}
              </div>
            </div>
            {s.kPaso !== "listo" && (
              <WizardSteps
                pasos={PASOS_COMPRA.map((p, i) => {
                  const done = i < kIdx;
                  const act = i === kIdx;
                  return {
                    nombre: p.nombre,
                    mark: done ? "✓" : String(i + 1),
                    bg: act ? "#FFE8AE" : done ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.14)",
                    fg: act ? "#5C4408" : done ? "#fff" : "rgba(255,255,255,.6)",
                    label: act ? "#fff" : "rgba(255,255,255,.7)",
                    go: () => {
                      if (done) set({ kPaso: p.id as typeof s.kPaso });
                    },
                  };
                })}
              />
            )}
          </div>

          <ScrollBody padding="14px" gap={12}>
            {/* Step 1 — supplier */}
            {s.kPaso === "proveedor" && (
              <>
                <SearchInput
                  value={s.kQProv}
                  onChange={(v) => set({ kQProv: v })}
                  placeholder="Buscar proveedor o RUC…"
                />
                {provFiltrados.map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      set({
                        kProv: p.id,
                        // Default the payment terms to the supplier's usual condition.
                        kPago: p.condicion.indexOf("Crédito") >= 0 ? "Crédito" : "Contado",
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
                      border: `2px solid ${s.kProv === p.id ? ORO : t.border}`,
                    }}
                  >
                    <span
                      style={{
                        width: 38,
                        height: 38,
                        flex: "0 0 auto",
                        borderRadius: 11,
                        background: "#FBF0D8",
                        color: ORO,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        font: "700 15px/1 var(--font-barlow),Barlow,sans-serif",
                      }}
                    >
                      {p.nombre.slice(0, 1)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ font: "600 14px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{p.nombre}</span>
                      <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                        {p.doc} · {p.condicion}
                      </span>
                    </span>
                  </button>
                ))}
                {provFiltrados.length === 0 && (
                  <EmptyState titulo="Sin proveedores" detalle="Probá con otro término de búsqueda." />
                )}
              </>
            )}

            {/* Step 2 — products */}
            {s.kPaso === "producto" && (
              <>
                {s.kLineas.length > 0 && (
                  <Card gap={12}>
                    <SectionLabel>
                      {s.kLineas.length} {s.kLineas.length === 1 ? "producto en la compra" : "productos en la compra"}
                    </SectionLabel>
                    {s.kLineas.map((l, i) => (
                      <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ font: "600 13px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{l.nombre}</span>
                            <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                              {l.cantidad} × {gs(l.costo)} · IVA {l.iva}
                            </span>
                          </div>
                          <span style={{ font: "700 13px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                            {gs(l.cantidad * l.costo * (1 + (IVA_RATE[l.iva] ?? 0)))}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <button
                              onClick={() => kQty(i, -1)}
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
                            <span style={{ minWidth: 20, textAlign: "center", font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                              {l.cantidad}
                            </span>
                            <button
                              onClick={() => kQty(i, 1)}
                              style={{
                                width: 28,
                                height: 28,
                                border: 0,
                                borderRadius: 9,
                                cursor: "pointer",
                                font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
                                background: ORO,
                                color: "#fff",
                              }}
                            >
                              +
                            </button>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ font: "500 11px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>IVA</span>
                            <button
                              onClick={() => kRotarIva(i)}
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
                              {l.iva}
                            </button>
                            <button
                              onClick={() => set({ kLineas: s.kLineas.filter((_, j) => j !== i) })}
                              style={{
                                borderRadius: 8,
                                padding: "5px 9px",
                                cursor: "pointer",
                                font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif",
                                background: "#FBE9E7",
                                border: "1px solid #E8B4AE",
                                color: "#8C2F2B",
                              }}
                            >
                              Quitar
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <KeyValue k="Subtotal neto" v={gs(neto)} />
                  </Card>
                )}

                <Card gap={12}>
                  <SectionLabel>{s.kLineas.length > 0 ? "Añadir otro producto" : "Agregar producto"}</SectionLabel>
                  <SearchInput
                    value={s.kQProd}
                    onChange={(v) => set({ kQProd: v })}
                    placeholder="Buscar producto o SKU…"
                  />

                  {!s.kProd &&
                    prodFiltrados.slice(0, 4).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => set({ kProd: p.id, kCosto: String(p.costo) })}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 11,
                          textAlign: "left",
                          borderRadius: 13,
                          padding: 11,
                          cursor: "pointer",
                          background: t.bg,
                          border: `2px solid transparent`,
                        }}
                      >
                        <Sku sku={p.sku} t={t} caja={36} />
                        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ font: "600 13px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{p.nombre}</span>
                          <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                            Stock {stockDe(p, s.iDelta)} {p.unidad} · costo actual {gs(p.costo)}
                          </span>
                        </span>
                      </button>
                    ))}

                  {!s.kProd && prodFiltrados.length === 0 && (
                    <span style={{ font: "400 12.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                      Ningún producto coincide con la búsqueda.
                    </span>
                  )}

                  {prodObj && (
                    <>
                      <div
                        style={{
                          borderRadius: 13,
                          padding: 12,
                          background: t.bg,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ font: "600 13px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                            {prodObj.nombre}
                          </span>
                          <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                            Stock {stockDe(prodObj, s.iDelta)} {prodObj.unidad} · costo actual {gs(prodObj.costo)}
                          </span>
                        </div>
                        <button
                          onClick={() => set({ kProd: null, kCant: "", kCosto: "", kQProd: "" })}
                          style={{
                            borderRadius: 9,
                            padding: "6px 10px",
                            cursor: "pointer",
                            font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif",
                            background: t.card,
                            border: `1px solid ${t.border}`,
                            color: t.ink2,
                          }}
                        >
                          Cambiar
                        </button>
                      </div>

                      <div style={{ display: "flex", gap: 10 }}>
                        <FormField
                          label="Cantidad"
                          flex={1}
                          inputMode="numeric"
                          value={s.kCant}
                          onChange={(v) => set({ kCant: v.replace(/[^0-9]/g, "") })}
                          placeholder="0"
                        />
                        <FormField
                          label={`Costo (${s.kMoneda})`}
                          flex={1}
                          inputMode="decimal"
                          value={s.kCosto}
                          onChange={(v) => set({ kCosto: v.replace(/[^0-9.]/g, "") })}
                          placeholder="0"
                        />
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        <span style={{ font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>Moneda</span>
                        <div style={{ display: "flex", gap: 7 }}>
                          {(["PYG", "USD"] as const).map((m) => {
                            const on = s.kMoneda === m;
                            return (
                              <button
                                key={m}
                                onClick={() => set({ kMoneda: m })}
                                style={{
                                  flex: 1,
                                  borderRadius: 11,
                                  padding: "11px 8px",
                                  cursor: "pointer",
                                  font: "600 12.5px/1 var(--font-barlow),Barlow,sans-serif",
                                  background: on ? "#FBF0D8" : t.card,
                                  color: on ? "#7A5C10" : t.ink2,
                                  border: `1.5px solid ${on ? ORO : t.border}`,
                                }}
                              >
                                {m === "PYG" ? "Guaraníes" : "Dólares"}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {s.kMoneda === "USD" && (
                        <FormField
                          label="Tipo de cambio (₲ por USD)"
                          inputMode="decimal"
                          value={s.kCambio}
                          onChange={(v) => set({ kCambio: v.replace(/[^0-9.]/g, "") })}
                          placeholder="7550"
                        />
                      )}

                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        <span style={{ font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>IVA de la compra</span>
                        <div style={{ display: "flex", gap: 7 }}>
                          {(["10%", "5%", "Exenta"] as Iva[]).map((iv) => {
                            const on = s.kIva === iv;
                            return (
                              <button
                                key={iv}
                                onClick={() => set({ kIva: iv })}
                                style={{
                                  flex: 1,
                                  borderRadius: 11,
                                  padding: "11px 8px",
                                  cursor: "pointer",
                                  font: "600 12.5px/1 var(--font-barlow),Barlow,sans-serif",
                                  background: on ? "#FBF0D8" : t.card,
                                  color: on ? "#7A5C10" : t.ink2,
                                  border: `1.5px solid ${on ? ORO : t.border}`,
                                }}
                              >
                                {iv}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <KeyValue k="Subtotal de la línea" v={gs(sub)} />

                      <button
                        onClick={agregarLinea}
                        style={{
                          height: 46,
                          border: 0,
                          borderRadius: 12,
                          color: "#fff",
                          font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif",
                          cursor: "pointer",
                          background: draftOk ? ORO : "#8A7A52",
                        }}
                      >
                        {draftOk ? `Añadir · ${gs(sub)}` : "Completá cantidad y costo"}
                      </button>
                    </>
                  )}
                </Card>
              </>
            )}

            {/* Step 3 — terms */}
            {s.kPaso === "condiciones" && (
              <>
                <Card gap={12}>
                  <SectionLabel>Forma de pago</SectionLabel>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => set({ kPago: "Contado" })}
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
                        background: s.kPago === "Contado" ? "#E2F0F4" : t.card,
                        color: t.ink,
                        border: `2px solid ${s.kPago === "Contado" ? "#04617A" : t.border}`,
                      }}
                    >
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1C8C84" }} />
                      Contado
                    </button>
                    <button
                      onClick={() => set({ kPago: "Crédito" })}
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
                        background: s.kPago === "Crédito" ? "#FBF0D8" : t.card,
                        color: t.ink,
                        border: `2px solid ${s.kPago === "Crédito" ? ORO : t.border}`,
                      }}
                    >
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: ORO }} />
                      Crédito
                    </button>
                  </div>

                  {s.kPago === "Crédito" && (
                    <>
                      <div style={{ display: "flex", gap: 10 }}>
                        <FormField
                          label="Plazo (días)"
                          flex={1}
                          inputMode="numeric"
                          value={s.kPlazo}
                          onChange={(v) => set({ kPlazo: v.replace(/[^0-9]/g, "") })}
                          placeholder="30"
                        />
                        <FormField
                          label="Cuotas"
                          flex={1}
                          inputMode="numeric"
                          value={s.kCuotas}
                          onChange={(v) => set({ kCuotas: v.replace(/[^0-9]/g, "") })}
                          placeholder="1"
                        />
                      </div>
                      <span style={{ font: "400 11.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                        {cuotasNum > 0
                          ? `${cuotasNum} cuota(s) de ${gs(totalNuevo / cuotasNum)} cada ${
                              Math.round((Number(s.kPlazo) || 0) / cuotasNum) || 0
                            } días`
                          : "Indicá cuántas cuotas tendrá el crédito."}
                      </span>
                    </>
                  )}
                </Card>

                <Card gap={14}>
                  <SectionLabel>Comprobante</SectionLabel>
                  <div style={{ display: "flex", gap: 10 }}>
                    <FormField
                      label="N.° de factura"
                      flex={1}
                      value={s.kNroFac}
                      onChange={(v) => set({ kNroFac: v })}
                      placeholder="001-001-0009812"
                    />
                    <FormField
                      label="Timbrado"
                      flex={1}
                      inputMode="numeric"
                      value={s.kTimbrado}
                      onChange={(v) => set({ kTimbrado: v.replace(/[^0-9]/g, "") })}
                      placeholder="16512345"
                    />
                  </div>
                  <button
                    onClick={() => set({ kAdjunto: !s.kAdjunto })}
                    style={{
                      borderRadius: 12,
                      padding: "13px 14px",
                      textAlign: "left",
                      cursor: "pointer",
                      font: "500 12.5px/1 var(--font-barlow),Barlow,sans-serif",
                      background: s.kAdjunto ? "#EAF3EF" : t.card,
                      border: `1px solid ${s.kAdjunto ? "#1C8C84" : t.border}`,
                      color: s.kAdjunto ? "#1F5C46" : t.ink2,
                    }}
                  >
                    {s.kAdjunto ? "✓ Foto adjuntada · toca para quitar" : "Adjuntar foto o PDF del comprobante"}
                  </button>
                </Card>

                <Card gap={12}>
                  <SectionLabel>Precio de venta sugerido</SectionLabel>
                  <div style={{ display: "flex", gap: 7 }}>
                    {[20, 30, 40, 50].map((m) => {
                      const on = s.kMargen === m;
                      return (
                        <button
                          key={m}
                          onClick={() => set({ kMargen: m })}
                          style={{
                            flex: 1,
                            borderRadius: 11,
                            padding: "11px 8px",
                            cursor: "pointer",
                            font: "600 12.5px/1 var(--font-barlow),Barlow,sans-serif",
                            background: on ? "#EAF3EF" : t.card,
                            color: on ? "#1F5C46" : t.ink2,
                            border: `1.5px solid ${on ? "#1C8C84" : t.border}`,
                          }}
                        >
                          {m}%
                        </button>
                      );
                    })}
                  </div>
                  <KeyValue
                    k={`Precio con ${s.kMargen}% de margen`}
                    v={unidades > 0 ? gs(neto / unidades / (1 - s.kMargen / 100)) : "—"}
                    vInk="#1F5C46"
                  />
                </Card>

                <Card gap={7}>
                  <SectionLabel>Resumen</SectionLabel>
                  <KeyValue k="Proveedor" v={prov ? prov.nombre : "—"} />
                  <KeyValue
                    k="Productos"
                    v={s.kLineas.length === 1 ? s.kLineas[0]!.nombre : `${s.kLineas.length} productos`}
                  />
                  <KeyValue k="Neto" v={gs(neto)} />
                  <KeyValue k="IVA" v={gs(ivaMonto)} />
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
                    <span style={{ font: "700 21px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{gs(totalNuevo)}</span>
                  </div>
                </Card>
              </>
            )}

            {/* Confirmation */}
            {s.kPaso === "listo" && (
              <>
                <Card style={{ padding: "22px 18px", textAlign: "center" }} gap={0}>
                  <div
                    style={{
                      width: 58,
                      height: 58,
                      margin: "0 auto",
                      borderRadius: "50%",
                      background: "#FBF0D8",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      font: "700 26px/1 var(--font-barlow),Barlow,sans-serif",
                      color: ORO,
                    }}
                  >
                    ✓
                  </div>
                  <div style={{ font: "700 16px/1.3 var(--font-barlow),Barlow,sans-serif", marginTop: 12, color: t.ink }}>
                    ¡Compra registrada!
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 16, textAlign: "left" }}>
                    <KeyValue k="N.° de compra" v={s.kUltimo} />
                    <KeyValue k="Proveedor" v={prov ? prov.nombre : "—"} />
                    <KeyValue
                      k="Condición"
                      v={
                        s.kPago === "Crédito"
                          ? `Crédito ${s.kPlazo || 0} días · ${s.kCuotas || 1} cuota(s)`
                          : "Contado"
                      }
                    />
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
                      <span style={{ font: "700 20px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{gs(totalNuevo)}</span>
                    </div>
                  </div>
                </Card>
                <button
                  onClick={() => set({ kSub: "lista", kSel: null })}
                  style={{
                    height: 48,
                    border: 0,
                    borderRadius: 13,
                    background: ORO,
                    color: "#fff",
                    font: "600 14.5px/1 var(--font-barlow),Barlow,sans-serif",
                    cursor: "pointer",
                    flex: "0 0 auto",
                  }}
                >
                  Ver listado de compras
                </button>
                <button
                  onClick={nueva}
                  style={{
                    height: 48,
                    borderRadius: 13,
                    cursor: "pointer",
                    font: "600 14.5px/1 var(--font-barlow),Barlow,sans-serif",
                    background: t.card,
                    border: `1.5px solid ${ORO}`,
                    color: ORO,
                    flex: "0 0 auto",
                  }}
                >
                  Nueva compra
                </button>
              </>
            )}
          </ScrollBody>

          {s.kPaso !== "listo" && (
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
              {s.kPaso === "condiciones" && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ font: "400 13px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                    {unidades} un. · {s.kLineas.length} {s.kLineas.length === 1 ? "producto" : "productos"}
                  </span>
                  <span style={{ font: "700 14px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{gs(totalNuevo)}</span>
                </div>
              )}
              {!puede && s.kPaso !== "proveedor" && (
                <div
                  style={{
                    borderRadius: 10,
                    background: "#FFF3DC",
                    padding: "9px 11px",
                    font: "500 11.5px/1.35 var(--font-barlow),Barlow,sans-serif",
                    color: "#6B4A00",
                  }}
                >
                  {s.kPaso === "producto"
                    ? "Agregá al menos un producto a la compra."
                    : "Para crédito hace falta el plazo y al menos una cuota."}
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
                  background: puede ? ORO : "#8A7A52",
                }}
              >
                {s.kPaso === "condiciones" ? "Registrar compra" : "Continuar"}
              </button>
            </div>
          )}
        </>
      )}

      {s.kSub === "lista" && <BottomNav />}
    </div>
  );
}

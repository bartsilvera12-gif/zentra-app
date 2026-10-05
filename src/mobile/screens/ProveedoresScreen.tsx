"use client";

import { repo } from "@/lib/repo";
import { useRemoto } from "./useRemoto";
import { Cargando, Falla } from "@/mobile/ui/Estado";
import { totalCompra } from "@/lib/calc";
import { gs, norm, plural } from "@/lib/format";
import type { Proveedor } from "@/lib/types";
import { useApp } from "@/store/AppContext";
import { BottomNav } from "../layout/BottomNav";
import { StatusBar } from "../layout/StatusBar";
import {
  Badge,
  Card,
  ChipRow,
  EmptyState,
  FormField,
  GhostButton,
  KeyValue,
  ListHeader,
  Notice,
  ScrollBody,
  SearchInput,
  SectionLabel,
  StatTile,
  SubHeader,
} from "../ui/primitives";

const ACCENT = "#209EBB";
const HEADER = "#04617A";
const ORO = "#96731A";

export function ProveedoresScreen() {
  const { s, t, set, abrirChat } = useApp();

  const { datos, cargando, error, recargar } = useRemoto(() => repo.proveedores.list(), []);
  // Las compras dan la deuda de cada proveedor; si fallan, se muestra el
  // proveedor sin deuda antes que no mostrarlo.
  const { datos: comprasErp } = useRemoto(() => repo.compras.list(), []);
  const todos = s.vwExtra.concat(datos);
  const activos = todos.filter((p) => p.estado === "Activo").length;
  const compras = s.kExtra.concat(comprasErp);
  const pendientes = compras.filter((c) => c.estado === "Pendiente");

  const deudaDe = (id: string) =>
    pendientes.filter((c) => c.provId === id).reduce((a, c) => a + totalCompra(c), 0);
  const deudaTotal = pendientes.reduce((a, c) => a + totalCompra(c), 0);

  const vwq = norm(s.vwQuery.trim());
  const filtrados = todos.filter((p) => {
    if (s.vwFiltro === "Con deuda" && deudaDe(p.id) <= 0) return false;
    if (s.vwFiltro === "Activos" && p.estado !== "Activo") return false;
    if (s.vwFiltro === "Inactivos" && p.estado !== "Inactivo") return false;
    return norm(p.nombre + " " + p.doc + " " + p.rubro + " " + p.contacto).indexOf(vwq) >= 0;
  });

  const det = todos.find((p) => p.id === s.vwSel) ?? null;
  const detCompras = det ? compras.filter((c) => c.provId === det.id) : [];

  const chips = ["Todos", "Con deuda", "Activos", "Inactivos"].map((k) => {
    const on = s.vwFiltro === k;
    return {
      label: k,
      bg: on ? HEADER : t.card,
      fg: on ? "#ffffff" : t.ink2,
      border: on ? HEADER : t.border,
      pick: () => set({ vwFiltro: k }),
    };
  });

  const abrirNuevo = () =>
    set({
      vwSub: "nuevo",
      pfDoc: "",
      pfNombre: "",
      pfRubro: "",
      pfCiudad: "",
      pfContacto: "",
      pfTel: "",
      pfEmail: "",
      pfCredito: true,
      pfPlazo: 30,
      pfEntrega: "",
      pfSet: null,
      pfError: false,
    });

  const consultarSet = () => {
    const d = s.pfDoc.trim();
    if (!d) return;
    const base = d.replace(/[^0-9]/g, "").slice(0, 8);
    set({
      pfSet: `COMERCIAL ${base} S.A. · contribuyente activo`,
      pfNombre: s.pfNombre || `Comercial ${base.slice(0, 4)} S.A.`,
    });
  };

  const guardar = () => {
    const nombre = s.pfNombre.trim();
    if (nombre.length < 2) {
      set({ pfError: true });
      return;
    }
    const id = "pvn" + (s.vwExtra.length + 1);
    const nuevo: Proveedor = {
      id,
      nombre,
      doc: s.pfDoc.trim() ? "RUC " + s.pfDoc.trim() : "Sin RUC",
      condicion: s.pfCredito ? `Crédito ${s.pfPlazo} días` : "Contado",
      rubro: s.pfRubro.trim() || "Sin rubro",
      ciudad: s.pfCiudad.trim() || "Sin ciudad",
      contacto: s.pfContacto.trim() || nombre,
      tel: s.pfTel.trim() || "—",
      email: s.pfEmail.trim() || "—",
      estado: "Activo",
      entrega: Number(s.pfEntrega) || 1,
      chatId: null,
    };
    set({ vwExtra: [nuevo].concat(s.vwExtra), vwSub: "detalle", vwSel: id });
  };

  const topBg = s.vwSub === "lista" ? t.card : HEADER;

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
      {s.vwSub === "lista" && (
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
              titulo="Proveedores"
              resumen={`${todos.length} proveedores · ${activos} activos`}
              onBack={() => set({ screen: "home" })}
              accion={{ label: "+ Nuevo", onClick: abrirNuevo, bg: ACCENT, fg: "#023047" }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <StatTile label="Deuda total" valor={gs(deudaTotal)} valorInk={ORO} />
              <StatTile label="Por vencer" valor={plural(pendientes.length, "factura", "facturas")} />
            </div>
            <SearchInput
              value={s.vwQuery}
              onChange={(v) => set({ vwQuery: v })}
              placeholder="Proveedor, RUC o rubro"
            />
            <ChipRow chips={chips} />
          </div>

          <ScrollBody>
            {cargando && <Cargando t={t} que="proveedores" />}
            {error && <Falla t={t} mensaje={error} onReintentar={recargar} />}
            {!cargando && !error && filtrados.map((p) => {
              const deuda = deudaDe(p.id);
              const esCredito = p.condicion.indexOf("Crédito") >= 0;
              return (
                <button
                  key={p.id}
                  onClick={() => set({ vwSub: "detalle", vwSel: p.id })}
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
                    <span
                      style={{
                        width: 42,
                        height: 42,
                        flex: "0 0 auto",
                        borderRadius: 12,
                        background: "#E2F0F4",
                        color: HEADER,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        font: "700 16px/1 var(--font-barlow),Barlow,sans-serif",
                      }}
                    >
                      {p.nombre.slice(0, 1)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ font: "600 14px/1.25 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{p.nombre}</span>
                      <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                        {p.rubro} · {p.ciudad} · {p.contacto}
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
                      <span
                        style={{
                          font: "700 14px/1.1 var(--font-barlow),Barlow,sans-serif",
                          color: deuda > 0 ? ORO : "#1F5C46",
                        }}
                      >
                        {deuda > 0 ? gs(deuda) : "Al día"}
                      </span>
                      <span style={{ font: "400 10.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
                        {deuda > 0 ? "pendiente de pago" : "sin pendientes"}
                      </span>
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Badge
                      bg={p.estado === "Activo" ? "#EAF3EF" : s.theme === "oscuro" ? "#242c40" : "#EDEFF3"}
                      ink={p.estado === "Activo" ? "#1F5C46" : t.ink2}
                      dot={p.estado === "Activo" ? "#1C8C84" : t.ink3}
                    >
                      {p.estado}
                    </Badge>
                    <Badge bg={esCredito ? "#FFF3DC" : "#E2F0F4"} ink={esCredito ? "#6B4A00" : HEADER}>
                      {p.condicion}
                    </Badge>
                    <span style={{ font: "400 10px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>{p.doc}</span>
                  </span>
                </button>
              );
            })}
            {!cargando && !error && filtrados.length === 0 && (
              <EmptyState titulo="Sin proveedores" detalle="Probá con otro término o cambiá el filtro." />
            )}
          </ScrollBody>
        </>
      )}

      {/* ---------- detail ---------- */}
      {s.vwSub === "detalle" && det && (
        <>
          <div
            style={{ padding: "4px 14px 18px", display: "flex", flexDirection: "column", gap: 12, background: HEADER }}
          >
            <button
              onClick={() => set({ vwSub: "lista", vwSel: null })}
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
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  flex: "0 0 auto",
                  borderRadius: 14,
                  background: "rgba(255,255,255,.18)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "700 20px/1 var(--font-barlow),Barlow,sans-serif",
                }}
              >
                {det.nombre.slice(0, 1)}
              </div>
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ font: "700 18px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>{det.nombre}</span>
                <span style={{ font: "400 12px/1.2 var(--font-barlow),Barlow,sans-serif", color: "rgba(255,255,255,.78)" }}>
                  {det.doc} · {det.rubro}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <StatTile
                label="Saldo"
                valor={deudaDe(det.id) > 0 ? gs(deudaDe(det.id)) : "Al día"}
                onDark
              />
              <StatTile
                label="Comprado"
                valor={gs(detCompras.reduce((a, c) => a + totalCompra(c), 0))}
                onDark
              />
            </div>
          </div>

          <ScrollBody padding="14px" gap={12}>
            <Card gap={11}>
              <SectionLabel>Datos y condiciones</SectionLabel>
              <KeyValue k="Contacto" v={det.contacto} />
              <KeyValue k="Teléfono" v={det.tel} />
              <KeyValue k="Correo" v={det.email} />
              <KeyValue k="Ciudad" v={det.ciudad} />
              <KeyValue k="Condición" v={det.condicion} />
              <KeyValue k="Entrega estimada" v={plural(det.entrega, "día", "días")} />
              <KeyValue k="Estado" v={det.estado} />
            </Card>

            <Card gap={12}>
              <SectionLabel>Cuenta corriente</SectionLabel>
              {detCompras.map((c) => {
                const pagada = c.estado === "Pagada";
                return (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <span
                      style={{
                        width: 34,
                        height: 34,
                        flex: "0 0 auto",
                        borderRadius: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        font: "600 10px/1 var(--font-barlow),Barlow,sans-serif",
                        background: pagada ? "#EAF3EF" : "#FFF3DC",
                        color: pagada ? "#1F5C46" : "#6B4A00",
                      }}
                    >
                      {pagada ? "PAG" : "PEND"}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ font: "600 12.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{c.numero}</span>
                      <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                        {c.fecha} · {c.cantidad} × {c.producto}
                      </span>
                    </span>
                    <span
                      style={{
                        flex: "0 0 auto",
                        font: "700 12.5px/1.1 var(--font-barlow),Barlow,sans-serif",
                        color: pagada ? "#1F5C46" : "#6B4A00",
                      }}
                    >
                      {gs(totalCompra(c))}
                    </span>
                  </div>
                );
              })}
              {detCompras.length === 0 && (
                <span style={{ font: "400 12.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                  Todavía no hay compras registradas a este proveedor.
                </span>
              )}
            </Card>

            <button
              onClick={() =>
                set({
                  screen: "compras",
                  kSub: "nueva",
                  kPaso: "producto",
                  kProv: s.vwSel,
                  kProd: null,
                  kLineas: [],
                  kQProd: "",
                  kCant: "",
                  kCosto: "",
                  kMoneda: "PYG",
                  kIva: "10%",
                  kNroFac: "",
                  kTimbrado: "",
                  kAdjunto: false,
                })
              }
              style={{
                height: 50,
                border: 0,
                borderRadius: 13,
                background: ORO,
                color: "#fff",
                font: "600 14.5px/1 var(--font-barlow),Barlow,sans-serif",
                cursor: "pointer",
                flex: "0 0 auto",
              }}
            >
              Nueva compra a este proveedor
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              <GhostButton
                label="Conversación"
                flex={1}
                onClick={() => {
                  if (det.chatId) return abrirChat(det.chatId);
                  set({ screen: "conversaciones", xSub: "nuevo", xnQuery: "" });
                }}
              />
              <GhostButton label="Editar ficha" flex={1} onClick={() => set({ vwSub: "lista", vwSel: null })} />
            </div>
          </ScrollBody>
        </>
      )}

      {/* ---------- create ---------- */}
      {s.vwSub === "nuevo" && (
        <>
          <SubHeader titulo="Nuevo proveedor" onBack={() => set({ vwSub: "lista", vwSel: null })} bg={HEADER} />
          <ScrollBody padding="14px" gap={12}>
            <Card gap={14}>
              <SectionLabel>Identificación</SectionLabel>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>RUC</span>
                <input
                  type="text"
                  value={s.pfDoc}
                  onChange={(e) => set({ pfDoc: e.target.value, pfSet: null })}
                  placeholder="80025431-7"
                  style={{
                    height: 44,
                    borderRadius: 11,
                    padding: "0 13px",
                    fontSize: 14.5,
                    outline: "none",
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    color: t.ink,
                  }}
                />
                <button
                  onClick={consultarSet}
                  style={{
                    alignSelf: "flex-start",
                    borderRadius: 10,
                    padding: "8px 13px",
                    cursor: "pointer",
                    font: "600 12px/1 var(--font-barlow),Barlow,sans-serif",
                    background: "#E2F0F4",
                    border: "1px solid #A9CEDB",
                    color: HEADER,
                  }}
                >
                  Consultar en la SET
                </button>
              </label>

              {s.pfSet && (
                <div
                  style={{
                    borderRadius: 12,
                    background: "#E3F1EF",
                    border: "1px solid #9CCDC6",
                    padding: "11px 13px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  <span style={{ font: "600 12px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#0C5F58" }}>
                    Datos encontrados en la SET
                  </span>
                  <span style={{ font: "400 11.5px/1.35 var(--font-barlow),Barlow,sans-serif", color: "#0C5F58" }}>{s.pfSet}</span>
                </div>
              )}

              <FormField
                label="Razón social"
                required
                value={s.pfNombre}
                onChange={(v) => set({ pfNombre: v, pfError: false })}
                placeholder="Bebidas del Sur S.A."
              />
              <div style={{ display: "flex", gap: 10 }}>
                <FormField
                  label="Rubro"
                  flex={1}
                  value={s.pfRubro}
                  onChange={(v) => set({ pfRubro: v })}
                  placeholder="Bebidas"
                />
                <FormField
                  label="Ciudad"
                  flex={1}
                  value={s.pfCiudad}
                  onChange={(v) => set({ pfCiudad: v })}
                  placeholder="Asunción"
                />
              </div>
            </Card>

            <Card gap={14}>
              <SectionLabel>Contacto</SectionLabel>
              <FormField
                label="Persona de contacto"
                value={s.pfContacto}
                onChange={(v) => set({ pfContacto: v })}
                placeholder="Mario Fretes"
              />
              <div style={{ display: "flex", gap: 10 }}>
                <FormField
                  label="Teléfono"
                  type="tel"
                  flex={1}
                  value={s.pfTel}
                  onChange={(v) => set({ pfTel: v })}
                  placeholder="021 445 200"
                />
                <FormField
                  label="Correo"
                  type="email"
                  flex={1}
                  value={s.pfEmail}
                  onChange={(v) => set({ pfEmail: v })}
                  placeholder="ventas@proveedor.com"
                />
              </div>
            </Card>

            <Card gap={14}>
              <SectionLabel>Condiciones de compra</SectionLabel>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => set({ pfCredito: false })}
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
                    background: !s.pfCredito ? "#E2F0F4" : t.card,
                    color: t.ink,
                    border: `2px solid ${!s.pfCredito ? HEADER : t.border}`,
                  }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1C8C84" }} />
                  Contado
                </button>
                <button
                  onClick={() => set({ pfCredito: true })}
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
                    background: s.pfCredito ? "#FFF3DC" : t.card,
                    color: t.ink,
                    border: `2px solid ${s.pfCredito ? ORO : t.border}`,
                  }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: ORO }} />
                  Crédito
                </button>
              </div>

              {s.pfCredito && (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <span style={{ font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>Plazo habitual</span>
                  <div style={{ display: "flex", gap: 7 }}>
                    {[15, 30, 45, 60].map((p) => {
                      const on = s.pfPlazo === p;
                      return (
                        <button
                          key={p}
                          onClick={() => set({ pfPlazo: p })}
                          style={{
                            flex: 1,
                            borderRadius: 11,
                            padding: "11px 8px",
                            cursor: "pointer",
                            font: "600 12.5px/1 var(--font-barlow),Barlow,sans-serif",
                            background: on ? "#FFF3DC" : t.card,
                            color: on ? "#6B4A00" : t.ink2,
                            border: `1.5px solid ${on ? ORO : t.border}`,
                          }}
                        >
                          {p} d
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <FormField
                label="Días de entrega estimados"
                inputMode="numeric"
                value={s.pfEntrega}
                onChange={(v) => set({ pfEntrega: v.replace(/[^0-9]/g, "") })}
                placeholder="2"
              />
            </Card>

            {s.pfError && (
              <Notice bg="#FBE9E7" ink="#8C2F2B" border="#E8B4AE">
                La razón social tiene que tener al menos 2 letras.
              </Notice>
            )}
          </ScrollBody>

          <div style={{ padding: "11px 14px 13px", background: t.card, borderTop: `1px solid ${t.border}` }}>
            <button
              onClick={guardar}
              style={{
                width: "100%",
                height: 50,
                border: 0,
                borderRadius: 13,
                color: "#fff",
                font: "600 14.5px/1 var(--font-barlow),Barlow,sans-serif",
                cursor: "pointer",
                background: s.pfNombre.trim().length >= 2 ? HEADER : "#5C7A85",
              }}
            >
              Guardar proveedor
            </button>
          </div>
        </>
      )}

      {s.vwSub === "lista" && <BottomNav />}
    </div>
  );
}

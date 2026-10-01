"use client";

import { CLIENTES } from "@/lib/data";
import { gs, norm } from "@/lib/format";
import type { Cliente } from "@/lib/types";
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
  OptionRow,
  ScrollBody,
  SearchInput,
  SectionLabel,
  SubHeader,
  Toggle,
} from "../ui/primitives";

const ACCENT = "#04617A";

export function ClientesScreen() {
  const { s, t, set } = useApp();

  const todos = CLIENTES.concat(s.cExtra);
  const activos = todos.filter((c) => c.estado === "Activo").length;
  const cq = norm(s.cQuery.trim());

  const filtrados = todos.filter((c) => {
    if (s.cFiltro === "Activos" && c.estado !== "Activo") return false;
    if (s.cFiltro === "Inactivos" && c.estado !== "Inactivo") return false;
    return norm(c.nombre + " " + c.doc + " " + c.contacto + " " + c.email).indexOf(cq) >= 0;
  });

  const det = todos.find((c) => c.id === s.cSel) ?? null;
  const topBg = s.cSub === "lista" ? t.card : ACCENT;

  const chips = ["Todos", "Activos", "Inactivos"].map((k) => {
    const on = s.cFiltro === k;
    const n = k === "Todos" ? todos.length : k === "Activos" ? activos : todos.length - activos;
    return {
      label: `${k} (${n})`,
      bg: on ? ACCENT : t.card,
      fg: on ? "#ffffff" : t.ink2,
      border: on ? ACCENT : t.border,
      pick: () => set({ cFiltro: k }),
    };
  });

  const abrirNuevo = () =>
    set({
      cSub: "nuevo",
      fOrigen: "modulo",
      fDoc: "",
      fNombre: "",
      fSet: null,
      fError: false,
      fContacto: "",
      fTel: "",
      fEmail: "",
      fZona: "",
      fDireccion: "",
      fLista: "Mayorista",
      fCredito: false,
      fLimite: "",
      fPlazoCli: "30",
    });

  const cancelarNuevo = () =>
    s.fOrigen === "venta" ? set({ screen: "venta", cSub: "lista" }) : set({ cSub: "lista" });

  const consultarSet = () => {
    const d = s.fDoc.trim();
    if (!d) return;
    const digits = d.replace(/[^0-9]/g, "");
    set({
      fSet: `COMERCIAL ${digits.slice(0, 8)} S.A. · contribuyente activo`,
      fNombre: s.fNombre || `Comercial ${digits.slice(0, 4)} S.A.`,
    });
  };

  const guardar = () => {
    const nombre = s.fNombre.trim();
    if (nombre.length < 2) {
      set({ fError: true });
      return;
    }
    const doc = s.fDoc.trim();
    const nuevo: Cliente = {
      id: "n" + (s.cExtra.length + 1),
      nombre,
      // More than 9 characters reads as a RUC; shorter is a cédula.
      doc: doc ? (doc.length > 9 ? "RUC " + doc : "CI " + doc) : "Sin documento",
      contacto: s.fContacto.trim() || nombre,
      tel: s.fTel.trim() || "—",
      email: s.fEmail.trim() || "—",
      estado: "Activo",
      origen: s.fOrigen === "venta" ? "Venta" : "Manual",
      saldo: 0,
      compras: 0,
      desde: "sep 2026",
      zona: s.fZona.trim() || "Sin zona",
      direccion: s.fDireccion.trim() || "—",
      lista: s.fLista,
      credito: s.fCredito ? `Hasta ₲ ${s.fLimite || "0"} · ${s.fPlazoCli || 0} días` : "No habilitado",
    };
    const extra = s.cExtra.concat([nuevo]);
    if (s.fOrigen === "venta") {
      set({
        cExtra: extra,
        screen: "venta",
        vPaso: "cliente",
        vCliente: nuevo.id,
        vSinNombre: false,
        vQCliente: "",
        cSub: "lista",
      });
    } else {
      set({ cExtra: extra, cSub: "detalle", cSel: nuevo.id });
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
      <StatusBar
        ink={s.cSub === "lista" ? t.ink : "#fff"}
        dim={s.cSub === "lista" ? t.dim : "rgba(255,255,255,.45)"}
        bg={topBg}
      />

      {/* ---------- list ---------- */}
      {s.cSub === "lista" && (
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
              titulo="Clientes"
              resumen={`${todos.length} en total · ${activos} activos`}
              onBack={() => set({ screen: "home" })}
              accion={{ label: "+ Nuevo", onClick: abrirNuevo, bg: ACCENT, fg: "#ffffff" }}
            />
            <SearchInput
              value={s.cQuery}
              onChange={(v) => set({ cQuery: v })}
              placeholder="Nombre, RUC, contacto o correo"
            />
            <ChipRow chips={chips} />
          </div>

          <ScrollBody>
            {filtrados.map((c) => (
              <button
                key={c.id}
                onClick={() => set({ cSub: "detalle", cSel: c.id })}
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
                      color: ACCENT,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      font: "700 16px/1 var(--font-barlow),Barlow,sans-serif",
                    }}
                  >
                    {c.nombre.slice(0, 1)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ font: "600 14px/1.25 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{c.nombre}</span>
                    <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                      {c.contacto} · {c.zona}
                    </span>
                  </span>
                  <span style={{ flex: "0 0 auto", font: "400 10px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
                    {c.doc}
                  </span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Badge
                    bg={c.estado === "Activo" ? "#E3F1EF" : s.theme === "oscuro" ? "#242c40" : "#EDEFF3"}
                    ink={c.estado === "Activo" ? "#0C5F58" : t.ink2}
                    dot={c.estado === "Activo" ? "#1C8C84" : t.ink3}
                  >
                    {c.estado}
                  </Badge>
                  <Badge
                    bg={
                      c.origen === "CRM"
                        ? "#EDE8F7"
                        : c.origen === "Venta"
                          ? "#E2F0F4"
                          : s.theme === "oscuro"
                            ? "#242c40"
                            : "#EDEFF3"
                    }
                    ink={c.origen === "CRM" ? "#4B3C86" : c.origen === "Venta" ? ACCENT : t.ink2}
                  >
                    {c.origen}
                  </Badge>
                </span>
              </button>
            ))}
            {filtrados.length === 0 && (
              <EmptyState titulo="Sin clientes" detalle="Probá con otro término o cambiá el filtro." />
            )}
          </ScrollBody>
        </>
      )}

      {/* ---------- detail ---------- */}
      {s.cSub === "detalle" && det && (
        <>
          <div
            style={{
              padding: "4px 14px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              background: ACCENT,
            }}
          >
            <button
              onClick={() => set({ cSub: "lista", cSel: null })}
              style={{
                width: 32,
                height: 32,
                border: 0,
                borderRadius: 10,
                background: "rgba(255,255,255,.18)",
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
                  borderRadius: "50%",
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
                <span style={{ font: "400 12px/1.2 var(--font-barlow),Barlow,sans-serif", color: "rgba(255,255,255,.75)" }}>
                  {det.doc} · cliente desde {det.desde}
                </span>
              </div>
            </div>
          </div>

          <ScrollBody padding="14px" gap={12}>
            <div style={{ display: "flex", gap: 10 }}>
              <Card style={{ flex: 1, padding: 14 }} gap={4}>
                <SectionLabel>Saldo</SectionLabel>
                <span
                  style={{
                    font: "700 18px/1.1 var(--font-barlow),Barlow,sans-serif",
                    color: det.saldo > 0 ? "#96731A" : "#1C8C84",
                  }}
                >
                  {det.saldo > 0 ? gs(det.saldo) : "Al día"}
                </span>
                <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                  {det.saldo > 0 ? "1 factura pendiente" : "sin facturas pendientes"}
                </span>
              </Card>
              <Card style={{ flex: 1, padding: 14 }} gap={4}>
                <SectionLabel>Compras</SectionLabel>
                <span style={{ font: "700 18px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{det.compras}</span>
                <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>últimos 90 días</span>
              </Card>
            </div>

            <Card gap={12}>
              <SectionLabel>Datos</SectionLabel>
              <KeyValue k="Contacto" v={det.contacto} />
              <KeyValue k="Teléfono" v={det.tel} />
              <KeyValue k="Correo" v={det.email} />
              <KeyValue k="Zona" v={det.zona} />
              <KeyValue k="Dirección" v={det.direccion || "—"} />
              <KeyValue k="Lista de precios" v={det.lista || "Mayorista"} />
              <KeyValue k="Crédito" v={det.credito || "No habilitado"} />
              <KeyValue k="Origen" v={det.origen} />
              <KeyValue k="Estado" v={det.estado} />
            </Card>

            <button
              onClick={() => set({ screen: "venta", vPaso: "productos", vCliente: s.cSel, vSinNombre: false })}
              style={{
                height: 50,
                border: 0,
                borderRadius: 13,
                background: ACCENT,
                color: "#fff",
                font: "600 14.5px/1 var(--font-barlow),Barlow,sans-serif",
                cursor: "pointer",
                flex: "0 0 auto",
              }}
            >
              Nueva venta a este cliente
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              <GhostButton label="Editar ficha" onClick={() => set({ cSub: "lista", cSel: null })} flex={1} />
              <GhostButton label="WhatsApp" onClick={() => set({ cSub: "lista", cSel: null })} flex={1} />
            </div>
          </ScrollBody>
        </>
      )}

      {/* ---------- create ---------- */}
      {s.cSub === "nuevo" && (
        <>
          <SubHeader titulo="Nuevo cliente" onBack={cancelarNuevo} bg={ACCENT} />
          <ScrollBody padding="14px" gap={12}>
            <Card gap={14}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>RUC o cédula</span>
                <input
                  type="text"
                  value={s.fDoc}
                  onChange={(e) => set({ fDoc: e.target.value, fSet: null })}
                  placeholder="80012345-6"
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
                    color: ACCENT,
                  }}
                >
                  Consultar en la SET
                </button>
              </label>

              {s.fSet && (
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
                  <span style={{ font: "400 11.5px/1.35 var(--font-barlow),Barlow,sans-serif", color: "#0C5F58" }}>{s.fSet}</span>
                </div>
              )}

              <FormField
                label="Nombre"
                required
                value={s.fNombre}
                onChange={(v) => set({ fNombre: v, fError: false })}
                placeholder="Se completa con la SET, o escribilo"
              />
            </Card>

            {/* The quick form opened mid-sale asks for the minimum; the module form asks for everything. */}
            {s.fOrigen === "modulo" && (
              <>
                <Card gap={14}>
                  <SectionLabel>Contacto</SectionLabel>
                  <FormField
                    label="Persona de contacto"
                    value={s.fContacto}
                    onChange={(v) => set({ fContacto: v })}
                    placeholder="Lucía Benítez"
                  />
                  <div style={{ display: "flex", gap: 10 }}>
                    <FormField
                      label="Teléfono"
                      type="tel"
                      flex={1}
                      value={s.fTel}
                      onChange={(v) => set({ fTel: v })}
                      placeholder="0981 445 210"
                    />
                    <FormField
                      label="Zona"
                      flex={1}
                      value={s.fZona}
                      onChange={(v) => set({ fZona: v })}
                      placeholder="Lambaré"
                    />
                  </div>
                  <FormField
                    label="Correo"
                    type="email"
                    value={s.fEmail}
                    onChange={(v) => set({ fEmail: v })}
                    placeholder="cliente@correo.com"
                  />
                  <FormField
                    label="Dirección"
                    value={s.fDireccion}
                    onChange={(v) => set({ fDireccion: v })}
                    placeholder="Av. Mcal. López 1234"
                  />
                </Card>

                <Card gap={14}>
                  <SectionLabel>Condiciones comerciales</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    <span style={{ font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>Lista de precios</span>
                    <OptionRow
                      options={["Mayorista", "Minorista", "Especial"]}
                      activo={s.fLista}
                      onPick={(k) => set({ fLista: k })}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ font: "600 14px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Habilitar crédito</div>
                      <div style={{ font: "400 11.5px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                        Permite ventas a plazo
                      </div>
                    </div>
                    <Toggle on={s.fCredito} onToggle={() => set({ fCredito: !s.fCredito })} />
                  </div>
                  {s.fCredito && (
                    <div style={{ display: "flex", gap: 10 }}>
                      <FormField
                        label="Límite (₲)"
                        flex={1}
                        inputMode="decimal"
                        value={s.fLimite}
                        onChange={(v) => set({ fLimite: v.replace(/[^0-9.]/g, "") })}
                        placeholder="3.000.000"
                      />
                      <FormField
                        label="Plazo (días)"
                        flex={1}
                        inputMode="numeric"
                        value={s.fPlazoCli}
                        onChange={(v) => set({ fPlazoCli: v.replace(/[^0-9]/g, "") })}
                        placeholder="30"
                      />
                    </div>
                  )}
                </Card>
              </>
            )}

            <div style={{ font: "400 11.5px/1.5 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
              {s.fOrigen === "modulo"
                ? "Solo el nombre es obligatorio; el resto se puede completar después."
                : "Los demás datos se completan después desde el módulo Clientes."}
            </div>

            {s.fError && (
              <Notice bg="#FBE9E7" ink="#8C2F2B" border="#E8B4AE">
                El nombre tiene que tener al menos 2 letras.
              </Notice>
            )}

            <button
              onClick={guardar}
              style={{
                height: 50,
                border: 0,
                borderRadius: 13,
                color: "#fff",
                font: "600 14.5px/1 var(--font-barlow),Barlow,sans-serif",
                cursor: "pointer",
                background: s.fNombre.trim().length >= 2 ? ACCENT : "#5C7A85",
                flex: "0 0 auto",
              }}
            >
              {s.fOrigen === "venta" ? "Guardar y continuar" : "Guardar cliente"}
            </button>
            <button
              onClick={cancelarNuevo}
              style={{
                height: 46,
                borderRadius: 13,
                cursor: "pointer",
                font: "500 13.5px/1 var(--font-barlow),Barlow,sans-serif",
                background: t.card,
                border: `1px solid ${t.border}`,
                color: t.ink2,
                flex: "0 0 auto",
              }}
            >
              Cancelar
            </button>
          </ScrollBody>
        </>
      )}

      {s.cSub === "lista" && <BottomNav />}
    </div>
  );
}

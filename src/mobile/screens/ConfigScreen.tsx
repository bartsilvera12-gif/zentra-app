"use client";

import type { ReactNode } from "react";
import { EMPRESA, SOPORTE, VERSION } from "@/lib/data";
import { activarPush, desactivarPush, guardarPreferenciaPush, pushDisponible } from "@/lib/push";
import { repo, usaSupabase } from "@/lib/repo";
import { useApp } from "@/store/AppContext";
import { BottomNav } from "../layout/BottomNav";
import { StatusBar } from "../layout/StatusBar";
import { Card, Notice, SectionLabel, Toggle } from "../ui/primitives";

function IconSol({ stroke }: { stroke: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.7} strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7" />
    </svg>
  );
}

function IconLuna({ stroke }: { stroke: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />
    </svg>
  );
}

export function ConfigScreen() {
  const { s, t, set } = useApp();

  /** A labelled switch row. */
  const row = (titulo: string, detalle: string, on: boolean, key: keyof typeof s) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ font: "600 14.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{titulo}</div>
        <div style={{ font: "400 12px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>{detalle}</div>
      </div>
      <Toggle on={on} onToggle={() => set({ [key]: !on } as Partial<typeof s>)} label={titulo} />
    </div>
  );

  const claro = s.theme === "claro";

  // Escribir la palabra evita el borrado accidental de un toque. Es irreversible.
  const confirmado = s.borrarTexto.trim().toUpperCase() === "ELIMINAR";

  const eliminarCuenta = async () => {
    if (!confirmado || s.borrando) return;
    set({ borrando: true, borrarError: "" });
    try {
      await repo.auth.eliminarCuenta();
      set({
        borrando: false,
        borrarAbierto: false,
        borrarTexto: "",
        screen: "login",
        user: "",
        pass: "",
        sesion: null,
        modoAcceso: "login",
      });
    } catch (e) {
      set({
        borrando: false,
        borrarError:
          e instanceof Error && e.message ? e.message : "No pudimos borrar la cuenta.",
      });
    }
  };

  /**
   * El switch de avisos push no es una preferencia local: prender pide permiso al
   * sistema y guarda el token del teléfono; apagar borra ese token. Si sólo
   * cambiara el switch, el servidor seguiría mandando avisos que el teléfono
   * mostraría igual.
   */
  const cambiarPush = async () => {
    if (s.pushOcupado) return;
    const prender = !s.push;

    if (!pushDisponible()) {
      // En el navegador no hay plugin nativo. Se deja cambiar el switch para que
      // la pantalla se pueda probar, pero se avisa que no va a llegar nada.
      set({ push: prender, pushAviso: prender ? "En el navegador no llegan avisos: hace falta la app instalada." : "" });
      return;
    }

    set({ pushOcupado: true, pushAviso: "" });
    try {
      if (prender) {
        const ok = await activarPush();
        guardarPreferenciaPush(ok);
        set({
          push: ok,
          pushOcupado: false,
          // Si lo rechazaron, el sistema no vuelve a preguntar: hay que mandarlos
          // a los ajustes del teléfono.
          pushAviso: ok ? "" : "Falta el permiso de notificaciones. Se habilita en los ajustes del teléfono.",
        });
      } else {
        await desactivarPush();
        guardarPreferenciaPush(false);
        set({ push: false, pushOcupado: false, pushAviso: "" });
      }
    } catch (e) {
      guardarPreferenciaPush(false);
      set({
        push: false,
        pushOcupado: false,
        pushAviso: e instanceof Error && e.message ? e.message : "No pudimos activar los avisos.",
      });
    }
  };

  const temaBtn = (
    activo: boolean,
    label: string,
    icon: ReactNode,
    bg: string,
    border: string,
    ink: string,
    onClick: () => void,
  ) => (
    <button
      onClick={onClick}
      style={{
        borderRadius: 13,
        padding: "14px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        background: bg,
        border: `2px solid ${border}`,
        color: ink,
      }}
      aria-pressed={activo}
    >
      {icon}
      <span style={{ font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif" }}>{label}</span>
    </button>
  );

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

      <div style={{ padding: "10px 16px 14px", background: t.card, borderBottom: `1px solid ${t.border}` }}>
        <div style={{ font: "600 20px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Configuración</div>
        <div style={{ font: "400 12.5px/1.3 var(--font-barlow),Barlow,sans-serif", marginTop: 2, color: t.ink2 }}>
          Preferencias visuales y avisos
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "16px 14px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <Card gap={12}>
          <SectionLabel>Apariencia</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {temaBtn(
              claro,
              "Modo claro",
              <IconSol stroke={t.ink} />,
              claro ? "#e6f2f1" : t.card,
              claro ? "#209EBB" : t.border,
              t.ink,
              () => set({ theme: "claro" }),
            )}
            {temaBtn(
              !claro,
              "Modo oscuro",
              <IconLuna stroke={t.ink} />,
              claro ? t.card : "#1e2438",
              claro ? t.border : "#209EBB",
              t.ink,
              () => set({ theme: "oscuro" }),
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
            <div>
              <div style={{ font: "600 14.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Seguir al sistema</div>
              <div style={{ font: "400 12px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>Usar el tema del teléfono</div>
            </div>
            <Toggle on={s.auto} onToggle={() => set({ auto: !s.auto })} label="Seguir al sistema" />
          </div>
        </Card>

        <Card gap={14}>
          <SectionLabel>Notificaciones</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ font: "600 14.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Avisos push</div>
              <div style={{ font: "400 12px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                {s.pushOcupado ? "Pidiendo permiso…" : "Ventas, cobros y entregas"}
              </div>
            </div>
            <Toggle on={s.push} onToggle={cambiarPush} label="Avisos push" />
          </div>
          {s.pushAviso ? (
            <Notice bg={claro ? "#fdf1f1" : "#3a2328"} ink="#9e3b3b">
              {s.pushAviso}
            </Notice>
          ) : null}
          {row("Stock bajo", "Alertar bajo el mínimo", s.stock, "stock")}
          {row("Resumen diario", "Todos los días a las 19:00", s.resumen, "resumen")}
          {row("Sonido y vibración", "Al recibir un aviso", s.sonido, "sonido")}
        </Card>

        <Card gap={14}>
          <SectionLabel>Soporte</SectionLabel>
          {SOPORTE.map((sp) => (
            <button
              key={sp.tag}
              onClick={() => {}}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                textAlign: "left",
                border: 0,
                background: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
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
                {sp.tag}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ font: "600 14px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{sp.titulo}</span>
                <span style={{ font: "400 11.5px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>{sp.detalle}</span>
              </span>
              <span style={{ font: "600 16px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>›</span>
            </button>
          ))}
          <div
            style={{
              font: "400 11px/1.4 var(--font-barlow),Barlow,sans-serif",
              color: t.ink3,
              borderTop: `1px solid ${t.border}`,
              paddingTop: 12,
            }}
          >
            Zentra ERP · versión {VERSION.replace("v ", "")} · {s.sesion?.empresa || s.tenant?.nombre || EMPRESA}
          </div>
        </Card>

        {/* Borrar la cuenta es requisito de las dos tiendas cuando la app permite
            registrarse, y Apple lo hace cumplir. */}
        <Card gap={12}>
          <SectionLabel>Cuenta</SectionLabel>

          {!s.borrarAbierto ? (
            <button
              onClick={() => set({ borrarAbierto: true, borrarTexto: "", borrarError: "" })}
              style={{
                borderRadius: 12,
                padding: "13px 14px",
                textAlign: "left",
                cursor: "pointer",
                font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif",
                background: "transparent",
                border: `1px solid ${t.border}`,
                color: "#9e3b3b",
              }}
            >
              Eliminar mi cuenta
            </button>
          ) : (
            <>
              <Notice bg="#FBE9E7" ink="#8C2F2B" border="#E8B4AE">
                Se borran tu cuenta y todos tus datos: clientes, productos, ventas,
                compras y movimientos. <strong>No se puede deshacer.</strong>
              </Notice>

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                  Escribí ELIMINAR para confirmar
                </span>
                <input
                  type="text"
                  value={s.borrarTexto}
                  onChange={(e) => set({ borrarTexto: e.target.value, borrarError: "" })}
                  placeholder="ELIMINAR"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{
                    height: 44,
                    borderRadius: 11,
                    padding: "0 13px",
                    fontSize: 14.5,
                    outline: "none",
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    color: t.ink,
                    letterSpacing: ".08em",
                  }}
                />
              </label>

              {s.borrarError && (
                <span style={{ font: "500 12.5px/1.35 var(--font-barlow),Barlow,sans-serif", color: "#9e3b3b" }}>
                  {s.borrarError}
                </span>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => set({ borrarAbierto: false, borrarTexto: "", borrarError: "" })}
                  style={{
                    flex: 1,
                    height: 46,
                    borderRadius: 13,
                    cursor: "pointer",
                    font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif",
                    background: t.card,
                    border: `1px solid ${t.border}`,
                    color: t.ink,
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={eliminarCuenta}
                  disabled={!confirmado || s.borrando}
                  style={{
                    flex: 1,
                    height: 46,
                    border: 0,
                    borderRadius: 13,
                    cursor: confirmado && !s.borrando ? "pointer" : "default",
                    font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif",
                    background: confirmado && !s.borrando ? "#B0322F" : "#C9A8A6",
                    color: "#fff",
                  }}
                >
                  {s.borrando ? "Borrando…" : "Eliminar"}
                </button>
              </div>
            </>
          )}
        </Card>

        <button
          onClick={async () => {
            // Dar de baja el token antes de salir: si queda, el próximo que entre
            // en este teléfono recibiría los avisos de quien se fue.
            await desactivarPush().catch(() => {});
            // Cerrar la sesión en Supabase, si no el próximo arranque la reabre.
            if (usaSupabase) await repo.auth.logout().catch(() => {});
            set({ screen: "login", user: "", pass: "", sesion: null, authError: "", modoAcceso: "login" });
          }}
          style={{
            borderRadius: 14,
            padding: 15,
            cursor: "pointer",
            font: "600 14.5px/1 var(--font-barlow),Barlow,sans-serif",
            background: "none",
            color: "#9e3b3b",
            border: `1px solid ${t.border}`,
          }}
        >
          Cerrar sesión
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

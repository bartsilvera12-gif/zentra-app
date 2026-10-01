"use client";

import type { ReactNode } from "react";
import { EMPRESA, SOPORTE, VERSION } from "@/lib/data";
import { useApp } from "@/store/AppContext";
import { BottomNav } from "../layout/BottomNav";
import { StatusBar } from "../layout/StatusBar";
import { Card, SectionLabel, Toggle } from "../ui/primitives";

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
      <Toggle on={on} onToggle={() => set({ [key]: !on } as Partial<typeof s>)} />
    </div>
  );

  const claro = s.theme === "claro";

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
      <StatusBar ink={t.ink} dim={t.dim} bg={t.card} />

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
            <Toggle on={s.auto} onToggle={() => set({ auto: !s.auto })} />
          </div>
        </Card>

        <Card gap={14}>
          <SectionLabel>Notificaciones</SectionLabel>
          {row("Avisos push", "Ventas, cobros y entregas", s.push, "push")}
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
            Zentra ERP · versión {VERSION.replace("v ", "")} · {EMPRESA}
          </div>
        </Card>

        <button
          onClick={() => set({ screen: "login", user: "", pass: "" })}
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

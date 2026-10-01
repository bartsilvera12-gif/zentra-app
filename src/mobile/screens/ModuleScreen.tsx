"use client";

import { MODULES } from "@/lib/theme";
import { useApp } from "@/store/AppContext";
import { BottomNav } from "../layout/BottomNav";
import { StatusBar } from "../layout/StatusBar";

/**
 * Placeholder for a module that exists in the navigation but has no screens designed
 * yet. Every module in the prototype now has a real screen, so this is reached only
 * if a new module key is added before its flow is built.
 */
export function ModuleScreen() {
  const { s, t, set } = useApp();
  const def = (s.mod && MODULES[s.mod]) || { title: "", color: "#023047" };

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
      <StatusBar ink="#fff" dim="rgba(255,255,255,.45)" bg={def.color} />

      <div style={{ padding: "6px 14px 18px", display: "flex", alignItems: "center", gap: 12, background: def.color }}>
        <button
          onClick={() => set({ screen: "home" })}
          style={{
            width: 34,
            height: 34,
            border: 0,
            borderRadius: 10,
            background: "rgba(255,255,255,.18)",
            color: "#fff",
            font: "600 18px/1 var(--font-barlow),Barlow,sans-serif",
            cursor: "pointer",
          }}
        >
          ‹
        </button>
        <div style={{ font: "600 19px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>{def.title}</div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: "0 32px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "600 22px/1 var(--font-barlow),Barlow,sans-serif",
            background: t.card,
            color: t.ink2,
          }}
        >
          ···
        </div>
        <div style={{ font: "600 16px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Módulo {def.title}</div>
        <div style={{ font: "400 13.5px/1.5 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
          Pantalla pendiente de diseñar.
        </div>
        <button
          onClick={() => set({ screen: "home" })}
          style={{
            marginTop: 6,
            height: 44,
            padding: "0 22px",
            borderRadius: 12,
            cursor: "pointer",
            font: "600 14px/1 var(--font-barlow),Barlow,sans-serif",
            background: t.card,
            color: t.ink,
            border: `1px solid ${t.border}`,
          }}
        >
          Volver al inicio
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

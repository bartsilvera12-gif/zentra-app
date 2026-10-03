"use client";

import { useApp } from "@/store/AppContext";
import { IconConfig, IconInicio, IconReportes } from "../ui/Icons";

/** The three-up tab bar. Active colour comes from the screen the app is on. */
export function BottomNav() {
  const { s, t, set, runDash } = useApp();

  const activo = "#209EBB";
  const navInicio = s.screen === "home" ? activo : t.ink3;
  const navReportes = s.screen === "reportes" || (s.screen === "module" && s.mod === "reportes") ? activo : t.ink3;
  const navConfig = s.screen === "config" ? activo : t.ink3;

  const tab = (color: string, label: string, icon: React.ReactNode, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        border: 0,
        background: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        cursor: "pointer",
        minWidth: 64,
        color,
      }}
    >
      {icon}
      <span style={{ font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif" }}>{label}</span>
    </button>
  );

  return (
    <div
      style={{
        padding: "8px 14px 12px",
        display: "flex",
        justifyContent: "space-around",
        background: t.card,
        borderTop: `1px solid ${t.border}`,
      }}
    >
      {tab(navInicio, "Inicio", <IconInicio stroke={navInicio} />, () => {
        set({ screen: "home" });
        runDash();
      })}
      {tab(navReportes, "Reportes", <IconReportes stroke={navReportes} />, () =>
        set({ screen: "reportes" }),
      )}
      {tab(navConfig, "Configuración", <IconConfig stroke={navConfig} />, () =>
        set({ screen: "config" }),
      )}
    </div>
  );
}

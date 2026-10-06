"use client";

import { useApp } from "@/store/AppContext";
import { MARCA } from "@/lib/theme";

/**
 * El aviso de por qué algo no se puede con el plan actual.
 *
 * Aparece abajo, sobre la pantalla, y se va al tocarlo. No es un diálogo: no
 * corta lo que la persona estaba haciendo, porque no hay nada que decidir —
 * sólo hay que enterarse.
 *
 * El texto ya viene escrito desde `motivoBloqueo`, que es quien conoce el plan
 * y el límite. Acá no se arma ningún mensaje: si esta pantalla tuviera que
 * saber qué plan incluye qué, el dato viviría en dos lugares.
 */
export function AvisoPlan() {
  const { s, t, set } = useApp();
  if (!s.avisoPlan) return null;

  return (
    <button
      onClick={() => set({ avisoPlan: null })}
      style={{
        position: "absolute",
        left: 14,
        right: 14,
        bottom: "calc(18px + env(safe-area-inset-bottom, 0px))",
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        gap: 11,
        textAlign: "left",
        padding: "13px 14px",
        borderRadius: 13,
        border: `1px solid ${t.border}`,
        background: t.card,
        color: t.ink,
        cursor: "pointer",
        boxShadow: "0 8px 24px rgba(0,0,0,.18)",
        animation: "zt-fade .22s ease",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 30,
          height: 30,
          flex: "0 0 auto",
          borderRadius: "50%",
          background: MARCA.suave,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          font: "600 14px/1 var(--font-barlow),Barlow,sans-serif",
        }}
      >
        🔒
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ font: "500 13.5px/1.35 var(--font-barlow),Barlow,sans-serif" }}>{s.avisoPlan}</span>
        <span style={{ font: "400 12px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
          Tocá para cerrar
        </span>
      </span>
    </button>
  );
}

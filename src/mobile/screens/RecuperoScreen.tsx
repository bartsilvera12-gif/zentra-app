"use client";

import { useApp } from "@/store/AppContext";
import { StatusBar } from "../layout/StatusBar";
import { Field, Notice } from "../ui/primitives";

export function RecuperoScreen() {
  const { s, set } = useApp();

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#1C8C84",
        animation: "zt-fade .22s ease",
      }}
    >
      <StatusBar ink="#fff" dim="rgba(255,255,255,.45)" />

      <div style={{ padding: "4px 20px 0" }}>
        <button
          onClick={() => set({ screen: "login" })}
          style={{
            width: 36,
            height: 36,
            border: 0,
            borderRadius: 11,
            background: "rgba(255,255,255,.2)",
            color: "#fff",
            font: "600 19px/1 var(--font-barlow),Barlow,sans-serif",
            cursor: "pointer",
          }}
        >
          ‹
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "0 30px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/zentra-mark-white.png" alt="" style={{ width: 88, height: "auto", display: "block" }} />
      </div>

      <div
        style={{
          background: "#f3f5f8",
          borderRadius: "26px 26px 0 0",
          padding: "26px 24px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ font: "600 19px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#023047" }}>
          Recuperar contraseña
        </div>
        <div style={{ font: "400 13.5px/1.5 var(--font-barlow),Barlow,sans-serif", color: "#4b5563" }}>
          Ingresá el correo de tu cuenta y te enviamos un enlace para crear una nueva contraseña.
        </div>

        <Field
          label="Correo"
          type="email"
          value={s.mail}
          onChange={(v) => set({ mail: v, sent: false })}
          placeholder="vendedor@zentra.com"
        />

        {s.sent && (
          <Notice bg="#E3F1EF" ink="#0C5F58" border="#9CCDC6">
            Listo. Revisá tu correo: te enviamos el enlace de recuperación.
          </Notice>
        )}

        <button
          onClick={() => set({ sent: true })}
          style={{
            height: 52,
            border: 0,
            borderRadius: 14,
            background: "#023047",
            color: "#fff",
            font: "600 16px/1 var(--font-barlow),Barlow,sans-serif",
            letterSpacing: ".04em",
            cursor: "pointer",
          }}
        >
          Enviar enlace
        </button>
        <button
          onClick={() => set({ screen: "login" })}
          style={{
            border: 0,
            background: "none",
            cursor: "pointer",
            font: "500 13px/1 var(--font-barlow),Barlow,sans-serif",
            color: "#04617A",
            textDecoration: "underline",
          }}
        >
          Volver al inicio de sesión
        </button>
      </div>
    </div>
  );
}

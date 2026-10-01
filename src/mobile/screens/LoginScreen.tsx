"use client";

import { VERSION } from "@/lib/data";
import { useApp } from "@/store/AppContext";
import { StatusBar } from "../layout/StatusBar";
import { Field } from "../ui/primitives";

export function LoginScreen() {
  const { s, set, runDash } = useApp();

  const entrar = () => {
    if (!s.user.trim() || !s.pass.trim()) {
      set({ error: true });
      return;
    }
    set({ screen: "home", error: false });
    runDash();
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#1C8C84" }}>
      <StatusBar ink="#fff" dim="rgba(255,255,255,.45)" />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 14,
          padding: "0 30px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/zentra-mark-white.png"
          alt=""
          style={{
            width: 132,
            height: "auto",
            display: "block",
            animation: "zt-bolt .85s cubic-bezier(.22,1.2,.36,1) both",
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/zentra-wordmark-white.png"
          alt="Zentra"
          style={{
            width: 212,
            height: "auto",
            display: "block",
            marginTop: 2,
            animation: "zt-word .7s cubic-bezier(.22,1,.36,1) .42s both",
          }}
        />
      </div>

      <div
        style={{
          background: "#f3f5f8",
          borderRadius: "26px 26px 0 0",
          padding: "26px 24px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ font: "600 17px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#023047" }}>Iniciar sesión</div>

        <Field
          label="Usuario"
          value={s.user}
          onChange={(v) => set({ user: v, error: false })}
          placeholder="vendedor@zentra"
        />
        <Field
          label="Contraseña"
          type="password"
          value={s.pass}
          onChange={(v) => set({ pass: v, error: false })}
          placeholder="••••••••"
        />

        {s.error && (
          <div style={{ font: "500 12.5px/1.3 var(--font-barlow),Barlow,sans-serif", color: "#9e3b3b" }}>
            Ingresá usuario y contraseña para continuar.
          </div>
        )}

        <button
          onClick={entrar}
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
          Entrar
        </button>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={() => set({ screen: "recupero", sent: false })}
            style={{
              border: 0,
              background: "none",
              padding: 0,
              cursor: "pointer",
              font: "500 13px/1 var(--font-barlow),Barlow,sans-serif",
              color: "#04617A",
              textDecoration: "underline",
            }}
          >
            ¿Olvidé mi contraseña?
          </button>
          <span style={{ font: "500 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: "#65707f" }}>{VERSION}</span>
        </div>
      </div>
    </div>
  );
}

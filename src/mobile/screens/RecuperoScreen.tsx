"use client";

import { useState } from "react";
import { repo } from "@/lib/repo";
import { MARCA } from "@/lib/theme";
import { useApp } from "@/store/AppContext";
import { StatusBar } from "../layout/StatusBar";
import { Field, Notice } from "../ui/primitives";

export function RecuperoScreen() {
  const { s, t, set } = useApp();
  const oscuro = s.theme === "oscuro";
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  /**
   * Mandar el enlace de verdad.
   *
   * Antes el botón sólo ponía `sent: true`: la pantalla decía "te enviamos el
   * enlace" y no se mandaba nada. Quien olvidó la contraseña se quedaba
   * esperando un correo que nunca iba a llegar, que es peor que un error.
   */
  const enviar = async () => {
    const correo = s.mail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) {
      setError("Revisá el correo: parece que falta algo.");
      return;
    }
    setError("");
    setEnviando(true);
    try {
      await repo.auth.recuperarPassword(correo);
      set({ sent: true });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No pudimos mandar el enlace. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

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
      <StatusBar />

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
          // Del tema, como el login y el registro. Fijo en claro, en modo
          // oscuro quedaba el panel blanco con el campo negro encima —el
          // campo sí sigue al tema— y la pantalla se veía partida al medio.
          background: oscuro ? t.bg : "#f3f5f8",
          borderRadius: "26px 26px 0 0",
          padding: "26px 24px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ font: "600 19px/1.2 var(--font-barlow),Barlow,sans-serif", color: oscuro ? t.ink : "#023047" }}>
          Recuperar contraseña
        </div>
        <div style={{ font: "400 13.5px/1.5 var(--font-barlow),Barlow,sans-serif", color: oscuro ? t.ink2 : "#4b5563" }}>
          Ingresá el correo de tu cuenta y te enviamos un enlace para crear una nueva contraseña.
        </div>

        <Field
          label="Correo"
          type="email"
          inputMode="email"
          value={s.mail}
          onChange={(v) => {
            set({ mail: v, sent: false });
            setError("");
          }}
          placeholder="vos@correo.com"
        />

        {error && (
          <div style={{ font: "500 12.5px/1.35 var(--font-barlow),Barlow,sans-serif", color: oscuro ? "#F2A9A4" : "#9e3b3b" }}>
            {error}
          </div>
        )}

        {s.sent && (
          <Notice bg="#E3F1EF" ink="#0C5F58" border="#9CCDC6">
            Listo. Si ese correo tiene una cuenta, te llega el enlace en unos minutos. Mirá también en
            correo no deseado.
          </Notice>
        )}

        <button
          onClick={() => void enviar()}
          disabled={enviando}
          style={{
            height: 52,
            border: 0,
            borderRadius: 14,
            background: enviando ? "#5C7A85" : oscuro ? MARCA.headerSuave : "#023047",
            color: "#fff",
            font: "600 16px/1 var(--font-barlow),Barlow,sans-serif",
            letterSpacing: ".04em",
            cursor: enviando ? "default" : "pointer",
          }}
        >
          {enviando ? "Enviando…" : s.sent ? "Mandar de nuevo" : "Enviar enlace"}
        </button>
        <button
          onClick={() => set({ screen: "login" })}
          style={{
            border: 0,
            background: "none",
            cursor: "pointer",
            font: "500 13px/1 var(--font-barlow),Barlow,sans-serif",
            color: oscuro ? MARCA.sobreSuave : "#04617A",
            textDecoration: "underline",
          }}
        >
          Volver al inicio de sesión
        </button>
      </div>
    </div>
  );
}

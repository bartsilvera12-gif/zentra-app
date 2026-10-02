"use client";

import { useApp } from "@/store/AppContext";
import { StatusBar } from "../layout/StatusBar";
import { Field, Notice } from "../ui/primitives";

/**
 * Alta de cuenta en la instalación pública. Al crearla, un disparador de la base
 * le arma la empresa y el perfil, así entra con todo listo aunque arranque vacío.
 */
export function RegistroScreen({ onCrear }: { onCrear: () => void }) {
  const { s, set } = useApp();
  const ocupado = s.tenantResolviendo || s.entrando;

  const volver = () => set({ modoAcceso: "login", authError: "", regConfirmar: false });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#1C8C84" }}>
      <StatusBar ink="#fff" dim="rgba(255,255,255,.45)" />

      <div style={{ padding: "4px 20px 0" }}>
        <button
          onClick={volver}
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
        <img src="/assets/zentra-mark-white.png" alt="" style={{ width: 80, height: "auto", display: "block" }} />
      </div>

      <div
        style={{
          background: "#f3f5f8",
          borderRadius: "26px 26px 0 0",
          padding: "24px 24px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 13,
          maxHeight: "72%",
          overflowY: "auto",
        }}
      >
        {s.regConfirmar ? (
          <>
            <div style={{ font: "600 17px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#023047" }}>
              Revisá tu correo
            </div>
            <Notice bg="#E3F1EF" ink="#0C5F58" border="#9CCDC6">
              Te mandamos un enlace a <strong>{s.regMail}</strong>. Tocalo para confirmar tu cuenta y
              después volvé a entrar.
            </Notice>
            <button
              onClick={volver}
              style={{
                height: 50,
                border: 0,
                borderRadius: 14,
                background: "#023047",
                color: "#fff",
                font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
                cursor: "pointer",
              }}
            >
              Ir a iniciar sesión
            </button>
          </>
        ) : (
          <>
            <div style={{ font: "600 17px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#023047" }}>
              Crear una cuenta
            </div>
            <div style={{ font: "400 12.5px/1.45 var(--font-barlow),Barlow,sans-serif", color: "#4b5563" }}>
              Vas a arrancar con todo en blanco: cargás tus productos y tus clientes, y empezás a
              vender.
            </div>

            <Field
              label="Tu nombre"
              value={s.regNombre}
              onChange={(v) => set({ regNombre: v, authError: "" })}
              placeholder="Ulises Gómez"
            />
            <Field
              label="Nombre del negocio"
              value={s.regEmpresa}
              onChange={(v) => set({ regEmpresa: v, authError: "" })}
              placeholder="Despensa Doña Lucía"
            />
            <Field
              label="Correo"
              type="email"
              inputMode="email"
              value={s.regMail}
              onChange={(v) => set({ regMail: v, authError: "" })}
              placeholder="vos@correo.com"
            />
            <Field
              label="Contraseña"
              type="password"
              value={s.regPass}
              onChange={(v) => set({ regPass: v, authError: "" })}
              placeholder="Al menos 6 caracteres"
            />

            {s.authError && (
              <div style={{ font: "500 12.5px/1.35 var(--font-barlow),Barlow,sans-serif", color: "#9e3b3b" }}>
                {s.authError}
              </div>
            )}

            <button
              onClick={onCrear}
              disabled={ocupado}
              style={{
                height: 52,
                border: 0,
                borderRadius: 14,
                background: ocupado ? "#5C7A85" : "#023047",
                color: "#fff",
                font: "600 16px/1 var(--font-barlow),Barlow,sans-serif",
                letterSpacing: ".04em",
                cursor: ocupado ? "default" : "pointer",
              }}
            >
              {ocupado ? "Creando…" : "Crear cuenta"}
            </button>

            <button
              onClick={volver}
              style={{
                border: 0,
                background: "none",
                cursor: "pointer",
                font: "500 13px/1 var(--font-barlow),Barlow,sans-serif",
                color: "#04617A",
                textDecoration: "underline",
              }}
            >
              Ya tengo cuenta
            </button>
          </>
        )}
      </div>
    </div>
  );
}

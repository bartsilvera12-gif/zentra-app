"use client";

import { useCallback, useEffect, useState } from "react";
import { linkWhatsapp } from "@/lib/config";
import { VERSION } from "@/lib/data";
import { pushPreferido, reanudarPush } from "@/lib/push";
import { registrar, repo, usaSupabase } from "@/lib/repo";
import { useApp } from "@/store/AppContext";
import { StatusBar } from "../layout/StatusBar";
import { Field } from "../ui/primitives";
import { RegistroScreen } from "./RegistroScreen";

export function LoginScreen() {
  const { s, set, elegirInstalacion } = useApp();

  /*
   * La animación del logo se dispara cuando hay algo que mirar, no al montar.
   *
   * Al montar no sirve: las dos imágenes todavía no cargaron y el celular puede
   * no haber pintado nada —en el APK hay una pantalla de arranque del sistema
   * por delante—. La animación corría igual, y para cuando aparecía la pantalla
   * ya había terminado. Se veía el logo quieto, como si no hubiera animación.
   *
   * Por eso espera a que las dos imágenes estén cargadas y a que la pantalla
   * esté visible. Si la app arranca en segundo plano, espera a que vuelva.
   */
  const [cargadas, setCargadas] = useState(0);
  const [visible, setVisible] = useState(true);
  const logoCargado = useCallback(() => setCargadas((n) => n + 1), []);

  /*
   * `onLoad` por sí solo no alcanza, y es el detalle que hace que esto funcione:
   * la página se sirve como HTML estático, así que las dos imágenes pueden estar
   * cargadas antes de que React se enganche. En ese caso el evento ya pasó y el
   * `onLoad` no llega nunca — la animación no arrancaría jamás. Por eso al
   * montar se pregunta directamente si la imagen ya está.
   */
  const alMontar = useCallback(
    (el: HTMLImageElement | null) => {
      if (el && el.complete && el.naturalWidth > 0) logoCargado();
    },
    [logoCargado],
  );

  const listo = cargadas >= 2;
  const animar = listo && visible;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const mirar = () => setVisible(document.visibilityState === "visible");
    mirar();
    document.addEventListener("visibilitychange", mirar);
    return () => document.removeEventListener("visibilitychange", mirar);
  }, []);


  /** Mensaje legible de cualquier error de autenticación. */
  const motivo = (e: unknown) =>
    e instanceof Error && e.message ? e.message : "No pudimos conectar. Probá de nuevo.";

  const entrar = async () => {
    if (!s.user.trim() || !s.pass.trim()) {
      set({ error: true });
      return;
    }
    // Primero resolvemos a qué instalación entra; sin eso no sabemos contra qué
    // validar las credenciales. Código vacío = instalación pública.
    const ok = await elegirInstalacion(s.tieneErp ? s.codigoEmpresa : "");
    if (!ok) return;

    if (!usaSupabase) {
      set({ screen: "home", error: false });
      return;
    }

    set({ entrando: true, authError: "" });
    try {
      const sesion = await repo.auth.login(s.user, s.pass);
      set({ screen: "home", error: false, entrando: false, sesion: sesion.usuario, pass: "" });
      // El token de Firebase está atado al usuario de la sesión y cambia al
      // reinstalar la app, así que se vuelve a guardar en cada entrada. Va sin
      // `await`: que los avisos tarden no tiene que demorar el inicio.
      if (pushPreferido()) {
        set({ push: true });
        void reanudarPush().then((ok) => set({ push: ok }));
      }
    } catch (e) {
      set({ entrando: false, authError: motivo(e) });
    }
  };

  const crearCuenta = async () => {
    if (!s.regMail.trim() || !s.regPass.trim() || s.regNombre.trim().length < 2) {
      set({ authError: "Completá tu nombre, correo y contraseña." });
      return;
    }
    // El registro siempre va a la instalación pública: en la de un cliente con
    // ERP los usuarios los da de alta el dueño.
    const ok = await elegirInstalacion("");
    if (!ok) return;

    set({ entrando: true, authError: "" });
    try {
      const { necesitaConfirmar } = await registrar(
        s.regMail,
        s.regPass,
        s.regNombre,
        s.regEmpresa || s.regNombre,
      );
      if (necesitaConfirmar) {
        set({ entrando: false, regConfirmar: true, authError: "" });
        return;
      }
      const sesion = await repo.auth.login(s.regMail, s.regPass);
      set({
        screen: "home",
        entrando: false,
        sesion: sesion.usuario,
        regPass: "",
        authError: "",
      });
    } catch (e) {
      set({ entrando: false, authError: motivo(e) });
    }
  };

  const tenantNombre = s.tenant && !s.tenant.publico ? s.tenant.nombre : null;
  const ocupado = s.tenantResolviendo || s.entrando;
  const waSoporte = linkWhatsapp(
    "Hola, necesito el código de empresa para entrar a la app de Zentra.",
  );

  if (s.modoAcceso === "registro") return <RegistroScreen onCrear={crearCuenta} />;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#1C8C84" }}>
      <StatusBar />

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
          ref={alMontar}
          onLoad={logoCargado}
          onError={logoCargado}
          style={{
            width: 132,
            height: "auto",
            display: "block",
            // `both` deja la imagen invisible antes de arrancar, así que mientras
            // no se anime hay que dejarla a la vista: si no, un dispositivo con
            // las animaciones apagadas no mostraría nunca el logo.
            ...(animar
              ? { animation: "zt-bolt .85s cubic-bezier(.22,1.2,.36,1) both" }
              : { opacity: listo ? 1 : 0 }),
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/zentra-wordmark-white.png"
          alt="Zentra"
          ref={alMontar}
          onLoad={logoCargado}
          onError={logoCargado}
          style={{
            width: 212,
            height: "auto",
            display: "block",
            marginTop: 2,
            ...(animar
              ? { animation: "zt-word .7s cubic-bezier(.22,1,.36,1) .42s both" }
              : { opacity: listo ? 1 : 0 }),
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

        {/*
          El código de empresa es para los pocos que ya tienen un ERP con
          nosotros. Preguntarlo de entrada —con un "¿Tu empresa ya tiene un ERP
          con nosotros?" y dos botones Sí/No— le ponía el caso raro adelante a
          todo el mundo y llenaba la pantalla.

          Ahora es un enlace chico: quien no lo necesita ni lo lee, y quien sí lo
          necesita lo encuentra. El campo aparece sólo al tocarlo.
        */}
        {!s.tieneErp ? (
          <button
            onClick={() => set({ tieneErp: true, tenantError: "", tenant: null })}
            style={{
              alignSelf: "flex-start",
              border: 0,
              background: "none",
              padding: 0,
              cursor: "pointer",
              font: "500 12.5px/1.3 var(--font-barlow),Barlow,sans-serif",
              color: "#04617A",
              textDecoration: "underline",
            }}
          >
            Mi empresa ya tiene un ERP con nosotros
          </button>
        ) : (
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 8,
                font: "600 11px/1 var(--font-barlow),Barlow,sans-serif",
                letterSpacing: ".12em",
                textTransform: "uppercase",
                color: "#65707f",
              }}
            >
              Código de empresa
              {/* Salida: sin esto, quien lo abre por curiosidad queda obligado a
                  completarlo o a reiniciar la app. */}
              <button
                onClick={() => set({ tieneErp: false, codigoEmpresa: "", tenantError: "", tenant: null })}
                style={{
                  border: 0,
                  background: "none",
                  padding: 0,
                  cursor: "pointer",
                  font: "500 11px/1 var(--font-barlow),Barlow,sans-serif",
                  letterSpacing: "normal",
                  textTransform: "none",
                  color: "#04617A",
                  textDecoration: "underline",
                }}
              >
                No tengo
              </button>
            </span>
            <input
              type="text"
              value={s.codigoEmpresa}
              onChange={(e) =>
                set({ codigoEmpresa: e.target.value.toUpperCase(), tenantError: "", tenant: null })
              }
              placeholder="El que te dimos, ej. JM"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              style={{
                height: 46,
                border: "1px solid #d6dbe3",
                borderRadius: 12,
                background: "#fff",
                padding: "0 14px",
                fontSize: 15,
                color: "#141a2e",
                outline: "none",
                letterSpacing: ".06em",
              }}
            />
            {waSoporte && (
              <span style={{ font: "400 11.5px/1.35 var(--font-barlow),Barlow,sans-serif", color: "#65707f" }}>
                ¿No tenés tu código?{" "}
                {/* target/rel para que en el WebView del APK lo tome WhatsApp y no
                    se abra dentro de la propia app. */}
                <a
                  href={waSoporte}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#04617A", fontWeight: 600, textDecoration: "underline" }}
                >
                  Escribinos por WhatsApp
                </a>
              </span>
            )}
            {tenantNombre && (
              <span style={{ font: "500 12px/1.3 var(--font-barlow),Barlow,sans-serif", color: "#0C5F58" }}>
                Vas a entrar a {tenantNombre}.
              </span>
            )}
          </label>
        )}

        {(s.tenantError || s.authError) && (
          <div style={{ font: "500 12.5px/1.35 Barlow,sans-serif", color: "#9e3b3b" }}>
            {s.tenantError || s.authError}
          </div>
        )}

        {s.error && (
          <div style={{ font: "500 12.5px/1.3 var(--font-barlow),Barlow,sans-serif", color: "#9e3b3b" }}>
            Ingresá usuario y contraseña para continuar.
          </div>
        )}

        <button
          onClick={entrar}
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
          {s.tenantResolviendo ? "Conectando…" : s.entrando ? "Entrando…" : "Entrar"}
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

        {/* Crear cuenta sólo tiene sentido en la instalación pública: en la de un
            cliente con ERP los usuarios los da de alta el dueño. */}
        {usaSupabase && !s.tieneErp && (
          <button
            onClick={() => set({ modoAcceso: "registro", authError: "", regConfirmar: false })}
            style={{
              height: 46,
              borderRadius: 13,
              cursor: "pointer",
              font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif",
              background: "transparent",
              border: "1.5px solid #04617A",
              color: "#04617A",
            }}
          >
            Crear una cuenta
          </button>
        )}
      </div>
    </div>
  );
}

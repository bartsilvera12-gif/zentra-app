"use client";

import { useState, type ReactNode } from "react";
import { MARCA } from "@/lib/theme";
import { useApp } from "@/store/AppContext";
import { StatusBar } from "../layout/StatusBar";
import {
  COMO_CONOCIO,
  PASOS_REGISTRO,
  RUBROS,
  TAMANOS,
  pasoConFalta,
  validarPaso,
  type DatosRegistro,
} from "@/lib/registro";
import { Field, Notice } from "../ui/primitives";

/** Lo que dice arriba en cada paso. Corto: es un título, no instrucciones. */
const TEXTOS = {
  cuenta: { titulo: "Creá tu cuenta", bajada: "Con esto vas a entrar a la app." },
  negocio: { titulo: "Contanos de tu negocio", bajada: "Así te mostramos lo que más te sirve." },
  vos: { titulo: "Un último detalle", bajada: "Y listo, empezás a vender." },
} as const;

/**
 * Alta de cuenta en la instalación pública. Al crearla, un disparador de la base
 * le arma la empresa y el perfil, así entra con todo listo aunque arranque vacío.
 *
 * En tres pasos y no en una sola pantalla. Con nueve campos seguidos el alta
 * se leía como un formulario de banco, y con el teclado abierto quedaban dos a
 * la vista. De a tres o cuatro por paso, cada pantalla entra entera, y lo que
 * es elegir —rubro, tamaño, cómo nos conoció— se elige tocando, sin abrir una
 * lista: es un toque en vez de tres.
 */
export function RegistroScreen({ onCrear }: { onCrear: () => void }) {
  const { s, t, set } = useApp();
  const oscuro = s.theme === "oscuro";
  const ocupado = s.tenantResolviendo || s.entrando;
  const [paso, setPaso] = useState(0);
  const actual = PASOS_REGISTRO[paso];
  const ultimo = paso === PASOS_REGISTRO.length - 1;

  const datos: DatosRegistro = {
    nombre: s.regNombre,
    empresa: s.regEmpresa,
    correo: s.regMail,
    password: s.regPass,
    password2: s.regPass2,
    nacimiento: s.regNacimiento,
    comoConocio: s.regComoConocio,
    tamano: s.regTamano,
    rubro: s.regRubro,
  };

  const alLogin = () => set({ modoAcceso: "login", authError: "", regConfirmar: false });
  const atras = () => {
    set({ authError: "" });
    if (paso === 0) alLogin();
    else setPaso(paso - 1);
  };

  const seguir = () => {
    // Se valida el paso antes de avanzar: descubrir en el tercer paso que el
    // correo del primero estaba mal obliga a volver dos pantallas.
    const falta = validarPaso(actual, datos);
    if (falta) return set({ authError: falta });
    set({ authError: "" });
    if (!ultimo) return setPaso(paso + 1);
    // Por las dudas, todo junto antes de mandar. Si algo de un paso anterior
    // quedó mal, se vuelve a ese paso: el error mostrado en uno que no lo
    // tiene deja a la persona buscando.
    const conFalta = pasoConFalta(datos);
    if (conFalta) {
      setPaso(PASOS_REGISTRO.indexOf(conFalta));
      return set({ authError: validarPaso(conFalta, datos) ?? "" });
    }
    onCrear();
  };

  const contrasenasIguales = s.regPass.length >= 6 && s.regPass2.length > 0 && s.regPass === s.regPass2;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: oscuro ? t.bg : "#f3f5f8" }}>
      {/* El encabezado: chico. El de antes era media pantalla verde vacía con
          el logo en el medio, y le quitaba lugar a lo único que importa acá. */}
      <div
        style={{
          background: `linear-gradient(160deg, ${MARCA.acento} 0%, #156F69 100%)`,
          padding: "0 22px 26px",
          borderRadius: "0 0 26px 26px",
          flex: "0 0 auto",
        }}
      >
        <StatusBar />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
          <button
            onClick={atras}
            aria-label={paso === 0 ? "Volver al inicio de sesión" : "Paso anterior"}
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/zentra-mark-white.png" alt="Zentra" style={{ width: 34, height: "auto", display: "block" }} />
          <span style={{ width: 36 }} />
        </div>

        {!s.regConfirmar && (
          <>
            <div style={{ display: "flex", gap: 6, marginTop: 22 }}>
              {PASOS_REGISTRO.map((p, i) => (
                <span
                  key={p}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 999,
                    background: i <= paso ? "#fff" : "rgba(255,255,255,.28)",
                    transition: "background .25s ease",
                  }}
                />
              ))}
            </div>
            <div
              style={{
                marginTop: 14,
                font: "600 11px/1 var(--font-barlow),Barlow,sans-serif",
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,.75)",
              }}
            >
              Paso {paso + 1} de {PASOS_REGISTRO.length}
            </div>
            <div style={{ marginTop: 6, font: "700 24px/1.15 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>
              {TEXTOS[actual].titulo}
            </div>
            <div style={{ marginTop: 5, font: "400 13.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: "rgba(255,255,255,.85)" }}>
              {TEXTOS[actual].bajada}
            </div>
          </>
        )}
      </div>

      <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "22px 22px 8px" }}>
        {s.regConfirmar ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ font: "700 22px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>Revisá tu correo</div>
            <Notice bg="#E3F1EF" ink="#0C5F58" border="#9CCDC6">
              Te mandamos un enlace a <strong>{s.regMail}</strong>. Tocalo para confirmar tu cuenta y
              después volvé a entrar.
            </Notice>
          </div>
        ) : (
          // `key` hace que cada paso entre con su animación, y no sólo el primero.
          <div key={actual} style={{ display: "flex", flexDirection: "column", gap: 16, animation: "zt-fade .22s ease" }}>
            {actual === "cuenta" && (
              <>
                <Field
                  label="Nombre y apellido"
                  value={s.regNombre}
                  onChange={(v) => set({ regNombre: v, authError: "" })}
                  placeholder="Ulises Gómez"
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
                {/* Escribirla dos veces: mal tipeada acá no se nota hasta el
                    día siguiente, con la cuenta ya creada. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <Field
                    label="Repetí la contraseña"
                    type="password"
                    value={s.regPass2}
                    onChange={(v) => set({ regPass2: v, authError: "" })}
                    placeholder="La misma de arriba"
                  />
                  {/* Avisar que coinciden mientras se escribe, y no que no
                      coinciden: a mitad de tipear siempre son distintas. */}
                  {contrasenasIguales && (
                    <span style={{ font: "600 12px/1 var(--font-barlow),Barlow,sans-serif", color: oscuro ? "#7FD4C1" : "#0C7A6E" }}>
                      ✓ Coinciden
                    </span>
                  )}
                </div>
              </>
            )}

            {actual === "negocio" && (
              <>
                <Field
                  label="Nombre del negocio"
                  value={s.regEmpresa}
                  onChange={(v) => set({ regEmpresa: v, authError: "" })}
                  placeholder="Opcional · ej. Despensa Doña Lucía"
                />
                <Grupo titulo="¿A qué se dedica?">
                  <Opciones opciones={RUBROS} valor={s.regRubro} elegir={(v) => set({ regRubro: v, authError: "" })} />
                </Grupo>
                <Grupo titulo="¿Cuántas personas trabajan con vos?">
                  <Opciones opciones={TAMANOS} valor={s.regTamano} elegir={(v) => set({ regTamano: v, authError: "" })} />
                </Grupo>
              </>
            )}

            {actual === "vos" && (
              <>
                {/* El campo de fecha del sistema y no tres cajitas: abre el
                    calendario del teléfono, y no hay forma de escribir 31 de
                    febrero. */}
                <Field
                  label="Fecha de nacimiento"
                  type="date"
                  value={s.regNacimiento}
                  onChange={(v) => set({ regNacimiento: v, authError: "" })}
                />
                <Grupo titulo="¿Cómo conociste Zentra?">
                  <Opciones
                    opciones={COMO_CONOCIO}
                    valor={s.regComoConocio}
                    elegir={(v) => set({ regComoConocio: v, authError: "" })}
                  />
                </Grupo>
              </>
            )}
          </div>
        )}
      </div>

      {/* Abajo y fijo: el botón no se va con el scroll. Con el de antes al
          final del formulario, había que bajar para descubrir que existía. */}
      <div
        style={{
          flex: "0 0 auto",
          padding: "12px 22px calc(16px + env(safe-area-inset-bottom, 0px))",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          borderTop: `1px solid ${t.border}`,
          background: oscuro ? t.bg : "#f3f5f8",
        }}
      >
        {s.authError && !s.regConfirmar && (
          <div
            role="alert"
            style={{
              font: "500 13px/1.35 var(--font-barlow),Barlow,sans-serif",
              color: oscuro ? "#F2A9A4" : "#9e3b3b",
              textAlign: "center",
            }}
          >
            {s.authError}
          </div>
        )}
        <button
          onClick={s.regConfirmar ? alLogin : seguir}
          disabled={ocupado}
          style={{
            height: 52,
            border: 0,
            borderRadius: 14,
            background: ocupado ? "#5C7A85" : oscuro ? MARCA.headerSuave : MARCA.header,
            color: "#fff",
            font: "600 16px/1 var(--font-barlow),Barlow,sans-serif",
            letterSpacing: ".03em",
            cursor: ocupado ? "default" : "pointer",
          }}
        >
          {s.regConfirmar ? "Ir a iniciar sesión" : ocupado ? "Creando tu cuenta…" : ultimo ? "Crear cuenta" : "Seguir"}
        </button>
        {paso === 0 && !s.regConfirmar && (
          <button
            onClick={alLogin}
            style={{
              border: 0,
              background: "none",
              cursor: "pointer",
              padding: 2,
              font: "500 13.5px/1 var(--font-barlow),Barlow,sans-serif",
              color: oscuro ? MARCA.sobreSuave : MARCA.headerSuave,
            }}
          >
            ¿Ya tenés cuenta? <span style={{ fontWeight: 700, textDecoration: "underline" }}>Entrá</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** Un título chico arriba de un grupo de opciones, con la cara de las etiquetas de `Field`. */
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  const { t } = useApp();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <span
        style={{
          font: "600 11px/1 var(--font-barlow),Barlow,sans-serif",
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: t.ink2,
        }}
      >
        {titulo}
      </span>
      {children}
    </div>
  );
}

/**
 * Opciones para tocar, en vez de una lista desplegable.
 *
 * Con la lista había que tocar, buscar y volver a tocar, y mientras tanto no
 * se veía qué opciones había: "Elegí el rubro" no dice nada. Así se ven todas
 * de una, y la elegida queda marcada con el verde de la marca.
 */
function Opciones({
  opciones,
  valor,
  elegir,
}: {
  opciones: readonly string[];
  valor: string;
  elegir: (v: string) => void;
}) {
  const { s, t } = useApp();
  const oscuro = s.theme === "oscuro";
  return (
    <div role="radiogroup" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {opciones.map((o) => {
        const elegida = o === valor;
        return (
          <button
            key={o}
            role="radio"
            aria-checked={elegida}
            onClick={() => elegir(o)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              minHeight: 40,
              padding: "0 14px",
              borderRadius: 999,
              border: `1.5px solid ${elegida ? MARCA.acento : t.border}`,
              background: elegida ? MARCA.acento : oscuro ? t.card : "#fff",
              color: elegida ? "#fff" : t.ink,
              font: `${elegida ? 600 : 500} 14px/1.2 var(--font-barlow),Barlow,sans-serif`,
              cursor: "pointer",
              transition: "background .15s ease, border-color .15s ease, color .15s ease",
            }}
          >
            {elegida && <span aria-hidden>✓</span>}
            {o}
          </button>
        );
      })}
    </div>
  );
}

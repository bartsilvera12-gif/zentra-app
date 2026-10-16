"use client";

import { useEffect, useState } from "react";
import { config } from "@/lib/config";
import { gs } from "@/lib/format";
import { ORDEN_PLANES, PLANES, type Plan } from "@/lib/planes";
import { preciosDePlanes, type PreciosDePlan } from "@/lib/precios-planes";
import { MARCA } from "@/lib/theme";
import { useApp } from "@/store/AppContext";

/**
 * Lo que aparece al tocar algo que el plan no incluye.
 *
 * Era un cartelito abajo que decía "Tu plan no incluye esto · Tocá para
 * cerrar". Decía la verdad y no servía de nada: quien lo leía se quedaba sin
 * saber qué plan sí lo incluye, cuánto sale ni dónde se paga. Un "no" sin
 * salida.
 *
 * Ahora es una hoja con los tres planes, el que se tiene marcado, y el botón
 * para pagar. El precio se lee de la base —el mismo que cobra el server— y si
 * no se puede leer, se muestran los planes sin precio: mejor eso que un número
 * inventado.
 *
 * El botón de pagar se apaga en la compilación que va a Google Play, igual que
 * en Configuración: esa tienda no permite mandar a pagar afuera. Apagado queda
 * la dirección escrita, que es informar.
 */
export function AvisoPlan() {
  const { s, t, set, plan } = useApp();
  const [precios, setPrecios] = useState<PreciosDePlan>({});
  const abierto = !!s.avisoPlan;

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    void preciosDePlanes().then((p) => vivo && setPrecios(p));
    return () => {
      vivo = false;
    };
  }, [abierto]);

  if (!abierto) return null;

  const actual: Plan = plan().plan;
  const cerrar = () => set({ avisoPlan: null });

  return (
    <div
      onClick={cerrar}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        background: "rgba(2, 18, 28, .55)",
        animation: "zt-fade .18s ease",
      }}
    >
      <div
        // El clic de adentro no cierra: tocar un plan para leerlo no puede
        // sacar la hoja de la pantalla.
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.card,
          borderRadius: "20px 20px 0 0",
          padding: "8px 16px calc(18px + env(safe-area-inset-bottom, 0px))",
          maxHeight: "86%",
          overflowY: "auto",
          boxShadow: "0 -10px 30px rgba(0,0,0,.25)",
        }}
      >
        {/* El tirador. No hace nada por sí solo, pero es lo que hace que la
            hoja se lea como algo que se puede cerrar. */}
        <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 14px" }}>
          <span style={{ width: 38, height: 4, borderRadius: 999, background: t.border }} />
        </div>

        <div style={{ textAlign: "center", padding: "0 6px 16px" }}>
          <div style={{ font: "700 20px/1.25 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
            Esto viene con otro plan
          </div>
          <div
            style={{
              font: "400 13.5px/1.5 var(--font-barlow),Barlow,sans-serif",
              color: t.ink2,
              paddingTop: 6,
            }}
          >
            {s.avisoPlan} Mirá qué suma cada uno y seguí trabajando sin topes.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ORDEN_PLANES.map((codigo) => {
            const def = PLANES[codigo];
            const esElTuyo = codigo === actual;
            const precio = precios[codigo];
            return (
              <div
                key={codigo}
                style={{
                  borderRadius: 14,
                  padding: "13px 14px",
                  background: esElTuyo ? MARCA.suave : t.bg,
                  border: `1.5px solid ${esElTuyo ? MARCA.acento : t.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span
                    style={{
                      font: "700 16px/1.2 var(--font-barlow),Barlow,sans-serif",
                      color: esElTuyo ? MARCA.header : t.ink,
                    }}
                  >
                    {def.nombre}
                  </span>
                  {esElTuyo && (
                    <span
                      style={{
                        font: "600 10px/1 var(--font-barlow),Barlow,sans-serif",
                        letterSpacing: ".1em",
                        textTransform: "uppercase",
                        padding: "4px 7px",
                        borderRadius: 999,
                        background: MARCA.acento,
                        color: "#fff",
                      }}
                    >
                      Tu plan
                    </span>
                  )}
                  <span
                    style={{
                      marginLeft: "auto",
                      font: "700 15px/1.2 var(--font-barlow),Barlow,sans-serif",
                      color: esElTuyo ? MARCA.header : t.ink,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {/* En el plan gratis no va nada: el nombre ya lo dice, y
                        repetir "Gratis" al lado de "Gratis" se lee como un
                        error. Sin precio tampoco se escribe nada: el plan se
                        entiende por lo que incluye. */}
                    {precio ? `${gs(precio)} /mes` : ""}
                  </span>
                </div>
                <ul style={{ margin: "9px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
                  {def.resumen.map((linea) => (
                    <li
                      key={linea}
                      style={{
                        display: "flex",
                        gap: 7,
                        font: "400 12.5px/1.4 var(--font-barlow),Barlow,sans-serif",
                        color: esElTuyo ? MARCA.header : t.ink2,
                      }}
                    >
                      <span aria-hidden style={{ color: MARCA.acento, fontWeight: 700 }}>
                        ✓
                      </span>
                      {linea}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {config.linkDePago && config.cobrosUrl ? (
          <a
            href={`${config.cobrosUrl}/pagar`}
            target="_blank"
            rel="noreferrer"
            onClick={cerrar}
            style={{
              display: "block",
              marginTop: 16,
              padding: "14px",
              borderRadius: 12,
              background: MARCA.acento,
              color: "#fff",
              textAlign: "center",
              textDecoration: "none",
              font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
            }}
          >
            Ver planes y pagar
          </a>
        ) : (
          config.cobrosUrl && (
            <div
              style={{
                marginTop: 16,
                textAlign: "center",
                font: "400 12.5px/1.5 var(--font-barlow),Barlow,sans-serif",
                color: t.ink3,
              }}
            >
              Se paga en {config.cobrosUrl.replace(/^https?:\/\//, "")}/pagar, desde el navegador.
            </div>
          )
        )}

        <button
          onClick={cerrar}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "12px",
            border: 0,
            borderRadius: 12,
            background: "transparent",
            color: t.ink2,
            cursor: "pointer",
            font: "600 14px/1 var(--font-barlow),Barlow,sans-serif",
          }}
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}

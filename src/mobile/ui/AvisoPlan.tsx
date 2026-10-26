"use client";

import { useEffect, useState } from "react";
import { config } from "@/lib/config";
import { avisarCompra, comprarPlan, planesDePlay, sePuedeComprar } from "@/lib/compras-play";
import { repo } from "@/lib/repo";
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
  // Si en este teléfono se puede comprar con Google. Arranca en `null`
  // —todavía no sabemos— y no en `false`: mostrar la dirección de pago y un
  // segundo después reemplazarla por un botón es peor que esperar.
  const [conPlay, setConPlay] = useState<boolean | null>(null);
  const [dePlay, setDePlay] = useState<Partial<Record<Plan, { precio: string }>>>({});
  const [comprando, setComprando] = useState<Plan | null>(null);
  const [falla, setFalla] = useState("");
  const abierto = !!s.avisoPlan;

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    void preciosDePlanes().then((p) => vivo && setPrecios(p));
    void sePuedeComprar().then((ok) => {
      if (!vivo) return;
      setConPlay(ok);
      // El precio que muestra Google puede no ser el de `zentra.planes`:
      // cobra en la moneda de la cuenta y le suma sus impuestos. Si se va a
      // comprar ahí, el número que se muestra tiene que ser el que se cobra.
      if (ok) void planesDePlay().then((p) => vivo && setDePlay(p));
    });
    return () => {
      vivo = false;
    };
  }, [abierto]);

  if (!abierto) return null;

  const actual: Plan = plan().plan;
  const cerrar = () => set({ avisoPlan: null });

  /**
   * Comprar desde la app.
   *
   * El token de la sesión se pide en el momento y no se guarda: es el que el
   * servidor usa para saber de qué empresa es la compra.
   *
   * Al final se relee la sesión, que es de donde sale el plan. Sin eso habría
   * que cerrar y abrir la app para ver lo que se acaba de pagar, que es el
   * mismo problema que ya arreglamos con el pago por la web.
   */
  const comprar = async (p: Plan) => {
    setFalla("");
    setComprando(p);
    try {
      const sesion = await repo.auth.sesionActual();
      if (!sesion?.token) {
        setFalla("Volvé a iniciar sesión y probá de nuevo.");
        return;
      }
      const r = await comprarPlan(p, (productId, purchaseToken) =>
        avisarCompra(config.cobrosUrl, sesion.token, productId, purchaseToken),
      );
      if (r.estado === "cancelado") return;
      if (r.estado === "error") {
        setFalla(r.motivo);
        return;
      }
      const fresca = await repo.auth.sesionActual();
      if (fresca?.usuario) set({ sesion: fresca.usuario, avisoPlan: null });
      else set({ avisoPlan: null });
    } finally {
      setComprando(null);
    }
  };

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
                    {/* El de Google cuando lo trae —es el que se cobra—, y
                        si no, el de la base. Que no traiga precio no quiere
                        decir que no se pueda comprar: en una suscripción el
                        precio vive en el plan base. */}
                    {dePlay[codigo]?.precio || (precio ? `${gs(precio)} /mes` : "")}
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

                {/* El botón sólo en los planes que no son el tuyo y que se
                    pueden comprar. En el gratis no hay nada que cobrar. */}
                {/* Sólo si Google devolvió precio para este producto. Que el
                    teléfono sepa cobrar no quiere decir que el producto
                    exista: mientras no esté creado en Play Console, el botón
                    abriría una compra que falla con "producto no
                    disponible". Un botón que no puede funcionar es peor que
                    no tener botón. */}
                {conPlay && dePlay[codigo] && !esElTuyo && codigo !== "free" && (
                  <button
                    onClick={() => void comprar(codigo)}
                    disabled={comprando !== null}
                    style={{
                      width: "100%",
                      marginTop: 11,
                      padding: "11px",
                      border: 0,
                      borderRadius: 10,
                      background: MARCA.acento,
                      color: "#fff",
                      opacity: comprando && comprando !== codigo ? 0.5 : 1,
                      cursor: comprando ? "default" : "pointer",
                      font: "600 14px/1 var(--font-barlow),Barlow,sans-serif",
                    }}
                  >
                    {comprando === codigo ? "Abriendo Google Play…" : `Suscribirme a ${def.nombre}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {falla && (
          <div
            style={{
              marginTop: 14,
              padding: "11px 13px",
              borderRadius: 10,
              background: "rgba(178,58,16,.10)",
              color: "#B23A10",
              font: "400 12.5px/1.45 var(--font-barlow),Barlow,sans-serif",
            }}
          >
            {falla}
          </div>
        )}

        {/* Con la facturación de Google adentro, acá no va nada más: mandar a
            pagar afuera desde la app está prohibido por la política de pagos
            de Play, y ese "afuera" incluye un texto con la dirección. */}
        {/* Si hay algo comprable adentro, afuera no se manda a nadie: la
            política de pagos de Play lo prohíbe. Si no hay nada comprable
            —productos sin crear, teléfono sin Play Store, navegador— vale lo
            de siempre. */}
        {conPlay && Object.keys(dePlay).length > 0 ? null : config.linkDePago && config.cobrosUrl ? (
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

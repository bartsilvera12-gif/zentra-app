"use client";

/**
 * La ficha del contacto, a pantalla completa.
 *
 * Es la misma que el ERP muestra al costado del chat en la web: quién es, con
 * qué cliente y proyectos se corresponde, cómo se cerró la última vez y por qué
 * manos pasó. No se arma acá: la trae el ERP entera, porque adentro hay datos
 * con permisos propios —los proyectos— y eso se decide en el servidor.
 *
 * Antes el botón "Ver ficha" del chat llevaba al detalle del cliente de la app
 * usando `refId`, y en modo ERP `refId` es siempre `null`: el botón abría una
 * pantalla vacía. Esto es lo que tendría que haber abierto siempre.
 */

import { useEffect, useState } from "react";
import { MARCA } from "@/lib/theme";
import { repo } from "@/lib/repo";
import type { FichaChat, FichaPasoChat, ThemeTokens } from "@/lib/types";
import { useApp } from "@/store/AppContext";
import { Cargando, Falla } from "../ui/Estado";
import { ScrollBody, SubHeader } from "../ui/primitives";

const FMT_LARGO = new Intl.DateTimeFormat("es-PY", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const FMT_CORTO = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "2-digit", year: "2-digit" });

function fecha(iso: string | null, fmt: Intl.DateTimeFormat): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : fmt.format(d);
}

/**
 * El color del punto de cada paso del recorrido.
 *
 * La web usa un violeta para "transferido"; acá no, porque la paleta de la app
 * son azules y verdes azulados, más ámbar para "mirá esto". Un violeta suelto
 * es lo que hacía que cada pantalla pareciera otra app. El azul profundo
 * cumple la misma función: distinguirse de los otros dos pasos de reparto.
 */
const COLOR_PASO: Record<FichaPasoChat["tipo"], string> = {
  ingreso: "#9AA7B1",
  asignado: "#2F9BD6",
  tomado: "#1F9D6B",
  transferido: MARCA.headerSuave,
  cola: MARCA.aviso,
  cerrado: "#5A6B77",
  sistema: "#C8D1D8",
};

export function FichaChatPanel({
  chatId,
  onCerrar,
  onAbrirCliente,
}: {
  chatId: string;
  onCerrar: () => void;
  onAbrirCliente?: (clienteId: string) => void;
}) {
  const { t } = useApp();
  const [ficha, setFicha] = useState<FichaChat | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // El reintento es un número que cambia: así el pedido vive en un solo lugar
  // —el efecto— en vez de estar escrito dos veces.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    repo.chats
      .ficha(chatId)
      .then((f) => {
        if (vigente) setFicha(f);
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e.message : "No se pudo cargar la ficha.");
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [chatId, intento]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 55,
        background: t.bg,
        display: "flex",
        flexDirection: "column",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div style={{ background: MARCA.header }}>
        <SubHeader titulo="Ficha del contacto" onBack={onCerrar} bg={MARCA.header} />
      </div>

      <ScrollBody>
        {cargando && <Cargando t={t} que="la ficha" />}
        {!cargando && error && <Falla t={t} mensaje={error} onReintentar={() => setIntento((n) => n + 1)} />}
        {!cargando && !error && !ficha && (
          <Aviso t={t}>El ERP no tiene una ficha para esta conversación.</Aviso>
        )}
        {!cargando && !error && ficha && <Contenido ficha={ficha} t={t} onAbrirCliente={onAbrirCliente} />}
      </ScrollBody>
    </div>
  );
}

function Contenido({
  ficha,
  t,
  onAbrirCliente,
}: {
  ficha: FichaChat;
  t: ThemeTokens;
  onAbrirCliente?: (clienteId: string) => void;
}) {
  const { contacto, cliente, proyectos, cierre, conversaciones, recorrido, notas } = ficha;
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ font: "700 19px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
          {contacto.nombre}
        </span>
        <span style={{ font: "500 13px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
          {contacto.telefono || "Sin teléfono"}
        </span>
        {/* Esto no es un capricho: un @lid de WhatsApp parece un número y no
            lo es. Sin el aviso, alguien lo marca y no entiende por qué no
            existe. */}
        {contacto.esCodigoInterno && (
          <span style={{ font: "400 11.5px/1.35 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
            Es un identificador de WhatsApp, no un teléfono. Para llamar, pedile el número.
          </span>
        )}
        {contacto.primerContacto && (
          <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
            Primer contacto: {fecha(contacto.primerContacto, FMT_LARGO)}
          </span>
        )}
      </div>

      {cierre && (
        <Seccion titulo="Último cierre" t={t}>
          <Caja t={t}>
            <span style={{ font: "600 13px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
              {cierre.estado}
            </span>
            <span style={{ font: "400 11.5px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
              {fecha(cierre.fecha, FMT_LARGO)}
              {cierre.por ? ` · cerró ${cierre.por}` : ""}
            </span>
            {cierre.comentario && (
              <span style={{ font: "400 12.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                {cierre.comentario}
              </span>
            )}
            {cierre.reabierta ? (
              <span
                style={{
                  marginTop: 2,
                  borderRadius: 9,
                  background: `${MARCA.aviso}1F`,
                  color: "#7A5A00",
                  padding: "7px 9px",
                  font: "500 11.5px/1.35 var(--font-barlow),Barlow,sans-serif",
                }}
              >
                La conversación se reabrió después de este cierre, así que no dice lo que está pasando ahora.
              </span>
            ) : cierre.deOtraConversacion ? (
              <span style={{ font: "400 11px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink3, fontStyle: "italic" }}>
                Corresponde a otra conversación de este contacto.
              </span>
            ) : null}
          </Caja>
        </Seccion>
      )}

      <Seccion titulo="Cliente" t={t}>
        {cliente ? (
          <Caja t={t} acento>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ flex: 1, minWidth: 0, font: "600 13.5px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                {cliente.nombre}
              </span>
              {onAbrirCliente && cliente.id && (
                <button
                  onClick={() => onAbrirCliente(cliente.id)}
                  style={{
                    flex: "0 0 auto",
                    border: 0,
                    background: "transparent",
                    color: MARCA.acento,
                    cursor: "pointer",
                    font: "600 12px/1 var(--font-barlow),Barlow,sans-serif",
                  }}
                >
                  Abrir →
                </button>
              )}
            </div>
            <Dato t={t} k="RUC" v={cliente.ruc} />
            <Dato t={t} k="Teléfono" v={cliente.telefono} />
            <Dato t={t} k="Email" v={cliente.email} />
            <Dato t={t} k="Ciudad" v={cliente.ciudad} />
            <Dato t={t} k="Dirección" v={cliente.direccion} />
          </Caja>
        ) : (
          <Aviso t={t}>Sin cliente vinculado.</Aviso>
        )}
      </Seccion>

      {/* `null` es "no tenés acceso al módulo de proyectos" y la sección no se
          dibuja; `[]` es "tiene acceso y el cliente no tiene proyectos". Son
          dos cosas distintas y se dicen distinto. */}
      {proyectos && (
        <Seccion titulo={`Proyectos${proyectos.length ? ` (${proyectos.length})` : ""}`} t={t}>
          {proyectos.length === 0 ? (
            <Aviso t={t}>Este cliente no tiene proyectos.</Aviso>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {proyectos.map((p) => (
                <Caja key={p.id} t={t} apagado={p.cerrado}>
                  <span
                    style={{
                      font: "600 13px/1.3 var(--font-barlow),Barlow,sans-serif",
                      color: p.cerrado ? t.ink2 : t.ink,
                    }}
                  >
                    {p.nombre}
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {p.estado && (
                      <span
                        style={{
                          borderRadius: 999,
                          padding: "3px 9px",
                          font: "600 10.5px/1.3 var(--font-barlow),Barlow,sans-serif",
                          // El color lo decide el ERP: así el estado se lee
                          // igual en la app y en la web.
                          background: p.estadoColor ? `${p.estadoColor}1F` : t.bg,
                          color: p.estadoColor ?? t.ink2,
                          border: `1px solid ${p.estadoColor ? `${p.estadoColor}55` : t.border}`,
                        }}
                      >
                        {p.estado}
                      </span>
                    )}
                    {p.tipo && (
                      <span
                        style={{
                          borderRadius: 999,
                          padding: "3px 9px",
                          font: "500 10.5px/1.3 var(--font-barlow),Barlow,sans-serif",
                          background: t.bg,
                          color: t.ink2,
                          border: `1px solid ${t.border}`,
                        }}
                      >
                        {p.tipo}
                      </span>
                    )}
                    {p.cerrado && (
                      <span style={{ font: "500 10.5px/1.6 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
                        cerrado
                      </span>
                    )}
                  </div>
                  {p.responsables && (
                    <span style={{ font: "400 11px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                      {p.responsables}
                    </span>
                  )}
                </Caja>
              ))}
            </div>
          )}
        </Seccion>
      )}

      {conversaciones.length > 0 && (
        <Seccion titulo={`Conversaciones (${conversaciones.length})`} t={t}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {conversaciones.map((c) => (
              <Caja key={c.id} t={t} acento={c.actual}>
                <div style={{ display: "flex", gap: 8 }}>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      font: "500 12px/1.3 var(--font-barlow),Barlow,sans-serif",
                      color: t.ink,
                    }}
                  >
                    {[c.canal, c.cola].filter(Boolean).join(" · ") || "Conversación"}
                  </span>
                  {c.actual && (
                    <span style={{ font: "600 10.5px/1.5 var(--font-barlow),Barlow,sans-serif", color: MARCA.acento }}>
                      Actual
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      font: "600 10.5px/1.3 var(--font-barlow),Barlow,sans-serif",
                      color: c.abierta ? "#1F9D6B" : t.ink3,
                    }}
                  >
                    {c.abierta ? "Abierta" : "Cerrada"}
                  </span>
                  {c.agente && (
                    <span style={{ font: "400 10.5px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                      {c.agente}
                    </span>
                  )}
                  <span
                    style={{
                      marginLeft: "auto",
                      font: "400 10.5px/1.3 var(--font-barlow),Barlow,sans-serif",
                      color: t.ink3,
                    }}
                  >
                    {fecha(c.fecha, FMT_CORTO)}
                  </span>
                </div>
              </Caja>
            ))}
          </div>
        </Seccion>
      )}

      {recorrido.length > 0 && (
        <Seccion titulo="Recorrido" t={t}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recorrido.map((e) => (
              <Caja key={e.id} t={t}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span
                    aria-hidden
                    style={{ width: 7, height: 7, flex: "0 0 auto", borderRadius: "50%", background: COLOR_PASO[e.tipo] }}
                  />
                  <span style={{ font: "600 12px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                    {e.accion}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      font: "400 10.5px/1.3 var(--font-barlow),Barlow,sans-serif",
                      color: t.ink3,
                    }}
                  >
                    {fecha(e.fecha, FMT_LARGO)}
                  </span>
                </div>
                <Dato t={t} k="Línea" v={e.linea} ancho={52} />
                <Dato t={t} k="Quién" v={e.usuario} ancho={52} />
                <Dato t={t} k="Destino" v={e.destino} ancho={52} />
              </Caja>
            ))}
          </div>
        </Seccion>
      )}

      {notas.map((n) => (
        <span key={n} style={{ font: "400 10.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
          {n}
        </span>
      ))}
    </>
  );
}

function Seccion({ titulo, t, children }: { titulo: string; t: ThemeTokens; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span
        style={{
          font: "700 10.5px/1 var(--font-barlow),Barlow,sans-serif",
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: t.ink3,
        }}
      >
        {titulo}
      </span>
      {children}
    </div>
  );
}

function Caja({
  t,
  acento = false,
  apagado = false,
  children,
}: {
  t: ThemeTokens;
  acento?: boolean;
  apagado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 13,
        border: `1px solid ${acento ? `${MARCA.acento}4D` : t.border}`,
        background: acento ? `${MARCA.acento}0D` : apagado ? t.bg : t.card,
        padding: "11px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {children}
    </div>
  );
}

function Dato({ t, k, v, ancho = 66 }: { t: ThemeTokens; k: string; v: string | null; ancho?: number }) {
  if (!v) return null;
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span
        style={{
          width: ancho,
          flex: "0 0 auto",
          font: "400 11.5px/1.35 var(--font-barlow),Barlow,sans-serif",
          color: t.ink3,
        }}
      >
        {k}
      </span>
      <span
        style={{
          minWidth: 0,
          wordBreak: "break-word",
          font: "500 11.5px/1.35 var(--font-barlow),Barlow,sans-serif",
          color: t.ink2,
        }}
      >
        {v}
      </span>
    </div>
  );
}

function Aviso({ t, children }: { t: ThemeTokens; children: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 13,
        border: `1px dashed ${t.border}`,
        background: t.card,
        padding: "12px 13px",
        font: "400 12px/1.4 var(--font-barlow),Barlow,sans-serif",
        color: t.ink2,
      }}
    >
      {children}
    </div>
  );
}

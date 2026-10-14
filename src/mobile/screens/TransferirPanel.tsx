"use client";

/**
 * Transferir una conversación: a una cola, o a un agente concreto.
 *
 * Las dos cosas las hace el mismo endpoint del ERP, y son las mismas acciones
 * que usa el ERP de escritorio —el reparto, los eventos de ruteo y los avisos
 * salen del mismo lugar—, así que una transferencia hecha desde la app se ve
 * igual en la web que una hecha ahí.
 *
 * Las colas y los agentes se piden al abrir la hoja y no al entrar al chat: son
 * dos consultas caras y la mayoría de las veces se entra a leer, no a
 * transferir.
 *
 * La carga de cada agente se muestra a propósito. Pasarle un chat a alguien que
 * tiene quince abiertos y está en pausa es lo que hace que una conversación se
 * quede sin contestar tres horas.
 */

import { useEffect, useMemo, useState } from "react";
import { MARCA } from "@/lib/theme";
import { repo } from "@/lib/repo";
import { norm } from "@/lib/format";
import type { AgenteDestino, ColaDestino, ThemeTokens } from "@/lib/types";
import { useApp } from "@/store/AppContext";
import { SearchInput } from "../ui/primitives";

export function TransferirPanel({
  chatId,
  onCerrar,
  onTransferido,
}: {
  chatId: string;
  onCerrar: () => void;
  /** La conversación ya no es de quien la tenía: la lista hay que volver a pedirla. */
  onTransferido: (aDonde: string) => void;
}) {
  const { t } = useApp();
  const [colas, setColas] = useState<ColaDestino[]>([]);
  const [agentes, setAgentes] = useState<AgenteDestino[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cola, setCola] = useState("");
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    repo.chats
      .destinos(chatId)
      .then((d) => {
        if (!vigente) return;
        setColas(d.colas);
        setAgentes(d.agentes);
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e.message : "No se pudieron cargar los destinos.");
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [chatId]);

  // La cola elegida acota la lista de agentes; el texto busca en el nombre y en
  // la cola. Mismo filtrado que el escritorio.
  const visibles = useMemo(() => {
    const q = norm(busca.trim());
    return agentes
      .filter((a) => (cola ? a.colaId === cola : true))
      .filter((a) => (q ? norm(a.nombre + " " + a.colaNombre).indexOf(q) >= 0 : true));
  }, [agentes, cola, busca]);

  const transferir = async (a: { colaId?: string; agenteId?: string }, etiqueta: string) => {
    setEnviando(etiqueta);
    setError(null);
    try {
      await repo.chats.transferir(chatId, a);
      onTransferido(etiqueta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo transferir.");
    } finally {
      setEnviando(null);
    }
  };

  const nombreCola = colas.find((c) => c.id === cola)?.nombre ?? "";

  return (
    <div
      role="presentation"
      onClick={onCerrar}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 58,
        background: "rgba(0,0,0,.42)",
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "86vh",
          background: t.card,
          borderRadius: "18px 18px 0 0",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "14px 15px 12px",
            borderBottom: `1px solid ${t.border}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ font: "700 16px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
              Transferir conversación
            </span>
            <span style={{ font: "400 11.5px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
              A una cola, o directo a una persona. El número es cuántos chats tiene abiertos.
            </span>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            style={{
              flex: "0 0 auto",
              width: 32,
              height: 32,
              border: 0,
              borderRadius: 999,
              background: t.bg,
              color: t.ink2,
              cursor: "pointer",
              font: "600 14px/1 var(--font-barlow),Barlow,sans-serif",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "14px 15px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
          {error && (
            <div
              style={{
                borderRadius: 12,
                background: `${MARCA.alerta}14`,
                border: `1px solid ${MARCA.alerta}44`,
                color: MARCA.alerta,
                padding: "11px 12px",
                font: "500 12.5px/1.4 var(--font-barlow),Barlow,sans-serif",
              }}
            >
              {error}
            </div>
          )}

          {cargando ? (
            <span style={{ padding: "22px 0", textAlign: "center", font: "400 13px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
              Cargando destinos…
            </span>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Rotulo t={t}>Colas</Rotulo>
                {colas.length === 0 ? (
                  <span style={{ font: "400 12px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                    No hay colas a tu alcance.
                  </span>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value={cola}
                      onChange={(e) => setCola(e.target.value)}
                      aria-label="Cola destino"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        borderRadius: 12,
                        border: `1px solid ${t.border}`,
                        background: t.card,
                        color: t.ink,
                        padding: "11px 12px",
                        font: "500 13.5px/1 var(--font-barlow),Barlow,sans-serif",
                      }}
                    >
                      <option value="">Todas las colas (tu alcance)</option>
                      {colas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={!cola || enviando !== null}
                      onClick={() => void transferir({ colaId: cola }, nombreCola)}
                      style={{
                        flex: "0 0 auto",
                        border: 0,
                        borderRadius: 12,
                        background: MARCA.acento,
                        color: "#fff",
                        padding: "0 16px",
                        cursor: !cola || enviando ? "default" : "pointer",
                        opacity: !cola || enviando ? 0.45 : 1,
                        font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif",
                      }}
                    >
                      {enviando === nombreCola ? "…" : "Pasar"}
                    </button>
                  </div>
                )}
                {/* Elegir una cola acá hace dos cosas: es el destino del botón
                    y a la vez acota la lista de abajo. Decirlo evita que
                    parezca que desaparecieron agentes. */}
                {cola && (
                  <span style={{ font: "400 11px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
                    Abajo quedan sólo los agentes de {nombreCola}.
                  </span>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <Rotulo t={t}>Agentes</Rotulo>
                <SearchInput value={busca} onChange={setBusca} placeholder="Buscar agente…" />
                {visibles.length === 0 ? (
                  <span style={{ padding: "14px 0", font: "400 12.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                    {agentes.length === 0
                      ? "No hay agentes a los que puedas transferir."
                      : "Ningún agente con estos filtros."}
                  </span>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", border: `1px solid ${t.border}`, borderRadius: 13, overflow: "hidden" }}>
                    {visibles.map((a, i) => (
                      <div
                        key={a.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "11px 12px",
                          background: t.card,
                          borderTop: i === 0 ? 0 : `1px solid ${t.border}`,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                          <span style={{ font: "600 13.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
                            {a.nombre}
                          </span>
                          <span style={{ font: "400 11px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                            {a.colaNombre} · {a.disponible ? "Disponible" : "En pausa"}
                            {a.enLinea ? "" : " · sin sesión"} · {a.activas}{" "}
                            {a.activas === 1 ? "chat" : "chats"}
                          </span>
                        </div>
                        <button
                          disabled={enviando !== null}
                          onClick={() => void transferir({ agenteId: a.id }, a.nombre)}
                          style={{
                            flex: "0 0 auto",
                            border: 0,
                            borderRadius: 11,
                            background: MARCA.acento,
                            color: "#fff",
                            padding: "9px 13px",
                            cursor: enviando ? "default" : "pointer",
                            opacity: enviando ? 0.45 : 1,
                            font: "600 12.5px/1 var(--font-barlow),Barlow,sans-serif",
                          }}
                        >
                          {enviando === a.nombre ? "…" : "Pasar"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Rotulo({ t, children }: { t: ThemeTokens; children: React.ReactNode }) {
  return (
    <span
      style={{
        font: "700 10.5px/1 var(--font-barlow),Barlow,sans-serif",
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: t.ink3,
      }}
    >
      {children}
    </span>
  );
}

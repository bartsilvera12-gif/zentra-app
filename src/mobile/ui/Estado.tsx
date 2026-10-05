/**
 * Lo que se ve cuando una lista todavía no cargó, falló, o está vacía.
 *
 * Son tres cosas distintas y acá no se mezclan. "No hay clientes" después de un
 * error de red es mentira, y alguien sale a vender creyendo que su cartera está
 * vacía.
 */
"use client";
import type { ThemeTokens } from "@/lib/types";

export function Cargando({ t, que }: { t: ThemeTokens; que: string }) {
  return (
    <div style={{ padding: "40px 20px", textAlign: "center", font: "400 13px/1.5 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
      Cargando {que}…
    </div>
  );
}

export function Falla({ t, mensaje, onReintentar }: { t: ThemeTokens; mensaje: string; onReintentar?: () => void }) {
  return (
    <div style={{ padding: "32px 20px", textAlign: "center" }}>
      <div style={{ font: "600 14px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>No pudimos cargar</div>
      {/* El mensaje del ERP va tal cual: está escrito para una persona. */}
      <div style={{ font: "400 13px/1.5 var(--font-barlow),Barlow,sans-serif", color: t.ink2, paddingTop: 6 }}>{mensaje}</div>
      {onReintentar && (
        <button
          onClick={onReintentar}
          style={{
            marginTop: 14, padding: "9px 18px", borderRadius: 10,
            border: `1px solid ${t.border}`, background: t.card, color: t.ink,
            font: "600 13px/1 var(--font-barlow),Barlow,sans-serif", cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Vacio({ t, mensaje }: { t: ThemeTokens; mensaje: string }) {
  return (
    <div style={{ padding: "40px 20px", textAlign: "center", font: "400 13px/1.5 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
      {mensaje}
    </div>
  );
}

/**
 * Un módulo que este ERP no expone por API.
 *
 * Se dice, en vez de mostrar datos de ejemplo. Una pantalla llena de cosas
 * inventadas parece que funciona, y el que la mira decide con eso.
 */
export function NoDisponible({ t, modulo }: { t: ThemeTokens; modulo: string }) {
  return (
    <div style={{ padding: "40px 24px", textAlign: "center" }}>
      <div style={{ font: "600 14px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>
        {modulo} todavía no está conectado
      </div>
      <div style={{ font: "400 13px/1.5 var(--font-barlow),Barlow,sans-serif", color: t.ink2, paddingTop: 8 }}>
        El ERP de esta empresa no expone este módulo por API. Preferimos decírtelo
        antes que mostrarte datos que no son tuyos.
      </div>
    </div>
  );
}

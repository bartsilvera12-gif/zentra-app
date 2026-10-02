"use client";

import type { CSSProperties, ReactNode } from "react";
import { useApp } from "@/store/AppContext";

/* ---------- text ---------- */

/** The 10px uppercase tracking-wide label that heads every card section. */
export function SectionLabel({ children, color }: { children: ReactNode; color?: string }) {
  const { t } = useApp();
  return (
    <span
      style={{
        font: "600 10px/1 var(--font-barlow),Barlow,sans-serif",
        letterSpacing: ".14em",
        textTransform: "uppercase",
        color: color ?? t.ink2,
      }}
    >
      {children}
    </span>
  );
}

/* ---------- containers ---------- */

export function Card({
  children,
  style,
  gap = 11,
}: {
  children: ReactNode;
  style?: CSSProperties;
  gap?: number;
}) {
  const { t } = useApp();
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 16,
        background: t.card,
        border: `1px solid ${t.border}`,
        display: "flex",
        flexDirection: "column",
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Scrollable body region shared by every list and detail screen. */
export function ScrollBody({
  children,
  padding = "12px 14px",
  gap = 9,
}: {
  children: ReactNode;
  padding?: string;
  gap?: number;
}) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        padding,
        display: "flex",
        flexDirection: "column",
        gap,
      }}
    >
      {children}
    </div>
  );
}

export function EmptyState({ titulo, detalle }: { titulo: string; detalle: string }) {
  const { t } = useApp();
  return (
    <div
      style={{
        borderRadius: 16,
        padding: "26px 18px",
        textAlign: "center",
        background: t.card,
        border: `1px dashed ${t.border}`,
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      <span style={{ font: "600 14px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{titulo}</span>
      <span style={{ font: "400 12.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>{detalle}</span>
    </div>
  );
}

/* ---------- controls ---------- */

export interface ChipSpec {
  label: string;
  bg: string;
  fg: string;
  border: string;
  pick: () => void;
}

export function ChipRow({ chips }: { chips: ChipSpec[] }) {
  return (
    <div style={{ display: "flex", gap: 7, overflowX: "auto", scrollbarWidth: "none" }}>
      {chips.map((ch) => (
        <button
          key={ch.label}
          onClick={ch.pick}
          style={{
            flex: "0 0 auto",
            borderRadius: 999,
            padding: "7px 13px",
            cursor: "pointer",
            font: "500 12px/1 var(--font-barlow),Barlow,sans-serif",
            whiteSpace: "nowrap",
            background: ch.bg,
            color: ch.fg,
            border: `1px solid ${ch.border}`,
          }}
        >
          {ch.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Build the chip specs for a filter row. `accent` is the colour of the selected
 * chip; unselected chips fall back to the card surface.
 */
export function useChips(
  labels: string[],
  activo: string,
  accent: string,
  onPick: (k: string) => void,
  label?: (k: string) => string,
): ChipSpec[] {
  const { t } = useApp();
  return labels.map((k) => {
    const on = activo === k;
    return {
      label: label ? label(k) : k,
      bg: on ? accent : t.card,
      fg: on ? "#ffffff" : t.ink2,
      border: on ? accent : t.border,
      pick: () => onPick(k),
    };
  });
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const { t } = useApp();
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        height: 42,
        borderRadius: 12,
        padding: "0 13px",
        fontSize: 14,
        outline: "none",
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.ink,
      }}
    />
  );
}

/** Labelled form field. `dark` switches to the on-colour variant used on headers. */
export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  dark = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "numeric" | "decimal" | "text" | "email" | "tel";
  dark?: boolean;
}) {
  const { t } = useApp();
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span
        style={{
          font: "600 11px/1 var(--font-barlow),Barlow,sans-serif",
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: dark ? "rgba(255,255,255,.8)" : t.ink2,
        }}
      >
        {label}
      </span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={dark ? "zt-dark-field" : undefined}
        style={{
          height: 46,
          border: dark ? "1px solid rgba(255,255,255,.28)" : `1px solid ${t.border}`,
          borderRadius: 12,
          background: dark ? "rgba(255,255,255,.14)" : t.card,
          padding: "0 14px",
          fontSize: 15,
          color: dark ? "#fff" : t.ink,
          outline: "none",
          minWidth: 0,
        }}
      />
    </label>
  );
}

export function PrimaryButton({
  label,
  onClick,
  bg,
  color = "#fff",
  height = 52,
}: {
  label: string;
  onClick: () => void;
  bg: string;
  color?: string;
  height?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        height,
        border: 0,
        borderRadius: 14,
        background: bg,
        color,
        font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
        letterSpacing: ".02em",
        cursor: "pointer",
        flex: "0 0 auto",
      }}
    >
      {label}
    </button>
  );
}

export function GhostButton({
  label,
  onClick,
  flex,
}: {
  label: string;
  onClick: () => void;
  flex?: number;
}) {
  const { t } = useApp();
  return (
    <button
      onClick={onClick}
      style={{
        flex,
        height: 46,
        borderRadius: 13,
        cursor: "pointer",
        font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif",
        background: t.card,
        border: `1px solid ${t.border}`,
        color: t.ink,
      }}
    >
      {label}
    </button>
  );
}

/** The `‹` back chevron. `onDark` renders the translucent variant used on coloured headers. */
export function BackButton({ onClick, onDark = false }: { onClick: () => void; onDark?: boolean }) {
  const { t } = useApp();
  return (
    <button
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        flex: "0 0 auto",
        border: 0,
        borderRadius: 10,
        cursor: "pointer",
        font: "600 17px/1 var(--font-barlow),Barlow,sans-serif",
        background: onDark ? "rgba(255,255,255,.2)" : t.bg,
        color: onDark ? "#fff" : t.ink,
      }}
    >
      ‹
    </button>
  );
}

export function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  /** Qué controla el switch. Sin esto el lector de pantalla sólo dice "botón". */
  label?: string;
}) {
  const { s } = useApp();
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      style={{
        width: 50,
        height: 29,
        flex: "0 0 auto",
        borderRadius: 15,
        border: 0,
        cursor: "pointer",
        padding: 3,
        display: "flex",
        justifyContent: on ? "flex-end" : "flex-start",
        alignItems: "center",
        background: on ? "#209EBB" : s.theme === "oscuro" ? "#39415a" : "#ccd3de",
        transition: "background .2s ease",
      }}
    >
      <span
        style={{
          width: 23,
          height: 23,
          borderRadius: "50%",
          background: "#fff",
          display: "block",
        }}
      />
    </button>
  );
}

/* ---------- display ---------- */

export function Avatar({
  inicial,
  size = 42,
  bg = "#E2F0F4",
  ink = "#04617A",
  radius = 12,
  font,
}: {
  inicial: string;
  size?: number;
  bg?: string;
  ink?: string;
  radius?: number;
  font?: string;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: radius,
        background: bg,
        color: ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        font: font ?? `700 ${Math.round(size * 0.38)}px/1 var(--font-barlow),Barlow,sans-serif`,
      }}
    >
      {inicial}
    </span>
  );
}

export function Badge({
  children,
  bg,
  ink,
  dot,
}: {
  children: ReactNode;
  bg: string;
  ink: string;
  dot?: string;
}) {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        borderRadius: 999,
        padding: "3px 8px",
        font: "600 10px/1 var(--font-barlow),Barlow,sans-serif",
        background: bg,
        color: ink,
      }}
    >
      {dot && (
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: dot }} />
      )}
      {children}
    </span>
  );
}

/** Label-over-value tile used for the pair of summary figures above each list. */
export function StatTile({
  label,
  valor,
  valorInk,
  onDark = false,
}: {
  label: string;
  valor: string;
  valorInk?: string;
  onDark?: boolean;
}) {
  const { t } = useApp();
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 13,
        padding: "11px 12px",
        background: onDark ? "rgba(255,255,255,.12)" : t.bg,
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      <span
        style={{
          font: "600 9.5px/1 var(--font-barlow),Barlow,sans-serif",
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: onDark ? "#8ECAE6" : t.ink2,
        }}
      >
        {label}
      </span>
      <span
        style={{
          font: `700 ${onDark ? 16 : 15.5}px/1.1 var(--font-barlow),Barlow,sans-serif`,
          color: valorInk ?? (onDark ? "#fff" : t.ink),
        }}
      >
        {valor}
      </span>
    </div>
  );
}

export function KeyValue({ k, v, vInk }: { k: string; v: string; vInk?: string }) {
  const { t } = useApp();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ font: "400 12.5px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>{k}</span>
      <span
        style={{
          font: "600 12.5px/1.3 var(--font-barlow),Barlow,sans-serif",
          textAlign: "right",
          color: vInk ?? t.ink,
        }}
      >
        {v}
      </span>
    </div>
  );
}

/** Inline notice strip, used for validation errors and confirmations. */
export function Notice({
  children,
  bg,
  ink,
  border,
}: {
  children: ReactNode;
  bg: string;
  ink: string;
  border?: string;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        background: bg,
        border: border ? `1px solid ${border}` : undefined,
        padding: "12px 14px",
        font: "500 13px/1.4 var(--font-barlow),Barlow,sans-serif",
        color: ink,
      }}
    >
      {children}
    </div>
  );
}

/** Numeric stepper (− qty +) used in the cart and purchase lines. */
export function QtyStepper({
  qty,
  onAdd,
  onSub,
  accent,
}: {
  qty: number;
  onAdd: () => void;
  onSub: () => void;
  accent: string;
}) {
  const { t } = useApp();
  const btn: CSSProperties = {
    width: 28,
    height: 28,
    border: `1px solid ${t.border}`,
    borderRadius: 9,
    background: t.card,
    color: accent,
    font: "600 16px/1 var(--font-barlow),Barlow,sans-serif",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
      <button onClick={onSub} style={btn} aria-label="Quitar uno">−</button>
      <span
        style={{
          font: "700 14px/1 var(--font-barlow),Barlow,sans-serif",
          color: t.ink,
          minWidth: 18,
          textAlign: "center",
        }}
      >
        {qty}
      </span>
      <button onClick={onAdd} style={btn} aria-label="Agregar uno">+</button>
    </span>
  );
}

/** Wizard step rail. Completed steps are tappable to go back. */
export interface PasoSpec {
  nombre: string;
  mark: string;
  bg: string;
  fg: string;
  label: string;
  go: () => void;
}

export function Stepper({ pasos }: { pasos: PasoSpec[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {pasos.map((p, i) => (
        <div key={p.nombre} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <button
            onClick={p.go}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: 0,
              background: "none",
              padding: 0,
              cursor: "pointer",
              minWidth: 0,
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                flex: "0 0 auto",
                borderRadius: "50%",
                background: p.bg,
                color: p.fg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: "600 11px/1 var(--font-barlow),Barlow,sans-serif",
              }}
            >
              {p.mark}
            </span>
            <span
              style={{
                font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif",
                color: p.label,
                whiteSpace: "nowrap",
              }}
            >
              {p.nombre}
            </span>
          </button>
          {i < pasos.length - 1 && (
            <span style={{ width: 12, height: 1, background: "rgba(255,255,255,.3)", flex: "0 0 auto" }} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- form + header blocks shared by the module screens ---------- */

/**
 * The form field used inside module cards: 44px tall, 11px radius, sitting on the
 * page background rather than the card. Distinct from `Field`, which the auth
 * screens use at 46px.
 */
export function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  required = false,
  flex,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "numeric" | "decimal" | "text" | "email" | "tel";
  required?: boolean;
  flex?: number;
}) {
  const { t } = useApp();
  return (
    <label style={{ flex, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
        {label}
        {required && <span style={{ color: "#B0322F" }}> *</span>}
      </span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          height: 44,
          borderRadius: 11,
          padding: "0 13px",
          fontSize: 14.5,
          outline: "none",
          background: t.bg,
          border: `1px solid ${t.border}`,
          color: t.ink,
          minWidth: 0,
        }}
      />
    </label>
  );
}

/** A row of equal-width option buttons (price list, unit, IVA, method, markup…). */
export function OptionRow({
  options,
  activo,
  onPick,
  bg = "#E2F0F4",
  fg = "#04617A",
  border = "#04617A",
}: {
  options: string[];
  activo: string;
  onPick: (k: string) => void;
  bg?: string;
  fg?: string;
  border?: string;
}) {
  const { t } = useApp();
  return (
    <div style={{ display: "flex", gap: 7 }}>
      {options.map((o) => {
        const on = activo === o;
        return (
          <button
            key={o}
            onClick={() => onPick(o)}
            style={{
              flex: 1,
              borderRadius: 11,
              padding: "11px 8px",
              cursor: "pointer",
              font: "600 12.5px/1 var(--font-barlow),Barlow,sans-serif",
              background: on ? bg : t.card,
              color: on ? fg : t.ink2,
              border: `1.5px solid ${on ? border : t.border}`,
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** List-screen header: back chevron, title, one-line summary and an optional action. */
export function ListHeader({
  titulo,
  resumen,
  onBack,
  accion,
}: {
  titulo: string;
  resumen: string;
  onBack: () => void;
  accion?: { label: string; onClick: () => void; bg: string; fg: string };
}) {
  const { t } = useApp();
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <BackButton onClick={onBack} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ font: "700 19px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{titulo}</span>
        <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>{resumen}</span>
      </div>
      {accion && (
        <button
          onClick={accion.onClick}
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
            border: 0,
            borderRadius: 999,
            background: accion.bg,
            color: accion.fg,
            padding: "9px 15px",
            cursor: "pointer",
            font: "600 13px/1 var(--font-barlow),Barlow,sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          {accion.label}
        </button>
      )}
    </div>
  );
}

/** Title bar on a sub-screen that sits on a coloured header. */
export function SubHeader({
  titulo,
  onBack,
  bg,
}: {
  titulo: string;
  onBack: () => void;
  bg: string;
}) {
  return (
    <div style={{ padding: "4px 14px 16px", display: "flex", alignItems: "center", gap: 11, background: bg }}>
      <button
        onClick={onBack}
        style={{
          width: 32,
          height: 32,
          flex: "0 0 auto",
          border: 0,
          borderRadius: 10,
          background: "rgba(255,255,255,.18)",
          color: "#fff",
          font: "600 17px/1 var(--font-barlow),Barlow,sans-serif",
          cursor: "pointer",
        }}
      >
        ‹
      </button>
      <div style={{ font: "600 17px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>{titulo}</div>
    </div>
  );
}

"use client";

export interface StepSpec {
  nombre: string;
  mark: string;
  bg: string;
  fg: string;
  label: string;
  go: () => void;
}

/**
 * The step rail on the sale and purchase wizards: a numbered circle per step with
 * its name underneath. Completed steps are tappable; upcoming ones are inert.
 */
export function WizardSteps({ pasos }: { pasos: StepSpec[] }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
      {pasos.map((p) => (
        <div
          key={p.nombre}
          style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}
        >
          <button
            onClick={p.go}
            style={{
              width: 28,
              height: 28,
              border: 0,
              borderRadius: "50%",
              font: "700 12px/1 var(--font-barlow),Barlow,sans-serif",
              cursor: "pointer",
              background: p.bg,
              color: p.fg,
            }}
          >
            {p.mark}
          </button>
          <span
            style={{
              font: "500 10px/1.1 var(--font-barlow),Barlow,sans-serif",
              textAlign: "center",
              color: p.label,
            }}
          >
            {p.nombre}
          </span>
        </div>
      ))}
    </div>
  );
}

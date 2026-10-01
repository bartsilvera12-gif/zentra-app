/**
 * The faux iOS status bar at the top of every screen. `ink` paints the clock and
 * bars; `dim` paints the one inactive signal bar.
 */
export function StatusBar({ ink, dim, bg }: { ink: string; dim: string; bg?: string }) {
  const bar = (h: number, color: string) => (
    <div style={{ width: 3, height: h, background: color, borderRadius: 1 }} />
  );
  return (
    <div
      style={{
        padding: "14px 20px 6px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: bg,
      }}
    >
      <span style={{ font: "600 13.5px/1 var(--font-barlow),Barlow,sans-serif", color: ink, letterSpacing: ".02em" }}>
        9:41
      </span>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5 }}>
          {bar(4, ink)}
          {bar(6, ink)}
          {bar(8, ink)}
          {bar(10, dim)}
        </div>
        <div
          style={{
            width: 22,
            height: 11,
            border: `1.3px solid ${ink}`,
            borderRadius: 3,
            padding: 1.5,
            boxSizing: "border-box",
            display: "flex",
          }}
        >
          <div style={{ width: "65%", background: ink, borderRadius: 1 }} />
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";

/**
 * The device mockup that wraps every screen: dark bezel, rounded 34px viewport,
 * fixed 372×740 so the design's pixel values hold. On a real phone the frame
 * collapses to the viewport via `max-width`.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: 372,
        maxWidth: "100%",
        background: "#0b0f1c",
        borderRadius: 44,
        padding: 11,
        boxShadow: "0 26px 60px rgba(14,19,48,.3), 0 2px 6px rgba(0,0,0,.2)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          position: "relative",
          height: 740,
          borderRadius: 34,
          overflow: "hidden",
          background: "#f3f5f8",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  );
}

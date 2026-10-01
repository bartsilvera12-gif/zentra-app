import type { Metadata, Viewport } from "next";
import { Barlow } from "next/font/google";
import "./globals.css";

/**
 * Barlow is the design's typeface. Loading it through next/font self-hosts the
 * files and avoids the render-blocking request a <link> to Google Fonts makes.
 */
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-barlow",
});

export const metadata: Metadata = {
  title: "Zentra Móvil",
  description:
    "App móvil de ventas para Distribuidora JM: ventas, clientes, compras, inventario y reportes.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#023047",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PY" className={barlow.variable}>
      <body>{children}</body>
    </html>
  );
}

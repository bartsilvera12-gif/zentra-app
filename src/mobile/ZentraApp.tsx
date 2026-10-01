"use client";

import { useApp } from "@/store/AppContext";
import { PhoneFrame } from "./layout/PhoneFrame";
import { ClientesScreen } from "./screens/ClientesScreen";
import { ComprasScreen } from "./screens/ComprasScreen";
import { ConfigScreen } from "./screens/ConfigScreen";
import { ConversacionesScreen } from "./screens/ConversacionesScreen";
import { DetVentasScreen } from "./screens/DetVentasScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { InventarioScreen } from "./screens/InventarioScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { ModuleScreen } from "./screens/ModuleScreen";
import { ProveedoresScreen } from "./screens/ProveedoresScreen";
import { RecuperoScreen } from "./screens/RecuperoScreen";
import { ReportesScreen } from "./screens/ReportesScreen";
import { VentaScreen } from "./screens/VentaScreen";

/** Maps the single `screen` flag onto a screen component. */
function CurrentScreen() {
  const { s } = useApp();
  switch (s.screen) {
    case "login":
      return <LoginScreen />;
    case "recupero":
      return <RecuperoScreen />;
    case "home":
      return <HomeScreen />;
    case "config":
      return <ConfigScreen />;
    case "venta":
      return <VentaScreen />;
    case "clientes":
      return <ClientesScreen />;
    case "proveedores":
      return <ProveedoresScreen />;
    case "compras":
      return <ComprasScreen />;
    case "inventario":
      return <InventarioScreen />;
    case "conversaciones":
      return <ConversacionesScreen />;
    case "reportes":
      return <ReportesScreen />;
    case "detventas":
      return <DetVentasScreen />;
    case "module":
      return <ModuleScreen />;
    default:
      return <LoginScreen />;
  }
}

export function ZentraApp() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
        padding: "36px 20px 48px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#4b5a5a" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/zentra-mark-teal.png"
          alt="Zentra"
          style={{ height: 22, width: "auto", display: "block" }}
        />
        <span
          style={{
            font: "600 13px/1 var(--font-barlow),Barlow,sans-serif",
            letterSpacing: ".22em",
            textTransform: "uppercase",
          }}
        >
          Zentra · app móvil
        </span>
      </div>

      <PhoneFrame>
        <CurrentScreen />
      </PhoneFrame>

      <div
        style={{
          font: "400 12.5px/1.5 var(--font-barlow),Barlow,sans-serif",
          color: "#65707f",
          textAlign: "center",
          maxWidth: 380,
        }}
      >
        Tocá <strong style={{ fontWeight: 600 }}>Entrar</strong> para entrar al inicio. En{" "}
        <strong style={{ fontWeight: 600 }}>Configuración</strong> se cambia entre modo claro y oscuro y se manejan las
        notificaciones.
      </div>
    </div>
  );
}

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
    /* En el celular esto no es una maqueta que se presenta: es la app. El
       encabezado, el texto explicativo y los márgenes se van (ver globals.css). */
    <div className="zt-pagina">
      {/* El estilo va en globals.css, no inline: un `display` inline le gana a la
          media query y el encabezado no se iría nunca en el celular. */}
      <div className="zt-maqueta zt-encabezado">
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

      <div className="zt-maqueta zt-ayuda">
        Tocá <strong style={{ fontWeight: 600 }}>Entrar</strong> para entrar al inicio. En{" "}
        <strong style={{ fontWeight: 600 }}>Configuración</strong> se cambia entre modo claro y oscuro y se manejan las
        notificaciones.
      </div>
    </div>
  );
}

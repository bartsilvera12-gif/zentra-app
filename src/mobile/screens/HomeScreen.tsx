"use client";

import type { CSSProperties, ReactNode } from "react";
import { EMPRESA, FECHA_LARGA, USUARIO } from "@/lib/data";
import { MODULES } from "@/lib/theme";
import type { ModuleKey } from "@/lib/types";
import { useApp } from "@/store/AppContext";
import { BottomNav } from "../layout/BottomNav";
import { StatusBar } from "../layout/StatusBar";
import {
  IconCampana,
  IconClientes,
  IconCompras,
  IconConversaciones,
  IconFactura,
  IconFlecha,
  IconInventario,
  IconProveedores,
} from "../ui/Icons";

const BASE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  position: "relative",
  zIndex: 2,
  transition: "transform .32s cubic-bezier(.4,0,.2,1), opacity .28s ease",
};

const OVER: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 3,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  font: "600 15px/1 var(--font-barlow),Barlow,sans-serif",
  transition: "transform .32s cubic-bezier(.4,0,.2,1), opacity .28s ease",
};

interface TileProps {
  k: ModuleKey;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Secondary caption, only the sale tile has one. */
  nota?: string;
  labelSize?: number;
  gap?: number;
}

function Tile({ k, label, icon, onClick, nota, labelSize = 15, gap = 10 }: TileProps) {
  const { s, set } = useApp();
  const def = MODULES[k];
  const on = s.hover === k;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => set({ hover: k })}
      onMouseLeave={() => set({ hover: null })}
      style={{
        border: 0,
        borderRadius: 14,
        background: def.color,
        color: def.over,
        padding: "24px 12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap,
        cursor: "pointer",
        minHeight: 112,
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* The dot grows to fill the tile on hover, revealing the arrow label. */}
      <div
        style={{
          position: "absolute",
          borderRadius: 12,
          background: def.fill,
          transition: "all .36s cubic-bezier(.4,0,.2,1)",
          ...(on
            ? { left: "-6%", top: "-6%", width: "112%", height: "112%", opacity: 1 }
            : { left: "20%", top: "42%", width: 9, height: 9, opacity: 0 }),
        }}
      />
      <div style={{ ...BASE, ...(on ? { transform: "translateX(44px)", opacity: 0 } : { transform: "none", opacity: 1 }) }}>
        {icon}
        <span style={{ font: `600 ${labelSize}px/1.1 var(--font-barlow),Barlow,sans-serif` }}>{label}</span>
        {nota && <span style={{ font: "400 12px/1 var(--font-barlow),Barlow,sans-serif", opacity: 0.7 }}>{nota}</span>}
      </div>
      <div
        style={{
          ...OVER,
          color: def.over,
          ...(on ? { transform: "none", opacity: 1 } : { transform: "translateX(44px)", opacity: 0 }),
        }}
      >
        <span>{label}</span>
        <IconFlecha />
      </div>
    </button>
  );
}

export function HomeScreen() {
  const { s, t, set } = useApp();

  const roleInk = s.theme === "oscuro" ? "#FFB701" : "#8A5F00";
  // Con código de empresa el nombre sale de la instalación resuelta; en la
  // instalación pública todavía sale de los datos de ejemplo.
  // Con sesión real, empresa y usuario salen del perfil; si no, de los datos de ejemplo.
  const empresa = s.sesion?.empresa || (s.tenant && !s.tenant.publico ? s.tenant.nombre : EMPRESA);
  const usuario = s.sesion ?? USUARIO;
  const inicial = (s.sesion?.nombre || USUARIO.nombre).slice(0, 1).toUpperCase();
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        animation: "zt-fade .22s ease",
        background: t.bg,
      }}
    >
      <StatusBar bg={t.card} />

      {/* Header: company, date, user */}
      <div
        style={{
          padding: "10px 16px 12px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: t.card,
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/zentra-mark-teal.png"
            alt="Zentra"
            style={{ height: 20, width: "auto", display: "block", flex: "0 0 auto" }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ font: "600 15.5px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{empresa}</span>
            <span style={{ font: "400 11px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink2, whiteSpace: "nowrap" }}>
              {FECHA_LARGA}
            </span>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            <span style={{ font: "600 13px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{usuario.nombre}</span>
            <span style={{ font: "600 10.5px/1 var(--font-barlow),Barlow,sans-serif", letterSpacing: ".12em", color: roleInk }}>
              {usuario.rol}
            </span>
          </div>
          <IconCampana stroke={t.ink2} />
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "#04617A",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "600 13px/1 var(--font-barlow),Barlow,sans-serif",
            }}
          >
            {inicial}
          </div>
        </div>
      </div>

      {/*
        Acá iba un carrusel de dos tarjetas: una dona de salud del inventario y
        un gráfico de ventas de siete días. Se fue por dos razones, y la segunda
        pesa más que la primera:

        1. Era la mitad de la pantalla, y la pantalla de inicio sirve para entrar
           rápido a un módulo, no para quedarse a mirarla.
        2. Los números eran inventados. No salían de la base: estaban escritos en
           el código desde el prototipo. En una instalación real alguien veía
           "Gs. 4.850.000" de ventas del día sin haber vendido nada.

        Vuelve cuando Reportes esté conectado del lado del servidor y los números
        sean los suyos. El diseño original está en el historial de git.
      */}

      {/* Module grid */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "14px 14px 12px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          // Las tres filas se reparten el alto disponible. Antes se apilaban
          // arriba y dejaban un hueco abajo, porque el carrusel ocupaba ese
          // espacio. `minmax` evita que en una pantalla chica queden aplastadas.
          gridAutoRows: "minmax(132px, 1fr)",
          gap: 12,
        }}
      >
        <Tile
          k="venta"
          label="Nueva venta"
          nota="(Factura)"
          labelSize={16}
          gap={8}
          icon={<IconFactura />}
          onClick={() => set({ screen: "venta", mod: "venta" })}
        />
        <Tile
          k="clientes"
          label="Clientes"
          icon={<IconClientes />}
          onClick={() => set({ screen: "clientes", cSub: "lista", cSel: null })}
        />
        <Tile
          k="compras"
          label="Compras"
          icon={<IconCompras />}
          onClick={() => set({ screen: "compras", kSub: "lista", kSel: null })}
        />
        <Tile
          k="inventario"
          label="Inventario"
          icon={<IconInventario />}
          onClick={() => set({ screen: "inventario", iSub: "lista", iSel: null })}
        />
        <Tile
          k="conversaciones"
          label="Conversaciones"
          icon={<IconConversaciones />}
          onClick={() => set({ screen: "conversaciones", xSub: "lista", xSel: null })}
        />
        <Tile
          k="proveedores"
          label="Proveedores"
          icon={<IconProveedores />}
          onClick={() => set({ screen: "proveedores", vwSub: "lista", vwSel: null })}
        />
      </div>

      <BottomNav />
    </div>
  );
}

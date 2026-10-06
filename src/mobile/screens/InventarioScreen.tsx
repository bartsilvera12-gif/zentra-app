"use client";

import { MARCA } from "@/lib/theme";
import { MOTIVOS, MOVS, PESABLES, UNIDADES } from "@/lib/data";
import { usaApiDelErp } from "@/lib/repo";
import { Sku } from "../ui/Sku";
import { repo } from "@/lib/repo";
import { useRemoto } from "./useRemoto";
import { Cargando, Falla } from "@/mobile/ui/Estado";
import { margenPct, stockDe } from "@/lib/calc";
import { gs, norm, num } from "@/lib/format";
import type { InvProducto, Movimiento, MovTipo } from "@/lib/types";
import { useApp } from "@/store/AppContext";
import { cupoProductos, motivoBloqueo } from "@/lib/planes";
import { BottomNav } from "../layout/BottomNav";
import { StatusBar } from "../layout/StatusBar";
import {
  Badge,
  Card,
  ChipRow,
  EmptyState,
  FormField,
  GhostButton,
  KeyValue,
  ListHeader,
  Notice,
  OptionRow,
  ScrollBody,
  SearchInput,
  SectionLabel,
  StatTile,
  SubHeader,
} from "../ui/primitives";

const AZUL = MARCA.header;
const CIAN_CLARO = MARCA.sobre;

export function InventarioScreen() {
  const { s, t, set, plan } = useApp();

  // El catálogo sale del ERP.
  const { datos, cargando, error, recargar } = useRemoto(() => repo.inventario.list(), []);
  const prods = s.iExtra.concat(datos);
  const stock = (p: InvProducto) => stockDe(p, s.iDelta);
  const unidades = prods.reduce((a, p) => a + stock(p), 0);
  const bajo = prods.filter((p) => stock(p) <= p.minimo);

  const iq = norm(s.iQuery.trim());
  const filtrados = prods.filter((p) => {
    const st = stock(p);
    if (s.iFiltro === "Bajo mínimo" && !(st > 0 && st <= p.minimo)) return false;
    if (s.iFiltro === "Agotados" && st > 0) return false;
    if (s.iFiltro === "Con stock" && st <= 0) return false;
    return norm(p.nombre + " " + p.sku + " " + p.barras).indexOf(iq) >= 0;
  });

  const det = prods.find((p) => p.id === s.iSel) ?? null;
  // Los movimientos de stock no los expone la API de estos ERPs. Con ERP se
  // muestran sólo los que se hicieron desde la app: inventar entradas y
  // salidas de un depósito ajeno sería grave.
  const allMovs = usaApiDelErp() ? s.iMovExtra : s.iMovExtra.concat(MOVS);
  const prodName = (id: string) => prods.find((p) => p.id === id)?.nombre ?? "—";
  const prodUnidad = (id: string) => prods.find((p) => p.id === id)?.unidad ?? "";

  /** Presentation shape for one stock movement row. */
  const movView = (m: Movimiento) => ({
    id: m.id,
    producto: prodName(m.prodId),
    tipo: m.tipo,
    cant: (m.cant < 0 ? "" : "+") + m.cant + " " + prodUnidad(m.prodId),
    detalle: `${m.origen} · ${m.ref} · ${m.usuario}`,
    fecha: m.fecha,
    bg: m.tipo === "ENTRADA" ? "#EAF3EF" : m.tipo === "SALIDA" ? "#FBE9E7" : "#FFF3DC",
    ink: m.tipo === "ENTRADA" ? "#1F5C46" : m.tipo === "SALIDA" ? "#8C2F2B" : "#6B4A00",
  });

  const movsFiltrados = allMovs.filter((m) => s.iMovFiltro === "Todos" || m.tipo === s.iMovFiltro);
  const detMovs = det ? allMovs.filter((m) => m.prodId === det.id) : [];

  /* ---- adjustment ---- */
  const ajFiltrados = prods.filter(
    (p) => norm(p.nombre + " " + p.sku).indexOf(norm(s.ajQuery.trim())) >= 0,
  );
  const ajProd = prods.find((p) => p.id === s.ajProd) ?? null;
  const ajCantNum = Number(s.ajCant) || 0;
  const ajNuevoStock = ajProd
    ? s.ajTipo === "SALIDA"
      ? stock(ajProd) - ajCantNum
      : stock(ajProd) + ajCantNum
    : 0;
  const ajPuede = !!ajProd && ajCantNum > 0;

  const guardarAjuste = () => {
    if (!ajPuede || !ajProd) return;
    const signo = s.ajTipo === "SALIDA" ? -1 : 1;
    const delta = { ...s.iDelta };
    delta[ajProd.id] = (delta[ajProd.id] || 0) + signo * ajCantNum;
    const mov: Movimiento = {
      id: "nm" + (s.iMovExtra.length + 1),
      prodId: ajProd.id,
      tipo: s.ajTipo,
      cant: signo * ajCantNum,
      origen: s.ajMotivo,
      ref: "AJU-0000" + (32 + s.iMovExtra.length),
      fecha: "30 sep",
      usuario: "Ulises G.",
    };
    set({ iDelta: delta, iMovExtra: [mov].concat(s.iMovExtra), iSub: "movs", iMovFiltro: "Todos" });
  };

  /* ---- new product ---- */
  const npSkuSugerido =
    (s.npNombre.trim() ? norm(s.npNombre).replace(/[^a-z]/g, "").slice(0, 3).toUpperCase() : "SKU") +
    "-" +
    (101 + s.iExtra.length);
  const npCostoNum = Number(s.npCosto) || 0;
  const npPrecioNum = Number(s.npPrecio) || 0;
  const npMarkupCalc = npCostoNum > 0 ? (npPrecioNum / npCostoNum - 1) * 100 : 0;
  const npPuede = s.npNombre.trim().length >= 2 && npCostoNum > 0 && npPrecioNum > 0;

  /**
   * El tope de productos del plan.
   *
   * Se cuenta sobre lo que hay cargado, no sobre lo que se ve filtrado: el
   * límite es de la empresa, no de la búsqueda que alguien tenga escrita.
   */
  const ctxAlta = plan({ productos: datos.length });
  const topeAlta = motivoBloqueo("inventario.alta", ctxAlta);
  const { tope } = cupoProductos(ctxAlta);
  const resumenConCupo =
    tope === null
      ? `${prods.length} productos · ${num(unidades)} unidades`
      : `${datos.length} de ${tope} productos · ${num(unidades)} unidades`;

  const guardarProducto = () => {
    if (!npPuede) {
      set({ npError: true });
      return;
    }
    const id = "np" + (s.iExtra.length + 1);
    const stockIni = Number(s.npStock) || 0;
    const nuevo: InvProducto = {
      id,
      nombre: s.npNombre.trim(),
      sku: (s.npSku || npSkuSugerido).toUpperCase(),
      stock: stockIni,
      minimo: Number(s.npMinimo) || 0,
      costo: npCostoNum,
      precio: Math.round(npPrecioNum),
      unidad: s.npUnidad,
      categoria: s.npCategoria.trim() || "Sin categoría",
      // Depósito, método de valuación y código de barras ya no se preguntan:
      // son decisiones del ERP, no de quien carga un producto desde el
      // celular. Van vacíos para que el ERP ponga lo que corresponda, en vez
      // de que la app invente un "Depósito central" que quizás no existe.
      deposito: "",
      iva: s.npIva,
      metodo: "CPP",
      barras: "",
    };
    // Opening stock is recorded as an ENTRADA so the ledger stays complete.
    const movs =
      stockIni > 0
        ? ([
            {
              id: "nm" + (s.iMovExtra.length + 1),
              prodId: id,
              tipo: "ENTRADA" as MovTipo,
              cant: stockIni,
              origen: "Inventario inicial",
              ref: "INI-0000" + (s.iExtra.length + 1),
              fecha: "30 sep",
              usuario: "Ulises G.",
            },
          ] as Movimiento[]).concat(s.iMovExtra)
        : s.iMovExtra;
    set({ iExtra: [nuevo].concat(s.iExtra), iMovExtra: movs, iSub: "detalle", iSel: id });
  };

  /**
   * Abre la ficha para corregirla, con los campos ya cargados.
   *
   * Reusa el mismo formulario del alta: son los mismos datos, y tener dos
   * formularios para el mismo producto garantiza que uno se quede atrás.
   */
  const editando = s.iSub === "editar";
  const editarBloqueado = Boolean(motivoBloqueo("inventario.editar", plan()));
  // Los campos que sólo trae Max.
  const sinMax = Boolean(motivoBloqueo("inventario.mayorista", plan()));

  const editarProducto = (p: InvProducto) => {
    const motivo = motivoBloqueo("inventario.editar", plan());
    if (motivo) return set({ avisoPlan: motivo });
    set({
      iSub: "editar",
      iSel: p.id,
      npNombre: p.nombre,
      npSku: p.sku,
      npUnidad: p.unidad,
      npCategoria: p.categoria === "Sin categoría" ? "" : p.categoria,
      npCosto: String(p.costo || ""),
      npPrecio: String(p.precio || ""),
      npIva: p.iva,
      // El stock no se edita acá: se mueve con un ajuste, que deja rastro.
      npStock: "",
      npMinimo: String(p.minimo || ""),
      npMayorista: p.precioMayorista ? String(p.precioMayorista) : "",
      npVencimiento: p.vencimiento ?? "",
      npError: false,
      npGuardando: false,
    });
  };

  /**
   * Guarda la corrección.
   *
   * Los productos que vienen del backend se corrigen contra el backend. Los que
   * se cargaron en esta sesión y todavía viven sólo en pantalla se corrigen
   * ahí: en la demo no hay a dónde mandarlos.
   */
  const guardarEdicion = async () => {
    if (!npPuede || !s.iSel) {
      set({ npError: true });
      return;
    }
    const cambios = {
      nombre: s.npNombre.trim(),
      sku: (s.npSku || npSkuSugerido).toUpperCase(),
      categoria: s.npCategoria.trim(),
      costo: npCostoNum,
      precio: Math.round(npPrecioNum),
      iva: s.npIva,
      unidad: s.npUnidad,
      minimo: Number(s.npMinimo) || 0,
      precioMayorista: s.npMayorista.trim() ? Number(s.npMayorista) : null,
      vencimiento: s.npVencimiento.trim() || null,
    };

    const local = s.iExtra.findIndex((p) => p.id === s.iSel);
    if (local >= 0) {
      const copia = s.iExtra.slice();
      copia[local] = {
        ...copia[local],
        ...cambios,
        categoria: cambios.categoria || "Sin categoría",
      };
      set({ iExtra: copia, iSub: "detalle", npGuardando: false });
      return;
    }

    set({ npGuardando: true, npErrorTexto: "" });
    try {
      await repo.inventario.update(s.iSel, cambios);
      set({ iSub: "detalle", npGuardando: false });
      recargar();
    } catch (e) {
      set({
        npGuardando: false,
        npErrorTexto: e instanceof Error ? e.message : "No se pudieron guardar los cambios.",
      });
    }
  };

  const chips = ["Todos", "Bajo mínimo", "Agotados", "Con stock"].map((k) => {
    const on = s.iFiltro === k;
    return {
      label: k,
      bg: on ? AZUL : t.card,
      fg: on ? "#ffffff" : t.ink2,
      border: on ? AZUL : t.border,
      pick: () => set({ iFiltro: k }),
    };
  });

  const movChips = (["Todos", "ENTRADA", "SALIDA", "AJUSTE"] as const).map((k) => {
    const on = s.iMovFiltro === k;
    return {
      label: k === "Todos" ? "Todos" : k.slice(0, 1) + k.slice(1).toLowerCase(),
      bg: on ? CIAN_CLARO : "rgba(255,255,255,.14)",
      fg: on ? AZUL : "rgba(255,255,255,.8)",
      border: on ? CIAN_CLARO : "rgba(255,255,255,.2)",
      pick: () => set({ iMovFiltro: k }),
    };
  });

  const topBg = s.iSub === "lista" ? t.card : AZUL;

  const movRow = (m: ReturnType<typeof movView>) => (
    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <span
        style={{
          width: 38,
          height: 38,
          flex: "0 0 auto",
          borderRadius: 11,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          font: "600 9.5px/1 var(--font-barlow),Barlow,sans-serif",
          background: m.bg,
          color: m.ink,
        }}
      >
        {m.tipo.slice(0, 3)}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ font: "600 12.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{m.producto}</span>
        <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>{m.detalle}</span>
      </span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flex: "0 0 auto" }}>
        <span style={{ font: "700 12.5px/1.1 var(--font-barlow),Barlow,sans-serif", color: m.ink }}>{m.cant}</span>
        <span style={{ font: "400 10.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>{m.fecha}</span>
      </span>
    </div>
  );

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
      <StatusBar bg={topBg} />

      {/* ---------- list ---------- */}
      {s.iSub === "lista" && (
        <>
          <div
            style={{
              padding: "6px 14px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 11,
              background: t.card,
              borderBottom: `1px solid ${t.border}`,
            }}
          >
            <ListHeader
              titulo="Inventario"
              resumen={resumenConCupo}
              onBack={() => set({ screen: "home" })}
              accion={{
                label: "+ Nuevo",
                // El botón queda visible y apagado, con el motivo al tocarlo.
                // Esconderlo haría que la persona busque el alta y no la
                // encuentre, sin enterarse de que hay un plan que la trae.
                deshabilitado: Boolean(topeAlta),
                onClick: () =>
                  topeAlta
                    ? set({ avisoPlan: topeAlta })
                    : set({
                    iSub: "nuevo",
                    npNombre: "",
                    npSku: "",
                    npUnidad: "UNIDAD",
                    npCategoria: "",
                    npCosto: "",
                    npPrecio: "",
                    npIva: "10%",
                    npStock: "",
                    npMinimo: "",
                    npError: false,
                      }),
                bg: CIAN_CLARO,
                fg: AZUL,
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <StatTile label="Valuación" valor={gs(prods.reduce((a, p) => a + stock(p) * p.costo, 0))} />
              <StatTile label="Bajo mínimo" valor={`${bajo.length} prod.`} valorInk={MARCA.avisoInk} />
            </div>
            <SearchInput
              value={s.iQuery}
              onChange={(v) => set({ iQuery: v })}
              placeholder="Producto, SKU o código de barras"
            />
            <ChipRow chips={chips} />
            <div style={{ display: "flex", gap: 8 }}>
              <GhostButton
                label="Ver movimientos"
                flex={1}
                onClick={() => set({ iSub: "movs", iMovFiltro: "Todos" })}
              />
              <GhostButton
                label="Ajustar stock"
                flex={1}
                onClick={() =>
                  set({
                    iSub: "ajuste",
                    ajProd: null,
                    ajQuery: "",
                    ajCant: "",
                    ajTipo: "ENTRADA",
                    ajMotivo: "Inventario físico",
                  })
                }
              />
            </div>
          </div>

          <ScrollBody>
            {cargando && <Cargando t={t} que="el inventario" />}
            {error && <Falla t={t} mensaje={error} onReintentar={recargar} />}
            {!cargando && !error && filtrados.map((p) => {
              const st = stock(p);
              const agotado = st <= 0;
              const esBajo = st > 0 && st <= p.minimo;
              // The bar fills relative to twice the minimum, so "at minimum" sits mid-way.
              const pct = Math.max(4, Math.min(100, p.minimo > 0 ? (st / (p.minimo * 2)) * 100 : 100));
              return (
                <button
                  key={p.id}
                  onClick={() => set({ iSub: "detalle", iSel: p.id })}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    textAlign: "left",
                    borderRadius: 16,
                    padding: 13,
                    cursor: "pointer",
                    background: t.card,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "flex-start", gap: 11, width: "100%" }}>
                    <Sku sku={p.sku} t={t} />
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ font: "600 14px/1.25 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{p.nombre}</span>
                      <span style={{ font: "400 11.5px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                        {/* Se arma salteando lo vacío: el ERP no siempre tiene
                            depósito cargado, y quedaba un "·" colgado al final.
                            El código completo va acá porque en el recuadro, si
                            es largo, se achica para entrar. */}
                        {[p.sku, `${st} ${p.unidad}`, `mín. ${p.minimo}`, p.deposito]
                          .filter((x) => String(x || "").trim())
                          .join(" · ")}
                      </span>
                    </span>
                    <span
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 3,
                        flex: "0 0 auto",
                      }}
                    >
                      <span style={{ font: "700 14px/1.1 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{gs(p.precio)}</span>
                      <span style={{ font: "400 10.5px/1 var(--font-barlow),Barlow,sans-serif", color: "#1F5C46" }}>
                        {margenPct(p.costo, p.precio)}%
                      </span>
                    </span>
                  </span>

                  {/* Stock vs. minimum bar */}
                  <span
                    style={{
                      width: "100%",
                      height: 5,
                      borderRadius: 3,
                      background: s.theme === "oscuro" ? "#242c40" : "#E7ECF2",
                      display: "block",
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        height: "100%",
                        width: `${pct}%`,
                        borderRadius: 3,
                        background: agotado ? "#B0322F" : esBajo ? "#B08A20" : "#1C8C84",
                      }}
                    />
                  </span>

                  <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Badge
                      bg={agotado ? "#FBE9E7" : esBajo ? "#FFF3DC" : "#EAF3EF"}
                      ink={agotado ? "#8C2F2B" : esBajo ? "#6B4A00" : "#1F5C46"}
                    >
                      {agotado ? "Agotado" : esBajo ? "Bajo mínimo" : "Normal"}
                    </Badge>
                    <span style={{ font: "400 10px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
                      IVA {p.iva} · {p.metodo}
                    </span>
                  </span>
                </button>
              );
            })}
            {!cargando && !error && filtrados.length === 0 && (
              <EmptyState titulo="Sin productos" detalle="Probá con otro término o cambiá el filtro." />
            )}
          </ScrollBody>
        </>
      )}

      {/* ---------- detail ---------- */}
      {s.iSub === "detalle" && det && (
        <>
          <div style={{ padding: "4px 14px 18px", display: "flex", flexDirection: "column", gap: 12, background: AZUL }}>
            <button
              onClick={() => set({ iSub: "lista", iSel: null })}
              style={{
                width: 32,
                height: 32,
                border: 0,
                borderRadius: 10,
                background: "rgba(255,255,255,.18)",
                color: "#fff",
                font: "600 17px/1 var(--font-barlow),Barlow,sans-serif",
                cursor: "pointer",
                alignSelf: "flex-start",
              }}
            >
              ‹
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Sku sku={det.sku} t={t} caja={52} onDark />
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ font: "700 18px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>{det.nombre}</span>
                <span style={{ font: "400 12px/1.2 var(--font-barlow),Barlow,sans-serif", color: "rgba(255,255,255,.78)" }}>
                  {det.categoria} · {det.deposito}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <StatTile label="Stock" valor={`${stock(det)} ${det.unidad}`} onDark />
              <StatTile label="Valuación" valor={gs(stock(det) * det.costo)} onDark />
            </div>
          </div>

          <ScrollBody padding="14px" gap={12}>
            <Card gap={11}>
              <SectionLabel>Precios y margen</SectionLabel>
              <KeyValue k="Costo promedio" v={gs(det.costo)} />
              <KeyValue k="Precio de venta" v={gs(det.precio)} />
              <KeyValue k="Margen" v={`${margenPct(det.costo, det.precio)}%`} vInk="#1F5C46" />
              <KeyValue k="IVA de venta" v={det.iva} />
            </Card>

            <Card gap={11}>
              <SectionLabel>Ficha</SectionLabel>
              <KeyValue k="Unidad" v={det.unidad} />
              <KeyValue k="Stock mínimo" v={String(det.minimo)} />
              <KeyValue k="Categoría" v={det.categoria} />
              <KeyValue k="Depósito" v={det.deposito} />
              <KeyValue k="Valuación" v={det.metodo} />
              <KeyValue k="Código de barras" v={det.barras} />
            </Card>

            <Card gap={12}>
              <SectionLabel>Últimos movimientos</SectionLabel>
              {detMovs.slice(0, 4).map((m) => movRow(movView(m)))}
              {detMovs.length === 0 && (
                <span style={{ font: "400 12.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                  Todavía no hay movimientos de este producto.
                </span>
              )}
            </Card>

            <button
              onClick={() =>
                set({
                  iSub: "ajuste",
                  ajProd: s.iSel,
                  ajQuery: "",
                  ajCant: "",
                  ajTipo: "AJUSTE",
                  ajMotivo: "Inventario físico",
                })
              }
              style={{
                height: 50,
                border: 0,
                borderRadius: 13,
                background: AZUL,
                color: "#fff",
                font: "600 14.5px/1 var(--font-barlow),Barlow,sans-serif",
                cursor: "pointer",
                flex: "0 0 auto",
              }}
            >
              Ajustar stock
            </button>

            {/* Corregir la ficha. Va después de ajustar porque ajustar es lo
                que se hace todos los días y corregir es la excepción. */}
            <button
              onClick={() => det && editarProducto(det)}
              style={{
                height: 46,
                borderRadius: 13,
                background: t.card,
                color: editarBloqueado ? t.ink3 : t.ink,
                border: `1px solid ${t.border}`,
                font: "600 14px/1 var(--font-barlow),Barlow,sans-serif",
                cursor: "pointer",
                flex: "0 0 auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
              }}
            >
              {editarBloqueado && <span aria-hidden>🔒</span>}
              Editar ficha
            </button>
          </ScrollBody>
        </>
      )}

      {/* ---------- movements ledger ---------- */}
      {s.iSub === "movs" && (
        <>
          <div style={{ padding: "4px 14px 16px", display: "flex", flexDirection: "column", gap: 12, background: AZUL }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <button
                onClick={() => set({ iSub: "lista", iSel: null })}
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
              <div style={{ font: "600 17px/1.2 var(--font-barlow),Barlow,sans-serif", color: "#fff" }}>Movimientos</div>
            </div>
            <ChipRow chips={movChips} />
          </div>

          <ScrollBody padding="14px" gap={12}>
            <Card gap={14}>{movsFiltrados.map((m) => movRow(movView(m)))}</Card>
            {movsFiltrados.length === 0 && (
              <EmptyState titulo="Sin movimientos" detalle="No hay movimientos de ese tipo en el período." />
            )}
          </ScrollBody>
        </>
      )}

      {/* ---------- stock adjustment ---------- */}
      {s.iSub === "ajuste" && (
        <>
          <SubHeader titulo="Ajuste de stock" onBack={() => set({ iSub: "lista" })} bg={AZUL} />
          <ScrollBody padding="14px" gap={12}>
            <Card gap={12}>
              <SectionLabel>Producto</SectionLabel>
              <SearchInput
                value={s.ajQuery}
                onChange={(v) => set({ ajQuery: v })}
                placeholder="Buscar producto o SKU…"
              />
              {ajFiltrados.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  onClick={() => set({ ajProd: p.id })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    textAlign: "left",
                    borderRadius: 13,
                    padding: 11,
                    cursor: "pointer",
                    background: t.bg,
                    border: `2px solid ${s.ajProd === p.id ? AZUL : "transparent"}`,
                  }}
                >
                  <Sku sku={p.sku} t={t} caja={36} />
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ font: "600 13px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink }}>{p.nombre}</span>
                    <span style={{ font: "400 11px/1.2 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                      {stock(p)} {p.unidad}
                    </span>
                  </span>
                </button>
              ))}
            </Card>

            <Card gap={12}>
              <SectionLabel>Tipo de movimiento</SectionLabel>
              <OptionRow
                options={["ENTRADA", "SALIDA", "AJUSTE"]}
                activo={s.ajTipo}
                onPick={(k) => set({ ajTipo: k as MovTipo })}
              />
              <FormField
                label="Cantidad"
                inputMode="decimal"
                value={s.ajCant}
                onChange={(v) => set({ ajCant: v.replace(/[^0-9.]/g, "") })}
                placeholder="0"
              />
            </Card>

            <Card gap={12}>
              <SectionLabel>Motivo</SectionLabel>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {MOTIVOS.map((k) => {
                  const on = s.ajMotivo === k;
                  return (
                    <button
                      key={k}
                      onClick={() => set({ ajMotivo: k })}
                      style={{
                        borderRadius: 999,
                        padding: "8px 13px",
                        cursor: "pointer",
                        font: "600 12px/1 var(--font-barlow),Barlow,sans-serif",
                        background: on ? "#E2F0F4" : t.card,
                        color: on ? "#04617A" : t.ink2,
                        border: `1px solid ${on ? "#04617A" : t.border}`,
                      }}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
            </Card>

            {ajPuede && ajProd && (
              <Card gap={7}>
                <SectionLabel>Stock resultante</SectionLabel>
                <span
                  style={{
                    font: "700 22px/1 var(--font-barlow),Barlow,sans-serif",
                    color:
                      ajNuevoStock < 0
                        ? "#B0322F"
                        : ajNuevoStock <= ajProd.minimo
                          ? MARCA.avisoInk
                          : "#1F5C46",
                  }}
                >
                  {ajNuevoStock} {ajProd.unidad}
                </span>
                <span style={{ font: "400 11.5px/1.3 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                  Antes: {stock(ajProd)} {ajProd.unidad} · mín. {ajProd.minimo}
                </span>
              </Card>
            )}

            {ajNuevoStock < 0 && (
              <Notice bg="#FFF3DC" ink="#6B4A00">
                La salida deja el stock en negativo. Revisá si falta registrar una entrada.
              </Notice>
            )}
          </ScrollBody>

          <div style={{ padding: "11px 14px 13px", background: t.card, borderTop: `1px solid ${t.border}` }}>
            <button
              onClick={guardarAjuste}
              style={{
                width: "100%",
                height: 50,
                border: 0,
                borderRadius: 13,
                color: "#fff",
                font: "600 14.5px/1 var(--font-barlow),Barlow,sans-serif",
                cursor: "pointer",
                background: ajPuede ? AZUL : "#5C7A85",
              }}
            >
              Registrar movimiento
            </button>
          </div>
        </>
      )}

      {/* ---------- new product ---------- */}
      {(s.iSub === "nuevo" || s.iSub === "editar") && (
        <>
          <SubHeader
            titulo={editando ? "Editar producto" : "Nuevo producto"}
            onBack={() => set({ iSub: editando ? "detalle" : "lista" })}
            bg={AZUL}
          />
          <ScrollBody padding="14px" gap={12}>
            <Card gap={14}>
              <SectionLabel>Identificación</SectionLabel>
              <FormField
                label="Nombre"
                required
                value={s.npNombre}
                onChange={(v) => set({ npNombre: v, npError: false })}
                placeholder="Gaseosa cola 2 L"
              />
              <FormField
                label="SKU"
                value={s.npSku}
                onChange={(v) => set({ npSku: v.toUpperCase() })}
                placeholder={npSkuSugerido}
              />
              <div style={{ font: "400 11px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink3 }}>
                Si dejás el SKU vacío se usa <strong style={{ fontWeight: 600 }}>{npSkuSugerido}</strong>.
              </div>
              <FormField
                label="Categoría"
                value={s.npCategoria}
                onChange={(v) => set({ npCategoria: v })}
                placeholder="Bebidas"
              />
            </Card>

            <Card gap={12}>
              <SectionLabel>Unidad de medida</SectionLabel>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {UNIDADES.map((u) => {
                  const on = s.npUnidad === u;
                  return (
                    <button
                      key={u}
                      onClick={() => set({ npUnidad: u })}
                      style={{
                        borderRadius: 999,
                        padding: "8px 13px",
                        cursor: "pointer",
                        font: "600 12px/1 var(--font-barlow),Barlow,sans-serif",
                        background: on ? "#E2F0F4" : t.card,
                        color: on ? "#04617A" : t.ink2,
                        border: `1px solid ${on ? "#04617A" : t.border}`,
                      }}
                    >
                      {u}
                    </button>
                  );
                })}
              </div>
              <span style={{ font: "400 11.5px/1.4 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                {PESABLES.indexOf(s.npUnidad) >= 0
                  ? `Se vende por peso: admite decimales (1,350) y el precio es por ${s.npUnidad}.`
                  : "Se cuenta de a uno: la cantidad siempre es entera."}
              </span>
            </Card>

            <Card gap={14}>
              <SectionLabel>Costo y precio</SectionLabel>
              <div style={{ display: "flex", gap: 10 }}>
                <FormField
                  label="Costo (₲)"
                  flex={1}
                  inputMode="decimal"
                  value={s.npCosto}
                  onChange={(v) => set({ npCosto: v.replace(/[^0-9.]/g, ""), npError: false })}
                  placeholder="8640"
                />
                <FormField
                  label="Precio (₲)"
                  flex={1}
                  inputMode="decimal"
                  value={s.npPrecio}
                  onChange={(v) => set({ npPrecio: v.replace(/[^0-9.]/g, ""), npError: false })}
                  placeholder="12000"
                />
              </div>

              {/* Mayorista y vencimiento son de Max. Fuera de Max no se
                  dibujan: a diferencia de un botón que explica por qué está
                  apagado, un campo vacío que no se puede llenar sólo estorba
                  el formulario que sí hay que completar. */}
              {!sinMax && (
                <div style={{ display: "flex", gap: 10 }}>
                  <FormField
                    label="Precio mayorista (₲)"
                    flex={1}
                    inputMode="decimal"
                    value={s.npMayorista}
                    onChange={(v) => set({ npMayorista: v.replace(/[^0-9.]/g, "") })}
                    placeholder="Opcional"
                  />
                  <FormField
                    label="Vencimiento"
                    flex={1}
                    type="date"
                    value={s.npVencimiento}
                    onChange={(v) => set({ npVencimiento: v })}
                    placeholder="Opcional"
                  />
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span style={{ font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>
                  Markup sobre el costo
                </span>
                <div style={{ display: "flex", gap: 7 }}>
                  {[20, 30, 40, 50].map((m) => {
                    const on = Math.abs(npMarkupCalc - m) < 0.5;
                    return (
                      <button
                        key={m}
                        onClick={() => set({ npPrecio: String(Math.round(npCostoNum * (1 + m / 100))) })}
                        style={{
                          flex: 1,
                          borderRadius: 11,
                          padding: "11px 8px",
                          cursor: "pointer",
                          font: "600 12.5px/1 var(--font-barlow),Barlow,sans-serif",
                          background: on ? "#EAF3EF" : t.card,
                          color: on ? "#1F5C46" : t.ink2,
                          border: `1.5px solid ${on ? "#1C8C84" : t.border}`,
                        }}
                      >
                        {m}%
                      </button>
                    );
                  })}
                </div>
              </div>
              <KeyValue
                k="Markup resultante"
                v={npCostoNum > 0 && npPrecioNum > 0 ? `${Math.round(npMarkupCalc)}%` : "—"}
                vInk={npMarkupCalc < 0 ? "#B0322F" : "#1F5C46"}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span style={{ font: "600 11.5px/1 var(--font-barlow),Barlow,sans-serif", color: t.ink2 }}>IVA de venta</span>
                <OptionRow
                  options={["10%", "5%", "Exenta"]}
                  activo={s.npIva}
                  onPick={(k) => set({ npIva: k as typeof s.npIva })}
                />
              </div>
            </Card>

            <Card gap={14}>
              <SectionLabel>Stock inicial y valuación</SectionLabel>
              <div style={{ display: "flex", gap: 10 }}>
                <FormField
                  label="Stock inicial"
                  flex={1}
                  inputMode="decimal"
                  value={s.npStock}
                  onChange={(v) => set({ npStock: v.replace(/[^0-9.]/g, "") })}
                  placeholder="0"
                />
                <FormField
                  label="Stock mínimo"
                  flex={1}
                  inputMode="decimal"
                  value={s.npMinimo}
                  onChange={(v) => set({ npMinimo: v.replace(/[^0-9.]/g, "") })}
                  placeholder="12"
                />
              </div>
            </Card>

            {s.npError && (
              <Notice bg="#FBE9E7" ink="#8C2F2B" border="#E8B4AE">
                Completá el nombre (2 letras o más), el costo y el precio.
              </Notice>
            )}

            {/* El error del backend va aparte del de validación: uno lo
                arregla la persona, el otro no, y mezclarlos hace buscar el
                campo equivocado. */}
            {s.npErrorTexto && (
              <Notice bg="#FBE9E7" ink="#8C2F2B" border="#E8B4AE">
                {s.npErrorTexto}
              </Notice>
            )}
          </ScrollBody>

          <div style={{ padding: "11px 14px 13px", background: t.card, borderTop: `1px solid ${t.border}` }}>
            <button
              onClick={editando ? guardarEdicion : guardarProducto}
              disabled={s.npGuardando}
              style={{
                width: "100%",
                height: 50,
                border: 0,
                borderRadius: 13,
                color: "#fff",
                font: "600 14.5px/1 var(--font-barlow),Barlow,sans-serif",
                cursor: s.npGuardando ? "default" : "pointer",
                background: npPuede ? AZUL : "#5C7A85",
                opacity: s.npGuardando ? 0.6 : 1,
              }}
            >
              {s.npGuardando ? "Guardando…" : editando ? "Guardar cambios" : "Guardar producto"}
            </button>
          </div>
        </>
      )}

      {s.iSub === "lista" && <BottomNav />}
    </div>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IVAS } from "@/lib/data";
import { escucharAvisos, pushPreferido } from "@/lib/push";
import { MODULES, THEME } from "@/lib/theme";
import { usaSupabase } from "@/lib/repo";
import { activarTenant } from "@/lib/supabase/client";
import { resolverTenant } from "@/lib/tenant/directory";
import { leerUltimoCodigo } from "@/lib/tenant/storage";
import { mensajeTenantError } from "@/lib/tenant/types";
import type { ChatMsg, ModuleKey, ThemeTokens } from "@/lib/types";
import { initialState, type AppState, type Screen } from "./state";

/** Pantallas a las que un aviso push puede llevar. */
const PANTALLAS_AVISO: Screen[] = [
  "home",
  "detventas",
  "inventario",
  "clientes",
  "compras",
  "conversaciones",
];

type Patch = Partial<AppState>;

interface AppApi {
  s: AppState;
  /** Theme tokens for the active light/dark mode. */
  t: ThemeTokens;
  set: (patch: Patch) => void;
  /** Step a product's quantity in the sale cart, removing it at zero. */
  qty: (id: string, d: number) => void;
  /** Cycle a sale line between 10% → 5% → EXENTA. */
  rotarIva: (id: string) => void;
  /** Step a purchase line's quantity, dropping the line at zero. */
  kQty: (i: number, d: number) => void;
  kRotarIva: (i: number) => void;
  abrirChat: (id: string) => void;
  pushMsg: (id: string, msg: ChatMsg) => void;
  startGrab: () => void;
  stopGrab: () => void;
  go: (k: ModuleKey) => void;
  /**
   * Resuelve el código de empresa a una instalación concreta.
   * Devuelve true si se pudo; en caso contrario deja el mensaje en `s.tenantError`.
   */
  elegirInstalacion: (codigo: string) => Promise<boolean>;
}

const Ctx = createContext<AppApi | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<AppState>(initialState);
  const grabTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const set = useCallback((patch: Patch) => {
    setS((prev) => ({ ...prev, ...patch }));
  }, []);

  const startGrab = useCallback(() => {
    setS((prev) => ({ ...prev, xGrab: true, xSeg: 0, xPanel: "none" }));
    if (grabTimer.current) clearInterval(grabTimer.current);
    grabTimer.current = setInterval(() => {
      setS((prev) => ({ ...prev, xSeg: prev.xSeg + 1 }));
    }, 1000);
  }, []);

  const stopGrab = useCallback(() => {
    if (grabTimer.current) {
      clearInterval(grabTimer.current);
      grabTimer.current = null;
    }
  }, []);

  // El último código usado vive en el dispositivo, así que se lee después del
  // montaje: leerlo durante el render rompería la hidratación.
  useEffect(() => {
    const ultimo = leerUltimoCodigo();
    // Si este celular ya entró con un código, damos por contestada la pregunta.
    if (ultimo) setS((prev) => ({ ...prev, codigoEmpresa: ultimo, tieneErp: true }));
    // La preferencia de avisos también vive en el dispositivo. Acá sólo se refleja
    // en el switch; el token se vuelve a registrar al entrar (ver LoginScreen).
    if (pushPreferido()) setS((prev) => ({ ...prev, push: true }));
  }, []);

  // Tocar un aviso desde la bandeja tiene que abrir la pantalla que corresponde,
  // no dejar la app donde estaba. El servidor manda a dónde ir en `data.pantalla`.
  useEffect(() => {
    void escucharAvisos((pantalla) => {
      // Lista blanca: lo que manda el servidor no decide a qué pantalla saltar sin
      // pasar por acá, y "login" o "recupero" nunca son destino de un aviso.
      if (!PANTALLAS_AVISO.includes(pantalla as Screen)) return;
      setS((prev) => (prev.screen === "login" ? prev : { ...prev, screen: pantalla as Screen }));
    });
  }, []);

  const elegirInstalacion = useCallback(async (codigo: string) => {
    setS((prev) => ({ ...prev, tenantResolviendo: true, tenantError: "" }));
    try {
      const tenant = await resolverTenant(codigo);
      // Con Supabase hay que dejar el cliente apuntando a esa instalación ANTES
      // de validar las credenciales: la cuenta vive en ese proyecto, no en otro.
      if (usaSupabase) activarTenant(tenant);
      setS((prev) => ({
        ...prev,
        tenant,
        codigoEmpresa: tenant.codigo,
        tenantResolviendo: false,
        tenantError: "",
      }));
      return true;
    } catch (e) {
      setS((prev) => ({
        ...prev,
        tenant: null,
        tenantResolviendo: false,
        tenantError: mensajeTenantError(e),
      }));
      return false;
    }
  }, []);

  // El intervalo tiene que morir con el provider, o sigue tocando el estado.
  useEffect(
    () => () => {
      if (grabTimer.current) clearInterval(grabTimer.current);
    },
    [],
  );

  const qty = useCallback((id: string, d: number) => {
    setS((prev) => {
      const cart = { ...prev.vCart };
      const n = (cart[id] || 0) + d;
      if (n <= 0) delete cart[id];
      else cart[id] = n;
      return { ...prev, vCart: cart };
    });
  }, []);

  const rotarIva = useCallback((id: string) => {
    setS((prev) => {
      const map = { ...prev.vIva };
      const cur = map[id] || "10%";
      map[id] = IVAS[(IVAS.indexOf(cur) + 1) % IVAS.length];
      return { ...prev, vIva: map };
    });
  }, []);

  const kQty = useCallback((i: number, d: number) => {
    setS((prev) => {
      const arr = prev.kLineas.slice();
      const line = arr[i];
      if (!line) return prev;
      const n = line.cantidad + d;
      if (n <= 0) return { ...prev, kLineas: arr.filter((_, j) => j !== i) };
      arr[i] = { ...line, cantidad: n };
      return { ...prev, kLineas: arr };
    });
  }, []);

  const kRotarIva = useCallback((i: number) => {
    const orden = ["10%", "5%", "Exenta"] as const;
    setS((prev) => {
      const arr = prev.kLineas.slice();
      const line = arr[i];
      if (!line) return prev;
      arr[i] = { ...line, iva: orden[(orden.indexOf(line.iva) + 1) % orden.length] };
      return { ...prev, kLineas: arr };
    });
  }, []);

  const abrirChat = useCallback((id: string) => {
    setS((prev) => ({
      ...prev,
      screen: "conversaciones",
      xSub: "chat",
      xSel: id,
      xTexto: "",
      xLeidos: { ...prev.xLeidos, [id]: true },
      xPanel: "none",
      xGrab: false,
      xSeg: 0,
    }));
  }, []);

  const pushMsg = useCallback((id: string, msg: ChatMsg) => {
    setS((prev) => ({
      ...prev,
      xEnviados: { ...prev.xEnviados, [id]: (prev.xEnviados[id] || []).concat([msg]) },
      xTexto: "",
      xPanel: "none",
    }));
  }, []);

  const go = useCallback((k: ModuleKey) => {
    // Only "venta" has a real screen of its own; the rest fall back to the
    // placeholder module screen unless they have a dedicated entry point.
    setS((prev) => ({ ...prev, screen: k === "venta" ? "venta" : "module", mod: k }));
  }, []);

  const value = useMemo<AppApi>(
    () => ({
      s,
      t: THEME[s.theme],
      set,
      qty,
      rotarIva,
      kQty,
      kRotarIva,
      abrirChat,
      pushMsg,
      startGrab,
      stopGrab,
      go,
      elegirInstalacion,
    }),
    [s, set, qty, rotarIva, kQty, kRotarIva, abrirChat, pushMsg, startGrab, stopGrab, go, elegirInstalacion],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export { MODULES };

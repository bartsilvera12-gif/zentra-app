/**
 * Implementación completa de los puertos sobre Supabase.
 *
 * El cliente lo activa el login al resolver el código de empresa; acá sólo se
 * arma el objeto que consumen las pantallas.
 */
import type { Repo } from "./ports";
import { supabaseAuth } from "./supabase-auth";
import {
  chatsRepo,
  clientesRepo,
  comprasRepo,
  dispositivosRepo,
  inventarioRepo,
  proveedoresRepo,
  reportesRepo,
  ventasRepo,
} from "./supabase-datos";

export const supabaseRepo: Repo = {
  auth: supabaseAuth,
  clientes: clientesRepo,
  proveedores: proveedoresRepo,
  inventario: inventarioRepo,
  ventas: ventasRepo,
  compras: comprasRepo,
  chats: chatsRepo,
  reportes: reportesRepo,
  dispositivos: dispositivosRepo,
};

export { registrar } from "./supabase-auth";

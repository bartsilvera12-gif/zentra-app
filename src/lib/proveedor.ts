/**
 * Armar un proveedor nuevo a partir de un formulario.
 *
 * Vive acá y no dentro de una pantalla porque ahora se carga desde dos lados:
 * desde Proveedores y desde el paso de proveedor de una compra. Si cada
 * pantalla lo armara por su cuenta, uno de los dos caminos iba a quedar con
 * campos distintos, y el proveedor cargado desde la compra se iba a ver
 * incompleto en la ficha. Es el típico detalle que nadie nota hasta que un
 * cliente pregunta por qué un proveedor no tiene rubro.
 */
import type { Proveedor } from "./types";

export interface CamposProveedor {
  nombre: string;
  doc?: string;
  rubro?: string;
  ciudad?: string;
  contacto?: string;
  tel?: string;
  email?: string;
  credito?: boolean;
  plazo?: number;
  entrega?: string | number;
}

/** El nombre es lo único obligatorio: con menos de dos letras no es un nombre. */
export function nombreValido(nombre: string): boolean {
  return nombre.trim().length >= 2;
}

/**
 * El id de los que se cargan en el teléfono.
 *
 * Lleva prefijo propio para que nunca choque con un id del ERP y para que, al
 * guardarlo contra el backend, se sepa que es de esta sesión.
 */
export function idLocal(existentes: Proveedor[]): string {
  return "pvn" + (existentes.length + 1);
}

/**
 * Los vacíos no quedan vacíos: quedan con el texto que la ficha muestra
 * ("Sin rubro", "—"). Así la ficha no tiene que decidir qué poner en cada
 * hueco, y el que cargó el proveedor ve de una qué le falta completar.
 */
export function nuevoProveedor(c: CamposProveedor, existentes: Proveedor[]): Proveedor {
  const nombre = c.nombre.trim();
  const doc = (c.doc ?? "").trim();
  return {
    id: idLocal(existentes),
    nombre,
    doc: doc ? "RUC " + doc : "Sin RUC",
    condicion: c.credito ? `Crédito ${c.plazo ?? 30} días` : "Contado",
    rubro: (c.rubro ?? "").trim() || "Sin rubro",
    ciudad: (c.ciudad ?? "").trim() || "Sin ciudad",
    contacto: (c.contacto ?? "").trim() || nombre,
    tel: (c.tel ?? "").trim() || "—",
    email: (c.email ?? "").trim() || "—",
    estado: "Activo",
    entrega: Number(c.entrega) || 1,
    chatId: null,
  };
}

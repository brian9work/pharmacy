// Reglas de inventario. Funciones puras: sirven en servidor y navegador.

import { diasEntre } from "@/lib/formato";
import type { Lote, Producto, TipoReceta } from "@/lib/tipos";

/** Un lote se marca "por caducar" a partir de estos días antes. */
export const DIAS_AVISO_CADUCIDAD = 90;

export type EstadoCaducidad = "caducado" | "por-caducar" | "vigente";

export function estadoCaducidad(caducidad: string, hoy: string): EstadoCaducidad {
  const dias = diasEntre(hoy, caducidad);
  if (dias < 0) return "caducado";
  if (dias <= DIAS_AVISO_CADUCIDAD) return "por-caducar";
  return "vigente";
}

/** Primero lo que caduca antes (FEFO). */
export function ordenarFEFO(lotes: Lote[]): Lote[] {
  return [...lotes].sort((a, b) => a.caducidad.localeCompare(b.caducidad));
}

/** Lotes que se pueden vender hoy: con piezas, sin bloqueo y sin caducar. */
export function lotesVendibles(lotes: Lote[], hoy: string): Lote[] {
  return ordenarFEFO(lotes).filter(
    (l) => l.cantidad > 0 && l.estado === "disponible" && estadoCaducidad(l.caducidad, hoy) !== "caducado",
  );
}

export function sumarPiezas(lotes: Lote[]): number {
  return lotes.reduce((suma, l) => suma + l.cantidad, 0);
}

export interface Asignacion {
  loteId: string;
  numero: string;
  caducidad: string;
  cantidad: number;
}

/**
 * Reparte `cantidad` piezas entre los lotes vendibles, del que caduca antes
 * al que caduca después. Devuelve `null` si no alcanza.
 */
export function asignarFEFO(vendibles: Lote[], cantidad: number): Asignacion[] | null {
  const asignaciones: Asignacion[] = [];
  let faltan = cantidad;
  for (const lote of vendibles) {
    if (faltan === 0) break;
    const tomar = Math.min(lote.cantidad, faltan);
    asignaciones.push({ loteId: lote.id, numero: lote.numero, caducidad: lote.caducidad, cantidad: tomar });
    faltan -= tomar;
  }
  return faltan === 0 ? asignaciones : null;
}

export type Alerta = "sin-existencia" | "stock-bajo" | "caducado" | "por-caducar" | "cuarentena";

export function alertasDe(producto: Producto, lotes: Lote[], hoy: string): Alerta[] {
  const alertas: Alerta[] = [];
  const vendible = sumarPiezas(lotesVendibles(lotes, hoy));
  const conPiezas = lotes.filter((l) => l.cantidad > 0);

  if (vendible === 0) alertas.push("sin-existencia");
  else if (vendible < producto.stockMinimo) alertas.push("stock-bajo");

  if (conPiezas.some((l) => estadoCaducidad(l.caducidad, hoy) === "caducado")) alertas.push("caducado");
  if (conPiezas.some((l) => l.estado === "disponible" && estadoCaducidad(l.caducidad, hoy) === "por-caducar")) {
    alertas.push("por-caducar");
  }
  if (conPiezas.some((l) => l.estado === "cuarentena")) alertas.push("cuarentena");
  return alertas;
}

export function requiereReceta(producto: Pick<Producto, "clasificacion" | "requiereReceta">): boolean {
  return producto.requiereReceta || producto.clasificacion !== "libre";
}

/** La receta que pide un carrito: la más estricta de sus productos, o null si ninguno la pide. */
export function tipoReceta(productos: Pick<Producto, "clasificacion" | "requiereReceta">[]): TipoReceta | null {
  if (productos.some((p) => p.clasificacion === "controlado")) return "controlado";
  if (productos.some((p) => p.clasificacion === "antibiotico")) return "antibiotico";
  if (productos.some((p) => p.requiereReceta)) return "simple";
  return null;
}

/** Separa el IVA de un importe que ya lo incluye. */
export function desglosarIva(importe: number, iva: number): { base: number; impuesto: number } {
  const base = Math.round(importe / (1 + iva / 100));
  return { base, impuesto: importe - base };
}

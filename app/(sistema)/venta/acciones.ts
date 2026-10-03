"use server";

import { refresh } from "next/cache";
import { obtenerTicket } from "@/lib/consultas";
import { mensajeDeError, type Resultado } from "@/lib/errores";
import { clienteServidor } from "@/lib/supabase/servidor";
import type { MetodoPago, Ticket } from "@/lib/tipos";

const METODOS: MetodoPago[] = ["efectivo", "tarjeta", "transferencia"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Cobro {
  partidas: { productoId: string; cantidad: number }[];
  metodo: MetodoPago;
  /** Centavos recibidos en efectivo; null = pago exacto. */
  recibido: number | null;
}

/** Cobra la venta. Precios, IVA, lotes y totales los calcula la base (registrar_venta). */
export async function cobrarVenta(cobro: Cobro): Promise<Resultado<{ folio: string; total: number; cambio: number | null; ticket: Ticket | null }>> {
  const valida =
    Array.isArray(cobro.partidas) &&
    cobro.partidas.length > 0 &&
    cobro.partidas.length <= 200 &&
    cobro.partidas.every((p) => UUID.test(p.productoId) && Number.isInteger(p.cantidad) && p.cantidad > 0 && p.cantidad <= 10_000) &&
    METODOS.includes(cobro.metodo) &&
    (cobro.recibido === null || (Number.isInteger(cobro.recibido) && cobro.recibido >= 0));
  if (!valida) return { ok: false, error: "La venta tiene datos no válidos." };

  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("registrar_venta", {
    p_partidas: cobro.partidas.map((p) => ({ producto_id: p.productoId, cantidad: p.cantidad })),
    p_metodo: cobro.metodo,
    p_recibido: cobro.metodo === "efectivo" ? cobro.recibido : null,
  });
  if (error) return { ok: false, error: mensajeDeError(error) };

  const venta = data as { venta_id: string; folio: string; total: number; cambio: number | null };
  // El ticket se arma con lo guardado. Si falla la lectura, la venta ya quedó cobrada.
  const ticket = await obtenerTicket(venta.venta_id).catch(() => null);

  refresh();
  return { ok: true, datos: { folio: venta.folio, total: venta.total, cambio: venta.cambio, ticket } };
}

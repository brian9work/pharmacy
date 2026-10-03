"use server";

import { refresh } from "next/cache";
import { obtenerHoy, obtenerTicket } from "@/lib/consultas";
import { mensajeDeError, type Resultado } from "@/lib/errores";
import { clienteServidor } from "@/lib/supabase/servidor";
import type { MetodoPago, Ticket } from "@/lib/tipos";
import { validarReceta, type CamposReceta } from "@/lib/validacion-receta";

const METODOS: MetodoPago[] = ["efectivo", "tarjeta", "transferencia"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Cobro {
  partidas: { productoId: string; cantidad: number }[];
  metodo: MetodoPago;
  /** Centavos recibidos en efectivo; null = pago exacto. */
  recibido: number | null;
  /** Obligatoria si algún producto requiere receta (la base lo exige). */
  receta: CamposReceta | null;
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

  // Forma de la receta; si hace falta y si es de controlado lo decide la base con los productos.
  let receta: CamposReceta | null = null;
  if (cobro.receta) {
    const lectura = validarReceta(
      {
        medico: String(cobro.receta.medico ?? ""),
        cedula: String(cobro.receta.cedula ?? ""),
        fecha: String(cobro.receta.fecha ?? ""),
        folio: String(cobro.receta.folio ?? ""),
        retenida: cobro.receta.retenida === true,
      },
      "simple",
      await obtenerHoy(),
    );
    if (!lectura.ok) return { ok: false, error: lectura.error };
    receta = lectura.receta;
  }

  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("registrar_venta", {
    p_partidas: cobro.partidas.map((p) => ({ producto_id: p.productoId, cantidad: p.cantidad })),
    p_metodo: cobro.metodo,
    p_recibido: cobro.metodo === "efectivo" ? cobro.recibido : null,
    p_receta: receta,
  });
  if (error) return { ok: false, error: mensajeDeError(error) };

  const venta = data as { venta_id: string; folio: string; total: number; cambio: number | null };
  // El ticket se arma con lo guardado. Si falla la lectura, la venta ya quedó cobrada.
  const ticket = await obtenerTicket(venta.venta_id).catch(() => null);

  refresh();
  return { ok: true, datos: { folio: venta.folio, total: venta.total, cambio: venta.cambio, ticket } };
}

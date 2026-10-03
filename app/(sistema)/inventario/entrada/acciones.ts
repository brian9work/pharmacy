"use server";

import { refresh } from "next/cache";
import { mensajeDeError, type Resultado } from "@/lib/errores";
import { clienteServidor } from "@/lib/supabase/servidor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface Entrada {
  proveedorId: string;
  factura: string;
  fecha: string;
  partidas: { productoId: string; lote: string; caducidad: string; cantidad: number; costo: number }[];
}

export async function guardarEntrada(entrada: Entrada): Promise<Resultado<{ piezas: number }>> {
  const valida =
    UUID.test(entrada.proveedorId) &&
    entrada.factura.trim().length > 0 &&
    entrada.factura.length <= 60 &&
    FECHA.test(entrada.fecha) &&
    Array.isArray(entrada.partidas) &&
    entrada.partidas.length > 0 &&
    entrada.partidas.length <= 300 &&
    entrada.partidas.every(
      (p) =>
        UUID.test(p.productoId) &&
        p.lote.trim().length > 0 &&
        p.lote.length <= 40 &&
        FECHA.test(p.caducidad) &&
        Number.isInteger(p.cantidad) &&
        p.cantidad > 0 &&
        p.cantidad <= 100_000 &&
        Number.isInteger(p.costo) &&
        p.costo >= 0,
    );
  if (!valida) return { ok: false, error: "La entrada tiene datos incompletos o no válidos." };

  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("registrar_entrada", {
    p_proveedor: entrada.proveedorId,
    p_factura: entrada.factura.trim(),
    p_fecha: entrada.fecha,
    p_partidas: entrada.partidas.map((p) => ({
      producto_id: p.productoId,
      lote: p.lote.trim(),
      caducidad: p.caducidad,
      cantidad: p.cantidad,
      costo: p.costo,
    })),
  });
  if (error) return { ok: false, error: mensajeDeError(error) };

  refresh();
  return { ok: true, datos: { piezas: (data as { piezas: number }).piezas } };
}

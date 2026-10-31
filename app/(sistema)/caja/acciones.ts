"use server";

import { refresh } from "next/cache";
import { mensajeDeError, type Resultado } from "@/lib/errores";
import { clienteServidor } from "@/lib/supabase/servidor";

const MAXIMO = 100_000_000; // $1,000,000.00

export async function abrirCaja(fondo: number): Promise<Resultado> {
  if (!Number.isInteger(fondo) || fondo < 0 || fondo > MAXIMO) return { ok: false, error: "El fondo inicial no es válido." };

  const supabase = await clienteServidor();
  const { error } = await supabase.rpc("abrir_turno", { p_fondo: fondo });
  if (error) return { ok: false, error: mensajeDeError(error) };

  refresh();
  return { ok: true, datos: undefined };
}

/** Cierra la caja propia. El efectivo esperado lo calcula la base. */
export async function cerrarCaja(
  contado: number,
  conteo: Record<string, number>,
): Promise<Resultado<{ contado: number; esperado: number; diferencia: number }>> {
  const conteoValido = Object.entries(conteo).every(([d, n]) => /^\d{1,6}$/.test(d) && Number.isInteger(n) && n >= 0 && n <= 100_000);
  if (!Number.isInteger(contado) || contado < 0 || contado > MAXIMO || !conteoValido) {
    return { ok: false, error: "El conteo no es válido." };
  }

  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("cerrar_turno", { p_contado: contado, p_conteo: conteo });
  if (error) return { ok: false, error: mensajeDeError(error) };

  refresh();
  return { ok: true, datos: data as { contado: number; esperado: number; diferencia: number } };
}

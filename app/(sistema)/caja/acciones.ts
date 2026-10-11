"use server";

import { refresh } from "next/cache";
import { mensajeDeError, type Resultado } from "@/lib/errores";
import { consultarFila, intentar } from "@/lib/db/sesion";

const MAXIMO = 100_000_000; // $1,000,000.00

export async function abrirCaja(fondo: number): Promise<Resultado> {
  if (!Number.isInteger(fondo) || fondo < 0 || fondo > MAXIMO) return { ok: false, error: "El fondo inicial no es válido." };

  const { error } = await intentar(consultarFila("select abrir_turno($1)", [fondo]));
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

  const { datos, error } = await intentar(
    consultarFila<{ r: { contado: number; esperado: number; diferencia: number } }>("select cerrar_turno($1, $2) as r", [contado, conteo]),
  );
  if (error) return { ok: false, error: mensajeDeError(error) };

  refresh();
  return { ok: true, datos: datos!.r };
}

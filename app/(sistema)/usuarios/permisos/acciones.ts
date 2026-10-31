"use server";

import { refresh } from "next/cache";
import { CLAVES_PERMISO, type ClavePermiso } from "@/config/permisos";
import { mensajeDeError, type Resultado } from "@/lib/errores";
import { consultar, intentar } from "@/lib/db/sesion";

/** Reemplaza los permisos del rol empleado. La base rechaza los de solo admin. */
export async function guardarPermisosEmpleado(claves: string[]): Promise<Resultado> {
  if (!Array.isArray(claves) || !claves.every((c) => CLAVES_PERMISO.includes(c as ClavePermiso))) {
    return { ok: false, error: "Hay permisos que no existen." };
  }

  const { error } = await intentar(consultar("select guardar_permisos_empleado($1)", [[...new Set(claves)]]));
  if (error) return { ok: false, error: mensajeDeError(error) };

  refresh();
  return { ok: true, datos: undefined };
}

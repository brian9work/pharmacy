"use server";

import { refresh } from "next/cache";
import { mensajeDeError } from "@/lib/errores";
import { consultar, intentar } from "@/lib/db/sesion";
import { configuracion as textos } from "./contenido";

export interface EstadoFormulario {
  error?: string;
  ok?: boolean;
}

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

export async function guardarNegocio(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const texto = (nombre: string) => String(formulario.get(nombre) ?? "").trim();
  const datos = {
    razon_social: texto("razonSocial"),
    rfc: texto("rfc").toUpperCase(),
    direccion: texto("direccion"),
    telefono: texto("telefono"),
    pie_ticket: texto("pieTicket"),
  };
  if (Object.values(datos).some((v) => v.length > 300)) return { error: textos.errores.largo };
  if (datos.rfc && !RFC.test(datos.rfc)) return { error: textos.errores.rfc };

  // La regla RLS exige el permiso configuracion.editar: sin él no se actualiza ninguna fila.
  const { datos: filas, error } = await intentar(
    consultar(
      "update negocio set razon_social = $1, rfc = $2, direccion = $3, telefono = $4, pie_ticket = $5 where id = 1 returning id",
      [datos.razon_social, datos.rfc, datos.direccion, datos.telefono, datos.pie_ticket],
    ),
  );
  if (error) return { error: mensajeDeError(error) };
  if (!filas.length) return { error: textos.errores.permiso };

  refresh();
  return { ok: true };
}

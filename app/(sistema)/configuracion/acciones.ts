"use server";

import { refresh } from "next/cache";
import { mensajeDeError } from "@/lib/errores";
import { clienteServidor } from "@/lib/supabase/servidor";
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
  const supabase = await clienteServidor();
  const { data, error } = await supabase.from("negocio").update(datos).eq("id", 1).select("id");
  if (error) return { error: mensajeDeError(error) };
  if (!data?.length) return { error: textos.errores.permiso };

  refresh();
  return { ok: true };
}

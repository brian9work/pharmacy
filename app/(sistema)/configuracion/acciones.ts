"use server";

import { refresh } from "next/cache";
import { puede } from "@/lib/consultas";
import { consultar, consultarFila, intentar } from "@/lib/db/sesion";
import { mensajeDeError } from "@/lib/errores";
import { nubeDesdeEntorno } from "@/lib/nube";
import { ErrorNube } from "@/lib/nube-http";
import { sincronizar, type DatosLocales, type Local, type ResumenSubida } from "@/lib/subir-datos";
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

export interface EstadoSubida {
  error?: string;
  resumen?: ResumenSubida;
}

/** Sube a la nube lo que aún no está allá. Ver lib/subir-datos.ts. */
export async function subirDatos(): Promise<EstadoSubida> {
  if (!(await puede("configuracion.editar"))) return { error: textos.errores.permiso };
  const nube = nubeDesdeEntorno();
  if (!nube) return { error: textos.nube.sinConfigurar };

  const local: Local = {
    iniciar: async () => (await consultarFila<{ r: { id: number; desde: string } }>("select iniciar_sincronizacion() as r"))!.r,
    datos: async (desde) => (await consultarFila<{ d: DatosLocales }>("select datos_para_subir($1) as d", [desde]))!.d,
    terminar: async (id, ok, resumen, error) => {
      await consultar("select terminar_sincronizacion($1, $2, $3, $4)", [id, ok, resumen ? JSON.stringify(resumen) : null, error]);
    },
  };

  try {
    const resumen = await sincronizar(local, nube);
    refresh();
    return { resumen };
  } catch (error) {
    refresh();
    return { error: mensajeSubida(error) };
  }
}

function mensajeSubida(error: unknown): string {
  if (error instanceof ErrorNube) return error.message;
  const { code, message } = error as { code?: string; message?: string };
  // P0001: mensajes que escribimos en la base (por ejemplo "Ya hay una subida en curso").
  if (code === "P0001" && message) return message;
  // 42883 / 42P01: la base local no tiene la actualización.
  if (code === "42883" || code === "42P01") return textos.nube.sinActualizar;
  console.error(error);
  return textos.errores.subida;
}

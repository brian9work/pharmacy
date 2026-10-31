"use server";

import { refresh } from "next/cache";
import { puede } from "@/lib/consultas";
import { mensajeDeError } from "@/lib/errores";
import { consultar, intentar } from "@/lib/db/sesion";
import { catalogos as textos } from "./contenido";

export interface EstadoFormulario {
  error?: string;
  ok?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const mensaje = (error: { code?: string; message: string }) => (error.code === "23505" ? textos.errores.repetido : mensajeDeError(error));

// Las reglas RLS de categorías y proveedores exigen productos.crear; aquí se revisa antes para dar un mensaje claro.

export async function guardarProveedor(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  if (!(await puede("productos.crear"))) return { error: textos.errores.permiso };

  const texto = (nombre: string) => String(formulario.get(nombre) ?? "").trim();
  const id = texto("id");
  const datos = {
    nombre: texto("nombre"),
    rfc: texto("rfc").toUpperCase(),
    telefono: texto("telefono"),
    correo: texto("correo").toLowerCase(),
    activo: formulario.get("activo") !== "off",
  };
  if (!datos.nombre) return { error: textos.errores.nombre };
  if (datos.nombre.length > 120 || datos.telefono.length > 40 || datos.correo.length > 254) return { error: textos.errores.largo };
  if (datos.rfc && !RFC.test(datos.rfc)) return { error: textos.errores.rfc };
  if (datos.correo && !CORREO.test(datos.correo)) return { error: textos.errores.correo };

  const valores = [datos.nombre, datos.rfc, datos.telefono, datos.correo, datos.activo];
  const { error } = id
    ? UUID.test(id)
      ? await intentar(consultar("update proveedores set nombre = $1, rfc = $2, telefono = $3, correo = $4, activo = $5 where id = $6", [...valores, id]))
      : { error: { message: "id no válido" } }
    : await intentar(consultar("insert into proveedores (nombre, rfc, telefono, correo, activo) values ($1, $2, $3, $4, $5)", valores));
  if (error) return { error: mensaje(error) };

  refresh();
  return { ok: true };
}

export async function guardarCategoria(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  if (!(await puede("productos.crear"))) return { error: textos.errores.permiso };

  const id = String(formulario.get("id") ?? "");
  const nombre = String(formulario.get("nombre") ?? "").trim();
  if (!nombre) return { error: textos.errores.nombre };
  if (nombre.length > 60) return { error: textos.errores.largo };

  const { error } = id
    ? /^\d+$/.test(id)
      ? await intentar(consultar("update categorias set nombre = $1 where id = $2", [nombre, Number(id)]))
      : { error: { message: "id no válido" } }
    : await intentar(consultar("insert into categorias (nombre) values ($1)", [nombre]));
  if (error) return { error: mensaje(error) };

  refresh();
  return { ok: true };
}

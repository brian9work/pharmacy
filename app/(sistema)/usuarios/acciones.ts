"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion, puede } from "@/lib/consultas";
import { mensajeDeError } from "@/lib/errores";
import { consultar, consultarFila, intentar } from "@/lib/db/sesion";
import { usuarios as textos } from "./contenido";

export interface EstadoFormulario {
  error?: string;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LARGO_MINIMO = 10;

export async function crearUsuario(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  if (!(await puede("usuarios.gestionar"))) return { error: textos.errores.permiso };

  const nombre = String(formulario.get("nombre") ?? "").trim();
  const correo = String(formulario.get("correo") ?? "").trim().toLowerCase();
  const contrasena = String(formulario.get("contrasena") ?? "");
  const rol = String(formulario.get("rol") ?? "");

  if (!nombre || nombre.length > 120) return { error: textos.errores.nombre };
  if (!CORREO.test(correo) || correo.length > 254) return { error: textos.errores.correo };
  if (contrasena.length < LARGO_MINIMO) return { error: textos.errores.contrasena };
  if (rol !== "admin" && rol !== "empleado") return { error: textos.errores.rol };

  // La base vuelve a revisar el permiso y guarda solo el hash de la contraseña temporal.
  const { error } = await intentar(consultarFila("select crear_usuario($1, $2, $3, $4)", [nombre, correo, contrasena, rol]));
  if (error) {
    if (error.code === "23505" || error.message.startsWith("Ya existe una cuenta")) return { error: textos.errores.existe };
    return { error: mensajeDeError(error) };
  }

  redirect("/usuarios");
}

export async function cambiarEstadoUsuario(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  if (!(await puede("usuarios.gestionar"))) return { error: textos.errores.permiso };

  const id = String(formulario.get("id") ?? "");
  const activo = formulario.get("activo") === "true";
  const { usuario } = await obtenerSesion();
  if (id === usuario.id) return { error: textos.errores.propia };
  if (!UUID.test(id)) return { error: textos.errores.noExiste };

  // Al bloquear, la base cierra también todas las sesiones de esa cuenta.
  const { datos, error } = await intentar(consultar("update usuarios set activo = $1 where id = $2 returning id", [activo, id]));
  if (error) return { error: mensajeDeError(error) };
  if (!datos.length) return { error: textos.errores.noExiste };

  refresh();
  return {};
}

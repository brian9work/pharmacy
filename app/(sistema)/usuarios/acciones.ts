"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion, puede } from "@/lib/consultas";
import { mensajeDeError } from "@/lib/errores";
import { clienteAdmin } from "@/lib/supabase/admin";
import { clienteServidor } from "@/lib/supabase/servidor";
import { usuarios as textos } from "./contenido";

export interface EstadoFormulario {
  error?: string;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LARGO_MINIMO = 10;
/** Supabase Auth no tiene "bloqueo permanente": ~100 años equivale. */
const BLOQUEO = "876000h";

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

  // 1. La cuenta de acceso en Supabase Auth (requiere la clave de servicio).
  const admin = clienteAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre },
  });
  if (error || !data.user) {
    if (error?.code === "email_exists" || error?.status === 422) return { error: textos.errores.existe };
    return { error: mensajeDeError(error) };
  }

  // 2. Los datos de la cuenta, con la sesión de quien la crea: RLS lo valida otra vez.
  const supabase = await clienteServidor();
  const { error: errorCuenta } = await supabase
    .from("usuarios")
    .insert({ id: data.user.id, nombre, correo, rol, debe_cambiar_contrasena: true });
  if (errorCuenta) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: mensajeDeError(errorCuenta) };
  }

  redirect("/usuarios");
}

export async function cambiarEstadoUsuario(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  if (!(await puede("usuarios.gestionar"))) return { error: textos.errores.permiso };

  const id = String(formulario.get("id") ?? "");
  const activo = formulario.get("activo") === "true";
  const { usuario } = await obtenerSesion();
  if (id === usuario.id) return { error: textos.errores.propia };

  const supabase = await clienteServidor();
  const { data, error } = await supabase.from("usuarios").update({ activo }).eq("id", id).select("id");
  if (error) return { error: mensajeDeError(error) };
  if (!data?.length) return { error: textos.errores.noExiste };

  // Bloquea también en Supabase Auth para que no pueda iniciar sesión ni renovarla.
  const { error: errorAuth } = await clienteAdmin().auth.admin.updateUserById(id, { ban_duration: activo ? "none" : BLOQUEO });
  if (errorAuth) console.error(errorAuth);

  refresh();
  return {};
}

"use server";

import { redirect } from "next/navigation";
import { mensajeDeError } from "@/lib/errores";
import { clienteServidor } from "@/lib/supabase/servidor";
import { acceso, cambioContrasena } from "./contenido";

export interface EstadoFormulario {
  error?: string;
}

const LARGO_MINIMO = 10;

export async function iniciarSesion(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const correo = String(formulario.get("correo") ?? "").trim().toLowerCase();
  const contrasena = String(formulario.get("contrasena") ?? "");
  if (!correo || !contrasena) return { error: acceso.errores.faltan };

  const supabase = await clienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password: contrasena });
  if (error) {
    // Mismo mensaje si el correo no existe o la contraseña falla: no revela cuentas.
    return { error: error.status === 429 ? acceso.errores.demasiados : acceso.errores.credenciales };
  }

  // Sin cuenta activa en la farmacia no hay acceso, aunque exista en Supabase Auth.
  const { error: sinAcceso } = await supabase.rpc("registrar_acceso");
  if (sinAcceso) {
    await supabase.auth.signOut();
    return { error: acceso.errores.inactiva };
  }

  const { data: cuenta } = await supabase
    .from("usuarios")
    .select("debe_cambiar_contrasena")
    .eq("id", data.user.id)
    .maybeSingle<{ debe_cambiar_contrasena: boolean }>();

  redirect(cuenta?.debe_cambiar_contrasena ? "/cambiar-contrasena" : "/panel");
}

export async function cerrarSesion() {
  const supabase = await clienteServidor();
  await supabase.auth.signOut();
  redirect("/");
}

export async function cambiarContrasena(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const nueva = String(formulario.get("nueva") ?? "");
  const confirmar = String(formulario.get("confirmar") ?? "");
  if (nueva.length < LARGO_MINIMO) return { error: cambioContrasena.errores.corta };
  if (nueva !== confirmar) return { error: cambioContrasena.errores.distintas };

  const supabase = await clienteServidor();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/");

  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) return { error: error.message };

  const { error: errorCuenta } = await supabase.rpc("marcar_contrasena_cambiada");
  if (errorCuenta) return { error: mensajeDeError(errorCuenta) };

  redirect("/panel");
}

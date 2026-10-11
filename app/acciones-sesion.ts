"use server";

import { redirect } from "next/navigation";
import { enTransaccion } from "@/lib/db/conexion";
import { borrarToken, consultar, guardarToken, intentar, tokenActual } from "@/lib/db/sesion";
import { mensajeDeError } from "@/lib/errores";
import { acceso, cambioContrasena } from "./contenido";

export interface EstadoFormulario {
  error?: string;
}

const LARGO_MINIMO = 10;

interface Acceso {
  ok: boolean;
  error?: string;
  token?: string;
  debe_cambiar_contrasena?: boolean;
}

export async function iniciarSesion(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const correo = String(formulario.get("correo") ?? "").trim().toLowerCase();
  const contrasena = String(formulario.get("contrasena") ?? "");
  if (!correo || !contrasena) return { error: acceso.errores.faltan };

  // Sin token: iniciar_sesion() revisa la contraseña, cuenta los intentos y crea la sesión.
  const { datos, error } = await intentar(
    enTransaccion(null, (c) => c<{ r: Acceso }>("select iniciar_sesion($1, $2) as r", [correo, contrasena])),
  );
  if (error) return { error: mensajeDeError(error) };

  const r = datos[0].r;
  if (!r.ok || !r.token) {
    // Mismo mensaje si el correo no existe o la contraseña falla: no revela cuentas.
    if (r.error?.startsWith("Demasiados")) return { error: acceso.errores.demasiados };
    if (r.error?.includes("no está activa")) return { error: acceso.errores.inactiva };
    return { error: acceso.errores.credenciales };
  }

  await guardarToken(r.token);
  redirect(r.debe_cambiar_contrasena ? "/cambiar-contrasena" : "/panel");
}

export async function cerrarSesion() {
  await intentar(consultar("select cerrar_sesion()"));
  await borrarToken();
  redirect("/");
}

export async function cambiarContrasena(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const actual = String(formulario.get("actual") ?? "");
  const nueva = String(formulario.get("nueva") ?? "");
  const confirmar = String(formulario.get("confirmar") ?? "");
  if (nueva.length < LARGO_MINIMO) return { error: cambioContrasena.errores.corta };
  if (nueva !== confirmar) return { error: cambioContrasena.errores.distintas };
  if (!(await tokenActual())) redirect("/");

  // La base revisa la contraseña actual, guarda el hash y cierra las demás sesiones.
  const { error } = await intentar(consultar("select cambiar_contrasena($1, $2)", [actual, nueva]));
  if (error) return { error: mensajeDeError(error) };

  redirect("/panel");
}

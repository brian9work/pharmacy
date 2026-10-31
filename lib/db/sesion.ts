import "server-only";
import { cookies, headers } from "next/headers";
import { enTransaccion, type Consultar } from "@/lib/db/conexion";
import { COOKIE_SESION } from "@/lib/db/nombres";
import type { ErrorBase } from "@/lib/errores";

export { COOKIE_SESION };

/** Igual que la vigencia que da iniciar_sesion() en la base. */
const DURACION = 12 * 60 * 60;

export async function tokenActual(): Promise<string | null> {
  return (await cookies()).get(COOKIE_SESION)?.value ?? null;
}

/** Varias consultas en una transacción, con la sesión de la petición. */
export async function transaccion<T>(trabajo: (consultar: Consultar) => Promise<T>): Promise<T> {
  return enTransaccion(await tokenActual(), trabajo);
}

/** Una consulta con la sesión de la petición: todas pasan por las reglas RLS. */
export async function consultar<T>(texto: string, valores?: unknown[]): Promise<T[]> {
  return transaccion((c) => c<T>(texto, valores));
}

/** Primera fila o null. */
export async function consultarFila<T>(texto: string, valores?: unknown[]): Promise<T | null> {
  return (await consultar<T>(texto, valores))[0] ?? null;
}

/** Para las acciones: devuelve el error en vez de lanzarlo. */
export async function intentar<T>(promesa: Promise<T>): Promise<{ datos: T; error: null } | { datos: null; error: ErrorBase }> {
  try {
    return { datos: await promesa, error: null };
  } catch (error) {
    return { datos: null, error: error as ErrorBase };
  }
}

export async function guardarToken(token: string) {
  // Solo por HTTPS cuando lo hay (Vercel, nginx con certificado). En la red
  // local de la farmacia puede ser http y la cookie debe guardarse igual.
  const https = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    secure: https,
    sameSite: "lax",
    path: "/",
    maxAge: DURACION,
  });
}

export async function borrarToken() {
  (await cookies()).delete(COOKIE_SESION);
}

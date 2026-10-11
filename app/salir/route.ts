import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, consultar, intentar } from "@/lib/db/sesion";

// Cierra la sesión cuando ya no sirve (vencida, cerrada o de una cuenta
// bloqueada) y borra la cookie. El botón "Salir" usa la acción cerrarSesion.
export async function GET(request: NextRequest) {
  await intentar(consultar("select cerrar_sesion()"));
  const destino = new URL("/", request.url);
  if (request.nextUrl.searchParams.get("motivo") === "inactiva") destino.searchParams.set("motivo", "inactiva");
  const respuesta = NextResponse.redirect(destino);
  respuesta.cookies.delete(COOKIE_SESION);
  return respuesta;
}

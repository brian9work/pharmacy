import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION } from "@/lib/db/nombres";

/** Rutas que se ven sin sesión. */
const PUBLICAS = new Set(["/"]);

// Manda a cada quien a su lugar: sin cookie de sesión, al acceso; con ella,
// fuera del acceso. Aquí solo se mira si hay cookie: la validez del token la
// revisa la base en cada consulta (usuario_actual()) y, si ya no sirve,
// obtenerSesion() manda a /salir, que la borra.
export function proxy(request: NextRequest) {
  const conSesion = request.cookies.has(COOKIE_SESION);
  const ruta = request.nextUrl.pathname;

  if (!conSesion && !PUBLICAS.has(ruta)) return redirigir(request, "/");
  if (conSesion && PUBLICAS.has(ruta)) return redirigir(request, "/panel");
  return NextResponse.next();
}

function redirigir(request: NextRequest, destino: string) {
  const url = request.nextUrl.clone();
  url.pathname = destino;
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|marca/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { variable } from "@/lib/supabase/variables";

/** Rutas que se ven sin sesión. */
const PUBLICAS = new Set(["/"]);

// Refresca la sesión de Supabase en cada navegación y manda a cada quien
// a su lugar: sin sesión, al acceso; con sesión, fuera del acceso.
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(variable("NEXT_PUBLIC_SUPABASE_URL"), variable("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(lista, encabezados) {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
        Object.entries(encabezados).forEach(([clave, valor]) => respuesta.headers.set(clave, valor));
      },
    },
  });

  // getClaims valida el token (no solo lo lee de la cookie).
  const { data } = await supabase.auth.getClaims();
  const conSesion = Boolean(data?.claims?.sub);
  const ruta = request.nextUrl.pathname;

  if (!conSesion && !PUBLICAS.has(ruta)) return redirigir(request, respuesta, "/");
  if (conSesion && PUBLICAS.has(ruta)) return redirigir(request, respuesta, "/panel");
  return respuesta;
}

function redirigir(request: NextRequest, respuesta: NextResponse, destino: string) {
  const url = request.nextUrl.clone();
  url.pathname = destino;
  url.search = "";
  const redireccion = NextResponse.redirect(url);
  // Conserva las cookies de sesión recién refrescadas y que no se guarde en caché.
  respuesta.cookies.getAll().forEach((cookie) => redireccion.cookies.set(cookie));
  for (const clave of ["cache-control", "expires", "pragma"]) {
    const valor = respuesta.headers.get(clave);
    if (valor) redireccion.headers.set(clave, valor);
  }
  return redireccion;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|marca/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

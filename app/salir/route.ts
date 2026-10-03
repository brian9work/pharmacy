import { NextResponse, type NextRequest } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";

// Cierra la sesión cuando la cuenta ya no tiene acceso (bloqueada o sin
// cuenta en la farmacia). El botón "Salir" usa la acción cerrarSesion.
export async function GET(request: NextRequest) {
  const supabase = await clienteServidor();
  await supabase.auth.signOut();
  const destino = new URL("/", request.url);
  if (request.nextUrl.searchParams.get("motivo") === "inactiva") destino.searchParams.set("motivo", "inactiva");
  return NextResponse.redirect(destino);
}

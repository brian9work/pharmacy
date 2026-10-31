import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { variable } from "@/lib/supabase/variables";

/**
 * Cliente de Supabase con la sesión de quien hace la petición: todas sus
 * consultas pasan por las reglas RLS. Uno por petición.
 */
export const clienteServidor = cache(async () => {
  const almacen = await cookies();
  return createServerClient(variable("NEXT_PUBLIC_SUPABASE_URL"), variable("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll() {
        return almacen.getAll();
      },
      setAll(lista) {
        try {
          lista.forEach(({ name, value, options }) => almacen.set(name, value, options));
        } catch {
          // Un Server Component no puede escribir cookies; proxy.ts ya refrescó la sesión.
        }
      },
    },
  });
});

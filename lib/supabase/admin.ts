import "server-only";
import { createClient } from "@supabase/supabase-js";
import { variable } from "@/lib/supabase/variables";

/**
 * Cliente con la clave de servicio: se salta RLS. Úsalo solo para lo que
 * exige Supabase Auth (crear o bloquear cuentas) y después de comprobar
 * que quien lo pide tiene permiso. Nunca lo importes en el navegador.
 */
export function clienteAdmin() {
  return createClient(variable("NEXT_PUBLIC_SUPABASE_URL"), variable("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

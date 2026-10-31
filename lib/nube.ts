import "server-only";
import { crearNube } from "@/lib/nube-http";
import type { Nube } from "@/lib/subir-datos";

/** ¿Están las dos variables que hacen falta para hablar con Supabase? */
export function nubeConfigurada(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Supabase con la clave de servicio de .env. Nunca llega al navegador. */
export function nubeDesdeEntorno(): Nube | null {
  const url = process.env.SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && clave ? crearNube(url, clave) : null;
}

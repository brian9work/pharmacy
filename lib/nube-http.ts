// Habla con Supabase por su API (PostgREST), solo con fetch: llama a las tres
// funciones de supabase/migrations/20261031120000_subir_datos.sql.
// La clave de servicio se salta todas las reglas: este archivo solo lo usa
// lib/nube.ts, que es de servidor.

import type { Nube, RespuestaCatalogo } from "@/lib/subir-datos";

const ESPERA_MS = 120_000;

/** Un error con un mensaje que se puede mostrar tal cual. */
export class ErrorNube extends Error {}

export function crearNube(url: string, clave: string): Nube {
  const base = url.replace(/\/+$/, "");

  async function llamar<T>(funcion: string, p: unknown): Promise<T> {
    let respuesta: Response;
    try {
      respuesta = await fetch(`${base}/rest/v1/rpc/${funcion}`, {
        method: "POST",
        headers: { apikey: clave, Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p }),
        signal: AbortSignal.timeout(ESPERA_MS),
        cache: "no-store",
      });
    } catch {
      throw new ErrorNube("No se pudo conectar con Supabase. Revisa la conexión a internet y la dirección SUPABASE_URL.");
    }
    if (respuesta.ok) return (await respuesta.json()) as T;

    const detalle = (await respuesta.json().catch(() => ({}))) as { message?: string; code?: string };
    if (respuesta.status === 401 || respuesta.status === 403 || detalle.code === "42501") {
      throw new ErrorNube("Supabase rechazó la clave. Revisa SUPABASE_SERVICE_ROLE_KEY (debe ser la clave de servicio, no la pública).");
    }
    if (respuesta.status === 404 || detalle.code === "PGRST202") {
      throw new ErrorNube("La nube todavía no tiene las funciones para recibir datos. Ejecuta supabase/migrations/20261031120000_subir_datos.sql en Supabase (SQL Editor).");
    }
    throw new ErrorNube(`Supabase respondió con un error: ${detalle.message ?? respuesta.status}`);
  }

  return {
    usuarios: (correos) => llamar<Record<string, string>>("mapa_usuarios", correos),
    catalogo: (cuerpo) => llamar<RespuestaCatalogo>("subir_catalogo", cuerpo),
    operacion: (cuerpo) => llamar<Record<string, number>>("subir_operacion", cuerpo),
  };
}

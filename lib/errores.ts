const GENERICO = "No se pudo completar. Intenta de nuevo.";

/**
 * Texto para mostrar a la persona. Los errores que escribimos en las
 * funciones de la base (código P0001) ya vienen en español y se muestran
 * tal cual; el resto se registra en el servidor y se resume.
 */
export function mensajeDeError(error: { code?: string; message: string } | null | undefined, porDefecto = GENERICO): string {
  if (!error) return porDefecto;
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return "No tienes permiso para hacer esto.";
  console.error(error);
  return porDefecto;
}

export type Resultado<T = undefined> = { ok: true; datos: T } | { ok: false; error: string };

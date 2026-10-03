// Valida la receta que se captura al vender. Lógica pura para poder probarla;
// la base (registrar_venta) vuelve a exigirla y no cobra sin ella.

import type { TipoReceta } from "./tipos";

export const MENSAJES_RECETA = {
  medico: "Escribe el nombre del médico que hizo la receta.",
  cedula: "Escribe la cédula profesional del médico: de 4 a 20 letras o números.",
  fecha: "Escribe la fecha de la receta.",
  futura: "La fecha de la receta no puede ser futura.",
  retenida: "Los controlados requieren retener la receta original: marca la casilla.",
  largo: "Algún dato de la receta es demasiado largo.",
};

export interface CamposReceta {
  medico: string;
  cedula: string;
  /** "AAAA-MM-DD" */
  fecha: string;
  folio: string;
  retenida: boolean;
}

export type LecturaReceta = { ok: true; receta: CamposReceta } | { ok: false; error: string };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function fechaValida(fecha: string) {
  if (!FECHA.test(fecha)) return false;
  const [a, m, d] = fecha.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** Revisa la receta para el `tipo` que pide la venta. `hoy` es "AAAA-MM-DD" en la zona de la farmacia. */
export function validarReceta(campos: CamposReceta, tipo: TipoReceta, hoy: string): LecturaReceta {
  const medico = campos.medico.trim().replace(/\s+/g, " ");
  // Se aceptan espacios o guiones al teclear la cédula; se guarda sin ellos.
  const cedula = campos.cedula.replace(/[\s-]/g, "").toUpperCase();
  const folio = campos.folio.trim();

  if (!medico) return { ok: false, error: MENSAJES_RECETA.medico };
  if (!/^[0-9A-Z]{4,20}$/.test(cedula)) return { ok: false, error: MENSAJES_RECETA.cedula };
  if (!fechaValida(campos.fecha)) return { ok: false, error: MENSAJES_RECETA.fecha };
  if (campos.fecha > hoy) return { ok: false, error: MENSAJES_RECETA.futura };
  if (medico.length > 120 || folio.length > 40) return { ok: false, error: MENSAJES_RECETA.largo };
  if (tipo === "controlado" && !campos.retenida) return { ok: false, error: MENSAJES_RECETA.retenida };

  return { ok: true, receta: { medico, cedula, fecha: campos.fecha, folio, retenida: campos.retenida } };
}

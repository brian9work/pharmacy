// Periodos de los reportes. Fechas de calendario "AAAA-MM-DD" sin zona
// horaria: la base convierte cada día a la zona de la farmacia.

import { diaMes, diasEntre, fechaCorta, fechaLarga, mesAnio } from "@/lib/formato";

export type Periodo = "dia" | "semana" | "mes" | "anio" | "rango";

export const PERIODOS: Periodo[] = ["dia", "semana", "mes", "anio", "rango"];

/** El máximo que acepta reporte_ventas. */
export const DIAS_MAXIMOS = 366;

export interface Rango {
  periodo: Periodo;
  /** Día de referencia para moverse entre periodos. */
  ancla: string;
  desde: string;
  hasta: string;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function aUTC(fecha: string): Date {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function aTexto(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function esFecha(valor: unknown): valor is string {
  return typeof valor === "string" && FECHA.test(valor) && aTexto(aUTC(valor)) === valor;
}

export function sumarDias(fecha: string, dias: number): string {
  const f = aUTC(fecha);
  f.setUTCDate(f.getUTCDate() + dias);
  return aTexto(f);
}

function sumarMeses(fecha: string, meses: number): string {
  const f = aUTC(fecha);
  return aTexto(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + meses, 1)));
}

/** Calcula el rango a partir de los parámetros de la URL. Lo inválido cae en "este mes". */
export function resolverRango(parametros: Record<string, string | string[] | undefined>, hoy: string): Rango {
  const periodo = PERIODOS.includes(parametros.periodo as Periodo) ? (parametros.periodo as Periodo) : "mes";
  const ancla = esFecha(parametros.fecha) ? parametros.fecha : hoy;

  switch (periodo) {
    case "dia":
      return { periodo, ancla, desde: ancla, hasta: ancla };
    case "semana": {
      // Semana de lunes a domingo.
      const lunes = sumarDias(ancla, -((aUTC(ancla).getUTCDay() + 6) % 7));
      return { periodo, ancla, desde: lunes, hasta: sumarDias(lunes, 6) };
    }
    case "anio": {
      const anio = ancla.slice(0, 4);
      return { periodo, ancla, desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
    }
    case "rango": {
      const desde = esFecha(parametros.desde) ? parametros.desde : sumarDias(hoy, -29);
      let hasta = esFecha(parametros.hasta) ? parametros.hasta : hoy;
      if (hasta < desde) hasta = desde;
      if (diasEntre(desde, hasta) + 1 > DIAS_MAXIMOS) hasta = sumarDias(desde, DIAS_MAXIMOS - 1);
      return { periodo, ancla: desde, desde, hasta };
    }
    default: {
      const inicio = `${ancla.slice(0, 7)}-01`;
      return { periodo: "mes", ancla, desde: inicio, hasta: sumarDias(sumarMeses(inicio, 1), -1) };
    }
  }
}

/** Parámetros de URL del periodo anterior (-1) o siguiente (+1). */
export function moverRango(rango: Rango, sentido: 1 | -1): Record<string, string> {
  switch (rango.periodo) {
    case "dia":
      return { periodo: "dia", fecha: sumarDias(rango.ancla, sentido) };
    case "semana":
      return { periodo: "semana", fecha: sumarDias(rango.desde, 7 * sentido) };
    case "mes":
      return { periodo: "mes", fecha: sumarMeses(rango.desde, sentido) };
    case "anio":
      return { periodo: "anio", fecha: `${Number(rango.desde.slice(0, 4)) + sentido}-01-01` };
    case "rango": {
      const dias = diasEntre(rango.desde, rango.hasta) + 1;
      return { periodo: "rango", desde: sumarDias(rango.desde, dias * sentido), hasta: sumarDias(rango.hasta, dias * sentido) };
    }
  }
}

export function tituloRango(rango: Rango): string {
  switch (rango.periodo) {
    case "dia":
      return fechaLarga(rango.desde);
    case "semana":
      return `Semana del ${diaMes(rango.desde)} al ${fechaCorta(rango.hasta)}`;
    case "mes": {
      const texto = mesAnio(rango.desde);
      return texto.charAt(0).toUpperCase() + texto.slice(1);
    }
    case "anio":
      return `Año ${rango.desde.slice(0, 4)}`;
    case "rango":
      return `Del ${fechaCorta(rango.desde)} al ${fechaCorta(rango.hasta)}`;
  }
}

/** Días del rango, incluidos los dos extremos. */
export function diasDelRango(rango: Pick<Rango, "desde" | "hasta">): number {
  return diasEntre(rango.desde, rango.hasta) + 1;
}

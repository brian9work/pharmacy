// Formatos de dinero y fecha. Las fechas se formatean a mano, sin `Date`,
// para que servidor y navegador muestren lo mismo sin importar su zona horaria.

const pesos = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

/** 3550 → "$35.50" */
export function dinero(centavos: number): string {
  return pesos.format(centavos / 100);
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function partes(fecha: string) {
  const [anio, mes, dia] = fecha.slice(0, 10).split("-").map(Number);
  return { anio, mes, dia };
}

/** "2026-10-01" → "1 de octubre de 2026" */
export function fechaLarga(fecha: string): string {
  const { anio, mes, dia } = partes(fecha);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

/** "2026-10-03" → "octubre de 2026" */
export function mesAnio(fecha: string): string {
  const { anio, mes } = partes(fecha);
  return `${MESES[mes - 1]} de ${anio}`;
}

/** "2026-10-03" → "3 oct" */
export function diaMes(fecha: string): string {
  const { mes, dia } = partes(fecha);
  return `${dia} ${MESES_CORTOS[mes - 1]}`;
}

/** "2026-10" → "oct" */
export function mesCorto(fecha: string): string {
  return MESES_CORTOS[partes(`${fecha.slice(0, 7)}-01`).mes - 1];
}

/** "2027-03-31" → "31 mar 2027" */
export function fechaCorta(fecha: string): string {
  const { anio, mes, dia } = partes(fecha);
  return `${dia} ${MESES_CORTOS[mes - 1]} ${anio}`;
}

/** Fecha "AAAA-MM-DD" y hora "HH:MM" de un instante en la zona de la farmacia. */
export function enZona(instante: Date, zona: string) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? "";
  return { fecha: `${valor("year")}-${valor("month")}-${valor("day")}`, hora: `${valor("hour")}:${valor("minute")}` };
}

/** Hoy en la zona de la farmacia: "2026-10-02". */
export function hoyEn(zona: string): string {
  return enZona(new Date(), zona).fecha;
}

/** "2026-10-02T15:04:00Z" → "09:04" en la zona de la farmacia. */
export function horaEn(iso: string, zona: string): string {
  return enZona(new Date(iso), zona).hora;
}

/** "2026-09-05T16:00:00Z" → "5 sep 2026, 10:00" en la zona de la farmacia. */
export function momentoEn(iso: string, zona: string): string {
  const { fecha, hora } = enZona(new Date(iso), zona);
  return `${fechaCorta(fecha)}, ${hora}`;
}

/** Días de calendario de `desde` a `hasta` (negativo si `hasta` ya pasó). */
export function diasEntre(desde: string, hasta: string): number {
  const a = partes(desde);
  const b = partes(hasta);
  const ms = Date.UTC(b.anio, b.mes - 1, b.dia) - Date.UTC(a.anio, a.mes - 1, a.dia);
  return Math.round(ms / 86_400_000);
}

/** (1, "pieza", "piezas") → "1 pieza" */
export function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Porcentaje con un decimal: 0.1234 → "12.3 %" */
export function porcentaje(fraccion: number): string {
  return `${(fraccion * 100).toLocaleString("es-MX", { maximumFractionDigits: 1 })} %`;
}

/** Pesos sin centavos y abreviados para ejes: 1250000 → "$12.5k" */
export function dineroCorto(centavos: number): string {
  const pesos = centavos / 100;
  if (Math.abs(pesos) >= 1000) return `$${(pesos / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })}k`;
  return `$${pesos.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

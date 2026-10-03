/**
 * Celda CSV segura: comillas escapadas y sin fórmulas (=, +, -, @) que Excel
 * ejecutaría. Los números negativos ("-12.50") se dejan como números.
 */
export function celdaCsv(valor: string | number | null | undefined): string {
  let texto = String(valor ?? "");
  if (/^[=+\-@\t\r]/.test(texto) && !/^-\d+(\.\d+)?$/.test(texto)) texto = `'${texto}`;
  return /[",\n\r;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Centavos a pesos con dos decimales y punto: 3550 → "35.50". */
export function pesosCsv(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

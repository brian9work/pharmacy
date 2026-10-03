// Ajustes del punto de venta. Cambia estos valores según tu equipo.

export const puntoDeVenta = {
  /** Pitido al leer un código: agudo si se agregó, grave si hubo problema. */
  sonido: true,
  /** Abrir la impresión del ticket en cuanto se cobra. */
  imprimirAlCobrar: true,
  /** Ancho del papel de la impresora de tickets: "80mm" o "58mm". */
  anchoTicket: "80mm" as "80mm" | "58mm",
  /** Leyenda al pie del ticket. Déjala vacía ("") para no imprimirla. */
  leyendaNoFiscal: "Este ticket no es un comprobante fiscal.",
};

export const configuracion = {
  titulo: "Configuración",
  descripcion: "Datos del negocio que se imprimen en cada ticket. El nombre y el logo se cambian en config/marca.ts.",
  campos: {
    razonSocial: "Razón social",
    rfc: "RFC",
    direccion: "Dirección",
    telefono: "Teléfono",
    pieTicket: "Mensaje al pie del ticket",
    pieAyuda: "Por ejemplo: horario, política de devoluciones o un agradecimiento.",
  },
  guardar: "Guardar",
  guardando: "Guardando…",
  guardado: "Datos guardados. Los verás en el siguiente ticket.",
  errores: {
    largo: "Algún dato es demasiado largo.",
    rfc: "El RFC debe tener 12 o 13 caracteres, sin espacios.",
    permiso: "No tienes permiso para editar la configuración.",
  },
};

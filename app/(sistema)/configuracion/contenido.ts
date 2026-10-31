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
  nube: {
    titulo: "Subir datos a la nube",
    descripcion:
      "Manda a Supabase lo que todavía no está allá (ventas, entradas, productos y existencias) para consultarlo desde cualquier lugar. Puedes pulsarlo las veces que quieras: lo que ya subió no se duplica.",
    boton: "Subir datos",
    subiendo: "Subiendo… puede tardar unos minutos. No cierres esta pantalla.",
    nunca: "Todavía no se ha subido nada.",
    ultimaBuena: (fecha: string) => `Última subida correcta: ${fecha}`,
    ultimoFallo: (fecha: string, error: string) => `El último intento (${fecha}) no terminó: ${error}`,
    sinConfigurar:
      "Falta conectar con Supabase. Agrega SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en la configuración del servidor (docs/instalacion.md).",
    sinActualizar:
      "Falta aplicar una actualización a la base de datos local: postgres/actualizaciones/20261031_subir_datos.sql (docs/instalacion.md).",
    listo: "Listo: se subió lo pendiente.",
    resumen: {
      ventasNuevas: (n: number) => `${n} ${n === 1 ? "venta nueva" : "ventas nuevas"}`,
      ventasYa: (n: number) => `${n} ${n === 1 ? "venta" : "ventas"} que ya estaban en la nube`,
      entradasNuevas: (n: number) => `${n} ${n === 1 ? "entrada de mercancía" : "entradas de mercancía"}`,
      turnosNuevos: (n: number) => `${n} ${n === 1 ? "corte de caja" : "cortes de caja"}`,
      productosNuevos: (n: number) => `${n} ${n === 1 ? "producto nuevo" : "productos nuevos"}`,
      productosCambios: (n: number) => `${n} ${n === 1 ? "producto actualizado" : "productos actualizados"}`,
      lotesNuevos: (n: number) => `${n} ${n === 1 ? "lote nuevo" : "lotes nuevos"}`,
      lotesCambios: (n: number) => `${n} ${n === 1 ? "lote con existencia actualizada" : "lotes con existencia actualizada"}`,
      nadaNuevo: "No había nada nuevo que subir.",
    },
    avisos: {
      pendiente: "Quedó algo pendiente. La próxima vez que subas se volverá a intentar.",
      sinCuenta: (correos: string[]) =>
        `Faltan estas cuentas en la nube: ${correos.join(", ")}. Créalas ahí (Usuarios) con el mismo correo y vuelve a subir; sus ventas se subirán entonces.`,
      folioRepetido: (n: number) => `${n} ${n === 1 ? "venta no se subió" : "ventas no se subieron"}: su folio ya lo usa otra venta en la nube.`,
      sinTurno: (n: number) => `${n} ${n === 1 ? "venta no se subió" : "ventas no se subieron"} porque su corte de caja no está en la nube.`,
      entradasConflicto: (n: number) => `${n} ${n === 1 ? "entrada no se subió" : "entradas no se subieron"}: esa factura de ese proveedor ya está en la nube.`,
      turnosConflicto: (n: number) => `${n} ${n === 1 ? "turno de caja no se subió" : "turnos de caja no se subieron"}: la nube ya tiene una caja abierta de esa persona.`,
    },
  },
  errores: {
    subida: "No se pudo subir. Puedes volver a intentarlo: lo que ya subió no se repite.",
    largo: "Algún dato es demasiado largo.",
    rfc: "El RFC debe tener 12 o 13 caracteres, sin espacios.",
    permiso: "No tienes permiso para editar la configuración.",
  },
};

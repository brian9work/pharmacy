// Textos compartidos por varias pantallas.

import type { Alerta, EstadoCaducidad } from "@/lib/inventario";
import type { Clasificacion, MetodoPago, TipoMovimiento } from "@/lib/tipos";
import type { Tono } from "@/app/components/estado";

export const textosComunes = {
  cambiarTema: "Cambiar entre tema claro y oscuro",
  salir: "Salir",
  saltarAlContenido: "Saltar al contenido",
  navegacion: "Secciones del sistema",
  error: {
    titulo: "Algo salió mal",
    texto: "No se pudo cargar esta pantalla. Revisa tu conexión e intenta de nuevo.",
    reintentar: "Intentar de nuevo",
  },
};

export const textosAlerta: Record<Alerta, { texto: string; tono: Tono }> = {
  "sin-existencia": { texto: "Sin existencia", tono: "peligro" },
  "stock-bajo": { texto: "Stock bajo", tono: "aviso" },
  caducado: { texto: "Lote caducado", tono: "peligro" },
  "por-caducar": { texto: "Por caducar", tono: "aviso" },
  cuarentena: { texto: "Lote bloqueado", tono: "neutro" },
};

export const textosCaducidad: Record<EstadoCaducidad, { texto: string; tono: Tono }> = {
  caducado: { texto: "Caducado", tono: "peligro" },
  "por-caducar": { texto: "Por caducar", tono: "aviso" },
  vigente: { texto: "Vigente", tono: "exito" },
};

export const textosClasificacion: Record<Clasificacion, { texto: string; tono: Tono } | null> = {
  libre: null,
  antibiotico: { texto: "Antibiótico · receta", tono: "acento" },
  controlado: { texto: "Controlado · receta retenida", tono: "acento" },
};

export const textosMetodo: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

export const textosMovimiento: Record<TipoMovimiento, string> = {
  inventario_inicial: "Carga inicial",
  entrada: "Entrada",
  venta: "Venta",
  ajuste: "Ajuste",
  merma: "Merma",
  devolucion: "Devolución",
  cancelacion: "Cancelación",
};

export const textosTicket = {
  etiqueta: (folio: string) => `Ticket ${folio}`,
  rfc: (rfc: string) => `RFC ${rfc}`,
  telefono: (telefono: string) => `Tel. ${telefono}`,
  cancelada: "VENTA CANCELADA",
  folio: "Folio",
  fecha: "Fecha",
  caja: "Caja",
  cajero: "Atendió",
  producto: "Producto",
  importe: "Importe",
  subtotal: "Subtotal",
  iva: "IVA",
  total: "TOTAL",
  cambio: "Cambio",
  piezasEtiqueta: "Piezas",
  imprimir: "Imprimir",
  volver: "Volver",
};

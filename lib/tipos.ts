// Modelo de datos que usan las pantallas. lib/consultas.ts convierte las
// filas de PostgreSQL a estas formas.
//
// Dinero siempre en centavos (entero): $35.50 = 3550.
// Fechas de calendario como "AAAA-MM-DD"; horas ya en la zona de la farmacia.

import type { Rol } from "@/config/permisos";

export type { Rol };

/** libre: sin clasificación especial · antibiotico: receta registrada · controlado: receta retenida. */
export type Clasificacion = "libre" | "antibiotico" | "controlado";

/** La receta que pide una venta: la más estricta de sus productos. */
export type TipoReceta = "simple" | "antibiotico" | "controlado";

export interface Producto {
  id: string;
  codigoBarras: string | null;
  nombre: string;
  sustancia: string;
  presentacion: string;
  laboratorio: string;
  categoria: string;
  clasificacion: Clasificacion;
  /** Casilla "Requiere receta médica". Siempre true en antibióticos y controlados. */
  requiereReceta: boolean;
  /** Precio de venta con IVA incluido, en centavos. */
  precio: number;
  /** Porcentaje de IVA: medicamentos 0, el resto 16. */
  iva: 0 | 16;
  stockMinimo: number;
  ubicacion: string;
  refrigerado: boolean;
}

export type EstadoLote = "disponible" | "cuarentena";

export interface Lote {
  id: string;
  productoId: string;
  numero: string;
  /** "AAAA-MM-DD" */
  caducidad: string;
  cantidad: number;
  estado: EstadoLote;
}

export type TipoMovimiento = "inventario_inicial" | "entrada" | "venta" | "ajuste" | "merma" | "devolucion" | "cancelacion";

/** Renglón del kardex, listo para mostrar. */
export interface MovimientoKardex {
  id: number;
  fecha: string;
  tipo: TipoMovimiento;
  /** Positivo entra, negativo sale. */
  cantidad: number;
  lote: string;
  usuario: string;
  referencia: string;
}

export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  debeCambiarContrasena: boolean;
  /** Ya formateado; null si nunca ha entrado. */
  ultimoAcceso: string | null;
}

export type MetodoPago = "efectivo" | "tarjeta" | "transferencia";

export interface VentaResumen {
  id: string;
  folio: string;
  hora: string;
  usuarioId: string;
  cajero: string;
  metodo: MetodoPago | null;
  piezas: number;
  total: number;
  cancelada: boolean;
}

export type TipoMovimientoCaja = "venta" | "entrada" | "retiro" | "cancelacion" | "devolucion";

export interface MovimientoCaja {
  id: number;
  hora: string;
  tipo: TipoMovimientoCaja;
  metodo: MetodoPago;
  concepto: string;
  /** Centavos; lo que sale de la caja va en negativo. */
  monto: number;
}

/** Caja abierta de quien inició sesión. */
export interface Turno {
  id: string;
  caja: string;
  abiertoA: string;
  fondoInicial: number;
  ventas: number;
  ventasTarjeta: number;
  ventasTransferencia: number;
  /** null en corte ciego: quien no supervisa cajas no ve el efectivo hasta cerrar. */
  ventasEfectivo: number | null;
  retiros: number | null;
  efectivoEsperado: number | null;
  movimientos: MovimientoCaja[];
}

/** Ticket de una venta, listo para imprimir. */
export interface Ticket {
  ventaId: string;
  folio: string;
  fecha: string;
  hora: string;
  caja: string;
  cajero: string;
  negocio: { razonSocial: string; rfc: string; direccion: string; telefono: string; pie: string };
  partidas: { nombre: string; cantidad: number; precio: number; importe: number }[];
  piezas: number;
  subtotal: number;
  iva: number;
  total: number;
  pagos: { metodo: MetodoPago; monto: number; recibido: number | null }[];
  cambio: number | null;
  cancelada: boolean;
  receta: { tipo: TipoReceta; medico: string; cedula: string; folio: string; retenida: boolean } | null;
}

/** Totales de un periodo. Dinero en centavos. */
export interface ResumenPeriodo {
  /** Cobrado con IVA, sin canceladas. */
  ventas: number;
  /** Ventas sin IVA: base de la utilidad. */
  subtotal: number;
  iva: number;
  tickets: number;
  piezas: number;
  /** Piezas vendidas × costo del lote del que salieron. */
  costo: number;
  canceladas: number;
  montoCancelado: number;
}

export interface RenglonReporte {
  nombre: string;
  /** Con IVA. */
  importe: number;
  /** Sin IVA. */
  base: number;
  costo: number;
  piezas: number;
}

export interface Reporte {
  resumen: ResumenPeriodo;
  /** Mismo número de días justo antes del periodo, para comparar. */
  anterior: ResumenPeriodo;
  porDia: { fecha: string; ventas: number; tickets: number }[];
  porHora: { hora: number; ventas: number; tickets: number }[];
  porMetodo: { metodo: MetodoPago; monto: number; pagos: number }[];
  porCajero: { cajero: string; ventas: number; tickets: number }[];
  porCategoria: RenglonReporte[];
  productos: RenglonReporte[];
  compras: { recepciones: number; total: number };
  mermas: { piezas: number; costo: number };
}

export interface Proveedor {
  id: string;
  nombre: string;
}

export interface ProveedorCompleto extends Proveedor {
  rfc: string;
  telefono: string;
  correo: string;
  activo: boolean;
}

export interface Categoria {
  id: number;
  nombre: string;
}

/** Producto con lo que hace falta para editarlo. */
export interface ProductoEdicion extends Producto {
  categoriaId: number | null;
  activo: boolean;
}

export interface Sesion {
  usuario: Usuario;
}

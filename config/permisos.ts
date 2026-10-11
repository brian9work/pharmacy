// Roles y claves de permisos que usa el código.
//
// Qué puede hacer el empleado se decide en la pantalla Permisos y se guarda
// en la base (tabla rol_permisos). Los nombres y descripciones de cada
// permiso también viven en la base (tabla permisos).
//
// Si agregas un permiso, agrégalo aquí y en
// postgres/larafarma.sql (datos iniciales) con la misma clave.

export type Rol = "admin" | "empleado";

export const ROLES: Record<Rol, { nombre: string; descripcion: string }> = {
  admin: {
    nombre: "Administrador",
    descripcion: "Tiene todos los permisos, siempre.",
  },
  empleado: {
    nombre: "Empleado",
    descripcion: "Solo lo que actives en Permisos.",
  },
};

export const MODULOS = {
  ventas: "Ventas",
  caja: "Caja",
  inventario: "Inventario",
  productos: "Productos",
  reportes: "Reportes",
  usuarios: "Usuarios y permisos",
  configuracion: "Configuración",
} as const;

export type Modulo = keyof typeof MODULOS;

export const CLAVES_PERMISO = [
  "ventas.vender",
  "ventas.descuento",
  "ventas.cancelar",
  "ventas.devolucion",
  "ventas.historial",
  "caja.abrir",
  "caja.cerrar",
  "caja.movimientos",
  "caja.ver_todas",
  "inventario.ver",
  "inventario.entrada",
  "inventario.ajuste",
  "inventario.merma",
  "inventario.cuarentena",
  "inventario.costos",
  "productos.crear",
  "productos.editar",
  "productos.precios",
  "reportes.ver",
  "usuarios.gestionar",
  "permisos.gestionar",
  "configuracion.editar",
] as const;

export type ClavePermiso = (typeof CLAVES_PERMISO)[number];

/** Un permiso tal como está en la base, para la pantalla Permisos. */
export interface Permiso {
  clave: ClavePermiso;
  modulo: Modulo;
  nombre: string;
  descripcion: string;
  soloAdmin: boolean;
}

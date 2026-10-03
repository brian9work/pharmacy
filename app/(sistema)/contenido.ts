import type { ClavePermiso } from "@/config/permisos";
import type { NombreIcono } from "@/app/components/icono";

/** Menú del sistema. Cada opción aparece solo si el usuario tiene su permiso. */
export const menu: { href: string; etiqueta: string; icono: NombreIcono; permiso: ClavePermiso | null }[] = [
  { href: "/panel", etiqueta: "Panel", icono: "panel", permiso: null },
  { href: "/venta", etiqueta: "Vender", icono: "vender", permiso: "ventas.vender" },
  { href: "/caja", etiqueta: "Caja", icono: "caja", permiso: "caja.abrir" },
  { href: "/inventario", etiqueta: "Inventario", icono: "inventario", permiso: "inventario.ver" },
  { href: "/inventario/entrada", etiqueta: "Recibir mercancía", icono: "entrada", permiso: "inventario.entrada" },
  { href: "/productos/nuevo", etiqueta: "Nuevo producto", icono: "mas", permiso: "productos.crear" },
  { href: "/catalogos", etiqueta: "Proveedores y categorías", icono: "etiqueta", permiso: "productos.crear" },
  { href: "/reportes", etiqueta: "Reportes", icono: "reportes", permiso: "reportes.ver" },
  { href: "/usuarios", etiqueta: "Usuarios", icono: "usuarios", permiso: "usuarios.gestionar" },
  { href: "/usuarios/permisos", etiqueta: "Permisos", icono: "permisos", permiso: "permisos.gestionar" },
  { href: "/configuracion", etiqueta: "Configuración", icono: "ajustes", permiso: "configuracion.editar" },
];

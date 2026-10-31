// Consultas que usan las pantallas. Corren con la sesión de quien entró,
// así que PostgreSQL aplica sus reglas RLS: cada quien ve solo lo permitido.

import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { CLAVES_PERMISO, type ClavePermiso, type Modulo, type Permiso, type Rol } from "@/config/permisos";
import { consultar, consultarFila, tokenActual, transaccion } from "@/lib/db/sesion";
import { mensajeDeError, type ErrorBase } from "@/lib/errores";
import { enZona, fechaCorta, horaEn, hoyEn, momentoEn } from "@/lib/formato";
import { alertasDe, lotesVendibles, ordenarFEFO, sumarPiezas, type Alerta } from "@/lib/inventario";
import type {
  Categoria,
  Clasificacion,
  EstadoLote,
  Lote,
  MetodoPago,
  MovimientoCaja,
  MovimientoKardex,
  Producto,
  ProductoEdicion,
  Proveedor,
  ProveedorCompleto,
  RenglonReporte,
  Reporte,
  ResumenPeriodo,
  Sesion,
  Ticket,
  TipoMovimiento,
  TipoMovimientoCaja,
  TipoReceta,
  Turno,
  Usuario,
  VentaResumen,
} from "@/lib/tipos";

const ZONA_POR_OMISION = "America/Mexico_City";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Productos con su categoría. Nunca el costo: está oculto por privilegios de columna.
const COLUMNAS_PRODUCTO = `p.id, p.codigo_barras, p.nombre, p.sustancia, p.presentacion, p.laboratorio, p.clasificacion,
  p.requiere_receta, p.precio, p.iva, p.stock_minimo, p.ubicacion, p.refrigerado, c.nombre as categoria`;
const DESDE_PRODUCTOS = "from productos p left join categorias c on c.id = p.categoria_id";
const COLUMNAS_LOTE = "id, producto_id, numero, caducidad, cantidad, estado";
const COLUMNAS_USUARIO = "id, nombre, correo, rol, activo, debe_cambiar_contrasena, ultimo_acceso";

interface FilaProducto {
  id: string;
  codigo_barras: string | null;
  nombre: string;
  sustancia: string;
  presentacion: string;
  laboratorio: string;
  clasificacion: Clasificacion;
  requiere_receta: boolean;
  precio: number;
  iva: 0 | 16;
  stock_minimo: number;
  ubicacion: string;
  refrigerado: boolean;
  categoria: string | null;
}

interface FilaLote {
  id: string;
  producto_id: string;
  numero: string;
  caducidad: string;
  cantidad: number;
  estado: EstadoLote;
}

interface FilaUsuario {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  debe_cambiar_contrasena: boolean;
  ultimo_acceso: string | null;
}

function aProducto(f: FilaProducto): Producto {
  return {
    id: f.id,
    codigoBarras: f.codigo_barras,
    nombre: f.nombre,
    sustancia: f.sustancia,
    presentacion: f.presentacion,
    laboratorio: f.laboratorio,
    categoria: f.categoria ?? "",
    clasificacion: f.clasificacion,
    requiereReceta: f.requiere_receta,
    precio: f.precio,
    iva: f.iva,
    stockMinimo: f.stock_minimo,
    ubicacion: f.ubicacion,
    refrigerado: f.refrigerado,
  };
}

function aLote(f: FilaLote): Lote {
  return { id: f.id, productoId: f.producto_id, numero: f.numero, caducidad: f.caducidad, cantidad: f.cantidad, estado: f.estado };
}

function aUsuario(f: FilaUsuario, zona: string): Usuario {
  return {
    id: f.id,
    nombre: f.nombre,
    correo: f.correo,
    rol: f.rol,
    activo: f.activo,
    debeCambiarContrasena: f.debe_cambiar_contrasena,
    ultimoAcceso: f.ultimo_acceso ? momentoEn(f.ultimo_acceso, zona) : null,
  };
}

/** Espera la consulta o lanza un error con mensaje para la persona (lo muestra error.tsx). */
async function leer<T>(promesa: Promise<T>): Promise<T> {
  try {
    return await promesa;
  } catch (error) {
    throw new Error(mensajeDeError(error as ErrorBase));
  }
}

// ---------------------------------------------------------------------------
// Sesión y permisos
// ---------------------------------------------------------------------------

/**
 * Quien inició sesión. Sin cookie va al acceso; con una sesión vencida,
 * cerrada o de una cuenta bloqueada, /salir borra la cookie.
 */
export const obtenerSesion = cache(async (): Promise<Sesion> => {
  if (!(await tokenActual())) redirect("/");

  const fila = await leer(consultarFila<FilaUsuario>(`select ${COLUMNAS_USUARIO} from usuarios where id = usuario_actual()`));
  if (!fila || !fila.activo) redirect("/salir");

  return { usuario: aUsuario(fila, ZONA_POR_OMISION) };
});

export const obtenerPermisos = cache(async (): Promise<Set<ClavePermiso>> => {
  const { usuario } = await obtenerSesion();
  const filas = await leer(consultar<{ permiso: ClavePermiso }>("select permiso from permisos_efectivos where usuario_id = $1", [usuario.id]));
  return new Set(filas.map((f) => f.permiso));
});

export async function puede(clave: ClavePermiso): Promise<boolean> {
  return (await obtenerPermisos()).has(clave);
}

export const obtenerZona = cache(async (): Promise<string> => {
  const fila = await consultarFila<{ zona_horaria: string }>("select zona_horaria from negocio where id = 1").catch(() => null);
  return fila?.zona_horaria ?? ZONA_POR_OMISION;
});

export const obtenerHoy = cache(async (): Promise<string> => hoyEn(await obtenerZona()));

// ---------------------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------------------

export interface FilaInventario {
  producto: Producto;
  lotes: Lote[];
  existencia: number;
  proximaCaducidad: string | null;
  alertas: Alerta[];
}

function armarFila(producto: Producto, lotes: Lote[], hoy: string): FilaInventario {
  const ordenados = ordenarFEFO(lotes);
  const vendibles = lotesVendibles(ordenados, hoy);
  return {
    producto,
    lotes: ordenados,
    existencia: sumarPiezas(vendibles),
    proximaCaducidad: vendibles[0]?.caducidad ?? null,
    alertas: alertasDe(producto, ordenados, hoy),
  };
}

export const obtenerProductos = cache(async (): Promise<Producto[]> => {
  const filas = await leer(consultar<FilaProducto>(`select ${COLUMNAS_PRODUCTO} ${DESDE_PRODUCTOS} where p.activo order by p.nombre, p.id`));
  return filas.map(aProducto);
});

/** Lotes con piezas, agrupados por producto. */
async function lotesConPiezas(filtro?: { vendiblesDesde: string }): Promise<Map<string, Lote[]>> {
  const filas = await leer(
    filtro
      ? consultar<FilaLote>(
          `select ${COLUMNAS_LOTE} from lotes where cantidad > 0 and estado = 'disponible' and caducidad >= $1 order by caducidad, id`,
          [filtro.vendiblesDesde],
        )
      : consultar<FilaLote>(`select ${COLUMNAS_LOTE} from lotes where cantidad > 0 order by caducidad, id`),
  );
  const porProducto = new Map<string, Lote[]>();
  for (const fila of filas) {
    const lote = aLote(fila);
    porProducto.set(lote.productoId, [...(porProducto.get(lote.productoId) ?? []), lote]);
  }
  return porProducto;
}

export const obtenerInventario = cache(async (): Promise<FilaInventario[]> => {
  const [productos, lotes, hoy] = await Promise.all([obtenerProductos(), lotesConPiezas(), obtenerHoy()]);
  return productos.map((p) => armarFila(p, lotes.get(p.id) ?? [], hoy));
});

export async function obtenerFilaInventario(id: string): Promise<FilaInventario | null> {
  if (!UUID.test(id)) return null;
  const [fila, lotes, hoy] = await Promise.all([
    leer(consultarFila<FilaProducto>(`select ${COLUMNAS_PRODUCTO} ${DESDE_PRODUCTOS} where p.id = $1`, [id])),
    leer(consultar<FilaLote>(`select ${COLUMNAS_LOTE} from lotes where producto_id = $1 order by caducidad limit 200`, [id])),
    obtenerHoy(),
  ]);
  if (!fila) return null;
  return armarFila(aProducto(fila), lotes.map(aLote), hoy);
}

/** Costo por producto. Solo con el permiso inventario.costos. */
export const obtenerCostos = cache(async (): Promise<Map<string, number>> => {
  if (!(await puede("inventario.costos"))) return new Map();
  const filas = await leer(consultar<{ producto_id: string; costo: number }>("select producto_id, costo from costos_productos()"));
  return new Map(filas.map((f) => [f.producto_id, f.costo]));
});

export async function obtenerKardex(productoId: string): Promise<MovimientoKardex[]> {
  const [filas, zona] = await Promise.all([
    leer(
      consultar<{
        id: number;
        creado_en: string;
        tipo: TipoMovimiento;
        cantidad: number;
        lote: string;
        usuario: string | null;
        referencia: string;
      }>(
        "select id, creado_en, tipo, cantidad, lote, usuario, referencia from kardex where producto_id = $1 order by creado_en desc limit 200",
        [productoId],
      ),
    ),
    obtenerZona(),
  ]);
  return filas.map((f) => ({
    id: f.id,
    fecha: momentoEn(f.creado_en, zona),
    tipo: f.tipo,
    cantidad: f.cantidad,
    lote: f.lote,
    usuario: f.usuario ?? "—",
    referencia: f.referencia,
  }));
}

// ---------------------------------------------------------------------------
// Venta y caja
// ---------------------------------------------------------------------------

/** Catálogo para el punto de venta: cada producto con sus lotes vendibles hoy. */
export async function obtenerCatalogoVenta() {
  const hoy = await obtenerHoy();
  const [productos, lotes] = await Promise.all([obtenerProductos(), lotesConPiezas({ vendiblesDesde: hoy })]);
  return productos.map((producto) => ({ producto, vendibles: lotes.get(producto.id) ?? [] }));
}

export async function obtenerVentasDeHoy(): Promise<VentaResumen[]> {
  const [filas, zona] = await Promise.all([
    leer(
      consultar<{
        id: string;
        folio: number;
        creado_en: string;
        usuario_id: string;
        cajero: string | null;
        total: number;
        estado: "pagada" | "cancelada";
        metodo: string | null;
        piezas: number;
      }>("select id, folio, creado_en, usuario_id, cajero, total, estado, metodo, piezas from ventas_de_hoy order by folio desc limit 100"),
    ),
    obtenerZona(),
  ]);
  return filas.map((f) => ({
    id: f.id,
    folio: `V-${String(f.folio).padStart(6, "0")}`,
    hora: horaEn(f.creado_en, zona),
    usuarioId: f.usuario_id,
    cajero: f.cajero ?? "—",
    metodo: (f.metodo?.includes(",") ? null : f.metodo) as MetodoPago | null,
    piezas: f.piezas,
    total: f.total,
    cancelada: f.estado === "cancelada",
  }));
}

/**
 * Ticket de una venta, armado con lo que guardó la base (no con lo que vio
 * el navegador). null si no existe o quien pregunta no puede verla (RLS).
 */
export async function obtenerTicket(ventaId: string): Promise<Ticket | null> {
  if (!UUID.test(ventaId)) return null;
  const zona = await obtenerZona();

  const leido = await leer(
    transaccion(async (c) => {
      const [venta] = await c<{
        id: string;
        folio: number;
        creado_en: string;
        usuario_id: string;
        turno_id: string;
        subtotal: number;
        iva: number;
        total: number;
        estado: "pagada" | "cancelada";
      }>("select id, folio, creado_en, usuario_id, turno_id, subtotal, iva, total, estado from ventas where id = $1", [ventaId]);
      if (!venta) return null;

      // left join: si quien pregunta no puede ver el producto, el renglón sale igual.
      const partidas = await c<{ producto_id: string; nombre: string | null; cantidad: number; precio: number; importe: number }>(
        `select vp.producto_id, p.nombre, vp.cantidad, vp.precio, vp.importe
         from venta_partidas vp left join productos p on p.id = vp.producto_id
         where vp.venta_id = $1 order by vp.id`,
        [ventaId],
      );
      const pagos = await c<{ metodo: MetodoPago; monto: number; recibido: number | null }>(
        "select metodo, monto, recibido from venta_pagos where venta_id = $1 order by id",
        [ventaId],
      );
      const [negocio] = await c<{ razon_social: string; rfc: string; direccion: string; telefono: string; pie_ticket: string }>(
        "select razon_social, rfc, direccion, telefono, pie_ticket from negocio where id = 1",
      );
      const [cajero] = await c<{ nombre: string }>("select nombre from usuarios where id = $1", [venta.usuario_id]);
      const [caja] = await c<{ nombre: string }>(
        "select c.nombre from turnos_caja t join cajas c on c.id = t.caja_id where t.id = $1",
        [venta.turno_id],
      );
      const [receta] = await c<{ tipo: TipoReceta; medico: string; cedula: string; folio_receta: string; retenida: boolean }>(
        "select tipo, medico, cedula, folio_receta, retenida from recetas where venta_id = $1",
        [ventaId],
      );
      return { venta, partidas, pagos, negocio, cajero, caja, receta };
    }),
  );
  if (!leido) return null;
  const { venta, partidas, pagos, negocio: n, cajero, caja, receta } = leido;

  // Si una venta tomó piezas de dos lotes, en el ticket va un solo renglón.
  const renglones = new Map<string, { nombre: string; cantidad: number; precio: number; importe: number }>();
  for (const f of partidas) {
    const clave = `${f.producto_id}:${f.precio}`;
    const previo = renglones.get(clave);
    renglones.set(clave, {
      nombre: f.nombre ?? "Producto",
      cantidad: (previo?.cantidad ?? 0) + f.cantidad,
      precio: f.precio,
      importe: (previo?.importe ?? 0) + f.importe,
    });
  }

  const efectivo = pagos.find((p) => p.metodo === "efectivo" && p.recibido !== null);
  const momento = enZona(new Date(venta.creado_en), zona);

  return {
    ventaId: venta.id,
    folio: `V-${String(venta.folio).padStart(6, "0")}`,
    fecha: fechaCorta(momento.fecha),
    hora: momento.hora,
    caja: caja?.nombre ?? "",
    cajero: cajero?.nombre ?? "",
    negocio: {
      razonSocial: n?.razon_social ?? "",
      rfc: n?.rfc ?? "",
      direccion: n?.direccion ?? "",
      telefono: n?.telefono ?? "",
      pie: n?.pie_ticket ?? "",
    },
    partidas: [...renglones.values()],
    piezas: partidas.reduce((suma, f) => suma + f.cantidad, 0),
    subtotal: venta.subtotal,
    iva: venta.iva,
    total: venta.total,
    pagos,
    cambio: efectivo?.recibido != null ? efectivo.recibido - efectivo.monto : null,
    cancelada: venta.estado === "cancelada",
    receta: receta
      ? { tipo: receta.tipo, medico: receta.medico, cedula: receta.cedula, folio: receta.folio_receta, retenida: receta.retenida }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Reportes
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;
const numero = (valor: unknown) => Number(valor ?? 0);

function aResumen(r: Json): ResumenPeriodo {
  return {
    ventas: numero(r.ventas),
    subtotal: numero(r.subtotal),
    iva: numero(r.iva),
    tickets: numero(r.tickets),
    piezas: numero(r.piezas),
    costo: numero(r.costo),
    canceladas: numero(r.canceladas),
    montoCancelado: numero(r.monto_cancelado),
  };
}

function aRenglon(r: Json, campo: string): RenglonReporte {
  return { nombre: String(r[campo] ?? ""), importe: numero(r.importe), base: numero(r.base), costo: numero(r.costo), piezas: numero(r.piezas) };
}

/** Reporte de ventas del periodo. La base revisa el permiso reportes.ver. */
export async function obtenerReporte(desde: string, hasta: string): Promise<Reporte> {
  const fila = await leer(consultarFila<{ r: Record<string, Json & Json[]> }>("select reporte_ventas($1, $2) as r", [desde, hasta]));
  const r = fila!.r;
  const lista = (clave: string) => (r[clave] as unknown as Json[]) ?? [];
  return {
    resumen: aResumen(r.resumen),
    anterior: aResumen(r.anterior),
    porDia: lista("por_dia").map((d) => ({ fecha: String(d.fecha), ventas: numero(d.ventas), tickets: numero(d.tickets) })),
    porHora: lista("por_hora").map((h) => ({ hora: numero(h.hora), ventas: numero(h.ventas), tickets: numero(h.tickets) })),
    porMetodo: lista("por_metodo").map((m) => ({ metodo: m.metodo as MetodoPago, monto: numero(m.monto), pagos: numero(m.pagos) })),
    porCajero: lista("por_cajero").map((c) => ({ cajero: String(c.cajero ?? ""), ventas: numero(c.ventas), tickets: numero(c.tickets) })),
    porCategoria: lista("por_categoria").map((c) => aRenglon(c, "categoria")),
    productos: lista("productos").map((p) => aRenglon(p, "producto")),
    compras: { recepciones: numero(r.compras?.recepciones), total: numero(r.compras?.total) },
    mermas: { piezas: numero(r.mermas?.piezas), costo: numero(r.mermas?.costo) },
  };
}

/** Datos del negocio para el ticket y la pantalla de configuración. */
export async function obtenerNegocio() {
  const fila = await leer(
    consultarFila<{ razon_social: string; rfc: string; direccion: string; telefono: string; pie_ticket: string; dias_aviso_caducidad: number }>(
      "select razon_social, rfc, direccion, telefono, pie_ticket, dias_aviso_caducidad from negocio where id = 1",
    ),
  );
  return {
    razonSocial: fila?.razon_social ?? "",
    rfc: fila?.rfc ?? "",
    direccion: fila?.direccion ?? "",
    telefono: fila?.telefono ?? "",
    pieTicket: fila?.pie_ticket ?? "",
    diasAvisoCaducidad: fila?.dias_aviso_caducidad ?? 90,
  };
}

/** La caja abierta de quien inició sesión, o null. */
export async function obtenerTurnoAbierto(): Promise<Turno | null> {
  const { usuario } = await obtenerSesion();
  const [t, zona] = await Promise.all([
    leer(
      consultarFila<{
        id: string;
        caja: string;
        abierto_en: string;
        fondo_inicial: number;
        ventas: number;
        ventas_tarjeta: number;
        ventas_transferencia: number;
        ventas_efectivo: number | null;
        retiros: number | null;
        efectivo_esperado: number | null;
      }>(
        `select id, caja, abierto_en, fondo_inicial, ventas, ventas_tarjeta, ventas_transferencia, ventas_efectivo, retiros, efectivo_esperado
         from resumen_turnos where usuario_id = $1 and cerrado_en is null`,
        [usuario.id],
      ),
    ),
    obtenerZona(),
  ]);
  if (!t) return null;

  const movimientos = await leer(
    consultar<{ id: number; creado_en: string; tipo: TipoMovimientoCaja; metodo: MetodoPago; concepto: string; monto: number }>(
      "select id, creado_en, tipo, metodo, concepto, monto from movimientos_caja where turno_id = $1 order by creado_en limit 500",
      [t.id],
    ),
  );

  return {
    id: t.id,
    caja: t.caja,
    abiertoA: horaEn(t.abierto_en, zona),
    fondoInicial: t.fondo_inicial,
    ventas: t.ventas,
    ventasTarjeta: t.ventas_tarjeta,
    ventasTransferencia: t.ventas_transferencia,
    ventasEfectivo: t.ventas_efectivo,
    retiros: t.retiros,
    efectivoEsperado: t.efectivo_esperado,
    movimientos: movimientos.map(
      (m): MovimientoCaja => ({ id: m.id, hora: horaEn(m.creado_en, zona), tipo: m.tipo, metodo: m.metodo, concepto: m.concepto, monto: m.monto }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Catálogos de apoyo, usuarios y permisos
// ---------------------------------------------------------------------------

export async function obtenerProveedores(): Promise<Proveedor[]> {
  return leer(consultar<Proveedor>("select id, nombre from proveedores where activo order by nombre"));
}

export async function obtenerUsuarios(): Promise<Usuario[]> {
  const [filas, zona] = await Promise.all([
    leer(consultar<FilaUsuario>(`select ${COLUMNAS_USUARIO} from usuarios order by nombre`)),
    obtenerZona(),
  ]);
  return filas.map((f) => aUsuario(f, zona));
}

export async function obtenerCategorias(): Promise<Categoria[]> {
  return leer(consultar<Categoria>("select id, nombre from categorias order by nombre"));
}

/** Proveedores activos e inactivos, para administrarlos. */
export async function obtenerProveedoresTodos(): Promise<ProveedorCompleto[]> {
  return leer(consultar<ProveedorCompleto>("select id, nombre, rfc, telefono, correo, activo from proveedores order by activo desc, nombre"));
}

export async function obtenerProductoParaEditar(id: string): Promise<ProductoEdicion | null> {
  if (!UUID.test(id)) return null;
  const fila = await leer(
    consultarFila<FilaProducto & { categoria_id: number | null; activo: boolean }>(
      `select ${COLUMNAS_PRODUCTO}, p.categoria_id, p.activo ${DESDE_PRODUCTOS} where p.id = $1`,
      [id],
    ),
  );
  return fila ? { ...aProducto(fila), categoriaId: fila.categoria_id, activo: fila.activo } : null;
}

export async function obtenerProductosInactivos(): Promise<{ id: string; nombre: string; presentacion: string }[]> {
  return leer(
    consultar<{ id: string; nombre: string; presentacion: string }>(
      "select id, nombre, presentacion from productos where not activo order by nombre limit 500",
    ),
  );
}

/** Códigos de barras ya usados (activos e inactivos), para avisar antes de guardar. */
export async function obtenerCodigosRegistrados(): Promise<Record<string, { id: string; nombre: string }>> {
  const filas = await leer(
    consultar<{ id: string; nombre: string; codigo_barras: string }>(
      "select id, nombre, codigo_barras from productos where codigo_barras is not null order by id",
    ),
  );
  return Object.fromEntries(filas.map((f) => [f.codigo_barras.toUpperCase(), { id: f.id, nombre: f.nombre }]));
}

/** Catálogo de permisos y los que hoy tiene el rol empleado. */
export async function obtenerPermisosConfigurables(): Promise<{ catalogo: Permiso[]; empleado: ClavePermiso[] }> {
  const [filas, asignados] = await Promise.all([
    leer(
      consultar<{ clave: ClavePermiso; modulo: Modulo; nombre: string; descripcion: string; solo_admin: boolean }>(
        "select clave, modulo, nombre, descripcion, solo_admin from permisos",
      ),
    ),
    leer(consultar<{ permiso: ClavePermiso }>("select permiso from rol_permisos where rol = 'empleado'")),
  ]);
  const orden = (clave: string) => CLAVES_PERMISO.indexOf(clave as ClavePermiso);
  return {
    catalogo: filas
      .filter((f) => orden(f.clave) >= 0)
      .sort((a, b) => orden(a.clave) - orden(b.clave))
      .map((f) => ({ clave: f.clave, modulo: f.modulo, nombre: f.nombre, descripcion: f.descripcion, soloAdmin: f.solo_admin })),
    empleado: asignados.map((f) => f.permiso),
  };
}

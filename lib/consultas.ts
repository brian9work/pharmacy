// Consultas que usan las pantallas. Corren con la sesión de quien entró,
// así que Supabase aplica sus reglas RLS: cada quien ve solo lo permitido.

import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { CLAVES_PERMISO, type ClavePermiso, type Modulo, type Permiso, type Rol } from "@/config/permisos";
import { mensajeDeError } from "@/lib/errores";
import { enZona, fechaCorta, horaEn, hoyEn, momentoEn } from "@/lib/formato";
import { alertasDe, lotesVendibles, ordenarFEFO, sumarPiezas, type Alerta } from "@/lib/inventario";
import { clienteServidor } from "@/lib/supabase/servidor";
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
  Turno,
  Usuario,
  VentaResumen,
} from "@/lib/tipos";

const ZONA_POR_OMISION = "America/Mexico_City";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** La API de Supabase devuelve como máximo 1000 filas por consulta. */
const PAGINA = 1000;

const COLUMNAS_PRODUCTO =
  "id, codigo_barras, nombre, sustancia, presentacion, laboratorio, clasificacion, precio, iva, stock_minimo, ubicacion, refrigerado, categorias(nombre)";
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
  precio: number;
  iva: 0 | 16;
  stock_minimo: number;
  ubicacion: string;
  refrigerado: boolean;
  categorias: { nombre: string } | null;
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
    categoria: f.categorias?.nombre ?? "",
    clasificacion: f.clasificacion,
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

type Respuesta<T> = { data: T | null; error: PostgrestError | null };

/** Devuelve los datos o lanza un error que muestra error.tsx. */
function datos<T>({ data, error }: Respuesta<T>): T {
  if (error) throw new Error(mensajeDeError(error));
  return data as T;
}

/** Trae todas las filas, de 1000 en 1000. */
async function todas<T>(pedir: (desde: number, hasta: number) => PromiseLike<Respuesta<T[]>>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const pagina = datos(await pedir(desde, desde + PAGINA - 1)) ?? [];
    filas.push(...pagina);
    if (pagina.length < PAGINA) return filas;
  }
}

// ---------------------------------------------------------------------------
// Sesión y permisos
// ---------------------------------------------------------------------------

/** Quien inició sesión. Sin sesión va al acceso; con cuenta inactiva, sale. */
export const obtenerSesion = cache(async (): Promise<Sesion> => {
  const supabase = await clienteServidor();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) redirect("/");

  const { data: fila } = await supabase.from("usuarios").select(COLUMNAS_USUARIO).eq("id", id).maybeSingle<FilaUsuario>();
  if (!fila || !fila.activo) redirect("/salir?motivo=inactiva");

  return { usuario: aUsuario(fila, ZONA_POR_OMISION) };
});

export const obtenerPermisos = cache(async (): Promise<Set<ClavePermiso>> => {
  const { usuario } = await obtenerSesion();
  const supabase = await clienteServidor();
  const filas = datos(await supabase.from("permisos_efectivos").select("permiso").eq("usuario_id", usuario.id)) as { permiso: ClavePermiso }[];
  return new Set(filas.map((f) => f.permiso));
});

export async function puede(clave: ClavePermiso): Promise<boolean> {
  return (await obtenerPermisos()).has(clave);
}

export const obtenerZona = cache(async (): Promise<string> => {
  const supabase = await clienteServidor();
  const { data } = await supabase.from("negocio").select("zona_horaria").eq("id", 1).maybeSingle<{ zona_horaria: string }>();
  return data?.zona_horaria ?? ZONA_POR_OMISION;
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
  const supabase = await clienteServidor();
  const filas = await todas<FilaProducto>((desde, hasta) =>
    supabase
      .from("productos")
      .select(COLUMNAS_PRODUCTO)
      .eq("activo", true)
      .order("nombre")
      .order("id")
      .range(desde, hasta)
      .overrideTypes<FilaProducto[], { merge: false }>(),
  );
  return filas.map(aProducto);
});

/** Lotes con piezas, agrupados por producto. */
async function lotesConPiezas(filtro?: { vendiblesDesde: string }): Promise<Map<string, Lote[]>> {
  const supabase = await clienteServidor();
  const filas = await todas<FilaLote>((desde, hasta) => {
    let consulta = supabase.from("lotes").select(COLUMNAS_LOTE).gt("cantidad", 0);
    if (filtro) consulta = consulta.eq("estado", "disponible").gte("caducidad", filtro.vendiblesDesde);
    return consulta.order("caducidad").order("id").range(desde, hasta);
  });
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
  const supabase = await clienteServidor();
  const [producto, lotes, hoy] = await Promise.all([
    supabase.from("productos").select(COLUMNAS_PRODUCTO).eq("id", id).maybeSingle<FilaProducto>(),
    supabase.from("lotes").select(COLUMNAS_LOTE).eq("producto_id", id).order("caducidad").limit(200),
    obtenerHoy(),
  ]);
  const fila = datos(producto);
  if (!fila) return null;
  return armarFila(aProducto(fila), (datos(lotes) as FilaLote[]).map(aLote), hoy);
}

/** Costo por producto. Solo con el permiso inventario.costos. */
export const obtenerCostos = cache(async (): Promise<Map<string, number>> => {
  if (!(await puede("inventario.costos"))) return new Map();
  const supabase = await clienteServidor();
  const filas = await todas<{ producto_id: string; costo: number }>((desde, hasta) =>
    supabase.rpc("costos_productos").range(desde, hasta),
  );
  return new Map(filas.map((f) => [f.producto_id, f.costo]));
});

export async function obtenerKardex(productoId: string): Promise<MovimientoKardex[]> {
  const supabase = await clienteServidor();
  const [respuesta, zona] = await Promise.all([
    supabase
      .from("kardex")
      .select("id, creado_en, tipo, cantidad, lote, usuario, referencia")
      .eq("producto_id", productoId)
      .order("creado_en", { ascending: false })
      .limit(200),
    obtenerZona(),
  ]);
  const filas = datos(respuesta) as {
    id: number;
    creado_en: string;
    tipo: TipoMovimiento;
    cantidad: number;
    lote: string;
    usuario: string | null;
    referencia: string;
  }[];
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
  const supabase = await clienteServidor();
  const [respuesta, zona] = await Promise.all([
    supabase
      .from("ventas_de_hoy")
      .select("id, folio, creado_en, usuario_id, cajero, total, estado, metodo, piezas")
      .order("folio", { ascending: false })
      .limit(100),
    obtenerZona(),
  ]);
  const filas = datos(respuesta) as {
    id: string;
    folio: number;
    creado_en: string;
    usuario_id: string;
    cajero: string | null;
    total: number;
    estado: "pagada" | "cancelada";
    metodo: string | null;
    piezas: number;
  }[];
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
  const supabase = await clienteServidor();
  const venta = datos(
    await supabase
      .from("ventas")
      .select("id, folio, creado_en, usuario_id, turno_id, subtotal, iva, total, estado")
      .eq("id", ventaId)
      .maybeSingle(),
  ) as {
    id: string;
    folio: number;
    creado_en: string;
    usuario_id: string;
    turno_id: string;
    subtotal: number;
    iva: number;
    total: number;
    estado: "pagada" | "cancelada";
  } | null;
  if (!venta) return null;

  const [partidas, pagos, negocio, cajero, turno, zona] = await Promise.all([
    supabase.from("venta_partidas").select("producto_id, cantidad, precio, importe").eq("venta_id", ventaId).order("id"),
    supabase.from("venta_pagos").select("metodo, monto, recibido").eq("venta_id", ventaId).order("id"),
    supabase.from("negocio").select("razon_social, rfc, direccion, telefono, pie_ticket").eq("id", 1).maybeSingle(),
    supabase.from("usuarios").select("nombre").eq("id", venta.usuario_id).maybeSingle(),
    supabase.from("turnos_caja").select("cajas(nombre)").eq("id", venta.turno_id).maybeSingle(),
    obtenerZona(),
  ]);

  const filas = datos(partidas) as { producto_id: string; cantidad: number; precio: number; importe: number }[];
  const ids = [...new Set(filas.map((f) => f.producto_id))];
  const nombres = new Map(
    (datos(await supabase.from("productos").select("id, nombre").in("id", ids)) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre]),
  );

  // Si una venta tomó piezas de dos lotes, en el ticket va un solo renglón.
  const renglones = new Map<string, { nombre: string; cantidad: number; precio: number; importe: number }>();
  for (const f of filas) {
    const clave = `${f.producto_id}:${f.precio}`;
    const previo = renglones.get(clave);
    renglones.set(clave, {
      nombre: nombres.get(f.producto_id) ?? "Producto",
      cantidad: (previo?.cantidad ?? 0) + f.cantidad,
      precio: f.precio,
      importe: (previo?.importe ?? 0) + f.importe,
    });
  }

  const listaPagos = (datos(pagos) as { metodo: MetodoPago; monto: number; recibido: number | null }[]) ?? [];
  const efectivo = listaPagos.find((p) => p.metodo === "efectivo" && p.recibido !== null);
  const n = datos(negocio) as { razon_social: string; rfc: string; direccion: string; telefono: string; pie_ticket: string } | null;
  // Sin tipos generados, Supabase cree que la relación es una lista; es una sola caja.
  const caja = (datos(turno) as unknown as { cajas: { nombre: string } | null } | null)?.cajas?.nombre ?? "";
  const momento = enZona(new Date(venta.creado_en), zona);

  return {
    ventaId: venta.id,
    folio: `V-${String(venta.folio).padStart(6, "0")}`,
    fecha: fechaCorta(momento.fecha),
    hora: momento.hora,
    caja,
    cajero: (datos(cajero) as { nombre: string } | null)?.nombre ?? "",
    negocio: {
      razonSocial: n?.razon_social ?? "",
      rfc: n?.rfc ?? "",
      direccion: n?.direccion ?? "",
      telefono: n?.telefono ?? "",
      pie: n?.pie_ticket ?? "",
    },
    partidas: [...renglones.values()],
    piezas: filas.reduce((suma, f) => suma + f.cantidad, 0),
    subtotal: venta.subtotal,
    iva: venta.iva,
    total: venta.total,
    pagos: listaPagos,
    cambio: efectivo?.recibido != null ? efectivo.recibido - efectivo.monto : null,
    cancelada: venta.estado === "cancelada",
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
  const supabase = await clienteServidor();
  const r = datos(await supabase.rpc("reporte_ventas", { p_desde: desde, p_hasta: hasta })) as Record<string, Json & Json[]>;
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
  const supabase = await clienteServidor();
  const fila = datos(
    await supabase.from("negocio").select("razon_social, rfc, direccion, telefono, pie_ticket, dias_aviso_caducidad").eq("id", 1).maybeSingle(),
  ) as { razon_social: string; rfc: string; direccion: string; telefono: string; pie_ticket: string; dias_aviso_caducidad: number } | null;
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
  const supabase = await clienteServidor();
  const [respuesta, zona] = await Promise.all([
    supabase
      .from("resumen_turnos")
      .select(
        "id, caja, abierto_en, fondo_inicial, ventas, ventas_tarjeta, ventas_transferencia, ventas_efectivo, retiros, efectivo_esperado",
      )
      .eq("usuario_id", usuario.id)
      .is("cerrado_en", null)
      .maybeSingle(),
    obtenerZona(),
  ]);
  const t = datos(respuesta) as {
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
  } | null;
  if (!t) return null;

  const movimientos = datos(
    await supabase
      .from("movimientos_caja")
      .select("id, creado_en, tipo, metodo, concepto, monto")
      .eq("turno_id", t.id)
      .order("creado_en")
      .limit(500),
  ) as { id: number; creado_en: string; tipo: TipoMovimientoCaja; metodo: MetodoPago; concepto: string; monto: number }[];

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
  const supabase = await clienteServidor();
  return datos(await supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre")) as Proveedor[];
}

export async function obtenerUsuarios(): Promise<Usuario[]> {
  const supabase = await clienteServidor();
  const [filas, zona] = await Promise.all([
    todas<FilaUsuario>((desde, hasta) => supabase.from("usuarios").select(COLUMNAS_USUARIO).order("nombre").range(desde, hasta)),
    obtenerZona(),
  ]);
  return filas.map((f) => aUsuario(f, zona));
}

export async function obtenerCategorias(): Promise<Categoria[]> {
  const supabase = await clienteServidor();
  return datos(await supabase.from("categorias").select("id, nombre").order("nombre")) as Categoria[];
}

/** Proveedores activos e inactivos, para administrarlos. */
export async function obtenerProveedoresTodos(): Promise<ProveedorCompleto[]> {
  const supabase = await clienteServidor();
  return datos(
    await supabase.from("proveedores").select("id, nombre, rfc, telefono, correo, activo").order("activo", { ascending: false }).order("nombre"),
  ) as ProveedorCompleto[];
}

export async function obtenerProductoParaEditar(id: string): Promise<ProductoEdicion | null> {
  if (!UUID.test(id)) return null;
  const supabase = await clienteServidor();
  const fila = datos(
    await supabase
      .from("productos")
      .select(`${COLUMNAS_PRODUCTO}, categoria_id, activo`)
      .eq("id", id)
      .maybeSingle(),
  ) as unknown as (FilaProducto & { categoria_id: number | null; activo: boolean }) | null;
  return fila ? { ...aProducto(fila), categoriaId: fila.categoria_id, activo: fila.activo } : null;
}

export async function obtenerProductosInactivos(): Promise<{ id: string; nombre: string; presentacion: string }[]> {
  const supabase = await clienteServidor();
  return datos(
    await supabase.from("productos").select("id, nombre, presentacion").eq("activo", false).order("nombre").limit(500),
  ) as { id: string; nombre: string; presentacion: string }[];
}

/** Códigos de barras ya usados (activos e inactivos), para avisar antes de guardar. */
export async function obtenerCodigosRegistrados(): Promise<Record<string, { id: string; nombre: string }>> {
  const supabase = await clienteServidor();
  const filas = await todas<{ id: string; nombre: string; codigo_barras: string }>((desde, hasta) =>
    supabase.from("productos").select("id, nombre, codigo_barras").not("codigo_barras", "is", null).order("id").range(desde, hasta),
  );
  return Object.fromEntries(filas.map((f) => [f.codigo_barras.toUpperCase(), { id: f.id, nombre: f.nombre }]));
}

/** Catálogo de permisos y los que hoy tiene el rol empleado. */
export async function obtenerPermisosConfigurables(): Promise<{ catalogo: Permiso[]; empleado: ClavePermiso[] }> {
  const supabase = await clienteServidor();
  const [catalogo, asignados] = await Promise.all([
    supabase.from("permisos").select("clave, modulo, nombre, descripcion, solo_admin"),
    supabase.from("rol_permisos").select("permiso").eq("rol", "empleado"),
  ]);
  const orden = (clave: string) => CLAVES_PERMISO.indexOf(clave as ClavePermiso);
  const filas = datos(catalogo) as { clave: ClavePermiso; modulo: Modulo; nombre: string; descripcion: string; solo_admin: boolean }[];
  return {
    catalogo: filas
      .filter((f) => orden(f.clave) >= 0)
      .sort((a, b) => orden(a.clave) - orden(b.clave))
      .map((f) => ({ clave: f.clave, modulo: f.modulo, nombre: f.nombre, descripcion: f.descripcion, soloAdmin: f.solo_admin })),
    empleado: (datos(asignados) as { permiso: ClavePermiso }[]).map((f) => f.permiso),
  };
}

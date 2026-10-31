// Lógica de "Subir datos": qué se manda a la nube, en qué orden y con qué ids.
// No sabe de red ni de base: recibe un `Local` (PostgreSQL de la farmacia) y
// una `Nube` (Supabase), así se prueba entera sin ninguno de los dos.
//
// Orden:
//   1. Cuentas: se emparejan por correo (la nube debe tener las mismas).
//   2. Catálogo: categorías y proveedores, luego productos y luego lotes.
//      Cada paso devuelve "id local → id en la nube" y los siguientes lo usan.
//   3. Entradas y turnos de caja.
//   4. Ventas con sus detalles, de 100 en 100.
// Todo es repetible: lo que ya está en la nube no se duplica.

export type Fila = Record<string, unknown>;

export interface DatosLocales {
  usuarios: Fila[];
  categorias: Fila[];
  proveedores: Fila[];
  productos: Fila[];
  lotes: Fila[];
  recepciones: Fila[];
  recepcion_partidas: Fila[];
  turnos: Fila[];
  ventas: Fila[];
  recetas: Fila[];
  venta_partidas: Fila[];
  venta_pagos: Fila[];
  movimientos_caja: Fila[];
  movimientos_inventario: Fila[];
}

type Mapa = Record<string, string | number>;

export interface RespuestaCatalogo {
  categorias: Mapa;
  proveedores: Mapa;
  productos: Mapa;
  lotes: Mapa;
  conteo: Record<string, number>;
}

/** Supabase: las tres funciones de supabase/migrations/20261031120000_subir_datos.sql. */
export interface Nube {
  /** correo → id de la cuenta en la nube (solo los que existen). */
  usuarios(correos: string[]): Promise<Record<string, string>>;
  catalogo(cuerpo: Fila): Promise<RespuestaCatalogo>;
  operacion(cuerpo: Fila): Promise<Record<string, number>>;
}

/** PostgreSQL de la farmacia: las funciones de postgres/actualizaciones/20261031_subir_datos.sql. */
export interface Local {
  iniciar(): Promise<{ id: number; desde: string }>;
  datos(desde: string): Promise<DatosLocales>;
  terminar(id: number, ok: boolean, resumen: ResumenSubida | null, error: string | null): Promise<void>;
}

export interface ResumenSubida {
  /** Lo que hizo la nube con el catálogo: productos nuevos, lotes actualizados… */
  catalogo: Record<string, number>;
  /** Lo que hizo con entradas, turnos y ventas: ventas nuevas, las que ya estaban… */
  operacion: Record<string, number>;
  /** Registros que no se subieron porque su cajero no tiene cuenta en la nube. */
  sinCuenta: { correos: string[]; ventas: number; entradas: number; movimientos: number };
  /**
   * true si no quedó nada pendiente. Solo entonces la siguiente subida empieza
   * después de esta; si no, vuelve a mandar lo mismo (la nube no duplica).
   */
  completa: boolean;
}

/** Cuentas que faltan, folios repetidos… todo lo que deja algo sin subir. */
const PENDIENTES = ["ventas_sin_turno", "ventas_folio_repetido", "entradas_en_conflicto", "turnos_en_conflicto"];

const PRODUCTOS_POR_LLAMADA = 400;
const LOTES_POR_LLAMADA = 800;
const VENTAS_POR_LLAMADA = 100;

const texto = (valor: unknown) => String(valor);

function trozos<T>(lista: T[], tamano: number): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) salida.push(lista.slice(i, i + tamano));
  return salida;
}

function sumar(total: Record<string, number>, parcial: Record<string, number>) {
  for (const [clave, valor] of Object.entries(parcial)) total[clave] = (total[clave] ?? 0) + Number(valor);
}

function agrupar(filas: Fila[], campo: string): Map<string, Fila[]> {
  const grupos = new Map<string, Fila[]>();
  for (const fila of filas) {
    if (fila[campo] == null) continue;
    const clave = texto(fila[campo]);
    grupos.set(clave, [...(grupos.get(clave) ?? []), fila]);
  }
  return grupos;
}

/** Sube lo pendiente. Deja constancia en la base local de cómo salió. */
export async function sincronizar(local: Local, nube: Nube): Promise<ResumenSubida> {
  const inicio = await local.iniciar();
  try {
    const resumen = await subir(await local.datos(inicio.desde), nube);
    await local.terminar(inicio.id, true, resumen, null);
    return resumen;
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    await local.terminar(inicio.id, false, null, mensaje).catch(() => {});
    throw error;
  }
}

async function subir(datos: DatosLocales, nube: Nube): Promise<ResumenSubida> {
  // 1. Cuentas, por correo.
  const correoDe = new Map(datos.usuarios.map((u) => [texto(u.id), texto(u.correo)]));
  const enNube = await nube.usuarios([...correoDe.values()]);
  const faltan = new Set<string>();
  const sinCuenta = { correos: [] as string[], ventas: 0, entradas: 0, movimientos: 0 };

  /** Id de la cuenta en la nube, o null (y se anota qué correo falta). */
  const cuenta = (idLocal: unknown): string | null => {
    if (idLocal == null) return null;
    const correo = correoDe.get(texto(idLocal));
    if (!correo) return null;
    const id = enNube[correo];
    if (!id) faltan.add(correo);
    return id ?? null;
  };

  // 2. Catálogo.
  const catalogo: Record<string, number> = {};
  const inicial = await nube.catalogo({ categorias: datos.categorias, proveedores: datos.proveedores });
  sumar(catalogo, inicial.conteo);
  const categorias = inicial.categorias;
  const proveedores = inicial.proveedores;

  const productos: Mapa = {};
  for (const grupo of trozos(datos.productos, PRODUCTOS_POR_LLAMADA)) {
    const respuesta = await nube.catalogo({
      productos: grupo.map((p) => ({ ...p, categoria_id: p.categoria_id == null ? null : buscar(categorias, p.categoria_id, "categoría") })),
    });
    sumar(catalogo, respuesta.conteo);
    Object.assign(productos, respuesta.productos);
  }

  const lotes: Mapa = {};
  for (const grupo of trozos(datos.lotes, LOTES_POR_LLAMADA)) {
    const respuesta = await nube.catalogo({
      lotes: grupo.map((l) => ({ ...l, producto_id: buscar(productos, l.producto_id, "producto") })),
    });
    sumar(catalogo, respuesta.conteo);
    Object.assign(lotes, respuesta.lotes);
  }

  const moverInventario = (m: Fila, usuario: string | null): Fila => ({
    ...m,
    lote_id: buscar(lotes, m.lote_id, "lote"),
    producto_id: buscar(productos, m.producto_id, "producto"),
    usuario_id: usuario,
  });

  // 3. Entradas de mercancía y turnos de caja.
  const recepcionesOk = new Map<string, string>(); // id de la entrada → cuenta de quien la recibió
  const recepciones: Fila[] = [];
  for (const r of datos.recepciones) {
    const usuario = cuenta(r.usuario_id);
    if (!usuario) {
      sinCuenta.entradas++;
      continue;
    }
    recepciones.push({ ...r, usuario_id: usuario, proveedor_id: buscar(proveedores, r.proveedor_id, "proveedor") });
    recepcionesOk.set(texto(r.id), usuario);
  }
  const partidasEntrada = datos.recepcion_partidas
    .filter((p) => recepcionesOk.has(texto(p.recepcion_id)))
    .map((p) => ({ ...p, lote_id: buscar(lotes, p.lote_id, "lote") }));
  const movimientosEntrada = datos.movimientos_inventario
    .filter((m) => m.recepcion_id != null && recepcionesOk.has(texto(m.recepcion_id)))
    .map((m) => moverInventario(m, recepcionesOk.get(texto(m.recepcion_id)) ?? null));

  const turnosOk = new Set<string>();
  const turnos: Fila[] = [];
  for (const t of datos.turnos) {
    const usuario = cuenta(t.usuario_id);
    if (!usuario) continue; // sus ventas se cuentan más abajo
    turnos.push({ ...t, usuario_id: usuario });
    turnosOk.add(texto(t.id));
  }

  // Movimientos que no cuelgan de una venta ni de una entrada (inventario
  // inicial, ajustes, retiros de efectivo): la nube los reconoce por su id local.
  const sueltosInventario: Fila[] = [];
  for (const m of datos.movimientos_inventario) {
    if (m.venta_id != null || m.recepcion_id != null) continue;
    const usuario = m.usuario_id == null ? null : cuenta(m.usuario_id);
    if (m.usuario_id != null && !usuario) {
      sinCuenta.movimientos++;
      continue;
    }
    sueltosInventario.push(moverInventario(m, usuario));
  }
  const sueltosCaja: Fila[] = [];
  for (const m of datos.movimientos_caja) {
    if (m.venta_id != null) continue;
    const usuario = cuenta(m.usuario_id);
    if (!usuario || !turnosOk.has(texto(m.turno_id))) {
      sinCuenta.movimientos++;
      continue;
    }
    sueltosCaja.push({ ...m, usuario_id: usuario, autorizado_por: cuenta(m.autorizado_por) });
  }

  const operacion: Record<string, number> = {};
  sumar(
    operacion,
    await nube.operacion({
      recepciones,
      recepcion_partidas: partidasEntrada,
      turnos,
      movimientos_inventario: [...movimientosEntrada, ...sueltosInventario],
      movimientos_caja: sueltosCaja,
    }),
  );

  // 4. Ventas con sus detalles.
  const ventas: { fila: Fila; usuario: string }[] = [];
  for (const v of datos.ventas) {
    const usuario = cuenta(v.usuario_id);
    const cancelo = v.cancelada_por == null ? null : cuenta(v.cancelada_por);
    const cancelacionValida = v.estado !== "cancelada" || cancelo != null;
    if (!usuario || !turnosOk.has(texto(v.turno_id)) || !cancelacionValida) {
      sinCuenta.ventas++;
      continue;
    }
    ventas.push({ fila: { ...v, usuario_id: usuario, cancelada_por: cancelo }, usuario });
  }
  const recetasDe = agrupar(datos.recetas, "venta_id");
  const partidasDe = agrupar(datos.venta_partidas, "venta_id");
  const pagosDe = agrupar(datos.venta_pagos, "venta_id");
  const cajaDe = agrupar(datos.movimientos_caja, "venta_id");
  const inventarioDe = agrupar(datos.movimientos_inventario, "venta_id");

  for (const grupo of trozos(ventas, VENTAS_POR_LLAMADA)) {
    const cuerpo: Record<string, Fila[]> = {
      ventas: [],
      recetas: [],
      venta_partidas: [],
      venta_pagos: [],
      movimientos_caja: [],
      movimientos_inventario: [],
    };
    for (const { fila, usuario } of grupo) {
      const id = texto(fila.id);
      cuerpo.ventas.push(fila);
      for (const r of recetasDe.get(id) ?? []) cuerpo.recetas.push({ ...r, registrada_por: cuenta(r.registrada_por) ?? usuario });
      for (const p of partidasDe.get(id) ?? []) {
        cuerpo.venta_partidas.push({
          ...p,
          producto_id: buscar(productos, p.producto_id, "producto"),
          lote_id: buscar(lotes, p.lote_id, "lote"),
        });
      }
      for (const p of pagosDe.get(id) ?? []) cuerpo.venta_pagos.push(p);
      for (const m of cajaDe.get(id) ?? []) {
        cuerpo.movimientos_caja.push({ ...m, usuario_id: cuenta(m.usuario_id) ?? usuario, autorizado_por: cuenta(m.autorizado_por) });
      }
      for (const m of inventarioDe.get(id) ?? []) cuerpo.movimientos_inventario.push(moverInventario(m, cuenta(m.usuario_id) ?? usuario));
    }
    sumar(operacion, await nube.operacion(cuerpo));
  }

  sinCuenta.correos = [...faltan].sort();
  const completa =
    sinCuenta.ventas + sinCuenta.entradas + sinCuenta.movimientos === 0 && PENDIENTES.every((clave) => !operacion[clave]);
  return { catalogo, operacion, sinCuenta, completa };
}

/** Id en la nube de un registro local; si falta, algo no cuadra y se detiene. */
function buscar(mapa: Mapa, idLocal: unknown, que: string): string | number {
  const id = mapa[texto(idLocal)];
  if (id === undefined) throw new Error(`No se encontró en la nube un ${que} que se necesita para subir (id local ${texto(idLocal)}).`);
  return id;
}

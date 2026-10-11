"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerPermisos } from "@/lib/consultas";
import { mensajeDeError } from "@/lib/errores";
import { consultar, consultarFila, intentar } from "@/lib/db/sesion";
import { leerProducto, type DatosProducto } from "@/lib/validacion-producto";
import { productos as textos } from "./contenido";

export interface EstadoFormulario {
  error?: string;
  ok?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAMPOS = [
  "codigoBarras", "nombre", "sustancia", "presentacion", "laboratorio", "categoria", "categoriaNueva",
  "clasificacion", "requiereReceta", "precio", "costo", "iva", "stockMinimo", "ubicacion", "refrigerado", "activo",
];

function camposDe(formulario: FormData): Record<string, string | undefined> {
  return Object.fromEntries(CAMPOS.map((c) => [c, formulario.has(c) ? String(formulario.get(c)) : undefined]));
}

function mensaje(error: { code?: string; message: string }) {
  return error.code === "23505" ? textos.errores.codigoRepetido : mensajeDeError(error);
}

/** Id de la categoría elegida; si es nueva, la crea (o reutiliza la que ya se llame igual). */
async function idCategoria(categoria: DatosProducto["categoria"]) {
  if (!categoria) return { id: null };
  if ("id" in categoria) return { id: categoria.id };
  const { datos, error } = await intentar(consultarFila<{ id: number }>("insert into categorias (nombre) values ($1) returning id", [categoria.nueva]));
  if (!error) return { id: datos!.id };
  if (error.code !== "23505") return { error: mensajeDeError(error) };
  const existente = await consultarFila<{ id: number }>("select id from categorias where nombre = $1", [categoria.nueva]).catch(() => null);
  return existente ? { id: existente.id } : { error: mensajeDeError(error) };
}

export async function crearProducto(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  if (!(await obtenerPermisos()).has("productos.crear")) return { error: textos.errores.permiso };

  const lectura = leerProducto(camposDe(formulario));
  if (!lectura.ok) return { error: lectura.error };
  const d = lectura.datos;

  const categoria = await idCategoria(d.categoria);
  if ("error" in categoria) return { error: categoria.error };

  // La regla RLS vuelve a exigir productos.crear.
  const { datos, error } = await intentar(
    consultarFila<{ id: string }>(
      `insert into productos (codigo_barras, nombre, sustancia, presentacion, laboratorio, categoria_id, clasificacion,
                              requiere_receta, precio, costo, iva, stock_minimo, ubicacion, refrigerado)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       returning id`,
      [
        d.codigoBarras,
        d.nombre,
        d.sustancia,
        d.presentacion,
        d.laboratorio,
        categoria.id,
        d.clasificacion,
        d.requiereReceta,
        d.precio,
        d.costo ?? 0,
        d.iva,
        d.stockMinimo,
        d.ubicacion,
        d.refrigerado,
      ],
    ),
  );
  if (error) return { error: mensaje(error) };

  redirect(`/inventario/${datos!.id}?creado=1`);
}

export async function editarProducto(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const permisos = await obtenerPermisos();
  const editar = permisos.has("productos.editar");
  const precios = permisos.has("productos.precios");
  if (!editar && !precios) return { error: textos.errores.permiso };

  const id = String(formulario.get("id") ?? "");
  if (!UUID.test(id)) return { error: textos.errores.noExiste };

  const lectura = leerProducto(camposDe(formulario));
  if (!lectura.ok) return { error: lectura.error };
  const d = lectura.datos;

  // Solo se mandan los campos que la persona puede cambiar; la base lo vuelve a revisar.
  const cambios: Record<string, unknown> = {};
  if (editar) {
    const categoria = await idCategoria(d.categoria);
    if ("error" in categoria) return { error: categoria.error };
    Object.assign(cambios, {
      codigo_barras: d.codigoBarras,
      nombre: d.nombre,
      sustancia: d.sustancia,
      presentacion: d.presentacion,
      laboratorio: d.laboratorio,
      categoria_id: categoria.id,
      clasificacion: d.clasificacion,
      requiere_receta: d.requiereReceta,
      iva: d.iva,
      stock_minimo: d.stockMinimo,
      ubicacion: d.ubicacion,
      refrigerado: d.refrigerado,
      activo: d.activo,
    });
  }
  if (precios) {
    cambios.precio = d.precio;
    if (d.costo !== null) cambios.costo = d.costo;
  }

  // Los nombres de columna salen de este archivo, nunca del formulario.
  const columnas = Object.keys(cambios);
  const asignaciones = columnas.map((columna, i) => `${columna} = $${i + 1}`).join(", ");
  const { datos, error } = await intentar(
    consultar(`update productos set ${asignaciones} where id = $${columnas.length + 1} returning id`, [...Object.values(cambios), id]),
  );
  if (error) return { error: mensaje(error) };
  if (!datos.length) return { error: textos.errores.noExiste };

  refresh();
  return { ok: true };
}

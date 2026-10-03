"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerPermisos } from "@/lib/consultas";
import { mensajeDeError } from "@/lib/errores";
import { clienteServidor } from "@/lib/supabase/servidor";
import { leerProducto, type DatosProducto } from "@/lib/validacion-producto";
import { productos as textos } from "./contenido";

export interface EstadoFormulario {
  error?: string;
  ok?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAMPOS = [
  "codigoBarras", "nombre", "sustancia", "presentacion", "laboratorio", "categoria", "categoriaNueva",
  "clasificacion", "precio", "costo", "iva", "stockMinimo", "ubicacion", "refrigerado", "activo",
];

function camposDe(formulario: FormData): Record<string, string | undefined> {
  return Object.fromEntries(CAMPOS.map((c) => [c, formulario.has(c) ? String(formulario.get(c)) : undefined]));
}

function mensaje(error: { code?: string; message: string }) {
  return error.code === "23505" ? textos.errores.codigoRepetido : mensajeDeError(error);
}

/** Id de la categoría elegida; si es nueva, la crea (o reutiliza la que ya se llame igual). */
async function idCategoria(supabase: SupabaseClient, categoria: DatosProducto["categoria"]) {
  if (!categoria) return { id: null };
  if ("id" in categoria) return { id: categoria.id };
  const { data, error } = await supabase.from("categorias").insert({ nombre: categoria.nueva }).select("id").single<{ id: number }>();
  if (!error) return { id: data.id };
  if (error.code !== "23505") return { error: mensajeDeError(error) };
  const { data: existente } = await supabase.from("categorias").select("id").eq("nombre", categoria.nueva).maybeSingle<{ id: number }>();
  return existente ? { id: existente.id } : { error: mensajeDeError(error) };
}

export async function crearProducto(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  if (!(await obtenerPermisos()).has("productos.crear")) return { error: textos.errores.permiso };

  const lectura = leerProducto(camposDe(formulario));
  if (!lectura.ok) return { error: lectura.error };
  const d = lectura.datos;

  const supabase = await clienteServidor();
  const categoria = await idCategoria(supabase, d.categoria);
  if ("error" in categoria) return { error: categoria.error };

  // La regla RLS vuelve a exigir productos.crear.
  const { data, error } = await supabase
    .from("productos")
    .insert({
      codigo_barras: d.codigoBarras,
      nombre: d.nombre,
      sustancia: d.sustancia,
      presentacion: d.presentacion,
      laboratorio: d.laboratorio,
      categoria_id: categoria.id,
      clasificacion: d.clasificacion,
      precio: d.precio,
      costo: d.costo ?? 0,
      iva: d.iva,
      stock_minimo: d.stockMinimo,
      ubicacion: d.ubicacion,
      refrigerado: d.refrigerado,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { error: mensaje(error) };

  redirect(`/inventario/${data.id}?creado=1`);
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

  const supabase = await clienteServidor();
  // Solo se mandan los campos que la persona puede cambiar; la base lo vuelve a revisar.
  const cambios: Record<string, unknown> = {};
  if (editar) {
    const categoria = await idCategoria(supabase, d.categoria);
    if ("error" in categoria) return { error: categoria.error };
    Object.assign(cambios, {
      codigo_barras: d.codigoBarras,
      nombre: d.nombre,
      sustancia: d.sustancia,
      presentacion: d.presentacion,
      laboratorio: d.laboratorio,
      categoria_id: categoria.id,
      clasificacion: d.clasificacion,
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

  const { data, error } = await supabase.from("productos").update(cambios).eq("id", id).select("id");
  if (error) return { error: mensaje(error) };
  if (!data?.length) return { error: textos.errores.noExiste };

  refresh();
  return { ok: true };
}

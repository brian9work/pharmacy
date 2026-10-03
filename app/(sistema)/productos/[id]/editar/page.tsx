import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EncabezadoPagina } from "@/app/components/encabezado-pagina";
import { enlace } from "@/app/components/estilos";
import { obtenerCategorias, obtenerCodigosRegistrados, obtenerCostos, obtenerPermisos, obtenerProductoParaEditar } from "@/lib/consultas";
import { productos as textos } from "../../contenido";
import { FormularioProducto } from "../../formulario-producto";

export const metadata: Metadata = { title: textos.editar.titulo };

export default async function EditarProducto({ params }: PageProps<"/productos/[id]/editar">) {
  const permisos = await obtenerPermisos();
  const editar = permisos.has("productos.editar");
  const precios = permisos.has("productos.precios");
  if (!editar && !precios) redirect("/panel");

  const { id } = await params;
  const producto = await obtenerProductoParaEditar(id);
  if (!producto) notFound();

  const [categorias, codigos, costos] = await Promise.all([obtenerCategorias(), obtenerCodigosRegistrados(), obtenerCostos()]);

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/inventario/${producto.id}`} className={`${enlace} text-[15px]`}>
          ‹ {producto.nombre}
        </Link>
        <div className="mt-4">
          <EncabezadoPagina etiqueta={textos.etiqueta} titulo={textos.editar.titulo} descripcion={textos.editar.descripcion} />
        </div>
      </div>
      <FormularioProducto
        producto={producto}
        costo={costos.get(producto.id)}
        categorias={categorias}
        codigos={codigos}
        permisos={{ editar, precios }}
      />
    </div>
  );
}

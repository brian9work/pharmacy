import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/app/components/encabezado-pagina";
import { obtenerCategorias, obtenerCodigosRegistrados, puede } from "@/lib/consultas";
import { productos as textos } from "../contenido";
import { FormularioProducto } from "../formulario-producto";

export const metadata: Metadata = { title: textos.nuevo.titulo };

export default async function NuevoProducto() {
  if (!(await puede("productos.crear"))) redirect("/panel");

  const [categorias, codigos] = await Promise.all([obtenerCategorias(), obtenerCodigosRegistrados()]);

  return (
    <div className="space-y-8">
      <EncabezadoPagina etiqueta={textos.etiqueta} titulo={textos.nuevo.titulo} descripcion={textos.nuevo.descripcion} />
      <FormularioProducto categorias={categorias} codigos={codigos} permisos={{ editar: true, precios: true }} />
    </div>
  );
}

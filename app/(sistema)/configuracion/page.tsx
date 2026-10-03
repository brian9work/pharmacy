import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/app/components/encabezado-pagina";
import { obtenerNegocio, puede } from "@/lib/consultas";
import { configuracion as textos } from "./contenido";
import { FormularioNegocio } from "./formulario-negocio";

export const metadata: Metadata = { title: textos.titulo };

export default async function Configuracion() {
  if (!(await puede("configuracion.editar"))) redirect("/panel");
  const negocio = await obtenerNegocio();

  return (
    <div className="space-y-8">
      <EncabezadoPagina titulo={textos.titulo} descripcion={textos.descripcion} />
      <FormularioNegocio negocio={negocio} />
    </div>
  );
}

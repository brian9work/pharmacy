import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/app/components/encabezado-pagina";
import { obtenerEstadoSubida, obtenerNegocio, puede } from "@/lib/consultas";
import { nubeConfigurada } from "@/lib/nube";
import { configuracion as textos } from "./contenido";
import { FormularioNegocio } from "./formulario-negocio";
import { SubirDatos } from "./subir-datos";

export const metadata: Metadata = { title: textos.titulo };

export default async function Configuracion() {
  if (!(await puede("configuracion.editar"))) redirect("/panel");
  const [negocio, subida] = await Promise.all([obtenerNegocio(), obtenerEstadoSubida()]);

  return (
    <div className="space-y-8">
      <EncabezadoPagina titulo={textos.titulo} descripcion={textos.descripcion} />
      <FormularioNegocio negocio={negocio} />
      <SubirDatos
        datos={{ sinConfigurar: !nubeConfigurada(), sinActualizar: !subida.disponible, ultimaBuena: subida.ultimaBuena, ultimo: subida.ultimo }}
      />
    </div>
  );
}

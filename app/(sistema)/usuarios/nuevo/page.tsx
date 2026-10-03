import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/app/components/encabezado-pagina";
import { puede } from "@/lib/consultas";
import { usuarios } from "../contenido";
import { FormularioUsuario } from "./formulario-usuario";

const textos = usuarios.alta;

export const metadata: Metadata = { title: textos.titulo };

export default async function NuevoUsuario() {
  if (!(await puede("usuarios.gestionar"))) redirect("/panel");

  return (
    <div className="space-y-8">
      <EncabezadoPagina etiqueta={textos.etiqueta} titulo={textos.titulo} descripcion={textos.descripcion} />
      <FormularioUsuario />
    </div>
  );
}

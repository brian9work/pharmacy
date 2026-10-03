import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/app/components/encabezado-pagina";
import { obtenerPermisosConfigurables, puede } from "@/lib/consultas";
import { permisos } from "../contenido";
import { MatrizPermisos } from "./matriz-permisos";

export const metadata: Metadata = { title: permisos.titulo };

export default async function Permisos() {
  if (!(await puede("permisos.gestionar"))) redirect("/panel");

  const { catalogo, empleado } = await obtenerPermisosConfigurables();

  return (
    <div className="space-y-8">
      <EncabezadoPagina etiqueta={permisos.etiqueta} titulo={permisos.titulo} descripcion={permisos.descripcion} />
      <MatrizPermisos catalogo={catalogo} asignados={empleado} />
    </div>
  );
}

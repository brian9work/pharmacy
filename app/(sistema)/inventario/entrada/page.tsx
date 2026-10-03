import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/app/components/encabezado-pagina";
import { obtenerCostos, obtenerHoy, obtenerProductos, obtenerProveedores, puede } from "@/lib/consultas";
import { entrada } from "./contenido";
import { EntradaMercancia } from "./entrada-mercancia";

export const metadata: Metadata = { title: entrada.titulo };

export default async function Entrada() {
  if (!(await puede("inventario.entrada"))) redirect("/panel");

  const [productos, proveedores, hoy, costos] = await Promise.all([obtenerProductos(), obtenerProveedores(), obtenerHoy(), obtenerCostos()]);

  return (
    <div className="space-y-8">
      <EncabezadoPagina etiqueta={entrada.etiqueta} titulo={entrada.titulo} descripcion={entrada.descripcion} />
      <EntradaMercancia productos={productos} proveedores={proveedores} hoy={hoy} costos={Object.fromEntries(costos)} />
    </div>
  );
}

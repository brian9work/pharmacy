import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerPermisos, obtenerTurnoAbierto } from "@/lib/consultas";
import { caja } from "./contenido";
import { CorteCaja } from "./corte-caja";

export const metadata: Metadata = { title: caja.titulo };

export default async function Caja() {
  const permisos = await obtenerPermisos();
  const abrir = permisos.has("caja.abrir");
  const cerrar = permisos.has("caja.cerrar");
  if (!abrir && !cerrar) redirect("/panel");

  // Corte ciego: si quien entra no supervisa cajas, la base no le manda el
  // efectivo esperado mientras la caja está abierta.
  const turno = await obtenerTurnoAbierto();
  return <CorteCaja turno={turno} puedeAbrir={abrir} puedeCerrar={cerrar} />;
}

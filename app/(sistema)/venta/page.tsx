import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { botonPrincipal, tarjetaLibre } from "@/app/components/estilos";
import { obtenerCatalogoVenta, obtenerHoy, obtenerTurnoAbierto, puede } from "@/lib/consultas";
import { venta } from "./contenido";
import { PuntoDeVenta } from "./punto-de-venta";

export const metadata: Metadata = { title: venta.titulo };

export default async function Venta() {
  if (!(await puede("ventas.vender"))) redirect("/panel");

  const [turno, catalogo, hoy] = await Promise.all([obtenerTurnoAbierto(), obtenerCatalogoVenta(), obtenerHoy()]);

  if (!turno) {
    return (
      <div className={`${tarjetaLibre} mx-auto mt-10 max-w-lg p-8 text-center`}>
        <h1 className="text-2xl font-semibold tracking-tight">{venta.sinCaja.titulo}</h1>
        <p className="mt-2 text-[17px] leading-7 text-muted">{venta.sinCaja.texto}</p>
        <Link href="/caja" className={`${botonPrincipal} mt-6`}>
          {venta.sinCaja.accion}
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="sr-only">{venta.titulo}</h1>
      <PuntoDeVenta catalogo={catalogo} hoy={hoy} />
    </>
  );
}

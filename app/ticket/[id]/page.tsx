import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { textosTicket } from "@/app/components/contenido";
import { enlace } from "@/app/components/estilos";
import { EstiloImpresionTicket, Ticket } from "@/app/components/ticket";
import { obtenerSesion, obtenerTicket } from "@/lib/consultas";
import { BotonImprimir } from "./boton-imprimir";

export async function generateMetadata({ params }: PageProps<"/ticket/[id]">): Promise<Metadata> {
  const { id } = await params;
  const ticket = await obtenerTicket(id);
  return { title: ticket ? textosTicket.etiqueta(ticket.folio) : "Ticket" };
}

/** Reimpresión de un ticket. Solo lo ve quien puede ver esa venta (RLS). */
export default async function PaginaTicket({ params, searchParams }: PageProps<"/ticket/[id]">) {
  await obtenerSesion();
  const [{ id }, { imprimir }] = await Promise.all([params, searchParams]);
  const ticket = await obtenerTicket(id);
  if (!ticket) notFound();

  return (
    <main className="flex min-h-dvh flex-col items-center gap-6 bg-surface px-4 py-8 print:block print:bg-white print:p-0">
      <EstiloImpresionTicket />
      <div className="flex w-full max-w-sm items-center justify-between gap-4 print:hidden">
        <Link href="/panel" className={`${enlace} text-[17px]`}>
          ‹ {textosTicket.volver}
        </Link>
        <BotonImprimir automatico={imprimir === "1"} />
      </div>
      <div className="shadow-[0_8px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/5 print:shadow-none print:ring-0">
        <Ticket ticket={ticket} />
      </div>
    </main>
  );
}

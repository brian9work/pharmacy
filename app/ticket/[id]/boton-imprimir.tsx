"use client";

import { useEffect } from "react";
import { textosTicket } from "@/app/components/contenido";
import { botonPrincipal } from "@/app/components/estilos";
import { Icono } from "@/app/components/icono";

export function BotonImprimir({ automatico }: { automatico: boolean }) {
  useEffect(() => {
    if (automatico) window.print();
  }, [automatico]);

  return (
    <button type="button" onClick={() => window.print()} className={botonPrincipal}>
      <Icono nombre="imprimir" className="size-5" />
      {textosTicket.imprimir}
    </button>
  );
}

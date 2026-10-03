import type { Metadata } from "next";
import { BotonTema } from "@/app/components/boton-tema";
import { Marca } from "@/app/components/marca";
import { marca } from "@/config/marca";
import { acceso } from "./contenido";
import { FormularioAcceso } from "./formulario-acceso";

export const metadata: Metadata = { title: { absolute: `${acceso.titulo} · ${marca.nombre}` } };

export default async function Acceso({ searchParams }: PageProps<"/">) {
  const { motivo } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <div className="flex justify-end p-4">
        <BotonTema />
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pb-20 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center">
            <Marca tamano="grande" />
            <p className="mt-2 text-[17px] text-muted">{marca.descripcion}</p>
          </div>
          <FormularioAcceso aviso={motivo === "inactiva" ? acceso.avisos.inactiva : undefined} />
          <p className="mt-6 text-center text-[15px] leading-6 text-muted">{acceso.ayuda}</p>
        </div>
      </main>
    </div>
  );
}

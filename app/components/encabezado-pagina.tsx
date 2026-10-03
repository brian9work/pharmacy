import type { ReactNode } from "react";
import { etiquetaSobreTitulo } from "@/app/components/estilos";

/** Título de pantalla: etiqueta, h1, descripción y, a la derecha, sus acciones. */
export function EncabezadoPagina({
  etiqueta,
  titulo,
  descripcion,
  children,
}: {
  etiqueta?: string;
  titulo: string;
  descripcion?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {etiqueta && <p className={etiquetaSobreTitulo}>{etiqueta}</p>}
        <h1 className="mt-1 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{titulo}</h1>
        {descripcion && <p className="mt-2 text-[17px] leading-7 text-muted">{descripcion}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-3">{children}</div>}
    </header>
  );
}

/** Sección dentro de una pantalla, con su h2 y una acción secundaria opcional. */
export function Seccion({
  id,
  titulo,
  accion,
  children,
  className = "",
}: {
  id: string;
  titulo: string;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={className}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id={id} className="text-xl font-semibold tracking-tight">
          {titulo}
        </h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

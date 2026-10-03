"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono, type NombreIcono } from "@/app/components/icono";
import { textosComunes } from "@/app/components/contenido";

export interface ElementoNavegacion {
  href: string;
  etiqueta: string;
  icono: NombreIcono;
}

/** En móvil es una fila que se desplaza; desde lg, la columna lateral. */
export function Navegacion({ elementos }: { elementos: ElementoNavegacion[] }) {
  const ruta = usePathname();
  // Activo: el enlace más específico que contiene la ruta actual.
  const activo = elementos
    .filter((e) => ruta === e.href || ruta.startsWith(`${e.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label={textosComunes.navegacion} className="min-w-0">
      <ul className="flex gap-1 overflow-x-auto px-4 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
        {elementos.map((e) => {
          const esActivo = e.href === activo;
          return (
            <li key={e.href} className="shrink-0">
              <Link
                href={e.href}
                aria-current={esActivo ? "page" : undefined}
                className={`flex items-center gap-3 whitespace-nowrap rounded-full px-4 py-2 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:rounded-xl lg:px-3 ${
                  esActivo ? "bg-accent/10 font-medium text-accent" : "text-foreground hover:bg-foreground/5"
                }`}
              >
                <Icono nombre={e.icono} className="size-5 shrink-0" />
                {e.etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

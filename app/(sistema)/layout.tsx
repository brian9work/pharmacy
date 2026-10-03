import Link from "next/link";
import { redirect } from "next/navigation";
import { cerrarSesion } from "@/app/acciones-sesion";
import { BotonTema } from "@/app/components/boton-tema";
import { textosComunes } from "@/app/components/contenido";
import { botonIcono } from "@/app/components/estilos";
import { Icono } from "@/app/components/icono";
import { Marca } from "@/app/components/marca";
import { Navegacion } from "@/app/components/navegacion";
import { ROLES } from "@/config/permisos";
import { obtenerPermisos, obtenerSesion } from "@/lib/consultas";
import { menu } from "./contenido";

function BotonSalir() {
  return (
    <form action={cerrarSesion}>
      <button type="submit" className={botonIcono} aria-label={textosComunes.salir}>
        <Icono nombre="salir" />
      </button>
    </form>
  );
}

export default async function LayoutSistema({ children }: LayoutProps<"/">) {
  const [{ usuario }, permisos] = await Promise.all([obtenerSesion(), obtenerPermisos()]);
  if (usuario.debeCambiarContrasena) redirect("/cambiar-contrasena");

  const elementos = menu
    .filter((m) => m.permiso === null || permisos.has(m.permiso))
    .map(({ href, etiqueta, icono }) => ({ href, etiqueta, icono }));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2 focus:text-accent"
      >
        {textosComunes.saltarAlContenido}
      </a>

      <aside className="sticky top-0 z-20 flex flex-col border-b border-hairline bg-header backdrop-blur-xl lg:h-dvh lg:border-b-0 lg:border-r lg:bg-surface lg:backdrop-blur-none">
        <div className="flex h-14 items-center justify-between gap-3 px-4 lg:h-20 lg:px-6">
          <Link href="/panel" className="min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <Marca />
          </Link>
          <div className="flex items-center lg:hidden">
            <BotonTema />
            <BotonSalir />
          </div>
        </div>

        <Navegacion elementos={elementos} />

        <div className="mt-auto hidden items-center gap-1 border-t border-hairline py-4 pl-6 pr-3 lg:flex">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium">{usuario.nombre}</p>
            <p className="truncate text-[13px] text-muted">{ROLES[usuario.rol].nombre}</p>
          </div>
          <BotonTema />
          <BotonSalir />
        </div>
      </aside>

      <main id="contenido" className="min-w-0 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import { Marca } from "@/app/components/marca";
import { obtenerSesion } from "@/lib/consultas";
import { cambioContrasena } from "../contenido";
import { FormularioContrasena } from "./formulario-contrasena";

export const metadata: Metadata = { title: cambioContrasena.titulo };

export default async function CambiarContrasena() {
  const { usuario } = await obtenerSesion();

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:items-center">
        <div className="w-full max-w-sm">
          <div className="flex justify-center">
            <Marca />
          </div>
          <FormularioContrasena correo={usuario.correo} />
        </div>
      </main>
    </div>
  );
}

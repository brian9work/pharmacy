"use client";

import { useActionState } from "react";
import { botonSecundarioChico } from "@/app/components/estilos";
import { cambiarEstadoUsuario } from "./acciones";
import { usuarios as textos } from "./contenido";

/** Bloquea o activa una cuenta. */
export function BotonEstado({ id, nombre, activo }: { id: string; nombre: string; activo: boolean }) {
  const [estado, enviar, enviando] = useActionState(cambiarEstadoUsuario, {});

  return (
    <form action={enviar} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activo" value={String(!activo)} />
      <button
        type="submit"
        disabled={enviando}
        aria-label={activo ? textos.bloquearEtiqueta(nombre) : textos.activarEtiqueta(nombre)}
        className={`${botonSecundarioChico} ${activo ? "text-danger" : ""}`}
      >
        {activo ? textos.bloquear : textos.activar}
      </button>
      {estado.error && (
        <p role="alert" className="max-w-56 text-right text-[13px] text-danger">
          {estado.error}
        </p>
      )}
    </form>
  );
}

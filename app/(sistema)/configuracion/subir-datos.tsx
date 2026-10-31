"use client";

import { useActionState } from "react";
import { botonPrincipal, tarjeta } from "@/app/components/estilos";
import { subirDatos } from "./acciones";
import { configuracion as textos } from "./contenido";
import { describirResumen } from "./resumen-subida";
import type { ResumenSubida } from "@/lib/subir-datos";

export interface DatosSubida {
  /** Falta SUPABASE_URL o la clave de servicio en el servidor. */
  sinConfigurar: boolean;
  /** La base local todavía no tiene la actualización que lo permite. */
  sinActualizar: boolean;
  ultimaBuena: string | null;
  ultimo: { cuando: string; ok: boolean | null; error: string | null; resumen: ResumenSubida | null } | null;
}

const t = textos.nube;

export function SubirDatos({ datos }: { datos: DatosSubida }) {
  const [estado, enviar, enviando] = useActionState(subirDatos, {});
  const bloqueado = datos.sinConfigurar || datos.sinActualizar;

  // Lo que acaba de pasar manda; si no, lo del último intento guardado.
  const resumen = estado.resumen ?? (datos.ultimo?.ok ? datos.ultimo.resumen : null);
  const error = estado.error ?? (!estado.resumen && datos.ultimo && datos.ultimo.ok === false ? t.ultimoFallo(datos.ultimo.cuando, datos.ultimo.error ?? "") : null);
  const descripcion = resumen ? describirResumen(resumen) : null;

  return (
    <section className={`${tarjeta} max-w-2xl space-y-5 sm:p-8`} aria-labelledby="titulo-nube">
      <div>
        <h2 id="titulo-nube" className="text-xl font-semibold tracking-tight">
          {t.titulo}
        </h2>
        <p className="mt-2 text-[15px] leading-6 text-muted">{t.descripcion}</p>
      </div>

      {bloqueado && (
        <p className="rounded-2xl bg-warning/10 px-4 py-3 text-[15px] text-warning">{datos.sinConfigurar ? t.sinConfigurar : t.sinActualizar}</p>
      )}

      <p className="text-[15px] text-muted">{datos.ultimaBuena ? t.ultimaBuena(datos.ultimaBuena) : t.nunca}</p>

      <form action={enviar}>
        <button type="submit" disabled={enviando || bloqueado} className={botonPrincipal}>
          {enviando ? t.subiendo : t.boton}
        </button>
      </form>

      <div role="status" aria-live="polite" className="space-y-3">
        {error && <p className="rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">{error}</p>}
        {descripcion && !error && (
          <div className="rounded-2xl bg-success/10 px-4 py-3 text-[15px] text-success">
            <p className="font-medium">{estado.resumen ? t.listo : t.ultimaBuena(datos.ultimaBuena ?? datos.ultimo?.cuando ?? "")}</p>
            <ul className="mt-1 list-disc pl-5">
              {descripcion.lineas.map((linea) => (
                <li key={linea}>{linea}</li>
              ))}
            </ul>
          </div>
        )}
        {descripcion?.avisos.map((aviso) => (
          <p key={aviso} className="rounded-2xl bg-warning/10 px-4 py-3 text-[15px] text-warning">
            {aviso}
          </p>
        ))}
      </div>
    </section>
  );
}

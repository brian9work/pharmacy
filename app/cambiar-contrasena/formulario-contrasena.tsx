"use client";

import { ayudaCampo, botonPrincipal, campo, enlace, etiquetaCampo } from "@/app/components/estilos";
import { useFormulario } from "@/app/components/formulario";
import { cambiarContrasena, cerrarSesion } from "../acciones-sesion";
import { cambioContrasena as textos } from "../contenido";

export function FormularioContrasena({ correo }: { correo: string }) {
  const { estado, alEnviar, enviando } = useFormulario(cambiarContrasena, {});

  return (
    <>
      <form onSubmit={alEnviar} className="mt-8 rounded-3xl bg-background p-6 sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight">{textos.titulo}</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted">{textos.descripcion}</p>

        <p role="alert" className={estado.error ? "mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger" : "sr-only"}>
          {estado.error}
        </p>

        {/* Ayuda a los gestores de contraseñas a guardar la nueva con su cuenta. */}
        <input type="email" name="usuario" autoComplete="username" value={correo} readOnly hidden />

        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="actual" className={etiquetaCampo}>
              {textos.actual}
            </label>
            <input id="actual" name="actual" type="password" autoComplete="current-password" required className={campo} />
          </div>
          <div>
            <label htmlFor="nueva" className={etiquetaCampo}>
              {textos.nueva}
            </label>
            <input id="nueva" name="nueva" type="password" autoComplete="new-password" minLength={10} required aria-describedby="nueva-ayuda" className={campo} />
            <p id="nueva-ayuda" className={ayudaCampo}>
              {textos.ayuda}
            </p>
          </div>
          <div>
            <label htmlFor="confirmar" className={etiquetaCampo}>
              {textos.confirmar}
            </label>
            <input id="confirmar" name="confirmar" type="password" autoComplete="new-password" minLength={10} required className={campo} />
          </div>
        </div>
        <button type="submit" disabled={enviando} className={`${botonPrincipal} mt-8 w-full`}>
          {enviando ? textos.guardando : textos.guardar}
        </button>
      </form>
      <form action={cerrarSesion} className="mt-6 text-center">
        <button type="submit" className={`${enlace} text-[15px]`}>
          {textos.salir}
        </button>
      </form>
    </>
  );
}

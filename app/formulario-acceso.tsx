"use client";

import { useActionState } from "react";
import { botonPrincipal, campo, etiquetaCampo } from "@/app/components/estilos";
import { iniciarSesion } from "./acciones-sesion";
import { acceso } from "./contenido";

export function FormularioAcceso({ aviso }: { aviso?: string }) {
  const [estado, enviar, enviando] = useActionState(iniciarSesion, {});
  const mensaje = estado.error ?? aviso;

  return (
    <form action={enviar} className="mt-10 rounded-3xl bg-background p-6 sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight">{acceso.titulo}</h1>

      <p role="alert" className={mensaje ? "mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger" : "sr-only"}>
        {mensaje}
      </p>

      <div className="mt-6 space-y-5">
        <div>
          <label htmlFor="correo" className={etiquetaCampo}>
            {acceso.correo}
          </label>
          <input
            id="correo"
            name="correo"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="contrasena" className={etiquetaCampo}>
            {acceso.contrasena}
          </label>
          <input id="contrasena" name="contrasena" type="password" autoComplete="current-password" required className={campo} />
        </div>
      </div>
      <button type="submit" disabled={enviando} className={`${botonPrincipal} mt-8 w-full`}>
        {enviando ? acceso.entrando : acceso.entrar}
      </button>
    </form>
  );
}

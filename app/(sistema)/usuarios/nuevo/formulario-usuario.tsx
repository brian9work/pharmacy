"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ayudaCampo, botonPrincipal, campo, enlace, etiquetaCampo, tarjeta } from "@/app/components/estilos";
import { ROLES, type Rol } from "@/config/permisos";
import { crearUsuario } from "../acciones";
import { usuarios } from "../contenido";

const textos = usuarios.alta;
const roles = Object.entries(ROLES) as [Rol, (typeof ROLES)[Rol]][];

export function FormularioUsuario() {
  const [estado, enviar, enviando] = useActionState(crearUsuario, {});

  return (
    <form action={enviar} className={`${tarjeta} max-w-2xl space-y-6 sm:p-8`}>
      <p role="alert" className={estado.error ? "rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger" : "sr-only"}>
        {estado.error}
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="nombre" className={etiquetaCampo}>
            {textos.nombre}
          </label>
          <input id="nombre" name="nombre" autoComplete="off" maxLength={120} required className={campo} />
        </div>
        <div>
          <label htmlFor="correo" className={etiquetaCampo}>
            {textos.correo}
          </label>
          <input
            id="correo"
            name="correo"
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-describedby="correo-ayuda"
            className={campo}
          />
          <p id="correo-ayuda" className={ayudaCampo}>
            {textos.correoAyuda}
          </p>
        </div>
        <div>
          <label htmlFor="contrasena" className={etiquetaCampo}>
            {textos.contrasena}
          </label>
          <input
            id="contrasena"
            name="contrasena"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            aria-describedby="contrasena-ayuda"
            className={campo}
          />
          <p id="contrasena-ayuda" className={ayudaCampo}>
            {textos.contrasenaAyuda}
          </p>
        </div>
      </div>

      <fieldset>
        <legend className={etiquetaCampo}>{textos.rol}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.map(([clave, rol]) => (
            <label
              key={clave}
              className="flex cursor-pointer gap-3 rounded-2xl border border-hairline bg-background p-4 transition-colors has-checked:border-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
            >
              <input type="radio" name="rol" value={clave} defaultChecked={clave === "empleado"} className="mt-1 accent-accent" />
              <span>
                <span className="block text-[15px] font-medium">{rol.nombre}</span>
                <span className="block text-[13px] text-muted">{rol.descripcion}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-6 pt-2">
        <button type="submit" disabled={enviando} className={botonPrincipal}>
          {enviando ? textos.guardando : textos.guardar}
        </button>
        <Link href="/usuarios" className={`${enlace} text-[17px]`}>
          {textos.cancelar}
        </Link>
      </div>
    </form>
  );
}

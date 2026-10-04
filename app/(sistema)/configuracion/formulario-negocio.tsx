"use client";

import { ayudaCampo, botonPrincipal, campo, etiquetaCampo, tarjeta } from "@/app/components/estilos";
import { useFormulario } from "@/app/components/formulario";
import { guardarNegocio } from "./acciones";
import { configuracion as textos } from "./contenido";

interface Negocio {
  razonSocial: string;
  rfc: string;
  direccion: string;
  telefono: string;
  pieTicket: string;
}

export function FormularioNegocio({ negocio }: { negocio: Negocio }) {
  const { estado, alEnviar, enviando } = useFormulario(guardarNegocio, {});
  const mensaje = estado.error ?? (estado.ok ? textos.guardado : "");

  return (
    <form onSubmit={alEnviar} className={`${tarjeta} max-w-2xl space-y-6 sm:p-8`}>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="razonSocial" className={etiquetaCampo}>
            {textos.campos.razonSocial}
          </label>
          <input id="razonSocial" name="razonSocial" defaultValue={negocio.razonSocial} maxLength={300} className={campo} />
        </div>
        <div>
          <label htmlFor="rfc" className={etiquetaCampo}>
            {textos.campos.rfc}
          </label>
          <input
            id="rfc"
            name="rfc"
            defaultValue={negocio.rfc}
            maxLength={13}
            autoCapitalize="characters"
            spellCheck={false}
            className={`${campo} font-mono uppercase`}
          />
        </div>
        <div>
          <label htmlFor="telefono" className={etiquetaCampo}>
            {textos.campos.telefono}
          </label>
          <input id="telefono" name="telefono" type="tel" defaultValue={negocio.telefono} maxLength={40} className={campo} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="direccion" className={etiquetaCampo}>
            {textos.campos.direccion}
          </label>
          <input id="direccion" name="direccion" defaultValue={negocio.direccion} maxLength={300} className={campo} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="pieTicket" className={etiquetaCampo}>
            {textos.campos.pieTicket}
          </label>
          <input id="pieTicket" name="pieTicket" defaultValue={negocio.pieTicket} maxLength={300} aria-describedby="pie-ayuda" className={campo} />
          <p id="pie-ayuda" className={ayudaCampo}>
            {textos.campos.pieAyuda}
          </p>
        </div>
      </div>

      <p
        role="status"
        className={mensaje ? `rounded-2xl px-4 py-3 text-[15px] ${estado.error ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}` : "sr-only"}
      >
        {mensaje}
      </p>

      <button type="submit" disabled={enviando} className={botonPrincipal}>
        {enviando ? textos.guardando : textos.guardar}
      </button>
    </form>
  );
}

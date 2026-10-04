"use client";

import { botonSecundario, campo, etiquetaCampo } from "@/app/components/estilos";
import type { Categoria, ProveedorCompleto } from "@/lib/tipos";
import { useFormulario } from "@/app/components/formulario";
import { guardarCategoria, guardarProveedor } from "./acciones";
import { catalogos as textos } from "./contenido";

function Mensaje({ error, ok }: { error?: string; ok?: boolean }) {
  return (
    <p role="status" className={error ? "text-[13px] text-danger" : ok ? "text-[13px] text-success" : "sr-only"}>
      {error ?? (ok ? textos.guardado : "")}
    </p>
  );
}

/** Alta (sin `proveedor`) o edición de un proveedor. */
export function FormularioProveedor({ proveedor }: { proveedor?: ProveedorCompleto }) {
  const { estado, enviar, alEnviar, enviando } = useFormulario(guardarProveedor, {});
  const prefijo = proveedor ? `proveedor-${proveedor.id}` : "proveedor-nuevo";
  const t = textos.proveedores;

  return (
    <form {...(proveedor ? { onSubmit: alEnviar } : { action: enviar })} className="grid gap-4 sm:grid-cols-2">
      {proveedor && <input type="hidden" name="id" value={proveedor.id} />}
      <div className="sm:col-span-2">
        <label htmlFor={`${prefijo}-nombre`} className={etiquetaCampo}>
          {t.nombre}
        </label>
        <input id={`${prefijo}-nombre`} name="nombre" defaultValue={proveedor?.nombre} required maxLength={120} className={campo} />
      </div>
      <div>
        <label htmlFor={`${prefijo}-rfc`} className={etiquetaCampo}>
          {t.rfc}
        </label>
        <input
          id={`${prefijo}-rfc`}
          name="rfc"
          defaultValue={proveedor?.rfc}
          maxLength={13}
          autoCapitalize="characters"
          spellCheck={false}
          className={`${campo} font-mono uppercase`}
        />
      </div>
      <div>
        <label htmlFor={`${prefijo}-telefono`} className={etiquetaCampo}>
          {t.telefono}
        </label>
        <input id={`${prefijo}-telefono`} name="telefono" type="tel" defaultValue={proveedor?.telefono} maxLength={40} className={campo} />
      </div>
      <div className={proveedor ? "" : "sm:col-span-2"}>
        <label htmlFor={`${prefijo}-correo`} className={etiquetaCampo}>
          {t.correo}
        </label>
        <input id={`${prefijo}-correo`} name="correo" type="email" defaultValue={proveedor?.correo} maxLength={254} className={campo} />
      </div>
      {proveedor && (
        <div>
          <label htmlFor={`${prefijo}-activo`} className={etiquetaCampo}>
            {t.estado}
          </label>
          <select id={`${prefijo}-activo`} name="activo" defaultValue={proveedor.activo ? "on" : "off"} className={campo}>
            <option value="on">{t.activoOpcion}</option>
            <option value="off">{t.inactivoOpcion}</option>
          </select>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <button type="submit" disabled={enviando} className={botonSecundario}>
          {enviando ? textos.guardando : proveedor ? textos.guardar : t.agregar}
        </button>
        <Mensaje error={estado.error} ok={estado.ok} />
      </div>
    </form>
  );
}

/** Alta (sin `categoria`) o cambio de nombre de una categoría. */
export function FormularioCategoria({ categoria }: { categoria?: Categoria }) {
  const { estado, enviar, alEnviar, enviando } = useFormulario(guardarCategoria, {});
  const id = categoria ? `categoria-${categoria.id}` : "categoria-nueva";
  const t = textos.categorias;

  return (
    <form {...(categoria ? { onSubmit: alEnviar } : { action: enviar })} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      {categoria && <input type="hidden" name="id" value={categoria.id} />}
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={categoria ? "sr-only" : etiquetaCampo}>
          {categoria ? t.renombrarEtiqueta(categoria.nombre) : t.nombre}
        </label>
        <input id={id} name="nombre" defaultValue={categoria?.nombre} required maxLength={60} className={campo} />
      </div>
      <button type="submit" disabled={enviando} className={`${botonSecundario} shrink-0`}>
        {enviando ? textos.guardando : categoria ? textos.guardar : t.agregar}
      </button>
      <Mensaje error={estado.error} ok={estado.ok} />
    </form>
  );
}

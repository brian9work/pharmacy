"use client";

import { useMemo, useState, useTransition } from "react";
import { Estado } from "@/app/components/estado";
import { botonPrincipal, enlace, tarjeta } from "@/app/components/estilos";
import { Icono } from "@/app/components/icono";
import { MODULOS, ROLES, type ClavePermiso, type Modulo, type Permiso } from "@/config/permisos";
import { guardarPermisosEmpleado } from "./acciones";
import { permisos as textos } from "../contenido";

const modulos = Object.keys(MODULOS) as Modulo[];

function Interruptor({ activo, deshabilitado, etiqueta, alCambiar }: { activo: boolean; deshabilitado?: boolean; etiqueta: string; alCambiar: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={alCambiar}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${
        activo ? "bg-success" : "bg-foreground/20"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block size-6 rounded-full bg-white ring-1 ring-black/5 transition-transform duration-200 ease-out ${
          activo ? "translate-x-5.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function MatrizPermisos({ catalogo, asignados }: { catalogo: Permiso[]; asignados: ClavePermiso[] }) {
  // Lo guardado en la base; al guardar, la página se refresca y esto se actualiza.
  const base = useMemo(
    () => Object.fromEntries(catalogo.map((p) => [p.clave, !p.soloAdmin && asignados.includes(p.clave)])),
    [catalogo, asignados],
  );
  const [activos, setActivos] = useState<Record<string, boolean>>(base);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, iniciar] = useTransition();

  const asignables = catalogo.filter((p) => !p.soloAdmin);
  const cuantos = asignables.filter((p) => activos[p.clave]).length;
  const cambios = catalogo.filter((p) => activos[p.clave] !== base[p.clave]).length;

  function guardar() {
    const claves = asignables.filter((p) => activos[p.clave]).map((p) => p.clave);
    iniciar(async () => {
      const resultado = await guardarPermisosEmpleado(claves);
      setMensaje(resultado.ok ? { ok: true, texto: textos.guardado } : { ok: false, texto: resultado.error });
    });
  }

  return (
    <div className="space-y-8">
      <div className={`${tarjeta} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <p className="text-[17px] font-medium">{textos.resumen(cuantos, asignables.length)}</p>
          <p className="mt-1 text-[15px] text-muted" aria-live="polite">
            {cambios === 0 ? textos.sinCambios : textos.cambios(cambios)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          {cambios > 0 && !guardando && (
            <button
              type="button"
              onClick={() => {
                setActivos(base);
                setMensaje(null);
              }}
              className={`${enlace} text-[17px]`}
            >
              {textos.restablecer}
            </button>
          )}
          <button type="button" disabled={cambios === 0 || guardando} onClick={guardar} className={botonPrincipal}>
            {guardando ? textos.guardando : textos.guardar}
          </button>
        </div>
      </div>

      <p
        role="status"
        className={
          mensaje
            ? `rounded-2xl px-4 py-3 text-[15px] ${mensaje.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`
            : "sr-only"
        }
      >
        {mensaje?.texto}
      </p>

      {modulos.map((modulo) => {
        const delModulo = catalogo.filter((p) => p.modulo === modulo);
        if (delModulo.length === 0) return null;
        return (
          <section key={modulo} aria-labelledby={`modulo-${modulo}`}>
            <h2 id={`modulo-${modulo}`} className="mb-4 text-xl font-semibold tracking-tight">
              {MODULOS[modulo]}
            </h2>
            <div className="relative overflow-x-auto rounded-3xl bg-surface">
              <table className="w-full table-fixed text-left text-[15px]">
                <colgroup>
                  <col />
                  <col className="w-24 sm:w-32" />
                  <col className="w-24 sm:w-32" />
                </colgroup>
                <thead>
                  <tr className="border-b border-hairline">
                    <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted">
                      {textos.columnas.permiso}
                    </th>
                    <th scope="col" className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">
                      {textos.columnas.admin}
                    </th>
                    <th scope="col" className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">
                      {textos.columnas.empleado}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {delModulo.map((p) => (
                    <tr key={p.clave}>
                      <th scope="row" className="px-5 py-4 align-top font-normal">
                        <span className="block font-medium">{p.nombre}</span>
                        <span className="mt-0.5 block text-[13px] leading-5 text-muted">{p.descripcion}</span>
                        <span className="mt-1 block break-all font-mono text-xs text-muted">{p.clave}</span>
                      </th>
                      <td className="px-2 py-4 text-center align-middle">
                        <span className="inline-flex text-accent" role="img" aria-label={textos.siempre(ROLES.admin.nombre)}>
                          <Icono nombre="check" />
                        </span>
                      </td>
                      <td className="px-2 py-4 text-center align-middle">
                        {p.soloAdmin ? (
                          <span className="inline-flex flex-col items-center gap-1" title={textos.soloAdminAyuda}>
                            <Icono nombre="candado" className="size-5 text-muted" />
                            <span className="hidden sm:block">
                              <Estado>{textos.soloAdmin}</Estado>
                            </span>
                            <span className="sr-only sm:hidden">{textos.soloAdmin}</span>
                          </span>
                        ) : (
                          <Interruptor
                            activo={activos[p.clave]}
                            etiqueta={textos.interruptor(ROLES.empleado.nombre, p.nombre)}
                            alCambiar={() => {
                              setActivos((a) => ({ ...a, [p.clave]: !a[p.clave] }));
                              setMensaje(null);
                            }}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

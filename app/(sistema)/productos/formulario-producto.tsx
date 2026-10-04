"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import {
  ayudaCampo,
  botonPrincipal,
  campo,
  campoLibre,
  enlace,
  etiquetaCampo,
  tarjeta,
} from "@/app/components/estilos";
import { Icono } from "@/app/components/icono";
import { sonar, useLectorCodigos } from "@/app/components/lector-codigos";
import { dinero, porcentaje } from "@/lib/formato";
import { desglosarIva } from "@/lib/inventario";
import type { Categoria, Clasificacion, ProductoEdicion } from "@/lib/tipos";
import { aCentavos } from "@/lib/validacion-producto";
import { crearProducto, editarProducto } from "./acciones";
import { productos as textos } from "./contenido";

const t = textos.campos;
const CLASIFICACIONES: Clasificacion[] = ["libre", "antibiotico", "controlado"];

interface Props {
  producto?: ProductoEdicion;
  /** Costo actual; undefined si quien edita no puede verlo. */
  costo?: number;
  categorias: Categoria[];
  /** Códigos ya usados → producto que lo tiene. */
  codigos: Record<string, { id: string; nombre: string }>;
  permisos: { editar: boolean; precios: boolean };
}

function Grupo({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <fieldset aria-labelledby={id} className={`${tarjeta} min-w-0 sm:p-8`}>
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {titulo}
      </h2>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

const pesos = (centavos: number) => (centavos / 100).toFixed(2);

export function FormularioProducto({ producto, costo, categorias, codigos, permisos }: Props) {
  const nuevo = !producto;
  const [estado, enviar, enviando] = useActionState(nuevo ? crearProducto : editarProducto, {});
  const [codigo, setCodigo] = useState(producto?.codigoBarras ?? "");
  const [categoria, setCategoria] = useState(producto?.categoriaId ? String(producto.categoriaId) : "");
  const [precio, setPrecio] = useState(producto ? pesos(producto.precio) : "");
  const [costoTexto, setCostoTexto] = useState(costo !== undefined ? pesos(costo) : "");
  const [iva, setIva] = useState<0 | 16>(producto?.iva ?? 0);
  const [conReceta, setConReceta] = useState(producto ? producto.requiereReceta || producto.clasificacion !== "libre" : false);
  const [clasificacion, setClasificacion] = useState<Clasificacion>(producto?.clasificacion ?? "libre");

  const { editar, precios } = permisos;
  const verCosto = nuevo || costo !== undefined || precios;
  const sinPermiso = (puede: boolean) => (puede ? undefined : t.sinPermiso);

  // Con el lector, cualquier lectura en la página llena el código.
  useLectorCodigos((leido) => {
    if (!editar) return;
    const normalizado = leido.toUpperCase();
    setCodigo(normalizado);
    const dueno = codigos[normalizado];
    sonar(dueno && dueno.id !== producto?.id ? "error" : "ok");
  });

  const duenoCodigo = codigos[codigo.trim().toUpperCase()];
  const repetido = duenoCodigo && duenoCodigo.id !== producto?.id ? duenoCodigo : null;

  const precioCentavos = aCentavos(precio);
  const desglose = precioCentavos ? desglosarIva(precioCentavos, iva) : null;
  const costoCentavos = costoTexto.trim() ? aCentavos(costoTexto) : null;
  const margen = desglose && costoCentavos !== null && desglose.base > 0 ? (desglose.base - costoCentavos) / desglose.base : null;

  return (
    <form action={enviar} className="max-w-3xl space-y-6">
      {producto && <input type="hidden" name="id" value={producto.id} />}

      <Grupo id="grupo-identificacion" titulo={textos.secciones.identificacion}>
        <div className="sm:col-span-2">
          <label htmlFor="codigoBarras" className={etiquetaCampo}>
            {t.codigo}
          </label>
          <div className="relative">
            <Icono nombre="buscar" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <input
              id="codigoBarras"
              name="codigoBarras"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              readOnly={!editar}
              autoFocus={nuevo}
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              aria-describedby="codigo-ayuda"
              aria-invalid={Boolean(repetido)}
              className={`${campoLibre} h-11 w-full pl-11 pr-4 font-mono text-[17px] uppercase`}
            />
          </div>
          {repetido ? (
            <p id="codigo-ayuda" role="alert" className="mt-2 text-[13px] text-danger">
              {t.codigoUsado(repetido.nombre)}{" "}
              <Link href={`/inventario/${repetido.id}`} className={enlace}>
                {t.verProducto} ›
              </Link>
            </p>
          ) : (
            <p id="codigo-ayuda" className={ayudaCampo}>
              {sinPermiso(editar) ?? t.codigoAyuda}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="nombre" className={etiquetaCampo}>
            {t.nombre}
          </label>
          <input
            id="nombre"
            name="nombre"
            defaultValue={producto?.nombre}
            readOnly={!editar}
            required
            maxLength={120}
            placeholder={t.nombreEjemplo}
            aria-describedby="nombre-ayuda"
            className={campo}
          />
          <p id="nombre-ayuda" className={ayudaCampo}>
            {t.nombreAyuda}
          </p>
        </div>

        <div>
          <label htmlFor="sustancia" className={etiquetaCampo}>
            {t.sustancia}
          </label>
          <input id="sustancia" name="sustancia" defaultValue={producto?.sustancia} readOnly={!editar} maxLength={120} placeholder={t.sustanciaEjemplo} className={campo} />
        </div>
        <div>
          <label htmlFor="presentacion" className={etiquetaCampo}>
            {t.presentacion}
          </label>
          <input
            id="presentacion"
            name="presentacion"
            defaultValue={producto?.presentacion}
            readOnly={!editar}
            maxLength={120}
            placeholder={t.presentacionEjemplo}
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="laboratorio" className={etiquetaCampo}>
            {t.laboratorio}
          </label>
          <input id="laboratorio" name="laboratorio" defaultValue={producto?.laboratorio} readOnly={!editar} maxLength={120} className={campo} />
        </div>
        <div>
          <label htmlFor="categoria" className={etiquetaCampo}>
            {t.categoria}
          </label>
          <select id="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={!editar} className={campo}>
            <option value="">{t.sinCategoria}</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
            <option value="nueva">{t.nuevaCategoria}</option>
          </select>
          {/* Un select deshabilitado no se envía: el valor viaja aquí. */}
          <input type="hidden" name="categoria" value={categoria} />
        </div>
        {categoria === "nueva" && (
          <div className="sm:col-span-2">
            <label htmlFor="categoriaNueva" className={etiquetaCampo}>
              {t.nombreCategoria}
            </label>
            <input id="categoriaNueva" name="categoriaNueva" required maxLength={60} autoFocus className={campo} />
          </div>
        )}
      </Grupo>

      <Grupo id="grupo-venta" titulo={textos.secciones.venta}>
        <div className="sm:col-span-2">
          <label
            className={`flex gap-3 rounded-2xl border border-hairline bg-background p-4 transition-colors has-checked:border-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${
              editar ? "cursor-pointer" : "opacity-60"
            }`}
          >
            <input
              type="checkbox"
              checked={conReceta}
              onChange={(e) => {
                setConReceta(e.target.checked);
                if (!e.target.checked) setClasificacion("libre");
              }}
              disabled={!editar}
              aria-describedby="receta-ayuda"
              className="mt-1 size-4 shrink-0 accent-accent"
            />
            <span>
              <span className="block text-[15px] font-medium">{t.receta}</span>
              <span id="receta-ayuda" className="block text-[13px] text-muted">
                {t.recetaAyuda}
              </span>
            </span>
          </label>
          {/* Una casilla o radio deshabilitados no se envían: los valores viajan aquí. */}
          <input type="hidden" name="requiereReceta" value={conReceta ? "on" : "off"} />
          <input type="hidden" name="clasificacion" value={conReceta ? clasificacion : "libre"} />
        </div>

        {conReceta && (
          <fieldset className="sm:col-span-2">
            <legend className={etiquetaCampo}>{t.tipoReceta}</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {CLASIFICACIONES.map((c) => (
                <label
                  key={c}
                  className={`flex gap-3 rounded-2xl border border-hairline bg-background p-4 transition-colors has-checked:border-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${
                    editar ? "cursor-pointer" : "opacity-60"
                  }`}
                >
                  <input
                    type="radio"
                    name="tipoReceta"
                    value={c}
                    checked={clasificacion === c}
                    onChange={() => setClasificacion(c)}
                    disabled={!editar}
                    className="mt-1 accent-accent"
                  />
                  <span>
                    <span className="block text-[15px] font-medium">{t.clasificaciones[c].nombre}</span>
                    <span className="block text-[13px] text-muted">{t.clasificaciones[c].descripcion}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div>
          <label htmlFor="precio" className={etiquetaCampo}>
            {t.precio}
          </label>
          <input
            id="precio"
            name="precio"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            readOnly={!precios}
            required
            placeholder="0.00"
            aria-describedby="precio-ayuda"
            className={`${campo} cifra`}
          />
          <p id="precio-ayuda" className={ayudaCampo}>
            {sinPermiso(precios) ?? (desglose ? t.desglose(dinero(desglose.base), dinero(desglose.impuesto)) : " ")}
          </p>
        </div>

        <fieldset>
          <legend className={etiquetaCampo}>{t.iva}</legend>
          <div className="space-y-2">
            {([0, 16] as const).map((valor) => (
              <label key={valor} className={`flex items-center gap-3 text-[15px] ${editar ? "cursor-pointer" : "opacity-60"}`}>
                <input
                  type="radio"
                  name="iva"
                  value={valor}
                  checked={iva === valor}
                  onChange={() => setIva(valor)}
                  disabled={!editar}
                  className="size-4 accent-accent"
                />
                {valor === 0 ? t.iva0 : t.iva16}
              </label>
            ))}
          </div>
          {!editar && <input type="hidden" name="iva" value={iva} />}
        </fieldset>

        {verCosto && (
          <div className="sm:col-span-2">
            <label htmlFor="costo" className={etiquetaCampo}>
              {t.costo}
            </label>
            <input
              id="costo"
              name="costo"
              inputMode="decimal"
              value={costoTexto}
              onChange={(e) => setCostoTexto(e.target.value)}
              readOnly={!nuevo && !precios}
              placeholder={nuevo ? "0.00" : ""}
              aria-describedby="costo-ayuda"
              className={`${campo} cifra sm:max-w-xs`}
            />
            <p id="costo-ayuda" className={ayudaCampo}>
              {margen !== null ? t.margen(porcentaje(margen)) : !nuevo && costo === undefined ? t.costoSinCambio : t.costoAyuda}
            </p>
          </div>
        )}
      </Grupo>

      <Grupo id="grupo-inventario" titulo={textos.secciones.inventario}>
        <div>
          <label htmlFor="stockMinimo" className={etiquetaCampo}>
            {t.minimo}
          </label>
          <input
            id="stockMinimo"
            name="stockMinimo"
            inputMode="numeric"
            defaultValue={producto?.stockMinimo ?? 0}
            readOnly={!editar}
            aria-describedby="minimo-ayuda"
            className={`${campo} cifra`}
          />
          <p id="minimo-ayuda" className={ayudaCampo}>
            {t.minimoAyuda}
          </p>
        </div>
        <div>
          <label htmlFor="ubicacion" className={etiquetaCampo}>
            {t.ubicacion}
          </label>
          <input id="ubicacion" name="ubicacion" defaultValue={producto?.ubicacion} readOnly={!editar} maxLength={120} placeholder={t.ubicacionEjemplo} className={campo} />
        </div>
        <label className={`flex items-center gap-3 text-[15px] sm:col-span-2 ${editar ? "cursor-pointer" : "opacity-60"}`}>
          <input type="checkbox" name="refrigerado" defaultChecked={producto?.refrigerado} disabled={!editar} className="size-4 accent-accent" />
          {t.refrigerado}
        </label>
        {!editar && producto?.refrigerado && <input type="hidden" name="refrigerado" value="on" />}

        {producto && (
          <div className="sm:col-span-2">
            <label htmlFor="activo" className={etiquetaCampo}>
              {t.estado}
            </label>
            <select id="activo" name="activo" defaultValue={producto.activo ? "on" : "off"} disabled={!editar} className={campo}>
              <option value="on">{t.activo}</option>
              <option value="off">{t.inactivo}</option>
            </select>
            {!editar && <input type="hidden" name="activo" value={producto.activo ? "on" : "off"} />}
          </div>
        )}
      </Grupo>

      <p
        role="status"
        className={
          estado.error || estado.ok
            ? `rounded-2xl px-4 py-3 text-[15px] ${estado.error ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`
            : "sr-only"
        }
      >
        {estado.error ?? (estado.ok ? textos.guardado : "")}
      </p>

      <div className="flex flex-wrap items-center gap-6">
        <button type="submit" disabled={enviando || Boolean(repetido)} className={botonPrincipal}>
          {enviando ? textos.guardando : nuevo ? textos.guardar : textos.guardarCambios}
        </button>
        <Link href={producto ? `/inventario/${producto.id}` : "/inventario"} className={`${enlace} text-[17px]`}>
          {textos.cancelar}
        </Link>
      </div>
    </form>
  );
}

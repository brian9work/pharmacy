"use client";

import { useId, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { Estado } from "@/app/components/estado";
import {
  botonIcono,
  botonPrincipal,
  botonSecundario,
  campo,
  etiquetaCampo,
  tarjeta,
} from "@/app/components/estilos";
import { Icono } from "@/app/components/icono";
import { sonar, useLectorCodigos } from "@/app/components/lector-codigos";
import { dinero, diasEntre } from "@/lib/formato";
import { DIAS_AVISO_CADUCIDAD } from "@/lib/inventario";
import type { Producto, Proveedor } from "@/lib/tipos";
import { guardarEntrada } from "./acciones";
import { entrada } from "./contenido";

interface Renglon {
  clave: number;
  producto: Producto;
  lote: string;
  caducidad: string;
  piezas: string;
  costo: string;
}

const MAX_RESULTADOS = 6;
/** Al recibir se avisa con más margen que en el inventario. */
const DIAS_AVISO_RECEPCION = DIAS_AVISO_CADUCIDAD * 2;

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function aCentavos(texto: string) {
  const n = Number(texto.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

function aPiezas(texto: string) {
  const n = Number.parseInt(texto, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function EntradaMercancia({
  productos,
  proveedores,
  hoy,
  costos,
}: {
  productos: Producto[];
  proveedores: Proveedor[];
  hoy: string;
  /** Costo por producto; vacío si quien entra no tiene permiso de ver costos. */
  costos: Record<string, number>;
}) {
  const id = useId();
  const buscador = useRef<HTMLInputElement>(null);
  const siguiente = useRef(1);
  const [proveedor, setProveedor] = useState("");
  const [factura, setFactura] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [busqueda, setBusqueda] = useState("");
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [guardada, setGuardada] = useState<{ piezas: number; factura: string } | null>(null);
  const [error, setError] = useState("");
  const [enviando, iniciar] = useTransition();

  const consulta = normalizar(busqueda);
  const resultados = useMemo(() => {
    if (consulta.length < 2) return [];
    return productos
      .filter((p) => (p.codigoBarras?.startsWith(consulta) ?? false) || normalizar(`${p.nombre} ${p.sustancia}`).includes(consulta))
      .slice(0, MAX_RESULTADOS);
  }, [consulta, productos]);

  const piezasTotales = renglones.reduce((s, r) => s + aPiezas(r.piezas), 0);
  const total = renglones.reduce((s, r) => s + aPiezas(r.piezas) * aCentavos(r.costo), 0);
  const completa =
    proveedor !== "" &&
    factura.trim() !== "" &&
    renglones.length > 0 &&
    renglones.every(
      (r) => r.lote.trim() !== "" && r.caducidad !== "" && aPiezas(r.piezas) > 0 && r.costo.trim() !== "" && diasEntre(hoy, r.caducidad) >= 0,
    );

  function agregar(producto: Producto) {
    const clave = siguiente.current++;
    setRenglones((rs) => [...rs, { clave, producto, lote: "", caducidad: "", piezas: "", costo: costos[producto.id] !== undefined ? (costos[producto.id] / 100).toFixed(2) : "" }]);
    setBusqueda("");
    // Lo siguiente que se captura es el lote del producto recién agregado.
    requestAnimationFrame(() => document.getElementById(`${id}-lote-${clave}`)?.focus());
  }

  const porCodigo = useMemo(
    () => new Map(productos.filter((p) => p.codigoBarras).map((p) => [p.codigoBarras!.toUpperCase(), p])),
    [productos],
  );

  // Con el lector: un producto nuevo abre renglón; el mismo producto seguido suma una pieza.
  useLectorCodigos((codigo) => {
    if (guardada || enviando) return;
    const producto = porCodigo.get(codigo.toUpperCase());
    if (!producto) {
      setError(entrada.productos.codigoDesconocido(codigo));
      sonar("error");
      return;
    }
    setError("");
    const ultimo = renglones.at(-1);
    if (ultimo?.producto.id === producto.id) {
      cambiar(ultimo.clave, "piezas", String(aPiezas(ultimo.piezas) + 1));
    } else {
      agregar(producto);
      cambiarDespues("piezas", "1");
    }
    sonar("ok");
  });

  /** Pone un valor en el renglón que se acaba de agregar. */
  function cambiarDespues(campoRenglon: "piezas", valor: string) {
    const clave = siguiente.current - 1;
    setRenglones((rs) => rs.map((r) => (r.clave === clave ? { ...r, [campoRenglon]: valor } : r)));
  }

  function cambiar(clave: number, campoRenglon: "lote" | "caducidad" | "piezas" | "costo", valor: string) {
    setRenglones((rs) => rs.map((r) => (r.clave === clave ? { ...r, [campoRenglon]: valor } : r)));
  }

  function alTeclear(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const exacto = busqueda.trim() ? porCodigo.get(busqueda.trim().toUpperCase()) : undefined;
    const elegido = exacto ?? (resultados.length === 1 ? resultados[0] : undefined);
    if (elegido) agregar(elegido);
  }

  function guardar() {
    if (!completa || enviando) return;
    setError("");
    const datos = {
      proveedorId: proveedor,
      factura: factura.trim(),
      fecha,
      partidas: renglones.map((r) => ({
        productoId: r.producto.id,
        lote: r.lote,
        caducidad: r.caducidad,
        cantidad: aPiezas(r.piezas),
        costo: aCentavos(r.costo),
      })),
    };
    iniciar(async () => {
      const resultado = await guardarEntrada(datos);
      if (!resultado.ok) return setError(resultado.error);
      setGuardada({ piezas: resultado.datos.piezas, factura: datos.factura });
      setRenglones([]);
      setFactura("");
    });
  }

  if (guardada) {
    return (
      <div className={`${tarjeta} max-w-lg py-10 text-center transition duration-300 ease-out starting:opacity-0 motion-safe:starting:translate-y-2`} role="status">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
          <Icono nombre="check" className="size-7" />
        </span>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight">{entrada.guardada.titulo}</h2>
        <p className="mt-2 text-[17px] text-muted">{entrada.guardada.texto(guardada.piezas, guardada.factura)}</p>
        <button
          type="button"
          onClick={() => {
            setGuardada(null);
            requestAnimationFrame(() => buscador.current?.focus());
          }}
          className={`${botonPrincipal} mt-8`}
        >
          {entrada.guardada.otra}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
      className="space-y-8"
    >
      <fieldset className={`${tarjeta} grid gap-5 sm:grid-cols-3`}>
        <legend className="sr-only">{entrada.documento.titulo}</legend>
        <div>
          <label htmlFor={`${id}-proveedor`} className={etiquetaCampo}>
            {entrada.documento.proveedor}
          </label>
          <select id={`${id}-proveedor`} value={proveedor} onChange={(e) => setProveedor(e.target.value)} required className={campo}>
            <option value="" disabled>
              {entrada.documento.elegirProveedor}
            </option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-factura`} className={etiquetaCampo}>
            {entrada.documento.factura}
          </label>
          <input
            id={`${id}-factura`}
            value={factura}
            onChange={(e) => setFactura(e.target.value)}
            placeholder={entrada.documento.facturaEjemplo}
            autoComplete="off"
            required
            className={`${campo} font-mono`}
          />
        </div>
        <div>
          <label htmlFor={`${id}-fecha`} className={etiquetaCampo}>
            {entrada.documento.fecha}
          </label>
          <input id={`${id}-fecha`} type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} required className={campo} />
        </div>
      </fieldset>

      <section aria-labelledby={`${id}-productos`}>
        <h2 id={`${id}-productos`} className="mb-4 text-xl font-semibold tracking-tight">
          {entrada.productos.titulo}
        </h2>

        <div className={tarjeta}>
          <label htmlFor={`${id}-buscar`} className={etiquetaCampo}>
            {entrada.productos.buscar}
          </label>
          <div className="relative">
            <Icono nombre="buscar" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <input
              ref={buscador}
              id={`${id}-buscar`}
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={alTeclear}
              placeholder={entrada.productos.placeholder}
              autoComplete="off"
              spellCheck={false}
              className={`${campo} pl-11`}
            />
          </div>

          {consulta.length >= 2 && (
            <div className="mt-3">
              {resultados.length === 0 ? (
                <p className="text-[15px] text-muted">{entrada.productos.sinResultados}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {resultados.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => agregar(p)} className={`${botonSecundario} bg-background`}>
                        <Icono nombre="mas" className="size-4" />
                        {p.nombre}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {consulta.length < 2 && renglones.length === 0 && <p className="mt-3 text-[15px] text-muted">{entrada.productos.pista}</p>}

          {renglones.length > 0 && (
            <ul className="mt-6 space-y-3">
              {renglones.map((r) => {
                const dias = r.caducidad ? diasEntre(hoy, r.caducidad) : null;
                const importe = aPiezas(r.piezas) * aCentavos(r.costo);
                const campos = [
                  { nombre: "lote", etiqueta: entrada.productos.lote, valor: r.lote, props: { autoComplete: "off", className: `${campo} font-mono uppercase` } },
                  { nombre: "caducidad", etiqueta: entrada.productos.caducidad, valor: r.caducidad, props: { type: "date", min: hoy, className: campo } },
                  { nombre: "piezas", etiqueta: entrada.productos.piezas, valor: r.piezas, props: { inputMode: "numeric" as const, className: `${campo} cifra` } },
                  { nombre: "costo", etiqueta: entrada.productos.costo, valor: r.costo, props: { inputMode: "decimal" as const, className: `${campo} cifra` } },
                ] as const;
                return (
                  <li key={r.clave} className="rounded-2xl bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[17px] font-medium">{r.producto.nombre}</p>
                        <p className="text-[13px] text-muted">
                          {r.producto.presentacion} · <span className="font-mono">{r.producto.codigoBarras}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRenglones((rs) => rs.filter((x) => x.clave !== r.clave))}
                        className={`${botonIcono} -mr-2 -mt-2`}
                        aria-label={entrada.productos.quitar(r.producto.nombre)}
                      >
                        <Icono nombre="cerrar" className="size-4" />
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4">
                      {campos.map((c) => (
                        <div key={c.nombre} className="min-w-0">
                          <label htmlFor={`${id}-${c.nombre}-${r.clave}`} className="mb-1.5 block text-[13px] font-medium text-muted">
                            {c.etiqueta}
                          </label>
                          <input
                            id={`${id}-${c.nombre}-${r.clave}`}
                            value={c.valor}
                            onChange={(e) =>
                              cambiar(r.clave, c.nombre, c.nombre === "piezas" ? e.target.value.replace(/\D/g, "") : e.target.value)
                            }
                            required
                            {...c.props}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        {dias !== null && dias < 0 && <Estado tono="peligro">{entrada.productos.yaCaduco}</Estado>}
                        {dias !== null && dias >= 0 && dias <= DIAS_AVISO_RECEPCION && (
                          <Estado tono="aviso">{entrada.productos.caducaPronto(dias)}</Estado>
                        )}
                      </div>
                      <p className="text-[15px]">
                        <span className="text-muted">{entrada.productos.importe}: </span>
                        <span className="cifra font-semibold">{dinero(importe)}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <div className={`${tarjeta} flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <p className="text-[15px] text-muted">
            {entrada.resumen.productos(renglones.length)} · {entrada.resumen.piezas(piezasTotales)}
          </p>
          <p className="mt-1 text-[15px]">
            {entrada.resumen.total}: <span className="cifra text-2xl font-semibold tracking-tight">{dinero(total)}</span>
          </p>
          {!completa && renglones.length > 0 && <p className="mt-2 text-[13px] text-muted">{entrada.resumen.faltan}</p>}
          <p role="alert" className={error ? "mt-3 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger" : "sr-only"}>
            {error}
          </p>
        </div>
        <button type="submit" disabled={!completa || enviando} className={`${botonPrincipal} shrink-0`}>
          {enviando ? entrada.resumen.guardando : entrada.resumen.guardar}
        </button>
      </div>
    </form>
  );
}

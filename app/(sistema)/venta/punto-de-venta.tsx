"use client";

import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { textosClasificacion, textosMetodo } from "@/app/components/contenido";
import { Estado } from "@/app/components/estado";
import {
  botonIcono,
  botonPrincipal,
  botonSecundario,
  campo,
  enlace,
  etiquetaCampo,
  tarjeta,
} from "@/app/components/estilos";
import { Icono } from "@/app/components/icono";
import { sonar, useLectorCodigos } from "@/app/components/lector-codigos";
import { EstiloImpresionTicket, Ticket } from "@/app/components/ticket";
import { puntoDeVenta } from "@/config/punto-de-venta";
import { dinero, fechaCorta } from "@/lib/formato";
import { asignarFEFO, desglosarIva, estadoCaducidad, requiereReceta, sumarPiezas } from "@/lib/inventario";
import type { Lote, MetodoPago, Producto, Ticket as DatosTicket } from "@/lib/tipos";
import { cobrarVenta } from "./acciones";
import { venta } from "./contenido";

interface Articulo {
  producto: Producto;
  vendibles: Lote[];
}

interface Partida {
  productoId: string;
  cantidad: number;
}

interface VentaConfirmada {
  folio: string;
  total: number;
  cambio: number | null;
  ticket: DatosTicket | null;
}

const METODOS: MetodoPago[] = ["efectivo", "tarjeta", "transferencia"];
const MAX_RESULTADOS = 8;

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function aCentavos(texto: string): number | null {
  const limpio = texto.replace(/[$,\s]/g, "");
  const n = Number(limpio);
  return limpio !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function PuntoDeVenta({ catalogo, hoy }: { catalogo: Articulo[]; hoy: string }) {
  const idLista = useId();
  const buscador = useRef<HTMLInputElement>(null);
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState(0);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [recibido, setRecibido] = useState("");
  const [aviso, setAviso] = useState("");
  const [cobrando, iniciarCobro] = useTransition();
  const [confirmada, setConfirmada] = useState<VentaConfirmada | null>(null);

  const porId = useMemo(() => new Map(catalogo.map((a) => [a.producto.id, a])), [catalogo]);
  const porCodigo = useMemo(
    () => new Map(catalogo.filter((a) => a.producto.codigoBarras).map((a) => [a.producto.codigoBarras!.toUpperCase(), a])),
    [catalogo],
  );
  const indice = useMemo(
    () =>
      catalogo.map((articulo) => ({
        articulo,
        texto: normalizar(`${articulo.producto.nombre} ${articulo.producto.sustancia} ${articulo.producto.laboratorio}`),
      })),
    [catalogo],
  );

  const consulta = normalizar(busqueda);
  const resultados = useMemo(() => {
    if (consulta.length < 2) return [];
    const palabras = consulta.split(/\s+/);
    return indice
      .filter(({ articulo, texto }) => (articulo.producto.codigoBarras?.startsWith(consulta) ?? false) || palabras.every((p) => texto.includes(p)))
      .slice(0, MAX_RESULTADOS)
      .map((i) => i.articulo);
  }, [consulta, indice]);

  const lineas = partidas.map((p) => {
    const articulo = porId.get(p.productoId)!;
    const importe = articulo.producto.precio * p.cantidad;
    return {
      ...p,
      producto: articulo.producto,
      asignacion: asignarFEFO(articulo.vendibles, p.cantidad) ?? [],
      importe,
      ...desglosarIva(importe, articulo.producto.iva),
    };
  });
  const total = lineas.reduce((s, l) => s + l.importe, 0);
  const subtotal = lineas.reduce((s, l) => s + l.base, 0);
  const iva = total - subtotal;
  const conReceta = lineas.filter((l) => requiereReceta(l.producto));

  // Efectivo vacío cuenta como pago exacto, para no frenar la fila.
  const recibidoCentavos = recibido.trim() === "" ? total : aCentavos(recibido);
  const cambio = metodo === "efectivo" && recibidoCentavos !== null ? recibidoCentavos - total : null;
  const puedeCobrar = !cobrando && lineas.length > 0 && (metodo !== "efectivo" || (cambio !== null && cambio >= 0));

  function fijarCantidad(productoId: string, cantidad: number): boolean {
    const articulo = porId.get(productoId)!;
    if (cantidad <= 0) {
      setPartidas((ps) => ps.filter((p) => p.productoId !== productoId));
      setAviso("");
      return true;
    }
    if (!asignarFEFO(articulo.vendibles, cantidad)) {
      setAviso(venta.avisos.sinPiezas(articulo.producto.nombre, sumarPiezas(articulo.vendibles)));
      return false;
    }
    setAviso("");
    setPartidas((ps) =>
      ps.some((p) => p.productoId === productoId)
        ? ps.map((p) => (p.productoId === productoId ? { ...p, cantidad } : p))
        : [...ps, { productoId, cantidad }],
    );
    return true;
  }

  function agregar(articulo: Articulo): boolean {
    setConfirmada(null);
    const actual = partidas.find((p) => p.productoId === articulo.producto.id)?.cantidad ?? 0;
    const agregado = fijarCantidad(articulo.producto.id, actual + 1);
    if (agregado) {
      setBusqueda("");
      setSeleccion(0);
    }
    buscador.current?.focus();
    return agregado;
  }

  // Cada lectura del lector agrega una pieza; leer el mismo código otra vez suma otra.
  useLectorCodigos((codigo) => {
    if (cobrando) return;
    const articulo = porCodigo.get(codigo.toUpperCase());
    if (!articulo) {
      setAviso(venta.avisos.codigoDesconocido(codigo));
      sonar("error");
      return;
    }
    sonar(agregar(articulo) ? "ok" : "error");
  });

  // Al cobrar se abre la impresión del ticket (se puede apagar en config/punto-de-venta.ts).
  useEffect(() => {
    if (confirmada?.ticket && puntoDeVenta.imprimirAlCobrar) window.print();
  }, [confirmada]);

  function cobrar() {
    if (!puedeCobrar) return;
    // La base vuelve a calcular precios, lotes y totales: lo de aquí es solo la vista previa.
    const cobro = {
      partidas: partidas.map((p) => ({ productoId: p.productoId, cantidad: p.cantidad })),
      metodo,
      recibido: metodo === "efectivo" && recibido.trim() !== "" ? aCentavos(recibido) : null,
    };
    iniciarCobro(async () => {
      const resultado = await cobrarVenta(cobro);
      if (!resultado.ok) {
        setAviso(resultado.error);
        return;
      }
      setConfirmada(resultado.datos);
      setPartidas([]);
      setRecibido("");
      setMetodo("efectivo");
      setAviso("");
    });
  }

  function nuevaVenta() {
    setConfirmada(null);
    buscador.current?.focus();
  }

  function alTeclearBusqueda(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSeleccion((s) => Math.min(s + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSeleccion((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // El lector de código escribe el código completo y manda Enter.
      const exacto = busqueda.trim() ? porCodigo.get(busqueda.trim().toUpperCase()) : undefined;
      const elegido = exacto ?? resultados[seleccion];
      if (elegido) agregar(elegido);
    } else if (e.key === "Escape") {
      setBusqueda("");
      setSeleccion(0);
    }
  }

  const alTeclaGlobal = useEffectEvent((e: globalThis.KeyboardEvent) => {
    if (e.key === "F2") {
      e.preventDefault();
      buscador.current?.focus();
      buscador.current?.select();
    } else if (e.key === "F9") {
      e.preventDefault();
      cobrar();
    }
  });

  useEffect(() => {
    const escuchar = (e: globalThis.KeyboardEvent) => alTeclaGlobal(e);
    window.addEventListener("keydown", escuchar);
    return () => window.removeEventListener("keydown", escuchar);
  }, []);

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-start lg:pb-0">
      <section aria-labelledby="titulo-buscar" className="min-w-0">
        <h2 id="titulo-buscar" className="sr-only">
          {venta.buscar.etiqueta}
        </h2>
        <label htmlFor="buscar" className="sr-only">
          {venta.buscar.etiqueta}
        </label>
        <div className="relative">
          <Icono nombre="buscar" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input
            ref={buscador}
            id="buscar"
            type="search"
            role="combobox"
            aria-expanded={resultados.length > 0}
            aria-controls={idLista}
            aria-autocomplete="list"
            aria-activedescendant={resultados.length > 0 ? `${idLista}-${seleccion}` : undefined}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setSeleccion(0);
            }}
            onKeyDown={alTeclearBusqueda}
            placeholder={venta.buscar.placeholder}
            className={`${campo} h-14 pl-12 text-lg`}
          />
        </div>

        <ul className="mt-3 hidden flex-wrap gap-2 sm:flex" aria-hidden="true">
          {venta.atajos.map((a) => (
            <li key={a.tecla} className="rounded-full bg-surface px-3 py-1 text-xs text-muted">
              <kbd className="font-mono font-semibold text-foreground">{a.tecla}</kbd> {a.accion}
            </li>
          ))}
        </ul>

        <p role="status" aria-live="polite" className={aviso ? "mt-4 rounded-2xl bg-warning/10 px-4 py-3 text-[15px] text-warning" : "sr-only"}>
          {aviso}
        </p>

        <div className="mt-4">
          {consulta.length < 2 ? (
            <p className="px-1 text-[15px] text-muted">{venta.buscar.pista}</p>
          ) : resultados.length === 0 ? (
            <p className="px-1 text-[15px] text-muted">{venta.buscar.sinResultados(busqueda.trim())}</p>
          ) : (
            <ul id={idLista} role="listbox" aria-label={venta.buscar.resultados(resultados.length)} className="space-y-2">
              {resultados.map((a, i) => {
                const existencia = sumarPiezas(a.vendibles);
                const clasificacion = textosClasificacion[a.producto.clasificacion];
                const elegido = i === seleccion;
                return (
                  <li
                    key={a.producto.id}
                    id={`${idLista}-${i}`}
                    role="option"
                    aria-selected={elegido}
                    aria-disabled={existencia === 0}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setSeleccion(i)}
                    onClick={() => existencia > 0 && agregar(a)}
                    className={`flex items-center gap-4 rounded-2xl px-4 py-3 transition-colors ${
                      elegido ? "bg-accent/10" : "bg-surface"
                    } ${existencia === 0 ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] font-medium">{a.producto.nombre}</p>
                      <p className="truncate text-[13px] text-muted">
                        {a.producto.presentacion} · {a.producto.sustancia}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {clasificacion && <Estado tono={clasificacion.tono}>{clasificacion.texto}</Estado>}
                        <span className={`text-[13px] ${existencia === 0 ? "font-medium text-danger" : "text-muted"}`}>
                          {venta.buscar.existencia(existencia)}
                        </span>
                      </div>
                    </div>
                    <p className="cifra shrink-0 text-[17px] font-semibold">{dinero(a.producto.precio)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section id="venta-actual" aria-labelledby="titulo-venta" className={`${tarjeta} scroll-mt-36 lg:sticky lg:top-10`}>
        {confirmada ? (
          <div className="py-4 text-center transition duration-300 ease-out starting:opacity-0 motion-safe:starting:translate-y-2">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
              <Icono nombre="check" className="size-7" />
            </span>
            <h2 id="titulo-venta" className="mt-4 text-2xl font-semibold tracking-tight">
              {venta.confirmacion.titulo}
            </h2>
            <dl className="mt-6 space-y-2 text-left text-[15px]">
              <div className="flex justify-between">
                <dt className="text-muted">{venta.confirmacion.folio}</dt>
                <dd className="font-mono text-sm">{confirmada.folio}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">{venta.confirmacion.total}</dt>
                <dd className="cifra font-medium">{dinero(confirmada.total)}</dd>
              </div>
              {confirmada.cambio !== null && (
                <div className="flex items-baseline justify-between">
                  <dt className="text-muted">{venta.confirmacion.cambio}</dt>
                  <dd className="cifra text-2xl font-semibold">{dinero(confirmada.cambio)}</dd>
                </div>
              )}
            </dl>
            <div className="mt-8 flex flex-col gap-3">
              <button type="button" onClick={nuevaVenta} className={`${botonPrincipal} w-full`}>
                {venta.confirmacion.nueva}
              </button>
              {confirmada.ticket && (
                <button type="button" onClick={() => window.print()} className={`${botonSecundario} w-full`}>
                  <Icono nombre="imprimir" className="size-4" />
                  {venta.confirmacion.imprimir}
                </button>
              )}
            </div>
            <p className="mt-4 text-[13px] text-muted">{venta.confirmacion.siguiente}</p>

            {confirmada.ticket ? (
              <div className="mt-6 flex justify-center overflow-hidden rounded-2xl ring-1 ring-hairline">
                <Ticket ticket={confirmada.ticket} />
              </div>
            ) : (
              <p className="mt-6 text-[13px] text-muted">{venta.confirmacion.sinTicket}</p>
            )}

            {confirmada.ticket &&
              createPortal(
                <div className="impresion-ticket">
                  <EstiloImpresionTicket />
                  <Ticket ticket={confirmada.ticket} />
                </div>,
                document.body,
              )}
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="titulo-venta" className="text-xl font-semibold tracking-tight">
                {venta.carrito.titulo}
              </h2>
              {lineas.length > 0 && (
                <button type="button" onClick={() => setPartidas([])} className={`${enlace} text-[15px]`}>
                  {venta.carrito.vaciar}
                </button>
              )}
            </div>

            {lineas.length === 0 ? (
              <p className="mt-4 text-[15px] text-muted">{venta.carrito.vacio}</p>
            ) : (
              <ul className="mt-4 divide-y divide-hairline">
                {lineas.map((l) => {
                  const porCaducar = l.asignacion.some((a) => estadoCaducidad(a.caducidad, hoy) === "por-caducar");
                  const textoLote =
                    l.asignacion.length === 1
                      ? venta.carrito.lote(l.asignacion[0].numero, fechaCorta(l.asignacion[0].caducidad))
                      : venta.carrito.lotes(l.asignacion.map((a) => `${a.numero} (${a.cantidad})`).join(", "));
                  return (
                    <li key={l.productoId} className="py-4 first:pt-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[15px] font-medium">{l.producto.nombre}</p>
                          <p className="mt-0.5 text-[13px] text-muted">{textoLote}</p>
                          {porCaducar && (
                            <p className="mt-1.5">
                              <Estado tono="aviso">{venta.carrito.porCaducar}</Estado>
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => fijarCantidad(l.productoId, 0)}
                          className={`${botonIcono} -mr-2 -mt-2`}
                          aria-label={venta.carrito.quitar(l.producto.nombre)}
                        >
                          <Icono nombre="cerrar" className="size-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="-ml-2 flex items-center">
                          <button
                            type="button"
                            onClick={() => fijarCantidad(l.productoId, l.cantidad - 1)}
                            className={botonIcono}
                            aria-label={venta.carrito.menos(l.producto.nombre)}
                          >
                            <Icono nombre="menos" className="size-4" />
                          </button>
                          <output aria-label={venta.carrito.cantidad(l.producto.nombre)} className="cifra w-8 text-center text-[17px] font-medium">
                            {l.cantidad}
                          </output>
                          <button
                            type="button"
                            onClick={() => fijarCantidad(l.productoId, l.cantidad + 1)}
                            className={botonIcono}
                            aria-label={venta.carrito.mas(l.producto.nombre)}
                          >
                            <Icono nombre="mas" className="size-4" />
                          </button>
                        </div>
                        <p className="cifra text-[17px] font-semibold">{dinero(l.importe)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {conReceta.length > 0 && (
              <div className="mt-4 rounded-2xl bg-accent/10 px-4 py-3">
                <p className="flex items-center gap-2 text-[15px] font-medium text-accent">
                  <Icono nombre="aviso" className="size-4 shrink-0" />
                  {venta.receta.titulo}
                </p>
                <ul className="mt-1 space-y-0.5 text-[13px] leading-5">
                  {conReceta.map((l) => (
                    <li key={l.productoId}>
                      <span className="font-medium">{l.producto.nombre}.</span>{" "}
                      {l.producto.clasificacion === "controlado" ? venta.receta.controlado : venta.receta.antibiotico}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <dl className="mt-6 space-y-2 border-t border-hairline pt-4 text-[15px]">
              <div className="flex justify-between">
                <dt className="text-muted">{venta.totales.subtotal}</dt>
                <dd className="cifra">{dinero(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">{venta.totales.iva}</dt>
                <dd className="cifra">{dinero(iva)}</dd>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <dt className="text-[17px] font-semibold">{venta.totales.total}</dt>
                <dd className="cifra text-3xl font-semibold tracking-tight">{dinero(total)}</dd>
              </div>
            </dl>

            <fieldset className="mt-6">
              <legend className={etiquetaCampo}>{venta.pago.titulo}</legend>
              <div className="grid grid-cols-3 gap-1 rounded-full bg-foreground/[0.07] p-1">
                {METODOS.map((m) => (
                  <label
                    key={m}
                    className={`cursor-pointer rounded-full px-1 py-2 text-center text-[13px] transition-colors has-focus-visible:outline-2 has-focus-visible:outline-accent sm:text-[15px] ${
                      metodo === m ? "bg-background font-medium text-foreground" : "text-muted hover:text-foreground"
                    }`}
                  >
                    <input
                      type="radio"
                      name="metodo"
                      value={m}
                      checked={metodo === m}
                      onChange={() => setMetodo(m)}
                      className="sr-only"
                    />
                    {textosMetodo[m]}
                  </label>
                ))}
              </div>
            </fieldset>

            {metodo === "efectivo" && (
              <div className="mt-4">
                <label htmlFor="recibido" className={etiquetaCampo}>
                  {venta.pago.recibido}
                </label>
                <div className="flex gap-2">
                  <input
                    id="recibido"
                    inputMode="decimal"
                    autoComplete="off"
                    value={recibido}
                    onChange={(e) => setRecibido(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        cobrar();
                      }
                    }}
                    placeholder={dinero(total)}
                    className={`${campo} cifra`}
                  />
                  <button type="button" onClick={() => setRecibido((total / 100).toFixed(2))} className={`${botonSecundario} shrink-0`}>
                    {venta.pago.exacto}
                  </button>
                </div>
                {cambio !== null && lineas.length > 0 && (
                  <p className="mt-3 flex items-baseline justify-between text-[15px]">
                    <span className="text-muted">{cambio >= 0 ? venta.pago.cambio : venta.pago.faltan}</span>
                    <span className={`cifra text-xl font-semibold ${cambio < 0 ? "text-danger" : ""}`}>{dinero(Math.abs(cambio))}</span>
                  </p>
                )}
              </div>
            )}

            {aviso && (
              <p className="mt-6 rounded-2xl bg-warning/10 px-4 py-3 text-[15px] text-warning" aria-hidden="true">
                {aviso}
              </p>
            )}

            <button type="button" onClick={cobrar} disabled={!puedeCobrar} className={`${botonPrincipal} mt-6 w-full`}>
              {cobrando ? venta.cobrando : venta.cobrar(dinero(total))}
              <kbd className="hidden rounded-md bg-white/20 px-1.5 py-0.5 font-mono text-xs sm:inline">F9</kbd>
            </button>
          </>
        )}
      </section>

      {/* En celular el carrito queda abajo: esta barra muestra el total y lleva a él. */}
      {lineas.length > 0 && !confirmada && (
        <a
          href="#venta-actual"
          className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-hairline bg-header px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden"
        >
          <span className="text-[15px] text-muted">{venta.barraMovil.piezas(lineas.reduce((s, l) => s + l.cantidad, 0))}</span>
          <span className="flex items-center gap-3">
            <span className="cifra text-xl font-semibold">{dinero(total)}</span>
            <span className="rounded-full bg-primary px-4 py-2 text-[15px] font-medium text-white">{venta.barraMovil.ir}</span>
          </span>
        </a>
      )}
    </div>
  );
}

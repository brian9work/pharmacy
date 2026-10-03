"use client";

import { useState, useTransition } from "react";
import { textosMetodo } from "@/app/components/contenido";
import { EncabezadoPagina, Seccion } from "@/app/components/encabezado-pagina";
import { Estado } from "@/app/components/estado";
import {
  ayudaCampo,
  botonPrincipal,
  campo,
  celda,
  celdaEncabezado,
  contenedorTabla,
  etiquetaCampo,
  tabla,
  tarjeta,
} from "@/app/components/estilos";
import { dinero } from "@/lib/formato";
import type { Turno } from "@/lib/tipos";
import { abrirCaja, cerrarCaja } from "./acciones";
import { caja as textos } from "./contenido";

/** Denominaciones de pesos mexicanos, en centavos. */
const BILLETES = [100000, 50000, 20000, 10000, 5000, 2000];
const MONEDAS = [2000, 1000, 500, 200, 100, 50];

function etiquetaDenominacion(centavos: number) {
  return centavos % 100 === 0 ? `$${(centavos / 100).toLocaleString("es-MX")}` : `${centavos} ¢`;
}

function Diferencia({ diferencia }: { diferencia: number }) {
  if (diferencia === 0) return <Estado tono="exito">{textos.corte.cuadra}</Estado>;
  return diferencia > 0 ? (
    <Estado tono="aviso">{textos.corte.sobran(dinero(diferencia))}</Estado>
  ) : (
    <Estado tono="peligro">{textos.corte.faltan(dinero(-diferencia))}</Estado>
  );
}

function MensajeError({ mensaje }: { mensaje: string }) {
  return (
    <p role="alert" className={mensaje ? "mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger" : "sr-only"}>
      {mensaje}
    </p>
  );
}

export function CorteCaja({ turno, puedeAbrir, puedeCerrar }: { turno: Turno | null; puedeAbrir: boolean; puedeCerrar: boolean }) {
  const [conteo, setConteo] = useState<Record<string, string>>({});
  const [ultimoCorte, setUltimoCorte] = useState<{ contado: number; esperado: number; diferencia: number } | null>(null);
  const [fondo, setFondo] = useState("500.00");
  const [error, setError] = useState("");
  const [enviando, iniciar] = useTransition();

  // Mismas denominaciones de billete y moneda ($20) se suman juntas.
  const piezasPorDenominacion = Object.entries(conteo).reduce<Record<string, number>>((acumulado, [clave, valor]) => {
    const piezas = Number.parseInt(valor, 10);
    if (!Number.isFinite(piezas) || piezas <= 0) return acumulado;
    const denominacion = clave.slice(2);
    acumulado[denominacion] = (acumulado[denominacion] ?? 0) + piezas;
    return acumulado;
  }, {});
  const contado = Object.entries(piezasPorDenominacion).reduce((s, [d, n]) => s + Number(d) * n, 0);

  function cerrar() {
    setError("");
    iniciar(async () => {
      const resultado = await cerrarCaja(contado, piezasPorDenominacion);
      if (!resultado.ok) return setError(resultado.error);
      setUltimoCorte(resultado.datos);
      setConteo({});
    });
  }

  function abrir() {
    const centavos = Math.round(Number(fondo.replace(/[$,\s]/g, "")) * 100);
    if (!Number.isFinite(centavos) || centavos < 0) return setError(textos.abrir.invalido);
    setError("");
    iniciar(async () => {
      const resultado = await abrirCaja(centavos);
      if (!resultado.ok) return setError(resultado.error);
      setUltimoCorte(null);
    });
  }

  if (!turno) {
    return (
      <div className="space-y-10">
        <EncabezadoPagina titulo={textos.titulo} descripcion={textos.descripcionCerrada} />

        {ultimoCorte && (
          <section aria-labelledby="corte-hecho" className={`${tarjeta} transition duration-300 ease-out starting:opacity-0 motion-safe:starting:translate-y-2`}>
            <h2 id="corte-hecho" className="text-xl font-semibold tracking-tight">
              {textos.cerrada.titulo}
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-[15px] text-muted">{textos.cerrada.contado}</dt>
                <dd className="cifra mt-1 text-2xl font-semibold">{dinero(ultimoCorte.contado)}</dd>
              </div>
              <div>
                <dt className="text-[15px] text-muted">{textos.cerrada.esperado}</dt>
                <dd className="cifra mt-1 text-2xl font-semibold">{dinero(ultimoCorte.esperado)}</dd>
              </div>
              <div>
                <dt className="text-[15px] text-muted">{textos.cerrada.diferencia}</dt>
                <dd className="mt-2">
                  <Diferencia diferencia={ultimoCorte.diferencia} />
                </dd>
              </div>
            </dl>
          </section>
        )}

        {puedeAbrir ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              abrir();
            }}
            aria-labelledby="abrir-caja"
            className={`${tarjeta} max-w-md`}
          >
            <h2 id="abrir-caja" className="text-xl font-semibold tracking-tight">
              {textos.abrir.titulo}
            </h2>
            <label htmlFor="fondo" className={`${etiquetaCampo} mt-5`}>
              {textos.abrir.fondo}
            </label>
            <input id="fondo" inputMode="decimal" value={fondo} onChange={(e) => setFondo(e.target.value)} className={`${campo} cifra`} />
            <p className={ayudaCampo}>{textos.abrir.ayuda}</p>
            <MensajeError mensaje={error} />
            <button type="submit" disabled={enviando} className={`${botonPrincipal} mt-6 w-full`}>
              {enviando ? textos.abrir.abriendo : textos.abrir.accion}
            </button>
          </form>
        ) : (
          <p className={`${tarjeta} text-[15px] text-muted`}>{textos.abrir.sinPermiso}</p>
        )}
      </div>
    );
  }

  const ciego = turno.efectivoEsperado === null;
  const resumen = ciego
    ? [
        { etiqueta: textos.resumen.fondo, valor: dinero(turno.fondoInicial) },
        { etiqueta: textos.resumen.ventas, valor: String(turno.ventas) },
        { etiqueta: textos.resumen.tarjeta, valor: dinero(turno.ventasTarjeta) },
        { etiqueta: textos.resumen.transferencia, valor: dinero(turno.ventasTransferencia) },
      ]
    : [
        { etiqueta: textos.resumen.fondo, valor: dinero(turno.fondoInicial) },
        { etiqueta: textos.resumen.efectivo, valor: dinero(turno.ventasEfectivo ?? 0) },
        { etiqueta: textos.resumen.tarjeta, valor: dinero(turno.ventasTarjeta) },
        { etiqueta: textos.resumen.transferencia, valor: dinero(turno.ventasTransferencia) },
        { etiqueta: textos.resumen.retiros, valor: dinero(turno.retiros ?? 0) },
        { etiqueta: textos.resumen.esperado, valor: dinero(turno.efectivoEsperado ?? 0), destacado: true },
      ];

  const grupos = [
    { titulo: textos.corte.billetes, prefijo: "b", denominaciones: BILLETES },
    { titulo: textos.corte.monedas, prefijo: "m", denominaciones: MONEDAS },
  ];

  return (
    <div className="space-y-10">
      <EncabezadoPagina etiqueta={textos.titulo} titulo={textos.abierta(turno.caja, turno.abiertoA)} descripcion={textos.descripcionAbierta} />

      <ul className={`grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 ${ciego ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {resumen.map((r) => (
          <li key={r.etiqueta} className={tarjeta}>
            <p className="text-[15px] text-muted">{r.etiqueta}</p>
            <p className={`cifra mt-2 text-2xl font-semibold tracking-tight ${"destacado" in r && r.destacado ? "text-accent" : ""}`}>{r.valor}</p>
          </li>
        ))}
      </ul>

      {!ciego && (
        <Seccion id="movimientos" titulo={textos.movimientos.titulo}>
          {turno.movimientos.length === 0 ? (
            <p className={`${tarjeta} text-[15px] text-muted`}>{textos.movimientos.vacio}</p>
          ) : (
            <div className={contenedorTabla}>
              <table className={`${tabla} min-w-[36rem]`}>
                <thead>
                  <tr className="border-b border-hairline">
                    <th scope="col" className={celdaEncabezado}>{textos.movimientos.hora}</th>
                    <th scope="col" className={celdaEncabezado}>{textos.movimientos.concepto}</th>
                    <th scope="col" className={celdaEncabezado}>{textos.movimientos.metodo}</th>
                    <th scope="col" className={`${celdaEncabezado} text-right`}>{textos.movimientos.monto}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {turno.movimientos.map((m) => (
                    <tr key={m.id}>
                      <td className={`${celda} cifra`}>{m.hora}</td>
                      <td className={celda}>{m.concepto}</td>
                      <td className={celda}>{textosMetodo[m.metodo]}</td>
                      <td className={`${celda} cifra text-right font-medium ${m.monto < 0 ? "text-danger" : ""}`}>{dinero(m.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>
      )}

      {puedeCerrar && (
        <Seccion id="cerrar-caja" titulo={textos.corte.titulo}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              cerrar();
            }}
            className={tarjeta}
          >
            <p className="text-[15px] text-muted">
              {textos.corte.descripcion} {ciego && textos.corte.ciego}
            </p>

            <div className="mt-6 grid gap-8 sm:grid-cols-2">
              {grupos.map((g) => (
                <fieldset key={g.prefijo} className="min-w-0">
                  <legend className="text-[15px] font-semibold">{g.titulo}</legend>
                  <ul className="mt-3 space-y-2">
                    {g.denominaciones.map((d) => {
                      const clave = `${g.prefijo}-${d}`;
                      const piezas = Number.parseInt(conteo[clave] ?? "", 10);
                      const etiqueta = etiquetaDenominacion(d);
                      return (
                        <li key={clave} className="flex items-center gap-3">
                          <label htmlFor={clave} className="cifra w-16 shrink-0 text-[15px] font-medium">
                            {etiqueta}
                          </label>
                          <input
                            id={clave}
                            inputMode="numeric"
                            aria-label={textos.corte.cantidad(`${g.titulo.toLowerCase()} de ${etiqueta}`)}
                            value={conteo[clave] ?? ""}
                            onChange={(e) => setConteo((c) => ({ ...c, [clave]: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                            placeholder="0"
                            className={`${campo} cifra h-10 w-20 shrink-0 px-3 text-center text-[15px]`}
                          />
                          <span className="cifra ml-auto truncate text-[15px] text-muted">
                            {Number.isFinite(piezas) && piezas > 0 ? dinero(piezas * d) : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              ))}
            </div>

            <MensajeError mensaje={error} />

            <div className="mt-8 flex flex-col gap-6 border-t border-hairline pt-6 sm:flex-row sm:items-end sm:justify-between">
              <dl className="flex flex-wrap gap-x-10 gap-y-4">
                <div>
                  <dt className="text-[15px] text-muted">{textos.corte.contado}</dt>
                  <dd className="cifra mt-1 text-3xl font-semibold tracking-tight">{dinero(contado)}</dd>
                </div>
                {!ciego && turno.efectivoEsperado !== null && (
                  <div>
                    <dt className="text-[15px] text-muted">{textos.corte.diferencia}</dt>
                    <dd className="mt-2">
                      <Diferencia diferencia={contado - turno.efectivoEsperado} />
                    </dd>
                  </div>
                )}
              </dl>
              <button type="submit" disabled={enviando} className={botonPrincipal}>
                {enviando ? textos.corte.cerrando : textos.corte.cerrar}
              </button>
            </div>
          </form>
        </Seccion>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { textosMetodo } from "@/app/components/contenido";
import { EncabezadoPagina, Seccion } from "@/app/components/encabezado-pagina";
import {
  botonIcono,
  botonSecundario,
  botonSecundarioChico,
  campo,
  celda,
  celdaEncabezado,
  contenedorTabla,
  etiquetaCampo,
  tabla,
  tablaLibre,
  tarjeta,
} from "@/app/components/estilos";
import { GraficaBarras, type Barra } from "@/app/components/grafica-barras";
import { Icono } from "@/app/components/icono";
import { obtenerHoy, obtenerReporte, puede } from "@/lib/consultas";
import { diaMes, dinero, fechaCorta, mesAnio, mesCorto, porcentaje } from "@/lib/formato";
import { diasDelRango, moverRango, PERIODOS, resolverRango, tituloRango, type Periodo } from "@/lib/periodos";
import type { RenglonReporte } from "@/lib/tipos";
import { reportes as textos } from "./contenido";

export const metadata: Metadata = { title: textos.titulo };

const enlaceReporte = (parametros: Record<string, string>) => `/reportes?${new URLSearchParams(parametros)}`;
const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

function Comparacion({ actual, previo }: { actual: number; previo: number }) {
  if (previo <= 0) return <p className="mt-2 text-[13px] text-muted">{textos.comparacion.sinDatos}</p>;
  const cambio = (actual - previo) / previo;
  if (Math.abs(cambio) < 0.0005) return <p className="mt-2 text-[13px] text-muted">{textos.comparacion.igual}</p>;
  const sube = cambio > 0;
  return (
    <p className={`mt-2 flex items-center gap-1 text-[13px] font-medium ${sube ? "text-success" : "text-danger"}`}>
      <span aria-hidden="true">{sube ? "▲" : "▼"}</span>
      {sube ? textos.comparacion.sube(porcentaje(cambio)) : textos.comparacion.baja(porcentaje(-cambio))}
    </p>
  );
}

function Indicador({ etiqueta, valor, nota, actual, previo }: { etiqueta: string; valor: string; nota: string; actual: number; previo: number }) {
  return (
    <li className={tarjeta}>
      <p className="text-[15px] text-muted">{etiqueta}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{valor}</p>
      <p className="mt-1 text-[13px] text-muted">{nota}</p>
      <Comparacion actual={actual} previo={previo} />
    </li>
  );
}

function TablaRenglones({ id, titulo, columna, renglones }: { id: string; titulo: string; columna: string; renglones: RenglonReporte[] }) {
  return (
    <Seccion id={id} titulo={titulo}>
      {renglones.length === 0 ? (
        <p className={`${tarjeta} text-[15px] text-muted`}>{textos.vacio}</p>
      ) : (
        <div className={contenedorTabla}>
          <table className={`${tabla} min-w-[36rem]`}>
            <thead>
              <tr className="border-b border-hairline">
                <th scope="col" className={celdaEncabezado}>{columna}</th>
                <th scope="col" className={`${celdaEncabezado} text-right`}>{textos.columnas.piezas}</th>
                <th scope="col" className={`${celdaEncabezado} text-right`}>{textos.columnas.ventas}</th>
                <th scope="col" className={`${celdaEncabezado} text-right`}>{textos.columnas.utilidad}</th>
                <th scope="col" className={`${celdaEncabezado} text-right`}>{textos.columnas.margen}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {renglones.map((r) => {
                const utilidad = r.base - r.costo;
                return (
                  <tr key={r.nombre}>
                    <th scope="row" className={`${celda} font-medium`}>{r.nombre}</th>
                    <td className={`${celda} cifra text-right`}>{r.piezas}</td>
                    <td className={`${celda} cifra text-right`}>{dinero(r.importe)}</td>
                    <td className={`${celda} cifra text-right ${utilidad < 0 ? "text-danger" : ""}`}>{dinero(utilidad)}</td>
                    <td className={`${celda} cifra text-right text-muted`}>{r.base > 0 ? porcentaje(utilidad / r.base) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Seccion>
  );
}

function TablaDatos({ titulo, filas }: { titulo: string; filas: Barra[] }) {
  return (
    <details className="group mt-4">
      <summary className="cursor-pointer text-[15px] text-accent hover:underline">{textos.grafica.tabla}</summary>
      <div className="relative mt-3 max-h-80 overflow-auto rounded-2xl bg-background">
        <table className={`${tablaLibre} text-[13px]`}>
          <caption className="sr-only">{titulo}</caption>
          <thead>
            <tr className="border-b border-hairline">
              <th scope="col" className="px-4 py-2 font-medium text-muted">{textos.grafica.fecha}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium text-muted">{textos.grafica.total}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium text-muted">{textos.grafica.numeroTickets}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {filas.map((f) => (
              <tr key={f.clave}>
                <th scope="row" className="px-4 py-2 font-normal">{f.etiquetaLarga}</th>
                <td className="cifra px-4 py-2 text-right">{dinero(f.valor)}</td>
                <td className="cifra px-4 py-2 text-right">{f.nota}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default async function Reportes({ searchParams }: PageProps<"/reportes">) {
  if (!(await puede("reportes.ver"))) redirect("/panel");

  const [parametros, hoy] = await Promise.all([searchParams, obtenerHoy()]);
  const rango = resolverRango(parametros, hoy);
  const reporte = await obtenerReporte(rango.desde, rango.hasta);
  const { resumen, anterior } = reporte;

  const utilidad = resumen.subtotal - resumen.costo;
  const utilidadAnterior = anterior.subtotal - anterior.costo;
  const promedio = resumen.tickets > 0 ? Math.round(resumen.ventas / resumen.tickets) : 0;
  const contieneHoy = rango.desde <= hoy && hoy <= rango.hasta;

  // Más de dos meses se agrupa por mes para que las columnas sigan siendo legibles.
  const porMes = diasDelRango(rango) > 62;
  const barras: Barra[] = porMes
    ? Object.values(
        reporte.porDia.reduce<Record<string, Barra & { tickets: number }>>((meses, d) => {
          const clave = d.fecha.slice(0, 7);
          const mes = (meses[clave] ??= { clave, etiqueta: mesCorto(d.fecha), etiquetaLarga: mayuscula(mesAnio(d.fecha)), valor: 0, tickets: 0 });
          mes.valor += d.ventas;
          mes.tickets += d.tickets;
          mes.nota = textos.grafica.tickets(mes.tickets);
          return meses;
        }, {}),
      )
    : reporte.porDia.map((d) => ({
        clave: d.fecha,
        etiqueta: rango.periodo === "semana" ? diaMes(d.fecha) : String(Number(d.fecha.slice(8))),
        etiquetaLarga: fechaCorta(d.fecha),
        valor: d.ventas,
        nota: textos.grafica.tickets(d.tickets),
      }));
  const barrasHora: Barra[] = reporte.porHora.map((h) => ({
    clave: String(h.hora),
    etiqueta: String(h.hora),
    etiquetaLarga: textos.grafica.hora(h.hora),
    valor: h.ventas,
    nota: textos.grafica.tickets(h.tickets),
  }));

  const totalPagos = reporte.porMetodo.reduce((s, m) => s + m.monto, 0);
  const tituloGrafica = porMes ? textos.grafica.porMes : textos.grafica.porDia;

  return (
    <div className="space-y-10">
      <EncabezadoPagina titulo={textos.titulo} descripcion={textos.descripcion}>
        <a href={`/reportes/exportar?${new URLSearchParams({ desde: rango.desde, hasta: rango.hasta })}`} download className={botonSecundario}>
          <Icono nombre="descargar" className="size-4" />
          {textos.exportar}
        </a>
      </EncabezadoPagina>

      {/* Filtros: un solo renglón arriba de todo lo que afectan. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label={textos.periodos.etiqueta} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <ul className="flex gap-2">
            {PERIODOS.map((p: Periodo) => {
              const activo = p === rango.periodo;
              return (
                <li key={p} className="shrink-0">
                  <Link
                    href={enlaceReporte(p === "rango" ? { periodo: p, desde: rango.desde, hasta: rango.hasta } : { periodo: p, fecha: rango.ancla })}
                    aria-current={activo ? "page" : undefined}
                    className={`inline-flex whitespace-nowrap rounded-full px-4 py-2 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      activo ? "bg-foreground font-medium text-background" : "bg-surface hover:bg-foreground/[0.07]"
                    }`}
                  >
                    {textos.periodos[p]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-1">
          <Link href={enlaceReporte(moverRango(rango, -1))} className={botonIcono} aria-label={textos.navegar.anterior}>
            <Icono nombre="flechaIzquierda" />
          </Link>
          <p className="min-w-0 flex-1 text-center text-[17px] font-medium lg:min-w-56" aria-live="polite">
            {tituloRango(rango)}
          </p>
          <Link href={enlaceReporte(moverRango(rango, 1))} className={botonIcono} aria-label={textos.navegar.siguiente}>
            <Icono nombre="flecha" />
          </Link>
          {!contieneHoy && rango.periodo !== "rango" && (
            <Link href={enlaceReporte({ periodo: rango.periodo, fecha: hoy })} className={`${botonSecundarioChico} ml-2`}>
              {textos.navegar.hoy}
            </Link>
          )}
        </div>
      </div>

      {rango.periodo === "rango" && (
        <Form action="/reportes" className={`${tarjeta} flex flex-col gap-4 sm:flex-row sm:items-end`}>
          <input type="hidden" name="periodo" value="rango" />
          <div className="min-w-0 flex-1">
            <label htmlFor="desde" className={etiquetaCampo}>
              {textos.rango.desde}
            </label>
            <input id="desde" name="desde" type="date" defaultValue={rango.desde} required className={campo} />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="hasta" className={etiquetaCampo}>
              {textos.rango.hasta}
            </label>
            <input id="hasta" name="hasta" type="date" defaultValue={rango.hasta} required className={campo} />
          </div>
          <button type="submit" className={botonSecundario}>
            {textos.rango.aplicar}
          </button>
          <p className="text-[13px] text-muted sm:pb-3">{textos.rango.maximo}</p>
        </Form>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador etiqueta={textos.indicadores.ventas} valor={dinero(resumen.ventas)} nota={textos.indicadores.ventasNota} actual={resumen.ventas} previo={anterior.ventas} />
        <Indicador
          etiqueta={textos.indicadores.utilidad}
          valor={dinero(utilidad)}
          nota={textos.indicadores.margen(resumen.subtotal > 0 ? porcentaje(utilidad / resumen.subtotal) : "—")}
          actual={utilidad}
          previo={utilidadAnterior}
        />
        <Indicador
          etiqueta={textos.indicadores.tickets}
          valor={resumen.tickets.toLocaleString("es-MX")}
          nota={textos.indicadores.promedio(dinero(promedio))}
          actual={resumen.tickets}
          previo={anterior.tickets}
        />
        <Indicador
          etiqueta={textos.indicadores.piezas}
          valor={resumen.piezas.toLocaleString("es-MX")}
          nota={textos.indicadores.piezasNota}
          actual={resumen.piezas}
          previo={anterior.piezas}
        />
      </ul>

      <Seccion id="dinero" titulo={textos.dinero.titulo}>
        <dl className={`${tarjeta} grid gap-x-6 gap-y-5 min-[400px]:grid-cols-2 lg:grid-cols-5`}>
          {[
            { etiqueta: textos.dinero.iva, valor: dinero(resumen.iva) },
            { etiqueta: textos.dinero.costo, valor: dinero(resumen.costo) },
            { etiqueta: textos.dinero.compras, valor: dinero(reporte.compras.total), nota: textos.dinero.comprasNota(reporte.compras.recepciones) },
            { etiqueta: textos.dinero.mermas, valor: dinero(reporte.mermas.costo), nota: textos.dinero.mermasNota(reporte.mermas.piezas) },
            { etiqueta: textos.dinero.canceladas, valor: dinero(resumen.montoCancelado), nota: textos.dinero.canceladasNota(resumen.canceladas) },
          ].map((d) => (
            <div key={d.etiqueta} className="min-w-0">
              <dt className="text-[13px] text-muted">{d.etiqueta}</dt>
              <dd className="mt-1 text-xl font-semibold tracking-tight">{d.valor}</dd>
              {d.nota && <dd className="text-[13px] text-muted">{d.nota}</dd>}
            </div>
          ))}
        </dl>
      </Seccion>

      {rango.periodo !== "dia" && (
        <Seccion id="grafica-ventas" titulo={tituloGrafica}>
          <div className={tarjeta}>
            {resumen.tickets === 0 && <p className="mb-4 text-[15px] text-muted">{textos.grafica.vacia}</p>}
            <GraficaBarras etiqueta={tituloGrafica} barras={barras} />
            <TablaDatos titulo={tituloGrafica} filas={barras} />
          </div>
        </Seccion>
      )}

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-6">
        <Seccion id="metodos" titulo={textos.metodos.titulo} className="min-w-0">
          {reporte.porMetodo.length === 0 ? (
            <p className={`${tarjeta} text-[15px] text-muted`}>{textos.vacio}</p>
          ) : (
            <ul className={`${tarjeta} space-y-5`}>
              {reporte.porMetodo.map((m) => {
                const parte = totalPagos > 0 ? m.monto / totalPagos : 0;
                return (
                  <li key={m.metodo}>
                    <div className="flex items-baseline justify-between gap-4 text-[15px]">
                      <span className="font-medium">{textosMetodo[m.metodo] ?? m.metodo}</span>
                      <span className="cifra">
                        {dinero(m.monto)} <span className="text-muted">· {porcentaje(parte)}</span>
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-foreground/[0.07]" aria-hidden="true">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${parte * 100}%` }} />
                    </div>
                    <p className="mt-1 text-[13px] text-muted">{textos.grafica.tickets(m.pagos)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Seccion>

        <Seccion id="cajeros" titulo={textos.cajeros.titulo} className="min-w-0">
          {reporte.porCajero.length === 0 ? (
            <p className={`${tarjeta} text-[15px] text-muted`}>{textos.vacio}</p>
          ) : (
            <div className={contenedorTabla}>
              <table className={`${tabla} min-w-[24rem]`}>
                <thead>
                  <tr className="border-b border-hairline">
                    <th scope="col" className={celdaEncabezado}>{textos.cajeros.cajero}</th>
                    <th scope="col" className={`${celdaEncabezado} text-right`}>{textos.cajeros.ventas}</th>
                    <th scope="col" className={`${celdaEncabezado} text-right`}>{textos.cajeros.tickets}</th>
                    <th scope="col" className={`${celdaEncabezado} text-right`}>{textos.cajeros.promedio}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {reporte.porCajero.map((c) => (
                    <tr key={c.cajero}>
                      <th scope="row" className={`${celda} font-medium`}>{c.cajero}</th>
                      <td className={`${celda} cifra text-right`}>{dinero(c.ventas)}</td>
                      <td className={`${celda} cifra text-right`}>{c.tickets}</td>
                      <td className={`${celda} cifra text-right text-muted`}>{dinero(c.tickets > 0 ? Math.round(c.ventas / c.tickets) : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>
      </div>

      <TablaRenglones id="categorias" titulo={textos.categorias.titulo} columna={textos.categorias.nombre} renglones={reporte.porCategoria} />
      <TablaRenglones id="productos" titulo={textos.productos.titulo} columna={textos.productos.nombre} renglones={reporte.productos} />

      <Seccion id="por-hora" titulo={textos.grafica.porHora}>
        <div className={tarjeta}>
          <p className="mb-4 text-[15px] text-muted">{textos.grafica.porHoraNota}</p>
          <GraficaBarras etiqueta={textos.grafica.porHora} barras={barrasHora} />
          <TablaDatos titulo={textos.grafica.porHora} filas={barrasHora} />
        </div>
      </Seccion>

      <details className={`${tarjeta} group`}>
        <summary className="flex cursor-pointer items-center justify-between text-[17px] font-medium">
          {textos.definiciones.titulo}
          <span aria-hidden="true" className="text-2xl leading-none text-muted transition-transform duration-200 group-open:rotate-45">
            +
          </span>
        </summary>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-[15px] leading-6 text-muted">
          {textos.definiciones.lista.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

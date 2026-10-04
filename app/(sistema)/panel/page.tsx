import type { Metadata } from "next";
import Link from "next/link";
import { textosCaducidad, textosMetodo } from "@/app/components/contenido";
import { EncabezadoPagina, Seccion } from "@/app/components/encabezado-pagina";
import { Estado } from "@/app/components/estado";
import {
  botonPrincipal,
  celda,
  celdaEncabezado,
  contenedorTabla,
  enlace,
  tabla,
  tarjeta,
} from "@/app/components/estilos";
import {
  obtenerHoy,
  obtenerInventario,
  obtenerPermisos,
  obtenerSesion,
  obtenerTurnoAbierto,
  obtenerVentasDeHoy,
} from "@/lib/consultas";
import { dinero, diasEntre, fechaCorta, fechaLarga } from "@/lib/formato";
import { estadoCaducidad } from "@/lib/inventario";
import { panel } from "./contenido";

export const metadata: Metadata = { title: "Panel" };

export default async function Panel() {
  const [{ usuario }, permisos, hoy] = await Promise.all([obtenerSesion(), obtenerPermisos(), obtenerHoy()]);
  const verInventario = permisos.has("inventario.ver");
  const usaCaja = permisos.has("caja.abrir") || permisos.has("caja.cerrar");

  // Las ventas ya llegan filtradas por la base: sin "ventas.historial", solo las propias.
  const [ventas, turno, inventario] = await Promise.all([
    obtenerVentasDeHoy(),
    usaCaja ? obtenerTurnoAbierto() : null,
    verInventario ? obtenerInventario() : [],
  ]);
  const cobradas = ventas.filter((v) => !v.cancelada);
  const totalVentas = cobradas.reduce((suma, v) => suma + v.total, 0);

  const lotesPorCaducar = inventario
    .flatMap((f) => f.lotes.map((lote) => ({ producto: f.producto, lote })))
    .filter(({ lote }) => estadoCaducidad(lote.caducidad, hoy) !== "vigente")
    .sort((a, b) => a.lote.caducidad.localeCompare(b.lote.caducidad));

  const porSurtir = inventario
    .filter((f) => f.alertas.includes("stock-bajo") || f.alertas.includes("sin-existencia"))
    .sort((a, b) => a.existencia / Math.max(a.producto.stockMinimo, 1) - b.existencia / Math.max(b.producto.stockMinimo, 1));

  const indicadores = [
    {
      etiqueta: permisos.has("ventas.historial") ? panel.indicadores.ventasTodas : panel.indicadores.ventasPropias,
      valor: dinero(totalVentas),
      nota: panel.indicadores.tickets(cobradas.length),
    },
    ...(verInventario
      ? [
          { etiqueta: panel.indicadores.porCaducar, valor: String(lotesPorCaducar.length), nota: panel.indicadores.porCaducarNota, href: "/inventario?filtro=por-caducar" },
          { etiqueta: panel.indicadores.stockBajo, valor: String(porSurtir.length), nota: panel.indicadores.stockBajoNota, href: "/inventario?filtro=por-surtir" },
        ]
      : []),
  ];

  return (
    <div className="space-y-10">
      <EncabezadoPagina etiqueta={fechaLarga(hoy)} titulo={panel.saludo(usuario.nombre.split(" ")[0])} descripcion={panel.descripcion}>
        {permisos.has("ventas.vender") && (
          <Link href="/venta" className={botonPrincipal}>
            {panel.nuevaVenta}
          </Link>
        )}
      </EncabezadoPagina>

      <ul className={`grid gap-4 ${indicadores.length === 3 ? "sm:grid-cols-3" : ""}`}>
        {indicadores.map((i) => {
          const contenido = (
            <>
              <p className="text-[15px] text-muted">{i.etiqueta}</p>
              <p className="cifra mt-2 text-3xl font-semibold tracking-tight">{i.valor}</p>
              <p className="mt-1 text-[13px] text-muted">{i.nota}</p>
            </>
          );
          return (
            <li key={i.etiqueta}>
              {"href" in i && i.href ? (
                <Link
                  href={i.href}
                  className={`${tarjeta} block h-full transition-colors hover:bg-foreground/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
                >
                  {contenido}
                </Link>
              ) : (
                <div className={`${tarjeta} h-full`}>{contenido}</div>
              )}
            </li>
          );
        })}
      </ul>

      {usaCaja && (
        <div className={`${tarjeta} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
          {turno ? (
            <>
              <div>
                <p className="text-[17px] font-medium">{panel.caja.abierta(turno.caja, turno.abiertoA)}</p>
                <p className="mt-1 text-[15px] text-muted">
                  {panel.caja.esperado}:{" "}
                  {turno.efectivoEsperado === null ? (
                    panel.caja.esperadoOculto
                  ) : (
                    <span className="cifra font-medium text-foreground">{dinero(turno.efectivoEsperado)}</span>
                  )}
                </p>
              </div>
              <Link href="/caja" className={`${enlace} text-[17px]`}>
                {panel.caja.ir} ›
              </Link>
            </>
          ) : (
            <>
              <p className="text-[17px]">{panel.caja.cerrada}</p>
              <Link href="/caja" className={`${enlace} text-[17px]`}>
                {panel.caja.abrir} ›
              </Link>
            </>
          )}
        </div>
      )}

      {verInventario && (
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-6">
          <Seccion
            id="por-caducar"
            className="min-w-0"
            titulo={panel.porCaducar.titulo}
            accion={
              <Link href="/inventario?filtro=por-caducar" className={`${enlace} text-[15px]`}>
                {panel.porCaducar.verTodo} ›
              </Link>
            }
          >
            <div className={tarjeta}>
              {lotesPorCaducar.length === 0 ? (
                <p className="text-[15px] text-muted">{panel.porCaducar.vacio}</p>
              ) : (
                <ul className="-my-3 divide-y divide-hairline">
                  {lotesPorCaducar.slice(0, 8).map(({ producto, lote }) => {
                    const estado = textosCaducidad[estadoCaducidad(lote.caducidad, hoy)];
                    return (
                      <li key={lote.id} className="flex items-center justify-between gap-4 py-3">
                        <div className="min-w-0">
                          <Link href={`/inventario/${producto.id}`} className="block truncate text-[15px] font-medium hover:underline">
                            {producto.nombre}
                          </Link>
                          <p className="text-[13px] text-muted">
                            {panel.porCaducar.detalle(lote.numero, fechaCorta(lote.caducidad), lote.cantidad)}
                          </p>
                        </div>
                        <Estado tono={estado.tono}>{panel.porCaducar.dias(diasEntre(hoy, lote.caducidad))}</Estado>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Seccion>

          <Seccion
            id="por-surtir"
            className="min-w-0"
            titulo={panel.stockBajo.titulo}
            accion={
              <Link href="/inventario?filtro=por-surtir" className={`${enlace} text-[15px]`}>
                {panel.stockBajo.verTodo} ›
              </Link>
            }
          >
            <div className={tarjeta}>
              {porSurtir.length === 0 ? (
                <p className="text-[15px] text-muted">{panel.stockBajo.vacio}</p>
              ) : (
                <ul className="-my-3 divide-y divide-hairline">
                  {porSurtir.slice(0, 8).map((f) => (
                    <li key={f.producto.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Link href={`/inventario/${f.producto.id}`} className="block truncate text-[15px] font-medium hover:underline">
                          {f.producto.nombre}
                        </Link>
                        <p className="truncate text-[13px] text-muted">{f.producto.presentacion}</p>
                      </div>
                      <Estado tono={f.existencia === 0 ? "peligro" : "aviso"}>
                        {panel.stockBajo.existencia(f.existencia, f.producto.stockMinimo)}
                      </Estado>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Seccion>
        </div>
      )}

      <Seccion id="ultimas-ventas" titulo={panel.ventas.titulo}>
        {ventas.length === 0 ? (
          <p className={`${tarjeta} text-[15px] text-muted`}>{panel.ventas.vacio}</p>
        ) : (
          <div className={contenedorTabla}>
            <table className={`${tabla} min-w-[40rem]`}>
              <thead>
                <tr className="border-b border-hairline">
                  <th scope="col" className={celdaEncabezado}>{panel.ventas.folio}</th>
                  <th scope="col" className={celdaEncabezado}>{panel.ventas.hora}</th>
                  <th scope="col" className={celdaEncabezado}>{panel.ventas.cajero}</th>
                  <th scope="col" className={`${celdaEncabezado} text-right`}>{panel.ventas.piezas}</th>
                  <th scope="col" className={celdaEncabezado}>{panel.ventas.metodo}</th>
                  <th scope="col" className={`${celdaEncabezado} text-right`}>{panel.ventas.total}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {ventas.slice(0, 20).map((v) => (
                  <tr key={v.id} className={v.cancelada ? "text-muted line-through" : undefined}>
                    <td className={`${celda} font-mono text-sm`}>
                      <Link href={`/ticket/${v.id}`} className={enlace} aria-label={panel.ventas.reimprimir(v.folio)}>
                        {v.folio}
                      </Link>
                    </td>
                    <td className={`${celda} cifra`}>{v.hora}</td>
                    <td className={celda}>{v.cajero}</td>
                    <td className={`${celda} cifra text-right`}>{v.piezas}</td>
                    <td className={celda}>{v.metodo ? textosMetodo[v.metodo] : panel.ventas.mixto}</td>
                    <td className={`${celda} cifra text-right font-medium`}>{dinero(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
    </div>
  );
}

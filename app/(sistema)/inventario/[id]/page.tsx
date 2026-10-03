import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { etiquetaReceta, textosAlerta, textosCaducidad, textosMovimiento } from "@/app/components/contenido";
import { EncabezadoPagina, Seccion } from "@/app/components/encabezado-pagina";
import { Estado } from "@/app/components/estado";
import { botonPrincipal, botonSecundario, celda, celdaEncabezado, contenedorTabla, enlace, tabla, tarjeta } from "@/app/components/estilos";
import { obtenerCostos, obtenerFilaInventario, obtenerHoy, obtenerKardex, obtenerPermisos } from "@/lib/consultas";
import { dinero, diasEntre, fechaCorta } from "@/lib/formato";
import { desglosarIva, estadoCaducidad } from "@/lib/inventario";
import { inventario } from "../contenido";

const textos = inventario.detalle;

export async function generateMetadata({ params }: PageProps<"/inventario/[id]">): Promise<Metadata> {
  const fila = await obtenerFilaInventario((await params).id);
  return { title: fila?.producto.nombre ?? inventario.titulo };
}

export default async function DetalleProducto({ params, searchParams }: PageProps<"/inventario/[id]">) {
  const permisos = await obtenerPermisos();
  if (!permisos.has("inventario.ver")) redirect("/panel");
  const puedeEditar = permisos.has("productos.editar") || permisos.has("productos.precios");

  const [{ id }, { creado }] = await Promise.all([params, searchParams]);
  const fila = await obtenerFilaInventario(id);
  if (!fila) notFound();
  const [kardex, hoy, costos] = await Promise.all([obtenerKardex(id), obtenerHoy(), obtenerCostos()]);
  const costo = costos.get(id);
  const verCostos = costo !== undefined;

  const { producto, lotes, existencia, alertas } = fila;
  const clasificacion = etiquetaReceta(producto);
  // Margen sobre el precio sin IVA, igual que en Reportes.
  const { base } = desglosarIva(producto.precio, producto.iva);
  const margen = costo !== undefined && base > 0 ? Math.round(((base - costo) / base) * 100) : 0;

  const datos = [
    { etiqueta: textos.codigo, valor: producto.codigoBarras ?? "—", mono: true },
    { etiqueta: textos.laboratorio, valor: producto.laboratorio },
    { etiqueta: textos.categoria, valor: producto.categoria },
    { etiqueta: textos.ubicacion, valor: producto.ubicacion },
  ];

  return (
    <div className="space-y-10">
      <div>
        <Link href="/inventario" className={`${enlace} text-[15px]`}>
          ‹ {textos.volver}
        </Link>
        <div className="mt-4">
          <EncabezadoPagina titulo={producto.nombre} descripcion={[producto.presentacion, producto.sustancia].filter(Boolean).join(" · ")}>
            {puedeEditar && (
              <Link href={`/productos/${producto.id}/editar`} className={botonSecundario}>
                {textos.editar}
              </Link>
            )}
          </EncabezadoPagina>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {clasificacion && <Estado tono={clasificacion.tono}>{clasificacion.texto}</Estado>}
          {producto.refrigerado && <Estado tono="acento">{textos.refrigerado}</Estado>}
          {alertas.map((a) => (
            <Estado key={a} tono={textosAlerta[a].tono}>
              {textosAlerta[a].texto}
            </Estado>
          ))}
        </div>
      </div>

      {creado === "1" && (
        <div role="status" className="flex flex-col gap-4 rounded-3xl bg-success/10 p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[17px] text-success">{textos.creado}</p>
          {permisos.has("inventario.entrada") && (
            <Link href="/inventario/entrada" className={botonPrincipal}>
              {textos.recibir}
            </Link>
          )}
        </div>
      )}

      <ul className={`grid gap-4 ${verCostos ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <li className={tarjeta}>
          <p className="text-[15px] text-muted">{textos.existencia}</p>
          <p className="cifra mt-2 text-3xl font-semibold tracking-tight">{existencia}</p>
          <p className="mt-1 text-[13px] text-muted">{textos.minimo(producto.stockMinimo)}</p>
        </li>
        <li className={tarjeta}>
          <p className="text-[15px] text-muted">{textos.precio}</p>
          <p className="cifra mt-2 text-3xl font-semibold tracking-tight">{dinero(producto.precio)}</p>
          <p className="mt-1 text-[13px] text-muted">{textos.iva(producto.iva)}</p>
        </li>
        {verCostos && (
          <li className={tarjeta}>
            <p className="text-[15px] text-muted">{textos.costo}</p>
            <p className="cifra mt-2 text-3xl font-semibold tracking-tight">{dinero(costo ?? 0)}</p>
            <p className="mt-1 text-[13px] text-muted">{textos.margen(margen)}</p>
          </li>
        )}
      </ul>

      <dl className={`${tarjeta} grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4`}>
        {datos.map((d) => (
          <div key={d.etiqueta} className="min-w-0">
            <dt className="text-[13px] text-muted">{d.etiqueta}</dt>
            <dd className={`mt-1 break-all ${d.mono ? "select-all font-mono text-sm" : "text-[15px]"}`}>{d.valor}</dd>
          </div>
        ))}
      </dl>

      <Seccion id="lotes" titulo={textos.lotes.titulo}>
        <p className="-mt-2 mb-4 text-[15px] text-muted">{textos.lotes.descripcion}</p>
        {lotes.length === 0 ? (
          <p className={`${tarjeta} text-[15px] text-muted`}>{textos.lotes.vacio}</p>
        ) : (
          <div className={contenedorTabla}>
            <table className={`${tabla} min-w-[36rem]`}>
              <thead>
                <tr className="border-b border-hairline">
                  <th scope="col" className={celdaEncabezado}>{textos.lotes.numero}</th>
                  <th scope="col" className={celdaEncabezado}>{textos.lotes.caducidad}</th>
                  <th scope="col" className={`${celdaEncabezado} text-right`}>{textos.lotes.dias}</th>
                  <th scope="col" className={`${celdaEncabezado} text-right`}>{textos.lotes.cantidad}</th>
                  <th scope="col" className={celdaEncabezado}>{textos.lotes.estado}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {lotes.map((l) => {
                  const caducidad = textosCaducidad[estadoCaducidad(l.caducidad, hoy)];
                  return (
                    <tr key={l.id}>
                      <td className={`${celda} font-mono text-sm`}>{l.numero}</td>
                      <td className={`${celda} cifra`}>{fechaCorta(l.caducidad)}</td>
                      <td className={`${celda} cifra text-right`}>{diasEntre(hoy, l.caducidad)}</td>
                      <td className={`${celda} cifra text-right font-medium`}>{l.cantidad}</td>
                      <td className={celda}>
                        {l.estado === "cuarentena" ? (
                          <Estado tono="neutro">{textos.lotes.bloqueado}</Estado>
                        ) : l.cantidad === 0 ? (
                          <Estado tono="neutro">{textos.lotes.agotado}</Estado>
                        ) : (
                          <Estado tono={caducidad.tono}>{caducidad.texto}</Estado>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion id="kardex" titulo={textos.kardex.titulo}>
        <p className="-mt-2 mb-4 text-[15px] text-muted">{textos.kardex.descripcion}</p>
        {kardex.length === 0 ? (
          <p className={`${tarjeta} text-[15px] text-muted`}>{textos.kardex.vacio}</p>
        ) : (
          <div className={contenedorTabla}>
            <table className={`${tabla} min-w-[48rem]`}>
              <thead>
                <tr className="border-b border-hairline">
                  <th scope="col" className={celdaEncabezado}>{textos.kardex.fecha}</th>
                  <th scope="col" className={celdaEncabezado}>{textos.kardex.tipo}</th>
                  <th scope="col" className={celdaEncabezado}>{textos.kardex.lote}</th>
                  <th scope="col" className={`${celdaEncabezado} text-right`}>{textos.kardex.cantidad}</th>
                  <th scope="col" className={celdaEncabezado}>{textos.kardex.usuario}</th>
                  <th scope="col" className={celdaEncabezado}>{textos.kardex.referencia}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {kardex.map((m) => (
                  <tr key={m.id}>
                    <td className={`${celda} cifra whitespace-nowrap`}>{m.fecha}</td>
                    <td className={celda}>{textosMovimiento[m.tipo]}</td>
                    <td className={`${celda} font-mono text-sm`}>{m.lote}</td>
                    <td className={`${celda} cifra text-right font-medium ${m.cantidad < 0 ? "text-danger" : "text-success"}`}>
                      {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                    </td>
                    <td className={celda}>{m.usuario}</td>
                    <td className={`${celda} text-muted`}>{m.referencia}</td>
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

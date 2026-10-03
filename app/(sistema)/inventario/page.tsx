import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { etiquetaReceta, textosAlerta } from "@/app/components/contenido";
import { EncabezadoPagina } from "@/app/components/encabezado-pagina";
import { Estado } from "@/app/components/estado";
import {
  botonPrincipal,
  botonSecundario,
  campo,
  celda,
  celdaEncabezado,
  contenedorTabla,
  tabla,
  tarjeta,
} from "@/app/components/estilos";
import { Icono } from "@/app/components/icono";
import { obtenerCostos, obtenerInventario, puede, type FilaInventario } from "@/lib/consultas";
import { dinero, fechaCorta } from "@/lib/formato";
import { inventario } from "./contenido";

export const metadata: Metadata = { title: inventario.titulo };

const FILTROS = {
  todos: () => true,
  "por-surtir": (f: FilaInventario) => f.alertas.includes("stock-bajo") || f.alertas.includes("sin-existencia"),
  "por-caducar": (f: FilaInventario) => f.alertas.includes("por-caducar"),
  caducados: (f: FilaInventario) => f.alertas.includes("caducado"),
} as const;

type Filtro = keyof typeof FILTROS;

function esFiltro(valor: unknown): valor is Filtro {
  return typeof valor === "string" && valor in FILTROS;
}

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export default async function Inventario({ searchParams }: PageProps<"/inventario">) {
  if (!(await puede("inventario.ver"))) redirect("/panel");

  const parametros = await searchParams;
  const filtro: Filtro = esFiltro(parametros.filtro) ? parametros.filtro : "todos";
  const q = typeof parametros.q === "string" ? parametros.q : "";

  const [filas, costos, recibir, crear] = await Promise.all([obtenerInventario(), obtenerCostos(), puede("inventario.entrada"), puede("productos.crear")]);
  const verCostos = costos.size > 0;

  const consulta = normalizar(q);
  const coinciden = consulta
    ? filas.filter(
        (f) =>
          (f.producto.codigoBarras?.startsWith(consulta) ?? false) ||
          normalizar(`${f.producto.nombre} ${f.producto.sustancia}`).includes(consulta),
      )
    : filas;
  const visibles = coinciden.filter(FILTROS[filtro]);

  function hrefFiltro(f: Filtro) {
    const p = new URLSearchParams();
    if (f !== "todos") p.set("filtro", f);
    if (q) p.set("q", q);
    const texto = p.toString();
    return texto ? `/inventario?${texto}` : "/inventario";
  }

  return (
    <div className="space-y-8">
      <EncabezadoPagina titulo={inventario.titulo} descripcion={inventario.descripcion}>
        {crear && (
          <Link href="/productos/nuevo" className={botonSecundario}>
            {inventario.nuevoProducto}
          </Link>
        )}
        {recibir && (
          <Link href="/inventario/entrada" className={botonPrincipal}>
            {inventario.recibir}
          </Link>
        )}
      </EncabezadoPagina>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label={inventario.filtros.etiqueta} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <ul className="flex gap-2">
            {(Object.keys(FILTROS) as Filtro[]).map((f) => {
              const activo = f === filtro;
              const cuantos = coinciden.filter(FILTROS[f]).length;
              return (
                <li key={f} className="shrink-0">
                  <Link
                    href={hrefFiltro(f)}
                    aria-current={activo ? "page" : undefined}
                    className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      activo ? "bg-foreground font-medium text-background" : "bg-surface hover:bg-foreground/[0.07]"
                    }`}
                  >
                    {inventario.filtros[f]}
                    <span className={`cifra text-[13px] ${activo ? "opacity-70" : "text-muted"}`}>{cuantos}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <Form action="/inventario" className="flex w-full gap-2 lg:w-96" role="search">
          {filtro !== "todos" && <input type="hidden" name="filtro" value={filtro} />}
          <label htmlFor="q" className="sr-only">
            {inventario.buscar.etiqueta}
          </label>
          <div className="relative min-w-0 flex-1">
            <Icono nombre="buscar" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <input id="q" name="q" type="search" defaultValue={q} placeholder={inventario.buscar.placeholder} className={`${campo} pl-11`} />
          </div>
          <button type="submit" className={botonSecundario}>
            {inventario.buscar.accion}
          </button>
        </Form>
      </div>

      {visibles.length === 0 ? (
        <p className={`${tarjeta} text-[15px] text-muted`}>{inventario.vacio}</p>
      ) : (
        <div className={contenedorTabla}>
          <table className={`${tabla} min-w-[56rem]`}>
            <caption className="sr-only">{inventario.total(visibles.length)}</caption>
            <thead>
              <tr className="border-b border-hairline">
                <th scope="col" className={celdaEncabezado}>{inventario.columnas.producto}</th>
                <th scope="col" className={celdaEncabezado}>{inventario.columnas.ubicacion}</th>
                <th scope="col" className={`${celdaEncabezado} text-right`}>{inventario.columnas.existencia}</th>
                <th scope="col" className={celdaEncabezado}>{inventario.columnas.caducidad}</th>
                <th scope="col" className={celdaEncabezado}>{inventario.columnas.estado}</th>
                <th scope="col" className={`${celdaEncabezado} text-right`}>{inventario.columnas.precio}</th>
                {verCostos && <th scope="col" className={`${celdaEncabezado} text-right`}>{inventario.columnas.costo}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {visibles.map((f) => {
                const clasificacion = etiquetaReceta(f.producto);
                return (
                  <tr key={f.producto.id} className="transition-colors hover:bg-foreground/[0.03]">
                    <td className={celda}>
                      <Link
                        href={`/inventario/${f.producto.id}`}
                        className="rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {f.producto.nombre}
                      </Link>
                      <p className="text-[13px] text-muted">
                        {f.producto.presentacion} · {f.producto.sustancia}
                      </p>
                      {clasificacion && (
                        <p className="mt-1.5">
                          <Estado tono={clasificacion.tono}>{clasificacion.texto}</Estado>
                        </p>
                      )}
                    </td>
                    <td className={`${celda} text-muted`}>{f.producto.ubicacion}</td>
                    <td className={`${celda} text-right`}>
                      <span className="cifra font-medium">{f.existencia}</span>
                      <p className="cifra text-[13px] text-muted">{inventario.minimo(f.producto.stockMinimo)}</p>
                    </td>
                    <td className={`${celda} cifra`}>{f.proximaCaducidad ? fechaCorta(f.proximaCaducidad) : "—"}</td>
                    <td className={celda}>
                      <div className="flex flex-wrap gap-1.5">
                        {f.alertas.length === 0 ? (
                          <Estado tono="exito">{inventario.sinAlertas}</Estado>
                        ) : (
                          f.alertas.map((a) => (
                            <Estado key={a} tono={textosAlerta[a].tono}>
                              {textosAlerta[a].texto}
                            </Estado>
                          ))
                        )}
                      </div>
                    </td>
                    <td className={`${celda} cifra text-right`}>{dinero(f.producto.precio)}</td>
                    {verCostos && <td className={`${celda} cifra text-right text-muted`}>{dinero(costos.get(f.producto.id) ?? 0)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

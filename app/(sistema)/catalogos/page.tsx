import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EncabezadoPagina, Seccion } from "@/app/components/encabezado-pagina";
import { Estado } from "@/app/components/estado";
import { botonPrincipal, enlace, tarjeta, tarjetaLibre } from "@/app/components/estilos";
import { obtenerCategorias, obtenerProductosInactivos, obtenerProveedoresTodos, puede } from "@/lib/consultas";
import { catalogos as textos } from "./contenido";
import { FormularioCategoria, FormularioProveedor } from "./formularios";

export const metadata: Metadata = { title: textos.titulo };

export default async function Catalogos() {
  if (!(await puede("productos.crear"))) redirect("/panel");

  const [proveedores, categorias, inactivos, editaProductos] = await Promise.all([
    obtenerProveedoresTodos(),
    obtenerCategorias(),
    obtenerProductosInactivos(),
    puede("productos.editar"),
  ]);

  return (
    <div className="space-y-10">
      <EncabezadoPagina etiqueta={textos.etiqueta} titulo={textos.titulo} descripcion={textos.descripcion}>
        <Link href="/productos/nuevo" className={botonPrincipal}>
          {textos.nuevoProducto}
        </Link>
      </EncabezadoPagina>

      <Seccion id="proveedores" titulo={textos.proveedores.titulo}>
        <div className="space-y-4">
          <div className={tarjeta}>
            <FormularioProveedor />
          </div>
          {proveedores.length === 0 ? (
            <p className={`${tarjeta} text-[15px] text-muted`}>{textos.proveedores.vacio}</p>
          ) : (
            <ul className={`${tarjetaLibre} divide-y divide-hairline px-6 py-2`}>
              {proveedores.map((p) => (
                <li key={p.id} className="py-4">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0">
                        <span className="block font-medium">{p.nombre}</span>
                        <span className="block break-all text-[13px] text-muted">
                          {[p.rfc, p.telefono, p.correo].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <Estado tono={p.activo ? "exito" : "neutro"}>{p.activo ? textos.proveedores.activo : textos.proveedores.inactivo}</Estado>
                        <span className={`${enlace} text-[15px]`}>
                          {textos.proveedores.editar}
                        </span>
                      </span>
                    </summary>
                    <div className="mt-4 rounded-2xl bg-background p-4">
                      <FormularioProveedor proveedor={p} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Seccion>

      <Seccion id="categorias" titulo={textos.categorias.titulo}>
        <div className="space-y-4">
          <div className={tarjeta}>
            <FormularioCategoria />
          </div>
          {categorias.length === 0 ? (
            <p className={`${tarjeta} text-[15px] text-muted`}>{textos.categorias.vacio}</p>
          ) : (
            <ul className={`${tarjeta} grid gap-x-6 gap-y-3 sm:grid-cols-2`}>
              {categorias.map((c) => (
                <li key={c.id}>
                  <FormularioCategoria categoria={c} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Seccion>

      <Seccion id="inactivos" titulo={textos.inactivos.titulo}>
        <p className="-mt-2 mb-4 text-[15px] text-muted">{textos.inactivos.descripcion}</p>
        {inactivos.length === 0 ? (
          <p className={`${tarjeta} text-[15px] text-muted`}>{textos.inactivos.vacio}</p>
        ) : (
          <ul className={`${tarjetaLibre} divide-y divide-hairline px-6 py-2`}>
            {inactivos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.nombre}</span>
                  <span className="block truncate text-[13px] text-muted">{p.presentacion}</span>
                </span>
                {editaProductos && (
                  <Link href={`/productos/${p.id}/editar`} className={`${enlace} shrink-0 text-[15px]`}>
                    {textos.inactivos.editar} ›
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Seccion>
    </div>
  );
}

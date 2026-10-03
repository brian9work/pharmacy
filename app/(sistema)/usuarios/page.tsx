import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/app/components/encabezado-pagina";
import { Estado } from "@/app/components/estado";
import { botonPrincipal, botonSecundario, celda, celdaEncabezado, contenedorTabla, tabla } from "@/app/components/estilos";
import { ROLES } from "@/config/permisos";
import { obtenerSesion, obtenerUsuarios, puede } from "@/lib/consultas";
import { BotonEstado } from "./boton-estado";
import { usuarios as textos } from "./contenido";

export const metadata: Metadata = { title: textos.titulo };

export default async function Usuarios() {
  if (!(await puede("usuarios.gestionar"))) redirect("/panel");

  const [lista, verPermisos, { usuario: yo }] = await Promise.all([obtenerUsuarios(), puede("permisos.gestionar"), obtenerSesion()]);

  return (
    <div className="space-y-8">
      <EncabezadoPagina titulo={textos.titulo} descripcion={textos.descripcion}>
        {verPermisos && (
          <Link href="/usuarios/permisos" className={botonSecundario}>
            {textos.permisos}
          </Link>
        )}
        <Link href="/usuarios/nuevo" className={botonPrincipal}>
          {textos.nuevo}
        </Link>
      </EncabezadoPagina>

      <div className={contenedorTabla}>
        <table className={`${tabla} min-w-[44rem]`}>
          <thead>
            <tr className="border-b border-hairline">
              <th scope="col" className={celdaEncabezado}>{textos.columnas.nombre}</th>
              <th scope="col" className={celdaEncabezado}>{textos.columnas.rol}</th>
              <th scope="col" className={celdaEncabezado}>{textos.columnas.estado}</th>
              <th scope="col" className={celdaEncabezado}>{textos.columnas.acceso}</th>
              <th scope="col" className={`${celdaEncabezado} text-right`}>
                <span className="sr-only">{textos.columnas.acciones}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {lista.map((u) => (
              <tr key={u.id}>
                <td className={celda}>
                  <p className="font-medium">{u.nombre}</p>
                  <p className="break-all text-[13px] text-muted">{u.correo}</p>
                </td>
                <td className={celda}>
                  <Estado tono={u.rol === "admin" ? "acento" : "neutro"}>{ROLES[u.rol].nombre}</Estado>
                </td>
                <td className={celda}>
                  <Estado tono={u.activo ? "exito" : "peligro"}>{u.activo ? textos.activo : textos.bloqueado}</Estado>
                </td>
                <td className={`${celda} text-muted`}>{u.ultimoAcceso ?? textos.nuncaEntro}</td>
                <td className={`${celda} text-right`}>
                  {u.id === yo.id ? (
                    <span className="text-[13px] text-muted">{textos.tu}</span>
                  ) : (
                    <BotonEstado id={u.id} nombre={u.nombre} activo={u.activo} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

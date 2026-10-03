// Lee y valida los campos del formulario de producto. Lógica pura para poder
// probarla; la base vuelve a validar (tipos, rangos y código único).

import type { Clasificacion } from "./tipos";

export const MENSAJES_PRODUCTO = {
  nombre: "Escribe el nombre del producto.",
  largo: "Algún dato es demasiado largo.",
  codigo: "El código de barras lleva de 4 a 32 letras, números o guiones, sin espacios.",
  precio: "Escribe el precio de venta en pesos, mayor a 0. Por ejemplo: 35.50",
  costo: "Escribe el costo en pesos, con hasta dos decimales. Por ejemplo: 18.00",
  iva: "Elige el IVA: 0 % o 16 %.",
  clasificacion: "Elige cómo se vende: libre, antibiótico o controlado.",
  minimo: "El stock mínimo es un número entero de 0 en adelante.",
  categoria: "Escribe el nombre de la categoría nueva.",
};

const CLASIFICACIONES: Clasificacion[] = ["libre", "antibiotico", "controlado"];
const CODIGO = /^[0-9A-Z-]{4,32}$/;
const LARGO_MAXIMO = 120;
/** $1,000,000.00 */
const PRECIO_MAXIMO = 100_000_000;

/** "$1,234.50" → 123450 centavos. null si no es un monto válido (negativo, más de 2 decimales, texto). */
export function aCentavos(texto: string): number | null {
  const limpio = texto.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  const [enteros, decimales = ""] = limpio.split(".");
  // Sin multiplicar flotantes: 19.99 * 100 = 1998.9999…
  const centavos = Number(enteros) * 100 + Number(decimales.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) && centavos <= PRECIO_MAXIMO ? centavos : null;
}

export interface DatosProducto {
  codigoBarras: string | null;
  nombre: string;
  sustancia: string;
  presentacion: string;
  laboratorio: string;
  /** Categoría existente, nueva por nombre, o ninguna. */
  categoria: { id: number } | { nueva: string } | null;
  clasificacion: Clasificacion;
  precio: number;
  /** null = no se capturó (no se cambia). */
  costo: number | null;
  iva: 0 | 16;
  stockMinimo: number;
  ubicacion: string;
  refrigerado: boolean;
  activo: boolean;
}

export type Lectura = { ok: true; datos: DatosProducto } | { ok: false; error: string };

/** `campos` son los valores del formulario tal como llegan (texto). */
export function leerProducto(campos: Record<string, string | undefined>): Lectura {
  const texto = (nombre: string) => (campos[nombre] ?? "").trim();
  const error = (mensaje: string): Lectura => ({ ok: false, error: mensaje });

  const nombre = texto("nombre");
  if (!nombre) return error(MENSAJES_PRODUCTO.nombre);

  const libres = ["nombre", "sustancia", "presentacion", "laboratorio", "ubicacion"].map(texto);
  if (libres.some((v) => v.length > LARGO_MAXIMO)) return error(MENSAJES_PRODUCTO.largo);

  const codigo = texto("codigoBarras").toUpperCase();
  if (codigo && !CODIGO.test(codigo)) return error(MENSAJES_PRODUCTO.codigo);

  let categoria: DatosProducto["categoria"] = null;
  const valorCategoria = texto("categoria");
  if (valorCategoria === "nueva") {
    const nueva = texto("categoriaNueva");
    if (!nueva) return error(MENSAJES_PRODUCTO.categoria);
    if (nueva.length > 60) return error(MENSAJES_PRODUCTO.largo);
    categoria = { nueva };
  } else if (/^\d+$/.test(valorCategoria)) {
    categoria = { id: Number(valorCategoria) };
  }

  const clasificacion = texto("clasificacion") as Clasificacion;
  if (!CLASIFICACIONES.includes(clasificacion)) return error(MENSAJES_PRODUCTO.clasificacion);

  const precio = aCentavos(texto("precio"));
  if (precio === null || precio <= 0) return error(MENSAJES_PRODUCTO.precio);

  let costo: number | null = null;
  if (texto("costo")) {
    costo = aCentavos(texto("costo"));
    if (costo === null) return error(MENSAJES_PRODUCTO.costo);
  }

  const iva = texto("iva");
  if (iva !== "0" && iva !== "16") return error(MENSAJES_PRODUCTO.iva);

  const minimo = texto("stockMinimo") || "0";
  if (!/^\d{1,6}$/.test(minimo)) return error(MENSAJES_PRODUCTO.minimo);

  return {
    ok: true,
    datos: {
      codigoBarras: codigo || null,
      nombre,
      sustancia: texto("sustancia"),
      presentacion: texto("presentacion"),
      laboratorio: texto("laboratorio"),
      categoria,
      clasificacion,
      precio,
      costo,
      iva: iva === "16" ? 16 : 0,
      stockMinimo: Number(minimo),
      ubicacion: texto("ubicacion"),
      refrigerado: campos.refrigerado === "on",
      // El alta no manda "activo" (nace activo); la edición manda "on" u "off" explícito.
      activo: campos.activo !== "off",
    },
  };
}

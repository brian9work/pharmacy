import { NextResponse, type NextRequest } from "next/server";
import { celdaCsv, pesosCsv } from "@/lib/csv";
import { mensajeDeError } from "@/lib/errores";
import { clienteServidor } from "@/lib/supabase/servidor";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const ENCABEZADOS = ["Folio", "Fecha", "Hora", "Cajero", "Forma de pago", "Piezas", "Subtotal", "IVA", "Total", "Costo", "Utilidad", "Estado"];

// Ventas del periodo en CSV, para Excel o el contador. La base revisa reportes.ver.
export async function GET(request: NextRequest) {
  const desde = request.nextUrl.searchParams.get("desde") ?? "";
  const hasta = request.nextUrl.searchParams.get("hasta") ?? "";
  if (!FECHA.test(desde) || !FECHA.test(hasta)) return new NextResponse("Periodo no válido", { status: 400 });

  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("exportar_ventas", { p_desde: desde, p_hasta: hasta });
  if (error) return new NextResponse(mensajeDeError(error), { status: error.code === "P0001" ? 403 : 500 });

  const filas = (data ?? []) as {
    folio: number;
    fecha: string;
    hora: string;
    cajero: string;
    metodo: string | null;
    piezas: number;
    subtotal: number;
    iva: number;
    total: number;
    costo: number;
    estado: string;
  }[];

  const lineas = [
    ENCABEZADOS.join(","),
    ...filas.map((f) =>
      [
        `V-${String(f.folio).padStart(6, "0")}`,
        f.fecha,
        f.hora,
        f.cajero,
        f.metodo ?? "",
        f.piezas,
        pesosCsv(f.subtotal),
        pesosCsv(f.iva),
        pesosCsv(f.total),
        pesosCsv(f.costo),
        pesosCsv(f.subtotal - f.costo),
        f.estado,
      ]
        .map(celdaCsv)
        .join(","),
    ),
  ];

  // El BOM inicial hace que Excel lea bien los acentos.
  return new NextResponse(`\uFEFF${lineas.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ventas_${desde}_${hasta}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

import type { ResumenSubida } from "@/lib/subir-datos";
import { configuracion } from "./contenido";

const t = configuracion.nube;

/** El resultado de una subida en frases: lo que se subió y lo que quedó pendiente. */
export function describirResumen(resumen: ResumenSubida): { lineas: string[]; avisos: string[] } {
  const c = resumen.catalogo ?? {};
  const o = resumen.operacion ?? {};
  const sc = resumen.sinCuenta ?? { correos: [], ventas: 0, entradas: 0, movimientos: 0 };

  const lineas: string[] = [];
  if (o.ventas_nuevas) lineas.push(t.resumen.ventasNuevas(o.ventas_nuevas));
  if (o.entradas_nuevas) lineas.push(t.resumen.entradasNuevas(o.entradas_nuevas));
  if (o.turnos_nuevos) lineas.push(t.resumen.turnosNuevos(o.turnos_nuevos));
  if (c.productos_nuevos) lineas.push(t.resumen.productosNuevos(c.productos_nuevos));
  if (c.productos_actualizados) lineas.push(t.resumen.productosCambios(c.productos_actualizados));
  if (c.lotes_nuevos) lineas.push(t.resumen.lotesNuevos(c.lotes_nuevos));
  if (c.lotes_actualizados) lineas.push(t.resumen.lotesCambios(c.lotes_actualizados));
  if (o.ventas_ya_estaban) lineas.push(t.resumen.ventasYa(o.ventas_ya_estaban));
  if (lineas.length === 0) lineas.push(t.resumen.nadaNuevo);

  const avisos: string[] = [];
  if (sc.correos.length > 0) avisos.push(t.avisos.sinCuenta(sc.correos));
  if (o.ventas_folio_repetido) avisos.push(t.avisos.folioRepetido(o.ventas_folio_repetido));
  if (o.ventas_sin_turno) avisos.push(t.avisos.sinTurno(o.ventas_sin_turno));
  if (o.entradas_en_conflicto) avisos.push(t.avisos.entradasConflicto(o.entradas_en_conflicto));
  if (o.turnos_en_conflicto) avisos.push(t.avisos.turnosConflicto(o.turnos_en_conflicto));
  if (!resumen.completa && avisos.length === 0) avisos.push(t.avisos.pendiente);
  return { lineas, avisos };
}

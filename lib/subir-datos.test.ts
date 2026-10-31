import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sincronizar, type DatosLocales, type Fila, type Local, type Nube, type ResumenSubida } from "@/lib/subir-datos";

const vacio = (): DatosLocales => ({
  usuarios: [],
  categorias: [],
  proveedores: [],
  productos: [],
  lotes: [],
  recepciones: [],
  recepcion_partidas: [],
  turnos: [],
  ventas: [],
  recetas: [],
  venta_partidas: [],
  venta_pagos: [],
  movimientos_caja: [],
  movimientos_inventario: [],
});

/** Datos de una farmacia chica: dos cuentas, un producto con su lote y una venta. */
function datosBase(): DatosLocales {
  return {
    ...vacio(),
    usuarios: [
      { id: "u-ana", correo: "ana@farmacia.mx" },
      { id: "u-eva", correo: "eva@farmacia.mx" },
    ],
    categorias: [{ id: 1, nombre: "Analgésicos" }],
    proveedores: [{ id: "pr-1", nombre: "Distribuidora" }],
    productos: [{ id: "p-1", nombre: "Paracetamol", categoria_id: 1, precio: 3500 }],
    lotes: [{ id: "l-1", producto_id: "p-1", numero: "A1", cantidad: 8 }],
    turnos: [{ id: "t-1", caja: "Caja 1", usuario_id: "u-ana", cerrado_en: null }],
    ventas: [{ id: "v-1", folio: 1, turno_id: "t-1", usuario_id: "u-ana", estado: "pagada", cancelada_por: null }],
    venta_partidas: [{ venta_id: "v-1", producto_id: "p-1", lote_id: "l-1", cantidad: 2 }],
    venta_pagos: [{ venta_id: "v-1", metodo: "efectivo", monto: 7000 }],
    movimientos_caja: [{ origen_id: 1, turno_id: "t-1", tipo: "venta", venta_id: "v-1", usuario_id: "u-ana", autorizado_por: null }],
    movimientos_inventario: [{ origen_id: 1, lote_id: "l-1", producto_id: "p-1", tipo: "venta", cantidad: -2, venta_id: "v-1", usuario_id: "u-ana" }],
  };
}

interface Llamada {
  funcion: "usuarios" | "catalogo" | "operacion";
  cuerpo: unknown;
}

/** Nube de mentira: anota cada llamada y contesta con ids "N-…" para ver qué se reemplazó. */
function nubeFalsa(cuentas: Record<string, string>) {
  const llamadas: Llamada[] = [];
  const nube: Nube = {
    async usuarios(correos) {
      llamadas.push({ funcion: "usuarios", cuerpo: correos });
      return Object.fromEntries(Object.entries(cuentas).filter(([correo]) => correos.includes(correo)));
    },
    async catalogo(cuerpo) {
      llamadas.push({ funcion: "catalogo", cuerpo });
      const lista = (campo: string) => ((cuerpo[campo] as Fila[] | undefined) ?? []).map((f) => String(f.id));
      const mapa = (campo: string) => Object.fromEntries(lista(campo).map((id) => [id, `N-${id}`]));
      return {
        categorias: Object.fromEntries(lista("categorias").map((id) => [id, 100 + Number(id)])),
        proveedores: mapa("proveedores"),
        productos: mapa("productos"),
        lotes: mapa("lotes"),
        conteo: { productos_nuevos: lista("productos").length, lotes_nuevos: lista("lotes").length },
      };
    },
    async operacion(cuerpo) {
      llamadas.push({ funcion: "operacion", cuerpo });
      return { ventas_nuevas: ((cuerpo.ventas as Fila[] | undefined) ?? []).length };
    },
  };
  return { nube, llamadas };
}

function localFalso(datos: DatosLocales) {
  const registro: { terminada?: { ok: boolean; resumen: ResumenSubida | null; error: string | null } } = {};
  const local: Local = {
    iniciar: async () => ({ id: 7, desde: "1970-01-01T00:00:00Z" }),
    datos: async () => datos,
    terminar: async (_id, ok, resumen, error) => {
      registro.terminada = { ok, resumen, error };
    },
  };
  return { local, registro };
}

const cuerpoDe = (llamadas: Llamada[], n: number) => llamadas[n].cuerpo as Record<string, Fila[]>;

describe("subir datos", () => {
  it("sube en orden y reemplaza los ids locales por los de la nube", async () => {
    const { nube, llamadas } = nubeFalsa({ "ana@farmacia.mx": "N-ana", "eva@farmacia.mx": "N-eva" });
    const { local, registro } = localFalso(datosBase());
    const resumen = await sincronizar(local, nube);

    assert.deepEqual(llamadas.map((l) => l.funcion), ["usuarios", "catalogo", "catalogo", "catalogo", "operacion", "operacion"]);
    assert.equal(cuerpoDe(llamadas, 2).productos[0].categoria_id, 101, "la categoría usa el id de la nube");
    assert.equal(cuerpoDe(llamadas, 3).lotes[0].producto_id, "N-p-1", "el lote apunta al producto de la nube");

    const entradasYTurnos = cuerpoDe(llamadas, 4);
    assert.equal(entradasYTurnos.turnos[0].usuario_id, "N-ana");

    const ventas = cuerpoDe(llamadas, 5);
    assert.equal(ventas.ventas[0].usuario_id, "N-ana");
    assert.equal(ventas.venta_partidas[0].producto_id, "N-p-1");
    assert.equal(ventas.venta_partidas[0].lote_id, "N-l-1");
    assert.equal(ventas.movimientos_inventario[0].lote_id, "N-l-1");
    assert.equal(ventas.movimientos_caja[0].usuario_id, "N-ana");

    assert.equal(resumen.operacion.ventas_nuevas, 1);
    assert.equal(resumen.completa, true);
    assert.equal(resumen.catalogo.productos_nuevos, 1);
    assert.equal(registro.terminada?.ok, true);
  });

  it("no sube lo de una cuenta que no existe en la nube y dice cuál falta", async () => {
    const datos = datosBase();
    datos.turnos.push({ id: "t-2", caja: "Caja 1", usuario_id: "u-eva", cerrado_en: "2026-10-01" });
    datos.ventas.push({ id: "v-2", folio: 2, turno_id: "t-2", usuario_id: "u-eva", estado: "pagada", cancelada_por: null });
    const { nube, llamadas } = nubeFalsa({ "ana@farmacia.mx": "N-ana" }); // falta Eva
    const { local } = localFalso(datos);
    const resumen = await sincronizar(local, nube);

    assert.equal(resumen.completa, false, "con algo pendiente, el punto de partida no avanza");
    assert.deepEqual(resumen.sinCuenta.correos, ["eva@farmacia.mx"]);
    assert.equal(resumen.sinCuenta.ventas, 1);
    assert.equal(cuerpoDe(llamadas, 4).turnos.length, 1, "el turno de Eva no se sube");
    assert.deepEqual(cuerpoDe(llamadas, 5).ventas.map((v) => v.id), ["v-1"], "solo la venta de Ana");
  });

  it("manda las ventas de 100 en 100", async () => {
    const datos = datosBase();
    for (let i = 2; i <= 250; i++) datos.ventas.push({ id: `v-${i}`, folio: i, turno_id: "t-1", usuario_id: "u-ana", estado: "pagada", cancelada_por: null });
    const { nube, llamadas } = nubeFalsa({ "ana@farmacia.mx": "N-ana" });
    const { local } = localFalso(datos);
    const resumen = await sincronizar(local, nube);

    const deVentas = llamadas.filter((l) => l.funcion === "operacion").slice(1);
    assert.deepEqual(deVentas.map((l) => (l.cuerpo as Record<string, Fila[]>).ventas.length), [100, 100, 50]);
    assert.equal(resumen.operacion.ventas_nuevas, 250);
  });

  it("las entradas, el inventario inicial y los retiros van en la primera llamada", async () => {
    const datos = datosBase();
    datos.recepciones = [{ id: "r-1", proveedor_id: "pr-1", usuario_id: "u-ana", factura: "F1" }];
    datos.recepcion_partidas = [{ recepcion_id: "r-1", lote_id: "l-1", cantidad: 10 }];
    datos.movimientos_inventario.push(
      { origen_id: 2, lote_id: "l-1", producto_id: "p-1", tipo: "entrada", cantidad: 10, recepcion_id: "r-1", usuario_id: "u-ana" },
      { origen_id: 3, lote_id: "l-1", producto_id: "p-1", tipo: "inventario_inicial", cantidad: 5, usuario_id: null },
    );
    datos.movimientos_caja.push({ origen_id: 2, turno_id: "t-1", tipo: "retiro", venta_id: null, usuario_id: "u-ana", autorizado_por: null });
    const { nube, llamadas } = nubeFalsa({ "ana@farmacia.mx": "N-ana" });
    const { local } = localFalso(datos);
    await sincronizar(local, nube);

    const primera = cuerpoDe(llamadas, 4);
    assert.equal(primera.recepciones[0].proveedor_id, "N-pr-1");
    assert.equal(primera.recepcion_partidas[0].lote_id, "N-l-1");
    assert.deepEqual(primera.movimientos_inventario.map((m) => m.tipo).sort(), ["entrada", "inventario_inicial"]);
    assert.equal(primera.movimientos_inventario.find((m) => m.tipo === "inventario_inicial")?.usuario_id, null);
    assert.equal(primera.movimientos_caja.length, 1, "el retiro de efectivo va como movimiento suelto");
    assert.equal(cuerpoDe(llamadas, 5).movimientos_caja.length, 1, "y el de la venta con su venta");
  });

  it("si la nube falla, lo anota como fallido y avisa", async () => {
    const { nube } = nubeFalsa({ "ana@farmacia.mx": "N-ana" });
    nube.operacion = async () => {
      throw new Error("sin internet");
    };
    const { local, registro } = localFalso(datosBase());
    await assert.rejects(() => sincronizar(local, nube), /sin internet/);
    assert.equal(registro.terminada?.ok, false);
    assert.equal(registro.terminada?.error, "sin internet");
  });

  it("se detiene si falta en la nube algo que la venta necesita", async () => {
    const datos = datosBase();
    datos.venta_partidas[0].producto_id = "p-fantasma";
    const { nube } = nubeFalsa({ "ana@farmacia.mx": "N-ana" });
    const { local, registro } = localFalso(datos);
    await assert.rejects(() => sincronizar(local, nube), /producto/);
    assert.equal(registro.terminada?.ok, false);
  });

  it("sin nada nuevo igual sube el catálogo y no falla", async () => {
    const { nube, llamadas } = nubeFalsa({});
    const { local } = localFalso(vacio());
    const resumen = await sincronizar(local, nube);
    assert.equal(llamadas.some((l) => l.funcion === "operacion" && ((l.cuerpo as Record<string, Fila[]>).ventas?.length ?? 0) > 0), false);
    assert.deepEqual(resumen.sinCuenta, { correos: [], ventas: 0, entradas: 0, movimientos: 0 });
    assert.equal(resumen.completa, true);
  });
});

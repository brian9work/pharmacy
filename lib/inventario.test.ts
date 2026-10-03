import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { alertasDe, asignarFEFO, desglosarIva, estadoCaducidad, lotesVendibles, requiereReceta } from "./inventario";
import type { Lote, Producto } from "./tipos";

const HOY = "2026-10-03";

const lote = (id: string, caducidad: string, cantidad: number, estado: Lote["estado"] = "disponible"): Lote => ({
  id,
  productoId: "p1",
  numero: id.toUpperCase(),
  caducidad,
  cantidad,
  estado,
});

const producto: Producto = {
  id: "p1",
  codigoBarras: "7501000000011",
  nombre: "Paracetamol 500 mg",
  sustancia: "Paracetamol",
  presentacion: "Caja con 20 tabletas",
  laboratorio: "",
  categoria: "",
  clasificacion: "libre",
  requiereReceta: false,
  precio: 3500,
  iva: 0,
  stockMinimo: 20,
  ubicacion: "",
  refrigerado: false,
};

describe("caducidad", () => {
  it("clasifica caducado, por caducar (90 días) y vigente", () => {
    assert.equal(estadoCaducidad("2026-10-02", HOY), "caducado");
    assert.equal(estadoCaducidad(HOY, HOY), "por-caducar");
    assert.equal(estadoCaducidad("2027-01-01", HOY), "por-caducar");
    assert.equal(estadoCaducidad("2027-01-02", HOY), "vigente");
  });
});

describe("FEFO", () => {
  const lotes = [
    lote("c", "2027-08-31", 40),
    lote("a", "2026-11-15", 8),
    lote("vencido", "2026-09-20", 3),
    lote("bloqueado", "2026-10-30", 6, "cuarentena"),
    lote("vacio", "2026-10-10", 0),
  ];

  it("solo vende lotes con piezas, sin bloqueo y sin caducar, del que caduca antes al que caduca después", () => {
    assert.deepEqual(
      lotesVendibles(lotes, HOY).map((l) => l.id),
      ["a", "c"],
    );
  });

  it("reparte la cantidad entre lotes empezando por el que caduca antes", () => {
    assert.deepEqual(asignarFEFO(lotesVendibles(lotes, HOY), 10), [
      { loteId: "a", numero: "A", caducidad: "2026-11-15", cantidad: 8 },
      { loteId: "c", numero: "C", caducidad: "2027-08-31", cantidad: 2 },
    ]);
  });

  it("devuelve null si no alcanza", () => {
    assert.equal(asignarFEFO(lotesVendibles(lotes, HOY), 49), null);
    assert.ok(asignarFEFO(lotesVendibles(lotes, HOY), 48));
  });
});

describe("alertas", () => {
  it("marca stock bajo, lote caducado, por caducar y bloqueado", () => {
    const lotes = [lote("a", "2026-11-15", 8), lote("vencido", "2026-09-20", 3), lote("bloqueado", "2027-05-01", 2, "cuarentena")];
    assert.deepEqual(alertasDe(producto, lotes, HOY), ["stock-bajo", "caducado", "por-caducar", "cuarentena"]);
  });

  it("marca sin existencia cuando no hay piezas vendibles", () => {
    assert.deepEqual(alertasDe(producto, [lote("vencido", "2026-09-20", 3)], HOY), ["sin-existencia", "caducado"]);
  });

  it("no marca nada si todo está bien", () => {
    assert.deepEqual(alertasDe(producto, [lote("c", "2027-08-31", 40)], HOY), []);
  });
});

describe("IVA y receta", () => {
  it("separa el IVA de un precio que ya lo incluye", () => {
    assert.deepEqual(desglosarIva(11600, 16), { base: 10000, impuesto: 1600 });
    assert.deepEqual(desglosarIva(4500, 16), { base: 3879, impuesto: 621 });
    assert.deepEqual(desglosarIva(3500, 0), { base: 3500, impuesto: 0 });
  });

  it("pide receta para antibióticos, controlados y productos con la casilla", () => {
    assert.equal(requiereReceta({ clasificacion: "libre", requiereReceta: false }), false);
    assert.equal(requiereReceta({ clasificacion: "libre", requiereReceta: true }), true);
    assert.equal(requiereReceta({ clasificacion: "antibiotico", requiereReceta: false }), true);
    assert.equal(requiereReceta({ clasificacion: "controlado", requiereReceta: false }), true);
  });
});

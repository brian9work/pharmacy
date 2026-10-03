import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aCentavos, leerProducto, MENSAJES_PRODUCTO } from "./validacion-producto";

describe("aCentavos", () => {
  it("convierte pesos a centavos sin errores de punto flotante", () => {
    assert.equal(aCentavos("35.50"), 3550);
    assert.equal(aCentavos("19.99"), 1999);
    assert.equal(aCentavos("0.1"), 10);
    assert.equal(aCentavos("12"), 1200);
    assert.equal(aCentavos("$1,234.5"), 123450);
    assert.equal(aCentavos(" 7.05 "), 705);
  });

  it("rechaza lo que no es un monto válido", () => {
    for (const texto of ["", "abc", "-5", "1.234", "1.2.3", "1e3", "12,50.5x"]) {
      assert.equal(aCentavos(texto), null, texto);
    }
  });

  it("acepta hasta $1,000,000.00", () => {
    assert.equal(aCentavos("1000000"), 100_000_000);
    assert.equal(aCentavos("1000000.01"), null);
  });
});

const minimo = { nombre: "Paracetamol 500 mg", clasificacion: "libre", precio: "35.50", iva: "0" };

describe("leerProducto", () => {
  it("lee un producto mínimo con valores por omisión", () => {
    const r = leerProducto(minimo);
    assert.ok(r.ok);
    assert.deepEqual(r.datos, {
      codigoBarras: null,
      nombre: "Paracetamol 500 mg",
      sustancia: "",
      presentacion: "",
      laboratorio: "",
      categoria: null,
      clasificacion: "libre",
      precio: 3550,
      costo: null,
      iva: 0,
      stockMinimo: 0,
      ubicacion: "",
      refrigerado: false,
      activo: true,
    });
  });

  it("normaliza el código de barras a mayúsculas y quita espacios de las orillas", () => {
    const r = leerProducto({ ...minimo, codigoBarras: "  abc-1234 " });
    assert.ok(r.ok);
    assert.equal(r.datos.codigoBarras, "ABC-1234");
  });

  it("rechaza códigos de barras con espacios, muy cortos o muy largos", () => {
    for (const codigo of ["750 100", "123", "1".repeat(33), "750100#"]) {
      assert.deepEqual(leerProducto({ ...minimo, codigoBarras: codigo }), { ok: false, error: MENSAJES_PRODUCTO.codigo }, codigo);
    }
  });

  it("exige nombre y precio mayor a 0", () => {
    assert.deepEqual(leerProducto({ ...minimo, nombre: "  " }), { ok: false, error: MENSAJES_PRODUCTO.nombre });
    assert.deepEqual(leerProducto({ ...minimo, precio: "0" }), { ok: false, error: MENSAJES_PRODUCTO.precio });
    assert.deepEqual(leerProducto({ ...minimo, precio: "gratis" }), { ok: false, error: MENSAJES_PRODUCTO.precio });
  });

  it("acepta costo vacío (no se cambia) y rechaza costos inválidos", () => {
    const vacio = leerProducto({ ...minimo, costo: "" });
    assert.ok(vacio.ok);
    assert.equal(vacio.datos.costo, null);
    const cero = leerProducto({ ...minimo, costo: "0" });
    assert.ok(cero.ok);
    assert.equal(cero.datos.costo, 0);
    assert.deepEqual(leerProducto({ ...minimo, costo: "-3" }), { ok: false, error: MENSAJES_PRODUCTO.costo });
  });

  it("solo acepta IVA de 0 o 16 y las tres clasificaciones", () => {
    assert.deepEqual(leerProducto({ ...minimo, iva: "8" }), { ok: false, error: MENSAJES_PRODUCTO.iva });
    assert.deepEqual(leerProducto({ ...minimo, clasificacion: "otra" }), { ok: false, error: MENSAJES_PRODUCTO.clasificacion });
    const r = leerProducto({ ...minimo, iva: "16", clasificacion: "controlado" });
    assert.ok(r.ok);
    assert.equal(r.datos.iva, 16);
    assert.equal(r.datos.clasificacion, "controlado");
  });

  it("distingue categoría existente, nueva y ninguna", () => {
    const existente = leerProducto({ ...minimo, categoria: "7" });
    assert.ok(existente.ok);
    assert.deepEqual(existente.datos.categoria, { id: 7 });

    const nueva = leerProducto({ ...minimo, categoria: "nueva", categoriaNueva: " Vitaminas " });
    assert.ok(nueva.ok);
    assert.deepEqual(nueva.datos.categoria, { nueva: "Vitaminas" });

    assert.deepEqual(leerProducto({ ...minimo, categoria: "nueva", categoriaNueva: "" }), { ok: false, error: MENSAJES_PRODUCTO.categoria });
  });

  it("valida el stock mínimo como entero de 0 en adelante", () => {
    for (const valor of ["-1", "1.5", "diez"]) {
      assert.deepEqual(leerProducto({ ...minimo, stockMinimo: valor }), { ok: false, error: MENSAJES_PRODUCTO.minimo }, valor);
    }
    const r = leerProducto({ ...minimo, stockMinimo: "12" });
    assert.ok(r.ok);
    assert.equal(r.datos.stockMinimo, 12);
  });

  it("rechaza textos de más de 120 caracteres", () => {
    assert.deepEqual(leerProducto({ ...minimo, presentacion: "x".repeat(121) }), { ok: false, error: MENSAJES_PRODUCTO.largo });
  });

  it("lee refrigerado y el estado de la edición", () => {
    const r = leerProducto({ ...minimo, refrigerado: "on", activo: "off" });
    assert.ok(r.ok);
    assert.equal(r.datos.refrigerado, true);
    assert.equal(r.datos.activo, false);
    const activo = leerProducto({ ...minimo, activo: "on" });
    assert.ok(activo.ok);
    assert.equal(activo.datos.activo, true);
  });
});

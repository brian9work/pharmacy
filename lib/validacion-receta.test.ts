import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tipoReceta } from "./inventario";
import { MENSAJES_RECETA, validarReceta } from "./validacion-receta";

const HOY = "2026-10-03";
const receta = { medico: "Dr. Luis Gómez", cedula: "12345678", fecha: HOY, folio: "", retenida: false };

describe("tipoReceta", () => {
  const libre = { clasificacion: "libre" as const, requiereReceta: false };
  const conCasilla = { clasificacion: "libre" as const, requiereReceta: true };
  const antibiotico = { clasificacion: "antibiotico" as const, requiereReceta: true };
  const controlado = { clasificacion: "controlado" as const, requiereReceta: true };

  it("no pide receta si ningún producto la requiere", () => {
    assert.equal(tipoReceta([libre, libre]), null);
    assert.equal(tipoReceta([]), null);
  });

  it("pide la receta más estricta del carrito", () => {
    assert.equal(tipoReceta([libre, conCasilla]), "simple");
    assert.equal(tipoReceta([conCasilla, antibiotico]), "antibiotico");
    assert.equal(tipoReceta([antibiotico, controlado, libre]), "controlado");
  });
});

describe("validarReceta", () => {
  it("acepta una receta completa y la limpia", () => {
    assert.deepEqual(validarReceta({ ...receta, medico: "  Dr.  Luis   Gómez ", cedula: " ab-123 45 ", folio: " R-10 " }, "antibiotico", HOY), {
      ok: true,
      receta: { medico: "Dr. Luis Gómez", cedula: "AB12345", fecha: HOY, folio: "R-10", retenida: false },
    });
  });

  it("exige médico, cédula válida y fecha", () => {
    assert.deepEqual(validarReceta({ ...receta, medico: " " }, "simple", HOY), { ok: false, error: MENSAJES_RECETA.medico });
    assert.deepEqual(validarReceta({ ...receta, cedula: "" }, "simple", HOY), { ok: false, error: MENSAJES_RECETA.cedula });
    assert.deepEqual(validarReceta({ ...receta, cedula: "12" }, "simple", HOY), { ok: false, error: MENSAJES_RECETA.cedula });
    assert.deepEqual(validarReceta({ ...receta, cedula: "123#456" }, "simple", HOY), { ok: false, error: MENSAJES_RECETA.cedula });
    assert.deepEqual(validarReceta({ ...receta, fecha: "" }, "simple", HOY), { ok: false, error: MENSAJES_RECETA.fecha });
    assert.deepEqual(validarReceta({ ...receta, fecha: "2026-02-30" }, "simple", HOY), { ok: false, error: MENSAJES_RECETA.fecha });
  });

  it("rechaza fechas futuras y acepta las pasadas", () => {
    assert.deepEqual(validarReceta({ ...receta, fecha: "2026-10-04" }, "simple", HOY), { ok: false, error: MENSAJES_RECETA.futura });
    assert.ok(validarReceta({ ...receta, fecha: "2026-09-15" }, "simple", HOY).ok);
  });

  it("en controlados exige marcar la receta como retenida", () => {
    assert.deepEqual(validarReceta(receta, "controlado", HOY), { ok: false, error: MENSAJES_RECETA.retenida });
    assert.ok(validarReceta({ ...receta, retenida: true }, "controlado", HOY).ok);
    assert.ok(validarReceta(receta, "antibiotico", HOY).ok);
  });

  it("rechaza datos demasiado largos", () => {
    assert.deepEqual(validarReceta({ ...receta, medico: "x".repeat(121) }, "simple", HOY), { ok: false, error: MENSAJES_RECETA.largo });
    assert.deepEqual(validarReceta({ ...receta, folio: "x".repeat(41) }, "simple", HOY), { ok: false, error: MENSAJES_RECETA.largo });
  });
});

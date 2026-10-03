import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diasDelRango, moverRango, resolverRango, tituloRango } from "./periodos";

const HOY = "2026-10-03"; // sábado

describe("resolverRango", () => {
  it("sin parámetros muestra el mes actual", () => {
    assert.deepEqual(resolverRango({}, HOY), { periodo: "mes", ancla: HOY, desde: "2026-10-01", hasta: "2026-10-31" });
  });

  it("la semana va de lunes a domingo", () => {
    for (const fecha of ["2026-09-28", "2026-10-03", "2026-10-04"]) {
      const r = resolverRango({ periodo: "semana", fecha }, HOY);
      assert.equal(r.desde, "2026-09-28", fecha);
      assert.equal(r.hasta, "2026-10-04", fecha);
    }
  });

  it("respeta años bisiestos y el año completo", () => {
    assert.equal(resolverRango({ periodo: "mes", fecha: "2028-02-10" }, HOY).hasta, "2028-02-29");
    const anio = resolverRango({ periodo: "anio" }, HOY);
    assert.deepEqual([anio.desde, anio.hasta], ["2026-01-01", "2026-12-31"]);
    assert.equal(diasDelRango(anio), 365);
  });

  it("el rango personalizado se ordena y se limita a un año", () => {
    const invertido = resolverRango({ periodo: "rango", desde: "2026-10-10", hasta: "2026-10-01" }, HOY);
    assert.deepEqual([invertido.desde, invertido.hasta], ["2026-10-10", "2026-10-10"]);
    const largo = resolverRango({ periodo: "rango", desde: "2025-01-01", hasta: "2026-12-31" }, HOY);
    assert.equal(diasDelRango(largo), 366);
  });

  it("ignora periodos y fechas inválidos", () => {
    assert.equal(resolverRango({ periodo: "siglo" }, HOY).periodo, "mes");
    assert.equal(resolverRango({ periodo: "dia", fecha: "2026-02-30" }, HOY).desde, HOY);
    assert.equal(resolverRango({ periodo: "dia", fecha: "ayer" }, HOY).desde, HOY);
  });
});

describe("moverRango", () => {
  it("avanza y retrocede un periodo", () => {
    assert.deepEqual(moverRango(resolverRango({ periodo: "dia" }, HOY), 1), { periodo: "dia", fecha: "2026-10-04" });
    assert.deepEqual(moverRango(resolverRango({ periodo: "semana" }, HOY), -1), { periodo: "semana", fecha: "2026-09-21" });
    assert.deepEqual(moverRango(resolverRango({ periodo: "mes", fecha: "2026-01-31" }, HOY), 1), { periodo: "mes", fecha: "2026-02-01" });
    assert.deepEqual(moverRango(resolverRango({ periodo: "anio" }, HOY), -1), { periodo: "anio", fecha: "2025-01-01" });
  });

  it("un rango personalizado se mueve por su misma duración", () => {
    const r = resolverRango({ periodo: "rango", desde: "2026-10-01", hasta: "2026-10-10" }, HOY);
    assert.deepEqual(moverRango(r, 1), { periodo: "rango", desde: "2026-10-11", hasta: "2026-10-20" });
  });
});

describe("tituloRango", () => {
  it("nombra cada periodo en español", () => {
    assert.equal(tituloRango(resolverRango({ periodo: "dia" }, HOY)), "3 de octubre de 2026");
    assert.equal(tituloRango(resolverRango({ periodo: "semana" }, HOY)), "Semana del 28 sep al 4 oct 2026");
    assert.equal(tituloRango(resolverRango({}, HOY)), "Octubre de 2026");
    assert.equal(tituloRango(resolverRango({ periodo: "anio" }, HOY)), "Año 2026");
  });
});

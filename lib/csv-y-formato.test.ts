import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { celdaCsv, pesosCsv } from "./csv";
import { diasEntre, dinero, fechaLarga, horaEn, hoyEn, porcentaje } from "./formato";

describe("CSV", () => {
  it("neutraliza fórmulas que Excel ejecutaría", () => {
    assert.equal(celdaCsv("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
    assert.equal(celdaCsv("+52 55"), "'+52 55");
    assert.equal(celdaCsv("@cajero"), "'@cajero");
  });

  it("deja intactos los números negativos", () => {
    assert.equal(celdaCsv("-12.50"), "-12.50");
    assert.equal(celdaCsv(-3), "-3");
  });

  it("pone entre comillas lo que lleva comas, comillas o saltos de línea", () => {
    assert.equal(celdaCsv("Pérez, Ana"), "\"Pérez, Ana\"");
    assert.equal(celdaCsv("dijo \"hola\""), "\"dijo \"\"hola\"\"\"");
    assert.equal(celdaCsv("línea 1\nlínea 2"), "\"línea 1\nlínea 2\"");
    assert.equal(celdaCsv(null), "");
  });

  it("escribe pesos con dos decimales", () => {
    assert.equal(pesosCsv(3550), "35.50");
    assert.equal(pesosCsv(-1200), "-12.00");
  });
});

describe("formato", () => {
  it("dinero en pesos mexicanos", () => {
    assert.equal(dinero(3550), "$35.50");
    assert.equal(dinero(123456789), "$1,234,567.89");
  });

  it("fechas sin depender de la zona del servidor", () => {
    assert.equal(fechaLarga("2026-10-03"), "3 de octubre de 2026");
    assert.equal(diasEntre("2026-10-03", "2027-01-01"), 90);
    assert.equal(diasEntre("2028-02-28", "2028-03-01"), 2);
  });

  it("horas en la zona de la farmacia", () => {
    assert.equal(horaEn("2026-10-03T15:04:00Z", "America/Mexico_City"), "09:04");
    assert.equal(horaEn("2026-10-03T15:04:00Z", "America/Tijuana"), "08:04");
    assert.match(hoyEn("America/Mexico_City"), /^\d{4}-\d{2}-\d{2}$/);
  });

  it("porcentajes con un decimal", () => {
    assert.equal(porcentaje(0.1234), "12.3 %");
    assert.equal(porcentaje(0.5), "50 %");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crearDetector } from "./detector-codigos";

/** Teclea `texto` empezando en `inicio`, con `pausa` ms entre teclas, y luego Enter. */
function teclear(detector: ReturnType<typeof crearDetector>, texto: string, inicio: number, pausa: number, pausaEnter = pausa) {
  let tiempo = inicio;
  for (const key of texto) {
    detector({ key, tiempo });
    tiempo += pausa;
  }
  return detector({ key: "Enter", tiempo: tiempo - pausa + pausaEnter });
}

describe("detector de códigos de barras", () => {
  it("reconoce una lectura rápida que termina en Enter", () => {
    assert.equal(teclear(crearDetector(), "7501000000011", 1000, 8), "7501000000011");
  });

  it("ignora a una persona tecleando", () => {
    assert.equal(teclear(crearDetector(), "7501000000011", 1000, 150), null);
  });

  it("ignora un Enter que llega mucho después", () => {
    assert.equal(teclear(crearDetector(), "7501000000011", 1000, 8, 400), null);
  });

  it("ignora códigos de menos de 4 caracteres", () => {
    assert.equal(teclear(crearDetector(), "123", 1000, 5), null);
  });

  it("no se confunde con Shift (lectores que mandan mayúsculas)", () => {
    const detector = crearDetector();
    let tiempo = 0;
    for (const key of ["A", "Shift", "B", "1", "2", "3"]) {
      detector({ key, tiempo });
      tiempo += 5;
    }
    assert.equal(detector({ key: "Enter", tiempo }), "AB123");
  });

  it("se queda solo con la parte rápida si antes hubo tecleo humano", () => {
    const detector = crearDetector();
    detector({ key: "h", tiempo: 0 });
    detector({ key: "o", tiempo: 300 });
    assert.equal(teclear(detector, "7501000000028", 1000, 6), "7501000000028");
  });

  it("descarta la lectura si se usó Ctrl o Cmd", () => {
    const detector = crearDetector();
    detector({ key: "7", tiempo: 0 });
    detector({ key: "5", tiempo: 5 });
    detector({ key: "c", tiempo: 10, meta: true });
    detector({ key: "0", tiempo: 15 });
    assert.equal(detector({ key: "Enter", tiempo: 20 }), null);
  });

  it("reconoce dos lecturas seguidas", () => {
    const detector = crearDetector();
    assert.equal(teclear(detector, "7501000000011", 0, 5), "7501000000011");
    assert.equal(teclear(detector, "7501000000011", 500, 5), "7501000000011");
  });
});

// Distingue un lector de código de barras de una persona tecleando.
// El lector "escribe" el código en milisegundos y termina con Enter.
// Lógica pura (sin DOM) para poder probarla; la usa app/components/lector-codigos.ts.

/** Máximo entre dos caracteres de una lectura. Una persona tarda mucho más. */
export const PAUSA_MAXIMA_MS = 50;
export const LARGO_MINIMO = 4;

export interface Tecla {
  key: string;
  /** Milisegundos (performance.now()). */
  tiempo: number;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
}

/** Devuelve una función que recibe cada tecla y regresa el código cuando termina una lectura. */
export function crearDetector() {
  let lectura = "";
  let ultimo = Number.NEGATIVE_INFINITY;

  return function teclear({ key, tiempo, ctrl, meta, alt }: Tecla): string | null {
    if (key === "Shift") return null;

    if (key === "Enter") {
      const codigo = lectura;
      const seguido = tiempo - ultimo <= PAUSA_MAXIMA_MS * 2;
      lectura = "";
      return codigo.length >= LARGO_MINIMO && seguido ? codigo : null;
    }

    if (key.length !== 1 || ctrl || meta || alt) {
      lectura = "";
      return null;
    }

    lectura = tiempo - ultimo <= PAUSA_MAXIMA_MS ? lectura + key : key;
    ultimo = tiempo;
    return null;
  };
}

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EXTENSIONES = [".ts", ".tsx", "/index.ts"];

export async function resolve(especificador, contexto, siguiente) {
  let ruta = null;
  if (especificador.startsWith("@/")) {
    ruta = path.join(raiz, especificador.slice(2));
  } else if (/^\.\.?\//.test(especificador) && contexto.parentURL?.startsWith("file:") && !path.extname(especificador)) {
    ruta = path.resolve(path.dirname(fileURLToPath(contexto.parentURL)), especificador);
  }

  if (ruta) {
    for (const extension of EXTENSIONES) {
      if (existsSync(ruta + extension)) return siguiente(pathToFileURL(ruta + extension).href, contexto);
    }
  }
  return siguiente(especificador, contexto);
}

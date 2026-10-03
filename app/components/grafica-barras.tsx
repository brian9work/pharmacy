"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { dinero, dineroCorto } from "@/lib/formato";

export interface Barra {
  clave: string;
  /** Texto corto bajo la barra ("3", "oct"). */
  etiqueta: string;
  /** Texto completo para el globo y lectores de pantalla. */
  etiquetaLarga: string;
  /** Centavos. */
  valor: number;
  nota?: string;
}

const MAXIMO_ETIQUETAS = 8;

/** Escala con números redondos: 0, 2,500, 5,000… */
function escala(maximo: number) {
  if (maximo <= 0) return { tope: 100_000, marcas: [0, 50_000, 100_000] };
  const crudo = maximo / 4;
  const potencia = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= crudo) ?? crudo;
  const tope = Math.ceil(maximo / paso) * paso;
  const marcas: number[] = [];
  for (let v = 0; v <= tope + paso / 2; v += paso) marcas.push(v);
  return { tope, marcas };
}

/**
 * Gráfica de columnas de una sola serie (sin leyenda: el título dice qué es).
 * Cada columna responde al mouse y al teclado (flechas, Inicio, Fin).
 */
export function GraficaBarras({ etiqueta, barras }: { etiqueta: string; barras: Barra[] }) {
  const [activa, setActiva] = useState<number | null>(null);
  const [enfocable, setEnfocable] = useState(0);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  const { tope, marcas } = escala(Math.max(0, ...barras.map((b) => b.valor)));
  const salto = Math.max(1, Math.ceil(barras.length / MAXIMO_ETIQUETAS));
  const altura = (valor: number) => `${(valor / tope) * 100}%`;

  function mover(e: KeyboardEvent, i: number) {
    const destino =
      e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? barras.length - 1 : null;
    if (destino === null || destino < 0 || destino >= barras.length) return;
    e.preventDefault();
    setEnfocable(destino);
    botones.current[destino]?.focus();
  }

  const barra = activa === null ? null : barras[activa];
  const posicion = activa === null ? 0 : (activa + 0.5) / barras.length;
  const alineacion = posicion < 0.15 ? "translate-x-0" : posicion > 0.85 ? "-translate-x-full" : "-translate-x-1/2";

  return (
    <div className="flex gap-3">
      <div className="relative h-56 w-12 shrink-0 text-right text-[11px] text-muted" aria-hidden="true">
        {marcas.map((v) => (
          <span key={v} className="cifra absolute right-0 translate-y-1/2" style={{ bottom: altura(v) }}>
            {dineroCorto(v)}
          </span>
        ))}
      </div>

      <div className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-56" aria-hidden="true">
          {marcas.map((v) => (
            <div key={v} className="absolute inset-x-0 border-t border-hairline" style={{ bottom: altura(v) }} />
          ))}
        </div>

        <div role="group" aria-label={etiqueta} className="relative flex h-56 items-end gap-0.5">
          {barras.map((b, i) => (
            <button
              key={b.clave}
              ref={(nodo) => {
                botones.current[i] = nodo;
              }}
              type="button"
              tabIndex={i === enfocable ? 0 : -1}
              aria-label={`${b.etiquetaLarga}: ${dinero(b.valor)}${b.nota ? `, ${b.nota}` : ""}`}
              onPointerEnter={() => setActiva(i)}
              onPointerLeave={() => setActiva(null)}
              onFocus={() => {
                setActiva(i);
                setEnfocable(i);
              }}
              onBlur={() => setActiva(null)}
              onKeyDown={(e) => mover(e, i)}
              className="flex h-full min-w-0 flex-1 items-end justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span
                className={`block w-full max-w-6 rounded-t-[4px] transition-colors duration-150 ${activa === i ? "bg-accent-hover" : "bg-accent"}`}
                style={{ height: altura(b.valor) }}
              />
            </button>
          ))}
        </div>

        {barra && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute top-0 z-10 -translate-y-1/2 whitespace-nowrap rounded-xl bg-background px-3 py-2 text-[13px] ring-1 ring-hairline ${alineacion}`}
            style={{ left: `${posicion * 100}%` }}
          >
            <p className="font-semibold text-foreground">{dinero(barra.valor)}</p>
            <p className="text-muted">
              {barra.etiquetaLarga}
              {barra.nota ? ` · ${barra.nota}` : ""}
            </p>
          </div>
        )}

        <div className="mt-2 flex gap-0.5 text-[11px] text-muted" aria-hidden="true">
          {barras.map((b, i) => (
            <span key={b.clave} className="min-w-0 flex-1 whitespace-nowrap text-center">
              {i % salto === 0 ? b.etiqueta : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

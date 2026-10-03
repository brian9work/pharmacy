"use client";

import { useEffect, useEffectEvent } from "react";
import { puntoDeVenta } from "@/config/punto-de-venta";
import { crearDetector } from "@/lib/detector-codigos";

/** Quita el código que el lector alcanzó a escribir en un campo (también en campos de React). */
function quitarDelCampo(objetivo: EventTarget | null, codigo: string) {
  if (!(objetivo instanceof HTMLInputElement) || !objetivo.value.endsWith(codigo)) return;
  const asignar = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  asignar?.call(objetivo, objetivo.value.slice(0, -codigo.length));
  objetivo.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Llama a `alLeer` con cada código leído en cualquier parte de la página,
 * aunque el foco esté en otro campo o en un botón.
 */
export function useLectorCodigos(alLeer: (codigo: string) => void) {
  const leer = useEffectEvent(alLeer);

  useEffect(() => {
    const teclear = crearDetector();

    function alTeclear(e: KeyboardEvent) {
      const codigo = teclear({ key: e.key, tiempo: performance.now(), ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey });
      if (!codigo) return;
      // Que el Enter no active el botón enfocado ni envíe un formulario.
      e.preventDefault();
      e.stopPropagation();
      quitarDelCampo(e.target, codigo);
      leer(codigo);
    }

    // Fase de captura: llega antes que cualquier otro manejador de la página.
    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
  }, []);
}

let audio: AudioContext | null = null;

/** Pitido corto sin archivos de sonido. */
export function sonar(tipo: "ok" | "error") {
  if (!puntoDeVenta.sonido) return;
  try {
    audio ??= new AudioContext();
    const oscilador = audio.createOscillator();
    const volumen = audio.createGain();
    oscilador.type = tipo === "ok" ? "sine" : "square";
    oscilador.frequency.value = tipo === "ok" ? 1320 : 196;
    volumen.gain.value = 0.06;
    oscilador.connect(volumen).connect(audio.destination);
    oscilador.start();
    oscilador.stop(audio.currentTime + (tipo === "ok" ? 0.07 : 0.25));
  } catch {
    // Sin audio disponible: la venta sigue igual.
  }
}

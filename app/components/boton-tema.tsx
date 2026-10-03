"use client";

import { Icono } from "@/app/components/icono";
import { botonIcono } from "@/app/components/estilos";
import { textosComunes } from "@/app/components/contenido";

/** Cambia entre claro y oscuro y lo guarda en localStorage ("tema"). */
export function BotonTema() {
  function cambiar() {
    const raiz = document.documentElement;
    const actual =
      raiz.getAttribute("data-theme") ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const siguiente = actual === "dark" ? "light" : "dark";
    raiz.setAttribute("data-theme", siguiente);
    try {
      localStorage.setItem("tema", siguiente);
    } catch {}
  }

  // Los dos íconos se renderizan y el CSS muestra el que toca: así el
  // servidor y el navegador generan el mismo HTML.
  return (
    <button type="button" onClick={cambiar} className={botonIcono} aria-label={textosComunes.cambiarTema}>
      <span className="dark:hidden">
        <Icono nombre="luna" />
      </span>
      <span className="hidden dark:inline">
        <Icono nombre="sol" />
      </span>
    </button>
  );
}

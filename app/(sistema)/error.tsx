"use client";

import { botonPrincipal, tarjeta } from "@/app/components/estilos";
import { textosComunes } from "@/app/components/contenido";

export default function ErrorSistema({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className={`${tarjeta} mx-auto mt-10 max-w-lg p-8 text-center`}>
      <h1 className="text-2xl font-semibold tracking-tight">{textosComunes.error.titulo}</h1>
      <p className="mt-2 text-[17px] leading-7 text-muted">{error.digest ? textosComunes.error.texto : error.message}</p>
      <button type="button" onClick={() => retry()} className={`${botonPrincipal} mt-6`}>
        {textosComunes.error.reintentar}
      </button>
    </div>
  );
}

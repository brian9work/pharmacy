"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * Como useActionState, pero también devuelve `alEnviar` para usarlo en
 * `onSubmit`. Con `<form action>`, React 19 reinicia los campos al terminar:
 * un selector vuelve a su opción original (aunque ya se guardó otra) y un
 * error borra lo escrito. Úsalo en formularios de edición y de acceso;
 * deja `action` solo donde limpiar el formulario es lo que quieres.
 */
export function useFormulario<E>(accion: (estado: Awaited<E>, datos: FormData) => E | Promise<E>, inicial: Awaited<E>) {
  const [estado, enviar, enviando] = useActionState(accion, inicial);

  function alEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    startTransition(() => enviar(datos));
  }

  return { estado, enviar, alEnviar, enviando };
}

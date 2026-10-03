// Clases de los patrones repetidos. Usa estas en vez de inventar variantes.

const foco =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Una acción principal por pantalla. */
export const botonPrincipal = `inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-[17px] font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary ${foco}`;

export const botonSecundario = `inline-flex items-center justify-center gap-2 rounded-full border border-hairline px-5 py-2.5 text-[15px] font-medium transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40 ${foco}`;

/** Botón de solo ícono: 40×40 como mínimo, siempre con aria-label. */
export const botonIcono = `inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 ${foco}`;

export const enlace = `text-accent hover:underline ${foco} rounded-sm`;

export const campo =
  "block h-11 w-full min-w-0 rounded-2xl border border-hairline bg-background px-4 text-[17px] text-foreground placeholder:text-muted transition-colors focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";

export const etiquetaCampo = "mb-2 block text-[15px] font-medium";

export const ayudaCampo = "mt-2 text-[13px] leading-5 text-muted";

export const tarjeta = "rounded-3xl bg-surface p-6";

export const etiquetaSobreTitulo = "text-xs font-semibold uppercase tracking-wider text-muted";

/** Tabla dentro de una tarjeta: el contenedor se desplaza, la página no. */
export const contenedorTabla = "overflow-x-auto rounded-3xl bg-surface";
export const tabla = "w-full text-left text-[15px]";
export const celdaEncabezado = "px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted";
export const celda = "px-5 py-4 align-top";

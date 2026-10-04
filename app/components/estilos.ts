// Clases de los patrones repetidos. Usa estas en vez de inventar variantes.
//
// Ojo: no le agregues a una de estas un tamaño, relleno o letra que ya trae
// (por ejemplo `${campo} h-10 w-20`). En Tailwind gana la que quede después en
// el CSS, no la que escribas al final, y el resultado no es el que esperas.
// Para tamaños distintos usa la versión "Libre" y pon el tamaño completo.

const foco =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Una acción principal por pantalla. */
export const botonPrincipal = `inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-[17px] font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary ${foco}`;

const botonSecundarioLibre = `inline-flex items-center justify-center gap-2 rounded-full border border-hairline text-[15px] font-medium transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40 ${foco}`;
export const botonSecundario = `${botonSecundarioLibre} px-5 py-2.5`;
/** Para filas de tabla y barras de filtros. */
export const botonSecundarioChico = `${botonSecundarioLibre} px-4 py-2`;

/** Botón de solo ícono: 40×40 como mínimo, siempre con aria-label. */
export const botonIcono = `inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 ${foco}`;

export const enlace = `text-accent hover:underline ${foco} rounded-sm`;

/** Campo sin tamaño: agrégale alto, ancho, relleno y letra. */
export const campoLibre =
  "block min-w-0 rounded-2xl border border-hairline bg-background text-foreground placeholder:text-muted transition-colors focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";
export const campo = `${campoLibre} h-11 w-full px-4 text-[17px]`;

export const etiquetaCampo = "mb-2 block text-[15px] font-medium";

export const ayudaCampo = "mt-2 text-[13px] leading-5 text-muted";

/** Tarjeta sin relleno: agrégale el suyo. */
export const tarjetaLibre = "rounded-3xl bg-surface";
export const tarjeta = `${tarjetaLibre} p-6`;

export const etiquetaSobreTitulo = "text-xs font-semibold uppercase tracking-wider text-muted";

/** Tabla dentro de una tarjeta: el contenedor se desplaza, la página no. */
export const contenedorTabla = "overflow-x-auto rounded-3xl bg-surface";
export const tablaLibre = "w-full text-left";
export const tabla = `${tablaLibre} text-[15px]`;
export const celdaEncabezado = "px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted";
export const celda = "px-5 py-4 align-top";

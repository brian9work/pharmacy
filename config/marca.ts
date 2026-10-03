// Nombre y logo del sistema. Cambia estos valores y se actualizan en todas
// las pantallas, en la pestaña del navegador y en el ícono de la página.
//
// Logo: pon tu archivo en `public/marca/` (SVG o PNG cuadrado, mínimo 128 px)
// y escribe aquí su ruta, su ancho y su alto reales.

export const marca = {
  /** Nombre completo: aparece en el acceso y en la pestaña del navegador. */
  nombre: "Mi Farmacia",
  /** Versión corta para la barra lateral. Si el nombre es corto, repítelo. */
  nombreCorto: "Mi Farmacia",
  /** Frase bajo el nombre en la pantalla de acceso. */
  descripcion: "Punto de venta e inventario",
  logo: {
    src: "/marca/logo.svg",
    ancho: 64,
    alto: 64,
    /** `true` si el logo es de un solo color oscuro: se invierte en tema oscuro. */
    invertirEnOscuro: false,
  },
} as const;

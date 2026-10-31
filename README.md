# LaraFarma

Punto de venta e inventario de la farmacia LaraFarma: venta con lector de código de barras, ticket impreso, caja con corte, inventario por lote y caducidad, usuarios con permisos y reportes financieros.

Hecho con Next.js 16, React 19, Tailwind 4 y PostgreSQL (datos, cuentas y sesiones).

## Qué hace

- **Vender:** escaneas el código de barras y el producto entra al carrito. Al cobrar se imprime el ticket.
- **Receta obligatoria:** los productos marcados con "Requiere receta médica" (y siempre antibióticos y controlados) no se cobran sin capturar médico, cédula y fecha; los controlados, además, con la receta retenida.
- **Lotes y caducidad:** cada pieza sale del lote que caduca antes (FEFO). No se vende de lotes caducados ni bloqueados.
- **Caja:** apertura con fondo, cobro en efectivo, tarjeta o transferencia y corte por billetes y monedas. El efectivo esperado lo calcula la base.
- **Recibir mercancía:** entradas del proveedor con lote, caducidad y costo, también con el lector.
- **Inventario:** existencias, alertas de stock bajo y por caducar, y kardex (historial de movimientos) por producto.
- **Catálogo:** alta y edición de productos (con el lector para el código de barras), categorías y proveedores.
- **Usuarios y permisos:** administrador y empleado. Tú decides qué puede hacer el empleado.
- **Subir datos a la nube:** un botón en Configuración manda a Supabase lo que aún no está allá (ventas, entradas, productos, existencias) para que el administrador lo consulte desde cualquier lugar.
- **Reportes:** ventas, utilidad, márgenes, formas de pago, cajeros, categorías, productos y horas pico, por día, semana, mes, año o rango. Exportación a CSV.

## Inicio rápido

1. Instala dependencias:

   ```bash
   pnpm install
   ```

2. Copia `.env.example` como `.env` y pon la conexión a tu PostgreSQL (`DATABASE_URL`).
3. Carga `postgres/larafarma.sql` y crea el primer administrador: [docs/instalacion.md](docs/instalacion.md).
4. Arranca el servidor de desarrollo:

   ```bash
   pnpm dev
   ```

5. Entra a http://localhost:3000 con tu correo de administrador.

## Comandos

| Comando | Para qué |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Compilación de producción |
| `pnpm start` | Servir la compilación de producción |
| `pnpm lint` | Revisar el código |
| `pnpm probar` | Pruebas de la lógica (validaciones, lector, FEFO, periodos, CSV) |
| `pnpm probar:postgres` | Probar `postgres/larafarma.sql` y sus reglas de seguridad en un PostgreSQL temporal |
| `pnpm probar:subida` | Probar "Subir datos" de punta a punta (base local, base tipo Supabase y API de mentira) |
| `pnpm probar:base` | Lo mismo para la versión de Supabase (`supabase/migrations/`) |
| `pnpm probar:todo` | Todas las anteriores |

## Documentación

| Documento | Contenido |
|---|---|
| [Recorrido para el cliente](docs/recorrido-para-el-cliente.md) | El sistema pantalla por pantalla, en lenguaje sencillo, para presentarlo |
| [Funcionalidades](docs/funcionalidades.md) | Catálogo completo de lo que hace cada pantalla, las reglas de la base y lo que falta |
| [Guía del sistema](docs/guia-del-sistema.md) | Cómo funciona todo, en un solo documento: piezas, permisos, día a día, datos, seguridad, servidor y fallas comunes |
| [Presentación](docs/presentacion.md) | Presentación comercial: beneficios, cómo funciona y requisitos |
| [Instalación](docs/instalacion.md) | PostgreSQL, variables, primer administrador, impresora y lector |
| [Manual de uso](docs/manual-de-uso.md) | Cómo vender, cobrar, cerrar caja, recibir mercancía y leer reportes |
| [Arquitectura](docs/arquitectura.md) | Estructura del código y cómo viajan los datos |
| [Base de datos](docs/base-de-datos.md) | Tablas, funciones, vistas y migraciones |
| [Seguridad](docs/seguridad.md) | Reglas, permisos, llaves y límites conocidos |
| [Historial del proyecto](docs/historial.md) | Cómo se construyó, decisiones y lo que sigue |

## Personalizar

- **Nombre y logo:** [config/marca.ts](config/marca.ts) y `public/marca/`.
- **Punto de venta (sonido, ticket, ancho de papel):** [config/punto-de-venta.ts](config/punto-de-venta.ts).
- **Datos fiscales del ticket:** pantalla Configuración del sistema.
- **Colores y tipografía:** tokens en [app/globals.css](app/globals.css); reglas de diseño en [design.md](design.md).

# Historial del proyecto

Cómo se construyó el sistema, en el orden en que se pidió, con las decisiones de cada etapa.

## 1. Investigación (1 de octubre de 2026)

Se revisó qué necesita un buen sistema de farmacia en cinco frentes:

- **Normativa (COFEPRIS):** antibióticos con receta y controlados con receta retenida; responsable sanitario.
- **Inventario:** lote y caducidad, FEFO, kardex, mínimos, cuarentena.
- **Usuarios:** roles, permisos finos, bitácora.
- **Fluidez:** teclado primero, lector de códigos, búsqueda rápida.
- **Diseño:** claro, alto contraste, colores con significado.

La venta será solo en mostrador. Aun así, la regla de antibióticos aplica también ahí, por eso el sistema marca esos productos y avisa al cobrar.

## 2. Diseño e interfaces (1 de octubre)

Pedido: solo diseño y pantallas, con dos roles (administrador y empleado) y permisos que decide el administrador. Se usó `design.md` (sistema de diseño tipo Apple) como referencia y el proyecto quedó aparte de Sienetworks.

- Tokens de color claro y oscuro, más tres de estado (éxito, aviso, peligro) para inventario y caja.
- Pantallas: acceso, panel, vender, caja, inventario, detalle de producto, recibir mercancía, usuarios y permisos.
- Textos separados del marcado (`contenido.ts` por pantalla).
- Nombre y logo editables en `config/marca.ts`.
- Datos de ejemplo para ver las pantallas sin base de datos.

## 3. PostgreSQL (1 y 2 de octubre)

Se escribió el esquema completo en `db/`: tablas, disparadores que protegen el kardex y la caja, y vistas. Se probó en un PostgreSQL temporal (31 pruebas). Esta versión se conserva sin cambios, a petición del usuario.

## 4. Supabase (2 de octubre)

Pedido: base en Supabase, autenticación con Supabase y datos de la cuenta en la base. Sin modificar el esquema original y con reglas de seguridad.

- El esquema se adaptó en `supabase/migrations/`:
  - `usuarios` usa el id de `auth.users`.
  - Sesiones y contraseñas pasan a Supabase Auth.
  - RLS en todas las tablas y vistas con `security_invoker`.
- Ventas, caja, entradas y permisos pasaron a funciones de la base que revisan permisos y calculan lo sensible.
- Costos ocultos por privilegios de columna. Bitácora con disparadores.
- En la app:
  - `proxy.ts` para la sesión.
  - `lib/consultas.ts` contra Supabase.
  - Server Actions en cada pantalla.
  - Alta y bloqueo de usuarios con la clave de servicio solo en servidor.
  - Cambio obligatorio de la contraseña temporal.
- Mejoras para celular: barra inferior con el total en Vender y formularios en una columna.
- Se probó en un PostgreSQL que imita Supabase: 45 pruebas.

## 5. Lector, ticket, reportes y documentación (3 de octubre)

El usuario cargó el SQL y creó su administrador. Se verificó en su proyecto, solo con lecturas:

- 22 permisos, 1 administrador activo y datos de ejemplo cargados.
- Sin sesión, la base rechaza todo.

Pedidos nuevos:

- **Lector de código de barras.** Detector global por velocidad de tecleo, con pitidos. Funciona aunque el foco esté en otro campo y también en Recibir mercancía, donde el mismo producto seguido suma piezas.
- **Ticket al cobrar.** Se arma con lo guardado en la base, se imprime en 80 o 58 mm y se reimprime desde el panel. La pantalla **Configuración** captura los datos fiscales.
- **Reportes financieros.** Día, semana, mes, año o rango, comparación con el periodo anterior y utilidad con el costo real de cada lote. Incluyen formas de pago, cajeros, categorías, productos, horas pico, compras, mermas y exportación CSV. Migración `20261003120000_reportes.sql`.
- **Documentación** en `README.md` y `docs/`.
- Pruebas de la base dentro del repo (`pnpm probar:base`): 56 en total.

## 6. Alta de productos y pruebas (3 de octubre)

- **Nuevo producto y Editar producto.**
  - El código de barras se captura con el lector y te avisa si ya existe.
  - Muestra el desglose de IVA y el margen al momento.
  - Separa el permiso de editar del de cambiar precios.
  - Desactivar en vez de borrar.
- **Proveedores y categorías:** alta, edición y reactivación de productos inactivos.
- **Pruebas:**
  - 46 pruebas unitarias con `node:test`, sin instalar nada (`pnpm probar`).
  - 22 pruebas nuevas de reglas de productos en la base; 78 en total (`pnpm probar:base`).
- **Errores que encontraron las pruebas:**
  - El CSV ponía un apóstrofo a los números negativos y Excel los habría leído como texto.
  - El margen del detalle de producto se calculaba con IVA y no coincidía con Reportes.

## Pendientes en Supabase

- Apagar el registro público (**Allow new users to sign up**).

## Lo que sigue

En orden sugerido:

1. **Cancelaciones y devoluciones** con autorización de supervisor (permisos `ventas.cancelar` y `ventas.devolucion`).
2. **Retiros de efectivo, mermas, ajustes y bloqueo de lotes** desde pantalla (permisos ya definidos).
3. **Captura de recetas** al vender antibióticos y controlados (tabla `recetas` lista).
4. **Facturación CFDI 4.0** con un proveedor autorizado (PAC).
5. **Venta sin internet** (PWA con sincronización) y varias sucursales.
6. **Tipos generados de Supabase** (`supabase gen types`) para quitar las conversiones manuales en `lib/consultas.ts`.

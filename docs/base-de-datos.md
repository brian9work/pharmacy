# Base de datos

PostgreSQL 15 o superior. El esquema completo está en `postgres/larafarma.sql` (un solo archivo con tablas, reglas, funciones, reportes y datos iniciales).

Otras carpetas, como referencia: `supabase/migrations/` es la versión para Supabase (el mismo modelo con Supabase Auth) y `db/` la primera versión; ninguna de las dos la usa esta rama y `db/` no se modifica.

## Convenciones

- Dinero en **centavos** (`integer`): $35.50 = 3550.
- Precios **con IVA incluido**. `productos.iva` es 0 o 16.
- Fechas de calendario en `date`; momentos en `timestamptz`. "Hoy" se calcula en la zona de `negocio.zona_horaria` con `hoy_local()`.
- Nombres en español, en minúsculas y con guion bajo.

## Tablas

### Cuentas y permisos

| Tabla | Para qué |
|---|---|
| `roles` | `admin` y `empleado` |
| `permisos` | Catálogo de 22 permisos (clave, módulo, nombre, `solo_admin`) |
| `rol_permisos` | Qué permisos tiene el rol empleado (el admin los tiene todos) |
| `usuarios` | Cuenta: nombre, correo, hash bcrypt de la contraseña, rol, activo, `debe_cambiar_contrasena`, intentos fallidos, último acceso |
| `sesiones` | Sesiones abiertas: hash SHA-256 del token, vencimiento y cierre. La aplicación no la puede leer |
| `usuario_permisos` | Excepciones por persona (dar o quitar un permiso sin cambiar su rol) |
| `bitacora` | Quién hizo qué: accesos, cambios de usuarios, permisos, precios y ventas |

La aplicación no puede leer `hash_contrasena` (privilegios de columna) ni insertar usuarios: las altas y contraseñas pasan por funciones.

### Negocio y catálogo

| Tabla | Para qué |
|---|---|
| `negocio` | Una sola fila: razón social, RFC, dirección, teléfono, pie del ticket, zona horaria, días de aviso de caducidad |
| `categorias` | Categorías de producto |
| `productos` | Código de barras, nombre, sustancia, presentación, laboratorio, clasificación (libre, antibiótico, controlado), `requiere_receta`, precio, costo, IVA, mínimo, ubicación |
| `proveedores` | Proveedores |

### Inventario

| Tabla | Para qué |
|---|---|
| `lotes` | Número, caducidad, piezas, costo y estado (`disponible` o `cuarentena`) por producto |
| `movimientos_inventario` | Kardex: cada entrada y salida. Al insertar uno, un disparador actualiza las piezas del lote |
| `recepciones` | Entradas de mercancía (proveedor, factura, fecha, total) |
| `recepcion_partidas` | Renglones de cada entrada |

### Caja y ventas

| Tabla | Para qué |
|---|---|
| `cajas` | Cajas físicas (Caja 1…) |
| `turnos_caja` | Apertura y corte: fondo, efectivo esperado, contado, diferencia, conteo por denominación |
| `movimientos_caja` | Lo que entra y sale de cada turno (ventas, retiros, cancelaciones) |
| `ventas` | Ticket: folio consecutivo, turno, cajero, subtotal, IVA, total, estado |
| `venta_partidas` | Una fila por producto y lote vendido |
| `venta_pagos` | Forma de pago, monto, recibido |
| `recetas` | Receta de una venta: tipo (simple, antibiótico, controlado), médico, cédula, fecha, folio, si se retuvo y quién la capturó. Cada partida que la pedía guarda `receta_id` |

### Subir datos a la nube

| Tabla | Para qué |
|---|---|
| `sincronizaciones` | Historial de subidas: cuándo empezó y terminó, si salió bien, si quedó algo pendiente (`completa`) y el resumen. Solo la ve quien tiene `configuracion.editar` |

## Funciones (RPC)

Son la única forma de escribir ventas, caja, entradas y permisos. Todas revisan el permiso de quien llama.

| Función | Permiso | Qué hace |
|---|---|---|
| `iniciar_sesion(correo, contraseña)` | ninguno | Revisa la contraseña, cuenta los intentos y devuelve el token de sesión |
| `cerrar_sesion()` | sesión | Cierra la sesión del token actual |
| `cambiar_contrasena(actual, nueva)` | sesión | Cambia la propia y cierra las demás sesiones |
| `crear_usuario(nombre, correo, contraseña, rol)` | `usuarios.gestionar` | Alta con contraseña temporal |
| `restablecer_contrasena(usuario, temporal)` | `usuarios.gestionar` | Contraseña temporal nueva y cierre de sus sesiones |
| `crear_primer_admin(nombre, correo, contraseña)` | solo el dueño de la base | Primer administrador, con la tabla de usuarios vacía |
| `abrir_turno(fondo)` | `caja.abrir` | Abre la primera caja libre para quien llama |
| `cerrar_turno(contado, conteo)` | `caja.cerrar` | Cierra la caja propia y calcula el efectivo esperado |
| `registrar_venta(partidas, metodo, recibido, referencia, receta)` | `ventas.vender` | Toma precio e IVA del catálogo, exige la receta si algún producto la pide, asigna lotes FEFO y guarda venta, receta, partidas, pago, kardex y caja |
| `registrar_entrada(proveedor, factura, fecha, partidas)` | `inventario.entrada` | Crea o suma lotes, guarda la recepción y el kardex |
| `guardar_permisos_empleado(claves)` | `permisos.gestionar` | Reemplaza los permisos del empleado |
| `costos_productos()` | `inventario.costos` | Costo de cada producto |
| `reporte_ventas(desde, hasta)` | `reportes.ver` | Reporte del periodo y del periodo anterior |
| `exportar_ventas(desde, hasta)` | `reportes.ver` | Una fila por ticket para CSV |

Subir datos (permiso `configuracion.editar`):

| Función | Qué hace |
|---|---|
| `iniciar_sincronizacion()` | Empieza una subida (una a la vez) y dice desde cuándo mandar: desde el inicio de la última subida completa, con 10 minutos de colchón |
| `datos_para_subir(desde)` | Arma lo que se sube: catálogo y lotes completos, y entradas, cortes y ventas nuevos desde `desde`. Incluye costos |
| `terminar_sincronizacion(id, ok, resumen, error)` | Anota cómo salió. Solo una subida completa mueve el punto de partida |

La nube (Supabase) tiene las funciones que reciben: `mapa_usuarios`, `subir_catalogo` y `subir_operacion` (`supabase/migrations/20261031120000_subir_datos.sql`), que solo ejecuta la clave de servicio.

Apoyo: `usuario_actual() (dueño del token puesto en `larafarma.token`), `tiene_permiso(clave)`, `usuario_activo()`, `hoy_local()`, `zona_horaria()`. `resumen_ventas()` es interna: nadie la puede llamar directo.

## Vistas

Todas con `security_invoker`: respetan las reglas de quien consulta.

| Vista | Qué muestra |
|---|---|
| `permisos_efectivos` | Permisos de cada cuenta ya combinando rol y excepciones |
| `existencias` | Existencia vendible y total, y próxima caducidad por producto |
| `lotes_por_caducar` | Lotes con piezas que caducaron o caducan dentro del aviso |
| `kardex` | Movimientos con número de lote y nombre de quien los hizo |
| `ventas_de_hoy` | Ventas del día con cajero, forma de pago y piezas |
| `resumen_turnos` | Totales en vivo de cada turno (el efectivo esperado se oculta en corte ciego) |

## Reglas que la base cumple sola

- Un lote nuevo nace en 0 piezas y solo cambia con un movimiento. Nunca queda en negativo: si no alcanza, toda la venta se revierte.
- No se vende de lotes caducados ni en cuarentena.
- No se cobra un producto con `requiere_receta` sin médico, cédula y fecha (no futura). Si hay un controlado, la receta debe ir retenida. Antibióticos y controlados siempre tienen `requiere_receta` (un disparador lo fuerza).
- Merma y ajuste exigen motivo. Una entrada exige recepción y una venta exige ticket.
- Movimientos, partidas, pagos, recetas y bitácora no se editan ni se borran. Las ventas solo se cancelan, y un turno cerrado no cambia.
- Una caja abierta por persona y un turno abierto por caja. Solo se vende con un turno abierto propio.
- Cambiar precio o costo exige `productos.precios`; editar el resto (incluida la casilla de receta), `productos.editar`.
- Ningún empleado recibe permisos `solo_admin` y siempre queda un administrador activo.

## Cambiar el esquema

1. Para una base nueva, cambia `postgres/larafarma.sql`. Para una base que ya tiene datos, escribe además un archivo con solo el cambio (`alter table…`, `create or replace function…`) en `postgres/actualizaciones/` (por ejemplo `20261031_subir_datos.sql`) y ejecútalo como dueño de la base, con respaldo antes.
2. En cada tabla nueva: activa RLS, escribe sus reglas `to larafarma_app` y revisa qué privilegios necesita la aplicación.
3. En cada función nueva:
   - Usa `security definer` solo si de verdad necesita saltarse RLS, y entonces revisa el permiso dentro.
   - Ponle `set search_path = ''` y escribe los nombres completos (`public.tabla`).
   - Si la usa la aplicación, dale `grant execute … to larafarma_app`. Por omisión nadie la puede ejecutar.
4. Agrega pruebas a `postgres/pruebas/pruebas.sql` y corre `pnpm probar:postgres`.
5. Si agregas un permiso, ponlo también en `config/permisos.ts` con la misma clave.

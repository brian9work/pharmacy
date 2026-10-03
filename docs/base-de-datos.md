# Base de datos

PostgreSQL en Supabase. El esquema está en `supabase/migrations/`. La carpeta `db/` guarda la primera versión para PostgreSQL sin Supabase; se conserva como referencia y no se modifica.

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
| `usuarios` | Datos de la cuenta, con el mismo `id` que `auth.users`: nombre, correo, rol, activo, `debe_cambiar_contrasena`, último acceso |
| `usuario_permisos` | Excepciones por persona (dar o quitar un permiso sin cambiar su rol) |
| `bitacora` | Quién hizo qué: accesos, cambios de usuarios, permisos, precios y ventas |

El correo y la contraseña viven en Supabase Auth (`auth.users`). Si el correo cambia allá, un disparador lo copia a `usuarios`.

### Negocio y catálogo

| Tabla | Para qué |
|---|---|
| `negocio` | Una sola fila: razón social, RFC, dirección, teléfono, pie del ticket, zona horaria, días de aviso de caducidad |
| `categorias` | Categorías de producto |
| `productos` | Código de barras, nombre, sustancia, presentación, laboratorio, clasificación (libre, antibiótico, controlado), precio, costo, IVA, mínimo, ubicación |
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
| `recetas` | Receta ligada a una venta (lista para usarse) |

## Funciones (RPC)

Son la única forma de escribir ventas, caja, entradas y permisos. Todas revisan el permiso de quien llama.

| Función | Permiso | Qué hace |
|---|---|---|
| `registrar_acceso()` | cuenta activa | Guarda el último acceso y lo anota en la bitácora |
| `marcar_contrasena_cambiada()` | cuenta activa | Quita la marca de contraseña temporal |
| `abrir_turno(fondo)` | `caja.abrir` | Abre la primera caja libre para quien llama |
| `cerrar_turno(contado, conteo)` | `caja.cerrar` | Cierra la caja propia y calcula el efectivo esperado |
| `registrar_venta(partidas, metodo, recibido)` | `ventas.vender` | Toma precio e IVA del catálogo, asigna lotes FEFO, guarda venta, partidas, pago, kardex y caja |
| `registrar_entrada(proveedor, factura, fecha, partidas)` | `inventario.entrada` | Crea o suma lotes, guarda la recepción y el kardex |
| `guardar_permisos_empleado(claves)` | `permisos.gestionar` | Reemplaza los permisos del empleado |
| `costos_productos()` | `inventario.costos` | Costo de cada producto |
| `reporte_ventas(desde, hasta)` | `reportes.ver` | Reporte del periodo y del periodo anterior |
| `exportar_ventas(desde, hasta)` | `reportes.ver` | Una fila por ticket para CSV |

Apoyo: `tiene_permiso(clave)`, `usuario_activo()`, `hoy_local()`, `zona_horaria()`. `resumen_ventas()` es interna: nadie la puede llamar directo.

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
- Merma y ajuste exigen motivo. Una entrada exige recepción y una venta exige ticket.
- Movimientos, partidas, pagos, recetas y bitácora no se editan ni se borran. Las ventas solo se cancelan, y un turno cerrado no cambia.
- Una caja abierta por persona y un turno abierto por caja. Solo se vende con un turno abierto propio.
- Cambiar precio o costo exige `productos.precios`; editar el resto, `productos.editar`.
- Ningún empleado recibe permisos `solo_admin` y siempre queda un administrador activo.

## Cambiar el esquema

1. Crea una migración nueva en `supabase/migrations/` con fecha y hora en el nombre (`AAAAMMDDHHMMSS_descripcion.sql`). No edites las ya aplicadas.
2. En cada tabla nueva: activa RLS y escribe sus reglas.
3. En cada función nueva:
   - Usa `security definer` solo si de verdad necesita saltarse RLS, y entonces revisa el permiso dentro.
   - Ponle `set search_path = ''` y escribe los nombres completos (`public.tabla`).
   - Quita el permiso de ejecución a `public` y `anon`. Si es interna, quítaselo también a `authenticated`; Supabase se lo da por omisión.
4. Agrega pruebas a `supabase/pruebas/pruebas.sql` y corre `pnpm probar:base`.
5. Aplícala en Supabase (SQL Editor o `supabase db push`).
6. Si agregas un permiso, ponlo también en `config/permisos.ts` con la misma clave.

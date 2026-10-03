# Seguridad

Las reglas importantes viven en la base de datos, no solo en las pantallas. Aunque alguien se salte la interfaz y llame a Supabase directo con su sesión, la base aplica los mismos límites.

## Capas

| Capa | Qué protege |
|---|---|
| **Supabase Auth** | Contraseñas (nunca pasan por nuestras tablas), sesiones y límite de intentos |
| **`proxy.ts`** | Sin sesión válida no se ve ninguna pantalla; refresca la sesión en cada navegación |
| **Pantallas y Server Actions** | Revisan el permiso antes de mostrar o escribir; validan la forma de los datos |
| **Reglas RLS** | Cada consulta corre con la sesión de quien entró y ve solo lo permitido |
| **Funciones de la base** | Única vía para ventas, caja, entradas y permisos; revisan permisos y calculan lo sensible |
| **Privilegios** | `anon` no ve nada; `authenticated` no puede leer costos ni usar `TRUNCATE` |

## Cuentas

- Supabase Auth guarda correo y contraseña. `public.usuarios` guarda nombre, rol y estado con el mismo id.
- Una sesión válida de Supabase no basta: además hace falta una cuenta **activa** en `usuarios`. Sin ella, la base no devuelve nada y el sistema cierra la sesión.
- **Bloquear** una cuenta tiene efecto inmediato (las reglas revisan `activo` en cada consulta) y además la bloquea en Supabase Auth para que no pueda entrar ni renovar la sesión.
- Contraseñas temporales y nuevas de al menos 10 caracteres; la primera entrada obliga a cambiarla.
- El error de acceso es el mismo para correo inexistente o contraseña incorrecta: no revela qué cuentas existen.

## Permisos

- El **administrador** tiene todo. El **empleado** solo lo activado en **Permisos** (tabla `rol_permisos`).
- `usuarios.gestionar` y `permisos.gestionar` son **solo de administrador**: un disparador impide dárselos a otro rol o persona.
- Siempre debe quedar al menos un administrador activo.
- Lecturas:
  - Cada quien ve sus ventas y su caja. Las de todos piden `ventas.historial` y `caja.ver_todas`.
  - Los costos están ocultos por privilegios de columna; se leen con `costos_productos()` y el permiso `inventario.costos`.
  - La bitácora solo la ven quienes gestionan usuarios.

## Ventas y caja

- El navegador manda solo **qué productos y cuántas piezas**. Precio, IVA, lotes, totales y cambio los calcula `registrar_venta` en la base.
- **Receta obligatoria en la base:** aunque alguien se salte la pantalla, `registrar_venta` no cobra un producto que requiere receta sin médico, cédula y fecha, ni un controlado sin receta retenida.
- El efectivo esperado del corte lo calcula `cerrar_turno`, no quien cuenta. En **corte ciego** la base no lo envía mientras la caja está abierta.
- No se pueden insertar ventas, movimientos de caja ni de inventario directo en las tablas: no hay reglas que lo permitan.
- Historial inmutable: ventas, partidas, pagos, movimientos y bitácora no se editan ni se borran.

## Llaves

| Llave | Riesgo | Uso |
|---|---|---|
| Publishable (`NEXT_PUBLIC_…`) | Bajo: solo permite lo que dejan las reglas | Servidor y proxy. Verificado: no aparece en el código que se envía al navegador |
| Service role (`SUPABASE_SERVICE_ROLE_KEY`) | **Alto: se salta todas las reglas** | Solo `lib/supabase/admin.ts` (marcado `server-only`), para crear y bloquear cuentas tras revisar el permiso. Verificado: no aparece en el código del navegador |

Si la llave de servicio se filtra, cámbiala de inmediato en **Supabase → Project Settings → API** y actualiza `.env`.

## Otros cuidados

- Las respuestas con cookies de sesión no se guardan en caché.
- El CSV exportado protege las celdas contra fórmulas de Excel (`=`, `+`, `-`, `@`).
- Las funciones `security definer` fijan `search_path` vacío y usan nombres completos.
- Las funciones nuevas no quedan abiertas a `public` ni a `anon` por omisión.
- `robots: noindex`: el sistema no aparece en buscadores.

## Límites conocidos

- **Corte ciego parcial.** La pantalla y la vista ocultan el efectivo esperado, pero un empleado con conocimientos técnicos podría sumar sus propias ventas en efectivo consultando la base con su sesión.
- **Límite de intentos por IP del servidor.** El inicio de sesión pasa por el servidor, así que Supabase cuenta los intentos por la IP del servidor, no por la de cada cajero.
- **Registro público.** Debe estar apagado en Supabase ([instalación](instalacion.md#21-ajustes-de-autenticación)). Si queda encendido, cualquiera puede crearse una cuenta en Auth (sin acceso a datos).
- **Bloqueo de saldo de lotes.** La protección contra cambiar piezas sin movimiento evita errores de la aplicación, pero un usuario con acceso directo de administrador a la base (SQL Editor) puede saltársela.

## Pruebas

```bash
pnpm probar:base
```

Son 100 pruebas sobre un PostgreSQL que imita Supabase. Cubren:

- Sin sesión, sin cuenta en la farmacia y cuenta bloqueada.
- Empleado que intenta leer costos, cambiar precios, hacerse admin, insertar ventas o retiros directos, cambiar permisos o ver reportes.
- Ventas: FEFO, cambio, venta que no alcanza (se revierte completa), efectivo insuficiente.
- Corte ciego y corte que cuadra.
- Facturas repetidas y lotes caducados al recibir.
- Administrador: bitácora, último admin y reportes.
- Productos: alta solo con permiso, código repetido o inválido, IVA y precio inválidos, editar sin poder cambiar precio, nadie borra productos, producto inactivo no se vende, bitácora con precio de antes y después.

- Receta: venta sin receta, sin cédula, con fecha futura o de controlado sin retener (bloqueadas); ventas con receta simple, de antibiótico y de controlado; carrito mixto; antibióticos que siempre la piden.

Además, `pnpm probar` corre 54 pruebas de la lógica de la aplicación.

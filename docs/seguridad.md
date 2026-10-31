# Seguridad

Las reglas importantes viven en la base de datos, no solo en las pantallas. Aunque alguien se salte la interfaz y consulte la base directo con su sesión, la base aplica los mismos límites.

## Capas

| Capa | Qué protege |
|---|---|
| **Cuentas en la base** | Contraseñas con hash bcrypt, sesiones con token y espera tras 5 intentos fallidos |
| **`proxy.ts`** | Sin cookie de sesión no se ve ninguna pantalla |
| **Pantallas y Server Actions** | Revisan el permiso antes de mostrar o escribir; validan la forma de los datos |
| **Reglas RLS** | Cada consulta corre con la sesión de quien entró y ve solo lo permitido |
| **Funciones de la base** | Única vía para ventas, caja, entradas y permisos; revisan permisos y calculan lo sensible |
| **Privilegios** | La aplicación entra con el rol `larafarma_app`: no lee hashes, sesiones ni costos |

## Cuentas y sesiones

- `public.usuarios` guarda nombre, correo, rol, estado y el **hash bcrypt** de la contraseña (pgcrypto). La contraseña nunca se guarda ni se registra en la bitácora.
- **Iniciar sesión** (`iniciar_sesion`) genera un token aleatorio de 256 bits. Va en una cookie `httpOnly` (`secure` cuando hay HTTPS) y la base guarda solo su hash SHA-256. La sesión dura 12 horas.
- En cada consulta la aplicación pone el token con `set_config('larafarma.token', …, true)`, solo para esa transacción. `usuario_actual()` lo busca: sin token válido, vigente y de una cuenta activa, la base no devuelve nada. Inventar o reutilizar un token cerrado no sirve.
- **Bloquear** una cuenta cierra todas sus sesiones al instante (disparador) y ya no puede entrar.
- **Cambiar la contraseña** pide la actual y cierra las demás sesiones de la persona.
- Tras **5 intentos fallidos** la cuenta espera 15 minutos.
- Contraseñas de al menos 10 caracteres en la aplicación (8 en la base); la primera entrada obliga a cambiar la temporal.
- El error de acceso es el mismo para correo inexistente o contraseña incorrecta, y tarda lo mismo: no revela qué cuentas existen.

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

## Conexión a la base

| Usuario | Riesgo | Uso |
|---|---|---|
| Usuario de la aplicación (`DATABASE_URL`), miembro de `larafarma_app` | Medio: con la contraseña de la base cualquiera puede llamar `iniciar_sesion`, pero sin un token válido no ve datos | Solo el servidor (`lib/db/`, marcado `server-only`). Nunca va al navegador |
| Dueño de las tablas (`postgres`) | **Alto: se salta todas las reglas** | Solo para cargar el esquema y crear el primer administrador. La aplicación nunca lo usa |

Si la contraseña de la base se filtra, cámbiala (`\password larafarma_web` en psql) y actualiza `.env`.

## Subir datos a la nube

- El servidor local habla con Supabase con la **clave de servicio** (`SUPABASE_SERVICE_ROLE_KEY`). Esa clave se salta todas las reglas de Supabase: vive solo en `/etc/larafarma/larafarma.env` (lo lee solo root) y en `lib/nube.ts` (marcado `server-only`); nunca va al navegador.
- Las tres funciones de la nube (`mapa_usuarios`, `subir_catalogo`, `subir_operacion`) **solo las puede ejecutar la clave de servicio**: ni un administrador con sesión ni `anon` pueden. Está probado.
- El modo importación (`farmacia.importando`) se activa dentro de esas funciones, solo durante su transacción. Una venta nueva sobre un turno cerrado sigue bloqueada, y las ventas siguen sin poderse insertar directo.
- Subir solo **agrega** ventas y entradas: nada las modifica ni las borra en la nube. Catálogo y existencias sí los reemplaza lo local.
- En local, armar lo que se sube (incluye costos) pide el permiso `configuracion.editar`; solo un administrador lo tiene por omisión.
- Si la clave de servicio se filtra, cámbiala en **Supabase → Project Settings → API** y actualiza `larafarma.env`.

## Otros cuidados

- Las respuestas con cookies de sesión no se guardan en caché.
- El CSV exportado protege las celdas contra fórmulas de Excel (`=`, `+`, `-`, `@`).
- Las funciones `security definer` fijan `search_path` vacío y usan nombres completos.
- Las funciones nuevas no quedan abiertas a `public` por omisión. Las extensiones viven en su propio esquema (`extensiones`).
- `robots: noindex`: el sistema no aparece en buscadores.

## Límites conocidos

- **Corte ciego parcial.** La pantalla y la vista ocultan el efectivo esperado, pero un empleado con conocimientos técnicos podría sumar sus propias ventas en efectivo consultando la base con su sesión.
- **Intentos por cuenta, no por equipo.** La espera tras 5 intentos fallidos es de la cuenta: alguien que adivine correos puede hacer esperar a otra persona 15 minutos.
- **Quien tiene la contraseña de la base** (`DATABASE_URL`) puede intentar contraseñas sin pasar por la pantalla. Las reglas siguen aplicando, pero protege ese archivo.
- **La clave de servicio está en el servidor de la farmacia.** Quien entre a ese servidor como administrador del sistema (root) puede leerla. Protege el servidor y no la copies a otros lados.
- **Bloqueo de saldo de lotes.** La protección contra cambiar piezas sin movimiento evita errores de la aplicación, pero el dueño de la base (`postgres`) puede saltársela.

## Pruebas

```bash
pnpm probar:postgres
```

Son 60 pruebas sobre `postgres/larafarma.sql` en un PostgreSQL temporal. Cubren:

- Sin sesión: no se ve nada; no se leen sesiones ni hashes; un token inventado no sirve.
- Acceso: contraseña equivocada, correo inexistente (mismo mensaje), cambio obligatorio de la temporal, cambio con la actual equivocada.
- Alta de usuarios: correo repetido, rol inexistente, bitácora sin hashes.
- Venta: sin receta, controlado sin retener, venta con receta y cambio, insertar venta directo, reporte, CSV y corte.
- Empleado: costos, reportes, crear admin, hacerse admin.
- Bloqueo: cuenta bloqueada no entra y pierde la sesión; no se bloquea al último admin.
- Cerrar sesión y espera tras 5 intentos fallidos.
- Subir datos (lo local): solo con `configuracion.editar`, una subida a la vez, el punto de partida solo avanza con subidas completas, los productos van con costo y de las cuentas solo id y correo.

`pnpm probar:subida` prueba "Subir datos" de punta a punta (11 comprobaciones: lo pendiente por cuentas que faltan, no repetir, folios, existencias, costos, caja, cortes, reportes idénticos entre local y nube, clave mala y sin conexión). `pnpm probar:base` corre las 127 pruebas de la versión de Supabase, que incluyen que solo la clave de servicio ejecuta las funciones de subida, y `pnpm probar` las 61 de la lógica de la aplicación.

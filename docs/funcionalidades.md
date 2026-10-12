# Funcionalidades de LaraFarma

Catálogo completo de lo que hace el sistema, pantalla por pantalla. Cada apartado indica qué permiso hace falta. El administrador siempre tiene todos los permisos.

Para entender cómo encaja todo, lee primero la [Guía del sistema](guia-del-sistema.md). Para el paso a paso de uso, el [Manual de uso](manual-de-uso.md).

**Contenido**

1. [Acceso y cuenta](#1-acceso-y-cuenta)
2. [Panel](#2-panel)
3. [Vender](#3-vender)
4. [Receta obligatoria](#4-receta-obligatoria)
5. [Ticket](#5-ticket)
6. [Caja](#6-caja)
7. [Inventario](#7-inventario)
8. [Recibir mercancía](#8-recibir-mercancía)
9. [Productos](#9-productos)
10. [Proveedores y categorías](#10-proveedores-y-categorías)
11. [Reportes](#11-reportes)
12. [Usuarios](#12-usuarios)
13. [Permisos](#13-permisos)
14. [Configuración](#14-configuración)
15. [En toda la aplicación](#15-en-toda-la-aplicación)
16. [Reglas que cumple la base de datos](#16-reglas-que-cumple-la-base-de-datos)
17. [Listo en la base, sin pantalla todavía](#17-listo-en-la-base-sin-pantalla-todavía)
18. [Lo que el sistema no hace](#18-lo-que-el-sistema-no-hace)

---

## 1. Acceso y cuenta

*Todas las cuentas.*

- **Iniciar sesión** con correo y contraseña. El correo no distingue mayúsculas ni espacios.
- **Mismo mensaje** si el correo no existe o la contraseña es incorrecta: no revela qué cuentas existen.
- **Espera de 15 minutos** tras 5 intentos fallidos seguidos.
- **Contraseña temporal:** la primera vez, el sistema pide la temporal y una nueva (mínimo 10 caracteres, escrita dos veces). Al cambiarla se cierran las demás sesiones de esa persona.
- **Sesión de 12 horas.** Al vencer, el sistema regresa al acceso.
- **Cuenta bloqueada:** no puede entrar y, si estaba dentro, sale en su siguiente clic con el aviso "Tu cuenta está bloqueada".
- **Salir:** botón en el menú. Cierra la sesión también en la base.
- **Redirección automática:** sin sesión cualquier pantalla lleva al acceso; con sesión, el acceso lleva al Panel.

## 2. Panel

*Todas las cuentas. Cada tarjeta aparece según los permisos.*

- **Saludo** con el nombre de quien entró y botón **Nueva venta**.
- **Ventas de hoy:** total y número de tickets. Con "Ver todas las ventas" muestra las de todos; si no, solo las propias.
- **Lotes por caducar** en los próximos 90 días, con los días que faltan ("Caduca hoy", "Caducó hace 3 días").
- **Por surtir:** productos bajo el mínimo o agotados, con "hay X de Y mínimo".
- **Estado de tu caja:** abierta desde qué hora, o un botón para abrirla. El efectivo esperado se oculta mientras está abierta (corte ciego), salvo con "Ver cajas de otros".
- **Últimas ventas del día:** folio, hora, cajero, piezas, forma de pago y total. Cada folio abre el ticket para verlo o reimprimirlo.

## 3. Vender

*Permiso: Vender. Requiere caja abierta; sin ella, la pantalla manda a abrirla.*

**Agregar productos**
- **Lector de código de barras:** escanear agrega al carrito, esté donde esté el cursor. Distingue al lector del tecleo por la velocidad.
- **Pitido:** agudo si el producto entró y grave si hubo problema. Se apaga en `config/punto-de-venta.ts`.
- **Búsqueda** por nombre, sustancia o código, sin importar acentos (escribe "losartan" y encuentra "Losartán"). Muestra la existencia de cada resultado.
- **Teclado:** **F2** busca, **↑ ↓** elige, **Enter** agrega y **F9** cobra.
- **Avisos:** código que no existe o producto inactivo; producto sin existencia; "solo hay N piezas".

**Carrito**
- Sumar o restar piezas, escribir la cantidad o quitar el producto. **Vaciar** limpia la venta y también la receta capturada.
- Cada renglón muestra el **lote y la caducidad** de donde saldrá (el que caduca antes) y la marca **Por caducar** si aplica. Si toma de dos lotes, muestra ambos.
- No deja pasar de la existencia vendible.

**Cobrar**
- **Subtotal, IVA y total** al momento.
- **Forma de pago:** efectivo, tarjeta o transferencia.
- **Efectivo:** se escribe lo recibido (o se marca **Exacto**) y el sistema muestra el cambio o cuánto falta.
- **Receta obligatoria** cuando algún producto la pide (ver [sección 4](#4-receta-obligatoria)).
- **Cobrar (F9)** registra la venta. Precios, IVA, lotes y totales los calcula la base, no la pantalla.
- **Confirmación:** folio (V-000001…), total y cambio, con botones **Nueva venta** e **Imprimir ticket**. Escanear otro producto empieza la siguiente venta.
- **En celular:** barra inferior con el total y las piezas, y un botón para ver la venta.

## 4. Receta obligatoria

*Al vender.*

- **Cuándo se pide:** en productos marcados con **Requiere receta médica**, y siempre en antibióticos y controlados.
- **Datos:** médico, cédula profesional, fecha (no futura) y folio (opcional).
- **Controlados:** además hay que marcar **Retuve la receta original**.
- **Varios productos con receta:** se captura una vez y se aplica la más estricta (controlado > antibiótico > simple).
- **Sin receta completa, Cobrar no se activa.** F9 avisa qué falta y lleva el cursor al campo.
- **La base también lo exige:** aunque alguien se salte la pantalla, no se cobra sin receta.
- **Se guarda** ligada a la venta y a cada producto que la pedía. La cédula se guarda en mayúsculas.
- **Sale impresa en el ticket.**

## 5. Ticket

- **Se imprime solo al cobrar.** Se desactiva con `imprimirAlCobrar` en `config/punto-de-venta.ts`.
- **Papel de 80 o 58 mm,** blanco y negro en los dos temas.
- **Contenido:**
  - Encabezado: nombre de la farmacia, razón social, RFC, dirección y teléfono.
  - Venta: folio, fecha y hora, caja y quién atendió.
  - Productos: cantidad × precio e importe.
  - Totales: subtotal, IVA, total, pago, cambio y piezas.
  - Si hubo receta: médico, cédula, folio de la receta y "Retenida".
  - Pie: mensaje configurable y la leyenda "no es comprobante fiscal".
- **Armado con lo guardado en la base:** lo impreso es exactamente lo cobrado.
- **Reimpresión** desde el Panel (página `/ticket/…`). Solo la ve quien puede ver esa venta.
- **Impresión directa** sin cuadro de diálogo con Chrome en modo `--kiosk-printing` (lo configura el instalador del servidor).

## 6. Caja

*Permisos: Abrir su caja y Cerrar su caja.*

- **Abrir caja** con fondo inicial. El sistema asigna la primera caja libre.
- **Una caja abierta por persona** y una persona por caja.
- **Resumen del turno:** fondo, ventas en efectivo, con tarjeta y por transferencia, retiros y efectivo esperado.
- **Movimientos del turno:** hora, concepto, forma de pago y monto de cada venta.
- **Corte de caja:**
  - Conteo por denominación: billetes de $1,000 a $20 y monedas de $20 a 50 ¢.
  - El sistema suma el **efectivo contado** y muestra **Cuadra**, **Sobran** o **Faltan**.
  - El **efectivo esperado** lo calcula la base (fondo + efectivo del turno), no quien cuenta.
  - **Corte ciego:** el empleado ve el esperado solo al cerrar. Con "Ver cajas de otros" se ve siempre.
  - Se guarda el conteo por denominación. Un turno cerrado ya no cambia.

## 7. Inventario

*Permiso: Consultar inventario. Los costos piden "Ver costos y márgenes".*

**Lista**
- Todos los productos activos con **ubicación, existencia vendible, mínimo, próxima caducidad, precio** y, con permiso, **costo**.
- **Estados:** sin existencia, bajo mínimo, con lotes caducados, por caducar, lote bloqueado o "Correcto".
- **Filtros:** Todos, Por surtir, Por caducar y Con caducados.
- **Búsqueda** por nombre, sustancia o código.
- Accesos a **Recibir mercancía** y **Nuevo producto**.

**Detalle de producto**
- Código, laboratorio, categoría, ubicación y si es refrigerado.
- **Existencia vendible** (sin caducados ni bloqueados) contra el mínimo.
- **Precio** con IVA y, con permiso, **costo y margen** (calculado sobre el precio sin IVA).
- **Lotes** en el orden en que se venden: número, caducidad, días que faltan, piezas y estado (bloqueado o agotado).
- **Kardex:** cada entrada y salida con fecha, tipo, lote, piezas, usuario y referencia (factura o folio de venta).
- Botón **Editar producto**, según el permiso.

## 8. Recibir mercancía

*Permiso: Recibir mercancía.*

- **Documento:** proveedor (solo activos), factura o remisión y fecha de recepción (no futura).
- **Agregar productos** escaneando o buscando. **El mismo producto escaneado seguido suma piezas.**
- Por renglón: **lote, caducidad, piezas y costo unitario**. El costo se prellena con el del producto si quien recibe puede ver costos.
- **Avisos:** "Ya caducó: no lo recibas" y "Caduca en N días".
- **Resumen:** productos, piezas y total de la entrada.
- **Reglas de la base:** no se repite la factura del mismo proveedor ni se reciben lotes caducados. El lote se guarda en mayúsculas. Si el lote ya existía (mismo número y caducidad), suma piezas y actualiza su costo.
- Cada renglón queda en el **kardex** con la factura como referencia.

## 9. Productos

*Permisos: "Dar de alta productos" para crear; "Editar productos" para los datos; "Cambiar precios" para precio y costo.*

**Identificación**
- **Código de barras** escaneándolo con el lector o escrito. Es opcional y avisa al momento si ya es de otro producto, con enlace a ese producto.
- Nombre, sustancia activa, presentación y laboratorio.
- **Categoría:** una existente o una nueva escrita en el mismo formulario.

**Venta y precio**
- **Requiere receta médica** y el tipo: receta simple, antibiótico o controlado.
- **Precio de venta con IVA** e **IVA** 0 % (medicamentos) o 16 % (otros productos), con el desglose al momento.
- **Costo por pieza** y **margen** al momento.

**Inventario**
- **Stock mínimo** (abajo de él aparece en Por surtir), **ubicación** y **requiere refrigeración**.

**Edición**
- Solo se activan los campos que la persona puede cambiar; la base lo vuelve a revisar.
- **Desactivar en vez de borrar:** un producto inactivo no se vende ni aparece en inventario, pero su historial se conserva.
- Los cambios de precio y de datos quedan en la **bitácora** con el valor de antes y el de después.

## 10. Proveedores y categorías

*Permiso: Dar de alta productos.*

- **Proveedores:** alta y edición de nombre, RFC (validado), teléfono y correo. Un proveedor inactivo deja de aparecer al recibir mercancía.
- **Categorías:** alta y cambio de nombre.
- **Productos inactivos:** lista con acceso para editarlos y reactivarlos.
- Nombres repetidos se rechazan con un aviso.

## 11. Reportes

*Permiso: Ver reportes.*

**Periodo**
- Día, semana, mes, año o un rango propio (máximo un año).
- Flechas para ir al periodo anterior o siguiente y botón **Hoy**.
- Las fechas se calculan en la zona horaria de la farmacia.

**Indicadores** (cada uno comparado con el periodo anterior de la misma duración)
- **Ventas** (con IVA, sin canceladas).
- **Utilidad bruta** y **margen**.
- **Tickets** y ticket promedio.
- **Piezas vendidas.**

**Movimientos de dinero:** IVA cobrado, costo de lo vendido, compras recibidas, mermas y ventas canceladas.

**Gráficas** (cada una con su tabla equivalente)
- Ventas por día, o por mes en periodos largos.
- **¿A qué hora se vende más?**

**Desgloses**
- Formas de pago: monto, parte del total y número de pagos.
- Ventas por cajero: ventas, tickets y promedio.
- Ventas por categoría: ventas, utilidad, margen y piezas.
- Los 20 productos que más venden.

**Exportar ventas (CSV):** una fila por ticket con folio, fecha, hora, cajero, forma de pago, piezas, subtotal, IVA, total, costo, utilidad y estado. Abre bien en Excel, con acentos, y las celdas van protegidas contra fórmulas.

**¿Cómo se calcula?** La propia pantalla explica cada número. El costo de lo vendido usa el costo real del lote del que salió cada pieza.

## 12. Usuarios

*Solo administrador.*

- **Lista:** nombre, correo, rol, estado y último acceso ("Nunca" si no ha entrado). Tu propia cuenta aparece marcada con "Tú".
- **Nuevo usuario:** nombre, correo (puede ser interno, no se envía nada), contraseña temporal de 10 caracteres o más y rol. La persona la cambia al entrar.
- **Bloquear o activar** con un botón. El bloqueo saca a la persona al instante y cierra todas sus sesiones.
- **Protecciones:** no puedes bloquear tu propia cuenta y siempre debe quedar un administrador activo.
- Altas, bloqueos y cambios quedan en la **bitácora**.

## 13. Permisos

*Solo administrador.*

- Tabla con los **22 permisos** agrupados por módulo, cada uno con su descripción.
- La columna **Admin** aparece siempre activa; la columna **Empleado** tiene un interruptor por permiso.
- Los permisos de usuarios y permisos dicen **Solo admin** y no se pueden dar.
- Contador "El empleado tiene N de 22 permisos" y aviso de cambios sin guardar.
- **Guardar cambios** y **Restablecer**. Aplican desde la siguiente acción del empleado y quedan en la bitácora.
- **Por omisión, el empleado puede:** vender, abrir y cerrar su caja, consultar inventario y recibir mercancía.

## 14. Configuración

*Permiso: Editar configuración.*

- **Datos del ticket:** razón social, RFC (validado), dirección, teléfono y mensaje al pie.
- Los cambios salen en el siguiente ticket y quedan en la bitácora.
- Se ajustan en archivos, no en pantalla:
  - `config/marca.ts`: nombre del sistema y logo.
  - `config/punto-de-venta.ts`: pitido, imprimir al cobrar, ancho del ticket y leyenda.

## 15. En toda la aplicación

- **Menú lateral** que muestra solo lo que la persona puede usar. En celular se vuelve una barra horizontal arriba.
- **Tema claro y oscuro** con un botón.
- **Responsive:** funciona en computadora, tableta y celular.
- **Accesible:** se usa con teclado y con lector de pantalla, y cada gráfica tiene su tabla.
- **Formularios que conservan lo escrito** si hay un error.
- **Pantalla de error** con botón **Intentar de nuevo**.
- **No aparece en buscadores** (noindex).

## 16. Reglas que cumple la base de datos

Aunque alguien se salte la pantalla, la base de datos:

- **Calcula** precio, IVA, totales, cambio y efectivo esperado. No acepta esos valores de fuera.
- **Saca primero lo que caduca antes** (FEFO) y no vende de lotes caducados ni bloqueados.
- **Revierte la venta completa** si no alcanzan las piezas.
- **Exige la receta** y, en controlados, que se haya retenido.
- **No deja editar ni borrar** ventas, partidas, pagos, recetas, movimientos de caja e inventario, ni la bitácora. Las ventas se cancelan, no se borran.
- **Cambia las piezas de un lote solo con un movimiento** registrado en el kardex.
- **Oculta los costos** a quien no tiene "Ver costos y márgenes".
- **Muestra a cada quien solo sus ventas y su caja,** salvo con permiso.
- **Nunca da permisos de administrador** al empleado y siempre conserva un administrador activo.
- **Guarda las contraseñas como hash** (bcrypt) y las sesiones como hash del token. Nada de eso se puede leer desde la aplicación.
- **Calcula "hoy"** en la zona horaria de la farmacia.

## 17. Listo en la base, sin pantalla todavía

Estos permisos ya existen, pero sus funciones aún no tienen pantalla:

| Función | Permiso que ya existe |
|---|---|
| Cancelar una venta | Cancelar ventas |
| Registrar devoluciones | Registrar devoluciones |
| Aplicar descuentos | Aplicar descuentos |
| Retiros y entradas de efectivo | Retiros y entradas de efectivo |
| Ajustar existencias tras un conteo | Ajustar existencias |
| Registrar merma (caducado, dañado) | Registrar merma |
| Bloquear un lote (retiro sanitario) | Bloquear lotes |
| Restablecer la contraseña de alguien | Gestionar usuarios (la función `restablecer_contrasena` ya está en la base) |

**Mientras no haya pantalla para restablecer contraseñas,** el dueño de la base puede ponerle una temporal a una cuenta. La persona deberá cambiarla al entrar:

```sql
update public.usuarios
set hash_contrasena = extensiones.crypt('temporal-nueva-123', extensiones.gen_salt('bf', 10)),
    debe_cambiar_contrasena = true, intentos_fallidos = 0, bloqueado_hasta = null
where correo = 'persona@correo.com';
```

Se corre con `sudo -u postgres psql -d larafarmadb`.

## 18. Lo que el sistema no hace

- **Facturación electrónica (CFDI 4.0).** El ticket no es comprobante fiscal.
- **Venta en línea** o a domicilio.
- **Venta sin conexión al servidor.** Con el servidor en la farmacia basta la red local; no hace falta internet.
- **Varias sucursales** en una misma base.
- **Libro de recetas** como reporte. Las recetas sí se guardan y se pueden consultar en la base.
- **Respaldos automáticos.** Se hacen con `pg_dump` (ver [Guía del sistema → sección 8](guia-del-sistema.md#8-dónde-vive-cada-cosa-en-el-servidor)).

Lo que sigue, en orden sugerido: [Historial → Lo que sigue](historial.md#lo-que-sigue).

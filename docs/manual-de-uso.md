# Manual de uso

Cómo se usa el sistema en el día a día. Lo que ves en el menú depende de tus permisos.

## Entrar

- Entra con tu correo y contraseña.
- La primera vez, el sistema te pide cambiar la contraseña temporal que te dio el administrador (mínimo 10 caracteres).
- Si tu cuenta está bloqueada, no podrás entrar: habla con el administrador.
- **Salir** está abajo a la izquierda (arriba a la derecha en celular).

## Abrir caja

Antes de vender necesitas una caja abierta.

1. Ve a **Caja**.
2. Escribe el fondo inicial (el efectivo con el que empiezas para dar cambio).
3. Pulsa **Abrir caja**.

Cada persona tiene una sola caja abierta a la vez y cada caja la usa una sola persona.

## Vender con el lector

1. Ve a **Vender**.
2. **Escanea** el código de barras de cada producto. Escuchas un pitido agudo y el producto entra al carrito.
   - Escanear el mismo producto otra vez suma una pieza.
   - Un pitido grave significa que algo falló: el código no está en el catálogo o no hay existencia. El aviso dice cuál.
   - Funciona aunque el cursor esté en otro campo o botón.
3. Si no tienes el código a la mano, escribe parte del nombre o de la sustancia, elige con **↑ ↓** y agrega con **Enter**.
4. Ajusta cantidades con **−** y **+**, o quita un producto con **×**.
5. Si el carrito tiene productos con receta, aparece **Receta obligatoria**. Captura **médico**, **cédula profesional** y **fecha de la receta** (el folio es opcional). En controlados marca además **Retuve la receta original**. Mientras falte algo, **Cobrar** está desactivado y abajo se dice qué falta.

El carrito muestra de qué lote sale cada pieza (siempre el que caduca antes) y avisa si ese lote está por caducar.

### Cobrar

1. Elige la forma de pago: **Efectivo**, **Tarjeta** o **Transferencia**.
2. En efectivo, escribe lo que te dio el cliente (o pulsa **Exacto**). El sistema muestra el cambio.
3. Pulsa **Cobrar** o la tecla **F9**.

La base de datos vuelve a calcular precios, lotes y totales. Si algo cambió (por ejemplo, otra caja vendió las últimas piezas), te avisa y no cobra.

### Ticket

- Al cobrar se abre la impresión del ticket. Con Chrome en modo kiosco sale directo en la impresora ([instalación](instalacion.md#5-impresora-de-tickets)).
- **Imprimir ticket** lo vuelve a imprimir.
- Para reimprimir uno anterior: en **Panel → Últimas ventas**, pulsa el folio.
- Escanear el siguiente producto empieza otra venta.

El ticket lleva el nombre del negocio, razón social, RFC, dirección y teléfono (pantalla **Configuración**). Después vienen folio, fecha, caja, quién atendió, productos, subtotal, IVA, total, pago, cambio y piezas, y, si la venta llevó receta, médico, cédula, folio y si se retuvo.

### Atajos de teclado

| Tecla | Acción |
|---|---|
| F2 | Ir a la búsqueda |
| ↑ ↓ | Elegir resultado |
| Enter | Agregar el resultado elegido |
| F9 | Cobrar |
| Esc | Limpiar la búsqueda |

## Cerrar caja (corte)

1. Ve a **Caja → Cerrar caja**.
2. Cuenta el efectivo y escribe cuántos billetes y monedas hay de cada denominación. El sistema suma el total.
3. Pulsa **Cerrar caja**. Verás el contado, el esperado y la diferencia (cuadra, sobran o faltan).

**Corte ciego:** si no tienes el permiso **Ver cajas de otros**, no ves el efectivo esperado hasta cerrar. Así el conteo es honesto. El administrador sí lo ve.

## Recibir mercancía

1. Ve a **Recibir mercancía**.
2. Elige el proveedor y escribe la factura o remisión.
3. **Escanea** cada caja:
   - Un producto nuevo abre un renglón y pone el cursor en el lote.
   - El mismo producto escaneado seguido suma una pieza a ese renglón.
4. En cada renglón escribe lote, caducidad, piezas y costo unitario (el de la factura).
5. Pulsa **Guardar entrada**.

El sistema avisa si un lote caduca en menos de 180 días y no deja recibir lotes caducados ni repetir una factura del mismo proveedor.

## Inventario

- **Inventario** muestra cada producto con su existencia vendible, mínimo, próxima caducidad y alertas: sin existencia, stock bajo, por caducar (90 días), lote caducado o bloqueado.
- Filtra por **Por surtir**, **Por caducar** o **Con caducados**, o busca por nombre, sustancia o código.
- Al abrir un producto ves sus lotes y el **kardex**: cada entrada y salida con fecha, quién la hizo y su referencia.
- Los costos y márgenes solo los ve quien tiene el permiso **Ver costos y márgenes**.

## Reportes

**Reportes** necesita el permiso **Ver reportes**.

1. Elige el periodo: **Día**, **Semana** (lunes a domingo), **Mes**, **Año** o **Personalizado** (hasta un año).
2. Muévete con **‹ ›** o vuelve con **Hoy**.

Qué muestra:

| Bloque | Qué ves |
|---|---|
| Indicadores | Ventas, utilidad bruta y margen, tickets y ticket promedio, piezas; cada uno comparado con el periodo anterior |
| Movimientos de dinero | IVA cobrado, costo de lo vendido, compras recibidas, mermas, ventas canceladas |
| Gráfica | Ventas por día (por mes si el periodo pasa de dos meses). Pasa el mouse o usa las flechas para ver cada valor; **Ver los datos en tabla** muestra los números |
| Formas de pago y cajeros | Cuánto entró por cada forma de pago y cuánto vendió cada persona |
| Categorías y productos | Ventas, utilidad y margen; los 20 productos que más venden |
| Horas | A qué hora se vende más, para planear turnos |

**Exportar ventas (CSV)** descarga una fila por ticket con folio, fecha, hora, cajero, forma de pago, piezas, subtotal, IVA, total, costo, utilidad y estado. Se abre en Excel con acentos correctos.

La sección **¿Cómo se calcula?**, al final, explica cada número.

## Dar de alta productos

Necesitas el permiso **Dar de alta productos**.

1. Ve a **Nuevo producto** (también desde el botón en **Inventario**).
2. **Escanea la caja:** el código de barras se llena solo. Si ese código ya es de otro producto, te avisa y no deja guardar.
3. Escribe nombre (como lo busca el cajero), sustancia, presentación y laboratorio, y elige la categoría o crea una nueva.
4. Si el medicamento necesita receta, marca **Requiere receta médica** y elige el tipo: receta simple, antibiótico o controlado (receta retenida). Al venderlo, el sistema no dejará cobrar sin capturar la receta.
5. Escribe el **precio con IVA** y el IVA: 0 % para medicamentos, 16 % para lo demás. Debajo ves el desglose.
6. Opcional: **costo por pieza** (ves el margen al momento), stock mínimo, ubicación y si requiere refrigeración.
7. Pulsa **Guardar producto**. Después registra sus piezas con **Recibir mercancía** (el botón aparece al guardar).

### Editar o desactivar

En **Inventario**, abre el producto y pulsa **Editar producto**.

- **Editar productos** permite cambiar datos, categoría, clasificación, IVA, mínimo y estado.
- **Cambiar precios** permite cambiar precio y costo. Cada cambio de precio queda en la bitácora con el precio de antes y el de después.
- **Inactivo:** el producto deja de venderse y de aparecer en inventario; no se borra. Para reactivarlo: **Proveedores y categorías → Productos inactivos**.

## Proveedores y categorías

En **Proveedores y categorías** (mismo permiso que el alta de productos):

- **Proveedores:** agrega nombre, RFC, teléfono y correo. Pulsa un proveedor para editarlo o desactivarlo; los inactivos ya no aparecen en Recibir mercancía.
- **Categorías:** agrega o renombra.

## Usuarios y permisos (administrador)

- **Usuarios → Nuevo usuario:** nombre, correo, contraseña temporal y rol. El correo puede ser interno; no se le envía nada.
- **Bloquear / Activar:** quita o devuelve el acceso al instante. No puedes bloquearte a ti mismo y siempre queda al menos un administrador.
- **Permisos:** activa o desactiva lo que puede hacer el empleado y pulsa **Guardar cambios**. Gestionar usuarios y permisos es solo para administradores.

Permisos iniciales del empleado: vender, abrir y cerrar su caja, consultar inventario y recibir mercancía.

## Configuración (administrador)

En **Configuración** capturas razón social, RFC, dirección, teléfono y el mensaje al pie del ticket. El nombre y el logo del sistema se cambian en `config/marca.ts`.

## Lo que todavía no tiene pantalla

Por ahora se hacen desde el panel de Supabase (Table Editor) o están listos en la base pero sin pantalla:

- Cancelar ventas y registrar devoluciones.
- Retiros de efectivo, mermas, ajustes de inventario y bloqueo de lotes.

Ver [Historial → Lo que sigue](historial.md#lo-que-sigue).

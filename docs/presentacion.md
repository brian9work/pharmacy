# LaraFarma · Punto de venta para farmacias

**Vende más rápido, controla tu inventario por caducidad y sabe cuánto ganas, todos los días.**

> Antes de compartir este documento, agrega tus datos de contacto al final.

---

## El problema

En una farmacia de mostrador, el día se va en:

- **Filas en caja:** buscar el producto a mano, calcular el cambio, escribir notas.
- **Caducidades que se escapan:** cajas que caducan en el anaquel porque se vendió primero lo que llegó después.
- **Cortes que no cuadran:** sin saber si falta dinero, cuánto, ni en qué turno.
- **No saber cuánto se gana:** ventas sí, pero utilidad, márgenes y qué producto deja más, no.
- **Poco control del personal:** todos pueden hacer todo y no queda registro de quién cambió un precio.

## La solución

Un sistema en el navegador que une **caja, inventario y números del negocio**:

1. **Escaneas** y el producto entra al carrito.
2. **Cobras** con una tecla y sale el **ticket**.
3. El inventario se descuenta solo, **del lote que caduca primero**.
4. Al cerrar el turno, el sistema te dice si la caja **cuadra**.
5. Cuando quieras, ves **cuánto vendiste y cuánto ganaste** por día, semana, mes o año.

---

## Lo que ganas

### Ventas más rápidas en mostrador

- **Lector de código de barras:** escaneas y el producto entra al carrito con un pitido de confirmación. El mismo producto otra vez suma una pieza.
- **Funciona aunque el cursor esté en otro lado:** no hay que hacer clic en ningún campo antes de escanear.
- **Búsqueda por nombre o sustancia** cuando el producto no trae código: "amoxi" encuentra la amoxicilina.
- **Cobro con una tecla (F9):** efectivo con cálculo de cambio, tarjeta o transferencia.
- **Ticket impreso al cobrar,** en impresora térmica de 80 o 58 mm, con tus datos fiscales. Reimpresión cuando la necesites.
- **Funciona en computadora, tableta y celular.**

### Inventario que cuida tu dinero

- **Lote y caducidad en cada caja.** El sistema vende primero lo que caduca antes, sin depender de la memoria del cajero.
- **Nunca vende un lote caducado** ni uno que bloquees (por ejemplo, por un retiro del laboratorio).
- **Alertas a la vista:** productos por surtir, lotes por caducar (90 días) y lotes caducados.
- **Historial de cada producto:** cada entrada y salida con fecha, hora, quién la hizo y su factura o ticket.
- **Recepción de mercancía con el lector:** escaneas las cajas que llegan del proveedor y capturas lote, caducidad y costo.

### Caja que cuadra

- **Apertura con fondo** y corte por billetes y monedas: tú cuentas, el sistema suma.
- **El efectivo esperado lo calcula el sistema,** no quien cobra.
- **Corte ciego:** el cajero no ve cuánto debería haber hasta cerrar, así el conteo es honesto.
- **Resultado inmediato:** cuadra, sobran o faltan, y cuánto.

### Números claros del negocio

- **Reportes por día, semana, mes, año o el rango que elijas.**
- **Utilidad real:** ventas sin IVA menos el costo de lo que salió, calculado con el costo del lote de cada pieza.
- **Comparación automática** con el periodo anterior.
- **Desgloses:**
  - Formas de pago y ventas por cajero.
  - Ventas por categoría y los productos que más venden, con su margen.
  - Horas de más venta, para planear turnos.
  - IVA cobrado, compras recibidas, mermas y cancelaciones.
- **Exportación a Excel (CSV)** para tu contador.

### Control del personal

- **Dos roles:** administrador (todo) y empleado (solo lo que tú actives).
- **22 permisos que decides tú:** vender, abrir caja, ver costos, cambiar precios, ver reportes…
- **Cada quien con su cuenta.** Bloquear a alguien le quita el acceso al instante.
- **Bitácora:** quién entró, quién cambió un precio (con el precio de antes y el de después) y quién modificó permisos o usuarios.

### Pensado para farmacia

- **Receta obligatoria:** al dar de alta un medicamento marcas "Requiere receta médica". Al venderlo, el sistema **no deja cobrar** sin capturar médico, cédula profesional y fecha de la receta. Antibióticos y controlados la piden siempre; en controlados, además, hay que confirmar que se retuvo la receta original.
- **La receta queda guardada con la venta** y sale impresa en el ticket.
- **IVA correcto por producto:** 0 % en medicamentos y 16 % en lo demás, desglosado en el ticket.
- **Productos refrigerados** señalados.

> El sistema avisa y registra, pero no sustituye al responsable sanitario ni la revisión de la normativa de COFEPRIS que aplique a tu farmacia.

### Seguro y en la nube

- **Tus datos en una base de datos en la nube** (Supabase), no en una computadora que se puede descomponer.
- **Reglas de seguridad dentro de la base de datos:** aunque alguien intente saltarse la pantalla, la base no le deja ver costos, cambiar precios ni registrar ventas si no tiene permiso.
- **El historial no se borra:** ventas, movimientos de inventario y bitácora no se pueden editar ni eliminar.
- **Contraseñas** guardadas por el servicio de autenticación, nunca en las tablas del sistema.
- **Probado:** 154 pruebas automáticas de reglas de seguridad y de la lógica del sistema.

---

## Cómo funciona: un día en la farmacia

### Antes de abrir (una sola vez)

1. **Da de alta tus productos.** Escanea la caja y escribe nombre y precio con IVA. Si necesita receta, marca **Requiere receta médica** y elige si es receta simple, antibiótico o controlado. El costo es opcional, pero con él ves tu margen.
2. **Agrega a tus proveedores** y, si quieres, categorías (analgésicos, antibióticos, higiene…).
3. **Captura los datos de tu ticket:** razón social, RFC, dirección, teléfono y un mensaje al pie.
4. **Crea las cuentas de tu equipo** y decide qué puede hacer el empleado.

### Cuando llega mercancía

1. Abre **Recibir mercancía** y elige al proveedor.
2. Escribe el número de factura.
3. **Escanea cada caja.** Por cada producto anota lote, caducidad, piezas y costo.
4. Guarda. Las piezas quedan disponibles para vender.

El sistema avisa si un lote caduca pronto, no deja recibir lotes caducados y no deja capturar dos veces la misma factura.

### Al empezar el turno

1. Entra con tu correo y contraseña.
2. Ve a **Caja**, escribe el fondo inicial y abre tu caja.

### En el mostrador

1. **Escanea** cada producto. Si no tiene código, búscalo por nombre.
2. Si algún producto requiere receta, aparece **Receta obligatoria**: captura médico, cédula y fecha (y en controlados, confirma que retuviste la receta). Sin eso no se puede cobrar.
3. Elige **efectivo, tarjeta o transferencia**. En efectivo escribe cuánto te dieron y ve el cambio.
4. Pulsa **Cobrar** (o **F9**). Sale el ticket.
5. **Escanea el siguiente producto** y empieza la siguiente venta.

### Al terminar el turno

1. Ve a **Caja → Cerrar caja**.
2. Cuenta billetes y monedas y escribe cuántos hay de cada uno.
3. Pulsa **Cerrar caja**: el sistema te dice si cuadra, si sobra o si falta.

### Para el dueño o encargado

- **Panel:** ventas del día, lotes por caducar, productos por surtir y últimas ventas.
- **Inventario:** existencias, alertas e historial de cada producto.
- **Reportes:** elige el periodo y revisa ventas, utilidad, márgenes y horas de más venta. Exporta a Excel cuando lo pida tu contador.
- **Usuarios y Permisos:** crea cuentas, bloquea accesos y decide qué puede hacer el empleado.

---

## Lo que necesitas

| Equipo | Detalle |
|---|---|
| Computadora o tableta | Con Google Chrome actualizado |
| Internet | Estable. El sistema trabaja en línea |
| Lector de código de barras | USB o Bluetooth en modo teclado (el de fábrica en casi todos) |
| Impresora de tickets | Térmica de 80 o 58 mm, instalada en la computadora |

No se instala nada en la computadora: se usa desde el navegador.

## Puesta en marcha

1. **Configuración del servicio:** se crea tu base de datos y se publica el sistema en internet (Supabase y Vercel).
2. **Primer administrador:** se crea tu cuenta.
3. **Equipo:** se conecta el lector y se configura la impresora de tickets para imprimir directo.
4. **Catálogo:** das de alta tus productos y proveedores (escaneando cada caja).
5. **Inventario inicial:** registras las piezas que tienes con Recibir mercancía.
6. **Equipo de trabajo:** creas las cuentas de tus empleados y eliges sus permisos.
7. **A vender.**

La guía técnica paso a paso está en [instalacion.md](instalacion.md) y el manual de uso en [manual-de-uso.md](manual-de-uso.md).

---

## Lo que viene

| Función | Estado |
|---|---|
| Cancelaciones y devoluciones con autorización de supervisor | En preparación |
| Retiros de efectivo, mermas y ajustes de inventario desde pantalla | En preparación |
| Facturación electrónica (CFDI 4.0) | En preparación |
| Venta sin internet y varias sucursales | En preparación |

---

## Preguntas frecuentes

**¿Tengo que instalar algo?**
No. Se usa desde Chrome en la computadora, tableta o celular.

**¿Funciona sin internet?**
Todavía no: necesita conexión para cobrar. La venta sin internet está en preparación.

**¿Qué pasa si se descompone la computadora?**
Tus datos no se pierden: están en la nube. Entras desde otra computadora y sigues.

**¿Puedo ver mis ventas desde mi casa?**
Sí. Entras con tu cuenta desde cualquier navegador.

**¿Mis empleados pueden ver mis costos o cambiar precios?**
Solo si tú les das ese permiso. Si cambian un precio, queda registrado quién y cuándo.

**¿Hace facturas?**
Todavía no. El ticket indica que no es comprobante fiscal. La facturación electrónica está en preparación.

**¿Cuántos usuarios puedo tener?**
El sistema no pone límite de cuentas.

**¿Puedo poner mi logo y mi nombre?**
Sí: el nombre y el logo del sistema son tuyos, y el ticket lleva tu razón social, RFC, dirección y teléfono.

---

## Contacto

<!-- Agrega aquí nombre, teléfono, correo y sitio web. -->

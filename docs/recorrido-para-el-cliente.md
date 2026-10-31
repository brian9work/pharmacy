# LaraFarma · Recorrido por el sistema

**Todo lo que hace tu sistema de punto de venta, pantalla por pantalla.**

Este documento te muestra qué verás y qué podrás hacer en cada parte de LaraFarma, en el orden en que se usa en la farmacia.

---

## Contenido

1. [LaraFarma en una página](#1-larafarma-en-una-página)
2. [Quién puede hacer qué](#2-quién-puede-hacer-qué)
3. [Entrar al sistema](#3-entrar-al-sistema)
4. [Panel: el resumen del día](#4-panel-el-resumen-del-día)
5. [Vender](#5-vender)
6. [Receta médica obligatoria](#6-receta-médica-obligatoria)
7. [El ticket](#7-el-ticket)
8. [Caja: apertura y corte](#8-caja-apertura-y-corte)
9. [Inventario](#9-inventario)
10. [Recibir mercancía](#10-recibir-mercancía)
11. [Productos: alta y edición](#11-productos-alta-y-edición)
12. [Proveedores y categorías](#12-proveedores-y-categorías)
13. [Reportes](#13-reportes)
14. [Usuarios](#14-usuarios)
15. [Permisos](#15-permisos)
16. [Configuración](#16-configuración)
17. [Detalles que hacen la diferencia](#17-detalles-que-hacen-la-diferencia)
18. [Seguridad y respaldo de tu información](#18-seguridad-y-respaldo-de-tu-información)
19. [Equipo que necesitas](#19-equipo-que-necesitas)
20. [Lo que todavía no incluye](#20-lo-que-todavía-no-incluye)
21. [Preguntas frecuentes](#21-preguntas-frecuentes)

---

## 1. LaraFarma en una página

LaraFarma une **caja, inventario y números del negocio** en un solo sistema que se usa desde el navegador.

| Para… | LaraFarma hace… |
|---|---|
| **Vender más rápido** | Escaneas el código de barras y el producto entra al carrito. Cobras con una tecla y sale el ticket |
| **Cuidar tus caducidades** | Cada caja se registra con su lote y su caducidad. El sistema vende primero lo que caduca antes |
| **Cumplir con las recetas** | Los medicamentos que la requieren no se cobran sin capturar médico, cédula y fecha |
| **Cuadrar la caja** | El sistema calcula cuánto debe haber y te dice si cuadra, si sobra o si falta |
| **Saber cuánto ganas** | Ventas, utilidad y márgenes por día, semana, mes o año |
| **Controlar al personal** | Cada persona tiene su cuenta y tú decides qué puede hacer. Todo queda registrado |

### Las pantallas del sistema

El menú de la izquierda muestra a cada persona **solo lo que puede usar**:

| Pantalla | Para qué sirve |
|---|---|
| **Panel** | Resumen del día: ventas, alertas y últimas ventas |
| **Vender** | Punto de venta: escanear, cobrar e imprimir |
| **Caja** | Abrir caja, ver movimientos y hacer el corte |
| **Inventario** | Existencias, lotes, caducidades e historial |
| **Recibir mercancía** | Registrar lo que llega del proveedor |
| **Nuevo producto** | Dar de alta productos |
| **Proveedores y categorías** | Administrar los catálogos de apoyo |
| **Reportes** | Ventas, utilidad y movimientos del periodo |
| **Usuarios** | Cuentas del equipo |
| **Permisos** | Qué puede hacer el empleado |
| **Configuración** | Datos fiscales y mensaje del ticket |

---

## 2. Quién puede hacer qué

Hay dos tipos de cuenta:

| | Administrador | Empleado |
|---|---|---|
| **Qué puede hacer** | Todo, siempre | Solo lo que el administrador active |
| **Pensado para** | Dueño o encargado | Cajeros y personal de mostrador |

**Tú decides los permisos del empleado.** Son 22 y se activan o se quitan con un interruptor en la pantalla **Permisos**:

| Área | Ejemplos de lo que puedes dar o quitar |
|---|---|
| **Ventas** | Vender, aplicar descuentos, cancelar ventas, devoluciones, ver las ventas de todos |
| **Caja** | Abrir su caja, cerrar su caja, retiros de efectivo, ver las cajas de otros |
| **Inventario** | Consultar, recibir mercancía, ajustar existencias, registrar mermas, bloquear lotes, **ver costos** |
| **Productos** | Dar de alta, editar, **cambiar precios** |
| **Reportes** | Ver reportes |
| **Configuración** | Editar los datos del ticket |

Dos permisos son **solo del administrador**: gestionar usuarios y gestionar permisos. Nadie puede dárselos a un empleado, ni por error.

**Como punto de partida,** el empleado puede vender, abrir y cerrar su caja, consultar el inventario y recibir mercancía. Todo lo demás está apagado hasta que tú lo enciendas.

---

## 3. Entrar al sistema

### Inicio de sesión
- Cada persona entra con su **correo y su contraseña**.
- Si se equivoca, el mensaje es el mismo aunque el correo no exista: así nadie puede averiguar qué cuentas hay.
- Después de **5 intentos fallidos** la cuenta espera 15 minutos.
- La sesión dura **12 horas**. Después, el sistema pide entrar de nuevo.

### Primera vez: crear tu contraseña
Cuando el administrador crea una cuenta, le da una **contraseña temporal**. En la primera entrada, el sistema pide escribirla y elegir una nueva (mínimo 10 caracteres). La contraseña temporal deja de servir.

### Si alguien ya no debe entrar
El administrador **bloquea** la cuenta y la persona pierde el acceso **al instante**, aunque tenga el sistema abierto.

---

## 4. Panel: el resumen del día

Es la primera pantalla al entrar. Dice lo que necesitas saber para empezar el turno.

**Qué muestra**
- **Ventas de hoy** y número de tickets. El dueño ve las de todos; el cajero, las suyas.
- **Lotes por caducar** en los próximos 90 días, con los días que faltan ("Caduca hoy", "Caducó hace 3 días").
- **Productos por surtir:** los que están bajo su mínimo o agotados ("hay 8 de 20 mínimo").
- **Tu caja:** si está abierta desde qué hora, o un botón para abrirla.
- **Últimas ventas del día** con folio, hora, cajero, piezas, forma de pago y total.

**Qué puedes hacer**
- Empezar una **Nueva venta** con un clic.
- **Abrir un ticket** de cualquier venta del día para verlo o reimprimirlo.
- Ir al inventario directo desde las alertas.

> **Para qué te sirve:** antes de abrir sabes qué surtir y qué lotes mover primero, sin revisar anaqueles.

---

## 5. Vender

La pantalla donde se pasa el día. Está pensada para **no quitar las manos del lector**.

### Cómo se vende
1. **Escanea** el producto. Un pitido confirma que entró al carrito. No importa dónde esté el cursor.
2. Si lo escaneas otra vez, **suma una pieza**.
3. Si el producto no tiene código, **búscalo por nombre o sustancia** ("amoxi" encuentra la amoxicilina; no importan los acentos).
4. Elige la **forma de pago**: efectivo, tarjeta o transferencia.
5. En efectivo, escribe cuánto te dieron (o pulsa **Exacto**) y el sistema muestra el **cambio**.
6. Pulsa **Cobrar** o la tecla **F9**. Se imprime el ticket.
7. **Escanea el siguiente producto** y empieza otra venta.

### Qué ves en el carrito
- Cada producto con su **precio, cantidad e importe**.
- De **qué lote** va a salir y cuándo caduca. Si toma piezas de dos lotes, los muestra.
- La marca **Por caducar** cuando el lote está cerca de su fecha.
- **Subtotal, IVA y total** al momento.

### Teclas útiles

| Tecla | Hace |
|---|---|
| **F2** | Ir a buscar un producto |
| **↑ ↓** | Elegir entre los resultados |
| **Enter** | Agregar el producto elegido |
| **F9** | Cobrar |

### El sistema te cuida
- **No deja vender más piezas de las que hay.**
- **No vende de lotes caducados** ni bloqueados.
- **Avisa** si el código no existe, si el producto está inactivo o si no hay existencia.
- **Calcula todo en el sistema:** el precio, el IVA y el total no se pueden alterar desde la pantalla.
- **En celular** aparece una barra inferior con el total y las piezas.

### Al cobrar
Aparece la confirmación con el **folio** (V-000001, V-000002…), el total y el cambio, con botones para **imprimir otra vez el ticket** o empezar una **nueva venta**.

> **Para qué te sirve:** menos fila, menos errores de cambio y ningún precio equivocado.

---

## 6. Receta médica obligatoria

Los medicamentos que requieren receta **no se pueden cobrar sin capturarla**.

### Cómo se configura
Al dar de alta un producto marcas la casilla **Requiere receta médica** y eliges el tipo:

| Tipo | Qué significa |
|---|---|
| **Receta simple** | Se captura y se guarda con la venta |
| **Antibiótico** | Queda registrada como receta de antibiótico. Siempre la pide |
| **Controlado** | Además, hay que **retener la receta original**. Siempre la pide |

### Cómo funciona al vender
Si en el carrito hay un medicamento con receta, aparece el recuadro **Receta obligatoria**:

- **Médico** que receta
- **Cédula profesional**
- **Fecha** de la receta (no puede ser futura)
- **Folio** de la receta (opcional)
- En controlados: **"Retuve la receta original"**

Mientras falte algo, el botón **Cobrar** está apagado. Si pulsas **F9** con la receta incompleta, el sistema te dice qué falta y lleva el cursor al campo.

Si el carrito mezcla productos con y sin receta, se captura **una sola vez** y se aplica la más estricta.

### Qué queda guardado
- La receta queda **ligada a la venta** y a cada producto que la pedía.
- Sale impresa en el **ticket**: médico, cédula, folio y si se retuvo.
- Está protegida igual que el resto del historial: **no se puede editar ni borrar**.

> **Importante:** el sistema avisa y registra, pero no sustituye al responsable sanitario ni la revisión de la normativa de COFEPRIS que aplique a tu farmacia.

---

## 7. El ticket

- **Se imprime solo** al cobrar, en impresora térmica de 80 mm (también puede ser de 58 mm).
- **Puedes reimprimirlo** desde el Panel cuando quieras.

### Qué lleva
| Parte | Contenido |
|---|---|
| **Encabezado** | Nombre de la farmacia, razón social, RFC, dirección y teléfono |
| **Datos de la venta** | Folio, fecha, hora, caja y quién atendió |
| **Productos** | Cantidad × precio e importe de cada uno |
| **Totales** | Subtotal, IVA, total, forma de pago, cambio y piezas |
| **Receta** (si hubo) | Médico, cédula, folio de la receta y si fue retenida |
| **Pie** | Tu mensaje (horario, devoluciones, agradecimiento) |

El ticket se arma con lo que quedó guardado en el sistema: **lo impreso es exactamente lo cobrado**.

> El ticket indica que **no es comprobante fiscal**. La facturación electrónica aún no está incluida (ver [sección 20](#20-lo-que-todavía-no-incluye)).

---

## 8. Caja: apertura y corte

Cada venta queda ligada a la **caja y al turno** de quien la hizo. Sin caja abierta no se vende.

### Abrir caja
- Se escribe el **fondo inicial**: el efectivo con el que empieza el turno para dar cambio.
- Cada persona puede tener **una caja abierta** a la vez.

### Durante el turno
La pantalla muestra, en tiempo real:
- Fondo inicial
- Ventas en efectivo, con tarjeta y por transferencia
- Retiros
- Una lista con **cada movimiento**: hora, concepto, forma de pago y monto

### Corte de caja
1. El cajero **cuenta el efectivo** y escribe cuántos billetes y monedas hay de cada denominación: billetes de $1,000, $500, $200, $100, $50 y $20; monedas de $20, $10, $5, $2, $1 y 50 centavos.
2. El sistema **suma** el efectivo contado.
3. Al pulsar **Cerrar caja**, muestra el resultado:

| Resultado | Significa |
|---|---|
| **Cuadra** | El efectivo contado es igual al que debía haber |
| **Sobran $X** | Hay más efectivo del esperado |
| **Faltan $X** | Hay menos efectivo del esperado |

### Corte ciego
Mientras la caja está abierta, **el cajero no ve cuánto efectivo debería haber**. El sistema se lo muestra hasta que cierra. Así cuenta lo que realmente tiene, sin acomodar el conteo para que cuadre.

El efectivo esperado lo calcula el sistema: **fondo inicial + ventas en efectivo del turno**. Nadie lo escribe a mano. Un turno cerrado ya no se puede modificar.

> **Para qué te sirve:** sabes qué turno y qué persona tuvo diferencias, y de cuánto.

---

## 9. Inventario

Muestra qué tienes, cuánto, de qué lote y cuándo caduca.

### La lista
- Todos tus productos con **ubicación, existencia, mínimo, próxima caducidad y precio**. Con el permiso adecuado, también el **costo**.
- Un **estado** por producto:

| Estado | Significa |
|---|---|
| **Correcto** | Todo bien |
| **Sin existencia** | No hay piezas para vender |
| **Por surtir** | Está debajo de su mínimo |
| **Por caducar** | Tiene lotes que caducan en 90 días o menos |
| **Con caducados** | Tiene lotes que ya caducaron |
| **Lote bloqueado** | Hay un lote que no se puede vender |

- **Filtros** rápidos: Todos, Por surtir, Por caducar y Con caducados.
- **Búsqueda** por nombre, sustancia o código.
- Accesos directos a **Recibir mercancía** y **Nuevo producto**.

### El detalle de cada producto
Al abrir un producto verás:

- **Datos:** código, laboratorio, categoría, ubicación y si es refrigerado.
- **Existencia vendible** contra el mínimo (sin contar lo caducado ni bloqueado).
- **Precio** con IVA y, con permiso, **costo y margen**.
- **Lotes**, en el orden en que se venden: número, caducidad, días que faltan, piezas y estado.
- **Historial de movimientos:** cada entrada y salida con fecha, lote, piezas, **quién la hizo** y su referencia (factura o folio de venta).

### Cómo sale el producto: primero lo que caduca antes
Cuando vendes, el sistema toma las piezas del **lote que caduca primero** (método FEFO). Ya no depende de que el cajero se acuerde cuál caja está más al fondo.

> **Para qué te sirve:** menos producto tirado por caducidad y un historial para saber a dónde se fue cada pieza.

---

## 10. Recibir mercancía

Se usa cuando llega un pedido del proveedor.

### Paso a paso
1. Elige al **proveedor**, escribe la **factura o remisión** y la **fecha** de recepción.
2. **Escanea cada caja.** Si escaneas el mismo producto otra vez, suma piezas.
3. Para cada producto captura **lote, caducidad, piezas y costo** por pieza.
4. El sistema muestra el **total de la entrada**.
5. Pulsa **Guardar entrada**. Las piezas ya se pueden vender.

### Lo que el sistema revisa por ti
- **No deja recibir lotes ya caducados** ("Ya caducó: no lo recibas").
- **Avisa** cuando un lote caduca pronto.
- **No permite capturar dos veces la misma factura** del mismo proveedor.
- Si el lote ya existía, **suma las piezas** a ese mismo lote.
- Cada renglón queda en el **historial del producto** con la factura como referencia.

> **Para qué te sirve:** cada pieza entra con su lote y su caducidad desde el primer día. Sin esto, el inventario por lote no funciona.

---

## 11. Productos: alta y edición

### Dar de alta un producto
Es un formulario corto, en tres bloques:

**Identificación**
- **Código de barras:** lo escaneas con el lector. Si ya existe en otro producto, el sistema te avisa a quién pertenece y te lleva a verlo.
- Nombre, sustancia activa, presentación y laboratorio.
- **Categoría:** eliges una o creas una nueva ahí mismo.

**Venta y precio**
- **Requiere receta médica** y su tipo (ver [sección 6](#6-receta-médica-obligatoria)).
- **Precio de venta con IVA.** Al escribirlo, el sistema muestra el desglose: *"Sin IVA $X · IVA $Y"*.
- **IVA:** 0 % para medicamentos y 16 % para el resto.
- **Costo por pieza:** opcional, pero con él ves tu **margen** al instante.

**Inventario**
- **Stock mínimo:** abajo de este número aparece en "Por surtir".
- **Ubicación** (por ejemplo, "Anaquel A-01").
- **Requiere refrigeración.**

Las piezas **no se capturan aquí**: entran después con *Recibir mercancía*, para que cada una lleve su lote y su caducidad.

### Editar un producto
- Cambia cualquier dato. **Cada cambio de precio queda registrado**, con el precio de antes y el de después, quién lo hizo y cuándo.
- **Cambiar datos** y **cambiar precios** son permisos distintos: puedes dejar que alguien corrija un nombre sin poder tocar el precio.
- **Desactivar en vez de borrar:** un producto inactivo ya no se vende ni aparece en el inventario, pero su historial se conserva. Se puede reactivar cuando quieras.

---

## 12. Proveedores y categorías

Un solo lugar para los catálogos que usas al dar de alta productos y al recibir mercancía.

- **Proveedores:** nombre, RFC, teléfono y correo. Puedes **editarlos** y **desactivarlos** (un proveedor inactivo deja de aparecer al recibir mercancía).
- **Categorías:** agregar y cambiar el nombre (analgésicos, antibióticos, higiene…).
- **Productos inactivos:** la lista de los que desactivaste, con acceso para reactivarlos.
- El sistema **rechaza nombres repetidos** y valida el formato del RFC y del correo.

---

## 13. Reportes

Para saber cómo va el negocio, sin armar nada en Excel.

### Elegir el periodo
**Día, Semana, Mes, Año o un rango personalizado** (hasta un año). Con flechas pasas al periodo anterior o al siguiente, y con **Hoy** regresas.

### Lo primero que ves
Cada indicador se **compara con el periodo anterior** de la misma duración (por ejemplo, "12 % más que la semana pasada"):

| Indicador | Qué es |
|---|---|
| **Ventas** | Lo cobrado, con IVA, sin contar ventas canceladas |
| **Utilidad bruta** | Ventas sin IVA menos lo que costó lo vendido |
| **Margen** | Qué porcentaje de las ventas es utilidad |
| **Tickets** | Número de ventas y ticket promedio |
| **Piezas vendidas** | Unidades que salieron |

### Movimientos de dinero
IVA cobrado · Costo de lo vendido · Compras recibidas · Mermas · Ventas canceladas.

### Gráficas
- **Ventas por día** (o por mes en periodos largos).
- **¿A qué hora se vende más?** Útil para planear turnos y descansos.

Cada gráfica tiene su tabla con los mismos datos.

### Desgloses
- **Formas de pago:** cuánto entró en efectivo, tarjeta y transferencia.
- **Ventas por cajero:** ventas, tickets y promedio de cada persona.
- **Ventas por categoría:** con su utilidad y margen.
- **Productos que más venden:** los 20 principales, con su margen.

### Utilidad real, no aproximada
El costo de lo vendido se calcula **con el costo del lote del que salió cada pieza**. Si compraste el mismo producto a distinto precio en dos fechas, cada venta usa el costo que le corresponde.

### Exportar a Excel
El botón **Exportar ventas (CSV)** descarga una fila por ticket: folio, fecha, hora, cajero, forma de pago, piezas, subtotal, IVA, total, costo, utilidad y estado. Se abre directo en Excel, con acentos y todo. Es lo que le entregas a tu contador.

---

## 14. Usuarios

*Solo el administrador.*

### La lista
Nombre, correo, rol, estado (**Activo** o **Bloqueado**) y **último acceso** ("Nunca" si todavía no ha entrado). Tu propia cuenta aparece marcada.

### Crear un usuario
1. Escribes **nombre completo, correo** y una **contraseña temporal** de al menos 10 caracteres. Se la das en persona.
2. Eliges su **rol**: administrador o empleado.
3. La persona entra y el sistema le pide crear su propia contraseña.

El correo es solo el nombre con el que entra: **no se le envía nada**, así que puede ser uno interno.

### Bloquear o reactivar
Un botón por usuario. **Bloquear** saca a la persona del sistema al instante. Reactivarla le devuelve el acceso.

### Protecciones
- No puedes bloquear tu **propia cuenta**.
- Siempre debe quedar **al menos un administrador activo**.
- Quedan registradas todas las altas y bloqueos.

---

## 15. Permisos

*Solo el administrador.*

Una tabla con los **22 permisos**, agrupados por área, cada uno con su explicación. Para cada permiso hay un **interruptor** en la columna del empleado.

- Los permisos de **solo administrador** están marcados y no se pueden dar.
- Ves cuántos permisos tiene el empleado ("El empleado tiene 5 de 22 permisos") y cuántos **cambios sin guardar** llevas.
- Puedes **guardar los cambios** o **restablecer** lo que estaba.
- Los cambios aplican **desde la siguiente acción** del empleado, sin que tenga que volver a entrar.
- Queda registrado quién cambió los permisos y cuándo.

> **Para qué te sirve:** cada empleado hace lo que le corresponde. Por ejemplo, un cajero puede vender sin ver tus costos ni mover precios.

---

## 16. Configuración

*Solo quien tiene el permiso de editar configuración.*

Los datos que salen impresos en **cada ticket**:

- Razón social
- RFC (el sistema revisa que tenga el formato correcto)
- Dirección
- Teléfono
- **Mensaje al pie del ticket:** horario, política de devoluciones o un agradecimiento

Los cambios se ven en el siguiente ticket.

**Nombre y logo:** el nombre del sistema (LaraFarma) y el logo se personalizan en la instalación, junto con detalles del punto de venta: el pitido, imprimir al cobrar automáticamente, el ancho del papel (80 o 58 mm) y la leyenda del ticket.

---

## 17. Detalles que hacen la diferencia

- **Funciona en computadora, tableta y celular.** En pantallas pequeñas el menú pasa a una barra horizontal y la venta tiene su barra de total.
- **Tema claro y oscuro,** con un botón. Útil para mostradores con poca luz o mucho reflejo.
- **Se usa con teclado:** atajos para buscar, elegir y cobrar sin soltar el lector.
- **Accesible:** funciona con lectores de pantalla y cada gráfica trae su tabla.
- **Si algo falla al guardar,** el formulario conserva lo que escribiste.
- **Mensajes claros** en español, sin códigos técnicos.
- **Un lector, tres pantallas:** el mismo lector sirve para vender, recibir mercancía y dar de alta productos.

---

## 18. Seguridad y respaldo de tu información

### Quién ve qué
- Cada persona entra con **su propia cuenta** y ve solo lo que su permiso le deja.
- Los **costos están ocultos** para quien no tenga el permiso.
- Cada cajero ve **sus propias ventas y su propia caja**, salvo que le des permiso de ver las de todos.

### Reglas que el sistema no deja saltarse
La información está protegida dentro de la propia base de datos, no solo en las pantallas. Aunque alguien intente evitar la interfaz:

- **No puede cobrar** un medicamento con receta sin capturarla.
- **No puede cambiar precios** ni ver costos sin permiso.
- **No puede inventar totales:** el precio, el IVA, el cambio y el efectivo esperado los calcula el sistema.
- **No puede vender** de un lote caducado o bloqueado.

### El historial no se borra
**Ventas, recetas, movimientos de inventario, movimientos de caja y la bitácora no se pueden editar ni eliminar.** Una venta equivocada se cancela, no se borra.

### Bitácora
Queda registro de quién entró, quién cambió un precio (con el valor de antes y el de después), quién modificó permisos o usuarios y los cambios de configuración.

### Contraseñas
Se guardan **cifradas**: ni el administrador ni quien instala el sistema puede leerlas. Si alguien la olvida, se le asigna una temporal y la cambia al entrar.

### Tu información está en tu servidor
Los datos viven en una base de datos **PostgreSQL en tu propio servidor**, no en un tercero. Tú decides dónde se respalda.

### Respaldo
La base se respalda con una copia que se guarda **fuera del servidor** (una memoria USB o la nube). Recomendamos hacerlo **por lo menos una vez por semana**. Si el equipo se descompone, la farmacia vuelve a operar con esa copia. Los respaldos **no son automáticos por omisión**: se pueden programar para que se hagan solos.

---

## 19. Equipo que necesitas

| Equipo | Qué pedir |
|---|---|
| **Servidor** | Una computadora de la farmacia con Linux (Ubuntu o Linux Mint) que se queda encendida. En ella vive el sistema y la información |
| **Cajas** | Computadoras o tabletas con **Google Chrome**. No se instala nada: se abre la dirección del servidor |
| **Lector de código de barras** | USB, en modo teclado (el de fábrica en casi todos). Con base, para escanear sin apretar el gatillo |
| **Impresora de tickets** | Térmica de **80 mm**, con **corte automático** y con **puerto para caja de dinero**. USB |
| **Caja de dinero** | Para ticketera, con conector RJ11/RJ12 y 24 V. Se conecta a la impresora |
| **Red** | Las cajas se conectan al servidor por la red local de la farmacia |

### ¿Y si se va el internet?
Si el servidor está en la farmacia, **el sistema sigue funcionando**, porque las cajas se conectan por la red local. Internet no es necesario para vender.

### Caja de dinero
Si conectas una caja de dinero a la impresora, la caja se abre cuando se imprime el ticket (se configura una vez en la impresora al instalarla).

---

## 20. Lo que todavía no incluye

Te lo decimos desde ahora, para que sepas qué esperar:

| Función | Estado |
|---|---|
| **Facturación electrónica (CFDI 4.0)** | No incluida. El ticket no es comprobante fiscal |
| **Cancelaciones y devoluciones** desde pantalla | En preparación |
| **Retiros de efectivo, mermas y ajustes de inventario** desde pantalla | En preparación |
| **Aplicar descuentos** en la venta | En preparación |
| **Restablecer contraseñas** con un botón | En preparación (hoy lo hace quien administra la base) |
| **Libro de recetas** como reporte (las recetas sí se guardan) | En preparación |
| **Varias sucursales** en una misma base | No incluida |
| **Venta en línea o a domicilio** | No incluida |
| **Respaldos automáticos** | No vienen activados; se pueden programar aparte |

---

## 21. Preguntas frecuentes

**¿Tengo que instalar algo en cada caja?**
No. Solo se abre Chrome con la dirección del servidor. En el servidor se puede dejar que se abra solo al encender la computadora.

**¿Qué pasa si se descompone una caja?**
Nada se pierde: la información está en el servidor. Entras desde otra computadora y sigues.

**¿Qué pasa si se descompone el servidor?**
Se restaura la última copia de respaldo en otro equipo. Por eso es importante respaldar con regularidad.

**¿Mis empleados pueden ver mis costos o cambiar precios?**
Solo si tú les das el permiso. Si alguien cambia un precio, queda registrado quién, cuándo y de cuánto a cuánto.

**¿Puedo ver mis ventas desde mi casa?**
No viene activado: el sistema se usa dentro de la red de la farmacia. Se puede configurar el acceso desde fuera con una conexión segura, y se hace por separado.

**¿Hace facturas?**
Todavía no. El ticket indica que no es comprobante fiscal.

**¿Cuántos usuarios puedo tener?**
No hay límite de cuentas.

**¿Puedo cambiar el nombre y el logo?**
Sí. El sistema lleva el nombre de tu farmacia, y el ticket lleva tu razón social, RFC, dirección, teléfono y el mensaje que elijas.

**¿Qué pasa si alguien olvida su contraseña?**
Se le asigna una temporal y la cambia al entrar.

**¿Qué pasa si se vende un producto con el lote equivocado?**
No puede pasar: el sistema decide el lote (el que caduca antes). El cajero no lo elige.

**¿Cómo empiezo?**
1. Se instala el sistema y se conecta el equipo.
2. Se crea tu cuenta de administrador.
3. Das de alta tus productos y proveedores, escaneando cada caja.
4. Registras tu inventario inicial con *Recibir mercancía*.
5. Creas las cuentas de tu equipo y eliges sus permisos.
6. A vender.

---

## Contacto

<!-- Agrega aquí nombre, teléfono, correo y sitio web. -->

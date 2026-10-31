# Instalación

Guía para dejar el sistema funcionando desde cero: PostgreSQL, variables, primer administrador, impresora de tickets y lector de código de barras.

## 1. Requisitos

- Node.js 20.9 o superior y pnpm 10.
- PostgreSQL 15 o superior.
- Para las pruebas de la base (opcional): PostgreSQL instalado en la máquina donde las corras.

## 2. Base de datos

Todo está en un archivo: `postgres/larafarma.sql` (tablas, reglas, funciones, reportes y datos iniciales). Se carga una sola vez en una base vacía.

### 2.1 Cargar el archivo

Cárgalo con un superusuario (en Ubuntu, el usuario `postgres`). El archivo crea extensiones y el rol `larafarma_app`, y un usuario normal no puede.

```bash
sudo -u postgres psql -c "create database larafarma;"
```

```bash
sudo -u postgres psql -d larafarma -v ON_ERROR_STOP=1 < postgres/larafarma.sql
```

Debe terminar en `COMMIT`. Va en una sola transacción: si algo falla, no se guarda nada y puedes reintentar.

Datos de ejemplo (opcional): `supabase/seed.sql` también funciona aquí (16 productos y 20 lotes).

### 2.2 Usuario de la aplicación

La aplicación entra con un usuario que **no** es dueño de las tablas, para que se apliquen las reglas de seguridad:

```sql
create role larafarma_web login password 'una-contraseña-larga' in role larafarma_app;
```

Si ya tienes un usuario (por ejemplo `larafarmauser`), solo dale el rol: `grant larafarma_app to larafarmauser;`. No le des la propiedad de las tablas ni `CREATEROLE`.

### 2.3 Primer administrador

Como superusuario:

```sql
select public.crear_primer_admin('Tu nombre', 'tu@correo.com', 'contraseña-temporal');
```

Solo funciona con la tabla de usuarios vacía. Al entrar, el sistema pide cambiar la contraseña temporal. Los demás usuarios se crean desde la pantalla **Usuarios**.

## 3. Variables de entorno

Copia `.env.example` como `.env`:

| Variable | Qué es | Secreta |
|---|---|---|
| `DATABASE_URL` | Conexión con el usuario de la aplicación: `postgresql://larafarma_web:CONTRASEÑA@localhost:5432/larafarma` | **Sí** |

Si la contraseña lleva caracteres como `@`, `:` o `/`, escríbelos codificados (`@` → `%40`). Nunca subas el `.env` a git (ya está en `.gitignore`).

## 4. Correr el sistema

1. Instala dependencias:

   ```bash
   pnpm install
   ```

2. Arranca el servidor:

   ```bash
   pnpm dev
   ```

Abre http://localhost:3000 y entra con el administrador.

Para producción:

```bash
pnpm build
```

```bash
pnpm start
```

Para usarlo desde las cajas de la farmacia, abre `http://IP-DEL-SERVIDOR:3000` en cada equipo. En red local funciona por http; si lo publicas en internet, ponlo detrás de HTTPS (por ejemplo nginx con certificado) y la cookie de sesión se marca como segura sola.

## 4.1 Servidor de la farmacia (Ubuntu): arranque automático

`scripts/servidor/instalar.sh` deja el sistema listo en la computadora que hace de servidor:

- Compila el **build autónomo** (`output: "standalone"`): solo lo necesario para correr, sin el código fuente.
- Lo instala en `/opt/larafarma`. Solo root y el usuario del servicio pueden leerlo; las cuentas del escritorio (cajeros) no.
- Crea el servicio `larafarma` (systemd): arranca al prender la computadora, aunque nadie inicie sesión, y se reinicia solo si falla.
- Pasa `DATABASE_URL` a `/etc/larafarma/larafarma.env`, que solo lee root.
- Al iniciar sesión en el escritorio abre el sistema en Chrome o Chromium en modo aplicación, con impresión directa del ticket (`--kiosk-printing`). Si no hay Chrome usa Firefox, que pide confirmar cada impresión.

Desde la carpeta del proyecto, con tu usuario (no con `sudo`; el script pide la contraseña cuando la necesita):

```bash
bash scripts/servidor/instalar.sh
```

Para **actualizar**, ve a [Actualizar](#actualizar-desde-un-zip-de-github). La versión anterior queda siempre en `/opt/larafarma/app.anterior`.

Comandos útiles:

| Para | Comando |
|---|---|
| Ver si está corriendo | `systemctl status larafarma` |
| Ver errores | `sudo journalctl -u larafarma -n 50` |
| Reiniciar | `sudo systemctl restart larafarma` |
| Cambiar la conexión a la base | `sudo nano /etc/larafarma/larafarma.env` y reiniciar |
| Quitar el arranque automático | `sudo systemctl disable --now larafarma` y borrar `~/.config/autostart/larafarma.desktop` |

Las demás cajas solo abren `http://IP-DEL-SERVIDOR:3000` en Chrome; no necesitan instalar nada.

### Actualizar desde un zip de GitHub

No hace falta tener el repositorio ni git en el servidor.

1. En GitHub, con la rama `postgres` elegida: **Code → Download ZIP**. Queda en `Descargas` como `pharmacy-postgres.zip`.
2. Corre el script (con tu usuario, sin `sudo`). `actualizar.sh` está en `scripts/servidor/`; cópialo una vez a tu carpeta personal y úsalo desde ahí:

   ```bash
   bash ~/actualizar.sh
   ```

   Usa el `.zip` más reciente de `Descargas`. Si está en otro lado: `bash ~/actualizar.sh /ruta/al/archivo.zip`.
3. El script descomprime en una carpeta temporal, compila, instala y borra esa carpeta. La conexión a la base ya está en `/etc/larafarma`, así que no necesita `.env`. Necesita `unzip` (`sudo apt install unzip`) y internet para bajar las dependencias.
4. Borra el `.zip` de `Descargas`.

Si el nuevo build no arranca, vuelve a la versión anterior:

```bash
sudo systemctl stop larafarma && sudo rm -rf /opt/larafarma/app && sudo mv /opt/larafarma/app.anterior /opt/larafarma/app && sudo systemctl start larafarma
```

**Cambios en la base de datos.** El script actualiza la aplicación, no la base. Si una actualización necesita cambios en las tablas o funciones, vendrá con un archivo SQL aparte y se aplica como `postgres` **antes** de actualizar la aplicación:

```bash
sudo -u postgres psql -d larafarmadb -v ON_ERROR_STOP=1 < cambio.sql
```

Haz un respaldo antes: `sudo -u postgres pg_dump larafarmadb > ~/respaldo-$(date +%F).sql`.

## 4.2 Subir datos a la nube (Supabase)

La farmacia vende en el servidor local. En la nube, el administrador solo **consulta** ventas, reportes e inventario. El botón **Configuración → Subir datos** manda a Supabase lo que aún no está allá. Se puede pulsar las veces que quieras (por ejemplo al cerrar el día): lo que ya subió no se duplica.

**Qué sube:** categorías, proveedores, productos (con costos), lotes y su existencia, entradas de mercancía, cortes de caja, ventas con sus pagos y recetas, y los movimientos de inventario y de caja. **Qué no sube:** usuarios, contraseñas ni la bitácora.

**Cómo se reconcilia:**
- Ventas y entradas solo se **agregan**. Conservan su folio y su fecha.
- Catálogo y existencias: lo **local manda**. Si en la nube cambias un precio o una existencia, la siguiente subida lo reemplaza. Por eso en la nube no se vende ni se edita el inventario.
- El mismo producto se reconoce por su código de barras; las categorías y proveedores, por su nombre.
- Las ventas se emparejan con las cuentas por **correo**: cada cajero debe tener en la nube una cuenta con el mismo correo (se crea desde **Usuarios** de la nube). Si falta alguna, esas ventas esperan y el botón dice qué correo crear; al volver a subir, suben solas.

### Preparar (una sola vez)

1. **En Supabase**, SQL Editor: ejecuta `supabase/migrations/20261031120000_subir_datos.sql`. Crea tres funciones que solo puede ejecutar la clave de servicio.
2. **En la base local**, si ya estaba instalada (como `postgres`, con respaldo antes; una instalación nueva ya lo trae):

   ```bash
   sudo -u postgres pg_dump larafarmadb > ~/respaldo-$(date +%F).sql
   ```

   ```bash
   sudo -u postgres psql -d larafarmadb -v ON_ERROR_STOP=1 < postgres/actualizaciones/20261031_subir_datos.sql
   ```

3. **En el servidor**, agrega las llaves de Supabase (Project Settings → API; la clave es la `service_role`, la secreta):

   ```bash
   sudo nano /etc/larafarma/larafarma.env
   ```

   ```
   SUPABASE_URL=https://TU-PROYECTO.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=la-clave-secreta
   ```

   ```bash
   sudo systemctl restart larafarma
   ```

4. **En la nube**, crea las cuentas de los cajeros con el mismo correo que en local.
5. Entra a **Configuración → Subir datos**. La primera vez tarda más porque sube todo el catálogo.

Si algo falla, el botón lo explica (sin internet, clave incorrecta, falta ejecutar la migración…) y puedes volver a intentar. El historial de subidas queda en la tabla `sincronizaciones`.

Si en tu computadora de desarrollo tienes el `.env` con las llaves reales de Supabase, **"Subir datos" sube a tu Supabase real**. Para probar sin riesgo usa `pnpm probar:subida`, que no toca nada tuyo.

## 4.3 Publicar en Vercel

Vercel no puede llegar a un PostgreSQL que solo existe en tu red local. Para publicarlo ahí, la base debe estar en un servidor accesible por internet (con SSL) y `DATABASE_URL` debe apuntar a ella en **Settings → Environment Variables**.

Los servidores de Vercel trabajan en UTC. No importa: "hoy", las horas del ticket y los reportes usan la zona de la farmacia (`negocio.zona_horaria`).

## 5. Impresora de tickets

El ticket se imprime con la impresión normal del navegador. Mide 80 mm de ancho (o 58 mm, en `config/punto-de-venta.ts`).

1. Instala la impresora térmica en el sistema operativo con su controlador.
2. En las preferencias de la impresora, elige el papel de rollo de 80 mm (o 58 mm) y márgenes en 0.
3. La primera vez que cobres, en el cuadro de impresión de Chrome elige esa impresora, márgenes **Ninguno** y desactiva **Encabezados y pies de página**. Chrome recuerda la elección.
4. **Para imprimir sin cuadro de diálogo** (recomendado en caja), abre Chrome con:

   ```bash
   open -a "Google Chrome" --args --kiosk-printing
   ```

   En Windows, agrega `--kiosk-printing` al acceso directo de Chrome. Imprime directo en la impresora predeterminada.

Para no imprimir al cobrar, cambia `imprimirAlCobrar` a `false` en `config/punto-de-venta.ts`. El botón **Imprimir ticket** sigue disponible.

## 6. Lector de código de barras

Sirve cualquier lector USB o Bluetooth en modo teclado (HID), que es el de fábrica en casi todos.

- Debe mandar **Enter** al final de cada código (sufijo CR o Enter, también de fábrica en la mayoría).
- Si un código no se reconoce, revisa en el manual del lector que no tenga prefijos ni sufijos extra.
- El código de barras de cada producto se captura en **Nuevo producto** o al editarlo, escaneando la caja.

## 7. Pruebas (opcional)

Lógica de la aplicación (no necesita nada instalado aparte de Node):

```bash
pnpm probar
```

Reglas de la base: crea un PostgreSQL temporal, carga `postgres/larafarma.sql` y corre las pruebas. No toca tu base.

```bash
pnpm probar:postgres
```

```bash
pnpm probar:subida
```

`pnpm probar:subida` prueba "Subir datos" de punta a punta: una base local, una que imita Supabase y una API de mentira. `pnpm probar:base` sigue probando la versión de Supabase (`supabase/migrations/`).

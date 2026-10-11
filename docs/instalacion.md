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

Para **actualizar** después de bajar cambios (`git pull`), vuelve a correrlo. La versión anterior queda en `/opt/larafarma/app.anterior`.

Comandos útiles:

| Para | Comando |
|---|---|
| Ver si está corriendo | `systemctl status larafarma` |
| Ver errores | `sudo journalctl -u larafarma -n 50` |
| Reiniciar | `sudo systemctl restart larafarma` |
| Cambiar la conexión a la base | `sudo nano /etc/larafarma/larafarma.env` y reiniciar |
| Quitar el arranque automático | `sudo systemctl disable --now larafarma` y borrar `~/.config/autostart/larafarma.desktop` |

Las demás cajas solo abren `http://IP-DEL-SERVIDOR:3000` en Chrome; no necesitan instalar nada.

## 4.2 Publicar en Vercel

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

`pnpm probar:base` sigue probando la versión de Supabase (`supabase/migrations/`).

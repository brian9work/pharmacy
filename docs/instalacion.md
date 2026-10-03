# Instalación

Guía para dejar el sistema funcionando desde cero: Supabase, variables, primer administrador, impresora de tickets y lector de código de barras.

## 1. Requisitos

- Node.js 20.9 o superior y pnpm 10.
- Un proyecto de [Supabase](https://supabase.com).
- Para `pnpm probar:base` (opcional): PostgreSQL 14+ instalado localmente.

## 2. Supabase

### 2.1 Ajustes de autenticación

En el panel de tu proyecto:

1. **Authentication → Sign In / Providers:** desactiva **Allow new users to sign up**. Las cuentas solo las crea el administrador desde el sistema. Si queda activo, cualquiera podría crearse una cuenta en Supabase Auth. No vería datos (sin cuenta activa en la farmacia la base no le muestra nada), pero ocuparía cuentas.
2. **Authentication → Policies / Passwords:** longitud mínima de 10 caracteres.
3. **Authentication → URL Configuration:** en **Site URL** pon el dominio donde publicarás el sistema.

### 2.2 Cargar la base

En **SQL Editor** ejecuta, en este orden, el contenido de cada archivo:

| Orden | Archivo | Qué crea |
|---|---|---|
| 1 | `supabase/migrations/20261002120000_esquema.sql` | Tablas, reglas RLS, funciones de venta, caja, entradas y permisos |
| 2 | `supabase/migrations/20261002120100_datos_iniciales.sql` | Negocio, Caja 1, roles y los 22 permisos |
| 3 | `supabase/migrations/20261003120000_reportes.sql` | Reportes y exportación |
| — | `supabase/seed.sql` (opcional) | 16 productos y 20 lotes de ejemplo |

Si usas la CLI de Supabase, `supabase db push` aplica las migraciones en orden.

### 2.3 Primer administrador

1. **Authentication → Users → Add user → Create new user.** Escribe tu correo y una contraseña larga y marca **Auto Confirm User**.
2. Abre `supabase/primer-admin.sql`, cambia el correo y tu nombre, y ejecútalo en **SQL Editor**.

Los demás usuarios se crean desde la pantalla **Usuarios** del sistema.

## 3. Variables de entorno

Copia `.env.example` como `.env`. Los valores están en **Project Settings → API**.

| Variable | Dónde se usa | Secreta |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Servidor y proxy | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Servidor y proxy; solo permite lo que dejan las reglas RLS | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor: crear y bloquear cuentas | **Sí** |

La clave de servicio se salta todas las reglas. Nunca le pongas `NEXT_PUBLIC_` ni la subas a git (`.env` ya está en `.gitignore`).

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

## 4.1 Publicar en Vercel

1. Sube el repositorio a GitHub. El `.env` no se sube (está en `.gitignore`).
2. En [Vercel](https://vercel.com): **Add New → Project** e importa el repositorio. Detecta Next.js solo.
3. En **Settings → Environment Variables** agrega las tres variables de la tabla de arriba con los mismos nombres. `SUPABASE_SERVICE_ROLE_KEY` nunca lleva `NEXT_PUBLIC_`.
4. Pulsa **Deploy**.
5. En Supabase → **Authentication → URL Configuration**, pon el dominio de Vercel en **Site URL**.

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

Reglas de la base: crea un PostgreSQL temporal que imita Supabase, carga las migraciones y corre las pruebas. No toca tu proyecto de Supabase.

```bash
pnpm probar:base
```

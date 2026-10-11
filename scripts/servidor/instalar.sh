#!/usr/bin/env bash
# Instala LaraFarma en el servidor de la farmacia (Ubuntu):
#   1. Compila el build autónomo (sin código fuente).
#   2. Lo copia a /opt/larafarma, que solo puede leer el usuario del servicio.
#   3. Crea el servicio "larafarma": arranca al prender la computadora y se
#      reinicia solo si falla.
#   4. Abre el navegador al iniciar sesión en el escritorio.
#
# Uso, desde la carpeta del proyecto y con tu usuario (NO con sudo; el script
# pide la contraseña cuando la necesita):
#   bash scripts/servidor/instalar.sh
#
# Para actualizar después de un git pull, vuelve a correrlo.
# Requisitos: Node.js 20.9+, pnpm y el .env del proyecto con DATABASE_URL.

set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "Córrelo con tu usuario, sin sudo: bash scripts/servidor/instalar.sh" >&2
  exit 1
fi

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
# El script compila el proyecto que lo contiene: suelto (por ejemplo en
# Descargas) apuntaría a otra carpeta.
if [ ! -f "$RAIZ/package.json" ] || [ ! -f "$RAIZ/postgres/larafarma.sql" ]; then
  echo "Este script debe estar dentro del proyecto, en scripts/servidor/." >&2
  echo "Descarga el proyecto completo (rama postgres) y córrelo desde su carpeta:" >&2
  echo "  bash scripts/servidor/instalar.sh" >&2
  exit 1
fi
PUERTO="${PUERTO:-3000}"
URL="http://localhost:$PUERTO"
DESTINO=/opt/larafarma
CONFIG=/etc/larafarma
SERVICIO=larafarma

cd "$RAIZ"

# --- 0. Revisiones --------------------------------------------------------------
NODE="$(readlink -f "$(command -v node)")" || { echo "Falta Node.js" >&2; exit 1; }
command -v pnpm >/dev/null || { echo "Falta pnpm (npm install -g pnpm)" >&2; exit 1; }
LINEA_DB="$(grep -E '^DATABASE_URL=' .env 2>/dev/null | tail -1 || true)"
# En una actualización la conexión ya está en /etc/larafarma: el .env no hace falta.
if [ -z "$LINEA_DB" ] && [ ! -f "$CONFIG/larafarma.env" ]; then
  echo "Falta DATABASE_URL en $RAIZ/.env (ver docs/instalacion.md)" >&2
  exit 1
fi

# --- 1. Compilar ----------------------------------------------------------------
echo "→ Compilando…"
pnpm install --frozen-lockfile
pnpm build
cp -r public .next/standalone/
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/
# Las variables van en /etc/larafarma, no junto al código.
rm -f .next/standalone/.env*

# --- 2. Copiar a /opt/larafarma -------------------------------------------------
echo "→ Instalando en $DESTINO (pide tu contraseña de Ubuntu)…"
if ! id "$SERVICIO" >/dev/null 2>&1; then
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICIO"
fi

sudo mkdir -p "$DESTINO/bin" "$CONFIG"
sudo rm -rf "$DESTINO/app.nueva"
sudo cp -a .next/standalone "$DESTINO/app.nueva"
sudo mkdir -p "$DESTINO/app.nueva/.next/cache"
# Node propio del servicio: funciona aunque tu Node esté en tu carpeta personal (nvm).
sudo install -m 755 "$NODE" "$DESTINO/bin/node"
sudo install -m 755 scripts/servidor/abrir-navegador.sh "$DESTINO/abrir-navegador.sh"

# El código solo lo leen root y el servicio; las cuentas del escritorio no.
sudo chown -R root:"$SERVICIO" "$DESTINO/app.nueva"
sudo chmod -R u=rwX,g=rX,o= "$DESTINO/app.nueva"
sudo chown -R "$SERVICIO":"$SERVICIO" "$DESTINO/app.nueva/.next/cache"
sudo chmod 755 "$DESTINO"

# Variables: solo root las lee (systemd se las pasa al servicio).
if [ ! -f "$CONFIG/larafarma.env" ]; then
  printf '%s\nNODE_ENV=production\nPORT=%s\nHOSTNAME=0.0.0.0\n' "$LINEA_DB" "$PUERTO" | sudo tee "$CONFIG/larafarma.env" >/dev/null
else
  echo "  $CONFIG/larafarma.env ya existe: no se cambia."
fi
sudo chown root:root "$CONFIG/larafarma.env"
sudo chmod 600 "$CONFIG/larafarma.env"

# --- 3. Servicio ----------------------------------------------------------------
sudo tee "/etc/systemd/system/$SERVICIO.service" >/dev/null <<UNIDAD
[Unit]
Description=LaraFarma punto de venta
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=$SERVICIO
Group=$SERVICIO
WorkingDirectory=$DESTINO/app
EnvironmentFile=$CONFIG/larafarma.env
ExecStart=$DESTINO/bin/node server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DESTINO/app/.next/cache

[Install]
WantedBy=multi-user.target
UNIDAD

sudo systemctl stop "$SERVICIO" 2>/dev/null || true
sudo rm -rf "$DESTINO/app.anterior"
if [ -d "$DESTINO/app" ]; then sudo mv "$DESTINO/app" "$DESTINO/app.anterior"; fi
sudo mv "$DESTINO/app.nueva" "$DESTINO/app"
sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICIO"

# --- 4. Navegador al iniciar sesión ---------------------------------------------
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/larafarma.desktop" <<ESCRITORIO
[Desktop Entry]
Type=Application
Name=LaraFarma
Comment=Abre el punto de venta al iniciar sesión
Exec=$DESTINO/abrir-navegador.sh $URL
X-GNOME-Autostart-enabled=true
ESCRITORIO

echo "→ Esperando a que responda…"
for _ in $(seq 1 30); do
  if (exec 3<>"/dev/tcp/127.0.0.1/$PUERTO") 2>/dev/null; then
    echo "✓ LaraFarma corre en $URL (y en http://$(hostname -I | awk '{print $1}'):$PUERTO para las demás cajas)."
    echo "  Al reiniciar la computadora se abrirá solo en el navegador."
    exit 0
  fi
  sleep 1
done
echo "El servicio no respondió. Revisa: sudo journalctl -u $SERVICIO -n 50" >&2
exit 1

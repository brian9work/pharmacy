#!/usr/bin/env bash
# Abre LaraFarma en el navegador en cuanto el servidor responde.
# Lo lanza el inicio de sesión del escritorio (~/.config/autostart/larafarma.desktop).
#
# Uso: abrir-navegador.sh [url]   (por omisión http://localhost:3000)

URL="${1:-http://localhost:3000}"
PUERTO="$(echo "$URL" | sed -E 's#^[a-z]+://[^:/]+:?([0-9]*).*#\1#')"
PUERTO="${PUERTO:-80}"

# Espera hasta 2 minutos a que el servicio arranque (al prender la computadora
# PostgreSQL y LaraFarma pueden tardar un poco). Sin curl: bash abre el puerto.
for _ in $(seq 1 120); do
  if (exec 3<>"/dev/tcp/127.0.0.1/$PUERTO") 2>/dev/null; then break; fi
  sleep 1
done

# Perfil propio del navegador: no se mezcla con el uso personal y
# --kiosk-printing imprime el ticket directo en la impresora predeterminada.
PERFIL="$HOME/.config/larafarma-navegador"

for chrome in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$chrome" >/dev/null 2>&1; then
    exec "$chrome" \
      --user-data-dir="$PERFIL" \
      --app="$URL" \
      --start-maximized \
      --kiosk-printing \
      --no-first-run \
      --no-default-browser-check \
      --disable-session-crashed-bubble
  fi
done

# Sin Chrome ni Chromium: Firefox (pide confirmar cada impresión).
if command -v firefox >/dev/null 2>&1; then
  exec firefox --new-window "$URL"
fi

exec xdg-open "$URL"

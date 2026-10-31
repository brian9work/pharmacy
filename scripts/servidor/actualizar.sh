#!/usr/bin/env bash
# Actualiza LaraFarma en el servidor desde el .zip que se descarga de GitHub
# (Code → Download ZIP, rama postgres). Descomprime en una carpeta temporal,
# corre el instalador y la borra: el código fuente no se queda en el equipo.
#
# Uso, con tu usuario (NO con sudo):
#   bash actualizar.sh                    usa el .zip más reciente de Descargas
#   bash actualizar.sh /ruta/al/zip.zip   usa ese archivo
#
# Este script puede estar suelto (por ejemplo en tu carpeta personal). La
# conexión a la base ya está en /etc/larafarma: no hace falta .env.
# Si la actualización trae cambios en la base de datos, se aplican aparte
# (ver docs/instalacion.md, "Actualizar").

set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "Córrelo con tu usuario, sin sudo: bash actualizar.sh" >&2
  exit 1
fi
command -v unzip >/dev/null || { echo "Falta unzip: sudo apt install unzip" >&2; exit 1; }

ZIP="${1:-}"
if [ -z "$ZIP" ]; then
  for carpeta in "$HOME/Descargas" "$HOME/Downloads"; do
    [ -d "$carpeta" ] || continue
    candidato="$(ls -t "$carpeta"/pharmacy*.zip 2>/dev/null | head -1 || true)"
    if [ -n "$candidato" ]; then ZIP="$candidato"; break; fi
  done
fi
if [ -z "$ZIP" ] || [ ! -f "$ZIP" ]; then
  echo "No encontré el .zip. Descárgalo de GitHub (Code → Download ZIP, rama postgres)" >&2
  echo "o indica la ruta: bash actualizar.sh /ruta/al/zip.zip" >&2
  exit 1
fi
echo "→ Usando $ZIP ($(date -r "$ZIP" '+%d/%m/%Y %H:%M'))"

TEMPORAL="$(mktemp -d)"
trap 'rm -rf "$TEMPORAL"' EXIT

unzip -q "$ZIP" -d "$TEMPORAL"
# GitHub mete todo en una carpeta (pharmacy-postgres/); se busca por su contenido.
SQL="$(find "$TEMPORAL" -maxdepth 4 -type f -name larafarma.sql -path '*/postgres/larafarma.sql' | head -1)"
if [ -z "$SQL" ]; then
  echo "El .zip no parece ser de LaraFarma con rama postgres (falta postgres/larafarma.sql)." >&2
  exit 1
fi
RAIZ="$(dirname "$(dirname "$SQL")")"
if [ ! -f "$RAIZ/package.json" ] || [ ! -f "$RAIZ/scripts/servidor/instalar.sh" ]; then
  echo "El .zip está incompleto (falta package.json o el instalador)." >&2
  exit 1
fi

# La carpeta del servicio solo cambia si el instalador termina bien; la versión
# anterior queda en /opt/larafarma/app.anterior por si hay que volver.
cd "$RAIZ"
bash scripts/servidor/instalar.sh

echo "✓ Actualizado. Se borró la carpeta temporal; el .zip sigue en $ZIP (bórralo si quieres)."

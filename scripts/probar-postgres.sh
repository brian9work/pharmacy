#!/usr/bin/env bash
# Prueba postgres/larafarma.sql (la versión sin Supabase) en un PostgreSQL
# temporal: carga el archivo completo y corre postgres/pruebas/pruebas.sql.
#
# Requisitos: PostgreSQL 15+ instalado localmente (initdb, pg_ctl, psql).
# Uso: pnpm probar:postgres

set -euo pipefail
export LC_ALL=C

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TEMPORAL="$(mktemp -d)"
PUERTO=54330
psql_() { psql -h 127.0.0.1 -p "$PUERTO" -U postgres -d farmacia -v ON_ERROR_STOP=1 -q "$@"; }

limpiar() {
  pg_ctl -D "$TEMPORAL/datos" -m fast stop >/dev/null 2>&1 || true
  rm -rf "$TEMPORAL"
}
trap limpiar EXIT

initdb -D "$TEMPORAL/datos" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
pg_ctl -D "$TEMPORAL/datos" -o "-p $PUERTO -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l "$TEMPORAL/log" -w start >/dev/null
createdb -h 127.0.0.1 -p "$PUERTO" -U postgres farmacia

psql_ -f "$RAIZ/postgres/larafarma.sql"

psql_ -f "$RAIZ/postgres/pruebas/pruebas.sql" 2>&1 \
  | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR):  /\1: /' | grep -v '^t$' | grep -v '^$' | tee "$TEMPORAL/resultado.txt"

aciertos=$(grep -c '^NOTICE: OK' "$TEMPORAL/resultado.txt" || true)
fallos=$(grep -c 'FALLO\|^ERROR' "$TEMPORAL/resultado.txt" || true)
echo
echo "Pruebas correctas: $aciertos · Fallos: $fallos"
[ "$fallos" -eq 0 ]

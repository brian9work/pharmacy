#!/usr/bin/env bash
# Prueba de punta a punta de "Subir datos" en un PostgreSQL temporal con dos
# bases: la local (postgres/larafarma.sql) y una que imita Supabase. No toca
# ninguna base tuya ni llama a Supabase.
#
# Requisitos: PostgreSQL 15+ instalado localmente y `pnpm install`.
# Uso: pnpm probar:subida

set -euo pipefail
export LC_ALL=C

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TEMPORAL="$(mktemp -d)"
export PUERTO=54331
psql_() { psql -h 127.0.0.1 -p "$PUERTO" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

limpiar() {
  pg_ctl -D "$TEMPORAL/datos" -m fast stop >/dev/null 2>&1 || true
  rm -rf "$TEMPORAL"
}
trap limpiar EXIT

initdb -D "$TEMPORAL/datos" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
pg_ctl -D "$TEMPORAL/datos" -o "-p $PUERTO -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l "$TEMPORAL/log" -w start >/dev/null
createdb -h 127.0.0.1 -p "$PUERTO" -U postgres local
createdb -h 127.0.0.1 -p "$PUERTO" -U postgres nube

# La base de la farmacia, con los productos de ejemplo.
psql_ -d local -f "$RAIZ/postgres/larafarma.sql"
psql_ -d local -f "$RAIZ/supabase/seed.sql"
# El usuario con el que se conecta la aplicación (miembro de larafarma_app).
psql_ -d local -c "create role web login in role larafarma_app"

# La nube: lo que trae Supabase de fábrica y todas las migraciones, sin datos.
psql_ -d nube -f "$RAIZ/supabase/pruebas/00-imitar-supabase.sql"
for migracion in "$RAIZ"/supabase/migrations/*.sql; do
  psql_ -d nube -f "$migracion"
done

cd "$RAIZ"
node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/subida-e2e.ts

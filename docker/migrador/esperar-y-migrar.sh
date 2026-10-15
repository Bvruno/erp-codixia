#!/bin/sh
# Aplica las migraciones de supabase/migrations en orden alfabético.
# Idempotente: registra lo aplicado en el esquema interno "migraciones".
set -eu

export PGHOST="${PGHOST:-db}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGDATABASE="${PGDATABASE:-postgres}"

sql() {
  psql --no-psqlrc -v ON_ERROR_STOP=1 "$@"
}

echo "[migrador] Esperando a Postgres..."
until pg_isready -q; do
  sleep 2
done

echo "[migrador] Esperando a que GoTrue cree el esquema auth..."
until [ "$(sql -tAc "select to_regclass('auth.users') is not null")" = "t" ]; do
  sleep 2
done

sql -c "create schema if not exists migraciones;"
sql -c "create table if not exists migraciones.aplicadas (
  nombre text primary key,
  aplicado_en timestamptz not null default now()
);"

for archivo in /migraciones/*.sql; do
  [ -e "$archivo" ] || continue
  nombre="$(basename "$archivo")"

  if [ -n "$(sql -tAc "select 1 from migraciones.aplicadas where nombre = '$nombre'")" ]; then
    echo "[migrador] Ya aplicada: $nombre"
    continue
  fi

  echo "[migrador] Aplicando: $nombre"
  sql -f "$archivo"
  sql -c "insert into migraciones.aplicadas (nombre) values ('$nombre');"
done

# Avisa a PostgREST para que recargue su caché de esquema: la BD ya tiene
# el esquema nuevo, pero PostgREST pudo haber arrancado antes de que el
# migrador terminara. No depende de los event triggers de la BD.
sql -c "select pg_notify('pgrst', 'reload schema');"

echo "[migrador] Migraciones al día."

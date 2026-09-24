#!/usr/bin/env bash
# Recreate a scratch database, load the Supabase stub, then apply every migration.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres ./tests/reset-db.sh [dbname]
set -euo pipefail
DB="${1:-forays_task_test}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$DIR/tests/supabase_stub.sql"
for f in "$DIR"/migrations/*.sql; do
  echo "applying $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done

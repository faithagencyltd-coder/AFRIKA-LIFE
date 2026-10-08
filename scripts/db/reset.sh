#!/usr/bin/env bash
# Recrée une base locale de test : émulation Supabase + migrations + seed.
# Usage : npm run db:reset [-- nom_base]   (variables PG* standard respectées)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${1:-walife_test}"
export PGHOST="${PGHOST:-localhost}" PGUSER="${PGUSER:-postgres}" PGPASSWORD="${PGPASSWORD:-postgres}"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists \"$DB\" with (force)" -c "create database \"$DB\""
run() { psql -q -v ON_ERROR_STOP=1 -X -d "$DB" -f "$1" > /dev/null; }
run scripts/db/supabase-stub.sql
for f in supabase/migrations/*.sql; do echo "→ $(basename "$f")"; run "$f"; done
echo "→ seed.sql"; run supabase/seed.sql
echo "Base $DB prête."

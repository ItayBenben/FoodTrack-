#!/usr/bin/env bash
# Create local roles + databases on a native Postgres (no Docker). Idempotent.
#   DBNAME=foodtrack_test scripts/dev-db.sh
set -euo pipefail
DBNAME="${DBNAME:-foodtrack}"
PSQL="${PSQL:-sudo -u postgres psql}"
command -v sudo >/dev/null || PSQL="su postgres -c psql"
run() { if [[ "$PSQL" == su* ]]; then su postgres -c "psql -v ON_ERROR_STOP=1 -q -c \"$1\""; else $PSQL -v ON_ERROR_STOP=1 -q -c "$1"; fi; }
rund() { if [[ "$PSQL" == su* ]]; then su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $DBNAME -c \"$1\""; else $PSQL -v ON_ERROR_STOP=1 -q -d "$DBNAME" -c "$1"; fi; }
run "DO \\\$\\\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='foodtrack') THEN CREATE ROLE foodtrack LOGIN PASSWORD 'foodtrack' NOSUPERUSER NOBYPASSRLS; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='foodtrack_app') THEN CREATE ROLE foodtrack_app LOGIN PASSWORD 'foodtrack_app' NOSUPERUSER NOBYPASSRLS; END IF; END \\\$\\\$;"
if ! run "SELECT 1 FROM pg_database WHERE datname='$DBNAME'" | grep -q 1; then :; fi
EXISTS=$(if [[ "$PSQL" == su* ]]; then su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$DBNAME'\""; else $PSQL -tAc "SELECT 1 FROM pg_database WHERE datname='$DBNAME'"; fi)
[[ "$EXISTS" == "1" ]] || run "CREATE DATABASE $DBNAME OWNER foodtrack"
rund "CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS pgcrypto; ALTER SCHEMA public OWNER TO foodtrack; REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO foodtrack_app;"
echo "database $DBNAME ready (owner foodtrack, app role foodtrack_app)"

#!/usr/bin/env bash
# Create local roles + a database on a native Postgres (no Docker). Idempotent.
#   DBNAME=foodtrack_test scripts/dev-db.sh
#   PSQL=psql scripts/dev-db.sh         # when PGHOST/PGUSER already point at a superuser (CI)
set -euo pipefail
DBNAME="${DBNAME:-foodtrack}"
# SQL goes in on stdin, so quoting is identical however psql is reached.
admin() {
  if [[ -n "${PSQL:-}" ]]; then $PSQL -v ON_ERROR_STOP=1 -q "$@"
  elif command -v sudo >/dev/null && [[ $EUID -ne 0 ]]; then sudo -u postgres psql -v ON_ERROR_STOP=1 -q "$@"
  else su postgres -c "psql -v ON_ERROR_STOP=1 -q $*"; fi
}
admin -d postgres <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'foodtrack') THEN CREATE ROLE foodtrack LOGIN PASSWORD 'foodtrack' NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'foodtrack_app') THEN CREATE ROLE foodtrack_app LOGIN PASSWORD 'foodtrack_app' NOSUPERUSER NOBYPASSRLS; END IF;
END $$;
SQL
if ! admin -d postgres -tA <<<"SELECT 1 FROM pg_database WHERE datname = '$DBNAME'" | grep -q 1; then
  admin -d postgres <<<"CREATE DATABASE \"$DBNAME\" OWNER foodtrack"
fi
admin -d "$DBNAME" <<'SQL'
CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER SCHEMA public OWNER TO foodtrack; REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO foodtrack_app;
SQL
echo "database $DBNAME ready (owner foodtrack, app role foodtrack_app)"

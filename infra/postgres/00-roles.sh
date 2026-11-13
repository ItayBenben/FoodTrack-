#!/bin/sh
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="${FOODTRACK_DB_OWNER_PASSWORD:?set FOODTRACK_DB_OWNER_PASSWORD}" \
  -v app_pw="${FOODTRACK_DB_APP_PASSWORD:?set FOODTRACK_DB_APP_PASSWORD}" \
  -f /docker-entrypoint-initdb.d/init.sql.tpl

#!/usr/bin/env bash
# Restore a backup into a database (06 §6). Refuses a non-empty target unless FORCE=1.
#   TARGET_DB_URL=postgres://foodtrack:…@host/foodtrack MEDIA_DIR=/data/media [AGE_IDENTITY=key.txt] scripts/restore.sh backup.tar.gz[.age]
set -euo pipefail
SRC="${1:?backup file}"; WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
if [[ "$SRC" == *.age ]]; then age -d -i "${AGE_IDENTITY:?set AGE_IDENTITY}" -o "$WORK/b.tar.gz" "$SRC"; else cp "$SRC" "$WORK/b.tar.gz"; fi
tar -C "$WORK" -xzf "$WORK/b.tar.gz"
N=$(psql "${TARGET_DB_URL:?set TARGET_DB_URL}" -tAc "select count(*) from pg_tables where schemaname='public'")
if [[ "$N" != "0" && "${FORCE:-0}" != "1" ]]; then echo "target database is not empty ($N tables); set FORCE=1 to overwrite" >&2; exit 1; fi
pg_restore --no-owner --role=foodtrack --clean --if-exists -d "$TARGET_DB_URL" "$WORK/db.dump" 2>&1 | grep -v 'does not exist' || true
mkdir -p "${MEDIA_DIR:?set MEDIA_DIR}"; cp -r "$WORK/media/." "$MEDIA_DIR/"
echo "restored. Start the API with the KEK from your recovery card (FOODTRACK_KEK) and run: pnpm keys:check"

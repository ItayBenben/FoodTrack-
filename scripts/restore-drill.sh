#!/usr/bin/env bash
# The verified-restore release gate (06 §5.4): back up a populated instance, restore into a clean database,
# supply ONLY the recovery card, and prove a meal's raw text and a photo come back readable.
#   SOURCE_DB_URL=… DRILL_DB=foodtrack_drill CARD=card.txt MEDIA_DIR=… scripts/restore-drill.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
DRILL_DB="${DRILL_DB:-foodtrack_drill}"
BACKUP_DIR="$WORK/b" DATABASE_OWNER_URL="${SOURCE_DB_URL:?}" MEDIA_DIR="${MEDIA_DIR:?}" "$ROOT/scripts/backup.sh" > "$WORK/file"
DBNAME="$DRILL_DB" "$ROOT/scripts/dev-db.sh" >/dev/null
TARGET="$(echo "$SOURCE_DB_URL" | sed -E "s#/[^/]+\$#/$DRILL_DB#")"
FORCE=1 TARGET_DB_URL="$TARGET" MEDIA_DIR="$WORK/media" "$ROOT/scripts/restore.sh" "$(tail -1 "$WORK/file")" >/dev/null
cd "$ROOT/apps/api" && pnpm -s exec tsx src/cli/restore-drill.ts "$TARGET" "${CARD:?}" "$WORK/media"

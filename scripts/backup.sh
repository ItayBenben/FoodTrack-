#!/usr/bin/env bash
# Nightly backup (06 §6): pg_dump + the encrypted media volume, then age-encrypted before it leaves the host.
#   BACKUP_DIR=/srv/backups AGE_RECIPIENT=age1... scripts/backup.sh
# The dump already holds ciphertext for the narrative layer; age adds a second layer for the numbers.
# Keep the recovery card somewhere ELSE — a card stored next to the backup it protects is decorative.
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-./backups}"; mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"; WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
if [[ -n "${COMPOSE:-}" ]]; then
  docker compose exec -T postgres pg_dump -U postgres -Fc foodtrack > "$WORK/db.dump"
  docker compose cp api:/data/media "$WORK/media"
else
  pg_dump -Fc "${DATABASE_OWNER_URL:?set DATABASE_OWNER_URL}" > "$WORK/db.dump"
  cp -r "${MEDIA_DIR:-./data/media}" "$WORK/media" 2>/dev/null || mkdir -p "$WORK/media"
fi
tar -C "$WORK" -czf "$WORK/foodtrack-$STAMP.tar.gz" db.dump media
if [[ -n "${AGE_RECIPIENT:-}" ]]; then
  age -r "$AGE_RECIPIENT" -o "$BACKUP_DIR/foodtrack-$STAMP.tar.gz.age" "$WORK/foodtrack-$STAMP.tar.gz"
  echo "$BACKUP_DIR/foodtrack-$STAMP.tar.gz.age"
else
  echo "WARNING: AGE_RECIPIENT not set — backup is not encrypted beyond the field encryption." >&2
  mv "$WORK/foodtrack-$STAMP.tar.gz" "$BACKUP_DIR/"; echo "$BACKUP_DIR/foodtrack-$STAMP.tar.gz"
fi
# keep 14 days
find "$BACKUP_DIR" -name 'foodtrack-*.tar.gz*' -mtime +14 -delete

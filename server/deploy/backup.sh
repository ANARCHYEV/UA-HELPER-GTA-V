#!/usr/bin/env bash
# SQLite backup: run daily from cron, keep 14 days.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/opt/ua-helper/server/data}"
BACKUP_DIR="${BACKUP_DIR:-/home/deploy/backups/ua-helper}"
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y-%m-%d_%H%M%S)
OUT="$BACKUP_DIR/app-$STAMP.db"

sqlite3 "$DATA_DIR/app.db" ".backup '$OUT'"
gzip -f "$OUT"

# prune old backups
find "$BACKUP_DIR" -name "app-*.db.gz" -mtime +${KEEP_DAYS} -delete

echo "backup done: $OUT.gz"

#!/bin/bash
# Pull a full filestore backup from the VPS to this Mac.
#
# The VPS has no backups of its own, so this is the only copy of anything users
# upload. Runs from cron every 8 hours; see the retention rules below.
#
#   ./backup.sh          take a backup, then prune
#   ./backup.sh --prune  prune only (useful for checking the rules)
set -uo pipefail

DEST="${FILESTORE_BACKUP_DIR:-$HOME/Backups/filestore}"
REMOTE=br8t
SRC=/srv/data/filestore
KEEP_DAYS=7

mkdir -p "$DEST"
LOG="$DEST/backup.log"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"; }

fail() { log "FAILED: $*"; exit 1; }

# ---------------------------------------------------------------- backup

take_backup() {
  local stamp archive tmp
  stamp=$(date '+%Y%m%d-%H%M%S')
  archive="$DEST/filestore-$stamp.tar.gz"
  tmp="$archive.part"

  # Snapshot the DB with sqlite3's own .backup rather than copying the file:
  # a live copy taken mid-write, without its -wal, can restore as a corrupt or
  # stale database. The snapshot is checkpointed and self-contained.
  #
  # Everything is streamed to stdout so nothing large is staged on the VPS,
  # which has under 5 GB free.
  ssh "$REMOTE" "
    set -e
    snap=\$(mktemp -d)
    trap 'rm -rf \"\$snap\"' EXIT
    sqlite3 '$SRC/filestore.db' \".backup '\$snap/filestore.db'\"
    tar czf - -C '$SRC' files -C \"\$snap\" filestore.db
  " > "$tmp" || { rm -f "$tmp"; fail "ssh/tar from $REMOTE"; }

  # Verify before it counts as a backup — a truncated archive that silently
  # replaced a good one would be worse than no backup at all.
  tar tzf "$tmp" >/dev/null 2>&1 || { rm -f "$tmp"; fail "archive did not verify"; }
  grep -q . <(tar tzf "$tmp" 2>/dev/null | head -1) || { rm -f "$tmp"; fail "archive is empty"; }

  mv "$tmp" "$archive"
  log "ok  $(basename "$archive")  $(du -h "$archive" | cut -f1)"
}

# ---------------------------------------------------------------- prune
#
# Today: keep every 8-hourly backup.
# Earlier days: keep only the most recent backup of that day.
# Anything older than KEEP_DAYS days: remove entirely.

prune() {
  local today cutoff f day last
  today=$(date '+%Y%m%d')
  # date -v is BSD/macOS; this script is only ever run from the Mac.
  cutoff=$(date -v-${KEEP_DAYS}d '+%Y%m%d')

  # Newest first by *name*, not mtime — the timestamp in the name is the truth,
  # and mtime can be disturbed by a copy or a restore.
  last=""
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    day=$(basename "$f" | sed -n 's/^filestore-\([0-9]\{8\}\)-.*/\1/p')
    [ -n "$day" ] || continue

    if [ "$day" \< "$cutoff" ]; then
      rm -f "$f" && log "prune (age)  $(basename "$f")"
    elif [ "$day" = "$today" ]; then
      :                                   # today's are all kept
    elif [ "$day" = "$last" ]; then
      rm -f "$f" && log "prune (day)  $(basename "$f")"
    fi
    [ "$day" = "$today" ] || last="$day"
  done < <(ls -1 "$DEST"/filestore-*.tar.gz 2>/dev/null | sort -r)
}

case "${1:-}" in
  --prune) prune ;;
  "")      take_backup; prune ;;
  *)       echo "usage: $0 [--prune]" >&2; exit 2 ;;
esac

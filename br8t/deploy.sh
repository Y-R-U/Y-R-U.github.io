#!/usr/bin/env bash
# Deploy the br8t.com base site ("8:20") as a static site served by Caddy.
#
# Pure static — no backend. Replaces whatever is in $SITE (the previous
# video-landing site is backed up at ~/cc/backup/br8t-old-website/).
# The Caddy vhost for br8t.com already points at $SITE; an extra /api/state
# rewrite from the old site is harmless and left untouched.
set -euo pipefail

HOST="${HOST:-br8t}"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE="/srv/apps/br8thome/site"

echo ">> ensuring dirs"
ssh "$HOST" "sudo install -d -o deploy -g deploy /srv/apps/br8thome '$SITE'"

echo ">> syncing site (index.html, css/, js/, fonts/) — removes previous site files"
rsync -az --delete \
  --include='index.html' --include='css/***' --include='js/***' --include='fonts/***' \
  --exclude='*' \
  "$SRC_DIR/" "$HOST:$SITE/"

echo ">> done — https://br8t.com"

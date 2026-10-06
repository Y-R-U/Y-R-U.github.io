#!/usr/bin/env bash
# Deploy to https://br8t.com/mal/garfield/ (unlisted path on the br8t.com static vhost).
set -euo pipefail
HOST="${HOST:-br8t}"
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="/srv/apps/br8thome/site/mal/garfield"
ssh "$HOST" "install -d '$DEST'"
rsync -az --delete --exclude='docs/' --exclude='tools/' --exclude='refs/' --exclude='deploy.sh' --exclude='.DS_Store' \
  "$SRC/" "$HOST:$DEST/"
echo ">> https://br8t.com/mal/garfield/"

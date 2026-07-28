#!/usr/bin/env bash
# Deploy games.br8t.com — the hub page plus whichever games have been brought
# across. Pure static, served by Caddy from $SITE on the br8t box.
#
# Everything keeps its repo path on the server (/gms/2d/racketeer/, /lib/auth/,
# /assets/screenshots/) EXCEPT the hub itself, which moves from /games/ to the
# document root. That means absolute URLs work identically on
# games.br8t.com and on the GitHub Pages mirror — no per-origin path juggling.
set -euo pipefail

HOST="${HOST:-br8t}"
HUB_DIR="$(cd "$(dirname "$0")" && pwd)"     # <repo>/games
REPO="$(cd "$HUB_DIR/.." && pwd)"
SITE="/srv/apps/br8tgames/site"

# Games that ship. Add a path here when you flip `soon` off in js/games.js.
GAMES=(
  "gms/2d/racketeer"
)

echo ">> ensuring dirs"
ssh "$HOST" "sudo install -d -o deploy -g deploy /srv/apps/br8tgames '$SITE'"

echo ">> hub → document root"
rsync -az --delete \
  --include='index.html' --include='css/***' --include='js/***' \
  --exclude='deploy.sh' --exclude='*' \
  "$HUB_DIR/" "$HOST:$SITE/"

echo ">> shared auth layer → /lib/auth/"
ssh "$HOST" "install -d '$SITE/lib'"
rsync -az --delete "$REPO/lib/auth/" "$HOST:$SITE/lib/auth/"

for g in "${GAMES[@]}"; do
  echo ">> $g"
  ssh "$HOST" "install -d '$SITE/$g'"
  rsync -az --delete --exclude='PLAN.md' --exclude='*.md' \
    "$REPO/$g/" "$HOST:$SITE/$g/"
done

# Only the shots the hub actually references — the repo holds ~60 of them and
# there's no reason to push the rest to the box.
echo ">> screenshots"
SHOTS=$(sed -n 's/.*shot: "\([^"]*\)".*/--include=\1.jpg/p' "$HUB_DIR/js/games.js")
ssh "$HOST" "install -d '$SITE/assets/screenshots'"
# shellcheck disable=SC2086
rsync -az --delete $SHOTS --exclude='*' \
  "$REPO/assets/screenshots/" "$HOST:$SITE/assets/screenshots/"

echo ">> done — https://games.br8t.com"

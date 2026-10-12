#!/usr/bin/env bash
# Deploy ragdojo-arena to the br8t box. WRITTEN FOR REVIEW — NOT RUN. Needs Aaron's approval.
# Same shape as gms/pwa/snake/server/deploy.sh: build on the box, install the unit, health-check
# with rollback. The Caddy route (Caddyfile.fragment) is merged by hand, then `caddy validate`
# and `systemctl reload caddy`. The game client ships with games/deploy.sh as usual.
set -euo pipefail

HOST="${HOST:-br8t}"
APP=ragdojo-arena
PORT=8017
SERVER_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD="/srv/apps/$APP/build"
BIN="/srv/apps/$APP/$APP"
GO=/usr/local/go/bin/go

echo ">> unit tests (local)"
(cd "$SERVER_DIR" && go test ./... >/dev/null)

echo ">> port $PORT must be free (8012 clued, 8013/8014 snakenet, 8016 payments)"
ssh "$HOST" "! ss -ltn | grep -q ':$PORT ' || systemctl is-active --quiet $APP"

echo ">> dirs"
ssh "$HOST" "sudo install -d -o deploy -g deploy /srv/apps/$APP $BUILD && sudo install -d -m 700 -o deploy -g deploy /srv/data/$APP"

echo ">> source"
rsync -az --delete --include='go.mod' --include='go.sum' --include='*.go' --exclude='*_test.go' --exclude='*' \
  "$SERVER_DIR/" "$HOST:$BUILD/"

echo ">> build on box (1 CPU, low priority)"
ssh "$HOST" "cd $BUILD && GOMAXPROCS=1 CGO_ENABLED=0 GOFLAGS=-mod=mod nice -n 15 $GO build -p 1 -trimpath -ldflags='-s -w' -o $BIN.new ."

echo ">> event-picture answers (server-only; written by tools/eventart when Aaron approves art)"
ANSWERS="${ANSWERS:-$HOME/.ragdojo/eventart/answers.json}"
if [ -f "$ANSWERS" ]; then rsync -az "$ANSWERS" "$HOST:/srv/data/$APP/event_answers.json"; else echo "   none yet: every event uses the drawn placeholder"; fi

echo ">> approved event art (server-only: the game never ships it; eventart.go serves opened squares)"
ART="${ART:-$HOME/.ragdojo/eventart/approved}"
if [ -d "$ART" ]; then
  ssh "$HOST" "install -d -m 700 /srv/data/$APP/event_art"
  rsync -az --delete --include='*.jpg' --exclude='*' "$ART/" "$HOST:/srv/data/$APP/event_art/"
else echo "   none yet: every event uses the drawn placeholder"; fi

echo ">> install binary + unit (previous kept as .prev)"
rsync -az "$SERVER_DIR/$APP.service" "$HOST:/tmp/$APP.service"
ssh "$HOST" "if [ -f $BIN ]; then cp -p $BIN $BIN.prev; fi && mv $BIN.new $BIN && \
  sudo mv /tmp/$APP.service /etc/systemd/system/$APP.service && \
  sudo systemctl daemon-reload && sudo systemctl enable --quiet $APP && sudo systemctl restart $APP"

healthy() {
  for i in $(seq 1 15); do
    ssh "$HOST" "curl -fsS -m 3 http://127.0.0.1:$PORT/gms/2d/ragdojo/arena/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}
if ! healthy; then
  echo "!! unhealthy — rolling back" >&2
  ssh "$HOST" "sudo journalctl -u $APP -n 20 --no-pager; if [ -f $BIN.prev ]; then mv $BIN.prev $BIN && sudo systemctl restart $APP; fi" >&2 || true
  exit 1
fi
echo "   healthy"
ssh "$HOST" "curl -fsS http://127.0.0.1:$PORT/internal/stats" && echo
echo ">> now merge Caddyfile.fragment into the games.br8t.com block, caddy validate, reload; then:"
echo "   curl -fsS https://games.br8t.com/gms/2d/ragdojo/arena/health"

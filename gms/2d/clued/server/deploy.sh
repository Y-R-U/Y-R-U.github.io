#!/usr/bin/env bash
# Deploy the CLUED server to the br8t box: build there, install the systemd
# unit, health-check (rolling back on failure), make sure the Caddy route exists.
# The manager ships static files; STATIC=1 also rsyncs the client. Safe to re-run.
#
#   ./deploy.sh                   server only
#   STATIC=1 ./deploy.sh          also the static client → games.br8t.com/gms/2d/clued/
#   RUN_TESTS=1 ./deploy.sh       run server/test.sh on the box against the new binary first
#   ROLLBACK_DRILL=1 ./deploy.sh  ship a binary that can't start, to prove the rollback works
set -euo pipefail

HOST="${HOST:-br8t}"
APP=clued
PORT=8012
SERVER_DIR="$(cd "$(dirname "$0")" && pwd)"
GAME_DIR="$(cd "$SERVER_DIR/.." && pwd)"
SITE="/srv/apps/br8tgames/site"
GAME_PATH="gms/2d/clued"
BUILD="/srv/apps/$APP/build"
BIN="/srv/apps/$APP/$APP"
GO=/usr/local/go/bin/go

echo ">> ensuring dirs"
ssh "$HOST" "sudo install -d -o deploy -g deploy /srv/apps/$APP $BUILD $BUILD/server && \
  sudo install -d -m 700 -o deploy -g deploy /srv/data/$APP && sudo chmod 700 /srv/data/$APP && \
  sudo find /srv/data/$APP -maxdepth 1 -type f -exec chmod 600 {} +"

echo ">> syncing server source"
rsync -az --delete --include='go.mod' --include='go.sum' --include='*.go' --include='test.sh' --exclude='*' \
  "$SERVER_DIR/" "$HOST:$BUILD/server/"

echo ">> building on box (1 CPU, low priority, to spare the live apps)"
ssh "$HOST" "cd $BUILD/server && GOMAXPROCS=1 CGO_ENABLED=0 GOFLAGS=-mod=mod nice -n 15 $GO build -p 1 -trimpath -ldflags='-s -w' -o $BIN.new ."
if [ -n "${ROLLBACK_DRILL:-}" ]; then
  echo ">> ROLLBACK DRILL: replacing the new binary with one that exits at once"
  ssh "$HOST" "printf '#!/bin/sh\nexit 1\n' > $BIN.new && chmod +x $BIN.new"
fi

if [ -n "${RUN_TESTS:-}" ]; then
  echo ">> server tests on box"
  ssh "$HOST" "cd $BUILD/server && PATH=/usr/local/go/bin:\$PATH GOMAXPROCS=1 nice -n 15 bash test.sh $BIN.new | tail -n 10"
fi

echo ">> installing binary + systemd unit (previous kept as $BIN.prev)"
rsync -az "$SERVER_DIR/$APP.service" "$HOST:/tmp/$APP.service"
ssh "$HOST" "rm -f /tmp/$APP.service.prev; if [ -f /etc/systemd/system/$APP.service ]; then sudo cp /etc/systemd/system/$APP.service /tmp/$APP.service.prev; fi && \
  if [ -f $BIN ]; then cp -p $BIN $BIN.prev; fi && mv $BIN.new $BIN && \
  sudo mv /tmp/$APP.service /etc/systemd/system/$APP.service && \
  sudo systemctl daemon-reload && sudo systemctl enable --quiet $APP && sudo systemctl restart $APP"

healthy() {
  for i in $(seq 1 15); do
    ssh "$HOST" "systemctl is-active --quiet $APP && curl -fsS -m 3 http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}
if ! healthy; then
  echo "!! new binary failed its health check — rolling back" >&2
  ssh "$HOST" "sudo journalctl -u $APP -n 15 --no-pager" >&2 || true
  ssh "$HOST" "if [ -f $BIN.prev ]; then mv $BIN.prev $BIN; fi && \
    if [ -f /tmp/$APP.service.prev ]; then sudo mv /tmp/$APP.service.prev /etc/systemd/system/$APP.service; fi && \
    sudo systemctl daemon-reload && sudo systemctl restart $APP"
  if healthy; then echo "!! rolled back to the previous binary; it is healthy" >&2; else echo "!! ROLLBACK ALSO UNHEALTHY (first deploy has nothing to roll back to) — investigate now" >&2; fi
  exit 1
fi
echo "   healthy"

echo ">> Caddy route"
rsync -az "$SERVER_DIR/caddy_route.py" "$HOST:/tmp/caddy_route.py"
ssh "$HOST" "out=\$(sudo python3 /tmp/caddy_route.py) && echo \"   \$out\" && \
  case \"\$out\" in *added*) sudo systemctl reload caddy;; esac"

if [ -n "${STATIC:-}" ]; then
  echo ">> static client → $SITE/$GAME_PATH"
  ssh "$HOST" "install -d '$SITE/$GAME_PATH'"
  rsync -az --delete --exclude='docs/' --exclude='server/' --exclude='tools/' --exclude='*.md' \
    --exclude='.DS_Store' "$GAME_DIR/" "$HOST:$SITE/$GAME_PATH/"
fi

echo ">> public health, CORS + data permissions"
ssh "$HOST" "stat -c '%a %U %n' /srv/data/$APP /srv/data/$APP/*"
curl -fsS "https://games.br8t.com/$GAME_PATH/api/health" && echo
curl -fsS -o /dev/null -D - -X OPTIONS "https://games.br8t.com/$GAME_PATH/api/rooms" \
  -H 'Origin: https://y-r-u.github.io' -H 'Access-Control-Request-Method: POST' | grep -i '^access-control-allow-origin'
echo ">> done — https://games.br8t.com/$GAME_PATH/api/health"

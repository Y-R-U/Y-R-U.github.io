#!/usr/bin/env bash
# Deploy krayzeenet to the br8t box (Clued's deploy.sh shape): build there, install the systemd
# unit, health-check with rollback, add the Caddy route. NOT YET APPROVED: refuses to run unless
# CONFIRM=1, and refuses if port 8018 is already taken on the box. Commit first, then deploy.
#
#   CONFIRM=1 ./deploy.sh              server only
#   CONFIRM=1 STATIC=1 ./deploy.sh     also the static client → games.br8t.com/gms/3d/krayzee/
set -euo pipefail

[ "${CONFIRM:-}" = 1 ] || { echo "krayzeenet deploy needs Aaron's approval: run with CONFIRM=1" >&2; exit 2; }

HOST="${HOST:-br8t}"
APP=krayzeenet
PORT=8018
SERVER_DIR="$(cd "$(dirname "$0")" && pwd)"
GAME_DIR="$(cd "$SERVER_DIR/.." && pwd)"
SITE="/srv/apps/br8tgames/site"
GAME_PATH="gms/3d/krayzee"
BUILD="/srv/apps/$APP/build"
BIN="/srv/apps/$APP/$APP"
GO=/usr/local/go/bin/go
HEALTH="http://127.0.0.1:$PORT/$GAME_PATH/net/health"

echo ">> port $PORT free (or already ours)?"
ssh "$HOST" "owner=\$(sudo ss -ltnp 'sport = :$PORT' | tail -n +2); [ -z \"\$owner\" ] || echo \"\$owner\" | grep -q $APP" \
  || { echo "!! port $PORT is taken by something else on the box" >&2; exit 1; }

echo ">> ensuring dirs"
ssh "$HOST" "sudo install -d -o deploy -g deploy /srv/apps/$APP $BUILD $BUILD/server && \
  sudo install -d -m 700 -o deploy -g deploy /srv/data/$APP"

echo ">> syncing server source"
rsync -az --delete --include='go.mod' --include='go.sum' --include='*.go' --exclude='*' "$SERVER_DIR/" "$HOST:$BUILD/server/"

echo ">> building on box (1 CPU, low priority)"
ssh "$HOST" "cd $BUILD/server && GOMAXPROCS=1 CGO_ENABLED=0 GOFLAGS=-mod=mod nice -n 15 $GO build -p 1 -trimpath -ldflags='-s -w' -o $BIN.new ."

echo ">> installing binary + systemd unit (previous kept as $BIN.prev)"
rsync -az "$SERVER_DIR/$APP.service" "$HOST:/tmp/$APP.service"
ssh "$HOST" "rm -f /tmp/$APP.service.prev; if [ -f /etc/systemd/system/$APP.service ]; then sudo cp /etc/systemd/system/$APP.service /tmp/$APP.service.prev; fi && \
  if [ -f $BIN ]; then cp -p $BIN $BIN.prev; fi && mv $BIN.new $BIN && \
  sudo mv /tmp/$APP.service /etc/systemd/system/$APP.service && \
  sudo systemctl daemon-reload && sudo systemctl enable --quiet $APP && sudo systemctl restart $APP"

healthy() {
  for i in $(seq 1 15); do
    ssh "$HOST" "systemctl is-active --quiet $APP && curl -fsS -m 3 $HEALTH" >/dev/null 2>&1 && return 0
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
  if healthy; then echo "!! rolled back; previous binary healthy" >&2; else echo "!! ROLLBACK ALSO UNHEALTHY — investigate now" >&2; fi
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

curl -fsS "https://games.br8t.com/$GAME_PATH/net/health" && echo
echo ">> done — wss://games.br8t.com/$GAME_PATH/net/ws"

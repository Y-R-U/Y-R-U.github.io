#!/usr/bin/env bash
# Deploy snakenet (Snake-eee rooms) to the br8t box: build there, install the
# systemd unit, health-check (rolling back on failure), make sure the Caddy
# route exists. STATIC=1 also ships the game client to games.br8t.com. Safe to re-run.
#
#   ./deploy.sh            server only
#   STATIC=1 ./deploy.sh   also the static client → games.br8t.com/gms/pwa/snake/
#
# Optional TURN (strongly recommended — see ../MULTIPLAYER.md): put
#   CF_TURN_KEY_ID=...
#   CF_TURN_KEY_TOKEN=...
# in /srv/data/snakenet/snakenet.env on the box (mode 600). Never in the repo.
set -euo pipefail

HOST="${HOST:-br8t}"
APP=snakenet
PORT=8013
SERVER_DIR="$(cd "$(dirname "$0")" && pwd)"
GAME_DIR="$(cd "$SERVER_DIR/.." && pwd)"
SITE="/srv/apps/br8tgames/site"
GAME_PATH="gms/pwa/snake"
BUILD="/srv/apps/$APP/build"
BIN="/srv/apps/$APP/$APP"
GO=/usr/local/go/bin/go

echo ">> unit tests (local)"
(cd "$SERVER_DIR" && go test ./... >/dev/null)

echo ">> ensuring dirs"
ssh "$HOST" "sudo install -d -o deploy -g deploy /srv/apps/$APP $BUILD $BUILD/server && \
  sudo install -d -m 700 -o deploy -g deploy /srv/data/$APP"

echo ">> syncing server source"
rsync -az --delete --include='go.mod' --include='go.sum' --include='*.go' --exclude='*' \
  "$SERVER_DIR/" "$HOST:$BUILD/server/"

echo ">> building on box (1 CPU, low priority, to spare the live apps)"
ssh "$HOST" "cd $BUILD/server && GOMAXPROCS=1 CGO_ENABLED=0 GOFLAGS=-mod=mod nice -n 15 $GO build -p 1 -trimpath -ldflags='-s -w' -o $BIN.new ."

echo ">> installing binary + systemd unit (previous kept as $BIN.prev)"
rsync -az "$SERVER_DIR/$APP.service" "$HOST:/tmp/$APP.service"
ssh "$HOST" "rm -f /tmp/$APP.service.prev; if [ -f /etc/systemd/system/$APP.service ]; then sudo cp /etc/systemd/system/$APP.service /tmp/$APP.service.prev; fi && \
  if [ -f $BIN ]; then cp -p $BIN $BIN.prev; fi && mv $BIN.new $BIN && \
  sudo mv /tmp/$APP.service /etc/systemd/system/$APP.service && \
  sudo systemctl daemon-reload && sudo systemctl enable --quiet $APP && sudo systemctl restart $APP"

healthy() {
  for i in $(seq 1 15); do
    ssh "$HOST" "systemctl is-active --quiet $APP && curl -fsS -m 3 http://127.0.0.1:$PORT/$GAME_PATH/net/health" >/dev/null 2>&1 && return 0
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
rsync -az "$SERVER_DIR/caddy_route.py" "$HOST:/tmp/snakenet_route.py"
ssh "$HOST" "out=\$(sudo python3 /tmp/snakenet_route.py) && echo \"   \$out\" && \
  case \"\$out\" in *added*) sudo systemctl reload caddy;; esac"

if [ -n "${STATIC:-}" ]; then
  echo ">> static client → $SITE/$GAME_PATH"
  ssh "$HOST" "install -d '$SITE/$GAME_PATH'"
  rsync -az --delete --exclude='server/' --exclude='tools/' --exclude='*.md' --exclude='.DS_Store' \
    "$GAME_DIR/" "$HOST:$SITE/$GAME_PATH/"
fi

echo ">> public checks"
curl -fsS "https://games.br8t.com/$GAME_PATH/net/health" && echo
curl -fsS "https://games.br8t.com/$GAME_PATH/net/stats" && echo
echo ">> done"

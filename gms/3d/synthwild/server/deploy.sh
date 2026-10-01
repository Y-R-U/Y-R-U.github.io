#!/usr/bin/env bash
# Deploy SYNTHWILD to the br8t box: build the Go server there, install the
# systemd unit, make sure the Caddy route exists, then ship the static client
# into the games.br8t.com docroot. Safe to re-run.
#
#   ./deploy.sh              full deploy
#   RUN_TESTS=1 ./deploy.sh  also run server/test.sh on the box before switching
#   SKIP_STATIC=1 ./deploy.sh  server only
set -euo pipefail

HOST="${HOST:-br8t}"
APP=synthwild
PORT=8011
SERVER_DIR="$(cd "$(dirname "$0")" && pwd)"
GAME_DIR="$(cd "$SERVER_DIR/.." && pwd)"
REPO="$(cd "$GAME_DIR/../../.." && pwd)"
SITE="/srv/apps/br8tgames/site"
GAME_PATH="gms/3d/synthwild"
BUILD="/srv/apps/$APP/build"
BIN="/srv/apps/$APP/$APP"
GO=/usr/local/go/bin/go

echo ">> ensuring dirs"
ssh "$HOST" "sudo install -d -o deploy -g deploy /srv/apps/$APP $BUILD $BUILD/server $BUILD/tools /srv/data/$APP && \
  install -d '$SITE/$GAME_PATH' '$SITE/gms/lib/three/0.180.0'"

echo ">> syncing server source"
rsync -az --delete --include='go.mod' --include='go.sum' --include='*.go' --include='test.sh' --exclude='*' \
  "$SERVER_DIR/" "$HOST:$BUILD/server/"
rsync -az "$GAME_DIR/tools/server_mintjwt.go" "$HOST:$BUILD/tools/"

echo ">> building on box"
ssh "$HOST" "cd $BUILD/server && CGO_ENABLED=0 GOFLAGS=-mod=mod $GO build -trimpath -ldflags='-s -w' -o $BIN.new ."

if [ -n "${RUN_TESTS:-}" ]; then
  echo ">> server tests on box"
  ssh "$HOST" "cd $BUILD/server && PATH=/usr/local/go/bin:\$PATH bash test.sh $BIN.new | tail -n 3"
fi

echo ">> installing binary + systemd unit"
rsync -az "$SERVER_DIR/$APP.service" "$HOST:/tmp/$APP.service"
ssh "$HOST" "mv $BIN.new $BIN && sudo mv /tmp/$APP.service /etc/systemd/system/$APP.service && \
  sudo systemctl daemon-reload && sudo systemctl enable --quiet $APP && sudo systemctl restart $APP"

echo ">> Caddy route"
rsync -az "$SERVER_DIR/caddy_route.py" "$HOST:/tmp/caddy_route.py"
ssh "$HOST" "out=\$(sudo python3 /tmp/caddy_route.py) && echo \"   \$out\" && \
  case \"\$out\" in *added*) sudo systemctl reload caddy;; esac"

if [ -z "${SKIP_STATIC:-}" ]; then
  echo ">> static client → $SITE/$GAME_PATH"
  rsync -az --delete --exclude='docs/' --exclude='server/' --exclude='tools/' --exclude='*.md' \
    --exclude='.DS_Store' "$GAME_DIR/" "$HOST:$SITE/$GAME_PATH/"
  echo ">> three.js 0.180.0 (no --delete: shared with other games)"
  rsync -az "$REPO/gms/lib/three/0.180.0/" "$HOST:$SITE/gms/lib/three/0.180.0/"
fi

echo ">> health"
for i in 1 2 3 4 5 6 7 8 9 10; do
  ssh "$HOST" "curl -fsS http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break; sleep 1
done
ssh "$HOST" "systemctl is-active $APP"
curl -fsS "https://games.br8t.com/$GAME_PATH/api/health" && echo
echo ">> done — https://games.br8t.com/$GAME_PATH/"

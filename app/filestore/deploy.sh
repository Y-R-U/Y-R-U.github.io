#!/usr/bin/env bash
# Deploy filestore (files.br8t.com) to the br8t VPS: sync source, build on the
# box, install the systemd unit, point the Caddy vhost at it, restart.
#
# The laptop is arm64 and the box is amd64, so the build happens on the box —
# same pattern as caltrack/vpstats. See ../ionos.readme.txt.
set -euo pipefail

HOST="${HOST:-br8t}"
APP=filestore
DOMAIN="${DOMAIN:-files.br8t.com}"
PORT=8005
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="/srv/apps/$APP/build"
BIN="/srv/apps/$APP/$APP"

echo ">> ensuring dirs"
ssh "$HOST" "sudo install -d -o deploy -g deploy /srv/apps/$APP $BUILD_DIR /srv/data/$APP /srv/data/$APP/files"

echo ">> syncing source"
rsync -az --delete \
  --include='go.mod' --include='go.sum' --include='*.go' \
  --include='web/' --include='web/**' --exclude='*' \
  "$SRC_DIR/" "$HOST:$BUILD_DIR/"

echo ">> building on box"
# GOFLAGS=-mod=mod so a missing go.sum entry is fetched rather than fatal.
ssh "$HOST" "cd $BUILD_DIR && CGO_ENABLED=0 GOFLAGS=-mod=mod /usr/local/go/bin/go build -trimpath -ldflags='-s -w' -o $BIN ."

echo ">> installing systemd unit"
rsync -az "$SRC_DIR/$APP.service" "$HOST:/tmp/$APP.service"
ssh "$HOST" "sudo mv /tmp/$APP.service /etc/systemd/system/$APP.service && sudo systemctl daemon-reload && sudo systemctl enable --now $APP && sudo systemctl restart $APP"

echo ">> pointing $DOMAIN Caddy vhost at 127.0.0.1:$PORT"
rsync -az "$SRC_DIR/caddy_set_block.py" "$HOST:/tmp/caddy_set_block.py"
ssh "$HOST" "sudo python3 /tmp/caddy_set_block.py '$DOMAIN' '127.0.0.1:$PORT' && sudo systemctl reload caddy"

echo ">> status"
ssh "$HOST" "systemctl is-active $APP && curl -fsS http://127.0.0.1:$PORT/healthz && echo"
echo ">> done — https://$DOMAIN"
echo "   first run only: ssh $HOST 'sudo journalctl -u $APP | grep one-time'"

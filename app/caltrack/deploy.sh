#!/usr/bin/env bash
# Deploy caltrack to the br8t VPS:
#   • sync the static SPA  -> /srv/apps/caltrack/static
#   • sync the Go source   -> /srv/apps/caltrack/build, build on the box (CGO-free)
#   • install systemd unit, ensure a Caddy vhost, restart.
# DNS (caltrack.br8t.com -> 74.208.219.127) is added in Cloudflare separately;
# Caddy will fetch the TLS cert automatically once that record resolves.
set -euo pipefail

HOST="${HOST:-br8t}"
APP=caltrack
DOMAIN="${DOMAIN:-caltrack.br8t.com}"
PORT=8003
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="/srv/apps/$APP/build"
STATIC_DIR="/srv/apps/$APP/static"
BIN="/srv/apps/$APP/$APP"

echo ">> ensuring dirs"
ssh "$HOST" "sudo install -d -o deploy -g deploy /srv/apps/$APP $BUILD_DIR $STATIC_DIR /srv/data/$APP"

echo ">> syncing static SPA"
rsync -az --delete \
  --include='index.html' --include='app.css' --include='app.js' --exclude='*' \
  "$SRC_DIR/" "$HOST:$STATIC_DIR/"

echo ">> syncing Go source"
rsync -az --delete \
  --include='go.mod' --include='go.sum' --include='*.go' --exclude='*' \
  "$SRC_DIR/server/" "$HOST:$BUILD_DIR/"

echo ">> building on box"
ssh "$HOST" "cd $BUILD_DIR && /usr/local/go/bin/go mod tidy && CGO_ENABLED=0 /usr/local/go/bin/go build -trimpath -ldflags='-s -w' -o $BIN ."

echo ">> installing systemd unit"
rsync -az "$SRC_DIR/$APP.service" "$HOST:/tmp/$APP.service"
ssh "$HOST" "sudo mv /tmp/$APP.service /etc/systemd/system/$APP.service && sudo systemctl daemon-reload && sudo systemctl enable --now $APP && sudo systemctl restart $APP"

echo ">> ensuring Caddy vhost for $DOMAIN"
ssh "$HOST" "grep -q '$DOMAIN' /etc/caddy/Caddyfile || printf '\n%s {\n\treverse_proxy 127.0.0.1:%s\n}\n' '$DOMAIN' '$PORT' | sudo tee -a /etc/caddy/Caddyfile >/dev/null; sudo systemctl reload caddy || sudo systemctl restart caddy"

echo ">> status"
ssh "$HOST" "systemctl is-active $APP && curl -fsS http://127.0.0.1:$PORT/api/health && echo"
echo ">> done — once Cloudflare DNS for $DOMAIN points at the box, https://$DOMAIN will serve."

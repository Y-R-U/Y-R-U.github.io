#!/usr/bin/env bash
# RAGDOJO on the home network: serves the game AND the arena from this Mac, so phones and
# tablets on the same Wi-Fi play 1v1 against each other with no internet account needed.
#
#   gms/2d/ragdojo/server/lan.sh            (Ctrl-C to stop)
#   PORT=8017 DB=~/.ragdojo/arena-lan.db    optional
#   ARENA_BIN=<prebuilt binary>             optional (tools/arenagate.mjs --lan uses it)
#
# LAN mode: typed names + a per-device id, no daily limit, no STUN/TURN (devices connect over the
# LAN directly, with this Mac relaying if they cannot), and its own database — never mixed with
# games.br8t.com. Results stay in that database with an `uploaded` flag for a later sync.
# It listens on this Mac's 192.* address only, and serves only the game and the shared files the
# page loads (/lib/auth/), never the rest of the site checkout.
set -euo pipefail
cd "$(dirname "$0")"
SITE="$(cd ../../../.. && pwd)"
PORT="${PORT:-8017}"
DB="${DB:-$HOME/.ragdojo/arena-lan.db}"
mkdir -p "$(dirname "$DB")"
if [ -n "${ARENA_BIN:-}" ]; then
  BIN="$ARENA_BIN"
else
  BIN="${TMPDIR:-/tmp}/ragdojo-arena-lan"
  go build -o "$BIN" .
fi
IP="${LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)}"
case "$IP" in
  192.*) ;;
  *) echo "!! no 192.* address on en0/en1 (got '$IP'); family mode needs one. Is Wi-Fi on?" >&2; exit 1 ;;
esac
echo
echo "  RAGDOJO on your home network — open this on each device:"
echo
echo "      http://$IP:$PORT/gms/2d/ragdojo/"
echo
echo "  then ⚔ ARENA. (Ctrl-C here stops it.)"
echo
# Approved event-picture answers, from the art review tool (tools/eventart).
ANSWERS="${ANSWERS:-$HOME/.ragdojo/eventart/answers.json}"
ARENA_LAN=1 ARENA_STATIC="$SITE" ARENA_ADDR="$IP:$PORT" ARENA_DB="$DB" ARENA_EVENT_ANSWERS="$ANSWERS" exec "$BIN"

#!/usr/bin/env bash
# Print a one-time, 15-minute admin login URL for SYNTHWILD (fallback when Google sign-in is unavailable).
# Usage: ./admin-link.sh aaron@itmatters.mobi
set -euo pipefail
[ $# -eq 1 ] || { echo "usage: $0 <admin email>" >&2; exit 2; }
ssh "${HOST:-br8t}" "SYNTHWILD_DATA=/srv/data/synthwild SYNTHWILD_PUBLIC_URL=https://games.br8t.com/gms/3d/synthwild /srv/apps/synthwild/synthwild admin-link '$1'"

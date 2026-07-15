#!/bin/bash
# Package the Trolling Addon into ../files/*.mcaddon (a zip of both packs).
set -e
cd "$(dirname "$0")"
VERSION="1.0.0"
OUT="../files/Trolling-Addon-v${VERSION}.mcaddon"
rm -f "$OUT"
zip -r -X -q "$OUT" TrollingAddon_BP TrollingAddon_RP -x '*.DS_Store'
echo "built $OUT ($(du -h "$OUT" | cut -f1))"

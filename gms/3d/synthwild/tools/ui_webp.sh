#!/bin/bash
# tools/ui_webp.sh <raw.png> <name> [quality]  -> assets/intro/<name>.webp at 1280 wide
cd "$(dirname "$0")/.." && cwebp -quiet -q "${3:-74}" -resize 1280 0 -m 6 "$1" -o "assets/intro/$2.webp" && ls -la "assets/intro/$2.webp" | awk '{print $5, $9}'

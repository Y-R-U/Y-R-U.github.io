#!/usr/bin/env bash
# Squash the chosen Suno takes down to shippable game audio.
#
#   tools/compress_music.sh          # encode the picks in PICKS below -> assets/audio/<id>.mp3
#
# 56 kbps mono @ 32 kHz with a gentle compressor and a limiter. -vn is not optional:
# Suno mp3s carry an embedded cover PNG and without it that art ships inside the game.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RAW="$HERE/../assets/audio/raw"
OUT="$HERE/../assets/audio"

# id                 raw take           chosen because (measured, not heard)
PICKS="
menu:rd_menu_1
fight1:rd_fight1_2
fight2:rd_fight2_1
fight3:rd_fight3_2
fight4:rd_fight4_2
fight5:rd_fight5_2
fight6:rd_fight6_2
fight7:rd_fight7_2
fight8:rd_fight8_2
fight9:rd_fight9_1
fight10:rd_fight10_2
boss:rd_boss_1
final:rd_final_2
victory:rd_victory_1
dmenu:rd_dmenu_1
dfight1:rd_dfight1_2
dfight2:rd_dfight2_1
dfight3:rd_dfight3_1
dfight4:rd_dfight4_2
dfight5:rd_dfight5_1
dfight6:rd_dfight6_1
dboss:rd_dboss_1
dfinal:rd_dfinal_2
dvictory:rd_dvictory_1
"

filter="acompressor=threshold=-18dB:ratio=3:attack=12:release=250,volume=1.15,alimiter=limit=0.95"
tin=0; tout=0
for row in $PICKS; do
  id="${row%%:*}"; take="${row##*:}"
  src="$RAW/$take.mp3"; dst="$OUT/$id.mp3"
  [ -f "$src" ] || { echo "MISSING $src"; exit 1; }
  ffmpeg -y -loglevel error -i "$src" -vn -af "$filter" -ac 1 -ar 32000 -b:a 56k "$dst"
  i=$(stat -f%z "$src"); o=$(stat -f%z "$dst")
  tin=$((tin+i)); tout=$((tout+o))
  printf '  %-9s %-16s %5s KB -> %4s KB   %ss\n' "$id" "$take" $((i/1024)) $((o/1024)) \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dst" | cut -d. -f1)"
done
printf '\ntotal %s KB -> %s KB (%sx)\n' $((tin/1024)) $((tout/1024)) "$(echo "scale=1; $tin/$tout" | bc)"

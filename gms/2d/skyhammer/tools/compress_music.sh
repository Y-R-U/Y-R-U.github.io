#!/usr/bin/env bash
# Squash raw generated music down to shippable game audio.
#
#   tools/compress_music.sh                 # every raw/*.mp3 -> assets/audio/music/
#   tools/compress_music.sh radio foo.mp3   # force the WW2-wireless treatment on one file
#
# Two profiles:
#   full  — 56 kbps mono @ 32 kHz. Themes and battle tracks. ~2.5x smaller than source.
#   radio — bandpassed to a 1940s wireless, then 40 kbps mono @ 22 kHz. ~6x smaller, and the
#           band limiting means the low bitrate is inaudible: the artefacts land where the
#           filter already removed everything. Aaron's idea, and it is free quality.
#
# A file is treated as `radio` if its name contains "radio", "hangar" or "brief", else `full`.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RAW="$HERE/../assets/audio/music/raw"
OUT="$HERE/../assets/audio/music"
mkdir -p "$RAW" "$OUT"

# Steep on purpose. A single ffmpeg lowpass is a gentle rolloff and only bought 6 dB above
# 4 kHz, which does not read as a wireless. Stacked poles get -44 dB up there while the
# 500-2500 Hz band is untouched. Measured, not guessed.
radio_filter="highpass=f=450:poles=2,highpass=f=450:poles=2,lowpass=f=2600:poles=2,lowpass=f=2600:poles=2,lowpass=f=2600:poles=2,acompressor=threshold=-20dB:ratio=5:attack=8:release=180,volume=1.7,alimiter=limit=0.94"
full_filter="acompressor=threshold=-18dB:ratio=3:attack=12:release=250,volume=1.15,alimiter=limit=0.95"

encode () {
  local src="$1" prof="$2" dst="$3"
  if [ "$prof" = radio ]; then
    ffmpeg -y -loglevel error -i "$src" -af "$radio_filter" -ac 1 -ar 22050 -b:a 40k "$dst"
  else
    ffmpeg -y -loglevel error -i "$src" -af "$full_filter"  -ac 1 -ar 32000 -b:a 56k "$dst"
  fi
}

force="${1:-}"; only="${2:-}"
total_in=0; total_out=0
shopt -s nullglob
for src in "$RAW"/*.mp3 "$RAW"/*.wav "$RAW"/*.m4a; do
  base="$(basename "${src%.*}")"
  [ -n "$only" ] && [ "$base.mp3" != "$only" ] && [ "$base" != "$only" ] && continue
  prof="full"
  case "$base" in *radio*|*hangar*|*brief*) prof="radio";; esac
  [ -n "$force" ] && prof="$force"
  dst="$OUT/$base.mp3"
  encode "$src" "$prof" "$dst"
  i=$(stat -f%z "$src"); o=$(stat -f%z "$dst")
  total_in=$((total_in+i)); total_out=$((total_out+o))
  printf '  %-26s %-6s %6s KB -> %5s KB  (%sx)  %ss\n' "$base" "$prof" \
    $((i/1024)) $((o/1024)) "$(echo "scale=1; $i/$o" | bc)" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dst" | cut -d. -f1)"
done
[ $total_out -gt 0 ] && printf '\ntotal %s KB -> %s KB (%sx)\n' \
  $((total_in/1024)) $((total_out/1024)) "$(echo "scale=1; $total_in/$total_out" | bc)"

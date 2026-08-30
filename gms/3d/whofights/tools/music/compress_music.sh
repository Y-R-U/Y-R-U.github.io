#!/usr/bin/env bash
# Squash raw generated music down to shippable game audio.
# Adapted from ../../2d/skyhammer/tools/compress_music.sh.
#
#   tools/music/compress_music.sh                        # every raw/*.mp3 -> audio/music/ at the default
#   tools/music/compress_music.sh vocal                  # re-encode everything at the vocal profile
#   tools/music/compress_music.sh vocal tavern_song_jig_01   # just one track, at that profile
#
# The default is `full`. The others exist so a track can be re-encoded by ear later — the raws are
# kept under audio/music/raw/ (gitignored) precisely so this is possible without regenerating.
# Nothing here judges how good a take sounds; that is a human call.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RAW="$HERE/../../audio/music/raw"
OUT="$HERE/../../audio/music"
mkdir -p "$RAW" "$OUT"

DEFAULT_PROFILE="full"

# profile -> ffmpeg args after -af. Keep these in sync with the table in docs/MUSIC.md.
comp_full="acompressor=threshold=-18dB:ratio=3:attack=12:release=250,volume=1.15,alimiter=limit=0.95"
comp_soft="acompressor=threshold=-20dB:ratio=2.5:attack=15:release=250,volume=1.1,alimiter=limit=0.95"

encode () {
  local src="$1" prof="$2" dst="$3"
  case "$prof" in
    full)  ffmpeg -y -loglevel error -i "$src" -af "$comp_full" -ac 1 -ar 32000 -b:a 56k  "$dst" ;;
    vocal) ffmpeg -y -loglevel error -i "$src" -af "$comp_soft" -ac 1 -ar 32000 -b:a 80k  "$dst" ;;
    bed)   ffmpeg -y -loglevel error -i "$src" -af "$comp_full,lowpass=f=11000" -ac 1 -ar 24000 -b:a 40k "$dst" ;;
    hifi)  ffmpeg -y -loglevel error -i "$src" -af "$comp_soft" -ac 2 -ar 44100 -b:a 128k "$dst" ;;
    *) echo "unknown profile: $prof (full|vocal|bed|hifi)" >&2; exit 2 ;;
  esac
}

prof="${1:-$DEFAULT_PROFILE}"; only="${2:-}"
total_in=0; total_out=0
shopt -s nullglob
for src in "$RAW"/*.mp3 "$RAW"/*.wav; do
  base="$(basename "${src%.*}")"
  [ -n "$only" ] && [ "$base.mp3" != "$only" ] && [ "$base" != "$only" ] && continue
  dst="$OUT/$base.mp3"
  encode "$src" "$prof" "$dst"
  i=$(stat -f%z "$src"); o=$(stat -f%z "$dst")
  total_in=$((total_in+i)); total_out=$((total_out+o))
  printf '  %-26s %-6s %6s KB -> %5s KB  (%sx)\n' "$base" "$prof" \
    $((i/1024)) $((o/1024)) "$(echo "scale=1; $i/$o" | bc)"
done
[ $total_out -gt 0 ] && printf '\ntotal %s KB -> %s KB (%sx)\n' \
  $((total_in/1024)) $((total_out/1024)) "$(echo "scale=1; $total_in/$total_out" | bc)"

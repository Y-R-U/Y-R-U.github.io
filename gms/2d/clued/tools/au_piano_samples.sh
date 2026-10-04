#!/bin/sh
# Rebuild audio/piano/*.mp3 from Salamander Grand Piano V3 (Alexander Holm, CC BY 3.0).
# Usage: tools/au_piano_samples.sh [workdir]   (downloads the FLACs it needs, ~40 MB)
set -e
W=${1:-/tmp/au_salamander}; OUT=$(cd "$(dirname "$0")/.." && pwd)/audio/piano
mkdir -p "$W" "$OUT"
BASE=https://raw.githubusercontent.com/sfzinstruments/SalamanderGrandPiano/master/Samples
NOTES="A0 C1 Ds1 Fs1 A1 C2 Ds2 Fs2 A2 C3 Ds3 Fs3 A3 C4 Ds4 Fs4 A4 C5 Ds5 Fs5 A5 C6 Ds6 Fs6 A6 C7"
for n in $NOTES; do
  oct=$(echo $n | tr -dc 0-9)
  if [ "$oct" -le 1 ]; then D=7; elif [ "$oct" -le 2 ]; then D=6; elif [ "$oct" -le 4 ]; then D=4.5; else D=3; fi
  for v in 5 12; do
    src=$(echo $n | sed 's/s/%23/'); f="$W/${n}v$v.flac"; [ -s "$f" ] || curl -sf -o "$f" "$BASE/${src}v$v.flac"
    L=$([ $v = 5 ] && echo p || echo f)
    FS=$(echo "$D - 1" | bc)
    ffmpeg -loglevel error -y -i "$f" -af "silenceremove=start_periods=1:start_threshold=-60dB,atrim=0:$D,afade=t=out:st=$FS:d=1,aresample=44100" \
      -ac 1 -c:a libmp3lame -b:a 80k "$OUT/${n}$L.mp3"
  done
done
du -ch "$OUT"/*.mp3 | tail -1

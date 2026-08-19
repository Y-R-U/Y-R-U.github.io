#!/usr/bin/env bash
# The radio degradation chain, as a deterministic ffmpeg filter graph.
#
# WHY THIS IS A SCRIPT AND NOT A PROMPT
# A generation prompt asking for "sounds like a cheap two-way radio" is a coin flip: some takes come
# back band-limited, some come back studio-clean, and nothing about the difference is reproducible.
# A filter chain is the same every time and can be re-run over the whole pool after a tweak. The
# runtime radio bus in js/audio.js ALSO band-limits (gate B8 measures its transfer function), so this
# is deliberately a second, gentler pass: it bakes the character — hiss floor, squelch keying, hard
# compression, 24 kbps artefacting — into the asset so a clip sounds like a radio even in a raw
# player, and so the shipped bytes are small.
#
#   tools/radio_fx.sh IN OUT [--pitch 1.03] [--profile close|distant|loud|thin] [--bitrate 16k]
#
# The output is 16 kHz mono. Everything above 3.4 kHz has already been removed by the time the
# encoder sees it, so a 16 kHz sample rate throws away nothing at all and hands libmp3lame roughly
# 40 % more bits per remaining band than 22.05 kHz would at the same bitrate. Internally the chain
# still runs at 22.05 kHz because the pitch-shift and the noise source read better there.
#
# Profiles are not EQ presets for their own sake — they are the four physical situations the lines
# are written for: someone on a headset (close), someone across a windy deck (distant), someone
# shouting into a keyed mic (loud), someone on failing gear (thin).
set -euo pipefail

FFMPEG=${FFMPEG:-/opt/homebrew/bin/ffmpeg}
FFPROBE=${FFPROBE:-/opt/homebrew/bin/ffprobe}

IN=""; OUT=""; PITCH=1.0; PROFILE=close; BITRATE=24k; SEED=0; OUTSR=16000
while [ $# -gt 0 ]; do
  case "$1" in
    --pitch)   PITCH="$2"; shift 2;;
    --profile) PROFILE="$2"; shift 2;;
    --bitrate) BITRATE="$2"; shift 2;;
    --seed)    SEED="$2"; shift 2;;
    --outsr)   OUTSR="$2"; shift 2;;
    *) if [ -z "$IN" ]; then IN="$1"; elif [ -z "$OUT" ]; then OUT="$1"; fi; shift;;
  esac
done
[ -n "$IN" ] && [ -n "$OUT" ] || { echo "usage: radio_fx.sh IN OUT [--pitch P] [--profile close|distant|loud|thin]" >&2; exit 2; }
[ -s "$IN" ] || { echo "radio_fx: input '$IN' is missing or ZERO BYTES" >&2; exit 3; }

# `say -o x.aiff` with a bad --data-format writes a 0-byte file and exits 0. That is this project's
# house bug — a file that exists and contains nothing — so the size check above is not optional.

SR=22050
case "$PROFILE" in
  close)   HP=300;  LP=3400; NOISE=0.055; PRE=1.00; SQ=0.55 ;;
  distant) HP=450;  LP=2900; NOISE=0.115; PRE=0.62; SQ=0.40 ;;
  loud)    HP=320;  LP=3400; NOISE=0.070; PRE=1.55; SQ=0.75 ;;   # driven into the compressor
  thin)    HP=600;  LP=2600; NOISE=0.150; PRE=0.85; SQ=0.65 ;;   # failing gear / distress band
  *) echo "radio_fx: unknown profile '$PROFILE'" >&2; exit 2 ;;
esac

# The synthesiser leaves dead air at both ends of every take. Trimming it before the squelch is
# added is worth ~8 % of the shipped bytes and stops a line sitting under an open carrier for a
# quarter-second before anybody speaks.
HEAD=0.075      # squelch burst before the voice
TAIL=0.130      # squelch burst + hiss decay after it

# Pitch shift that preserves tempo: resample the sample-rate header, then pull the tempo back.
# Used to turn eight installed system voices into a larger cast — a ±8 % shift moves formants too,
# which is what makes it read as a different person rather than the same person sped up.
if [ "$PITCH" = "1.0" ] || [ "$PITCH" = "1" ]; then
  SHIFT="anull"
else
  INV=$(python3 -c "print(f'{1.0/float('$PITCH'):.6f}')")
  SHIFT="asetrate=${SR}*${PITCH},aresample=${SR},atempo=${INV}"
fi

# PRE-PASS. Pitch shift and silence trim happen first, into a temp file, because the main pass has
# to know the FINAL length of the voice: it pads the mix to that length and places the tail squelch
# against it. Doing the trim inside the main pass and computing the length from the input instead
# produced a graph that trimmed the dead air and then `apad`ded exactly as much of it back — the
# filter ran, the output was byte-identical, and the only way to see it was to look at the duration.
TMP="$(mktemp -t radiofx).wav"
trap 'rm -f "$TMP"' EXIT
"$FFMPEG" -y -loglevel error -i "$IN" -af "\
aformat=channel_layouts=mono:sample_fmts=fltp,aresample=${SR},${SHIFT},\
silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0:detection=peak,\
areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0:detection=peak,areverse\
" -ac 1 -ar ${SR} "$TMP"
[ -s "$TMP" ] || { echo "radio_fx: pre-pass produced nothing for $IN" >&2; exit 4; }

DUR=$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$TMP")
TOTAL=$(python3 -c "print(f'{float('$DUR')+$HEAD+$TAIL:.3f}')")
OFFEND=$(python3 -c "print(f'{$TOTAL-$TAIL:.3f}')")

# The noise/squelch track. One pink-noise source shaped by a time expression:
#   0 … HEAD              full-level burst  → the mic keying up
#   HEAD … OFFEND         a low hiss floor  → an open carrier
#   OFFEND … end          burst decaying    → the mic keying down
# `eval=frame` is required; without it `volume` evaluates the expression once and you get a constant.
NOISE_ENV="if(lt(t,${HEAD}), ${SQ}, if(gt(t,${OFFEND}), ${SQ}*0.8*exp(-(t-${OFFEND})*26), ${NOISE}))"

"$FFMPEG" -y -loglevel error \
  -i "$TMP" \
  -f lavfi -t "$TOTAL" -i "anoisesrc=c=pink:r=${SR}:a=1.0:seed=${SEED}" \
  -filter_complex "\
[0:a]aformat=channel_layouts=mono:sample_fmts=fltp,volume=${PRE},\
adelay=$(python3 -c "print(int($HEAD*1000))"),apad=whole_dur=${TOTAL},\
highpass=f=${HP}:p=2,highpass=f=${HP}:p=2,highpass=f=${HP}:p=2,\
lowpass=f=${LP}:p=2,lowpass=f=${LP}:p=2,lowpass=f=${LP}:p=2,\
equalizer=f=1800:t=q:w=1.1:g=4,\
acompressor=threshold=-26dB:ratio=12:attack=4:release=90:makeup=9[v];\
[1:a]aformat=channel_layouts=mono:sample_fmts=fltp,\
highpass=f=${HP}:p=2,highpass=f=${HP}:p=2,lowpass=f=${LP}:p=2,lowpass=f=${LP}:p=2,\
volume=volume='${NOISE_ENV}':eval=frame[n];\
[v][n]amix=inputs=2:duration=first:weights='1 1':normalize=0,\
acompressor=threshold=-14dB:ratio=20:attack=1:release=40:makeup=2,\
alimiter=limit=0.94:level=disabled,\
aresample=${SR}[out]" \
  -map "[out]" -ac 1 -ar ${OUTSR} -c:a libmp3lame -b:a "$BITRATE" "$OUT"

[ -s "$OUT" ] || { echo "radio_fx: produced nothing for $IN" >&2; exit 4; }

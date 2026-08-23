#!/usr/bin/env python3
"""Stage 1 of both VO pipelines: Kokoro-82M, batched.

    <abogen python> tools/vo/kokoro_say.py jobs.json          # jobs.json is a list of
                                                              # {voice, text, speed, out}

This file is **not run by the project's python**. It runs under the interpreter Abogen installed,
which is the one that already has `kokoro` and its weights:

    /Users/aaronair/.local/share/uv/tools/abogen/bin/python

── WHY THIS REPLACED macOS `say` ──────────────────────────────────────────────

S2-B synthesised the whole 207-clip pool with `say` and measured it with whisper: 90.7 %
intelligibility. Aaron played it and said *"it sounds like a computer voice from the 90s."* Both
statements are true. Whisper measures whether a word is RECOGNISABLE; nothing in that number can
see prosody, and prosody is the entire difference between a formant synthesiser and a neural one.
So the acceptance test for this file is a person listening — `--demo` builds the tape for that —
and everything measured here is a build check for takes that came out empty or truncated, not a
quality score.

── WHY IT IS BATCHED ──────────────────────────────────────────────────────────

`KPipeline(lang_code=…)` loads an 82 M-parameter model and its phonemiser: ~6 s. Generating one
line then takes ~1 s. Spawning a process per clip would spend 20 minutes of the 25 loading the same
weights 226 times, so the caller collects every job it needs and hands them over once. Pipelines
are cached per lang_code ('a' = US English, 'b' = GB English — the first letter of the voice name).

── WHAT IT REFUSES TO WRITE ───────────────────────────────────────────────────

A take whose RMS is below FLOOR_DB, or shorter than MIN_SEC. `say -o` writing a zero-byte file and
exiting 0 is this project's house bug; the neural equivalent is a pipeline that yields no chunks
for text it could not phonemise, which returns cleanly and leaves nothing. Both are caught here,
where the failure is still attributable to one line, rather than downstream where it becomes a clip
that "exists".
"""
import json, math, os, sys

os.environ.setdefault('HF_HUB_DISABLE_PROGRESS_BARS', '1')
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')

SR = 24000            # Kokoro's native rate. Resampling happens later, in the ffmpeg stages.
FLOOR_DB = -60.0      # a real take measures -24 to -26; silence measures below -90
MIN_SEC = 0.20


def main():
    jobs = json.load(open(sys.argv[1]))
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    pipes = {}
    out = []
    for j in jobs:
        voice = j['voice']
        lc = voice[0]
        if lc not in pipes:
            pipes[lc] = KPipeline(lang_code=lc)
        chunks = [a for _, _, a in pipes[lc](j['text'], voice=voice, speed=float(j.get('speed', 1.0)))]
        if not chunks:
            out.append({'out': j['out'], 'error': f"kokoro yielded NO audio for {voice}: {j['text'][:60]!r}"})
            continue
        a = np.asarray(np.concatenate(chunks) if len(chunks) > 1 else chunks[0], dtype=np.float32)
        rms = 10 * math.log10(float((a * a).mean()) + 1e-20)
        peak = 20 * math.log10(float(np.abs(a).max()) + 1e-12)
        sec = len(a) / SR
        if rms < FLOOR_DB or sec < MIN_SEC:
            out.append({'out': j['out'], 'error': f"{voice} rendered {sec:.2f}s at {rms:.1f} dBFS — "
                                                  f"nobody spoke (floor {FLOOR_DB}, min {MIN_SEC}s)"})
            continue
        os.makedirs(os.path.dirname(j['out']), exist_ok=True)
        sf.write(j['out'], a, SR)
        out.append({'out': j['out'], 'sec': round(sec, 3), 'rms': round(rms, 2),
                    'peak': round(peak, 2), 'words': len(j['text'].split()),
                    'wpm': round(len(j['text'].split()) / max(sec, 1e-6) * 60, 1)})
    print('\x1e' + json.dumps(out))
    return 0


if __name__ == '__main__':
    sys.exit(main())

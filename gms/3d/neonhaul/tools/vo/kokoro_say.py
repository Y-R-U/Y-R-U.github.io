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

── §S2-S — CARRIER TAKES, AND WHY THE CUT HAPPENS HERE ────────────────────────

Aaron, on the shipped build: *"the male voice sounds awful, at least the first 3 times he
speaks."* Those three are the interruptions — 'But—', 'Wait—', 'Just wait—' — and gen_story.py's
`for_say()` renders an em dash as a comma, so what this file was actually handed was **"But,"**.
One word and a trailing comma is close to the worst input a neural TTS can be given: there is no
sentence for it to shape, and a comma is the punctuation of a man trailing off politely rather than
one being cut off mid-protest. It is not a fault of the voice — measured on the SHIPPED clips,
`pc_m_int1` moves 12.8 semitones against the female take's 10.1, so the male read is not the flat
one. It is the input.

Aaron's fix: *"you could generate more text around it with punctuation around the key words and
separate the words after if that helps?"* That is what `keep_words` does. Give this file the whole
sentence the character was going to say — "But I never even asked for any of this." — and ask it to
keep only the first n words. Kokoro then renders "But" with the rising, unfinished intonation of a
sentence that has somewhere to go, and the cut removes the rest. Which is what being interrupted
sounds like.

**The cut is made HERE, and not in ffmpeg downstream, because this is the only place the word
boundaries exist.** kokoro 0.9.4's Result carries per-token `start_ts`/`end_ts` (see
`KPipeline.join_timestamps`), so "the end of the first word" is a number the model reports rather
than something a silence detector has to guess at — and there IS no silence to detect: the whole
point of the carrier is that the words run together. An earlier attempt trimmed by a fixed FRACTION
of the take and cut mid-vowel on two of the three lines.

`overlap` then extends the cut a little INTO the next word. A real interruption does not end on a
clean word boundary; it ends on the front of the syllable the other person talked over.

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
        res = list(pipes[lc](j['text'], voice=voice, speed=float(j.get('speed', 1.0))))
        chunks = [r.audio for r in res]
        if not chunks:
            out.append({'out': j['out'], 'error': f"kokoro yielded NO audio for {voice}: {j['text'][:60]!r}"})
            continue
        a = np.asarray(np.concatenate(chunks) if len(chunks) > 1 else chunks[0], dtype=np.float32)

        # § carrier. Keep the first `keep_words` words of a longer sentence, cut on the model's own
        # word boundary. Refused rather than guessed if the timestamps are not there: a silent
        # fallback to "keep everything" would ship a take that says the whole carrier sentence,
        # which is a defect that reads as a script error rather than as an audio one.
        keep = int(j.get('keep_words', 0) or 0)
        cut_ts = None
        if keep:
            if len(chunks) > 1:
                out.append({'out': j['out'], 'error': f"carrier take for {voice} split into "
                                                      f"{len(chunks)} chunks; timestamps are per chunk"})
                continue
            toks = [t for t in (res[0].tokens or []) if t.text and t.text.strip()
                    and t.end_ts is not None]
            if len(toks) < keep:
                out.append({'out': j['out'], 'error': f"carrier take for {voice} reported "
                                                      f"{len(toks)} timed words, needed {keep}: "
                                                      f"{j['text'][:60]!r}"})
                continue
            cut_ts = float(toks[keep - 1].end_ts) + float(j.get('overlap', 0.0))
            n = min(len(a), max(1, int(cut_ts * SR)))
            a = a[:n].copy()
            # A hard edge clicks. 30 ms is short enough to still read as "cut off" rather than
            # "faded out", which is the whole point of the take.
            f = min(len(a), int(0.030 * SR))
            if f > 1:
                a[-f:] *= np.linspace(1.0, 0.0, f, dtype=np.float32)
        rms = 10 * math.log10(float((a * a).mean()) + 1e-20)
        peak = 20 * math.log10(float(np.abs(a).max()) + 1e-12)
        sec = len(a) / SR
        if rms < FLOOR_DB or sec < MIN_SEC:
            out.append({'out': j['out'], 'error': f"{voice} rendered {sec:.2f}s at {rms:.1f} dBFS — "
                                                  f"nobody spoke (floor {FLOOR_DB}, min {MIN_SEC}s)"})
            continue
        os.makedirs(os.path.dirname(j['out']), exist_ok=True)
        sf.write(j['out'], a, SR)
        rec = {'out': j['out'], 'sec': round(sec, 3), 'rms': round(rms, 2),
               'peak': round(peak, 2), 'words': len(j['text'].split()),
               'wpm': round(len(j['text'].split()) / max(sec, 1e-6) * 60, 1)}
        if cut_ts is not None:
            rec['cut_ts'] = round(cut_ts, 4)
            rec['kept'] = keep
        out.append(rec)
    print('\x1e' + json.dumps(out))
    return 0


if __name__ == '__main__':
    sys.exit(main())

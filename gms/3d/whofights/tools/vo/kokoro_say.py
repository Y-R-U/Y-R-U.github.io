#!/usr/bin/env python3
"""Kokoro-82M text to speech, batched. Lifted from ../neonhaul/tools/vo/kokoro_say.py.

    <abogen python> tools/vo/kokoro_say.py jobs.json     # a list of {voice, text, speed, out}

Run it under the interpreter Abogen installed — the one that already has `kokoro` and its weights,
NOT the system python:

    /Users/aaronair/.local/share/uv/tools/abogen/bin/python

**Batched on purpose.** `KPipeline(lang_code=...)` loads an 82 M model and its phonemiser in ~6 s;
generating a line then costs ~1 s. A process per clip would spend nearly all of a run loading the
same weights again, so callers collect every job they need and hand them over once. Pipelines are
cached per lang_code ('a' = US English, 'b' = GB English - the first letter of the voice name).
tools/devserver.mjs `/api/tts/batch` is the caller; `/api/tts` is the same thing with one job.

**It refuses to write a bad take.** Below FLOOR_DB or shorter than MIN_SEC and the job comes back
as an error instead of a file. A pipeline that could not phonemise its text returns cleanly and
yields nothing; the resulting zero-byte clip that "exists" is this house's classic bug, and it is
caught here where the failure is still attributable to one line.

**Carrier takes (`keep_words`).** A neural TTS handed "But," has no sentence to shape and reads it
as a man trailing off politely, not one being cut off. Give it the whole sentence the character was
going to say and ask for the first n words back. The cut is made HERE because this is the only
place the word boundaries exist - kokoro 0.9.4 reports per-token `start_ts`/`end_ts`, and there is
no silence for a downstream detector to find: the carrier's whole point is that the words run
together. `overlap` extends the cut a little into the next word, because a real interruption ends
on the front of the syllable the other person talked over.
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

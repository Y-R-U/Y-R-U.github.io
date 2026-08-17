#!/usr/bin/env python3
"""Cut one Suno spoken-word take into per-line mp3s.

Suno puts a quiet bed under spoken word, so `silencedetect` finds ~7 gaps where a
22-line take needs 21. Energy thresholding fails for the same reason. What works —
learned on Sunderfall, see gms/2d/sunderfall/docs/VO-TIMING-RECIPE.md — is:

    whisper for IDENTITY and ORDER, never for exact edges.

We already know the exact text of every line, and we know Suno reads them in order.
So this aligns the known script against whisper's word stream with difflib and reads
the timings off the matched words. Alignment is immune to the drift that makes raw
whisper timestamps unusable, because a word only supplies a time once the aligner has
already agreed which word it is.

    python3 split_take.py <take.mp3> <script.json> <outdir> [--dry]

script.json: {"group": "dispatch", "lines": [{"file": "dispatch_01.mp3",
             "text": "Haul Control to all couriers ..."}, ...]}  in spoken order.
"""
import json, re, subprocess, sys, difflib, pathlib

PAD_HEAD = 0.10   # pre-roll so a fade-in cannot clip the first consonant
PAD_TAIL = 0.15   # whisper's ends are accurate but tight
CPS_LO, CPS_HI = 7.0, 26.0   # outside this a boundary is wrong, not the line short
GAP_REAL = 2.2               # a gap longer than this is real silence, not a mis-assignment
MODEL = 'mlx-community/whisper-small.en-mlx'


def norm(t):
    return re.sub(r"[^a-z0-9' ]", ' ', t.lower()).split()


def transcribe(path):
    import mlx_whisper
    r = mlx_whisper.transcribe(str(path), path_or_hf_repo=MODEL,
                               word_timestamps=True, condition_on_previous_text=False)
    words = []
    for s in r['segments']:
        for w in s.get('words', []):
            for tok in norm(w['word']):
                words.append((tok, float(w['start']), float(w['end'])))
    return words


def align(script_lines, words):
    """Map each script line to a (start, end) using a global token alignment."""
    tgt, owner = [], []
    for i, ln in enumerate(script_lines):
        for tok in norm(ln['text']):
            tgt.append(tok); owner.append(i)
    got = [w[0] for w in words]

    sm = difflib.SequenceMatcher(None, tgt, got, autojunk=False)
    # for each target token index -> matched whisper token index
    hit = {}
    for a, b, n in sm.get_matching_blocks():
        for k in range(n):
            hit[a + k] = b + k

    spans, misses = [], []
    for i in range(len(script_lines)):
        idx = [hit[j] for j in range(len(tgt)) if owner[j] == i and j in hit]
        n_tok = sum(1 for o in owner if o == i)
        if not idx:
            spans.append(None); misses.append(i); continue
        spans.append((words[min(idx)][1], words[max(idx)][2], len(idx), n_tok))
    return spans, misses


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry' in sys.argv
    take, script_path, outdir = pathlib.Path(args[0]), pathlib.Path(args[1]), pathlib.Path(args[2])
    spec = json.loads(script_path.read_text())
    lines = spec['lines']
    outdir.mkdir(parents=True, exist_ok=True)

    words = transcribe(take)
    print(f"whisper: {len(words)} words")
    spans, misses = align(lines, words)

    ok, report = True, []
    for i, ln in enumerate(lines):
        s = spans[i]
        if s is None:
            print(f"  !! {ln['file']}: NO MATCH — line absent from the take")
            ok = False; report.append({'file': ln['file'], 'status': 'missing'}); continue
        start, end, matched, n_tok = s
        # Boundaries go at the MIDPOINT of the inter-line gap, not at the matched
        # word edges. Whisper regularly mis-assigns a line's opening words to the
        # previous segment ("Logged. Clock's running." vanished; "Logged" became
        # "Ugged"), and a midpoint boundary recovers them because the words are in
        # the gap either way. Only fall back to word edges when the gap is long
        # enough to be real silence.
        prev_end = spans[i - 1][1] if i > 0 and spans[i - 1] else None
        next_start = spans[i + 1][0] if i + 1 < len(spans) and spans[i + 1] else None

        if prev_end is not None and start - prev_end < GAP_REAL:
            a = prev_end + (start - prev_end) * 0.35
        else:
            a = start - PAD_HEAD
        if next_start is not None and next_start - end < GAP_REAL:
            b = end + (next_start - end) * 0.55
        else:
            b = end + PAD_TAIL
        a = max(0.0, a)
        dur = b - a
        cps = len(ln['text']) / max(0.01, dur)
        cov = matched / n_tok
        flag = ''
        if not (CPS_LO <= cps <= CPS_HI): flag += ' CPS'
        if cov < 0.6: flag += ' COVERAGE'
        if flag: ok = False
        print(f"  {ln['file']:28s} {a:7.2f} +{dur:5.2f}  cps={cps:5.1f} cov={cov:4.0%}{flag}")
        report.append({'file': ln['file'], 'start': round(a, 3), 'dur': round(dur, 3),
                       'cps': round(cps, 1), 'coverage': round(cov, 3), 'flag': flag.strip()})
        if not dry:
            # -ss BEFORE -i, and asetpts first in the chain. With output seeking the
            # filter graph still sees ORIGINAL timestamps, so an afade=t=out:st=<n>
            # has already completed and silences the whole clip. Cost an hour once.
            subprocess.run(['ffmpeg', '-v', 'error', '-y',
                            '-ss', f'{a:.3f}', '-t', f'{dur:.3f}', '-i', str(take),
                            '-map', '0:a',                       # Suno embeds cover art
                            '-ac', '1', '-ar', '32000',
                            '-af', 'asetpts=PTS-STARTPTS,afade=t=in:d=0.04,'
                                   'afade=t=out:st=%.3f:d=0.08' % max(0.0, dur - 0.08),
                            '-c:a', 'libmp3lame', '-q:a', '8',
                            str(outdir / ln['file'])], check=True)

    (outdir / f"_report_{spec['group']}.json").write_text(json.dumps(report, indent=1))
    print(('OK' if ok else 'REVIEW NEEDED') + f" — {len(lines)} lines -> {outdir}")
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())

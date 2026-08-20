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

    python3 split_take.py <take.mp3> <script.json> <outdir> [--dry] [--no-verify]

script.json: {"group": "dispatch", "lines": [{"file": "dispatch_01.mp3",
             "text": "Haul Control to all couriers ..."}, ...]}  in spoken order.
"""
import json, re, subprocess, sys, difflib, pathlib

PAD_HEAD = 0.10   # pre-roll so a fade-in cannot clip the first consonant
PAD_TAIL = 0.15   # whisper's ends are accurate but tight
CPS_LO, CPS_HI = 7.0, 26.0   # outside this a boundary is wrong, not the line short
GAP_REAL = 2.2               # a gap longer than this is real silence, not a mis-assignment
MODEL = 'mlx-community/whisper-small.en-mlx'


_ONES = ('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen '
         'fifteen sixteen seventeen eighteen nineteen').split()
_TENS = ('', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety')


def _num_words(n):
    if n < 20:
        return [_ONES[n]]
    if n < 100:
        return [_TENS[n // 10]] + ([_ONES[n % 10]] if n % 10 else [])
    if n < 1000:
        return [_ONES[n // 100], 'hundred'] + (_num_words(n % 100) if n % 100 else [])
    for div, name in ((10 ** 9, 'billion'), (10 ** 6, 'million'), (1000, 'thousand')):
        if n >= div:
            return _num_words(n // div) + [name] + (_num_words(n % div) if n % div else [])
    return [str(n)]


def norm(t):
    """Tokens, with numbers canonicalised to WORDS on both sides of the alignment.

    Whisper writes a spoken "fifty thousand" as **50,000**, which used to tokenise to `50` / `000`
    and could never match the script's `fifty` / `thousand`. Those two tokens then went unmatched,
    which pushed the measured gap to the previous line out to 2.21 s against `GAP_REAL = 2.2` —
    so the aligner took the real-silence branch and cut at a word edge in the middle of the number.
    `boss_05` shipped starting on the word "credits".

    Every automatic check passed it. Coverage read 0.882 against a 0.6 threshold and the byte count
    was unremarkable, which is the whole reason `verify_cuts()` below exists: the only check that
    could have caught it is one that listens to what was actually written.
    """
    t = re.sub(r'(?<=\d),(?=\d)', '', t.lower())          # 50,000 -> 50000, before punctuation goes
    out = []
    for tok in re.sub(r"[^a-z0-9' ]", ' ', t).split():
        out.extend(_num_words(int(tok)) if tok.isdigit() and len(tok) <= 12 else [tok])
    return out


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


def verify_cuts(lines, outdir):
    """Transcribe every clip that was just written and check it says its own line.

    This is the check that was missing. `cps` and `coverage` are computed from the ALIGNMENT — they
    describe the tool's own opinion of where the words were, so a boundary placed in the wrong place
    is scored by the same numbers that put it there. Reading the finished file back is the only
    measurement in this pipeline that is independent of the decision it is auditing.

    The claim is deliberately weak and therefore trustworthy: the clip's opening tokens must be the
    line's opening tokens. That is exactly the failure a mis-cut produces and it needs no threshold
    tuned against a corpus.
    """
    bad = []
    for ln in lines:
        f = outdir / ln['file']
        if not f.exists():
            bad.append((ln['file'], 'missing', '')); continue
        heard = norm(' '.join(w[0] for w in transcribe(f)))
        want = norm(ln['text'])
        head_w, head_h = want[:3], heard[:3]
        ratio = difflib.SequenceMatcher(None, want, heard, autojunk=False).ratio()
        # A clipped head is the defect; a ragged tail is normal (the fade takes the last phoneme).
        head_ok = bool(head_h) and difflib.SequenceMatcher(None, head_w, head_h).ratio() >= 0.6
        print(f"  {ln['file']:28s} heard {ratio:4.0%}  head {'ok  ' if head_ok else 'CUT '}"
              f"{' '.join(head_h) or '(silence)'}")
        if not head_ok or ratio < 0.55:
            bad.append((ln['file'], f'{ratio:.0%}', ' '.join(head_h)))
    return bad


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

    if not dry and '--no-verify' not in sys.argv:
        print('verify — transcribing the cut clips back:')
        bad = verify_cuts(lines, outdir)
        if bad:
            ok = False
            for f, r, h in bad:
                print(f"  !! {f}: starts \"{h}\" ({r} of the line) — re-cut this one by hand")

    print(('OK' if ok else 'REVIEW NEEDED') + f" — {len(lines)} lines -> {outdir}")
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())

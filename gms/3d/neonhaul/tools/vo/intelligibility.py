#!/usr/bin/env python3
"""Transcribe every foreground chatter clip and score it against the line it is supposed to say.

    tools/vo/vw/bin/python tools/vo/intelligibility.py [--group life] [--worst 20] [--json out.json]

WHY THIS EXISTS
`gen_chatter.py --verify` proves a clip contains speech and is the right length. Neither of those
says the words came out. A voice at 235 wpm behind a 300–3400 Hz band-limit and two stages of hard
compression can measure perfectly and still be mush, and the only way to find out is to listen to
203 clips — or to have something listen for you. This runs whisper-small.en over every foreground
clip and reports the word-sequence match against the manifest text.

READ THE NUMBER FOR WHAT IT IS. It is not "how intelligible is this to a human". Whisper is itself
degraded by the same band-limit, it has no idea what a Ninefold Approach is, and it writes "40" for
"forty". A clip at 60 % is usually a clip whose proper nouns whisper never had a chance with. What
the score is genuinely good for is RANKING: the bottom of this list is where the real mush is, and
comparing a voice's mean before and after a rate or profile change is a controlled measurement of
that change. Every fix in this pool was chosen off that comparison, not off the absolute number.

Needs the tools/vo/vw venv (mlx_whisper). It is not wired into any gate: it takes ~2 minutes and it
is a tuning instrument, not a pass/fail line.
"""
import argparse, difflib, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODEL = 'mlx-community/whisper-small.en-mlx'

# Numbers, and the handful of spellings whisper will never get, are normalised away so the score
# measures whether the WORDS arrived rather than whether the transcriber knows the city.
NUM = {'0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six',
       '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten', '11': 'eleven', '12': 'twelve',
       '14': 'fourteen', '20': 'twenty', '22': 'twenty two', '30': 'thirty', '40': 'forty',
       '41': 'forty one', '50': 'fifty', '60': 'sixty', '100': 'one hundred', '140': 'one hundred and forty',
       '200': 'two hundred', '300': 'three hundred', '320': 'three hundred and twenty', '400': 'four hundred'}


def norm(s):
    s = s.lower().replace("’", "'")
    s = re.sub(r'[^a-z0-9\' ]', ' ', s)
    out = []
    for w in s.split():
        out += NUM.get(w, w).split()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--group', action='append')
    ap.add_argument('--worst', type=int, default=20)
    ap.add_argument('--json')
    a = ap.parse_args()

    import mlx_whisper
    M = json.load(open(os.path.join(ROOT, 'assets/audio/manifest.json')))
    L = json.load(open(os.path.join(ROOT, 'tools/vo/lines.json')))
    voiceOf = {}
    for g, gd in L['groups'].items():
        for i, ln in enumerate(gd['lines'], 1):
            v = ln.get('v')
            voiceOf[f'{g}_{i:02d}'] = 'SUNO' if ln.get('src') == 'suno' else (v if isinstance(v, str) else '+'.join(v))

    rows = []
    fore = [c for c in M['chatter'] if c['layer'] == 'fore' and (not a.group or c['group'] in a.group)]
    for n, c in enumerate(fore, 1):
        r = mlx_whisper.transcribe(os.path.join(ROOT, 'assets/audio', c['file']),
                                   path_or_hf_repo=MODEL, language='en', verbose=False)
        got = r['text'].strip()
        score = difflib.SequenceMatcher(None, norm(c['text']), norm(got)).ratio()
        rows.append({'slot': c['slot'], 'group': c['group'], 'voice': voiceOf.get(c['slot'], '?'),
                     'score': round(score, 3), 'want': c['text'], 'got': got})
        print(f"\r  {n}/{len(fore)}  {c['slot']:22s} {score*100:5.1f}%   ", end='', file=sys.stderr, flush=True)
    print('', file=sys.stderr)

    def mean(rs):
        return sum(r['score'] for r in rs) / max(1, len(rs))

    print(f"\n{len(rows)} foreground clips, mean word-sequence match {mean(rows)*100:.1f}%\n")
    print("by group:")
    for g in sorted({r['group'] for r in rows}):
        rs = [r for r in rows if r['group'] == g]
        print(f"  {g:18s} {mean(rs)*100:5.1f}%   ({len(rs)} clips, worst {min(r['score'] for r in rs)*100:.0f}%)")
    print("\nby voice:")
    for v in sorted({r['voice'] for r in rows}):
        rs = [r for r in rows if r['voice'] == v]
        print(f"  {v:12s} {mean(rs)*100:5.1f}%   ({len(rs)} clips)")
    print(f"\nworst {a.worst}:")
    for r in sorted(rows, key=lambda r: r['score'])[:a.worst]:
        print(f"  {r['score']*100:5.1f}%  {r['slot']:20s} [{r['voice']}]")
        print(f"          want: {r['want'][:96]}")
        print(f"          got : {r['got'][:96]}")
    if a.json:
        json.dump({'mean': mean(rows), 'rows': rows}, open(a.json, 'w'), indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main())

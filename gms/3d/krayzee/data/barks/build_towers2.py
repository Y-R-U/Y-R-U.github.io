#!/usr/bin/env python3
"""Render script for the map towers (C-Tower 2 Farmer Mudge, C-Tower 3 Mr Fennimore, C-Tower 4 RAF Much Snoring). Run after editing
data/airports/farm-lines.js or airbase-lines.js, then render with tools/voice/gen_barks.py --script data/barks/towers2.json, then
build_towers2.py --fix-peaks.

The radio loads these lines from the airport defs (def.towerLines), not from script.json, so they are kept out of
script.json (loading them twice would double every variant). This file only feeds the renderer:
  tower_farm  every line + its own callsign splices (titles, digits), light West Country `say` spelling
  tower_butler every line + its own callsign splices; render-time maxSeconds for his slow pace
  tower_raf   every line; its callsign and runway splices are tower_f's clips copied across (same saved voice),
              written straight into audio/voices/barks.json so the renderer skips them
"""
import json, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '../..'))
VOICES = os.path.join(ROOT, 'audio/voices')
sys.path.insert(0, HERE)
from build_script import SPLICE_TITLES, DIGITS  # noqa: E402

JS = """
const [{ FARM_LINES }, { AIRBASE_LINES }, { PALACE_LINES }] = await Promise.all([import('./data/airports/farm-lines.js'), import('./data/airports/airbase-lines.js'), import('./data/airports/palace-lines.js')]);
process.stdout.write(JSON.stringify({ farm: FARM_LINES, raf: AIRBASE_LINES, butler: PALACE_LINES }));
"""

# Light, so Whisper still follows: the saved reference already carries the burr ("moi cows", "Oi've").
WEST = [(r"\bI'm\b", "Oi'm"), (r"\bI've\b", "Oi've"), (r"\bI'll\b", "Oi'll"), (r"\bI'd\b", "Oi'd"), (r"\bI\b", 'Oi'),
        (r'\bmy\b', 'moi')]


def west(text):
    out = text
    for pat, rep in WEST:
        out = re.sub(pat, lambda m, rep=rep: rep.upper() if m.group(0).isupper() and len(m.group(0)) > 1 else rep, out)
    return out


def splices(voice):
    out = [{'id': f'{voice}.cs_title_{w}', 'voice': voice, 'intent': 'splice_title', 'text': w.replace('_', ' ').title(),
            'delivery': 'level list intonation, no final fall', 'maxSeconds': 1.4} for w in SPLICE_TITLES]
    out += [{'id': f'{voice}.cs_digit_{d}', 'voice': voice, 'intent': 'splice_digit', 'text': d.title(),
             'delivery': 'flat ATC digit, cut from one list read', 'maxSeconds': 0.7} for d in DIGITS]
    return out


def alias_raf(raf):
    """tower_raf = tower_f's saved voice: copy its splice clips under tower_raf ids (title, digit, rwy)."""
    bj = os.path.join(VOICES, 'barks.json')
    B = json.load(open(bj))
    M = json.load(open(os.path.join(VOICES, 'manifest.json')))
    src = B['tower_f']
    dst = B.setdefault('tower_raf', {})
    os.makedirs(os.path.join(VOICES, 'tower_raf'), exist_ok=True)
    n = 0
    for l in raf:
        if l['intent'] not in ('splice_title', 'splice_digit', 'splice_rwy'):
            continue
        key = l['id'].split('.', 1)[1]
        e = src.get(f'tower_f.{key}')
        if not e:
            print('no tower_f clip for', l['id']); continue
        f = f"tower_raf/{l['id']}.mp3"
        shutil.copyfile(os.path.join(VOICES, e['file']), os.path.join(VOICES, f))
        dst[l['id']] = {**e, 'file': f, 'text': l['text'], 'voiceId': M['tower_raf']['voiceId'], 'copiedFrom': e['file']}
        n += 1
    tmp = bj + '.tmp'
    json.dump(B, open(tmp, 'w'), indent=1, ensure_ascii=False)
    os.replace(tmp, bj)
    return n


def peak(path):
    out = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    m = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', out)
    return float(m[-1]) if m else -70.0


def fix_peaks(ceiling=-1.2):
    """Mudge's gravel overshoots the -1.5 dBTP limiter once encoded (up to +0.1 dBTP); the original clips top out at
    -1.2. Turn any new tower clip above the ceiling down by the excess and re-encode (48 kbps mono 24 kHz)."""
    bj = os.path.join(VOICES, 'barks.json')
    B = json.load(open(bj))
    n = 0
    for v, ids in B.items():
        for k, e in ids.items():
            if not (v in ('tower_farm', 'tower_raf', 'tower_butler') or '.scold_nudge' in k) or e.get('copiedFrom'):
                continue
            f = os.path.join(VOICES, e['file'])
            for _ in range(3):
                pk = peak(f)
                if pk <= ceiling:
                    break
                tmp = f + '.tmp.mp3'
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f, '-af', f'volume={ceiling - 0.3 - pk:.2f}dB',
                                '-ac', '1', '-ar', '24000', '-b:a', '48k', tmp], check=True)
                os.replace(tmp, f)
                e['bytes'] = os.path.getsize(f); n += 1
    json.dump(B, open(bj + '.tmp', 'w'), indent=1, ensure_ascii=False); os.replace(bj + '.tmp', bj)
    print('peak-fixed', n, 'passes')


def main():
    if '--fix-peaks' in sys.argv:
        return fix_peaks()
    d = json.loads(subprocess.run(['node', '--input-type=module', '-e', JS], cwd=ROOT, check=True, capture_output=True, text=True).stdout)
    farm = []
    for l in d['farm']:
        l = dict(l)
        s = west(l['text'])
        if s != l['text']:
            l['say'] = s; l['subtitle'] = l['text']
        farm.append(l)
    farm += splices('tower_farm')
    # Fennimore is slow on purpose: render-time cap ~2.4 words/s (palace-lines.js says 5 s flat), so his takes keep
    # their pace instead of being sped up to fit
    butler = [dict(l, maxSeconds=round(min(6.5, 0.8 + len(l['text'].split()) / 2.4), 1)) for l in d['butler']]
    butler += splices('tower_butler')
    raf = list(d['raf'])
    raf += [l for l in splices('tower_raf')]
    lines = farm + raf + butler
    ids = [l['id'] for l in lines]
    assert len(ids) == len(set(ids)), 'duplicate ids'
    doc = {'version': 1, 'notes': 'Generated by build_towers2.py for gen_barks.py only. The game loads these lines from '
           'data/airports/*-lines.js; splice clips are found by id.', 'lines': lines}
    json.dump(doc, open(os.path.join(HERE, 'towers2.json'), 'w'), ensure_ascii=False, indent=1)
    n = alias_raf(raf)
    print(f'tower_farm {len(farm)} ({len(d["farm"])} lines + {len(farm) - len(d["farm"])} splices); '
          f'tower_raf {len(raf)} ({n} splice clips copied from tower_f); tower_butler {len(butler)} ({len(d["butler"])} lines + 33 splices)')


if __name__ == '__main__':
    main()

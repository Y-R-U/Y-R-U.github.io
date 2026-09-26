"""Transcribe clips with CPU faster-whisper and compare with the script text (catches garbled takes).

  uv run --offline --with faster-whisper python asr_check.py            # every clip in the manifest
  uv run --offline --with faster-whisper python asr_check.py key1 key2
Writes asr_report.json (key -> score, heard). Score = word-sequence similarity 0..1; < 0.75 is flagged.
CPU only (int8), so it is safe to run next to the GPU services.
"""
import difflib, json, os, re, sys
from faster_whisper import WhisperModel

HERE = os.path.dirname(os.path.abspath(__file__))
VO = os.path.normpath(os.path.join(HERE, '..', '..', 'audio', 'vo'))
REPORT = os.path.join(HERE, 'asr_report.json')
NUMW = set('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen '
           'seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand and'.split())


def words(t):
    """Normalised word list; numbers are dropped on both sides (Whisper writes digits, scripts spell them)."""
    w = re.findall(r"[a-z0-9']+", t.lower().replace('-', ' '))
    w = [x.strip("'") for x in w]
    return [x for x in w if x and not x.isdigit() and x not in NUMW and not re.fullmatch(r'(m+|hm+|la)', x)]


def main():
    mf = json.load(open(os.path.join(VO, 'manifest.json')))
    rep = json.load(open(REPORT)) if os.path.exists(REPORT) else {}
    keys = sys.argv[1:] or sorted(mf)
    model = WhisperModel('base.en', device='cpu', compute_type='int8')
    bad = []
    for k in keys:
        e = mf[k]
        segs, _ = model.transcribe(os.path.join(VO, e['file']), beam_size=1, language='en')
        heard = ' '.join(s.text.strip() for s in segs)
        a, b = words(e['text']), words(heard)
        score = round(difflib.SequenceMatcher(None, a, b).ratio(), 2) if a else 1.0
        rep[k] = dict(score=score, heard=heard, text=e['text'])
        if score < 0.75:
            bad.append(k)
            print(f'FLAG {k} {score}: "{heard}"', flush=True)
    json.dump(rep, open(REPORT, 'w'), indent=1, ensure_ascii=False)
    print(f'{len(keys)} checked, {len(bad)} flagged:', ' '.join(bad))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
r"""§S2-T — the Kokoro bench: type the exact text, hear it, keep what works.

Aaron: *"if you want me to fix the glitches, plug in kokoro and allow me to edit the exact text and
regen, I'll edit till it sounds good and you will see what works vs what was bad. may be good for
later to ensure we can safely do scripts in future?"*

Right on both counts. Every VO round so far has been: I guess at an input, batch-render a tape, and
he listens hours later. The loop that actually converges is the one where the person judging can
change the input, so this puts the model behind a text box.

    <abogen python> tools/vo/bench/server.py          # http://<lan-ip>:8789/

WHY A SERVER AND NOT A SCRIPT. `KPipeline` is ~6 s to load and ~1 s to generate. Re-running a script
per edit would spend the whole session loading the same 82 M weights, and a six-second wait per
tweak is the difference between iterating and giving up. This loads both English pipelines once and
holds them.

EXACT MEANS EXACT. Aaron: *"everything after previous word up until next word … includes any white
space, special chars including words and carriage returns etc. as certain combos can cause issues."*
So the text is passed through byte for byte — no strip, no collapse — and the page prints `repr()`
of what was sent alongside the audio, because a trailing space and a trailing non-breaking space
look the same on screen and do not sound the same. `escapes` decodes `\n` / `\t` / `\xNN` typed as
literal backslash sequences, since a textarea cannot produce a lone carriage return.

WHAT IT SHOWS THAT A TAPE CANNOT — **the phonemes**. Aaron: *"some words need to change due to
kokoro being blind to context, e.g. words sound different based on context, e.g. read. therefore we
would need to spell it how it sounds instead?"* Respelling works, but it is a guess at the
phonemiser's behaviour, and misaki has a real override: `[read](/ɹɛd/)` forces pronunciation
without touching the spelling. So every take returns the IPA the model actually used. When a word
comes out wrong you can SEE that it chose `ɹiːd` over `ɹɛd` instead of inferring it from the audio,
which turns "spell it differently until it sounds right" into a one-shot correction.

(Worth knowing before reaching for it: Kokoro is not as context-blind as feared — it already reads
"I read the book yesterday" as `ɹˈɛd`. The override is for where it does fail, not everywhere.)

THE CHAIN TOGGLE MATTERS. `room()` pitches, compresses, puts the voice in a cabin and normalises to
-16 LUFS. A take judged raw is a take that never reaches the player — this project has already made
that mistake once, auditioning raw Kokoro output for a game that ships the treated chain. So `chain`
is ON by default and the raw take is the option, not the other way round.

NOTHING HERE WRITES TO THE GAME. It renders into its own `takes/` directory and hands back JSON.
Promoting a line into a script is a deliberate, separate edit to gen_story.py.
"""
import http.server, json, os, socket, socketserver, subprocess, sys, threading, time, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
VO = os.path.dirname(HERE)
TAKES = os.path.join(HERE, 'takes')     # scratch: one live take per line, swept on every start
ANSWERS = os.path.join(HERE, 'answers.json')
KEEP = os.path.join(HERE, 'keep')       # approved: ONE file per slot, stable name, survives
PORT = int(os.environ.get('PORT', '8789'))
SR = 24000
sys.path.insert(0, VO)

os.environ.setdefault('HF_HUB_DISABLE_PROGRESS_BARS', '1')
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')

VOICES = """af_alloy af_aoede af_bella af_heart af_jessica af_kore af_nicole af_nova af_river
af_sarah af_sky am_adam am_echo am_eric am_fenrir am_liam am_michael am_onyx am_puck am_santa
bf_alice bf_emma bf_isabella bf_lily bm_daniel bm_fable bm_george bm_lewis""".split()

# The story cast, so a line can be auditioned at the settings it would actually ship at rather than
# at whatever the sliders happen to be on. Imported rather than restated — if gen_story.py recasts,
# this follows.
from gen_story import (VOICES as CAST, BOSS, PC, room, for_say,                 # noqa: E402
                       suno_src, OUT as STORY_OUT)

def dad_lines():
    """Dad's two lines, parsed out of js/story.js THREAD_SCENE — the only place they exist.

    He is not in gen_story.py at all: THREAD_SCENE is a silent text panel today, so these are lines
    the game DISPLAYS and has never spoken. Aaron cast bm_lewis for him off the §S2-T audition.
    """
    import re
    js = open(os.path.join(os.path.dirname(os.path.dirname(VO)), 'js', 'story.js')).read()
    seg = js[js.index('export const THREAD_SCENE'):js.index('export function newThread')]
    out, n = [], 0
    for m in re.finditer(r"who: '(\w+)', text: ((?:'(?:[^'\\]|\\.)*'\s*\+?\s*)+)", seg):
        if m.group(1) != 'dad':
            continue
        n += 1
        out.append((f'dad{n}', ''.join(re.findall(r"'((?:[^'\\]|\\.)*)'", m.group(2)))))
    return out


def script():
    """Every spoken line in the story, with what it is, who says it, and what ships for it.

    Three populations, and they are NOT interchangeable — which is the whole reason this is one
    list rather than a text box:

      player  Kokoro, three takes per line (m/f/n). Editable and re-renderable right here.
      boss    a SUNO PERFORMANCE, not synthesis. The text can be changed, but the take cannot be
              re-rendered from this page — that means recording it again in SUNO. Marked, so a
              tweak is never quietly auditioned in the wrong voice.
      dad     cast (bm_lewis) but NEVER RECORDED. There is no shipped clip to compare against.
    """
    rows = []
    for slot, text in BOSS:
        rows.append({'id': slot, 'who': 'boss', 'label': slot.replace('_', ' '), 'text': text,
                     'voice': CAST['boss']['voice'], 'speed': CAST['boss']['speed'],
                     'pitch': CAST['boss']['pitch'], 'shipped': slot,
                     'engine': 'suno' if suno_src(slot) else 'kokoro'})
    for slot, text in PC:
        for g in ('m', 'f', 'n'):
            c = CAST[f'pc_{g}']
            rows.append({'id': f'pc_{g}_{slot}', 'who': f'pc_{g}', 'label': f'{slot} · {g}',
                         'text': text, 'voice': c['voice'], 'speed': c['speed'],
                         'pitch': c['pitch'], 'shipped': f'pc_{g}_{slot}', 'engine': 'kokoro'})
    for slot, text in dad_lines():
        rows.append({'id': slot, 'who': 'dad', 'label': slot, 'text': text,
                     'voice': 'bm_lewis', 'speed': 1.0, 'pitch': 1.0,
                     'shipped': None, 'engine': 'kokoro'})
    return {'rows': rows}


SHIPPED_SLOTS = set()

def _ok_id(i):
    return isinstance(i, str) and len(i) == 10 and all(c in '0123456789abcdef' for c in i)


def _ok_slot(s):
    """A slot the SCRIPT names, and nothing else. The keeper filename is built from this, so an
    allow-list is the only safe source for it — 'slot' arriving from a page is a filename."""
    return isinstance(s, str) and s in SHIPPED_SLOTS


def sweep():
    """takes/ is scratch and is emptied on every start.

    Nothing outside a live page ever refers to a scratch take: the page replaces its own take when
    you re-speak a line, and an approved one has already been MOVED to keep/. 146 files and 3.9 MB
    had piled up before keepers existed, which is what this exists to stop."""
    n = 0
    for f in os.listdir(TAKES):
        if f.endswith(('.wav', '.mp3')):
            os.remove(os.path.join(TAKES, f)); n += 1
    return n


_pipes, _lock = {}, threading.Lock()
_np = _sf = _KP = None


def warm():
    global _np, _sf, _KP
    import numpy as np, soundfile as sf                                # noqa: E402
    from kokoro import KPipeline                                       # noqa: E402
    _np, _sf, _KP = np, sf, KPipeline
    for lc in ('a', 'b'):
        _pipes[lc] = KPipeline(lang_code=lc)
    print('  both pipelines warm', flush=True)


def render(text, voice, speed, pitch, chain):
    """One take. Returns (path, meta) or raises."""
    lc = voice[0]
    with _lock:
        pipe = _pipes.get(lc) or _pipes.setdefault(lc, _KP(lang_code=lc))
        res = list(pipe(text, voice=voice, speed=float(speed)))
    if not res:
        raise ValueError('kokoro yielded no audio for that text')
    a = _np.asarray(_np.concatenate([r.audio for r in res]) if len(res) > 1 else res[0].audio,
                    dtype=_np.float32)
    import math
    rms = 10 * math.log10(float((a * a).mean()) + 1e-20)
    # The house bug, guarded here too: a pipeline that phonemised to nothing returns cleanly and
    # leaves a file that "exists". A bench that plays silence teaches the wrong lesson fastest.
    if rms < -60.0 or len(a) / SR < 0.15:
        raise ValueError(f'take came out empty — {len(a) / SR:.2f}s at {rms:.1f} dBFS')
    tid = uuid.uuid4().hex[:10]
    wav = os.path.join(TAKES, tid + '.wav')
    _sf.write(wav, a, SR)
    out = wav
    if chain:
        out = os.path.join(TAKES, tid + '.mp3')
        room(wav, out, float(pitch), 1.0)
    return out, {
        'id': tid, 'sec': round(len(a) / SR, 3), 'rms': round(rms, 2),
        'phonemes': ' | '.join((r.phonemes or '') for r in res),
        # CHUNKS. Kokoro segments the text and generates each piece separately; the pieces are then
        # concatenated. A newline forces a split, so "But,\nWait," renders as TWO takes joined end
        # to end and runs half a second longer than the same words separated by spaces. That join is
        # not a pause the model chose, and it is the first thing to suspect when a line reads with
        # an odd gap in it. It is also why `keep_words` refuses a multi-chunk take: the timestamps
        # it cuts on are per chunk.
        'chunks': len(res),
        # The URL the page will fetch, NOT the bare filename. Takes are written to bench/takes/ and
        # the server's document root is bench/, so a bare basename 404s — which it did, for every
        # take, while the page reported "playback blocked" because that is what its catch-all said
        # instead of what the browser actually raised.
        'file': 'takes/' + os.path.basename(out),
    }


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=HERE, **kw)

    def _json(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_HEAD(self):
        # Routed the SAME as GET. It was not, so a HEAD on /shipped/<slot> 404'd while the GET
        # behind the audio element was fine — and play()'s error path probes with HEAD, so a
        # blocked autoplay came back reported as a missing file. That is the third time in this
        # bench a diagnostic has confidently named the wrong cause; a probe that is not routed the
        # way the real request is routed is not probing the real request.
        return self.do_GET(head=True)

    def do_GET(self, head=False):
        path = self.path.split('?')[0]
        if path == '/script':
            d = script()
            for r in d['rows']:
                k = os.path.join(KEEP, r['id'] + '.mp3')
                r['kept'] = f"keep/{r['id']}.mp3" if os.path.isfile(k) else None
            return self._json(d)
        if path.startswith('/shipped/'):
            # Slot name only, and it must be one the script actually names. The clips live outside
            # this server's document root, so this is a deliberate hole in it and is kept to an
            # allow-list rather than a sanitised path.
            slot = path[len('/shipped/'):]
            if slot not in SHIPPED_SLOTS:
                return self.send_error(404)
            f = os.path.join(STORY_OUT, slot + '.mp3')
            if not os.path.isfile(f):
                return self.send_error(404)
            b = open(f, 'rb').read()
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Content-Length', str(len(b)))
            self.end_headers()
            return None if head else self.wfile.write(b)
        if path == '/voices':
            return self._json({'voices': VOICES,
                               'cast': {k: v for k, v in CAST.items()}})
        return super().do_HEAD() if head else super().do_GET()

    def do_POST(self):
        if self.path.rstrip('/') == '/answers':
            # The reliable way to get results off the phone. navigator.clipboard does not exist
            # outside a secure context, and this server is plain http on a LAN address, so Copy
            # could never have worked from a phone at all — on Android or on iOS. Saving to the
            # server needs no clipboard, no permission and no secure context.
            n = int(self.headers.get('Content-Length') or 0)
            if n > 2_000_000:
                return self.send_error(413)
            try:
                body = json.loads(self.rfile.read(n) or b'{}')
            except Exception as e:
                return self.send_error(400, str(e))
            tmp = ANSWERS + '.tmp'
            with open(tmp, 'w') as f:
                json.dump(body, f, indent=1, ensure_ascii=False)
            os.replace(tmp, ANSWERS)
            print(f"  saved answers -> {os.path.basename(ANSWERS)}", flush=True)
            return self._json({'ok': True})

        if self.path.rstrip('/') == '/keep':
            # Promote a scratch take to the slot's keeper. Aaron: *"I don't want endless copies of
            # the file. let me just correct and play, if i hit tick, that entry is the only one
            # worth saving."* So a keeper has a name derived from the SLOT, not from the take —
            # ticking a new one overwrites the old, and there is never more than one per line.
            n = int(self.headers.get('Content-Length') or 0)
            try:
                j = json.loads(self.rfile.read(n) or b'{}')
            except Exception as e:
                return self.send_error(400, str(e))
            tid, slot = j.get('id'), j.get('slot')
            if not _ok_id(tid) or not _ok_slot(slot):
                return self._json({'error': 'bad id or slot'}, 400)
            moved = []
            for ext in ('.wav', '.mp3'):
                src = os.path.join(TAKES, tid + ext)
                if os.path.isfile(src):
                    os.replace(src, os.path.join(KEEP, slot + ext))
                    moved.append(ext)
            if not moved:
                return self._json({'error': 'that take is no longer on disk'}, 200)
            return self._json({'ok': True, 'kept': f'keep/{slot}.mp3'})

        if self.path.rstrip('/') == '/unkeep':
            n = int(self.headers.get('Content-Length') or 0)
            try:
                slot = (json.loads(self.rfile.read(n) or b'{}') or {}).get('slot')
            except Exception as e:
                return self.send_error(400, str(e))
            if not _ok_slot(slot):
                return self._json({'error': 'bad slot'}, 400)
            gone = 0
            for ext in ('.wav', '.mp3'):
                f = os.path.join(KEEP, slot + ext)
                if os.path.isfile(f):
                    os.remove(f); gone += 1
            return self._json({'ok': True, 'removed': gone})

        if self.path.rstrip('/') == '/delete':
            n = int(self.headers.get('Content-Length') or 0)
            try:
                ids = (json.loads(self.rfile.read(n) or b'{}') or {}).get('ids') or []
            except Exception as e:
                return self.send_error(400, str(e))
            # The id is the ONLY thing accepted, and it must look like one we minted: ten hex
            # characters. Taking a filename from the page and joining it onto a directory is how a
            # scratch endpoint becomes an arbitrary-file-delete, and 'takes/../../js/main.js' is a
            # perfectly ordinary-looking string.
            gone = 0
            for i in ids:
                if not (isinstance(i, str) and len(i) == 10 and all(c in '0123456789abcdef' for c in i)):
                    continue
                for ext in ('.wav', '.mp3'):
                    f = os.path.join(TAKES, i + ext)
                    if os.path.isfile(f):
                        os.remove(f)
                        gone += 1
            return self._json({'ok': True, 'removed': gone})
        if self.path.rstrip('/') != '/say':
            return self.send_error(404)
        n = int(self.headers.get('Content-Length') or 0)
        if n > 200_000:
            return self.send_error(413)
        try:
            j = json.loads(self.rfile.read(n) or b'{}')
        except Exception as e:
            return self.send_error(400, str(e))
        # EXACT. Aaron: *"what i mean by exact text btw is everything after previous word up until
        # next word. that includes any white space, special chars including words and carriage
        # returns etc. as certain combos can cause issues."* The first version of this line called
        # .strip(), so a leading space or a trailing newline — precisely the kind of combination he
        # is hunting — could never reach the model. Nothing is trimmed, collapsed or normalised
        # here; the only transform is `for_say`, and that one is a toggle and is shown.
        raw = j.get('text')
        if not isinstance(raw, str) or raw == '':
            return self._json({'error': 'no text'}, 400)
        # Optional escape decoding, so an invisible character can be typed deliberately. A textarea
        # cannot produce a lone \r or a \t, and those are exactly the ones that bite.
        if j.get('escapes'):
            try:
                raw = raw.encode('utf-8').decode('unicode_escape').encode('latin-1').decode('utf-8')
            except Exception as e:
                return self._json({'error': f'bad escape sequence: {e}'}, 200)
        voice = j.get('voice') or 'am_echo'
        if voice not in VOICES:
            return self._json({'error': f'unknown voice {voice}'}, 400)
        # `for_say` is what gen_story.py hands the model. Applying it here by default is the whole
        # point of the bench being honest: an em dash BECOMES a comma on the way to Kokoro, and a
        # line tuned without that step is tuned against a different input than the one that ships.
        text = for_say(raw) if j.get('for_say', True) else raw
        if text == '':
            return self._json({'error': 'that reduced to an empty string before it reached kokoro'}, 200)
        t0 = time.time()
        try:
            path, meta = render(text, voice, j.get('speed', 1.0), j.get('pitch', 1.0),
                                bool(j.get('chain', True)))
        except Exception as e:
            return self._json({'error': str(e)}, 200)
        # repr() of both, so the page can show the exact characters rather than a rendering of them:
        # a trailing space and a trailing non-breaking space look identical in HTML and do not sound
        # identical.
        meta.update({'sent': text, 'raw': raw, 'sent_repr': repr(text), 'raw_repr': repr(raw),
                     'chars': len(text), 'changed': text != raw,
                     'voice': voice, 'ms': int((time.time() - t0) * 1000),
                     'speed': j.get('speed', 1.0), 'pitch': j.get('pitch', 1.0),
                     'chain': bool(j.get('chain', True))})
        return self._json(meta)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


def lan():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('192.0.2.1', 1))       # TEST-NET-1: routed nowhere, just names the interface
        return s.getsockname()[0]
    finally:
        s.close()


class TS(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


if __name__ == '__main__':
    os.makedirs(TAKES, exist_ok=True)
    os.makedirs(KEEP, exist_ok=True)
    # Every line id is a valid keeper slot, including dad's, which has no shipped clip.
    SHIPPED_SLOTS.update(r['shipped'] for r in script()['rows'] if r['shipped'])
    SHIPPED_SLOTS.update(r['id'] for r in script()['rows'])
    swept = sweep()
    print('NEONHAUL Kokoro bench — loading the model (~6 s) …', flush=True)
    warm()
    print(f'  this machine   http://127.0.0.1:{PORT}/')
    print(f'  ON YOUR PHONE  http://{lan()}:{PORT}/')
    print(f'  swept {swept} scratch take(s); keepers in {KEEP}')
    print('  ctrl-c to stop', flush=True)
    TS(('0.0.0.0', PORT), H).serve_forever()

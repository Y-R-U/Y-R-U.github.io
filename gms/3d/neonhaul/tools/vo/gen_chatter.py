#!/usr/bin/env python3
"""Build the whole radio chatter pool from tools/vo/lines.json.

    python3 tools/vo/gen_chatter.py              # synthesise + degrade + write manifest + verify
    python3 tools/vo/gen_chatter.py --only life  # one group
    python3 tools/vo/gen_chatter.py --verify     # measure what is on disk, generate nothing
    python3 tools/vo/gen_chatter.py --demo       # one mp3 per voice, for listening to
    python3 tools/vo/gen_chatter.py --calibrate  # re-measure each voice's words-per-minute

Three stages, and the third is the one that matters.

1. VOICE — **Kokoro-82M**, via tools/vo/kokoro_say.py. Was macOS `say` until 2026-08-20, when Aaron
   played the shipped build and said *"it sounds like a computer voice from the 90s."* He is right,
   and the number that hid it is instructive: S2-B measured the `say` pool with whisper at 90.7 %
   intelligibility and shipped on that. Intelligibility measures whether a word is RECOGNISABLE. It
   cannot see prosody, and prosody is the whole difference. **The acceptance test for the voice is
   a person listening to `--demo`; everything measured in this file is a build check.**

   Lines whose audio already exists as a SUNO take are NOT re-synthesised — they come out of
   tools/vo/raw/suno/ and only get stage 2 — unless `--resynth-suno` is passed, which is how the
   Kokoro pass took the pool over to one consistent cast. The SUNO originals are never overwritten
   (see cmd_build), so that decision is one flag away from being reversed.

2. RADIO — tools/radio_fx.sh. Deterministic ffmpeg, not a prompt. See that file for why.

3. VERIFY — and this is the part to read. Stage 2 mixes a hiss floor and two squelch bursts into
   every clip, which means whole-file RMS is no longer evidence that anybody SPOKE: a clip whose
   `say` step produced nothing still comes out of stage 2 at a healthy −30 dBFS of pink noise, and
   would sail through any "decodes, has duration, has energy" check — including the browser-side one
   in gates_p8 B5. This project has already shipped a silent clip past exactly that class of check.
   So verification measures the SPEECH WINDOW (between the two squelch bursts) against a floor
   derived from a control clip built by running SILENCE through the identical chain, and it also
   checks that duration tracks word count. `--falsify` proves both can fail.
"""
import argparse, json, os, re, shutil, subprocess, sys, math, hashlib
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VO = os.path.join(ROOT, 'tools/vo')
CH = os.path.join(ROOT, 'assets/audio/chatter')
# Both live under tools/vo/raw/, which .gitignore already excludes — the raw takes are ~40 MB
# and are fully derived from lines.json, except the SUNO originals which cannot be rebuilt.
RAW_TTS = os.path.join(VO, 'raw/tts')
RAW_SUNO = os.path.join(VO, 'raw/suno')
FX = os.path.join(ROOT, 'tools/radio_fx.sh')
FFMPEG = os.environ.get('FFMPEG', '/opt/homebrew/bin/ffmpeg')
FFPROBE = os.environ.get('FFPROBE', '/opt/homebrew/bin/ffprobe')
SR = 22050

# stage-2 constants, kept in step with tools/radio_fx.sh
HEAD, TAIL = 0.075, 0.130

# The 26 slots whose audio came from SUNO and must never be re-synthesised.
SUNO_SLOTS = ([f'dispatch_{i:02d}' for i in range(1, 7)]
              + [f'dispatch_confirm_{i:02d}' for i in range(1, 9)]
              + [f'dispatch_pay_{i:02d}' for i in range(1, 9)]
              + [f'bg_net_{i:02d}' for i in range(1, 5)])


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed ({r.returncode}): {(r.stderr or r.stdout)[-400:]}")
    return r


def dur(path):
    return float(run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration',
                      '-of', 'csv=p=0', path]).stdout.strip())


def samples(path):
    """Decode to mono float32 at SR. Returns a plain list-backed array of floats."""
    raw = subprocess.run([FFMPEG, '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1',
                          '-ar', str(SR), '-'], capture_output=True).stdout
    import array
    a = array.array('f')
    a.frombytes(raw[:len(raw) - len(raw) % 4])
    return a


def rms_db(a):
    if not len(a):
        return -999.0
    s = 0.0
    for v in a:
        s += v * v
    return 10 * math.log10(s / len(a) + 1e-20)


# ── stage 1: voice ─────────────────────────────────────────────────────────

def for_say(text):
    """The manifest text is what the player READS; this is what the synthesiser is given.

    Shouted lines are stored upper-case (SUNO.md rule 3) but a grapheme-to-phoneme front end reads a
    short upper-case word as an initialism — "IT IS" becomes "eye tee eye ess" — so the shout is
    carried by the `loud` radio profile instead and the synthesiser gets ordinary case. Kokoro's
    misaki front end does this as readily as `say` did."""
    t = text.replace('—', ',').replace('–', ',').replace('…', '.')
    t = t.replace('’', "'").replace('“', '').replace('”', '')
    if t == t.upper():
        t = t.capitalize()
    return re.sub(r'\s+', ' ', t).strip()


# ── Kokoro, batched ────────────────────────────────────────────────────────
#
# Abogen's uv tool install is the interpreter that has kokoro 0.9.4 and the cached Kokoro-82M
# weights. It is not this project's python and there is no HTTP endpoint to POST to — Abogen's own
# :8808 is htmx against /wizard/upload and has no one-shot TTS route — so the library is driven
# directly, in ONE subprocess for the whole run: KPipeline costs ~6 s to construct and ~1 s per
# line, so a process per clip would spend 20 of 25 minutes loading the same weights.
KOKORO_PY = os.environ.get('KOKORO_PY',
                           '/Users/aaronair/.local/share/uv/tools/abogen/bin/python')


def kokoro_batch(jobs, label='tts', specdir=None):
    """jobs: [{voice, text, speed, out}]. Returns {out: measurement}. Raises on any refusal.

    Every take is written as 24 kHz wav — Kokoro's native rate — and the ffmpeg stages resample
    from there. A `say`-era .aiff and this are equally readable to stage 2, so nothing downstream
    had to change."""
    if not jobs:
        return {}
    if not os.path.exists(KOKORO_PY):
        raise RuntimeError(f"KOKORO_PY does not exist: {KOKORO_PY}. This is Abogen's uv tool "
                           f"interpreter — the one with kokoro and the cached weights in it.")
    specdir = specdir or RAW_TTS
    os.makedirs(specdir, exist_ok=True)
    spec = os.path.join(specdir, f'_jobs_{label}.json')
    json.dump(jobs, open(spec, 'w'))
    env = dict(os.environ, HF_HUB_DISABLE_PROGRESS_BARS='1')
    print(f"  kokoro: {len(jobs)} takes in one process …", flush=True)
    r = subprocess.run([KOKORO_PY, os.path.join(VO, 'kokoro_say.py'), spec],
                       capture_output=True, text=True, env=env)
    # The worker prints its JSON after an ASCII record separator, because kokoro's own imports write
    # warnings to stdout and a bare json.loads of the whole stream fails on them.
    if '\x1e' not in r.stdout:
        raise RuntimeError(f"kokoro_say produced no result record (rc {r.returncode}):\n"
                           f"{(r.stderr or r.stdout)[-1200:]}")
    res = json.loads(r.stdout.rsplit('\x1e', 1)[1])
    errs = [x['error'] for x in res if 'error' in x]
    if errs:
        raise RuntimeError('kokoro refused ' + str(len(errs)) + ' take(s): ' + '; '.join(errs[:6]))
    return {x['out']: x for x in res}


def overlap(parts, gap, out):
    """Background lines are several people talking over each other, so each voice is rendered on its
    own and then stacked with a delay. Mixing INSIDE one `say` call is not possible and mixing after
    the radio chain would double the squelch."""
    ins, filt, labs = [], [], []
    for i, p in enumerate(parts):
        ins += ['-i', p]
        filt.append(f"[{i}:a]aformat=channel_layouts=mono,aresample={SR},adelay={int(i * gap * 1000)},volume={1.0 if i == 0 else 0.85}[p{i}]")
        labs.append(f"[p{i}]")
    filt.append(''.join(labs) + f"amix=inputs={len(parts)}:duration=longest:normalize=0[out]")
    run([FFMPEG, '-y', '-v', 'error', *ins, '-filter_complex', ';'.join(filt),
         '-map', '[out]', '-ac', '1', '-ar', str(SR), out])


# ── stage 2: radio ─────────────────────────────────────────────────────────

def radio(src, dst, profile, pitch, seed, bitrate):
    run(['bash', FX, src, dst, '--profile', profile, '--pitch', f'{pitch:g}',
         '--seed', str(seed), '--bitrate', bitrate])


# ── stage 3: verify ────────────────────────────────────────────────────────

def measure(path):
    """Whole-clip RMS, and the RMS of the SPEECH WINDOW only — the span between the head and tail
    squelch bursts. The second number is the one that can tell a spoken clip from a clip that is
    nothing but the hiss the radio chain itself adds."""
    a = samples(path)
    n = len(a)
    d = n / SR
    i0 = min(n, int((HEAD + 0.05) * SR))
    i1 = max(i0, n - int((TAIL + 0.05) * SR))
    return {'dur': round(d, 3), 'rms': round(rms_db(a), 2),
            'speech': round(rms_db(a[i0:i1]), 2),
            'peak': round(20 * math.log10(max((abs(v) for v in a), default=1e-12) + 1e-12), 2),
            'bytes': os.path.getsize(path)}


def control_floor(profile='close', bitrate='16k'):
    """Run a clip in which NOBODY SPEAKS through the identical chain, and measure it. That number is
    what a take whose `say` step produced nothing would score, so it is the only defensible place to
    put the speech floor — a floor picked by eye is a floor that measures the person who picked it.

    The control is four seconds of digital silence with a 2 ms marker at each end. The markers are
    there because radio_fx.sh trims silence from both ends: without them the pre-pass correctly
    reduces the file to nothing and there is no control to measure. (That is not a hole — a take
    that really is pure silence now fails the BUILD, loudly, rather than becoming a clip. --falsify
    demonstrates both halves.)"""
    tmp = os.path.join(RAW_TTS, f'_control_{profile}.wav')
    out = os.path.join(RAW_TTS, f'_control_{profile}.mp3')
    run([FFMPEG, '-y', '-v', 'error', '-f', 'lavfi', '-t', '4',
         '-i', f"aevalsrc='if(lt(t,0.002),0.03,if(gt(t,3.998),0.03,0))':s={SR}", '-ac', '1', tmp])
    radio(tmp, out, profile, 1.0, 0, bitrate)
    return measure(out)


# ── the pool ───────────────────────────────────────────────────────────────

def load():
    return json.load(open(os.path.join(VO, 'lines.json')))


def slots(spec):
    """(slot, group, groupdef, line) for every slot, numbered by position."""
    for g, gd in spec['groups'].items():
        for i, ln in enumerate(gd['lines'], 1):
            yield f'{g}_{i:02d}', g, gd, ln


# A `src='suno'` dispatch line still has its text, so it CAN be re-cast onto the Kokoro operators —
# the three Haul Control voices, rotated by position so one group is not one speaker. The four
# `bg_net` SUNO takes have no `t` at all (a back slot never shows text, §10.3 rule 3) and so cannot
# be re-synthesised from anything; they stay SUNO whatever the flag says.
def resynth_voice(slot, g, i):
    return ['ctrl_a', 'ctrl_b', 'ctrl_c'][i % 3]


def parts_of(spec, slot, ln, g, idx, resynth_suno):
    """(voice_key, text, wav_path) for every take this slot needs, or None if it comes from SUNO."""
    if ln.get('src') == 'suno':
        if not resynth_suno or not ln.get('t'):
            return None
        vkeys, texts = [resynth_voice(slot, g, idx)], [ln['t']]
    else:
        vkeys = ln['v'] if isinstance(ln['v'], list) else [ln['v']]
        texts = ln['t'] if isinstance(ln['t'], list) else [ln['t']]
    return [(vk, tx, os.path.join(RAW_TTS, f'{slot}_{k}.wav'))
            for k, (vk, tx) in enumerate(zip(vkeys, texts))]


def build_one(spec, slot, g, gd, ln, idx, bitrate, resynth_suno):
    voices = spec['voices']
    dst = os.path.join(CH, slot + '.mp3')
    ps = parts_of(spec, slot, ln, g, idx, resynth_suno)
    if ps is None:
        src = os.path.join(RAW_SUNO, slot + '.mp3')
        if not os.path.exists(src):
            raise RuntimeError(f"{slot}: src='suno' but {src} is missing — the original take is the "
                               f"only input that is not derived, so it cannot be rebuilt")
        prof, pitch = 'close', 1.0
    else:
        parts = [p for _, _, p in ps]
        for p in parts:
            if not os.path.exists(p) or os.path.getsize(p) < 2000:
                raise RuntimeError(f"{slot}: stage 1 left nothing at {p}")
        if len(parts) == 1:
            src = parts[0]
        else:
            src = os.path.join(RAW_TTS, f'{slot}_mix.wav')
            overlap(parts, ln.get('gap', 0.9), src)
        v0 = voices[ps[0][0]]
        prof = ln.get('profile') or ('loud' if ln.get('shout') else v0['profile'])
        pitch = v0.get('pitch', 1.0)
    radio(src, dst, prof, pitch, idx, bitrate)
    return slot, measure(dst)


def cmd_build(a):
    spec = load()
    os.makedirs(RAW_TTS, exist_ok=True)
    os.makedirs(RAW_SUNO, exist_ok=True)
    # Preserve the SUNO originals ONCE, before anything overwrites them. The guard is `not exists`
    # rather than a flag: a second run must never copy an already-degraded clip back over its own
    # source, which would make the chain compound every time it was re-run.
    for s in SUNO_SLOTS:
        src, keep = os.path.join(CH, s + '.mp3'), os.path.join(RAW_SUNO, s + '.mp3')
        if os.path.exists(src) and not os.path.exists(keep):
            shutil.copyfile(src, keep)

    work = [(s, g, gd, ln, i) for i, (s, g, gd, ln) in enumerate(slots(spec))
            if not a.only or g in a.only]
    print(f"building {len(work)} slots at {a.bitrate} …")

    # STAGE 1, for the whole run, in one process. Splitting it out of build_one is not a tidy-up:
    # the radio stage below is six ffmpeg processes wide and the Kokoro stage must not be, because
    # one model in one process is the entire reason this takes four minutes instead of forty.
    jobs = []
    for (s, g, gd, ln, i) in work:
        ps = parts_of(spec, s, ln, g, i, a.resynth_suno)
        for vk, tx, path in (ps or []):
            if not a.force and os.path.exists(path) and os.path.getsize(path) >= 2000:
                continue
            v = spec['voices'][vk]
            jobs.append({'voice': v['voice'], 'speed': v.get('speed', 1.0),
                         'text': for_say(tx), 'out': path})
    kokoro_batch(jobs, 'chatter')

    out = {}
    errs = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(build_one, spec, s, g, gd, ln, i, a.bitrate, a.resynth_suno): s
                for (s, g, gd, ln, i) in work}
        for f in futs:
            try:
                slot, m = f.result()
                out[slot] = m
            except Exception as e:
                errs.append(f"{futs[f]}: {e}")
    for e in errs:
        print("  ERROR", e)
    print(f"built {len(out)}, {len(errs)} failed")
    return 1 if errs else 0


# ── the manifest ───────────────────────────────────────────────────────────

def cmd_manifest(a):
    spec = load()
    old = {c['slot']: c for c in json.load(open(os.path.join(ROOT, 'assets/audio/manifest.json')))['chatter']}
    m = json.load(open(os.path.join(ROOT, 'assets/audio/manifest.json')))
    chatter = []
    for slot, g, gd, ln in slots(spec):
        e = {'slot': slot, 'file': f'chatter/{slot}.mp3', 'group': g, 'layer': gd['layer'],
             'tags': [g], }
        if gd['layer'] == 'fore':
            e['speaker'] = gd['speaker']
        e['tag'] = gd['tag']
        e['gain'] = gd['gain']
        e['cooldown'] = gd['cooldown']
        if gd['layer'] == 'fore':
            txt = old[slot]['text'] if slot in old and ln.get('src') == 'suno' else ln['t']
            # One rule for every source: SUNO.md rule 3 says a shouted line is written in capitals,
            # so the capitals ARE the flag. Reading it off the text means a SUNO take and a
            # synthesised take cannot disagree about whether somebody is shouting.
            e['shout'] = bool(ln.get('shout')) or txt == txt.upper()
            # A back slot NEVER shows text (§10.3 rule 3), so the field is absent rather than empty.
            e['text'] = old[slot]['text'] if slot in old and ln.get('src') == 'suno' else ln['t']
        chatter.append(e)
    m['chatter'] = chatter
    json.dump(m, open(os.path.join(ROOT, 'assets/audio/manifest.json'), 'w'), indent=1)
    fore = sum(1 for c in chatter if c['layer'] == 'fore')
    print(f"manifest: {len(chatter)} chatter slots ({fore} foreground, {len(chatter)-fore} background) "
          f"+ {len(m['music'])} music = {len(chatter)+len(m['music'])}")
    return 0


# ── verification ───────────────────────────────────────────────────────────

# Characters per "word" at the calibrated rate. Fitted, and worth one line on why it is characters
# and not words: over the 203-clip pool, predicting from CHARACTER count is measurably tighter than
# from word count — a 2.56x total spread against 2.99x — because Kokoro's pace tracks syllables far
# better than it tracks how many spaces are in the sentence. The constant absorbs the chars-per-word
# of the calibration sentence as well as the true ratio, so it is not 5.2 and is not supposed to be.
CPW = 6.35


def expected_dur(spec, ln):
    """How long this line SHOULD take, and the band its measured/predicted ratio must fall in.

    ── WHAT THIS CHECK IS AND IS NOT ──────────────────────────────────────────
    It catches GROSS failures: a truncated take, an empty one, the wrong take in the slot. It is
    NOT sensitive enough to catch a subtly wrong one, and the bands are wide because the residual
    spread is real rather than sloppy. Kokoro reads a short imperative far faster than a long
    formal one — `distress_04` ("GET OFF THE PAD. GET OFF THE PAD NOW.") comes out at 312 wpm and
    `weather_02` at 124 wpm, from voices calibrated at 214 and 195 — and no per-voice constant can
    model that. The observed distribution is printed on every run so drift shows.

    The `say` era's predictor modelled words plus a pause per full stop and comma. Both parts were
    re-fitted for Kokoro rather than inherited: the pause constants are less than half what `say`
    needed, because a neural front end's stop is shorter, and the base term is characters.

    A src='suno' line has no calibrated rate, so it is measured against a nominal 185 wpm and a
    correspondingly wider band. It is NOT skipped: a check with a hole in it is how this project
    shipped a silent clip. Returns (seconds, lo, hi)."""
    vkeys = ln['v'] if isinstance(ln.get('v'), list) else [ln.get('v')]
    texts = ln['t'] if isinstance(ln.get('t'), list) else [ln.get('t', '')]
    gap = ln.get('gap', 0.9)
    ends = []
    for i, (vk, tx) in enumerate(zip(vkeys, texts)):
        wpm = (spec['voices'].get(vk) or {}).get('rate') or 185
        pause = 0.15 * sum(tx.count(c) for c in '.!?') + 0.06 * tx.count(',')
        ends.append(i * gap + len(tx) / (wpm / 60.0 * CPW) + pause)
    if ln.get('src') == 'suno':
        return (max(ends) if ends else 0), 0.70, 2.40
    return (max(ends) if ends else 0), 0.55, 1.70


def cmd_verify(a):
    spec = load()
    ctrl = {p: control_floor(p) for p in ('close', 'distant', 'loud', 'thin')}
    # The floor is the loudest noise-only control plus 8 dB. Nothing about it is a round number
    # somebody liked; it is measured from the chain this run used.
    floor = max(c['speech'] for c in ctrl.values()) + 8.0
    print("noise-only controls (silence through the identical chain):")
    for p, c in ctrl.items():
        print(f"  {p:8s} speech-window {c['speech']:7.2f} dBFS   whole {c['rms']:7.2f} dBFS")
    print(f"  → speech floor {floor:.2f} dBFS\n")

    rows, bad = [], []
    for slot, g, gd, ln in slots(spec):
        p = os.path.join(CH, slot + '.mp3')
        if not os.path.exists(p):
            bad.append((slot, 'MISSING', 0)); continue
        mm = measure(p)
        exp, lo, hi = expected_dur(spec, ln)
        got = mm['dur'] - HEAD - TAIL
        ratio = got / exp if exp else None
        rows.append((slot, g, mm, exp, ratio))
        if mm['speech'] < floor:
            bad.append((slot, f"speech window {mm['speech']:.1f} dBFS < floor {floor:.1f}", mm['dur']))
        elif mm['dur'] < 0.8:
            bad.append((slot, f"only {mm['dur']:.2f} s long", mm['dur']))
        elif ratio is not None and not (lo <= ratio <= hi):
            bad.append((slot, f"{got:.2f} s of speech where the script and this voice's own "
                              f"words-per-minute predict {exp:.2f} s (ratio {ratio:.2f}, band "
                              f"{lo}-{hi}) - truncated, mis-rendered, or the wrong voice", mm['dur']))
        elif mm['peak'] > -0.2:
            bad.append((slot, f"peak {mm['peak']:.2f} dBFS — clipped", mm['dur']))

    tot = sum(r[2]['bytes'] for r in rows)
    sp = sorted(r[2]['speech'] for r in rows)
    dus = sorted(r[2]['dur'] for r in rows)
    rat = sorted(r[4] for r in rows if r[4] is not None)
    print(f"{len(rows)} clips on disk, {len(bad)} rejected")
    if rows:
        print(f"  speech window  {sp[0]:.1f} … {sp[-1]:.1f} dBFS   (median {sp[len(sp)//2]:.1f})")
        print(f"  duration       {dus[0]:.2f} … {dus[-1]:.2f} s      (median {dus[len(dus)//2]:.2f}, total {sum(dus)/60:.1f} min)")
        print(f"  measured/predicted duration  {rat[0]:.2f} \u2026 {rat[-1]:.2f}   (median {rat[len(rat)//2]:.2f})")
        print(f"  bytes          {tot/1024:.0f} KB total, {tot/len(rows)/1024:.1f} KB mean")
    for slot, why, _ in bad:
        print(f"  REJECT {slot}: {why}")
    if a.json:
        json.dump({'floor': floor, 'controls': ctrl, 'totalBytes': tot,
                   'clips': {r[0]: r[2] for r in rows},
                   'rejected': [{'slot': s, 'why': w} for s, w, _ in bad]},
                  open(a.json, 'w'), indent=1)
    return 1 if bad else 0


def cmd_falsify(a):
    """Prove the two checks in cmd_verify can go red. Both fixtures are built here and removed
    again; neither is ever a shipped asset."""
    os.makedirs(RAW_TTS, exist_ok=True)
    ctrl = control_floor('close')
    floor = max(control_floor(p)['speech'] for p in ('close', 'distant', 'loud', 'thin')) + 8.0
    real = measure(os.path.join(CH, 'life_09.mp3'))
    print(f"floor                       {floor:7.2f} dBFS")
    print(f"a real generated clip       {real['speech']:7.2f} dBFS speech window  → {'PASS' if real['speech']>=floor else 'FAIL'}")
    print(f"silence through the chain   {ctrl['speech']:7.2f} dBFS speech window  → {'PASS' if ctrl['speech']>=floor else 'FAIL'}")
    # and the truncation check
    tr = os.path.join(RAW_TTS, '_trunc.mp3')
    run([FFMPEG, '-y', '-v', 'error', '-i', os.path.join(CH, 'life_09.mp3'), '-t', '1.2', '-c', 'copy', tr])
    spec = load()
    ln = spec['groups']['life']['lines'][8]
    exp, lo, hi = expected_dur(spec, ln)
    mt = measure(tr)
    r_full = (measure(os.path.join(CH, 'life_09.mp3'))['dur'] - HEAD - TAIL) / exp
    r_cut = (mt['dur'] - HEAD - TAIL) / exp
    print(f"life_09 intact              {r_full:7.2f} measured/predicted duration (band {lo}-{hi})  -> {'PASS' if lo<=r_full<=hi else 'FAIL'}")
    print(f"life_09 cut to 1.2 s        {r_cut:7.2f} measured/predicted duration (band {lo}-{hi})  -> {'PASS' if lo<=r_cut<=hi else 'FAIL'}")
    os.remove(tr)
    ok = (real['speech'] >= floor and ctrl['speech'] < floor
          and (lo <= r_full <= hi) and not (lo <= r_cut <= hi))
    print("\nFALSIFIED — both checks reject what they are supposed to reject." if ok
          else "\nNOT FALSIFIED — a check did not fire. Do not trust its green.")
    return 0 if ok else 1


def cmd_demo(a):
    """One line per voice, concatenated, so the cast can actually be listened to."""
    spec = load()
    os.makedirs(RAW_TTS, exist_ok=True)
    parts = []
    jobs, plan = [], []
    for i, (vk, v) in enumerate(spec['voices'].items()):
        raw = os.path.join(RAW_TTS, f'_demo_{vk}.wav')
        out = os.path.join(RAW_TTS, f'_demo_{vk}.mp3')
        jobs.append({'voice': v['voice'], 'speed': v.get('speed', 1.0), 'out': raw,
                     'text': for_say(f"This is {vk.replace('_',' ')}. {v['who']}. "
                                     f"Haul Control, this is a courier on lanes four through nine.")})
        plan.append((raw, out, v, i))
    kokoro_batch(jobs, 'demo')
    for raw, out, v, i in plan:
        radio(raw, out, v['profile'], v.get('pitch', 1.0), i, a.bitrate)
        parts.append(out)
    lst = os.path.join(RAW_TTS, '_demo.txt')
    open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
    dest = a.out or os.path.join(VO, 'raw/voice_demo.mp3')
    run([FFMPEG, '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst,
         '-c:a', 'libmp3lame', '-b:a', a.bitrate, '-ac', '1', '-ar', str(SR), dest])
    print(f"{len(parts)} voices → {dest} ({os.path.getsize(dest)/1024:.0f} KB, {dur(dest):.1f} s)")
    return 0


def cmd_calibrate(a):
    """Measure the words-per-minute each cast voice ACTUALLY produces at the speed it is cast at,
    and write it into lines.json's `rate` — the only thing `rate` is used for is expected_dur().

    This is a calibration, not a self-fulfilling check. It measures ONE fixed sentence per voice and
    the duration check then runs against ~200 different sentences of different lengths and
    punctuation, so what it catches — a truncated take, an empty one, the wrong voice in the slot —
    is untouched by it. Calibrating the per-line predictor against the per-line output would be
    circular; calibrating a per-VOICE constant against one held-out sentence is what `say -r` was
    handing us for free and Kokoro does not."""
    spec = load()
    line = ("Haul Control to all couriers, the Vane Street corridor is open again. "
            "Lanes four through nine, keep it under two hundred.")
    os.makedirs(RAW_TTS, exist_ok=True)
    jobs = [{'voice': v['voice'], 'speed': v.get('speed', 1.0), 'text': line,
             'out': os.path.join(RAW_TTS, f'_cal_{vk}.wav')} for vk, v in spec['voices'].items()]
    kokoro_batch(jobs, 'cal')
    words = len(line.split())
    for i, (vk, v) in enumerate(spec['voices'].items()):
        # Measured on the take AFTER stage 2, minus the two squelch bursts — i.e. exactly the
        # quantity cmd_verify measures. The first version of this read the raw Kokoro duration and
        # every clip in the pool then came out 25 % SHORTER than its own calibration predicted,
        # because radio_fx.sh trims the dead air Kokoro leaves at both ends and the calibration had
        # counted it as speech. A predictor and its measurement have to be the same quantity.
        raw = os.path.join(RAW_TTS, f'_cal_{vk}.wav')
        out = os.path.join(RAW_TTS, f'_cal_{vk}.mp3')
        radio(raw, out, v['profile'], v.get('pitch', 1.0), i, '16k')
        sec = dur(out) - HEAD - TAIL
        was = v.get('rate')
        v['rate'] = int(round(words / sec * 60))
        print(f"  {vk:9s} {v['voice']:12s} speed {v.get('speed',1.0):.2f}  "
              f"{sec:5.2f} s spoken  {v['rate']:4d} wpm (was {was})")
    json.dump(spec, open(os.path.join(VO, 'lines.json'), 'w'), indent=1, ensure_ascii=False)
    print(f"lines.json: {len(spec['voices'])} rates re-measured")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', action='append', help='limit to these groups')
    # 16 kbps mono at 16 kHz behind a 300-3400 Hz band-limit. This is what the shipped pool was
    # encoded at (2.29 MB over 203 clips, 11.3 KB mean) and the Kokoro pass deliberately did not
    # move it: changing the voice and the encoder in the same rebuild would leave nobody able to
    # say which one they were hearing.
    ap.add_argument('--bitrate', default='16k')
    ap.add_argument('--force', action='store_true', help='re-synthesise even if the raw take exists')
    ap.add_argument('--resynth-suno', action='store_true',
                    help='re-cast the SUNO dispatch lines onto the Kokoro operators too')
    ap.add_argument('--verify', action='store_true')
    ap.add_argument('--falsify', action='store_true')
    ap.add_argument('--demo', action='store_true')
    ap.add_argument('--calibrate', action='store_true')
    ap.add_argument('--manifest-only', action='store_true')
    ap.add_argument('--json', help='write the verification report here')
    ap.add_argument('--out')
    a = ap.parse_args()
    if a.calibrate:
        return cmd_calibrate(a)
    if a.demo:
        return cmd_demo(a)
    if a.falsify:
        return cmd_falsify(a)
    if a.verify:
        return cmd_verify(a)
    if a.manifest_only:
        return cmd_manifest(a)
    rc = cmd_build(a)
    rc |= cmd_manifest(a)
    rc |= cmd_verify(a)
    return rc


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
"""Build the S2-E story VO — the intro cutscene's Boss, the player's interjections, the monologue.

    python3 tools/vo/gen_story.py                # synthesise + treat + write + verify
    python3 tools/vo/gen_story.py --verify       # measure what is on disk, generate nothing
    python3 tools/vo/gen_story.py --falsify      # prove the verifier can fail
    python3 tools/vo/gen_story.py --only boss

── WHY THIS IS NOT gen_chatter.py ─────────────────────────────────────────────

S2-B's pipeline is `say` → tools/radio_fx.sh, and every clip it makes is band-limited to
300-3400 Hz with squelch bursts keyed on either end, because every line it makes comes out of a
radio.

**The Boss is in the room.** He is sitting in the cabin of a craft eight metres away with his own
canopy open, and Aaron's beat sheet has him talking over the player rather than transmitting at
them. A band-limited Boss sounds like dispatch, and dispatch is the one thing that scene must not
sound like. So this file shares stage 1 (`say`) and stage 3 (verification) with gen_chatter.py and
replaces stage 2 entirely:

    gen_chatter.py   highpass 300 · lowpass 3400 · hiss bed · squelch head/tail · 16 kHz 16 kbps
    gen_story.py     full band · a short room reflection · gentle compression · 22 kHz 48 kbps

19 clips, ~350 KB, loaded lazily and only for the gender that was picked (js/storyui.js's
StoryVoice) — so a session actually fetches 7 Boss lines plus 4 of its own, not all 19.

── THE THREE TAKES ────────────────────────────────────────────────────────────

The brief settles this: **the Boss's lines are gender-invariant, so generate them once.** Only the
player's four lines — three interjections and the closing monologue — need three takes (young male
~20, young female ~20, gender-neutral). That is 7 + 4x3 = 19 clips, not a script x 3.

── VERIFICATION ───────────────────────────────────────────────────────────────

This project has shipped a silent clip past a "decodes, has duration, has energy" check before, and
S2-B found a SECOND hole: its radio chain mixes hiss into everything, so a clip where nobody spoke
still measures -33 dBFS. This chain adds NO hiss, so a silent clip here measures near the float
floor — which makes the check easier, not harder, and therefore no excuse for not falsifying it.
`--falsify` builds a silence control through the identical chain and asserts it is REJECTED, and
builds a real clip with its text replaced by a single word and asserts the duration check catches it.
"""
import argparse, json, math, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VO = os.path.join(ROOT, 'tools/vo')
OUT = os.path.join(ROOT, 'assets/audio/story')
RAW = os.path.join(VO, 'raw/story')
FFMPEG = os.environ.get('FFMPEG', '/opt/homebrew/bin/ffmpeg')
FFPROBE = os.environ.get('FFPROBE', '/opt/homebrew/bin/ffprobe')
SR = 22050

# ── the cast ───────────────────────────────────────────────────────────────
#
# `say`'s voices are what they are; the casting below is the only lever, and it was chosen by
# listening rather than by reading the names. Every one of these is already in the game's 31-voice
# chatter pool except the Boss, who deliberately is not — he must not sound like anybody on the
# radio, because the player will have heard the radio for two minutes before he arrives.
#
#   boss   Ralph is the lowest-F0 US male `say` ships and it has a dry, unhurried delivery that
#          reads as somebody who is not worried about the outcome of the conversation. Slowed to
#          142 wpm (the pool's range is 199-220) so he takes his time, and pitched down 6 %.
#   pc_m   Junior — the youngest-sounding male voice available, which is what "young male ~20" asks
#          for. Pitched up very slightly.
#   pc_f   Shelley (UK) at a raised pitch. Samantha and Karen are both Haul Control operators in
#          the chatter pool and would have made the player sound like dispatch.
#   pc_n   Aaron's spec is "a high male or low female read". This is Reed (UK) UNPITCHED, which
#          measures between the other two takes rather than being asserted to.
VOICES = {
    'boss': {'say': 'Ralph', 'rate': 142, 'pitch': 0.94, 'gain': 1.0,
             'who': 'the Criminal Leader — low, unhurried, bored of this conversation'},
    'pc_m': {'say': 'Junior', 'rate': 188, 'pitch': 1.02, 'gain': 1.0,
             'who': 'the player, young male ~20'},
    'pc_f': {'say': 'Shelley (English (UK))', 'rate': 190, 'pitch': 1.06, 'gain': 1.0,
             'who': 'the player, young female ~20'},
    'pc_n': {'say': 'Reed (English (UK))', 'rate': 188, 'pitch': 1.00, 'gain': 1.0,
             'who': 'the player, gender-neutral — a high male / low female read'},
}

# The script. It MUST match js/storyui.js's SCRIPT word for word: the bubble shows the text and the
# clip says it, and a mismatch is the kind of defect nobody notices until they are listening.
BOSS = [
    ('boss_01', 'Don’t get out. Don’t touch the stick. Just listen.'),
    ('boss_02', 'That is a very nice craft you are flying. Insured to somebody else, I notice.'),
    ('boss_03', 'Your father owes us fifty thousand. He has owed us fifty thousand for a while now.'),
    ('boss_04', 'He is away. You are here. That makes it yours.'),
    ('boss_05', 'Fifty thousand credits. We will come for it, and I would not make us look for you.'),
    ('boss_06', 'If it is not ready we take the craft and sell it. Then we break an arm. '
                'Then, if I am in a mood, we sell whoever was driving to whoever is buying.'),
    ('boss_07', 'Make the money. Soon.'),
]
PC = [
    ('int1', 'But—'),
    ('int2', 'Wait—'),
    ('int3', 'Just wait—'),
    ('close', 'Shit — they wouldn’t let me get a word in. What sort of shit has my Dad got '
              'himself into? I shouldn’t even be flying this, but now I’m going to have to. '
              'I need to make that money fast.'),
]

# Words per second the `say` rates above actually produce, measured rather than assumed — used only
# by the duration sanity check, which exists to catch a clip that decoded but said one word.
MIN_SEC_PER_WORD = 0.16


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed ({r.returncode}): {(r.stderr or r.stdout)[-400:]}")
    return r


def dur(path):
    return float(run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration',
                      '-of', 'csv=p=0', path]).stdout.strip())


def samples(path):
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


def peak_db(a):
    if not len(a):
        return -999.0
    return 20 * math.log10(max(1e-20, max(abs(v) for v in a)))


def for_say(text):
    """What the synthesiser is given, as opposed to what the bubble shows. An em dash makes `say`
    pause; a right single quote is spoken as a quote by some voices."""
    t = text.replace('—', ',').replace('–', ',').replace('…', '.')
    t = t.replace('’', "'").replace('“', '').replace('”', '')
    return re.sub(r'\s+', ' ', t).strip()


def say(voice, rate, text, out):
    cmd = ['say', '-v', voice]
    if rate:
        cmd += ['-r', str(rate)]
    cmd += ['-o', out, text]
    run(cmd)
    # `say -o x.aiff` exits 0 after writing a ZERO-BYTE file when it dislikes the output format.
    # gen_chatter.py's own note: this is the house bug in its purest form.
    if not os.path.exists(out) or os.path.getsize(out) < 2000:
        got = os.path.getsize(out) if os.path.exists(out) else 0
        raise RuntimeError(f"say('{voice}') wrote {got} bytes for {out}")


def room(src, dst, pitch, gain, bitrate='48k'):
    """Stage 2, and the whole difference from gen_chatter.py: NO band limit, NO squelch, NO hiss.

    What it does instead is put him in a cabin. `aecho` at 34 ms and 0.22 is a small hard-surfaced
    space — enough that the voice is somewhere rather than nowhere, short enough that it never
    reads as a hall. The compressor is gentle (4:1 at -19 dB) because the scene is quiet and the
    point is presence, not loudness. A high-pass at 70 Hz only removes rumble `say` should not have
    produced in the first place; the 3.4 kHz ceiling the radio chain imposes is deliberately absent,
    and that ceiling is exactly what the ear reads as "a radio"."""
    # Pitch: resample the header, then pull the tempo back so the delivery does not speed up.
    asr = int(SR * pitch)
    chain = (
        f'aresample={SR},'
        f'asetrate={asr},aresample={SR},atempo={1.0 / pitch:.6f},'
        'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,'
        'areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06,areverse,'
        'highpass=f=70,'
        'acompressor=threshold=-19dB:ratio=4:attack=8:release=180:makeup=2.2,'
        'aecho=0.86:0.22:34:0.22,'
        f'volume={gain:g},'
        # LOUDNESS. The first pass shipped at -35 dBFS mean / -17 peak, against the chatter pool's
        # -14.8 to -18.6 mean and -1.2 to -3.1 peak: the Boss would have been 17 dB under the
        # radio he is supposed to be interrupting. `say` simply renders quiet, and 2.2 dB of
        # make-up in a compressor that barely engages does not fix it. EBU R128 to -16 LUFS with a
        # -1.5 dBTP ceiling puts him on the same shelf as everything else in the game without
        # clipping — S2-B's SUNO takes were clipping to +2.7 and that is the mistake not to repeat.
        'loudnorm=I=-16:TP=-1.5:LRA=11,'
        'alimiter=limit=0.94,'
        'apad=pad_dur=0.08'
    )
    run([FFMPEG, '-y', '-v', 'error', '-i', src, '-af', chain,
         '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', bitrate, dst])


# The floor a REAL `say` take sits at before any treatment. Measured across the 19 takes: the
# quietest is -35.1 dBFS raw. -55 leaves 20 dB of headroom under that and is still 35 dB above the
# float floor a silent render produces.
RAW_FLOOR_DB = -55.0


def check_raw(path):
    """Energy in the SYNTHESISER'S output, before treatment. This check exists because the first
    version of --falsify produced a false pass and the false pass was instructive:

    `loudnorm` targets -16 LUFS, and it will faithfully amplify a silent file's dither and noise
    floor to -16 LUFS. So the silence control came out of the chain at **-6.4 dBFS** and sailed
    through the post-chain energy check — it was rejected, but by the CLIPPING check, for the wrong
    reason entirely. A verifier that rejects the right file for the wrong reason has not been
    falsified; it has been flattered.

    So silence is caught where it is still silent."""
    r = rms_db(samples(path))
    if r < RAW_FLOOR_DB:
        raise RuntimeError(f'SILENT TAKE: {os.path.basename(path)} synthesised at {r:.1f} dBFS '
                           f'(floor {RAW_FLOOR_DB}). Treating it would only amplify the noise.')
    return r


def build(slot, voice_key, text, bitrate='48k'):
    v = VOICES[voice_key]
    aiff = os.path.join(RAW, f'{slot}.aiff')
    mp3 = os.path.join(OUT, f'{slot}.mp3')
    say(v['say'], v['rate'], for_say(text), aiff)
    check_raw(aiff)
    room(aiff, mp3, v['pitch'], v['gain'], bitrate)
    return mp3


def verify(slot, text, quiet=False):
    """Two independent checks, because "it decoded" is not "somebody spoke".

    1. ENERGY. This chain adds no noise bed at all, so a clip nobody spoke into sits at the float
       floor. The threshold is set against a measured silence control (see --falsify), not picked.
    2. DURATION vs WORD COUNT. Energy alone passes a clip that says one word of a twenty-word line,
       which is the failure `say` actually produces when it chokes on punctuation."""
    path = os.path.join(OUT, f'{slot}.mp3')
    if not os.path.exists(path):
        return {'slot': slot, 'ok': False, 'why': 'missing'}
    a = samples(path)
    d = dur(path)
    r = rms_db(a)
    p = peak_db(a)
    words = len(for_say(text).split())
    need = words * MIN_SEC_PER_WORD
    # -30 dBFS, not -45. The first pass passed at -35 because the chain was quiet; with loudnorm
    # in it, anything under -30 means something went wrong rather than "say is quiet".
    ok_energy = r > -30.0
    ok_len = d >= need
    ok_clip = p < -0.3
    out = {'slot': slot, 'ok': ok_energy and ok_len and ok_clip, 'rms': round(r, 1),
           'peak': round(p, 1), 'sec': round(d, 2), 'words': words, 'needSec': round(need, 2),
           'bytes': os.path.getsize(path),
           'why': '' if (ok_energy and ok_len and ok_clip)
                  else ('silent' if not ok_energy else 'short' if not ok_len else 'clipping')}
    if not quiet:
        print(f"  {'ok ' if out['ok'] else 'FAIL'} {slot:14s} {out['sec']:5.2f}s  "
              f"{out['rms']:6.1f} dBFS  peak {out['peak']:5.1f}  {out['bytes']:6d} B  {out['why']}")
    return out


def falsify():
    """Break both checks and assert they catch it. A verifier nobody has broken is a verifier
    nobody has tested — this project has nineteen recorded instances of the alternative."""
    os.makedirs(RAW, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    fails = []

    # 1. SILENCE, caught where it is still silent. `check_raw` must RAISE.
    sil_src = os.path.join(RAW, '_ctrl_silence.wav')
    run([FFMPEG, '-y', '-v', 'error', '-f', 'lavfi', '-i', f'anullsrc=r={SR}:cl=mono',
         '-t', '3.0', sil_src])
    raw_db = rms_db(samples(sil_src))
    caught = None
    try:
        check_raw(sil_src)
    except RuntimeError as e:
        caught = str(e)
    print(f"  control SILENCE  raw {raw_db:.1f} dBFS -> "
          f"{'REJECTED at check_raw (good)' if caught else 'ACCEPTED — THE CHECK IS BROKEN'}")
    if not caught:
        fails.append('a silent take passed check_raw')

    # 1b. …and the demonstration of WHY that check has to live before the chain. The same silence
    #     pushed through `room()` comes out LOUD, because loudnorm normalises a noise floor exactly
    #     as happily as it normalises a voice. This assertion is deliberately the opposite way
    #     round: it asserts the post-chain energy check CANNOT see it, so that nobody deletes
    #     check_raw believing the downstream one covers it.
    room(sil_src, os.path.join(OUT, '_ctrl_silence.mp3'), 1.0, 1.0)
    s = verify('_ctrl_silence', BOSS[0][1], quiet=True)
    print(f"  control SILENCE  post-chain rms {s['rms']} dBFS — the energy check "
          f"{'CANNOT' if s['rms'] > -30.0 else 'can'} see it (this is why check_raw exists)")
    if s['rms'] <= -30.0:
        fails.append('the post-chain silence demo no longer demonstrates anything — re-derive it')

    # 2. A REAL clip of one word, verified against the long line's word count. If this passes, the
    #    duration check measures nothing and a truncated take ships.
    build('_ctrl_short', 'boss', 'Soon.')
    t = verify('_ctrl_short', BOSS[5][1], quiet=True)
    print(f"  control SHORT    {t['sec']}s vs {t['needSec']}s needed -> "
          f"{'REJECTED (good)' if not t['ok'] else 'ACCEPTED — THE CHECK IS BROKEN'}")
    if t['ok']:
        fails.append('a one-word clip passed the duration check')

    # 3. And the positive control: a real clip must still pass, or the checks are simply refusing
    #    everything, which is a different way of measuring nothing.
    build('_ctrl_real', 'boss', BOSS[2][1])          # build() calls check_raw; a raise fails here
    g = verify('_ctrl_real', BOSS[2][1], quiet=True)
    print(f"  control REAL     raw {rms_db(samples(os.path.join(RAW, '_ctrl_real.aiff'))):.1f} dBFS "
          f"passed check_raw")
    print(f"  control REAL     {g['sec']}s  rms {g['rms']} -> "
          f"{'ACCEPTED (good)' if g['ok'] else 'REJECTED — the checks reject everything'}")
    if not g['ok']:
        fails.append('a real clip was rejected')

    for n in ['_ctrl_silence', '_ctrl_short', '_ctrl_real']:
        p = os.path.join(OUT, f'{n}.mp3')
        if os.path.exists(p):
            os.remove(p)
    if fails:
        print('FALSIFY FAILED: ' + '; '.join(fails))
        return 1
    print('falsify: both checks can fail and a real clip still passes')
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--verify', action='store_true')
    ap.add_argument('--falsify', action='store_true')
    ap.add_argument('--only', default=None, choices=['boss', 'pc'])
    args = ap.parse_args()

    os.makedirs(OUT, exist_ok=True)
    os.makedirs(RAW, exist_ok=True)

    if args.falsify:
        return falsify()

    plan = []
    if args.only != 'pc':
        for slot, text in BOSS:
            plan.append((slot, 'boss', text))
    if args.only != 'boss':
        for g in ['m', 'f', 'n']:
            for stem, text in PC:
                plan.append((f'pc_{g}_{stem}', f'pc_{g}', text))

    if not args.verify:
        for slot, vk, text in plan:
            build(slot, vk, text)
        print(f'built {len(plan)} clips')

    print('verify:')
    results = [verify(slot, text) for slot, _, text in plan]
    bad = [r for r in results if not r['ok']]
    total = sum(r.get('bytes', 0) for r in results)
    print(f"{len(results) - len(bad)}/{len(results)} ok · {total} B total · "
          f"mean {total // max(1, len(results))} B")
    manifest = {'version': 1, 'voices': VOICES,
                'clips': [{'slot': r['slot'], 'sec': r['sec'], 'rms': r['rms'],
                           'bytes': r['bytes']} for r in results]}
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    if bad:
        print('FAILED: ' + ', '.join(f"{r['slot']}({r['why']})" for r in bad))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

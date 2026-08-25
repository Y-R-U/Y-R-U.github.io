#!/usr/bin/env python3
"""§S2-S — the CARRIER audition: does giving Kokoro the rest of the sentence fix the interruptions?

Aaron: *"you could generate more text around it with punctuation around the key words and separate
the words after if that helps?"*

The three lines the player says first are interruptions, and today each is synthesised on its own as
a single word plus a comma ("But,"). A neural TTS has nothing to shape there. So each arm below
hands Kokoro the WHOLE sentence the character was going to say and keeps only the opening word or
two, cut on the model's own per-token `end_ts` — see kokoro_say.py's `keep_words`.

    python3 tools/vo/carrier_probe.py

Arms, all through the shipped stage-2 chain so this is what would actually play:

  ship      what ships today — "But," rendered alone. The control.
  carry     the full sentence, cut cleanly at the end of the key word.
  carry_ov  the same, cut 45 ms INTO the following word. A real interruption does not stop on a
            tidy word boundary; it stops on the front of the syllable that got talked over.
  bang      Aaron's "punctuation around the key words" — the key word takes an exclamation mark and
            the sentence carries on behind it, so the emphasis is in the read rather than the edit.

Nothing here is scored. CLAUDE.md is explicit that the acceptance test for a voice is a person
listening, and this project has already been burned once by a number (whisper, 90.7 %, on a pool
Aaron called a 1990s computer voice) that measured the wrong quantity convincingly. A pitch-range
screen over the SHIPPED clips said the male take moves MORE than the female one — 12.8 semitones
against 10.1 — which is a second such number, and the reason this file only builds a tape.
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VO = os.path.join(ROOT, 'tools', 'vo')
OUT = os.path.join(VO, 'vcmp')
FFMPEG, FFPROBE = 'ffmpeg', 'ffprobe'
SR = 24000
sys.path.insert(0, VO)
from gen_chatter import kokoro_batch                                   # noqa: E402
from gen_story import room, VOICES as STORY_VOICES                     # noqa: E402

SPEED = STORY_VOICES['pc_m']['speed']
PITCH = STORY_VOICES['pc_m']['pitch']
GAIN = STORY_VOICES['pc_m']['gain']

# (slot, what ships today, the full sentence, how many words to keep)
# The carriers are what the character was actually trying to say — he is being told his father owes
# fifty thousand credits — so the opening word carries the intonation of a real protest.
LINES = [
    ('int1', 'But,',       'But I never even asked for any of this.',   1),
    ('int2', 'Wait,',      'Wait a second, that is not my debt.',       1),
    ('int3', 'Just wait,', 'Just wait, you have to listen to me.',      2),
]
# The bang arm: the key word gets the punctuation, the sentence keeps going behind it.
BANG = [
    ('int1', 'But! I never even asked for any of this.',  1),
    ('int2', 'Wait! That is not my debt.',                1),
    ('int3', 'Just wait! You have to listen to me.',      2),
]

ARMS = ['ship', 'carry', 'carry_ov', 'bang']
# am_liam is the current cast and is the control for the METHOD question. The other three are here
# so the method can be heard on a different voice too, in case the answer is "both".
VOICES = ['am_liam', 'am_michael', 'am_fenrir', 'bm_daniel']


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {(r.stderr or r.stdout)[-300:]}")
    return r


def dur(p):
    return float(run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration',
                      '-of', 'csv=p=0', p]).stdout.strip())


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = []
    for v in VOICES:
        for slot, ship, carrier, keep in LINES:
            base = {'voice': v, 'speed': SPEED}
            jobs.append({**base, 'text': ship, 'out': os.path.join(OUT, f'C_{v}_ship_{slot}.wav')})
            jobs.append({**base, 'text': carrier, 'keep_words': keep,
                         'out': os.path.join(OUT, f'C_{v}_carry_{slot}.wav')})
            jobs.append({**base, 'text': carrier, 'keep_words': keep, 'overlap': 0.045,
                         'out': os.path.join(OUT, f'C_{v}_carry_ov_{slot}.wav')})
        for slot, bang, keep in BANG:
            jobs.append({'voice': v, 'speed': SPEED, 'text': bang, 'keep_words': keep,
                         'out': os.path.join(OUT, f'C_{v}_bang_{slot}.wav')})

    print(f"{len(jobs)} takes, one Kokoro process")
    res = kokoro_batch(jobs, 'carrier', specdir=OUT)

    # THE CHECK THAT MATTERS BEFORE ANYONE LISTENS: a carrier take must be SHORTER than its own
    # carrier sentence and about as long as the word it is supposed to be. A cut that silently
    # failed would play the whole sentence, and on a tape of 48 short clips that is easy to miss.
    bad = []
    for v in VOICES:
        for slot, ship, carrier, keep in LINES:
            s = res[os.path.join(OUT, f'C_{v}_ship_{slot}.wav')]['sec']
            c = res[os.path.join(OUT, f'C_{v}_carry_{slot}.wav')]
            if 'cut_ts' not in c:
                bad.append(f'{v}/{slot}: no cut_ts — the carrier was NOT cut')
            elif c['sec'] > s * 2.2:
                bad.append(f"{v}/{slot}: carrier {c['sec']:.2f}s vs solo {s:.2f}s — cut too late")
    if bad:
        print('  ⚠ ' + '\n  ⚠ '.join(bad))
    else:
        print('  cut check: every carrier take is inside 2.2x its solo length, and every one '
              'reported the timestamp it cut on')

    pm_room = {}

    def treated(src):
        if src in pm_room:
            return pm_room[src]
        mid = src.replace('.wav', '.room.mp3')
        room(src, mid, PITCH, GAIN)
        dst = src.replace('.wav', '.room.wav')
        run([FFMPEG, '-y', '-v', 'error', '-i', mid, '-ar', str(SR), '-ac', '1', dst])
        pm_room[src] = dst
        return dst

    def say_tag(text, path):
        run(['say', '-v', 'Samantha', '-r', '205', '-o', path + '.aiff', text])
        run([FFMPEG, '-y', '-v', 'error', '-i', path + '.aiff', '-ar', str(SR), '-ac', '1', path])
        os.remove(path + '.aiff')

    parts, n = [], 0
    for v in VOICES:
        for arm in ARMS:
            tag = os.path.join(OUT, f'_tagC_{n}.wav'); n += 1
            say_tag(f"{v.replace('_', ' ')}, {arm.replace('_', ' ')}", tag)
            parts.append(tag)
            for slot, *_ in LINES:
                parts.append(treated(os.path.join(OUT, f'C_{v}_{arm}_{slot}.wav')))

    lst = os.path.join(OUT, '_listC.txt')
    with open(lst, 'w') as f:
        for p in parts:
            f.write(f"file '{os.path.abspath(p)}'\n")
    tape = os.path.join(OUT, 'TAPE_C_carrier.mp3')
    run([FFMPEG, '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst,
         '-af', f'aresample={SR},loudnorm=I=-16:TP=-1.5:LRA=11',
         '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '96k', tape])
    print(f"  {tape}  ({dur(tape):.1f} s)")
    json.dump({k: v for k, v in res.items()}, open(os.path.join(OUT, '_carrier.json'), 'w'), indent=1)


main()

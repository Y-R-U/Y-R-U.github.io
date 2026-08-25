#!/usr/bin/env python3
"""§S2-S — WHY DOES THE MALE PLAYER READ LIKE A MACHINE WHEN THE FEMALE ONE DOES NOT?

Aaron, on the shipped build: *"the female and neither voice sounds decent. the male voice sounds
awful, at least the first 3 times he speaks … it still sounds like a computer speaking which is
strange if we used abogen/Kokoro."*

His "first 3 times" pins it exactly. The player's first three lines are the interruptions:

    int1  'But—'      int2  'Wait—'      int3  'Just wait—'

and gen_story.py's `for_say()` renders an em dash as a comma, so what Kokoro is actually handed is
**"But,"** — one word and a trailing comma. There are therefore TWO candidate causes and they are
not the same fix:

  A. THE VOICE. `am_liam` was cast as "the youngest-sounding male". Kokoro publishes per-voice
     quality grades and the male set is much weaker than the female one; `af_sky`, which is doing
     BOTH the takes Aaron likes, may simply be a better voice than the one he does not.
  B. THE INPUT. A neural TTS has no prosody to work with in a bare word. Whatever the voice, "But,"
     gives it a syllable and a pause and nothing to shape. An interruption should also be URGENT,
     and a comma is the punctuation of a man trailing off politely.

So this renders the same four lines across every male voice installed AND across four punctuation
treatments of the interjections, and lays them out as one audition tape per arm. It settles nothing
by itself — CLAUDE.md is explicit that the acceptance test for a voice is a person listening, and
that whisper scored the 1990s `say` pool at 90.7 % — it just puts the alternatives in Aaron's ears
in one file each.

    python3 tools/vo/voice_probe.py            # build the tape
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VO = os.path.join(ROOT, 'tools', 'vo')
OUT = os.path.join(VO, 'vcmp')
KOKORO_PY = '/Users/aaronair/.local/share/uv/tools/abogen/bin/python'
FFMPEG, FFPROBE = 'ffmpeg', 'ffprobe'
SR = 24000
sys.path.insert(0, VO)
from gen_chatter import kokoro_batch                                   # noqa: E402
# The SHIPPED stage-2 chain, imported rather than re-declared. The first draft of this file
# auditioned raw Kokoro output, which is not what the game plays: room() pitches, compresses, puts
# the voice in a cabin and normalises it to -16 LUFS, and every one of those changes how a voice
# reads. Judging the raw take is judging a signal that never reaches the player — the same mistake
# as measuring the wrong quantity, one layer down.
from gen_story import room, VOICES as STORY_VOICES                     # noqa: E402

# Every male voice the local install has, current cast first so the tape opens with the control.
VOICES = ['am_liam', 'am_michael', 'am_fenrir', 'am_puck', 'am_echo', 'am_eric',
          'am_onyx', 'am_adam', 'bm_daniel', 'bm_lewis', 'bm_fable']

# The four lines, as gen_story.py has them.
CLOSE = ("Shit - they wouldn't let me get a word in. What sort of crap has my Dad got himself "
         "into? I shouldn't even be flying this. I need to make that money fast.")

# Treatment B's arms. `comma` is what ships today.
PUNCT = {
    'comma': ['But,', 'Wait,', 'Just wait,'],
    'bang':  ['But!', 'Wait!', 'Just wait!'],
    'plain': ['But', 'Wait', 'Just wait'],
    # A carrier: synthesised with the words that WOULD have followed, so the interjection is spoken
    # as the start of a sentence with somewhere to go, and the tail is cut in stage 2. This is the
    # only arm that gives a one-word take any prosodic context at all.
    'carry': ['But I never asked for', 'Wait a second, I never', 'Just wait, listen to me for'],
}
CARRY_KEEP = {0: 0.34, 1: 0.42, 2: 0.52}   # fraction of the take kept, per line


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
    jobs, plan = [], []

    # ARM A — every male voice, shipped punctuation, all four lines.
    for v in VOICES:
        for i, tx in enumerate(PUNCT['comma']):
            p = os.path.join(OUT, f'A_{v}_int{i + 1}.wav')
            jobs.append({'voice': v, 'speed': 1.04, 'text': tx, 'out': p}); plan.append(('A', v, p))
        p = os.path.join(OUT, f'A_{v}_close.wav')
        jobs.append({'voice': v, 'speed': 1.04, 'text': CLOSE, 'out': p}); plan.append(('A', v, p))

    # ARM B — the punctuation treatments, on the CURRENT voice and on the strongest alternative,
    # so "is it the voice or is it the input" is answerable rather than a matter of opinion.
    for v in ('am_liam', 'am_michael'):
        for k, texts in PUNCT.items():
            for i, tx in enumerate(texts):
                p = os.path.join(OUT, f'B_{v}_{k}_int{i + 1}.wav')
                jobs.append({'voice': v, 'speed': 1.04, 'text': tx, 'out': p})
                plan.append(('B', f'{v}/{k}', p))

    print(f"{len(jobs)} takes, one Kokoro process")
    res = kokoro_batch(jobs, 'vcmp', specdir=OUT)

    # Trim the carrier arm back to the interjection.
    for v in ('am_liam', 'am_michael'):
        for i in range(3):
            p = os.path.join(OUT, f'B_{v}_carry_int{i + 1}.wav')
            keep = dur(p) * CARRY_KEEP[i]
            t = p.replace('.wav', '_cut.wav')
            run([FFMPEG, '-y', '-v', 'error', '-i', p, '-t', f'{keep:.3f}',
                 '-af', 'afade=t=out:st=%.3f:d=0.06' % max(0.0, keep - 0.06), t])
            os.replace(t, p)

    # One tape per arm, each line announced so Aaron knows what he is hearing without a spreadsheet.
    def say_tag(text, path):
        run(['say', '-v', 'Samantha', '-r', '210', '-o', path + '.aiff', text])
        run([FFMPEG, '-y', '-v', 'error', '-i', path + '.aiff', '-ar', str(SR), '-ac', '1', path])
        os.remove(path + '.aiff')

    # Through the shipped chain, at pc_m's own settings, before anything is auditioned.
    pm = STORY_VOICES['pc_m']
    def treated(src):
        # room() writes mp3. The concat demuxer needs ONE format across every part, and feeding it
        # mp3 clips between wav announcements silently dropped 85 % of the tape — 136 s of audio
        # came out as 19 s and ffmpeg exited 0. So it is decoded straight back to the tape's own
        # wav format; the mp3 round trip is kept because that is what the game ships.
        mid = src.replace('.wav', '.room.mp3')
        room(src, mid, pm['pitch'], pm['gain'])
        dst = src.replace('.wav', '.room.wav')
        run([FFMPEG, '-y', '-v', 'error', '-i', mid, '-ar', str(SR), '-ac', '1', dst])
        return dst

    for arm, label, order in (
        ('A', 'voices', [(v, [treated(os.path.join(OUT, f'A_{v}_int{i + 1}.wav')) for i in range(3)]
                          + [treated(os.path.join(OUT, f'A_{v}_close.wav'))]) for v in VOICES]),
        ('B', 'punctuation', [(f'{v} {k}', [treated(os.path.join(OUT, f'B_{v}_{k}_int{i + 1}.wav'))
                                            for i in range(3)])
                              for v in ('am_liam', 'am_michael') for k in PUNCT]),
    ):
        parts = []
        for i, (name, files) in enumerate(order):
            tag = os.path.join(OUT, f'_tag_{arm}_{i}.wav')
            say_tag(name.replace('_', ' ').replace('/', ' '), tag)
            parts.append(tag)
            parts.extend(files)
        lst = os.path.join(OUT, f'_list_{arm}.txt')
        with open(lst, 'w') as f:
            for p in parts:
                f.write(f"file '{os.path.abspath(p)}'\n")
        tape = os.path.join(OUT, f'TAPE_{arm}_{label}.mp3')
        run([FFMPEG, '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst,
             '-af', 'aresample=%d,loudnorm=I=-16:TP=-1.5:LRA=11' % SR,
             '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '96k', tape])
        print(f"  {tape}  ({dur(tape):.1f} s)")

    # The measurements, for the record — NOT an acceptance test. A take that is loud and long
    # enough can still sound like 1994.
    rows = {}
    for arm, name, p in plan:
        m = res.get(p)
        if m:
            rows.setdefault(name, []).append({'f': os.path.basename(p),
                                              'sec': round(m.get('sec', 0), 2),
                                              'rms': round(m.get('rms', 0), 1)})
    json.dump(rows, open(os.path.join(OUT, '_measure.json'), 'w'), indent=1)


main()

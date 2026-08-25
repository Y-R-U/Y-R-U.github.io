#!/usr/bin/env python3
"""§S2-T — audition bm_lewis as DAD.

Aaron: *"Lewis is a great voice though and Michael is also an older but good voice. maybe the dad
can use the Lewis voice?"*

He is the right shape for it. bm_lewis is the LOWEST-pitched voice that rated well (99.8 Hz against
am_echo's 113.1) and Aaron's own objection to it as the player was that it *"is an older voice"* —
which is a defect for a twenty-year-old and the entire brief for their father. It is also GB, and it
cannot collide with the Boss, because the Boss is not Kokoro at all any more: his seven lines are
Aaron's SUNO performance, so the only other synthesised speaker in the story layer is the player.

Dad has exactly two lines and they already exist, in `Story.THREAD_SCENE` — the shady-door scene,
which today is a SILENT text panel. So this renders what he actually says, not a sample of
something else, through the shipped story chain (`room()` — no band limit, a cabin reflection). Two
readings, because "older" is not one setting:

  even   1.00 / 1.00 — his own voice, untouched.
  weary  0.94 / 0.98 — slower and a shade lower. He is being asked something he did not want asked.

    python3 tools/vo/dad_probe.py
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from gen_chatter import kokoro_batch                                   # noqa: E402
from gen_story import room, for_say                                    # noqa: E402

OUT = os.path.join(HERE, 'vcmp')
# Verbatim from js/story.js THREAD_SCENE. If these drift, the audition is of a line nobody says.
LINES = [
    ('dad1', 'They took the car and they have not been back. That is as done as it gets.'),
    # The ellipsis is his hesitation and it is IN js/story.js. A first pass here dropped it, which
    # would have auditioned a line the game does not contain — and `for_say()` turns it into a full
    # stop, so it is also the difference between him pausing and him not.
    ('dad2', '…There is a desk under the Tallow Yard. Ask for the Quartermaster. '
             'And do not tell them whose kid you are, because they already know.'),
]
TAKES = {'even': (1.00, 1.00), 'weary': (0.94, 0.98)}

os.makedirs(OUT, exist_ok=True)
jobs = []
for slot, tx in LINES:
    for name, (speed, _p) in TAKES.items():
        jobs.append({'voice': 'bm_lewis', 'speed': speed, 'text': for_say(tx),
                     'out': os.path.join(OUT, f'D_{name}_{slot}.wav')})
res = kokoro_batch(jobs, 'dad', specdir=OUT)
for slot, _ in LINES:
    for name, (_s, pitch) in TAKES.items():
        src = os.path.join(OUT, f'D_{name}_{slot}.wav')
        room(src, os.path.join(OUT, f'D_{name}_{slot}.room.mp3'), pitch, 1.0)
print(f'{len(jobs)} dad takes -> {OUT}/D_*')

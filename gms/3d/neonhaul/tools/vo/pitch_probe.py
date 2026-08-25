#!/usr/bin/env python3
"""§S2-S round 2 — can bm_lewis be made to sound twenty? ANSWERED: NO. Kept as the record.

Aaron, having heard the ladder: *"the higher pitch on Lewis did not work. stick with echo."* The
cast is `am_echo` and this script is not part of any pipeline — it is here so the next person who
looks at bm_lewis, sees a voice that rated 4/4, and wonders whether pitch would fix its age can
read that it was tried across a range straddling am_echo and that the answer was no. Its rendered
clips are deleted; re-run it if you want them back.


Aaron, rating the audition: *"Lewis is probably my favourite voice but is an older voice, may work
of made higher in pitch?"*

He is right that it is worth asking, and pitch here is not just pitch. room() shifts by RESAMPLING
and then pulling the tempo back, so the formants move with the pitch — which is exactly what makes
a voice read as a younger speaker rather than as the same speaker on helium. That is the same trick
pc_n already ships (af_sky resampled DOWN 10 % to sit below the female take), so this is a move the
chain is known to survive.

No new synthesis. The audition already rendered bm_lewis's four raw Kokoro takes; every rung below
is those same takes through the shipped stage-2 chain at a different ratio, so the ONLY thing that
varies down the ladder is the one thing being asked about.

1.02 is the rung he already heard and scored 4/4-but-old, so it is the control: if the ladder does
nothing, that rung should still sound exactly like the audition did.

    python3 tools/vo/pitch_probe.py
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from gen_story import room                                             # noqa: E402

OUT = os.path.join(HERE, 'vcmp')
# Chosen by measurement, not by taste. bm_lewis is the LOWEST-pitched voice that scored well
# (99.8 Hz on the close line) and am_echo, the one now cast, sits at 113.1 Hz — so a rung that only
# moves a couple of Hz is a rung nobody can hear the difference on, and a first draft of this
# ladder (1.02-1.14) was exactly that. These span from "as auditioned" up past am_echo's pitch.
#
# Worth saying plainly: pitch does NOT predict whether a voice was liked. am_liam, the take Aaron
# called a computer, reads HIGHER (129.7 Hz) than am_echo, which he approved (113.1 Hz). So this
# ladder is answering his specific question about ONE voice, not looking for a quality knob.
LADDER = [1.02, 1.12, 1.22, 1.32]
LINES = ['int1', 'int2', 'int3', 'close']
VOICES = ['bm_lewis']                  # the one he asked about

n = 0
for v in VOICES:
    for p in LADDER:
        for ln in LINES:
            src = os.path.join(OUT, f'A_{v}_{ln}.wav')
            if not os.path.exists(src):
                print(f'  MISSING {src}'); continue
            dst = os.path.join(OUT, f'P_{v}_{p:.2f}_{ln}.room.mp3')
            room(src, dst, p, 1.0)
            n += 1
print(f'{n} clips -> {OUT}/P_*')

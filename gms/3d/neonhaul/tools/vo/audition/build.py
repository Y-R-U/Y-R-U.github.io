#!/usr/bin/env python3
"""§S2-S — assemble the VO audition page's clips and manifest.

Aaron, having been sent a tape: *"the mp3 is great and all but i can't give way feedback with it …
if you put together a simple website that i can access locally, with each speech part i can hit
play on and i can hit tick or x on each."* A 44-second reel is a fine way to SEND audio and a
useless way to collect an opinion about forty-eight separate clips.

Two things his note also settled, which is why they are gone from here:

  * *"the female voice sounds electronic and hard to understand (the one introducing the voices)"* —
    those were macOS `say -v Samantha` announcements I put between the takes. Announcing a neural
    voice pool with the formant synthesiser it replaced was not a good idea. **There is no spoken
    labelling on the page at all**; the labels are text, where labels belong.
  * *"the first male voice is the bad one"* — the tape opens with `am_liam`, which is the CURRENT
    cast. So the shipped voice is the one he is objecting to, and this page exists to pick its
    replacement rather than to confirm the complaint.

Everything here is already-rendered audio: build.py only copies, names and indexes it, so the page
can never disagree with what the tapes contained.

── ROUND 3: THE PAGE IS NOW ONLY WHAT SHIPS ───────────────────────────────────

Both questions this page was built to answer are answered, so both are gone from it. Aaron:
*"don't leave old stuff on the Web page. only keep stuff for me to review only."*

  * the voice — am_echo, picked out of eleven; am_liam scored 1/4 and was recast.
  * the carrier treatments — refuted by ear, on voices whose plain read he rated 4/4.
  * bm_lewis pitched up — *"the higher pitch on Lewis did not work. stick with echo."*

What is left is the twelve clips the game actually plays, which have BOTH changed since he last
heard them: the male take is a different voice, and the monologue's second "shit" is now "crap".
Those are the only takes with an open question against them, so they are the only takes here.
The ratings behind the decisions stay on disk in votes.json / votes_r1.json — they are the evidence
the cast note in gen_story.py cites — but nothing serves them to the page any more.

    python3 tools/vo/audition/build.py && python3 tools/vo/audition/serve.py
"""
import json, os, shutil, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
VO = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(VO))
VCMP = os.path.join(VO, 'vcmp')
CLIPS = os.path.join(HERE, 'clips')
STORY = os.path.join(ROOT, 'assets', 'audio', 'story')

LINES = {
    'dad1': 'They took the car and they have not been back. That is as done as it gets.',
    'dad2': '…There is a desk under the Tallow Yard. Ask for the Quartermaster. And do not tell '
            'them whose kid you are, because they already know.',
    'int1': 'But—',
    'int2': 'Wait—',
    'int3': 'Just wait—',
    'close': "Shit — they wouldn't let me get a word in. What sort of crap has my Dad got himself "
             "into? I shouldn't even be flying this. I need to make that money fast.",
}
ARMS = {
    'ship': 'as it ships today — the word on its own with a comma',
    'carry': 'full sentence, cut at the end of the key word',
    'carry_ov': 'full sentence, cut 45 ms INTO the next word',
    'bang': 'key word takes an exclamation mark, sentence carries on behind it',
}
VOICE_ALL = ['am_liam', 'am_michael', 'am_fenrir', 'am_puck', 'am_echo', 'am_eric',
             'am_onyx', 'am_adam', 'bm_daniel', 'bm_lewis', 'bm_fable']
VOICE_CARRIER = ['am_liam', 'am_michael', 'am_fenrir', 'bm_daniel']
CURRENT = 'am_echo'

# Round 2. Aaron: *"Lewis is probably my favourite voice but is an older voice, may work of made
# higher in pitch?"* The rungs and the Hz beside each are measured, not nominal — see pitch_probe.py
# for why the first draft of this ladder was too narrow to hear.
PITCH_LADDER = [(1.02, 99.8), (1.12, 107.0), (1.22, 110.8), (1.32, 120.5)]


def copy(src, name):
    dst = os.path.join(CLIPS, name)
    shutil.copyfile(src, dst)
    return os.path.getsize(dst)


def main():
    os.makedirs(CLIPS, exist_ok=True)
    for f in os.listdir(CLIPS):
        os.remove(os.path.join(CLIPS, f))
    items, missing = [], []

    def add(group, voice, line, arm, src, note=''):
        if not os.path.exists(src):
            missing.append(src)
            return
        name = f'{group}__{voice}__{line}__{arm}.mp3'
        copy(src, name)
        items.append({'id': name[:-4], 'group': group, 'voice': voice, 'line': line,
                      'arm': arm, 'file': 'clips/' + name, 'note': note,
                      # Blank rather than falling back to `note`: the voice-level note is already
                      # in the card header, and repeating it on every row cost two wrapped lines
                      # per clip on a phone — over a hundred clips that is a lot of scrolling to
                      # be told the same thing.
                      'text': LINES[line], 'armNote': ARMS.get(arm, '')})

    # 0 — what is in the game right now, all three player genders, as the reference. Aaron says the
    # female and neutral reads are fine, so they are the bar the male one has to reach.
    for g, who in (('m', 'male — now am_echo'), ('f', 'female'), ('n', 'neutral')):
        for line in ('int1', 'int2', 'int3', 'close'):
            add('shipping', f'pc_{g}', line, 'shipped',
                os.path.join(STORY, f'pc_{g}_{line}.mp3'), who)

    # DAD, auditioned on his own two lines. Aaron: *"maybe the dad can use the Lewis voice?"* —
    # bm_lewis rated 4/4 and his one objection to it, that it reads old, is the brief here. Note
    # that Story.THREAD_SCENE is a SILENT text panel today: this is a casting question first and a
    # question about whether to voice that scene at all second.
    for take, who in (('even', 'his own voice, untouched'),
                      ('weary', 'slower and a shade lower — he did not want to be asked')):
        for slot in ('dad1', 'dad2'):
            add('dad', f'bm_lewis — {take}', slot, 'ship',
                os.path.join(VCMP, f'D_{take}_{slot}.room.mp3'), who)

    man = {'lines': LINES, 'arms': ARMS, 'current': CURRENT, 'items': items,
           'groups': [
               {'id': 'shipping', 'title': 'What ships now',
                'blurb': 'The twelve clips the game plays, as they stand now. Two things changed '
                         'since you last heard these: the male take is am_echo instead of am_liam, '
                         'and the monologue\u2019s second \u201cshit\u201d is now \u201ccrap\u201d. '
                         'Nothing else is on this page \u2014 the voice, the carrier treatments and '
                         'the Lewis pitch ladder are all settled.'},
               {'id': 'dad', 'title': 'Dad — is Lewis right for him?',
                'blurb': 'His two real lines from the shady-door scene, in bm_lewis. Two readings. '
                         'Heads up: that scene is a silent text panel today and the player has two '
                         'lines in it as well, so voicing Dad alone would leave you mute opposite '
                         'him — tell me if it should become a voiced scene.'},
           ]}
    json.dump(man, open(os.path.join(HERE, 'manifest.json'), 'w'), indent=1)
    print(f'{len(items)} clips -> {CLIPS}')
    if missing:
        print(f'  MISSING {len(missing)}:')
        for m in missing[:8]:
            print('   ', m)


main()

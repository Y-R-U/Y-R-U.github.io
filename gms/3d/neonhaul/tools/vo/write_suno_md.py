#!/usr/bin/env python3
"""Rewrite the generated halves of docs/SUNO.md from lines.json + the manifest + the measurements.

    python3 tools/vo/gen_chatter.py --verify --json /tmp/v.json
    tools/vo/vw/bin/python tools/vo/intelligibility.py --json /tmp/i.json     # optional
    python3 tools/vo/write_suno_md.py --verify /tmp/v.json --intel /tmp/i.json

`gates_p8` A3 asserts that every foreground slot's popup text appears **verbatim in docs/SUNO.md**,
so that file is not documentation of the pool, it is a second copy of it — and a second copy that
is maintained by hand drifts. This regenerates it instead.

Three regions of the file are rewritten and nothing else is touched:
  · the STATUS block, from `## STATUS` to `## The three rules`
  · everything from `# 4. THE FULL LINE POOL` to the end
The SUNO prompt sections (§1 music, §2 background, §3 foreground) are left exactly as they were:
they are still the best description of what each group is FOR, and §1 is still live.
"""
import argparse, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOC = os.path.join(ROOT, 'docs/SUNO.md')

GROUP_NOTE = {
    'dispatch': 'general Haul Control traffic',
    'dispatch_confirm': 'fires every time the player accepts a job',
    'dispatch_pay': 'fires every time the player completes a delivery',
    'police': 'City Patrol, Air Division — other people’s problems on an open band',
    'pirate': 'The Understack, the unlicensed station',
    'ad': 'the commercial band',
    'distress': 'the open emergency band',
    'weather': 'the Atmospheric Bulletin',
    'life': 'the city talking to itself',
    'bg_net': 'the traffic-net murmur (background — never shown on screen)',
    'bg_dock': 'dock-hand chatter, only while docked (background — never shown on screen)',
}


def status_block(L, M, ver, intel):
    fore = sum(1 for c in M['chatter'] if c['layer'] == 'fore')
    back = len(M['chatter']) - fore
    bases = len({v['voice'] for v in L['voices'].values()})
    kb = ver['totalBytes'] / 1024
    sp = [c['speech'] for c in ver['clips'].values()]
    intel_line = ''
    if intel:
        worst = sorted(((g, sum(r['score'] for r in intel['rows'] if r['group'] == g) / max(1, len([r for r in intel['rows'] if r['group'] == g])))
                        for g in sorted({r['group'] for r in intel['rows']})), key=lambda x: x[1])
        intel_line = (
            f"\n**And the words actually arrive.** `tools/vo/intelligibility.py` transcribes every "
            f"foreground clip with whisper and scores it against the line it is supposed to say. "
            f"Mean word-sequence match **{intel['mean']*100:.1f}%** over {len(intel['rows'])} clips; the weakest group is "
            f"`{worst[0][0]}` at {worst[0][1]*100:.0f}% and the strongest is `{worst[-1][0]}` at {worst[-1][1]*100:.0f}%. Read that number\n"
            f"as a RANKING, not as a percentage a human would score — whisper is degraded by the same band-limit and has\n"
            f"never heard of the Ninefold Approach. What it is good for is finding the mush, and it found it: three of the\n"
            f"MacinTalk-era voices were losing their consonants under the band-limit and were replaced off a controlled\n"
            f"A/B (the same four lines through every candidate), which moved the pool from 86.4% to {intel['mean']*100:.1f}%.\n")
    return f"""## STATUS — rewritten by S2-B (radio voices), 2026-08-20

**Every chatter slot now has audio.** The pool went from 64 declared slots with 26 files on disk to
**{len(M['chatter'])} slots with {len(M['chatter'])} files** — {fore} foreground, {back} background — spoken by **{len(L['voices'])} voice
identities over {bases} Kokoro voices**. Aaron's complaint was *"there is only a couple of
random chatter that loop frequently"*, and the cause was that 38 of the 64 declared slots had never
been generated: the player was hearing four dispatch groups on rotation and nothing else existed.

| | now | was |
|---|---|---|
| chatter slots | {len(M['chatter'])} | 64 declared, 26 on disk |
| foreground lines | {fore} | 22 on disk |
| distinct voices | {len(L['voices'])} identities / {bases} base voices | 1 (a single SUNO operator) |
| total bytes | **{kb:.0f} KB** | 841 KB across the 26 — 7.8x the clips for {ver['totalBytes']/861402:.2f}x the bytes |
| mean clip | {ver['totalBytes']/len(M['chatter'])/1024:.1f} KB | 32.4 KB |
| the same 26 slots | 291 KB re-encoded | 841 KB |
| encode | mono, 16 kHz, 16 kbps mp3 | mono, 32 kHz, ~51 kbps |

**How it is built.** `tools/vo/lines.json` holds every line, its voice and its group. `python3
tools/vo/gen_chatter.py` synthesises the ones that need synthesising with Kokoro-82M, passes every
clip — the SUNO takes included — through `tools/radio_fx.sh`, rewrites `assets/audio/manifest.json`,
and verifies the result. **The SUNO originals are the only input that cannot be rebuilt**; they are
kept in `tools/vo/raw/suno/` (gitignored) and the generator refuses to overwrite them. This file's
generated halves come from `tools/vo/write_suno_md.py`.

**The radio character is in ffmpeg, not in a prompt.** `tools/radio_fx.sh` is a filter chain:
300–3400 Hz band-limit at 36 dB/oct, a 1.8 kHz intelligibility lift, two stages of hard compression,
a pink-noise carrier floor, and a squelch burst keying on at the head and decaying at the tail.
Measured with white noise in (flat to 0.1 dB), the chain reads **−30.8 dB at 50–150 Hz, −17.0 dB at
150–300 Hz, flat across 600–3400 Hz, −14.1 dB at 3400–4500 Hz and −31.5 dB at 4500–7000 Hz**,
relative to the passband. Four profiles — `close`, `distant`, `loud`, `thin` — are the four physical
situations the lines are written for, not four EQ presets.

**Verification.** Because the chain deliberately mixes hiss into every clip, *whole-file* RMS would
pass a clip in which nobody spoke. So `gen_chatter.py --verify` measures the **speech window**
between the two squelch bursts against a floor derived by running a no-speech control through the
identical chain, and checks each clip's duration against what its script and its voice's own
words-per-minute predict. `--falsify` proves both go red. Over all {len(M['chatter'])} clips: speech window
**{min(sp):.1f} to {max(sp):.1f} dBFS** against a floor of **{ver['floor']:.1f} dBFS**, {len(ver['rejected'])} rejected.

`tools/gates_p8.mjs` B5 checks decoded energy again in the browser that will actually decode it, B6
proves that check can fail, and **B5b** measures the same speech window in the browser — B5 alone
stopped being sufficient the moment the assets acquired a deliberate noise floor, and B5b's
falsification demonstrates exactly that: a clip with its speech zeroed and its squelch kept still
reads −33 dBFS whole-file, well above MIN_RMS.
{intel_line}
### The `tag` field

Every slot carries `tag`, and the vocabulary is exactly three values — this is the contract with the
dashboard work (S2-A), which styles the chatter ticker off it and never touches this file:

| `tag` | groups | rendered |
|---|---|---|
| `bg` | `bg_net` `bg_dock` | faded — background wash, not addressed to the player |
| `info` | `ad` `pirate` `weather` `life` | normal — ordinary traffic |
| `alert` | `dispatch` `dispatch_confirm` `dispatch_pay` `police` `distress` | bright / highlighted |

### Music is unchanged

Five of nine music slots have a file. `chase`, `storm`, `first_flight` and `pirate` are still
unfilled and still optional; their pools fall through to `cruise`. `menu.mp3` still has nothing to
play it — the game has no menu screen. Both are unchanged from P8.

### The correction P8 made to the repeat arithmetic still stands

"5 × 7 × 36 s ≈ 21 minutes before any foreground line repeats" is one shuffle-bag *cycle*, i.e. the
mean interval, not a floor. The code adds a per-slot **cooldown** (1500 s ambient, 660 s on the two
job pools) as the hard time floor. Gates A4, A5, A6. With the pool at {fore} foreground lines those
bags are 2–4x longer, so the cycle length rises with them; the cooldown floor is unchanged.

"""


def pool_block(L, M):
    by = {c['slot']: c for c in M['chatter']}
    fore = sum(1 for c in M['chatter'] if c['layer'] == 'fore')
    esc = lambda t: t.replace('|', '\\|')
    p = ["# 4. THE FULL LINE POOL — every slot, verbatim\n\n",
         "Generated from `tools/vo/lines.json`; this is what `assets/audio/manifest.json` says, line for\n"
         "line. `gates_p8` A3 asserts that every foreground slot's popup text appears in THIS FILE verbatim,\n"
         "so the two cannot drift. **Do not hand-edit the tables** — edit `lines.json`, re-run\n"
         "`python3 tools/vo/gen_chatter.py`, then `python3 tools/vo/write_suno_md.py`.\n\n"
         "`voice` is a key in §5's cast table. A `SUNO` row is one of the 26 original SUNO takes, kept and\n"
         "only re-processed through the radio chain.\n"]
    for g, gd in L['groups'].items():
        p.append(f"\n---\n\n## `{g}` — {GROUP_NOTE[g]}\n\n")
        p.append(f"**{len(gd['lines'])} slots** · `{gd['layer']}` · `tag: {gd['tag']}` · gain {gd['gain']} · cooldown {gd['cooldown']} s\n")
        if gd['layer'] == 'back':
            p.append("\nBackground lines are **never shown on screen**, so they carry no `text` in the manifest and\n"
                     "nothing here has to match a popup. Each synthesised one is two people talking over each other,\n"
                     "rendered separately and stacked with a 0.9 s offset.\n\n")
            p.append("| slot | voices | said |\n|---|---|---|\n")
            for i, ln in enumerate(gd['lines'], 1):
                slot = f'{g}_{i:02d}'
                if ln.get('src') == 'suno':
                    p.append(f"| `{slot}` | *SUNO* | *(overlapping traffic-net murmur — see §2's B1 prompt)* |\n")
                else:
                    p.append(f"| `{slot}` | `{' + '.join(ln['v'])}` | {' // '.join(esc(t) for t in ln['t'])} |\n")
        else:
            p.append(f"\nSpeaker label on screen: **{gd['speaker']}**\n\n")
            p.append("| slot | voice | line |\n|---|---|---|\n")
            for i, ln in enumerate(gd['lines'], 1):
                slot = f'{g}_{i:02d}'
                v = '*SUNO*' if ln.get('src') == 'suno' else f"`{ln['v']}`"
                p.append(f"| `{slot}` | {v} | {esc(by[slot]['text'])} |\n")

    p.append("\n---\n---\n\n# 5. THE CAST\n\n")
    p.append(f"{len(L['voices'])} voice identities over {len({v['voice'] for v in L['voices'].values()})} Kokoro voices. Where two identities share a base\n"
             "voice they differ in pitch, in words-per-minute and usually in radio profile — a ±7 % pitch shift\n"
             "moves the formants as well as the pitch, so behind a 3.4 kHz band-limit it reads as a different\n"
             "person rather than the same person sped up. Listen to the whole cast in one file:\n"
             "`python3 tools/vo/gen_chatter.py --demo` → `tools/vo/raw/voice_demo.mp3`.\n\n")
    p.append("| id | Kokoro voice | pitch | wpm | profile | who |\n|---|---|---|---|---|---|\n")
    for k, v in L['voices'].items():
        p.append(f"| `{k}` | {v['voice']} | {v['pitch']:.2f} | {v['rate']} | `{v['profile']}` | {v['who']} |\n")
    p.append("\n---\n\n## Slot summary\n\n| group | slots | on screen | tag |\n|---|---|---|---|\n")
    p.append(f"| music | {len(M['music'])} | — | — |\n")
    for g, gd in L['groups'].items():
        p.append(f"| `{g}` | {len(gd['lines'])} | {'yes' if gd['layer'] == 'fore' else 'no'} | `{gd['tag']}` |\n")
    p.append(f"| **total** | **{len(M['chatter']) + len(M['music'])}** | **{fore} foreground** | |\n")
    return ''.join(p)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--verify', required=True, help='the --json report from gen_chatter.py --verify')
    ap.add_argument('--intel', help='the --json report from intelligibility.py')
    a = ap.parse_args()
    L = json.load(open(os.path.join(ROOT, 'tools/vo/lines.json')))
    M = json.load(open(os.path.join(ROOT, 'assets/audio/manifest.json')))
    ver = json.load(open(a.verify))
    intel = json.load(open(a.intel)) if a.intel else None
    src = open(DOC, encoding='utf-8').read()
    for marker in ('\n## STATUS', '\n## The three rules', '\n# 4. THE FULL LINE POOL'):
        if marker not in src:
            print(f"write_suno_md: '{marker.strip()}' not found in docs/SUNO.md — refusing to guess "
                  f"where the generated regions are", file=sys.stderr)
            return 1
    head = src[:src.index('\n## STATUS') + 1]
    mid = src[src.index('\n## The three rules') + 1:src.index('\n# 4. THE FULL LINE POOL') + 1]
    out = head + status_block(L, M, ver, intel) + mid + pool_block(L, M)
    open(DOC, 'w', encoding='utf-8').write(out)
    print(f"docs/SUNO.md rewritten — {len(out.splitlines())} lines, {len(M['chatter'])} slots documented")
    return 0


if __name__ == '__main__':
    sys.exit(main())

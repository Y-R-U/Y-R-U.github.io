# Monster pipeline — run state

Byte-identical in `awake/` and `the_horrors/`. Architecture lives in this
project's `AGENTS.md` / `CLAUDE.md`; this file is only the state of the
2026-08-11 regeneration run and what is left to do.

## The one thing to understand first

**Event clips start on the empty hallway and END on the composite.** Every room's
exit transition lands on the same hallway plate, so when a release or attack
fires the player is looking at exactly `images/hallway.jpg`. The clip therefore
opens on that plate and is pinned with LTX `image_end` to arrive at
`images/monster_<kind>_<id>_end.jpg`.

That is what the hub topology buys: one room→hallway transition feeds *every*
event, so the event clip only has to be continuous with the hallway, not with
each of the 11+ rooms.

An earlier pass had this backwards — the composites were used as *start* frames,
so each event opened with the monster already standing in a hallway the player
had just watched be empty. The clips looked fine in isolation and were wrong in
play. `check_monsters.py` now measures it: `driftstart` compares frame 0 against
the hallway plate, `noarrive` compares the last frame against the composite.

| | frames | seconds |
|---|---|---|
| release | 73 | 3.0 |
| attack | 97 | 4.0 |

## Prompt lessons (all found by sampling, not by assuming)

1. **A generic snarl brief destroys identity.** "Eyes wide, teeth bared, snarling"
   made Flux2 discard the reference: every faceless monster came back as the same
   ape. Each creature carries `hasFace`; only genuinely faced ones get snarl
   language, and every prompt restates the creature so the reference is anchored
   by text as well as image.
2. **Phrase framing as camera distance, never as a crop.** "The top cut off by the
   frame" was read literally — `frost` and `radiant` came back decapitated. Use
   "photographed from extremely close range … its whole head still inside the frame".
3. **Never say "blacks out the frame".** Dark creatures lost the entire middle of
   the clip. Say "fills the whole frame" plus an explicit lighting clause.
4. **LTX cannot add light that is not in the start frame.** `parasite` and `shadow`
   survived two video-prompt rewrites unchanged because their *stills* were nearly
   black. Dark creatures need `DARK_LIGHTING` in the still prompt — fix the stage
   before, not the stage that fails.
5. **Give anything without legs its own locomotion.** A vine mass or nanite cloud
   told to "walk" will be made to walk. See `MOTION` in the prompt builder.

## Selection rule

`check_monsters.py --select` picks the **newest clean take**, not the highest
score. The score rewards pixel travel, which under-rates a deliberate slow
walk-in. The flags are the real gate.

Flags: `driftstart` (frame 0 is not the hallway), `noarrive` (never reached the
composite), `dark` (whole clip black), `murky` (mid-frame unreadable — the one
that matters, max-across-frames hides it), `static`, `runaway`, `tiny`, `short`.

Measured separation on known-good clips: matching frames diff at **3.9–7.3**,
mismatched at **46–52**. Thresholds sit at 18 / 20.

## Zoom punch-in

Now **off by default**. It was a workaround for LTX stopping short; `image_end`
guarantees arrival, and punching into an already-full-frame face just crops it.
Still available per-clip in the debug panel for a take that lands short.

## State at 2026-08-11 20:10 — end-frame re-render COMPLETE

All 52 clips re-rendered on the end-frame pipeline and selected.

| | clips | playing a new take | flagged | worst drift | worst arrive |
|---|---|---|---|---|---|
| awake | 28 | 28 | 0 | 4.1 | 9.5 |
| the_horrors | 24 | 24 | 0 | 3.7 | 9.1 |

Limits are 18 / 20, so every clip clears them by a wide margin. All 52 pass a
full ffmpeg decode. Zoom punch is enabled on **zero** selected clips.

One repair was needed: `attack:parasite` went `murky` (mid-frame luminance 14.8,
the vine mass swallowing the corridor). Adding an explicit rim-light clause to
that one prompt took it to 55.6 and score 13.6 → 63.0. See v7 vs v6.

Note the pre-existing Horrors clips were *already* starting from the hallway —
its older `gen_event_videos.py` defaulted `start_image` to `images/hallway.jpg`.
Awake's did not, which is why Awake's old clips score `driftstart` 43–87 and
several of the Horrors ones pass. Both now go through the same path.

## If you pick up from here

- Old (pre-end-frame) clips are still on disk and still listed in the panel,
  now badged with their flags. Nothing selects them. Deleting them is a free
  ~15 MB if you decide the comparison is no longer worth keeping.
- Re-render one clip: `python3 gen_monsters.py videos --only <id> --kind attack`.
- **Commit** — stage only `gms/2d/awake` and `gms/2d/the_horrors`; the repo has
  unrelated uncommitted `gms/3d/monopole` work that must not be swept in.
- Long batches: launch detached (`nohup`, PPID 1). Harness-tracked background
  tasks were killed three times mid-run here. If a run dies, the in-flight LTX
  job usually survives server-side — poll `/api/jobs/<id>` and download it
  rather than re-rendering.

## Gotchas

- `ref/*.png` and `original_files/` are gitignored; the committed `ref/*.jpg`
  copies are what the game and the off-network debug panel load.
- Two `gen_monsters.py` processes on the *same* clip race on the variant number —
  fine across different projects, not within one.
- The helper rewrites `js/variants.js`; stop it before a big batch so it cannot
  interleave writes with the generator.
- `check_monsters.py` samples at a fixed `64:106`, not `scale=64:-1` — video
  frames and the stills are different aspect ratios and otherwise cannot be
  diffed at all.
- Debug panel URL is `http://127.0.0.1:8788/<slug>/?debug`, not the Pages URL.

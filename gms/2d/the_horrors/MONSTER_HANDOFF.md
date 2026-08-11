# Monster pipeline — run state

Byte-identical in `awake/` and `the_horrors/`. Architecture lives in this
project's `AGENTS.md` / `CLAUDE.md`; this file is only the state of the
2026-08-11 regeneration run and what is left to do.

## What shipped in this run

**Code (done, verified in both games):**
- `js/variants.js` — every monster clip ever rendered + which one plays + zoom settings
- `js/monsters.js` — clip resolution, jump-scare punch-in, Monsters debug tab (byte-identical both games)
- `gen_monsters.py` + `monsters.json` — the four-still-per-creature art pipeline
- `check_monsters.py` — objective scoring and variant selection
- `regen_helper.py` — `/api/variant_select`, `/api/variant_zoom`, monster redos append variants instead of overwriting
- Debug panel: `MONSTERS · ROOM · ENDING · POSSIBLE · OTHER · ALL · MINI`, opens on MONSTERS
- In-room `scare_<room>.mp4` clips retired from gameplay (`playRoomScare` is now a light-cut shudder)
- `gen_event_videos.py` guarded so it can no longer clobber monster v1 files

**Art (done):** 104 stills — 4 per creature × 26 creatures. All sampled by eye.

## Prompt lessons (all four found by sampling, not by assuming)

1. **A generic snarl brief destroys identity.** "Eyes wide, teeth bared, snarling"
   made Flux2 discard the reference: every faceless monster came back as the same
   ape. Each creature now carries `hasFace`; only genuinely faced ones get snarl
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

## Selection rule

`check_monsters.py --select` picks the **newest clean take**, not the highest
score. The score rewards pixel travel, which systematically under-rates the new
release clips (a deliberate two-step walk) against v1 (creature materialising out
of nothing). Side-by-side frames confirmed the newer take reads better on identity
and framing every time it scored lower — `bone_collector` attack v3 scores 37 vs
v2's 65 and is obviously better. Only fall back to score when every take is flagged.

Flags: `dark` (whole clip black), `murky` (mid-frame unreadable — the one that
matters, max-across-frames hides it), `static` (creature never moved), `runaway`
(structure collapsed), `tiny`, `short`.

## State at 2026-08-11 10:56

| | stills | v1 | v2 | v3 |
|---|---|---|---|---|
| awake | 56 ✅ | 28 | 28 ✅ | 3 |
| the_horrors | 48 ✅ | 24 | 18 / 24 | 2 |

Verified good: awake releases 14/14, awake attacks 11/14, horrors attacks 6/8,
horrors releases 7/8 (of those rendered so far).

## Remaining work

1. **Wait** for `gen_monsters.py videos` (horrors main batch, 6 clips) and the
   `--only faceless_doctor` repair to finish. Watch
   `/private/tmp/.../scratchpad/run_all.log`.
2. **Flux pass** (needs LTX idle — they cannot co-reside in 24 GB):
   ```
   cd awake && rm images/monster_attack_{parasite,shadow}_start.jpg
   python3 gen_monsters.py images --only parasite,shadow --kind attack
   cd ../the_horrors && rm ref/monster_paper_mask_attack.jpg images/monster_attack_paper_mask_start.jpg
   python3 gen_monsters.py images --only paper_mask --kind attack
   ```
   (`paper_mask`'s attack close-up dropped the body and kept only the floating
   sheet of paper; its base reference is good.)
3. **Video pass** for those three: `gen_monsters.py videos --only … --kind attack`
4. **Score the last horrors clips**, requeue anything flagged.
5. `python3 check_monsters.py --select` in both games, review key frames.
6. **Commit** — stage only `gms/2d/awake` and `gms/2d/the_horrors`; the repo has
   unrelated uncommitted `gms/3d/monopole` work that must not be swept in.

## Gotchas

- `ref/*.png` and `original_files/` are gitignored; the committed `ref/*.jpg`
  copies are what the game and the off-network debug panel load.
- Two `gen_monsters.py` processes on the *same* clip race on the variant number —
  fine across different projects, not within one.
- The helper rewrites `js/variants.js`; stop it before a big batch so it cannot
  interleave writes with the generator.
- Debug panel URL is `http://127.0.0.1:8788/<slug>/?debug`, not the Pages URL.

# SKYHAMMER — MANAGER STATE

**Read this, then `CONTRACTS.md`, then `ART.md`, then whichever `*_NOTES.md` exist.**

## What this is

A mobile-first **landscape** 2D side-scrolling WW2 plane game for the Y-R-U site, at
`gms/2d/skyhammer/`, served from `/gms/2d/skyhammer/`. Shape reference: the mobile game
**Aircraft Evolution** (Satur Entertainment) — Aaron named it as the target and the manager
studied its store screenshots. Fly left to right, main gun auto-fires, bomb ground targets with
4 thumb-button specials, dogfight, collect balloons, land on carriers, spend the money in a
hangar between levels. 100 story levels across 5 acts, plus Survival / Time Attack / Boss Rush /
weekly event. WW2 to start, drifting into jets and light absurdity later — nukes are on the
upgrade tree and you survive your own blast.

## Why it is not KITEHAWK

KITEHAWK (`gms/2d/kitehawk/`) was the previous attempt at "Aaron's plane game" and Aaron has
called it: start from scratch. It was **portrait**, its signature mechanic was parachute supply
crates, and it accumulated ~900 KB of docs and 78 generated art plates before it was fun. What we
took from it: **`tools/cdp.mjs`, `tools/shot.mjs`, `tools/touch.mjs`** — a battle-tested raw-CDP
headless-Chrome harness with two expensive gotchas already solved. Those three files are
**frozen**; nobody edits them. We took nothing else. Its generated art is badly keyed (black
mattes, magenta fringing) and is not reusable.

## The order of work

| Phase | What | State |
|---|---|---|
| P0 | Contracts, art direction, seeded data tables | **done** |
| P1 | Four parallel agents: ENGINE+SIM, ART, DESIGN, UI | running |
| P2 | Manager integrates: real renderer swapped in for `gfx/debug.js`, UI wired to main | |
| P3 | Playtest and tune — the camera numbers and the point-at-finger feel are expected to move | |
| P4 | Audio: music + sfx + haptics | |
| P5 | Modes, attract screen, special events | |
| P6 | Ship: `projects.js` entry with `wip: true`, screenshot, commit, push | |

## How this run works

- The manager **verifies claims rather than accepting reports**. Screenshots get looked at; gates
  get falsified; detail lines get read, not pass counts.
- **Agents do not run git.** The manager stages `gms/2d/skyhammer/`, one `projects.js` hunk and
  the screenshot, explicitly. **Never `git add -A`** — other sessions have live uncommitted work
  in this tree.
- **One owner per file** (CONTRACTS §10). Four agents ran concurrently in P1 only because their
  file sets are disjoint and the world/renderer/hitrect contracts were written first. Cross-file
  contracts are where multi-agent builds die.
- At every playable milestone: commit, push, and make sure the `projects.js` entry exists with
  `wip: true` until the game is finished.

## Open questions for Aaron

1. Music: Suno in the browser as he asked, vs the local ACE-Step generator. Manager is checking
   which is faster; Suno probably wins on quality for the WW2→metal transition he described.
2. Whether the eras past act 2 stay WW2-flavoured or go openly cyberpunk. He said tbd.

## Ship checklist (P6)

1. `projects.js` — add the SKYHAMMER entry with `wip: true` and a real `desc`, `date`, `creator`.
2. Screenshot at `assets/screenshots/skyhammer.jpg`.
3. Re-run the registry walk: parse `projects.js`, confirm entry count and **0 dead paths**. Aaron's
   rule — the registry drives the tiles, so walk it against the filesystem after any path change.
4. Stage **explicitly**: `gms/2d/skyhammer/`, the `projects.js` hunk, the `index.html` hunk, the
   screenshot. **Never `git add -A`** — other sessions have live uncommitted work in this tree.
5. Check behind/ahead before rebasing; several sessions share this checkout and `--autostash`
   would stash someone else's live work.

**Done already (2026-08-26):** KITEHAWK re-tagged from *In progress* to **CANCELLED** at Aaron's
request. Needed a new mechanism — the page only understood `wip: true` → "In progress" — so
`projects.js` entries now support `status: "cancelled"` and `index.html` renders a
`.card-wip-badge.is-cancelled` variant. Two contrast iterations: muted grey was invisible against
KITEHAWK's pale cloud screenshot, so it is now **red on a dark plate with a soft glow**, matching
the site's cyber palette and readable against any thumbnail. KITEHAWK's `desc` tail was updated
too — it read "In active build", which would have contradicted the badge. Registry re-validated:
103 entries, 0 dead paths.

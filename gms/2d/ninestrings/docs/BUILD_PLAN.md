# NINE STRINGS — Build Plan

**Read order for any new session: DESIGN.md → CONTRACTS.md → this file → HANDOFF.md.**

This file is the resumable state of the build. Every lane owner updates its own
row the moment a step changes state, *before* moving on — if a session is
interrupted, this file plus HANDOFF.md must be enough for a stranger to carry on.

Status keys: `TODO` · `WIP` · `DONE` · `BLOCKED(reason)` · `CUT`

> **2026-09-14: the multi-agent build ended.** A spend limit killed all five
> running lanes mid-edit and the rest was finished by a single session. The lane
> ownership map below is kept for history, but **there are no lanes any more** —
> one session owns everything. Read `docs/HANDOFF.md` for the real state,
> especially the "Known gaps" list at the end.

---

## Ownership map — who may write where

A lane **only** writes files in its own column. If you need a change in someone
else's file, append a request to HANDOFF.md; do not reach across.

| Lane | Owns | Must not touch |
|---|---|---|
| **M** manager | `docs/**`, `index.html`, `js/main.js`, `css/**` | — |
| **A** gfx | `js/gfx/**` | sim, data, ui |
| **B** sim | `js/sim/**` | gfx, ui, data values (may read data shapes) |
| **C** content | `js/data/**` | sim, gfx, ui |
| **D** ui | `js/ui/**` | sim, gfx, data |
| **E** audio | `js/audio/**` | everything else |
| **F** art | `art/**`, `tools/gen_art.mjs` | all js |
| **G** gates | `tools/**` (except gen_art) | all js |

---

## Phase 0 — Spine (manager, no agents)

| # | Step | Status |
|---|---|---|
| 0.1 | Directory + docs (DESIGN, CONTRACTS, BUILD_PLAN, HANDOFF, DECISIONS) | DONE |
| 0.2 | `index.html`, `css/style.css`, `css/ui.css`, boot error trap | DONE |
| 0.3 | `js/core/**` — rng, pool, events, input, viewport, save, loop | DONE |
| 0.4 | Stub every module named in CONTRACTS with real signatures + TODO bodies | DONE |
| 0.5 | `tools/cdp.mjs` copied from SILT; `tools/boot.mjs` proves a black screen boots | DONE |

**Phase 0 exit gate:** page boots to a cleared canvas, `window.__ns` exists,
`node tools/boot.mjs` passes, no console errors.

## Phase 0 result

Boots on a 390x844 viewport, `window.__ns.ready`, sim ticks, no console errors,
and `--falsify boot` proves the gate can go red. The two open FAILs (`every
module loaded`, `canvas is lit`) ARE Phase 1's work.

## Lane status files

Each lane owns `docs/lanes/<LANE>.md` and updates only that. The manager rolls
them up here. This exists so parallel agents never contend on one file.

## Phase 1 — Parallel foundations

| Lane | Step | Status |
|---|---|---|
| A1 | WebGL2 batch renderer: sprite/quad/line/curve/text, layers, context-loss recovery | TODO |
| A2 | `atlas.js` procedural rig baking — humanoid/crawler/bloat/hulk/wisp/demon + font + icons | TODO |
| A3 | `particles.js` + `camera.js` (spring shake, kick, follow) | TODO |
| B1 | `world.js` step order, entity pools, spatial hash, `stats.js` derivation | TODO |
| B2 | `enemy.js` AI kinds, `spawn.js` director, `damage.js` resolution + knockback | TODO |
| B3 | `weapon.js` the 10 `kind` handlers + `projectile.js` + `pickup.js` | TODO |
| B4 | `strings.js` catenary, attach/sever, `conductor.js`, choir affixes | TODO |
| C1 | `enemies.js` (24 defs), `stages.js` (12 defs + timelines) | TODO |
| C2 | `weapons.js` (16), `passives.js` (12), `evolutions.js` (10) | TODO |
| E1 | `audio.js` procedural sfx bank + `music.js` generative act layers | TODO |
| G1 | `tools/sim.mjs` node balance harness (headless world, determinism, TTK curves) | TODO |
| G0 | `tools/portrait.mjs` mobile gate — 3 devices, 420u width, no overflow, DPR | DONE |

**Phase 1 exit gate:** `node tools/sim.mjs` runs 12 stages headless to
completion with plausible TTK and survival curves; `node tools/boot.mjs` shows
enemies moving and being killed on screen.

## Phase 2 — Game shape (4 agents)

| Lane | Step | Status |
|---|---|---|
| A4 | `scenefx.js` — every event type gets a visual; `postfx.js` bloom/shake/chroma/flash | TODO |
| A5 | `hud.js` — health, xp bar, timer, level, weapon row, kill count, boss bar | TODO |
| D1 | Screen framework + title/pause/results/settings | TODO |
| D2 | `levelup.js` — the most-used screen in the game. Reroll/banish/skip. | TODO |
| D3 | `sanctum.js` meta spend tree + `charSelect` + `stageSelect` + `loadout` | TODO |
| D4 | `dialogue.js` VN strip + `codex.js` bestiary | TODO |
| C3 | `characters.js` (6), `relics.js` (14), `sigils.js` (18), `meta.js` sanctum tree | TODO |
| C4 | `story.js` — 12 intros, 12 outros, 4 act interstitials, the ending fork | TODO |
| G2 | `tools/uishot.mjs` — real taps, 44px hit gate, screen-by-screen capture | TODO |

**Phase 2 exit gate:** a full run is playable start to finish by hand on a
390×844 viewport: title → stage → dialogue → play → level-ups → boss → results
→ sanctum → next stage.

## Phase 3 — Depth + feel (3 agents)

| Lane | Step | Status |
|---|---|---|
| B5 | Bosses: 4 Choirmasters with phases, `boss.js` | TODO |
| B6 | Sigils + relics + curse tiers wired into the sim | TODO |
| A6 | Chorus set-piece, conductor-death shockwave, thread-snap whips, evolution flash | TODO |
| C5 | `unlocks.js` ladder + tutorial beats + `challenges.js` | TODO |
| M | Onboarding pass — the §4 ramp, gated by a fresh-save playthrough | TODO |
| E2 | Music reacts to threat + boss stingers + chorus swell | TODO |

## Phase 4 — Art, balance, ship

| # | Step | Status |
|---|---|---|
| F1 | Flux: title art, 6 character portraits, 4 Choirmaster portraits | TODO |
| F2 | Flux: 4 act backdrops + Sanctum + 4 story panels | TODO |
| G3 | `tools/boot.mjs --falsify` — every gate proven capable of going red | TODO |
| G4 | Perf gate: 400 enemies @ 60fps, DPR2, portrait, `--gpu` | TODO |
| M | Balance pass driven by `sim.mjs` curves, not vibes | TODO |
| M | Screenshot → `/assets/screenshots/ninestrings.jpg`, `projects.js` entry | TODO |
| M | Commit + push (scoped adds only — the tree is shared with other sessions) | TODO |

---

## Standing orders for every agent

0. **Mobile-first PORTRAIT.** See DESIGN Section 8.5. A phone held upright in
   one hand is the target; everything else is an afterthought. Bottom-half
   reach, 44px targets, safe-area insets, no body text under 12px, and the
   gates run at 390x844 / 360x640 / 430x932 at DPR 2 — never a desktop window.
1. **Read `docs/CONTRACTS.md` first.** Build to the signatures exactly.
2. **Update your row in this file to `WIP` before you start and `DONE` when the
   step genuinely runs.** Not when the file exists — when it works.
3. **Append to `docs/HANDOFF.md`**: what you built, anything you discovered that
   the next agent would otherwise rediscover, and any contract you need changed.
4. **Never `Math.random()` under `js/sim/`.** Never import gfx from sim.
5. **No CDN, no build step, no dependencies, no importmap.**
6. **Do not `git add -A`.** The working tree is shared with other sessions; the
   manager does all staging, scoped to this directory.
7. If a thing is not yet built that you need, **stub it to the contract and note
   it in HANDOFF.md** — do not invent a different interface.
8. Leave the codebase runnable at every step. A broken boot blocks every lane.

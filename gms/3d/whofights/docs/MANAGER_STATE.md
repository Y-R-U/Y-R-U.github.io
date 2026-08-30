# WHO FIGHTS — manager state

**Read this first if you are picking this session up cold.** It is the coordinator's own record,
written to survive a usage-limit cutoff. Last written 2026-08-30, ~13:20Z.

`docs/DEV_CONTRACT.md` is the binding spec. `docs/DEVTOOLS.md` is how the dev tools work.
`docs/HANDOFF.md` is the scaffold agent's record. Read those; this file is only *what is happening*.

## The ask, from Aaron

A new project copied off the FORGE engine, called **Who Fights**. A deliberately simple starting
level (road, castle, oversized hall, four contract boards, a white-cloak NPC, meadows) and then —
the actual point — **a solid set of developer tools** behind a dev mode that only appears on
localhost or a private LAN address. Level editor with hotspots, conversation editor, character
viewer with Kokoro voices and barks, a sound studio and music box, and whatever other debug pages
are worth having.

Aaron's own framing: *"the idea is, simple start template, and I want to work on a solid set of
developer tools."*

## Recovery rules

- **Never `git add -A`.** Several other sessions are live in this shared tree (waterline, kitehawk,
  homebound). Stage `gms/3d/whofights/`, `gms/3d/forge/`, `projects.js` and
  `assets/screenshots/whofights.jpg` explicitly and nothing else.
- Check `git rev-list --left-right --count origin/main...HEAD` before any rebase. Another session
  pushed on top of this one's FORGE commit within seconds.
- **The GPU is one slot.** ACE-Step (`:8001`) and Flux (`:7867`) cannot co-reside in 24 GB. Check
  `/admin/status` and `/api/status` before starting anything that generates. Never run two.
- Verify before believing: `node tools/test.mjs` and `node tools/shot.mjs --shot=spawn`, then
  **open the PNG**. Headless renders here are software-rendered — the image is trustworthy, the
  timings are not.

## Done and pushed

- **FORGE quality control** — commit `f71635e`, deployed and live. Preset picker, render scale,
  shadows, live fps, first-run auto-detect. Fixed two bugs on the way: `usePreset()` rebuilt the
  whole world on every preset change, and `tools/shot.mjs` had rendered nothing since 23 Aug
  because its static server was rooted below the `lib/` the importmap points at. 588 tests pass.
  Aaron's decisions applied: shadows are three options, Ultra shares High's soft filter.

## Done, not yet committed

- **Engine lift + the Academy level.** `js/engine`, `js/world`, `js/editor`, a thin `js/game`.
  FORGE's campaign/quest/economy layer deliberately left behind. `__forge` → `__wf`, localStorage
  renamespaced `wf.*`. The level is authored entirely in `data/levels/academy.json`.
- **Dev infrastructure.** `js/dev/gate.js` (local-only, 56 tests), `boot.js`, `hub.js`, `api.js`,
  `data.js` (store with undo), Status and Data tabs, `tools/devserver.mjs` on port **8796**,
  `tools/vo/kokoro_say.py`. Async job queue for `/api/music` and `/api/flux`.
- **Music library**, 25 tracks so far, generated on Suno in Aaron's browser.
- 168/168 tests pass. `spawn` renders at 70 calls / 137k tris.

## In flight — six agents

| what | owns | state |
|---|---|---|
| Music library | `audio/music/**`, `data/music.json`, `docs/MUSIC.md`, `docs/SUNO.md`, `tools/music/**` | running ~1h; on Suno via browser, plus local ACE-Step comparison takes |
| Level editor + hotspots | `js/dev/tabs/level.js`, `js/dev/level/`, `js/editor/**` | running |
| Conversation editor | `js/dev/tabs/convo.js`, `js/dev/convo/` | running |
| Character viewer + voices + barks | `js/dev/tabs/chars.js`, `js/dev/chars/`, `data/barks.json` | running |
| Music box + sound studio + runtime | `js/dev/tabs/music.js`, `js/dev/music/`, `js/game/music.js`, `audio/studio/` | running |
| Debug panels | `js/dev/tabs/debug.js`, `js/dev/debug/` | running |
| Interior art pass | `js/world/interior.js`, `materials.js`, `lighting.js`, `boards.js`, hall dressing in `academy.json` | running |

**If they were killed by the usage limit**, the tab files already exist and parse. Re-brief only
what is genuinely unfinished — read each tab file first rather than restarting it blind.

## Not started

- **Flux character-skinning experiment.** Aaron asked: can we make a base dummy model, skin it from
  a Flux-generated image, template it, and regenerate from a prompt typed into the debug tool?
  Deliberately held back because it needs sole ownership of the GPU and ACE-Step was resident.
  **Start this once `:8001` reports unloaded.** It is genuinely a research task — an honest verdict
  is a fine deliverable. Note this engine's characters are faceted vertex-coloured geometry with no
  UVs, so a UV'd dummy has to be built before anything can be skinned onto it.

## Aaron's decisions so far — do not relitigate

| | |
|---|---|
| Hall size | **Keep 35 × 29 m** and dress it — tables, cupboards, tapestries, doors to other rooms, some locked. |
| Locked doors | Author with existing verbs only: `if` predicate on a flag firing `goto`, plus the inverse firing a `say`. No new action verb. |
| Castle tone | Pale limestone stays. Per-object tone is **already a data field** (`zone` on every object); the editor gets a picker for it, labelled **tone**, not "zone". |
| White cloak | **Instructor Vail**, a woman, voice `bf_emma`. Confirmed. |
| FORGE shadows | Three options. Ultra shares High's soft filter. Done. |
| Music source | **Suno** for the initial library — credits are not a constraint, over-generate and curate. **ACE-Step is the long-term route**, since the Suno subscription lapses; it must stay first-class and every track must be re-makeable from what `docs/MUSIC.md` records. |
| projects.js | Who Fights added, `wip: true`. `wip` removed from SKYHAMMER and Sunderfall. |

## Known problems

- The great hall reads as a timber box — flat-lit, plank texture on every surface, beams sized off
  cottage constants. That is what the interior art agent is fixing.
- Portrait crops the outer two contract boards from the authored `hall` framing.
- `js/game/audio.js` and `sounds.js` were lifted but are unwired.
- `gotoLevel` reloads the page.
- `Props` is instantiated empty.

## What Aaron wants next

To **play-test it together**. The report to him should lead with what he can click on, not with
architecture.

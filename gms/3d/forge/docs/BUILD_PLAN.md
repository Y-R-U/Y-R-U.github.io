# FORGE — build plan

**Read this first each session, then the doc for the stage you are on.** This file sequences the
work and records what is done. The design lives in the other five documents and is not repeated
here.

| Doc | Owns |
|---|---|
| `STORY.md` | premise, three campaigns, 99 quests (79 story + 20 sandbox), cast, dialogue voice, the calendar |
| `SYSTEMS.md` | ten schools, XP, combat, gathering, economy, Graft, save shape, balance |
| `WORLD.md` | world map, the K = 1.5 derivation, per-town plans, river/roads, engine phases, perf |
| `RUNTIME.md` | world clock, quest engine, dialogue, journal, save, HUD, onboarding, audio |
| `REVIEW.md` | the critique that produced the current shape. Historical, but read the cut list. |

## Scope — the whole game

**Build all of it.** Three towns, three campaigns, 99 quests (79 story + 20 sandbox), ten schools,
level cap 20. Aaron
confirmed the full scope and accepts that balance and playtesting will mean substantial rework:
*"no way to avoid plenty of tweaking and re-work to make the game play well."*

So the target is **a solid, sensible, defensible starting point** — not a perfect one. Two
consequences that should shape every decision:

- **Do not gold-plate.** Anything that will be re-tuned after playtesting gets built once, cleanly,
  and moved past.
- **Do make it easy to re-tune.** Balance in data and knobs, not buried in code. This is the single
  highest-value property of the codebase, because re-tuning is guaranteed.

The `MVP` / `P2` / `P3` tags in the docs are now **build order, not a cut line.** Build in that
order because it is the dependency order and it gets something playable soonest. Do not stop at the
end of `MVP`.

## Signed off — do not relitigate

Landscape only · K = 1.5 permanent · new scene types (mill, barn, pen, cross, arcade, retaining) ·
player-centred grass cut · one character across all three campaigns · level cap 20 · towns
generated then hand-tuned · editor ships as is · **additive `zones.js` fields approved** ·
**`quality.register` gains `rebuild: true`**.

Canonical terms are in `CLAUDE.md`. Use them; do not reintroduce Attunement, Draw, Delve, Wear,
Cinder Tokens or Warden-the-enemy.

---

## Track A — world and engine

From `WORLD.md §5`. **Strictly ordered. Do not start a phase until the previous one is green.**

| # | Phase | Files | Done when |
|---|---|---|---|
| A0 | Instrument the baseline | `tools/budget.mjs` (new), `shot.mjs` | `docs/BASELINE.json` committed with per-system triangle attribution; five scenarios render unchanged |
| A1 | **The scale pass, K = 1.5** | `buildings.js`, `interior.js`, `stairs.js`, `doors.js`, `colliders.js`, `terrain.js` (decals), `editor/scene.js`, `editor/build.js`, `player.js` | every number in `WORLD.md §2.8`, in **one commit**; doors still passable; the demo looks crowded, which is expected |
| A2 | Camera fit + ceiling collider | `player.js`, `colliders.js` | indoor camera never clips a ceiling; **the phone fill-rate test happens here, not at A9** |
| A3 | World extents | `player.js`, `terrain.js`, `lighting.js` | the ±145 / −100..108 clamp is gone; shadow camera, fog and the 2000 far plane all resized |
| A4 | Terrain rebuild | `terrain.js` | real countryside between towns; the flatten mask releases (it currently never does) |
| A5 | River and roads | `terrain.js`, `water.js` | a meandering river across 1440 m, four crossings, roads joining three towns |
| A6 | Document schema v3 | `editor/scene.js`, `editor/build.js`, `world/*` | new types build; v2 documents migrate; `normalise()` still rejects junk |
| A7 | LOD, culling, streaming | new `world/stream.js`, `build.js` | budget held while traversing; editor shows a live triangle readout |
| A8 | Author the three towns | `editor/townGen.mjs` (new, node-only), `data/world.json` (new, committed) | generate → hand-tune in the editor → freeze |
| A9 | Gate re-verification | — | headed at `--preset=medium --dpr=1 --w=844 --h=390`, **and Aaron's actual phone** |

**A1 is one commit and cannot be split.** A 1.5× house with a 1× door does not fit a player
through it, and a 1.5× plinth (0.66) against the current 0.62 step-up locks every front door in the
game. `stepUp` must rise to 0.93 in the same commit.

## Track B — game runtime

From `RUNTIME.md §10`. Mostly independent of Track A and can run alongside it from the start.

| # | Work | Done when |
|---|---|---|
| B0 | `js/kv.js` — extract `read`/`write`/`drop`/boot-probe out of `editor/store.js` | both the editor and the game save through it; quota-full and blocked-storage still handled |
| B1 | `js/game/worldclock.js` | drives the `time` knob at 4 Hz, rebases when the panel or a scenario writes `time`; **`shot.mjs --all` byte-identical before and after** |
| B2 | Quest engine on the eight primitives + `tools/lintQuests.mjs` | adding a quest is appending an object to a JSON pack; no code change; `node --test` runs the packs |
| B3 | Dialogue | non-modal, movement off, look-drag live, clock still running; the `[speaker, line1, line2?]` format makes a third line unwriteable |
| B4 | Journal — Quests / Truths / Log | recontextualisation renders as strikethrough with the superseding Truth beneath |
| B5 | Save | versioned, migrations, mid-quest state, position with a scene-revision + ground check |
| B6 | HUD, menus, market panel, faction select | **done** — including the Longacre slate that answers before Neutral is unlocked |
| B7 | Onboarding, audio, accessibility | **done** — 23 events over 21 bench ids via `audio/js/core.js`; a node test fails if the game uses an id from the bench's `bad` bucket, or sets a parameter the sound does not have |

**`?shot=` determinism is a hard constraint on all of Track B.** The critic harness depends on it.
No game session may start under `?shot=` or in the editor.

## Track C — simulation and balance

| # | Work | Done when |
|---|---|---|
| C0 | Pure `sim` modules — XP, damage, catch tables, glut, Standing | node-testable with no renderer import |
| C1 | `tools/soak.mjs` virtual-clock harness | reproduces `SYSTEMS.md`'s balance table; **its output overwrites the table's estimates** |

Every balance number in `SYSTEMS.md` was derived in node, not asserted. Keep that standard: if you
change a coefficient, re-run the harness and update the table in the same commit.

## Track D — content

Needs B2–B4 and A8. Light Acts 1–2 first: quest packs, dialogue, NPC placement, the three MVP
enemies. The rodent rig does not exist — only `chicken.js`'s quadruped and `people.js`'s robed
figure — and is a real build item, not a reskin.

---

## Critical path and the one real risk

```
A0 ──► A1 ──► A2 ──► A3 ─► A4 ─► A5 ─► A6 ─► A7 ─► A8 ─► A9
        │      ▲
        │      └── phone fill-rate test.  IF THIS FAILS, STOP AND REPLAN.
        │
B0 ─► B1 ─► B2 ─► B3 ─► B4 ─► B5 ─► B6 ─► B7 ────────► D ─► A9
C0 ─► C1 ───────────────────────────────────────────────►
```

**The risk is fill rate, not triangles.** Measured at A0 (`docs/BASELINE.json`), `street_dusk` at
the gate profile is **300k main + 216k shadow = 516k against a 350k total budget**, with no gameplay
in the scene at all — 47 % over, not "on the line". The 350,393 figure previously quoted here was a
shadow-inclusive total read as a main-pass count; `WORLD.md §6.1` now carries the real table. Three
towns is projected to fit at ~311k with 11 % margin, but only with both per-block LOD and the
foliage cut, and A0 found two rows of that projection unsupported (`WORLD.md §6.5`). The projection
also says nothing about fill rate on bigger surfaces with near-camera alpha-test foliage.

**Get a real number off Aaron's phone at A2.** Do not author content against an unverified budget.
`forge_test/CLAUDE.md` is right that the phone is the only number that has ever been stable.

## Verifying

```bash
node tools/shot.mjs --shot=street_dusk --w=1280 --h=720 --dpr=1
node tools/shot.mjs --all
node tools/shot.mjs --shot=street_dusk --headed --perf    # real GPU
node --test                                               # sim, quests, save, audio ids
```

**Always look at the PNG with the Read tool.** Numbers in a JSON file will not tell you it looks
wrong. Headless renders here are software-rendered: the image is trustworthy, the timings are not —
trust fps and the counts.

## Progress

| Stage | Status |
|---|---|
| Design corpus (6,188 lines, five docs, critiqued and reconciled) | **done** |
| `forge_test` split, engine copied and verified rendering | **done** |
| A0 — baseline instrumentation | **done** — `tools/budget.mjs`, `docs/BASELINE.json`; `WORLD.md §6` corrected against it |
| A1 — the scale pass, K = 1.5 | **done** — kit at K, 21/21 doors pass, 4/4 loft climbs pass, `docs/BUDGET.json` |
| A2 — camera fit + ceiling collider | **done** — see `docs/NOTES_WORLD_A2-A5.md`, `docs/CAMFIT.json`, `docs/PHONE_TEST.md` |
| A3 — world extents | **done** — the old ±145 / −100..108 box, `GS` 1 → 2, collider broad phase |
| A4 — terrain rebuild | **done** — the world mesh is built from `landAt` (no channel) and the ribbon carries the trench; `surfaceY` vs `heightAt` **p90 0.9 cm, p99 15 cm, max 0.48 m** against A3's 6.57 m. Towns at §1.3's z. `js/world/field.js` is the pure, node-testable field; `tools/fieldprobe.mjs` measures it |
| A5 — river and roads | **done** — `RIVER_CP` frozen against `data/areas.json`, four crossings built and rotated, **five roads: King's Road 1110 m, Drove 946 m, three spurs**. Segmented water + arc-length bank ribbon. The five scenario cameras re-framed |
| B0–B5 — storage, clock, quest engine, dialogue, journal, save | **done** — 256 tests, two linters clean |
| B6–B7 — HUD, menus, onboarding, audio, accessibility | **done** — screens built and verified, `RUNTIME.md` reconciled, wide Truth chains render-checked |
| C0–C1 — sim modules + soak harness | **done** — balance regenerated from the harness, not asserted |
| Story revisions 1–4 | **done** — 79 story quests, 34 Truths in 11 chains |
| A6 — document schema v3 | **done** — six new types build (mill, barn, pen, cross, arcade, retaining), `blk` / `lod` / `town` added and computed, v1 → v2 → v3 migrates, 11 new schema tests. **The `districts` → `towns` rename is deferred**, see below |
| A7–A9, Track D | not started |

### Where the interruption left things — read before resuming

Two build agents were terminated mid-work by a session limit. **The tree is healthy**: all five
scenarios render, 256 tests pass, both linters are clean. But two phases are part-finished.

**A4/A5 — finished.** Read `docs/NOTES_WORLD_A2-A5.md` from "A4/A5 resumed" for the working
record; it carries every measurement and the four bugs that only a render found. In short: the
field moved to a pure `js/world/field.js`, the world mesh is built without the channel term and an
arc-length bank ribbon carries it, `RIVER_CP` is **frozen** against `data/areas.json`'s 89 areas,
the roads exist for the first time, and four of the five scenario cameras were broken by absolute
y (not by the towns moving) and are re-framed.

**Two things A5 left open.** The `street_dusk` vertical seam is still there at 7.1 % — three more
causes ruled out, all recorded. And `contactAO` is 20.1 k triangles drawn in every scenario, which
nobody has looked at; it is A7's.

**A6 deferred the rename.** `districts` → `towns` and `dist` → `town` reach into `editor.js`,
`panel.js` and `colliders.js`, which this pass did not own. v3 adds `town` as a **string id
alongside** `dist`, plus `blk` (a 60 m spatial grid, computed at load) and `lod`. A7 should read
`town` and `blk`; whoever owns the editor can retire `dist`.

**B6/B7 — closed out.** The code was done and browser-verified; the documentation has now caught up.
`docs/RUNTIME.md` §§4.1–4.3, 6.7, 7, 8, 9.1, 9.3, 9.4, 10.1–10.2 and 10.6 carry the divergences,
each labelled and reasoned rather than silently rewritten. Truth counts read 34 throughout, and
`data/truths.json` was verified field by field against `STORY.md` §8.5 — 34 entries, 11 connected
components, Light 10 · Dark 12 · Neutral 12, nothing left to apply. The two widest chains have been
render-checked at 844 × 390 and at `uiScale` 1.4: they fit and read, but the ordering inside a wide
block was wrong and is fixed in `journal.js`. **`docs/NOTES_RUNTIME_B6-B7.md` is the record.**

**Committed** at `923b775` on branch `claude/forge-game-checkpoint`, tree clean, 256 tests green. Not
on `main` — the repo auto-deploys from `main` and this is in-progress work.

## Decisions taken while managing the build

Aaron has delegated project management: *"you can make all the decisions, just give me the summary
and what decisions you went with and why."* These are settled. Reopen one only with a reason.

| Decision | Why |
|---|---|
| **Vermin:** Whitewall declares **granary rats**, Longacre **field voles**, Blackstone **shaft rats** | Closes the last open naming item. Plain names, per Aaron's dislike of fantasy-gibberish, and each fits its town's economy — a grain store, a field, a mine. The reputation loops were already distinct through *handling* (license / bury / quota); this just names the animal. |
| **Outdoor camera arm: default 7.2**, `camDist` stays a knob | Splitting the difference between the current 6.2 and `WORLD.md`'s proposed 8.0. Buildings grow 1.5× but the player does not, so the arm needs to grow — just not proportionally, or the player becomes a speck. It is already a live knob, so this is a starting point to tune on the phone, not a commitment. |
| **Blackstone terraces: build at 9 m, fall back to 6 m if the spring arm fights it** | Try the dramatic version first. The 9 m terraces are what make Blackstone legible from across the valley, which is worth a camera fix; but the camera wins if it comes to it, because an unplayable view is worse than a flat town. Resolve at A2 with the phone in hand. |
| **Player start: the Whitewall granary** | L01 opens there at 04:00 with a rat in the dark. The start location should be the first quest's location; anything else adds a walk before the game begins. |
| **All contested points accepted as the designers argued them** — 3 in `SYSTEMS.md §15`, 4 in `STORY.md §14` | I read each one. In every case the designer's reasoning beat the critic's, and each was flagged openly rather than silently ignored, which is the behaviour worth rewarding. Notably: Glamour stays trainable (deleting it makes the disguise play identically in Act 1 and Act 5), and Light Act 1 stays at six quests (six-plus-six is exactly the specified first playable). |
| **Full game, not a first slice** | Aaron's call. See Scope above. |

## Still open — genuinely undecided

Nothing is blocking. These want a human with the game running:

- **Everything about feel.** Camera arm, day length, movement speed, cast timing, difficulty. All
  are knobs. This is what the first playtest is for.
- **The balance table** survives only until `tools/soak.mjs` (C1) contradicts it, which it probably
  will. That is the harness working, not failing.

# What is left

Measured against the corpus on 2026-08-16, not estimated. Every number here came from counting
`data/quests/*.json` and grepping the runtime, and several of them correct earlier guesses.

## Where the game actually stands

99 quests, 405 steps, 389 objectives. Two of the eight primitives are live:

| primitive | objectives | distinct ids | state |
|---|---|---|---|
| `talk` | 165 | 17 | **works** |
| `goto` | 49 | 28 | **works** — `areasAt` drives it off `data/areas.json` |
| `interact` | 82 | 48 | no prop exists to interact with |
| `gather` | 44 | 21 | no nodes, no fishing, no cooking |
| `deliver` | 24 | 13 | selling works; 8 non-sell targets do not exist |
| `kill` | 12 | 8 | no combat runtime at all |
| `survive` | 7 | 4 | needs combat |
| `escort` | 6 | 3 | no escort actors |

**214 of 389 objectives already resolve.** The missing 175 are concentrated in `interact` and
`gather`, not in combat — `kill` is the *smallest* verb in the corpus. It only feels central
because `light.01` is a kill quest and therefore gates the first hour.

## What is not missing, contrary to earlier notes

- **Every enemy has a rig.** `ENEMIES` in `js/sim/tables.js` carries all 13 entries the corpus
  references, and each one's `geo` field names an existing rig: `rat`/`crab`/`boar` in
  `js/world/vermin.js`, plus `js/world/chicken.js` and `js/world/people.js`. No new creature art
  is required for any quest in the game.
- **Every referenced area is defined.** 46 areas are referenced, 90 are defined in
  `data/areas.json`, and the shapes are authored against the real town centres — `wwa.market`
  centres on (-520, -61) against Whitewall's (-520, -60). Nothing is floating.
- **The rules layer is complete and tested.** `js/sim/combat.js` and `js/sim/gather.js` already
  hold hit resolution, target acquisition, catch tables, node states and cooking, all pure and
  node-tested. What is missing is the runtime that calls them.
- **Only two cast members are absent** from `data/cast.json`: `hen` and `wagon`, both escort
  targets rather than people.

## The work

### Blocking a playable game

1. **Combat + creature runtime + spawner.** Creature hit points and AI, `cast()` → `acquire` →
   `resolveHit` → death → `{ t: 'kill' }`, enemies damaging the player, area-keyed spawning, and
   the `world.watch()` / `world.aggro()` hooks Graft has been waiting on. *In progress.*
2. **Interact runtime and the prop kit.** 48 distinct prop ids, 82 objectives — the largest single
   lever in the game. Needs placeable prop geometry keyed to area coordinates plus the context-button
   plumbing to emit `{ t: 'interact' }`.
3. **Gather runtime.** Fishing, forage, mining and cooking against the existing `js/sim/gather.js`
   node model. 44 objectives, and it feeds the 24 `deliver` objectives too.
4. **Escort actors and the 8 non-sell delivery targets.** Small once 1–3 exist.

### The towns

5. **A8.** The three towns are still procedurally generated anonymous massing —
   `js/editor/demoScene.js` emits `put('mass', …)` and `put('house', …)` with seeded jitter. The
   90 named areas have correct coordinates and generic buildings standing on them. A8 is replacing
   that massing with authored buildings that match the named areas. Well-specified, because the
   coordinates are already settled; still the largest single piece of work here.

### Known rough edges

6. **Blackstone's Levels** — 5 fights, 4 gathers and 3 deliveries across two campaigns, all
   subterranean, and there is no subterranean support in the engine at all.
7. **Balance measures a parallel universe.** `tools/soak.mjs` reads a hand-maintained `QUESTS`
   array in `js/sim/campaign.js` and never opens `data/quests/`. Every balance number produced so
   far describes that array, not the game.
8. **Quest discoverability.** The chevron is fixed but by design appears only after 90 s stuck on
   one step. There is no map, no marker and no "where do I go" affordance.
9. **The phone fill-rate test** (`docs/PHONE_TEST.md`), then the A9 gate re-verification at
   `--preset=medium --dpr=1 --w=844 --h=390`.
10. Smaller: rename the `attunement` predicate term to `grasp`; `ash: true` trigger undefined;
    `enterCampaign()`'s −20 Standing clamp is never called; five 0.19 m risers missing from the
    collider set; Neutral has no band-appropriate trash, so `power(13)` one-shots the rodent table.

## Open decisions

None of these block the work above.

- Should `tools/soak.mjs` read the packs instead of its own array?
- Should `offered()` honour `unlock`?
- The additive `courseM` diff for `js/world/zones.js` (frozen file, needs sign-off) — see
  `docs/NOTES_RENDER_FIX.md`.
- The 60 MB texture gate versus the honest `wall_day` total of 75.68 MB.
- Contractions in dialogue. Recommendation: Blackstone and Longacre contract, Whitewall does not.
- The opening-beat copy.

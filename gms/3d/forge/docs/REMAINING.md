# What is left

Measured against the corpus on 2026-08-16, not estimated. Every number here came from counting
`data/quests/*.json` and grepping the runtime, and several of them correct earlier guesses.

## Where the game actually stands

99 quests, 405 steps, 389 objectives. All eight primitives are live:

| primitive | objectives | distinct ids | state |
|---|---|---|---|
| `talk` | 165 | 17 | **works** — 18 named NPCs are fixed bodies (`data/cast_at.json`) |
| `interact` | 82 | 48 | **works** — all 48 props placed (`data/props.json`); one `self` id left (`dark.02 robe`) |
| `goto` | 49 | 28 | **works** — `areasAt` drives it off `data/areas.json` |
| `kill` | 12 | 8 | **works** — all 8 ids bodied, humanoids as cloak variants (`js/world/robed.js`) |
| `survive` | 7 | 4 | **works** — `survive reach.east 60` completed live |
| `gather` | 48 | 24 | **works** — 26 nodes (`data/gather.json`), fishing, forage, mining, cooking |
| `deliver` | 24 | 13 | **works** — selling, plus a hand-over for the 11 non-sell targets |
| `escort` | 6 | 3 | **works** — `fen`, `hen`, `wagon`, `cart` (`data/escorts.json`) |

**0 objectives in the corpus are unproducible by the runtime.**

**Count quests, not objectives.** Objective coverage is a misleading measure, because one blocked
step stops everything downstream of it in the unlock ladder. Measured with `campaign.test.mjs`'s
own `playThrough()`, varying only which events the harness is allowed to manufacture:

| harness may manufacture | story quests finished |
|---|---|
| everything — what the suite used to do | 79 / 79 |
| only kills a rig can body | 18 / 79 |
| only events the runtime can produce at all | **4 / 79** |
| …the same honest gate, now | **79 / 79** |

The floor was **4**, not 18. Two causes: `sour_crow` had no rig, and four `kill` objectives named
no area, so `planFrom` (`s.in || o.area`) planned them nowhere — the ladder died at `light.05`, the
second quest in the game. `whyNoEvent()` now gates every manufactured event and the ladder tests
assert on it, so deleting a single `in` field turns 11 tests red.

## What is not missing, contrary to earlier notes

- **Every enemy has a rig.** `ENEMIES` in `js/sim/tables.js` carries all 13 entries the corpus
  references, and each one's `geo` field names an existing rig: `rat`/`crab`/`boar` in
  `js/world/vermin.js`, plus `js/world/chicken.js` and `js/world/people.js`. No new creature art
  is required for any quest in the game.
- **Every referenced area is defined.** 46 areas are referenced, 90 are defined in
  `data/areas.json`, and the shapes are authored against the real town centres — `wwa.market`
  centres on (-520, -61) against Whitewall's (-520, -60). Nothing is floating.
- **The rules layer is complete and tested.** `js/sim/combat.js` and `js/sim/gather.js` hold hit
  resolution, target acquisition, catch tables, node states and cooking, all pure and node-tested.
  Every one of them now has a runtime calling it.
- **Only two cast members are absent** from `data/cast.json`: `hen` and `wagon`, both escort
  targets rather than people.

## The work

### Blocking a playable game

1. ~~Combat + creature runtime + spawner.~~ **Done** — `fad7cdd`, see `docs/NOTES_COMBAT.md`.
2. ~~Interact runtime and the prop kit.~~ **Done** — `87528ea` and `1ea695a`, see
   `docs/NOTES_PROPS.md`.
3. ~~Gather runtime.~~ **Done** — see `docs/NOTES_GATHER.md`. It closed the 24 `deliver`
   objectives too, and one of the two `interact self` gaps.
4. **Escort actors.** `lac.henhouse.hen` and `wagon` are the last two ids in the corpus with no
   body of any kind. *Next.*
5. **A people-rigged enemy spawn.** `raider`, `hollow` and `watchman` are `geo: 'people'` and the
   spawner cannot place one, so those kills, `survive`, and the whole Watch-detection side of
   Graft are dark. `world.watch()` is implemented and tested but returns `[]` in game for exactly
   this reason.

### The towns

6. **A8.** ~~The three towns are still procedurally generated anonymous massing.~~ **Whitewall is
   done** — `js/editor/whitewall.js`, see `docs/NOTES_A8_WHITEWALL.md`. Every `wwa.*` area a quest,
   prop, NPC or gather node reaches is an authored place at its `areas.json` coordinates, asserted
   by `js/editor/whitewall.test.js` against the real data files. **Longacre and Blackstone are
   still seeded jitter** and are the rest of A8; §6 of the notes says what they reuse. Two things
   Whitewall left open: the draw-call gate (189 against 150 — the triangle gate passes with 8 % to
   spare), and whether the named rooms staying open to the sky is the right call.

### Known rough edges

7. **Blackstone's Levels** — 5 fights, 4 gathers and 3 deliveries across two campaigns, all
   subterranean, and there is no subterranean support in the engine at all.
8. **Balance measures a parallel universe.** `tools/soak.mjs` reads a hand-maintained `QUESTS`
   array in `js/sim/campaign.js` and never opens `data/quests/`. Every balance number produced so
   far describes that array, not the game.
9. **Quest discoverability.** The chevron is fixed but by design appears only after 90 s stuck on
   one step. There is no map, no marker and no "where do I go" affordance.
10. **The phone fill-rate test** (`docs/PHONE_TEST.md`), then the A9 gate re-verification at
   `--preset=medium --dpr=1 --w=844 --h=390`.
11. Smaller: rename the `attunement` predicate term to `grasp`; `ash: true` trigger undefined;
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

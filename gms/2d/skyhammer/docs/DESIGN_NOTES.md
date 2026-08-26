# SKYHAMMER — DESIGN NOTES (checkpoint log)

## Session 1 — 2026-08-26

### What shipped
- `js/data/economy.js` (new) — `baseMoney`/`baseXp` curve + the two affordability curves
  as a comment table, used by both the hand-authored act 1 rewards and `gen_levels.mjs`.
- `js/data/planes.js` — expanded 6→9 tiers (added `meteor`, `vampire`, `specter`) so
  "next tier every 8-12 levels" holds over 100 levels; bumped `sabre`/`phantom`/`vector`
  prices to fit the new spacing.
- `js/data/weapons.js` — added 3 main-gun rows (`cannon25`, `vulcan`, `railgun`) for the
  3 new plane tiers, and 6 new "fun" specials: `party_bomb`, `chicken_bomb`, `boomerang`,
  `kraken_torp`, `disco_emp`, `orbital_strike` (tier 6, priced above the nuke — the
  Act 5 signature toy).
- `js/data/enemies.js` — added act 2-5 enemy rows (ground/flak/fighter/balloon, grouped
  by act in comments) and 5 multi-part bosses (`boss_ironduke` … `boss_orbitalmother`).
- `js/data/levels.js` — kept the 3 seeded levels (`a1-01..03`) verbatim, added `a1-04`
  through `a1-20` (17 levels) to complete act 1's 20-level teach-in-order arc, ending on
  the Iron Duke boss fight.
- `tools/gen_levels.mjs` (new) — generates levels 21-100 into `js/data/levels_gen.js`,
  deterministic from `GEN_SEED`, and validates all 100 levels (act 1 + generated) every
  run. Objectives are derived *from* what's spawned, not designed independently and
  hoped to match, which is why nothing failed on first generation.
- `js/data/story.js` (new) — cast, 5 act intros/outros, 5 boss taunts, 16 milestone beats.
- `js/data/modes.js` (new) — Survival (7 escalating tiers + overflow), Time Attack,
  Boss Rush, and a date-deterministic Weekly Special Event rotation (7 entries).

### Gate falsification (required by CONTRACTS §13 / the task brief)
Deliberately broke `a1-01`'s objective from `count:6` to `count:99` (only 6 huts/depot
exist matching `tag:'light'`... `count` is separate from the light+depot mix — the point
is 99 is unreachable against 6 actual `tag:'light'` spawns either way).

```
$ node tools/gen_levels.mjs --check
VALIDATION FAILED — 1 problem(s):
  - a1-01 (First Light): objective destroy kind=- tag=light needs 99 but only 6 spawned/waved
EXIT CODE: 1
```

Confirmed caught, then reverted the file back to `count:6` and re-ran — validation OK,
100/100 levels. The gate has now been proven to fail when it should.

### Flag for ART — biome × timeOfDay × weather combinations actually used
`ART.md` §4 ships 4 palette keys first ("add the rest per act"). Act 1 alone (before I
added anything, `a1-03` already did this) uses all 6 `biome` values and all 4
`timeOfDay` values from CONTRACTS §12's enum, plus all 3 weather values. Concretely, by
level 20 the game needs at least these combinations rendered (not just the 4 shipped):
`farmland/dawn`, `farmland/day`, `farmland/dusk`, `farmland/overcast(day)`,
`coast/day`, `city/day`, `city/dusk`, `city/night`, `sea/dusk`, `sea/day+storm`,
`sea/night+storm`, `sea/dawn`, `desert/day`, `alpine/day+overcast`. `tools/gen_levels.mjs`
then cycles through the full 6×4×3 cross product for levels 21-100 (deterministically,
so it's reproducible which exact combos appear — re-run the generator to see them).
This isn't a request to reduce variety; it's a heads-up on how much palette surface
Act 1 alone already assumes exists.

### Three design decisions I'm least sure about
1. **The `parts` schema for bosses** (`{id, dx, dy, hp, w, h, tag, shape, weak?, shoots?}`
   in `enemies.js`) is my best extrapolation from CONTRACTS §5's one line ("multi-part
   bosses, `parts` array") — there's no literal shape given anywhere. If SIM has already
   assumed a different shape, this needs reconciling before boss levels can run.
2. **New weapon fields beyond the established pattern** — `moneyMult` (party_bomb),
   `fuseDelay` (chicken_bomb), `returns` (boomerang), `stunR`/`stunTime` (disco_emp) are
   new, whereas `burn`/`pierce`/`homing`/`submunitions` already existed and presumably
   have SIM support. These four are aspirational content — the numbers and pricing are
   real, but SIM needs to either implement the behavior or these ship as reskinned bombs
   until it does. Flagging rather than guessing at `sim/weapons.js` internals I don't own.
3. **Objective matching semantics** (`objectives[].kind` vs `.tag`, and a bare `collect`
   defaulting to counting balloon-kind spawns) is inferred from the 3 pre-existing
   levels, not written anywhere in CONTRACTS §12. I extended that inferred rule into 97
   more levels and the validator. If SIM's actual `mission.js` matches objectives some
   other way (e.g. by enemy id directly, or requires both `kind` AND `tag` together as
   the one CONTRACTS example shows), every generated level's objectives need re-checking
   against the real rule, not just my validator's guess at it.

### Verification run (this session)
```
node -e "import('./js/data/levels.js').then(m=>console.log(m.LEVELS.length))"        # 20
node -e "import('./js/data/levels_gen.js').then(m=>console.log(m.LEVELS_GEN.length))" # 80
node tools/gen_levels.mjs                                                             # 100/100 OK
```
All of `tuning.js`, `planes.js`, `weapons.js`, `enemies.js`, `levels.js`, `economy.js`,
`story.js`, `modes.js`, `levels_gen.js` import cleanly under plain node (checked in one
pass, see session transcript).

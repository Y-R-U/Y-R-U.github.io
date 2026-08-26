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

---

# TUTORIAL LEVELS + LANDING — 2026-08-27

`t-01 Flight School` and `t-02 Deck Landing` (`js/data/levels.js`, act 0) and the hint layer
`js/ui/tutorial.js`. Both levels are also the harness for the mechanics nobody had verified by
hand. What follows is what the harness found, not what the design intended.

## 1. Landing works. The reference autopilot cannot do it, and that is a bug in the autopilot.

Measured against `sim/landing.js` with a scripted level-flight pilot, `kestrel`, pad at
`deckY = 120` (`{ kind:'pad', padId:'carrier', y:120 }`).

**The approach box that actually triggers the auto-land** (`Math.abs(p.x - e.x) <= e.w + p.w`,
`Math.abs(p.y - e.y) <= e.h + p.h`):

| constraint | value | in frame terms |
|---|---|---|
| horizontal | `deckX ± 230` world units | 460 wide = 199 CSS px on an 844x390 phone |
| vertical | `y ∈ [deckY - 15, deckY + 175]` | 190 tall = 82 CSS px, 21% of the 900-unit frame |
| nose angle | `abs(ang) < 0.25 rad` (14.3 deg) | |
| speed | `< def.landSpeed` — 247 for kestrel | |
| direction | `vx > 0` — you must cross the deck left to right | |

Altitude sweep, level flight from 4000 units out, 20-unit steps: **lands at y = 120…280
inclusive, fails at 100 and at 300.** Nothing subtle at the edges — it is a hard box.

**Speed manages itself, but only if you arrive early.** `plane.js` drops the cruise target to
`landSpeed * 0.8` inside the pad's "near" zone (`±680` in x, `±320` in y), which is what makes
the mechanic reachable at all. Start-distance sweep: lands from 3000 / 1500 / 900 / 700 / 500 /
400 units out; **fails from 300 and closer** — the plane cannot shed 430 -> 247 in that space.
Entry-speed sweep at 700 out: lands from 210 / 250 / 300 / 430 / 600; **fails at 760** (vmax).

**Diving on final is what actually kills the landing.** `gravAssist` adds ~36 units/s of speed at
a 0.14 rad nose-down attitude — faster than the near-pad throttle bleeds it off. A plane that
descends all the way in crosses the box still above `landSpeed` and never triggers. Descend
early, arrive level.

### The autopilot bug (js/sim/autopilot.js — SIM's file, not fixed here)

On an empty sea level with nothing but a pad, the reference bot **never lands, on any seed**.
Closest approach 44 units. Two causes, both proven by patching a copy:

1. The terrain floor guard `if (p.y < gAhead + 340) a = max(a, 0.6)` sits at **y = 340 over
   water, above the top of the approach box (280)**. The bot is physically prevented from
   descending into the box. It is not a tuning issue; it is a hard clamp.
2. Its final approach uses a `±0.14 rad` descent held all the way to the deck, so even with the
   floor lifted it arrives at 272 against a 247 limit and misses by 42 units of x.

Both fix in eight lines, verified: `t-02` then wins 3/3 seeds, `a1-03` 1/3, `a1-15` 2/3 (the
remaining losses there are the bot being shot down, a separate problem).

```js
// in the landNow branch — descend early, arrive level
const ty = pad.deckY + 80;
const run = pad.x - 1000 - p.x;
if (run > 0) a = Math.max(-0.5, Math.min(0.5, Math.atan2((ty - p.y) * 1.2, Math.max(run, 400))));
else a = Math.max(-0.05, Math.min(0.05, (ty - p.y) * 0.0012));

// and at the floor guard — key off the DECK during the approach, not the terrain
const lowLimit  = (phase === 'land' && pad) ? pad.deckY + 24 : floor;
const hardLimit = (phase === 'land' && pad) ? pad.deckY + 8  : gAhead + 190;
if (p.y < lowLimit)  a = Math.max(a, 0.6);
if (p.y < hardLimit) a = 1.0;
```

Until that lands, `tools/sim.mjs --level t-02` reports "no seed of this level was completable" —
that is the autopilot, not the level. `a1-03` and `a1-15` have been failing the same gate since
they were written.

### TAKE OFF works

Verified in a real browser at 844x390: touchdown at `deckY + 12`, fuel back to 600, hp back to
100, ammo back to 6/12, TAKE OFF button drawn and armed, launch script climbs ~104 units over
~330 units of x and does not immediately re-trigger the landing. Screenshot:
`shots/tut/land_844x390_t17.png`.

### Two things the player cannot see (ART / gfx — not owned here)

1. **There is no translucent green landing box.** CONTRACTS §9 says a pad draws as one. In the
   3D renderer `gfx/models/ground.js` sets `SHAPES.pad = SHAPES.carrier`, so the player gets a
   carrier hull and *no* indication of the approach window at all — no altitude cue, no x
   window, nothing. Only `gfx/debug.js` draws the green box. This is the single biggest reason
   landing will feel unfair on a phone: the box is real, tight and invisible.
2. **The carrier floats.** A pad spawned at `y:120` draws its hull at `deckY`, roughly 120 units
   above the waterline (`shots/tut/t02_844x390_t15.png`). `y:'ground'` would sit it on the water
   but would put the approach box at `[-15, 175]`, half of which is below the crash line
   (`p.y - 12 <= terrain`), so the data cannot fix this — gfx has to anchor the hull to the
   water and hang the deck at `deckY`.
3. Minor: the player's aeroplane disappears inside the carrier mesh while landed, and the
   altitude ribbon shows STALL at rest on the deck.

### Late planes cannot land at all

Ideal approach, every tier: kestrel / harrow / tempest / meteor / sabre land. **vampire,
revenant, specter and vector never get below `landSpeed`** (min speed reached 330 / 360 / 390 /
425 against limits of 377 / 401 / 424 / 448). The near-pad zone is a fixed 680 units, and a
740-900 cruise cannot bleed off inside it. Any `land` objective in acts 3-5 is unwinnable in a
tier-6+ aircraft. Fix is a dial: scale the near-pad zone with `def.cruise`, or raise
`landSpeed`.

## 2. The two tutorial levels

**`t-01 Flight School`** — farmland, day, clear, `terrainProfile:'flat'`, 11000 long, par 100.
Nothing shoots back. Teaches, in order: relative point-at-finger steering; climbing into the top
band so the camera follows; the auto-firing main gun against 5 huts (3 needed); one balloon
(2 spawned). Autopilot wins 4/4 seeds in ~19 s; a human should take 45-60 s.

**`t-02 Deck Landing`** — sea, day, clear, 11000 long, par 110. Two surfaced U-boats (1 needed)
to teach the thumb-button bomb, the carrier at x 7000, two balloons past the bow (1 needed).
**The carrier is deliberately mid-level with the last objective beyond it**: landing is a
mission-completing objective, so if it were last the level would end at touchdown and nobody
would ever see the TAKE OFF button. Verified end to end in a real browser: bomb -> land ->
refuel/rearm -> TAKE OFF -> collect -> win, 26.4 s.

Both are `act: 0` so the level-select tiles (numbered from the id suffix) stop colliding with
`a1-01`/`a1-02`, and both carry `stars: false`. **Deliberate call: tutorials are not graded.**
Timing a teaching level against par punishes exactly the experimenting you want a new player
doing. `stars:false` is a data flag only — the UI still has to honour it (see below).

## 3. `js/ui/tutorial.js`

```js
export function makeTutorial(world)   // null unless level.tutorial / a known t-* id
// returned object:
//   step(world, dt)                  // once per sim frame
//   draw(g, world, { w, h })         // once per rendered frame, AFTER drawHud, same overlay
//   done                             // boolean
//   stepId, why                      // harness only: current hint id, and 'done' | 'timeout'
```

`why` exists because a gate that only asserts "the tutorial finished" cannot tell a trigger that
fired from one that timed out, and a trigger that can never fire looks identical to one that
always fires.

Every hint advances on the player doing the thing — heading swept past 1.1 rad with the stick
down, the camera actually climbing off `CAM.baseY`, an objective counter moving, special-weapon
ammo decrementing, the plane inside the §9 box, `p.landed`, `landed -> not landed`. Timeouts
(26-60 s) exist only so nobody can be stuck. Verified: **all 11 hints across both levels advance
with `why === 'done'`, none by timeout.**

Placement: a single centred plate under the minimap, top edge at `y = 61`. That is the one band
on a 390-high landscape phone clear of the minimap (10-45), the health/fuel bars (x < 166), the
objectives chip, the weapon strip, the slot buttons (y >= 300) and TAKE OFF (y >= 324). The
numbers are recomputed from hud.js's own layout formulas rather than imported — if `hud.js`
moves them, `drawHint()`'s comment is the thing to check.

## 4. Acts 2-5 are now in the game — and 48 of the 80 are fragile

`js/data/levels.js` now imports `levels_gen.js`. **Two exports, deliberately:**

- `LEVELS` — the 22 hand-authored levels only (2 tutorials + act 1). `tools/gen_levels.mjs` and
  `tools/sim.mjs` both import this and append `LEVELS_GEN` themselves; folding the generated
  acts into `LEVELS` would make the generator's validator see 80 duplicate ids and go red.
- `CAMPAIGN` — `[...LEVELS, ...LEVELS_GEN]`, 102 levels, acts 0-5. **This is the list the game
  must play.** `js/main.js` and `js/ui/ui.js` still read `LEVELS`; until they are pointed at
  `CAMPAIGN`, acts 2-5 remain invisible and Boss Rush still has only one boss.

Structural state, checked independently of `gen_levels.mjs` (unknown enemy ids, objective counts
against own spawns, `land` objectives against pad spawns, length/par/reward/intro):

```
act 0: 2/2   act 1: 20/20   act 2: 20/20   act 3: 20/20   act 4: 20/20   act 5: 20/20
```

All five act bosses resolve: `boss_ironduke` a1-20, `boss_leviathan` a2-20, `boss_blacksigma`
a3-20, `boss_behemoth` a4-20, `boss_orbitalmother` a5-20.

**But structurally valid is not winnable.** `tools/sim.mjs --all --seeds 2` reports a runtime
unreachable-objective failure on **48 of the 80 generated levels** (act 2: 11, act 3: 7, act 4:
15, act 5: 15). Cause: `gen_levels.mjs` derives objectives from spawns with **zero slack**, and
`sim/behaviour.js` permanently despawns any fighter that falls 1600 units behind the camera. Fly
past one and the objective can never complete.

```
objectives with ZERO spare targets   act 1 16/20   act 2 39/62   act 3 39/62   act 4 39/62   act 5 39/62
fighter objectives with zero spare   act 1  8/9    act 2 19/19   act 3 19/19   act 4 19/19   act 5 19/19
```

Every fighter objective in acts 2-5 — 76 of 76 — spawns exactly as many fighters as it demands.
This is a generator fix (spawn ~1.5x the objective count, or re-spawn a despawned fighter ahead
of the player), not a per-level one, and `levels_gen.js` must not be hand-edited.

Also: the autopilot never won 74 of the 102 levels at 2 seeds. That number is a weak pilot as
much as a difficulty reading (D29) and should not be read as "74 broken levels" — the 48
unreachable-objective lines above are the ones that are actually broken.

## 5. Falsified, this session

Every gate quoted above was broken on purpose first and confirmed to go red:

| gate | how it was broken | result |
|---|---|---|
| `tools/gen_levels.mjs --check` | `t-01` collect count 3 against 2 balloons | `needs 3 but only 2 spawned/waved`, exit 1 |
| `tools/sim.mjs` terrain band | declared `terrainProfile:'alpine'` on the water level `t-02` | `wants 20-32%, generator produced 11.3%`, FAIL |
| tutorial hint harness | `t-01` climb trigger replaced with `() => false` | `steps=[steer:done, climb:timeout]`, `tutorialDone=false`, exit 1 |
| independent campaign checker | injected enemy id `ghost_tank` into `a3-07` | `act 3: 19/20`, exit 1 |
| `makeTutorial` null path | asserted `makeTutorial(a1-01) === null` | passes; costs nothing on non-tutorial levels |

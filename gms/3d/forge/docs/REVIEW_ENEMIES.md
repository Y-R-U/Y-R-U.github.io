# Review — humanoid enemies, the Watch, and escort

Adversarial review of the uncommitted wave on top of `b31413f`: `js/world/foeshape.js`,
`js/world/figure.js`, `js/world/robed.js`, `js/game/escort.js`, `js/world/escorts.js`,
`data/escorts.json`, three new test files and `js/game/fakedom.js`; edits to `js/game/spawner.js`,
`js/world/people.js`, `js/world/roster.js`, `js/world/chicken.js`, `js/world/cast.js`,
`js/game/session.js`, `js/game/placement.js`, `js/main.js`, `data/cast.json` — against
`docs/NOTES_ENEMIES.md`.

Everything below was run. Node harnesses, raw-CDP drivers and a mutation copy of the tree live in
the session scratchpad; renders are in `shots/review_enemies/` (gitignored, like every other
render here). Every number quoted is one I measured.

---

## Verdict

**Safe to commit as-is.** No blocker. The wave does what it says: the Watch detection loop really
runs, the spawner really places all six `geo: 'people'` rows, escort really completes through the
real reducer, and — the claim I most expected to fall over — **`people.js` is genuinely
untouched in effect**: the crowd's geometry hashes are identical attribute-for-attribute and
`wall_day` and `gate_night` are **pixel-identical** to the pre-wave tree.

Five should-fix items follow, none of which stops a commit. The one blocker-class fact about the
*game* (`sour_crow`) is pre-existing, honestly disclosed, and **larger than the notes say** — §3.

I disagree with one of your four observations and can correct a second.

---

## Demonstrated defects, worst first

### 1 — SHOULD-FIX: a Break re-arms you into the field that just broke you, and it loops

`js/game/session.js:1120` `onBreak()` · `js/sim/faction.js:116` `breakGraft()`

§8.3's comeback hands back the *opposite* face for twenty seconds. In a Watch-dense area that face
is detected by the same Watchmen, so it Breaks again before it expires — and the Break hands back
the first face, and so on. The player does not have to do anything.

Measured, real `Session`, real `Spawner`, `neutral.21`'s eight Watchmen moved to 2 m
(`scratchpad/f/watch.mjs`, section A):

```
watchers within radius: {"n":8,"hold":0,"weight":1,"seen":true}
face changes in 70 s of standing still: 4
  t=14.5s  worn light->dark  free=true  standing L15  D40  N0  cd=120
  t=29.0s  worn dark->light  free=true  standing L15  D15  N0  cd=120
  t=43.5s  worn light->dark  free=true  standing L-10 D15  N0  cd=120
  t=58.0s  worn dark->light  free=true  standing L-10 D-10 N0  cd=120
aggro calls: 4  (30, 30, 30, 30)
```

−50 Standing across both factions every 29 s, with `world.aggro(30)` fired each time, until both
hit the −100 floor (~4 minutes) or the player taps unveil. `endGraft` scores 0 XP each time
because `free` is set, so the loop is pure loss.

Neither file is touched by this wave — but nothing could place a Watchman before it, so this is the
first build in which the loop is reachable. The smallest fix is to make the free Graft not start
while `watch().n > 0`, or to give the free Graft its own suspicion immunity for its 20 s.

### 2 — SHOULD-FIX: the enemies now stand in the middle of the crowd rig's own dev scenarios

`js/world/robed.js:125`, `:355-357`

`Robed.devScenarios()` runs from the **constructor** under `?dev=1` and pushes six agents at a
hard-coded `site = { x: 0, z: 44 }`. Those bodies exist in every `?dev=1` scenario, not only the
`foe_*` ones. `js/world/people.js:503-527` stands its own dev pair at `z = 42` and `z = 38` and
frames them from `z = 44.6` (`people_macro`) and `z = 48.5` (`people_day` / `people_dusk`) — so the
robed row lands **between the camera and the crowd**.

Same command, same scenario, pre-wave tree vs now (`--set=dev=1 --preset=medium --dpr=1 --w=844
--h=390`), pixel diff:

| scenario | pixels changed |
|---|---|
| `people_day` | **96,852 / 329,160 — 29.4 %** |
| `people_dusk` | **96,378 — 29.3 %** |
| `people_macro` | **23,432 — 7.1 %** |
| `vermin_play` | 5,837 — 1.8 % |
| `fowl_yard` | 31 — 0.009 % (noise) |

`shots/review_enemies/people_macro_BEFORE.png` vs `people_macro_AFTER.png`: the crowd's macro art
shot is now champion_2 with a pitchfork filling the centre of frame. `people_day_AFTER.png` is six
enemies and two barely-visible townspeople.

`js/world/robed.js:353`'s comment — *"Only with `?dev=1`: `--all` must keep rendering exactly the
five scenarios the critic scores"* — is true of the gate (verified, §"what I verified"), and states
exactly the guarantee it keeps while hiding the one it breaks. Every other rig registers cameras
under `?dev=1` and adds no bodies; `vermin.js` re-poses agents it already owns, `chicken.js` and
`scatter.js` only define cameras.

Fix: build the row inside each `foe_*` scenario's `setup`, or move `site` off `people.js`'s.

### 3 — SHOULD-FIX: a factually wrong comment, and the arrival rule it justifies is trivially met

`js/game/escort.js:13-15`, repeated verbatim in `docs/NOTES_ENEMIES.md` §5 and §4:

> *Three of the four authored destinations already contain the actor's start — `reach.neutral` is
> the whole Longacre bank and Fen stands on it*

**One of the four does.** Resolved through the real `placement.anchor()` against the real
`areas.json` (`scratchpad/f/escortgeo.mjs`):

| actor | home | destination | home inside it? | home → nearest edge |
|---|---|---|---|---|
| `wagon` | `road.spur.light` | `road.drove` | **no** | 55.9 m |
| `hen` | `lac.cotts` | `lac.henhouse` | **no** | 56.5 m |
| `cart` | `heath` | `heath.ford` | **no** | 26.0 m |
| `fen` | `lac.millbridge` | `reach.neutral` | **yes** | 0 m |

The project's own test already knows this: `escort.test.js:46-55` asserts every *placed* actor
starts outside its destination and skips only Fen, with the comment *"Fen starts inside
`reach.neutral`"* — singular. Three of the four arrive the instant they enter their destination;
`ESCORT.travel` only ever bites on Fen.

**And on Fen it is trivially satisfied.** Live, `sandbox.18`, real session, real `escortTick`
(`scratchpad/f/live7.mjs`):

```
after pickup  {"npc":"fen","path":"reach.neutral","phase":"follow","from":{"x":-28.6,"z":110}}
 t=0.0  fen (-28.53, 109.35)
 t=1.5  fen (-27.43,  98.83)          ← 11.2 m south, still on the same bank
 t=2.0  quest sandbox.18 -> cooling, c.cross [1]
```

The "crossing" credited after Fen trotted **11.6 m in whatever direction the player happened to
stand**, inside a 300 × 152 m rectangle he was already in the middle of, in under two seconds.
`ESCORT.travel` is displacement from the pickup point, not path length or progress toward anything
(`scratchpad/f/edge.mjs` section C: walking the actor 40 m out and back never arrives; 12 m in any
direction does). `light.17`, `dark.15` and `sandbox.18` all use this destination.

The rule is right in shape; `reach.neutral` is the wrong destination for a crossing. A sub-area on
the far bank would make all four escorts mean the same thing and let `ESCORT.travel` go away.

### 4 — SHOULD-FIX: `js/world/escorts.js` and the moving half of `js/world/robed.js` have no test, and `split.test.js` does not reach them

`js/world/split.test.js:50-62` only looks for one shape — a `{ …range: …, x: …, z: … }` context
target — in a `three`-side `js/world` module. Both new `three`-side files carry real rules that are
not that shape, so the guard rail added last wave does not cover them.

Every one of these mutations breaks the feature outright and leaves **all 480 tests green**
(mutation copy of the tree, `scratchpad/f/mutate.sh`):

| mutation | result |
|---|---|
| `escorts.js:16` `SPEED` all → 0 — nothing ever follows you | **green** |
| `escorts.js:16` `SPEED.fowl` 3.6 → 0.05 — the hen crawls | **green** |
| `escorts.js:121` `move()` drops the position write — the actor never moves | **green** |
| `escorts.js:112` `show()` never creates the bird — no hen exists | **green** |
| `escorts.js:144` `park()` does nothing | **green** |
| `robed.js:338` `drawLamps` sets `visible = false` — the Watch has no light | **green** |
| `robed.js:230` frozen branch clears the lamps again — **the exact bug this wave fixed** | **green** |
| `robed.js:311` `walk()` never moves a body | **green** |
| `robed.js:185` `add()` drops `state: STATE.idle` — the pinned-from-birth fix | **green** |

The frozen-branch one is the sharpest: the wave found that bug by pausing to take a photograph, fixed
it, and left nothing that would notice it coming back.

`escort.test.js:21` also keeps its **own copy** of the speeds — `{ hen: 3.6, wagon: 3.8, cart: 3.8,
fen: 4.7 }`, keyed by npc rather than by body kind — so the numbers in `escorts.js` can drift from
the numbers the tests exercise with the suite green. That is the same second-copy shape
`REVIEW_COMBAT` §"test quality" flagged.

The cheap fix matching the wave's own architecture: `SPEED` belongs beside `ESCORT` in
`js/game/escort.js` (node side), and `escort.test.js` should import it rather than restate it.

### 5 — SHOULD-FIX: a finished repeatable escort deletes or teleports the actor in front of the player

`js/game/session.js:836-843` → `js/world/escorts.js:107-115`, `:144`

`escortActors()` only lists quests in `active`/`turnin`. A repeatable board job goes straight to
`cooling` on completion, so on the very next `escortTick` the actor is hidden and parked — while the
player is necessarily within 30 m, because otherwise the escort would have been lost.

Measured (`scratchpad/f/live5.mjs`, `live7.mjs`):

```
sandbox.12  hen  … (-84.4, 14.0) inside lac.henhouse   → 0.6 s later (-75.0, -40.5) home, body deleted
sandbox.18  fen  … (-27.4, 98.8)                       → snapped back to (-28.6, 110.0)
```

The hen pops out of existence at the hen house door; Fen teleports 11 m back to Millbridge. The
story escorts (`light.11`/`15`/`17`, `dark.13`/`15`, `neutral.11`) are unaffected — they stay
`active` through a turn-in step, which is the case §5 of the notes reasoned about. Only the three
sandbox repeatables hit it.

### 6 — MINOR: `penned()` is a new exported rule with no test at all

`js/world/roster.js:41-46`. It is exported, used only by `js/world/chicken.js:622`, and
`js/world/roster.test.js` (12 tests) never mentions it. Replacing the call with a bare
`this.agents.slice(0, this.flockN ?? 24)` — the exact regression `roster.js`'s own file-top comment
was written about — leaves 480 green. The §10 revert table has no row for it.

### 7 — MINOR: the waterline fix has no test either

`js/main.js:71`. Deleting `|| groundAt(x, z, 0) < waterY(x) + 0.3` leaves 480 green. This is a fix
made in response to a render bug (a Watchman standing in the creek) with nothing pinning it. Its
sibling, the collider half of the same expression, is equally unpinned — so this is a pre-existing
shape rather than a new one, but the wave is what made it matter.

### 8 — MINOR: a spawned Watchman raises no suspicion at the distance the game actually puts it

`SUSPICION.radius` is 6 m; `pointIn()` scatters eight Watchmen over `lac.millbridge`, a circle of
radius 12. Live, player standing where the game leaves them on the bridge
(`scratchpad/f/live4.mjs`):

```
distances to the nine bodies: 16.0 17.1 17.3 17.9 28.1 28.4 29.9 34.4 37.0
session.watch():  {"n":0,"hold":0,"weight":1,"seen":true}
graft blocked():  "seen"
suspicion after 20 s wearing a Whitewall face, standing still:  0, 0, 0, 0, 0
```

Eight hostile Watchmen in plain sight, the Graft correctly refused, and **zero** suspicion accrual —
`n = 0` and `hold = 0` means `suspicionRate` takes the full `decay` branch. Getting inside 6 m means
getting inside `AI.reach × 1.7`, i.e. standing in melee. The two live sources of suspicion in the
shipped game are therefore Kesta and Alder, not the spawned Watch. §5 below.

Related and measurable: the `twoOrMore` multiplier **saturates at two**. 2, 3 and 8 Watchmen all
Break at t = 14.5 s; one alone takes 26.1 s; Kesta alone 13.1 s; Alder alone 43.5 s.

### 9 — MINOR: reloading clears the 120 s post-Break cooldown

`js/game/session.js:102` builds a fresh `newGraft()` (`cd: 0`) every load, and `snapshot()`
(`session.js:268-275`) never writes the graft. `save.js:108` also clears `doc.worn`. So the Standing
loss from a Break is saved and the punishment timer is not: Break → reload → Graft again
immediately. Deliberate per the comment ("a Graft never crosses a load") and pre-existing, but a
Break was unreachable until this wave, so it is worth a decision.

### 10 — MINOR: three comments that are not quite true

- **`js/world/robed.js:87-89`** — *"props.js's numbers for a lit lantern … the same recipe one size
  up."* `props.js:229` is `CORE_R 0.13, HALO_R [0.17, 0.23, 0.29, 0.35, 0.41], HALO_GAIN 0.06`;
  `robed.js:90` is `0.115, [0.17, 0.23, 0.30, 0.38, 0.47], 0.055`. The core is 12 % **smaller** and
  the gain 8 % **lower**; only the outer three shells grew. It is the same recipe with a *wider,
  softer* halo, which is a different and better-sounding claim than the one made.
- **`js/world/robed.js:92`** — *"relative to the dev site."* It is relative to a literal
  `{ x: 0, z: 44 }`. `vermin.js:1030` computes a dev site; `robed.js` cannot see it, and the reader
  who assumes it can will not go looking for defect 2.
- **`js/game/session.js:830`** — `// ── escort, the eighth verb ─────` is a section banner, which
  `CLAUDE.md` bans outright. `session.js` already has seven of them, so it is consistent with the
  file rather than novel — the same call `REVIEW_COMBAT` made.

### 11 — MINOR: `Robed.cost()` overcounts by two draws when `watchLamp` is 0

`js/world/robed.js:350` reads `this.lampCore.count`, but `drawLamps` (`:338`) turns the lamp off
with `visible = false` and leaves `count` where it was. With the knob at 0 the readout claims two
draws that are not issued.

---

## Suspicions I could not demonstrate

- **An escorted actor walks through walls.** Code-certain: `Escorts.move()` writes
  `b.agent.x = x` / `b.group.position.set(...)` with no collision test, and `chicken.js:723`'s
  `walkStep` branch is skipped entirely for `a.pin`. I could not trigger it, because **all four
  authored routes are over open ground**: ray-probing 360° around the hen at `lac.cotts` and around
  Fen at `lac.millbridge` found **no collider within 40 m** in any direction, and 300 samples along
  the hen's full 63 m walk to `lac.henhouse` plus 300 more with the player routed toward
  `lac.cross` never once put the bird inside a collider. Real, unreachable today, exactly as §9 of
  the notes says.
- **Two live quests escorting the same npc to different destinations would soft-lock.**
  `session.js:840` reuses `this.escorts[npc]` (which carries the *first* `path`) while `inPath` is
  computed from the *new* `l.path`, so the escort would reach `phase: 'done'` — terminal — while
  emitting an event the reducer refuses. Not reachable: every escort of a given npc in the corpus
  targets the same area, and the three hen quests are mutually exclusive by prereq. Worth one line
  in `escortWants`.
- **`show(false)` before `park()` makes `park()` a no-op for the fowl body.**
  `session.js:838` calls them in that order; by the time `park` runs, `b.agent` is null and
  `move()` falls through to `if (!b.group) return false`. Harmless today because the next `show(true)`
  rebuilds the bird at `b.home`, but it is a latent ordering bug.
- **Mobile.** Everything here is desktop Chrome over CDP at 844 × 390. Nothing in the wave touches
  input, so I did not chase it.

---

## §3 — `sour_crow`: the claim is right, and it is bigger than stated

The notes say it *"blocks `light.18` in a straight playthrough"*. Verified, and the blast radius is
the whole game.

`ENEMIES.sour_crow.geo` is `'chicken'`; `main.js:66` hands `rigFor` only `{ rat, crab, boar, people }`,
so `rigFor.add()` answers `null` and `Spawner.place()` returns null forever. `sour_crow` is the
**only** unrigged row and it appears in exactly one mandatory step:
`light.18/crows — kill sour_crow ×4 in reach.east`.

I re-ran `tools/campaign.test.mjs`'s own `playThrough()` with **one** change — a `kill` event is
only manufactured for an enemy a rig can body (`scratchpad/f/ladder.mjs`):

```
=== kill events for unrigged enemies MANUFACTURED (as tools/campaign.test.mjs does) ===
finished 79/99   campaigns completed: ["light","dark","neutral"]

=== kill events for unrigged enemies WITHHELD (honest) ===
finished 18/99   campaigns completed: []
stuck: light.18 stuck on step 2 (crows)
  never finished — light (10):   light.18…light.24, light.26, light.27, light.28
  never finished — dark (25):    the entire campaign
  never finished — neutral (26): the entire campaign
```

**61 of the 79 story quests** and **two of the three campaigns**. `light.24` is the Light finale,
`dark.01`'s prereq is `["quest","light.24","done"]` and `neutral.01`'s is
`["quest","dark.22","done"]`, so the unlock ladder terminates at Light Act 4. `sandbox.15` goes with
it.

**None of this is a regression from this wave** — it is the same gap `REVIEW_COMBAT` listed as an
undemonstrated suspicion, and the wave disclosed it plainly. What is worth recording is *why the
suite cannot see it*: `tools/campaign.test.mjs:21` manufactures `{t:'kill', kind: o.kind}` for every
kill objective regardless of whether anything in the world can produce one. The ladder test's whole
promise — *"if a quest cannot be reached by a player who only does what the quests say, this
fails"* — is not true of enemies. The one-line guard is to assert every `kill` objective's `kind`
resolves to a `geo` that `main.js` hands `rigFor`.

Rig the crow (or retarget the step at `rat_knot`, which already has a body) and the game is
completable. It is the single highest-value line in the project right now.

---

## What I verified as correct

| | |
|---|---|
| `node --test` | **480 pass, 0 fail** |
| `node tools/lintQuests.mjs` | 99 quests · 405 steps · 175 nodes · **0 errors, 1 warning** (the pre-existing `light.06` one) |
| `node tools/lintText.mjs` | 175 nodes · 705 lines · **0 warnings, 0 errors** |
| **`js/world/people.js` is untouched in effect** | I hashed every attribute of all six crowd meshes in the live page in both trees. `position`, `normal`, `color`, `aCloth`, `aEye`, `aInst`, plus material name, material colour and seat count: **identical on all six meshes**, `uniforms` identical. `hemAmp(y, top)`, the `−0.20 · F.shoulder/SHOULDER` hub, `RIM * grow`, the `grow`-scaled eye triangles, `cavityTone`'s new default and `robeMaterial`'s options bag all collapse to the old numbers at `F = FIGURE`. No number changed |
| **and the gate is pixel-identical** | Same command in both trees, `--all --preset=medium --dpr=1 --w=844 --h=390`: `wall_day` **0 pixels differ**, `gate_night` **0 pixels differ**, `street_dusk` 25 px, `town_night` 3 px, `creek_day` 7.2 % — and `creek_day` diffs **6.7 %** against *itself* in the same tree (water phase), so all three are render nondeterminism, not the wave. Main-pass counts identical: 79/154k, 64/110k, 48/102k, 79/120k, 82/96k |
| `js/world/zones.js` | **unmodified** — `git status --porcelain` clean on that path. And the §8 `dark.watch` diff is **not needed**: the derivation `robe → lerp 0.62 toward stone.base` reads correctly on the bridge in both day and night renders and the Watch is instantly distinguishable from Fen standing beside it (`watch_bridge_day.png`). Adding an authored key buys nothing and costs a frozen-file exception |
| **`world.watch()` is real** | Live, `?quest=neutral.21`, real slate click: `{"by":{"watchman":8,"champion_3":1},"total":9,"agents":9,"active":9,"cost":{"tris":2036,"drawn":5}}` and `world.watch()` returns **10** entries — 8 `watch`, plus `kesta` and `alder`. Exactly the builder's numbers |
| **The frozen-branch fix holds** | Live, `game.pause('menu')`, 60 frames: `{"frozen":true,"core":8,"vis":true,"ao":9,"m":[["champion_3",1],["watchman",8]]}` — unchanged before, during and after. Photographed: `watch_bridge_paused.png`. Reintroducing the bug in a mutation copy leaves 480 green, so the fix is right and unguarded (defect 4) |
| **The lamp fix holds** | `watch_bridge_day.png`: at 8–18 m in 10:30 daylight the lamps are the most legible thing on the bridge. `lampAt` reverting to `+0.60` goes red |
| **A corpse lives exactly as long as it should** | Live trace at 10 Hz: `dying` with `at` running 0 → 1 over 1.3 s, held in `robed.active` and drawn for the full 4.3 s (`ACT_T.die` 1.30 + `AI.corpse` 3.00), then `dead` and removed from both `live` and the rig on the same frame. *(An earlier run of mine showed the corpse vanishing at 0.6 s. That was my harness placing the player at a NaN position — `centreOf` on a circle shape — which makes `cull()`'s `hypot(…) < DESPAWN_RADIUS` false for everything. Not a defect; reported here because it was nearly one.)* |
| **A dead Watchman stops watching, immediately** | live: lamps 8 → 7 and `world.watch()` 10 → 9 on the frame the kill lands, because `Spawner.watch` filters `isLive` and `dying` is not live. `champion_3` is correctly not a watcher |
| **The `radius`/`holdRadius`/`losRadius` boundaries are clean** | `d = 5.99/6.00` → `n=1`; `6.01…10.00` → `hold=1`; `10.01…22.00` → seen only; `22.01` → not seen. Leaving and returning behaves: 38.3 susp at 2 m, frozen at 8 m, decaying at 15 m, zeroed at 40 m, and it picks up again at 2 m |
| **Save/reload does not strand you in a borrowed face** | `save.js:108` `d.worn = null` and `session.js:124` both clear it; the graft is rebuilt blank. Reload mid-suspicion drops the disguise cleanly (the cooldown goes with it — defect 9) |
| **Roster pinning holds across all three rigs — I could not break it** | Live, on the bridge, force-placed 8 more Watchmen and 16 `mire_rat` on top of the existing 9, then set `crowd`, `vermin` and `flock` knobs to **0** and forced a camera re-assign on every rig: `live: 33, liveNotActive: 0, liveNotSeated: 0`, `robedAgents 17 / robedActive 17`, and all **18 named NPCs still in `people.active`**. Both rigs refuse at `PER_MESH = 16` rather than placing an undrawable body (`placedW: 8` on top of 8, `placedR: 16`) |
| **`rigFor` refuses cleanly** | `rigFor` always answering `rigs.rat` goes red in 3 tests; `sour_crow` and `no_such_thing` both answer `null` |
| **Escort completes, and does not complete when it should not** | Live `sandbox.12`: the hen followed the whole 63 m from the cotts to the hen house and the step credited through the real reducer (`s: 'cooling'`, `c.drive [1]`). Driving the player away at 12 m/s put the bird in `lost` at 37 m and it stayed there for 20 s and 200 samples without moving or crediting |
| **`escortActors` / `escortWants` state filtering** | `active` → body + walk; `turnin` → body, no walk; `cooling`/`done` → neither. Two escort quests live at once resolve to two actors and two independent walks |
| **`Cast.watch()` is not a context target** | `cast.targets()` still returns three `talk` targets and no `watch`; the test goes red if `Cast.watch` is neutered |
| **`?shot=` and `?editor=1` stay inert** | `?shot=…` boots with `game: false`, `robed.agents: 0` and no session; the five gate scenarios are the only ones `--all` lists |
| **`js/game/fakedom.js` ships nowhere** | imported by three `*.test.js` files only, not referenced from `index.html` |
| **The balance worry in §9 is overstated** | "33.7 against 70 HP" is a `ward 2 / hearth 2` character. `hpMax = 34 + 14·ward + 4·hearth`, `damageTaken = raw·100/(100+10·ward)`. At the level `neutral.21` actually happens: ward 16 → **322 HP, 13.0 per bite, 25 bites**; ward 20 → **394 HP, 11.2 per bite, 36 bites**. `champion_3` is 10–15 bites. The Watch is not overtuned; it is arguably soft. (It *did* kill my ward-2 harness character on the bridge in seconds — see the HUD in `watch_bridge_night.png`.) |

---

## Your three visual observations

### "The two pale figures in the middle look near-identical at a glance" — right, and it does not matter

They are **`champion_1`** (Whitewall, white, bulb staff, wide flat mantle) and **`champion_2`**
(Longacre, warm grey-tan, pitchfork, yellow-green eyes), standing at `x = +1.6` and `x = +4.0` in
`DEV_ROW` order. At the `foe_line` framing — 12 m, ~40 px tall — they read as one thing. Zoomed 4×
they are clearly different (`shots/review_enemies/champions_1_and_2_at_12m.png`): different staff,
different mantle width, different eye colour.

**A player can never be asked to tell them apart, because neither can ever appear.** The spawn plan
is the whole corpus, and it fields four humanoids:

```
reach.east      sour_crow×4, raider×3, creek_crab×8
bst.switchback  hollow×4, raider×4, watchman×6
bst.middle      watchman×4
ridge.dark      hollow×4
lac.millbridge  watchman×8, champion_3×1
march.west      hollow×5
```

`champion_1` and `champion_2` are in `FOES` and in `ENEMIES` and nowhere else. So this is not a
defect — it is two unbuilt bosses that happen to be adjacent on a turntable. If either is ever
fielded, separate them by value, not by staff: the note in §2 that they differ "by shape and eye
colour rather than by value" is exactly the property that fails at play distance.

### "The eyes do not read at all in daylight" — right, and it is pre-existing, shared with the whole crowd

**Structurally identical.** `Robed` is handed `people.uniforms` (`main.js:66`), so the enemies and
the crowd share the same `uEye` uniform *object*, the same `gl_FragColor.rgb += vEye * uEye`
(`people.js:357`) and the same `eyeTones(zone)`. The only per-family difference is which zone's
`hood.eyes` a body takes.

**And demonstrated on the pre-wave tree**, so it cannot be this wave's doing. Crops of `people_day`
rendered from `b31413f` (`shots/review_enemies/crowd_hood_*_daylight_PREWAVE.png`): a Whitewall
townsperson's hood in 10:30 daylight is a black void with two pale slivers; a Blackstone
townsperson's is a black void with two small red marks. That is the same picture you saw on the
enemies.

The real variable is **zone, not family**. `zones.js` gives dark `hood.inner: '#050507'` with
`eyes: ['#e02a20', …]` — near-black cavity, bright red eyes, the best contrast in the game — and
light `'#2b2d31'` with `['#e8f0f6', …]`, near-white on dark grey, the worst. Every enemy the corpus
actually fields (`raider`, `hollow`, `watchman`, `champion_3`) is a dark-zone body, so the enemies
have the *most* legible eyes of anything in the valley. `foe_line_dev.png` bears that out: the
hollow's and champion_3's eyes read at 12 m; champion_1's do not.

So: a real weakness, worth raising as its own pass over `robeEyes` / `zones.js` light values, but
not a regression and not a reason to hold this wave. `robeEyes` is a registered knob and its default
is 1.0; the comment above it at `people.js:678` still says *"Off by design … Prototype only"*,
which has not been true for some time.

### "The registered `foe_line` scenario framed a wall with no bodies" — right, and it is a real usability defect

Reproduced exactly. `node tools/shot.mjs --shot=foe_line`:

```
eval: {"scenarioKnown":false,"robed":0,"ids":["wall_day","street_dusk","gate_night","town_night","creek_day"]}
```

`shots/review_enemies/foe_line_no_dev.png` is the default camera pointing at paving, with the perf
HUD still on — because `main.js:138`'s `if (shot)` branch is what adds `shotmode`, and `shot` is
`undefined`. `shot.mjs` writes the PNG and the JSON anyway, with no warning. Any `--shot=` typo
produces a plausible-looking render of the wrong thing.

The working invocation is `--shot=foe_line --set=dev=1`, which gives the six abreast
(`foe_line_dev.png`, `agents: 6, active: 6, cost {tris: 1220, drawn: 9}` — the builder's numbers to
the triangle). That is the house convention every rig uses, so the scenarios *are* usable — but
nothing says so at the point of use, and `docs/NOTES_ENEMIES.md` §2 mentions `?dev=1` only in
passing.

Two one-liners worth taking: make `tools/shot.mjs` fail loudly when `window.__forge.scenarios` does
not contain the requested id, and put the `--set=dev=1` invocation in the notes beside the render
list. Neither is this wave's code, but this wave is the one that filed twenty-nine renders behind
the flag.

Defect 2 is the more serious half of the same story: with `?dev=1` supplied, the *other* rigs'
scenarios are now wrong.

---

## STORY §2 vs `CHARGES` — the evidence

**The running game charges.** `foes.js:19` puts `watchman` in `CHARGES`, `arm()` sets
`hostile = true`, and `think()` at `STATE.idle` engages any hostile inside `AI.leash` (26 m),
chases at `run 4.9 × AI.chase 0.85 = 4.2 m/s` and bites 33.7 raw at `AI.reach` 1.3 m. Verified live:
eight of them killed my harness character on Millbridge.

**`STORY.md:185-189`** describes something else entirely:

> *the Watch shadows you at a distance without attacking. Hostiles live on the roads and in the
> countryside, never inside a friendly town … The telegraph is a Watch patrol standing on each
> bridge. Walk past it and nothing happens.*

**What the corpus assumes.** Every Watchman the game can ever spawn comes from a `kill` objective.
There are three, and all three read as pitched battles:

| step | | text |
|---|---|---|
| `light.23/gate` | `kill watchman ×4` in `bst.middle` | *"Break the gate guard"* |
| `dark.21/climb` | `kill watchman ×6` in `bst.switchback` | *"Fight up the switchback"* |
| `neutral.21/hold` | `kill watchman ×10` in `lac.millbridge` | *"Keep them off the root"* |

Not one asks you to avoid one. `bst.middle` and `bst.switchback` are inside Blackstone during
L23 *The Strike on Blackstone* and D21 *The Night We Came Back Up*; `lac.millbridge` is Longacre
during N21 *Both Towns Marching*, when both towns are marching on it. Every placement is consistent
with STORY's *"never inside a friendly town"* — none of these towns is friendly at that moment.

**The two are describing two different populations, and the running game only has one of them.**
`planFrom` reads `kill` objectives and nothing else, so there is no ambient Watch anywhere. STORY's
bridge patrol is not implemented — the nearest thing is `Cast.watch()` (Kesta 2.0, Alder 0.6), which
does *precisely* what STORY §2 says: it shadows you and raises suspicion and cannot attack, because
a `Cast` body has no combat state at all.

**What breaks under each reading.**

- *Take `CHARGES` out.* All three battles become non-hostile until struck (`hurt()` sets
  `hostile = true`), so they are still winnable — as a turkey shoot. "Break the gate guard" and
  "Keep them off the root" both become free kills on ten stationary bodies. It also removes the only
  answer `NOTES_COMBAT.md` §6 has to *"you can outrun anything"*.
- *Take STORY §2 literally and build it.* Costs an ambient population the spawner deliberately does
  not have, and it is the disguise loop's only real content — see below.
- *Do nothing.* The disguise mechanic stays thin. Measured (defect 8): standing on Millbridge among
  the eight, suspicion accrues at **0/s** because `SUSPICION.radius` is 6 m and they are scattered
  16–37 m away. The only suspicion pressure that exists in the shipped game comes from two named
  NPCs.

**My recommendation to put to Aaron: keep `CHARGES` as it is and amend STORY §2 instead**, because
`CHARGES` is what the shipped content needs and STORY's patrol is a *different, unbuilt* thing.
Then, if the disguise loop is to have teeth, build the ambient patrol on the cheap side that already
works — placed, non-combat bodies with a `WATCH_WEIGHT` entry, exactly the shape `Cast.watch()`
returns and `escorts.json` places. That gives STORY's bridge patrol literally ("walk past and
nothing happens") and gives the Neutral campaign something to hide from, without touching a sim
number.

One data point for that decision: `neutral.09` already has this tension live and nobody has played
it. Its `count` step is `interact wwa.temple.font` while `worn: light`, and the font is **5.3 m**
from Alder — inside `SUSPICION.radius`. Rate 2.40/s at glamour 0 means **a 42-second timer** to use
the font and then talk to Alder face-to-face, after which a Break costs −25 Whitewall Standing,
drops the `worn: light` the step is gated on, aggros 30 m inside a friendly town, and locks the
Graft for 120 s while `blocked()` reads `'seen'` for another 22 m in every direction. That step went
from having no timer at all to having that one, in this wave, and nothing tests it.

---

## Test quality

**The pure side is strong; the `three` side is untested.**

`js/game/escort.test.js` and `js/world/foeshape.test.js` are the good kind: they drive the real
`lintAll()` corpus, the real `placeAll()`, the real `QuestRunner` reducer and the real `FOES`
table, and "an abandoned escort does not silently complete when you arrive without it" is the test
that would have caught the failure the primitive exists to prevent. `js/game/enemies.test.js` gets
a real `Session` through `fakeDom()` and runs suspicion to a real Break — the first test in the
project that does.

**Spot-checks — six reverts run on a mutation copy of the tree, all as claimed:**

| revert | claimed | measured |
|---|---|---|
| `ESCORT.travel` 12 → 0 | ✓ 1 | **RED** — 479/1, *"a destination the actor already stands in still has to be walked into"* |
| `WATCHERS = new Set()` | ✓ 4 | **RED** — 476/4, the four named |
| `lampAt` +0.12 → +0.60 | ✓ 1 | **RED** — 479/1, *"the Watch lamp sits inside its own cage"* |
| `rigFor` always answering `rigs.rat` | ✓ 3 | **RED** — 477/3 |
| deleting the grace check | ✓ 2 | **RED** — 478/2 |
| `Cast.watch` returning nothing | ✓ 1 | **RED** — 479/1 |
| `main.js` dropping the cast merge | ✓ 1 | **RED** — 479/1 |
| `session.js` losing `escortTick` | ✓ 1 | **RED** — 479/1 |

**The one it admits to is honest and it is not serious.** Flattening the hem multiplier so it
applies at the chest ring (`shapeOf`'s `flare = y => hem`) does leave 480 green, exactly as §10
says. The mantle-clears-the-chest invariant is real but has little headroom; the revert that bites
(`hollow.wide` → 2.10) does go red. Self-reported, correctly characterised, and about a geometric
property with no gameplay consequence. I would not spend anything on it.

**What is serious is what §10 does not cover.** The 32 reverts are all in `js/game/*` and
`js/world/foeshape.js` — the node side. The two new `three`-side files carry the entire visible
behaviour of the wave and have **no test of any kind**; nine mutations that each destroy the feature
leave 480 green (defect 4, table above). `js/world/split.test.js` was added last wave for precisely
this failure mode and its rule — one specific context-target literal shape — does not fire on any of
them. The rule is not wrong; it is just narrower than the problem it is named after.

The two structural improvements worth making, both small:

1. Move `SPEED` from `js/world/escorts.js` into `js/game/escort.js` and have `escort.test.js`
   import it instead of restating it at line 21. That kills a second copy and puts a real rule on
   the testable side.
2. `enemies.test.js` already pins two lines of `robed.js` by source regex (`:176-178`). The same
   trick, one line each, would pin the frozen-branch early return and `add()`'s
   `state: STATE.idle` — the two fixes this wave made that nothing currently guards.

`tools/campaign.test.mjs:21` is the third and biggest: it manufactures a `kill` event for every
kill objective without asking whether the world can produce one, which is why 61 unreachable quests
pass as reachable (§3).

---

## If you pick this up next

1. **Rig `sour_crow`.** One line in `rigFor` plus a hostile pose, and 61 quests and two campaigns
   come back. Add the guard that would have caught it: every `kill` objective's `geo` must be a rig
   `main.js` hands over.
2. **Stop the Break loop** (defect 1) — the free Graft should not start into a field that is already
   watching.
3. **Move `Robed`'s dev row out of the constructor** (defect 2) so `people_day` is an art record
   again.
4. **Fix the `escort.js:13` comment** and decide whether `reach.neutral` is really where a crossing
   ends (defect 3).
5. **Two source-regex lines in `enemies.test.js`** for the frozen branch and pinned-from-birth, and
   move `SPEED` to the node side (defect 4).
6. **No `dark.watch` key.** The derivation reads correctly; leave `zones.js` alone.

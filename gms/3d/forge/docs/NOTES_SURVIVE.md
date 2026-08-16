# `survive` — the empty arenas

What the nine `survive` steps actually stage, why five of them staged nothing, and what they stage
now. Measured against the corpus on 2026-08-17.

---

## 1. The reproduction

The handed-over table reproduces **exactly**, cell for cell. Script: load `data/areas.json` and
every pack in `data/quests/index.json` through `normaliseAreas` / `normaliseQuests`, then compare
`planFrom({[id]: def}, areas).get(area)` against `planFrom(allDefs, areas).get(area)`.

```
step                  area              own quest alone          whole corpus
dark.16 hold          reach.east        NOTHING                  sour_crowx4,raiderx3,creek_crabx8
dark.21 hold          bst.bailey        NOTHING                  NOTHING
light.05 watch        wwa.northgate     mire_ratx2               mire_ratx4
light.18 hold         reach.east        sour_crowx4,raiderx3     sour_crowx4,raiderx3,creek_crabx8
light.23 hold         bst.bailey        NOTHING                  NOTHING
neutral.06 apart      lac.square        NOTHING                  NOTHING
neutral.14 wait       reach.east        NOTHING                  sour_crowx4,raiderx3,creek_crabx8
neutral.21 stand      lac.millbridge    watchmanx8,champion_3x1  watchmanx8,champion_3x1
sandbox.14 hold       wwa.northgate     mire_ratx4               mire_ratx4
```

The `replan()` reasoning holds. `replan()` keeps `rec[id].s === 'active' || rec[id].s === 'turnin'`
and nothing else, so by `dark.16` — two acts into the second campaign — `light.18` is `done` and
contributes nothing. `reach.east` and `bst.bailey` are deterministically empty at those points.

### Two corrections to the *conclusion*, not the table

**`planFrom` non-empty is necessary but not sufficient, and empty is not always sufficient either.**
Both corrections came out of driving the real `Spawner` rather than reading the plan.

1. **`light.23` and `dark.21` were not empty for a player who wanders.** `bst.switchback`'s centre
   is 41 m from `bst.bailey`'s, inside `SPAWN_RADIUS` (45), so `Spawner.near()` already included
   the switchback pack that the *same* quest plans one step earlier. Those are `CHARGES` creatures
   with `AI.charge` 26. A player who holds the middle of the bailey — the literal reading of "hold
   the bailey" — got **0 bodies and 0 damage in 8 of 8 seeds**. A player who drifted to the north
   lip of the bailey pulled 7–9 bodies and 4,267–11,566 raw damage. So the fight existed, off the
   hold point, on a 4 m geometry margin, gated by a knob (`foeCharge`, registered range 1…26 in
   `Spawner.registerKnobs`). Turn Charge sight down and the last stand of two campaigns evaporates.
   That is a worse bug than a plainly empty field, because it looks fine in a play-test.

2. **A planned nest is not automatically pressure.** `mire_rat` and `creek_crab` are not in
   `foes.js` `CHARGES`, so they engage inside `AI.notice` (7 m) and no further. `light.05` and
   `sandbox.14` — the two holds the finding lists as healthy — deal **0 damage in 3 of 8 seeds** to
   a player who genuinely stands still, and 350–711 to one who turns the strays back the way
   `light.05`'s own hint asks. Any measurement of a hold has to say which player it is modelling.
   Both are reported below.

### One stale number found on the way

`docs/REMAINING.md` §"Where the game actually stands" prices `survive` at **7 objectives, 4
distinct ids**. It is **9 objectives across 5 areas** (`bst.bailey`, `lac.millbridge`, `lac.square`,
`reach.east`, `wwa.northgate`). The `kill` row is staler still — 37 objectives, 11 distinct ids
against the 12 / 8 printed. Not touched; noted.

---

## 2. What each of the five got, and why

Three got a fight. Two are opted out in the data, because their own text forbids one and the
existing `schoolPayErrors` check refuses the alternative. Everything is in the pack; no runtime
code changed.

### `light.23.hold` — the bailey, 120 s — **`watchman` × 4**

```json
{ "id": "hold", "all": [["survive", "bst.bailey", 120], ["kill", "watchman", 4]],
  "in": "bst.bailey",
  "text": "Hold the bailey until morning",
  "hint": "The barracks is below you. They come up in fours.",
  "recover": [["moveTo", "bst.bailey"], ["respawn", "watchman", 4]] }
```

STORY §5 Act 5: Whitewall takes the Black Keep and holds it until morning. §2 puts **the Watch in
the barracks on the lower terrace** — the garrison. A bailey taken at night is retaken by the
garrison coming back up, and `watchman` (level 12, `blackstone_town` band 10–14) is the band the
player is in at L23. It is already the quest's own gate guard one step earlier, so the pack's kill
set is unchanged and `schoolPayErrors` stays quiet on Kindle · Cull · Ward.

Shape copied from `light.05.watch` and `sandbox.14.hold`: `all: [survive, kill]` on one step with
`in` naming the hold area. That is the pattern the two working holds already use.

### `dark.21.hold` — the bailey, 120 s — **`watchman` × 4**

Same edit, mirrored. STORY §6 Act 5: Blackstone retakes the keep **from Kesta's garrison**, and
`dark.21.out` is Kesta standing in front of you saying "we held this for eleven days". Her people
rally at the gatehouse and come back. `watchman` is already what `dark.21.climb` fights on the
switchback, so again no change to the pack's kill set.

The two sieges now mirror each other in the data the way STORY says they mirror in the fiction —
which is the point of `strike.won` → `strike.undone`.

### `dark.16.hold` — the east water stands, 90 s — **`creek_crab` × 4**

```json
{ "id": "hold", "all": [["survive", "reach.east", 90], ["kill", "creek_crab", 4]],
  "in": "reach.east", "unseen": true,
  "text": "Wait out the picket's round",
  "hint": "Nothing on two legs comes. Nobody has worked these stands since the raid.",
  "recover": [["moveTo", "stand.east"], ["respawn", "creek_crab", 4]] }
```

This one needed the most care and it is the one to argue with.

**What the step is.** STORY §6 Act 4 is explicit: *"Same place, same act position, inverted verb.
**Nobody fights.**"* `dark.16.out` marks `raid.water` on the line "Six barrels, and nobody woke
up." The quest's whole job is to be the L18 raid replayed with no shooting. A `watchman` — the
literal picket — would charge from 26 m and destroy the beat, and it is exactly the "ambient,
non-combat Watch" STORY §2 says **is not built**.

**Why a crab is not a substitution.** STORY §5 Act 4 already establishes the ground: *"nobody has
worked the water since the raid, so the stands are thick with creek crabs."* `light.27 The Crab
Stands` plans `creek_crab` × 8 into `reach.east` for exactly that reason, and D16 happens after the
whole Light campaign. The corpus already says this place is crab-ridden; the fix simply stops D16
depending on a Light Act 4 chore being simultaneously accepted. A crab is vermin, not a person, so
"nobody woke up" and the Truth about shooting people carrying buckets both survive intact — and a
crab cannot report you, so the `unseen` premise survives too. `creek_crab` pays `ward` 20, which is
one of D16's two school columns, so the XP promise stays honest.

**Where it is weak, stated plainly.** `creek_crab` is level 4 against a player at roughly 13. It is
chip damage — `docs/REMAINING.md` §11's "Neutral has no band-appropriate trash, so `power(13)`
one-shots the rodent table", reached one campaign early. See §6.

### `neutral.06.apart` — the market square, 60 s — **opted out**

`"unopposed": true`. Not a fight, and not a fight for three independent reasons:

- **The fiction.** CLAUDE.md: *Neutral are farmers / non-magical in public.* STORY §1: *"Longacre
  is the only unwalled town in the valley. Nobody has ever attacked it."* STORY §2: *"Hostiles live
  on the roads and in the countryside, never inside a friendly town."* Putting anything hostile in
  Longacre's market square during the Neutral campaign contradicts three signed-off lines.
- **The step.** `neutral.06.in` is Hana handing over a tea tray; `neutral.06.out` is "That was a
  farce." The hint is *"Slowly, and behind them."* The step is a social hold — keep two buyers from
  seeing each other — and it is already `unseen`.
- **The data refuses anyway.** N06's school column is Barter · Ward · **Glamour**, and its
  `campaign.js` `work` list is `[['talk', 6]]`, so nothing pays Glamour by work. `schoolPayErrors`
  would then demand an enemy that pays Glamour, and the only one in the bestiary is `watchman`.
  Any kill objective here makes `node tools/lintQuests.mjs` fail unless it is a Watchman in a
  farming village square.

### `neutral.14.wait` — the east water stands, 60 s — **opted out**

`"unopposed": true`. The step's own hint is **"Do not fight. Being taken is the job."** Hana's brief
is *"It should be somebody who can be frightened well and then let go."* The player is standing in
the open in Sela's face waiting to be arrested; N14's Truth is `sela.was.you`, "you were the
captive, and the confession was the plan". A fight here does not dress the scene, it cancels it.

Same `schoolPayErrors` wall as N06 — Glamour · Ward against `work: [['talk',4],['survive',240]]`,
so a kill objective must be a Watchman or the lint goes red. And the Watchman is the one thing that
cannot be there, because a fight would stop the arrest the quest is built around.

Note the deliberate asymmetry with D16, which is 60 m away on the same ground: D16 gets crabs
because its player is *hiding* and something biting them is pressure; N14 gets nothing because its
player is *waiting to be found* and a corpse changes the story they are planting (N15's hint says
so in as many words).

---

## 3. The lint rule

`emptyHoldErrors(defs, areas)` in `tools/lintQuests.mjs`, folded into `errors`.

```
dark.16.hold: survive 90s in reach.east, and dark.16 plans no enemy there — add a `kill`
objective with `"in": "reach.east"`, or mark the step `"unopposed": true` if the hold is
meant to stage nothing
```

- **It asks `planFrom` itself**, imported from `js/game/spawner.js`, rather than re-deriving the
  rule from the objective list. The linter and the game therefore cannot disagree about `s.in ||
  o.area`, about `PER_AREA`, or about an unknown enemy id being dropped. `spawner.js` has no
  renderer import, so the linter loads it in node unchanged.
- **It is per quest**, `planFrom({ [def.id]: def })`, which is the whole finding: the corpus-wide
  plan is not what `replan()` gives the player.

### Error, not warning

Error. Two reasons.

1. With `"unopposed"` in the data there is no legitimate silent case left. Either enemies are
   planned or the author has claimed, in the pack, that none are meant to be. A survive step that
   is neither is a bug every time.
2. `js/game/packs.test.js` asserts that the shipped warning list only ever matches
   `apprentice_cord|board_ww`. A new warning channel would have had to be smuggled past that
   assertion or the assertion loosened — and loosening the one test that keeps the warning list
   honest to avoid raising an error is the wrong trade.

`"unopposed"` is a step modifier, added to `STEP_MODIFIERS` and normalised in `js/game/questdef.js`
so it is not an unknown-field warning. It is inert at runtime — nothing in `quest.js` or
`spawner.js` reads it. It exists so the claim lives next to the step that makes it.

---

## 4. The runtime proof

`js/game/survive.test.js`. No assertion in it touches `planFrom` output as a result — `planFrom`
is only asked by the linter test, where it is the thing under test.

**What it drives.** A real `Spawner`, armed the way `js/main.js` arms it —
`arm(areas, defs, () => rec)` — with `rec` built from CLAUDE.md's unlock ladder: earlier campaigns
`done`, earlier quests in this campaign `done`, transitive prereqs `done`, exactly one quest
`active` at the survive step's own index. The harness asserts that record has exactly one live
quest before it runs.

**What moves.** The rig doubles are `enemies.test.js`'s plus the one thing those did not need:
`robed.js` and `chicken.js` apply `foes.js` `carry()` every frame and `vermin.js` does the same
arithmetic inline, so a double without it measures zero for every hold in the game.

**Two player models**, because the answer differs and the difference is the interesting part:

- **stand** — the player holds the centre of the area for the whole duration.
- **engage** — the player holds the *area*, closing on the nearest body at 5 m/s (`js/player.js`
  `speed`) and never stepping outside the shape. This is what `light.05`'s hint asks for: "Two
  strays come up the road. Turn them back."

Damage is raw, summed off `Spawner.take()`, before `combat.js` `damageTaken` halves it at Ward 10.
Nothing in the harness fights back, so these are the pressure a hold applies, not a survival
prediction: the real player is killing these bodies as they arrive.

### Before and after — 8 seeds, the step's own duration

`inHold` is the peak number of live bodies standing inside the hold shape.

| step | | inHold min/med/max | damage, engage | damage, stand | dead-empty seeds |
|---|---|---|---|---|---|
| `light.05` 90 s | before | 2 / 2 / 2 | 350 / 361 / 711 | 0 / 350 / 700 | — |
| | after | 2 / 2 / 2 | 350 / 361 / 711 | 0 / 350 / 700 | — |
| `light.18` 60 s | before | 7 / 7 / 7 | 799 / 1025 / 1296 | 0 / 1002 / 1048 | — |
| | after | 7 / 7 / 7 | 799 / 1025 / 1296 | 0 / 1002 / 1048 | — |
| **`light.23`** 120 s | before | 4 / 7 / 8 *(all from the switchback)* | 4267 / 7368 / 8583 | **0 / 0 / 0** | **8 / 8** |
| | after | 4 / 4 / 5 | 1550 / 3067 / 5651 | 0 / 3033 / 3067 | 1 / 8 |
| **`dark.16`** 90 s | before | **0 / 0 / 0** | **0** | **0** | **8 / 8** |
| | after | 4 / 4 / 4 | 426 / 439 / 451 | 0 / 0 / 0 | 0 / 8 |
| **`dark.21`** 120 s | before | 7 / 8 / 9 *(all from the switchback)* | 9148 / 10595 / 11566 | **0 / 0 / 0** | **8 / 8** |
| | after | 4 / 4 / 7 | 3033 / 6066 / 7000 | 1517 / 4583 / 6133 | 0 / 8 |
| `neutral.06` 60 s | before | 0 / 0 / 0 | 0 | 0 | 8 / 8 |
| | after | 0 / 0 / 0 | 0 | 0 | 8 / 8 — **declared** |
| `neutral.14` 60 s | before | 0 / 0 / 0 | 0 | 0 | 8 / 8 |
| | after | 0 / 0 / 0 | 0 | 0 | 8 / 8 — **declared** |
| `neutral.21` 120 s | before | 9 / 9 / 9 | 16283 / 16383 / 16417 | 16299 / 16367 / 16451 | — |
| | after | 9 / 9 / 9 | 16283 / 16383 / 16417 | 16299 / 16367 / 16451 | — |
| `sandbox.14` 90 s | before | 4 / 4 / 4 | 361 / 700 / 711 | 0 / 350 / 700 | — |
| | after | 4 / 4 / 4 | 361 / 700 / 711 | 0 / 350 / 700 | — |

Three things worth reading twice.

- **The "stand" column is the honest one for the two baileys.** Before: zero bodies, zero damage,
  every seed. After: four Watchmen standing in the bailey with the player, every seed.
- **`light.23` and `dark.21`'s engage numbers went down** (7368 → 3067, 10595 → 6066). That is not
  a nerf, it is the fight moving to where the quest says it is. Before, the only way to find a
  fight was to leave the hold point and pull the switchback pack from the lip; now the nearest body
  is in the bailey, so the player never pulls it. 6,066 raw over 120 s against `hpMax(ward 10,
  hearth 8) = 206` and 50 % Ward mitigation is still a hard fight and probably wants a balance pass
  — **flagging it, not deciding it.**
- **`dark.16` stands at 0.** Four crabs are in `reach.east` in every seed, but `creek_crab` is not
  in `CHARGES`, so a statue takes nothing. That is the same profile as the two holds nobody
  complained about (`light.05` and `sandbox.14` are 0 in 3 of 8 stand seeds). It is a real
  encounter for a player who behaves like one, and nothing at all for one who does not.

### Revert-to-red, per test

Reverting is done by writing the `HEAD` blob over one of my own files and putting it back
afterwards — no `git stash`, nothing else in the tree touched, since other agents are live in
`js/sim/foes.js`, `js/game/session.js`, `js/engine/app.js` and six more.

| reverted | red |
|---|---|
| `data/quests/light.json` | `light.23 stages a fight in bst.bailey…` · `light.23 defends the bailey where the player is standing…` · `every survive step in the packs is opposed or opted out…` — **3 fail / 10 pass**, and lint gains 1 error |
| `data/quests/dark.json` | `dark.16 stages a fight in reach.east…` · `dark.21 defends the bailey where the player is standing…` · `every survive step…` — **3 fail / 10 pass**, lint gains 2 errors |
| `data/quests/dark.json`, `dark.21`'s hold only | `dark.21 defends the bailey where the player is standing…` · `every survive step…` — **2 fail / 11 pass**, lint gains 1 error |
| `data/quests/neutral.json` | `neutral.06 is a deliberate quiet hold…` · `neutral.14 is a deliberate quiet hold…` · `every survive step…` — **3 fail / 10 pass**, lint gains 2 errors |
| `js/game/questdef.js` | the two quiet-hold tests · `every survive step…` · `the empty-hold check sees a hold nobody planned for…` — **4 fail / 9 pass**; lint gains 2 errors *and* 2 unknown-field warnings, which would also fail `packs.test.js` |
| `tools/lintQuests.mjs` | the import of `emptyHoldErrors` fails, so the file cannot load — **whole suite red** |

**One test does not go red on a full `dark.json` revert and that is deliberate.**
`dark.21 stages a fight in bst.bailey on its own quest alone` still passes with the old data,
because the switchback's own Watchmen wander into the bailey and satisfy both the body count and
the `watchman` kind assertion. That is precisely correction (1) above, and it is why
`dark.21 defends the bailey where the player is standing, not 40 m up the switchback` exists as a
separate stand-your-ground test. The two together are what pins it. `light.23`'s equivalent *does*
go red on the kind assertion, because the switchback bleed there is `hollow` and `raider`, not
`watchman`.

### Gates

```
node --test              561 pass / 0 fail   (548 before this pass; +13 here)
node tools/lintQuests.mjs   1 warning (light.06 apprentice_cord, pre-existing) · 0 errors
node tools/lintText.mjs     0 warnings · 0 errors
```

---

## 5. Files touched

| file | what |
|---|---|
| `data/quests/light.json` | `light.23.hold` → `all: [survive, kill watchman 4]`, `in`, hint, recover |
| `data/quests/dark.json` | `dark.16.hold` → `+ kill creek_crab 4`; `dark.21.hold` → `+ kill watchman 4` |
| `data/quests/neutral.json` | `neutral.06.apart` and `neutral.14.wait` → `"unopposed": true` |
| `js/game/questdef.js` | `unopposed` added to `STEP_MODIFIERS` and normalised. Two lines and a comment |
| `tools/lintQuests.mjs` | `emptyHoldErrors`, wired into `errors`; imports `planFrom` |
| `js/game/survive.test.js` | new, 13 tests |

**No change to `js/game/spawner.js`, `js/game/session.js` or anything in `js/sim/`.** The mechanism
was already there; the packs were not using it. `js/world/zones.js` untouched.

---

## 6. What I could not do, and what is left open

1. **The ambient Watch patrol still does not exist, and `dark.16` is the quest that wants it.**
   STORY §2 already documents this in full: the shipped Watch is a combat class in `CHARGES`, and
   the non-combat patrol the disguise campaign is meant to be played against would be "placed
   non-combat bodies with a `WATCH_WEIGHT` entry, standing where `escorts.json` stands its actors".
   `dark.16.hold` literally says "wait out the picket's round" and there is no picket to wait out.
   The crabs make the 90 s a real encounter; they do not make it the *right* encounter. Building
   the patrol is a `Cast`-side job and would not have touched `planFrom` at all — which also means
   this lint rule would not have caught it, and should not be read as saying `dark.16` is finished.

2. **`neutral.14` is a 60 s wait with nothing in it and nothing that should be in it.** The step
   asks the player to stand still and be arrested. There is no verb for "a patrol walks up and
   takes you", so the runtime plays it as an empty timer. The `"unopposed"` flag records that this
   is deliberate; it does not make the 60 s interesting. Same fix as (1) — the picket has to be a
   body that walks up — plus a `taken`-style beat the primitive list does not have. STORY §8.0 says
   a designer who wants a ninth primitive has written the quest wrong, so the honest shape is
   probably an `escort` in reverse, and that is a design call, not a lint fix.

3. **No band-appropriate trash between level 10 and 14 that is not a humanoid.** `REMAINING.md` §11
   flags this for Neutral; it bites one campaign earlier, at `dark.16`. Between `blight_boar`
   (level 8) and `champion_1` (14) the bestiary has only `hollow` (10) and `watchman` (12), both
   `geo: 'people'` and both `CHARGES`. There is no level-12 beast, so a Dark Act 4 stealth step has
   a choice between chip damage from a level-4 crab and a fight that cancels its own story beat.
   Per `docs/NOTES_ENEMIES.md` and standing art direction, every humanoid is a cloak variant of
   `js/world/robed.js` and no new humanoid rig is ever built — but the gap here is a **creature**,
   and `js/world/vermin.js` is a parameterised quadruped that already carries three. A level-11–13
   row on the `boar` or `crab` rig would close it. Not built: it is a bestiary decision and a
   balance decision, and neither is mine to take.

4. **`bst.bailey` is in Blackstone, which is still procedurally generated massing.** `REMAINING.md`
   §6: Whitewall is authored, Longacre and Blackstone are "still seeded jitter". This constrained
   the fix in one real way and one imagined way.
   - **Real:** there is no authored geometry in the bailey, so `Spawner.blocked()` has nothing
     meaningful to reject against there and I cannot promise the four Watchmen will not stand
     inside whatever massing lands on that rectangle when Blackstone is authored. The area is
     102 × 50 m and the spawn is rejection-sampled inside it, so the count is safe; the
     *placement* will need re-checking after A8 finishes Blackstone, the same way
     `js/editor/whitewall.test.js` re-checks Whitewall's.
   - **Not real:** it constrained nothing about *what* to place. `watchman` is an `areas.json`
     coordinate and a bestiary row; neither needs a building. The bailey exists as a shape and the
     quest already sent the player there.
   - One thing to fix when Blackstone is authored: the 41 m gap between `bst.switchback` and
     `bst.bailey` against `SPAWN_RADIUS` 45. Four metres of margin is what currently decides
     whether the L23/D21 climb pack bleeds into the hold. It should be a decision, not a
     coincidence.

5. **Balance not adjudicated.** `dark.21`'s hold is 3,033–7,000 raw over 120 s at roughly 4,583
   median, against a ~206 HP pool halved to ~2,290 effective. That is survivable only because the
   player is killing four Watchmen while it happens, which the harness does not model. It wants a
   real play-test or a `soak.mjs` pass, and `soak.mjs` reads `js/sim/campaign.js`'s hand-maintained
   array rather than the packs (`REMAINING.md` §8), so it would measure the wrong thing today.

6. **`unseen` is decorative.** While tracing whether adding hostiles to `dark.16` could break its
   `unseen` flag, I found that **nothing in the runtime ever emits `{ t: 'seen' }`**. `quest.js`
   line 174 fails an `unseen` step on that event and `session.js` `watch()` computes `seen` only
   for `graftBlocked`. Nine steps carry `unseen` — the only thing that emits the event is
   `js/game/quest.test.js` — so none of them can currently fail. Not fixed —
   out of scope, and the fix belongs next to the patrol in (1) — but it is why adding crabs to
   `dark.16` was safe, and somebody should know.

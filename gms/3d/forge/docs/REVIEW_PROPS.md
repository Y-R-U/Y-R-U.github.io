# Review — the props and placed-cast wave

Adversarial review of the uncommitted props/NPC placement work (`data/props.json`, `data/cast_at.json`,
`js/game/placement.js`, `js/game/placement.test.js`, `js/world/props.js`, `js/world/cast.js`; edits to
`js/main.js`, `js/world/people.js`, `js/world/roster.js`, `js/game/session.js`, `js/game/questrunner.js`,
`js/game/hud.js`, `js/game/wiring.test.js`) against `docs/NOTES_PROPS.md`.

Every number below is one I measured. The node demos, the raw-CDP driver scripts and 40-odd renders live
in the session scratchpad. Where I could not reproduce something I say so and it sits under *Suspicions*.

---

## Verdict

**Safe to commit as-is.**

No blocker. The failure mode that killed the last wave is genuinely fixed and I verified it the hard way:
a brand-new game *and* a reload on a written save both boot at 844 × 390, with 48 props and 18 named
bodies, no console output on either path. I then broke it deliberately to prove the guard is thinner than
it looks — see defect 5 — but the shipped file is correct.

The pinning question is answered: `crowd()` and `roster()` cannot fight, because they are on two different
rigs. Bel does not move, does not get unseated and does not get reassigned, through 600 frames, a crowd
sweep from 0 to 120, a pause, eight kills and a 400 m area transition. The A8 promise is real — I moved and
resized `wwa.granary` and every prop in it followed to the millimetre.

Six defects, all should-fix or minor. The two most worth doing before the next wave are the
`verbFor`/reducer disagreement (2) and the spawner rate I was asked to quantify (4), which is far higher
than §6 implies.

---

## Demonstrated defects

### 1 — SHOULD-FIX: `bst.intake.draw` is buried in the gorge wall and hangs over the river

`data/props.json:42` anchors the Blackstone intake sluice at `at: [-0.25, 0.45]` of `bst.intake`. That
lands it on a near-vertical bank. The sluice frame is 2.7 m wide and 1.72 m tall; sampled along its own
local x, the terrain relative to the prop's base runs:

```
local x   -1.35  -0.90  -0.45   0.00   0.45   0.90   1.35
terrain   +2.16  +1.43  +0.70  -0.03  -0.76  -0.93  -1.10   (metres above the sluice's base)
```

So one end of the frame is 2.16 m *inside* the hillside and the other is 1.10 m in the air. Renders from
four directions at 9 m confirm it: from the south the sluice is a fragment of dark wood emerging from a
grass cliff with the river underneath and nothing to stand on
(`scratchpad/intake/deg180.png`, `deg90.png`). It is the one prop in the 48 that is plainly broken on
screen. Nothing under it, half of it missing.

Seven other props sit on ground that varies by more than 0.5 m across a 2 × 2 m footprint —
`reach.light.stand` (±1.1), `reach.dark.reading` (±1.1), `lac.leat` (+1.48), `heath.ford.reading` (±0.7),
`bst.board.rate` / `.yield` / `.crate` (±0.4). I rendered `heath.ford.reading` and `reach.dark.reading`
and both read fine — a gauge post at a water's edge is what they are meant to be. Only `bst.intake.draw`
is actually wrong.

**File:** `data/props.json:42`. One re-authored `at` fixes it; no code change.

---

### 2 — SHOULD-FIX: `questrunner.verbFor()` and the reducer disagree on gated steps, and the button lies

`js/game/questrunner.js:282` mirrors the reducer's live-step set — `[reqs[rec.i], ...optional]` — but it
does **not** apply `stepOpen()` (`js/game/quest.js:30-38`), which is what the reducer gates every one of
those steps through. Any step whose `verb` is real but whose `after`/`before`/`worn`/`require` is not
satisfied still supplies the button's label.

Two shipped cases. Both driven through the real `verbFor` and the real `quest.js` reducer against the real
packs (`scratchpad/verbfor.mjs`):

```
sandbox.19 / round   verb=kindle  after=18 before=21   objective: interact wwa.lamp
  verbFor('wwa.lamp') = kindle          ← at every hour of the day
  hour 14: cast kindle -> step 0 -> 0   counts {}            ← nothing at all
  hour 19: cast kindle -> step 0 -> 0   counts {"round":[1]} ← credited

neutral.09 / count   verb=barter  worn=light             objective: interact wwa.temple.font ×4
  verbFor('wwa.temple.font') = barter   ← whatever face is worn
  worn=null : four taps -> i 3 -> 3, counts {}             ← nothing at all
  worn=light: four taps -> i 3 -> 4, counts {"count":[4]}   ← credited
```

`sandbox.19` is the worse of the two, because it is a board quest anyone can hold and because
`props.use()` (`js/world/props.js:300-306`) checks only `verb !== 'kindle'` — so at two in the afternoon
the button reads **KINDLE**, the player presses it, **the lamp visibly lights**, and the step does not
move. That is precisely the "watches it light and the quest does not advance — the worst possible
feedback" that §4 says drove `verbFor` in the first place. It resolves itself at 18:00 (the emit still
fires, and the lamp being already lit only costs the visual), so it is a confusing dead press rather than
a soft-lock.

Fix is small: run the same `stepOpen(s, ctx)` gate inside `verbFor`, or return null when the step is shut.

**Files:** `js/game/questrunner.js:282-293`, `js/game/session.js:982`, `js/world/props.js:300`.

---

### 3 — SHOULD-FIX: the lamp's lit state is a few pixels, and in daylight at play distance it is invisible

The glow is a `SphereGeometry(0.15, 6, 4)` (`js/world/props.js:266`) placed at local `[0, 1.98, 0.5]`
(`props.js:27`) — which is inside the lantern housing, `taperBox(0.30, 0.30, 0.38, 0.22, 0.22)` centred at
local `[0, 1.95, 0.5]` (`props.js:25`). A 0.30 m sphere inside a 0.30 m opaque box: almost all of it is
occluded, and what the player sees is the sliver that escapes between the trim bands.

Measured at a 2.2 m camera (`scratchpad/glow_day_unlit.png` vs `glow_day_lit.png`): the lit state is a
~8 × 14 px warm chip. At night it reads properly — a candle in a lantern, and rather nice
(`glow_night_lit.png`). In the actual gameplay frame I captured on the phone profile after a real finger
press lit it (`scratchpad/mobile_lamp.png`, 844 × 390, lamp ~9 m away, daylight) it is not visible at all.

`propGlow` does not rescue it: the knob scales the sphere, so at 3 it is a hard-edged flat octagon
swallowing the whole lantern (`glow_day_lit_knob3.png`). There is no useful setting between "hidden" and
"beach ball".

`props.js:260-261` says "A lamp the player has just lit has to look lit or 'relight the lamp' has no
answer on screen." Correct diagnosis; in daylight it is still true after the change.

---

### 4 — SHOULD-FIX (pre-existing): 21 % of granary rat spawns cannot be hit from any standable point

§6's last item, quantified as asked. I drove the real `Spawner.place()` (`js/game/spawner.js:143`) 3000
times against the real `wwa.granary` shape and the real colliders in a live session, then for every
resulting point searched 48 headings × 17 radii from 1.5 m to 26 m for a spot the player can legally stand
on (not in a walk box, not under water) with `world.sight()` returning true:

```
attempts 3000, placed 3000
inside a demo-building walk box:  632  (21.1 %)
of those, unreachable from ANY standable point at ANY distance: 624
unreachable as a share of all spawns: 20.8 %
control sample of 200 unblocked spawns unreachable: 0
```

`place()` rejects a point inside a nested *planned area* (`spawner.js:151`) and never asks the colliders.
At 20.8 %, a full 8-rat granary fill has a **1 − 0.792⁸ ≈ 85 %** chance of containing at least one rat the
player cannot shoot, and the expected count is 1.7. That is the first fight in the game.

It is a stall, not a soft-lock, and I confirmed why: `foes.think()` (`js/sim/foes.js:107-112`) takes an
idle rat into `alert` at `AI.notice` and `vermin.js:925` moves a chasing body through `walkStep`, whose
start-not-clear branch pushes a body that began inside a box back out of it. So the rat ejects itself and
comes to you. But the builder's two lost acceptance runs are the normal experience, not bad luck, and with
a leash or a doorway it would not resolve. Worth fixing in the next wave: one `walkStep(p, p).hit` test
inside `place()`'s retry loop.

---

### 5 — SHOULD-FIX (test): the boot-ordering tripwire does not see through `targets()` or `sight()`

`js/game/combat.test.js:524` scans the `world: { … }` block for identifiers and asserts each is declared
before `app.start()`. It correctly covers the two **new** hooks — `interact: (id, verb) => props.use(...)`
and `arm: id => props.arm(id)` name `props` directly, `props` is `main.js:68`, `app.start()` is
`main.js:196`, so the tripwire would fire. Good.

But two hooks are bare function references — `targets` (`main.js:128`) and `sight` (`main.js:137`) — and
`function` declarations have no entry in the test's `const|let|class` map, so the scan stops at the name
and never looks inside the body. Both bodies close over module consts.

I built exactly that mistake and it sails through:

```js
function targets() { return props.targets().concat(cast.targets()).concat(LATE); }
...
app.start();
const LATE = [];
```

```
node --test           ->  393 pass, 0 fail          ← the tripwire is happy
reload on a save      ->  [throw] ReferenceError: Cannot access 'LATE' before initialization
                            at Object.targets (js/main.js:129:56)
                            at Session.watch   (js/game/session.js:681:31)
                            at Session.graftTick(js/game/session.js:820:23)
                            at Session.update  (js/game/session.js:1031:10)
                            at loop            (js/engine/app.js:112:53)
                          "forge: Something broke: Uncaught ReferenceError…", every frame, forever
```

Same shape, same path, same class of blocker as last time, and green. `Session.watch()` reaches
`world.targets()` on the first synchronous frame of a resume, so this is not a hypothetical route.

The fix is to follow the two hoisted helpers: pull their bodies out of `src` and scan those too, or assert
that every identifier the *file* references from within `targets`/`sight` is declared above `app.start()`.

---

### 6 — MINOR (latent): `crowd()` guarantees a place in `active`, not a seat in a mesh — and the oldest named body is the one that loses

§3 claims "A named body is always in `active`, and always first, so it also always gets a seat in its
(zone, variant) `InstancedMesh`". The second half does not follow. `setCrowd`
(`js/world/people.js:669-674`) does `this.active.filter(...).slice(0, MAX_PER_MESH)` with `MAX_PER_MESH =
32` and no refusal, no warning, and no equivalent of `Vermin.add()` returning null at the cap.

Live, in a real session, forcing 40 extra named bodies into the `(zi 0, vi 0)` bucket:

```
{"namedTotal":58,"inActive":58,"seated":45,"undrawnButTargetable":13,
 "belStillDrawn":false,"bucket00":52,"meshCount":32}
```

Thirteen named NPCs in `active`, in `cast.targets()`, and drawn by nothing — an invisible quest-giver,
which is the exact failure `roster.js` was written to prevent. And because `place()`
(`people.js:663`) *unshifts*, the newest arrivals take the front of the queue, so **Bel is the first one
evicted**, not the last.

Not reachable today: the shipped cast is 18 bodies and the fullest bucket is 5 of 32
(`{"0/0":5,"0/1":3,"1/0":3,"1/1":2,"2/0":3,"2/1":2}`). This is a note for whoever adds the next dozen
named NPCs to one town, and a correction to §3's wording. A one-line `if (list.length > MAX_PER_MESH)
console.warn` would make it loud.

---

### 7 — MINOR: `placement.js`'s file-top comment overstates the guarantee it is famous for

`js/game/placement.js:4-6`:

> *A prop therefore **cannot** be authored outside the area a quest looks for it in*

It cannot be authored outside its **anchor** area. `placeAll()` never sees a step's `in`, and nothing stops
the two differing:

```
anchored in A while a step scopes it to B:
  {"id":"thing","kit":"lamp","area":"A","at":[0,0],"x":5,"z":5}   errors: []
```

One of the 48 already has anchor ≠ id — `wwa.board` is anchored in `wwa.market` (§6 admits it). The
property is real and it holds today, but it is held by
`placement.test.js:36` ("every prop stands inside every area a step looks for it in"), not by the
coordinate system. The comment credits the design with a guarantee the test is actually providing, which
is the sort of thing that gets the test deleted in two years' time.

`props.js`'s six-line and `placement.js`'s six-line file-top blocks are both over `CLAUDE.md`'s "a short
file-top line" budget — same call as `roster.js` last wave, Aaron's to make. Everything else is clean: no
banner comments, no JSDoc, and comments only where something is not guessable.

---

### 8 — MINOR: a missing `data/props.json` also silently deletes the entire named cast

`main.js:64-67` catches, warns and continues, which is what the comment promises — verified by moving the
file aside and booting both paths:

```
[warning] props: nothing placed — data/props.json (404)
new game : ready true, boot gone, props 0, cast 0, active 36, light.01 tracked
resume   : ready true, props 0, cast 0, game runs
```

The game survives; that half of the comment ("Missing files lose the props, not the game") is true. But
`loadPlacements()` awaits three fetches in series and the first failure aborts all three, so losing
`props.json` also loses `cast_at.json` and every named NPC — every `talk` objective in the corpus goes
with it, silently, behind one console warning. Worth either settling the three fetches independently or
saying so in the comment.

Related and equally minor: those three fetches are serial, inside a top-level `await`, above
`app.start()`. On localhost that is 5 ms; on a phone over a real network it is three sequential round
trips added to time-to-first-frame, and `areas.json` is fetched twice (again by `QuestRunner`).

---

## Suspicions I could not demonstrate

- **`bst.board.yield` may be embedded in the Blackstone wall run.** My first close render put the camera
  inside a `wallRun` and the frame was solid masonry with two small lumps of the sacks poking through
  (`scratchpad/kits/crate-sacks.png`). But every automated check disagrees: the prop is 2.4 m from the
  wall's centre against `hd 1.42`, it is inside no collider box, and my visibility sweep found a standable
  point with a clear line to it. I think the *camera* was on the wrong side of the wall and the ray test
  was fooled by starting inside a box. Treat as unproven and worth an eye during A8.
- **Nothing re-seats a prop after `demo.rebuild()`** (the builder's own §6). I did not drag a rebuild knob
  and re-measure. Cheap to check, I ran out of budget for it.
- **A real phone.** Everything here is desktop Chrome, including the iPhone-UA / touch-emulated run.
- **The 90 s chevron against a prop step**, also still untested.

---

## What I verified as correct — do not re-check these

| | |
|---|---|
| **Both boot paths, for real, over CDP** | new game at 844 × 390: ready, boot overlay `gone`, slate → `light.01` tracked, `here = ['wwa','wwa.granary']`, player (−547, −24), **48 props / 18 cast**, `active` 54. Save flushed, reload: **no slate, ready true, 48 props / 18 cast, played 31 s**, HUD reads THE GRANARY. **No console output on either path.** The last wave's blocker is gone |
| Tripwire covers the *new* hooks | `interact`/`arm` name `props` (`main.js:68`) directly, well above `app.start()` (`main.js:196`). It is the indirection through `targets`/`sight` that is uncovered — defect 5 |
| **Named-NPC identity** | 600 frames: every one of the 18 unmoved to 3 dp, in `active`, holding the same mesh seat. Same after `pause('menu')`/resume, after 8 rats spawned and were killed beside her, and after a 400 m teleport into `lac.mill`. `cast.at('bel') === people.agents.find(a => a.npc === 'bel')` still true at the end. It cannot be reassigned — there is no reassignment path left |
| **`crowd()` vs `roster()`** | they cannot compete: named NPCs are on the `People` rig, fighting creatures on the `Vermin` rig, separate `InstancedMesh` sets. No shared seat budget exists. A named NPC cannot displace a fighting creature and vice versa |
| **Crowd knob sweep, live** | `0 → active 18 / npc 18 / wanderers 0 / seated 18`, `4 → 22/18/4/18`, `36 → 54/18/36/18`, `120 → 120/18/102/18`. Bel in `active` and seated at every setting. `crowd = 0` really does keep all 18 and the ambient crowd really does still work |
| **Prop placement, all 48, against the live world** | inside a building footprint: **0**. At or under the waterline: **0**. No standable point within context range: **0**. Visible from no standable point within 8 m (collider *and* terrain occlusion): **0**. Prop base vs live `groundAt`: max |Δ| **0.15 m**. No two targets within **4 m** |
| **The A8 claim** | moved `wwa.granary` by (+50, −12): every anchored prop moved by exactly (+50, −12). Doubled it about its centre: every prop's offset from the centre doubled and all stayed inside. Both exact to 1e-9 |
| The rejection path | `anchor()` returns null outside the unit square / unit disc; `placeAll` collects the error and drops the entry; `contains()` is a second, independent gate |
| **Full mobile loop, real touch** | iPhone UA, touch emulation, 844 × 390 dpr 2, landscape, no rotate prompt. `Input.dispatchTouchEvent` on the slate, then on the context button: glyph **✧**, label **KINDLE**, press → `light.01` step **2 → 3**, `lit: ['wwa.granary.lamp']`, glow count 1 visible. **64 calls / 136 k main.** `hud.bindAct()`'s pointer path works; the builder's untested gap is closed |
| **Cost** | `new Props()` 2.2–3.0 ms warm. **9 merged meshes, 3,362 triangles** — both exactly as claimed, counted off the built geometry. `normalize()` de-indexes, so `count()`'s `position.count / 3` really is triangles. 18 × `people.place()` = 0.3 ms total. `verbFor` with 8 active quests and a miss: 4.2 ms per 3,600 calls |
| Leaks / budget | no textures anywhere in `props.js` or `cast.js`, so `budget.js` `track()` is correctly not involved. `Props` is constructed once, never rebuilt; the source geometries are merged and dropped the same way `buildings.js` does it |
| Glow lifecycle | `use()` lights, `arm()` unlights, counts and `visible` follow, `arm` on an unlit prop still answers true. Only `light` and `dark` have glow meshes — neutral has no lamp. (`frustumCulled = false` on the glow mesh means a lit lamp costs one draw call valley-wide; noted, not worth changing) |
| `zones.js` | **unmodified.** No zone string test anywhere in `props.js` or `cast.js` — the only literals are surface names. The four `=== 'neutral'` / `'dark'` tests in `session.js` are pre-existing, outside the diff, and are game logic not art |
| Comment accuracy | I checked every non-obvious claim in the new files. "nine meshes" ✓ (9). "+z facing the way `ry` points" ✓. "a lamp answers to Kindle … the school every step that names one asks for" ✓ (all three lamp ids are `kindle`). "field.js, not terrain.js: the same `zoneAt`" ✓ (`terrain.js` re-exports it from `field.js`). "Batch keeps its parts as raw geometry … countable" ✓. Only `placement.js:4-6` is wrong — defect 7 |

---

## Test quality

**Better than the last wave's.** The ten new tests in `placement.test.js` drive the real shipped packs
through `lintAll()`, the real `data/areas.json`, the real `placeAll()` and the real `quest.js` reducer. The
`light.01` end-to-end test is a genuine seam test: it takes the ids `targets()` actually produces and
walks them through accept → 8 kills → interact → talk → done → payout. Nothing manufactures an event the
runtime cannot produce. `GAPS = []` with the missing-id test beside it is the right shape — an id added to
a pack and not to `props.json` fails loudly.

**Spot-check of the revert claim — I reverted seven behaviours myself and re-ran the suite:**

| reverted | expected | got |
|---|---|---|
| `anchor()` clamps instead of returning null | red | **red** (392/1) ✓ |
| `crowd()` → `agents.slice(0, n)` | red | **red** (392/1) ✓ |
| `session.js` `arm` → the old ternary | red | **red** (392/1) ✓ |
| re-anchor `wwa.granary.lamp` to `wwa.market` | red | **red** (391/2) ✓ |
| delete the `verb` check from `quest.js` `credit()` | red | **red** (391/2) ✓ |
| `main.js targets()` → the wandering stand-in | red | **red** (392/1) ✓ |
| **`people.setCrowd()` → `agents.slice(0, Math.min(n, POOL))`, `crowd()` left correct** | — | **GREEN, 393/0** ✗ |

The builder's eleven claims are honest — every one I re-ran behaved as the table says. The seventh row is
mine, and it is the gap: **the invariant is tested one call away from where it lives.**
`placement.test.js:75` exercises `crowd()` in isolation and constructs `Cast` against a hand-rolled
`{ agents: [], place(a) { this.agents.unshift(a); return a; } }` stub. The only caller of `crowd()` in the
game is `people.js:671`, and `people.js` imports `three`, so no test can load it. Put the original bug back
into `setCrowd` and the suite stays fully green — at `crowd = 0` (the registered minimum of a shipped
knob) `active` becomes `[]` and all 18 named bodies vanish, which is the defect §3 exists to prevent.

Same shape, worse: **`js/world/props.js` has no automated coverage at all.** It imports `three`, so
`use()`, `arm()`, `drawGlow()`, `targets()`, all seventeen kit builders and the `verb !== 'kindle'` guard
are exercised by nothing in CI. The lamp/Kindle test proves `quest.js`'s reducer refuses the wrong school;
it never touches `props.use()`. Deleting the guard from `props.js` would leave 393/393 green and let a
Barter tap light the lamp. That is not fixable without a headless-three harness, but it belongs on the
record next to `combat.test.js`'s rig stub.

`wiring.test.js`'s new `arm` assertion is honest and goes red when reverted, though it asserts against
`{ arm: () => false }` rather than the real `props.arm`.

---

## Kit renders

I photographed **all 33 kit/variant combinations**, from a camera chosen per prop by searching for a
standable point with a clear line of sight, plus a second pass for the ones the first pass buried
(`scratchpad/kits/`, `scratchpad/kits2/`, `scratchpad/intake/`). All seventeen types are now on record.
Plain judgement:

- **Genuinely good, ship them:** `font` (the temple font is the best thing in the kit — reads as carved
  limestone at a glance), `sluice`, `hatch`, `font:hearth`, `barrel:bowl`, `shelf`, `table:stall`,
  `post:gauge` at the ford, `crate`, `stone:plot`.
- **Legible and fine, unremarkable:** `post`, `post:chalk`, `hurdle`, `kerb`, `rubble`, `rubble:spit`,
  `sapling`, `sapling:thorn`, `stone`, `stone:floor`, `timber`, `barrel`, `crate:chest`, `board:lectern`,
  `door`, `door:lock`, `door:hinge`, `table`.
- **Weak:** `lamp`. The lantern head is a flat pale block with almost no read at play distance, and it is
  the one prop that has to communicate state — defect 3.
- **Weak:** `board:slate` in the dark zone. Nearly black slate on shaded grass; it reads as a smudge on
  the ground rather than a slate pile.
- **Wrong:** `bst.intake.draw` — defect 1.
- **Context, not kit:** `wwa.board`, the Yard post that gives five board quests, is wedged in a 3 m alley
  between two Whitewall terraces (`kits2/board.png`). The board itself is fine; the spot is not. §6 already
  wants A8 to put it back on `wwa.board`.

Two systemic notes. The `door` slab is rotated 0.5 rad and `projectUV` is planar, so its planks run
visibly diagonally — cheap to fix by rotating UVs with the slab, not worth a wave of its own. And the
"interior props stand in the open" state is more conspicuous than §6's wording suggests: a freestanding
doorframe with an ajar door, in a field, with nothing attached to it, is the first thing you notice about
Whitewall's almonry cluster. That is A8's problem, not this wave's, but it should not be allowed to become
permanent.

---

## If you pick this up next

1. **Re-author `bst.intake.draw`'s `at`.** One line of JSON, and the only genuinely broken prop.
2. **Gate `verbFor` through `stepOpen`.** Small, and it removes the one dead-press in the game.
3. **Give the lamp glow somewhere to escape from** — move the sphere below the lantern's skirt, or make
   the housing's front face `crest`/emissive while lit.
4. **`walkStep(p, p).hit` in `Spawner.place()`'s retry loop.** 21 % is too high to leave for A8.
5. **Teach the tripwire to follow `targets` and `sight`**, and warn from `setCrowd` when a bucket overflows.

# Gather — fishing, forage, mining, cooking, and the deliveries they feed

`gather` was the last large verb that could not fire: **48 objectives across 24 ids**, and no node,
no fire and no hand-over existed for any of them. The rules layer was already complete — the same
shape as combat and interact, where the pure functions were fine and nothing called them.

All of it fires now. **A silverling caught at the fish steps with the real 0.9 s strike window,
cooked at the Whitewall kitchen fire, carried out to the east picket, and `light.26` pays and
unlocks `light.21`** — in a real browser, under mobile emulation, driven through the real HUD
button. §8.

**24 of 24 gather ids have a source. 24 of 24 `deliver` objectives now have a route.**
Tests: **404 before, 430 after, 0 failing.** `lintQuests` 0 errors and the same one pre-existing
`light.06` warning; `lintText` clean. Gate worst case **154k of 350k**.

---

## 1. What was built, file by file

| File | | |
|---|---|---|
| `data/gather.json` | **new** | 26 authored nodes — 7 fishing spots, 10 forage patches, 6 rock seams, 3 hearth fires. Same anchor-plus-fraction scheme as `data/props.json`. |
| `js/game/gathering.js` | **new** | The whole rules layer: region resolution, `buildNodes`, `NodeSet`, `harvest`, the fishing run, cooking, eating, `handovers`, and the three event builders. No `three`, no DOM, no `Math.random`. |
| `js/game/gathering.test.js` | **new** | 26 tests. The seam: corpus → node → area shape → real reducer. |
| `js/game/context.js` | **new** | `pickContext` — which target in reach the button points at. Lifted out of `session.retarget` because the eat target needed a rule and a rule needs a test. |
| `js/world/nodes.js` | **new** | The four kits, the merged per-zone geometry, the ready pips, `targets()`, `setState()`. |
| `js/world/materials.js` | edited | One new surface, `bush` — a flat colour off the zone's own `foliage.bush`. Three lines. §4. |
| `js/sim/tables.js` | edited | `ITEM_VALUE` now carries the generated `cooked_*` prices. Two lines, no authored number. §4. |
| `js/game/placement.js` | edited | `loadPlacements` fetches `gather.json` as a fourth parallel, independently-settled file. |
| `js/game/session.js` | edited | The gathering section: the hold, the run, the fire, the meal, the hand-over. §3. |
| `js/game/hud.js` | edited | Three glyphs, and `bite()` now restarts the charge clock so the inverted ring drains over the strike window. |
| `js/main.js` | edited | Builds the nodes, adds them to `targets()`, and gives the session `gatherNodes` and `nodeState`. |

### The flow, end to end

```
loadPlacements()   + data/gather.json          → anchored x,z like every prop
   → buildNodes()  region from the area's town, or the entry's own override
                   node.areas = areasAt(x,z), which is what the event will name
   → new Nodes()   one Batch per zone → 6 merged meshes, plus one pip mesh per zone
   → new NodeSet() the session's copy: ready → working → spent → cooling, on doc.played

hud pointerdown ─350ms→ channel('start','work')  → session.workStart()
   fish   → spendFocus, nodes.begin, newRun()
   patch  → arm the hold; the pick happens on release
   fire   → start the cook loop

session.gatherTick(dt) → tickRun()   'bite' → hud.bite(true) + the bite sound + a buzz
                                     'lost' → the ring stops inverting; the line recasts
                                     'recast' → another cast, another 5 Focus

hud pointerup → channel('release','work') → strike()  → landed()
                                                      → quests.emit(gatherEvent(node, got))
```

`js/sim/gather.js` and `js/sim/tables.js`'s balance are used exactly as written. Nothing in
`js/sim/*` was reimplemented; the only edit to it is the two generated lines in §4.

---

## 2. The nodes

26 nodes, **5,320 triangles**, 6 merged meshes (wood/trim/bush × light/neutral/dark, minus the
combinations no zone uses) plus 3 instanced pip meshes.

| kind | n | where |
|---|---|---|
| `fish` | 7 | `wwa.fishsteps` · `stand.chalk` · `stand.low` · `stand.east` · `stand.quiet` · `heath.ford` · `stand.dry` |
| `forage` | 10 | `downs.pasture` · `reach.light` · three in `fields.*` · two in `lac.westfield` · three in `heath.*` |
| `rock` | 6 | chalk in `downs.pasture` and `lac.westfield`; iron-glass in `heath.crag` and `bst.levels`; obsidian ×2 in `bst.levels` |
| `hearth` | 3 | `wwa.kitchen` · `lac.barn` · `bst.kitchen` — every area in `areas.json` carrying `hearth: true`, and a test holds that |

A fishing spot is a low rail at the top of two plank steps, a creel, three bank stones and a rod
leaning out over the channel with the ready pip at its tip, so the pip reads as the float on the
line. A patch is five stems out of a low clump. A seam is ten small lumps with three shards
standing out of them. A fire is a seven-stone ring, three logs and a spit frame.

**Nothing is drawn on the water.** Every spot stands on the bank — a test measures each one against
`waterY`, `creekZ` and `creekHalf` and fails a spot that is under the line, in the channel band, or
more than 9 m from the water. Fishing therefore costs no fill rate at all, which was the stated
risk.

---

## 3. The interaction

**Hold to cast, release to strike.** SYSTEMS §6.2 specifies it and `light.02`'s own hint already
said so: *"The steps below the dock. Hold the work button."* The HUD had `bite()` written for this
and nothing calling it.

- Hold the context button past 350 ms and the line goes out. The charge ring measures `castTime`.
- On a bite the ring **inverts and drains over the strike window** — 0.9 s on touch, 0.6 s on a
  mouse — the button grows, the `bite` sound plays and the phone buzzes.
- Release inside the window and `rollCatch` decides. Release early: *"Too soon — the line comes
  back empty."* Hold past it: *"Gone."*, and the line recasts by itself.
- A cast that draws no bite **recasts on its own inside the same hold**. That is not a convenience:
  `secondsPerCatch = castTime / biteChance` only describes what the player experiences if it does.

`hud.bite()` gained one line — it restarts the charge clock — because otherwise the inverted ring
carried the cast's own elapsed time into the window and drained instantly.

A patch or a seam is one action: a tap works it, and a hold-then-release works it too. A tap at a
fishing spot or a fire says which gesture it wants rather than doing nothing. A fire cooks one item
every 1.6 s for as long as it is held.

Everything spends its school's tier-1 spell out of Focus — Line 5, Forage 7, Hearth 9, Setting 11.
At Line 1 that is 5 Focus per 4.07 s cast against 6.6 Focus/s of regen, so it is a cost that exists
and never bites. §6.2 is explicit that a missed cast is not refunded.

---

## 4. Decisions that could have gone the other way

**Placement is authored, as a fraction of an anchor area — the props wave's scheme, for the props
wave's reason.** A8 moves an area and everything anchored in it follows. It also makes "a node
stands inside every area a step scopes it to" a machine-checkable property rather than a hope, and
that test is the one that would catch A8 breaking it.

**The node's own school is the verb, and the dial is not consulted.** This is the biggest call in
the wave and it goes the opposite way to the lamp. A lamp is one of many things you might cast at,
so "Kindle or nothing" is correct feedback. A fishing spot is not: there is nothing else you could
be doing there. And it is not only taste — **a dial check would make `light.02` unreachable.** No
school but Kindle is on the dial until it has XP (`sheet.isUnlocked`), no quest grants
`school.line`, and the only way to earn Line XP is to fish. The corpus agrees: the only `verb` on
any gather step is `hearth` on the cook steps and `forage` on `sandbox.11`, and both are the node's
own school.

**The event carries the node's area, not the player's.** `gatherEvent` sets
`area: node.area, areas: areasAt(node.x, node.z)`. This is the props wave's lesson applied: a step
scoped to `wwa.fishsteps` should credit a fish taken there however far up the bank the rod is, and
a step scoped to `reach.light` gets it too because `areasAt` walks the declared parents.

**`via: 'craft'` on the cook event.** Every cook step in the corpus is authored `via: "craft"` and
`credit()` returns 0 without it. A test breaks the event and watches the reducer refuse it, because
this is exactly the kind of thing that would ship silently working-but-crediting-nothing.

**A region is derived from the area's town, and demanded when there is none.** `heath` and `fields`
belong to no town, and the catch and forage tables are keyed by reach. Guessing — from `zoneAt`,
say — would put Longacre wheat on the Blackstone heath, and the zone boundary wanders through the
heath, so it would be wrong intermittently. So `buildNodes` **refuses** a fish or forage node whose
area has no town unless the entry names its `region`. Rock seams and fires are exempt: a seam
yields whatever its rock is and a fire cooks whatever it is handed.

**The Hollow Ford fishes Longacre water.** It is inside `heath`, whose forage is Blackstone, so it
carries `"region": "longacre"` explicitly. A test pins it — it is the one place where the override
means something other than tidiness.

**A fishing spot is never used up.** Begin on the hold, straight back to `ready` on release, no
cooling. Patches and seams go `working → cooling` on the real `respawnDelay`, with rarity taken
from a three-line table (`chalk` common, `iron_glass` uncommon, `obsidian` rare) rather than
derived from `req`, because a derivation there would be me inventing a rule.

**The ready pip is opaque instanced geometry, not a particle.** SYSTEMS §6.1 asks for "2
particles/second from the existing glow cloud when ready". A 12 cm octahedron in the zone's own
`window.litColor` says the same thing, costs 8 triangles, and — unlike anything additive — costs
nothing in fill rate on a phone. It is the only visible state a node has, and it is worth having:
walking to a bush and finding nothing there with no way to tell in advance is the same defect as
damage landing where the player is shown nothing.

**One new material surface, `bush`.** The first forage patch was built on `wood` and read as a pile
of spoil; the first rock seam was built on `trim` and read as a brick igloo, because `projectUV`
lays the zone's masonry out at world scale and anything over about half a metre grows courses. The
seam was fixed with geometry (many small lumps). The patch needed a leaf colour, and there was none
in the shared vocabulary. `bush` is three lines beside `crest`, takes its colour from
`zones.foliage.bush` and touches no zone-specific code. `zones.js` is untouched.

**`ITEM_VALUE` now prices cooked food.** SYSTEMS §6.4 says a dish is worth 2.4× its raw and
`cookedValue()` computes it, but `sale.rows` lists only what `ITEM_VALUE` prices — so before this,
a cooked fish was wealth the player could not spend. Two generated lines, no number anyone chose.
Cooked food is deliberately **not** in `PERISHABLE`, which is what makes §6.4's "cooking resets
freshness permanently" true and makes it survive a gutter.

**A burn mints nothing.** §6.4 says a burnt item is worth 1 mk; that would need a `burnt_*` id that
the corpus, the linter and `ITEM_VALUE` know nothing about. A burn eats the raw, pays `BURNT_XP_MUL`
XP and says *"Silverling, burnt."* One mark of char is not worth an item id.

**Eating is a self target on the Hearth dial**, which also closes one of the two `self` gaps
`NOTES_PROPS.md` §6 listed: `neutral.05`'s `eat` step is `interact self` with `verb: hearth`, and
that is now exactly what pressing it emits. It heals `cookHeal` over three seconds and takes a
`buffSeconds` slot.

**The eat target yields to anything else in reach.** It sits on the player at zero distance, so
under plain nearest-wins it won every tie — including beating the fire you are standing at, so
dialling Hearth beside a hearth offered you a meal instead of the cooking. `pickContext` gives it a
`yields` flag and only falls back to it when nothing else is in range. The graft self target is
unchanged and still wins.

**The hand-over is a context action, not an automatic pickup.** A delivery whose `to` is an area is
handed over by standing in it, so the target sits on the player like the self target; a delivery to
a person or a prop sits on their body and **replaces** what they would otherwise offer, because
carrying Hana's loaves to Hana should not open her small talk. `via: 'sell'` deliveries are left
alone — the market already owns those and a second route would double-credit.

**`recipeLevel` is a second definition.** `burnChance` needs a recipe level and nothing in
`sim/` supplies one. I use the ingredient's own gate — a fish's `req`, a herb's tier gate.
`tools/soak.mjs:200` independently derives `itemTier(value) * 3 - 2`. **They disagree** (snowbarb:
9 here, 4 there). Mine has the better story and soak is documented as measuring a parallel universe
anyway, but this is a real second copy and soak should adopt the shared one. Not done here: soak
handles item ids that are not in the tables, and `recipeLevel` would silently answer 1 for them.

---

## 5. What is covered, and what is not

**All 24 ids the corpus gathers have a source, and a source inside every area a step scopes them
to.** Both are tests against the real packs, not a list.

| id | objs | from | level | producers |
|---|---|---|---|---|
| `silverling` `weed` `snowbarb` | 6 · 3 · 1 | fish, whitewall | 1 · 1 · 9 | 4 spots |
| `mudbream` `ford_eel` `goldenscale` | 2 · 3 · 1 | fish, longacre | 1 · 7 · **13** | 2 spots |
| `blackeel` `silt_carp` `foul_water` | 1 · 1 · 2 | fish, blackstone | 5 · 2 · 1 | 1 spot |
| `wheatglass` `tuber` `field_honey` | 2 · 1 · 1 | forage, longacre | 0 · 0 · **5** | 5 patches |
| `bitterroot` `gravecap` | 1 · 3 | forage, blackstone | 0 · **5** | 3 patches |
| `stone_chip` `iron_shard` `obsidian_core` | 2 · 1 · 3 | rock | 1 · 5 · 7 | 2 · 2 · 2 seams |
| the 7 `cooked_*` ids | 14 | hearth | its raw's | 3 fires |

**Obtainable is not the same as pleasant.** Three entries are a real grind and I did not change
them because they are the shipped balance:

- **`goldenscale` needs Line 13** for a single `sandbox.03` objective, and it is weight 3 of ~100.
- **`weed` is junk**, and junk weight falls with Line level: 6.65 of ~97 at Line 1, less later.
  `light.08` wants three of it in each of three different stands.
- **`foul_water`** is weight 5 of ~90 in the Blackstone table, and two steps want three each.

**Not covered, explicitly:**

- **Nothing in the world produces the four rare/uncommon table entries the corpus never asks for**
  — `chalk_trout`, `riverlight`, `carp`, `reed_tangle`, `sunken_relic`, `drowned_coin`, `gravebarb`,
  `whitepetal`, `chalk_sage`, `dawnroot`, `ninefold`, `nightbloom` are all reachable from the
  placed nodes; they just have no objective. That is the tables being larger than the corpus, not a
  gap.
- **`bst.levels`' four nodes are on the surface, above the keep**, at y ≈ 46 m. There is no
  subterranean support in the engine (`REMAINING.md` §7). They are inside the right circle at the
  right ground height, which is the most that can be true today. All of `dark.07`, `dark.19`,
  `dark.22` and `neutral.13` therefore work, on a hilltop.
- **The two power dish families do nothing.** `focus` (+25% Focus regen) and `hp` (+12% max HP) are
  live, because both are a limit. Whitewall herb's **Ward power +15%** and Blackstone herb's
  **Kindle power +15% / −5% max HP** are tracked, shown on the HUD and applied to nothing:
  both would need a multiplier threaded into `power()` and `damageTaken()`, and inventing where
  exactly is a design decision I was not asked for. `session.buffed()` says so in a comment.
- **`buffSlots` is honoured but there is no buff UI beyond the pip count.** You cannot see which
  buff you have, only that you have one.

---

## 6. The `deliver` chain

Closed, and it was small once nodes existed. **All 24 `deliver` objectives now have a route.**

| route | objs | how |
|---|---|---|
| `via: sell` to `wick_ww` / `ossa` | 8 | the market, unchanged |
| to an area — `bst.barracks` `bst.levels` `lac.barn` `lac.millbridge` `lac.westfield` `reach.east` `wwa.board` `wwa.kitchen` `wwa.market` | 14 | stand in it, press GIVE |
| to a person — `hana` `marrin` | 2 | stand at them, press GIVE |

`handovers()` offers a hand-over only when the step is the live one, the player is inside the
step's own `in`, and the bag actually holds some. It hands over `min(what is left, what you carry)`,
so a partial delivery is allowed and the tracker counts up. Both shapes are proved live — the area
route in §8, the person route separately at Marrin (context becomes GIVE while carrying, `sandbox.02`
completes, and TALK comes back afterwards).

---

## 7. Cost

`node tools/shot.mjs --all --preset=medium --dpr=1 --w=844 --h=390`, main pass. **The "before"
column was measured, not quoted**: `data/gather.json` was moved aside and the sweep re-run, which is
the only difference between the columns. It reproduces `NOTES_PROPS.md`'s post-review numbers to the
call, which is what makes the deltas trustworthy.

| scenario | before | after | delta |
|---|---|---|---|
| `wall_day` | 70 / 150k | **79 / 154k** | +9 / +4k |
| `street_dusk` | 60 / 108k | **66 / 110k** | +6 / +2k |
| `gate_night` | 43 / 100k | **48 / 102k** | +5 / +2k |
| `town_night` | 72 / 117k | **80 / 120k** | +8 / +3k |
| `creek_day` | 73 / 93k | **82 / 96k** | +9 / +3k |

**Worst case on the gate profile is 154k of 350k.** In a live session standing at the fish steps
under mobile emulation: 60–95 calls / 57–64k triangles depending on heading.

| | |
|---|---|
| 26 nodes | **5,320 triangles**, 6 merged meshes |
| 26 ready pips | 208 triangles, 3 instanced draws, opaque, no alpha |

No new textures, so nothing new goes through `budget.js` `track()` — the one new material, `bush`,
is a flat colour with no map. One new knob, group **World**: `nodePip` (pip scale, 0 turns them
off).

The extra draw calls are constant across all five scenarios for the same reason the props wave's
were: the merged per-zone meshes have valley-sized bounding spheres, so the light batch is in
frustum almost everywhere. Batching per area cluster would cull better at the cost of more meshes.
At 5.3k triangles it is still not worth it; if A8 pushes the gate, the props note already flags this
as the first thing to change and it now applies to twice as much geometry.

---

## 8. How it was checked

`node --test` — **430 pass, 0 fail** (404 before). `node tools/lintQuests.mjs` — 0 errors, 1
warning, pre-existing. `node tools/lintText.mjs` — clean.

### Every new test was reverted against

For each one I broke the thing it defends, ran the suite, and confirmed it goes red, then restored.
All twenty-five went red.

| test | reverted by | red |
|---|---|---|
| every node is placed and built | deleting `heath.stones.patch` | ✓ (caught by the by-id test) |
| something produces every gathered id | deleting **all three** Blackstone forage patches | ✓ |
| — again | deleting **both** obsidian seams | ✓ |
| — again | deleting **all three** hearth fires | ✓ (5 tests red) |
| a node stands inside every scoped area | re-anchoring `stand.chalk.spot` to `stand.low` | ✓ |
| every hearth area has a fire | deleting `wwa.kitchen.fire` | ✓ |
| a townless area needs a region | making `regionOf` default to `whitewall` | ✓ |
| the ford fishes Longacre water | flipping its override to `blackstone` | ✓ |
| only a release in the window lands | deleting the `phase !== 'bite'` guard in `strike` | ✓ |
| a no-bite cast casts again | ending the run instead of recasting | ✓ |
| the second fish needs Line 7 | dropping the `hasMilestone` guard | ✓ |
| a picked patch cools and comes back | making `finish` return `ready` | ✓ |
| a seam yields its own rock | making `harvest` always read `ROCK.chalk` | ✓ |
| the live step picks the dish | making `cookChoice` ignore `wants` | ✓ |
| a burn mints nothing | returning the cooked item on a burn | ✓ |
| a dish has a family | making `dishBuff` always answer `focus` | ✓ |
| a gather event names the node's area | dropping `area`/`areas` from `gatherEvent` | ✓ |
| the reducer refuses a cook without craft | dropping `via` from `cookEvent` | ✓ (3 tests red, incl. the end-to-end) |
| the hand-over is scoped | dropping the `s.in` and `here` checks | ✓ |
| `main.js` hands over the nodes | removing `nodes.targets()` from `targets()` | ✓ |
| session emits through the builders | inlining a hand-written gather event | ✓ |
| a cooked fish can be priced | removing the generated `cooked_*` prices | ✓ |
| a fish spot is on the bank | moving `stand.low.spot` into the channel | ✓ |
| the eat target yields | removing the `yields` branch from `pickContext` | ✓ |
| cooked is the raw id prefixed | making `cookedOf` return `dish_*` | ✓ (3 tests red) |
| nothing above the level cap | — asserts a property of the corpus; changes only if the packs do | n/a |
| the region map is the three towns | — asserts the shape of a constant | n/a |

### Then the real thing, over raw CDP

`?quest=light.26`, real slate click, real HUD pointer events, no test doubles in the path. **Five
runs — desktop profile and mobile emulation (iPhone UA, touch, 844 × 390) — identical in every row
below except the burn count, which is a 40% roll.** One sixth run stopped at the final turn-in
conversation with the delivery already credited and the step already at 4; that is my driver's
dialogue-advance loop timing out, not the game, and I did not chase it.

| | Checked | Result |
|---|---|---|
| 1 | boot | **26 nodes, 5,320 tris, 48 props**, no console output |
| 2 | the brief | context `kesta` / talk → dialogue → step 0 → **1** |
| 3 | at the fish steps | context `wwa.fishsteps.spot`, kind `work`, **button reads LINE** |
| 4 | six holds | 6 bites, **6 silverling**, Line XP 0 → **420**, step 1 → **2** |
| 5 | holding past the window | **+0 fish** — the strike window is real |
| 6 | at the fire | context `wwa.kitchen.fire`, kind `cook` |
| 7 | cooking six | **3–4 cooked, 3–2 burnt** at Hearth 1 (the shipped 40% burn), Hearth XP ~**200**, step 2 → **3** |
| 8 | in `reach.east` | context `reach.east`, kind **`give`** |
| 9 | the hand-over | step 3 → **4**, bag emptied of the three meals |
| 10 | the turn-in | `light.26` **done**, `unlocked.light.21` true |
| 11 | at the fire with Hearth dialled and food in the bag | context is the **fire**, not the meal |
| 12 | away from it | context `self` / **eat** → hp 12 → **66**, one `focus` buff, **1 HUD pip** |
| 13 | at a forage patch | context `downs.pasture.patch` / gather → **whitepetal ×1**, state `cooling`, label **spent**, pips 26 → **25** |
| 14 | after the respawn delay | state back to **ready** |
| 15 | a person delivery (`sandbox.02`) | context `marrin` / **give** → quest completes → **TALK comes back** |
| 16 | `session.gaps` | `[]` |

Machine sweep over the 26 nodes against the live world: **0** within 4 m of another target (prop,
NPC or node), **0** inside a collider box, **0** with |base − `groundAt`| over 0.2 m, **0** with no
standable point inside their own 3.6 m context range. Both non-play boot paths clean:
`?shot=creek_day` and `?editor=1` build all 26 nodes and 26 pips, construct no session, and print
nothing.

### Looked at, not just measured

Read the PNGs at 844 × 390: the fish steps at 6 m and 9 m in daylight, a Whitewall forage patch and
a chalk seam at 7 m, the Longacre hearth at 6 m, the Blackstone seams at night, and the full
`creek_day` frame. The fish spot reads as a rail, two steps, a creel and a rod out over the water
with the float at its tip. The patch reads as a broad-leaved clump. The seam reads as a knot of
pale chalk with three shards out of it. The fire reads as a stone ring with a spit and a flame in
the middle. At night the pips are the clearest thing in the frame, which is what they are for.

**Two of them were wrong the first time and the render is what said so** — the patch was a brown
mound and the seam was a brick igloo. Both are in §4.

---

## 9. What I could NOT verify

Stated plainly.

- **No real phone.** Desktop Chrome over CDP throughout, including the "mobile" run, which is device
  emulation. `matchMedia('(pointer: coarse)')` reports true under emulation, so the 0.9 s window is
  what was exercised — but **whether 0.9 s is actually hittable with a thumb is untested.** The
  driver reacts in ~50 ms. That is the single most important thing about this wave that I did not
  and could not check, and it is the number most likely to need re-tuning.
- **The `casts / bites` figures are not a bite-rate measurement.** The hold recasts by itself, so
  every hold ends in a bite; 6 holds gave 6 fish. I did not measure how long a hold takes in
  practice, and `secondsPerCatch` at Line 1 on a quality-1 spot is 7.0 s, which is a long time to
  keep a thumb down. Whether that reads as tense or as tedious is a playtest question.
- **I proved `light.26` and `sandbox.02`. I did not play the other 97 quests.** 48 objectives can
  now fire; that is not the same as 48 objectives being reachable, and most of the ids above sit
  behind quest chains with `escort` and people-rigged `kill` steps still dark.
- **`bst.kitchen.fire` and `lac.barn.fire` were never pressed in a live session** — only
  `wwa.kitchen.fire`. All three are placed, in the right areas, and covered by the same code path.
- **Nothing re-seats a node after `demo.rebuild()`.** Ground heights are read once at load, exactly
  as for props. The world knobs that trigger a rebuild change terrain resolution, so a node could
  end up a few centimetres off after dragging one. Not observed; not tested either.
- **Node state is not saved.** Everything comes back `ready` on load, and a patch you picked ten
  seconds before quitting is full again. `doc.atlas.nodes` exists in the save shape and is unused.
- **Nodes have no colliders**, like props. You walk through the rail and through the fire.
- **The 90 s chevron was not tested against a gather step**, same as the props wave.
- **`heath.ford.spot` has `quality: 2` and the other spots 0 or 1.** `spotQuality` is "fixed at
  world build" per §6.2 and there was no authored source for it, so those seven numbers are mine.
  They are the only balance-shaped numbers in `data/gather.json`.
- **Timings.** Headless renders here are software-rendered, so only calls and triangles are quoted
  and no fps appears anywhere above.

---

## 10. If you pick this up next

1. **The Ward and Kindle dish buffs** — §5's last bullet. They need a decision about where the
   multiplier goes, not code.
2. **`tools/soak.mjs` should import `recipeLevel`** and lose its own — §4's last decision.
3. **Escort actors.** `lac.henhouse.hen` and `wagon` are still the only two things in the corpus
   with no body at all. That and a people-rigged enemy spawn are what is left of the eight verbs.
4. **Saving node state**, if a picked patch coming back across a reload ever matters.
5. **A8 will move things.** The offsets are area-relative so most of it follows for free, but the
   seven fishing spots were placed by sweeping each stand for a point 1–9 m out from the channel on
   the flattest ground, and if A8 changes the banks that sweep should be re-run. The probe is three
   lines of `field.js` and the test that guards it is `every fishing spot stands on the bank`.

---

# 11. Review pass — the seven fixes from `REVIEW_GATHER.md`

Written by whoever picked the review up, appended rather than merged into the text above: §1–§10
is the builder's account of the wave and it still reads correctly except where a number below
says otherwise.

**Suite 430 → 448, 0 failing.** `lintQuests` 0 errors and the same one pre-existing `light.06`
warning; `lintText` clean. The gate is unmoved: `wall_day` **79 calls / 154,176 triangles** and
`creek_day` **82 / 96,420**, main pass, at `--preset=medium --dpr=1 --w=844 --h=390`. Two
scenarios came down — `street_dusk` 66 → **64**, `town_night` 80 → **79** — and `gate_night` is
unchanged at 48 / 102k.

Every test added below was reverted against and is listed in §11.9 with what it went red on.

---

## 11.1 BLOCKER — the hold now ends on the kind that started it

`channel()` latches `this.holdKind` on `start` and dispatches `cancel` and `release` against that,
not against whatever `hud.context.kind` has become. Belt and braces beside it: a live `run`,
`cooking` or `working` is treated as a gather hold whatever either kind says, so `workStop()` is
reached from a cancel of any cause. `act()` still takes the *current* kind, because acting on the
button in front of you is what `act()` is for and it reads `this.context` for everything anyway.

**Reproduced first.** A real `Session` against the real packs, the real `data/gather.json` and the
real reducer, with the fix reverted — the fire cooking with nothing held, exactly as the review
described:

```
cooking after release: {"id":"wwa.kitchen.fire","t":0}
  t= 0s raw 40  hp 52  focus 70  cooking true
  t=30s raw 22  hp 52  focus 67  cooking true
  t=60s raw  3  hp 52  focus 62  cooking true
mudbream 40 → 0, cooked_mudbream 27, thumb off the screen for seventy seconds
```

With the fix, the same harness leaves the bag at 40 and `cooking` null. `js/game/gatherhold.test.js`
is that harness, kept: it is the first test in the project that constructs a real `Session` and
drives `channel()`, which is the structural hole the last three reviews all named.

**One route no cancel covers, found while fixing this and closed too.** Two fishing spots offer the
same kind *and* the same label, so `hud.setContext` returns early and fires nothing at all when you
walk from one to the other — the hold stays on the first spot with no cancel anywhere. `gatherTick`
now drops a hold whose node is more than `HOLD_RANGE` (5 m — the node's 3.6 m reach plus slack) away.
That also covers `holdAssist`, where walking around while "holding" is the intended usage.

**Live, real browser, mobile emulation at 844 × 390, real `Input.dispatchTouchEvent`:**

```
at the steps  {"ctx":"wwa.fishsteps.spot","kind":"work","label":"LINE","run":null,"node":"ready"}
casting       {"label":"LINE","run":{"phase":"cast","casts":0},"node":"working","held":true}
walked away   {"ctx":null,"label":"","run":null,"node":"ready","held":false}
2 s later     {"run":null,"node":"ready"}
at the fire   {"ctx":"wwa.kitchen.fire","kind":"cook","label":"COOK"}
cooking       {"cooking":true,"raw":6}
after walking {"cooking":false,"raw":6}
console       []
```

## 11.2 The area hand-over yields

`yields: !h.body` on the target `giveTargets` builds — the body variant keeps winning its tie,
because replacing Hana's small talk with Hana's delivery is the point. The comment above it that
said the area target "sits on the player like the self target does" now says it also behaves like
one.

Proved on a real `Session`: `sandbox.04` at its serve step with three `cooked_mudbream` in the bag,
standing on `wwa.kitchen.fire` — the context is the **fire**, and with the fire taken out of
`world.targets()` it is the **hand-over**, so the flag defers the target rather than suppressing it.

## 11.3 A node mid-cast no longer says SPENT

`nodeLabel` returns `spent` for `cooling` and for nothing else. `working` is a spot with the line
already out. Live above: the button reads **LINE** for the whole cast.

## 11.4 `js/world/nodes.js` split, and a check so it does not happen a fourth time

**`js/world/nodestate.js`** is the new node-reachable half — `NODE_RANGE`, `nodeUi`, `nodeLabel`,
`pipped`, `nodeItem` (which is also where the unknown-kind guard moved) and `targetList`. `nodes.js`
imports it and draws; its file-top comment no longer claims it holds no rules, and `js/main.js:76`
no longer repeats the claim. `js/world/nodestate.test.js` drives the real `data/gather.json` through
`nodeItem` → `targetList` → the real `pickContext`.

**The recurrence check is `js/world/split.test.js`**, and it is deliberately narrow. It builds the
import graph under `js/`, marks every file that reaches `three` directly or transitively, and fails
if any `js/world/*.js` in that set contains an object literal carrying `range:` together with `x:`
and `z:` — a **context target**, the thing `pickContext` reads, which is what all three waves
authored on the three side. Beside it, two source assertions that `props.js` and `nodes.js` still
delegate, including `targets() { return this.list; }`, because `targets() { return []; }` was the
review's second mutilation and it left the suite green.

**Why not a broader rule.** I measured two: "no string-literal conditional in a three-side world
module" fires on eleven legitimate lines across `buildings.js`, `doors.js`, `interior.js`,
`materials.js` and `vermin.js` (roof profiles, door state, material choice, which rat a nest
gets), and "no literal `range:`" fires on `spell.js`'s bolt config. Both would be deleted rather than obeyed. The rule as written has **zero**
hits on the current tree and correctly leaves `cast.js`, `field.js`, `zones.js`, `propstate.js`,
`roster.js` and `nodestate.js` alone — they import no `three` and a node test can already reach them.
**It only catches this one shape.** A three-side module that grows a different kind of rule will
still get through; what stops that is the split being cheap and obvious, not this test.

**Found while proving it.** `pickContext` read `t.range || 4`, so the review's `range: 0` mutilation
silently meant *four metres*, not zero — the test I wrote for it stayed green until I changed that to
`?? 4`. Anything authored with a deliberate range of 0 was getting 4 m.

## 11.5 Late is now late

`tickRun` marks the run `missed` when the window closes with the thumb still down, and clears it on
the next bite or recast; `strike` answers `why: 'late'` off it. `session.js` carries a three-line
`MISS` map — *"Too soon — the line comes back empty."*, *"Too late — the line has gone slack."*,
*"Gone."* — and the last is still only for `rollCatch` answering nothing.

The moment of loss itself still says nothing (`gatherTick`'s `'lost'` branch plays `uiBlip` and no
line). Left alone: it is a design call about how chatty a miss should be, and the release now
explains itself.

## 11.6 What goes over the fire

The rule I chose: **the dearest raw in the bag with no worse than an even chance of surviving; only
if the bag holds nothing that safe, the one least likely to burn.** A live cook step still overrides
both — if the quest asks for the goldenscale cooked, the player has consented to the risk.

`cookChoice` takes the hearth level now and reads `burnChance` directly, so the rule tracks the
shipped curve rather than a second copy of it. At Hearth 1 that admits recipe level ≤ 2 and no more;
at Hearth 20 it admits everything, and the goldenscale is chosen again.

`burnChance` itself is untouched and still unclamped above 1. Clamping it is a change to the shipped
balance in `js/sim/gather.js` and it is not needed to fix the defect: the fallback no longer walks
into it, and the only way to reach a >1 burn now is to ask for it.

## 11.7 The three art problems

**The hearths are on fire.** Six tongues over the logs — three outer in the zone's `window.litColor`
carried 72% toward ember, three inner and taller carried 66% toward yellow. They are drawn as
**instances of the same octahedron the ready pips use**, in one shared `MeshBasicMaterial`, opaque
and unlit: no alpha anywhere near the camera, which is the thing the gate cannot afford. Colour
rides on `instanceColor`, which is what lets three zone tints and three fires share one mesh.

A hearth no longer wears a ready pip — it has a flame, and a fire is never used up, so a pip over it
was a second tell for a state that never changes. **23 pips + 18 tongues = 41 instances in one draw
call**, against three instanced pip draws before.

**The Whitewall spit is wood.** Three 5 cm `trim` members took the zone's masonry at world scale and
came out of Whitewall as barber poles, which is the same `projectUV` problem the seam was redesigned
to escape. `trim` is triplanar from world position, so no UV trick reaches it; a wooden spit frame
over a cooking fire costs nothing because the `wood` batch already exists in all three zones.

**A seam is its own rock.** Three flat surfaces in `materials.js` — `rock:chalk` bone, `rock:iron_glass`
rusty and slightly metallic, `rock:obsidian` near-black and glossy — and each seam gets its own small
mesh rather than joining the valley-wide zone batch, so it can carry a material the zone did not
choose and so its bounding sphere is seam-sized. The kit itself is lower and wider now, with three
tilted bedding slabs: it read as a cairn because it was a tidy cone of stacked stones.

**Renders read, not measured** (`shots/kit/`, 844 × 390, cameras by hand at 3–4 m, gameplay distance):
`fire_wwa`, `fire_lac`, `fire_bst` — all three read as a fire with a yellow core, and at night in
Blackstone the flame is the brightest thing in the frame. `seam_chalk_wwa` and `seam_chalk_lac` are
now plainly the same rock in both towns, broken out of the turf rather than stacked on it.
`seam_iron` is rusty-brown with a glassy face, `seam_obsidian_day` blue-black with a sky reflection;
the three are told apart at a glance, which is what `dark.19`, `dark.22` and `neutral.13` need.
The first night render of the obsidian seam was too dark to judge anything and I re-shot it in
daylight rather than pretend otherwise.

**Cost.** 26 nodes are **5,504 triangles** — 5,176 of kit and 328 of emissive instances, against
5,320 + 208 before. Node draw calls went from 9 zone meshes + 3 pip meshes to 9 zone meshes + 6 seam
meshes + 1 glint mesh, and the seam meshes cull: `wall_day` draws two of them and lands on exactly
the 79 it started from. I tried batching every kit per area instead of per zone to cull harder and
it was **worse** — 95 calls on `wall_day` — because most of the valley is in frustum from these
cameras. That is measured, and it kills the "batch per area cluster" idea §7 has been carrying.

## 11.8 Comments corrected

`nodes.js`'s "holds no rules" header, `js/main.js:76`'s repeat of it, `js/game/placement.js:62`'s
"Three results" (four), `js/game/context.js`'s claim that `pickContext` and `acquire` share a cost
function (they do not — `acquire` also pays for the angle), and `session.js:797`'s "sits on the
player like the self target does". Left alone deliberately: `session.js`'s banner comments, which
the file already had eight of, and `gathering.js`'s file-top block, which the review called good
prose.

## 11.9 Every test added, and what it went red on

Each was reverted and the suite re-run. All thirteen went red.

| test | reverted by | red |
|---|---|---|
| every placed node can be walked up to | `NODE_RANGE` 3.6 → 0 — the review's own mutilation | ✓ 1 |
| a fire fires the cook verb | `nodeUi` always `'work'` | ✓ 1 |
| only a picked node says spent | `nodeLabel` back to `state === 'ready' ? label : 'spent'` | ✓ 1 |
| a fire wears no ready pip | `pipped` always true | ✓ 1 |
| an unknown kind is refused | deleting the `KIND` guard in `nodeItem` | ✓ 1 |
| a node is found by id | `findNode` answering with the first item | ✓ 1 |
| no three-side context target | inlining the target literal back into `nodes.js` | ✓ 2 |
| — same test | `targets() { return []; }` | ✓ 1 |
| the cook hold stops on another context | dispatching on the kind at release | ✓ 3 |
| the fishing hold stops on `cancel, null` | — same | ✓ |
| the orphaned run does not keep fishing | — same | ✓ |
| a normal release still lands the fish | making every release `workStop()` and work nothing | ✓ 2 |
| a hold does not follow you to the next node | removing the `strayed()` check | ✓ 1 |
| holding past the window says late | `why: 'early'` for every non-bite release | ✓ 2 |
| the area hand-over yields | dropping `yields: !h.body` | ✓ 1 |
| early and late are told apart | — same as above | ✓ |
| the fallback does not burn the goldenscale | `cookChoice` back to the dearest raw | ✓ 2 |

One existing test changed rather than added: *"what goes over the fire is what the live step is
waiting for"* asserted the old fallback picking the snowbarb. It now asserts the new rule in both
directions — Hearth 1 leaves it, Hearth 20 takes it, and a step asking for it overrides either way —
and it still proves the `wants` branch it was written for.

## 11.10 What I did not fix, and what I could not verify

Not fixed, deliberately:

- **Review 7, one hand-over per target.** `session.js:809` dedupes by `to` alone, so two live
  deliveries to `lac.barn` show one button in quest-acceptance order. Self-resolving and out of the
  brief; it wants a design answer about how the button offers a choice, not a patch.
- **Review 8, node state is not saved.** Unchanged: an F5 refills every patch and seam.
- **Review 9, `recipeLevel` disagrees with `tools/soak.mjs` and there is a third copy for forage.**
  Unchanged. `cookChoice` now reads the same `recipeLevel` the cook does, so nothing new diverged.
- **Review's suggestion 6, moving the charge ring onto `.g-act`.** Not done. It is a HUD-layout
  change with its own review surface, and defects 3 and 5 — the two the review said to fix first —
  are done.
- **`burnChance` is still unclamped above 1.** §11.6.

Could not verify:

- **No real phone.** Everything live above is desktop Chrome under device emulation. **Whether
  0.9 s is hittable with a thumb is still untested and I am not claiming otherwise.** The review's
  own measurement of the window stands as it was written — 0.9 s real, 867 ms lands, 951 ms does
  not — and I did not re-measure it; nothing I changed touches `STRIKE_WINDOW`, `tickRun`'s timing
  or the release path's synchrony.
- **The flame is static.** No flicker and no separate lit-while-cooking state, so a fire you are
  using still looks like a fire you are not. A flicker needs a per-frame hook `Nodes` does not have,
  and a cooking state needs a node state the pure layer does not model. The review asked for both;
  I did the flame and left the tell.
- **`nodePip = 0` no longer hides a mesh.** It scales the pip instances to zero, which looks the
  same; the flame is not a pip and the knob deliberately does not reach it. If anything asserted
  `visible: false` on a pip mesh, it is asserting something that no longer exists.
- **The other 97 quests.** I drove `sandbox.04`'s shape and `light.02`'s. I did not replay
  `light.26` end to end; the builder's test still pins it and it is green.
- **`lac.barn.fire` and `bst.kitchen.fire` were rendered but never pressed live**, same as the
  builder's note. Only `wwa.kitchen.fire` was cooked at over CDP.
- **I did not re-run the review's twenty-render sweep.** Seven kit frames and the five scenarios.
- **Timings.** Headless renders here are software-rendered; only calls and triangles are quoted.

# Humanoid enemies, the Watch, and escort

Two gaps closed. **Six `geo: 'people'` bestiary rows now have bodies and the spawner places them**,
and **`world.watch()` returns real watchers in the running game** — which is what turns the
Watch-detection half of the Graft on for the first time. **Escort is live**: four actors, nine
objectives, and `recover: arm lac.henhouse.hen` stops being a broken promise.

All eight primitives now fire. In a real browser, over raw CDP, no test doubles in the path:

- **Eight Watchmen stand on Millbridge, the game sees them, and wearing a borrowed face in front of
  them runs suspicion 0 → 100 and Breaks the Graft** — Standing −25, the free twenty-second face
  handed back, thirty metres of the bridge turned hostile. §7.
- **Three raiders killed at the east water stands** through the real `strike()`, then
  `survive reach.east 60` **completes** — the first time either has happened. §7.
- **The hen walked home from the cotts completes `sandbox.12`; the wagon walked onto the Drove Road
  credits `light.11`'s escort half.** §7.

Tests: **448 before, 480 after, 0 failing.** `lintQuests` 0 errors and the same one pre-existing
`light.06` warning; `lintText` clean. **The gate profile is unchanged to the call** — §6.

---

## 1. What was built, file by file

| File | | |
|---|---|---|
| `js/world/figure.js` | **new** | `ROBE`, `HOOD`, `APEX`, `FIGURE`, `SEG`/`HSEG`/`SHOULDER`, lifted out of `people.js`. Pure numbers, no `three`, so the enemy proportions can be checked in node. |
| `js/world/foeshape.js` | **new** | `FOES` — which bestiary rows the robed rig can body and what proportions each is — plus `shapeOf`, `lampAt` and `silhouette`. Pure. **This is the split**: "the spawner cannot place a Watchman" was invisible from every side except this one. |
| `js/world/foeshape.test.js` | **new** | 7 tests against the real `ENEMIES` and the real profile. |
| `js/world/robed.js` | **new** | The rig. Six variants of the crowd's own hooded robe, instanced per variant, `add`/`remove` exactly as `vermin.js` has them, plus the Watch's lamp. |
| `js/game/escort.js` | **new** | The escort rules: `escortActors`, `escortWants`, `stepEscort`, `escortEvent`, `escortActorOf`. No `three`, no DOM, no `Math.random`. |
| `js/game/escort.test.js` | **new** | 13 tests. The seam: corpus → actor → walk → real reducer. |
| `js/world/escorts.js` | **new** | The bodies: Fen on the crowd rig, a hen on the fowl rig, and a cart of its own. Show, hide, move, park, arm. |
| `js/game/enemies.test.js` | **new** | 12 tests. Spawner → rig → `watch()` → a really-constructed `Session` → the Graft Break. |
| `js/game/fakedom.js` | **new** | The DOM bag three test files were each carrying a copy of. Now one. |
| `data/escorts.json` | **new** | Three entries — hen, wagon, cart. Same anchor-plus-fraction scheme as `props.json`. |
| `js/world/people.js` | edited | `robe()`, `hood()` and the two materials take a shape and a tint; the ring tables moved to `figure.js`; `Build`, `tube`, `cavityTone`, `eyeTones`, `robeColor`, `aoDisc` exported. **No number changed** and the crowd renders identically — §6. |
| `js/world/roster.js` | edited | `penned()`, the fowl rig's draw list, beside `roster()` and `crowd()`. |
| `js/world/chicken.js` | edited | `add`/`remove`, and `assign` delegates to `penned`. A pinned bird is steered from outside and does not wander. |
| `js/world/cast.js` | edited | `watch()` — the named half of the Watch. |
| `js/game/spawner.js` | edited | `rigFor(rigs)`: one rig per `geo`. |
| `js/game/session.js` | edited | `escortTick`. |
| `js/game/placement.js` | edited | `escorts.json` as a fifth independently-settled file. |
| `js/main.js` | edited | `robed`, `escorts`, `rigFor`, `watch()` merged with the cast, `freeze` reaching both rigs, and a waterline test in `blocked` — §5. |
| `data/cast.json` | edited | `hen`, `wagon`, `cart` have display names. `REMAINING.md` listed the first two as the last absent cast members. |

### The flow, end to end

```
data/quests/*.json   kill watchman ×10 in lac.millbridge
   → planFrom()      the plan, capped at PER_AREA = 8
   → Spawner.place() rigFor({ rat: vermin, …, people: robed }).add()
   → Robed.add()     FOES[enemy] or null · roster.seatsLeft or null · pinned from birth
   → foes.arm()      hp, armour, bite, CHARGES → hostile
   → Robed.update()  foes.js sets heading and speed; this carries the body and reads the act clock

spawner.watch()  live foes whose id is in WATCHERS      ─┐
cast.watch()     named cast priced by WATCH_WEIGHT      ─┴→ world.watch()
   → session.watch()   {n, hold, weight, seen} by distance
   → graftBlocked()    'seen' — you cannot put a face on in front of them
   → tickGraft()       suspicion → tick40/70/90 → break → onBreak()
```

```
escortActors(defs, quests)   a quest in progress → its actor has a body standing at home
escortWants(defs, quests)    the open step's escort → the actor follows
   → stepEscort()            wait → follow → (lost) → done, judged on the ACTOR's position
   → quests.emit(escortEvent(state))
```

Nothing in `js/sim/*` was changed. `ENEMIES`, `WATCH_WEIGHT`, `SUSPICION`, `GRAFT`, `CHARGES`,
`AI` and `graftBlocked`/`tickGraft`/`breakGraft` are used exactly as written.

---

## 2. The six variants, and how each render reads

Every one of these is the crowd's own fold-prism robe and hood with a stretched copy of the ring
tables and a tint derived from `zones.js`. `js/world/zones.js` is **untouched** — §8.

Renders are `?dev=1` scenarios (`foe_line`, `foe_<id>`, `foe_<id>_night`) at 844 × 390 with the
ambient crowd turned off, plus live session frames. Judgements are mine, from looking at the PNGs.

| id | palette | shape | how it reads |
|---|---|---|---|
| **`watchman`** | dark's robe lifted 62% toward dark's own `stone.base` | 2.04 m, upright, mantle ×1.20, narrow hem | **The best of the six.** Tall and formal, and the broad mantle gives it a shoulder line nothing else in the game has. The lamp is what carries it: at 25 m in daylight the figure is a grey smudge and the lamp is unmistakable. At night it is a red pair of eyes under a burning lantern. |
| **`raider`** | dark's robe × 0.86 | human scale, hem ×1.16, cut-down | Reads as a hooded caster with a thin black staff and red eyes — the "robed casters with black staffs" STORY §L18 asks for. The bound collar on the shaft is barely visible at play distance; the staff silhouette is what does the work. Honest weakness: at 15 m it is a dark blob, and the only thing separating it from a Hollow is its height. |
| **`hollow`** | dark's robe × 0.42 | 1.05 m, hem ×1.34, hood ×1.32 | **Exactly Aaron's brief.** A squat black cloak-blob with a brim and two red eyes at knee height. Four of them scattered on the Blackstone ridge road read as a nest of something, not as scenery. The one risk is the gather review's cairn problem — at a distance and in shadow it can read as a rock — but the eyes fix it as soon as it faces you. |
| **`champion_1`** | light | 2.4 m, mantle ×1.30 | Whitewall's champion: white, tall, with a wide flat collar and a bulb staff. Reads as an outsized version of the Whitewall crowd, which is right and is also its weakness — a pale robe is what the friendly town wears. |
| **`champion_2`** | neutral | 2.5 m, low and broad, hem ×1.26 | Longacre's: warm grey-tan, wide, yellow-green eyes, a pitchfork (`zones.neutral.staff` is `'pitchfork'`, so that is its own answer). Told apart from `champion_1` by shape and eye colour rather than by value; in low sun the two are close. |
| **`champion_3`** | dark | 2.7 m, mantle ×1.22, spiked staff | Blackstone's, and the only one the corpus fields. Near-black, the biggest silhouette in the game, red eyes, wide black mantle. It reads as a boss. |

Per body: **raider 204 · hollow 170 · watchman 230 · champion_1 208 · champion_2 212 ·
champion_3 196 triangles.**

**The Watch's lamp is the one addition beyond a retint**, and it is deliberate. A Watchman is the
enemy the player has to *avoid* while disguised, and dark's robe is 10× darker than light's — in
Blackstone at night a Watchman in Blackstone grey is camouflage. Rather than invent a palette, it
carries a lit lantern in `zones.dark.window.litColor`, drawn with `props.js`'s exact recipe: a hard
core and five nested additive shells, both instanced, both off when no Watchman is alight. It is
the same value the town already burns in its windows, and "the night watch carries a light" needs
no story invented for it.

---

## 3. Turning the Watch on

`watch()` was implemented, tested with a hand-planted watchman, and returned `[]` in every real
configuration because nothing could place one. It now has **two** sources, and both were already
designed for — I only filled them in.

**The spawner's.** `WATCHERS = new Set(['watchman'])` already existed; the rig is what was missing.
`?quest=neutral.21` puts eight Watchmen and a champion on Millbridge and `world.watch()` answers
with ten entries (§7).

**The named cast's.** `session.watch()` has always merged `world.watch()` with anything in
`world.targets()` carrying `kind: 'watch'`, and `WATCH_WEIGHT` has always priced `kesta: 2.0` and
`alder: 0.6` — two named people, weighted, and nothing read them. `Cast.watch()` now returns them,
in the same shape the spawner uses, and `main.js` concatenates the two. That is what makes STORY's
*"Kesta must be the hardest person in the valley to stand next to in a borrowed face"* true, and it
is what gives the Neutral campaign's `worn: light` steps in Whitewall something to be caught by —
the three quests that field a Watchman are all late-game fights.

**It is deliberately not a `targets()` entry.** A watcher is a body that notices you, not one the
context button offers, and a `kind: 'watch'` target in the context list is one `pickContext`
tie-break away from being pressable. `Cast.targets()` is unchanged; a test asserts it stays that
way and that all three named bodies are still `talk` targets.

---

## 4. Escort

Four actors, nine objectives, and the two `REMAINING.md` called *"the last two ids in the corpus
with no body of any kind"*.

| actor | body | home | escorted by |
|---|---|---|---|
| `fen` | the crowd rig — **his existing `data/cast_at.json` body**, at Millbridge | where the cast file put him | `light.17` · `dark.15` · `sandbox.18` → `reach.neutral` |
| `hen` | `js/world/chicken.js`, one pinned bird | `lac.cotts` — *"under the cotts. It is always under the cotts."* | `light.12` · `dark.13` · `sandbox.12` → `lac.henhouse` |
| `wagon` | a cart of its own, `wood` + `crest`, 344 triangles in 2 meshes | `road.spur.light` | `light.11` · `neutral.11` → `road.drove` |
| `cart` | the same cart body | `heath`, 44 m short of the ford | `sandbox.13` → `heath.ford` |

**The rule.** Walk within 6 m and it starts following. It settles 3.4 m behind, and breaks into a
hurry past 12 m so a walking player never loses it. Past 30 m for six seconds it stops following
and says so; walk back inside 6 m and it picks the walk up again. It arrives when **the actor** is
inside the destination area and has been walked at least 12 m from where the escort began.

**A quest in progress puts the body in the world; the live step is what makes it follow.** The
wagon has to be standing at the spur while you are still on the *previous* step, which is a `goto`
to the spur. When the quest ends the actor is parked back home; between steps it just stands.

---

## 5. Decisions that could have gone the other way

**The enemy palette is fixed by who it is, not by the ground it stands on.** `vermin.js` does the
opposite — *"a rat picks up its town from the ground it spawns on"* — and for vermin that is right.
For the Watch it is not: the player has to recognise it in Longacre, on the Drove Road and in
Blackstone, and a Watchman that changes colour by region is a Watchman you have to learn three
times. Raiders are Blackstone's wherever they raid, for the same reason.

**One rig per `geo`, resolved from the bestiary.** `rigFor({ rat: vermin, crab: vermin, boar:
vermin, people: robed })`. A new row whose `geo` names a rig somebody handed over needs no wiring;
one that does not is refused here rather than drawn by nothing. `sour_crow` is still refused — §9.

**A lunge, a recoil and a fall are body attitude, not shader work.** `vermin.js` drives all three in
the vertex shader off `aInst`; the robe shader has no act system and adding one would have meant a
second cloth program. Instead `Robed.update` composes them into the instance matrix — pitch for the
lunge and the flinch, and a 1.44 rad topple about the hem for the death, which is a pivot at the
figure's own feet. The cloth shader's one spare channel carries the lunge, so the cloak flares back
as the body drives forward. Nothing in `people.js`'s shader changed.

**Robed bodies are pinned from birth.** `roster.pinned` reads `a.state`, and the spawner only calls
`foes.arm()` *after* `rig.add()` returns — so a newly placed body was not pinned during its own
first `assign()` and went undrawn for up to 1.5 s. `Robed.add` sets `state: STATE.idle` itself.
**`vermin.js` still has this lag** and I did not touch it; it is the same one line if it matters.

**A `geo: 'people'` enemy chases at a person's pace.** `run` per variant — 4.4 to 4.9 m/s against
`AI.chase` 0.85, so 3.7–4.2 m/s against a player at 5.0 walking and 8.5 sprinting.
`NOTES_COMBAT.md` §6 flagged *"You can outrun anything. Fine for vermin, wrong for a Watchman"*;
this is the answer, and it is a knob-free number in `FOES` rather than a change to `AI`.

**The spawner now refuses a point under the waterline.** The first Watchman placed at Millbridge
was standing in the creek. `main.js`'s `blocked` hook — which already tested the colliders — now
also tests `groundAt < waterY + 0.3`. It applies to every enemy, and the bridge deck reads above
water so a Watchman on the bridge is unaffected.

**Arrival is judged on the actor, and needs 12 m of walking.** Three of the four authored
destinations already contain the actor's start: `reach.neutral` is the whole Longacre bank and Fen
stands on it before the step begins. Judging on the actor alone would have made `light.17`'s
crossing complete the moment you walked up to him. `ESCORT.travel` is the smallest rule that makes
a region-sized `path` mean "carry it some way in" — and it is the one number in the escort rules I
invented rather than derived.

**Fen is not in `data/escorts.json`.** `cast_at.json` already stands him at Millbridge, and two
records of one position is how a quest-giver ends up teleporting when a quest starts. The escort
runtime asks the cast for him. The cost is that the escort actor list has two sources; a test walks
the corpus and asserts every escorted npc resolves through one of them.

**A quest that is over parks its actor.** Fen ends `light.17` at the far end of the crossing, which
is where he should be for the turn-in; when the quest goes `done` he walks back to Millbridge —
instantly, which is a teleport if you are looking at him. Deliberate over the alternative, which is
a quest-giver permanently 60 m from where `cast_at.json` says he is.

**The hen joins the flock only while a quest is walking it.** Standing one bird in the world at boot
cost the gate a draw call and 1,596 triangles — it pins a mesh seat, so the 24 birds the flock knob
then draws are a *different* 24 with a different bounding sphere, and a chicken mesh that had been
culled at `wall_day` came into frustum. Measured, not guessed: with `escorts.json` emptied the sweep
reproduced the baseline exactly. Creating the bird in `show()` puts it back to zero.

**`js/world/figure.js` and `js/world/foeshape.js` are the split.** `js/world/split.test.js` exists
because three waves in a row put a rule in a `three`-side module. "Which bestiary rows have a body"
is exactly that shape of rule, so `FOES` is on the node side and `robed.js` imports it. The
proportions came with it, which is why `shapeOf` and the mantle/silhouette invariants are testable
at all.

**`js/game/fakedom.js`.** Three test files each carried an identical 45-line DOM bag and I needed a
fourth. It is a source file only tests import; the alternative was a fourth copy.

---

## 6. Cost

`node tools/shot.mjs --all --preset=medium --dpr=1 --w=844 --h=390`, main pass. The "before" column
was measured on the tree as it stood before this wave, not quoted.

| scenario | before | after | delta |
|---|---|---|---|
| `wall_day` | 79 / 154,176 | **79 / 154,176** | — |
| `street_dusk` | 64 / 110k | **64 / 110k** | — |
| `gate_night` | 48 / 102k | **48 / 102k** | — |
| `town_night` | 79 / 120k | **79 / 120k** | — |
| `creek_day` | 82 / 96k | **82 / 96k** | — |

**The gate profile is unchanged.** Nothing this wave adds is in the world until a session arms it:
`Robed` holds no ambient population, the two cart bodies are built but `visible = false`, and the
hen is not created until a quest asks for it. The `?shot=` and `?editor=1` boots construct no
session, place no enemy and print nothing — checked on all three paths.

In a live session:

| | |
|---|---|
| One robed body | **170–230 triangles**, one instanced mesh per variant |
| Six abreast (`?dev=1`) | **1,220 triangles**, 9 draws — 6 variant meshes, 1 contact disc, 2 lamp |
| 8 Watchmen + 1 champion on Millbridge | **2,036 triangles**, 5 draws |
| Standing on Millbridge with all nine | **77 main calls / 121k triangles** |
| The bridge from 9 m with the Watch in frame | **49 / 65k** |
| One cart | 344 triangles, 2 meshes, hidden until its quest is in progress |
| The hen | 266 triangles, one seat in the existing flock mesh |

No new textures, so nothing new goes through `budget.js` `track()` — the lamp is a
`MeshBasicMaterial` with no map, and the cart is on the existing `wood` and `crest` surfaces.
One new knob, group **Combat**: `watchLamp` (0 puts the lamps out).

---

## 7. How it was checked

`node --test` — **480 pass, 0 fail** (448 before). `node tools/lintQuests.mjs` — 0 errors, 1
warning, pre-existing. `node tools/lintText.mjs` — clean.

### The Watch, live, over raw CDP

`?quest=neutral.21`, real slate click, 844 × 390, `--preset=medium --dpr=1`.

```
boot            {"ready":true,"game":true,"robed":true,"escorts":true,"boot":"gone"}
tracked         {"tracked":"neutral.21","step":0,"here":["lac","lac.square","lac.cross"]}
live foes       {"by":{"watchman":8,"champion_3":1},"total":9,"robedAgents":9,"drawn":9}
world.watch()   {"n":10,"first":{"id":"watch","kind":"watch","x":-28.95,"z":122.49,"weight":1}}
session.watch() {"n":6,"hold":2,"weight":1,"seen":true}
graft granted   true
blocked (on the bridge)  "seen"
blocked (70 m off)       null
graftInto(light)         {"ok":true,"worn":"light","susp":0,"left":210}
t+0    {"worn":"light","susp":3.6,"n":8,"standing":0}
t+10   {"worn":"light","susp":41.4,"n":8,"standing":0}
t+20   {"worn":"light","susp":77.6,"n":8,"standing":0}
t+27   {"worn":"dark","susp":3,"n":8,"standing":-25,"free":true}
after the break {"worn":"dark","free":true,"left":20,"standing":{"light":-25,…},"hostile":9}
console         []
```

Ten watchers is eight Watchmen plus Kesta and Alder — `session.watch()` then filters by distance,
which is why it reports six inside `SUSPICION.radius` and two more in the hold band. The Break is
§8.3 in full: −25 Standing with the town whose face you were wearing, the other face handed back
free for twenty seconds, and everything inside 30 m turned hostile.

The one thing I had to set by hand is the grant: `doc.quests['neutral.07'] = {s:'done'}`, which is
what a save part-way through the Neutral campaign looks like. Everything after that is the game.

### The raid, live

`?quest=light.18`, stepped past the `sour_crow` step (§9), at `reach.east`:

```
placed            {"by":{"raider":3},"step":3,"here":["march.west","reach.east","stand.east"]}
raiders done      {"killed":true,"left":0,"step":4,"c":"{\"fight\":[3]}"}
after the fight   {"step":4,"cull":540,"items":[{"id":"staff_shard","n":3}]}
hold 0            {"hold":[1.07]}
hold 40           {"hold":[44.58]}
survive done      {"step":5,"c":"{\"fight\":[3],\"hold\":[60]}"}
```

**That is the first time a `survive` objective has completed in this game.** `REMAINING.md` had it
as *"works in principle — untested, and needs enemies that can threaten"*.

### Escort, live

```
hen    at {-75, -40.54} · phase follow the whole way · sandbox.12 → cooling, c.drive [1]
wagon  at {-518.2, -207.68} · followed 79 m onto the Drove Road · light.11 c.walk [1, 0]
       (the second half of that step is `kill rat_knot ×4`, which is why it is [1, 0])
reset  quests.resetStep('sandbox.12') → session.gaps [] and the hen back at {-75, -40.54}
console []
```

The reset line is `recover: ["arm", "lac.henhouse.hen"]`, which until now landed in
`session.noHook` and told the player *"It will not go back the way it was."*

### Looked at, not just measured

Read every PNG. `shots/foes/`: `foe_line` (six abreast at 12 m), `foe_<id>` and `foe_<id>_night`
for all six at 4 m, `watch_close` and `watch_bridge` (the Watch on Millbridge in a live session),
`hollows_ridge` (four Hollows on the Blackstone ridge road), `raiders_east`, `escort_hen`,
`escort_wagon_start`, `cart_heath`. Judgements are in §2.

**Three things the render said and the numbers did not.** The Watch's lamp was hanging above its
own cage because `LAMP_AT` was hard-coded instead of derived from the variant's stretch; it is
`lampAt(v)` now with a test that keeps it inside the cage. The lamp at `props.js`'s original size
was invisible at 20 m in daylight, which is the whole point of it, so it is one size up. And
`Robed.update`'s frozen branch was clearing the lamp instances, so **opening a menu put every
Watchman's light out** — found by pausing to take a photograph.

---

## 8. `zones.js`

**Untouched, and no diff is needed.** Every colour is derived:

| | |
|---|---|
| `raider` | `dark.robe` × 0.86 |
| `hollow` | `dark.robe` × 0.42 |
| `watchman` | `dark.robe` lerped 62% toward `dark.stone.base` |
| the lamp | `dark.window.litColor` |
| the staffs | `dark.staffTip` / `light.staffTip` / `neutral.staff === 'pitchfork'` |
| hood cavity and eyes | `zone.hood.inner` and `zone.hood.eyes` per variant's own zone |
| the cart | the `wood` and `crest` surfaces, so it takes its zone's timber and ironwork |

**One additive diff you may want, and nothing is blocked on it.** If the Watch should have its own
authored coat rather than a derived one:

```js
// js/world/zones.js, under `dark`, beside `robe`
    // The Watch's coat. Derived today as robe lerped 62% toward stone.base; this pins it.
    watch: '#4a4a50',
```

`js/world/foeshape.js` would then read `zone('dark').watch` and drop the `stone: 0.62` term. Say
the word and it is two lines.

---

## 9. What I could NOT verify, and what is still missing

Stated plainly.

- **`sour_crow` is still unspawnable, and it blocks `light.18` in a straight playthrough.** It is
  `geo: 'chicken'` and it is the seventh unrigged row. `light.18`'s steps are crows → raiders →
  hold, so in a real run you cannot reach the raiders without it. `Chickens` now has `add`/`remove`
  (the hen needed them) so wiring `chicken: chickens` into `rigFor` is one line — but a hostile bird
  with no chase speed, no hurt pose and no death pose is a half-implementation, and this project's
  own notes say to leave those out rather than ship them inconsistently. **I stepped past it to
  test the raiders and I am not claiming `light.18` is playable.**
- **`champion_1` and `champion_2` are guesses.** Nothing in `STORY.md` or `SYSTEMS.md` says whose
  champion any of the three is. `champion_3` is Blackstone's because N21 fields it after ten
  Watchmen; the other two are unused by the corpus and their towns are mine. Overrule me freely —
  it is one field in `FOES`.
- **No real phone.** Everything is desktop Chrome over CDP at 844 × 390. Landscape only, no touch
  path exercised — nothing in this wave touches input.
- **The Watch's balance is untested by anyone playing it.** A Watchman bites for 33.7 against 70 HP
  and eight of them are on Millbridge, and `SUSPICION.radius` is 6 m — so the band in which a
  Watchman raises suspicion is also the band in which it is hitting you. That tension is inherent in
  the shipped numbers and I did not change them, but it means the "avoid it while disguised" loop
  has never been played against a *hostile* Watch. **STORY §2 says the Watch shadows you at a
  distance without attacking; `foes.js` `CHARGES` says it charges. Those disagree and I left the
  sim alone.**
- **The Graft loop I drove is one configuration.** Millbridge, eight Watchmen, glamour 1. I did not
  test Kesta or Alder as watchers in a live session — only in node, against `Cast.watch()` and the
  real weights. The named-watcher path through `main.js` is exercised live only as part of the ten
  entries `world.watch()` returned.
- **A Watchman's death was not photographed.** The topple is asserted in node only through the act
  clock; I watched `champion_3` and eight Watchmen die in a live fight by their counts, not with a
  camera on one. Same gap `NOTES_COMBAT.md` §6 recorded for the rat, and the same reason — the
  camera fights the player rig.
- **The escort has no pathfinding.** The actor walks the straight line to you through
  `walkStep`, so a wall between you and it will pin it against the wall until you lose it. The
  Drove Road and the hen's lane are open ground and both worked; a cart round a building has never
  been tried.
- **Escort state is not saved.** A reload puts every actor back at its home with the step still
  open, which is recoverable (walk back to it) but is a real gap, the same one node state has.
- **Nothing re-seats an escort body after `demo.rebuild()`**, same as props and nodes.
- **The wagon does not tilt to the slope** — yaw only. On the Drove Road that is invisible; on a
  bank it will not be.
- **`escortWants` offers one actor per npc**, so two live quests escorting the same hen would share
  one walk. Not reachable today (the three hen quests are mutually exclusive by prereq) and not
  guarded.
- **I did not play the other 97 quests.** Four are proved end to end or near it: `neutral.21`'s
  Watch, `light.18`'s raiders and hold, `sandbox.12`, `light.11`'s escort half.
- **Timings.** Headless renders are software-rendered, so only calls and triangles are quoted and no
  fps appears above.
- **`docs/REMAINING.md` is now stale** in its `escort`, `kill` and `survive` rows. I have not
  rewritten it — it is a measured document and re-measuring it is its own pass.

---

## 10. Every test added, and what it went red on

32 behaviours, each broken on its own and the suite re-run. **All 32 go red.** Restored and green
after every one.

### `js/world/foeshape.test.js`

| test | reverted by | red |
|---|---|---|
| every `geo: people` row has a body | renaming `watchman` out of `FOES` | ✓ 11 |
| — same | renaming `champion_2` out of `FOES` | ✓ 2 |
| every variant paints out of a zone that exists | `raider.zone = 'blackstone'` | ✓ 1 |
| the mantle stays wider than the shoulders | `hollow.wide` 1.46 → 2.10 | ✓ 1 |
| no two variants have the same silhouette | making `champion_3` a copy of `champion_1` | ✓ 1 |
| a Hollow is the blob, a Watchman is the tallest | `hollow.tall` 0.60 → 1.00 | ✓ 1 |
| the Watch lamp sits inside its own cage | `lampAt` + 0.12 → + 0.60 | ✓ 1 |
| the shared profile is only stretched | `shapeOf` doubling `cavity` | ✓ 1 |

### `js/game/enemies.test.js`

| test | reverted by | red |
|---|---|---|
| `rigFor` sends a row to the rig its `geo` names | `rigFor` always answering `rigs.rat` | ✓ 3 |
| the spawner places every `geo: people` row | — same, and the two `FOES` deletions above | ✓ |
| the corpus asks for four of them by name | `planFrom` skipping anything not `geo: 'rat'` | ✓ 5 |
| a mesh full of Watchmen refuses the ninth | `roster.seatsLeft` always answering `PER_MESH` | ✓ 3 |
| `world.watch()` answers with real Watchmen | `WATCHERS = new Set()` | ✓ 4 |
| — same | `planFrom` skipping non-quadrupeds | ✓ |
| a dead Watchman stops watching | dropping `isLive(f)` from `Spawner.watch` | ✓ 1 |
| the named cast carries the other half | `Cast.watch` reading weight 0 | ✓ 1 |
| `main.js` hands over a people rig | `rig: rigFor({…})` → `rig: vermin` | ✓ 1 |
| a Watchman on the bridge is seen | `session.watch()` dropping `world.watch()` | ✓ 2 |
| wearing a face runs suspicion to a Break | — same | ✓ |
| with nobody watching it runs its course | (the control: it is the `WATCHERS = new Set()` case above that must **not** break it, and does not) | n/a |
| a Watchman is a body that fights | `watchman.run` 4.9 → 0.4 | ✓ 1 |

### `js/game/escort.test.js`

| test | reverted by | red |
|---|---|---|
| every escort has an actor with a body | deleting `wagon` from `data/escorts.json` | ✓ 1 |
| every destination is one the actor is not in | re-anchoring the hen inside `lac.henhouse` | ✓ 3 |
| a body is placed once, inside its area | `cart.body` → `barrow` | ✓ 1 |
| an actor gets a body as soon as its quest is on | `escortActors` reading no steps | ✓ 1 |
| a finished quest takes its actor off the board | `escortActors` ignoring `rec.s` | ✓ 1 |
| an actor picked up follows and closes the gap | `stepEscort` never moving | ✓ 4 |
| an actor is lost after long enough out of reach | deleting the grace check | ✓ 2 |
| walking back picks the walk up again | making `lost` terminal | ✓ 2 |
| **an abandoned escort does not complete** | snapping the actor to the player | ✓ 2 |
| — same | deleting the grace check | ✓ |
| walking the hen home completes the step | `escortEvent` dropping `path` | ✓ 1 |
| a destination the actor stands in must be walked into | `ESCORT.travel` → 0 | ✓ 1 |
| every `arm` names a prop or an actor | `escortActorOf` returning the whole id | ✓ 1 |
| the session drives the escort through the rules | removing the `escortTick` call | ✓ 1 |
| — same | `inPath` judged on the player | ✓ 1 |
| — same | hand-rolling the escort event | ✓ 1 |

One revert I tried first and report because it *did not* go red: flattening the hem multiplier so
it applies at the chest ring as well as the hem. The mantle still clears the chest on all six
variants — the margin is 4% on the Hollow and 38% with its hood scale — so the test is honest but
the property has less headroom than it looks. Widening the Hollow to 2.10 is the revert that bites.

---

## 11. If you pick this up next

1. **`sour_crow`.** One line into `rigFor` plus a hostile pose on the fowl rig, and `light.18` is
   playable start to finish. It is the last unrigged row in the bestiary.
2. **Decide whether the Watch charges.** STORY and `foes.js` disagree, and the Neutral campaign's
   disguise mechanic reads completely differently either way.
3. **Whose champion is which** — one field each in `FOES`.
4. **Save escort state**, so a reload does not put the hen back under the cotts.
5. **Pull `vermin.js`'s `add()` into the same pinned-from-birth shape** as `Robed.add`. One line,
   and it removes a 1.5 s window where a freshly spawned rat is not drawn.
6. **The `watch: '#4a4a50'` diff in §8**, if the Watch should have an authored coat.

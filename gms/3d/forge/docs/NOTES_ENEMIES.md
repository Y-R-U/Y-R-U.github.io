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

---

# 12. The review's findings, fixed

Answering `docs/REVIEW_ENEMIES.md`. Tests **480 → 494, 0 failing**. `lintQuests` 0 errors and the
same one pre-existing `light.06` warning; `lintText` clean. The gate is unchanged to the pixel —
§12.9.

## 12.1 The honest playable-quest count, before and after

The number that matters, measured three ways with the *same* harness — `tools/campaign.test.mjs`'s
own `playThrough()`, differing only in which events it is allowed to manufacture:

| what the harness may manufacture | story quests finished |
|---|---|
| everything, as the shipped suite did | **79 / 79** |
| only kills a rig can body — the review's experiment, reproduced exactly | **18 / 79** |
| only events the running game can produce at all — every verb gated | **4 / 79** |
| …the same gate, after this pass | **79 / 79** |

**Before: 4. After: 79.** The review's 18 is right as far as it goes and I reproduced it to the
quest — `light.18` stuck on step 2, Light finishing 18 of 28, Dark and Neutral finishing none. It
stops at 18 rather than 4 because it gates only *"can a rig body this enemy"*. Gate the other half
of the same question — *"is this enemy planned anywhere at all"* — and the ladder dies at
**`light.05`, the second quest in the game**, which is why the honest floor is four.

**Two blockers, not one.**

1. **`sour_crow` had no rig.** As disclosed in §9 and as the review measured. Fixed in §12.2.
2. **Four `kill` objectives name no area, so the spawner plans them nowhere.**
   `js/game/spawner.js` `planFrom` reads `s.in || o.area` and skips a kill objective that has
   neither, so nothing of that kind is ever placed and the step waits for a body that cannot exist.
   All four are `all:` steps that pair a kill with a `survive` or an `escort`, where the author put
   the place on the *other* objective:

   | step | asks for | now scoped to |
   |---|---|---|
   | `light.05.watch` "Hold the north gate" | `mire_rat ×2` | `wwa.northgate` |
   | `light.11.walk` "Walk it up the Drove Road" | `rat_knot ×4` | `road.drove` |
   | `sandbox.13.walk` "Walk the cart…" | `rat_knot ×3` | `heath` |
   | `sandbox.14.hold` "Hold the north gate" | `mire_rat ×4` | `wwa.northgate` |

   One `"in"` field each, in `data/quests/*.json`. Each names the place the step's own text, its
   `recover: moveTo` and its sibling objective already name, so the kill is now both *planned* and
   *credited* there. §7's live run recorded `light.11`'s escort half crediting `c.walk [1, 0]` — the
   `0` is this bug, seen and not recognised.

**After: every objective in the corpus is one the runtime can produce an event for — 0 exceptions**,
and the ladder finishes 79/79 with every verb gated. The twenty sandbox jobs still read as "not
finished" in that harness because a repeatable board post credits into `cooling` rather than `done`;
that is true of the manufactured baseline too and is not a gap.

**Proved live, over CDP, in a real session** — `?quest=light.18`, stepped to the `crows` step,
standing in `reach.east`:

```
placed        {"by":{"sour_crow":4,"raider":3},"total":7,"fowlAgents":4,"drawn":4}
one crow      {"enemy":"sour_crow","zi":3,"scale":1.85,"hp":112,"state":"idle","run":3.9,"pin":true}
four kills    {"i":3,"step":"fight","c":"{\"crows\":[4]}"}
console       []
```

`light.18` crosses the step that ended the unlock ladder. `shots/enemies_fix/crow_chase.png` and
`crow_death.png` are that session.

## 12.2 The crow, and where "can this be bodied" now lives

**`js/world/bestiary.js` is new and pure.** It holds `CREATURES` (lifted out of `vermin.js`, which
imports three), the new `FOWL`, `RIGS` — the `geo → rules table` map `js/main.js` has to match — and
`bodied(enemy)`. That last one is the whole point: *"can the world ever put this enemy in front of
the player"* is what decides whether a `kill` objective can be finished, and until now no node test
could ask it, because half the answer was inside a file that imports three.

`FOWL.sour_crow` is `{ zone: 'dark', shade: 0.38, scale: 1.85, run: 3.9 }` — Blackstone's own
plumage darkened, the same way `FOES` derives a raider from dark's robe. `js/world/zones.js` is
untouched and no `watch:` key was added; the review confirmed the derived colour reads and it does.

**On the rig.** `Chickens.add()` takes a `spec.enemy` and refuses a row that is not in `FOWL`; the
crow gets its own mesh — a fourth "zone" — so it keeps its colour wherever it spawns, for the reason
`foeshape.js` gives about the Watch. The seat cap is now per mesh rather than global, so a crow
cannot refuse a hen. **The poses came free**: `js/sim/foes.js` numbers `ACT.attack` 1 and `ACT.hurt`
2, which are exactly the fowl shader's peck and startle-flap, so a crow pecks when it bites and
flaps when it is hit with no second animation system. Only the fall had no counterpart — it is a
1.48 rad roll about the bird's own axis on the instance matrix, pivoting at its feet.

**`Chickens` now honours `frozen`**, and `main.js`'s `freeze` reaches all three rigs. Without it a
hostile crow coasts on its last speed behind an open menu, which is the bug this wave already fixed
once in `robed.js`.

`sour_crow` is deliberately **not** in `CHARGES` — a bird at the water stands is not a thing that
comes at you on sight, and `hurt()` makes it hostile the moment you hit one. Verified live:
`hostile: false` at 13 m, and it fights once struck.

## 12.3 `tools/campaign.test.mjs` cannot hide this again

`whyNoEvent(o, s)` is now the gate every manufactured event passes through, and `eventsFor` asserts
on it, so **the ladder tests themselves fail** — not just a side check. It answers for `kill`: the
row exists, a rig in `RIGS` bodies it, and `planFrom` can place it somewhere. The other verbs are
gated by the tests that own the data they need (`gathering.test.js`, `placement.test.js`,
`escort.test.js`, `lintQuests` for every area id) and the comment says so; `eventsFor`'s `default`
still throws, so a new objective kind has to be classified here before it can be manufactured at all.

Two tests beside it: one walks **every** objective in the corpus, including the twenty sandbox jobs
the ladder never plays, and one is the counterpart proving the check can see both shapes of the hole
it exists for. And `enemies.test.js` now parses `main.js`'s `rigFor({…})` literal and asserts its
keys are exactly `Object.keys(RIGS)` — that is the join between what the pure side believes about
the world and what `main.js` actually hands over, which is the thing nothing was checking.

Reverted and confirmed red, case by case:

| revert | red |
|---|---|
| `chicken` out of `RIGS` | ✓ 13, incl. all three campaign ladders |
| `main.js` drops `chicken: chickens` | ✓ 1 — the rigFor-keys test alone, which is the point |
| `light.05.watch` loses its `"in"` | ✓ 11, incl. all three campaign ladders |
| `whyNoEvent` always answering null | ✓ 1 — the counterpart |

`js/game/packs.test.js` had to change one line: it sent `{t:'kill', kind:'mire_rat', n:2}` with no
area, which is not an event the runtime emits. It carries `area: 'wwa.northgate'` now. That test was
a small instance of the same disease.

## 12.4 The Break loop, and the detection envelope

**The loop.** `tickGraft` now returns early on a `free` graft: it accrues nothing and can only run
out. §8.3's comeback is *twenty seconds of cover*; it is handed back standing in front of the
Watchmen who took the last face, so accruing on it Broke it again before it expired — the review's
four Breaks in 58 s, −50 Standing across both towns a lap, four `aggro(30)` calls, 0 XP, no input.
A face the player chose is still perfectly catchable in the same field; a face they were given is
not. `docs/SYSTEMS.md` §8.3 says so now.

**The envelope, judged whole.** The three distances are one mechanic read from three sides and they
have to nest. They did not: at `radius: 6` the band in which a Watchman read your face was *inside
its own melee reach* (`AI.reach × 1.7` = 2.2 m), so the two events the disguise loop is built out of
— being noticed and being bitten — were the same event, and a Watchman across the street noticed
nothing. Chosen:

| | was | now | why |
|---|---|---|---|
| `SUSPICION.radius` | 6 | **12** | close enough to read a face across a street, and 5× a Watchman's own reach, so noticing you and reaching you are separate things again. It is also the radius `pointIn` scatters a deployment over, so walking *into* the Watch is what gets you read |
| `SUSPICION.holdRadius` | 10 | **22** | `= GRAFT.losRadius`. If they can see you well enough to refuse you a Graft, you do not get to cool off. Two numbers that mean the same thing now *are* the same number |
| `twoOrMore: 1.8` | flat | **`perExtra: 0.8`, `crowdCap: 3.4`** | it saturated at two — 2, 3 and 8 Watchmen all Broke a face at 14.5 s. Each one past the first now costs the same 0.8 the second did; two still cost exactly 1.8× (SYSTEMS §8.3's published number, and the existing `at(12, kesta, 2) = 13.9 s` test is untouched), four and up cap at 3.4× so a cordon is fast and not instant |

**`perWatchman: 4` is unchanged and deliberately so.** `faction.test.js`'s §8.3 balance table and its
rhythm test — 20 s beside a Watchman, 20 s away, peak suspicion 40, the nine-minute face runs out
before the disguise does — are tuned against that 4, and they describe the intended play pattern.
The pattern was never reachable because of the geometry, not the rate. I changed the geometry.

**`neutral.09` is covered, and it is not a 42-second timer.** The font is **5.26 m** from Warden
Alder, so the step really is a clock and nothing said so. The review's 42 s is glamour 0; the ladder
arrives at N09 on **Glamour 10**, measured by playing it, which is **71 s** to count four measures
and then say the covenant back to Alder face to face. The new test in `placement.test.js` walks
every `worn` step with an `interact` objective, finds every watcher inside `SUSPICION.radius` of the
prop, and asserts the list is exactly `neutral.09.count under alder at 5.3 m` with at least 40 s on
it at the worst case. Moving Alder off the font goes red; so would putting a new disguised step
under Kesta.

## 12.5 The dev scenarios, and a render check that cannot lie

`Robed`'s six bodies were pushed from the **constructor**, so they stood in every `?dev=1` scenario.
The row is built by the `foe_*` setups now and by nothing else. Measured against the pre-wave tree
`b31413f`, same command both sides:

| scenario | review measured | now | self-noise, same tree |
|---|---|---|---|
| `people_day` | 29.4 % | **1.02 %** | 0.18 % |
| `people_dusk` | 29.3 % | **1.24 %** | — |
| `people_macro` | 7.1 % | **2.57 %** | **5.76 %** |
| `vermin_play` | 1.8 % | **0.78 %** | — |
| `fowl_yard` | 0.009 % | **0.03 %** | — |

Every one is now at or under the noise floor, and I read `people_day` against the pre-wave PNG side
by side: same eight townspeople, same framing, no enemies. The crowd's art record is a record again.

`robed.js:92`'s *"relative to the dev site"* was false — it is a literal `{ x: 0, z: 44 }` — and the
comment is gone with the code it described.

**`tools/shot.mjs` fails loudly on an unknown id.** It listed the scenarios the page registered and
wrote the PNG anyway, so any typo produced a plausible render of a wall. It now throws, names what
the page did register, and says the `foe_*`/`people_*`/`fowl_*`/`vermin_*` ones need `--set=dev=1`.
`node tools/shot.mjs --shot=nope_at_all` exits 1.

## 12.6 Escort: the comment, the crossing, and the vanishing hen

**The comment was wrong and is gone.** *One* of the four destinations contained its actor's start,
not three. It no longer does, so the sentence that justified `ESCORT.travel` had to be replaced
rather than corrected: the rule now earns its place on a different fact, which is that Fen stands
**2.6 m** from the edge of his destination. A test pins that 2.6 m so the comment cannot drift.

**The crossing.** `reach.neutral` is the whole 300 × 152 m Longacre bank and Fen stands in the
middle of it, so the "crossing" credited after 11.6 m in whatever direction the player happened to
be. `light.17`, `dark.15` and `sandbox.18` now escort him to **`lac.mill`** — which is where the
*very next step of each of those quests* counts the crates off ("Count them off at the far end",
`in: lac.mill`). Arrival is now inside a 20 × 16 m box 17.7 m away, in the direction of the crate the
player has to walk to anyway, and `ESCORT.travel` stops the two-steps-sideways credit.

**Honest caveat on the fiction.** Fen is written as a ferryman — *"Three crates over, three crates
back"* — but the authored geography does not support a water crossing here: I probed the terrain and
the channel at Millbridge runs z ≈ 113–131, putting `lac.millbridge`, Fen and `lac.mill` all on the
**south** bank. Either the mill wants moving to the far side or the word "cross" wants softening.
I did not invent an area on the north bank to make the fiction true; that is Aaron's call, and it is
the one thing in this section I have changed the meaning of rather than fixed.

**A finished repeatable no longer deletes its actor in front of you.** `escortActors` lists only
`active`/`turnin`, and a board job goes straight to `cooling` when it credits — with the player
necessarily inside 30 m, or the escort would have been lost. `escortTick` now defers the hide and
the park until the actor is further than `ESCORT.lose` from the player, and **parks before hiding**,
because hiding the hen takes its agent away and leaves `park()` nothing to move (the review's latent
ordering bug, fixed in passing). `this.shown` is a `Set` rather than a joined string.

## 12.7 Test coverage on the three-side files

Nine mutations left all 480 green. **Seven of the nine are now caught.**

The rules themselves moved to where a node test can reach them, the way `roster.js` did:

| rule | now in | reads |
|---|---|---|
| the follow speeds | `js/game/escort.js` `SPEED` | `escorts.js` imports it; `escort.test.js` imports the same table instead of restating it at line 21 |
| the carried walk cycle | `js/game/escort.js` `carriedGait` | one rule for both body kinds |
| "carry a body along the heading and speed `think` set" | `js/sim/foes.js` `carry` | `robed.js` and `chicken.js` both had a copy; now neither does |
| who holds a lamp, and how many are drawn | `js/world/foeshape.js` `carriesLamp` / `lampCount` | `drawLamps` **and** `cost()` read the same answer, which also fixes the review's §11 — the readout claimed two draws with the knob at 0 |

**`js/world/split.test.js` has a second rule.** The tell those nine mutations share is not a shape in
the source, it is a *dependency*: a `js/world` module that imports from `js/sim` or `js/game` is one
the game drives, and its rules belong where a test can reach them. That set is **computed, not
listed** — today it is exactly `vermin.js`, `robed.js`, `chicken.js`, `escorts.js` — and each needs a
row in `DRIVEN` naming the node-side module its rules live in plus the calls that prove it still
delegates. A fifth rig cannot ship without a row. Adding a row for a file that is not driven goes
red, and so does dropping one. Nothing textual, nothing to false-positive on; the heuristics
`NOTES_GATHER.md` §"why not a broader rule" measured and rejected are not repeated here — I
re-measured one of them ("a bare numeric table exported from a three-side world module") and it
fires on `buildings.js` `TUNING` and `tree.js` `CROWN` on the current tree, so it is out.

| the review's nine | caught by |
|---|---|
| `SPEED` all → 0 | ✓ 3 tests — the speeds are node-side now |
| `SPEED.fowl` 3.6 → 0.05 | ✓ 2 |
| `move()` drops the position write | ✓ 1 — pinned in `DRIVEN` |
| `show()` never creates the bird | ✓ 1 — pinned in `DRIVEN` |
| `drawLamps` sets `visible = false` | ✓ 1 — pinned in `DRIVEN` |
| frozen branch clears the lamps | ✓ 1 — pinned in `DRIVEN` |
| `add()` drops `state: STATE.idle` | ✓ 1 — pinned in `DRIVEN` |
| **`park()` does nothing** | **still green** |
| **`walk()` never moves a body** | **still green** |

**The two that got away, and why.** Both mutations are *an early `return` inserted above code that
is still there*. A source-shape assertion reads the text, and the text is unchanged, so no check of
this kind can ever see them. What would: a browser-side smoke test over CDP that boots a session,
walks an actor and reads its position back — the same driver §12.1's live run uses. That is a new
tool rather than a fix, and I did not build it. It is the honest next step for this whole class.

## 12.8 The two wrong claims in these notes

**"33.7 against 70 HP" (§9) was a ward-2 character.** The review's arithmetic is right and this note
was wrong. `hpMax = 34 + 14·ward + 4·hearth` and `damageTaken = raw · 100/(100 + 10·ward)`, so at the
level `neutral.21` actually happens a Watchman is **13.0 per bite into 322 HP at ward 16 — 25 bites
— and 11.2 into 394 at ward 20, 36 bites.** `champion_3` is 10–15. **I retuned nothing.** The Watch
is arguably soft rather than overtuned, and softening or hardening it on the strength of one
corrected sum, with nobody having played N21, would be guessing. What was actually wrong was the
*detection* half, and that is what §12.4 changed.

**`robed.js:87`'s "the same recipe one size up" was false.** `props.js` is `0.13`,
`[0.17, 0.23, 0.29, 0.35, 0.41]`, `0.06`; the Watch lamp is `0.115`,
`[0.17, 0.23, 0.30, 0.38, 0.47]`, `0.055`. The core is **12 % smaller** and the gain **8 % lower**;
only the outer three shells grew. It is the same recipe with a *wider, softer* halo, which is both
true and a better description of what it is for — a bigger hard core reads as a bulb at four metres.
The comment says that now, with the numbers in it.

## 12.9 The design call on the Watch: `CHARGES` stays, STORY §2 is amended

Aaron's call, implemented. `js/sim/foes.js` is untouched and `watchman` is still in `CHARGES`.
`docs/STORY.md` §2 now says plainly that the section described **two** kinds of Watch and that only
one of them is built: every Watchman the world can place was asked for by a `kill` objective, all
three of those are pitched battles in a town under attack, and taking `watchman` out of `CHARGES`
would turn them into free kills on ten stationary bodies. The ambient non-combat patrol — the thing
the disguise loop is supposed to be played against — is recorded as **unbuilt**, together with the
shape it should take when it is built: placed non-combat bodies with a `WATCH_WEIGHT` entry, exactly
what `Cast.watch()` already returns and what `escorts.json` already places, which gives STORY's
bridge patrol literally and costs nothing in `js/sim`.

## 12.10 Cost, and what I could not verify

`node tools/shot.mjs --all --preset=medium --dpr=1 --w=844 --h=390`, main pass, against the numbers
the review left:

| scenario | gate | now |
|---|---|---|
| `wall_day` | 79 / 154,176 | **79 / 154,176** — and 0 pixels differ |
| `street_dusk` | 64 / 110,285 | **64 / 110,285** — 1 pixel |
| `gate_night` | 48 / 101,586 | **48 / 101,586** — 0 pixels |
| `town_night` | 79 / 120,331 | **79 / 120,331** — 4 pixels |
| `creek_day` | 82 / 96,420 | **82 / 96,420** |

The crow's fourth fowl mesh costs nothing at the gate: an `InstancedMesh` with `count = 0` is not
drawn, and no session arms one under `?shot=`.

**Not verified.**

- **No real phone.** Desktop Chrome over CDP at 844 × 390 throughout, same as the wave.
- **The crow's chase was not photographed at melee range.** I proved it places, arms off its own
  bestiary row, holds `hostile: false` until struck, dies with the roll pose and is removed on the
  corpse clock; the frames I captured are at 10–25 m (`shots/enemies_fix/crow_chase.png`,
  `crow_death.png`). Its `run: 3.9` against `AI.chase` is 3.3 m/s, so a walking player at 5.0 outruns
  it. That is a deliberate choice for a level-5 bird and it is untested against a player.
- **Nobody has played the retuned suspicion envelope.** 12 m and 22 m are reasoned from the geometry
  they have to nest with, not from play. The two numbers most likely to want another pass are
  `holdRadius: 22` inside a building — in the Whitewall temple it means you cannot shed suspicion
  anywhere Alder can see you — and `crowdCap: 3.4`.
- **The escort still has no pathfinding**, and `lac.mill` is a building footprint rather than the
  open ground the other three routes cross. Fen is *carried*, not walked, so he cannot jam — but he
  can be carried over ground he should not be on if the player takes an odd line. Untested; the
  authored line, bridge crate → mill crate, is clear.
- **`park()` doing nothing and `Robed.walk()` never moving** are still unguarded — §12.7.
- **`docs/REMAINING.md` is still stale.** Unchanged from §9.

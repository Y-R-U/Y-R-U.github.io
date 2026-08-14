# NOTES_CONTENT — Track D, the content record

What was authored, what was decided, and what the docs got wrong. Read this before touching
`data/areas.json`, `data/quests/*.json`, `data/dialogue/*.json` or `data/cast.json`.

**State:** `data/areas.json` covers all three towns and the countryside. Light is complete,
L01–L28. **Dark is complete, D01–D25** — see §6. **Neutral is complete, N01–N26, and the sandbox
board is the full S01–S20** — see §8. That is the whole 99-quest catalogue.

```
node tools/lintQuests.mjs     99 quests · 399 steps · 175 dialogue nodes · 7 warnings · 0 errors
node tools/lintText.mjs       175 nodes · 698 lines · longest 43/46 · 0 warnings · 0 errors
node --test                   296 pass, 0 fail
```

`raider` is now in `js/sim/tables.js`, so §6.3's dependency is closed and the two errors it caused
are gone. `tools/campaign.test.mjs` went from six tests to eight to **fifteen**; the rest of the
suite is untouched.

**In flight as this was written:** somebody added a school-versus-enemy-payout check to
`lintQuests.mjs`, which raises five new warnings — `L11`, `L23`, `light.23`, `D19`, `D21` — and
therefore fails `packs.test.js`'s "every warning is one we have looked at". Those five are §3.1 and
§6.5a being caught by a linter at last. **None of them is in Neutral or the sandbox**, and no
Neutral quest names a school its enemies cannot pay. Whoever owns that rule owns those five.

**The seven warnings are the pre-existing ones** (`apprentice_cord`, `board_ww` ×6) and they are
load-bearing: `js/game/packs.test.js` asserts every warning matches `/apprentice_cord|board_ww/`,
so **a sixth warning of any other kind fails the test suite.** That file is off limits to Track D,
so content has to lint warning-clean. In practice this means:

- a `reward.items` entry must be an item in `js/sim/tables.js` — you cannot invent a story token
- every `giver` and every `deliver` target must be a speaking npc (or, for deliver, an area id)
- every `deliver` / `escort` / `goto` step needs a `recover`
- every `interact` id must sit under a declared area

---

## 1. `data/areas.json` — the contract

89 areas. The rule Aaron set is that **the world is built to satisfy this file**, so every area is
placed at a coordinate the terrain can actually carry.

| Prefix | What |
|---|---|
| `wwa.*` | Whitewall, rect `(−640,−160)–(−400,40)`, centre (−520,−60) |
| `lac.*` | Longacre, rect `(−130,−70)–(130,150)`, centre (0,+40) |
| `bst.*` | Blackstone, rect `(405,−180)–(635,20)`, centre (+520,−80) |
| `reach.light` `reach.east` `reach.neutral` `reach.dark` | the four fished reaches of the Vail |
| `stand.*` | named fish stands — **a stand is named only if a quest sends you to it** (`STORY.md` §13.5) |
| `downs` `march.west` `fields` `heath` `moor` `meadow` | the six countryside regions of `WORLD.md` §1.4 |
| `road.drove` `road.spur.light` `road.spur.dark` | the northern bypass and its two spurs |
| `ridge.dark` | the scouting ridge above the Black Keep (L20) |

`wwa.*`, `lac.*` and `bst.*` are the ids `RUNTIME.md` §11 asked for, minus one: it guessed `bst.*`
and it is right, so that open question is now answered.

**Decisions taken.**

- **Towns are rects, not circles.** A walled precinct of 240 × 200 is a rectangle, and a circle
  inscribed in it puts the east gate exactly on the boundary. The parent-containment lint below
  needs the gate to be *inside* its town.
- **River-side areas follow `terrain.js`, not `WORLD.md`.** See §3.3 — the two disagree by 25–50 m in
  three places and the code is what renders.
- **One `hearth: true` per town** — `wwa.kitchen`, `lac.barn`, `bst.kitchen`. Note that
  `session.spawnAtHearth` takes the **first** hearth in file order, so Whitewall's kitchen is the
  global respawn point. Keep it first in the file.
- **The old `wwa.fishsteps` and `reach.light` were inside the town.** They were authored against
  the pre-A3 290 m demo box and sat at z ≈ −14, which is now the middle of Whitewall. Both moved
  onto the actual Vail. Ids are unchanged, so `packs.test.js` and the shipped Act 1 still pass.
- **`lac.westfield`, not `west_field`.** `RUNTIME.md` §2.1's example uses the bare id; every other
  area in the file is town-prefixed. Neutral's N02 and N16 should use `lac.westfield`.

---

## 2. The Light campaign, L07–L28

22 quests added to `data/quests/light.json`, 46 dialogue nodes to `data/dialogue/light.json`, six
cast entries to `data/cast.json` (`ivo`, `pell`, `hana`, `fen`, `ansel`, `sela`).

Act shape, prereqs and school assignments follow `STORY.md` §8.1 exactly. `reward.xp` and
`reward.mk` are nowhere in the pack; the whole campaign pays **889 mk against the 890 mk of the
five Light act budgets in `js/sim/campaign.js`** (1 mk of rounding), which is asserted in
`tools/campaign.test.mjs`.

**Where the pack deliberately differs from `campaign.js`'s `work` model.** `campaign.js` owns
balance; the pack owns what the player does. Three rows diverge and each is a playability fix:

| Quest | `campaign.js` models | The pack asks for | Why |
|---|---|---|---|
| L12 | cook `chalk_trout` ×4 | one `silverling` off the low stand | `chalk_trout` is `req 4`, i.e. Line level 4. A player who fishes only when a quest tells them to is not reliably there at the Act 2 finale — and the Act 2 finale is the end of the first playable. This is the same fix §15 already made to L02 |
| L26 / L28 | cook `chalk_trout` ×6 / ×14 | `cooked_silverling` ×3 / ×6 | 14 chalk trout is ~45 casts at Line 5 for one quest step |
| L18 | `sour_crow` ×6 + `blight_boar` ×2 | `hollow` ×2 + `sour_crow` ×6 | see the spec bug in §3.1 — the story's raiders are robed casters and there is no beast reading of that scene |

**Other authoring choices worth knowing.**

- **The Whitewall reach's junk `weed` is L08's objective.** `weed` is `req 1` in the whitewall
  catch table, so "river weed at three depths" is three `gather` steps in three named stands. It
  pays Forage at turn-in and Line in play, which is the right way round for a herbalist's errand.
- **L09 carries the draw with `interact`, not `deliver`.** There is no "the week's draw" item in
  `sim/tables.js` and Track D may not add one, so the carry is `interact` on the font, a `goto`,
  and `interact` on the Almonry shelf. Every "carry the thing" quest in Dark and Neutral will hit
  this: **either the item exists in `tables.js` or the quest is an interact pair.**
- **Old Pell is in L09.** `STORY.md` §1 promises the schism history "in Light Act 1, in passing,
  from Old Pell" and Act 1 shipped without him. L09 walks past the works yard on its way to the
  Almonry, so the beat lands in Act 2 instead — one node, four bubbles, `once: true`.
- **L15 pays six `wheatglass` as the grain.** That is what L25 then bakes. `wheatglass` is a real
  Longacre forage item, so the linter accepts it and the fiction gets a name for Longacre wheat.
- **L15 grew a fourth chore.** `STORY.md` gives L15 the schools Forage **and Setting**, and the
  leat / crate / hen trio has no stonework in it. The extra step re-sets the West Field's gatepost
  with `verb: "setting"` — which also walks the player over the root of the Forge in Act 3, two
  campaigns before N16 digs it up. Sedge's "back two paces" is `boundary.moves` planted early.
- **The haggle is a dialogue choice, never an objective** (L14, and L03 before it). Neither branch
  can be failed; both end in the chores, because Hana takes work.
- **L22 has no `giver`.** It is self-directed, per `STORY.md` §5. `giver` is optional in the
  schema; the offer marker has no source and that is intended.
- **L24 grants the White Cord as a flag, not an item.** `["flag", "echo.white_cord", true]`.
  `campaign.js` already carries `echo: 'white_cord'` on L24, and an authored `white_cord` item
  would be the sixth lint warning described above.

**Where the ten Light Truths are marked** — all in dialogue, per §8.5, never at turn-in:

```
overdraw          light.10.out      wagon.eighth   light.11.out
cousin            light.16.out      count.never.holds  light.17.out
raiders.east      light.18.out      shaft.dry      light.19.ask
unseen            light.20.out      vail.dead      light.21.out
thirty.years      light.22.out      strike.won     light.23.out
```

---

## 3. Spec bugs found — reported, not edited

### 3.1 Cull is assigned to two quests whose enemies are Cull-immune

`STORY.md` §8.1 gives **L23 The Strike** the schools Kindle · Cull · Ward, and `campaign.js` models
it as `hollow` ×6 + `watchman` ×6. Both of those carry `immune: ['cull']` in `sim/tables.js`, and
neither pays any Cull XP on the kill. So the player is told the quest trains Cull, cannot use Cull
against anything in it, and earns Cull only from the turn-in. §8.0 even names the Hollow and the
Watchman as "Cull-immune by design" in the same section that hands L23 the school.

**L18 Smoke on the East Wind** is the same problem from the other end: `STORY.md` §5 says the
raiders are "robed casters with black staffs", and **there is no such enemy in `sim/tables.js`** —
the only `geo: 'people'` entries are `hollow` (level 10), `watchman` (level 12) and the three
champions. `campaign.js` quietly resolved this by making L18 a fight against a `sour_crow` flock
and two `blight_boar`, which is not the scene the campaign turns on.

**The fix I would apply:** add one enemy to `sim/tables.js` —

```js
raider: { level: 8, hp: 226, armour: 16, damage: 23.3, geo: 'people',
          xp: { cull: 240, kindle: 200, ward: 80 }, drops: [['black_staff', 1]], mk: 20 },
```

— and use it for L18 (×6) and alongside the Watch for L23. It costs no new geometry (`people` is
the existing robed figure, and `player.setZone` already tints it dark), it makes the act's band of
5–8 honest, and it makes Cull mean something in the two quests that headline it. Until then the
pack uses `hollow` ×2 + `sour_crow` ×6 for L18 so that Cull is at least payable in play, and
`watchman` ×4 + `hollow` ×4 for L23 as `campaign.js` prices it.

### 3.2 A branching dialogue node can never satisfy the `talk` step that opens it

**This one was live in the shipped Act 1.** `dialoguebox.end()` reports the node the *conversation*
ended on, not the node the step named:

```js
finish() { const node = this.scene.node; … if (goto && this.play(goto)) return; this.end(node); }
…
done: ({ node, npc }) => this.quests.emit({ t: 'talk', npc, node })
```

So for `{"do": ["talk", "wick_ww", "light.03.price"]}`, a player who picks either haggle branch
raises `{npc: 'wick_ww', node: 'light.03.take'}`, `credit()` compares it against `light.03.price`,
and **the step does not advance.** The only escape is to re-open the conversation and pick the one
choice whose `goto` is `null`. `packs.test.js` never caught it because its playthrough sends the
`talk` event directly and skips the dialogue box.

**Fixed in data, in four places** — `light.03.price`, `light.14.price`, `light.19.ask` and
`light.24.choice` now all have terminal choices (`"goto": null`) that carry their branch in `sets`,
and the follow-up lines moved into an ordinary next step (`light.14.terms`, `light.19.more`,
`light.24.answer`). `light.03.take` / `.push` are gone; Wick's counter-offer is now a line in the
entry node, and `packs.test.js`'s three assertions on that node still pass unchanged.

**`tools/lintQuests.mjs` now rejects the shape**, so it cannot come back: a `talk` objective whose
node has any `choices[].goto` or `next` is an error. Authors of Dark and Neutral: **branch with
`sets`, continue with a step.**

The engine-side fix, if Track B wants it, is one line — report the *entry* node id alongside the
terminal one, or have `end()` carry the id the scene was opened with. Until then the rule stands.

### 3.3 `WORLD.md` §4.3's crossings disagree with `terrain.js`

| | `WORLD.md` §4.3 | `terrain.js` |
|---|---|---|
| Hollow Ford | x = +252 | `FORD_X = 200` |
| Blackspan | x = +348 | `SPAN_X = 400` |
| Millbridge | (−34, +86) | `creekZ(−34) = 119` |
| Whitewall's fish steps | 55 m below the south gate | the Vail is 87 m below it at x = −520 |
| Blackstone's gorge | the Black Race at z ≈ +60 | `creekZ(520) = 91.5` |

`areas.json` follows the code, because the code is what renders and the river spline is authored
work that A5 already did. **`WORLD.md` §4.3 wants a correction pass**, or the spline wants moving —
but not both, and somebody has to say which.

### 3.4 `terrain.js` still puts all three towns at cz = 0

`TOWNS` in `js/world/terrain.js` carries `cz: 0` for all three, with a comment saying `WORLD.md`
§1.3's −60 / +40 / −80 "land at A8". `areas.json` is now authored at the real z centres, so **A8
has to move the pads or every town area sits off its town.** This is the single largest dependency
Track D has left on Track A.

### 3.5 Smaller ones

- **`STORY.md` §11** puts Hana's birthday question at **L14**. L14 is a two-beat haggle and its
  second beat is a dialogue branch a player can decline. The plant is authored at **L15's turn-in**
  instead — same character, same act, always played. Update the plant table or move it back.
- **`RUNTIME.md` §2.1** gives `deliver(rat_tail, 8, "west_field")` as the example for "bury them in
  the west field". The area is `lac.westfield`.
- **`wick_ww`** is Wick, who `STORY.md` §9 lists as **Longacre's** market clerk, and he is the
  Whitewall market's stall clerk in the shipped L03. One person, one id, an unfortunate suffix. If
  anyone re-touches L03, rename it `wick`; do not add a second Wick, or the journal grows two
  portraits for one character.
- **`STORY.md` §8.1's L06 reward** includes an `apprentice_cord` item that is not in
  `sim/tables.js`. That is the pre-existing lint warning; the same question as the White Cord.

---

## 4. What I extended in `tools/lintQuests.mjs`

Seven new checks, all errors. Each one exists because it would have caught something during this
pass.

| Check | Catches |
|---|---|
| `recover` action names and targets | a "Reset this step" button that moves you to an area that does not exist, respawns an enemy that is not in `tables.js`, or grants an item nobody has heard of. Unknown action verbs are rejected outright, so the allowed set is `moveTo` `respawn` `grant` `arm` `sound` |
| `unlock` targets | `["unlock", "light.29"]` for a quest that was never written. Campaign ids (`light`/`dark`/`neutral`) are allowed, because that is how L24 opens Dark |
| Truth is wired to something | a Truth whose `story` id is in the shipped packs but which nothing awards. §8.5 confesses that N04 claimed two Truths for two revisions without either existing. Truths belonging to unwritten campaigns are skipped |
| Act ordering | a quest in act 3 whose prereq is an act 4 quest |
| Areas inside `PLAY` | an area outside the playable box, i.e. a place the world agent cannot build and the player cannot walk to. **`PLAY` is copied into the linter** because `terrain.js` imports three; if the box moves, move it here |
| Parent containment | an area whose centre is not inside its declared parent — a `wwa.*` id sitting outside Whitewall |
| A `talk` node that runs on | §3.2. A quest step naming a node with a `goto` or a `next` can never be credited |

`tools/campaign.test.mjs` is new: it plays every quest in the packs from a blank save, using only
the events the steps themselves ask for, in whatever order `offered()` allows. It asserts that all
28 Light quests finish, that the acts advance 2 → 5 in order, that the campaign pays its act
budgets, that Dark unlocks, and that all ten Light Truths are marked by nodes the campaign actually
plays. **This is the reachability gate: if a quest can only be reached by doing something no quest
asks for, this test fails.**

---

## 5. What will not survive first contact with a player

Honest list, for the playtest.

1. **L11's eighth-day gate is the first hard clock gate in the game.** The wagon window is
   05:00–09:00 *and* `onDay: 8`. The engine fades to it on accept, so it should never be a wait —
   but this is the first place that machinery is used in anger and it is two modifiers deep.
2. **L22 is `unseen` at 01:00 in a town that has a night watch the player served on.** If being
   seen is easy, the campaign's best scene becomes a stealth-fail loop. It has a `recover` and a
   retry, but the failure needs to be forgiving or the step needs its `unseen` dropped.
3. **L18 is the difficulty cliff.** Two `hollow` at level 10 in an act banded 5–8, and they are the
   first `people`-geo enemies the player meets. Expect to re-count them, or to want §3.1's raider.
4. **L23 asks for 8 kills, a `goto` and a 120 s hold, all inside Blackstone at night.** It is the
   longest step chain in the campaign and there is no checkpoint inside it.
5. **The Act 4 walk is long.** L21 sends the player from Whitewall to the Blackstone reach and back
   — 1,078 m each way on the King's Road. Fen "rows you down" in dialogue but the runtime has no
   ferry-as-travel, so the player walks it. If that reads as dead time, L21 is where a fast travel
   argument will start.
6. **`reach.east` needs a catch table.** L27 fishes it for `silverling`, so it has to resolve to
   the `whitewall` table, not `longacre`. It is Whitewall's water in the fiction; make sure the
   region mapping agrees.
7. **Six `interact` counting objectives** (dry stands, the shelf, the tally, the cross post, the
   crates, the readings) all depend on there being a countable prop in the world at those ids. They
   are the cheapest thing in the pack to author and the easiest thing in the world to forget to
   place. The full list of object ids the Light campaign needs:

```
wwa.granary.lamp      wwa.temple.font       wwa.temple.hand      wwa.almonry.shelf
wwa.almonry.tally     wwa.almonry.door      wwa.almonry.ledger   wwa.almonry.lock
wwa.lamp              wwa.fence.panel       reach.light.stand    reach.dark.reading
ridge.dark.mark       lac.leat              lac.mill.crate       lac.millbridge.crate
lac.cross.post        lac.westfield.post    lac.henhouse.hen
```

---

## 6. The Dark campaign, D01–D25

25 quests in the new `data/quests/dark.json`, 55 dialogue nodes in `data/dialogue/dark.json`, four
cast entries (`corve`, `ossa`, `nim`, `torr`), and `dark` added to `data/quests/index.json`
between `light` and `sandbox`.

Act shape follows `STORY.md` §11's **6 · 5 · 6 · 4 · 4** and §8.2's prereqs and school assignments
exactly. No `reward.xp`, no `reward.mk`. The campaign pays **2,700 mk against the 2,700 mk of the
five Dark act budgets in `js/sim/campaign.js` — exact, no rounding**, and every one of the 25
`story` ids `campaign.js` prices is claimed by a quest. Both facts are asserted.

**Dark is not reachable from a blank save and must not be.** `dark.01`'s prereq is
`["quest","light.24","done"]` and nothing else in the pack has a prereq outside the campaign.
`tools/campaign.test.mjs` now plays `['light','dark']` on one save and asserts the ladder.

**The player arrives trained.** Nothing in Dark Act 1 re-teaches a verb. D01 is a cull, but at
`mire_rat` ×10 + `creek_crab` ×4 rather than eight grain rats, and Kesta briefs it as duty rather
than as a lesson. D03 asks for `blackeel` — Line `req 5` — on the assumption Light left the player
at or above it. The only tutorial-shaped beat in the act is D02, and what it teaches is a fact
about the player, not a control.

### 6.1 Authoring choices worth knowing

- **Branching `talk` steps are used now.** `dark.02.ask`, `dark.12.price` and `dark.17.ask` are
  step targets whose choices have real `goto` targets, which §3.2's data workaround forbade. The
  engine reports every node a conversation visited (`quest.js` `credit()` matches
  `event.nodes`), so the step is credited whichever branch the player takes. **The linter check
  that rejected this shape is gone** — see §7.
- **The carry problem again.** §2's rule held: either the item is in `sim/tables.js` or the quest
  is an `interact` pair. D11 carries "the month's yield" as `interact bst.board.yield` and then
  sells five real `iron_shard` — which **D07 supplies**, because D07's Setting objective is
  `gather iron_shard 5`, exactly the `rock iron_glass 5` `campaign.js` models. D20 carries the
  eight `wheatglass` **D13 pays as its grain**, and D25 bakes six of them. Those three chains are
  the only places the pack asks the player to have something it did not give them.
- **D13 is four visible chores, not one lumped step.** L15 does the leat, crate and hen as a
  single `all:` step. D13 splits them, because `STORY.md` gives it Forage **and** Setting **and**
  Mend, and a step carries one `verb`. Splitting also *is* the beat: the second time round it
  drags, and Hana has added a fourth job.
- **D22 ends on `lac.westfield`.** The western seam is walked by lamp from `bst.levels` through
  `heath.ford` — where it crosses under the Vail — and stops under Longacre's West Field, two
  campaigns before N16 digs it up. There is no underground area set, so the walk is three `goto`s
  through surface areas; the fiction is that the player is sixty metres under them.
- **The Short Rope is a flag**, `["flag","echo.short_rope",true]`, exactly as L24 grants the White
  Cord. `campaign.js` carries `echo: 'short_rope'` on D22 and an authored item would be a sixth
  lint warning.
- **`interact("self", 1)`** is D02's "take the robe off", per `RUNTIME.md` §2.1. It has no dot, so
  it raises no unknown-object warning, and it needs no `recover` because `interact` cannot strand.
- **Ansel says the same closing line in both campaigns.** `light.16.out` and `dark.14.out` both
  end "Bring eels next time. They pay better." That is deliberate: one man, two faces, one script.
- **Hana's L15 birthday plant is answered in `dark.12.terms`.** "A Whitewall lad did these three
  last year. / Cleared the leat in an afternoon." — "I remember." — "I expect you do." It is the
  only place in Dark where Longacre shows its hand, and it costs three lines.

### 6.2 Where the twelve Dark Truths are marked

All in dialogue, per §8.5, never at turn-in. The linter now enforces both halves of that rule.

```
fostered           dark.02.robe     walls.wrong.way    dark.06.wall
yield.falls        dark.06.tally    wagon.watched      dark.07.wheels
vail.arrives.dead  dark.08.out      vail.alive.above   dark.09.out
ansel.nobody       dark.14.out      raid.water         dark.16.out
sela.face          dark.17.out      sign.kept          dark.18.out
seam.west          dark.19.out      strike.undone      dark.21.out
```

### 6.3 The one open dependency — `raider`

`dark.21.climb` is `kill watchman 6` + **`kill raider 4`**, and `raider` is being added to
`js/sim/tables.js` by another agent as §3.1 asked. **Until it lands the pack has two lint errors
and `js/game/packs.test.js` fails**, because that test asserts `errors` is empty. If it has to be
backed out, the one-line fallback is `kill hollow 4` — at the cost of D21 being the third quest in
the game to name Cull and field nothing Cull can hurt.

### 6.4 Where the pack deliberately differs from `campaign.js`'s `work` model

| Quest | `campaign.js` models | The pack asks for | Why |
|---|---|---|---|
| D01 | `mire_rat` ×10 + `creek_crab` ×4 | as modelled, in `bst.levels` | there is no `bst.store` area; the flooded store is the head of the Levels |
| D05 | cook `blackeel` ×8 | cook ×3, then `interact bst.kitchen.bowl` ×8 | the quest is *"three fish into eight bowls"*. Cooking eight fish is the opposite scene |
| D10 | cook `silt_carp` ×10 | `silt_carp` ×4 + `gravecap` ×4, cooked ×4 | it is the act finale about having nothing to cook with. Ten of anything contradicts the premise |
| D11 | sell `gravecap` ×10 | `interact` the yield + sell `iron_shard` ×5 | the player has no source of ten gravecap, and a mining town's month is ore |
| D16 | `evade` + `survive` | `interact reach.east.barrel` ×6 + `survive` | §6.5 — `gather` has no water item to hang on |
| D19 | `hollow` ×8 | `blight_boar` ×4 + `mire_rat` ×8 | §6.5 — `hollow` is `immune: ['cull']` and D19's schools are Setting **and Cull** |
| D24 | `mire_rat` ×20 + sell `rat_tail` ×20 | as modelled | the rate drop is dialogue, not a `within` — failing a step for being slow is not what "the rate drops after" means |

### 6.5 Spec bugs found in Dark — reported, not edited

**a. D19 repeats the §3.1 Cull bug inside the Dark campaign.** `STORY.md` §8.2 gives **D19 Below
the Bottom** the schools Setting · **Cull**, and `campaign.js` models it as `hollow` ×8. `hollow`
carries `immune: ['cull']`. Same shape as L23, one campaign later, and §15's re-assignment table
even says D19 was moved *from* Kindle *to* Cull on purpose. **The pack uses `blight_boar` ×4 +
`mire_rat` ×8** — beasts, which is what "something is living in ground nobody has worked" wants
anyway, and which makes the Cull assignment honest. `STORY.md` §8.2's D19 row and `campaign.js`'s
`work` line should both move off `hollow`.

**D21 is the same problem a third time** and is why the pack reaches for `raider`; see §6.3.

**b. D16's `gather` verb has nothing to gather.** §8.2 gives D16 the verbs `gather` `survive` and
the objective "fill barrels". **There is no water item in `sim/tables.js`** — `foul_water` is
Blackstone's junk catch and the east stands are live water. The pack fills the barrels with
`interact reach.east.barrel` ×6 and holds with `survive`. Either add a `river_water` item or
change the row's verbs to `interact` `survive`.

**c. §7's "D14 the face at the Board" and §6 Act 3's "at the market cross" are different places.**
The quest is titled *The Face at the Board* but §6 stages the scene in Longacre's square, which is
also where the rest of Act 3 is and where Ansel appears in L16. **The pack puts it at
`lac.cross`** and keeps the title. Rename the quest or move the scene; do not leave both.

**d. The week has no day names, and Light uses one.** §4 says the week is "eight days, numbered
first to eighth. Nothing else is named", and `light.03.price` says *"The post is from Tuesday."*
Dark avoids it — `dark.12.price` says "before the eighth" — but Light's line wants a pass.

**e. A `once` node on a failable quest is a soft lock, and Light has one.** `light.22.out` is
`once: true` and is the target of `light.22`'s last step; `light.22`'s first step carries
`unseen: true`, so being seen fails the quest, `retry` restarts it at step 0, and the closing
scene will not open a second time. The Dark pack was authored around this: **no `once` node in
`dark.json` belongs to a quest with any `unseen`, `within` or `fail` step**, which is why
`dark.14.out` and `dark.16.out` are not `once` when their siblings are. It is not lintable as an
error without failing Light, so it is written down here instead.

### 6.6 What will not survive first contact with a player, Dark edition

1. **D02 asks the player to take a side in a conversation, four quests into a campaign whose
   whole premise is that they will.** If the choices read as reversible, the scene deflates. All
   three branches converge and none of them can decline — which is right, but the third choice
   ("You are a prisoner. Sit down.") needs Sela's reply to land hard or the player will feel
   railroaded rather than caught.
2. **D16 is three consecutive `unseen` steps** — goto, interact ×6, survive 90 — on ground the
   player defended in L18, at night. It is the best-conceived scene in Dark and it is one
   detection away from being a reload loop. This is `NOTES` §5.2's L22 warning, tripled. If
   stealth turns out to be twitchy, drop `unseen` from `fill` and `hold` and keep it on `night`.
3. **D24 asks for twenty `mire_rat`.** Twenty is the largest single kill count in the trilogy
   outside N-series, and `mire_rat` is a level-3 enemy fought by a level-13 character. Expect it
   to read as filler unless the Levels spawn them thickly.
4. **D21 is six steps with a 120-second hold at the end and no checkpoint**, same as L23. Two of
   those chains back to back is the pacing risk of Act 5.
5. **D22 walks from `bst.levels` to `lac.westfield`.** In the fiction it is a lamp-lit tunnel; in
   the runtime it is three `goto`s across roughly 700 m of surface world. If underground travel is
   not staged, the campaign's quietest scene is a cross-country jog.
6. **`bst.levels` carries eleven of the campaign's `interact` objects** — `mark`, `fall`, `prop`,
   `floor`, `lamp` — plus four fights and two deliveries. The Levels are a `STORY.md` §13 build
   item that does not exist yet, and Dark leans on them harder than any other location. The full
   list of object ids the Dark campaign needs:

```
bst.board.rate        bst.board.yield       bst.board.crate      bst.kitchen.bowl
bst.intake.draw       bst.levels.mark       bst.levels.fall      bst.levels.prop
bst.levels.floor      bst.levels.lamp       heath.ford.reading   reach.east.barrel
ridge.dark.mark       lac.cross.post        lac.leat             lac.mill.crate
lac.mill.hurdle       lac.millbridge.crate  lac.henhouse.hen     self
```

`ridge.dark.mark`, `lac.cross.post`, `lac.leat`, `lac.mill.crate`, `lac.millbridge.crate` and
`lac.henhouse.hen` are already on §5.7's Light list; the other thirteen are new.

---

## 7. What Dark changed in the tools

**`tools/lintQuests.mjs`.** One check removed, three added.

| Change | Why |
|---|---|
| **removed:** a `talk` step whose node has a `goto` or a `next` | §3.2's engine bug is fixed. `quest.js` `credit()` matches `event.nodes`, the whole visited list, so a step may name a branching node. The rule the check enforced is retired; branch with `goto` again |
| **added:** a Truth must be marked in a dialogue node the packs actually play | §8.5 says Truths land in dialogue, never at turn-in, and until now only "something awards it" was checked. `playedNodes()` walks every node a quest names or fires, then follows `goto` and `next`, so a Truth marked in an orphan node is an error |
| **added:** a `once` node with more than one caller | `open()` refuses a `once` node that has been seen, so the second thing that plays it — another step, an `onDone`, a choice `goto` — can never be satisfied. See §6.5e for the case this cannot catch |
| **added:** every story id `campaign.js` prices for an authored campaign must exist in its pack | a dropped quest is otherwise invisible: the act simply pays short. This is what proves Dark is 25 and not 24 |

`lintAll()` now also returns `played`, the reachable-node set, so the tests can use it.

**`tools/campaign.test.mjs`.** `playCampaign` became `playThrough(campaigns)`, which plays a list
of campaigns on **one save** and reports marks, act transitions and play order per campaign — Dark
has to be entered through Light, which is the point of the ladder. `assertCampaign()` holds the
shape every campaign must pass (reachable · act-ordered · on budget · every Truth marked by a
played node) so Neutral's author gets it for one line. Eight tests, up from six:

- Light and Dark each play end to end, in act order, paying their act budgets
- Dark offers nothing to a save that has not finished Light
- Dark opens on a trained character and on `dark.01`
- finishing Dark unlocks Neutral and grants the Short Rope
- **Dark strikes exactly the seven Light Truths §8.5 promises** — `cousin`, `raiders.east`,
  `shaft.dry`, `strike.won`, `unseen`, `vail.dead`, `wagon.eighth` — and never strikes one the
  player was not given first

**For whoever writes Neutral:** `assertCampaign('neutral', { after: ['light','dark'], truths: 12 })`
is the whole reachability and budget gate. N5 is a one-quest act, so the `[2,3,4,5]` act assertion
still holds. The Neutral budget is 4,350 mk across N1–N5.

---

## 8. The Neutral campaign, N01–N26

26 quests in the new `data/quests/neutral.json`, dialogue in the new `data/dialogue/neutral.json`,
one cast entry (`dob`), and `neutral` added to `data/quests/index.json` between `dark` and
`sandbox`. Act shape follows `STORY.md` §11's **8 · 5 · 5 · 7 · 1** and §8.3's prereqs and school
assignments. Written act by act; this section was appended the same way.

**The character arrives finished.** Nothing in Neutral teaches a verb, a school or a control. N01 is
a walk and a door. N02 is fourteen grain rats at Cull ~16, which is not a fight — it is a chore the
player has done twice before in two other towns, and that is the beat. The only new capability in
the campaign is Graft, and it arrives at the end of Act 1 as a *scene*, not a tutorial.

### 8.1 Act 1 — A farm year (N01–N07, N22)

Play order in the file is the play order the harness takes: `01 02 03 04 05 22 06 07`. N07 carries
`["act", 2]`, so the act transition is on the last quest of the act, as Light and Dark do it.

- **N01 is deliberately tiny** — a `goto`, a `talk`, one `interact` pair on the mill hatch, a
  `talk`. It pays `xpAll` at the N1 lead (level 16), which is the largest "welcome back" payment in
  the game, and the player does almost nothing for it. That is the homecoming.
- **N02 uses `deliver(rat_tail, 14, "lac.westfield")`** — `RUNTIME.md` §2.1's own example, with
  §3.5's area id correction. The tails come off the fourteen kills, so the pack grants nothing; the
  `recover` grants them back if the player sells them by accident, which they will.
- **N04 grew a fifth and sixth step.** §8.3 promises N04 two Truths (`prices.both`,
  `boundary.moves`) and the objective cell only describes the price post. The boundary post is a
  second `interact` on `lac.westfield.post` — **the same object L15 has the player re-set two
  campaigns earlier**, which is the callback §7's table asks for. Wick's line does the rest.
- **N05's "Eat it. Notice."** is `interact("self", 1)` with `verb: "hearth"`, the same shape D02
  used for taking the robe off. No item is eaten and none needs to exist.
- **N22 seats the player at the barn table four acts before N17 says what the table is**, per §7.
  Hana's closing line is the plant: "You will want to remember sitting there."
- **N06's two guests are `ivo` and `ossa`** — both already speak in the shipped packs, so no cast
  entry, and both are the right person: §9 says Ivo buys Longacre flour and does not record it, and
  Ossa is the only outsider Hana respects. The hold is `survive("lac.square", 60)` with
  `fail: ["flag", "neutral.06.met", true]`, which is `RUNTIME.md` §2.1's own recipe. **Nothing sets
  that flag yet** — until the world stages the two guests, the step is an unfailable minute.
- **N07 grants three `hearth_ash`** as `reward.items`. `hearth_ash` is in `ITEM_VALUE`, so it is not
  a sixth lint warning, and without it the capstone spell the quest grants cannot be cast until the
  player works out where ash comes from. `SPELLS.graft` already carries `consumes: 'hearth_ash'` and
  `quest: 'N07'`.
- **The graft itself is `interact("self", 1)` with `verb: "graft"`** — `RUNTIME.md` §2.1's third
  "candidate ninth primitive", authored exactly as that table says it should be. `graft` passes the
  linter's verb check because it is a spell id in `sim/spells.js`.

### 8.2 Act 2 — Wearing Whitewall (N08, N23, N09, N10, N11)

**This act is where the `worn` step modifier earns its place**, and it is the first content in the
game to use it. `questdef.js` already normalises `worn`, and `quest.js` `stepOpen()` already refuses
a step whose `worn` does not match `ctx.worn`; nothing had ever set it.

- **N08, N09 and N11 each re-graft before they infiltrate.** One `interact("self", 1)` step at the
  barn hearth, then every step inside Whitewall carries `"worn": "light"`. It is repetitive on
  purpose: the ash cost and the channel are what make the disguise a plan rather than a toggle.
- **N23 is the mirror and carries `"worn": null`.** Two towns, both markets, the player's own face,
  and nobody stops them. `worn: null` is a real constraint in the schema — `undefined` means "any
  appearance", `null` means "no appearance" — so the contrast is mechanical, not just written.
- **N08's third scene is Kesta**, because `SYSTEMS.md` §8.3 sets her `watchWeight` to 2.0 and
  `STORY.md` §9 calls her the hardest person in the valley to stand next to in a borrowed face. She
  greets Ansel warmly and asks after a harvest he never had.
- **N11's turn-in is Dob, driving the wagon.** The Truth `wagon.longacre` lands on the cart, from
  the man who was Ansel before the player was — which plants Dob two acts before N20 asks him who
  he is. `dob` is the campaign's only new cast entry.
- **N09 is the third quest in the trilogy gated on `onDay: 8`** (after L11 and L24) and the second
  gated on a High window as well. `enterStep` emits `['wait', 12, 8]` on accept, so it is a fade,
  not a wait.

### 8.3 Act 3 — Wearing Blackstone (N12, N13, N25, N14, N15)

- **N12 makes the Hearth Ash concrete.** `SYSTEMS.md` §8.3 prices a Graft at one Hearth Ash, "3
  reagents of that faction's zone plus a stone chip", so taking Sela's face begins with three
  `gravecap` off the heath and a burn at the barn hearth. The quest pays two ash as `reward.items`.
  Sedge's turn-in line — "I fostered her out. Same as you." — is the cheapest way to make the face
  the player is about to wear cost something.
- **N13's giver is Nim, per §8.3, and the quest starts two towns away.** The graft goes on at
  `heath.blackspan`, not at home, because the Drove Road is watched. The offer marker therefore
  sits on an NPC the player cannot reach as themselves; see §8.6 (i).
- **N25 is the longest chain in the trilogy at eight steps** and it crosses the valley twice. It is
  also the quest that proves the campaign's thesis, so it was not cut down — see §8.7.
- **N14 is the other side of L19.** Alder and Bel say what Whitewall would say; the branch the
  player picks changes only how quickly they give up the true thing they came to give up. The
  Truth `sela.was.you` is marked in `neutral.14.out`, after the confession, by a `player` line.
- **N15 is `goto` with `fail: ["damageDealt", ">", 0]`**, exactly as `RUNTIME.md` §2.1's table says
  "break your captivity without marking anyone" should be authored. Because that step can fail,
  **no node in N15 is `once`** — §6.5e's rule, held.

### 8.4 Act 4 — The root (N24, N16, N26, N17, N18, N19, N20) and Act 5

- **N16 is the pay-off for an `interact` id planted in Light.** `lac.westfield.post` is L15's
  gatepost and N04's boundary post; `lac.westfield.spit` is where N02 buried the tails. The dig
  re-uses both, so the player has already stood on the root four times.
- **N17 is six people at a table staged as three two-handers** (`STORY.md` §10 rule 2): Hana seats
  the player, Sedge gives the history and `household`, Hana answers "what was I for" and gives
  `fostered.policy`. Wick, Fen and Dob are named in the lines and never rendered.
- **N19's ledger lives in the Moot Hall** (`lac.moot.ledger`), not on the cross, because the post
  only carries this season. The post gives four seasons, the ledger matches each number to what
  followed it, and `prices.raids` lands on a `player` line, not on Wick's.
- **N20 carries `["merge", "ansel", "dob"]` in `onDone`.** That is `RUNTIME.md` §4.4's
  one-portrait-two-names effect. **Nothing implements it** — `questrunner.apply()` ignores unknown
  effects — so today it is a no-op hook. See §8.6 (e).
- **N21 puts the posture choice before the fight.** Three choices, three flags
  (`neutral.posture.tend` / `.take` / `.keep`), all `goto: null`, so the step credits on the entry
  node whichever the player picks. The bridge fight and the 120 s hold are common to all three; the
  posture is what the slate reads afterwards. `SYSTEMS.md` §13 asks for a real `posture` field on
  the save and dialogue `sets` can only write flags — see §8.6 (f).

### 8.5 The sandbox board, S01–S20

`data/quests/sandbox.json` is now the full twenty. **The board pays no marks at all.** A quest with
no `story` id in `QUESTS` falls through `rewardFor()` to `def.board.school`, which pays
`questXp(levelFor(player's xp in that school), QUEST_WEIGHT.chore)` and nothing else. Measured with
every school at level 20, the whole board pays **0 mk**, which is the correct answer to the review
that caught an authored payout formula: the board is an XP tail and a reason to walk somewhere, not
an income source. Sale proceeds from what the work drops are the income, and they are §7's.

**Where they are posted.** `boardRoll(defs, seed, day, town)` filters on `!d.town || d.town === town`
and draws `BOARD_SIZE` = 3 by weight, without replacement.

| Board | Posts in its pool |
|---|---|
| Whitewall | S01 S05 S07 S14 S15 S19 |
| Longacre | S03 S08 S10 S11 S12 S18 S20 |
| Blackstone | S06 S09 S13 S17 |
| every board | **S02 S04** S16 |

- **S02 and S04 carry no `town` and `weight: 40`.** `STORY.md` §8.4 wants them posted on every board
  every day, and `BOARD_ALWAYS` in `campaign.js` says so — but **`boardRoll` does not implement
  `BOARD_ALWAYS`; only `tools/soak.mjs` does.** Weight 40 against the pool's 1–3 is the data-side
  approximation: over 24 rolled days in all three towns they took 20–24 of 24 slots each. See
  §8.6 (g) for the one-line engine fix that would make it exact.
- **The posts are not parameterised, because the runtime cannot parameterise them.** §8.4 says
  "building, species, count and town are rolled when the board offers it" and `RUNTIME.md` §2.4
  gives `board: { weight, params }`, but `boardRoll` returns quest ids and `questdef.js` keeps
  `board` as opaque data. Each post therefore names one building, one species and one count. This
  is the single biggest gap between the sandbox as designed and the sandbox as shipped.
- **S08 Raise a Shed is `REVIEW.md`'s deferred ninth primitive.** It is authored as `gather` four
  chalk chips then `interact` a marked plot four times, which is what "place a structure" means
  with the eight. If the world ever gets a real placement verb, this is the quest to revisit.
- **S12 Lost Hen is given `board.school: "ward"`.** §8.4's row says `—` and `campaign.js` carries
  `school: null`, and a board quest with no school **pays literally nothing** — see §8.6 (d).
- **Prereqs are arrival, not level.** Whitewall posts open after L01, Longacre's after L13 (the
  first walk down the valley), Blackstone's after D01. S15 waits for L18 because hollows on the
  march road before Act 4 would be a death sentence.

### 8.6 Spec bugs found in Neutral — reported, not edited

**a. `STORY.md` §7's opening line says "Five acts, 21 quests plus an epilogue screen."** §8.3 lists
**26**, §11's pacing table says 26 in 8 · 5 · 5 · 7 · 1, and §8's headline count of 99 only works at
26. The 21 is left over from revision 2. The pack is 26.

**b. §8.5's "Where the strikes land" undercounts Neutral, and the sentence above the table repeats
it.** It says Neutral strikes 7, and "finishing Neutral strikes seven more". The data in
`truths.json` — which is correct and which I did not touch — has Neutral striking **thirteen**:
ten Truths earned in Light and Dark (`ansel.nobody`, `count.never.holds`, `fostered`, `raid.water`,
`seam.west`, `sela.face`, `strike.undone`, `thirty.years`, `wagon.watched`, `walls.wrong.way`) plus
three of its own (`vermin.field`, `prices.both`, `boundary.moves`) under `root.longacre` and
`prices.raids`. Dark's 7 is right because it counts only Truths from *Light*; the same reading of
Neutral gives 2. **The fix I would apply:** change the Neutral row to "13 (10 of them earned in the
first two campaigns)" and the sentence to "finishing Neutral strikes ten the player earned
elsewhere". `tools/campaign.test.mjs` asserts the ten by name, so the list is now testable.

**c. `campaign.js` models N18 as `kill champion_1 1` + `grain_rat 12`.** N18 is Sedge teaching the
two-core cast and testing it **on the voles in the strips**; a level-14 boss in a turnip field is
not that scene, and N4's band is 19. **The pack fields `grain_rat` ×12 + `rat_knot` ×4 in `fields`**
and keeps Kindle and Cull honest by casting one core with each `verb` on the practice mark. N24
keeps its `brood_mother`, which is the act's real set piece and is correctly placed.

**d. A board quest with no `board.school` pays nothing at all.** `rewardFor()` pays a sandbox post
`xp[def.board.school]` and `mk: 0`; with no school it returns `{}`. §8.4 gives **S12 Lost Hen** the
schools `—` and `campaign.js` gives it `school: null`, so as specified it is a repeatable chore
with no reward of any kind. The pack assigns it **Ward** — driving a stray home is the same work
S13 pays Ward for, and there are no mundane skills in this game. Either bless that, or have
`rewardFor` fall back to a small all-school share for a schoolless post.

**e. `RUNTIME.md` §4.4 names the wrong quest and a cut character.** It says the portrait merge fires
"when N24 resolves" and that the effect is `['merge', 'ansel', 'kettle', 'dob']`. N24 is *What Feeds
on It* since revision 3; the Dob scene is **N20**. "Kettle" was **cut** in revision 3 (§15: "Dob has
two faces, not three"). The pack authors `["merge", "ansel", "dob"]` on N20, and
**`questrunner.apply()` has no `merge` case**, so it does nothing today. Track B owns the effect and
the cast strip; the data is ready for it.

**f. There is no way to write a `posture`.** `SYSTEMS.md` §13 and `STORY.md` §11 both want a
`posture` field on the save; `save.js` already carries `campaign.postures`. Dialogue `sets` can only
emit the effects `questrunner.apply()` knows, and the only one that writes to the save is `flag`. So
N21 writes `neutral.posture.tend|take|keep`. If Track B adds a `['posture', id]` effect I will swap
the three `sets` in `neutral.21.posture` for it; until then the slate should read the flags.

**g. `boardRoll` ignores `BOARD_ALWAYS`.** `campaign.js` exports it, `tools/soak.mjs` honours it and
`js/game/quest.js` does not. The fix is one line at the top of `boardRoll` — seed `out` with the
`BOARD_ALWAYS` ids that survive the town filter, and remove them from `left` — after which S02 and
S04 can go back to a weight of 1. Until then they carry `weight: 40`.

**h. Nothing supplies Hearth Ash except two quests.** `SPELLS.graft` consumes `hearth_ash` and
`STORY.md` §12 says it is free at any Longacre hearth and 350 mk anywhere else. `SHOP` has no entry
and no gather source produces it. **The Neutral campaign has nine `graft` steps and grants five ash
(N07 ×3, N12 ×2).** If the free-at-a-hearth rule is not implemented before playtest, Act 3 stalls
on the sixth graft. This is Neutral's hardest external dependency.

**i. N13's giver stands in a town the player cannot enter as themselves.** §8.3 gives *Down the
Ladder* to Nim, and the first thing the quest does is put Sela's face on at Blackspan. The offer
marker is therefore on an NPC two towns away and behind a disguise. It works — the prereq is N12 and
the player knows where they are going — but if offer markers turn out to need line of sight, move
the giver to Sedge and keep Nim's two scenes where they are.

**j. `ctx.worn` is read and never written.** `quest.js` `stepOpen()` has always honoured the `worn`
step modifier and nothing in `js/game/` puts an appearance into the quest context. Twenty-four steps
in this pack now depend on it. Whatever sets `player.wornId` (`SYSTEMS.md` §8.3) must also put it in
`questrunner.ctx()`, or every infiltration step in the campaign is inert.

### 8.7 What will not survive first contact with a player, Neutral edition

1. **The graft steps are a hard dependency on Hearth Ash and on the Graft cooldown.** Nine of them,
   with `SYSTEMS.md`'s 3 s channel and a "no aware NPC within 22 m" precondition. If ash is scarce
   or the channel is easy to interrupt, the whole of Acts 2 and 3 is a supply problem rather than a
   spy story. §8.6 (h).
2. **N25 crosses the valley twice in eight steps** — Whitewall's kitchen, the ford, Blackstone's
   kitchen — and `STORY.md` calls it "the same day". I did not author a `within`, because failing
   the campaign's best exercise on a clock would be miserable, but that means the "same day"
   is fiction the world has to sell. Roughly 1,100 m of walking.
3. **N23 is the same walk with a `before: 12` on the Whitewall leg.** It is the one quest in the
   campaign the player does with their own face, which is the point, but it is also the second
   longest walk in the game after L21.
4. **Two `onDay: 8` gates in one act.** N09 (High, eighth day) and N11 (05:00–09:00, eighth day) are
   four quests apart. The engine fades to the window on accept, so neither should be a wait — but
   Act 2 is five quests long and two of them are on the same rare morning.
5. **N24's `brood_mother` is a level-6 boss fought by a level-19 character.** It is `campaign.js`'s
   number and I kept it, but the thing that has been eating two centuries of buried vermin should
   not die in four casts. Expect to re-band it, or to give it the field's own Glut.
6. **N14 and N15 keep the player in a cell across a quest boundary.** `STORY.md` §13's fourth ask of
   `SYSTEMS.md` is still open: a reload that respawns at the Whitewall hearth either breaks N15 or
   completes it for free, and the global hearth is `wwa.kitchen`, forty metres from the cells.
7. **Nothing sets `neutral.06.met`,** so N06's "keep them apart" is currently a minute of standing
   in the square. The scene needs the two guests to be able to walk into each other.
8. **All three N21 postures play the same six steps.** Only a flag and the slate text differ. That
   is the honest cost of a linear step list and it is defensible — the *choice* is what the campaign
   has been about — but a player who expected Keep to actually stop the battle by hand will notice
   they killed ten Watchmen on the way to choosing it.
9. **No step in Neutral uses `unseen`, and that is deliberate.** §5.2 and §6.6.2 both flag stealth
   failure loops as the trilogy's biggest playtest risk. A grafted player is *meant* to be seen and
   pass; suspicion, not detection, is the mechanic. If the Watch turns out to break Grafts too
   easily, the campaign degrades gracefully — you re-graft and walk back in — where an `unseen` step
   would have failed the quest.
10. **The object ids the Neutral campaign needs.** Everything in the pack that is not already on
    §5.7's or §6.6's list:

```
lac.mill.hatch        lac.westfield.spit    lac.westfield.thorn  lac.westfield.pear
lac.westfield.seam    lac.westfield.mark    lac.barn.table       lac.barn.crate
lac.barn.hearth       lac.moot.ledger       lac.cotts.slate      lac.stables.plot
wwa.market.stall      wwa.market.kerb       wwa.cells.hinge      bst.chantry.slate
bst.levels.chest
```

`lac.westfield.post`, `lac.cross.post`, `lac.leat`, `lac.mill.crate`, `lac.millbridge.crate`,
`lac.henhouse.hen`, `wwa.temple.font`, `wwa.fence.panel`, `wwa.lamp`, `bst.levels.prop`,
`bst.board.rate` and `self` are re-used from Light and Dark, which is deliberate: the West Field
post the player re-sets in L15 is the boundary post that moves in N04 and the fence they dig under
in N16.

### 8.8 What Neutral changed in the tools

**`tools/lintQuests.mjs` — untouched.** Two other agents were editing it. Two rules I would like,
described here instead:

| Rule | Why |
|---|---|
| **relax:** a campaign's terminal quest may unlock nothing | `graphErrors` requires every terminal quest to carry an `unlock`, which is right for L24 → `dark` and D22 → `neutral` and impossible for **N21**, because nothing follows the trilogy. The epilogue is text on the slate, not a quest. Today `neutral.21` carries `["unlock", "neutral"]` **purely to satisfy this check** — a no-op that re-sets a flag that is already true. Either accept `trilogy` as an unlock target next to the three campaign ids, or exempt a quest whose campaign has no later act. Then delete that line from the pack |
| **add:** warn on a `board` quest with no `board.school` | it pays nothing; §8.6 (d). One line next to the existing "no `story` id, so it pays nothing" warning |

**`tools/campaign.test.mjs`.** Eight tests became fifteen. `playThrough()` gained two things: it now
records each campaign's **starting school XP** (`per[c].before`), and it **wears what the step it is
playing asks for** — one `worn` variable set from `s.worn`, the same way `clockFor` supplies the
hour. Without that, every `worn` step in the pack is unreachable by the harness, because
`stepOpen()` correctly refuses them.

Seven new tests:

- Neutral plays end to end on one save after Light and Dark, in act order, paying its budgets
- **Neutral offers nothing from a blank save, nothing on the White Cord alone, and exactly
  `neutral.01` once the Short Rope is tied** — the ladder's third rung, asserted at both ends
- Neutral opens on a character with XP in all ten schools, none of it lost between campaigns
- **Graft gates every step that wears another town** — all 24 `worn` steps are in Neutral and every
  one of them is played after N07
- a `worn: "light"` step does not advance on a bare context and does advance on `worn: 'light'`
- Neutral strikes the ten named Truths the first two campaigns left standing (§8.6 b)
- the whole ladder on one save ends with the Long Furrow, and `g.truths` is **empty**, which is the
  mechanical statement of "Truths are marked in dialogue, never at a turn-in"

### 8.9 Where the pack differs from `campaign.js`'s `work` model

| Quest | `campaign.js` models | The pack asks for | Why |
|---|---|---|---|
| N02 | `grain_rat` ×14 + `interact` 2 | as modelled, plus `deliver rat_tail 14` to `lac.westfield` | the burial is the Truth. `RUNTIME.md` §2.1's own example, with §3.5's area id |
| N04 | `sell ford_eel 10` + `interact` 2 | sell ×8, `lac.cross.post` ×3, `lac.westfield.post` ×2 | §8.3 promises two Truths and describes one errand. The boundary post is the second |
| N05 | `forage` 8 + cook `wheatglass` 12 | glean 6, bake 2, eat 1 | twelve loaves is a bakery. The quest is one loaf and a shock |
| N18 | `champion_1` ×1 + `grain_rat` ×12 | `grain_rat` ×12 + `rat_knot` ×4 | §8.6 (c) — the quest tests a cast on voles |
| N21 | `survive` 300 + `watchman` ×10 + `champion_3` | `survive` 120, otherwise as modelled | D21 set the precedent at 120; a five-minute hold with no checkpoint is §6.6.4 twice over |
| N22 / N25 | cook 14 / cook 6 + 6 | 6 loaves / 3 and 3 | the same cook-count fix §2 made to L26 and L28 |

Everything else follows `campaign.js`. All 26 story ids it prices are claimed, which the linter now
proves, and the campaign pays **4,351 mk against the 4,350 mk of the five Neutral act budgets** —
1 mk of rounding in N3, asserted exactly in `tools/campaign.test.mjs`.

**State after Track D:** all three campaigns and the full board are authored, and `raider` landed in
`sim/tables.js` while this act was being written, so §6.3's dependency is closed.

```
node tools/lintQuests.mjs     99 quests · 399 steps · 175 dialogue nodes · 7 warnings · 0 errors
node tools/lintText.mjs       175 nodes · 698 lines · longest 43/46 · 0 warnings · 0 errors
node --test                   296 pass, 0 fail
```

The seven warnings are the five §0 already had plus `sandbox.07` and `sandbox.15`, both
`giver board_ww has no dialogue node`. They match `packs.test.js`'s `/apprentice_cord|board_ww/`
guard, so the suite stays green; **the whole of Neutral lints warning-clean.**

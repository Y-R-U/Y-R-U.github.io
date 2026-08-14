# NOTES_CONTENT — Track D, the content record

What was authored, what was decided, and what the docs got wrong. Read this before touching
`data/areas.json`, `data/quests/*.json`, `data/dialogue/*.json` or `data/cast.json`.

**State:** `data/areas.json` covers all three towns and the countryside. The Light campaign is
complete, L01–L28. Dark and Neutral are not started.

```
node tools/lintQuests.mjs     31 quests · 124 steps · 56 dialogue nodes · 5 warnings · 0 errors
node tools/lintText.mjs       56 nodes · 217 lines · longest 42/46 · 0 warnings · 0 errors
node --test                   263 pass, 0 fail
```

**The five warnings are the pre-existing ones** (`apprentice_cord`, `board_ww` ×4) and they are
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

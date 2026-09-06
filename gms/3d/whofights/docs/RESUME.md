# WHO FIGHTS — Adventure Society pass: where this is up to

Read this first on resume. `docs/DEV_CONTRACT.md` is still binding; `docs/HANDOFF.md` describes
the *scaffold* pass and is now partly out of date — where the two disagree, this file is newer.

The first pass (the five-storey Society, the proving, essences, the controls) is committed as
`dd0ee802`. **The second pass — §6 below — is not.** `git -C ~/cc/yru/site status` shows it.

---

## 0. The brief

Aaron asked for, in this order:

1. **The building.** The Adventure Society is a multi-storey building, not a castle. High ceilings
   on every floor. One very large spiral stair with auto-walk between them. Ground floor is
   registration; the contract boards move up one rank per storey — Iron, Bronze, **Silver** (new),
   Gold — and the boards thin as they climb. Try to climb past your rank and you are blocked and
   somebody comes over to say so. No courtyard, no dorms, no armoury, no locked doors. Buildings
   around it (scenery only, for now).
2. **Combat.** Register by passing a test: talk to the person at the table, get teleported to a
   fight room, kill a weak earth elemental **that heals when it touches dirt**, with a knife. The
   room's floor is part stone and part dirt. Win and you are teleported back.
3. **Essences.** Then pick essences, which decide what skills you can get, one ability each.
4. **Controls.** Desktop: Space = jump, left click = attack, right click = an interact menu with
   *cast a spell / talk / trade offer*.

Then, as a second batch:

5. **Better dialogue**, and a fix for lines that overlapped the choice buttons at the end of a
   conversation.
6. **Basic spells, like FORGE's** — different colours and looks per essence type.
7. **Iron contracts made playable**, so they can be tested; monsters reused across missions with
   *variations*, so the board can change over time by varying rows rather than by building levels.
8. **A player sheet** — rank with stars, and experience to the next star.
9. **A mission panel** — transparent, minimised by default, click to expand.
10. **Health bars over the player's and NPCs' heads** rather than in a corner.
11. **The stair**: smoother to start climbing, and much faster up and down.

Four decisions Aaron made when asked:

- **Essences: pick 3, the 4th is the confluence** (book-accurate) — not four free picks.
- **Teleport: in-place level swap**, not a page reload.
- **Surrounding buildings: scenery only** for now.
- **Do all four phases in order without stopping**, checking in at each boundary.

---

## 1. Status

| Phase | State |
|---|---|
| 1 — the building | **DONE and driven-tested** |
| 2 — combat + the proving | **DONE and driven-tested** |
| 3 — essences | **DONE and driven-tested** |
| 4 — controls | **DONE and driven-tested** |

All four phases are in. `node tools/test.mjs` → **418 passing across 42 files**. Three driven UI
tests, all passing:

```bash
node tools/test.mjs                 # unit
node js/dev/stair.uitest.mjs        # 21 checks: walk in, climb, refused, climb to the top, back down
node js/dev/proving.uitest.mjs      # 28 checks: swap out, fight, dirt vs stone, win, swap back, essences
node js/dev/controls.uitest.mjs     # 20 checks: Space jumps, LMB attacks, RMB opens the menu
node tools/shot.mjs --shot=hall
node tools/shot.mjs --shot=corner --set=level=proving
```

---

## 2. What was built, phase by phase

### Phase 1 — the Adventure Society

- `data/levels/society.json` **replaces** `academy.json` (deleted). `index.json` lists `society`
  and `proving`. Level id, flags and conversation nodes are all `society.*` now.
- The Society is one `house` with `p.hall: 1` and **`p.floors: 5`**, 40 × 32 × 40 m.
- **`js/world/hallplan.js` `hallStoreys(plinth, wallTop, ceilK, floors)`** is the one place the
  storey split lives. `buildings.js house()` reads it for the exterior window rows and
  `interior.js` reads it for the rooms. `floors: 1` comes back out of it as the numbers a hall has
  always had, so the single-storey hall is untouched.
- **`js/world/stairplan.js`** — new, pure, 14 tests. The helix: one turn per storey, no seam,
  two landings per floor (the flight leaves a floor on one side of the seam and arrives on the
  other, which is what lets the auto-walk know whether you meant up or down).
- **`js/world/grandstair.js`** — new. Draws it. Treads, newel, two balustrades, per-floor slab
  with the well cut out, per-floor rail with the gate left open.
- **`js/world/climb.js`** — rewritten to be stair-agnostic. It asks the interior for
  `landings()` / `stairPath(a,b)` / `stairCentre()` / `headroom(y)`, so the cottage loft
  (`stairs.js`) and the Society helix share one auto-walk. It also has a **`gate(from,to)`** hook.
- **The rank gate has two halves** and both are needed: `climb.gate` refuses the scripted climb
  (and fires a refusal conversation), and `doors.floorLimit` → `Interior.climbLimit` closes the
  flight itself so you cannot hand-walk up it. The driven test caught the second one missing.
- `js/game/contracts.js` rewritten: `RANKS` gains **silver**, rank flag is `society.rank`,
  `RANK_FLOOR` maps rank → storey, `topFloorFor` / `mayEnterFloor` / `floorRank` are the gate's
  arithmetic. Boards thin as they climb — 9 / 8 / 5 / 3.
- **Hotspots can be pinned to a storey**: `shape.y` + `shape.yr`. Five floors of one room means
  every board is the same circle from above. Absent, a hotspot is on every floor, which is what
  everything authored before storeys meant.
- Scene schema additions: `p.floors` on a house, `o.floor` on an `inside` object, `shape.y`/`yr`
  on a hotspot, `shot.floor`, and the `plot` type (§ Phase 2).
- Cast: `greeter` **keeps its id** (96 generated bark clips and 11 line takes are keyed to it) and
  is now *Registrar Vail*. New: `doorward` (Warden Bel, at the foot of the stair) and
  `clerk_iron|bronze|silver|gold`, one per contract floor.
- Two exterior bugs found by looking at the render and fixed:
  - `buildings.js` rolled the hall's roof ridge on a coin toss while `interior.js` hard-codes it.
    Three times in four they agreed; the Society's seed was the fourth and its interior roof crown
    came out through the slate. The draw is still taken (R() is one stream) but a hall ignores it.
  - `ceilK` (a 1.1 zone multiplier) is now applied only at `floors: 1`. Stacked, it put the top
    wall plate above the wall top outside.

### Phase 2 — the proving

- **`js/game/vitals.js`** — health, and `inSwing` (a cone, not a sphere).
- **`js/game/ground.js`** — `surfaceAt` / `isDirt` over the level's `plot` objects. Last plot wins.
- **`js/game/foe.js`** — the earth elemental as a pure state machine. `EARTH` tuning is balanced
  **against the knife**: `regen: 24`, `regenDelay: 0.3` vs a 9-damage swing on a 0.75 s cooldown.
  At the first tuning (`regen 8.5, regenDelay 0.9`) the delay outlasted the cooldown, nothing ever
  mended, and it died on soil in seven seconds — the dirt did nothing. There is a test asserting
  the relationship now, so the two cannot drift apart silently.
- **`js/world/elemental.js`** — the body. Dark rock with an additive seam that opens as it is cut
  and pulses as it mends. That pulse is the whole readability of the fight.
- **`js/game/combat.js`** — the runtime. Installed for any level with a `foes` list, inert
  otherwise. Reports `combat.end` with an outcome and knows nothing about ranks.
- **`js/world/plots.js`** — floor patches. They do **not** go through `getMaterial()`: the outdoor
  triplanar projection's ground skirt darkens whatever is near the ground, which for a floor is all
  of it, and the first arena came out four black rectangles. Same trade `interior.js` makes.
  Surface mapping is written down because the kit's names are not the game's: `ground` is meadow
  grass and `road` is a beaten track, so `stone` → `flagSet` and `dirt` → `road` tinted brown.
- **`js/game/levelswap.js`** — in-place level change. Replaces world / doors / props / cast; keeps
  lighting, both body pools and the player. `App.remove()` is new. An arrival may name a door with
  **`at.inside`**, which stands the room up before the player is placed — without it, a point
  inside a building is inside its collider box and the walk world shoves the player out through the
  nearest wall (this put him ten metres behind the Society).
- `Session.adoptLevel` re-points `window.__wf.{level,world,doors,characters}`. Leaving it stale
  made every dev tool and UI test blind to a swapped level.
- `data/levels/proving.json` — a walled yard, 40 × 40, with a **cross of flagstone and four dirt
  quadrants**. Player starts on stone; the elemental starts on dirt.
- The player has a knife (`player.arm()`, `player.hand`), and the HUD has two health bars that are
  hidden outside a fight.

### Phase 3 — essences

- **`data/essences.json`** — 12 essences × 5 abilities (60), 18 confluences × 3 (54). The nine
  Aaron named are all there (void, fire, doom, water, chaos, destruction, manipulation, wind,
  earth) plus life, dark, blood so the confluences have something to combine with.
- **`js/game/essences.js`** — pure, 13 tests. Pick 3; the 4th is looked up. A named `exact` triple
  wins (Dark+Blood+Doom = Sin, Fire+Water+Wind = Tempest, …); otherwise the confluence is matched
  on the **tags** the three carry, and there is a catch-all so **every one of the 220 triples
  resolves**. There is a test that walks all 220.
- `awaken()` gives one ability from each of the four — the first listed, which is each essence's
  signature one.
- **`js/game/essencesheet.js`** — the picker. All twelve on one sheet with all five of each one's
  abilities (the first lit, the rest dimmed), because what makes an irreversible choice a choice is
  seeing what you are not taking. The confluence is named live as the third is taken.
- `js/game/save.js` keeps `doc.essences = {picked, confluence, abilities}`; ids only, so a table
  that moves on between builds does not stop an old save loading.
- `Session.showScreen('essences')` loads the table on first use, not at boot.

---

## 3. What is left

### Phase 3, remaining
1. **The picker screen.** `society.greeter.essences.pick` already fires
   `{"k":"screen","id":"essences"}`; `js/game/noticeboard.js` does not know that id, so it is
   currently a no-op. Build it in the same parchment idiom: choose 3 of 12, show the confluence
   updating live as the third is chosen (`confluenceFor`), confirm, write the save.
2. **Save shape.** `js/game/save.js` `normalise()` must keep `doc.essences =
   {picked:[], confluence:'', abilities:[]}` — it does **not** yet, so a chosen set will not
   survive a reload. This is the one piece of Phase 3 that is a correctness bug rather than a gap.
3. On confirm, set `society.essences.chosen` — the level's `hs.greeter.member` hotspot and
   `ADVENTURER_STEPS` both already read it, and `society.greeter.member` grants `society.rank: iron`.
4. A sheet to look at what you have later (`held()` returns exactly the rows for it).

### Phase 4 — controls

- **Space is a jump.** `player.js` gained a *separate* vertical state rather than a change to the
  step ease — that ease (pos.y chasing the ground) is what floats the player up a stair tread and
  onto a bridge deck, and replacing it with gravity would take the stairs with it. Airborne, the
  ease is off and gravity has the y; landing hands it straight back. Landing is only tested on the
  way down, or a jump inside the stair well stops dead against the storey above. A script taking
  over (a door, a climb) cancels the jump, because those write the position directly.
  `jumpHeight` and `canJump` are knobs.
- **Left button attacks, right button opens the interact menu.** Both are *taps*, not presses:
  the same pointer that attacks is the one that turns the camera, so a drag looks and only a drag
  that went nowhere is a click. On touch there is no second button, so a long press opens the menu.
  Right-click is owned by `worldtap.js` alone — it knows what is under the pointer — and
  `player.js` deliberately does not also read an interact edge.
- **`js/game/interactmenu.js`** — the menu (cast a spell / talk / trade offer) and the ability
  sheet. `optionsFor()` is pure and tested. All three entries are always shown; an unavailable one
  is dimmed **with the reason on it**, because a menu that changes shape each time you open it is a
  menu you have to read each time. Nothing casts yet and the sheet says so rather than pretending.

### What is genuinely left
- **Nothing casts.** The ability sheet lists what you have awakened and says so honestly. Wiring a
  spell to `combat.js` is the obvious next piece, and `KNIFE`/`EARTH` are the shape to copy.
- **No economy**, so "Trade offer" is permanently dimmed. It needs a character to declare itself a
  trader and something to trade.
- **No awakening stones**, so you keep the four abilities you start with. `held()` already returns
  the unawakened slots, and the sheet already draws them dimmed.
- **Only one fight.** `foes` is a level field; a second level with a `foes` list gets combat free.

### Known rough edges
- Grass scatter grows through the arena's flagstones. Atmospheric, but it softens the stone/dirt
  read the fight depends on. `plot`'s footprint margin is `[0.2, 0.2]` — try raising it.
- One Suno tavern song's lyrics still say "the Academy". The audio exists; the words cannot be
  changed without regenerating it. The music **set id** `academy_hall` is likewise unchanged (it
  is threaded through a manifest builder, three dev UI tests and a fixture, and never appears on
  screen); only its label now says "Society hall".
- Some of Vail's conversation lines lost their `vo` because the text changed and a clip whose text
  has moved is a lie. `data/vo.json` still holds the old records; regenerate with the Characters
  tab or `tools/vo/gen_lines.mjs`.
- The proving room is a walled **yard**, not a roofed room. Vail's line says "one room"; either
  re-word it or roof the yard.
- **`js/game/game.css` had two of my class names already.** `g-radial` (a FORGE-era radial whose
  `button { position: absolute }` stacked the interact menu's three options on top of each other)
  and `g-vitals` (whose `display: flex` beat the `hidden` attribute and left the health bars on
  screen out of combat). Both found by looking at a screenshot, not by a test. Mine are `g-imenu*`
  and `g-hpbar`/`g-hpline`/`g-hpmine`/`g-hpfoe` now. **Grep game.css before naming a class.**

---

## 4. Divergences from DEV_CONTRACT.md to record

1. **§5 hotspots** gain optional `y` + `yr` (a storey band) and a hotspot may carry them alongside
   `attach`.
2. **§5.1 objects** gain `o.floor` (which storey of the house named by `inside`), and a new type
   `plot` (a floor patch, with a `surface` string param). `FLOOR_TYPES` in `js/editor/scene.js`
   keeps floors out of the camera collider set and gives them a step-up walk box instead.
3. **The level document** gains `foes` (§ combat) alongside `shots` and `hotspots`.
4. **`at`** (the arrival point handed to `gotoLevel`) gains `inside: <doorIndex>`.
5. **§10 actions** — no new verbs, but `goto` now swaps in place instead of reloading.
6. A new §12 is wanted for essences: `data/essences.json`, the save's `essences` block, and the
   rule that a confluence is derived from the three and never chosen.
7. **Controls have changed**: Space is jump (was attack), left button attacks, right button and
   long-press open the interact menu. `Input.read()` now returns `jump` and `interact` alongside
   `attack`, and drains all three even when locked.


---

## 6. Second pass — spells, contracts, the sheet, the panel, the head bars, the stair

Everything below is **uncommitted** at the time of writing. `node tools/test.mjs` → **478 across
48 files**. Driven tests:

```bash
node js/dev/contract.uitest.mjs     # 33 checks: the sheet, the board, the arena, casting, xp, a star
node js/dev/stair.uitest.mjs        # the climb, after it was made faster
node js/dev/proving.uitest.mjs      # unchanged, still the proving
node js/dev/controls.uitest.mjs     # unchanged
```

### 6.1 Dialogue

- **The overlap Aaron reported is `place()`.** A floating bubble lives in `.g-world` at z-index 3
  and the choice band in `.g-scene` at 1, so a speaker standing low on screen — which is most of
  them once the camera has pulled in to `close` — put the last line straight over the buttons.
  `place()` now takes an `avoid` rectangle and `DialogueBox.follow()` measures the band each
  frame; a speaker whose head is behind the band has nowhere to hang a bubble from, so the line
  docks into the band's own flex column above the choices. `js/game/place.test.mjs` is new (9
  tests) and one of them is the bug.
- `data/conversations.json` went from 25 nodes to **48**. The four clerks were four signposts in
  Vail's voice; they are four people now, each with two branches and a parting line. New beats:
  what an essence *is* and what a confluence *is* (before the irreversible choice, not after),
  how to cast and what it costs, Brann taking the knife back after the proving, Brann on what to
  carry, and Warden Bel once you are on the roll — including why he is standing at the bottom of
  a staircase.
- Two new hotspots on bodies that already existed (`hs.quartermaster.back`, `hs.doorward.pass`),
  both mutually exclusive with the one they replace. `hs.greeter.near` barked as `registrar`,
  which is not a character id — it is `greeter`.
- Two new tests in `conversations.test.mjs`: **nobody has two hotspots answering at once** (the
  bug that hit the greeter in the first pass, now checked for every body and six save states) and
  **every node is reachable** from a hotspot, a character, another node, or — for the stair
  refusals alone — from `session.js`'s own template.

### 6.2 Spells

Forge's `js/world/spell.js` is the parent. Split three ways:

- **`js/game/spells.js`** (pure) — the well (100 mana, 6.5/s, always), what a cast costs, and the
  `SHAPES` table. **There is no per-ability tuning table and there must not be one**: sixty
  essence abilities and fifty-four confluence ones is a spreadsheet that would drift from
  `data/essences.json` inside a week. The ability's `kind` is the tuning (ten of them, `KINDS`);
  its essence's `spell` block is the look.
- **`data/essences.json`** — every essence gained a `spell` block: a shape name and a
  core/edge/bloom/void palette. Twelve shapes, one each, and nothing in the code branches on an
  essence id, so a thirteenth essence is data and no code.
- **`js/world/spellfx.js`** (three) — two particle clouds, one additive and one normal-blended,
  because additive cannot draw darker than the room and void/doom/dark/destruction have to. Every
  difference between fire and water is a row in `SHAPES`: `fall` arcs the bolt, `wobble` makes
  chaos stray, `curve` bends manipulation in late, `pull` runs the burst inward, `grow` widens
  life's trail, `ring` sizes the mark on the floor, `hole` opens the dark core.
- **`js/game/casting.js`** — where the well, the particles and the fight meet. The damage is
  resolved on this module's own clock against a flight time agreed up front
  (`SpellFX.flightTime`), so a dropped frame cannot eat a hit the player paid mana for.
- The **confluence** spell is blended from the three essences that made it (`blendSpell`), because
  nobody authored a palette for 220 triples and the fourth ability genuinely is the other three.
  `spells.test.mjs` walks all 220 and asserts every one of the four resolves to a drawable shape.
- **Controls**: the interact menu → *Cast a spell* still works and now really casts, and **1–4**
  cast the four abilities directly. A menu takes about a second to reach and an elemental is
  already swinging by then.
- `KNIFE`/`PLAYER_HP` moved to **`js/game/weapons.js`** so `bestiary.test.mjs` can reach the
  yardstick without reaching three.

### 6.3 The bestiary, and missions as variations

- **`js/game/bestiary.js`** — one body, many monsters. `js/world/elemental.js` now takes a
  `{rock, seam}` palette, and those two colours plus a tuning patch are the whole difference
  between an earth elemental and a brine one. **7 kinds × 6 variants = 42 monsters**, and
  `bestiary.test.mjs` proves every one of them is killable with the proving knife inside a minute
  and that no variant ever touches the *tell* (`windup`, `reach`, `arc`).
- **`js/game/missions.js`** — a mission varies along exactly four axes: `zone` (the whole
  palette), `floor`, `patch` (the two surfaces, which decide where anything that mends can stand)
  and `spawns`. `patchArena()` is a JSON transform over `data/levels/arena.json` and the result
  goes through `js/editor/scene.js` `normalise()` exactly as an authored level would, so a
  mission cannot smuggle a field past validation. **This is the answer to "vary missions over
  time": change four rows, not build a level.**
- `data/levels/arena.json` is new (the proving's geometry, no foes, a `mission.begin` hotspot),
  and `loadLevel`/`LevelSwap.to` take an optional `patch`.
- All **nine iron contracts are playable**. `missions.test.mjs` asserts the board is nine
  different fights rather than one nine times, and that the ones the writing promises will mend
  are fought where they can.
- Two new surfaces, `water` and `ash`, in `ground.js` and `plots.js`.
- **The grass through the flagstones is fixed**, and it mattered more once one arena was doing the
  work of nine. The wall-footing scatter ignores `blocked` on purpose — that ring is exactly where
  its anti-sticker tufts belong — and only refuses `paved`, which nothing was marking for a floor
  patch. `Terrain.addFloor()` makes that mark (no surface and no colour: the plot draws its own
  slab), inflated by half a grid cell because `paved()` samples the cell a point rounds into.
  `build.js` calls it for every `FLOOR_TYPES` object. The proving floor now reads as stone and
  dirt from the gate, which is the whole legibility of that fight.

### 6.4 Rank, stars and experience

- **`js/game/progress.js`** — four ranks, four stars each, and the ladder is a **lifetime total**
  rather than a per-rank pool, so each rank starts where the one below ended. The first version
  had bronze's first star at 260 against an iron top of 380, which handed a free star on
  promotion; `progress.test.mjs` has that as a named test.
- Experience is the room's own worth off the bestiary (`Combat.worth`), so a contract that swaps
  in a bigger monster pays more without a number being edited. The xp formula is under a square
  root on purpose — multiplied straight, the iron board spanned twelve to one and there would
  have been exactly one contract worth taking.
- **`js/game/sheet.js`** — the player sheet, on the boards' own parchment. Opened by the ★ button
  beside the menu.
- **`js/game/missionpanel.js`** — the contract in hand. Transparent, minimised to one line, opens
  on a tap.

### 6.5 Head bars

`js/game/healthbars.js`, projected the same way the speech bubble is. The two corner bars are
gone: they never said whose health they were, and in a room with three things in it they could
not. Elements are pooled by key and hidden rather than rebuilt.

### 6.6 The stair

Aaron: *"clunky trying to start walking up… make it go up and down much faster."*

- **The clunk was the aim test.** `watch()` measured how squarely you were walking against the
  line from the landing to the newel, which is right for a straight cottage flight and wrong for
  a helix — the Society's stair leaves its landing along a *tangent*, so a player walking exactly
  the way the treads go scored nearly zero and simply was not picked up. It takes **the better of
  two directions** now: at the newel, or along the flight's own first step (`Climb.leaves`).
  Replacing one with the other was wrong in the other direction and the stair test caught it —
  the refusal conversation stopped firing, because the test walks the player straight at the
  stair and that is how anybody approaches one.
- Capture radius 1.6 → 2.1, the speed you have to be walking 0.7 → 0.45.
- **Pace 2.2 → 4.6 up and 5.6 down**, eased in from whatever the player was already doing over
  0.28 s so the handover is not a snap from a stroll to a sprint. The camera easing rates were
  tuned at 2.2 and are scaled with the pace, or the camera would lag three times as far round the
  helix and swing into the newel.
- Faster and stickier together produced a **yo-yo**: arriving on a floor going up leaves you on
  that floor's *down* landing, and a stick still steering into the stair takes you straight back.
  `Climb.blocked` holds the landing a climb arrived at shut until the player steps off it. A timer
  was tried and reverted — one long enough to be worth having is one a held stick outlasts, and
  that is what cost two of the four storeys in the descent leg of the stair test.
  **Known cost:** the top floor and the ground floor have only one landing each, so arriving there
  and turning straight round means walking two metres off the landing before the stair will take
  you again. Worth revisiting; a rule keyed on the player having *stopped* would be better if it
  can be made not to reopen the yo-yo.

### 6.7 Three class collisions, and the guard for them

`.g-chip`, `.g-sheet` and `.g-head` were all already taken by other screens in `game.css`. All
three were found by *looking at a screenshot*. `js/game/css.test.mjs` is new and would have caught
all three: **a class with a rule block to itself may have exactly one.** It also checks that every
class the game's JS builds is one the stylesheet knows about. Mine are `g-esschip`, `g-record*`,
`g-headbar*`, `g-mission*`, `g-stars`, `g-xpbar`, `g-rankband`, `g-take-b`.

### 6.8 Completing the Iron board — objectives and waves

Nine contracts that all say "kill everything in the room" is one afternoon nine times however
different the monsters are, and half of the iron board's own writing is about *waiting* — walking
a lamp round for eight nights, sitting with a ledger until it stops. So a mission has a fifth
axis, `objective`:

- **`clear`** (the default) — the floor empty, as before.
- **`survive`** with `seconds` — still standing when the clock runs out. Clearing the floor early
  also wins it, but only once nothing more is coming.

And `waves`: `[{at, spawns}]`, the same spawn list arriving later rather than at the gate. Each
wave is fanned from a different quarter of the ring so the second group does not walk out of the
first's footprints. `Combat.reinforce()` **appends** — it may never move a foe's slot, because
js/game/casting.js banks a spell hit against an index for the third of a second the bolt is in the
air. `Combat.expecting` is what stops a `survive` contract being won on an empty floor at eleven
seconds with a wave still to send.

The clock lives on `Session.run` and is null for a plain `clear` contract, so those pay nothing
for the feature. It is cleared on a level swap and on finishing, because a clock that outlives its
level is a contract you win from the Society's front hall.

Iron now reads: **six clear, three survive**, five of them with waves, 12–50 xp, 244 for the whole
board — about 1.5 clears of it to the first four stars.

### 6.9 Bronze, and the ladder that reaches it

**Nothing promoted you.** `progress.promote()` existed and was tested and no conversation called
it, so a player who earned four stars at Iron simply stopped. Three pieces fix that:

- **A new action verb, `promote`** (DEV_CONTRACT §10, and the second addition this project has
  made to that list after `screen`). A verb rather than a `flag` because which rank you go *to*
  depends on which one you are on, and a conversation cannot know that — the ladder is
  `js/game/progress.js` and the verb asks it. It refuses below four stars, and the executor
  reports that refusal rather than swallowing it: a conversation offering a promotion the player
  cannot have is a bug in the gating.
- **Two derived flags**, `society.stars` and `society.promotable`, written by
  `Session.syncStanding()` whenever the ladder moves. The predicate language compares a flag to a
  value and cannot do arithmetic, so "four stars and there is a rung above" has to be a flag —
  and a hotspot is where the Registrar's promotion has to be gated. `hs.greeter.member` gained a
  `not promotable` so the two do not both answer.
- **`society.greeter.promote`**, where Vail takes the seal out of a drawer, breathes on it, and
  presses it into the wax with no ceremony whatsoever. The rank moves on the *parting* node so it
  lands by every path through the conversation.

**Three new monsters**, because the step up should not be "the same thing with more hit points" —
the variant system already gives that away for free. `barrow` (heavy, mends off turned earth),
`warden` (enormous, and **mends off stone**, so the arena's own floor is its ground and you have
to make it come to the corners — the earth elemental's rule inverted), and `hollow` (notices you
from anywhere on the floor and is faster than you are). Ten kinds by six variants is sixty
monsters, and `bestiary.test.mjs` still proves every one of them is killable with the proving
knife inside a minute.

On a `clear` contract, an empty floor now **brings the next wave forward** rather than leaving the
player standing about waiting out a clock they cannot see — the wave is there to make the fight
two acts, not to make it longer. A `survive` contract keeps its clock, because there the clock is
the objective.

**All eight bronze contracts are playable**: four clear, four survive, every one with waves,
56-137 xp and 705 for the board — about three clears of it to four stars, against iron's one and
a half. `missions.test.mjs` asserts bronze is more than twice iron per contract, leans harder on
the contracts you have to last out, and brings at least three monsters iron never sent.

### 6.10 What is left

- **Silver and gold boards have no missions.** They are meant to be wanted rather than taken for
  now, and `missions.test.mjs` says so out loud so their silence is not read as an oversight.
  Silver wants something the bestiary does not have — every kind in it is a lump of rock with a
  seam, and the writing on that board is about processions and things that count.
- Still no economy behind *Trade offer*, and still no awakening stones.
- The stair holds shut the landing a climb arrived at until you step off it (see §6.6), which at
  the top and ground floors — one landing each — means two metres of walking before you can turn
  straight round. A rule keyed on the player having *stopped* would be better if it can be made
  not to reopen the yo-yo.

# WHO FIGHTS — Adventure Society pass: where this is up to

Read this first on resume. `docs/DEV_CONTRACT.md` is still binding; `docs/HANDOFF.md` describes
the *scaffold* pass and is now partly out of date — where the two disagree, this file is newer.

**Nothing in this pass has been committed.** `git -C ~/cc/yru/site status` will show it all.

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

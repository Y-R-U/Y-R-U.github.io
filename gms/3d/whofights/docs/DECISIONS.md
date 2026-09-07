# WHO FIGHTS — decisions, and the reasons behind them

Why the code is shaped the way it is. Organised by subject, not by date: this is the half of the
old `RESUME.md` and `HANDOFF.md` that does not go stale, lifted out of four passes of chronology so
it can be read by somebody looking for one answer rather than by somebody catching up.

**`docs/RESUME.md` is what the game IS. This is why.** `docs/DEV_CONTRACT.md` is binding and comes
before both.

Everything here was paid for — most entries are an hour or a day somebody spent finding out. When
you change one of these, change the note with it, and when you break one on purpose say so here.

---

## 1. The yardsticks — do not move these

**`KNIFE` in `js/game/weapons.js` has not moved and must not.** It is 9 damage on a 0.75 s
cooldown — 12 a second — and it is the unit every monster in the game is balanced in.
`js/game/foe.js`'s `regen` is tuned against it, and `bestiary.test.mjs` proves all eighty-four
monsters are killable with it inside a minute. Moving the knife silently re-tunes eighty-four
fights. Everything else in the weapons table is arranged *around* it: `FISTS` below as the floor,
so a player who spent every mark is never stuck, and everything for sale above it, which
`items.test.mjs` asserts — a shop that sells a downgrade has lied to the player.

**`EARTH`'s regeneration is balanced against that knife, and there is a test holding the two
together.** The first tuning was `regen: 8.5, regenDelay: 0.9`; the delay outlasted the cooldown,
so nothing ever mended, and the elemental died on soil in seven seconds — the dirt, which is the
entire point of the proving, did nothing at all. It is `regen: 24, regenDelay: 0.3` now, and
`foe.test.mjs` asserts the *relationship* rather than the numbers so the two cannot drift apart.

**A monster's tuning is a PATCH over `EARTH`, never a replacement.** A kind that redefined every
field would wander away from the fight the proving room was measured against without anyone
noticing.

**`bestiary.test.mjs`'s sixty-second ceiling is a constraint to design inside, not around.** The
gold monsters were built to fit it. A player may arrive at gold with a dagger.

---

## 2. Combat, and the bestiary

**One body, many monsters.** A board with forty jobs on it cannot afford forty rigs and a player
does not want forty either — they want the same fight to keep asking a different question. A spawn
is `kind + variant`; the kind decides what it is made of and the variant what has been done to it.
Fourteen kinds by six variants is eighty-four monsters.

**A variant scales `hp`, `speed`, `damage` and `regen` and nothing else.** Scaling `windup` would
take away the tell, and scaling `arc` or `reach` would move the fight's geometry without saying so.

**The seam is the whole readability of the fight.** `js/world/elemental.js` draws an additive seam
that opens as the thing is cut and pulses as it mends, so you can see across the room whether it is
putting itself back together. That is what the flagstones are for.

**Builds exist because silver could not be built without them.** Up to the fourth pass every
monster in the game was the same stack of rock with two colours swapped, and the silver board's
writing is about processions and things that count. `BUILDS` in `elemental.js` — `stack`, `tall`,
`squat`, `spindly` — plus a per-kind `scale` and a matching `radius`. **Set both or neither:** a
body drawn at 1.75 with a 0.85 hit radius means the player swings at a gatehouse and misses a
boulder.

**Nothing in `elemental.js` reads a kind id.** A fifteenth monster is a row of data and no code.
Keep it that way.

**Kills are detected in one place.** `Combat.update()` compares `isDead` before and after the step,
so a kill by knife, by spell, and by the last tick of a fight are one `combat.kill` event and
`js/game/loot.js` only ever has to listen for one thing.

**`Combat.reinforce()` appends and may never move a foe's slot** — `js/game/casting.js` banks a
spell hit against an index for the third of a second the bolt is in the air.

**`Combat.expecting`** is what stops a `survive` contract being won on an empty floor at eleven
seconds with a wave still to send.

---

## 3. Essences, confluences, abilities

**There is no per-ability tuning table and there must not be one.** A hundred and twenty essence
abilities and two thousand two hundred confluence ones is a spreadsheet nobody would keep true, and
the first time it drifted from `data/essences.json` the game would be lying about what it does.
**The ability's `kind` is the tuning** (ten of them, `KINDS` in `js/game/spells.js`); its essence's
`spell` block is the look. Nothing branches on an essence id, so a thirteenth essence is data.

**Every one of the 220 triples gets a confluence of its own.** It used to be five tag rules shared
between roughly two hundred triples each — take any two entropic essences and you were an
Attrition, whichever two. `js/game/confluence.js` composes one from the three parents; the
seventeen authored ones win on their own triple and are topped up to ten abilities.

**Composition is DETERMINISTIC on the sorted triple, and that is a requirement, not an
optimisation.** The save keeps ability ids, so a player who reloads has to be handed exactly the
confluence they had. Nothing in that file may call `Math.random`, read a clock, or depend on the
order the essences happen to sit in the JSON. `confluence.test.mjs` parses the table twice and
asserts all 220 come out identical.

**A confluence's look is blended from its three parents** (`blendSpell`), because nobody authored a
palette for 220 triples and the fourth ability genuinely is the other three. One void among the
three opens a hole rather than averaging one.

**Registration draws at random, and guarantees one of the four can be thrown.** The draw is the
point — two people who take the same three essences should not be the same adventurer. But ten of
the twelve essences carry three or four defensive and utility abilities, so about one opening hand
in eight came out as four wards and a step: survivable, because you have a weapon, and a rotten
first hour of four number keys that all do something you cannot see. `awaken()` replaces one draw
rather than adding a fifth. `confluence.test.mjs` walks all 1,320 possible hands.

**Five per essence, twenty in all, and `MAX_ABILITIES === SLOTS`.** One number seen from two ends:
every ability you have gets a key, and every key has an ability on it once you are done.

**`Session.awakened()` walks the player's own four rows (`rowsOf`), not the whole table.** It used
to walk `doc.confluences`, which does not contain a composed confluence — so every generated
confluence ability failed to resolve the moment it was awoken.

**The picker lights nothing while you are choosing.** It used to light each essence's first
ability, because that was the one registration handed you. The draw is random now, so lighting one
would be the sheet promising something the desk may not give.

---

## 4. The world — buildings, interiors, doors, the stair

**`hallStoreys()` in `js/world/hallplan.js` is the one place the storey split lives.** `buildings.js
house()` reads it for the exterior window rows and `interior.js` for the rooms, so the two cannot
disagree. `floors: 1` comes back out of it as the numbers a hall has always had.

**`house()` takes `hall`.** The doorway scales with the building, the `dressed` hood over the door
is suppressed (it collided with the upper window row), and two leaves are drawn standing open as
static geometry.

**A hall's interior is built once and kept** (`doors.js` `this.standing`) because its doors stand
open and you can see into it from the road. The world is *not* hidden while you are inside one, for
the same reason, and `close()` does not dispose a standing room.

**`doors.js` dedupes by `sceneId`.** Every building is built twice — once into its block's detail
set and once into its proxy set — so a plain traverse found each front door twice. Two door records
meant two standing interiors in the same room: z-fighting on the boards and doubled light. It
looked exactly like a lighting bug for a while.

**A hall's fill light is a HemisphereLight with a `0xd8cdb8` GROUND colour** — nearly as bright as
its sky colour. A hemisphere light gives a vertical face the mean of the two, so with a dark ground
every wall and every board on one came out slate grey while the floor was in full light. That was
two wasted debugging rounds. **Do not "correct" it back to a dark ground.**

**`p.shop` on a house swaps the cottage's domestic dressing for a counter and cupboards.** A
cupboard is one merged mass on the room's three surfaces, not forty props. The counter runs
*across* the room parallel to the back wall — along the other axis it is a plank down the middle of
the floor that reads as a partition.

**`js/world/plots.js` does not go through `getMaterial()`.** The outdoor triplanar projection's
ground skirt darkens whatever is near the ground, which for a floor is all of it, and the first
arena came out as four black rectangles. The kit's surface names are not the game's: `ground` is
meadow grass and `road` is a beaten track, so `stone` → `flagSet` and `dirt` → `road` tinted brown.

**`Terrain.addFloor()` marks a plot `paved`** so the wall-footing scatter stops growing grass
through the arena's flagstones — which mattered a great deal once one arena was doing the work of
forty. It is inflated by half a grid cell because `paved()` samples the cell a point rounds into.

**The rank gate has two halves and both are needed.** `climb.gate` refuses the scripted climb and
fires a refusal conversation; `doors.floorLimit` → `Interior.climbLimit` closes the flight itself so
you cannot hand-walk up it. The driven test caught the second one missing.

**The stair takes the better of two directions.** `watch()` measured how squarely you were walking
against the line from the landing to the newel, which is right for a straight cottage flight and
wrong for a helix — the Society's stair leaves its landing along a *tangent*, so a player walking
exactly the way the treads go scored nearly zero. Replacing one test with the other was wrong in
the other direction and the stair test caught that too.

**`Climb.blocked` holds the landing a climb arrived at shut until the player steps off it.**
Faster and stickier together produced a yo-yo: arriving on a floor going up leaves you on that
floor's *down* landing. A timer was tried and reverted — one long enough to be worth having is one
a held stick outlasts. **Known cost:** the top and ground floors have one landing each, so arriving
and turning straight round means walking two metres first.

**`people.js` has no ambient crowd.** Every figure comes from `data/characters.json` through
`People.place()`. `fixY` pins a body to an interior floor instead of the terrain; `indoor` skips
`walkStep` for that one building's box, because an indoor body stands inside a collider the whole
time and would be shoved out through the wall.

**`doors.js peek(i)` is a render hook, not a game path.** It stands a room up with no player
involved so a `?shot=` scenario can look inside one, and `stalePeek()` tears it down the moment
anybody is actually playing — a peek that nothing cleared once pinned `indoor` for a whole session.

---

## 5. Levels, missions, the arena

**A mission is four rows of data, not a level.** `js/game/missions.js` varies `zone`, `floor`,
`patch`, `spawns` and `objective`; `patchArena()` is a JSON transform over `data/levels/arena.json`
and the result goes through `js/editor/scene.js` `normalise()` exactly as an authored level would,
so a mission cannot smuggle a field past validation. **This is the answer to "vary missions over
time": change four rows, not build a level.**

**`goto` swaps in place; it does not reload.** The proving is a round trip in the middle of a
conversation and a reload there is a black screen, a boot splash and the world built twice for a
fight that lasts a minute.

**An arrival may name a door with `at.inside`,** which stands the room up before the player is
placed. Without it a point inside a building is inside its collider box and the walk world shoves
the player out through the nearest wall — this put him ten metres behind the Society.

**`Session.adoptLevel` re-points `window.__wf.{level,world,doors,characters}`.** Leaving it stale
made every dev tool and UI test blind to a swapped level.

**A level may LEND a weapon (`loaner`).** The proving is the only thing that uses it. This exists
because `Combat.load()` used to arm the player from *"does this level have anything to fight in
it"*, so the Society's knife came back at the gate of every contract however many times the
Registrar had taken it off you — the bug that started the third pass.

**A `clear` contract brings its next wave forward on an empty floor.** The wave is there to make
the fight two acts, not to make it longer. A `survive` contract keeps its clock, because there the
clock is the objective.

**The mission clock lives on `Session.run` and is null for a plain `clear`,** so those pay nothing
for the feature. It is cleared on a level swap and on finishing — a clock that outlives its level is
a contract you win from the Society's front hall.

**Experience is the room's own worth off the bestiary, under a square root.** A contract that swaps
in a bigger monster pays more without a number being edited. Multiplied straight, the iron board
spanned twelve to one and there would have been exactly one contract worth taking.

**The ladder is a lifetime total, not a per-rank pool.** One number in the save, one on the sheet,
and no explaining why the six hundred you earned at iron went away. Each rank's ladder begins where
the one below it ended; the first version had bronze's first star at 260 against an iron top of 380
and handed a free star on promotion.

---

## 6. Save, economy, items

**Ids only, everywhere.** `doc.essences`, `doc.gear` and `doc.slots` all keep ids and drop what the
table no longer knows, rather than a save refusing to load because a build moved on.

**`doc.items` is a counted bag and four functions are the only things that touch it** — a count can
never go negative and a zero can never linger as an empty row. `take()` never partially removes, so
a caller cannot half-spend.

**Nothing outside `js/game/economy.js` may hold a price.** Pacing is a thing you find out by
watching somebody play, so it lives behind `tuning()`/`retune()` where the debug tab's Economy
panel can move it while the game is running. If you type a number of marks anywhere else, it
belongs in `DEFAULTS`.

**Awakening stones roll per CONTRACT, not per kill.** Sixteen of them is the whole distance to
Bronze and that distance should be measured in work finished — per kill, a `survive` contract with
three waves would pay four times what a one-monster clear pays for the same afternoon.

**Nothing is dragged in any UI.** A drag behaves differently on every phone and there is no version
of it that reads the same on a desktop. A thing is picked and then sent somewhere by a button that
says where it is going.

**Assigning to an occupied ability slot SWAPS.** Dragging a thing onto an occupied slot and having
the occupant vanish is how you lose an ability you were using.

**`js/game/slots.js` only ever fills holes.** A new ability lands on the first free key by itself;
an arrangement the player made is never rearranged behind their back.

**Buying a weapon with empty hands equips it.** Nobody buys their first sword in order to carry it
about in a sack, and making them find the bag to use the thing they just bought reads as the game
being broken.

---

## 7. Screens, and the CSS hazard

**`js/game/game.css` is one 1500-line stylesheet shared by a dozen screens, and `g-` prefixing is
not enough.** A new screen taking a name an old one owns inherits its layout. It has happened five
times: `.g-chip` (the HUD's absolutely-positioned notification) stacked four essence names over the
player sheet's title; `.g-sheet` (the full-screen slide-in panel) pinned that sheet to the left
edge; `.g-head` is the pause menu's header; `.g-radial`'s `button { position: absolute }` stacked
the interact menu's three options on top of each other; and `.g-vitals`'s `display: flex` beat the
`hidden` attribute and left the health bars on screen out of combat.

**Every one of the five was found by opening a screenshot, not by a test.**
`js/game/css.test.mjs` is the guard: a class with a rule block to itself may have exactly one, and
every class the game's JS builds must be one the stylesheet knows about. **Grep `game.css` before
naming a class,** and run `node tools/test.mjs css`.

**Every class in `style.css` is `wf-` prefixed** for the same reason — a bare `.row` there silently
reshaped a dev-hub toolbar, because that stylesheet shares a document with the overlay.

**A speech bubble docks into the choice band when it has nowhere to hang.** A floating bubble lives
in `.g-world` at z-index 3 and the choice band in `.g-scene` at 1, so a speaker standing low on
screen put the last line straight over the buttons. `place()` takes an `avoid` rectangle now.

**An unavailable menu option is shown, dimmed, with the reason on it.** A menu that changes shape
each time you open it is a menu you have to read each time.

**Screen ids are one flat space** (DEV_CONTRACT §10) and each screen claims its corner of it. The
boards own everything unclaimed, which is why `Session.showScreen()` reads as a list of exceptions.

**Use typographic marks, not emoji.** `⚔` and `✋` are rendered by the system's colour emoji font
on macOS and iOS whatever the stylesheet says, and two glossy stickers on a sheet of parchment look
like a rendering bug.

**The graphics knobs are the first thing in the settings sheet.** FORGE shipped with them only in
the developer panel behind a ⚙ and a slow laptop had no way back from `high`. `Session.autoDetect`
steps the preset down after six seconds of play on a save that has never chosen, and touching any
of the three controls counts as choosing, so it never fights a player who has already decided.

---

## 8. Input and controls

**Space is a jump, and it is a separate vertical state rather than a change to the step ease.**
That ease — `pos.y` chasing the ground — is what floats the player up a stair tread and onto a
bridge deck, and replacing it with gravity would take the stairs with it. Landing is only tested on
the way down, or a jump inside the stair well stops dead against the storey above.

**Left button attacks, right button opens the interact menu, and both are taps rather than
presses.** The same pointer that attacks is the one that turns the camera, so only a drag that went
nowhere is a click. On touch there is no second button, so a long press opens the menu. Right-click
is owned by `worldtap.js` alone — it knows what is under the pointer — and `player.js` deliberately
does not also read an interact edge.

**What is in the off hand takes the left button before the fight sees it.** A player who
deliberately put a stone in their hand did not also mean to swing.

**The number row is twenty keys**: 1–9 and 0, then the same with Shift. The bar and the keyboard
are the same twenty things in the same order, so a player who learns one has learnt the other.

**A locked `Input.read()` still drains every edge.** A jump banked behind a conversation and applied
the frame it closes is a player launched into the air by a button they pressed a minute ago.

**Casts are drained in `Session`, not in the movement update.** The press happens deep inside the
movement update and a cast resolved from there would spawn particles against a player position that
is still being pushed out of a wall.

**Damage is resolved on `js/game/casting.js`'s own clock** against a flight time agreed up front,
so a dropped frame cannot eat a hit the player paid mana for.

---

## 9. Traps that have already cost time

- **A feature can be dead and green for a whole pass.** `Input.read()` cleared `spellEdge` without
  ever putting it in what it returned, so `cmd.spell` was permanently undefined and the number keys
  cast nothing at all. The driven test cast by calling the session directly. **If a test reaches
  past the layer the player uses, it is not testing the thing the player uses.**
- **A driven test can rot in place.** `js/dev/convo/uitest.mjs` still named `academy.*` nodes and
  flags two passes after `academy.json` was deleted, and because it was not in the documented list
  of driven tests nobody ran it. **Every driven test belongs in `RESUME.md`'s run list.**
- **Chrome outlives `proc.kill()`.** The renderer and GPU children keep the old `localStorage` in
  memory, so a later `attach()` can land on the previous run's browser — one test read a purse from
  the run before it. Use `cdp.mjs`'s returned `kill()`, and clear storage after boot.
- **A backtick inside a template literal ends it.** A prose comment containing `` `trigger` `` inside
  a `p.eval(\`…\`)` block is a syntax error thirty lines away from where it reads.
- **`js/game/fakedom.js` assigns `globalThis.fetch` outright and never restores it,** so whichever
  test loads it hands its file-reading `fetch` to every test after it in the one process
  `tools/test.mjs` uses. Treat a test that passes alone but fails in the suite (or the reverse) as
  an isolation bug, not a flake.
- **A `*.test.mjs` must not assign a global at module scope**, for the same reason. Install and
  tear down inside each test.
- **`buildings.js` and `interior.js` must agree about the roof ridge.** `buildings.js` rolled it on
  a coin toss while `interior.js` hard-codes it; three seeds in four agreed and the Society's was
  the fourth, so its interior roof crown came out through the slate. The draw is still taken (`R()`
  is one stream) but a hall ignores it.
- **`ceilK` is applied only at `floors: 1`.** Stacked, it put the top wall plate above the wall top
  outside.
- **A conversation clip whose text has moved is a lie.** Change a line, drop its `vo`.
  `data/vo.json` keeps the old record for regeneration through the Characters tab.
- **UI tests `rsync` to a scratch copy and serve THAT.** `data/` has been lost twice — once a seed
  file clobbered through a tab's own Save button, once every file under it deleted and restored
  from git by a headless run, taking another agent's uncommitted work with it. The audio survived
  only because it lives outside `data/`.

---

## 10. Tooling

**Test files import `tools/harness.mjs`, not `tools/test.mjs`.** A test importing the runner
directly deadlocks the module graph against the runner's top-level `await import`. The runner also
runs any `*.test.mjs` that does *not* import the harness in a child process and scores it on its
exit code — `js/dev/`'s tests are self-running scripts that call `process.exit`, which would kill
the runner before it reported.

**Before claiming a screen works, look at it.** `node tools/shot.mjs`, or a headless CDP
screenshot, opened with the Read tool. Five CSS collisions, two roof bugs and a counter drawn down
the middle of a shop were all found this way and none of them by a test.

**Scenarios must be registered before the shot is looked up** in `main.js`. Anything registering
later than `world.registerScenarios(doors)` is not renderable by `--shot=`.

**The Conversations tab reads `data/conversations.json` whole,** so every node added by hand is
editable in it without anything being wired up. Its driven test deletes its own scratch node before
holding the file to `conversations.test.mjs` — a node the tab has just created is an orphan by
definition, and an orphan is what *"every node is reachable"* exists to catch.

**The derived flag is the escape hatch for a predicate language that cannot count.**
`js/game/predicate.js` compares a flag to a value and does no arithmetic, so anything a hotspot has
to be gated on has to be a flag first: `society.stars`, `society.promotable`, `society.awakened`,
`society.awakened.all`, `society.starred`. `Session.syncStanding()` writes all of them.

**Seven gated hotspots on one body is seven predicates that must be mutually exclusive in every
save state there will ever be.** One hotspot and a hub node whose *choices* carry the gating cannot
fail that, and it is the shape the conversation editor is best at. Archivist Wren is built that way.

# FORGE — story and quest design

The narrative bible. Three towns, three campaigns, **one character**, one valley.

Revision 4, after the journal build. Written against the canonical terms in `CLAUDE.md`, the layout in
`WORLD.md`, and the mechanics in `SYSTEMS.md`. Where those three disagree, `CLAUDE.md` wins and the
disagreement is logged in §13.

> **What changed in revision 2.** Ten canonical school names. One character across all three
> campaigns, fostered out by the Household as an infant — the reveal now lands at the top of the
> Dark campaign. Level cap 20; every quest carries an XP and marks figure. Light Act 1 opens on a
> rat in the dark, not a lamp round, and is 40 minutes shorter. A world clock and calendar (§4),
> which was nobody's job and is now mine. Landmarks reconciled to `WORLD.md`'s actual buildings.
> Every quest tagged MVP / P2 / P3 and given its runtime verbs. Dark's ending rebuilt so the
> occupation runs the other way. §14 lists what I did not accept and why.
>
> **What changed in revision 3.** `tools/soak.mjs` now plays the whole catalogue and reports what
> each school actually reaches. It found three schools finishing as incidentals that the game
> describes as central — Cull, Hearth and Line — so **twelve quests were added and three
> re-assigned** to fix the distribution with content rather than coefficients (§8.0). Dark Act 2,
> flagged as the flattest act in the game, gained a fight. The reward columns are now **generated
> by the harness and must not be hand-edited**; this document owns the `w` column and the school
> assignment on each row, and nothing else. Quest count 87 → 99.
>
> **What changed in revision 4.** The journal is built and the strikethrough works, but the
> catalogue awarded only 18 Truths against recontextualisation tables promising about nine more —
> so nine scenes would have passed with nothing visibly changing. **Fourteen Truths added, two
> existing links re-pointed**, and §8.5 is now the full table with all eleven chains drawn. Truth
> Three of the additions are roots planted in Light Acts 4 and 5 purely so that
> Dark has something to strike: without them the payoff scenes were new facts rather than
> overturned ones, which is the weaker half of the mechanic. Truth count 18 → **34**.

---

## 1. World premise and history

Under the valley runs a seam of raw magic. Everyone calls it **the Forge**, because it is the thing
all work is made out of — not a god, not a place you visit, a material you learn to handle.

There is no mundane skill in this world. Fishing is a school of magic. So are cooking, mending,
building, trading, foraging, culling and fighting. A farmer's hands are as trained as a temple
warden's; they are trained at different things. When a character says "learn your craft" they mean
"learn which way the Forge bends for you".

The seam surfaces in three places along the valley. Two hundred years ago one craft-hall stood over
the middle outcrop and worked all three, until an argument that never got settled:

- **Draw slow and give back.** A seam is a loan. Take a measured amount, return the spent working
  to the ground, and it lasts forever.
- **Draw hard.** A seam not worked is a seam wasted.

A gallery collapsed in a bad autumn and killed eleven people, and both sides blamed the other's
method. The slow-draw half walked west and built **Whitewall** on the chalk shelf. The hard-draw
half walked east and built **Blackstone** on the basalt ridge. Both walled their town against an
army that never came, because it had not occurred to either of them that the enemy would be the
neighbour they could see.

They left the middle to the people they did not count: the hall's kitchen and field staff, assumed
to have no craft. Those people stayed, ploughed the middle outcrop, told nobody it was there, and
have been growing their magic in the ground for two hundred years. Their town is **Longacre** and
its public face is farming. Their private name for themselves is **the Household**.

### What the player actually hears

The history above is background for writers. The player receives it in three places and nowhere
else. If a writer needs a fourth, the answer is no.

| Where | Who | What they say |
|---|---|---|
| Light Act 1, in passing | Old Pell, laying kerb | there was one hall, there was an accident, now there are two towns |
| Dark Act 1, on the curtain wall | Nim | both towns built a wall facing north, at nobody. That is the joke and it is the whole history |
| Neutral Act 4, at the barn table | Hana | the part nobody was told: who stayed, and what they were sitting on |

### Why the river matters

The **Vail** runs west to east: out of Whitewall, past Longacre, into Blackstone's gorge. This is in
the terrain — `waterY` falls as x rises — and each zone tints the water differently:

| Reach | What the player sees | What it means |
|---|---|---|
| Whitewall | bright, warm, foaming — `water.tint [1.16, 1.16, 1.08]` | live water, and the tail of Whitewall's draw going downstream |
| Longacre | true colour, no tint — `[1.0, 1.0, 0.94]` | Longacre neither brightens it nor drains it, in public |
| Blackstone | cold, grey, low foam — `[0.62, 0.74, 0.84]` | it arrives dead |

Everything Whitewall does to the seam ends up in Blackstone's cistern, and Longacre stands in the
middle with a mill on it. That single fact drives the trilogy. The player verifies it with their own
eyes over about **three and a half minutes of walking** (`WORLD.md` §1.1: 101 s and 115 s per leg),
which is the entire reason it is the spine of the plot rather than a line of dialogue.

### Why the roads matter

Two roads run the valley. **King's Road** follows the Vail and links all three towns through
Longacre's market square — every wagon between the two enemies is weighed, priced and remembered by
people in aprons. **The Drove Road** is the northern bypass over the moor, and it is the road you
take when you do not want to be weighed. Whitewall's covered wagon goes that way.

Longacre is the only unwalled town in the valley. Nobody has ever attacked it.

---

## 2. The three towns

Landmarks below are reconciled to `WORLD.md` §3, which owns the plans, coordinates and dimensions.
This section owns only **what each building is for in the story**. Where I need a building
`WORLD.md` does not have, it is marked **[new]** and is a request, not a fact.

### Whitewall (light zone, centre −520, −60)

Pale limestone, curved edges, round-arched stained glass, wing crests, marble cobble, six terraces
stepping down a chalk shelf. Bells on the hour. Everything happens on a schedule.

**Who lives there.** The Tenders — an order that is a town. Everyone has a rank and a duty roster.
Courteous, precise, quietly proud, constitutionally unable to say a hard thing plainly.

**What the player does.** Lamp rounds, granary culls, dock work, watch duty, stone-setting,
attending readings. Light quests are *scheduled*: be at a place at an hour.

| Story function | `WORLD.md` building |
|---|---|
| The font — the tapped outcrop, and the covenant reading | **the Sanctum** (34 × 26 × 16, enterable, the largest interior in the game) |
| The town's clock and its landmark | **the Lantern Spire** (r 9, h 58) — rings four bells; see §4 |
| Apprentice hall; Sister Bel; the staff rack the game opens at | **the Cloister** |
| The Store, where the week's draw is kept, and Ivo's room above it | **the Almonry** — an almonry that gives out less than it takes in is the joke, and nobody in Whitewall has noticed |
| Market — stalls on market days only | **Sanctum Yard** (60 × 50) |
| Dock and fish steps | the **south gate** to the Vail, 55 m |
| Pell's works yard | a terrace works yard **[new — one `mass` and an open stone pile]** |
| Night watch post | the **north gate** to the Drove spur |

**Reads as:** clean, bright, busy, slightly airless. Best at midday.

### Longacre (neutral zone, centre 0, +40)

Square-cut brown stone, thatch, plain square windows, no roofline crest, dirt lanes, valley floor,
**no wall**. `zones.js` says "boring on purpose" and that is the design. Longacre is the only town
trying to look like nothing.

**Who lives there.** Farmers, a miller, a seed keeper, a ferryman, a clerk. Warm, unhurried, funny.
Nobody answers a question until you have helped with something. Nobody ever says no.

**What the player does.** Chores. Real ones. In the Light and Dark campaigns they are errands you
resent slightly; in the Neutral campaign they are the curriculum.

| Story function | `WORLD.md` building |
|---|---|
| The price post — all three towns' prices, chalked | **the market cross** in the square. The most-read object in the game |
| Hana's seat of power, disguised as a mill | **the Mill** (20 × 16 × 14, wheel, enterable) |
| Granny Sedge's seed store | **the Granary** (r 5, h 20 — deliberately the shortest landmark of the three towns) |
| The Household's table | **the Tithe Barn** (40 × 18 × 15). Enterable only in the Neutral campaign |
| Where Longacre pretends to govern | **the Moot Hall**. Public, harmless, empty of decisions |
| Fen's landing and the ferry | **Millbridge** |
| **The West Field** | a named fenced strip off the west end **[new — a fence, one tree, and grass]**. The root of the Forge is a foot under it and it is the least impressive location in the game |

**Reads as:** slow, kind, and very well positioned. Best at dusk.

### Blackstone (dark zone, centre +520, −80)

Fractured basalt, deep joints, slate, tall lancet glass, black spikes on every ridge, three terraces
climbing a ridge, a gorge on the south side instead of a fourth wall. Heavy conifer. The warmest
windows in the game, because everyone is indoors or underground.

**Who lives there.** The Delvers. Blunt, dry, organised around shifts rather than hours. Not cruel
and not cultists: a mining town whose ore is running out, and they know it.

**What the player does.** Shift work. Go down, prop a gallery, come up, get fed, get paid at a
posted rate. Blackstone quests are *quota* quests where Whitewall's are *schedule* quests.

| Story function | `WORLD.md` building |
|---|---|
| The shaft head — the seam, sunk not tapped | **the Black Keep** (r 11, h 52) is the head-frame; the shaft drops from under it |
| The Levels — three galleries below | under the keep **[new builder — see §13]** |
| The market. Prices are read, not haggled | **the Board**, on the keep bailey wall |
| Reeve Ossa's seat | **the Reeve's hall** — currently called *Warden's hall* in `WORLD.md`; see §13 |
| Torr's staff-smithing | **the forge**, lower terrace |
| The Dry Stand — visibly dead water, the most important prop in the Dark campaign | **the cistern**, fed from an intake on the gorge |
| The Watch | **the barracks**, lower terrace |
| Where a disguise survives and a stranger does not | **the undercroft alleys** (5 m wide) |

**Reads as:** cold, orderly, underlit, tired, and awake at night. Best at 21:00.

### Walking into the wrong town

All three towns are built and walkable from the first launch. There is no gate lock and no invisible
wall. What stops a level-4 player living in Blackstone is **that nobody there will speak to them**:
below Trusted standing, foreign vendors quote and refuse, foreign quest-givers have no lines, and
the Watch shadows you at a distance without attacking. Hostiles live on the roads and in the
countryside, never inside a friendly town, so the danger is legible and avoidable.

The telegraph is a Watch patrol standing on each bridge. Walk past it and nothing happens. That is
the point: the valley is open, and being unwelcome is a social fact rather than a loading screen.

---

## 3. The schools of magic

Ten schools, canonical per `CLAUDE.md`. Each is a verb the player performs. Every faction has all
ten and gives them a different feel. **Graft** is not a school — it is the Neutral capstone spell,
story-granted, with no XP track of its own.

| School | What it does | Whitewall | Longacre | Blackstone |
|---|---|---|---|---|
| **Kindle** | the combat bolt in `spell.js` | white core, gold trail, big flare | warm core, burnt edge, olive bloom, and a small hollow | violet core, crimson bloom, a collapsing black core |
| **Cull** | clearing vermin and beasts — the working trade, not war | licensed, counted, reported | buried in one particular field | quota'd by the shift |
| **Ward** | shields, held ground, night watch, locks | the strongest ward-work in the valley | not being noticed in the first place | not being followed |
| **Line** | fishing | measured; three permitted stands | patient, and the best stand is unmarked | at night, because the day fish are gone |
| **Forage** | gathering and growing | herb beds, listed species | fields, seed-keeping, grafting — Longacre's best school | fungus, gallery moss, whatever the forest gives |
| **Hearth** | cooking; heat, feeding, timed buffs | portioned and shared | generous, and west-field flour does something extra | three fish into eight bowls |
| **Mend** | repairing fences, walls, roofs, props | as good as new | good enough, forever | shoring, fast, before the shift |
| **Setting** | placing and raising stone — the level editor, diegetically | courses, kerbs, arches | posts, hurdles, barns | shafts, galleries, breaking through |
| **Barter** | price, weight, worth, appraisal | a fair price, stated once | the whole valley's prices on one post | a posted rate, no argument |
| **Glamour** | Dim, Hush, Mask — going unread | poorly regarded and poorly taught | taught to children as manners | taught to everyone who works nights |

**Graft** — the Neutral capstone. Granny Sedge teaches it by joining a pear scion to a thorn stock,
then says: it is the same working on a person, only the stock is you.

Longacre can do this because of what they eat. Two hundred years of grain grown directly on the
seam means a Longacre body is not fixed the way a Whitewall body is. They did not invent a spell;
they became the sort of thing the spell works on. Whitewall keeps its magic in a font and Blackstone
keeps its in a shaft, and Longacre keeps its in people who look like they have never done anything.

**What a graft costs.** Each held form is a thing you are not, while you hold it. Hold one long
enough and you come back slightly wrong — a preference you did not have, a word you did not use.
Dob has held too many. That is the character's whole tragedy, stated in one line, never a monologue.

**When a graft breaks**, it does not drop you back to yourself. It drops you into the *other* face.
That is unpleasant, it is a mechanical comeback rather than a pure punishment (`REVIEW.md` S1), and
it is exactly the sort of thing the Household would consider a safety feature.

**Engine note.** `player.setZone(id)` already swaps robe geometry, material, crowd tint, hood eyes
and spell colour together, so the disguise is chromatically correct for free. It needs one addition:
`player.zoneId` must remain the *true* faction and a separate `wornId` carry the appearance, or a
grafted Neutral cannot cast their own fields while wearing someone else's colours.

---

## 4. The world clock and the calendar

Eleven story beats and five sandbox jobs need a clock, and none existed. This section specifies the
fiction; a separate agent owns the runtime.

### The shape of a day

| | |
|---|---|
| Day length | **24 real minutes** — 1 real minute = 1 game hour |
| Day rolls over at | **05:00**, not midnight, so a night session is never cut in half |
| Week | **eight days**, numbered first to eighth. Nothing else is named |
| Seasons | **none**. "Harvest" and "a bad autumn" are words characters use, not systems |

**The hard rule: no content is ever locked for more than 60 real seconds.** A quest that needs an
hour *advances the clock on accept* — one card ("You wait for the dark."), a lighting cross-fade,
and you are there. The player never stands in a field waiting for a number.

**Vendors never close.** The people at a stall change with the hour; the stall does not. Closing
shops on a phone game is a way of making the player put the phone down.

### The bells

Whitewall's Lantern Spire is the valley's clock and the game's only diegetic time readout. It is
audible everywhere, quieter with distance, and it means the HUD never needs to show an hour.

| Bell | Hour | Name |
|---|---|---|
| 1 | 06:00 | Rising |
| 2 | 12:00 | High |
| 3 | 18:00 | Setting |
| 4 | 21:00 | Low |

Blackstone answers with **shift horns** at 05:00, 13:00 and 21:00 — three shifts, and the horn is
flatter and shorter than the bell. **Longacre rings nothing.** Its clock is the mill wheel, which
turns when there is water and work. A player standing in Longacre hears Whitewall's bell arrive
late across four hundred metres, which is the whole political situation in one sound cue.

### What each town does with its day

| Hours | Whitewall | Longacre | Blackstone |
|---|---|---|---|
| 05–08 Rising | lamps out, terraces swept, Sanctum opens | milking, the leat, the birds | night shift up, day shift down |
| 08–12 Forenoon | apprentices at work, stalls in the Yard | field strips; the cross fills | the Board is set; hauling |
| 12–14 High | readings and ceremonies happen at High | the square is at its busiest | shift change; the street is empty |
| 14–18 Afternoon | Almonry hours, works yards | carting, the mill | hauling, the forge |
| 18–21 Setting | Sanctum shut, watch mustered | the cross empties | second shift down |
| 21–01 Low | watch on the gates, the Spire crown lit | dark; the mill still turning if the water is up | the Board lit — Blackstone's busiest hours |
| 01–05 Deep | shut | shut | third shift. The only town awake |

### Time-gated content

| Quest | Gate | How it resolves |
|---|---|---|
| L01 The Granary | opens in the dark, 04:00 | the game starts there; no wait |
| L05 Standing Watch | 21:00–05:00 | advance on accept |
| L06 The Even Hand | **High on an eighth day** | advance on accept |
| L11 Escort West | **an eighth day** | advance on accept |
| L12 The Fish Are Wrong | needs a fish caught on the low stand | no time gate, a state gate |
| L22 Ivo's Room | 01:00–04:00 | advance on accept |
| L23 The Strike | night | advance on accept |
| D03 Night Line | after 21:00 | advance on accept |
| D06 The Tally | shift change, 13:00 | advance on accept |
| D16 What We Came For | night | advance on accept |
| D21 The Night We Came Back Up | night | advance on accept |
| N09 Weigh the Temple | **High on an eighth day** | advance on accept |
| N11 The Eighth Day | **an eighth day** | advance on accept |
| S16 Price Round | all three markets inside one game day | 24 real minutes; a real challenge, not a wait |
| S19 Lamp Round | must finish before 21:00 | accepted only between 18:00 and 20:00 |
| S20 A Meal for the Bridge | freshness timer, not a clock gate | — |

**The eighth day is a fiction, not a wait.** The wagon quest is offered when it is due, and
accepting it advances to the next eighth day. The player learns that the wagon runs on a cycle
without ever being made to count.

---

## 5. Act structure — the Light campaign

**Whitewall. Five acts, 24 quests.** The player is a young adult in the apprentice hall who has been
getting away with being talented and unserious.

Emotional spine: *earnest competence → unease → warmth from an unexpected place → fear of the enemy
→ winning the fight and losing the certainty.*

### Act 1 — Take it seriously (L01–L06) · MVP

**Goal:** learn six schools by doing real work, and swear the covenant. **Target: 15 minutes.**

The game opens **in the granary, at four in the morning, with the lamp already out and something
moving in the dark**. The first input the player makes is a cast. Sister Bel's speech about taking
your craft seriously happens on the way out, in two bubbles, once the rats are dealt with — which is
the correct order, because she is telling you what you have just proved you can do.

Then: catch five silverling off the fish steps, sell them in the Sanctum Yard without taking the
first price, cook what you kept, and stand one night watch on the north gate with Kesta. Five jobs,
six schools, no villain.

**Beat:** pride in small competence. The player should finish Act 1 liking Whitewall and liking
themselves. Everything after this is load-bearing on that.

The act closes at High on an eighth day, at the covenant reading. Warden Alder reads the measured
draw aloud, the font is uncovered, the player takes the apprentice's cord. It is the prettiest scene
in the campaign and it is a lie by omission. **It has to arrive inside the first session or the beat
does not work**, which is why Act 1 is six quests and not nine.

Somewhere in here Bel mentions, without weight, that the player was *brought in* rather than born
here. She does not elaborate and the player has no reason to ask. **This is the first of three
plants for §7's reveal.**

### Act 2 — The water runs thin (L07–L12) · MVP

**Goal:** investigate a failing river. Find a discrepancy you were not looking for.

Rell's catches are down. The player walks the reach counting dry stands, gathers weed at three
depths for a visiting Longacre seed keeper, and carries the week's draw from the font to the
Almonry — after which Kesta points out that Steward Ivo's tally does not match what is on the
Almonry shelf.

The player also escorts a covered wagon up the Drove Road and is told to ask no questions. It goes
on the eighth day. Nobody in Whitewall knows where it ends up.

**Beat:** unease. Nothing is proved. Two facts sit in the journal that do not fit each other.

**The first playable ends here**, on L12, with a "to be continued". It is a complete arc: a job, a
world, a friend, a ceremony and a doubt.

### Act 3 — The middle ground (L13–L17, L25) · P2

**Goal:** buy grain in Longacre. Come back slightly changed.

The temple sends the player down King's Road with coin. Miller Hana would rather have work than
money, so the player spends an afternoon on the leat, a crate and a missing hen — the first time the
game does chores for a faction that is not yours, and the most relaxed it ever gets.

Hana looks at the player a beat too long and asks when their birthday is. She does not explain why.
**Second plant.**

Two things go in the journal without comment: a Whitewall face at the market cross introduces
himself as **Ansel**, is friendly and useful and known to nobody back home; and Fen's ferry lands
more crates than it launches.

The grain goes home and Marrin bakes the first loaf off it, and the player carries one back down the
valley to Hana as a courtesy. Nobody in Whitewall calls it Longacre bread. Nobody in Whitewall has
eaten anything else for thirty years.

**Beat:** warmth, with a splinter in it. The player likes Longacre. That is what makes campaign
three land.

### Act 4 — The far bank (L18–L21, L26–L27) · P2

**Goal:** meet the enemy. Get the wrong answer confirmed.

Blackstone raiders hit the east water stands. The player drives them off — the first real fight,
against robed casters with black staffs, and it is frightening. Whitewall takes a prisoner who calls
herself **Sela** and who, under questioning, gives up that Blackstone's shaft has gone dry.

Then Fen takes a water reading on the Blackstone reach and the player watches the colour drain out
of the river with their own eyes.

The rest of the act is the war as it is actually fought: the stands are held around the clock now,
so somebody has to carry hot food out to the picket, and nobody has worked the water since the raid,
so the stands are thick with creek crabs. A siege is mostly cooking and pest control. That is not a
joke at the campaign's expense — it is the campaign's thesis, which is that Whitewall's war is a
logistics problem it refuses to describe as one.

**Beat:** fear curdling into doubt. The raid was for water. The player is the only person who has
stood on both banks.

### Act 5 — The even hand (L22–L24, L28) · P2

**Goal:** read the ledger, take the keep, choose what to do with what you know.

L22 is the campaign's first real transgression: into the Almonry at one in the morning, ward the
door, mend the lock you break, and read thirty years of overdraw. Whitewall has been drawing above
the covenant since before the player was born, and the eighth-day wagon is where the surplus goes.

The night before the muster marches, Marrin cooks for two hundred and does not ask where they are
going. It is the last quiet thing in the campaign and it is a cooking quest, which is the right
shape: Whitewall feeds its army properly, on Longacre grain, and calls the whole business a duty.

Then the strike. Alder and Kesta march east; the player fights up Blackstone's switchback at night —
the best-looking sequence in the game, spiked rooflines against lancet windows — and takes the Black
Keep by morning.

Whitewall wins. The player stands at the mouth of a shaft that is empty because of a font two towns
west.

L24 closes it: Alder reads the covenant again and asks the player privately whether the ledger
should be published or held. Both answers finish the campaign; the choice sets the epilogue text and
a world flag the other two campaigns reference.

**Beat:** you won, and you are not sure you were the good one.

**Ending:** Light complete. Grants the **White Cord**. **Blackstone unlocks**, and the player is
posted east as part of the garrison — which is where the Dark campaign starts, on the ground they
just took.

---

## 6. The Dark campaign

**Blackstone. Five acts, 22 quests.** A genuine mirror. Not a re-skin, and — since revision 2 — not
a second tutorial either, because it is the same person.

Emotional spine: *garrison boredom → being told who you are → the arithmetic that will not work →
a deal your side already made → taking a town back off your own friends → finding what is under it.*

### Act 1 — The posting (D01–D06)

The player is garrisoned at the captured Black Keep in white robes, clearing rats out of a flooded
store. It is the same verb the game opened with and it now pays adult money, because the player is
not an apprentice any more — the fiction and the XP curve agree for once.

Then **D02, the hinge of the whole trilogy**: Sela, who is a prisoner in her own town, looks at the
player and tells them where they were born. Longacre. Fostered out as an infant, placed in the
Whitewall apprentice hall, the way the Household has always done it — the way *she* was, east
instead of west. She has known since she saw them fight.

The player takes the white robe off. Everything after that is a shift: night fishing, the Board,
stretching three fish into eight bowls, and — walking the curtain wall with Nim on the way to the
yield tally — the joke about the wall facing north at nobody.

The act closes at the tally, which is the covenant reading with an honest number in it: how much
less the seam gave this month than last. Nobody is surprised. That is the horror of it.

**Beat:** the ground moves under a character the player thought they had finished building.

### Act 2 — Less every month (D07–D10, D23)

Follow the seam west along the fourth level until it thins to nothing — and, following it, break
into a gallery nobody has propped in forty years. Shaft rats have had it to themselves for most of
that time. Clearing and shoring the old workings is the act's one hard fight, and it matters twice:
it is the first place the player is somewhere Blackstone has *forgotten*, and it is the ground
D19 later breaks through the floor of.

Then draw at the cistern intake and find nothing lives in it. Walk the Vail west to the ford, taste
it, and catch something out of it — a fish from above Longacre is alive and a fish from Blackstone
is not, which proves it better than tasting does. Then cook for a shift with nothing to cook.

**Beat:** the arithmetic does not work, and the reason is upstream.

This act was measured as the flattest in the game — three of its four quests were gathering and
dialogue. The old workings are the fix, and they are the fix the fiction wanted anyway: a mining
town that is running out of seam should be reopening ground it abandoned.

### Act 3 — The grain deal (D11–D15, D24)

Reeve Ossa sends the player to Longacre to trade the month's yield — the town's only product — for
grain. Hana has Blackstone's numbers before the player opens their mouth, and takes work instead of
coin, and the player does the leat, the crate and the hen **for the second time**, while their town
runs out of food.

At the market cross, **Ansel** is trading — the friendly Whitewall cousin from Act 3 of the Light
campaign, standing in Longacre doing business as though he were Blackstone's man. The player has met
him. That is the hook, and it costs nothing because it is the same character who met him.

Ossa is paying for tails by then — twenty by the horn, and the rate drops after, because Blackstone
posts a price for everything including vermin. It is the town's whole character in one contract, and
it is the player's first taste of being on the wrong side of a posted rate.

**Beat:** your town is being farmed, politely.

### Act 4 — What we came for (D16–D19)

Sela walks the player back to the east water stands **they personally defended in L18**, at night,
and has them fill barrels. Same place, same act position, inverted verb. Nobody fights.

Then Sela is standing in the kitchen and she was in Blackstone all week — so Whitewall took somebody
wearing her face and was told the shaft was dry, which it is, so nobody thought to check.

Nim shows the player a scout's sign on the ridge above the keep. The player recognises it. It is
theirs, from three months ago.

Corve orders the shaft floor broken through. It is not the bottom. The seam turns and runs west.

**Beat:** you were the aggressor, you are still not being told everything, and the ground is not
where you thought it was.

### Act 5 — Back up (D20–D22, D25)

Move the stores below, and feed everyone down there before you go up — and there is enough, for the
first time in the campaign, because of the grain the player bought in Act 3. Blackstone can fight
because Longacre fed it. Nobody in the room says so.

Then **retake the keep from Kesta's garrison**, at night, on the switchback
the player fought up from the other direction in L23 — against a friend, in a building they
captured, using the tunnels they were shown in Act 1.

D22 is quiet: Sela takes a lamp and walks the western seam with the player until it stops, sixty
metres down, under a turnip field.

**Beat:** we won the town back and lost the argument about what the town is for.

**Ending:** Dark complete. Grants the **Short Rope**. **Longacre unlocks.**

### What the Dark campaign recontextualises

A contract with the writers. Each row is something the player did with their own hands.

| Light event | What the player believed | What Dark shows |
|---|---|---|
| L01–L06, being an apprentice | you are a Whitewall child with a gift | D02 — you were placed there. Every kindness in Act 1 was also a placement working correctly |
| L11 Escort West — the covered wagon | routine temple business, keep quiet | D07 — you hear cartwheels overhead on the eighth day, following the seam west under the Drove Road. `wagon.eighth` → `wagon.watched` |
| L18 Smoke on the East Wind — the raid | Blackstone attacked unprovoked | D16 — you carry the barrels they came for, over the same ground, and nobody shoots at you. `raiders.east` → `raid.water` |
| L19 The Captive — questioning Sela | a Delver broke and gave up the shaft | D17 — Sela was home. Somebody let themselves be taken and told you a true thing on purpose. `shaft.dry` → `sela.face` |
| L20 The Shaft's Mouth — scouting unseen | you were unseen | D18 — Nim kept your sign. They knew the strike was coming and stayed. `unseen` → `sign.kept` |
| L21 The Dry Stand — a water reading | evidence Blackstone is failing | D08 — it is the town's drinking intake, and you have been drinking from it all act. `vail.dead` → `vail.arrives.dead` |
| L23 The Strike | a hard, righteous victory | D21 — you take the same ground back off Kesta, uphill, in the dark, through tunnels Whitewall never mapped. `strike.won` → `strike.undone` |
| L06 the covenant reading | Whitewall's most beautiful ceremony | D06 the yield tally is the same ritual with an honest number in it. Grants `yield.falls` and `walls.wrong.way`, both struck later |

**This has to be a UI feature or it does not exist.** When a Truth is overturned, the journal shows
the old line struck through with the new one under it. Author's intent in a design document is not a
player experience.

---

## 7. The Neutral campaign

**Longacre. Five acts, 21 quests plus an epilogue screen.** Not a third stranger's story — a
homecoming. The player has been away since they were an infant and has spent two campaigns being
extremely useful to two towns that were not theirs.

Emotional spine: *coming home → the first taste of what west-field bread does → wearing Whitewall →
wearing Blackstone → understanding that you are not a bystander, you are the cause → choosing what
the valley is for.*

### Act 1 — A farm year (N01–N07, N22)

The chores, a third time, and now they are the curriculum. Open the mill. Cull the rodents in the
seed store — and bury them in the west field, not the midden, because Sedge said so and you have
never asked why. Fish the stretch above the ford that nobody else fishes and nobody asks about.
Sell at the cross, then chalk both towns' prices onto it, which is just a job your family has always
done.

Then Sedge has you bake with west-field flour, and your numbers move more than a loaf should move
them. And once a year the whole village eats together in the tithe barn, and this year you cook it —
which puts the player at that table, serving, four acts before N17 tells them what the table is.

Two guests arrive the same hour — a Whitewall buyer and a Blackstone buyer — and the quest is
keeping them apart. It plays as farce. It is Longacre's entire foreign policy.

The act closes on **N07**: Sedge grafts a pear onto a thorn, hands the player the knife, and has them
do it to their own face.

**Beat:** the floor drops out of a comfortable game.

### Act 2 — Wearing Whitewall (N08–N11, N23)

Take the Whitewall face. Walk into the Sanctum Yard as **Ansel** — the cousin the player met in L16
and saw again in D14, who has been the player all along in the only sense that matters: the
Household always has one of these, and now it is your turn to be it.

Stand at the covenant reading in a white robe and count the font's draw. Load Fen's ferry so the
count cannot hold. Ride the covered wagon up the Drove Road, because you loaded it, because half of
what is in it came out of Longacre.

In the middle of all this, one morning with your own face on: take the catch to both towns before
the bell, because nobody stops a Longacre cart. The disguise is for *watching*. Longacre has never
needed one to trade.

**Beat:** delight, then the first cold moment — you are very good at this and nobody has ever caught
you.

### Act 3 — Wearing Blackstone (N12–N15, N25)

Take **Sela's** face. Walk the Levels as a Delver with Nim, who does not recognise you and is pleased
to meet you.

Dob sets the exercise that proves the point better than any infiltration does: cook a Whitewall
supper and a Blackstone shift-pot on the same day, in the right face for each. The Household knows
both towns down to what they have for dinner, and knowing that is why the faces work.

Then N14, the campaign's hinge: **be taken by Whitewall on purpose**, wearing Sela, and tell them the
shaft is dry. It is true. It is also exactly what makes Whitewall confident enough to strike, which
is what Longacre wants, because a Whitewall that holds a dry keep has spent its army on a hole.

The player is on the other side of an interrogation they conducted. Alder is gentle. Bel is in the
room. It is the worst scene in the game and it should be.

N15: break your own captivity without leaving a mark on anyone, because a body would change the
story you just planted.

**Beat:** you are not playing both sides for safety. You are conducting.

### Act 4 — The root (N16–N20, N24, N26)

Something has been eating two hundred years of buried vermin, and it has to be cleared off the west
field before anyone puts a spade in it. Sedge is unbothered by this and will not say what it is.

Then dig. The seam is a foot down — under a fence, under grass, under two hundred years of
vermin buried on purpose to keep the soil rich, and the player has walked over it since the first
quest of this campaign.

Sit at the barn table and get the history in full: the kitchen staff kept the best outcrop, let two
orders of proud people walk away from it, and have quietly been the strongest faction in the valley
since before either wall was built. And they foster their children out, because a Household that
only ever knew itself would be no use to anybody.

Sedge teaches the two-core cast and has the player test it on the voles in the strips, which is
quietly grim and entirely in character. Fen takes them back up to the quiet stretch above the ford
one last time, and this time the player knows exactly what they are standing on and why no one else
may fish it. Then Wick puts the price ledger in front of the player and walks
them back through the year: every raid, every shortage, every march traces to a number chalked on a
post in a farm town.

N20: Dob was Ansel before you were. Dob has been four people this year and cannot answer in one word
when you ask which one is left. **The journal does this, not the dialogue** — one portrait, two
names, and the player gets there first.

**Beat:** the twist lands as guilt, not triumph. The harmless farmers are the strongest faction and
also the reason there is anything to be strong about.

### Act 5 — The valley (N21, and the epilogue)

Both towns march. Whitewall over water it will not admit it took; Blackstone over a seam it has
found running west. They will meet at Millbridge, on top of the root.

The player takes a **posture**:

| Posture | What the player does | Ending |
|---|---|---|
| **Tend** | reveal the root and the Household; put Longacre's yield under a three-town covenant | the valley survives and Longacre gives up being invisible, which is the only power it ever had. You are trusted, and watched, forever |
| **Take** | reveal nothing; let the two armies break each other on the bridge; work the root openly afterwards | Longacre is the last town standing and the strongest thing in the world. The west field is a walled precinct within a year and it looks exactly like Whitewall's |
| **Keep** | reveal nothing, and stop the battle by hand — two grafted faces, two forged orders, one price on a post | nothing changes, nobody knows, the war stays small, and you take Hana's chair. The hardest to earn and the bleakest |

**The epilogue is not a playable level.** "Walk the west field the morning after" is a walking
simulator as a final act, in a game whose traversal is not its strength. It is delivered as text over
the faction-select slate, on the Longacre panel, with the field in the art. The player keeps the good
feeling and does not spend four minutes walking to it.

**Ending:** trilogy resolved. Grants the **Long Furrow**. All three campaigns stay replayable.

### What the Neutral campaign recontextualises

| Earlier event | New meaning |
|---|---|
| L16 "Ansel" / D14 the face at the Board | N08 — you become him. The Household always has one; Dob was the last. `ansel.nobody` → `ansel.you` |
| L19 the captive Sela / D17 Sela was home | N14 — you are the captive, and the confession is the plan. `sela.face` → `sela.was.you` |
| L17 / D15 Fen's crate count | N10 — you load the ferry to make the count fail. `count.never.holds` → `count.by.design` |
| L11 / D07 the eighth-day wagon | N11 — half of Whitewall's "surplus" is Longacre produce going out the back road. `wagon.watched` → `wagon.longacre` |
| L15 / D13 Hana's three chores | N01–N04 — the leat and the price round are your family's daily work. Hana gave strangers chores because chores are how Longacre reads a stranger's hands |
| L01 / D01 / N02 the rodent cull | N16 — Longacre has buried its vermin in one field for two centuries. The first quest in the game is soil management for the root of the Forge |
| L06 covenant reading / D06 yield tally | N09 — the Household has attended both, in costume, every year, for longer than either ceremony has existed in its current form |
| Bel's "brought in" (L01) / Hana's question about your birthday (L14) | N17 — both were people checking on an investment, kindly. `fostered` → `fostered.policy`, and `walls.wrong.way` → `household` |

---

## 8. Quest catalogue

**99 quests: 28 Light, 25 Dark, 26 Neutral, 20 sandbox.** Twelve were added in revision 3 to fix a
school-distribution problem the soak harness found; see §15.

**The catalogue awards 34 Truths across 11 chains** — Light 10, Dark 12, Neutral 12. That is the
final count and §8.5 is the table. Any document quoting 18, 24 or 31 is out of date.

### 8.0 How to read the table, and where the numbers came from

- **Stage** — `MVP` first playable, `P2` second, `P3` third. The world is not staged; only the
  campaign content is.
- **Verbs** — the eight quest-runtime primitives from `REVIEW.md` B8: `kill` `gather` `deliver`
  `interact` `goto` `escort` `talk` `survive`. **Every quest in this catalogue is expressible in
  those eight.** If a designer finds a ninth, the quest is wrong, not the primitive list.
- **XP and mk are generated, not authored.** Every amount in the three tables below comes from
  `SYSTEMS.md` §10.3's formula, applied by `js/sim/campaign.js` and regenerated by
  `tools/soak.mjs`. **Do not hand-edit them.** What this document owns is the *school assignment*
  on each row — which schools a quest trains — and that is a narrative judgement, not a number.
  Change a weight or an act budget in `js/sim/campaign.js` and re-run the harness.
- **Weights.** The `w` column is authored here and consumed by the harness. A quest is a chore
  (0.15), a main (0.30) or an act finale (0.60) of one level's XP at the act's lead-school level. A
  quest that pays "every trained school" pays 35% of that to all ten, so it lands near a
  three-school quest rather than ten times a one-school one. **The weight and the school assignment
  are the two things this document owns on every row.** Everything to their right is generated.
- **Adding a quest** means adding a row with an id, an act, a weight, a giver, an objective, its
  schools, its verbs and its prereqs — and nothing else. The reward cell stays `—` until the
  harness fills it. An act's budget is fixed, so a new quest dilutes its neighbours rather than
  inflating the act; that is the intended behaviour and the reason quests can be added freely.
- **mk** — quest payment only, and deliberately a minority of income after Light Act 2. Sale
  proceeds, drops and cooking are separate and belong to `SYSTEMS.md` §7. Each act's whole quest
  budget is a single number in `js/sim/campaign.js`, split between its quests by weight.
- **The turn-in is a tip.** The action the quest asks for pays more than the turn-in does: the rats
  pay for the rat quest. The first version of this table had it the other way round, and the soak
  measured quest turn-ins at 60–92% of every school's lifetime XP, which made diminishing returns
  inert and reduced fishing and foraging to decoration.

End state, measured by `tools/soak.mjs --policy=average --competence=average`:

| After | Lead schools | Grasp | Notes |
|---|---|---|---|
| Light | 10 | 77 | milestone 7 reached in the leads |
| Dark | 14 | 119 | milestone 12 reached in the leads, broadly by N2 |
| Neutral | 18 | 154 | milestone 17 in four schools, cap in none |

The cap is not reached. That is deliberate: level 20 in a school is what the sandbox board is for.

**Those three rows are from the run before revision 3 and are stale.** Twelve quests were added and
three re-assigned to fix the distribution below; the harness has not been re-run against them yet.
Expect the leads to move very little and Hearth, Line and Cull to move onto the middle ladder.

**The distribution this is meant to produce.** The intended shape is three lead schools, three
middle, four incidental — and the run before revision 3 had the right shape with the wrong schools
in it:

| | before | after, by quest coverage |
|---|---|---|
| Named on quests | Barter 16 · Ward 15 · Glamour 12 · Setting 9 · Kindle 8 · Forage 8 · Line 7 · **Cull 6** · **Hearth 5** · Mend 3 | Barter 18 · Ward 16 · Glamour 13 · **Cull 12** · **Line 12** · **Hearth 11** · Setting 9 · Forage 8 · Kindle 7 · Mend 4 |

Three schools were wrong for what the game says they are. **Cull is the headline combat verb the
game teaches in the first thirty seconds** and it finished as an incidental, because Kindle rides
every combat quest plus the Hollow and the Watchman, which are Cull-immune by design. **Hearth**
finished lowest of all ten in a game with a farming town in the middle of it. **Line** finished
below both, in a game whose opening minutes are a fishing trip.

The fix was content, not coefficients: more vermin work at more points in the story, and cooking
used as what it actually is — the way into all three towns' character. Kindle's named-quest count
drops from 8 to 7 and it will still lead, because Kindle's XP comes from the volume of casting
rather than from turn-ins. That gap closing is the point.

### 8.1 Light — Whitewall

| id · stage | act | w | title | giver | objective | school · verbs | XP · mk | prereq |
|---|---|---|---|---|---|---|---|---|
| **L01** MVP | 1 | main | The Granary | Sister Bel | Something is moving in the dark. Cull eight grain rats, then relight the lamp | Cull, Kindle · `kill` `interact` | Cull 157 · Kindle 157 · **7 mk** | — |
| **L02** MVP | 1 | main | Line and Water | Rell | Catch five silverling off the fish steps | Line · `gather` | Line 157 · **7 mk** | L01 |
| **L03** MVP | 1 | chore | Market Day | Rell | Sell the catch in Sanctum Yard. Do not take the first price | Barter · `deliver` `talk` | Barter 78 · **3 mk** | L02 |
| **L04** MVP | 1 | chore | Cook's Hands | Cook Marrin | Cook three silverling; feed three temple hands | Hearth · `interact` `deliver` | Hearth 78 · **3 mk** | L02 |
| **L05** MVP | 1 | main | Standing Watch | Kesta | Hold the north gate one night; turn back two strays | Ward, Kindle · `survive` `kill` | Ward 157 · Kindle 157 · **7 mk** | L01 |
| **L06** MVP | 1 | finale | The Even Hand | Warden Alder | Attend the covenant reading at High; take the apprentice's cord | — · `talk` | 110 to every trained school · **13 mk** · cord | L03, L04, L05 |
| **L07** MVP | 2 | main | Low Water | Rell | Walk the Whitewall reach and count the dry stands | Line, Forage · `goto` `interact` | Line 366 · Forage 366 · **18 mk** | L06 |
| **L08** MVP | 2 | chore | What the Weed Says | Granny Sedge | Gather river weed at three depths for a visitor's tests | Forage · `gather` | Forage 183 · **9 mk** | L07 |
| **L09** MVP | 2 | main | The Temple Draw | Steward Ivo | Carry the week's draw from the font to the Almonry | Ward, Setting · `deliver` | Ward 366 · Setting 366 · **18 mk** | L06 |
| **L10** MVP | 2 | chore | Two Ledgers | Kesta | Count the Almonry shelf against Ivo's tally | Barter · `interact` | Barter 183 · **9 mk** · *Truth: Whitewall draws above the covenant* | L09 |
| **L11** MVP | 2 | main | Escort West | Alder | Escort a covered wagon up the Drove Road. Ask nothing | Ward · `escort` | Ward 366 · **18 mk** · *Truth: a wagon goes out on the eighth day* | L09 |
| **L12** MVP | 2 | finale | The Fish Are Wrong | Marrin | Cook a fish taken from the low stand. It burns cold | Hearth · `interact` | Hearth 732 · **37 mk** | L07 |
| **L13** P2 | 3 | chore | Down the Valley | Alder | Walk King's Road to Longacre and buy grain | Barter · `goto` `talk` | Barter 315 · **17 mk** | L11 |
| **L14** P2 | 3 | chore | The Miller's Price | Miller Hana | Haggle. She takes work, not coin | Barter · `talk` | Barter 315 · **17 mk** | L13 |
| **L15** P2 | 3 | main | Three Chores for Hana | Hana | The leat, a crate, the missing hen | Forage, Setting · `interact` `gather` | Forage 629 · Setting 629 · **34 mk** · grain | L14 |
| **L16** P2 | 3 | chore | A Cousin in the Crowd | Ansel | Let the friendly Whitewall face show you the market cross | Line · `talk` `goto` | Line 315 · **17 mk** · *Truth: Whitewall has a cousin here nobody can place* | L14 |
| **L25** P2 | 3 | chore | Bread for the Road | Cook Marrin | Bake the first loaf off Longacre grain. Carry one back to Hana | Hearth · `interact` `deliver` | Hearth 315 · **17 mk** | L15 |
| **L17** P2 | 3 | finale | What Fen Carries | Fen | Ferry three crates. Count them at both ends | Barter, Ward · `escort` `interact` | Barter 1,259 · Ward 1,259 · **68 mk** · *Truth: the count never holds* | L15 |
| **L18** P2 | 4 | main | Smoke on the East Wind | Kesta | Drive Blackstone raiders off the east water stands | Cull, Kindle · `kill` | Cull 778 · Kindle 778 · **38 mk** · *Truth: Blackstone raids the east water stands* | L17 |
| **L19** P2 | 4 | chore | The Captive | Alder | Question the Delver you took. She calls herself Sela | — · `talk` | 136 to every trained school · **19 mk** · *Truth: the shaft is dry* | L18 |
| **L20** P2 | 4 | main | The Shaft's Mouth | Kesta | Scout the Black Keep from the ridge without being seen | Ward, Glamour · `goto` | Ward 778 · Glamour 778 · **38 mk** · *Truth: you scouted the keep and nobody saw you* | L19 |
| **L26** P2 | 4 | chore | Feeding the Picket | Kesta | The east stands are held day and night now. Cook and carry three hot meals out | Hearth, Line · `interact` `deliver` | Hearth 389 · Line 389 · **19 mk** | L18 |
| **L27** P2 | 4 | main | The Crab Stands | Rell | Nobody has worked the east stands since the raid. Clear the creek crabs off three of them | Cull, Line · `kill` `gather` | Cull 778 · Line 778 · **38 mk** | L18 |
| **L21** P2 | 4 | finale | The Dry Stand | Fen | Take a water reading on the Blackstone reach | Forage, Line · `interact` | Forage 1,556 · Line 1,556 · **77 mk** · *Truth: the Vail is dead before Blackstone* | L20 |
| **L22** P2 | 5 | main | Ivo's Room | self-directed | Into the Almonry at one in the morning. Read the ledger | Ward, Mend · `interact` | Ward 1,106 · Mend 1,106 · **76 mk** · *Truth: thirty years of overdraw* | L10, L11, L21 |
| **L28** P2 | 5 | chore | Two Hundred Bowls | Cook Marrin | Feed the muster the night before it marches. Marrin does not ask where | Hearth · `interact` `deliver` | Hearth 553 · **38 mk** | L22 |
| **L23** P2 | 5 | main | The Strike on Blackstone | Alder, Kesta | Take the Black Keep. Hold it until morning | Kindle, Cull, Ward · `kill` `survive` | Kindle 1,106 · Cull 1,106 · Ward 1,106 · **76 mk** · *Truth: Whitewall holds the keep, and that should be the end of it* | L22 |
| **L24** P2 | 5 | finale | The Covenant, Read Again | Alder | Publish the ledger, or hold it | — · `talk` | 774 to every trained school · **151 mk** · **White Cord** · **DARK UNLOCKED** | L23 |

### 8.2 Dark — Blackstone

| id · stage | act | w | title | giver | objective | school · verbs | XP · mk | prereq |
|---|---|---|---|---|---|---|---|---|
| **D01** P2 | 1 | main | The Posting | Kesta | Garrison duty at the captured keep. Clear the flooded store | Cull, Kindle · `kill` | Cull 1,284 · Kindle 1,284 · **73 mk** | L24 |
| **D02** P2 | 1 | chore | Sela's Question | Sela | She knows where you were born. Hear it out. Take the robe off | — · `talk` | 225 to every trained school · **36 mk** · *Truth: you were fostered out of Longacre* | D01 |
| **D03** P2 | 1 | main | Night Line | Sela | Fish the Blackstone reach after the horn | Line · `gather` | Line 1,284 · **73 mk** | D02 |
| **D04** P2 | 1 | chore | What It's Worth | Reeve Ossa | Sell at the Board. The rate is posted, not asked | Barter · `deliver` | Barter 642 · **36 mk** | D03 |
| **D05** P2 | 1 | chore | Two Pots | Sela | Stretch three fish into eight bowls for the shift | Hearth · `interact` `deliver` | Hearth 642 · **36 mk** | D03 |
| **D06** P2 | 1 | finale | The Tally | Undermaster Corve | Walk the curtain with Nim, then hear the yield read | Ward · `goto` `talk` | Ward 2,567 · 898 to every trained school · **145 mk** · *Truths: both towns walled the north against nobody; the yield falls every month* | D04, D05 |
| **D07** P2 | 2 | main | Chasing the Seam | Corve | Follow the fourth level west until the seam thins out | Setting, Forage · `goto` `interact` | Setting 1,470 · Forage 1,470 · **73 mk** · *Truth: Blackstone has counted that wagon for a year* | D06 |
| **D08** P2 | 2 | chore | Dead Water | Sela | Draw at the cistern intake. Nothing lives in it | Line · `interact` | Line 735 · **36 mk** · *Truth: the Vail arrives dead* | D06 |
| **D09** P2 | 2 | main | Upstream | Sela | Walk the Vail west to the ford. Taste it, then catch something out of it | Forage, Line · `goto` `gather` | Forage 1,470 · Line 1,470 · **73 mk** · *Truth: it is alive above Longacre* | D08 |
| **D23** P2 | 2 | main | The Old Workings | Corve | The fourth level breaks into a gallery nobody has propped in forty years. Clear the shaft rats and shore what you can | Cull, Mend · `kill` `interact` | Cull 1,470 · Mend 1,470 · **73 mk** | D07 |
| **D10** P2 | 2 | finale | A Bowl for the Shift | Sela | Feed the shift when there is nothing to feed them with | Hearth · `gather` `deliver` | Hearth 2,941 · **145 mk** | D05 |
| **D11** P2 | 3 | main | The Miller's Terms | Ossa | Take the month's yield to Longacre. Come back with grain | Barter · `goto` `deliver` | Barter 1,665 · **83 mk** | D09 |
| **D12** P2 | 3 | chore | Weighing Hana | Hana | Haggle. She has your numbers before you speak | Barter · `talk` | Barter 833 · **42 mk** | D11 |
| **D13** P2 | 3 | main | Three Chores for Hana | Hana | The leat, a crate, the hen. The second time | Forage, Setting, Mend · `interact` | Forage 1,665 · Setting 1,665 · Mend 1,665 · **83 mk** | D12 |
| **D14** P2 | 3 | chore | The Face at the Board | Ansel | The Whitewall cousin is trading here as though he were one of yours | Barter, Glamour · `talk` | Barter 833 · Glamour 833 · **42 mk** · *Truth: Ansel belongs to nobody* | D13 |
| **D24** P2 | 3 | main | The Quota | Reeve Ossa | Blackstone pays for tails now. Twenty by the horn, and the rate drops after | Cull, Barter · `kill` `deliver` | Cull 1,665 · Barter 1,665 · **83 mk** | D11 |
| **D15** P2 | 3 | finale | What Fen Won't Say | Fen | Run a ferry shift and count the crates yourself | Barter · `escort` `interact` | Barter 3,330 · **167 mk** | D13 |
| **D16** P2 | 4 | main | What We Came For | Sela | The east water stands, at night. Fill barrels. Nobody fights | Ward, Glamour · `gather` `survive` | Ward 1,868 · Glamour 1,868 · **133 mk** · *Truth: they came for water, and you shot at people carrying buckets* | D15 |
| **D17** P2 | 4 | chore | Sela Is Home | Sela | Work out who Whitewall actually took | — · `talk` | 327 to every trained school · **67 mk** · *Truth: someone wore Sela's face* | D16 |
| **D18** P2 | 4 | main | The Watcher on the Ridge | Nim | Find the scout's sign above the keep | Ward · `goto` `interact` | Ward 1,868 · **133 mk** · *Truth: Nim kept your sign — they knew, and stayed* | D16 |
| **D19** P2 | 4 | finale | Below the Bottom | Corve | Break the shaft floor. Follow what is under it | Setting, Cull · `interact` `kill` | Setting 3,736 · Cull 3,736 · **267 mk** · *Truth: the seam runs west* | D07, D17 |
| **D20** P2 | 5 | main | Everything Down | Corve | Move the stores below before they come back | Setting, Barter · `deliver` | Setting 2,078 · Barter 2,078 · **178 mk** | D19 |
| **D25** P2 | 5 | chore | Feeding the Retake | Sela | Feed everyone below before you go back up. There is enough now, because of the grain | Hearth · `interact` `deliver` | Hearth 1,039 · **89 mk** | D20 |
| **D21** P2 | 5 | main | The Night We Came Back Up | Corve, Sela | Retake the keep from Kesta's garrison. Uphill, in the dark | Kindle, Cull, Ward · `kill` `survive` | Kindle 2,078 · Cull 2,078 · Ward 2,078 · **178 mk** · *Truth: the keep changed hands twice in a winter and neither town gained a thing* | D20 |
| **D22** P2 | 5 | finale | What the Root Is | Sela | Follow the western seam by lamp until it stops | Setting · `goto` | Setting 4,157 · **356 mk** · **Short Rope** · **NEUTRAL UNLOCKED** | D21 |

### 8.3 Neutral — Longacre

| id · stage | act | w | title | giver | objective | school · verbs | XP · mk | prereq |
|---|---|---|---|---|---|---|---|---|
| **N01** P3 | 1 | chore | Coming Home | Miller Hana | Walk into Longacre as yourself. Open the mill | — · `goto` `talk` | 402 to every trained school · **33 mk** | D22 |
| **N02** P3 | 1 | main | The Seed Store | Granny Sedge | Cull the rodents. Bury them in the west field, not the midden | Cull · `kill` `interact` | Cull 2,296 · **67 mk** · *Truth: Longacre buries its vermin in one field* | N01 |
| **N03** P3 | 1 | main | The Quiet Stretch | Fen | Fish above the ford. Nobody else does. Nobody asks | Line · `gather` | Line 2,296 · **67 mk** | N01 |
| **N04** P3 | 1 | main | Market Post | Wick | Sell, then chalk both towns' prices onto the cross | Barter · `deliver` `interact` | Barter 2,296 · **67 mk** · *Truths: Longacre keeps both towns' prices; the boundary posts move* | N03 |
| **N05** P3 | 1 | chore | A Loaf From the West Field | Sedge | Bake with west-field flour. Eat it. Notice | Hearth · `interact` | Hearth 1,148 · **33 mk** | N02 |
| **N22** P3 | 1 | main | Harvest Supper | Hana | The whole village eats in the barn once a year. Cook for it | Hearth · `interact` `deliver` | Hearth 2,296 · **67 mk** | N05 |
| **N06** P3 | 1 | chore | Two Guests | Hana | A Whitewall buyer and a Blackstone buyer, the same hour. Keep them apart | Barter, Ward, Glamour · `talk` | Barter 1,148 · Ward 1,148 · Glamour 1,148 · **33 mk** | N04 |
| **N07** P3 | 1 | finale | Grafting | Sedge | Graft a pear onto a thorn. Then do it to your own face | Glamour · `interact` | Glamour 4,592 · **133 mk** · **GRAFT** | N05, N06 |
| **N08** P3 | 2 | main | A Cousin Called Ansel | Hana | Take the Whitewall face. Walk into Sanctum Yard | Glamour · `interact` `goto` | Glamour 2,521 · **140 mk** · *Truth: Ansel is a face the Household keeps, and you are wearing it* | N07 |
| **N23** P3 | 2 | chore | The Ford Run | Fen | Take the morning's catch to both towns before the bell. Nobody stops a Longacre cart | Line, Barter · `gather` `deliver` | Line 1,260 · Barter 1,260 · **70 mk** | N07 |
| **N09** P3 | 2 | main | Weigh the Temple | Wick | Stand at the covenant reading in white and count the font | Barter, Ward · `goto` `interact` | Barter 2,521 · Ward 2,521 · **140 mk** · *Truth: the covenant number was always wrong* | N08 |
| **N10** P3 | 2 | chore | A Crate Both Ways | Fen | Load the ferry so the count cannot hold | Barter · `interact` | Barter 1,260 · **70 mk** · *Truth: the count never holds because you are the one loading it* | N08 |
| **N11** P3 | 2 | finale | The Eighth Day, From the Cart | Hana | Ride the covered wagon up the Drove Road. You loaded it | Ward, Glamour · `escort` | Ward 5,042 · Glamour 5,042 · **280 mk** · *Truth: half the wagon is Longacre produce* | N09 |
| **N12** P3 | 3 | chore | A Face Called Sela | Sedge | Take the Blackstone face you are going to need | Glamour · `interact` | Glamour 1,377 · **77 mk** | N11 |
| **N13** P3 | 3 | main | Down the Ladder | Nim | Walk the Levels as a Delver. He is pleased to meet you | Setting, Glamour · `goto` | Setting 2,753 · Glamour 2,753 · **155 mk** | N12 |
| **N25** P3 | 3 | main | Both Kitchens | Dob | Cook a Whitewall supper and a Blackstone shift-pot the same day, in the right faces | Hearth, Glamour · `interact` `deliver` | Hearth 2,753 · Glamour 2,753 · **155 mk** | N13 |
| **N14** P3 | 3 | main | Wearing Sela | Hana | Be taken by Whitewall on purpose. Tell them the shaft is dry | Glamour, Ward · `talk` `survive` | Glamour 2,753 · Ward 2,753 · **155 mk** · *Truth: you were the captive, and the confession was the plan* | N13 |
| **N15** P3 | 3 | finale | Out Through the Wall | Dob | Break your captivity without marking anyone | Mend, Ward, Glamour · `interact` | Mend 5,506 · Ward 5,506 · Glamour 5,506 · **309 mk** | N14 |
| **N24** P3 | 4 | main | What Feeds on It | Sedge | Two hundred years of buried vermin have fed something. Clear the field before you dig it | Cull · `kill` | Cull 2,992 · **143 mk** | N15 |
| **N16** P3 | 4 | main | The West Field | Sedge | Dig where the vermin are buried | Forage, Setting · `interact` | Forage 2,992 · Setting 2,992 · **143 mk** · *Truth: the root of the Forge is under Longacre* | N02, N15 |
| **N26** P3 | 4 | chore | The Quiet Stretch, Again | Fen | Fish above the ford once more, now you know what it is you are standing on | Line · `gather` | Line 1,496 · **71 mk** | N16 |
| **N17** P3 | 4 | chore | What the Household Is | Hana | Sit at the barn table | — · `talk` | 524 to every trained school · **71 mk** · *Truths: the kitchen staff kept the best seam; you were not placed, you were posted* | N16 |
| **N18** P3 | 4 | main | Both Cores | Sedge | Cast a bolt with a bright core and a hollow at once. Test it on the voles | Kindle, Cull · `kill` | Kindle 2,992 · Cull 2,992 · **143 mk** · **two-core cast** | N17 |
| **N19** P3 | 4 | main | The Two Wars You Started | Wick | Trace the year's raids back through the price post | Barter · `interact` | Barter 2,992 · **143 mk** · *Truth: Longacre set the prices that caused the raids* | N17 |
| **N20** P3 | 4 | finale | Nobody's Face | Dob | Ask Dob who Dob is | Glamour · `talk` | Glamour 5,984 · **286 mk** | N19 |
| **N21** P3 | 5 | finale | Both Towns Marching | Hana | Take a posture: Tend, Take or Keep | all · `talk` `kill` `survive` | 2,094 to every trained school · **1,300 mk** · **Long Furrow** · **TRILOGY COMPLETE** | N18, N19, N20 |

**Epilogue — The Field at Harvest.** Not a quest and not playable. Text over the Longacre panel on
the faction-select slate, varying by posture.

### 8.4 Sandbox repeatables

Posted at the Sanctum Yard board (Whitewall), the market cross (Longacre) and the Board (Blackstone).
Each is parameterised — building, species, count and town are rolled when the board offers it — so
twenty entries supply an endless tail. XP scales with the player's level in the named school; marks
scale with the poster's town and the player's Barter.

The eight marked **MVP** *are* the Act 1 and Act 2 content in another wrapper. Building them once
serves both, which is why Act 1 could lose three quests without losing anything.

**S02 Fish Order and S04 Kitchen Order are always posted.** Every other entry is a roll; those two
are permanent fixtures of every board in every town. A completionist run reached only Hearth 11
because the roll rarely landed on cooking, which is a silly reason for a school to be short. A
standing order for fish and a standing order for meals is also the most ordinary thing a town could
want, so it costs nothing in fiction: the kitchens always need feeding and the cooks always need
fish.

| id · stage | title | objective | school · verbs |
|---|---|---|---|
| **S01** MVP | Vermin Contract | Cull N rodents in a named building | Cull · `kill` |
| **S02** MVP | Fish Order | Deliver N of a named species to a named cook | Line · `gather` `deliver` |
| S03 P2 | Long Line | Land one fish from a deep stand | Line · `gather` |
| **S04** MVP | Kitchen Order | Cook and deliver three meals | Hearth · `interact` `deliver` |
| **S05** MVP | Panel Repair | Mend five damaged fence or wall panels | Mend · `interact` |
| S06 P2 | After the Storm | Re-slate a named roof | Mend · `interact` |
| **S07** MVP | Kerb and Course | Set six stones along a street | Setting · `interact` |
| S08 P2 | Raise a Shed | Place a small structure on a marked plot | Setting · `interact` |
| S09 P2 | Forage Run | Gather twelve of a named plant | Forage · `gather` |
| S10 P2 | Leat Clearing | Clear weed from a watercourse stretch | Forage · `interact` |
| S11 P2 | Firewood | Gather and stack fuel for a named hearth | Forage, Setting · `gather` `deliver` |
| **S12** MVP | Lost Hen | Find a stray fowl and drive it home | — · `escort` |
| S13 P2 | Escort the Cart | Walk a cart town to town without losing crates | Ward · `escort` |
| S14 P2 | Night Watch | Hold a gate for a night; turn back strays | Ward, Kindle · `survive` `kill` |
| **S15** MVP | Strays on the Road | Clear hostile casters from a road stretch | Kindle · `kill` |
| S16 P2 | Price Round | Copy prices at all three markets inside one game day | Barter · `goto` `interact` |
| S17 P2 | Appraise the Chest | Value the contents of a found chest | Barter · `interact` |
| S18 P2 | Ferry Shift | Run Fen's ferry for a set of crossings | Barter · `escort` |
| **S19** MVP | Lamp Round | Light every lamp in a district before Low | Kindle, Ward · `interact` |
| S20 P2 | A Meal for the Bridge | Carry a hot meal to a far bridge before it cools | Hearth · `deliver` |

### 8.5 Truths and their chains

A **Truth** is a one-line world fact the player is handed by a scene, kept forever across all three
campaigns, and — this is the whole point — sometimes **struck through later by a Truth that
overturns it**. The recontextualisation tables in §6 and §7 are the design; this table is the data.
`data/truths.json` owns the canonical text; `supersedes` accepts an array.

**The catalogue awards 34 Truths across 11 chains.** That is the final count — Light 10, Dark 12,
Neutral 12 — and the runtime spec's placeholder of 31 should be set to it.

Truths are earned **in dialogue, not at turn-in**, per `RUNTIME.md` §3. The quest column below is
where the scene lives, not where a reward pops.

| id | text | quest | supersedes | later struck by |
|---|---|---|---|---|
| `overdraw` | Whitewall draws above the covenant. | L10 | — | `thirty.years` |
| `wagon.eighth` | A wagon leaves Whitewall every eighth day. | L11 | — | `wagon.watched` |
| `cousin` | Whitewall has a cousin here nobody can place. | L16 | — | `ansel.nobody` |
| `count.never.holds` | The count never holds at both ends. | L17 | — | `count.by.design` |
| **`raiders.east`** | Blackstone raids the east water stands. | **L18** | — | `raid.water` |
| `shaft.dry` | The shaft they died for is dry. | L19 | — | `sela.face` |
| **`unseen`** | You scouted the Black Keep and nobody saw you. | **L20** | — | `sign.kept` |
| `vail.dead` | The Vail is dead before it reaches Blackstone. | L21 | — | `vail.arrives.dead` |
| `thirty.years` | Thirty years of overdraw, signed every year. | L22 | `overdraw` | `covenant.wrong` |
| **`strike.won`** | Whitewall holds the Black Keep. That should be the end of it. | **L23** | — | `strike.undone` |
| `fostered` | You were fostered out of Longacre. | D02 | — | `fostered.policy` |
| **`walls.wrong.way`** | Both towns walled the north against nobody. | **D06** | — | `household` |
| **`yield.falls`** | The yield falls every month and nobody says the word. | **D06** | — | `seam.west` |
| **`wagon.watched`** | Blackstone has counted that wagon for a year. | **D07** | `wagon.eighth` | `wagon.longacre` |
| `vail.arrives.dead` | Blackstone drinks what arrives dead. | D08 | `vail.dead` | `vail.alive.above` |
| `vail.alive.above` | The Vail is alive above Longacre. | D09 | `vail.arrives.dead` | — |
| `ansel.nobody` | Ansel belongs to nobody. | D14 | `cousin` | `ansel.you` |
| **`raid.water`** | They came for water. You shot at people carrying buckets. | **D16** | `raiders.east` | `prices.raids` |
| `sela.face` | Someone wore Sela's face on purpose. | D17 | `shaft.dry` | `sela.was.you` |
| **`sign.kept`** | Nim kept your sign. They knew, and stayed. | **D18** | `unseen` | — |
| `seam.west` | The seam turns and runs west. | D19 | **`yield.falls`** | `root.longacre` |
| **`strike.undone`** | The keep changed hands twice in a winter. Neither town gained a thing. | **D21** | `strike.won` | `prices.raids` |
| `vermin.field` | Longacre buries its vermin in one field. | N02 | — | `root.longacre` |
| **`prices.both`** | Longacre keeps both towns' prices on one post. | **N04** | — | `prices.raids` |
| **`boundary.moves`** | Longacre's boundary posts move, two paces at a time. | **N04** | — | `root.longacre` |
| **`ansel.you`** | Ansel is a face the Household keeps. You are wearing it. | **N08** | `ansel.nobody` | — |
| `covenant.wrong` | The covenant number was always wrong. | N09 | `thirty.years` | — |
| **`count.by.design`** | The count never holds because you are the one loading it. | **N10** | `count.never.holds` | — |
| `wagon.longacre` | Half the wagon is Longacre produce. | N11 | **`wagon.watched`** | — |
| **`sela.was.you`** | You were the captive. The confession was the plan. | **N14** | `sela.face` | — |
| `root.longacre` | The root of the Forge is under Longacre. | N16 | `vermin.field`, `seam.west`, **`boundary.moves`** | — |
| **`household`** | The kitchen staff kept the best seam. Both orders walked away from it. | **N17** | `walls.wrong.way` | — |
| **`fostered.policy`** | You were not placed. You were posted. | **N17** | `fostered` | — |
| `prices.raids` | Longacre set the prices that caused the raids. | N19 | **`raid.water`, `strike.undone`, `prices.both`** | — |

**Bold** is new or changed in revision 4. Sixteen Truths were added. Two of them, `prices.both` and
`boundary.moves`, were already promised in N04's row and had never been wired into anything — that
row has been claiming two Truths since revision 2 that did not exist. Three existing entries change:
`seam.west` gains `yield.falls`; `wagon.longacre` moves from `wagon.eighth` to `wagon.watched` so
that chain is three links rather than two; and `root.longacre` and `prices.raids` each take extra
parents. **This table is the spec for `data/truths.json`** — sixteen entries to add, four to amend,
none to remove.

#### The eleven chains

```
overdraw ──► thirty.years ──► covenant.wrong                     L10 · L22 · N09
vail.dead ──► vail.arrives.dead ──► vail.alive.above             L21 · D08 · D09
wagon.eighth ──► wagon.watched ──► wagon.longacre                L11 · D07 · N11
cousin ──► ansel.nobody ──► ansel.you                            L16 · D14 · N08
shaft.dry ──► sela.face ──► sela.was.you                         L19 · D17 · N14
yield.falls ──► seam.west ──┐                                    D06 · D19
vermin.field ───────────────┤                                    N02
boundary.moves ─────────────┴──► root.longacre                   N04 ·   ·  N16
raiders.east ──► raid.water ────┐                                L18 · D16
strike.won ──► strike.undone ───┤                                L23 · D21
prices.both ────────────────────┴──► prices.raids                N04 ·   ·  N19
unseen ──► sign.kept                                             L20 · D18
count.never.holds ──► count.by.design                            L17 · N10
walls.wrong.way ──► household                                    D06 · N17
fostered ──► fostered.policy                                     D02 · N17
```

Eleven connected components, which is what `journal.js` `truthChains()` groups on. Nine of them run
across two or three campaigns, which is the structural argument for the three-playthrough ladder
stated as data: **finishing Dark strikes seven Truths the player earned as Light, and finishing
Neutral strikes seven more.**

**One rendering case is new and should be checked before content is authored.** `prices.raids`
supersedes three Truths, two of which supersede one each, so that component is three deep *and*
three wide. `root.longacre` is the same shape with one deep arm. Both are legal under an array
`supersedes` and both are bigger than anything the journal has rendered so far, which at the time of
writing is a straight three-link chain.

#### Where the strikes land

| Campaign | Truths earned | Truths it strikes | Notes |
|---|---|---|---|
| Light | 10 | 1 (`thirty.years` over `overdraw`) | Light is where the false picture is assembled. Only the ledger overturns anything, and it overturns Light's own |
| Dark | 12 | 7 | Dark Act 4 is the demolition: every Truth the player formed on the far bank in Light Act 4 is struck within one act |
| Neutral | 12 | 7 | including every terminal of the war chain, so the last thing the player learns is that a price chalked on a post caused all of it |

That Light-Act-4-to-Dark-Act-4 correspondence is deliberate and should survive editing. L18, L19,
L20 and L21 are the four things the player becomes certain of on the enemy's bank; D16, D17, D18 and
D08 take all four away in the same order.


---

## 9. Cast

### Whitewall

| Name | Who | What they want | Later campaigns |
|---|---|---|---|
| **Sister Bel** | the player's master; teaches Kindle, Cull and Ward | you to be *good* at this before you are clever about it. Mentions once that you were brought in | Dark: a name on a garrison roster. Neutral: in the room when you are interrogated, and gentle, which is worse |
| **Warden Alder** | head of the Sanctum; reads the covenant | the covenant kept and the ledger unread. Believes both, sincerely | Dark: the voice on the other side of a wall. Neutral: the man you fool annually, and pity |
| **Steward Ivo** | keeps the draw and the tally | nobody to look at his numbers. Not a villain — the man who inherited the lie and kept it running | Neutral: buys Longacre flour and does not record it |
| **Kesta** | fellow apprentice, ambitious, becomes a friend | to be the one who did something | Dark: your commanding officer in D01, and the garrison you fight in D21. Neutral: the hardest person in the valley to stand next to in a borrowed face |
| **Rell** | fishmonger at the steps; teaches Line | a fair price and a quiet river | the barometer of the water in all three campaigns |
| **Cook Marrin** | Sanctum kitchen; teaches Hearth | everyone fed, on time | Neutral: swears by Longacre flour |
| **Old Pell** | mason; teaches Setting and Mend | to finish the wall properly before he dies | the only Whitewall NPC who talks about the schism plainly, and the only place the player hears it |

### Longacre

| Name | Who | What they want | Later campaigns |
|---|---|---|---|
| **Miller Hana** | the miller; head of the Household; the player's mother | Longacre standing in two hundred years, and nobody to have noticed it | Light: a warm, shrewd trader who takes work over coin, and asks your birthday. Dark: the woman who has your numbers already. Same lines, three weights |
| **Dob** | farmhand; the best grafter alive; **was Ansel before you were** | to be somebody in particular | Light/Dark: Ansel, met twice. Neutral: your friend, and the man who stayed while you were fostered out. Two names, one portrait, and the journal makes the connection before the dialogue does |
| **Granny Sedge** | seed keeper; teaches Forage and grants Graft | the valley to still be a valley in a hundred years, whatever it costs this one | Light: a visiting herbalist testing river weed in L08 — she is sampling Whitewall's overdraw |
| **Wick** | market clerk; teaches Barter | the post to be accurate. Genuinely does not think of it as espionage | Light/Dark: the bored clerk who quotes you a price. Neutral: hands you the ledger proving you started the war |
| **Fen** | ferryman at Millbridge | the river left alone and the crates moving | in all three. Says the same six lines in each and they mean three different things |

### Blackstone

| Name | Who | What they want | Later campaigns |
|---|---|---|---|
| **Undermaster Corve** | runs the shaft | one more year out of the seam. Will not say "it's finished" out loud | Light: a shape you fight past at the keep. Neutral: a man you sell grain to at a fair price, which is its own cruelty |
| **Sela** | Longacre-born, fostered east; hard, protective; the player's opposite number | you out of the shaft and above ground, and to know who let themselves be taken wearing her face | Light: the captive in L19 who is not her. Neutral: a face you wear, in front of people who love her |
| **Reeve Ossa** | Blackstone's civil head | the town fed. Does not care where the magic comes from and says so | Neutral: the only outsider Hana respects |
| **Torr** | staff-smith; teaches Kindle and Setting | good tools in bad hands, because bad hands are the ones he has | Light: made the staffs you are fighting |
| **Nim** | kid who runs messages between levels | to be allowed down the deep galleries | Light: the watcher whose ridge you scout in L20, who keeps your sign. Neutral: pleased to meet you, in Sela's face |

---

## 10. Dialogue voice

### Rules

1. **Two lines maximum per bubble, one bubble on screen at a time.** The game is **landscape only**
   (`CLAUDE.md`), so width is generous and height is scarce. The bubble occupies the bottom band of
   the screen and never the middle. A line that needs a third line needs cutting.
2. **Never more than two speakers rendered at once.** N17 is six people at a table; stage it as two
   in frame and four as voices, or it will not fit a landscape phone.
3. **One idea per line.** No sentence carries a fact and a feeling at once.
4. **No dialect spelling.** Ever. Rhythm carries class and region; apostrophes do not.
5. **Work talk over lore talk.** Characters explain history only when it changes what someone does
   in the next ten minutes.
6. **Quest text is a verb.** "Cull eight rats in the granary." Not "You must venture forth."
7. **Nobody says "magic"** unless they are teaching a beginner. It is called *the work*.
8. **Vocabulary.** Characters may say: the Forge, the Household, the covenant, the draw, the yield,
   the tally, the seam, marks, standing, a graft, the Watch, the ten school names. Words that are on
   the HUD but that **no character ever says**: Attunement, Focus, XP, level, Glut, Freshness,
   Suspicion, Echo. A character never reads their own stat sheet out loud.

### Faction rhythms

- **Whitewall** speaks in **measures**. Courteous, slightly formal, euphemism when uncomfortable.
  "A fair draw." "Within the covenant." "We do not discuss the wagon." A Whitewall character being
  evasive gets *more* polite, not less.
- **Blackstone** speaks in **costs**. Short sentences, flat delivery, dry jokes about death. "Two
  days' air." "It's posted." "Water, not blood." A Blackstone character being evasive stops talking.
- **Longacre** speaks in **weather and chores**. Warm, unhurried, deflecting. Answers a question with
  a job. Never says no; says "not this week." A Longacre character being evasive asks about your
  mother.

### Sample — Whitewall (L06, the covenant reading)

> **Alder:** Nine measures drawn. Nine returned.
> **Alder:** That is the whole of it, and it is enough.
> **Bel:** Say the words.
> **Player:** As it is given, so it is given back.
> **Alder:** Good. Bell's at six. Don't be late for it.
> **Bel:** You did that well.
> **Bel:** Don't ask him about the wagon today.

### Sample — Blackstone (D02, Sela's question)

> **Sela:** What month were you born?
> **Player:** Why?
> **Sela:** Because I know the answer and I want to hear you not know it.
> **Sela:** You're Longacre. They put you in Whitewall as a baby.
> **Sela:** They put me here.
> **Player:** That isn't true.
> **Sela:** Take the robe off and say it again.

### Sample — Longacre (N06, two guests)

> **Hana:** Whitewall's in the yard. Blackstone's at the gate.
> **Hana:** Take the tea out. Slowly.
> **Player:** What if they see each other?
> **Hana:** Then they both go home in a temper and buy nothing.
> **Hana:** And the hens want doing after.
> **Player:** You always say that.
> **Hana:** Because the hens always want doing.

---

## 11. Progression and unlock spec

### One character

There is **one character across all three campaigns** and the fiction pays for it: the Household
fosters its children out. The player was born in Longacre and placed in the Whitewall apprentice hall
as an infant. After Whitewall they are posted east, where Sela — fostered the other way — tells them
so. The Neutral campaign is going home.

This is why skills carry in full, and it is what makes "Neutral becomes far more powerful" literally
true. The power is not a faction bonus. It is three lifetimes of training in one person, which is
exactly what the Household has been building for two hundred years.

The reveal is planted three times and paid once:

| Plant | Where | Weight |
|---|---|---|
| Bel: "when you were brought in" | L01 | none. A turn of phrase |
| Hana asks the player's birthday and does not explain | L14 | odd, unremarked |
| Sela says it | **D02** | the reveal |
| Hana says what it was *for* | N17 | the meaning |

### Finishing a campaign

| Campaign | Complete when | Grants | Unlocks |
|---|---|---|---|
| Light | **L24** resolved, either choice | White Cord | Dark |
| Dark | **D22** resolved | Short Rope | Neutral |
| Neutral | **N21** resolved, any posture | Long Furrow | trilogy flag; epilogue on the slate |

**Sandbox quests, exploration and school levels are never required to finish a campaign.** The only
hard gates are the prereqs in §8. A player who ignores gathering gets a weaker character and the same
story. Attunement may gate *spell tiers* — that is good, invisible diversification pressure — but it
must not gate an act exit.

### What carries

Everything. There is no reset of skills, gear, map or knowledge; see `SYSTEMS.md` §8 for the full
table. Two story-side corrections to it:

- **Truths carry, and they are the trilogy's connective tissue.** All **34** of them, in one list
  across all three campaigns. They need a save field and a journal screen, and when one is overturned the journal must show the old line struck through with
  the new one beneath it. Without that display, the recontextualisation tables in §6 and §7 are
  author's intent and nothing else.
- **Cosmetic robe tints do not carry, because they do not exist.** `zones.js` has one robe colour per
  zone and is frozen. The cosmetics are **props**: the apprentice's cord, a length of shaft rope, a
  straw braid — one per completed campaign, worn together by the end.

### The faction-select slate

Three panels, arranged west to east like the map: pale limestone, thatch, slate. After the first
unlock it is a **chapter select**, not a character select — the world is one place and the player is
one person.

| State | Whitewall | Longacre | Blackstone |
|---|---|---|---|
| **New save** | lit, playable. *"Start here. Everyone does."* | visible, brown, **tappable** — tapping says **"Longacre has nothing to teach you yet."** | dark silhouette, locked. *"Finish Whitewall."* |
| **Light done** | shows the choice made at L24 | unchanged, same line | lit. *"Now stand where you were standing at the end."* |
| **Both done** | — | **lights** — the thatch catches the sun the other two have had all along. *"Nothing to teach you. Come in anyway."* | — |
| **Trilogy done** | ending shown | posture shown, and the epilogue text | ending shown |

The Longacre panel being tappable and dismissive from the very first launch is the best piece of
foreshadowing available and it is free. **Do not grey it out.**

### Pacing targets

| Campaign | Quests | Acts | Note |
|---|---|---|---|
| Light | 28 | 6 · 6 · 6 · 6 · 4 | Act 1 is **15 minutes**, not 40, and Acts 1–2 are untouched at twelve |
| Dark | 25 | 6 · 5 · 6 · 4 · 4 | the player knows the systems and half the map |
| Neutral | 26 | 8 · 5 · 5 · 7 · 1 | slowest again, because Act 1 replays chores that now mean something |

Runtime is the harness's number, not this document's. It is now **7.01 hours** at an average pace
and 6.19 hours if the sandbox board is ignored entirely; the twelve quests added in revision 3
raised it from 6.37, which is honest — the earlier 10.25-hour figure was an artefact of a walking
allowance the world's geography cannot supply. `SYSTEMS.md` §11 carries the per-act numbers.

**Light Acts 1 and 2 were deliberately left alone at six and six.** They are the signed-off first
playable at twelve quests, and the twelve-quest figure was the argument that won Act 1 its sixth
quest in the first place (§14.1). Every Light addition went into Acts 3–5, which had room.

---

## 12. Names the systems document asked for

| Systems term | In-fiction | Reason |
|---|---|---|
| **Marks** (`mk`) | the valley never had a mint. A mark is a notched token cut off the old hall's tally sticks, and there are still people who will tell you so | one line, said once by Wick |
| **Attunement** | **Grasp** — how far your hands reach into the Forge. "She has a wide grasp" | *Request to the systems designer: rename the stat to Grasp on the HUD and retire Attunement.* One word on the character sheet that characters can also say is better than two words for one thing. If the answer is no, Attunement stays and nobody says it aloud |
| **Cinder Token** | **Hearth Ash** — a graft needs a stock to graft onto, and the Household uses the ash of your own hearth fire, carried in a twist of cloth | **Free at any Longacre hearth; 350 mk from anyone else.** That keeps the cost real when you are far from home, which is the only time it should bite, and stops the headline mechanic feeling metered |
| **Echo of the Light** | **the White Cord** | the apprentice's cord from L06. You never take it off |
| **Echo of the Dark** | **the Short Rope** | what a Delver ties to their belt going down. Short, because the ones who need a long one do not come back |
| **Echo of the Field** | **the Long Furrow** | what Longacre calls a life's work |
| Standing band "Neutral" | **Plain** | collides with the Neutral faction otherwise |

---

## 13. What this document needs from elsewhere

### From `WORLD.md`

1. **Town names.** `WORLD.md` uses Lumen / Fallowmere / Umbral; `CLAUDE.md`'s canonical table says
   **Whitewall / Longacre / Blackstone**. I have followed `CLAUDE.md`. `WORLD.md` needs a rename
   pass, or Aaron needs to overturn the canon — but not both names in two documents.
2. **"Warden's hall" in Umbral must become "the Reeve's hall."** Warden is a Whitewall clerical rank
   and the Watch is the enemy class; a Warden's hall in Blackstone is the third meaning.
3. **The West Field** — one named fenced strip off Longacre's west end, with a fence, one tree and
   nothing else. It is the most important location in the game and must look like the least.
4. **Pell's works yard** in Whitewall — one `mass` and an open stone pile on a terrace.
5. **Countryside between the towns** (`REVIEW.md` S7): narrowing the town mask to
   `smoothstep(30, 20, …)` is the option that preserves the river-tint walk. Widening `DISTRICT_W`
   lengthens the spine walk past the point where a player will do it twice. Story prefers the mask.

### From `SYSTEMS.md`

1. **Split true faction from worn appearance** — `player.zoneId` stays the truth, `wornId` carries
   the look. A grafted Neutral casts their own fields in someone else's colours; one id cannot say
   that.
2. **A per-NPC suspicion term.** Kesta must be the hardest person in the valley to stand next to in
   a borrowed face, and that is a character fact, not a class fact.
3. **A `posture` field and a `ledger` flag on the save.** N21 sets one of three, L24 sets a binary,
   and both are referenced in later campaigns and in the epilogue.
4. **Mid-quest scene state.** N14 and N15 put the player in a cell on purpose. A reload that
   respawns them at a hearth either breaks the quest or completes it for free.
5. **Fish stands.** I name three story stands per reach; the other six per zone are unnamed water.
   The naming rule: a stand gets a name only if a quest sends you to it.
6. **Light's Cull penalty must go** (`REVIEW.md` B4). The first verb in the game cannot be the one
   the only playable faction is worst at. Penalise Light on Setting and Glamour, both of which the
   fiction already supports — Whitewall thinks going unread is bad manners.
7. **Glamour needs an XP source before level 30.** The story now supplies two early ones: L20 scouts
   a ridge unseen, and D14/D16 are night work. Those are `Dim` and `Hush` jobs, not disguise jobs.

### Engine build items the story depends on

| Item | Why | Note |
|---|---|---|
| **The rat** | the first thing the player fights, in the first thirty seconds | `chicken.js` has no quadruped mode. Its own ring tables and gait constant, in the same file. One to two days |
| **Blackstone's Levels** | three enterable galleries, used by D07, D19, N13 | a new builder, not a parameter on `interior.js` |
| **Combat** | nine story quests and three sandbox jobs | no hit detection exists at all today |
| **Journal with Truths and strikethrough** | §6 and §7 do not exist for the player without it | first-class screen |
| **Quest runtime, eight primitives** | §8 is written against exactly those eight | nothing ships without it |
| **The bells** | §4 is the game's clock and it is an audio cue | `audio/` already has the registry; nobody has hooked it up |

---

## 14. Contested — where I did not take the note

Four places. Each is a craft judgement, not an oversight, and Aaron should adjudicate.

**1. Light Act 1 is six quests, not five.** `REVIEW.md` S2 says cut to five — rat, fish, sell, cook,
covenant. I kept **Standing Watch** as the fifth. Two reasons. The first playable is specified at
"about 12 quests", and six plus six is exactly twelve with two clean act shapes; five plus six is
eleven and a lopsided pair. The second is the review's own argument: it wants the player to have
*served* on the Watch so that fighting it later lands, and there is no other place in the campaign
to put that. The cut it asked for is still made — nine quests to six, forty minutes to fifteen — the
fence and the kerb went to the sandbox board and the lamp round became the last ten seconds of L01.

**2. Dark Act 1 is six quests, not four.** The cut list says re-cut it to four. Under the
one-character decision, Dark Act 1 is no longer a tutorial that can be compressed — it is a
defection, and D02 is the single most important scene in the trilogy. Four quests cannot carry
arriving under occupation, being told who you are, changing sides, and learning how the town works.
Six can, and three of them are the fish-sell-cook loop the player already knows, which is fast.

**3. The two-core bolt.** `REVIEW.md` S11 says delete the claim that neutral's spell colours
foreshadow the twist, and it is arithmetically right: 6% luminance between two bright cores, on
additive particles, at speed, on a phone, is not a tell. I have demoted the claim — it is no longer
described as foreshadowing anywhere in §3 and the player is never expected to notice it. But I have
not deleted it outright, because **`CLAUDE.md` asserts it as a non-negotiable in the same breath as
freezing `zones.js`.** Somebody has to change that file before this claim can be fully retired, and
that is Aaron's call, not mine. My recommendation: keep the values, change the `CLAUDE.md` wording
from "deliberate foreshadowing" to "deliberate, and not to be tidied", and let the faction-select
slate be the game's foreshadowing, which it already is.

**4. The posture ending stays a real three-way choice.** Nobody asked me to cut it, but it is the
obvious next cut when N21 gets costed, so I am defending it in advance. Three postures are three
epilogue texts and three world flags over one battle — not three levels. Tend, Take and Keep are the
three positions the whole trilogy has been arguing about, and collapsing them to one ending would
make the Light campaign's L24 choice the only choice in the game that mattered, in a trilogy about
which of three answers is least bad.

---

## 15. Renumbering map

Revision 1 → revision 2. Other documents referencing quest ids need this pass.

| Old | New | Note |
|---|---|---|
| L01 First Light | — | cut. The lamp round is the last beat of the new L01; the job survives as S19 |
| L02 The Granary | **L01** | now the opening. Starts in the dark, on a cast |
| L03 Line and Water | **L02** | **chalk trout → silverling** (`req 1`), fixing the impossible tutorial |
| L04 Market Day | **L03** | |
| L05 Cook's Hands | **L04** | |
| L06 Mend the Run | — | cut to the sandbox board as S05 |
| L07 A Course of Stone | — | cut to the sandbox board as S07 |
| L08 Standing Watch | **L05** | |
| L09 The Even Hand | **L06** | |
| L10–L15 | **L07–L12** | shifted down four |
| L16–L21 | **L13–L18** | |
| L22 The Captive | **L19** | |
| L23–L27 | **L20–L24** | |
| D01 First Dark, D07 A Course of Basalt, D08 The Wrong-Way Wall | — | cut or folded. The wall walk is now the first half of D06 |
| D-old Act 1 | **D01–D06** | rebuilt: The Posting and Sela's Question are new |
| D13 The Eighth Day | — | cut to a journal line inside D07 |
| D20 Take the Stands | **D16 What We Came For** | the raid is no longer replayed; the player carries the barrels instead |
| D25 The Night Whitewall Came | **D21 The Night We Came Back Up** | inverted. Blackstone retakes its own keep from Kesta's garrison |
| N06 The Leat, N07 Set a Post | — | folded into N01 and N04 as a chore and a Truth |
| N15 A Face Called Kettle | — | cut. Dob has two faces, not three; the third alias was a novelist's structure |
| N26 The Field at Harvest | — | no longer playable. Epilogue text on the faction-select slate |
| Kindling / Warding / Green / Reckoning / Mending / Grafting | **Kindle / Ward / Forage / Barter / Mend / Graft** | and **Cull** split out of Kindle across every combat quest |
| "coin" | **marks (`mk`)** | |
| ranks 1–5 | **XP against the level-20 curve**, generated by the harness | |

### Revision 3 — twelve added, three re-assigned

New ids are appended rather than inserted, so **ids no longer ascend with acts**. That is
deliberate: a second renumbering would churn `js/sim/campaign.js`, `RUNTIME.md` and every reference
in this document to save one cosmetic property. Ids are identifiers, not sequence numbers; the `act`
column carries the order and the tables are sorted by it.

| New | Act | Trains | Why it exists |
|---|---|---|---|
| **L25** Bread for the Road | L3 | Hearth | Whitewall has eaten Longacre bread for thirty years and calls it Whitewall bread |
| **L26** Feeding the Picket | L4 | Hearth, Line | a siege is mostly catering, which is the campaign's thesis |
| **L27** The Crab Stands | L4 | Cull, Line | nobody has worked the water since the raid; uses the existing creek crab |
| **L28** Two Hundred Bowls | L5 | Hearth | the last quiet thing before the strike, and it is a cooking quest |
| **D23** The Old Workings | D2 | Cull, Mend | Dark Act 2 measured flattest in the game. It now has a fight, in ground the town forgot |
| **D24** The Quota | D3 | Cull, Barter | Blackstone posts a rate for everything, including vermin |
| **D25** Feeding the Retake | D5 | Hearth | they can fight because Longacre fed them, and nobody says so |
| **N22** Harvest Supper | N1 | Hearth | puts the player at the tithe barn table, serving, four acts before N17 says what it is |
| **N23** The Ford Run | N2 | Line, Barter | nobody stops a Longacre cart. The disguise is for watching, not trading |
| **N24** What Feeds on It | N4 | Cull | two centuries of buried vermin fed something, and it is on the field before the spade is |
| **N25** Both Kitchens | N3 | Hearth, Glamour | the Household knows both towns down to what they have for dinner |
| **N26** The Quiet Stretch, Again | N4 | Line | closes the loop N03 opened, now the player knows what the water runs over |

| Re-assigned | Was | Now | Why |
|---|---|---|---|
| **D09** Upstream | Forage | Forage, Line (`gather` added) | a live fish from above Longacre proves it better than tasting does |
| **D19** Below the Bottom | Setting, Kindle | Setting, Cull | you break into ground nobody has worked. Something is living in it |
| **N18** Both Cores | Kindle | Kindle, Cull | the two-core cast gets tested on the voles. Quietly grim, entirely Longacre |

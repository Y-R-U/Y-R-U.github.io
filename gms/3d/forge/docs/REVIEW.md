# FORGE — adversarial design review

Reviewed: `docs/STORY.md` (835 lines), `docs/SYSTEMS.md` (1,217 lines), `CLAUDE.md`, and the engine
(`js/world/zones.js`, `spell.js`, `people.js`, `chicken.js`, `terrain.js`, `interior.js`,
`js/player.js`, `js/input.js`, `js/editor/`, `shots/street_dusk.json`).

Line references are to the documents as read on 2026-08-13.

---

## Verdict

Not buildable as written. The two documents are not two halves of one design — they are two designs
that share a premise, and they disagree about the number of schools, the names of the schools, the
number of acts, the length of the game, the level scale, and whether the three campaigns are one
character or three. Worse than the naming: the XP economy does not close. The balance table
(SYSTEMS §10) ends at Attunement 420, which costs **5.3 million XP**, while the document's own
21-hour justification (§2.1, line 185) is priced at Attunement 301 and **3.4 million XP** — and four
of the ten schools (Glamour, Barter, Mend, Ward) have no XP throughput within two orders of
magnitude of what the table demands. Glamour 45 at its only stated rate of 2 XP/s is 89 hours of
standing next to an NPC. The fiction is good, several of the mechanical primitives are excellent
and should be protected, but nobody should write a line of gameplay code until §2, §10 and the
school list are re-cut. Two to three weeks of design work stands between this and a build.

---

## 1. Reconciliation table — the canonical terms

### 1.1 Schools

Ten schools. Selection criteria, in priority order: (a) does the name collide with a load-bearing
noun already in the fiction; (b) is it a verb the player performs — both docs claim this and
STORY §9 rule 7 enforces it in quest text; (c) is it legible as a one-word HUD label at 390 px;
(d) is the set internally consistent in part of speech.

| # | **Canonical** | STORY name | SYSTEMS name | Why this name |
|---|---|---|---|---|
| 1 | **Kindle** | Kindling | Kindle | Verb, not gerund. STORY's list mixes gerunds (Kindling, Mending, Warding, Setting, Grafting) with nouns (Line, Hearth, Green, Reckoning); SYSTEMS' list is uniformly verbs. Take the consistent set. |
| 2 | **Ward** | Warding | Ward | Same reason. |
| 3 | **Line** | Line | Draw | **STORY wins, on a hard collision.** "The draw" is the plot's most-repeated noun — the covenant draw, the week's draw, "draw slow and give back", "Whitewall draws above the covenant" (STORY §1, §4 L12/L13, §5). A fishing school called Draw makes "count the draw" ambiguous in the one scene it must not be (N12). Line is unclaimed, evocative, and already carries three quest titles. |
| 4 | **Forage** | Green | Forage | "Green" is not a verb and a HUD reading "Green 12" says nothing. Forage names the action. STORY's growing/seed-keeping content sits under it unchanged. |
| 5 | **Cull** | — (folded into Kindling) | Cull | **SYSTEMS wins by addition.** The owner's brief says "cull the problematic rodents"; STORY's own quest titles say "Cull eight rodents" (L02/D02/N02) but assign them to Kindling. Cull must be its own school — see Blocking 4 for why this matters more than it looks. |
| 6 | **Hearth** | Hearth | Hearth | Agreed. No change. |
| 7 | **Mend** | Mending | Mend | Verb consistency. |
| 8 | **Barter** | Reckoning | Barter | Close call. "Reckoning" is the better word but it is nine letters next to Mend/Ward/Line on a phone HUD, and it reads as apocalyptic-fantasy rather than as market work. Barter names the mechanic (haggle, stall, glut). Keep "reckoning" as an in-fiction word characters use for pricing; the school is Barter. |
| 9 | **Setting** | Setting | Delve | **STORY wins, on a faction collision.** Blackstone's people are "the Delvers" (STORY §2, line 143). A universal school named after one faction's demonym — which that faction then has a "+" affinity in (SYSTEMS §1.1) — is a tautology, and it implies Light and Neutral are doing a Dark thing when they lay a kerb. Setting is already proven across all three towns in the quest catalogue (L07 kerb, D07 basalt course, N07 boundary post) and it preserves the level-editor-as-diegetic-school tie (S08). Cost, stated honestly: "Setting 12" is a weaker HUD label than "Delve 12". Accepted. SYSTEMS' breaking verbs (Seam, Shift, Quarry) live under Setting unchanged. |
| 10 | **Glamour** | Grafting *(hidden)* | Glamour | **Neither, wholly — these are two mechanics that got conflated.** See below. |

**Glamour / Grafting, arbitrated.** STORY needs the transformation to be secret and Neutral-only;
SYSTEMS needs a public stealth school because it has (correctly) given Ward the shields, while
STORY §3 line 180 double-books Warding with "going unseen". Resolution:

- **Glamour** is the tenth public school: Dim, Hush, Mask. All factions have it; Light is penalised.
- **Graft** is the Neutral capstone spell, replacing SYSTEMS' **Wear**. Granny Sedge's pear-to-thorn
  scene (N09) survives intact as the capstone tutorial.
- "Wear" must go regardless of this arbitration: SYSTEMS uses *wear* as a verb for disguise
  (§7.3) and *integrity/wear* as an attrition system (§5.6) in the same document. Homonym.

This also resolves the count cleanly: ten schools, one of which has a hidden capstone. STORY's
"eight public and one that is not" (§3, line 167) becomes "nine public plus Cull, and one capstone
spell that is not".

### 1.2 Every other disputed term

| Term | STORY | SYSTEMS | **Canonical** | Why |
|---|---|---|---|---|
| Currency | "coin", unpriced (§7 header, line 523) | **Marks** (§6.1, line 771) | **Marks** | SYSTEMS is the only doc with numbers. "Coin" survives as what characters say. |
| Currency symbol | — | `m` (§6.1) | **`mk`** | `m` collides with metres, which SYSTEMS uses on nearly every line of §3–§4. |
| Light town | **Whitewall** | asked for (§12.1) | **Whitewall** | STORY fixed it. |
| Neutral town | **Longacre** | asked for | **Longacre** | — |
| Dark town | **Blackstone** | asked for | **Blackstone** | — |
| Code zone ids | — | `light`/`neutral`/`dark` | **`light`/`neutral`/`dark`, permanently** | `zones.js` is frozen on these keys (CLAUDE.md line 47). Display names never enter code. |
| Markets | Whitewall market / the Market Post / the Board | asked for "one market name" (§12.1) | **all three** | Not a conflict. The glut ledger is per-district by design (§7.3 lever 3), so three named markets is correct. |
| Factions | the Tenders / the Household / the Delvers | Light/Neutral/Dark | **STORY's, for display** | — |
| Disguise-detector NPC | **Warden Alder**, head of the Whitewall temple, friendly (§8) | **Warden**, enemy #8 and the suspicion trigger (§4.1, §7.3) | **the Watch / Watchman** for the enemy class; **Warden** stays a Whitewall clerical rank | Direct collision: the game's kindliest NPC and the class the player must avoid share a name. "The Watch" is already in the fiction (L08 "Standing Watch", S14 "Night Watch", Warding's "night watch") and the player *serves* on it in Act 1, which makes fighting it later land. |
| Standing band "Neutral" | — | §7.1 band −10..20 | **"Plain"** | Collides with the Neutral faction. |
| Charm crafting verb | — | "Forging" (§5.7) | **Binding** | The game is FORGE, the seam is "the Forge", and the crafting verb cannot also be forging. Three meanings of one word. |
| Progression scale | ranks 1–5 (L26 "Kindling 5", L27, N23 "Reckoning 5") | levels 1–50 (§2.1) | **levels, cap 20** — see Blocking 2 | STORY's whole reward economy tops out at 10% of SYSTEMS' curve. |
| Acts | 5 per campaign, 15 total (§4–§6) | 3 per campaign, 9 total (§10, line 1117) | **15** | STORY's five-act shape carries the unlock ladder; SYSTEMS' table must be re-cut to 15 rows. Every "act 7" reference in SYSTEMS (§7.3 lever 4, §8, §10) is wrong under the canonical structure. |
| Campaign continuity | three characters, ranks carry at ⅓ capped at 2 (§10, lines 765–777) | one character, full carry (§7.2 line 891, §8 line 977) | **one character** — see Blocking 3 | Full carry is the only thing that delivers the owner's "far more powerful". |
| Truths | the main carryover (§10, lines 723, 780) | absent from the carry table (§8) and from the save schema (§9) | **canonical; add to both** | — |
| Echoes | absent | §8, line 999 | **canonical; STORY owes three names** (SYSTEMS §12.6) | — |
| Cinder Token | absent | §7.3, line 915 | **canonical; STORY owes a name and a reason** (§12.5) | — |
| Attunement | absent | §2.1, line 191 | **canonical; STORY owes an in-fiction word.** SYSTEMS §12 forgot to ask for this one — add it to the list | It is on the character sheet, so it will be said out loud. |

### 1.3 Where each rename has to be applied

| Rename | STORY | SYSTEMS | Code / data |
|---|---|---|---|
| Kindling → Kindle | §3 table, §7.1–7.3 school column (14 rows), §9 rule 5 | none | `sim/schools.js`, save key `kindle` (already correct in §9) |
| Warding → Ward | §3, §7.1–7.3 (11 rows), §9 rule 5 | none | already `ward` |
| Draw → Line | none | §1 table row 3, §1.1, §1.2, §1.3, §2.2 (4 rows), §3.5, **§5.2 in full** (`drawLevel`, `catchWeights`, `castTime`, `biteChance`, Deep Call, Second Line), §5.7 modifier list, §9 save key `draw` → `line`, §10 checks | `sim/tables.js`, `sim/gather.js`, save migration v1→v2 |
| Green → Forage | §3, §7.1–7.3 (9 rows) | none | already `forage` |
| — → Cull | **new column entries** in §7.1–7.3: L02, D02, N02 and every combat quest currently marked Kindling | none | — |
| Mending → Mend | §3, §7.1–7.3 (6 rows) | none | already `mend` |
| Reckoning → Barter | §3, §7.1–7.3 (16 rows — the most-used school in the catalogue), §9 rule 5 | none | already `barter` |
| Delve → Setting | none | §1 table row 9, §1.1, §1.2 (rename the L45 milestone "Quarry" is fine to keep), §1.3, §2.2, §5.4, §9 save key `delve` → `setting`, §10 | `sim/tables.js`, save migration |
| Grafting → Glamour (school) | §3 table row 9, §6 "The mechanic, as story", §7.3 N09/N10/N15/N18/N24 school column | none | — |
| Wear → Graft (spell) | none | §1.2 Glamour L45, §7.3 in full (title, "Casting Wear", "mid-Wear-channel", `worn`), §8 carry table, §9 save field `worn` (keep the field name — it is fine as a boolean-ish) | `sim/faction.js` |
| Warden → Watchman (enemy) | none | §4.1 row 8, §1.3 Glamour row, §2.2, §7.3 suspicion table (3 rows), §12.4 | `sim/combat.js` enemy id |
| Forging → Binding | none | §5.7 title and body, §6.3 sink table | — |
| coin → marks | §7.1–7.3 reward column (11 rows) **and every reward needs an amount** | none | — |

---

## 2. Blocking issues

Numbered by severity. Nothing below this line should be coded around; it has to be decided.

### B1. The XP economy does not close. It is short by roughly 60%, and four schools are untrainable.

SYSTEMS §10's table ends act 9 at **Attunement 420** (line 1130). Attunement is the sum of ten
school levels (§2.1, line 191), so 420 averages level 42 across all ten.

    xpToReach(42) = 50 × 41^2.5 + 25 × 41 = 50 × 10,763 + 1,025 = 539,175
    × 10 schools                            = 5,391,750 XP

§2.1's own justification for the 21-hour figure (line 185) is *"levelling three schools to 50 and
six more to 25"*:

    3 × 841,575 + 6 × 141,690 = 2,524,725 + 850,140 = 3,374,865 XP
    Attunement = 3×50 + 6×25 + 1 = 301, not 420

So the document argues for a 3.37 M XP game and then tabulates a 5.39 M XP game. **The balance
table costs 60% more than the paragraph that justifies it.**

Worse, the back half is impossible at any rate. Acts 7–9 are budgeted 8.5 hours and must carry
Attunement from 235 to 420:

    Attunement 235 ≈ 10 × xpToReach(23.5) ≈ 1.14 M
    Attunement 420  = 5.39 M
    Required: 4.25 M XP in 8.5 h = 500,000 XP/hour = 139 XP/second, sustained, for 8.5 hours.

And it has to be spread across all ten schools, four of which cannot deliver it:

| School | Only stated XP source | Rate ceiling | XP to level 42 | Time |
|---|---|---|---|---|
| **Glamour** | 2 XP/s while disguised near a Warden (§1.3 line 135, §2.2 line 219) | 7,200 XP/h | 539,175 | **75 hours** |
| **Glamour, levels 1–30** | *none* — Dim (L5) and Hush (L15) are not disguises; Mask arrives at L30 | 0 | 227,171 | **the school is untrainable from 1 to 30** |
| **Barter** | 0.08 × marks moved (§2.2 line 218) | peak wealth is 60,000 mk (§10 line 1130) | 539,175 → **6.74 M marks moved** | ~112× turnover of the player's entire net worth |
| **Mend** | 0.7 XP per integrity point (§2.2 line 217) | §5.6 line 739 states active play generates **~100 integrity/hour** of legitimate repair = 70 XP/h | 539,175 | **7,700 hours** |
| **Ward** | "damage absorbed while Brace is up" (§1.3 line 129) | **no rate is given anywhere in the document** | — | undefined |

Ward is the HP stat *and* the Focus stat (§3.1, §4.3). It is mandatory and it has no XP rate.

Meanwhile §10 line 1128 lists **Glamour 30 as the lead school at the end of act 7**, 14.5 hours in.
Glamour 30 costs 227,171 XP at 2 XP/s = 31.5 hours of an activity the player cannot perform,
because the disguise it requires is itself gated on Glamour 30. It is a closed loop.

**Fix — three changes, all small:**

1. **`MAX_LEVEL = 20`.** Same curve, same shape, same milestone philosophy at **3 / 7 / 12 / 17**.
   `xpToReach(20) = 79,153`; ten schools to 20 is **791,530 XP**, Attunement cap 200. At the
   document's own 350 XP/action that is 2,261 actions; at one action per 12 s of real play
   including travel, dialogue and story, that is **7.5 hours** — inside STORY's 8.5–11 h estimate
   and comfortably inside a mobile game. Every formula in the doc keyed to level (power, FocusMax,
   HpMax, critChance, sellPrice, burnChance, catchWeights) needs its coefficient re-scaled ×2.5,
   which is one pass and one soak re-run. Attunement gates become 48 / 96 / 128.
2. **Give Glamour, Barter, Mend and Ward real rates**, with the same structure as Cull and Line:
   a per-action base in `sim/tables.js` sized so that a level-appropriate action pays ~350 XP.
   Glamour: XP on a *successful un-Wear* and on each suspicion-decay tick below 40, not on seconds
   elapsed. Barter: flat XP per *transaction* by item tier, with the percentage as a small bonus.
   Mend: XP per *object* repaired, not per integrity point. Ward: XP per *hit absorbed*.
   Time-based XP is a rate limiter dressed as a training loop and it fails on a phone.
3. **Delete the `Attunement` act gates from §10** (six of nine rows) and keep the tier gates only.
   They contradict STORY §10 line 758's explicit promise that "school ranks are never required to
   finish" — see B5.

### B2. STORY's reward scale is 1–5. SYSTEMS' is 1–50. Neither doc noticed.

STORY's highest reward in 79 quests is **rank 5** — L26 "Kindling 5, Warding 4" (line 556),
N22 "Kindling 5" (line 615), N23 "Reckoning 5" (line 616). Under SYSTEMS, level 5 is the *first*
milestone and costs 1,700 XP out of 841,575. **The Light campaign, as STORY specifies its rewards,
ends with the player at 0.2% of the curve.**

More fundamentally, 79 quests specify a school and a rank and **not one specifies an XP amount or a
mark amount**. "coin" appears eleven times as an entire reward. The soak test in §10 cannot be
written; the economy in §6 has nothing to be an economy of.

**Fix:** delete the rank column from STORY §7 entirely. Replace with two numeric columns —
`xp` (per school named) and `mk` — filled by the systems designer against the level-20 curve, not
by the writer. STORY keeps the school column, which is the part it is qualified to own.

### B3. Three characters or one? The premise depends on the answer and the docs give opposite ones.

- STORY §10, lines 765–777: *"Each campaign is a new character in the same persistent valley…
  School ranks carry at one third, rounded down, up to a cap of rank 2."*
- SYSTEMS §7.2 line 891 and §8 line 977: *"There is one character across all three campaigns…
  no reset of skills or gear."* And §7.3 line 970: *"Every level you earned as Light you still have
  as Neutral; the Neutral campaign is strong precisely because you did the other two. That is the
  reframe the whole design rests on."*

Under STORY's rule the Neutral player arrives at rank 2 in a handful of schools and Neutral is not
more powerful than anything. Under SYSTEMS' rule the Neutral player is a Whitewall apprentice who
is also a Blackstone Delver who is also Miller Hana's child.

**Arbitration: SYSTEMS wins on mechanics** — full carry-over is the only mechanism in either
document that delivers the owner's fixed requirement that Neutral "becomes far more powerful"
(CLAUDE.md line 26). The fiction must move.

**Fix, concretely, and it improves the story:** the Household fosters its children out. The Light
protagonist is a Longacre child placed in the Whitewall apprentice hall as an infant; after
Whitewall they are sent east and work a season in Blackstone (Sela is an adoptive older sister,
which is exactly the relationship STORY already writes for her); the Neutral campaign is coming
home and being told what you were for. This costs three re-framed opening scenes and it buys:
one character with a mechanically justified skill table; a reason Bel and Kesta half-recognise
"Ansel"; and a twist that is personal rather than expositional. Hana as mother survives. Dob's
tragedy in N24 sharpens, because Dob is the one who *stayed*.

### B4. The opening quest is a Cull quest and the starting faction is penalised in Cull.

The owner fixes both ends of this: the player can only start as Light (CLAUDE.md line 24) and the
opening is "cull the problematic rodents" (line 28). SYSTEMS §1.1 line 88 gives Light **Cull −**:
XP ×0.85, power ×0.92. Light is also penalised on Setting (line 91) and Glamour (line 93).

So the first verb the game teaches is the one the only playable faction is worst at, and every
number in §6.4 is computed as if it weren't:

    §6.4 line 839: "8 grain rats culled = 8 × 40 + 100 first-kill = 420 Cull XP → Cull 3"
    Actual, Light:  (320 + 100) × 0.85 = 357 XP.   (Still Cull 3 — xpToReach(3) = 332.)

    §10 line 1143 sanity check: "Rats needed to reach Cull 3 from zero = 6"
    Actual, Light:  rat 1 = (40+100) × 0.85 = 119; rats 2–7 = 34 each.
                    7 rats = 323 < 332.  8 rats = 357.   The answer is 8, not 6.

**Every stated number in the opening is computed for a faction the player cannot be.**

**Fix:** move Light's penalty off Cull. Light is the sustain-and-repair faction; penalise it on
**Delve/Setting and Glamour** (both already penalised) and make Cull flat. Then re-derive §6.4 and
the §10 checks. This is a one-cell change in the affinity matrix and it removes a bad first
impression that no amount of tuning elsewhere recovers.

### B5. Act gating contradicts the design's own retention promise.

STORY §10 line 758: *"Sandbox quests, exploration and school ranks are **never** required to finish
a campaign… the only hard gates are the act gates listed in the prereq column."*

SYSTEMS §10 gates six of nine act exits on Attunement (lines 1123–1129: 45, 95, 165, 225, 330),
gates tier-2 spells on Attunement 120 (§3.5 line 426), gates tier-3 on 240, and gates the Neutral
capstone on Glamour 45 plus both campaigns complete (§7.3 line 901). §3.5 line 430 states the
intent plainly: *"it makes a one-school specialist impossible."*

Both positions are defensible. They cannot both ship. The promise STORY makes is the one that keeps
a mobile player who has forty minutes a week, so:

**Fix:** keep the Attunement gate on *spell tiers* (it is a good, invisible diversification
pressure). Delete it from *act exits*. An act ends when its quests end. A player who ignores
gathering gets a weaker character and the same story, which is exactly what STORY promised.

### B6. There is no clock, and eleven systems depend on one.

SYSTEMS §6.3 line 817 asserts *"the engine already runs a day cycle through the `time` knob"*.
It does not. `time` is a **lighting slider** — scenarios set it with `app.quality.set('time', s.time)`
(`js/world/demo.js` line 55) and nothing advances it. There is no world clock in `js/`.

Dependent on a clock that does not exist: the glut ledger reset (§6.3, and `ledger.day` in the save
schema, §9 line 1084); `Reforge`, "1 per real-world day" (§1.2 line 113); Mend's "first repair of a
given object each day ×3" (§1.3 line 132); Standing daily caps (§7.1); freshness (§6.2 — this one
is held-minutes, so it is fine); S16 "all three markets inside one day"; S19 "before dark";
S20's cooling meal; Whitewall's entire identity as the *scheduled* town versus Blackstone's *quota*
town (STORY §2, lines 89 and 147); "before the bell" (L01); "one night" (L08); "after dark" (D03);
and "every eighth day" (L14/D13/N14).

STORY §11.6 leaves the clock "open for the systems designer". SYSTEMS never picks it up. It fell
through the gap between the two documents and it is load-bearing for a quarter of the content.

**Fix:** specify it now. Recommended: a continuous world clock at 1 real minute = 1 game hour
(a 24-minute day), driven from the existing `time` knob so the lighting is free, with a
`worldDay` integer. Quests that need a specific hour *advance* the clock on accept ("you wait until
dark") rather than making the player wait — STORY §11.6 already permits snapping.

### B7. The Act 1 fishing quest is impossible under the catch tables, and the opening's marks are wrong.

STORY L03 (line 533): *"Catch five chalk-trout from the Whitewall stretch."* SYSTEMS §5.2's Light
reach table (line 620) gives **chalk trout `req: 8`** — `catchWeights` returns weight 0 for any
entry whose `req` exceeds the player's Line level, and the player is at Line 1. The quest cannot
be completed.

SYSTEMS' own costing of the same quest (§6.4 line 842) uses **6 mudbream**, which is a *Neutral
reach* fish (x between −35 and 35, §5.2 line 610) — the wrong species in the wrong river reach in
a Whitewall quest.

And the total is wrong:

    6 mudbream:  6 × round(9 × 0.556) = 6 × 5  = 30 mk
    8 rat tails: 8 × round(3 × 0.556) = 8 × 2  = 16 mk
    Sum                                        = 46 mk
    §6.4 line 845 states                       = "~62 marks"

The 62 figure then justifies the shopping list on line 850: *"62 marks buys one charm, or a kit and
some food."* A kit (25) plus food (24) is 49 mk. **At the real total of 46 the second option is not
affordable, so the "first real decision, four minutes in" is a single option.** This is before glut
(the 8th tail sells at ×0.86) and before freshness on the walk to market.

**Fix:** L03 catches **Silverling** (`req 1`, V 12, 70 XP — the Light reach's starter fish).
Five silverling = 350 + 100 first-catch = 450 XP → Line 3, and 5 × round(12 × 0.556) = 5 × 7 =
35 mk. With 16 mk of tails that is 51 mk, and the shopping list should be re-priced to make two
options affordable and a third aspirational.

### B8. Quests, dialogue and the journal are unspecified. They are the largest unbuilt system.

Neither document specifies a quest runtime. `sim/save.js` gets a `quests` blob (§9 line 1067) and
that is the whole of it. STORY's 99 quests use at least **twenty distinct objective verbs**: light,
cull, catch, sell, cook, mend, set, hold-a-position, attend, walk-and-count, carry, escort, haggle,
ferry, guide-an-NPC, scout-unseen, read-an-object, dig, disguise-and-infiltrate, choose-an-ending.

Alongside it: no dialogue system (STORY §9 writes three scenes and a two-line-per-bubble rule for a
390 px screen, with no speaker UI, no advance affordance, no skip, no re-read, and no answer to
what the touch controls do while a bubble is up — L09 is seven bubbles, N21 is six seated
speakers); no journal (STORY §10 line 780 calls Truths "the real carryover" and the save schema has
no field for them); and no recontextualisation display, without which the Dark campaign's entire
mirror structure — STORY §5's table, lines 376–384 — is invisible to the player and exists only as
author's intent.

**Fix:** design the quest primitives *first* and cut any quest that needs a twenty-first verb.
Eight primitives will cover it: `kill(kind, n, area)`, `gather(kind, n)`, `deliver(item, n, npc)`,
`interact(objectId, n)`, `goto(area)`, `escort(npcId, path)`, `talk(npcId, nodeId)`,
`survive(area, seconds)`. Everything else — the lamp round, the crate count, the ridge scout — is
one of those eight with different dressing. Then build the journal as a first-class screen with
Truths, and make recontextualisation a visible strikethrough, not a note in a design doc.

---

## 3. Serious issues

### S1. The Neutral payoff is "differently powerful", and one of its four levers is arithmetically zero.

SYSTEMS §7.3 lines 948–966 gives four levers. Assessed:

1. **Six affinities instead of three.** Real but small: +15% XP, +10% power. In a *fight*, a
   Neutral-worn-as-Dark character has exactly Dark's +10% on Kindle/Cull/Setting; the extra three
   affinities are Line/Forage/Barter, which are not combat schools. Delivers "richer", not
   "stronger".
2. **Field stacking, "+33% sustained DPS".** **Provably zero as written.** Quicken is *"−25% cast
   time"* (line 414). §3.2 line 313 sets a hard global cooldown of 0.40 s and states *"no spell may
   fire faster"*; tap cast time is `SHAPES[shape].charge` = 0.20 s. Cutting 0.20 s to 0.15 s
   changes nothing, because the GCD is the binding constraint. The intended number is recoverable
   with a one-word change: if Quicken cuts the **GCD** to 0.30 s, casts/second goes 2.5 → 3.33,
   which is +33.3% — exactly the claim. Say GCD, not cast time.
3. **"2.4× marks per hour."** Labelled *"empirically"* (line 961) with no source. And marks are
   deliberately not power in this design — §6.1 line 774 keeps the reward track off the money
   economy on purpose. 2.4× marks converts to at most one charm tier early, worth +7–8% on one
   school. Weak.
4. **"Tier-3 spells inside act 7."** Not a property of Neutral at all. It is a property of *playing
   third*. A player who could start as Dark would have the identical advantage. Delete it from the
   list of reasons Neutral is strong; it is a reason the ladder is a ladder.

The systems designer's own flag that this is an unmeasured assumption is correct, and the risk is
high: two non-arguments, one zero, one modest. **Recommended fix:** build §10's existing check
(*"Neutral Worn as Dark vs pure Dark, equal levels, 4 enemies, 30 s → 30–36% ahead"*, line 1152)
as a `sim` test **before** any Neutral content is authored. If it fails, the 21-hour gate in front
of Neutral is unjustifiable and the ladder should be shortened. Additionally, give Neutral one
thing legible in three seconds of combat: it is the only faction that holds two spell sets at once
(own fields + worn projectiles), and a Break should trigger a free Graft into the *other* faction
rather than being purely a punishment. That is a comeback mechanic, and comebacks read as power.

### S2. Minute one is a lamp round.

Judged cold, as a player who owes the game nothing, on a phone:

Boot → apprentice hall → Sister Bel talks → **L01: light nine lamps before the bell**. Nine
identical context-button presses with walking between them, against a timer, with no threat and no
choice. The reward is **Kindling 1** — a rank in a school the same quest already handed the player
when they took the staff off the rack.

The first interesting thing in FORGE is L02's first rat, two to four minutes in.

Then Act 1 continues for **forty minutes** (STORY line 803; SYSTEMS budgets 48, line 1122) across
nine quests with, in STORY's own words, "no villain" (line 210).

And seven of those nine quests are the sandbox repeatables with a name on them:

| Act 1 quest | Sandbox equivalent |
|---|---|
| L01 First Light | S19 Lamp Round |
| L02 The Granary | S01 Vermin Contract |
| L03 Line and Water | S02 Fish Order |
| L05 Cook's Hands | S04 Kitchen Order |
| L06 Mend the Run | S05 Panel Repair |
| L07 A Course of Stone | S07 Kerb and Course |
| L08 Standing Watch | S14 Night Watch |

**Fix, specific:**
- **Invert L01 and L02.** Open *in* the granary, at night, lamp already out, one rat visible in the
  dark. The first input the player makes is a cast. Bel's speech happens on the way out, in two
  bubbles.
- **Cut Act 1 from nine quests to five** (rat / fish / sell / cook / covenant). Move the fence, the
  kerb and the night watch to the sandbox board — the content is not lost, it is already there.
  Target 12–15 minutes, not 40.
- The covenant reading (L09) then arrives inside one session, which is the only way its "pretty
  scene that is a lie by omission" beat can work.

### S3. The bolt fires where you last walked, not where you are looking.

`spell.js` line 207 aims along `P.yaw`. `player.js` lines 188–190 set `yaw` from the **velocity
vector** — the direction of travel — not from `camYaw`. On touch, the floating stick and the
look-drag are independent, so a player who drags the camera to face a rat and taps to fire sends
the bolt along their last walking heading.

SYSTEMS §3.3's `acquire()` (line 353) assumes `yaw` is an aim direction and free-aims along
`player.yaw` when nothing is acquired. It will feel broken on the first rat.

**Fix, decide now because it changes how L02 plays:** on cast, snap `yaw` toward `camYaw` over the
swing (the swing animation covers it), and free-aim along `camYaw`. Then `acquire()` works as
specified.

### S4. Fishing's skill check is gated on an API iOS does not have, through a gesture that will misfire.

SYSTEMS §5.2 line 671: *"a bite makes the device vibrate and the charge ring flash — release within
0.6 s to land it."* `navigator.vibrate` is unsupported in Safari on iOS. Half the audience gets no
haptic.

And the gesture: `input.js` detects a tap on the look half as `moved < 16 px` within 400 ms
(lines 5, 100). A **4.15-second hold** (Line 1 cast time, §5.2 line 663) that must not drift 16 px,
on a phone held in one hand, is not a reliable input.

**Fix:** fishing uses the **context button**, not a look-half hold. The button is already specified
(§3.3) and is already the "work node" affordance. Widen the release window to 0.9 s on touch.
The charge-ring flash must be sufficient without haptics; treat vibration as a bonus.

### S5. The armour formula reproduces none of the bestiary.

SYSTEMS §4.1 line 464 presents `enemyArmour = round(lvl × ARMOUR_K[kind])` with K of 0 (soft),
1.6 (hard), 2.2 (plated), and claims *"any new enemy is one line of data."* Checked against the
table above it:

| Enemy | Level | Stated armour | Implied K |
|---|---|---|---|
| Mire rat | 6 | 6 | 1.00 |
| Creek crab | 8 | 26 | 3.25 — above the maximum K |
| Sour crow | 12 | 4 | 0.33 |
| Blight boar | 18 | 34 | 1.89 |
| Hollow | 22 | 45 | 2.05 |
| Watchman | 26 | 52 | 2.00 |
| Champion I/II/III | 30/38/46 | 60/72/84 | 2.00 / 1.89 / 1.83 |

**Zero of ten match.** The HP and damage curves, by contrast, reproduce the table exactly —
`enemyHp(22) = round(10 + 4 × 22^1.45) = 364` ✓, `enemyDamage(26) = 3 + 1.6 × 26 = 44.6` ✓. Those
are correct and should be protected.

**Fix:** delete `ARMOUR_K` and make armour a hand-authored data column, which is what it already
is. Do not pretend it is generated.

### S6. Wandering east at level 3 is unsurvivable and nothing warns you.

SYSTEMS §4.4 argues that fixed bands plus `tierMul` remove the need for a "you are too high level"
message. That answers **XP**, not **survival**. The three districts sit on one continuous
heightfield 140 m apart (`DISTRICT_W = 70`, `terrain.js` line 10) with no loading boundary; the
player is clamped only to x ±145 (`player.js` line 170) and walks at 5 m/s, 8.5 sprinting. The Dark
town interior is band **24–34**.

At Ward 1 the player has 48 HP (§4.3). A Watchman does `44.6 × 100/104 = 42.9`. **Two hits.**
The gutter then costs 8% of carried marks and half the unbanked perishables — i.e. exactly the
fish the player just spent four minutes catching.

**Fix:** it is 90% already written. §7.1's Standing bands already say *"district gates unlocked"*
at Trusted. Say the rest out loud: the two far towns are gate-locked until Trusted; the open
countryside and the creek between them carry band 1–12 only; and put an explicit visual telegraph
(the Watch patrol on the bridge) at each boundary.

### S7. The countryside the owner asked for is not in the terrain.

CLAUDE.md line 15–17 fixes *"three entire towns… with real countryside in between."*

`terrain.js` line 96 flattens the ground to a town pad wherever
`smoothstep(42, 28, |x − cx|)` is non-zero, for each of the three centres at x = −70, 0, +70.
For any point between two adjacent centres to be unflattened it must satisfy both
`|x + 70| ≥ 42` and `|x| ≥ 42`, i.e. `x ≥ −28` **and** `x ≤ −42`. Empty set. At the furthest point
between two towns (x = −35) the mask is `smoothstep(42, 28, 35) = 0.5`, so the ground there is
**half-flattened to town pad height**.

There is real countryside — the ~90 m band south of the towns down to the creek (`creekZ ≈ 56`,
line 67) and the Outfield north of the walls, both outside the `mz` term. But **east–west, town to
town, there is none**: the towns' pads touch.

**Fix:** either widen `DISTRICT_W` from 70 to ~110 (which costs terrain vertices and walking time,
and STORY's river-tint-in-one-walk spine gets longer), or narrow the town mask from
`smoothstep(42, 28, …)` to `smoothstep(30, 20, …)` and accept smaller towns. The second is cheaper
and the towns are already generously sized at 84 m across. Either way it is an owner decision,
because it is an owner requirement.

### S8. The perf gate is already spent, and the number was measured on the wrong hardware.

`shots/street_dusk.json`, measured: **350,393 tris, 66 draw calls, 54.2 MB textures**, at 960×540,
dpr 1. SYSTEMS §0 line 11 sets the budget at **< 350k tris, < 150 draw calls**.

The scene is **0.1% over the triangle gate with no gameplay in it at all** — no enemies, no nodes,
no HUD, no named landmarks, 24 generic buildings per district.

Two structural facts make it worse:

- `js/editor/build.js` line 1: *"A district is one static batch."* Frustum culling therefore
  operates at **district granularity**. It can drop a whole town or nothing; it cannot drop a
  building. Every landmark STORY names that must be individually interactive or enterable
  (Temple, campanile, Store, apprentice hall, Dock, market, Pell's yard, Mill, Market Post, Seed
  Store, Long Barn, Pit-head, Slate Hall, Torr's forge, Dry Stand — roughly 27 across three towns)
  must come *out* of its batch, costing a draw call each and adding its triangles unculled.
- The 350k measurement is a **desktop software renderer at 960×540**. A mid phone at 390 CSS px and
  dpr 2 draws 780 × 1,690 px — 2.5× the fragments. The perf claim is unproven on the target device.

**Fix:** get a real device number before a single item of content is authored, using
`node tools/shot.mjs --headed --perf` on the actual phone, and set the content budget from it.
Then decide the LOD story: the cheapest large win is to split each district batch into a near/far
pair and drop the far half beyond ~90 m, which the merge pipeline can do at build time.

### S9. Three engine capabilities the docs assume and the engine does not have.

1. **The rat.** STORY §11.1 correctly flags that no rodent rig exists. SYSTEMS §4.1 line 448
   answers it as *"chicken, scaled 0.55, no wings"*. `chicken.js` builds a bird from `BODY`,
   `NECKLINE` and `WING` ring tables with a bipedal gait tied to `STRIDE = 0.115` (line 19), a
   comb, a beak and a tail fan, all in one merged geometry, with per-zone `comb`/`beak` colours in
   `zones.js`. There is no quadruped mode and scaling a chicken produces a small chicken. The rat
   needs its own ring tables and gait constant inside the same file. One to two days, not free.
2. **Blackstone's Levels.** STORY §2 line 154 requires three enterable underground galleries.
   `interior.js` builds **one room per house on demand**, in that house's local frame, sized from
   its `w`/`d`/`plinth`/`wallTop` (lines 21–43); the only second space is a loft when the wall is
   over 4.4 m. Three connected galleries with a lowered ceiling is a **new builder**, not a
   parameter. STORY §11.5 calls it open; it is a build item.
3. **Combat.** There is no hit detection of any kind. `spell.js` `reach()` (line 220) raycasts
   against the collider set — walls and terrain — and has no concept of an enemy. Damage, aggro,
   enemy AI, the 24-hostile pool and the instanced hostile mesh are all unwritten. SYSTEMS is right
   that this is one adapter plus `sim/combat.js`, but nine story quests and three sandbox
   repeatables depend on it existing.

### S10. Per-faction bolt properties have nowhere legal to live, and the disguise breaks the colour lookup.

SYSTEMS §3.4 gives Light a 28 m/s bolt and Dark 18 m/s (lines 379, 393). `spell.js` has one
`SHAPES.bolt` with a global `speed` exposed as the `spellSpeed` knob (line 175). SYSTEMS' own answer
— three `SHAPES` entries — is legal and correct under §0 line 14.

But `spell.js` line 188 reads colour from `zone(this.player.zoneId).spell`, and `player.setZone()`
(`player.js` line 110) swaps geometry, material **and** `zoneId` together. A Neutral character
Worn as Dark must simultaneously look Dark, cast Dark-coloured projectiles, and cast **Neutral**
fields (§7.3 line 944 makes that rhythm the intended playstyle). One `zoneId` cannot express two
states.

**Fix:** split it. `player.zoneId` stays the *true* faction; add `player.wornId` (null when not
disguised) and have `setZone` take the appearance id while colour lookup takes
`spell.factionId ?? player.wornId ?? player.zoneId`. Small, and it must be decided before
`js/game/cast.js` is written.

### S11. The two-core bolt is not readable, and the docs instruct the team to protect a claim rather than a value.

CLAUDE.md lines 47–50 and STORY lines 183–186 both assert that neutral's spell colours are
deliberate foreshadowing — *"the only zone that pairs a bright core with one [a void]"*.

Measured against `zones.js`:

    neutral.spell.core = #ffe6a8 → relative luminance ≈ 0.905,  void #2b2a14
    dark.spell.core    = #e4d2ff → relative luminance ≈ 0.850,  void #080309

Dark also pairs a bright core with a void. The difference is **6% luminance**, on additive
particles a few pixels across, at 22 m/s, on a 390 px screen. It is not a tell.

And the tell fires too late regardless: STORY says a player *"in Act 1 of the Neutral campaign"*
has been told the twist — by which point the twist is about to be stated out loud, and the player
could not have cast a neutral bolt earlier because Neutral is locked.

**This is not a request to change `zones.js`.** The values are good art direction and cost nothing.
Delete the *claim* that they foreshadow, and stop treating a hex value as a narrative asset. The
real foreshadowing in this design is the faction-select slate (see §6), which is excellent.

### S12. Smaller contradictions, for the record

| # | Contradiction | Refs |
|---|---|---|
| a | Game length: STORY 8.5–11 h total (Light 3–4, Dark 2.5–3, Neutral 3–4); SYSTEMS 21 h. Factor of two. | STORY §10 lines 801–805; SYSTEMS §10 line 1130, §2.1 line 185 |
| b | §10 act-1 row is self-contradictory: Attunement 14 with "Lead school Draw 5" implies every other school is level 1, but the same row's exit gate requires Cull 3 (Attunement ≥ 16). And §6.4's opening quest alone reaches Attunement 15 in four minutes. | SYSTEMS lines 1122, 839–845 |
| c | Fish spots: SYSTEMS specifies 9 per zone (27 total); STORY names three fishable places in the whole valley. The level designer needs 24 more anchors than the fiction provides. | SYSTEMS §5.1 line 592; STORY §2, §3 line 174 |
| d | Glut off-by-one: "sell 33 and you are at the floor" — with `soldToday` counted before the sale, the 33rd sells at 0.36 and the 34th hits 0.35. The §10 test will fail against the prose. Specify the increment order. | SYSTEMS §6.3 line 812, §10 line 1151 |
| e | STORY §9 rule 5 permits "no invented vocabulary beyond the nine school names, the Forge, the Household, the covenant, the draw, the yield and the tally". SYSTEMS adds at least sixteen nouns, of which Marks, Focus, Attunement, Standing and Cinder Token are on the HUD and will be said aloud. The rule needs rewriting against the real list. | STORY line 700 |
| f | Cosmetic robe tints carry over (STORY §10 line 773). `zones.js` has one `robe` colour per zone and is frozen; a tint system is an additive change requiring the owner's sign-off per CLAUDE.md line 47. | — |
| g | Save stores no position by design (§9 line 1087), but N18 (captured on purpose) and N19 (break out) are location-states. Reloading mid-quest respawns at a town hearth and either breaks or trivially completes them. `quests` has `step` and `counts` and no scene field. | SYSTEMS §9; STORY §7.3 |
| h | Suspicion keys entirely off the Watch as a class; STORY §11.3 asks that Kesta specifically be the hardest NPC to stand next to. No per-NPC term exists in the formula. | SYSTEMS §7.3; STORY line 822 |
| i | `input.js` declares `this.attack` (line 11) and never writes it; `index.html` has a `#fire` div the input never binds. Dead surface that will confuse whoever adds `attackDown`/`attackHeld`. | — |
| j | Endings are unstored: N25 sets one of three postures and L27 a binary, and `campaign` in the save (§9 line 1032) has `current`/`act`/`done`/`echoes` and no posture field. STORY §10 line 505 says postures are recorded in the journal. | — |
| k | STORY's Longacre landmarks need kit the engine does not have: the Mill's working wheel, and the Long Barn's "no windows on the street side" (per-face window suppression). Both are legal as props/params but neither exists. | STORY lines 124, 127 |

---

## 4. Cut list

Target for the first playable: one team, four to six weeks, a complete 45-minute experience with a
hook — not a vertical slice of nine acts.

| Item | Verdict | Note |
|---|---|---|
| **Whitewall, fully playable** | **MVP** | Other two districts stay in the scene as skyline; they are already built and already paid for in the batch. |
| **Light Act 1 + Act 2, re-cut to 12 quests** | **MVP** | Ends at L15 on the unease beat with a "to be continued". A complete arc. |
| **Six schools: Kindle, Cull, Line, Hearth, Barter, Ward** | **MVP** | The five the opening actually uses, plus Ward because it is the HP and Focus stat. |
| Forage, Mend, Setting | **Defer** | Their quests (L06, L07, L11) move to the sandbox board or wait. |
| **Level cap 20, milestones 3/7/12/17** | **MVP** | See B1. Cap 50 is abandoned outright. |
| **3 enemies: grain rat, mire rat, sour crow** (+ rat-knot, free) | **MVP** | Rat-knot is four rat instances sharing an aggro flag. |
| Creek crab, blight boar, Hollow, Watchman, Brood-mother, champions, elites | **Defer** | |
| **8 sandbox repeatables** (S01, S02, S04, S05, S07, S12, S15, S19) | **MVP** | These *are* the Act 1 content; building them once serves both. |
| S03, S06, S08, S09–S11, S13, S14, S16–S18, S20 | **Defer** | |
| **Quest runtime, 8 primitives** | **MVP** | B8. Nothing ships without it. |
| **Dialogue UI, journal with Truths, quest tracker** | **MVP** | B8. |
| **World clock + day tick** | **MVP** | B6. |
| **Save, with mid-quest scene state** | **MVP** | §9 is nearly right; add Truths and a quest scene field. |
| **Touch-control onboarding** | **MVP** | Six gestures, currently zero teaching. |
| **Audio hookup** (cast, impact, footstep, bell, ambience) | **MVP** | `audio/` already has a 1,239-line SFX registry. Neither design doc mentions sound once. |
| **Market/sell panel** | **MVP** | Selling 13 items with per-item glut and freshness on 390 px is a real UI problem nobody has drawn. |
| **Level editor** | **MVP — as is** | Already built. Do not extend it. |
| Charms tier I–II | **MVP** | The 40 mk charm is the opening's reward decision. |
| Charms tier III–IV, Reforge, Stall, stall rent | **Defer** | |
| Dark campaign (26 quests) | **Defer** | And re-cut Act 1 from 9 quests to 4 when it comes — see S2/Q1. |
| Neutral campaign (26 quests), Glamour, Graft, suspicion, Cinder Tokens | **Defer** | And gate the whole investment on the S1 sim test passing first. |
| Blackstone's Levels (3 underground galleries) | **Defer** | New builder, not a parameter. |
| Standing bands, Echoes, Legacy Cache, cross-faction bleed | **Defer** | Ship a single Standing integer. |
| **Glamour as a trainable school** | **Abandon** | No XP source exists below level 30 and the level-45 gate is 89 hours. Make Graft a story-granted capstone with no XP track. |
| **Barter XP as % of marks moved** | **Abandon** | 6.7 M marks against a 60 k peak wealth. Flat XP per transaction by tier. |
| **Mend XP per integrity point** | **Abandon** | 7,700 hours. XP per object repaired. |
| **The 9-act balance table** | **Abandon** | Contradicts STORY's 15 acts and is priced 60% above its own justification. Rewrite as 15 rows against cap 20. |
| **"2.4× marks per hour" arbitrage lever** | **Abandon** | Unsourced, and marks are deliberately not power in this design. |
| **"Tier-3 inside act 7" as a Neutral advantage** | **Abandon** | It is a property of playing third, not of the faction. |
| **Reforge "once per real-world day"** | **Abandon** | Real-world-day mechanics in an offline localStorage game are a clock-tampering invitation. |
| **Mixed-plate buffs, buff stacking cap 2** | **Abandon** | Two buff slots on a phone HUD with no inventory screen. |
| **STORY's ⅓-carry, cap 2 rule** | **Abandon** | B3. |
| **Cinder Tokens at 350 mk** | **Abandon as priced** | If Graft ships, make the tokens a quest item then free. A 350 mk / 4-minute tax on a 12-minute buff makes the game's headline mechanic feel metered. |

---

## 5. Missing systems — nobody specified these

1. **Quest runtime.** B8. Twenty objective verbs, one JSON blob in the save schema, no trigger
   model, no prereq evaluator, no turn-in, no scheduler for "every eighth day".
2. **Dialogue presentation.** B8. Three sample scenes and a line-length rule; no system, no speaker
   UI, no advance/skip/re-read, no rule for what the touch controls do while a bubble is up.
3. **Journal and quest tracker.** Truths are called the trilogy's main carryover and have no UI, no
   save field, and no recontextualisation display.
4. **Mid-quest save.** S12(g). Save every 10 s, no position, no scene state, and at least five
   quests that strand the player somewhere unusual.
5. **The world clock.** B6. Eleven dependents.
6. **Touch-control onboarding.** `input.js` ships three non-obvious gestures (floating stick,
   look-drag, tap-on-the-look-half-to-attack); SYSTEMS §3.3 adds three more (channel-hold, school
   dial with long-press radial, context button). Six gestures, zero teaching, and the
   flip-for-left-handers toggle is buried in the quality panel where a left-handed player will
   never find it.
7. **Audio.** The repo contains `audio/` — 1,949 lines including a 1,239-line SFX registry and a
   verification harness. **Neither design document mentions sound once.** No music plan, no cast
   sound, no impact, no ambience per town, and — most damningly — the bell that three Act 1 quests
   are timed against is an audio mechanic that no one has specified.
8. **Accessibility.** Nothing at all. No colour-blind consideration, which is not cosmetic here:
   Light/Neutral/Dark are distinguished chromatically and the *entire disguise mechanic* is about
   reading robe colour. No text scaling. No reduced-motion. No haptics fallback (S4). No hold-
   duration alternative for the 3.0 s Graft channel or the 1.2 s charge. No subtitles for audio
   cues.
9. **Difficulty boundaries.** S6. `tierMul` answers XP, not survival.
10. **Pause and interruption.** A game explicitly designed for ten-minute pieces (§4.3 line 541)
    with a 4.15 s fishing cast and a 3.0 s uninterruptible channel has no pause, no backgrounding
    rule, and no answer for a phone call arriving mid-channel.
11. **First-run boot and faction select.** STORY §10 specifies the slate screen as fiction with no
    implementation owner. `main.js` currently boots straight into the world.
12. **Inventory screen.** STORY §11.4 says inventory is "assumed to exist"; SYSTEMS §0 line 15 says
    "no inventory tetris". But freshness is per-item with a timestamp, glut is per-type, cooking
    consumes stacks, banking is a separate list, and the gutter destroys 50% of unbanked
    perishables. That is an inventory with rules and it needs a screen.
13. **Vendor/market UI.** §6 specifies every price and `js/game/market.js` is one line in a table.

---

## 6. Kill the darlings

1. **The eighth-day wagon.** Three quests of watching a cart (L14, D13, N14) plus two rows in the
   recontext tables, paying off a Truth the player has already inferred from L13. Keep L14; make
   D13 and N14 one journal line each.
2. **"Cousin Ansel" / "Kettle" / Dob.** Three aliases for one character, revealed in N24 by asking
   Dob who Dob is. It requires the player to have retained two throwaway NPCs from ten and fifteen
   hours earlier. That is a novelist's structure. Keep Dob and keep the reveal; cut to **two**
   faces, and put the recognition in the **UI** — the journal shows one portrait under two names —
   rather than in a line of dialogue.
3. **The Longacre chores, three times.** L18, D17 and N06/N07 are the same leat, the same crate,
   the same hen. Authored as three angles on one afternoon; played as the same fetch quest three
   times, with the third being the tutorial. Do it twice. The third time, have Hana wave the player
   past *because they are family* — which sells the twist better than the chore does.
4. **The nine lamps.** S2. Atmosphere posing as a quest, and it is the first thing the player does.
5. **The two-core bolt as foreshadowing.** S11. A designer admiring a hex value. Keep the value,
   delete the claim.
6. **The "draw slow / draw hard" schism history.** STORY §1 spends a page on two hundred years,
   eleven dead in a gallery collapse, and two curtain walls facing the wrong way — and the player
   receives all of it from one NPC (Old Pell) and one wall-walk (D08). It supports one genuinely
   good joke: both towns built a wall against an enemy that turned out to be each other. Keep the
   joke. Cut the history to what Pell says out loud.
7. **SYSTEMS §7.3's four levers.** S1. Written to reassure the reader, containing two
   non-arguments, one unsourced empirical claim, and one number that is provably zero.
8. **The 1–50 curve, and the Runedale comparison that produced it.** §2.1 opens by distinguishing
   itself from a 1,000-hour grind and then specifies 5.4 M XP for a 21-hour mobile game. The
   rhetorical flourish survived into the numbers.
9. **N26 as a playable epilogue.** "Walk the west field the morning after" is a walking simulator as
   a final level, in a game whose combat and traversal are its weakest parts. Deliver the epilogue
   over the faction-select slate and let the player keep the good feeling.

---

## 7. What is genuinely good — protect this

Short, and only where earned.

- **`zones.js` as the single point of faction difference**, and the discipline in `CLAUDE.md`
  line 44 that keeps `if (zone === 'dark')` out of every other file. It is the reason the disguise
  mechanic is nearly free to implement (`player.setZone` already swaps geometry, material, crowd,
  hood eyes and spell colour together). That is a rare architectural win and it should survive
  every decision above. The one required change (S10, splitting true faction from worn appearance)
  is additive and does not touch the file.
- **The `sim/` purity boundary** (SYSTEMS §0.1) and the **seeded-RNG soak test** (§10 line 1156).
  "Every balance change is one number and one re-run, and nobody has to open a browser" is the
  correct answer and most projects never reach it. Build `tools/soak.mjs` early — it is how you
  will discover B1's successor before it ships.
- **`tierMul` and `repMul`** (§2.3). Two pure functions replacing a level-gate message, a daily cap
  and an area-lockout system. Keep them exactly as written; the arithmetic checks out
  (`0.85^6 = 0.377` at gap 10 ✓, floor reached at streak 23 ✓).
- **The gutter** (§4.3). No XP loss, no corpse run, perishables as the only real bite. Correct for
  the platform and correctly reasoned.
- **Glut as a price sink rather than a gold sink**, with per-district ledgers (§6.3). Stops the
  money being created rather than chasing it afterwards, and the counter-play is variety, which
  every other system also rewards.
- **The HP and damage curves** (§4.1 line 462). Unlike the armour formula, these reproduce the
  bestiary exactly, and the "two taps for the very first rat" derivation (§4.2 line 508) is the
  right thing to have obsessed over.
- **The faction-select slate**, and specifically the Longacre slate being tappable and dismissive
  from the very first launch (STORY §10 line 796). Free, and the single best piece of
  foreshadowing in either document. Do not grey it out, and do not let anyone "fix" it.
- **The river tint as the plot's spine** (STORY §1.1). It is already in `zones.js`, it is readable
  at a glance, and it is a plot point the player verifies with their own eyes rather than being
  told. Genuinely excellent.
- **The Dark→Light recontextualisation contract** (STORY §5, lines 376–384). A real design
  artefact, stated as a contract with the writers. It needs to become a **UI feature** to exist for
  the player at all — see B8 — but the thinking is right.
- **Charm forging with no failure roll** (§5.7 line 761). "The randomness is in which modifier you
  get, which is a decision point rather than a loss." Correct, and correctly reasoned about the
  audience.
- **The save format** (§9). XP not levels; seed in the save so a bug report replays bit-identically;
  timestamps on items because freshness is the only thing that needs them; fixed-length charm array
  with nulls; no positions. Right on every point except the two missing fields (Truths, quest scene
  state).
- **STORY §9's dialogue rules 1, 3, 4 and 7** — two lines per bubble against a real 390 px target,
  no dialect spelling ever, work talk over lore talk, quest text is a verb. Enforce these in review.
  The three sample scenes demonstrate them and are the best writing in either document.

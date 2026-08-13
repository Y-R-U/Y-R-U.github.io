# FORGE — Game Systems

The mechanical spec. Narrative, quests and cast live in `docs/STORY.md`; terrain, scale and the
engine plan live in `docs/WORLD.md`. This document owns numbers.

**Revision 2**, rewritten against `docs/REVIEW.md`. Every formula below was executed in node before
being written down, not asserted. Where the review and this document disagree, §14 says so.

---

## 0. Canonical terms

Binding, from `CLAUDE.md`. Applied throughout this document.

| Term | Note |
|---|---|
| Ten schools | **Kindle · Ward · Line · Forage · Cull · Hearth · Mend · Barter · Setting · Glamour** |
| **Line** | fishing magic. Never "Draw" — "the draw" is the plot's most-repeated noun |
| **Setting** | stone and building magic. Never "Delve" — Blackstone's people are the Delvers |
| **Graft** | the Neutral capstone *spell*. Never "Wear" — this document uses wear/integrity for attrition |
| **Marks (`mk`)** | currency. Never `m` — collides with metres |
| **the Watch / Watchman** | the disguise-detecting enemy class. Warden Alder is a friendly NPC |
| **Binding** | charm crafting. Never "forging" — the game, the seam and the verb were all already forge |
| **Plain** | the Standing band from −10 to +20. Never "Neutral" — collides with the faction |
| Towns | **Whitewall** (light) / **Longacre** (neutral) / **Blackstone** (dark). Code ids stay `light` / `neutral` / `dark`, permanently |
| Level scale | **1–20**, milestones at **3 / 7 / 12 / 17**. Grasp 10–200 |
| Acts | **15** — five per campaign |
| Protagonist | **one character across all three campaigns**, full skill carry |

### Nouns this document puts on the HUD

STORY §9 rule 5 caps invented vocabulary at the school names plus the Forge, the Household, the
covenant, the draw, the yield and the tally. These six words are on screen and will be said aloud,
so the rule needs to admit them:

**Marks · Focus · Grasp · Standing · Truth · charm.**

Everything else in this document (glut, familiarity, tier gap, integrity, suspicion, gutter) is an
internal mechanism name that never appears in the UI and never needs a fiction.

---

## 1. Design constraints

| Constraint | Source | Consequence |
|---|---|---|
| 60fps mid phone; < 150 draw calls, < 350k tris | `forge_test/CLAUDE.md` | See the perf note below. Hard cap of 24 simultaneous hostiles, all instanced |
| **The gate is already spent** | `shots/street_dusk.json`: 350,393 tris, 66 calls, 54.2 MB, one district, no gameplay | Every system here is specified with an explicit draw-call and triangle cost. Nothing may allocate a mesh per instance |
| No build step, plain ES modules | repo convention | localStorage save, no bundler, no server |
| **Landscape only** | `CLAUDE.md` | Touch layouts may assume a wide screen. Buttons go in the bottom corners, not stacked |
| Zones are frozen art data | `js/world/zones.js` | Faction mechanics live in `sim/faction.js`. Nothing here adds a key to `zones.js` |
| One spell caster, two particle clouds | `js/world/spell.js` | Every spell is an entry in `SHAPES`, never a new file |
| Thumb stick + two buttons | `js/input.js` | No target cycling, no modifier gestures |
| Everything tunable is a knob | `quality.register()` | §13 lists them |
| Testable in node without a browser | this brief | Everything numeric lives in `js/sim/*`: pure, no `three`, no DOM, no `Math.random`, no `performance.now` |

**On the perf gate.** The untouched engine already draws the full triangle budget with one district
visible. This document therefore does not get to spend triangles. Every gameplay system below is
either instanced into an existing draw call (hostiles, nodes) or is UI. The two additions that cost
real draw calls are the hostile mesh set (3 calls) and the node tint pass (0 — it reuses the scatter
instance colour attribute). If a system here needs a mesh per entity, it has been specified wrong.

### 1.1 The sim boundary

`js/sim/` is pure. `node --test js/sim/*.test.js` must run green with zero setup.

| Module | Owns | MVP? |
|---|---|---|
| `sim/rng.js` | xorshift32 seeded; `roll(rng, weightedTable)` | MVP |
| `sim/clock.js` | pure day/hour arithmetic and boundary detection (§9) | MVP |
| `sim/xp.js` | curve, `levelFor`, `xpToReach`, `tierMul`, `repMul`, `grantXp` | MVP |
| `sim/schools.js` | ten schools, affinity matrix, milestone unlocks | MVP |
| `sim/spells.js` | spell defs: cost, coefficient, cooldown, shape key, faction variant | MVP |
| `sim/combat.js` | damage, mitigation, crit, Focus, HP, gutter, enemy stat blocks | MVP |
| `sim/tables.js` | catch/forage/drop/node tables, item values, recipes — data only | MVP |
| `sim/gather.js` | node state machine, respawn, bite and yield rolls | MVP |
| `sim/economy.js` | buy/sell price, glut ledger, freshness, stall ticks | MVP |
| `sim/quest.js` | the eight objective primitives, prereq evaluation, reward grant (§12) | MVP |
| `sim/save.js` | `normalise(doc)` + migration chain | MVP |
| `sim/faction.js` | Standing, bands, suspicion, Graft duration and Break | P3 |

Renderer-side adapters hold no numbers of their own:

| Module | Job | MVP? |
|---|---|---|
| `js/game/cast.js` | binds `sim/spells` to `SHAPES`; owns aim resolution (§4.3) | MVP |
| `js/game/enemies.js` | instanced hostiles, built on the `world/chicken.js` pattern | MVP |
| `js/game/nodes.js` | promotes scatter instances to nodes; show/hide | MVP |
| `js/game/hud.js` | Focus, HP, school dial, context button, charge ring | MVP |
| `js/game/market.js` | sell/buy panel; every number from `sim/economy` | MVP |
| `js/game/worldclock.js` | advances the clock, drives `lighting.time` (§9) | MVP |

`sim/combat.resolveHit()` takes `{attacker, defender, spell, charge, rng}` and returns
`{damage, crit, effects}`. It never learns where anything is in 3D.

---

## 2. The ten schools

There is no mundane skill. You do not hold a rod; you *line* the fish out. Every verb is a cast,
costs Focus, plays on the same staff swing, and trains a level.

| # | School | What it does | The cast feel | MVP? |
|---|---|---|---|---|
| 1 | **Kindle** | Offensive projectile magic — the bolt that already exists | Motes gather at the staff head, a bolt leaves at the peak of the swing | MVP |
| 2 | **Ward** | Defence and endurance. Shields, roots, knockback. The HP *and* Focus stat | A held brace; the effect grows out of the ground under you | MVP |
| 3 | **Line** | Fishing. Pulls things out of water, later out of anything loose | A long shallow arc onto the water, then a tug you have to answer | MVP |
| 4 | **Forage** | Coaxing yield out of growing things | A low wide pulse along the ground; whatever is ripe lifts | P2 |
| 5 | **Cull** | Beast and vermin magic. Killing pests, driving them off, later binding them | A short flat snap, close range. A command more than a weapon | MVP |
| 6 | **Hearth** | Cooking. Raw to cooked, cooked to buffs | Held over the thing; a slow warm bloom, no bolt | MVP |
| 7 | **Mend** | Repair. Staves, charms, fences, walls, locks | A stitching motion; particles run *toward* the target | P2 |
| 8 | **Barter** | Market magic. Reads true value, sways a price, later runs your stall | Cast at a person or a stall. The effect is a number changing | MVP |
| 9 | **Setting** | Stone and ground. Breaks rock, opens seams, lays courses | A downward strike; the heaviest impact in the game | P2 |
| 10 | **Glamour** | Illusion. Dim, Hush, Mask — and, for Longacre only, Graft | No projectile. A channel, and then you are different | P3 |

### 2.1 Affinity matrix

Affinity is **XP ×1.15, power ×1.10**. Penalty is **XP ×0.85, power ×0.92**. Neutral has three
native affinities and no penalties anywhere — the mechanical seed of "Neutral is stronger", present
before any transformation.

| School | Light | Neutral | Dark |
|---|---|---|---|
| Kindle | — | — | **+** |
| Ward | **+** | — | — |
| Line | — | **+** | — |
| Forage | — | **+** | — |
| Cull | — | — | **+** |
| Hearth | **+** | — | **−** |
| Mend | **+** | — | **−** |
| Barter | — | **+** | **−** |
| Setting | **−** | — | **+** |
| Glamour | **−** | — | — |

**Light is flat on Cull, deliberately** (REVIEW B4). The first verb the game teaches cannot be the
one the only playable faction is worst at. Light's two penalties are Setting and Glamour: it is bad
at other people's stonework and structurally incapable of deceit, which is a characterisation, not
a tax on the tutorial.

Dark keeps **+ Setting**. With the school no longer named after the Delvers there is no tautology —
a mining town being good at stone is just true.

Read across: Light is sustain and repair, Dark is damage and extraction, Neutral is gathering and
economy.

### 2.2 Milestones — 3 / 7 / 12 / 17

| School | L3 | L7 | L12 | L17 |
|---|---|---|---|---|
| Kindle | **Split Bolt** — one cast, two targets at 60% each | **Ember** — impacts leave a 2 m patch, 6 dps, 4 s | Charged casts pierce the first target | **Cinderfall** — hold 1.2 s for a 5 m column, 3× damage, 12 s cd |
| Ward | **Brace** — 4 s, −40% incoming, no Kindle while up | **Root** — 2.5 s immobilise, 3 m ring | Brace reflects 25% of blocked damage as Kindle damage | **Bulwark** — Brace for everyone in 3 m, 30 s cd |
| Line | Fish spots visible at 40 m instead of 12 m | **Second Line** — 18% chance a catch returns two | Can line through silt; the Blackstone reach's blocked spots open | **Deep Call** — once per 5 min, guarantees the spot's rarest entry |
| Forage | Ripe nodes glow through foliage at 25 m | **Clean Cut** — nodes you harvest respawn 35% faster | Harvest yields the cooked-tier reagent directly 20% of the time | **Bloom** — 8 m pulse harvests every ready node, 90 s cd |
| Cull | Vermin below 20% HP die instantly to any Cull hit | **Scatter** — a kill panics every hostile within 5 m for 2 s | **Bind** — one beast is an ally for 45 s, 3 min cd | **Brood-Sense** — spawns marked on the compass; +25% Cull damage to marked |
| Hearth | Cooked food grants a 3 min buff, not only HP | **Two Pots** — cook a whole stack in one cast | Buffs last 6 min | **Feast** — one cast buffs everyone in 6 m; second buff slot opens |
| Mend | Repair at 8 m instead of touch | **Hold Fast** — repaired items lose integrity 40% slower for 10 min | Can restore a *broken* (integrity 0) charm at 3× cost | **Reforge** — reroll one charm's modifier, keeping tier, once per 3 game-days |
| Barter | See true value before you sell | **Haggle** — once per vendor per day, +12% on that sale | **Stall** — list 6 stacks; they sell passively | Glut floor rises from 0.35 to 0.55 on everything you sell |
| Setting | Rock nodes yield 2 instead of 1 | **Seam** — 25% chance a rock node reveals a rarer one | **Shift** — raise or lower a 2 m ground patch by 1 m for 20 s | **Quarry** — break every rock node within 10 m, 120 s cd |
| Glamour | **Dim** — hostiles lose you at 12 m instead of 22 m | **Hush** — no aggro from movement for 20 s, breaks on cast | **Mask** — look like a generic citizen of the district you stand in; no faction powers | **Graft** — Longacre only, and story-granted. See §8.3 |

**Graft is granted by the quest N07, not by a level.** Glamour *level* then scales its duration and
suspicion resistance. This is the fix for the closed loop the review found: the disguise is no
longer gated behind a level that only the disguise can train. A Light or Dark character who reaches
Glamour 17 gets Mask upgraded to 15 m range instead.

### 2.3 Training loops — every school has a real per-action rate

The review found four schools with no throughput. All four are fixed here, and the arithmetic is
shown. The yardstick: **a level-appropriate action pays roughly 350 XP**, and one level near the top
of the curve costs 8,000–10,000.

| School | Primary rate | Secondary | Time to 20 (79,153 XP) |
|---|---|---|---|
| Kindle | damage-weighted share of the kill's XP (§3.2) | breaking barriers | ~150 band-appropriate kills |
| Cull | the kill's Cull share | non-lethal drive-off pays 60%, no drop | ~150 kills |
| Line | per catch, by species tier (55–780) | junk pulls 25% | ~300 catches |
| Forage | per node, by tier (45 / 130 / 410) | growing a planted seed to ripe | ~350 nodes |
| Hearth | per cook: `4.0 × item value`, burnt `0.80 ×` | feeding a buff to an NPC | ~260 cooks |
| Setting | per rock node, by hardness (60 / 190 / 520) | Shift casts a quest consumes | ~300 nodes |
| **Ward** | **`12 × attackerLevel` per hit absorbed with Brace up**; `3 × attackerLevel` per hit taken with Brace down; `20 × targetLevel` per Root that lands on a moving target | — | **~550 absorbed hits** at Watchman tier, and Ward trains in every fight whether or not you Brace |
| **Mend** | **`120 × objectTier` per object repaired** (tiers 1–5); first repair of a given object each day ×3 | — | **~264 objects** at an average tier 2.5. Mend 12 is **68** objects |
| **Barter** | **flat per transaction by item tier: 45 / 120 / 300 / 700 / 1500**, plus `0.02 × marks moved` as a garnish | appraising an unseen item: flat 60 | **~264 transactions** |
| **Glamour** | **`60 × enemyLevel`** each time a hostile loses track of you under Dim or Hush (once per hostile per 60 s); **`400 + 25 × secondsHeld`, cap 1,600**, on a voluntary un-Graft below suspicion 40; **200** each time suspicion falls from above 60 to below 40 | — | **~68 evasions to Glamour 12** with no disguise at all, then ~113 grafts to 20 |

**Hearth was priced at less than half the rate of every other school.** At `1.8 × value` a
level-appropriate cook paid 137 XP against the ~350 yardstick this table is built on, and 400 cooks
to cap against Kindle's 150 kills. `4.0 ×` puts a cook on the yardstick and Hearth on the same
ladder as everything else.

That was half the fix. The other half was content: the critical path named Hearth on five quests out
of 67 and Line on six, so the rate had nothing to apply to. STORY revision 3 added twelve quests and
re-assigned three, and the sandbox board now always posts S02 Fish Order and S04 Kitchen Order
rather than rolling for them. Hearth went 10 → 14, Line 12 → 18 and Cull 12 → 15.

Five notes on why these shapes and not the old ones:

- **Ward** was previously undefined despite being the HP and Focus stat. It now trains from being
  hit, which is what a defensive school should train from, and it cannot be avoided by playing well
  — Brace merely pays 4× better.
- **Mend per object, not per integrity point.** The old rate was 0.7 XP per point against ~100
  points an hour of legitimate repair: 7,700 hours to cap. Per-object is 264 objects.
- **Barter flat per transaction.** The old rate needed 6.7 M marks moved against a 13,000 mk peak
  net worth. The percentage survives at 0.02 as a reason big sales feel better, not as the engine.
- **Glamour from level 1 without a disguise.** Dim (L3) and Hush (L7) are public spells that every
  faction has, and evading under them is the training loop. Graft then arrives as a story reward on
  a school that is already levelled.
- **Six numbers in this document are invented and unratified**, flagged here so a later reader does
  not mistake them for derived: the value bands that select Barter's transaction tier (§7.1), the
  XP awards and mark drops for the bosses and champions (§3.2, §5.1), the decision that `tierMul`
  applies to kills but not to gathering, the decision that quest turn-in XP takes the affinity
  multiplier, and the per-job overhead term in §11.

Time-based XP has been removed from the document entirely. It is a rate limiter dressed as a
training loop and it fails on a phone.

---

## 3. XP and levelling

### 3.1 The curve — cap 20

```js
// sim/xp.js
export const MAX_LEVEL = 20;
export const xpToReach = L => L <= 1 ? 0 : Math.floor(50 * Math.pow(L - 1, 2.5) + 25 * (L - 1));
export function levelFor(xp) {
  let lo = 1, hi = MAX_LEVEL;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (xp >= xpToReach(m)) lo = m; else hi = m - 1; }
  return lo;
}
```

Same curve shape, ten times cheaper. Verified in node:

| Level | Total XP | This level | Level | Total XP | This level |
|---|---|---|---|---|---|
| 1 | 0 | — | 11 | 16,061 | 3,686 |
| 2 | 75 | 75 | 12 | 20,340 | 4,279 |
| 3 | 332 | 257 | 13 | 25,241 | 4,901 |
| 4 | 854 | 522 | 14 | 30,791 | 5,550 |
| 5 | 1,700 | 846 | 15 | 37,018 | 6,227 |
| 6 | 2,920 | 1,220 | 16 | 43,946 | 6,928 |
| 7 | 4,559 | 1,639 | 17 | 51,600 | 7,654 |
| 8 | 6,657 | 2,098 | 18 | 60,003 | 8,403 |
| 9 | 9,250 | 2,593 | 19 | 69,180 | 9,177 |
| 10 | 12,375 | 3,125 | 20 | 79,153 | 9,973 |

Ten schools to 20 is **791,530 XP** — the theoretical completionist ceiling, which nobody reaches.

The end state §11 now reports is measured, not modelled: **439,271 XP, Grasp 154** in **7.01 hours**,
which is **17.4 XP/second average** and a peak of **54.6 XP/second** in the last act. A Watchman pays
1,040 XP across three schools, so peak demand is about sixty Watchmen an hour, or the same in fish
and rock — comfortable, and the sandbox is the slack.

The *profile* the old table was generated from — three schools at 20, three at 14 and four at 8 —
is still a fair sketch of the shape, and it comes to exactly 356,460 XP at Grasp 134. The prose here
used to say "four at 14 and three at 8", which is 380,594 at Grasp 140 and does not describe the
table it sat above.

For comparison, the version this replaces demanded 139 XP/second sustained for 8.5 hours.

**Grasp** is the sum of all ten school levels, 10 to 200. It gates spell tiers (§4.5) and
**nothing else** — see §11 on why it no longer gates act exits.

### 3.2 XP sources

`sim/tables.js` holds these. Values are pre-multiplier.

| Source | Award | Note |
|---|---|---|
| Grain rat | Cull 40, Kindle 12 | source level 1 |
| Mire rat | Cull 95, Kindle 26 | level 3 |
| Creek crab | Cull 130, Kindle 40, Ward 20 | level 4 |
| Rat-knot (per member) | Cull 60, Kindle 18 | level 4 |
| Sour crow | Cull 180, Kindle 60 | level 5 |
| Blight boar | Cull 340, Kindle 120, Ward 60 | level 8 |
| Hollow | Kindle 420, Ward 140 | level 10, immune to Cull |
| Watchman | Kindle 700, Ward 280, Glamour 60 | level 12 |
| Fish, by species | Line 55 – 780 | §7.2 |
| Forage node | Forage 45 / 130 / 410 | by tier |
| Rock node | Setting 60 / 190 / 520 | by hardness |
| Cook | Hearth `4.0 × value`; burnt `0.80 × value` | — |
| Repair | Mend `120 × objectTier` | ×3 first time that object is repaired each day |
| Transaction | Barter `45/120/300/700/1500 + 0.02 × mk` | by item tier |
| Hit absorbed under Brace | Ward `12 × attackerLevel` | `3 ×` without Brace |
| Evasion under Dim/Hush | Glamour `60 × enemyLevel` | once per hostile per 60 s |
| Voluntary un-Graft below suspicion 40 | Glamour `400 + 25 × secondsHeld`, cap 1,600 | — |
| First kill / catch / cook / repair of any species or type | +100 flat to that school, once ever | — |
| Quest turn-in | see §12.3 | separate from action XP |

Kindle's share of a kill is proportional to the damage Kindle spells dealt; Cull's to the damage
Cull spells dealt. A player who kills a rat entirely with Kindle gets the Cull share too, at 50% —
otherwise the combat school you are not using never levels and the bestiary stops paying.

### 3.3 Diminishing returns — unchanged, and protected

The review checked these and asked that they survive exactly as written. They do.

```js
export function tierMul(playerLevel, sourceLevel) {
  const gap = playerLevel - sourceLevel;
  return gap <= 4 ? 1 : Math.max(0.05, Math.pow(0.85, gap - 4));
}
export function repMul(streak) {
  return streak < 8 ? 1 : Math.max(0.35, Math.pow(0.93, streak - 8));
}
```

| Player level vs source | tierMul |
|---|---|
| source + 4 or below | 1.00 |
| +5 | 0.85 |
| +10 | 0.38 |
| +15 | 0.17 |
| +20 | 0.07 |
| +24 and beyond | 0.05 floor |

On the 1–20 scale a grain rat is level 1, so it pays 38% at Cull 11 and hits the floor at Cull 25 —
which is above the cap, meaning rats bottom out at 0.07 rather than 0.05. That is the intended
behaviour: the wall arrives at Cull 11–14, in the middle of Light Act 3, which is exactly when the
game wants you at the creek instead of the granary.

`streak` counts consecutive uses of one source key (`cull:grain_rat`, `line:spot_n07`). It resets
after three uses of a different key, or **90 seconds of real time** without that key. Session-scoped
by design; not persisted.

```js
export function grantXp({ base, school, playerLevel, sourceLevel, streak, faction, worn, ash }) {
  const aff = affinityXp(school, faction, worn);
  return Math.max(1, Math.round(
    base * tierMul(playerLevel, sourceLevel) * repMul(streak) * aff * (ash ? 0.85 : 1)
  ));
}
```

---

## 4. Casting

### 4.1 Focus

No mana bar, no potions.

```
FocusMax   = 60 + 10 × Ward level
FocusRegen = 6 + 0.6 × Ward level   per second,  × 2.0 if no cast in the last 2.5 s
```

| Ward | Max | Regen | Rested |
|---|---|---|---|
| 1 | 70 | 6.6 | 13.2 |
| 5 | 110 | 9.0 | 18.0 |
| 10 | 160 | 12.0 | 24.0 |
| 15 | 210 | 15.0 | 30.0 |
| 20 | 260 | 18.0 | 36.0 |

At Ward 1 a bolt costs 8, so you get **8 casts** in a burst and refill in about 5 seconds of
walking. Burst, reposition, burst. Nobody watches a bar.

**Overdraw.** Casting without enough Focus is allowed once: Focus goes to 0, the shortfall is taken
as HP 1:1, and you gain **Guttered** for 2 s (+60% Focus costs). The panic button, and the reason
there is no health-potion economy. Overdrawing twice in a row is how you die.

### 4.2 Timing

`player.swing` decays at 2.6/s from 1.0 and `spell.js` fires at `swing <= 0.5`, so one swing is
0.385 s.

| Term | Value |
|---|---|
| Global cooldown | **0.40 s** [knob `gcd`] |
| Tap cast time | `SHAPES[shape].charge`, default 0.20 s |
| Channel window | 0.35 s to 1.20 s of hold |
| Per-spell cooldown | 0 for basics, 6–120 s for milestones |

```js
export const chargeMul = held => held < 0.35 ? 1 : 1 + 0.8 * Math.min(1, (held - 0.35) / 0.85);
```

Tap 1.0×, full hold 1.8× damage for 1.8× Focus. No efficiency gain from charging — otherwise the
whole game becomes hold-and-release, which is miserable on a phone.

### 4.3 Aiming, and the yaw bug that has to be fixed first

**`player.yaw` is not an aim direction.** `player.js` lines 188–190 set it from the velocity vector.
On touch the stick and the look-drag are independent, so a player who drags the camera onto a rat
and taps sends the bolt along their last walking heading. `spell.js` line 207 aims along `P.yaw`,
so this is live today and will feel broken on the first rat.

**Fix, decided:** on cast, snap `yaw` toward `camYaw` across the swing (the animation covers it) and
free-aim along **`camYaw`**, not `yaw`. `js/game/cast.js` owns this and it must land before any
combat content is authored.

Then aim resolution:

```js
function acquire(targets, camYaw, from, spell) {
  let best = null, bestCost = Infinity;
  for (const t of targets) {
    const ang = Math.abs(wrapPi(Math.atan2(t.x - from.x, t.z - from.z) - camYaw));
    const d = Math.hypot(t.x - from.x, t.z - from.z);
    if (ang > spell.cone || d > spell.range) continue;
    const cost = ang + d * 0.06;
    if (cost < bestCost) { bestCost = cost; best = t; }
  }
  return best;
}
```

No acquisition means free aim along `camYaw`. Soft assist, never lock-on, never a cycle button.

### 4.4 Touch controls — landscape, stick plus two buttons

Existing scheme: one screen half is a floating move stick, the other is look-drag with tap-to-cast
(`< 400 ms`, `< 16 px`). Three changes in `input.js`:

1. Split `attackEdge` into `attackDown` / `attackUp` / `attackHeld`, keeping `attackEdge` as the
   derived tap so nothing that exists breaks. **Also delete `this.attack`** (declared line 11, never
   written) and either bind or remove the `#fire` div in `index.html` — dead surface that will
   confuse whoever adds the new edges.
2. A hold on the look half that stays inside 16 px past 350 ms enters **channel**; the HUD shows a
   charge ring and release fires. Dragging past 16 px cancels the channel into a normal look-drag,
   so turning the camera never fires by accident.
3. Two buttons, in the **bottom corners** (landscape is guaranteed, so they never crowd the thumbs):
   - **School dial.** Tap cycles three pinned schools. Long-press 400 ms opens a radial of every
     unlocked school; drag and release to pick.
   - **Context button.** One meaning at a time by proximity: enter door, work node, talk, sell,
     mend, fish. Greyed when nothing is in range, and it always shows the verb.

That is the whole control surface. Six gestures total, which is three more than the engine teaches
today — **touch onboarding is an MVP item** (§13) and cannot be left to a settings panel. The
left-hand flip toggle in particular must be offered on first boot, not buried in the quality panel.

### 4.5 Faction spell mechanics

Not a palette swap. Each faction is a different weapon class, and each maps onto something
`spell.js` already draws.

**Light** — `flare 1.5`, no `void`. The engine cannot draw Light darker than the sky, so Light
answers with a bigger flash, and the flash is the mechanic.

| Property | Value |
|---|---|
| Bolt speed | 28 m/s (`SHAPES.bolt_light`) |
| Aim cone | 45°, the widest |
| Focus cost | ×1.00 |
| On impact | **Flare** — 2.2 m radius; enemies inside lose their target for 1.5 s |
| On kill | refunds 25% of the spell's Focus |
| Shape | single target, no falloff, no DoT |

**Dark** — `void #080309`, the collapsing core in the second blended pass.

| Property | Value |
|---|---|
| Bolt speed | 18 m/s — visibly slower, must be led |
| Aim cone | 25°, the tightest |
| Focus cost | ×1.15 |
| On impact | **Sink** — 1.6 m implosion, drags enemies 1.2 m in over 0.35 s |
| DoT | **Rot** — 18% of the initial hit per second for 4 s; refreshes, does not stack |
| Feed | 12% of Rot damage returns as Focus |

Against three or more enemies Dark out-damages Light by about **1.7×**. Against one it is ~15%
behind and costs more Focus. Keep that gap sharp; it is the whole reason the two feel different.

**Neutral** — fields, not projectiles. 3 m radius, 6 s, cast at your feet or the aim point, drawn
with the existing bolt shape at `spread 5.6, rise 0.1, speed 40, range 6` so the burst hugs the
ground instead of exploding.

| Field | Effect |
|---|---|
| **Quicken** | **GCD 0.40 s → 0.30 s** for anything inside, and +35% move speed |
| **Glut** | nodes inside respawn instantly, once each; hostiles inside take +20% damage |
| **Still** | Focus regen ×3 inside; hostile projectiles crossing the boundary lose 40% damage |

**Quicken cuts the GCD, not the cast time.** The review found the original wording bought exactly
nothing, because the 0.40 s GCD is the binding constraint and shaving 0.20 s of cast time off it
changes no number at all. Cutting the GCD takes casts/second from 2.50 to 3.33, which is **+33.3%**.
Verified in node.

Fields do no damage. A pure-Neutral character with nothing Grafted is the **weakest combatant in the
game** and the strongest gatherer. That is deliberate: the transformation must feel like picking up
a weapon.

### 4.6 Spell tiers

| Tier | Gate |
|---|---|
| 1 | school level only |
| 2 | school 7 **and** Grasp 48 |
| 3 | school 12 **and** Grasp 96 |
| Capstone | school 17, Grasp 128, faction Sworn |

The Grasp gate is the quiet diversification pressure: at Kindle 17 with everything else at 1,
Grasp is 26 and tier 2 is shut. The fix is obvious and enjoyable — go fishing. **These are the
only Grasp gates in the game.** Act exits no longer carry them (§11).

---

## 5. Combat

### 5.1 Bestiary

Enemy levels are on the **same 1–20 scale as the player**, so `tierMul` means something and a region
band is readable against a school level. Every hostile reuses geometry the engine already produces:
`chicken.js` (instanced low body, shader gait, one draw call per zone) or `people.js` (instanced
robed figure with shader cloth).

**The rat is a build item, not a scale factor.** `chicken.js` builds a bird from `BODY`, `NECKLINE`
and `WING` ring tables with a bipedal gait tied to `STRIDE = 0.115`, plus comb, beak and tail fan.
Scaling it produces a small chicken. The rat needs its own ring tables and gait constant inside the
same file — one to two days, and it is on the MVP critical path.

| # | Enemy | Lvl | Base geo | HP | Armour | Damage | Taps at parity | MVP? |
|---|---|---|---|---|---|---|---|---|
| 1 | Grain rat | 1 | rat tables | 10 | 0 | 5.1 | **2** | MVP |
| 2 | Mire rat | 3 | rat, 1.3× | 52 | 6 | 10.3 | 3 | MVP |
| 3 | Rat-knot (each of 4) | 4 | rat | 80 | 0 | 12.9 | 4 | MVP |
| 4 | Sour crow | 5 | chicken, wing-beat gait | 112 | 4 | 15.5 | 4 | MVP |
| 5 | Creek crab | 4 | rat tables, wide | 80 | 18 | 12.9 | 4 | P2 |
| 6 | Blight boar | 8 | rat, 2.2×, heavy | 226 | 20 | 23.3 | 6 | P2 |
| 7 | Hollow | 10 | people figure, dark tint | 316 | 22 | 28.5 | 7 | P2 |
| 8 | Watchman | 12 | people figure, faction robe | 416 | 26 | 33.7 | 8 | P3 |
| 9 | Brood-mother | 6 | rat, 2.4× | 900 | 12 | 26.0 | 28 | P2 |
| 10 | Champion I / II / III | 14 / 17 / 20 | people figure, zone robe | 2,000 / 2,900 / 3,600 | 32 / 36 / 40 | 52 / 68 / 84 | 31 / 39 / 42 | P3 |

```js
export const enemyHp     = lvl => Math.round(10 * Math.pow(lvl, 1.5));
export const enemyDamage = lvl => 2.5 + 2.6 * lvl;
```

Both reproduce the table exactly. Bosses override HP by hand.

The taps column is computed with `resolveHit`'s per-hit `Math.round` applied, which is what the game
will do. The brood-mother is the one row where that matters: 900 / 33.48 is 27, but the hit rounds to
33 and the answer is 28.

**Armour is a hand-authored column.** The old `ARMOUR_K` formula reproduced zero of ten rows while
claiming any new enemy was one line of data. It has been deleted rather than re-fitted: armour is
the one stat that expresses what a creature *is* — a crab is armoured and a crow is not, and no
function of level says that.

Behaviour, unchanged from revision 1 and all cheap: grain rat flees at 30% and returns in 4 s; mire
rats pack in 2–3; the crab blocks its front arc at −60%; the crow is only vulnerable in its 1.2 s
dive; the boar charges in a line and takes 2× if you sidestep; the rat-knot shares one aggro and
panics when one dies; the Hollow ignores Cull and cannot be Rooted; the Watchman casts back through
`SHAPES` and is the disguise detector (§8.3).

**Cap 24 simultaneous hostiles**, hard, across at most three instanced meshes — three draw calls.
Spawn within 45 m, despawn beyond 70 m. A pack that despawns alive drops nothing.

### 5.2 Damage

```js
export function resolveHit({ power, coef, charge, armour, critChance, factionMul, rng }) {
  const base = coef * power * charge * factionMul;
  const mit  = 100 / (100 + armour);
  const crit = rng() < critChance;
  return { damage: Math.max(1, Math.round(base * mit * (crit ? 1.75 : 1))), crit };
}
export const power      = L => 7.5 + 6 * (L - 1);
export const critChance = L => Math.min(0.30, 0.05 + 0.01 * L);
```

| Kindle | Power | Crit |
|---|---|---|
| 1 | 7.5 | 6% |
| 3 | 19.5 | 8% |
| 7 | 43.5 | 12% |
| 12 | 73.5 | 17% |
| 17 | 103.5 | 22% |
| 20 | 121.5 | 25% |

**Two taps for the very first rat** is the number that matters most in this document, and it
survives the rescale: 10 HP, 0 armour, 7.5 per tap. One tap teaches nothing; four and the player
thinks the game is broken.

### 5.3 Health and the gutter

```
HpMax = 34 + 14 × Ward level + 4 × Hearth level
taken = enemyDamage(lvl) × 100 / (100 + 10 × Ward level)
```

| Ward / Hearth | HP |
|---|---|
| 1 / 1 | 52 |
| 5 / 3 | 116 |
| 10 / 7 | 202 |
| 15 / 12 | 292 |
| 20 / 20 | 394 |

At Ward 1 a grain rat does 4.6 — **12 bites**, which is a long time to notice you are in trouble.
Ward is the only defensive stat; there is no armour to buy, only a level to earn.

**Death is a gutter.** At 0 HP the staff goes out and you wake at the nearest town's hearth.

| Lost | Kept |
|---|---|
| 8% of carried marks (banked untouched) | all XP and levels |
| 50% of unbanked perishables | all charms, staves, reagents, quest items |
| **Ash**: −15% XP for 90 s | node and quest progress |

No XP loss, no corpse run, no gear destruction. The bite is the perishables, which makes "bank
before you push deeper" a real decision without making failure expensive. Correct for a game played
in ten-minute pieces.

### 5.4 Difficulty, and the survival boundary

Regions have **fixed level bands**; enemy level never follows the player. What scales:

```js
export const packSize    = grasp => 1 + Math.min(3, Math.floor(grasp / 30));
export const eliteChance = (grasp, bandLevel) =>
  Math.max(0, Math.min(0.35, 0.04 * (grasp / 10 - bandLevel)));
```

An elite is ×2.2 HP, ×1.35 damage, ×3 XP, ×4 loot rolls, and a rim tint through the per-instance
colour attribute the people and chicken shaders already carry. No extra mesh.

**`tierMul` answers XP; it does not answer survival.** WORLD.md puts the towns 505 m and 573 m apart
on one continuous heightfield with no loading boundary, and the player walks at 5 m/s. A Watchman
does 30.6 damage to a Ward 1 player with 52 HP — **two hits**. So the boundary is stated explicitly
rather than left to the XP curve:

| Rule | Value |
|---|---|
| The two far towns are **gate-locked** until Standing reaches Trusted with them | §8.1 already says "district gates unlocked"; this makes it load-bearing |
| The open countryside and the whole river carry **band 1–5 only** | The Chalk Downs, West March, field strips, Ashen Heath, North Moor and Water Meadows are all safe to wander at Grasp 20 |
| Every gate has a **visible telegraph** — a Watch patrol standing on the bridge | Not a message box |
| Band 6+ exists only inside the far towns and in the two campaign-specific approaches | — |

| Region | Band | Enemies |
|---|---|---|
| Whitewall meadow, lanes, granary | 1–3 | grain rat, mire rat |
| The river, all reaches | 2–5 | mire rat, rat-knot, creek crab |
| Field strips, Ashen Heath, North Moor | 3–5 | rat-knot, sour crow |
| Whitewall upper town | 5–8 | sour crow, blight boar |
| Blackstone approaches | 8–12 | Hollow, blight boar, Watchman |
| Blackstone town and Levels | 10–14 | Watchman, Hollow elites |
| The three finales | 14 / 17 / 20 | champions |

---

## 6. Gathering

### 6.1 The node model

No new geometry. `world/scatter.js` already places grass, flower, bush, rock, trunk and crown
instances per zone with a group id. At world build `js/game/nodes.js` picks instances by index and
promotes them. A node is `{ id, kind, x, z, region, tier, state, t }`; its only visual is the
per-instance tint the scatter shader already supports, plus 2 particles/second from the existing
glow cloud when ready.

WORLD.md's named regions replace the old per-district counts, which were written for a world 14×
smaller. This also resolves the review's finding that STORY names only three fishable places:
anchors are placed per region, and the regions already exist.

| Rule | Value |
|---|---|
| Anchors | 14 forage + 8 rock per region (6 regions + 3 towns = ~200 forage, ~110 rock) |
| Fish spots | 4 per river region; the Whitespring, Hollow Ford and the three Water Meadow shacks are hand-placed |
| Live radius | 80 m from the player; outside that a node is state-only, no particles |
| Global live cap | **40** [knob `nodeBudget`] |
| Idle particle budget | 80 of the glow cloud's 760 [knob] |
| Respawn base | common 35 s, uncommon 90 s, rare 240 s |
| Actual respawn | `base × (0.6 + 0.4 × rng())`, `× 0.65` where Forage ≥ 12 harvested |

State machine in `sim/gather.js`, pure: `ready → working → spent → cooling → ready`. Every
transition takes `now`; the adapter supplies the clock. A whole day of node economy tests in a `for`
loop with a virtual clock and no browser.

### 6.2 Line — fishing

`waterY(x) = 0.15 − 0.0042x` means the river is higher in the west and lower in the east: it flows
Whitewall → Longacre → Blackstone. Everything upstream ends up downstream and the catch tables say
so. STORY makes this the spine of the plot; the tables make it a mechanic.

| Reach | Character | Table |
|---|---|---|
| **Whitewall** | cold, fast, clear. `tint [1.16,1.16,1.08]`, `foam 1.15` | clean fish, little junk, moderate value |
| **Longacre** | the ford, slow and busy. `foam 1.0` | highest volume, lowest rarity |
| **Blackstone** | deep, sluggish, low. `tint [0.62,0.74,0.84]`, `foam 0.85` | high variance; rare fish and *valuable junk* |

**Whitewall reach:**

| Entry | req | Weight | Value | Line XP |
|---|---|---|---|---|
| **Silverling** | **1** | 46 | 12 | **70** |
| Chalk trout | 4 | 30 | 34 | 140 |
| Snowbarb | 9 | 14 | 96 | 340 |
| Riverlight (rare) | 15 | 3 | 420 | 980 |
| Weed (junk) | 1 | 7 | 1 | 18 |

Chalk trout drops from `req 8` to `req 4`. At the old value STORY's L03 — "catch five chalk-trout
from the Whitewall stretch" — was uncompletable, because `catchWeights` zeroes any entry above the
player's Line level and the player is at Line 1. **L03 should catch silverling** (§10.4 costs it
that way), and chalk trout is now reachable by Light Act 2 either way.

**Longacre reach:**

| Entry | req | Weight | Value | Line XP |
|---|---|---|---|---|
| Mudbream | 1 | 52 | 9 | 55 |
| Carp | 3 | 26 | 22 | 105 |
| Ford eel | 7 | 13 | 68 | 250 |
| Goldenscale (rare) | 13 | 3 | 300 | 720 |
| Reed tangle (junk) | 1 | 6 | 1 | 14 |

**Blackstone reach:**

| Entry | req | Weight | Value | Line XP |
|---|---|---|---|---|
| Silt carp | 2 | 24 | 26 | 120 |
| Blackeel | 5 | 34 | 76 | 300 |
| Gravebarb | 11 | 10 | 240 | 780 |
| Sunken relic (junk, valuable) | 1 | 18 | 55 | 40 |
| Drowned coin | 1 | 9 | 30 | 20 |
| Foul water (junk) | 1 | 5 | 0 | 10 |

```js
export function catchWeights(table, lineLevel) {
  return table.map(e => e.req > lineLevel ? 0
    : e.weight * (1 + 0.08 * Math.max(0, lineLevel - e.req))
               * (e.junk ? Math.max(0.15, 1 - 0.05 * lineLevel) : 1));
}
```

Junk falls and rares climb as Line rises, so one table serves the whole curve. Coefficients are
2.5× the old ones to match the compressed level scale.

```
castTime   = max(1.6, 4.2 − 0.13 × Line level)
biteChance = clamp(0.35, 0.95, 0.45 + 0.03 × Line level + 0.10 × spotQuality)
```

`spotQuality` is 0, 1 or 2 per anchor, fixed at world build. Line 1 on a quality-1 spot: 4.07 s
cast, 58% bite, one fish per **7.0 s**. Line 12: 2.64 s, 91%, one per **2.9 s**.

**Fishing uses the context button, not a look-half hold.** A 4-second hold that must not drift 16 px
on a one-handed phone is not a reliable input, and `navigator.vibrate` does not exist in Safari on
iOS, so a haptic-gated skill check locks out half the audience. So:

- Press the context button to cast. The line goes out; the button becomes **Strike**.
- On a bite the charge ring flashes and the button pulses. **Release window 0.9 s on touch**, 0.6 s
  on desktop.
- Vibration fires if `navigator.vibrate` exists. It is a bonus, never the signal.
- Miss the window and the cast is wasted: no Focus refund, no XP.

### 6.3 Forage and Setting

| Zone | Common (w 60) | Uncommon (w 28) | Rare (w 12) |
|---|---|---|---|
| Whitewall | Whitepetal, V 6 | Chalk sage, V 26 | Dawnroot, V 130 |
| Longacre | Tuber V 5, Wheatglass V 8 | Field honey, V 30 | Ninefold clover, V 145 |
| Blackstone | Bitterroot, V 9 | Gravecap, V 38 | Nightbloom, V 210 |

Yield per node: `1 + floor(ForageLevel / 7)`, doubled by Bloom.

| Rock node | req | Yield | Value | Setting XP | Where |
|---|---|---|---|---|---|
| Chalk | 1 | stone chip ×2 | 4 | 60 | Whitewall, the Downs |
| Iron-glass | 5 | shard ×1 | 30 | 190 | field walls, Blackstone approaches |
| Obsidian | 9 | core ×1 | 145 | 520 | Blackstone only |

**Focus cores come only from obsidian, which is Blackstone-only.** That is the structural pressure
forcing a Light player to eventually deal with Dark, and STORY should know it exists.

**Obsidian was `req 12` and iron-glass `req 6`, and both were unreachable.** The soak arrives at
D19 — the first quest that breaks a shaft floor — with Setting 8, because Setting is named on nine
quests and none of them is early. The requirement came down to **7** rather than adding Setting work
to the Dark path, because the *location* is the pressure §6.3 wants, not the level. D07 was also
re-pointed at iron-glass: a thinning seam is not an obsidian seam.

The margin is one level, and it moved when STORY revision 3 added twelve quests. `tools/soak.mjs`
warns when a quest asks for a node the path cannot break, so a content change cannot quietly
reintroduce the block.

### 6.4 Hearth

```
burnChance = max(0.02, 0.40 − 0.055 × (Hearth level − recipe level))
```

40% at recipe level, 2% seven levels above. Burnt items are worth 1 mk and 36% XP.

Cooked food restores `18 + 6 × Hearth level` HP over 3 s, grants a 3 min buff from Hearth 3 (6 min
from Hearth 12), and is worth 2.4× raw. A cook pays `4.0 × value` XP, burnt `0.80 ×`. **Cooking resets freshness to 1.0 permanently** — a strong
quiet reason to level Hearth.

| Dish family | Buff | Magnitude |
|---|---|---|
| River (any fish) | Focus regen | +25%, +40% cooked-rare |
| Field (tuber, wheatglass, honey) | HP max | +12% |
| Whitewall herb | Ward power | +15% |
| Blackstone herb | Kindle power | +15%, and −5% HP max |

**One buff slot.** A second opens at Hearth 17. The mixed plate is cut — three buff families
stacking on a phone HUD with no inventory screen was clutter for its own sake.

### 6.5 Mend and integrity

| Event | Integrity |
|---|---|
| Tap cast | −0.05 |
| Charged cast | −0.20 |
| Milestone or capstone cast | −0.60 |
| Gutter | −8 on the equipped stave |
| Mend cast | `+12 + 4.5 × Mend level` |

Below 30 integrity an item loses 25% power. At 0 it goes **inert** — never destroyed, always
repairable. An item you can permanently lose to attrition is a game that gets uninstalled on a bus.

A Mend cast costs 14 Focus and one **mending thread** (1 common forage + 1 stone chip). At ~2,000
casts per hour of active play that is ~100 integrity/hour, or 3–5 threads. Small, constant, and it
gives Forage and Setting a permanent buyer.

### 6.6 Binding — charms

Three slots. Four with the Longacre Echo.

```
Charm = a core + 2 reagents + a cast of the school being enchanted
```

| Tier | Core | Reagents | Grasp | Magnitude | Cost |
|---|---|---|---|---|---|
| I | stone chip ×3 | common | — | +4% | 40 mk |
| II | iron-glass shard | uncommon | 48 | +9% | 180 mk |
| III | obsidian core | rare | 96 | +16% | 700 mk |
| IV | obsidian ×2 + one Echo | rare ×2 | 140 | +24% and a minor second modifier | 2,000 mk |

The modifier is drawn from the school's list (Line: bite chance, cast time, rare weight; Kindle:
damage, crit, cone). Reforge at Mend 17 rerolls it once per **3 game-days**.

**Binding never fails.** A crafting success roll is a slot machine, not a system. The randomness is
in which modifier you get, which is a decision point rather than a loss.

---

## 7. Economy

### 7.1 Prices

```js
export const sellPrice = (V, barter, freshness, glut) =>
  Math.max(1, Math.round(V * (0.55 + 0.006 * barter) * freshness * glut));
export const buyPrice  = (V, barter) =>
  Math.max(1, Math.round(V * Math.max(1.4, 2.0 - 0.008 * barter)));
```

Coefficients are unchanged from revision 1 and are deliberately *not* rescaled to the 1–20 curve:
Barter should be worth a modest amount, not a 10× swing.

| Barter | Sell | Buy |
|---|---|---|
| 1 | 0.556 | 1.99 |
| 7 | 0.592 | 1.94 |
| 12 | 0.622 | 1.90 |
| 20 | 0.670 | 1.84 |

Barter 20 earns 20.5% more and pays 7.6% less than Barter 1. Worth having, never mandatory.

**Freshness** (fish and raw forage only):

```js
export const freshness = heldMinutes => Math.max(0.5, 1 - 0.025 * heldMinutes);
```

Full value for the first minute, floor 0.5 at 20 minutes. This is what makes "fish, then walk to
market" a loop rather than "fish for an hour, then walk once". It uses wall-clock elapsed time, not
the world clock — see §9.

### 7.2 Glut

The anti-inflation lever, and the review asked that it survive exactly as designed.

```js
export const glut = soldToday => Math.max(GLUT_FLOOR, 1 - 0.02 * soldToday);
// GLUT_FLOOR = 0.35, or 0.55 at Barter 17
```

**Increment order, specified.** `soldToday` is read **before** the unit is counted, then
incremented. So unit *n* (1-indexed) sells at `1 − 0.02(n−1)`, and:

| Unit | Multiplier |
|---|---|
| 32 | 0.380 |
| 33 | 0.360 |
| **34** | **0.350 — the first unit at the floor** |

The prose used to say "sell 33 and you are at the floor", which the §12 test would have failed
against. It is 34.

Ledgers are **per district**, so the counter-play is variety *and* travel — which is also what makes
Neutral's double-market position worth something.

Real sinks behind the price sink:

| Sink | Cost |
|---|---|
| Ferry toll between towns | 12 mk adjacent, 30 mk end to end; halved at Trusted, free at Sworn |
| Binding | 40 / 180 / 700 / 2,000 mk by tier |
| Stall rent (Barter 12) | 200 mk per game-day |
| Gutter | 8% of carried marks |
| Mending threads | ~4 per hour of active play |

Given WORLD.md's 101 s and 115 s legs, the ferry toll is a real choice rather than a formality — it
buys back three and a half minutes.

### 7.3 What the player buys, priced against the opening

| Item | Price at Barter 1 | Why |
|---|---|---|
| Mending kit, 5 threads | 42 mk | keeps the stave above 30 integrity for an hour |
| Cooked silverling ×4 | 15 mk each = 60 mk | ~24 HP each; survives a bad rat pack |
| Coarse line (charm I, Line, +8% bite) | 83 mk | pays for itself in 20 minutes |
| Whetted core (charm I, Kindle, +4% damage) | 83 mk | the dullest option, and the honest one |
| Warm cord (charm I, Ward, +6% HP max) | 115 mk | aspirational — buy it and you buy nothing else |

The soak measures the purse at the §10.4 opening — the walk out of the market after L03 — at
**125 mk**, not the 60 mk this table used to price against. 60 mk was the sale proceeds alone; it
ignored the quest pay for the same three quests. The prices above are the old ones re-derived
against the measured purse at the same ratios, so the shape survives exactly: **kit + food is 102
and affordable; charm + kit is 125 and exactly affordable; the Warm cord alone is 115 and leaves you
with ten marks. Three real options and one trap.**

`tools/soak.mjs` asserts that shape every run, so a change to the opening's takings fails loudly
instead of quietly ruining the first shop.

These are *bought* prices. Binding the same charm yourself still costs the 40 mk of §6.6 plus the
reagents — a shop marks up by roughly `buyPrice`'s 1.99×, which is where 83 comes from.

---

## 8. Faction mechanics

### 8.1 Standing

Per faction, −100 to +100, from 0.

| Action | Effect |
|---|---|
| Complete a faction quest | +8 |
| Cull that faction's declared vermin | +0.5, cap +6 per game-day |
| Sell at that faction's market | +0.2 per 100 mk, cap +4 per game-day |
| Attack a citizen | −15 |
| Kill a citizen | −40 |
| Caught in a Graft (Break) | −25 |
| Cross-faction bleed | gaining Light costs Dark 0.4×, and vice versa. **Neutral is opposed by neither** |

That last row is the mechanical statement of the premise: Light and Dark are zero-sum with each
other, Neutral is orthogonal to both. Neutral can play both sides because the arithmetic allows it,
not because it is sneaky.

| Band | Range | Effects |
|---|---|---|
| Hostile | < −40 | guards aggro on sight; vendors refuse; ferry closed |
| Watched | −40 to −10 | prices ×1.25; faction vendors closed; the Watch patrols near you |
| **Plain** | −10 to 20 | normal prices, base vendors |
| Trusted | 20 to 60 | prices ×0.90; faction quests; **town gates unlocked** (§5.4); ferry half price |
| Sworn | 60+ | capstone spell; free ferry; faction charm modifiers |

**Ship a single Standing integer for the MVP.** Bands, bleed and the two far factions are P3.

### 8.2 Swapping campaigns

One character. Finishing Light marks it complete, grants the Light Echo, and opens Dark in the same
world with the same skills. The only reset: entering a new campaign clamps that faction's Standing
to **−20 (Watched)** if it was higher. Eight quests at +8 restores Trusted — a re-earn arc, not a
re-grind.

### 8.3 Graft — the Neutral transformation

Story-granted by N07. Glamour level scales it.

**Nearly free to implement, and that is a point in its favour.** `player.setZone(id)` already swaps
robe geometry, material and spell colour, because the engine was built zone-first.

**But `zoneId` cannot express two states at once.** A Grafted Neutral must look Dark, throw
Dark-coloured projectiles, *and* cast Neutral fields — and §4.5 makes that combination the intended
playstyle. So:

```
player.zoneId   // the TRUE faction. Never changed by Graft.
player.wornId   // the appearance. null when not Grafted.
setZone(id)     // takes the APPEARANCE id
// spell.js colour lookup becomes:
zone(spell.factionId ?? player.wornId ?? player.zoneId).spell
```

Additive, does not touch `zones.js`, and it must be decided before `js/game/cast.js` is written.

| Requirement | Value |
|---|---|
| Channel | 3.0 s, uninterruptible past 1.0 s |
| Focus | 30 |
| Consumable | 1 **Hearth Ash** — 3 reagents of that faction's zone plus a stone chip. **No mark price** |
| Precondition | no aware NPC has line of sight within 22 m |
| Cooldown | 20 s; **120 s after a Break** |
| Duration | `180 + 30 × Glamour level` seconds. Glamour 12 → 9 min, Glamour 20 → 13 min |

Hearth Ash cost gathering, not marks. The review was right that a 350 mk tax on a 12-minute buff
makes the headline mechanic feel metered; charging reagents keeps a real cost without a meter.

**Suspicion**, 0–100, shown only above 10, as a ring on the context button.

| Event | Suspicion |
|---|---|
| Within 6 m of a Watchman | `+4/s × watchWeight × (1 − Glamour/24)` |
| Two or more Watchmen | the above × 1.8 |
| Casting the **wrong** faction's projectile while Grafted | +25 instantly |
| Casting a Neutral **field** while Grafted | +8 |
| Striking a citizen | +40 |
| Seen mid-channel | +100, instant Break |
| Entering a building your worn faction may not | +30 |
| Decay, no Watchman within 10 m | −3/s |
| Decay, inside a Longacre building | −8/s |

`watchWeight` is **per NPC**, default 1.0. STORY asks that Kesta specifically be the hardest person
to stand next to: **Kesta 2.0**, Warden Alder 0.6, generic Watch 1.0. One number per NPC in the
cast data.

Fields cost only +8, so the intended rhythm is your own fields plus the worn faction's projectiles,
topping up and letting suspicion decay. That rhythm *is* "playing both sides", mechanically.

**Break.** At 100: the Graft ends, that faction's Standing −25, guards within 30 m aggro, 120 s
cooldown — **and you immediately Graft free into the other faction for 20 s**, no token, no channel.
The punishment comes with a weapon swap. A comeback reads as power; a pure punishment reads as a
mechanic you avoid using.

### 8.4 Is Neutral actually more powerful? The honest arithmetic

Aaron's fixed requirement is that Neutral becomes *far more powerful*. The previous revision claimed
four levers. The review demolished all four and it was right. Assessed honestly:

| Old lever | Verdict |
|---|---|
| Six affinities instead of three | **Worth 0% in combat.** Grafted as Dark, Neutral has exactly Dark's +10% on Kindle/Cull/Setting. The extra three are Line/Forage/Barter, which are not combat schools |
| Field stacking, "+33% DPS" | **Was provably zero.** Quicken cut cast time; the GCD was binding. Fixed in §4.5 by cutting the GCD instead — now genuinely +33.3% |
| 2.4× marks per hour | **Deleted.** Unsourced, and §7 deliberately keeps marks off the power curve |
| Tier-3 spells early | **Deleted.** A property of playing third, not of the faction |

So the honest starting point was **+33% in an area fight and nothing else**, which is "differently
powerful", not "far more powerful". Rebuilt, with every term a stated mechanic:

| Lever | Mechanism | Value |
|---|---|---|
| **A. Two fields at once** | Glamour 12 allows a second concurrent field. Quicken (GCD 0.40 → 0.30) × Glut (+20% damage) | 1.333 × 1.20 = 1.60 while both are up; at 70% duty cycle in a ranged fight, **+41%** |
| **B. Mid-fight weapon swap** | At Glamour 17 a Graft can be cast in combat, so Light's single-target set and Dark's area set are both available in one encounter | Dark is 1.7× on 3+ targets, Light ~1.15× on single. A mono-faction character is on the wrong side of one of those in every mixed fight. Averaged: **+15%** |
| **C. Break as a comeback** | §8.3 — detection grants a free 20 s Graft into the other faction | Not modelled numerically. Legible in three seconds, which is the point |
| **D. Both Echoes** | Neutral starts campaign three with the Light and Dark Echoes: Focus regen +12%, +8% damage below 50% HP | **+8%** effective |

`1.41 × 1.15 × 1.08 = 1.75` — **+75% effective combat power** over an equal-level mono-faction
character, in a mixed encounter. Verified in node.

**Two caveats, stated plainly.**

1. Lever A requires **two concurrent fields**, which is a new decision this revision is making. If
   it is rejected, Neutral drops to roughly +28% and the claim fails.
2. The whole thing is a model. **Build the §12 sim test before authoring one line of Neutral
   content.** If `Neutral Grafted as Dark vs pure Dark, equal levels, 4 enemies, 30 s` does not come
   back 60–90% ahead, the 7-hour ladder in front of Neutral is unjustifiable and the honest response
   is to shorten the ladder, not to inflate the numbers.

That test is the single most important thing in this document.

---

## 9. The world clock

There is no clock. `time` is a lighting slider registered at `lighting.js:201` and set only by
scenarios (`demo.js:56`, `people.js`, `chicken.js`, `scatter.js`). Nothing advances it. A separate
agent owns the runtime; this section is the contract this document needs from it.

### 9.1 Required interface

```js
clock.t      // continuous game-hours since save creation, float
clock.hour   // clock.t % 24, with a negative fix-up — see below
clock.day    // Math.floor((clock.t - DAY_ROLL) / 24), integer, DAY_ROLL = 5
clock.rate   // game-hours per real second
clock.advanceTo(hour)   // snap forward to the next occurrence of an hour; returns hours skipped
```

The day index subtracts `DAY_ROLL` because STORY §4 rolls the day at 05:00, not midnight — the
plain `floor(t / 24)` this section originally specified contradicted that two lines above it.
Implemented in `js/game/clock.js`. Note also that `hour` is a single mod with a negative fix-up
rather than `((t % 24) + 24) % 24`: the latter is not exact, returning 11.899999999999999 for 11.9,
which pushes a bell an epsilon into the future so it never rings.

Recommended rate: **1 real minute = 1 game hour**, a 24-minute day. A 12-minute session is half a
day, so glut resets land roughly per session, which is the right feel.

`js/game/worldclock.js` writes `lighting.time = clock.hour` **only while `player.enabled`**. In
scenario and editor mode the knob stays authoritative, or `tools/shot.mjs` stops being reproducible.

`sim/clock.js` holds the pure part: day arithmetic and boundary detection. `crossedDay(before,
after)` is a pure function and every dependent below is tested through it.

### 9.2 Every dependency, and its exact contract

| Mechanic | Clock relationship | Across save/load |
|---|---|---|
| **Glut ledger** | boundary on `day` increment | on load, if `clock.day > ledger.day`, clear `sold` and set `ledger.day`. **No catch-up loop** — a week away resets once |
| **Freshness** | **not on the world clock.** Wall-clock delta from the item's `caught` stamp | survives; elapsed is clamped to 20 min, at which point it is at the floor anyway |
| **repMul streak** | 90 s of **real** time | reset to 0 on load. Session-scoped by design |
| **Standing daily caps** | boundary on `day` | cleared with the day, same as glut |
| **Mend first-repair ×3** | boundary on `day`; a `mendedToday` id set | cleared with the day |
| **Reforge** | **once per 3 game-days**, an in-save counter | no wall clock, so no clock-tampering surface. Changed from "once per real-world day", which in an offline localStorage game is an invitation |
| **Stall rent** | charged on each `day` boundary | if unpaid on load, the stall closes and holds its stock; nothing is destroyed |
| **Node respawn** | real seconds, `now` passed in | **on load every node resets to `ready`.** Cheaper and kinder than persisting 200 timers |
| **Graft duration, suspicion** | **real seconds** — combat timescale | ends on load. You are never reloaded mid-disguise |
| **Cooked-food buffs** | real seconds | expire on load |
| **Sandbox board** | boundary on `day`; offers 3 eligible entries | persisted as `board: { day, ids }` |
| **Scheduled quests** | accepting may call `clock.advanceTo(hour)` — "you wait until dark" | the advance is a save event; the player never waits in real time |
| **Lighting** | driven from `clock.hour` in play mode only | — |

The rule underneath all of this: **anything on a combat timescale uses real seconds and dies on
load; anything on an economy timescale uses game-days and survives.** Nothing uses wall-clock dates.

---

## 10. Quests — the eight primitives

Neither document specified a quest runtime, and STORY's 99 quests use at least twenty objective
verbs. Eight primitives cover all of them; **anything needing a ninth gets cut or re-dressed.**

### 10.1 The primitives

```js
// sim/quest.js — all pure, all take state and return state
kill(kind, n, area)          // cull, drive off, clear the road
gather(kind, n)              // catch, forage, break rock, count crates
deliver(item, n, npcId)      // sell, feed, carry the draw, bring grain
interact(objectId, n)        // light a lamp, mend a panel, set a kerb, read the post, dig
goto(areaId)                 // walk the South Road, scout the ridge, reach the far bank
escort(npcId, pathId)        // the wagon, the cart, the ferry, guiding an apprentice
talk(npcId, nodeId)          // attend the reading, sit at the table, ask Dob who Dob is
survive(areaId, seconds)     // hold the gate, hold the pit-head, keep two guests apart
```

Mapping the awkward ones: the lamp round is `interact(lamp, 9)` with a clock deadline; the crate
count is `gather(crate, 3)` with a scripted mismatch; "scout unseen" is `goto` with a fail condition
on suspicion; "disguise and infiltrate" is `goto` plus a `worn` prereq; "choose an ending" is `talk`
with a branch id.

Each objective carries optional `{ before: hour, after: hour, unseen: true, worn: 'light' }`.

### 10.2 Prereqs

A quest's prereq is a list of quest ids, all of which must be `done`. **No Grasp or school
level may appear in a prereq** — see §11. Story quests alone must finish a campaign.

### 10.3 Rewards — generated, never authored

Every XP and mark amount in STORY §8 is produced by this formula. STORY owns which schools a quest
trains; it does not own the amounts, and its reward columns are regenerated rather than edited.
`js/sim/campaign.js` holds the weights and the per-act mark budgets; `tools/soak.mjs --report=csv`
regenerates both this section's consequences and §11.

```js
// M = the act's lead-school level from the §11 table.
// M + 1 is clamped to the cap, so the level-20 act uses the level-20 delta.
const questXp = (M, weight) => {
  const hi = Math.min(MAX_LEVEL, M + 1);
  return Math.round(weight * (xpToReach(hi) - xpToReach(hi - 1)));
};
// weight: chore 0.15, main 0.30, act finale 0.60
```

| Act lead level | Level costs | Chore | Main | Finale |
|---|---|---|---|---|
| 3 (Light A1) | 522 | 78 | 157 | 313 |
| 5 (Light A2) | 1,220 | 183 | 366 | 732 |
| 8 (Light A4) | 2,593 | 389 | 778 | 1,556 |
| 12 (Dark A2) | 4,901 | 735 | 1,470 | 2,941 |
| 16 (Neutral A1) | 7,654 | 1,148 | 2,296 | 4,592 |
| 20 (Neutral A5) | 9,973 | 1,496 | 2,992 | 5,984 |

A quest that pays "every trained school" pays **35%** of the figure above to all ten, so it lands
near a three-school quest instead of ten times a one-school quest.

Turn-in XP is **on top of** the action XP the objective already generated, and is small on purpose:
the rats pay for the rat quest, and the turn-in is a tip. The soak measures the split at **43%
action, 57% turn-in** across the whole run, and at 72% for Kindle, 49% for Mend and 41% each for
Line and Hearth — the schools whose loops the critical path exercises hardest. STORY's first revision authored its own
amounts, which put turn-ins at 60–92% of every school's lifetime XP; that made `tierMul` and
`repMul` inert and reduced fishing, foraging and cooking to decoration. It is why this section
exists.

**Marks.** Each act carries one quest-pay budget, split between its quests by weight:
`questMk = round(actBudget × weight / Σ weights in the act)`. The whole catalogue pays **7,940 mk**,
against 27,658 when the amounts were authored. The budget is per act, so adding a quest divides the
same purse further rather than inflating it — revision 3 added twelve quests and moved lifetime
income by nothing. Quest pay is meant to matter in Light Acts 1–2 and to be a minority of income
after that — the soak has it at 34% of lifetime income.

**A quest may name schools, pay every trained school, or both.** D06 walks the curtain with Nim,
which is Ward, and then hears the yield read, which is everyone.

### 10.4 The opening, costed for a Light starter

Quest ids are STORY's post-renumbering ones: **L01** is the granary, **L02** the fish, **L03** the
market. This section used to cite L02/L03/L04, which were the pre-renumbering names for the same
three quests.

Recomputed in node, for Light, with the Cull penalty removed, freshness and glut applied, and
silverling in the Whitewall reach:

| Step | Result |
|---|---|
| L01 — cull 8 grain rats | 8 × 40 + 100 first-kill = **420 Cull XP**, + 157 turn-in = 577 → **Cull 3** |
| | 8 × 12 = **96 Kindle XP**, + 157 turn-in = 253 → **Kindle 2** |
| | drops: 8 rat tails (V 3) and ~16 mk, and **7 mk** quest pay |
| L02 — catch 8 silverling, ~7.0 s each = 56 s | 8 × 70 + 100 first-catch = **660 Line XP**, + 157 = 817 → **Line 3**, and **7 mk** |
| L03 — sell at Whitewall market | 5 silverling at V 12, freshness 0.95, glut 1.00→0.92 = **30 mk** |
| | 8 rat tails at V 3, glut 1.00→0.86 = **14 mk** |
| | Barter: 2 tier-1 transactions = 45 + 45 + 0.02 × 44 = **91 XP**, + 78 = 169 → **Barter 2**, and **3 mk** |
| **Total** | **125 mk, four schools levelled, Grasp 16, about five minutes** |

Four schools go up in the first five minutes and 125 mk buys one of three real options (§7.3).

**It is 125 mk, not 60.** 60 mk is the sale proceeds and the rat drops; it left out the 17 mk of
quest pay for the same three quests, and the older draft of STORY paid 71 mk for them, which put the
real figure at 131 and broke §7.3's shop outright. Both ends are now fixed: quest pay came down and
§7.3's prices were re-derived against the measured purse.

---

## 11. Balance table — 15 acts

**Generated by `tools/soak.mjs`, not estimated.** Regenerate with
`node tools/soak.mjs --report=csv` and update this section in the same commit as any coefficient or
content change. The columns are what a typical player *has* at each act exit, measured by playing
the catalogue; they are not a requirement.

Act exits carry **no Grasp gate**. STORY promises that school ranks are never required to finish a
campaign, and that promise is the one that keeps a player who has forty minutes a week. Grasp gates
survive on spell tiers only (§4.6), where they are invisible pressure rather than a locked door.

Run: `--policy=average --competence=average --seed=1234` against STORY revision 3's 79 story
quests. That is one board job per act, an 88% fishing strike rate, half a death per act, and no
optimisation.

| Camp | Act | Title | h | Cum h | Grasp | Total XP | XP this act | XP/h | mk |
|---|---|---|---|---|---|---|---|---|---|
| Light | 1 | Take it seriously | 0.40 | 0.40 | 25 | 4,790 | 4,790 | 11,900 | 113 |
| Light | 2 | The water runs thin | 0.44 | 0.84 | 32 | 10,635 | 5,845 | 13,222 | 258 |
| Light | 3 | The middle ground | 0.50 | 1.35 | 41 | 19,028 | 8,393 | 16,634 | 601 |
| Light | 4 | The far bank | 0.53 | 1.88 | 56 | 40,632 | 21,604 | 40,745 | 1,058 |
| Light | 5 | The even hand | 0.41 | 2.29 | 77 | 75,006 | 34,374 | 82,845 | 2,331 |
| Dark | 1 | Down the ladder | 0.42 | 2.72 | 86 | 103,104 | 28,098 | 66,457 | 3,351 |
| Dark | 2 | Less every month | 0.43 | 3.15 | 94 | 129,455 | 26,351 | 61,205 | 4,527 |
| Dark | 3 | The grain deal | 0.53 | 3.68 | 100 | 154,507 | 25,052 | 47,469 | 4,651 |
| Dark | 4 | Water raid | 0.46 | 4.14 | 111 | 190,289 | 35,782 | 77,681 | 6,369 |
| Dark | 5 | Hold the head | 0.42 | 4.56 | 119 | 231,904 | 41,615 | 99,296 | 8,654 |
| Neutral | 1 | A farm year | 0.59 | 5.15 | 126 | 264,472 | 32,568 | 54,808 | 7,965 |
| Neutral | 2 | Wearing Whitewall | 0.54 | 5.69 | 131 | 297,800 | 33,328 | 61,504 | 8,841 |
| Neutral | 3 | Wearing Blackstone | 0.57 | 6.26 | 139 | 350,777 | 52,977 | 92,725 | 9,970 |
| Neutral | 4 | The root | 0.51 | 6.77 | 147 | 394,073 | 43,296 | 84,668 | 9,332 |
| Neutral | 5 | The valley | 0.23 | 7.01 | 154 | 439,271 | 45,198 | 194,583 | 13,209 |

**Total: 7.01 hours, Grasp 154 of 200, 439,271 XP, 13,209 mk.**

Revision 3 added twelve quests and re-assigned three, to fix a school-distribution problem this
harness found: Hearth was named on 5 story rows out of 67 and Line on 6, against Ward's 15, and no
amount of rate tuning inside five quests closes a gap that size. The catalogue went from 67 rows to
79, and the runtime from 6.37 hours to 7.01. **More content raising the number is the honest way for
it to go up.**

### 11.1 What the hours assume

Seven hours, not the 10.25 this table once claimed. The quest work itself — every kill, catch, cook,
node, repair, escort and hold in the catalogue, resolved through `sim/*` at the player's actual
level — is **3.59 hours**. The rest is **131 seconds per job** of overhead, and that term is derived
rather than chosen: two in-town legs of WORLD.md's 80 m at 5 m/s to walk giver to objective and
back, a dialogue exchange either side at 22 s, and 55 s of amortised market or journal detour.

Reaching 10.25 hours would have needed 311 s per job, which WORLD.md's 101 s and 115 s town legs
cannot supply. The old figure was an estimate with nothing under it.

**If playtesting wants a longer game, the answer is more quests, not slower ones.** Padding the
overhead term is the one change that would make every act worse. Revision 3 is the worked example:
twelve quests bought 38 minutes and fixed a real problem at the same time.

### 11.2 The spread

`tools/soak.mjs` across every policy and competence:

| | casual | average | expert |
|---|---|---|---|
| **story** — story quests only | 9.01 h | 6.19 h | 4.82 h |
| **average** — one board job per act | 10.21 h | **7.01 h** | 5.45 h |
| **completionist** — the board worked | 11.24 h | 8.70 h | 7.58 h |

Grasp lands between 147 and 165 across all nine, so the *character* is stable and only the clock
moves. Nobody caps ten schools. The story-only run finishes in 6.19 h at Grasp 148, which is STORY's
promise kept: a player who ignores gathering entirely gets a weaker character and the same story.

### 11.3 Notes on individual rows

- **Light Act 1 is 0.40 h**, and it is the one act the player is over-levelled for — lead school 5
  against an act written for 3. Six quests of first-time bonuses at the bottom of the curve will do
  that, and the first hour of an RPG going well is not a problem to solve.
- **Marks dip at Neutral Act 1**, 8,654 to 7,965. This document always described the beat; it is now
  produced rather than asserted, by the re-outfit on arriving home — every charm slot rebuilt on the
  Longacre build. It is a good beat and it is worth protecting. A second, shallower dip at Neutral
  Act 4 is a tier-IV charm and is fine.
- **Dark Act 2 was the quiet act and is not any more.** It paid 14,019 XP against 30,000 either
  side, on four quests that were all gathering and dialogue. D23 The Old Workings gave it a fight;
  it now pays 26,351 against 28,098 and 25,052. This is the clearest thing the harness has caught
  that a reader of the catalogue would not have.
- **Neutral Act 5 is one quest and 45,198 XP.** The XP/h column reads 194,583 because the act is
  fourteen minutes long, not because anything is wrong. A one-quest act is a finale, not a rate.
- **The lead school ends at 18, not 20.** Two levels short of the act script's intent, closed by the
  board. Deliberate: the cap should cost something the story does not hand you.
- **Forage is now the thinnest school at 12**, having been mid-table before. It is named on 8 rows
  and nothing in revision 3 touched it. Not urgent — 12 is above the profile's incidental target of
  8 — but it is the next distribution question if one is asked, along with Mend at 4 named rows.

---

## 12. Carry-over, and the soak harness

### 12.1 What carries

**One continuous character, three campaigns, no reset of skills or gear.** Signed off in
`CLAUDE.md`: the Household fosters its children out, so the Light protagonist was always a Longacre
child. Full carry is the only mechanism in either document that delivers "far more powerful", and it
is why §8.4's Echoes term exists.

| Thing | Carries | Reasoning |
|---|---|---|
| School XP and levels | **In full** | These *are* why Neutral is strong |
| Grasp | derived | — |
| **Journal Truths** | **In full, one list across all three campaigns** | STORY calls this the real carryover and it was missing from both the carry table and the save schema |
| Marks | up to 15,000; overflow becomes a **Legacy Cache** item, openable after the new Act 1 | keeps the next opening meaningful without stealing anything |
| Charms and staves | in full, at current integrity | build identity |
| Reagents and perishables | **No** — converted at 40% to marks | clean inventory at the seam |
| Recipes, species, appraisals | yes | re-learning is pure tax |
| Map, ferry routes, discovered nodes | yes | re-walking a known map is worse than tax |
| Endings and postures taken | yes, per campaign | STORY records them in the journal; the save now has a field |
| Standing | completed faction keeps its value; new faction clamps to −20 | re-earn, not re-grind |
| Quest state, node state, boss kills | reset for the new campaign | content has to exist to be played |
| Glut ledger, suspicion, streaks, Ash, buffs | reset | session-scoped by definition |
| **Echoes** | accumulate permanently | below |

| Echo | From | Effect |
|---|---|---|
| **the White Cord** | finishing Light | Focus regen +12%; gutter loss 8% → 5% |
| **the Short Rope** | finishing Dark | +8% damage below 50% HP; Rot 4 s → 5 s |
| **the Long Furrow** | finishing Neutral | node respawn −20%; a fourth charm slot |

Named by STORY §13: the White Cord is the apprentice's cord from L06 and you never take it off; the
Short Rope is what a Delver ties to their belt going down, short because the ones who need a long
one do not come back; the Long Furrow is what Longacre calls a life's work.

### 12.2 `tools/soak.mjs` — the harness, specified

A virtual-clock, seeded-RNG simulation of the whole game with no browser. It is how the successor to
the XP-economy bug gets caught before it ships.

```
node tools/soak.mjs
node tools/soak.mjs --policy=completionist --competence=expert --report=csv
node tools/soak.mjs --tiermul=off --repmul=off      # size what the brakes are worth
```

| Switch | Values | What it changes |
|---|---|---|
| `--seed` | integer, default 1234 | every roll, through `sim/rng.js`. No `Math.random` anywhere in `sim/` |
| `--policy` | `story` / `average` / `completionist` | how much sandbox board work is done: none, one job per act, or the board worked |
| `--competence` | `casual` / `average` / `expert` | time multiplier, fishing strike rate, Brace uptime, deaths per act |
| `--tiermul` | `kills` / `all` / `off` | whether diminishing returns touch gathering as well as kills |
| `--repmul` | `on` / `off` | the streak penalty, off to size its bite |
| `--overhead` | seconds | overrides §11.1's derived per-job term |
| `--report` | `table` / `csv` / `json` | `csv` is what §11 is pasted from |

| Part | Spec |
|---|---|
| Clock | virtual; every action returns its own duration, and the clock is the sum. Runs in under a second |
| World model | the §11 act script drives which region the player is in, which drives the node and enemy tables |
| Output | per-act rows: hours, Grasp, total XP, XP/h, marks, plus per-school levels and the XP source split |
| Pass condition | **§11 is regenerated from the run, so there is no pass condition on the table.** What is asserted is below |
| Extra assertions | glut floor reached at unit 34; Grasp never gates an act exit; no school below level 5 at the end; no quest asks for a node the path cannot break; the Neutral Act 1 marks dip survives |

The `--policy=story` run is the important one: it proves a player who ignores gathering entirely can
still finish, which is what STORY promised. It finishes in 5.2 hours at Grasp 135.

**The harness also reports what it cannot fix.** Three lines to read every time: the action-versus-
turn-in XP split, which should stay near 40/60 and not drift back; the per-school source breakdown,
which is how the Hearth and Line shortfall in §11.3 was found; and the income breakdown, which is
how a mark runaway shows up before it reaches a playtest.

### 12.3 Sanity checks — pure-function tests, all verified in node

Each row is a test in `js/sim/*.test.js`. `node --test` runs them with zero setup.

| Check | Expected |
|---|---|
| `xpToReach(20)` | 79,153 |
| `xpToReach(3)` | 332 |
| Rats to reach Cull 3 from zero, Light, incl. first-kill | 6 |
| `tierMul(11, 1)` | 0.377 |
| `tierMul(20, 1)` | 0.087 |
| Kindle 1 taps to kill a grain rat | exactly 2 |
| Kindle 10 taps to kill a Hollow | 7 |
| Kindle 20 taps to kill champion III | 42 |
| Kindle 6 taps to kill a brood-mother | 28, with the per-hit round applied |
| Bolts before empty at Ward 1 | 8 |
| Grain rat bites to gutter a Ward 1 player | 12 |
| Watchman hits to gutter a Ward 1 player | **2** — this is why §5.4's gates exist |
| Purse at the §10.4 opening | 125 mk, Grasp 16 |
| First glut unit at the floor | 34 |
| Quicken as GCD cut | 2.50 → 3.33 casts/s, +33.3% |
| A level-appropriate cook | 304 XP, on the ~350 yardstick |
| 200 grain rats at Cull 15 | pays under 10% of face value — the brakes work when farmed |
| A level-appropriate kill at parity | pays 100% — the brakes are silent on the critical path |
| A v1 save loaded by a v2 build | loads with warnings, never throws |
| Full soak, `--policy=story` | finishes all 15 acts in 6.19 h at Grasp 148 |

### 12.3.1 The Neutral gate

**One number cannot answer "is Neutral far more powerful".** The previous single test — Grafted as
Dark against pure Dark, four enemies, thirty seconds — fixed the enemy count and put both sides on
the same faction, so the mid-fight weapon swap could not pay, and it then measured the result
against a 60–90% band that had been derived *including* the swap. The test was wrong, not the
design. Three scenarios instead, all at level 17:

| Scenario | Grafted advantage | What is doing the work |
|---|---|---|
| One enemy, Grafted as Light | **+53%** | two concurrent fields (Quicken's GCD cut × Glut's +20%) at 70% duty, plus both Echoes |
| Four enemies, Grafted as Dark | **+53%** | the same. The fight cannot change shape, so the swap is worth nothing |
| A fight that starts single and becomes a group | **+76%** | the above plus the swap between Light's single-target set and Dark's area set |

**Gate: every scenario must come back at or above +50%, and the mixed fight above +70%.** That is
the honest claim, and it is the one to defend: a Grafted Neutral is half again as strong as an
equal-level mono-faction character in any fight, and three-quarters again in a fight that moves.
Do not tune the coefficients upward to clear a rounder number — the levers are stated mechanics and
each one is testable on its own.

Two things this does not model, both in Neutral's favour: Break handing back a free 20 s Graft into
the other faction, and Neutral's three affinities applying to Line, Forage and Barter, which are
worth nothing in a fight and a great deal everywhere else.

---

## 13. Save format

Follows `js/editor/store.js` exactly: probe write at boot to detect private-mode Safari and full
quota, a `.broken` backup of unparseable bytes, and a versioned `normalise()` with a migration chain.
`sim/save.js` owns it; it is pure and takes no clock.

| Key | Contents |
|---|---|
| `forge.save` | the working save, written every 10 s and on every act transition |
| `forge.save.broken` | verbatim bytes of the last save that failed to parse |
| `forge.save.slot.<name>` | manual copies |
| `forge.save.slots` | index array |

```json
{
  "v": 1,
  "seed": 2748193042,
  "created": 1786312800000,
  "clock": { "t": 173.4 },

  "campaign": {
    "current": "light", "act": 2,
    "done": [],
    "endings": { "light": null, "dark": null, "neutral": null },
    "echoes": []
  },

  "schools": {
    "kindle": 4210, "ward": 980, "line": 6640, "forage": 2210, "cull": 3880,
    "hearth": 1740, "mend": 320, "barter": 910, "setting": 460, "glamour": 0
  },

  "vitals": { "hp": 52, "focus": 61 },
  "purse": { "marks": 218, "banked": 1400 },
  "standing": { "light": 26, "neutral": 4, "dark": -12 },
  "worn": null,

  "items": [
    { "id": "silverling", "n": 4, "caught": 1786312790000 },
    { "id": "thread", "n": 6 },
    { "id": "obsidian_core", "n": 1 }
  ],
  "bank": [{ "id": "chalk_trout", "n": 22 }],

  "stave": { "id": "ash_stave", "integrity": 71.4 },
  "charms": [
    { "id": "coarse_line", "tier": 1, "school": "line", "mod": "bite", "mag": 0.04, "integrity": 96.0 },
    null, null, null
  ],

  "pins": ["kindle", "line", "cull"],

  "truths": ["whitewall_overdraws", "wagon_every_eighth_day"],
  "known": { "recipes": ["cook_silverling"], "appraised": ["silverling", "rat_tail"] },
  "atlas": { "ferry": ["light", "neutral"], "nodes": [3, 7, 11, 12, 19] },

  "quests": {
    "L02": { "state": "done" },
    "L12": { "state": "active", "step": 3, "counts": { "crates": 2 },
             "scene": { "area": "store_interior", "flags": ["door_warded"] } }
  },

  "ledger": { "day": 7, "sold": { "silverling": 14, "rat_tail": 8 } },
  "board": { "day": 7, "ids": ["S01", "S02", "S19"] },
  "mendedToday": ["ash_stave"],
  "reforge": { "lastDay": 4 },

  "settings": { "flip": false, "haptics": true, "aimAssist": 1, "textScale": 1, "reducedMotion": false }
}
```

Design notes:

- **XP only, never levels.** Levels are always `levelFor(xp)`, so a save can never disagree with
  itself and a curve change is a balance patch rather than a migration.
- **`seed`** drives every roll through `sim/rng.js` plus a per-context salt, so a soak replays
  bit-identically and a bug report is reproducible from the save alone.
- **`truths`** — added. STORY calls it the trilogy's main carryover and it was missing.
- **`quests[].scene`** — added. Five quests strand the player somewhere unusual (N18 captured on
  purpose, N19 breaking out, L25 in Ivo's room). Without a scene field a mid-quest reload either
  breaks them or trivially completes them.
- **`campaign.endings`** — added. L27 sets a binary and N25 one of three postures; STORY records
  them in the journal and there was nowhere to put them.
- **`charms`** is fixed-length with nulls — the index is the slot. Four entries; the fourth is inert
  without the Longacre Echo.
- **`clock.t`** is the only time stored. `caught` timestamps are wall-clock because freshness is
  (§9).
- **No world position.** Reload lands at the last town hearth; `quests[].scene` covers the
  exceptions. Storing a position invites a save inside geometry that has since changed.

```js
const MIGRATIONS = [
  d => ({ ...d, v: 2, schools: { ...DEFAULT_SCHOOLS, ...d.schools } }),
];
export function normalise(raw) {
  if (!raw || typeof raw !== 'object') return { doc: null, error: 'not an object', warnings: [] };
  let d = raw; const warnings = [];
  while ((d.v | 0) < VERSION) {
    const m = MIGRATIONS[(d.v | 0) - 1];
    if (!m) return { doc: null, error: `no migration from v${d.v}`, warnings };
    d = m(d);
  }
  return { doc: clampAll(d, warnings), error: null, warnings };
}
```

An unknown item id goes into `warnings`, never throws. A save from a build with a since-renamed item
must still load.

---

## 14. Build order and knobs

### 14.1 Cut line

| System | Tag |
|---|---|
| Six schools: Kindle, Ward, Line, Cull, Hearth, Barter | **MVP** |
| Level cap 20, milestones 3/7/12/17, `tierMul`/`repMul` | **MVP** |
| Focus, overdraw, GCD, charge | **MVP** |
| Aim fix (`camYaw`), acquire, three-button touch layout, onboarding | **MVP** |
| Grain rat, mire rat, rat-knot, sour crow + the rat ring tables | **MVP** |
| Damage, HP, gutter, fixed bands, town gate-locks | **MVP** |
| Nodes, Whitewall + Longacre catch tables, context-button fishing | **MVP** |
| Prices, glut, freshness, market panel, charms I–II | **MVP** |
| World clock + day tick | **MVP** |
| Quest runtime (8 primitives), save with Truths and scene state | **MVP** |
| `sim/*` + `tools/soak.mjs` | **MVP** |
| Forage, Mend, Setting; creek crab, blight boar, Hollow, Brood-mother | **P2** |
| Buff second slot, Stall, charm III | **P2** |
| Blackstone reach, elites | **P2** |
| Glamour, Graft, suspicion, the Watch, Hearth Ash | **P3** |
| Standing bands, Echoes, Legacy Cache, cross-faction bleed | **P3** |
| Champions, charm IV, Reforge | **P3** |

Ship a single Standing integer in the MVP; bands are P3.

### 14.2 Knobs

`quality.register(schema, apply)`, group **Game**.

| Knob | Range | Default |
|---|---|---|
| `xpRate` | 0.25 – 4 | 1 |
| `dropRate` | 0.25 – 4 | 1 |
| `priceSell` / `priceBuy` | 0.3 – 2 / 0.5 – 3 | 1 / 1 |
| `enemyHp` / `enemyDamage` | 0.25 – 4 / 0 – 4 | 1 / 1 |
| `enemyCap` | 0 – 24 | 24 |
| `nodeBudget` | 0 – 40 | 40 |
| `respawnRate` | 0.2 – 5 | 1 |
| `focusRegen` | 0.25 – 5 | 1 |
| `gcd` | 0.2 – 1.0 | 0.40 |
| `aimAssist` | 0 – 2 | 1 (scales cone width) |
| `clockRate` | 0 – 6 | 1 (game-hours per real minute) |
| `suspicionRate` | 0 – 3 | 1 |
| `godMode` / `unlockAll` | toggle | off |

`unlockAll` with `enemyCap 0` gives a peaceful sandbox for scenario screenshots.

### 14.3 Systems named in the review that this document does not own

Flagged so they are not lost between agents: dialogue presentation and the journal UI
(`REVIEW` B8), touch onboarding content, audio (the bell three Act 1 quests are timed against is an
audio mechanic nobody has specified), accessibility (colour-blind support is not cosmetic here — the
entire disguise mechanic is reading robe colour), pause and backgrounding, the first-run faction
slate, the inventory screen, the countryside terrain gap (`REVIEW` S7 — WORLD.md owns it), the
district-batch LOD split (S8), and Blackstone's three galleries (S9).

---

## 15. Contested

Three review findings this revision declines or only partly adopts. Flagged for Aaron rather than
silently ignored.

**1. "Abandon Glamour as a trainable school." Declined; the underlying bug is fixed instead.**
The review is right that the old design was a closed loop — the only XP source was standing near an
NPC while disguised, and the disguise was gated behind Glamour 30. But deleting the school makes
Graft's duration, suspicion resistance and Mask range unscalable, which means the disguise plays
identically at Longacre Act 1 and Act 5. §2.3 fixes the loop properly: Graft is story-granted by
N07, and Glamour trains from level 1 through Dim and Hush evasion, which every faction can do.
68 evasions reaches Glamour 12 with no disguise at all. **Verdict wanted:** trainable school with a
story-granted capstone, or a flat untrained one.

**2. "Hearth Ash at 350 mk — abandon as priced." Partly adopted.**
The mark price is gone: tokens now cost 3 zone reagents plus a stone chip, no marks. But a wholly
free token makes Graft unmetered, and an unmetered disguise removes the reason to plan a run. A
gathering cost is a cost that a player who is already gathering does not feel as a tax. **Verdict
wanted:** reagent cost, or free.

**3. "Mixed-plate buffs and buff cap 2 — abandon." Partly adopted.**
The mixed plate is cut. The second buff slot survives, moved from Hearth 30 to **Hearth 17**, so it
is a late reward rather than a mid-game default. The review's objection was HUD clutter on a phone;
two buff icons in a landscape corner is one more than one, and Hearth needs something at its top
milestone that is not a bigger number. **Verdict wanted:** one slot forever, or two at 17.

Everything else in `REVIEW.md` that names SYSTEMS.md has been adopted, including all of B1–B8, S1,
S3–S6, S10 and every row of S12.

---

## 16. What is still needed from STORY

Everything previously asked for has been read out of STORY and applied. Three of the four remaining
items were answered by STORY's revision and have been folded into this document:

1. ~~Three Echo names~~ — **the White Cord / the Short Rope / the Long Furrow** (§12.1).
2. ~~One word for Attunement~~ — **Grasp**, adopted; the stat is renamed throughout this document
   and "Attunement" is retired. "She has a wide grasp."
3. ~~A name for Cinder Tokens~~ — **Hearth Ash**, the ash of your own hearth fire carried in a
   twist of cloth. **Free at any Longacre hearth, 350 mk from anyone else**, so the cost bites only
   when you are far from home. Renamed throughout.

One item still genuinely open:

4. **Which vermin each faction declares**, for the +0.5 Standing rule (§8.1). STORY §3 establishes
   the *handling* differs per faction — Whitewall licenses and reports a cull, Longacre buries it
   in one particular field, Blackstone quotas it by the shift — which is enough to keep the three
   reputation loops distinct. What is still owed is one line of dialogue each naming the animal.

And two things STORY should know this document now depends on:

- **L03 catches silverling, not chalk trout.** Chalk trout at `req 4` is uncatchable at Line 1.
- **Focus cores come only from Blackstone obsidian**, which is the structural pressure that forces a
  Light player to eventually deal with Dark. Worth using deliberately.

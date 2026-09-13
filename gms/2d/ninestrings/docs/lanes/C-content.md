# Lane C-content — status

Owner updates THIS file only. The manager rolls these up into BUILD_PLAN.md.
Concurrent lanes must never edit the same file, which is why this exists.

**Status: C1 DONE · C2 DONE.** (C3/C4/C5 are a later lane — `characters.js`,
`relics.js`, `sigils.js`, `meta.js`, `story.js`, `unlocks.js`, `challenges.js`
are still stubs and were not touched.)

## What shipped

| File | Count | Notes |
|---|---|---|
| `js/data/enemies.js` | **24** (20 field + 4 Choirmasters) | every allowed `ai` and every allowed `rig` used |
| `js/data/stages.js` | **12** (4 acts) | 15 timeline windows each (s1/s3: 14), 8m→20m |
| `js/data/weapons.js` | **16** | 7 level deltas each, all 10 `kind`s used, 8 of 16 `cuts` |
| `js/data/passives.js` | **12** | 5 levels each, every level names a real `DerivedStats` field |
| `js/data/evolutions.js` | **10** | every one changes `kind` and/or `cuts`, never numbers alone |

All five freeze both the keyed object and `list`. No imports, no functions, no
`Math.random`, no DOM. `node --check` clean.

### Validator

Throwaway harness lives in the session scratchpad (not in the project):
`scratchpad/validate.mjs`. It asserts id↔key agreement, counts, 7/5 level
counts, every `evolvesTo`/`from`/`requires` resolving both ways, every timeline
enemy id real and non-boss, every `stage.boss` a real `boss:true` enemy, rigs /
extras / patterns / ai / kinds / stats all inside their allowed lists, palette
hex and [r,g,b] ranges, `maxAlive <= 400`, `charOnly` in the six real character
ids, timeline windows forward + sorted + inside the duration, chorus times
inside the stage, conductor cadence in the 60–90s band (s1 exempt: tutorial),
story-key convention, split targets real, boss phases descending and spawning
real enemies, no enemy defined and never used, no weapon whose every level is
"+damage", no base stat driven to zero by its own deltas, and a genuine
escalation check (peak spawn rate in the last quarter must exceed the peak in
the first quarter).

**It was falsified before being trusted** (per the repo's standing lesson): four
deliberate breaks — a bogus timeline enemy id, `maxAlive: 480`, a weapon with 6
deltas, a rig of `'blob'` — all four went red, then green again on revert. It
found 4 real defects on the first run and all 4 are fixed:
- `ninefold` and `requiem` were evolutions that changed only numbers → both now
  change `kind` (chain→aura standing lattice; strike→zone collapsing pit).
- s2's Conductor cadence was 105s, outside DESIGN §2.3's 60–90s band → 90s.
- s6 had a mid-stage lice rain that out-paced its own finale → finale raised.

---

## Intended TTK / difficulty assumptions

These are the assumptions the numbers were written against. **Lane G's harness
is the authority, not this table** — if `sim.mjs` disagrees, the data is wrong,
not the harness. Written down so the disagreement is legible.

**Player reference:** 100 max HP, ~105 units/s move, 420 world units visible.

**Assumed player DPS curve** (all weapons + passives, against one target):

| Moment | DPS | Notes |
|---|---|---|
| Stage 1, 0:00, one weapon at L1 | ~10–20 | see the per-weapon table below |
| Stage 1, 4:00 | ~90 | 2–3 weapons, low levels |
| Stage 3 end (Hollowth) | ~250 | first evolution possible |
| Stage 6 end (Vellish) | ~700 | 2 evolutions typical |
| Stage 9 end (Morrow) | ~1,800 | relics + sigils online |
| Stage 12 end (The Ninth) | ~6,000 | full build |

**Resulting boss fight lengths:** Hollowth ~24s, Vellish ~43s, Morrow ~61s,
The Ninth ~67s across three phases. Boss HP is 6k / 30k / 110k / 400k.

**Fodder TTK:** a Stage-1 shambler is 22 HP against a level-1 Emberlash at 11
damage — **two hits, ~2.3s**, which is the "a few hits" the brief asked for and
is slow enough that the first thirty seconds read as deliberate. At the other
end a Throneguard is 6,000 HP with 26 armour against a ~6,000 DPS build: ~1s
each, and there are six of them in a pack at s12 0:14:40.

**Enemy HP bands** (see the validator's printed table for the full list):
Act I 14–180 · Act II 18–260 · Act III 180–1,400 · Act IV 900–6,000.
Overlap between acts is intentional — Act II reuses `crawler` and `bloated` as
cheap filler while `weeper` carries the tier.

**Per-weapon level-1 → level-8 damage-per-second at one target** (naive
`damage × count / cooldown`; it *overstates* multi-instance weapons whose count
is instances rather than shots — censer, salt, chain, kite, nails — and it is
meaningless for `summon`, whose damage is continuous over `duration`):

```
emberlash   9.6 →  80.6     gravepistol  18.6 → 281.9
censer     40.0 → 253.3     hexcandle     2.7 →  32.7
bonesaw    10.7 → 100.0     lantern      12.0 →  84.6
shears     21.5 → 204.3     chain        27.0 → 231.3
pyrebell    6.4 →  75.5     salt         28.6 → 324.0
marionette  2.0 →  50.0     kite         26.0 → 222.0
                            choirbreaker 13.3 → 177.9
                            gravebloom   16.9 → 185.5
                            nails        30.0 → 182.0
                            tolling       9.4 →  36.0
```
Roughly one order of magnitude across 8 levels, before passives. Tolling is
deliberately the lowest single-target number in the game because it is a
96-unit crowd-stagger, and Pyre Bell and Hexcandle are low for the same reason.

**Spawn pressure:** every stage's timeline peaks harder in its last quarter than
its first (gated). `maxAlive` runs 60 → 380, never above 400. Stage 1 opens at
**one shambler every 11s for the first 30 seconds** and nothing else at all.

**Conductor cadence:** 90s at stage 2 tightening to 62s at stage 12, i.e. a
Conductor kill — the game's screen event — every 60–90s as DESIGN §2.3 asks.
Stage 1 is the exception at 150s, with the first at 3:00 and a Choir of 6, per
the DESIGN §4 onboarding table.

---

## Sprite keys and rigs — for Lane A-render

**Key convention: the sprite key is the enemy id.** 24 keys, baked from
`sprite: SpriteSpec` on each def (CONTRACTS §9.2). Frame counts are 4 or 6.

| rig | keys | frames |
|---|---|---|
| `humanoid` | `shambler` `lamplost` `bellrunner` `screamer` `drowned` `spitter` `ashwalker` `surgeon` | 4, 4, 6, 6, 4, 6, 4, 6 |
| `crawler` | `crawler` `fenlice` `emberling` | 6, 6, 6 |
| `bloat` | `bloated` `weeper` | 4, 4 |
| `hulk` | `pallbearer` `bellplate` `throneguard` | 4, 4, 4 |
| `wisp` | `corpselight` `namewraith` | 6, 6 |
| `demon` | `cantor` `loomspawn` | 6, 4 |
| `boss` | `hollowth` `vellish` `morrow` `ninth` | 6, 6, 6, 6 |

Extras used, all from the allowed set: `horns` `chains` `lantern` `armour`
`jaw` `halo`. Palettes are per-act three-hex triples `[skin, cloth, accent]`:

```
Act I  town   ['#c9c3ae','#191b1f','#f2a94f']
Act II marsh  ['#93a89c','#11241e','#4fd4c4']
Act III city  ['#b3a89b','#231a17','#ff5c2e']
Act IV below  ['#e7e1d3','#151122','#b16dff']
```
The four bosses each carry a bespoke palette rather than the act one.

Atlas budget note: 24 enemy keys × (4 or 6) frames = **120 enemy frames**, plus
whatever the player, projectiles, shards, particles, font and icons need. If
that is too many, the cheapest cut is dropping the six-frame walks on
`bellrunner`, `screamer`, `spitter` and `surgeon` to four — say so and I will
change the data rather than have Lane A special-case it.

Weapons carry `colour: [r,g,b]` and a 2–4 char `tag` glyph (`LSH` `CNS` `SAW`
`SHR` `BEL` `MAR` `PST` `HEX` `LTN` `CHN` `SLT` `KTE` `BRK` `BLM` `NLS` `TLL`)
for the HUD weapon row and the level-up screen. Evolutions have their own tags
(`GSP` `IX` `EXH` `QTP` `CTH` `LNG` `WDW` `RTE` `NIN` `RQM`).

---

## Behaviour I need from the sim that the contract does not name

None of these are new *signatures* — they are meanings for fields that already
exist. Listed so Lane B is not guessing, and so nobody re-derives them.

**1. `aiParams` meanings, by `ai` kind** (all optional; default to the obvious):
- `chase` — `turn` (rad/s steering), `weave`, `shove`, `waterlogged`,
  `auraRadius`/`auraDmg` (a contact-damage aura; `ashwalker` burns).
- `charge` — `windup`, `dashSpeed`, `dashTime`, `restTime`, `range`, `shove`.
  The wind-up is load-bearing: `bellrunner` is how the game teaches sidestep.
- `burst` — `fuse`, `blastRadius`, `blastDmg`, `triggerRange` (bloated), or
  `dashSpeed`/`dashTime`/`restTime` with `blastRadius: 0` (emberling, a dasher
  that never explodes).
- `orbit` — `standoff`, `hover`. Support behaviour rides on this kind:
  `screamer` has `buffRadius`/`buffSpeed`/`buffDmg`/`pulse`; `cantor` has
  `restringRadius`/`restringEvery`/`restringMax`.
- `ranged` / `spit` — `standoff`, `every`, `burst`, `projSpeed`, `projDmg`,
  `projRadius`, `homing`, `lob`, `bleed`, `blink` (namewraith teleports).
- `swarm` — `cohesion`, `jitter`, `turn`.
- `split` — `splitInto` (a real enemy id), `splitCount`, `splitSpread`, paired
  with `onDeath: 'split'`. `weeper` → 6 `fenlice`; `loomspawn` → 2 `namewraith`.
- `hover: 1` means it does not touch the ground (Conductors, wisps, cantors).

**2. Two support behaviours the sim must actually implement**, because they are
the reason those enemies exist and a reskin would waste them:
- **Screamer** buffs everything inside `buffRadius` (speed ×1.45, damage ×1.15).
- **Cantor** re-strings up to `restringMax` *cut* puppets inside
  `restringRadius` every `restringEvery` seconds. This is the enemy that makes
  cutting a priority ordering problem rather than a spray.

**3. Boss `aiParams.phases`** is an array ordered by descending `at` (the HP
fraction at which the phase begins). Each phase may carry `move`, `speed`,
`hover`, `standoff`, and any of: `spawn {every,n,of}`, `resing {every,n,of}`
(Hollowth singing its Choir back up), `restring {every,n,radius}` (Vellish),
`weave {every,walls,dmg}`, `beams {every,n,dmg}`, `sweeps {every,arcs,dmg}`,
`conduct {barsPerCycle,invertBars,sweepBars}` (Morrow, with `bpm`/`barBeats` on
the def — `invertBars` are the bars during which the player's input is flipped),
`lattice`, `summonChoir`, `clearField`, `ownString`, and `tells[]` for the
telegraph animation. Two of these are load-bearing story, not decoration:
- `ninth` phase 3 has **`spawn: null` and `clearField: 1`** — DESIGN §7 says the
  last phase has no puppets in it at all. Do not "fix" that to a small spawn.
- `ninth` phase 3 has **`ownString: 1`** — the Ninth's own thread goes up out of
  frame. The ending fork (cut your own string / take the hand) hangs off it.

**4. Stage-level fields** the director reads: `conductor.affixes` is a pool of
string ids — `swift armoured burning regen venom frenzy shielded chill thorned
warped` — accumulating across a stage per DESIGN §2.3. `chorus[]` is a list of
times in seconds. `rewards.unlocks` names unlock ids that the later meta lane
must define in `unlocks.js`: `sanctum passives chests evolutions relics sigils
curse endless choirhunt char_vane char_ash char_hand`. `backdrop` keys for Lane
F: `bg_town bg_ossuary bg_marsh bg_chapel bg_threadworks bg_ashgate bg_hospital
bg_choirhall bg_descent bg_loom bg_throne` (s1/s2 share `bg_town`).

**5. Weapon `base` field meanings** where the name is ambiguous:
- For `orbit`, `speed` is **rad/s**, not units/s, and `cooldown` is the
  **per-target re-hit interval**. Same for `aura`, `zone`, `trail`.
- For `chain`, `count` is the number of **jumps** and `area` is the maximum
  **jump distance**, not a radius around the player.
- For `strike`, `count` is the number of simultaneous **targets**.
- `knock` may be **negative**, meaning pull. `requiem` is the only content that
  uses it today and the whole evolution is that sign.
- `pierce: 99` is the idiom for "does not stop for bodies".

---

## Contract changes I am requesting (not making)

I stayed inside the frozen shapes everywhere. Two places where that cost
something real:

**R1 — `WeaponDef.levels[i]` cannot express a behavioural step.** The shape is
`Partial<base> & {text}`, so a level-up can only move a number. Every weapon
does get one genuinely behaviour-shifting step around L4–L6, but each is
expressed as a dramatic stat move (`pierce` to 99 = stops stopping for bodies,
`duration` near-doubling = the fire stays, `count` doubling = the pair becomes a
flight) and the `text` carries the rest. Requesting an **optional** `flags:
string[]` on a level delta so a step can say `['persist']` or `['seekThread']`
outright. Additive and ignorable; nothing breaks if it is declined.

**R2 — nothing in `WeaponDef` says what a weapon aims at.** Four weapons'
identities are targeting, not shape: Choirbreaker picks the most-strung body,
Thurible of the Nine flies at Conductors, Requiem opens under the Conductor,
Ninefold Arc prefers the thread to the body. Right now that lives only in
`desc`, which means Lane B has to read prose to implement them. Requesting an
optional `target?: 'nearest'|'dense'|'strung'|'conductor'|'thread'|'random'`
defaulting to `'nearest'`. If declined, Lane B should hard-code those four by
weapon id and I will note it here.

**R3 (minor)** — `EnemyDef` has no `hover` field, so the non-grounded enemies
carry `aiParams.hover: 1`. Fine as-is; flagging it so it is not read as a typo.

## Things I deliberately did not do

- `curse` and (mostly) `growth` are not reachable from a passive. Curse belongs
  to relics, sigils and the curse tiers, where taking it on has a price;
  `growth` and `greed` appear once each on Lodestone so the pickup build has
  somewhere to go. Flagging in case the later meta lane expects otherwise.
- Bosses are `xp: 500 / 1200 / 3000 / 9000`. If the boss chest is meant to be
  the whole reward and boss XP should be 0, say so — one-line change.
- No `elite: true` on the four bosses (they have `boss: true`); `pallbearer`,
  `bellplate`, `cantor` and `throneguard` are the elites.
- Stages 1 and 2 share `bg_town`. Twelve backdrops is a lot of Flux time for
  two stages set one street apart.

## Log

- **2026-09-14** — C1 + C2 written, validated, validator falsified. 24 enemies,
  12 stages, 16 weapons, 12 passives, 10 evolutions. Four defects found by the
  validator on first run, all fixed. Nothing outside `js/data/{enemies,stages,
  weapons,passives,evolutions}.js` and this file was touched; no git commands run.

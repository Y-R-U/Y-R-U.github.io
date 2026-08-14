# AUDIT — what `js/sim/` implements that the running game never reaches

Read-only audit, 2026-08-14. Method: enumerated every export of every file in `js/sim/`, greped the
whole tree for call sites, classified each as reached-by-runtime / reached-only-by-`*.test.js` /
reached-only-by-`tools/` / never referenced. Then swept `js/game/`, `js/main.js` and `js/world/` for
inline arithmetic that `js/sim/` already owns.

Everything below was read in source. Where a claim is negative ("nothing calls this") the grep that
establishes it is quoted. Nothing here was run in a browser — this is a static audit plus
`node --test` (312 pass), `node tools/lintQuests.mjs` (0 errors) and `node tools/soak.mjs` (clean).

The headline number, from the import sweep:

```
$ grep -rn "sim/" --include='*.js' --include='*.mjs' . | grep -v '^./js/sim/' | grep import
```

`js/sim/gather.js` has exactly **one** importer in the whole repo and it is `tools/soak.mjs`.
`js/sim/combat.js` has two, and one of them (`js/game/vitals.js`) takes only the six health/focus
constants. `js/sim/tables.js` reaches the runtime only as `ITEM_VALUE` and `PERISHABLE`.
`js/main.js`, `js/player.js` and every file in `js/world/` import **nothing** from `js/sim/`.

---

## 1. The whole of `js/sim/gather.js` and the damage half of `js/sim/combat.js` are orphaned, so the runtime cannot emit `kill`, `gather` or `escort` — 60 of 99 quests are unfinishable, starting with the first one

**What** — Nothing in the game deals damage, kills anything, catches a fish, forages, mines or cooks,
because the two sim modules that own those verbs are imported only by the soak harness. The quest
engine understands `kill` / `gather` / `escort` objectives perfectly; no runtime system ever emits
those events.

**Where**
- Orphaned sim: all of `js/sim/gather.js` (92 lines, 26 exports); `js/sim/combat.js:5` `power`,
  `:6` `critChance`, `:9` `enemyHp`, `:10` `enemyDamage`, `:11` `mitigation`, `:13` `resolveHit`,
  `:23` `tapsToKill`, `:34` `damageTaken`, `:45` `chargeMul`, `:50` `packSize`, `:51` `eliteChance`,
  `:61` `sustainedDps`, `:72` `FACTION_KIT`, `:78` `FIELDS`, `:84` `ECHOES`, `:120` `acquire`,
  `:139` `secondsToClear`; `js/sim/tables.js:6` `ENEMIES`.
- Runtime site that should call it: `js/game/session.js:414-426` `cast()` — the entire cast path.
  It spends Focus (`vitals.spend`), plays a sound, and emits `{ t: 'cast' }`. It never acquires a
  target, never resolves a hit, never emits `{ t: 'kill' }`.
- `js/game/questrunner.js:166-177` `update()` — carries the admission in a comment:
  *"The only world events wired today: where the player is, and time passing."*
- `js/world/spell.js:202` `cast()` / `:220` `reach()` — the bolt raycasts the **camera collider set**
  and stops at a wall. There is no creature test anywhere in the file.
- `js/world/vermin.js` builds rats, boars and crabs with a full `ACT = { none, attack, hurt, die }`
  vertex-shader state machine and has no hp, no hit test and no death trigger reachable from
  gameplay (`grep -n "hp\|kill\|damage" js/world/vermin.js` returns only shader locals).

**Proof**

```
$ grep -rn "sim/gather" --include='*.js' --include='*.mjs' .
tools/soak.mjs:21:import * as G from '../js/sim/gather.js';

$ grep -rn "sim/combat" --include='*.js' --include='*.mjs' .
tools/soak.mjs:20:import * as CB from '../js/sim/combat.js';
js/game/vitals.js:3:import { hpMax, focusMax, focusRegen, RESTED_AFTER, OVERDRAW, GUTTER } from '../sim/combat.js';

$ grep -rn "resolveHit\|\bacquire\b\|chargeMul\|critChance" --include='*.js' --include='*.mjs' .
# only js/sim/combat.js and js/sim/combat.test.js

$ grep -rn "t: 'kill'\|t: 'gather'\|t: 'escort'" --include='*.js' js/ | grep -v test
# (no output)

$ grep -rn "\.emit(" --include='*.js' js/ | grep -v test
js/game/session.js:90    { t: 'talk', ... }
js/game/session.js:390   { t: 'interact', ... }
js/game/session.js:410   { t: 'talk', ... }
js/game/session.js:425   { t: 'cast', ... }
js/game/session.js:585   { t: 'interact', ... }
js/game/session.js:664   { t: 'deliver', ... }
js/game/questrunner.js:173/174/176  { t: 'enter' } / { t: 'leave' } / { t: 'tick' }
```

Counting objectives across the four packs through `normaliseQuests`:

```
objective kinds: { kill: 31, interact: 84, talk: 165, gather: 46,
                   goto: 48, deliver: 24, survive: 9, escort: 9 }
quests: 99   quests containing an objective the runtime can never emit: 60
```

The 60 include `light.01` — the opening quest, whose first step is `["kill","grain_rat",1]`.

**Why the tests are green anyway.** `tools/campaign.test.mjs:20-25` manufactures precisely the events
the runtime cannot produce:

```
case 'kill':   return { ...base, t: 'kill',   kind: o.kind, n: o.n };
case 'gather': return { ...base, t: 'gather', kind: o.kind, n: o.n };
case 'escort': return { t: 'escort', npc: o.npc, path: o.path };
```

so "the ladder plays end to end on one save" passes while the ladder cannot start in the game.

**Player-visible consequence** — You spawn in the Whitewall granary, dial Kindle, and cast at the rat.
Particles fly, Focus drains, the rat is untouched, and the tracker stays on `Cull the rodent`
forever. There is no second quest, no fishing, no forage, no cooking, no market stock, no death.
The game has no verbs beyond walking and talking.

**Severity** blocker · **Effort** large (a hit-resolution layer, a creature health/death model, and
gather/fish/cook interactions — this is Track D's real content, not a wiring fix)

---

## 2. `grantXp` and the whole affinity rule are orphaned — quest XP is applied raw, so "Neutral becomes far more powerful" is false in play

**What** — `js/sim/xp.js` implements diminishing returns (`tierMul`), grind suppression (`repMul`),
the Ash penalty and the affinity multiplier that is the mechanical payoff of the third campaign.
Nothing in `js/game/` imports any of it. Every XP award in the running game is a raw `+=`.

**Where**
- Orphaned sim: `js/sim/xp.js:24` `tierMul`, `:29` `repMul`, `:33` `ASH_MUL`, `:35` `grantXp`,
  `:48-53` `STREAK_RESET_SECONDS` / `STREAK_RESET_OTHERS` / `newStreaks` / `bumpStreak`;
  `js/sim/schools.js:28-29` `AFF` / `PEN`, `:33` `WORN_OVERRIDES_AFFINITY`, `:37` `affinityOf`,
  `:43` `affinityXp`, `:48` `affinityPower`, `:15` `AFFINITY`.
- Runtime site that should call it — the **single** XP sink in the game:
  `js/game/questrunner.js:93`
  ```js
  case 'xp': d.schools[e[1]] = (d.schools[e[1]] || 0) + e[2]; break;
  ```
- The four producers that feed it, none of which pass a faction or a worn face:
  `js/game/quest.js:105` (`payout` → `fx.push(['xp', school, n])`),
  `js/game/quest.js:111` (optional-step bonus),
  `js/game/session.js:604` (`unGraft` → `['xp','glamour', Math.round(r.xp)]`),
  `js/game/session.js:665` (`sell` → `['xp','barter', transactionXp(...)]`).

**Proof**

```
$ grep -rn "grantXp" --include='*.js' --include='*.mjs' .
js/sim/xp.js:35:export function grantXp({ base, school, playerLevel, sourceLevel, streak = 0, faction, worn = null, ash = false }) {
js/sim/xp.test.js:4,73,150,156

$ grep -rn "affinityOf\|affinityXp\|affinityPower" --include='*.js' --include='*.mjs' .
tools/soak.mjs:18,119        <- and note: soak passes only (school, state.faction), never `worn`
js/sim/schools.js:37,43,44,48,49
js/sim/xp.js:3,36
js/sim/xp.test.js:5,80-95
```

`js/sim/xp.test.js:94` asserts `affinityPower('kindle','neutral','dark') === 1.10` — the third
campaign's whole promise, tested, green, and unreachable.

Worth noting because it is the near-miss: `js/game/questrunner.js:53-71` `ctx()` **does** build a
context carrying `schools`, `standing`, `campaign` and, at line 64, `worn: d.worn`. `doc.worn` is
genuinely written (`js/game/session.js:593` in `wear()`). Everything `grantXp` needs is already
assembled and in scope at the call site. It is one call that was never made.

**Player-visible consequence** — Farming the same rat 40 times pays exactly as much on the 40th as on
the first (no `repMul`); a level-20 character farming level-1 vermin gets full XP (no `tierMul`);
and a Neutral player who has just spent a Hearth Ash to wear a Dark face gains the same XP as a
Neutral player standing in a field, so the Graft — the campaign's signature mechanic and its only
resource sink — has no progression payoff at all. The strongest sentence in `CLAUDE.md`
("can become **far more powerful** than either") is not true when you play it.

**Severity** blocker · **Effort** one-liner for the sink, small for the producers (thread
`playerLevel` / `faction` / `worn` from `ctx()` into `payout`, then route line 93 through `grantXp`).
Note the two must land together: routing the sink alone double-counts nothing but silently changes
every published balance number in `SYSTEMS.md §11`, so re-run `tools/soak.mjs` in the same commit.

---

## 3. `applyStanding` is orphaned — Standing can only ever go down, and only via one path the game cannot currently reach

**What** — `js/sim/faction.js` owns the whole reputation model: per-action deltas, daily caps,
opposed-faction bleed, and the five bands. The runtime never calls it. The only code that ever writes
`doc.standing` is the Graft-detection penalty.

**Where**
- Orphaned sim: `js/sim/faction.js:6` `STANDING`, `:33` `newStanding`, `:40` `rollStandingDay`,
  `:48` `applyStanding`, `:77` `enterCampaign`, `:31` `bandOf`.
- Runtime sites that should call it:
  - `js/game/quest.js:128` `finish()` / `js/game/quest.js:103` `payout()` — a completed quest is
    worth `STANDING.quest = 8` and pays nothing.
  - `js/game/session.js:655-670` `sell()` — `STANDING.sellPer100` / `sellCap` never applied.
  - a vermin kill — `STANDING.vermin` / `verminCap`; no kill path exists (finding 1).
  - `js/game/session.js:64` — starting a campaign should `enterCampaign` (clamp to −20).
  - `js/game/save.js:215` `rollDay()` clears `daily.standing` but nothing ever reads or
    re-seeds the caps block, so `rollStandingDay` is unreachable too.
- The one writer: `js/game/session.js:616-617`
  ```js
  const b = breakGraft(this.doc.standing, worn);
  for (const f of FACTIONS) this.doc.standing[f] = b.standing[f];
  ```

**Proof**

```
$ grep -rn "applyStanding\|newStanding\|rollStandingDay\|enterCampaign" --include='*.js' --include='*.mjs' .
tools/soak.mjs:75,102,150,174,292,370
js/sim/faction.js:33,40,42,48,49,77,118
js/sim/faction.test.js:5,35-87,133,204
# no js/game/ hit

$ grep -rn "\.standing" --include='*.js' js/ | grep -v test
js/game/session.js:616,617     <- the only writer
js/game/save.js:118            <- load-time clamp
js/game/questrunner.js:60      <- read into ctx
js/game/predicate.js:39        <- the ["standing", f, n] predicate
js/game/sheet.js:71, js/game/menu.js:145   <- displayed
```

And the one writer is itself unreachable today: it fires from `onBreak()`, which needs suspicion to
hit 100, which needs `watch()` (`js/game/session.js:484-504`) to find a Watchman. The only target
source wired is `js/main.js:95-103` `targets()`, which emits `kind: 'talk'` and nothing else — no
`watch`, no `trade`. So `this.world.watch` is `undefined` and the list is always empty.

**Player-visible consequence** — The character sheet (`js/game/sheet.js:71`) and the pause menu
(`js/game/menu.js:145`) both print a Standing line for all three towns. It reads
`Whitewall Plain · Longacre Plain · Blackstone Plain` for the entire game, no matter what you do.
Ferry tolls, band price multipliers and gate access — all authored — never change hands.

**Severity** blocker · **Effort** medium (three call sites plus a `daily.standing` cap store; the
sim function is pure and returns new state, so each site is two lines)

---

## 4. The Light → Dark → Neutral unlock ladder is written to one field and read from another, so the slate never lights up

**What** — Two representations of "you finished a campaign". `sim/campaign.js` authors
`unlocks: 'dark'` on L24; the pack encodes it as `["unlock","dark"]`; `questrunner.apply` turns that
into `flags['unlocked.dark']`; and the faction-select slate reads `campaign.done`. Nothing writes
`campaign.done`, and nothing reads `flags['unlocked.*']`.

**Where**
- Orphaned sim data: `js/sim/campaign.js:95` (`echo: 'white_cord', unlocks: 'dark'`),
  `:150` (`unlocks: 'neutral'`), `:208` (`unlocks: 'trilogy'`), `:167` (`grants: 'graft'`).
  `js/game/quest.js:86-101` `rewardFor` reads only `rewardXp` / `rewardMk` and drops all four fields.
- The write: `js/game/questrunner.js:98`
  `case 'unlock': d.flags[`unlocked.${e[1]}`] = true; break;`
- The read: `js/game/towns.js:19` `const done = doc?.campaign?.done || [];` — driving
  `playable` at `towns.js:33` and `:40`, consumed by `js/game/slate.js:29-36`.
- Also read at `js/game/predicate.js:43` — the `["campaign", id, "done"]` predicate, which no pack
  currently uses, so it is a live landmine rather than an active bug.

**Proof**

```
$ grep -rn "unlocked\." --include='*.js' --include='*.json' js/ data/ tools/ | grep -v "\.test\."
js/game/questrunner.js:98:      case 'unlock': d.flags[`unlocked.${e[1]}`] = true; break;
# write-only: zero readers anywhere in the tree

$ grep -rn "campaign?.done\|campaign\.done" --include='*.js' js/ | grep -v test
js/game/towns.js:19
js/game/predicate.js:43
# read-only: zero writers anywhere in the tree

$ grep -rn "\.unlocks\|\.echo\b\|\.grants\b" --include='*.js' --include='*.mjs' js/ tools/
js/sim/campaign.test.js:81,86
tools/soak.mjs:298
# no js/game/ hit
```

**Player-visible consequence** — Finish the Light campaign and reopen the game: the slate still shows
Blackstone as `shadow` with the line *"Finish Whitewall."*, and Longacre still answers
*"Longacre has nothing to teach you yet."* The Echoes row on the sheet reads `none yet` forever, even
though `echo.white_cord` is set as a flag. Quest-to-quest chaining still works (`dark.01`'s prereq is
`["quest","light.24","done"]`, which is a different mechanism), so the content is reachable — but the
front door the design put in front of it is nailed shut.

**Severity** blocker · **Effort** one-liner (push `campaign.done` in the same `case 'unlock'` when
`e[1]` is a faction id, or teach `towns.js:19` to read the flags — pick one and delete the other
representation)

---

## 5. `js/game/hud.js` reimplements `chargeMul` inline, displays a number, and nothing spends or deals it

**What** — The HUD draws a charge ring and prints a damage multiplier from its own formula. The sim
owns that formula with a dead-zone the HUD does not have, and the multiplier is never passed to the
cast.

**Where**
- Orphaned sim: `js/sim/combat.js:44` `CHANNEL = { min: 0.35, max: 1.20 }`, `:45`
  `chargeMul = held => held < CHANNEL.min ? 1 : 1 + 0.8 * Math.min(1, (held - CHANNEL.min) / 0.85)`.
- Divergent duplicate: `js/game/hud.js:304`
  ```js
  ? `${(1 + 0.8 * this.charge).toFixed(1)}×`
  ```
  where `this.charge` is `Math.min(1, held.t / channelSeconds)` (`hud.js:296`). No `CHANNEL.min`
  dead zone, and the denominator is `channelSeconds` (1.2, or the Graft knob) rather than 0.85.
- The consumer that ignores it: `js/game/session.js:417`
  `const cost = focusCost(spell, { guttered: this.vitals.guttered > 0 });` — `focusCost`
  (`js/sim/spells.js:80`) takes a `charge` parameter and is never given one.
  `js/game/session.js:393-405` `channel()` receives `phase === 'release'` and calls `this.act(kind)`,
  which discards the charge entirely.

Note that `CHANNEL` shows as a runtime hit in a naive grep — that is a false positive.
`js/world/field.js:105` and `js/world/terrain.js:12` have their own unrelated `CHANNEL` (a river
trench). Neither file imports from `js/sim/`.

**Player-visible consequence** — Hold the cast button and the ring fills and the dial reads `1.8×`.
It costs the same Focus as a tap and, once combat exists, will do the same damage. The one piece of
cast-timing feel the HUD advertises is a lie. Also, per `chargeMul`, a 0.3 s hold should be
`1.0×`; the HUD shows `1.2×`.

**Severity** medium · **Effort** one-liner (import `chargeMul`, feed `hud.charge` through it, and
pass `charge` into `focusCost` at `session.js:417`)

---

## 6. `js/world/spell.js` carries its own bolt speed, range and swing timing, divergent from the sim's

**What** — Four combat-feel constants exist twice with different values. The sim's copies are dead;
the world's copies are what you feel.

**Where**

| Value | `js/sim/` (dead) | runtime (live) |
|---|---|---|
| bolt range | `js/sim/spells.js:10` `range: 26` | `js/world/spell.js:20` `range: 18` |
| bolt speed | `js/sim/combat.js:73` light `boltSpeed: 28`, `:74` dark `18` | `js/world/spell.js:20` `speed: 22` (one value for both factions) |
| aim cone | `js/sim/spells.js:10` `cone: deg(45)`, `:11` dark `deg(25)` | not implemented — `js/world/spell.js:207` fires straight down `player.yaw` |
| swing decay | `js/sim/combat.js:41` `SWING_DECAY = 2.6` | `js/player.js:211` `this.swing - dt * 2.6` |
| fire point | `js/sim/combat.js:42` `SWING_FIRE_AT = 0.5` | `js/world/spell.js:17` `const RELEASE = 0.5;` |

**Proof** — `js/world/spell.js` and `js/player.js` appear nowhere in the `sim/` import sweep; both
define these as file-local literals. `SWING_DECAY`, `SWING_FIRE_AT`, `FACTION_KIT` and `CRIT_MUL`
have zero references outside `js/sim/combat.js` (they are not even in `combat.test.js`).

Same class, smaller: `js/sim/combat.js:132` exports `wrapPi`, whose only in-sim consumer is the dead
`acquire`. Four independent copies exist in the runtime — `js/player.js:12`, `js/world/climb.js:14`,
`js/world/doors.js:16`, `js/game/dialoguebox.js:10` — all `a => Math.atan2(Math.sin(a), Math.cos(a))`,
which is behaviourally identical to the sim's loop form, so this one is tidiness, not a bug.

**Player-visible consequence** — Dark's bolt is supposed to be the slow, heavy one (18 m/s vs
light's 28) with a tight 25° cone; in play both factions fire the identical 22 m/s bolt with no cone
at all. The faction identity `zones.js` and `SYSTEMS §4.5` both describe is colour-only.

**Severity** medium · **Effort** medium (importing the constants is trivial; honouring `cone` needs
`acquire`, which needs targets, which is finding 1)

---

## 7. Standing bands price nothing, and `buyPrice` / the shop / charms / stave integrity have no runtime at all

**What** — The sell side is genuinely clean — `js/game/market.js:1-2` claims "there is no arithmetic
in this file" and it is true, and `js/game/sale.js` routes every number through `sim/economy.js`.
The buy side and every price modifier do not exist.

**Where**
- `js/sim/faction.js:19-23` `BANDS[].priceMul` (1.25 watched / 0.90 trusted-and-sworn) — `bandOf` is
  test/tools-only, and `js/game/sale.js:59` `quote()` never consults a band.
- `js/sim/economy.js:8` `buyPrice`, `:12` `buyRate`, `:57` `ferryToll`, `:64` `bindingCost`,
  `:65` `stallRent`, `:66` `gutterLoss`, `:74` `carryMarks` — no runtime caller.
- `js/sim/tables.js:130` `CHARMS`, `:137` `SHOP`, `:124` `INTEGRITY`, `:147` `FERRY`,
  `:148` `STALL_RENT` — `js/game/sale.js:5` imports only `ITEM_VALUE` and `PERISHABLE` from this file.
- `js/game/sheet.js:49-51` `charmRows` and `:70` the stave row are pure display over
  `doc.charms` / `doc.stave.integrity`, which only `js/game/save.js:130-136` ever writes (defaults).
- `js/sim/economy.js:55` `HAGGLE.barterLevel: 7` is never checked — `js/game/sale.js:75` applies the
  12% bonus on the flag alone.
- `js/game/save.js:198` `addItem(doc, id, n, caught)` — the fourth argument is never supplied by any
  of the three callers (`session.js:576`, `session.js:663`, `questrunner.js:95`), so
  `js/game/sale.js:15` short-circuits and `freshness()` always returns 1.

**Proof**

```
$ grep -rn "from '.*sim/tables" --include='*.js' --include='*.mjs' .
tools/lintQuests.mjs:15   (ENEMIES, CATCH, FORAGE, ROCK, ITEM_VALUE, SHOP)
tools/soak.mjs:25
js/game/sale.js:5         (ITEM_VALUE, PERISHABLE)

$ grep -rn "caught" --include='*.js' js/ | grep -v test
js/game/save.js:124,198,201   js/game/sale.js:15,16
# no caller ever passes the 4th argument
```

**Player-visible consequence** — There is no shop, so the 350 mk Hearth Ash that gates every Graft
away from Longacre cannot be bought. Charm slots read `empty` for the whole game and the stave sits
at `100%`. Every perishable shows five fresh pips no matter how long it has been in the bag, so the
freshness spark line in the market panel is decoration. Ranked below 1–4 because most of this is
"not built yet" rather than "built twice and diverged" — the exceptions are `priceMul` and
`HAGGLE.barterLevel`, which are real divergences.

**Severity** medium · **Effort** large (needs a buy UI); the `priceMul`, `HAGGLE.barterLevel` and
`caught` fixes inside it are one-liners each

---

## 8. School milestones and spell tier gates never fire, so the dial casts one tier-1 spell for twenty levels

**What** — `sim/schools.js` owns the 3/7/12/17 milestone table and `sim/spells.js` owns the tier
gate. Neither is consulted; the runtime picks a spell by a local filter that only ever returns
tier 1.

**Where**
- Orphaned sim: `js/sim/schools.js:53` `MILESTONE_LEVELS`, `:55` `MILESTONES`, `:68` `unlocked`,
  `:73` `hasMilestone`, `:77` `GRAFT_QUEST`; `js/sim/spells.js:51` `TIER_GATES`, `:58` `tierUnlocked`.
- Runtime site that should call it: `js/game/sheet.js:89-93`
  ```js
  export function basicOf(school, faction = 'light') {
    if (school === 'kindle') return factionBolt(faction);
    const list = Object.values(SPELLS).filter(s => s.school === school && s.tier === 1 && !s.factionId);
    return list.sort((a, b) => a.cost - b.cost)[0] || null;
  }
  ```
  `tier === 1` is hard-coded, so `split_bolt`, `ember`, `cinderfall`, `bulwark`, `deep_call`,
  `bloom`, `bind`, `scatter`, `brood_sense`, `feast`, `reforge`, `shift` and `quarry` are
  unreachable — 13 of the 34 entries in `SPELLS`.
- `js/game/session.js:450` is the only `canCast` call and it is passed the literal `'graft'`, which
  carries a `quest` field and returns at `js/sim/spells.js:72` before `tierUnlocked` is reached.

**Careful — a naming collision that looks like a call site.** `unlocked` shows as a runtime hit in a
bare-word grep. Those hits (`js/game/hud.js:133`, `js/game/session.js:16` and `:767`) resolve to
`js/game/sheet.js:20` `export const unlocked = doc => SCHOOLS.filter(...)`, a *school*-unlock helper
with a different signature. `js/sim/schools.js:68` `unlocked(school, level)` — the milestone one —
has no importer outside `js/sim/xp.test.js:5`.

**Player-visible consequence** — Levelling a school past 3, 7, 12 or 17 changes a number on the sheet
and nothing else. The radial dial casts the same cheapest tier-1 spell at level 20 as at level 1.
Everything in `SYSTEMS §2` that made a school worth training is inert.

**Severity** medium · **Effort** medium (`basicOf` needs a milestone-aware selection and the HUD needs
somewhere to show more than one spell per school)

---

## 9. `sim/combat.js`'s Neutral-advantage gate and the fields/echoes model are dead in every direction

**What** — `neutralAdvantage`, `neutralGate`, `NEUTRAL_SCENARIOS`, `NEUTRAL_LEVERS`, `FIELDS` and
`ECHOES` exist to answer one question: *is Neutral actually stronger?* They are called only by
`js/sim/combat.test.js` and `tools/soak.mjs`.

**Where** — `js/sim/combat.js:78` `FIELDS`, `:84` `ECHOES`, `:91` `NEUTRAL_LEVERS`,
`:97` `neutralAdvantage`, `:105` `NEUTRAL_SCENARIOS`, `:111` `neutralGate`.
The three Neutral field spells exist in `js/sim/spells.js:29-34` with `shape: 'field'`, but
`js/world/spell.js:19-21` defines exactly one shape, `bolt`, and `basicOf` (finding 8) cannot return
them anyway — they carry `factionId: 'neutral'`, which `sheet.js:91` explicitly filters out.
`ECHOES`' three effects have no runtime consumer; `js/game/vitals.js:53` `gutter(doc, whiteCord)`
takes the White Cord flag and is itself never called (`grep -rn "vitals.gutter" js/` → no output;
`hurt` and `down` at `vitals.js:45` and `:50` are likewise uncalled).

**Proof** — see the matrix; `neutralAdvantage` rt=0, `FIELDS`/`ECHOES`/`NEUTRAL_LEVERS`/
`NEUTRAL_SCENARIOS` have zero references outside `js/sim/combat.js` and its test.

**Player-visible consequence** — None that a player can reach today, because none of it is castable.
It matters as a *false green*: `tools/soak.mjs` prints `mixed +76%` for the Neutral gate, which reads
as "the third campaign is justified" when the mechanics it measures have no runtime.

**Severity** small (today) · **Effort** large (blocked behind 1, 6 and 8)

---

## What I could not verify

- **Nothing was run in a browser.** Every finding is static analysis plus `node --test` /
  `lintQuests` / `soak`. I did not run `tools/shot.mjs --all` per the brief.
- **I did not audit `js/editor/`, `js/engine/`, `audio/` or the rest of `js/world/`** beyond
  `spell.js`, `vermin.js` and confirming that no file under `js/world/` imports from `js/sim/`.
- **Findings 1 and 8 overlap with unbuilt content.** Track D is explicitly "not started" in
  `BUILD_PLAN.md`, and the rodent rig is listed there as a real build item. I have reported the
  missing wiring as a bug because `js/sim/` treats it as finished and the test suite reports it as
  passing — but a reasonable reading is that finding 1 is "Track D, as planned". The part that is
  unambiguously a bug regardless is that 312 tests and a clean soak give no signal about it.
- **Finding 3's chain** (`watch()` never populated → suspicion never rises → `onBreak` never fires)
  is fully verified: `js/game/session.js:489` is the only consumer of `world.watch`, and
  `grep -rn "watch:" --include='*.js' js/ | grep -v test` returns only
  `js/sim/faction.js:82 WATCH_WEIGHT` — the `world` object built at `js/main.js:114-121` has no
  `watch` key, so `this.world.watch` is permanently `undefined`.

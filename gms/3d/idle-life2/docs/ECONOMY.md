# Idle Life 2: economy (L1)

The game model lives in `js/state/` and is pure: no DOM, no THREE, and the clock and RNG are injected. The tunables live in `js/data/`. `tools/sim.mjs` drives the real `createGame` to prove DESIGN §3, and `tools/test-economy.mjs` holds 41 `node --test` cases.

| Command | What it does |
|---|---|
| `node tools/sim.mjs` | Life 1 for the active, idle and typical profiles plus a 4-hour slow player. It covers income-ratio probes, the negative-return audit, dead gaps, life-beat timing, contract-gate stalls and gen 2. Exits 1 on any miss. |
| `node tools/sim.mjs --plant-r1` | The falsification arm: pile ×1.25 and σ price ×1.0. It must fail. |
| `node tools/sim.mjs --season` | Hollow's Eve ranks by day |
| `node --test tools/test-economy.mjs` | The unit, offline, save and fixture suite |

## 1. The line model (DESIGN §1 rulings)

```
P   = L · rate · 2^milestones(L) · Πboosts · 1.1^thr · (1+items.price) · speed · mgrLv · traits · keepsakes
      · kidHelper(1.1) · plaques(1.05 each) · talent · supply(1.5) · G · critEV · events · nightShift(2)
G   = housing · partner · legacy · (1 + 1%·portraits + 2%·museums) · (1 + 1%·achievements) · (1 + character keepsakes)
σ   = managed ? min(1, 0.60 + 0.08·thr + items + trait) : 0.35  (walk-in customers; σ above 1 turns into price)
shelf = 180 s · P · 2^storage · shelfMult                       (3 min of output at the base)
```

**Managed line**
- Each step it sells σ·P into cash and puts (1−σ)·P on the shelf.
- When the shelf is full it still sells σ·P. Only the overflow is wasted.

**Unmanaged line** (P4: PLAYTEST_1 saw the first stand earn $0/s for about 60 s)
- Walk-in customers buy σ = 0.35 (`ECON.sigmaWalkIn`) from the first second, and only the rest goes to the shelf. This holds offline too.
- When the shelf is full, it keeps selling at 0.35, and the overflow is wasted.
- Hiring a manager raises σ to 60%+ and adds the manager's level and trait.

**Pile tap**
- Sells the whole stock at **×1.0**.
- **Return harvest:** the first pile tap on a line after time away (≥ 60 s) pays **×1.5**. With Taco Tom it pays ×1.75. The bonus is re-armed once per away interval.

**Why no upgrade has a negative return**
- For an active player, a σ upgrade changes income from P to P·1.1, because they already tap the remainder at ×1.0.
- For an idle player, it changes σP to (σ+0.08)·P·1.1. On an unmanaged line, σ stays at 0.35 and the price ×1.1 still pays.
- Hiring a manager is ≥ 0 for both profiles, because σ goes from 0.35 to at least 0.60.
- The audit in the sim checks this on a clone of the real game for every option, every 5 minutes, for both profiles. The result is 0 negative returns.

**Milestones**
- Each milestone is ×2, at Lv 10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 600, 800 and 1000.
- Visual tiers: tier 0 from Lv 1, tier 1 from Lv 25, tier 2 from Lv 100. A `tier` event fires on each change.

**Level costs**
- One level costs `levelCost · g^(L−1)`.
- Bulk cost is the geometric sum.
- MAX is a closed form, corrected by ±1.
- Cost multipliers: partner Accountant 0.95, talent Banker 0.9, Hank Hull 0.95 on his line.

**Tap and bootstrap**
- **Cans:** before the first stand, each tap picks up one can, worth $2. Cashing in 25 cans buys Lemonade.
- **Hustle tap:** after that, a tap is worth `0.12 · gross P · combo · crit`.
  - Combo builds to ×2 over 20 taps chained within 1.2 s.
  - Crit is 3% at ×5. All crits are capped at 15%.
  - At 2.5 taps/s on full combo this comes to 0.65× gross income. The cap is asserted in the tests.

### Line curve (`data/lines.js` CURVE)

- **Rate:** Lemonade is $1/s; every later line's base rate is ×20 the previous (Food Truck is $3).
- **Unlock cost:** `rate · unlockPay[i]`.
- **Level cost:** `rate · levelPay[i]`.
- **Level growth:** g = 1.10 + 0.004·i.
- **Themed throughput ladder:** 3U, 18U, 108U, 648U, 3888U.
- **Themed boost ladder:** 40U, 320U, 2.56KU, 20.5KU, with multipliers ×2, ×2, ×2 and ×3.
- **Storage:** 6U × 10^k.
- **Hire:** 2U.

Every new line is about 20× the last one, so new lines matter more than old upgraded lines. Each line's payback rises from 8 s (Lemonade) to 1500 s (App Studio), which spreads the pacing.

| Line | Unlock U | $/s per Lv | Lv cost base | Growth | Hire | Throughput ladder | Boost ladder |
|---|---|---|---|---|---|---|---|
| 🍋 Lemonade | 50 | 1.00 | 8.00 | 1.100 | 100 | 150 / 900 / 5.40K / 32.4K / 194K | 2.00K / 16.0K / 128K / 1.02M |
| 🌮 Food Truck | 120 | 3.00 | 75.0 | 1.104 | 240 | 360 / 2.16K / 13.0K / 77.8K / 467K | 4.80K / 38.4K / 307K / 2.46M |
| 💈 Barber | 9.00K | 60.0 | 3.60K | 1.108 | 18.0K | 27.0K / 162K / 972K / 5.83M / 35.0M | 360K / 2.88M / 23.0M / 184M |
| ☕ Café | 336K | 1.20K | 168K | 1.112 | 672K | 1.01M / 6.05M / 36.3M / 218M / 1.31B | 13.4M / 108M / 860M / 6.88B |
| 🧽 Car Wash | 10.1M | 24.0K | 5.28M | 1.116 | 20.2M | 30.2M / 181M / 1.09B / 6.53B / 39.2B | 403M / 3.23B / 25.8B / 206B |
| 🐩 Pet Salon | 269M | 480K | 163M | 1.120 | 538M | 806M / 4.84B / 29.0B / 174B / 1.05T | 10.8B / 86.0B / 688B / 5.51T |
| 🐟 Fish & Chips | 6.91B | 9.60M | 4.32B | 1.124 | 13.8B | 20.7B / 124B / 746B / 4.48T / 26.9T | 276B / 2.21T / 17.7T / 142T |
| ⛴️ Ferry | 173B | 192M | 111B | 1.128 | 346B | 518B / 3.11T / 18.7T / 112T / 672T | 6.91T / 55.3T / 442T / 3.54Qa |
| ⛵ Boatyard | 4.03T | 3.84B | 2.84T | 1.132 | 8.06T | 12.1T / 72.6T / 435T / 2.61Qa / 15.7Qa | 161T / 1.29Qa / 10.3Qa / 82.6Qa |
| 👗 Boutique | 88.3T | 76.8B | 73.0T | 1.136 | 177T | 265T / 1.59Qa / 9.54Qa / 57.2Qa / 343Qa | 3.53Qa / 28.3Qa / 226Qa / 1.81Qi |
| 🍝 Bistro | 1.92Qa | 1.54T | 1.84Qa | 1.140 | 3.84Qa | 5.76Qa / 34.6Qa / 207Qa / 1.24Qi / 7.46Qi | 76.8Qa / 614Qa / 4.92Qi / 39.3Qi |
| 💻 App Studio | 41.5Qa | 30.7T | 46.1Qa | 1.144 | 82.9Qa | 124Qa / 746Qa / 4.48Qi / 26.9Qi / 161Qi | 1.66Qi / 13.3Qi / 106Qi / 849Qi |

Every throughput and boost step has its own glyph, name and effect. `quote()` and `stats().nextThroughput`/`nextBoost` return the next one, so the card always shows the right themed glyph.

## 2. Districts, verbs, housing, life

**Permits** cost 1.5 × the district's first line: Suburbs $504K, Harbour $10.4B, Downtown $132T.
- Each permit also needs **3 of the 4 contracts of the previous district to be finished**. They don't have to be claimed: buying the permit claims every finished one and pays its reward (`quote('permit').contracts = {done, need, autoClaim}`). PLAYTEST_1 sat on $941M with the Suburbs locked because the contracts were done but unclaimed.
- No contract needs a hidden mechanic. "Tip 4 couriers" (`sb4`) became "Car Wash Lv 25", because players never found the couriers. The "Tip 3 couriers" daily only rolls after the first tip. Each district has at most one contract that needs tapping, so an idle player can always pass the gate.
- The sim measures the time with the permit affordable but blocked by contracts, for all four profiles. It is 0 s. With the gate reverted to "claimed only", the typical profile stalls for 83 min, so the check is live.
- Contracts are once per family.
- A district the family has already opened reopens free when the heir starts.

**District verbs**

| District | Verb | Rule |
|---|---|---|
| Suburbs | Deliveries | A courier spawns every 25–45 s and lives 12 s. A tip pays 6 s of income. |
| Harbour | Supply link | One purchase of 2 × the Fish & Chips unlock. Fish & Chips earns ×1.5 while Ferry or Boatyard feeds it. `stats().supply.phase` gives the van loop for render. |
| Downtown | Night shift | Two lines earn ×2 from 18:00 to 06:00 local. Offline, the share of the away interval that falls at night is sampled. |

On Suburbs couriers, `courierTap` (L2's courier actors) consumes the same tips.

**Housing**

Homes are life beats, not money sinks. **Age gates set the timing**, and the price is small enough (about 5–15% of a typical player's cash at the gate) that a typical player buys a home as soon as it opens. The old curve ($2K → $1.5B → $800B → $120T) put a typical player's partner at age 37 and Starter House at age 71.

| Tier | Home | Cost | Opens at age | Income | Offline cap | Unlocks |
|---|---|---|---|---|---|---|
| 0 | Bench | free | | ×1 | 1 h | |
| 1 | Bedsit | $2K | | ×1.1 | 2 h | |
| 2 | Apartment | $5M | 27 | ×1.25 | 3 h | Partner offer + dog |
| 3 | Starter House | $500M | 37 | ×1.5 | 4 h | Kid 1 |
| 4 | Family Home | $50B | 44 | ×2 | 6 h | Kids 2 and 3 |
| 5 | Mansion | $2T | 52 | ×3 | 8 h | |

Other sources add to the offline cap: partner Homebody +1 h, Mo Batter +1 h, Count Cuppula +2 h, Pocket Watch items, and talent Dreamer +2 h. The hard ceiling is 24 h.

**Age is life progress, mostly time played** (`LIFE.xp`). P4 moved the weight onto the trickle so that active, typical and idle players age at nearly the same rate (age 30 at about 15 min, 39 at 30 min, 56 at 60 min for both active and typical). The age-gated homes then time the life beats for every play style.

| Source | Years |
|---|---|
| Unlock a line | +0.4 |
| Open a permit | +0.8 |
| Housing move | +0.5 |
| Milestone | +0.02 |
| Partner | +0.3 |
| Birth | +0.2 |
| Dog | +0.2 |
| Each minute of play | +0.5 |

- The displayed age is capped at 72, but `life.xp` is not, so **kids keep growing after the cap**. Kid age is `(life.xp − kid.bornXp)·xpYears`. Before P4, kid age was parent age minus birth age, so a Starter House bought near 72 never produced a teen and retirement could never unlock (PLAYTEST_1).
- **Kids:** the first kid is born 1 year (`firstBirthGap`) after the Starter House (with a partner). Later kids come every 2 years in the Family Home.
- **Kid stages** by kid age: baby at 0, toddler at 2, kid at 5, teen at 15.
- **Fallback heir:** if the Harbour is open and there are no kids by age 60 (`heirAge`), or no teen at the age cap, an apprentice teen arrives (`kid.apprentice`, a name from `HEIR_NAMES`, `life:beat {kind:'heir'}`). The apprentice is a valid heir. Retirement is always reachable.
- **Working:** from the kid stage, a kid auto-works the best line, or the one set with `kidWork`, for ×1.1 on that line. Work seconds accumulate. The heir's talent comes from the line worked longest:

| Lines worked | Talent | Effect |
|---|---|---|
| Lemonade, Food Truck, Café, Fish & Chips, Bistro | Chef | Food lines ×1.25 |
| Barber, Pet Salon, Boutique | Charmer | Events ×2 |
| Car Wash, Ferry, Boatyard | Mechanic | Those three ×1.5 |
| App Studio | Banker | Costs −10% |
| (never worked) | Dreamer | Offline +2 h |

**Partner** (one of three, names are seeded): Accountant −5% costs · Entrepreneur +10% income · Homebody +1 h offline.

## 3. Managers, items, events, goals

**Managers**
- There are 12 default managers, one per line, plus Count Cuppula (Café, Nocturnal: +50% from 18:00 to 06:00 and +2 h offline). He comes from season rank 8.
- Each default manager has a simple trait:

| Manager | Trait |
|---|---|
| Lola Lemon | Speed +10% |
| Taco Tom | Return harvest ×1.75 |
| Sal Snips | σ +10% |
| Bea Barista | +25% from 06:00 to 12:00 |
| Duke Suds | Shelf ×1.5 |
| Pip Paws | +25% with the dog |
| Mo Batter | Offline +1 h |
| Captain Rosa | Speed +10% |
| Hank Hull | Levels −5% |
| Vivi Velvet | Events ×1.5 |
| Chef Gus | +50% from Lv 50 |
| Dev Kai | Auto-sells a full pile at ×1.0 |

- **Levels 1–5:**

| Level | Income | Slots | Cost to reach |
|---|---|---|---|
| 1 | ×1.0 | 1 | |
| 2 | ×1.1 | 1 | hire cost × 20 + 2 🎟️ |
| 3 | ×1.2 | 2 | hire cost × 200 + 4 🎟️ |
| 4 | ×1.3 | 2 | hire cost × 2K + 7 🎟️ |
| 5 | ×1.4 | 2 | hire cost × 20K + 10 🎟️ |

- Managers and items persist across generations. An owned manager re-assigns itself when its line is unlocked again.

**Items**
- There are 6 items × 3 rarities:

| Item | Effect | Common / Rare / Epic |
|---|---|---|
| Apron | Speed | 3% / 8% / 15% |
| Scale | Price | 3% / 8% / 15% |
| Shelf | Shelf | 25% / 60% / 120% |
| Whistle | σ | 3% / 6% / 12% |
| Clover | Crit sales ×3 | 1% / 2.5% / 5% |
| Watch | Offline cap | 10 / 25 / 60 min |

- Crit chance is capped at 15%.
- **Merge:** 3 identical items become 1 of the next rarity.
- **Auto-equip** fills slots best-first and never puts two of the same item on one manager.
- **Crates:** Basic is 80% Common, 18% Rare, 2% Epic. Silver is 40%, 50%, 10%. Gold holds 2 items at 60% Rare, 40% Epic.

**Events** (seeded, never offline, rewards scale with `max(income, 0.6·gross)`)
- **Pigeon:** every 90–180 s, lives 10 s, pays 20 s of income. A 10% jackpot pays ×5. The dog fetches ⅓ of the pigeons that would otherwise expire.
- **Specials:** one every 240–420 s, one at a time:

| Event | Weight | Reward |
|---|---|---|
| Limo | 3 | One line ×7 for 30 s |
| Parade | 2 | All lines ×2 for 60 s |
| Wallet | 2 | 🎟️ 2 |
| Bulk order | 2 | Sell 40 s of that line's output within 120 s for 90 s of income + a Basic crate |
| Rush Hour | 2 | Score 0–24: ≥ 16 Gold, ≥ 9 Silver, else Basic, plus score/24 × 30 s of income |
| Lucky Delivery | 1 | Suburbs or later; 3 hits gives a Silver crate |

**Goals**
- **Contracts:** 16, with rewards in 🎟️ and crates. A finished contract counts toward its permit gate even before it is claimed.
- **Daily goals:** 3 per local day, seeded from the day and the save seed. They measure stat deltas. Each pays 🎟️ 2 + a Basic crate, and claiming all 3 adds a Silver crate.
- **7-day gift:** missing a day pauses the ladder, never resets it.
- **Achievements:** 27, each +1% to income.

## 4. Prestige: "Pass it on"

- **Retire conditions:** the first kid is a teen and the Harbour is open.
- **Legacy points:** `LP_total = floor(10 · (allTime / 6e17)^0.15)`. Each LP adds +10%, so the multiplier is 1 + 0.1·LP.
- **First-retire floor:** the first retirement always gives at least ×2.
- **Recommended:** the glow appears when the raw formula alone gives at least +100% over the current multiplier. In life 1 that happens about 76 min in, so early retirees get the floor and patient ones aren't punished.
- **Starter cash:** max($50, 100·LP).

**At retirement:**
- A portrait is added (+1% income).
- Three landmarks are added: a plaque on the line that earned most (+5% to that line forever), a statue, and a museum (+2% income).
- One chosen item becomes a permanent heirloom. Its stat applies to every line.
- The heir is the chosen teen, keeping their talent, and the dog is inherited.

| Resets | Stays |
|---|---|
| Cash, lines, housing, partner, kids, age, events, couriers, supply link, night shift, return-harvest flags | Managers (levels and slots), items, tickets, contracts (once per family), achievements, keepsakes, season progress, settings, stats, goals and gift, the family (gen, portraits, landmarks, legacy, heirlooms, opened districts, dog) |

## 5. Hollow's Eve (Oct 1 – Nov 2, local)

- **Variant lines:** Witch's Brew (free at Lv 1), Pumpkin Pie (3K candy), Haunted Haircuts (300K candy).
  - Level growth is 1.15 to 1.17.
  - Milestones are ×2 at Lv 25, 50 and 100.
  - Each line has two boosts, ×2 and ×3.
- **Candy rate:** ×1 while inside the side world. Outside it and offline, ×0.5, with its own 4 h cap (independent of housing).
- **Time bonuses:** Witching Hour (18:00–24:00) gives ×2, and Oct 31 gives ×3 all day with trick-or-treaters. Offline candy averages the multiplier over the whole away interval, not the moment you return.
- **12 ranks**, by lifetime candy. Thresholds were fitted to the sim curve. The rewards are crates, 🎟️, 7 keepsakes, and Count Cuppula at rank 8.
- **Keepsakes** (`crossGame: true`) can be assigned to:
  - the character: +p to income
  - a line: +4p on that line
  - a manager: +4p on the line that manager runs

  p runs from 3% (Pumpkin Head) to 10% (Vampire Cape).

| Day (25 min/day inside, offline between) | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Rank | 3 | 4 | 5 | 6 | 7 | 8 (Cuppula) | 9 | 10 | 11 | 12 |

## 6. Save and offline (ARCH §5)

**Envelope**
- The envelope is v2: `{game:'il2', v:2, build, savedAt, simTime, seed, s}`.
- `MIGRATIONS[1]` lifts the scaffold's v1 saves: the `boost` array becomes a count, managers get slots, top-level age/gen/legacy fold into `life` and `family`, and items are normalised.
- On load, `normalize()` fills in every missing field, so older saves keep working.

**Store rules**
- A corrupt save is quarantined under the key `il2.quarantine.<savedAt>.<n>`. Then:
  - if `.bak` loads, the game uses it, with persistence `armed`;
  - otherwise persistence stays `armed` and nothing is written until `arm()` (the player has acted).
- A future version turns persistence `off`, and the game never writes.
- `.bak` rotates at most every 5 minutes, measured by `savedAt`.
- The store never overwrites a save it failed to load.

**Offline**
- Credit is the uncredited part of `[now − away, now]`. `clock.hi` is the end of the last credited interval, so:
  - resuming twice credits the interval once;
  - a clock moved back credits 0.
- Credit is then capped by the offline cap.
- The closed form per line: managed lines earn σ·P·t, the shelf fills by (1−σ)·P·t up to its cap, and unmanaged lines only fill their shelf. Dev Kai's line sells the whole P·t. Night-shift lines are weighted by the share of the interval that fell at night.
- Events never fire offline. Their timers are pushed forward instead.
- Kids keep working while you're away.
- If the gap is ≥ 60 s, return harvest is armed on every line with stock.
- The closed form matches 0.1 s ticking within 0.1% (tested).

## 7. Sim (tools/sim.mjs)

**Profiles.** All of them play the real game through `act()` and `tick()`, and buy greedily by `(wait + cost/Δincome) / novelty`.
- All of them are eager like a person: they unlock a line when it costs ≤ 30% of cash, and hire when it costs ≤ 50%.

| Profile | Taps | Piles | Events and couriers | Buying |
|---|---|---|---|---|
| **Active** | 2.5/s for the first 10 min, then 1.5/s | every 20 s | claims every event (Rush score 15, Lucky 3 hits) and tips every courier | decides every 2 s; uses every system |
| **Idle** | never | at each check-in | never | checks in every 60 s for the first 15 min, then every 3 min |
| **Typical** (P4) | 1/s for the first 10 min, then 0.5/s (no combo) | every 60 s | ignores them | decides every 5 s. Buys lines, levels, glyph upgrades and managers. Buys a home only when it costs ≤ 15% of cash. Ignores manager levels, items, storage, the supply link, night shift, and claiming contracts, dailies and the gift. Accepts the partner and the dog. |
| **Slow** (P4) | never | at each check-in | ignores them | idle check-ins every 2 min, then every 5 min, with the typical home rule and the same ignored systems. It runs for 4 hours and must be able to retire. |

**Probes.** Every 5 minutes, the active game's state is cloned twice and each clone plays one profile for 5 minutes with no buying. Earnings include the change in stock, so the comparison is fair. This is the "same-state income ratio".

**Audit.** Every 5 minutes, every available upgrade is applied to a cloned game with enough cash, and both the active and the idle profile's income is compared before and after. Live purchases of the active, idle and typical profiles are checked too.

**Contract-gate stall.** For every profile, the sim counts the seconds during which the next permit is affordable but blocked by contracts. It fails above 120 s in a row.

### Final run (2026-10-04, P4, seed 7, start Oct 5 09:00 local)

| Milestone | Target | Active | Idle-only | OK |
|---|---|---|---|---|
| First stand | 25–40 s | 0:24 | 0:24 | yes |
| Food Truck | ~1.5 min | 1:12 | 3:00 | yes |
| Suburbs | ~5 min | 3:18 | 10:00 | yes |
| Harbour | 15–20 min | 14:22 | 39:00 | yes |
| Downtown | 40–50 min | 43:18 | 78:00 | yes |
| Retire available | 45–60 min | 54:03 | 60:49 | yes |
| Retire recommended | 75–90 min | 69:44 | — | yes |

**Life beats** (checked for active and typical; retirement checked for typical; ±30%):

| Beat | Target | Active | Typical | Idle | Slow |
|---|---|---|---|---|---|
| Partner | 10–15 min | 11:12 | **12:28** | 14:00 | 26:00 |
| First kid | 25–35 min | 29:22 | **30:38** | 35:13 | 38:13 |
| Retire available | 60–90 min (typical) | 54:03 | **57:57** | 60:49 | 66:41 |

| Home (Bedsit → Mansion) | Active | Typical | Slow |
|---|---|---|---|
| Moves at | 1:46 · 11:10 · 27:12 · 39:56 · 52:36 | 2:48 · 12:23 · 28:28 · 41:13 · 55:43 | 8:00 · 21:00 · 36:00 · 66:00 · 86:00 |

- The typical player's money runs well behind the active bot: Suburbs 5:23, Harbour 26:38, Downtown 64:28, about $2e9/s at 45 min against the active bot's $1e12/s. Life beats no longer depend on money, so they still land on time.
- Before P4, the typical player had a partner at 28 min and a first kid at 69 min, and never retired within 95 min.
- The slow player reaches the age cap at about 100 min. Its kid still turns teen, because kids grow on XP.

Active line unlocks: 🍋0:00 🌮1:12 💈2:08 ☕3:22 🧽4:22 🐩8:38 🐟14:22 ⛴️23:00 ⛵30:34 👗43:18 🍝52:36 💻62:00

Same-state income ratio, active vs idle (limit 2.5):

| t (min) | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60 | 65 | 70 | 75 | 80 | 85 | 90 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ratio | 1.96 | 1.75 | 1.81 | 1.74 | 1.53 | 2.18 | 1.46 | 1.67 | 1.77 | 1.91 | 1.34 | 1.65 | 1.61 | 1.90 | 2.00 | 1.51 | 1.43 | 1.93 |

Before the probe was fixed to count stock, it read up to 3.3. That was the idle clone's uncollected pile, not real income.

**Other checks**

| Check | Result |
|---|---|
| Negative-return upgrades | **0** (audit plus live purchases) |
| Longest stretch with no new purchase type or beat (active, until retire recommended) | **3:44** |
| Longest stretch, idle profile | 6:00 (a 3-min check-in cadence quantises it) |
| Permit affordable but blocked by contracts | **0 s** for every profile |

**Generation 2**

| Check | Result |
|---|---|
| Retire at recommended (69:44) | +10 LP, income ×2.00 (the formula alone). Age 61, three kids (teen chef, two kids). |
| Gen 2 Suburbs / Harbour / Downtown | 0:32 / 4:54 / **13:32** (target ~15, ±30%) |
| Gen 2 retire available / recommended | 57:52 / 57:52 (was 28:11 / 39:07, see §8) |
| Gen 2 progress at the same session length | ×**1.73** the total line levels (target ~1.5, ±30%) |

### Falsification

| Arm | Result |
|---|---|
| `--plant-r1` (pile ×1.25, σ price ×1.0) | **256 negative-return checks** and FAIL. Every throughput upgrade and every manager hire loses money, exactly as DESIGN_CHALLENGE R1 predicted. |
| Correct build | 0 negative returns, PASS |
| Permit gate reverted to "claimed only" | The typical profile stalls 5006 s and the slow profile 13557 s with the permit affordable, and the sim FAILs. |

**Tests that mock the fix.** Each guard was reverted on its own, and the suite went red:

| Guard reverted | Test that fails |
|---|---|
| Never-overwrite in `save.write` | "future version … never writes" and "corrupt save is quarantined and never overwritten" |
| R1 values | "no upgrade has a negative return" and "pile tap pays ×1.0" |
| Double-credit guard (`clock.hi`) | "offline: … double resume credit nothing extra" |
| Tap cap (tapK 0.3) | "tapping is capped" |
| Return harvest not consumed | "return harvest pays ×1.5 once per away interval" |
| P4: kid age from capped parent age | "age cap never freezes kids", "fallback heir", "prestige" |
| P4: fallback heir disabled | "fallback heir …" |
| P4: permit counts claimed contracts only | "finished-but-unclaimed contracts count" and "every player can retire" |
| P4: `sigmaWalkIn` 0 | "the first stand earns from its first second" and "offline: unmanaged lines earn walk-in sales" |
| P4: home age gate removed | "life: partner at the Apartment …" |
| P4: courier contract restored, or courier daily ungated | "contracts never need a hidden mechanic" |
| P4: `advanceOffline` not invalidating `stats()` | "offline: unmanaged lines earn walk-in sales" (it read a stale shelf) |

After restoring each file, a byte compare confirmed it identical, and the suite is 41/41 green. The test loops that wait for a teen are now bounded, so a regression fails instead of hanging.

## 8. Known limits and judgment calls

- **Idle-only players progress about 2.5× slower in money** (Harbour at 39 min vs 14), even though the same-state income ratio is ≤ 2.18. This is compounding: half the income in an exponential economy means about twice the time, plus check-in lag. The design constraint is the income ratio, and it holds.
- **A life now lasts about an hour of play at any speed.** Age is mostly time played, so gen 2 retires at about 58 min (was 28), even though gen 2 reaches Downtown at 13:32. That is the price of life beats that land for every play style. If the manager wants faster later generations, scale `LIFE.xp.perMinute` by generation (for example ×1.5 from gen 2). That is a one-line change in `slowStep`.
- **Gen 2 Downtown** is 13:32, inside the ~15 ±30% band. The earlier ablation is still the reference for what drives it: the ×2 floor halves gen-2 times, then come managers and talent.
- **Typical retirement at 57:57** is just under the 60–90 band and inside its tolerance. Moving the teen threshold later would push active retirement past 60.
- **Bulk order** needs 40 s of the target line's output, and both normal sales and pile taps count toward it.
- **The sim's greedy strategy is part of the measurement.** A strong "save for the next unlock" weight produced 6–9 minute dead stretches late in the game, while a person would keep buying upgrades. The novelty weights (unlock 2, permit 3, housing 2) and the eagerness rules are documented in the sim.
- **Expected incomes:** ~$1e7/s at 15 min, ~$1e12/s at 45 min, ~$1e19/s at 90 min. `fmtNum` reaches Dc, so display has headroom.

# Idle Western 2: economy and state (lane E)

`js/state/` is pure: no DOM, no THREE, no real clock, no unseeded randomness. The wall clock comes in through `createGame({ nowWall })`, and every random draw is seeded. The tunables live in the pure `js/data/` files. `tools/sim.mjs` drives the real `createGame` to prove the pacing, and `tools/test-economy.mjs` holds 46 `node --test` cases, including the sim and both falsification arms.

| Command | What it does |
|---|---|
| `node tools/sim.mjs [--seed=N]` | Life 1 for the active, casual, typical and idle profiles (75 min). It runs the casual ceilings (§11), income-ratio probes, the negative-return audit (upgrades and gag links), dead gaps including construction, Deed stalls, then Fake Your Death plus gen 2. Exits 1 on any miss. |
| `node tools/sim.mjs --falsify-build` | Falsification arm 1: construction T ×10. **It must fail**, and it does (§11). |
| `node tools/sim.mjs --falsify-casual` | Falsification arm 2: no hustle floor, no "save for X" chip, first special at 5:00. **It must fail** the casual ceilings, and it does (Livery 3:40, special 5:20). |
| `node --test tools/test-economy.mjs` | Unit, construction, specials, prestige, season, game clock, next goal, offline, save and purity tests, plus all three sim arms. Takes about 2 s. |

## 0. API index (CONTRACT.md "Core state/bus API")

**`game`:**
- `state`, `simTime`, `data`, `tick(dt)`, `act(type, payload)`, `quote(type, p)`, `stats(lineId)`, `totals()`, `on(type, fn)`, `advanceOffline(sec)`, `serialize()`
- new: `goals()`, `deathPreview()`, `hatInfo()`, `special()`, `seasonInfo()`, `managerSlots(lv)`
- round 2: `nextGoal()` (§13), `day()` and `setDayClock(fn)` (§12), and `stats()` with no id → `{nextGoal, day, totals}`
- `createGame({ dayClock })` injects the renderer's clock at creation (§12)

**State fields beyond IL2:**
- Construction and the street: `build{}`, `own`, `hat`, `pomfrey`, `built[]`, `deeds[]`, `links{}`
- Currencies: `teeth`, `boxes{basic, silver, gold}`
- Prestige: `bounty`, `bountyFloor`, `gen`, `graves[]`, `disguise`, `allTime`
- Saloon and bootstrap: `saloon{held, next, last, piano}`, `bootstrap{done, hat, skip}`
- Collections: `items[]`, `keepsakes{}`, `contracts{}`, `achievements{}`
- Barks, season and flags: `barks{last, nextIdle, once}`, `season{ecto, xp, rank, ghost, live}`, `sunday`, `flags{}`

**Acts:**

| Area | Acts |
|---|---|
| Taps | `tap`, `hat`, `pile` (= `tapPile` with a `lineId`, otherwise banks the hat), `piano` |
| Building | `buy` (= `unlock`), `build:hurry` (= `hurry`) |
| Line upgrades | `level`, `glyph {lineId, kind: throughput \| boost \| storage}` (plus the IL2 `throughput`, `boost`, `storage`) |
| Managers and items | `hire`, `managerLevel`, `equip`, `unequip`, `merge`, `autoEquip`, `openBox` |
| Events and specials | `claimEvent` (= `event:claim`), `special:begin`, `duel:result`, `brawl:hit`, `robbery:hit` |
| Saloon and season | `fling {dir}`, `ghost:tap` |
| Progression | `permit` (= `deed`), `claimContract`, `prestige` (= `fakeDeath`), `assignKeepsake` |
| Settings | `sunday {on?}`, `barkOnce {id}`, `setting`, `hint` |
| Tip riders | `tapCourier`, `courierTap` |

**Bus (new):**

| Area | Events |
|---|---|
| Construction | `build:start {lineId, acq, T}`, `build:stage {lineId, stage, name}`, `build:hurry {lineId, left}`, `build:done {lineId, acq, offline}` (then `unlocked {lineId}`) |
| Hats and the street | `hat:promo`, `half_town`, `own {own, frontages}` |
| Progression | `deed {district, reopen}` (plus `district`), `prestige`, `beat {lineId?, sec, kind}` |
| Saloon and piano | `eject`, `fling`, `piano`, `piano:frenzy` |
| Specials | `special:wind`, `special:start`, `special:end`, `duel:result`, `brawl:hit`, `robbery:hit` |
| Currencies and rewards | `teeth`, `box`, `box:open`, `item`, `contract`, `achievement`, `link` |
| Season | `ghost:spawn`, `ghost:tap`, `ghost:gone`, `season` |
| Barks and settings | `bark {char, trig, prio}`, `sunday` |

The IL2 events (`tap`, `bought`, `milestone`, `tier`, `pileSold`, `harvest`, `event:*`, `courier:*`, `offline`, …) are unchanged. A mud tap is `tap {kind: 'mud', coin, hat, coins}`; a hurry or piano tap is `tap {kind: 'hurry' | 'piano', cash, …}`.

The line model, R1 pile/σ rulings, tap cap, walk-ins, return harvest, milestones, offline closed form and save envelope are Idle Life 2's, unchanged. The IL2 doc (`idle-life2/docs/ECONOMY.md` §1) is the reference for why each holds. This doc covers what is Western.

---

## 1. Businesses (W1)

**Business ids are stable.** Plots, saves and audio all key off them: `shine tubs livery saloon dentist garter undertaker jail bank`. The placeholder ids `stable` and `store` are gone (§10). A save holding unknown ids drops them on load.

| # | id | Business | Block | Acquired (W13) | T (s) | Unlock | $/s per Lv | Manager · trait |
|---|---|---|---|---|---|---|---|---|
| 1 | `shine` | 🥾 Spit & Shine | Lower Street | built | 6 | $50 | 1 | Lil' Nubbin · speed +10% |
| 2 | `tubs` | 🛁 Tuppenny Tubs | Lower Street | built | 8 | $120 | 3 | Pickles · offline +1 h |
| 3 | `livery` | 🐴 Hoof & Mouth Livery | Lower Street | built | 20 | $5.4K | 60 | Hortense · shelf ×1.5 |
| 4 | `saloon` | 🥃 The Thirsty Gizzard | Saloon Row | **poker** | 8 | $288K | 1.2K | Big Mabel · σ +10% |
| 5 | `dentist` | 💈 Pull & Pray | Saloon Row | built | 30 | $10.1M | 24K | Pliers Pete · every 50th customer drops 🦷 |
| 6 | `garter` | 🎀 The Velvet Garter | Saloon Row | built | 45 | $269M | 480K | Madame Lulu · event rewards ×1.5 |
| 7 | `undertaker` | ⚰️ Boot Hill Undertakers | Bank Block | **takeover** | 8 | $6.9B | 9.6M | Mortimer · duel rewards ×2 |
| 8 | `jail` | ⭐ Sheriff & Jail | Bank Block | **bought** | 8 | $173B | 192M | Wendell · +25% while no special runs |
| 9 | `bank` | 🏦 First & Last Bank | Bank Block | **bought** | 8 | $4.0T | 3.84B | Thrupp · levels −5% here |

- **Curve:** the IL2 `CURVE`, cut to 9 rows. Round 2 (PT#5) cut the early unlocks: `unlockPay` is `[50, 40, 90, 240, …]` (Tubs $360 → $150, and $120 with an 8 s build in R6, Livery $9K → $5.4K, Saloon $336K → $288K). Every glyph has its own themed name: the throughput and boost ladders are in `BUSINESSES[]`, for example `+🫙 Better spit`, `+🎹 Piano tuning (it never was)` and `+🤫 Discretion, extra`.
- **Garter:** in Sunday School mode the UI shows `line.sundayName` ("The Velvet Garter Dance Hall").
- **Deeds (permits):** Saloon Row costs 2 × the Saloon's unlock ($576K, was 3 × $336K). Bank Block costs 4 × the Undertaker's ($27.6B).
  - Each Deed also needs 3 of the previous block's 4 **Town Council Demands** (`data/contracts.js`) to be *finished*. They don't need to be claimed: buying the Deed claims them (the IL2 rule).
  - At most one demand per block needs tapping.
  - The sim measures 0 s of "Deed affordable but blocked" for every profile.
- **Gag links** (`LINKS`, DESIGN_CHALLENGE §5.1): Tubs→Saloon, Saloon→Pull & Pray and Garter→Bank.
  - Each is +5% to the receiver once both businesses are open and the giver is Lv 25. It fires `link`.
  - A link only ever adds, and the sim audits each one on and off.

## 2. Construction (W13)

```
buy → build[lineId] = { stage 0..4, t, T, acq } → (sign up) → lines[lineId].lv = 1
```

- **Paying starts the build.** The business earns nothing until its sign is up, and everything else keeps earning.
- **`acq: 'built'`:** 5 equal stages over T: `survey frame walls front sign` (`data/construction.js STAGES`).
- **`acq: 'poker' | 'takeover' | 'bought'`:** a single fixed-T cutscene. The stage stays at 0, and there are no stage events.
- **`acq: 'rebrand'`:** a business you have built in an earlier life comes back in **3 s**.
- **Ownership timing:**
  - The frontage counts as yours (`state.own`) from the purchase.
  - The hat counts **open** businesses only, so it changes when the sign goes up.
- **`build:hurry {lineId}`** takes 0.5 s off the build.
  - After the first business it is a **hustle tap** (same combo, crit and pay) and draws from the shared tap budget (§5). Hurrying is income-neutral, not a double dip.
  - During the very first build it is a mud tap.
- **Offline:** builds finish while you are away. The report lists `built: [ids]`, and each finished business earns the remainder of the away time through the closed form.

**Director cuts (W9).** A built business emits `beat {lineId, sec: 2.5, kind: 'build:frame' | 'build:sign'}` only at frame-up and sign-raise. Acquisitions and rebrands emit one `beat {lineId, sec: min(8, T), kind: acq}` at the start, so the cutscene can play.

## 3. Bootstrap (W15)

1. Before the first business opens, a tap is a **mud coin**: `+$2` into your upturned hat (`state.bootstrap.hat`), not into cash.
2. **`hat`** (or `pile` with no `lineId`) banks the hat. Buying also banks it automatically when the hat makes the difference: `quote('buy')` counts cash + hat until the first business is open.
3. 25 coins buy Spit & Shine for $50. Nubbin builds it in 6 s.
4. The first business opening sets `bootstrap.done`. From then on taps are hustle taps, and the first Golden Tumbleweed arrives about 25 s later (around 1:00).
5. The opening bark (`opening`, Mabel/Pomfrey/Nubbin) fires on the first tick of a new game.
6. **Gen 2+ skips the mud (PT#8).** Fake Your Death sets `bootstrap.skip = true` (saved). `done` stays false until the first business opens, so the event schedule still starts there, but a pre-business tap now pays `+$2` straight into cash (`tap {kind: 'coin', cash}`, `delta.cash`) and the hat stays empty. The UI should treat `bootstrapping` as `!done && !skip`: no mud hint, no hat chip. Starter cash (≥ $50) already buys Spit & Shine, which comes back as a 3 s rebrand.

## 4. Hats and frontages (W3/W14, `data/hats.js`)

| Open businesses | 0 | 1 | 3 | 5 | 6 | 7 | 8 | 9 (Half the Town) |
|---|---|---|---|---|---|---|---|---|
| `state.hat` | 0 Squashed Derby | 1 Bowler | 2 Stetson | 3 Ten-Gallon | 4 Twenty-Gallon | 5 Fifty-Gallon | 6 Seventy-Gallon | 7 Hundred-Gallon |
| Income | ×1 | ×1.05 | ×1.10 | ×1.16 | ×1.22 | ×1.28 | ×1.34 | ×1.50 |
| `state.pomfrey` | 7 Two-Hundred-Gallon | 6 | 5 | 4 | 3 | 2 | 1 Bowler | **0 Thimble** |

- `HATS[i].scale` and `POMFREY_HATS[i].scale` are size hints for the render lane.
- A promotion fires `hat:promo {tier, hat, pomfrey, pomfreyHat}` and `beat {sec: 3, kind: 'hat'}`.
- At 9 of 9: `half_town`.
- `FRONTAGES` lists the 18 frontages (9 line, 7 Pomfrey's, 2 civic) with ids and names. The street *layout* is lane A's `data/plots.js`.

## 5. Taps, piano, ejections (W6/W11)

**Tap budget.** Street (`tap`), construction (`build:hurry`) and piano (`piano`) taps share one bucket: 8 taps/s with a burst of 10 (`ECON.tapRate` / `tapBurst`).
- **Hustle floor (round 2).** A hustle tap is worth `max(tapK · gross, tapFloor)` with `tapFloor` $1, half a mud coin. Before round 2 the first business dropped a tap from $2 (mud) to $0.12, and the playtester felt that cliff ($0.3/s). The floor stops mattering once gross passes $8.3/s, about 1:30 in, so it never touches the active/idle probes.
- A capped tap returns `{ok: true, capped: true, delta: {cash: 0}}`.
- Mud taps are exempt.
- The IL2 proof still holds: at 2.5 taps/s on full combo, tapping is worth ≤ 1× gross (asserted).

**Piano (`piano`).** Tappable from second 1. It returns `{tempo 1–1.6, wrong, frenzy, brawl}` and emits `piano {n, tempo, wrong, frenzy}`.
- **Phrase:** the audio layer chooses it (no repeat among the last 6).
- **Wrong note:** 5%.
- **Frenzy:** 8 taps within 6 s emits `piano:frenzy {brawl}`. `brawl: true` (an ambient ejection on the beat) happens at most once per 2 minutes.
- **Money:** only once the Saloon is open, as a hustle tap under the budget.

**Ejections.** These run once the Thirsty Gizzard is open.
- Every 25–45 s, shrinking ×(1 − 0.06 per saloon milestone) to a floor of ×0.55, Mabel holds a drunk: `state.saloon.held = {id, kind, born, until}` and the bus gets `eject {id, kind, holdSec 2.2, level}`.
- Kinds escalate with the saloon's level: drunk and cowboy, then cardsharp at Lv 10, dentist at 25, goat and sheriff at 50, pianist at 100.
- **`fling {dir}`:** `dir` is `left | right | down | up`, or a target id directly.

| dir | target | bonus | effect |
|---|---|---|---|
| left | `trough` | 2 s income | splash |
| right | `dentist` | 1 s | Pull & Pray ×1.5 for 20 s (refreshes, never stacks) |
| down | `jail` | 1 s | Jail ×1.5 for 20 s |
| up | `pomfrey` | 1 s | 25% chance of 🦷 1 |

- If nobody flings within `holdSec`, Mabel throws him herself: `fling {target, auto: true, cash: 0}`. The target comes from the landing table `trough haycart dentist jail pomfrey`, never one of the last 2. Nothing is ever lost.
- The bonuses are deliberately small. At ×2 / 30 s the dentist and jail effects pushed the active/idle ratio to 2.99.

## 6. Events and specials (W8/W9, `data/events.js`)

| Event | Cadence | Verb | Reward |
|---|---|---|---|
| 🌵 Golden Tumbleweed (`tumbleweed`) | 90–180 s, first ~25 s after opening | `claimEvent` | 15 s income (was 20). 10% jackpot: ×3 plus 🦷 1 |
| 🤠 High Noon Duel (`duel`) | special, weight 3 | `special:begin` → `duel:result {ms}` or `{early: true}` | Gold < 380 ms, Silver < 550 ms, otherwise Basic. Early (shot your own boot) is Basic. Strongbox of that tier, 10 s income, Undertaker ×2 for 60 s. Mortimer: 2 boxes and ×2 cash |
| 🍺 Bar Brawl (`brawl`, needs the Saloon) | special, weight 2 | `special:begin` → `brawl:hit` ×≤7 | 4 s income per hit; 5+ hits gives a Silver box; Pull & Pray and Jail ×2 for 30 s |
| 💰 Bank Robbery (`robbery`, needs the Bank) | special, weight 2 | `special:begin` → `robbery:hit` ×≤24 | score/24 × 30 s income. 16+ Gold, 9+ Silver, otherwise Basic. **Bart caught** (9+) pays 🦷 2 |
| 🐎 Stagecoach (`stagecoach`) | special, weight 2 | `claimEvent {lineId?}` | that business ×3 for 30 s (was ×4) |

**Specials** are ≥ 8 min apart (`SPECIAL_GAP` 480–600 s). The first is 240 s after opening (was 300: about 4:20 for a casual player), and the first time the Saloon opens there is a scripted Bar Brawl.

**Tip riders** (`COURIER`) pay 4 s of income (was 6).

**Lifecycle (W9):**
1. **Spawn.** The event enters `events.active` with `special: true, phase: 'wind'`, and the bus gets `event:spawn` + `special:wind {kind, event}` (bell chip). The UI/render decide when the hero is visible.
2. **Begin.** The UI calls `special:begin {id}`. Then `phase: 'live'`, `liveUntil = now + game.sec`, and the bus gets `special:start`.
3. **Settle.**
   - The verb (`duel:result`, max hits, or `claimEvent {eventId, score}`) settles it at once.
   - A live special that times out settles with the hits so far; an untouched live duel pays Basic.
   - Either way the bus gets `event:claim` + `special:end {kind, event, reward}`.
4. **Expire.** Never begun, the special expires after `lifeSec`: `event:expire` + `special:end {expired: true}`. Nothing is paid and nothing is lost.

`game.special()` returns the pending or live special.

**Back-compat.** `claimEvent` on a special in wind-up settles it at Basic, so the current UI chip still works.

**Ambient duels** (no reward, between real specials) and ambient gags are render-only: the state emits nothing for them.

**Art keys.** Events carry the art keys `tumbleweed duel brawl robbery stagecoach`. `eventart.js` falls back to a parcel for unknown keys until lane S adds them.

## 7. Managers, items, teeth, strongboxes, demands, achievements

- **Managers:** one per business (traits in §1), levels 1–5 (`MANAGER_LEVELS`).
  - Each level costs hire cost × `[20, 200, 2K, 20K]` plus 🦷 `[2, 4, 7, 10]`.
  - Income multipliers are ×1 / 1.1 / 1.2 / 1.3 / 1.4, with slots 1-1-2-2-2.
  - Acts: `hire`, `managerLevel {managerId}`.
- **Items** (`data/items.js`): 🤠 Big Hat (σ), 🥾 Jingle Spurs (speed), 🦷 Gold Tooth (price), 👜 Saddlebags (shelf), 🧲 Lucky Horseshoe (crit, capped at 15%), ⌚ Pocket Watch (offline).
  - Rarities common, rare and epic.
  - Acts: `equip {itemId, managerId}`, `unequip`, `merge {itemId}` (3 of a kind and rarity make 1 of the next) and `autoEquip {managerId?}`.
- **Gold teeth 🦷 (`state.teeth`)**
  - Sources: tumbleweed jackpots, Pliers Pete (also offline), Pomfrey-window flings, Bart caught, demands, season ranks.
  - Sink: manager levels.
  - Emits `teeth {n, total, source}`.
- **Strongboxes (`state.boxes = {basic, silver, gold}`)** are granted unopened (`box {kind, n, source}`). `openBox {kind}` rolls the items (`box:open {kind, items}`, `item`).
- **Town Council Demands:** `game.goals().contracts` (with `p`, `done`, `claimed`, `visible`), act `claimContract {id}`. They are kept across lives.
- **Achievements:** 29 of them (`data/achievements.js`), +1% income each. They include **Fingers' Apprentice** (100 piano taps), Window Shopper, Shot Myself in the Boot, Bart Again and Thimble. Pickles spotting is v1.1.

## 8. Barks (W5): what the state does, and what the audio layer does

The state emits **`bark {char, trig, prio}`**. `trig` is from the AUDIO.md trigger vocabulary. `char` is picked, weighted by line counts from `data/barks.js BARK_CHARS`, among the characters who are present: business owners only once their business is open; Pickles, Pomfrey, Fingers, Bart and the Mulligans are always about.

**The state handles:**
- **The global sentence gate.** An ordinary trigger is dropped if any sentence bark fired in the last 30 s (`BARK_GATE.gap`). Priority triggers always speak, but not within 4 s of another (`BARK_PRIORITY`): opening, first_business, acquire_*, deed, half_town, hat_promo, hat_thimble, fake_death, duel_win, duel_boot, robbery_caught, offline_return.
- **Idle chatter cadence.** An `idle` bark every 30–45 s when nothing else has spoken.
- **Persistence of once-ever lines.** When the audio layer plays a `once` line it calls `barkOnce {id}`, and the state keeps `state.barks.once[id]`.

**The audio/UI layer handles:**
- picking the line;
- the 10-minute no-repeat;
- skipping lines already in `state.barks.once`;
- Sunday School filtering (`state.sunday`);
- one bubble at a time and queueing a priority bark behind it;
- the **wordless layer** (grunts, hics and yelps on any `eject`, `fling`, `brawl:hit`, … with a ~3 s cap);
- **character taps** with their 20 s per-character cooldown (no act: a tap pays nothing, per W7).

**Triggers emitted:**
- **Building:** `build` (a build starts), `hurry`, `sign_raise`, `acquire_<saloon|undertaker|jail|bank|garter>`, `first_business`.
- **Saloon and piano:** `eject`, `fling_<target>`, `piano`, `frenzy`, `wrong_note`.
- **Specials:** `duel`, `brawl`, `robbery` and `stagecoach` at wind-up; `duel_win`, `duel_boot`, `robbery_crash`, `robbery_caught`.
- **Progression:** `deed`, `hat_promo`, `hat_thimble`, `half_town`, `levelup` (Lv 25/50/100), `link`, `strongbox`, `fake_death`.
- **Ambient and season:** `ghost`, `offline_return` (≥ 10 min away), `opening`, `idle`.
- **Not emitted by the state:** `pickles_spot` (v1.1), `garter_window` and `pomfrey_pass` (render ambient gags may emit them on the UI bus).

## 9. Prestige: Fake Your Death (W2)

- **Available** once Bank Block is open and Boot Hill Undertakers is yours (`quote('prestige')` and `game.deathPreview()` → `{available, bounty, total, nextMult, recommended, starterCash, needs[]}`).
- **Bounty:** `B = floor(10 · (allTime / 5e15)^0.15)` over the whole career, +10% income per point (IL2 legacy points).
  - The first fake death is always worth at least ×2.
  - It is "recommended" when the raw gain is ≥ +100%.
  - Starter cash is max($50, 100·B).
- **Act `prestige` (alias `fakeDeath`)** emits `prestige {gen, bounty, total, mult, grave, disguise, starterCash}`, `beat {sec: 8, kind: 'prestige'}` and the `fake_death` bark.
- **The grave and the new disguise:**
  - A grave is `{gen, name, epitaph, bounty, hat, allTime}`, +1% income each.
  - The epitaph is seeded and pure (`state/prestige.js epitaphFor`, `data/epitaphs.js`), for example "Here lies Slim Quill. Wasn't."
  - The new disguise is `state.disguise = {name, moustache, specs}` (`disguiseFor`), for the Wanted poster.
- **Persists:** allTime, teeth, boxes, bounty, graves, built (for rebrands), deeds (they reopen free), managers with levels and items (unassigned), demands, achievements, keepsakes, season, settings, Sunday School, stats, bark once-ids.
- **Resets:** cash, businesses, builds, hat (and Pomfrey's goes back to huge), links, events, saloon, flags.

## 10. Ghost Town (W12, `data/season.js`)

- **Live** from Oct 1 to Nov 2, read off the local date of `nowWall()`. `state.season = {id, year, ecto, xp, rank, ghost, nextGhost, live}` always exists.
- **Ghosts (R6c).** Nothing spawns until the Ghosts reveal: a second Deed, a grave, or 10 min of `simTime` (`SEASON.revealSec`), after the first business opens. The rule is sticky (`flags.ghostsOpen`) and exposed as `game.ghostsOpen()` and `seasonInfo().open`, so the tab and the spawns share it. Once open, a ghost drifts in every 20–40 s and lives 9 s:
  - spawn: `ghost:spawn {ghost}`;
  - `ghost:tap {id}` pays 👻 1: `ghost:tap {ghost, ecto, total}`;
  - otherwise it leaves: `ghost:gone`.
- **Ranks.** 8 ranks at 5 / 15 / 30 / 50 / 80 / 120 / 170 / 240 ecto. Each grants a keepsake hat (`state.keepsakes`, worn by You by default; `assignKeepsake {keepsakeId, target}`) plus a box or teeth. Rank 8 brings **Headless Hank** (`m_hank`): an alternate Undertaker manager, +50% during game night (§12) and offline +2 h, hired free.
- **Witching Hour** (§12): in the first half of game night ghosts come twice as often and pay 👻 2.
- **Cutting it.** If W12's 20 Oct deadline is missed, the manager removes `season` from `DEFAULT_DATA` (state then never goes live).

## 11. Pacing (sim, seed 7)

Life 1, with targets scaled to a ~60 min first run (±30%, the IL2 method). Round 2 moved the first three active windows earlier, because the beat sheet's times now belong to the casual player.

| Beat | Target (active) | Active | Casual | Typical | Idle |
|---|---|---|---|---|---|
| Spit & Shine open | 0:25–0:45 | 0:27 | 0:20 | 0:33 | 0:29 |
| Tuppenny Tubs open | 0:45–1:30 (casual ≤ 1:30) | 0:57 | **0:56** | 1:36 | 3:08 |
| Livery open | 1:30–3:00 (casual ≤ 3:00) | 1:49 | **2:20** | 3:03 | 5:20 |
| Saloon Row Deed | 3:00–6:00 (casual ≤ 7:00) | 3:14 | **4:09** | 4:43 | 10:00 |
| First special (wind-up) | casual ≤ 5:00 | 3:25 (scripted brawl) | **4:20** | 4:34 | 4:30 |
| Velvet Garter open | 9:00–13:00 | 7:30 | 16:10 | 14:13 | 21:45 |
| Bank Block Deed (= Fake Your Death available) | 20:00–27:00 | 16:46 | 41:26 | 32:28 | 45:00 |
| Bank open | 28:00–40:00 | 34:48 | — | 61:36 | — |
| **Fake Your Death recommended** | 55:00–70:00 | **62:12** | — | — | — |

The first tumbleweed lands at 0:45–0:58 for every profile.

**Profiles:**
- **Active:** 2.5 taps/s (1.5 after 10 min), hurries builds, plays every event, flings every drunk, and shops by payback every 2 s.
- **Casual (PT#5)** is modelled on the playtester:
  - taps in bursts while looking (2.2/s for 9 s of every 20 s, about 1/s);
  - buys the next business or Deed the moment it is lit, follows the "save for X" chip and the best-buy glow (§13), and otherwise buys the first lit glyph (hire, level ×1, staff, boost, newest card first);
  - never hurries a build;
  - sells a pile when it looks full-ish (30% of the shelf, or 60 s of gross);
  - catches 75% of events and plays specials so-so (silver duel, 4 brawl hits);
  - flings half the drunks;
  - opens the sheets (demands, boxes, auto-equip) every 2.5 min.
- **Typical:** 1 tap/s, shops every 5 s, no events.
- **Idle:** checks in every 3 min (every minute for the first 15).

**Casual ceilings** (gated) across seeds 1/2/3/5/7/9/11/21/33/42:
- Tubs 0:56–1:00;
- Livery 2:20–2:35;
- Saloon Row Deed 4:09–4:26;

**R6 Tubs nudge.** PLAYTEST_2's CDP casual bot bought Tubs at 1:27 and opened it at 1:41, ~38 s behind this sim (it spends taps on the hero, ghosts and the piano). Tubs went $150 → $120 and its build 15 s → 8 s: sim casual 1:03 → 0:56, which should put the bot near 1:25. All other gates and the active/idle ratio (max 2.11) hold.
- first special 4:20.

The casual mid-game is reported, not gated: Garter ~16 min, Fake Your Death available ~42 min (typical ~33). The casual player still buys the first lit glyph whenever there is nothing to save for. Without the best-buy glow (the playtester's raw "first lit glyph" habit) every ceiling still passes, with the Deed at 6:10–6:52. That margin is thin, so U's best-buy glow is worth having.

**What round 2 changed (PT#5):**
- Tubs $150, Livery $5.4K and the Saloon $288K, with the Saloon Row Deed at 2×.
- The hustle floor of $1.
- The first special 240 s after opening.
- The honest "save for X" signal (§13).
- To pay for the faster early game in the active/idle ratio: the tumbleweed pays 15 s, tip riders 4 s and the stagecoach ×3 (was ×4). Tip riders plus tumbleweed jackpots were up to 30% of an active probe window. A ×4 stagecoach on the line carrying 87% of gross (the Jail at 55 min) was worth 90 s of income, and those two caused the 2.4–2.6 spikes.
- `tapK` stays at 0.12. Cutting it as well as the tip pushed gen 2 under ×1.35.

**Dead gap (active, until recommended):** 3:32, limit 4:00. Across the ten seeds it runs 2:58–3:40.
- It counts openings (the sign up, not the purchase), Deeds, hat promotions, specials, links, demands and the first purchase of each upgrade step. Construction stages are **not** beats.
- Longest build wait: active 0:20; casual, typical and idle 0:45 (they never hurry). Limit 4:00.

**Active/idle same-state probes** (5-min windows, no buying): max 2.02, limit 2.5.
- Across the ten seeds the max is 2.02–2.29, against 2.23–2.48 before round 2.

**Negative returns:** 0. That covers every upgrade on a clone of the real game every 5 min for both profiles, plus every gag link forced on vs off.

**Gen 2** (fake death at the recommended mark: +10 Bounty, ×2):
- the Garter opens at 2:01 and the Bank at 11:12 (target ≤ 15 min);
- at 40:00, gen 2 is ×1.49 further in total levels than gen 1 (×1.33–1.57 across seeds, against ×1.48–1.56 before; the gate is ×1.3).
- The level count is bimodal (~850 or ~980): it depends on whether one big milestone buy lands before 40:00. Gen 1 got faster, so the margin shrank.

**Falsification arm 1 (`--falsify-build`, construction T ×10). It FAILS, as it must:**
- casual, typical and idle wait 7:30 on the Garter build (limit 4:00);
- the early openings miss their windows.

The active novelty gap alone does *not* catch it, because an active player hurries and keeps buying upgrades elsewhere. That is why the build-wait half of the dead-gap check exists, and it is applied to every profile.

**Falsification arm 2 (`--falsify-casual`): no hustle floor, `saveSec` 0 and the first special at 300 s. It FAILS, as it must:** casual Livery 3:40 and first special 5:20.

test-economy runs all three arms.

## 12. Game clock (W18, lane A's `data/clock.js`, `state/dayclock.js`, `data/day.js`)

Night is a property of game time, not the phone's clock. There is **one clock**: lane A's pure `gameClock(sec)` (`data/clock.js`).
- **Cycle:** 1200 s. Golden, dusk, night (25%), dawn, day.
- **Boot:** a fresh save boots in golden hour.
- **Input:** it is fed `game.simTime`, which is saved and advances offline.

`state/dayclock.js dayAt(sec, DAY)` wraps the clock for the economy. It returns `{phase, hour, f, night, golden, p01 (through the night), witching, cycleSec}`.

`game.day()` is the economy's reading. It uses `dayAt(simTime)` unless a clock is injected:
- inject with `createGame({ dayClock })` or `game.setDayClock(fn | null)`;
- `fn()` may return a `gameClock`-shaped object, `{phase}`, `{night}`, or a 0–24 hour.

Since A and E use the same function on the same `simTime`, no injection is needed. The hook exists in case the renderer ever runs its own time.

**What reads night:**
- **Headless Hank:** +50% at night.
- **Witching Hour:** the first half of night (`DAY.witching` 0.5). In the season, the ghost gap is ×0.5 and a ghost pays 👻 ×2.
- **The UI's night music cue** should use `game.day().night` (or `gameClock(game.simTime).night`) in place of `new Date().getHours()` (U, `app.js`).

**Offline.** The closed form gives Hank the average night share (25%) over the away interval. A test caught a NaN here, so it is tested.

**The season window** still uses the real date (`nowWall`).

## 13. Next goal and "save for X" (PT#5, for U)

`game.nextGoal()` (also `game.stats().nextGoal`) returns `null` once everything is open. Otherwise it returns:

```
{ kind: 'line' | 'deed', id, lineId? | districtId?, name, emoji, cost, have, p01, affordable,
  eta,        // s at current gross (piles get sold); null before the first business
  etaIdle,    // s at walk-in income only
  blocked,    // Deed: 'Finish 3 Lower Street demands' etc.
  hint,       // 'buy' | 'save' | 'grind' | 'blocked'
  save,       // what to stop spending for now: {kind:'goal', id, cost, eta} | {kind:'upgrade', act, lineId, qty, cost, eta} | null
  bestBuy }   // {act, lineId, qty?, cost, gain, payback, affordable}: the shortest-payback upgrade, for a glow
```

**The goal** is the next business in street order (counting cash plus the mud hat before the first business), else the next Deed.

**Hints:**
- `'save'` only when the goal is ≤ `ECON.saveSec` (60 s) away **and** no upgrade would get you there sooner. An upgrade beats saving when `cost · gross < gain · left`, so the chip never tells you to save while a cheap milestone would get you there faster.
- `save.kind === 'upgrade'` is a best buy that is ≤ `saveBestSec` (30 s) away.

**Suggested UI:**
- `buy`: the goal card glows "Buy it!".
- `save`: a chip "Save for the Tubs · 0:25" on the goal.
- `save.kind === 'upgrade'`: a "best buy, nearly there" glint on that glyph.
- `bestBuy.affordable`: the "best buy" glow.
- `blocked`: link to Demands.

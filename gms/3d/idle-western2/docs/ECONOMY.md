# Idle Western 2: economy and state (lane E)

`js/state/` is pure: no DOM, no THREE, no real clock, no unseeded randomness. The wall clock comes in through `createGame({ nowWall })`, and every random draw is seeded. The tunables live in the pure `js/data/` files. `tools/sim.mjs` drives the real `createGame` to prove the pacing, and `tools/test-economy.mjs` holds 41 `node --test` cases, including the sim and its falsification arm.

| Command | What it does |
|---|---|
| `node tools/sim.mjs` | Life 1 for the active, typical and idle profiles (75 min). It runs income-ratio probes, the negative-return audit (upgrades and gag links), dead gaps including construction, Deed stalls, then Fake Your Death plus gen 2. Exits 1 on any miss. |
| `node tools/sim.mjs --falsify-build` | The falsification arm: construction T ×10. **It must fail**, and it does (§9). |
| `node --test tools/test-economy.mjs` | Unit, construction, specials, prestige, season, offline, save and purity tests, plus both sim arms. Takes about 15 s. |

## 0. API index (CONTRACT.md "Core state/bus API")

**`game`:**
- `state`, `simTime`, `data`, `tick(dt)`, `act(type, payload)`, `quote(type, p)`, `stats(lineId)`, `totals()`, `on(type, fn)`, `advanceOffline(sec)`, `serialize()`
- new: `goals()`, `deathPreview()`, `hatInfo()`, `special()`, `seasonInfo()`, `managerSlots(lv)`

**State fields beyond IL2:**
- Construction and the street: `build{}`, `own`, `hat`, `pomfrey`, `built[]`, `deeds[]`, `links{}`
- Currencies: `teeth`, `boxes{basic, silver, gold}`
- Prestige: `bounty`, `bountyFloor`, `gen`, `graves[]`, `disguise`, `allTime`
- Saloon and bootstrap: `saloon{held, next, last, piano}`, `bootstrap{done, hat}`
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
| 2 | `tubs` | 🛁 Tuppenny Tubs | Lower Street | built | 15 | $360 | 3 | Pickles · offline +1 h |
| 3 | `livery` | 🐴 Hoof & Mouth Livery | Lower Street | built | 20 | $9K | 60 | Hortense · shelf ×1.5 |
| 4 | `saloon` | 🥃 The Thirsty Gizzard | Saloon Row | **poker** | 8 | $336K | 1.2K | Big Mabel · σ +10% |
| 5 | `dentist` | 💈 Pull & Pray | Saloon Row | built | 30 | $10.1M | 24K | Pliers Pete · every 50th customer drops 🦷 |
| 6 | `garter` | 🎀 The Velvet Garter | Saloon Row | built | 45 | $269M | 480K | Madame Lulu · event rewards ×1.5 |
| 7 | `undertaker` | ⚰️ Boot Hill Undertakers | Bank Block | **takeover** | 8 | $6.9B | 9.6M | Mortimer · duel rewards ×2 |
| 8 | `jail` | ⭐ Sheriff & Jail | Bank Block | **bought** | 8 | $173B | 192M | Wendell · +25% while no special runs |
| 9 | `bank` | 🏦 First & Last Bank | Bank Block | **bought** | 8 | $4.0T | 3.84B | Thrupp · levels −5% here |

- **Curve:** the IL2 `CURVE`, cut to 9 rows, with Tubs' unlock at 120 U. Every glyph has its own themed name: the throughput and boost ladders are in `BUSINESSES[]`, for example `+🫙 Better spit`, `+🎹 Piano tuning (it never was)` and `+🤫 Discretion, extra`.
- **Garter:** in Sunday School mode the UI shows `line.sundayName` ("The Velvet Garter Dance Hall").
- **Deeds (permits):** Saloon Row costs 3 × the Saloon's unlock ($1.0M). Bank Block costs 4 × the Undertaker's ($27.6B).
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
| 🌵 Golden Tumbleweed (`tumbleweed`) | 90–180 s, first ~25 s after opening | `claimEvent` | 20 s income. 10% jackpot: ×3 plus 🦷 1 |
| 🤠 High Noon Duel (`duel`) | special, weight 3 | `special:begin` → `duel:result {ms}` or `{early: true}` | Gold < 380 ms, Silver < 550 ms, otherwise Basic. Early (shot your own boot) is Basic. Strongbox of that tier, 10 s income, Undertaker ×2 for 60 s. Mortimer: 2 boxes and ×2 cash |
| 🍺 Bar Brawl (`brawl`, needs the Saloon) | special, weight 2 | `special:begin` → `brawl:hit` ×≤7 | 4 s income per hit; 5+ hits gives a Silver box; Pull & Pray and Jail ×2 for 30 s |
| 💰 Bank Robbery (`robbery`, needs the Bank) | special, weight 2 | `special:begin` → `robbery:hit` ×≤24 | score/24 × 30 s income. 16+ Gold, 9+ Silver, otherwise Basic. **Bart caught** (9+) pays 🦷 2 |
| 🐎 Stagecoach (`stagecoach`) | special, weight 2 | `claimEvent {lineId?}` | that business ×4 for 30 s |

**Specials** are ≥ 8 min apart (`SPECIAL_GAP` 480–600 s). The first is 300 s after opening, and the first time the Saloon opens there is a scripted Bar Brawl.

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
- **Ghosts.** After the first business opens, a ghost drifts in every 20–40 s and lives 9 s:
  - spawn: `ghost:spawn {ghost}`;
  - `ghost:tap {id}` pays 👻 1: `ghost:tap {ghost, ecto, total}`;
  - otherwise it leaves: `ghost:gone`.
- **Ranks.** 8 ranks at 5 / 15 / 30 / 50 / 80 / 120 / 170 / 240 ecto. Each grants a keepsake hat (`state.keepsakes`, worn by You by default; `assignKeepsake {keepsakeId, target}`) plus a box or teeth. Rank 8 brings **Headless Hank** (`m_hank`): an alternate Undertaker manager, +50% from 18:00 to 06:00 and offline +2 h, hired free.
- **Cutting it.** If W12's 20 Oct deadline is missed, the manager removes `season` from `DEFAULT_DATA` (state then never goes live).

## 11. Pacing (sim, seed 7)

Life 1, with targets scaled to a ~60 min first run (±30%, the IL2 method):

| Beat | Target | Active | Typical | Idle |
|---|---|---|---|---|
| Spit & Shine open | 0:25–0:45 | 0:27 | 0:33 | 0:29 |
| Tuppenny Tubs open | 1:00–1:45 | 1:10 | 2:13 | 3:15 |
| Livery open | 2:00–3:30 | 1:59 | 3:28 | 6:20 |
| Saloon Row Deed | 4:30–7:00 | 3:32 | 5:53 | 10:00 |
| Velvet Garter open | 9:00–13:00 | 8:28 | 15:58 | 24:45 |
| Bank Block Deed (= Fake Your Death available) | 20:00–27:00 | 17:48 | 34:53 | 48:00 |
| Bank open | 28:00–40:00 | 34:36 | 64:06 | — |
| **Fake Your Death recommended** | 55:00–70:00 | **59:33** | — | — |

- **Dead gap (active, until recommended):** 3:34, limit 4:00.
  - It counts openings (the sign up, not the purchase), Deeds, hat promotions, specials, links, demands and the first purchase of each upgrade step. Construction stages are **not** beats.
  - Longest build wait: active 0:20, typical and idle 0:45 (they never hurry), limit 4:00.
- **Active/idle same-state probes** (5-min windows, no buying): max 2.31, limit 2.5. Seeds 3/5/9/11/21 give 2.45 / 2.48 / 2.35 / 2.23 / 2.36.
- **Negative returns:** 0. That covers every upgrade on a clone of the real game every 5 min for both profiles, plus every gag link forced on vs off.
- **Gen 2** (fake death at the recommended mark: +10 Bounty, ×2):
  - the Garter opens at 2:37 and the Bank at 10:26 (target ≤ 15 min);
  - at 40:00, gen 2 is ×1.54 further in total levels than gen 1.
- **The typical profile** (1 tap/s, buying every 5 s, no events) runs about 2× slower: Bank at 64 min. That is reported, not failed.

**Falsification (`--falsify-build`, construction T ×10). It FAILS, as it must:**
- typical and idle wait 7:30 on the Garter build (limit 4:00);
- the first two openings miss their windows.

The active novelty gap alone does *not* catch it, because an active player hurries and keeps buying upgrades elsewhere. That is why the build-wait half of the dead-gap check exists, and it is applied to every profile. test-economy runs both arms.

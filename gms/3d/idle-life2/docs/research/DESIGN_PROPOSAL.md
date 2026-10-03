# Idle Life 2: design proposal (P0-A)

Lead game designer proposal, 2026-10-03. Input for the manager's `docs/DESIGN.md`.
Sources: Aaron's brief in `docs/MANAGER_STATE.md`, Idle Life 1 `gms/pwa/idleLife/js/config.js`, rival `gms/3d/idle-transport2/` (README + docs/ECONOMY.md).

---

## 0. The pitch in one paragraph

You are a person, not a company. You start on a park bench in Old Town with nothing but your hands. You tap to hustle, buy a lemonade stand, and build a life: businesses whose little 3D dioramas you can watch working, a home that visibly grows from bench to orbital villa, an education, a partner, kids and a dog who trots behind you. As you get rich you get older. Your hair greys. When you are ready, you **retire and pass everything to your heir**, who starts again at 18 with an inheritance, a family trait and an heirloom from you. The family portrait wall grows every generation. It's AdVenture Capitalist's number-go-up, Idle Miner's visible bottleneck, Cookie Clicker's golden surprises and Egg Inc's "my thing is visibly getting bigger", all wrapped around one thing transport can't offer: **a life story.**

### Why this beats Idle Transport 2 (the rival)

| Area | Idle Transport 2 | Idle Life 2 |
|---|---|---|
| Who you are | A faceless company | A visible character who ages, moves house, marries, has kids and pets, and retires |
| Output stock | Admittedly "a visualisation, not a separately simulated commodity" (their ECONOMY.md) | **Real stock**: production vs sales throughput is a simulated bottleneck. Piles really fill, really block and are really worth tapping |
| Lines | 15 routes, all "truck drives A→B" | 20 businesses, each with a **different** activity loop (pouring, cutting, washing, frying, filming, mining) |
| Prestige | sqrt reputation, +15% fares | **Inheritance**: Legacy points, a chosen heir with a trait, heirlooms, family tree. The reset is a story beat, not a menu |
| Managers | Levels 0–5, 1–3 tool slots | 20 named characters with traits, levels 1–10, 3 slots, 16 items × 5 rarities, merge-up crafting |
| Seasonal | 8-minute Halloween run, Oct 15 – Nov 2 (**not live today**) | Multi-day **Hollow's Eve** side town, **live now** (Oct 1 – Nov 2), 25 ranks, a seasonal manager, costume and business skin. A full calendar after it |
| Research | 8 flat research nodes | **Education**: real-time study courses on a 3-branch tree (Melvor-style timers you plan around) |
| Events | 3 claim-for-cash pop-ups | 10 events, including tappable golden pigeons, celebrity visits, bulk orders and two mini-games that drop equipment |
| Main view | A world map of routes | One continuous town your character physically lives in. Deliveries from lines drive through it, and your house is in it |

---

## 0.5 Where we deviate from or improve on Aaron's brief

Aaron's brief is inspiration, not a checklist. This proposal keeps the parts that are great (tap-to-earn the first business, edge-to-edge live line scenes, glyph upgrades, managers with equipment, seasonal side worlds, robust mobile lifecycle). It changes the following, and each change is for the player's benefit.

| # | Brief said | We propose | Why it's better for the player |
|---|---|---|---|
| 1 | "Each list line is its own mini Three.js scene"; lines and main view share world/actors | **One renderer, one world, many cameras.** Each line card is a scissor viewport onto that business's real plot in the single shared town. Off-screen cards don't render, and visible-but-idle cards tick at a reduced rate. | Sharing becomes literal: the van leaving the Food Truck card *is* the van on the main road. It also dodges the browser's ~16-WebGL-context limit and the black-screen bugs that many contexts cause (brief point 7), and keeps battery use sane. |
| 2 | Main view "cycles highlights between lines (timed)" | A **smart director**: still about 10 s per shot, but it prefers moments worth seeing (a milestone just hit, a pile just FULL, an event, a delivery arriving, a house move). Pinning (📌) is kept. | A timer shows you random things, while a director shows you *your* progress. The main view becomes a highlights reel instead of a screensaver. |
| 3 | Output "piles up if not collected/transported" | The pile is a **real simulated bottleneck** (production vs sales σ vs shelf), and **tapping a pile sells it at +25%**. A full pile is never a loss, because production just throttles. | The rival only *visualises* a pile. Ours makes the pile the main active-play lever. Tapping stays meaningful for the whole game rather than only as a bootstrap, and full piles waiting after offline time give you a reason to come back. |
| 4 | First business is earned by tapping the main scene | Kept, plus **tapping evolves**: it scales with income (3%/s), combos, crits, rides and education. The character's tap animation changes with life stage (broom → clipboard → phone → cane-twirl). | In most idle games tapping goes dead after minute 2. Here it stays a fun, worthwhile verb all the way to Orbit. |
| 5 | Upgrades as glyph buttons with a global x1/x10/MAX selector | Glyphs kept. **The x1/x10/MAX selector applies only to ⬆ level**, because throughput, shelf and boosts are discrete steps. Added **hold-to-buy** on ⬆ (accelerating auto-repeat), and the selector appears only once you can afford ×10 of something. | It removes the most common idle-game mistake (accidentally MAX-buying the wrong thing), cuts one control from the first-minute screen, and hold-to-buy feels great on touch. |
| 6 | "Progression maps: start in easy areas, unlock harder areas" | Districts don't get *harder*, because idle difficulty is just bigger numbers. Each district instead adds a **gentle signature twist (bonus-only)**: Suburbs *commuter rush* (café and car wash σ +30% at 7–9 and 17–19 local); Harbour *tides* (boat lines ×1.5 at high tide, every 6 min, with water visibly rising); Downtown *nightlife* (neon lines ×1.5 after dark local); Coast *sunny spells* (a weather event that boosts beach lines); Sky City *tailwinds* (drones double-speed gusts); Orbit *orbital day* (90-min Earth-shadow cycle). | Each new land has a new rhythm and something to look forward to, not just a new price tag. Every twist is a bonus, so nothing punishes you for being away (pillar 4). In v1: commuter rush, tides and nightlife. |
| 7 | Generic prestige (from Idle Life 1) | **Inheritance**: retire, choose an heir with a talent, keep an heirloom, and add a family-tree portrait. Managers and equipment carry over. | A reset is the scariest button in an idle game. Making it a warm story beat with choices (heir talent, heirloom) makes players *want* to press it, and every generation plays a little differently. |
| 8 | Manager equipment "earned in mini-games" | Equipment comes from **many sources** (mini-games, contracts, events, seasons, daily gift, achievements), and **3 duplicates merge into the next rarity**. | Single-source loot makes dupes dead weight and gates managers behind one activity. Merging turns every drop into progress. |
| 9 | Random events: "timed opportunities, no penalty" | Kept, but events are **diegetic**: a golden pigeon, a limo or a marching band appears *in the 3D world*, with a small HUD edge chip only when it's off-screen. Two events are skill-light mini-games (Rush Hour, Lucky Delivery). | A banner is an ad; a pigeon flapping across your town is a surprise. This is the Cookie Clicker golden-cookie effect, and it rewards actually watching the beautiful scene we're building. |
| 10 | Seasonal worlds "available on certain days/weeks/months" with levels and permanent rewards | **Persistent multi-day side towns** for the whole window (not short runs), **25 ranks**, rewards assignable to Character / Business / Manager. Seasons **re-run yearly**, and a **Weekend Market** sells one past reward a week for 🎟️. | Short runs feel like a chore and limited windows breed FOMO. Persistent progress respects real lives, and a catch-up path means no reward is gone forever, while the live window stays the best and fastest way to earn them. |
| 11 | Calendar implied (Halloween as the example) | **Hollow's Eve runs Oct 1 – Nov 2**, so it is live on launch day (Oct 3), with *Witching Hour* evenings and an Oct 31 ×3 that spills trick-or-treaters into the main town. | The rival's Halloween starts Oct 15 and isn't live today. Ours is live the moment we ship. |
| 12 | Minimal words, ⓘ popups | Kept, plus **teach by toast after the action**: a one-line glyph toast explains what you just bought, and each concept gets exactly one hint, once. | The player learns by doing. ⓘ stays for the curious, and nobody reads a tutorial wall. |
| 13 | (not in brief) | A **life layer**: ageing (always positive: Elder Wisdom), housing visibly upgrading in the main scene, partner, kids-as-heirs, pets that follow you and do small jobs, and education on real-time timers. | This is what makes *Life* special against *Transport*. It gives emotional stakes and gives players a reason to look at the main scene beyond income numbers. |
| 14 | Progress bar = bottom border of the scene | Kept. For very fast cycles (< 0.3 s) the border switches to a **flowing shimmer**, not a strobing bar, and it pulses gold at a milestone. | AdVenture-style fast cycles turn into flicker. The shimmer reads as "running flat out" and is kinder to eyes and to `prefers-reduced-motion`. |

---

## 1. Design pillars

1. **Every number has a body.** Money made is shown as goods moving: lemons squeezed, cups stacked, vans leaving. If a stat changes, something in 3D changes too (pile height, queue length, building tier, house, character age).
2. **One world.** Every line card is a camera onto a real plot in the shared town. A van that leaves the Food Truck's line card turns up on the main view's road a moment later.
3. **Words cost money.** The default UI is glyphs, numbers, one floating badge per line and an ⓘ. Explanations live behind ⓘ and in toasts that appear *after* you do something.
4. **Never punish.** Events have no penalty, ageing has no penalty, offline never loses anything, and seasonal progress is never lost mid-season. Every "bad" state (a full pile) is something you can tap away.
5. **Unfold, don't dump.** At t=0 the screen has a scene, a cash number and one ghost card. Every system arrives through play, one at a time, with a reason.

---

## 2. Core loop

```
 TAP main scene (hustle) ──► $ ──► BUY/LEVEL business line
        ▲                              │
        │                     produces STOCK (units/sec)
        │                              │
  tap the pile ◄── STOCK piles on shelf ──► SALES (customers / couriers) ──► $
  (instant sale +25%)       (capacity = seconds of output)
                                       │
        MANAGER = runs the line while you're away + trait + equipment
                                       │
   $ also buys: HOUSING (global ×, offline hours) · EDUCATION (timed skills)
                LIFESTYLE (rides) · DISTRICT PERMITS (new lands)
                                       │
   Lifetime $ ──► AGE rises ──► at 55+ you may RETIRE ──► HEIR (new generation)
                                                         with Legacy ×, trait, heirloom
```

### 2.1 The line model (the heart of the game, and real, unlike the rival's)

Each business line has:

- **Level L** (bought x1 / x10 / MAX). Production value per second `P = L × r × M`, where `r` = base $/s per level and `M` = all multipliers.
- **Sales throughput σ**: the fraction of production that customers or couriers clear automatically. It starts at **50%** and each throughput upgrade (themed glyph: 🧍 extra server, 🚚 van, 🛵 scooter…) adds +10%, up to 5 upgrades for 100%.
- **Shelf** (📦): holds `S = 30 s × 2^storageLvl` of production (storage levels 0–6, so 30 s up to 32 min). Because it's measured in *seconds of output*, it never goes obsolete as levels rise.
- **Stock** fills at `(1 − σ) × P`. While the shelf isn't full, the line earns `σ × P`. When the shelf is full, production throttles to σ × P and the pile wobbles with an amber FULL glint.
- **Tap the pile** to sell the whole pile at **+25% "fresh sale" bonus**. This is the active-play lever: an engaged player effectively runs at 100%+ before buying couriers.

So the line has three readable upgrade axes plus a manager, all shown as glyphs: **make faster (level), sell faster (σ), store more (S), automate (manager)**. This is Idle Miner Tycoon's shaft → elevator → warehouse bottleneck, simplified to one line.

### 2.2 Offline

- **Managed lines** earn `σ × P` for `min(away, cap)`, and the remainder `(1−σ) × P` fills the shelf. When you come back, piles are waiting to be tapped, which gives you a reason to return.
- **Unmanaged lines** produce into the shelf only (no sales) until full.
- **Cap**: set by housing (1 h on the bench → 12 h in the orbital villa), plus Night School (+2 h) and a cat (+20%).
- On return: a non-blocking "While you were away" card slides down from the HUD (amount, longest pile, "tap piles to cash in"). It is never a modal.

---

## 3. First five minutes, beat by beat

Target device: portrait phone. Times assume a casual tapper (~2.5 taps/s).

| Time | What the player sees | What's on screen (UI) |
|---|---|---|
| 0:00 | Dawn in Old Town. Low-poly cobbled street, a park bench, our character (a scruffy 18-year-old) asleep under a newspaper. A pigeon pecks. A soft pulsing ring under the character. | Cash `$0` top-centre. Nothing else. |
| 0:02 | Player taps anywhere on the scene. The character jumps up and sweeps (Idle Life 1 homage), and a `+$1` coin pops with a *tink*. Each tap is one sweep stroke plus dust puffs. | A ghost card fades in below the scene: a translucent lemon stall with "🍋 $50" and a fill bar creeping up as cash rises. |
| 0:10 | Combo: rapid taps raise pitch and speed, and a ×1.2… badge appears (cap ×2 at 20 chained taps). | Combo badge near finger. |
| ~0:25 | Cash hits $50. The ghost card glows and shakes slightly. | Card turns solid: "🍋 Lemonade Stand  $50 BUY". |
| 0:26 | Tap BUY. Cash counter rolls down. In the main scene the camera dolly-swoops to a vacant lot and a **lemonade stand pops up** in a squash-and-stretch build (planks fall in, awning unrolls). Confetti, a cash-register *ka-ching*, and the line card fills edge-to-edge with the stand's diorama. | Line card: diorama, level badge "Lv1 · $1/s", progress bar on its bottom border. One floating glyph: ⬆ (level). |
| 0:30 | Customers walk up and buy cups. Cups also stack on the counter because σ = 50%: the pile grows visibly. | A pulsing hand hint on the pile, shown once only. |
| 0:40 | Player taps the pile. Cups fly in an arc into the cash counter (coin trail), and "+25% fresh!" floats up. | Toast: "Tap piles to sell them fresh". This is the only tutorial sentence in the first minute. |
| 0:45–1:30 | Level-ups with ⬆. At Lv 5 a second lemon squeezer appears. Main-scene taps now earn 3% of income/s (min $1). A ghost card for 🌮 Food Truck ($250) appears. | Quantity selector (x1/x10/MAX) appears **only when the player can afford x10 of something**. |
| ~1:00 | 🧍 icon appears on the lemonade line (first throughput upgrade affordable). Buying it spawns a second server, and the queue moves faster. Toast: "🧍 +1 server · sells 60%". | Line glyph row: ⬆ 🧍 |
| ~1:30 | Food Truck bought: a van rolls into the street, opens its hatch and a queue forms. **The main view now auto-cycles** between the two businesses every 10 s with a slow camera glide. | 📌 pin icon appears on line cards. |
| ~2:00 | First random event: a **golden pigeon** flaps across the main scene. Tapping it gives +60 s of income and a feather burst. Ignoring it costs nothing. | No UI, just the pigeon. |
| ~2:30 | Lemonade hits **Lv 10, first milestone ×2**: the stand upgrades to a striped-awning kiosk (visual tier 2). A star-burst and "×2 PROFIT" banner. | Milestone ring on the level badge shows progress to the next one. |
| ~3:00 | Barber Shop ghost appears. The character's look improves: a clean shirt. A **Bedsit** flag appears over a building. | 🏠 Life tab appears (dot badge). |
| ~3:15 | Player buys the Bedsit ($2k). The character walks off the bench into a tiny lit window, and the bench gets a "SOLD" sign. Global income +10%, offline cap 2 h. | Life tab explains housing via ⓘ only. |
| ~3:30 | 🕴 Manager glyph appears on Lemonade (first manager $750). The manager interface opens with **Lola Lemon** (trait: Zesty, cycle speed +10%). Hiring her shows "Lola keeps selling while you're away". | Managers tab appears. |
| ~4:00 | Barber Shop bought. The first **contract** chip appears top-left: "Sell 500 lemonades (312/500) → 🎟️5". | Contracts chip (1 line, tappable). |
| ~4:30 | Map silhouette: the camera pulls back briefly to show fogged **Suburbs** across a bridge with a padlock: "$25K + 3 goals". | 🗺️ Map icon appears. |
| ~5:00–6:00 | Player completes Old Town contracts and buys the Suburbs permit. **Bridge-opening cutscene** (4 s): fog rolls back, bunting, and the camera flies over new streets. | First district done (target ~5 min). |

What the player has learned with no tutorial screens: tap to hustle, buy, piles, level, throughput, managers, housing, events, contracts, map. Each of these was introduced in its own moment.

---

## 4. Districts (progression map)

The town is **one continuous diorama world** laid along a river mouth and coast, climbing up to a sky city with an orbital ring visible in the sky from minute one (as an aspiration). The map is a stylised tilted view, and each district is an island-like plot connected by bridges, ferry, cable car and space elevator.

| # | District | Theme / palette | Connector (unlock cutscene) | Businesses | Permit cost | Gate goals | Target time (life 1 / life 2) |
|---|---|---|---|---|---|---|---|
| 1 | **Old Town** | Cobbles, warm brick, bunting, dawn light | (start) | 🍋 Lemonade · 🌮 Food Truck · 💈 Barber | free | none | 0 |
| 2 | **Suburbs** | Pastel houses, picket fences, lawns, sprinklers | Stone bridge ribbon cut | ☕ Café · 🧽 Car Wash · 🐩 Pet Salon | $25K | all Old Town owned + 3 OT contracts | 5 min / 1 min |
| 3 | **Harbour** | Teal water, gulls, cranes, nets, foghorn | Tram line opens | 🐟 Fish & Chips · ⛴️ Ferry · ⛵ Boatyard | $12M | 4 contracts | 15–20 min / 3 min |
| 4 | **Downtown** | Glass towers, neon signs, taxis, night lights | Ferry docks | 👗 Boutique · 🍝 Bistro · 💻 App Studio | $6B | 4 contracts | 45–60 min / 10 min |
| 5 | **Coast Resort** | Sand, palms, turquoise, sunset gradient | Coast road through tunnel | 🏄 Surf School · 🍹 Beach Bar · 🏨 Grand Resort | $3T | 4 contracts | ~2 h / 30 min |
| 6 | **Sky City** | Floating platforms, cable cars, clouds, white & gold | Cable car up | 🚁 Drone Depot · 🎬 Film Studio · 🌿 Sky Gardens | $1.6Qa | 4 contracts + Gen 2 | gen 2–3 |
| 7 | **Orbit** | Starfield, Earth below, ring station | Space-elevator launch | 🚀 Space Tours · ☄️ Asteroid Mine | $850Qa | 4 contracts + Gen 3 | gen 3–5 |

Each district from 2 onward also has a bonus-only **signature twist** (commuter rush, tides, nightlife, sunny spells, tailwinds, orbital day; see §0.5 row 6), shown as a small glyph on the map and a world effect (rising water, neon on, sun shafts).

Permits ≈ 1.5 × the first business cost of that district. Generation gates on 6–7 make sure the first life ends in a satisfying retirement rather than a slog.

---

## 5. Businesses: content and dioramas

### 5.1 Economy parameters

Formulas (the index i is 1-based, n = business number):

- Unlock cost `U₁ = $50`, `Uₙ = $250 × 8^(n−2)` for n ≥ 2
- Level cost `cost(L→L+1) = b × g^(L−1)`, with `b = U/8` (lemonade b = $5), `g = min(1.14, 1.07 + 0.005(n−1))`
- Bulk: geometric sum; MAX = floor(log(1 + cash(g−1)/c) / log g)
- Base income per level at 100% sales: `r₁ = $1/s`, `rₙ = $2.5 × 6.2^(n−2)` $/s
- Milestones at L = 10, 25, 50, 100, 150, 200, 300, 400, 500, then every 100: profit ×2. Visual tiers change at L1 / L25 / L100 / L250 (four diorama looks per business; v1 ships three: L1, L25, L100).
- Throughput upgrades k = 0..4: cost `U × 2 × 5^k` (σ 50% → 100%)
- Storage levels s = 0..6: cost `U × 3 × 6^s`
- Themed boosts (two per line, three tiers each, ×2 / ×3 / ×5): cost `U × 20 × 40^tier`
- Manager hire: `U × 15`

| # | Business | Unlock U | Level base b | Growth g | $/s per level | U ÷ r (payback s, pre-mult) |
|---|---|---|---|---|---|---|
| 1 | 🍋 Lemonade Stand | $50 | $5 | 1.070 | $1 | 50 |
| 2 | 🌮 Food Truck | $250 | $31 | 1.075 | $2.5 | 100 |
| 3 | 💈 Barber Shop | $2K | $250 | 1.080 | $15.5 | 129 |
| 4 | ☕ Corner Café | $16K | $2K | 1.085 | $96 | 166 |
| 5 | 🧽 Car Wash | $128K | $16K | 1.090 | $596 | 215 |
| 6 | 🐩 Pet Salon | $1.02M | $128K | 1.095 | $3.69K | 277 |
| 7 | 🐟 Fish & Chips | $8.19M | $1.02M | 1.100 | $22.9K | 358 |
| 8 | ⛴️ Harbour Ferry | $65.5M | $8.19M | 1.105 | $142K | 462 |
| 9 | ⛵ Boatyard | $524M | $65.5M | 1.110 | $880K | 596 |
| 10 | 👗 Boutique | $4.19B | $524M | 1.115 | $5.46M | 768 |
| 11 | 🍝 Bistro | $33.6B | $4.19B | 1.120 | $33.8M | 991 |
| 12 | 💻 App Studio | $268B | $33.6B | 1.125 | $210M | 1,280 |
| 13 | 🏄 Surf School | $2.15T | $268B | 1.130 | $1.3B | 1,650 |
| 14 | 🍹 Beach Bar | $17.2T | $2.15T | 1.135 | $8.07B | 2,130 |
| 15 | 🏨 Grand Resort | $137T | $17.2T | 1.140 | $50B | 2,750 |
| 16 | 🚁 Drone Depot | $1.1Qa | $137T | 1.140 | $310B | 3,550 |
| 17 | 🎬 Film Studio | $8.8Qa | $1.1Qa | 1.140 | $1.92T | 4,580 |
| 18 | 🌿 Sky Gardens | $70.4Qa | $8.8Qa | 1.140 | $11.9T | 5,900 |
| 19 | 🚀 Space Tours | $563Qa | $70.4Qa | 1.140 | $73.9T | 7,620 |
| 20 | ☄️ Asteroid Mine | $4.5Qi | $563Qa | 1.140 | $458T | 9,830 |

Rising payback with the business index, set against milestones and multipliers, is what makes new businesses feel like a "big step" while old ones keep levelling (the AdVenture pattern). See §11 for the sim.

### 5.2 Line dioramas

Universal line-card rules:

- The card is edge-to-edge and roughly 16:7. It is a camera onto the business's real plot in the world.
- Bottom-left: floating badge `Lv 37 · $1.2K/s`. Top-right: ⓘ and 📌.
- The bottom border *is* the production-cycle bar, and it pulses gold at milestones.
- Glyph buttons float translucent along the bottom: `⬆ level` · throughput glyph · `📦` · boost 1 · boost 2 · `🕴`. Each glyph shows a tiny cost underneath and dims when unaffordable.
- The pile is instanced meshes (up to 24 visible units; beyond that the top unit scales up and gets a ×N tag).
- "Leaves the scene" means the actor exits the card's frame on a world path, and the main view's camera (when it's on that district) sees it arrive at its destination: a house, the docks, the stadium.

Low-poly language: flat-shaded, chunky proportions, 1 unit = 1 m, characters about 1.6 m capsule-plus-head with simple limb swings (or the shared PolyPerfect rig where performance allows), and a pastel ambient + warm key light per district.

#### Old Town

**1. 🍋 Lemonade Stand.** A plank stall with a striped awning, a glass jug and a hand-cranked squeezer. Character/staff squeezes (lemon halves squish, yellow particles) and pours into a paper cup. Kids and joggers queue on the pavement, each takes a cup and walks off sipping.
- *Stock:* yellow cups stacking in a pyramid on the counter.
- *Throughput:* 🧍 extra server (a second kid at the stall).
- *Boosts:* 🧊 Ice Box (cold = premium: ×2/×3/×5 price) · 🍓 Pink Lemonade (a new jug colour, ×2/×3/×5).
- *Tiers:* plank stall → striped kiosk with fairy lights → mini juice bar with a neon lemon.

**2. 🌮 Food Truck.** A boxy teal van with a hatch, a flat-top grill with sizzle sprites, and a chef flipping tacos (wrap folds). A queue of office workers forms, and each customer receives a foil-wrapped taco and walks to a bench.
- *Stock:* foil parcels on a warming shelf.
- *Throughput:* 🚚 second hatch / van. A second van parks behind, and at σ ≥ 80% one van **drives out of frame** to "cater" and appears in the main view at the office plaza.
- *Boosts:* 🌶️ Hot Sauce (×2/×3/×5) · 📋 Signature Menu.
- *Tiers:* van → van + awning and fairy lights → twin trucks with a picnic area.

**3. 💈 Barber Shop.** A cutaway shopfront (the front wall is removed, like a dollhouse) with a spinning barber pole, a chair, a mirror, a barber with scissors (snip arcs), hair clippings falling as tiny dark shards, a hand-mirror reveal and a satisfied customer with a new hairstyle (mesh swap: shaggy → neat).
- *Stock:* customers waiting on a bench (the queue is the stock; a full bench means people stand outside).
- *Throughput:* 💺 extra chair plus barber.
- *Boosts:* ✂️ Premium Scissors · 🧴 Hot Towel Shave.
- *Tiers:* one chair → three chairs and a neon pole → salon with chandelier.

#### Suburbs

**4. ☕ Corner Café.** An espresso machine with a pressure gauge, a steam puff, a crema pour into a mug (the brown cylinder rises), a latte-art leaf decal and a pastry case. Commuters take a cup.
- *Stock:* takeaway cups in a carrier tray grid.
- *Throughput:* 🛵 delivery scooter that **leaves the frame with a cup bag and appears at houses** in the main view.
- *Boosts:* 🫘 Specialty Beans · 🥐 Pastry Case.
- *Tiers:* hatch café → café with terrace parasols → roastery with sacks.

**5. 🧽 Car Wash.** A drive-through tunnel: spinning blue brush cylinders, a foam particle burst, a rinse arch spraying, dryer flaps, and a car that comes out glinting (an emissive sweep).
- *Stock:* dirty cars queuing on the forecourt. In this business the backlog is the input queue; a full forecourt means cars back up onto the road visibly.
- *Throughput:* 🚿 second bay.
- *Boosts:* 🫧 Triple Foam · ✨ Wax Polish.
- *Tiers:* hose-and-bucket lot → single tunnel → twin tunnels with rainbow foam.

**6. 🐩 Pet Salon.** A grooming table with a muddy dog that gets suds (bubbles), a hair-dryer whoosh that puffs the fur (scale tween on the fur mesh), and a ribbon pop. The owner collects the poodle, now fluffy. Cats on a cat tree watch.
- *Stock:* pets waiting in cute crates.
- *Throughput:* 🛁 extra tub.
- *Boosts:* 🎀 Bows & Bandanas · 🦴 Treat Bar.
- *Tiers:* garage salon → boutique → pet spa with paw-print pool.
- Ties into family pets (§9): owning a pet gives +10% here.

#### Harbour

**7. 🐟 Fish & Chips.** A small trawler bobs at the jetty, and a crate of fish swings ashore on a winch. Inside the chippy window, a fryer basket dips (bubbles) and comes out golden, wrapped in newspaper cones. Gulls swoop at customers.
- *Stock:* paper cones on the counter.
- *Throughput:* 🚲 cargo-bike runner who leaves the frame.
- *Boosts:* 🥔 Hand-cut Chips · 🐚 Mushy Peas.
- *Tiers:* hut → chippy with neon fish → seafood hall.

**8. ⛴️ Harbour Ferry.** A ticket booth, a turnstile and passengers boarding a chunky ferry. The ferry chugs across the water with a wake trail, docks on the far shore and comes back. **The ferry is the same ferry seen crossing the main view.**
- *Stock:* passengers waiting on the quay (crowd density).
- *Throughput:* ⛴️ second ferry.
- *Boosts:* 🎟️ Season Tickets · 🍦 On-board Kiosk.
- *Tiers:* rowboat taxi → ferry → catamaran.

**9. ⛵ Boatyard.** A slipway with a hull on a cradle (ribs → planks → paint in three build stages, cycled), a welder spark sprite and a crane lowering the mast. Finished yachts slide down the slip with a splash and sail out of frame.
- *Stock:* finished hulls on trailers (big chunky units, max 6 visible).
- *Throughput:* 🏗️ second crane.
- *Boosts:* 🪵 Teak Decks · 🧭 Racing Sails.
- *Tiers:* shed → covered dock → superyacht hangar.

#### Downtown

**10. 👗 Boutique.** A glass shopfront with mannequins on spin pedestals that rotate to reveal new outfits (colour swaps), and shoppers leaving with paper bags.
- *Stock:* shopping bags on the counter.
- *Throughput:* 🛍️ extra till.
- *Boosts:* 🧵 Designer Collab · 💃 Fashion Week.
- *Tiers:* shopfront → two storeys and a spotlight → flagship with a catwalk.

**11. 🍝 Bistro.** Pass-through kitchen: a chef tosses a pan (a flame burst), plates slide on the pass, a waiter carries them to candle-lit tables, and diners lift forks.
- *Stock:* plates under heat lamps on the pass.
- *Throughput:* 🤵 extra waiter.
- *Boosts:* 🍷 Wine List · ⭐ Michelin Star (a star appears over the door).
- *Tiers:* bistro → restaurant with terrace → rooftop dining.

**12. 💻 App Studio.** An open-plan office with devs at desks (keyboard tap animation), a whiteboard with sticky notes, and a server rack with blinking LEDs. Floating app-icon cubes rise from monitors into a "cloud" and burst into download arrows.
- *Stock:* app icon cubes collecting in an "outbox" tray.
- *Throughput:* 🖥️ extra server rack.
- *Boosts:* 🤖 AI Copilot · 📈 IPO (confetti shower).
- *Tiers:* garage → office floor → glass campus with slide.

#### Coast Resort

**13. 🏄 Surf School.** A beach hut and a row of boards. An instructor demonstrates on the sand, then learners paddle out, ride a stylised wave (a looping wave mesh) and wipe out comically or stand up. Successful riders get a medal sparkle.
- *Stock:* learners waiting on the sand.
- *Throughput:* 🏄 extra instructor.
- *Boosts:* 🌊 Wave Machine · 📸 Action Photos.
- *Tiers:* hut → surf club → wave pool.

**14. 🍹 Beach Bar.** A tiki hut where the bartender shakes a cocktail (shaker wobble), pours a layered colour drink and adds a paper umbrella. Hammocks sway and the sunset gradient shifts.
- *Stock:* cocktails lined up on the bar.
- *Throughput:* 🍹 second bartender.
- *Boosts:* 🎶 DJ Nights · 🥥 Coconut Menu.
- *Tiers:* hut → deck bar → floating bar.

**15. 🏨 Grand Resort.** A cutaway hotel tower: a lobby with a revolving door, guests with suitcases, an elevator car rising in its shaft (visible), windows lighting up as rooms fill, and a pool with loungers.
- *Stock:* luggage on trolleys in the lobby.
- *Throughput:* 🛎️ extra concierge.
- *Boosts:* 🥂 Rooftop Bar · 💆 Spa Wing.
- *Tiers:* 4 floors → 10 floors → twin towers with a sky bridge.

#### Sky City

**16. 🚁 Drone Depot.** A conveyor of parcels and a robot arm loading drones, which lift off in a swarm, fly out of frame and **appear dropping parcels on the main-view rooftops of every district**.
- *Stock:* parcels on the conveyor end.
- *Throughput:* 🚁 drone bay.
- *Boosts:* 🔋 Fast Charge · 🗺️ Route AI.
- *Tiers:* single pad → hangar → sky hive.

**17. 🎬 Film Studio.** A sound stage: clapperboard snap, lights, a camera on a dolly, an actor in a dramatic pose, and film reels rolling off into a premiere marquee.
- *Stock:* film-reel canisters.
- *Throughput:* 🎥 second stage.
- *Boosts:* 🌟 Star Cast · 🍿 Premiere Night.
- *Tiers:* stage → backlot → floating studio.

**18. 🌿 Sky Gardens.** Vertical hydroponic racks. Seedlings grow (scale tween), glowing grow-lights pulse, a harvester bot plucks bright fruit and crates go onto a cable car.
- *Stock:* fruit crates.
- *Throughput:* 🚡 extra cable car.
- *Boosts:* 💧 Mist Irrigation · 🌸 Rare Blooms.
- *Tiers:* single rack → tower → domed garden.

#### Orbit

**19. 🚀 Space Tours.** A tourist capsule docks at the ring station. Tourists in suits float through an airlock and take selfies at a window with Earth below (a flash sprite), then a shuttle returns them down.
- *Stock:* tourists waiting in the departure lounge.
- *Throughput:* 🛸 extra shuttle.
- *Boosts:* 🌍 Earthrise Window · 🧑‍🚀 Spacewalk Package.
- *Tiers:* capsule → station module → orbital hotel.

**20. ☄️ Asteroid Mine.** A tethered asteroid with a drill rig (spark spray), ore chunks glowing teal and a tug hauling an ore container back to the station.
- *Stock:* ore containers.
- *Throughput:* 🛰️ extra tug.
- *Boosts:* ⛏️ Laser Drill · 💎 Rare Isotopes.
- *Tiers:* drill rig → mining platform → hollowed-asteroid refinery.

### 5.3 Upgrade toast language

Toasts are glyph-led and ≤5 words: `🧍 +1 server · sells 60%`, `🧊 Ice Box · cups ×2`, `📦 Shelf holds 2 min`, `🕴 Lola hired · runs offline`. Bulk purchases show `⬆ +10 levels · Lv 47`.

---

## 6. Managers

Managers are the game's "collectible people". There is one active manager slot per line; you can own several candidates per line (the default one, a seasonal one, an event one) and swap them.

### 6.1 Roster (default managers: one per line, hired with cash)

| Line | Manager | Look | Trait | Effect |
|---|---|---|---|---|
| Lemonade | Lola Lemon | Pigtails, yellow apron | **Zesty** | cycle speed +10% |
| Food Truck | Taco Tom | Bandana, moustache | **Showman** | pile tap bonus +25% → +40% |
| Barber | Sal Snips | Slick quiff, waistcoat | **Smooth Talker** | σ +10% |
| Café | Bea Barista | Beanie, tattoos | **Early Bird** | +25% income 06:00–12:00 local |
| Car Wash | Duke Suds | Rubber boots | **Hoarder** | shelf ×1.5 |
| Pet Salon | Pip Paws | Dog ears headband | **Animal Magnet** | pet bonus doubled on this line |
| Fish & Chips | Mo Batter | Fisherman jumper | **Night Owl** | offline cap +1 h (global, stacks with other Night Owls up to +3 h) |
| Ferry | Captain Rosa | Captain hat | **Punctual** | cycle speed +10% |
| Boatyard | Hank Hull | Hard hat, overalls | **Penny Pincher** | level costs −5% on this line |
| Boutique | Vivi Velvet | Sunglasses, beret | **Trendsetter** | event rewards on this line ×2 |
| Bistro | Chef Gus | Tall toque | **Perfectionist** | milestone multipliers ×2.5 instead of ×2 on this line |
| App Studio | Dev Kai | Hoodie, headphones | **Automator** | auto-taps the pile when full (sells at the +25% fresh rate) |
| Surf School | Kiki Wave | Shades, board | **Lucky** | 5% of sales crit ×5 |
| Beach Bar | Rico Shaker | Hawaiian shirt | **Party Starter** | +3% global income per owned Coast line |
| Grand Resort | Madame Elise | Pearls, clipboard | **Hospitality** | +5% income to every line in the district |
| Drone Depot | UNIT-7 | Small robot | **Tireless** | offline earnings 100% → 120% on this line |
| Film Studio | Ava Reel | Director's chair, megaphone | **Hype** | golden pigeon frequency +20% |
| Sky Gardens | Fern Green | Overalls, watering can | **Green Thumb** | storage cost −50% here |
| Space Tours | Cmdr Nova | Flight suit | **Explorer** | +1% global income per district unlocked |
| Asteroid Mine | Rocky Ore | Miner helmet lamp | **Deep Digger** | crit sales ×10 |

### 6.2 Levels and slots

- Manager **Level 1–10**. Each level gives +10% line income (so Lv 10 = +90%). Level-up costs cash (`U × 15 × 3^lvl`) **plus 🎟️ Tickets** (1, 2, 3, 5, 8, 12, 18, 25, 35).
- Equipment slots: **1 at Lv1, 2 at Lv4, 3 at Lv8**.
- Manager levels and equipment **survive retirement** (they "work for the family"). This is one of the big reasons Inheritance is attractive, and what makes managers a long-term investment, unlike the rival.

### 6.3 Equipment (16 items × 5 rarities)

| Glyph | Item | Effect (Common value) |
|---|---|---|
| ⏱️ | Stopwatch | cycle speed +4% |
| 📣 | Megaphone | σ +3% (can exceed 100% → drains piles faster) |
| 🎒 | Backpack | shelf +15% |
| 🧤 | Grip Gloves | pile tap bonus +8% |
| 🍀 | Clover | crit sale chance +1% (crit ×5) |
| 🌙 | Night Lamp | offline earnings on line +6% |
| 🧮 | Abacus | line level costs −2% |
| 📒 | Ledger | line income +6% |
| 🎩 | Top Hat | event reward on this line +10% |
| 🕶️ | Shades | golden pigeon chance +3% (global, cap) |
| ☕ | Thermos | manager level costs −5% |
| 👟 | Sneakers | courier/server walk speed +10% (cosmetic plus σ +1%) |
| 🔧 | Wrench | milestone multiplier +0.05 |
| 💼 | Briefcase | contract rewards +5% when this line is the target |
| 🧸 | Lucky Bear | all of the above +1% (tiny generalist) |
| 🧲 | Magnet | auto-collects 1 pile tap every 30 s |

**Rarities:** Common (grey) ×1 · Uncommon (green) ×1.6 · Rare (blue) ×2.5 · Epic (purple) ×4 · Legendary (gold) ×6, plus a cosmetic effect on the diorama (a gold glint trail on the manager).

**Merge:** 3 identical items of the same rarity merge into 1 of the next rarity. This is a satisfying sink with a fusion animation.

**Sources:** Rush Hour mini-game crates, contracts, events, seasonal ranks, achievements, the daily gift and weekly market. There is **no gacha with real money, and no IAP at all.**

**Crates:** 🎁 Basic (C 70 / U 25 / R 5), 🎁 Silver (U 60 / R 32 / E 8), 🎁 Gold (R 60 / E 33 / L 7). Opening plays a shake → burst → item spin.

---

## 7. Life layer

### 7.1 Age (no penalties, pure story)

`age = 18 + 3.5 × log10(max(1, lifeEarnings))`, capped at 95.

$1K → 28 · $1M → 39 · $1B → 50 · $1T → 60 · $1Qa → 70 · $1Qi → 81.

The character model changes by stage: Young Adult (18–29) → Adult (30–44) → Parent/Prime (45–59; grey temples) → Silver (60–74; grey hair, glasses) → Elder (75+; white hair, cane prop, a slower walk animation in the main view). Elder grants **Wisdom**: +1% income per year over 75. Ageing is always good.

### 7.2 Housing (visible in the main scene, the home plot of the current district)

| # | Home | Cost | Global income | Offline cap | Unlocks | Main-scene visual |
|---|---|---|---|---|---|---|
| 1 | Park Bench | free | ×1 | 1 h | none | Bench, newspaper, pigeon |
| 2 | Bedsit | $2K | ×1.10 | 2 h | Life tab | One lit window above a laundrette |
| 3 | Apartment | $250K | ×1.25 | 3 h | **Pets** | Balcony with a plant; the pet appears on the balcony |
| 4 | Starter House | $40M | ×1.5 | 4 h | **Partner** | Small house with a garden; the partner waters plants |
| 5 | Family Home | $15B | ×2 | 6 h | **Kids** (up to 3) | Bigger house, a swing, a treehouse |
| 6 | Mansion | $8T | ×3 | 8 h | **Butler** (auto-taps the main scene 1/s) | Gates, fountain, topiary |
| 7 | Penthouse | $4Qa | ×5 | 10 h | Helipad ride | Sky City tower top, infinity pool |
| 8 | Orbital Villa | $2Qi | ×10 | 12 h | Final cutscene | A ring-station pod with an Earth view |

**Moving house** is an animated beat: a removal van (or helicopter, or rocket) carries boxes from the old home to the new one in the main view, and the character waves.

### 7.3 Relationships and family

- **Partner** (Starter House). A "Meet someone" event appears in the main scene: a person waves at a café table. Tap to say hi. The partner choice is cosmetic plus one of three perks: **Accountant** (−5% all costs), **Entrepreneur** (+10% global), **Homebody** (+1 h offline). The partner walks with your character in the main view.
- **Kids** (Family Home): up to 3, born at ages 35+ milestones via a "🍼 New arrival!" toast. Each kid rolls a **Talent** (Chef, Charmer, Night Owl, Mechanic, Artist, Banker, Explorer). Kids give +5% global each now, and they are **your heir candidates** (§10).
- **Pets** (Apartment). Adopt one active pet, with more stabled later. The pet follows the character in the main view:
  - 🐕 Dog: fetches 1 in 3 golden pigeons automatically (*woof*).
  - 🐈 Cat: offline cap +20%.
  - 🦜 Parrot: the combo decays 50% slower.
  - 🐠 Goldfish: +2% everything, and it is a goldfish.
  - 🐢 Tortoise (seasonal: Summer): offline earnings +10%.

### 7.4 Lifestyle (rides)

🚶 Walk → 🚲 Bike ($500) → 🛵 Scooter ($50K) → 🚗 Hatchback ($20M) → 🏎️ Sports car ($5B) → 🛥️ Yacht ($2T) → 🛩️ Jet ($1Qa) → 🚀 Shuttle ($500Qa). Each ride doubles **tap power** and shortens the highlight-tour camera transition (cosmetic). The character's ride is visible in the main view when the tour visits home.

Later phase: wardrobe (event reward size), hobbies (Gym: tap ×2; Golf: contract rewards +10%; Art: pigeons last 50% longer).

### 7.5 Education (research with real-time timers)

One course at a time. The **Study** tab shows the character at a desk (a mini scene). Courses cost cash and take time, and they **continue offline**. This is Melvor's appointment loop: "start the 2-hour course before bed".

| Branch | Course | Cost | Time | Effect | Requires |
|---|---|---|---|---|---|
| 🧠 Hustle | Street Smarts | $300 | 30 s | tap ×2 | none |
| | Speed Reading | $20K | 5 min | combo cap ×2 → ×3 | Street Smarts |
| | Public Speaking | $5M | 30 min | event rewards ×1.5 | Speed Reading |
| | Charisma Masterclass | $2B | 2 h | golden pigeon +30% freq | Public Speaking |
| 📊 Business | Bookkeeping | $5K | 2 min | all level costs −3% | none |
| | Marketing 101 | $500K | 15 min | σ +10% all lines | Bookkeeping |
| | Business Degree | $200M | 1 h | global ×1.5 | Marketing |
| | MBA | $80B | 4 h | global ×2 | Degree |
| | Economics PhD | $50T | 8 h | milestone ×2 → ×2.2 | MBA |
| 🏠 Life | First Aid | $2K | 1 min | +1 h offline | none |
| | Night School | $1M | 20 min | +2 h offline | First Aid |
| | Parenting Class | $1B | 1 h | kids give +10% (not +5%) | Night School |
| | Logistics Cert | $20M | 45 min | storage ×2 all lines | First Aid |
| | Time Management | $500B | 3 h | study a 2nd course in parallel | Parenting |
| | Estate Planning | $10T | 6 h | Legacy points +25% on retirement | Time Management |

**Education resets on retirement**, but each heir starts with the **cheapest course of every branch already done** after Gen 3 ("family values"). A "Scholarship" Legacy upgrade halves study times.

---

## 8. Random events and mini-games

No penalties. Each event appears as a 3D object or actor in the world, never a banner first. A small timer ring hovers over it, and a glyph chip appears on the HUD edge for off-screen ones.

| Event | Trigger | Duration to claim | Reward | Visual |
|---|---|---|---|---|
| 🕊️ **Golden Pigeon** | every 90–180 s after first business | 10 s flight | 60 s of income (×7 on a 10% roll) | Gold pigeon flaps across; feather burst |
| ⭐ **Celebrity Visit** | 4–8 min | 20 s to tap | one line ×7 for 30 s | Limo pulls up to a random line; paparazzi flashes |
| 🎺 **Street Parade** | 10–15 min | 20 s | all income ×2 for 60 s | Marching band crosses the main view |
| 👛 **Lost Wallet** | 6–10 min | 15 s | "Return it" → 🎟️2 + karma (+1% income, 1 h) | Wallet glints on the pavement |
| 📦 **Bulk Order** | 8–12 min | accept within 20 s | deliver N units from line X within 2 min → 3 min of income + crate | Customer with a clipboard; target pile highlighted |
| 🧑‍🍳 **Food Critic** | food lines, 10 min | 15 s | that line's next 10 cycles ×5 | Critic with a notebook in the queue |
| 🌧️ **Rainy Day** | 15 min | 20 s | umbrella pop-up stall: tap 10 umbrellas = 2 min of income | Rain particles, puddles |
| 🚌 **Tourist Bus** | district 3+ | 20 s | all lines in district σ = 150% for 90 s (piles drain fast) | Double-decker unloads tourists |
| ⏰ **Rush Hour** (mini-game) | 12–20 min | accept within 30 s | 15 s: glowing customers appear in one line scene, tap them all → crate (tier by score) + cash | Line card zooms to fill the screen |
| 🎁 **Lucky Delivery** (mini-game) | 20 min, district 2+ | 10 s | a runaway parcel bounces across the main scene; tap it 3× before it escapes → equipment item | Physics parcel bouncing |

Events do not fire offline. Only one event is pending at a time (except pigeons). The dog pet auto-claims a third of pigeons.

---

## 9. Contracts and goals

- **District contracts** (gate permits, award 🎟️ and crates). There are 4 per district, shown as a chip top-left; the next contract appears when one is claimed.

| District | Contracts |
|---|---|
| Old Town | Sell 500 lemonades · Food Truck Lv 25 · Tap 3 piles · Move into the Bedsit |
| Suburbs | Hire 3 managers · Café Lv 50 · Claim 3 events · Buy a Bike |
| Harbour | Own a pet · Ferry carries 1,000 passengers · Any line at 100% σ · Finish Marketing 101 |
| Downtown | Starter House · Bistro Michelin Star · Earn $1B in one sitting · Equip 3 items |
| Coast | Win a Gold Rush Hour · Family Home · 10 lines at Lv 100 · Merge an Epic item |
| Sky City | Retire once · Film Studio Lv 150 · Mansion · 5 managers Lv 5 |
| Orbit | 3 generations · Penthouse · Every line milestone 200 · Legendary item |

- **Daily goals:** 3 per day from a pool ("Tap 200 times", "Claim 2 pigeons", "Level any line ×25", "Complete a course"). Reward 🎟️ + Basic crate, plus a bonus Silver crate for all 3. They reset at local midnight, and missing a day costs nothing (no streak loss on goals).
- **Daily gift:** a 7-day ladder that **pauses** rather than resets if you miss a day (a gentle streak, per pillar 4). Day 7 gives a Gold crate.
- **Weekly goal:** one bigger target (e.g. "Earn 10× your current income/s ×1h") → Gold crate.

Currencies, kept deliberately few: **💵 Cash**, **🎟️ Tickets** (managers and crates; earned only in play), **👑 Legacy** (prestige), plus one **seasonal token** per side world.

---

## 10. Prestige: Inheritance (the reason to reset)

### 10.1 Retire and pass it on

- **Unlocks** at age 55 (≈ $35B lifetime this life; ~40–50 min in life 1). It's previewed earlier as a locked "👴 Retire" glyph on the Life tab showing "unlocks at 55".
- **Legacy points:** `LP_total = floor(10 × cbrt(allTimeEarnings / 1e10))`. On retirement you receive `LP_total − LP_already_awarded`. Each LP gives **+2% global income**, compounding additively (1 + 0.02·LP). Reference points: $1e13 total → 100 LP (×3) · $1e16 → 1,000 LP (×21) · $1e19 → 10,000 LP (×201).
- **Preview** is always visible: "Retire now → +87 👑 (income ×2.7)". There's a "recommended" glow when the gain ≥ 100% of current LP (or ≥ 25 LP for the first time).

### 10.2 The retirement ceremony (the satisfying part)

1. The camera flies to the home. Family gathers on the lawn and the old character sits in a rocking chair.
2. **Choose your heir**: up to 3 kid cards (or a "distant cousin" with a random talent if you had none), each with a **Talent** that is active for the whole next life:
   - Chef: food lines ×2
   - Charmer: event rewards ×2
   - Night Owl: +4 h offline
   - Mechanic: Car Wash, Boatyard and Drone ×3
   - Artist: Boutique and Film ×3
   - Banker: costs −10%
   - Explorer: permits −50% and contracts ×2
3. **Choose an heirloom**: one equipment item (or one seasonal keepsake) moves into the permanent **Heirloom** character slot. Slots grow by 1 per 2 generations, up to 5.
4. A portrait is painted and hung on the **Family Tree wall**. Each portrait gives +1% global permanently, and its frame shows the year, the age at retirement and the peak home.
5. Fade to dawn: the heir wakes on **the same park bench**, but now with the Legacy multiplier, a starter bonus (`$ = 10 × LP`), the family dog if you had one (pets are inherited) and managers that keep their levels and equipment.

### 10.3 What resets / what stays

| Resets | Stays |
|---|---|
| Cash, business levels and upgrades, districts (re-permit, but permits −50% for districts you've reached before) | Legacy LP, family tree, heirlooms |
| Housing and ride, education (minus "family values") | Managers (levels, equipment, owned candidates) |
| Partner and kids (new life) | Pets, equipment inventory, 🎟️, achievements, seasonal rewards |

### 10.4 Second layer (later phase): Dynasty

After Gen 5 **and** the Orbital Villa, you can **Found a Dynasty**: reset LP into **🏛️ Crests**, spent on a permanent Legacy tree (Scholarship: study ×0.5; Old Money: start in the Apartment; Family Business: start with the Lemonade Stand at Lv 25; Long Life: age formula slower → more Elder Wisdom). This gives late players a 20+ hour arc. **Not in v1.**

---

## 11. Economy maths and pacing

### 11.1 Income

```
lineIncome = L × r × milestoneMult(L) × boostMult × managerMult × σ_eff
           × housing × education × legacy(1+0.02·LP) × familyTree × partner × kids
           × talent × events × keepsakes
σ_eff = σ while shelf not full (pile absorbs the rest), σ when full; pile taps add the rest at +25%
tap   = max($1, 0.03 × incomePerSec) × comboMult(≤2, ≤3 w/ Speed Reading) × ride × education
crit tap 3%: ×5 with a heavier coin sound
```

### 11.2 Pacing (greedy-buyer sim with an active pile tapper, 2.5 taps/s for 10 min then 1.5; the script is in the scratchpad and will be rebuilt by the economy agent as `tools/sim.mjs`)

| Milestone | Target | Sim life 1 | Sim life 2 (100 LP) | Sim life 3 (400 LP) |
|---|---|---|---|---|
| First business | 30–60 s | 0:20 (taps only) | 0:20 | 0:20 |
| Food Truck | ~1.5 min | 0:54 | 0:36 | 0:30 |
| Suburbs | ~5 min | 2:20 (+contracts → ~5) | 0:48 | 0:30 |
| Harbour | ~15–20 min | 5:50 (+contracts/permit ~12–15) | 1:24 | 0:42 |
| Downtown | ~45–60 min | 27:40 (+permit/contracts ~40) | 6:54 | 1:18 |
| Retire available (age 55) | ~45 min | ~40–50 | n/a | n/a |
| Coast | ~2 h | ~1:57 | 0:34 | 0:07 |
| Retire recommended (100 LP) | 1.5–2 h | ~2 h (E≈1e13) | n/a | n/a |

The sim ignores housing, education, managers' traits, events and the Legacy starter cash, so real progress has more multipliers but also less optimal buying. The economy agent must re-tune with the full model so the **Life 1 → Downtown ≈ 45 min and first retire ≈ 1.5–2 h** targets hold, and so each new generation reaches **one further district** than the last in about the same session length. The Sky City and Orbit generation gates are there to keep that rhythm.

### 11.3 Offline caps

1 h → 12 h by housing, +2 h Night School, +1–3 h Night Owl managers, +4 h Night Owl heir, ×1.2 cat. Hard ceiling 24 h. Offline is credited only up to real elapsed time since the last save (no double credit; same rule as the rival). Seasonal worlds earn offline at 50% with a 4 h cap.

### 11.4 Number display

`1.23K / M / B / T / Qa / Qi / Sx / Sp / Oc / No / Dc`, then `aa, ab…`. Up to 3 significant figures. The cash counter **rolls**, never jumps.

---

## 12. Seasonal side worlds

### 12.1 How they work

- A **side world** is a separate small town (its own camera/scene in the same renderer) entered from a festive glyph on the HUD (🎃). Your character walks through a portal (a costume swap on entry).
- It contains **4 themed variant businesses** (re-skinned dioramas of main-game lines with season-specific animations), using the same line model but with its own **season token** currency, its own levels and managers, and a faster curve (`g = 1.12`, the 4th line at ~45 min).
- **Seasonal Rank 1–25**: rank XP comes from season tokens earned (lifetime in this season). Every rank gives a reward, and the rewards are **permanent**.
- Progress persists for the **whole season window** (unlike the rival's 8-minute run). It's designed for ~20–30 min active play per day for 7–10 days to reach Rank 25, with offline at 50%.
- **Keepsakes** (permanent rewards) are assigned to one of three targets, chosen on claim and re-assignable at any time:
  - **🧍 Character**: a global bonus that persists across all generations (and is shown on the character as a costume piece).
  - **🏪 Business**: a skin plus a bonus for one main-game line.
  - **🕴 Manager**: an equipment-style item, or a whole **seasonal manager** who becomes an alternative manager for a specific line.
- **Re-runs:** a season's world returns every year in its window, and your rank resets but owned rewards stay. Already-owned ranks give 🎟️ instead (no duplicates). The weekly **Weekend Market** sells one past-season reward per weekend for season-agnostic 🎟️, so latecomers can catch up slowly.

### 12.2 Calendar (local time)

| Window | World | Token | Variant businesses (main → seasonal) |
|---|---|---|---|
| **Oct 1 – Nov 2** (LIVE NOW, 2026-10-03) | 🎃 **Hollow's Eve** | 🍬 Candy | Lemonade → **Witch's Brew Cauldron** (bubbling green potion in bottles); Food Truck → **Pumpkin Pie Wagon** (pumpkins carved and baked); Barber → **Haunted Haircuts** (ghost customers, floating scissors, hair turns spooky colours); Café → **Coffin Café** (bats fly out of cups; "Count Cuppula" behind the bar) |
| Nov 3 – Nov 30 | (none; Weekend Markets) | none | none |
| **Dec 1 – Jan 6** | 🎄 **Frostbridge** | ❄️ Snowflakes | Lemonade → Hot Cocoa Stand; Food Truck → Roast Chestnut Cart; Car Wash → Sleigh Polish; Pet Salon → Reindeer Spa |
| **Feb 7 – Feb 16** | 💘 **Sweetheart Lane** | 💌 Love Notes | Lemonade → Pink Milkshake Bar; Barber → Date-Night Makeovers; Café → Chocolate Fondue; Boutique → Rose Florist |
| Easter ±7 days (later phase) | 🐣 **Spring Fair** | 🥚 Eggs | Pet Salon → Bunny Barn; Bakery Egg Painting; … |
| **Jul 1 – Aug 31** | ☀️ **Sunny Pier** | 🐚 Shells | Lemonade → Ice Lolly Cart; Fish & Chips → Seaside Chippy; Ferry → Pedalos; Surf School → Sandcastle Contest |
| **Every Fri 00:00 – Sun 23:59** | 🧺 **Weekend Market** | 🎟️ | A single pop-up line rotating through past-season variants; 1 past reward for sale |
| Daily | Daily goals + gift | 🎟️ | none |

### 12.3 Hollow's Eve: full reward ladder (ships in v1)

Dioramas: night palette, purple fog, jack-o'-lanterns lining paths, bats circling the moon, wonky gothic houses.

- **Witch's Brew Cauldron.** A witch stirs a cauldron (green bubble particles). Bottles fill and line up (the stock). Trick-or-treat kids queue in costumes. Boosts: 🦇 Bat Wings and 🕸️ Spider Silk.
- **Pumpkin Pie Wagon.** A carver carves a jack-o'-lantern face (a decal swap), the pumpkin goes into the oven and comes out as a pie. Boosts: 🎃 Giant Pumpkins and 🌶️ Spiced Crust.
- **Haunted Haircuts.** Floating scissors snip a ghost's "hair" wisps, and the ghost customer goes semi-transparent → glowing. Boosts: 💀 Skull Combs and 🕯️ Candlelit Mirrors.
- **Coffin Café.** A coffin opens, a vampire barista pours red "beet latte", and bat-shaped steam puffs. Boosts: 🦷 Fang Mugs and 🌕 Full Moon Roast.

| Rank | Reward | Type |
|---|---|---|
| 1 | Basic crate | equipment |
| 2 | 🎃 Pumpkin Head hat (+3% tap) | Character keepsake |
| 3 | 100 🍬 + 🎟️5 | currency |
| 4 | 🕸️ Cobweb Lemonade skin (+25% Lemonade) | Business keepsake |
| 5 | Silver crate | equipment |
| 6 | 🦇 Bat Familiar pet (pigeons → bats, +10% pigeon reward) | Character (pet) |
| 7 | 🎟️10 | currency |
| 8 | 🕯️ Candle Lantern (manager item, Rare: offline +15% on line) | Manager keepsake |
| 9 | Silver crate | equipment |
| 10 | 🧛 **Count Cuppula**: seasonal Café manager (trait *Nocturnal*: +50% income 18:00–06:00 local, offline +2 h) | Manager |
| 11 | Haunted Food Truck skin (+25% Food Truck) | Business keepsake |
| 12 | 🎟️15 | currency |
| 13 | 🧹 Witch's Broom ride (tap ×2, stacks with rides) | Character keepsake |
| 14 | Gold crate | equipment |
| 15 | 🕷️ Spider Ring (manager item, Epic: σ +10%) | Manager keepsake |
| 16 | 🎟️20 | currency |
| 17 | Spooky Barber skin (+25% Barber) | Business keepsake |
| 18 | Gold crate | equipment |
| 19 | 💀 Skull Pocket Watch (Epic Stopwatch) | Manager keepsake |
| 20 | 🧙 **Wanda Brew**: seasonal Lemonade manager (trait *Hex*: crit sales 10% ×7) | Manager |
| 21 | 🎟️30 | currency |
| 22 | 🌕 Full Moon portrait frame for the family tree (+3% global) | Character keepsake |
| 23 | Gold crate ×2 | equipment |
| 24 | 🎃 Jack-o'-Lantern House decoration (home glows, +5% global) | Character keepsake |
| 25 | 👻 **Vampire Cape costume** (+10% global income, all generations) and a **"Night of the Living Dead-Rich" title** | Character keepsake |

Daily twist: **Witching Hour** from 18:00 to 24:00 local gives ×2 candy, with fog and moon glow, so evening sessions feel special. On **Oct 31** there's an all-day ×3 and trick-or-treaters also wander the *main* town (cosmetic plus double pigeons).

---

## 13. Achievements (~40, permanent, each +1% global)

| Group | Achievements |
|---|---|
| Hustle | 🧹 First Sweep (tap 1) · 👆 Tapper (1K taps) · 💪 Grinder (10K) · 🤜 Legend (100K) · 🔥 Combo King (hit max combo) · 💥 Crit Streak (3 crit taps in a row) |
| Money | 🌱 $1K · 💸 $1M · 🏦 $1B · 🌍 $1T · 👑 $1Qa · 🌌 $1Qi |
| Business | 🍋 Entrepreneur (first biz) · 📊 Diversified (5) · 🏙️ Mogul (all 20) · ⭐ Milestone Hunter (any Lv 100) · 💎 Perfectionist (any Lv 500) · 🧺 Pile Pro (tap 1,000 piles) · 🚚 Never Full (all owned lines σ 100%) |
| Life | 🛏️ Off the Bench · 🏡 Homeowner · 🏰 Mansion · 🛰️ Orbital · 💍 Plus One (partner) · 👶 Full House (3 kids) · 🐕 Best Friend (pet) · 🎓 Graduate (MBA) · 🧓 Silver Fox (age 60) · 🎂 Centenarian-ish (age 90) |
| Legacy | 👴 Pass the Torch (retire 1) · 🌳 Family Tree (5 gens) · 🏛️ Dynasty (10 gens) · 🎁 Heirloom Keeper (5 heirlooms) |
| Managers & items | 🕴 Team Builder (10 managers) · 🎖️ Top Brass (manager Lv 10) · 🔮 Fusion (merge Epic) · 🌟 Legendary |
| Events & seasons | 🕊️ Pigeon Fancier (100 pigeons) · ⏰ Rush Master (Gold Rush Hour) · 🎃 Hollow Hero (Rank 25 Halloween) · 🎄 / 💘 / ☀️ equivalents |

---

## 14. Main view and UI

- **Top ~42% of portrait** is the main scene, the shared world. It auto-tours highlights every 10 s with a 1.2 s eased glide (a whole-town establishing shot, then each owned line's plot, the home, then event sites). The tour **prefers** lines that just levelled, hit FULL, have an event or just milestoned. 📌 on a line card pins the main view there, and 📌 again (or a tap on "release") resumes.
- When the list scrolls up, the HUD folds to a 64 px strip with cash and income/s (the same pattern as the rival, which works well). Returning to top restores it.
- **Tabs** (bottom bar, each appearing only when unlocked): 🏪 Lines · 🗺️ Map · 🏠 Life (housing, family, rides, retire) · 🎓 Study · 🕴 Managers · 🎒 Items · 🏆 Goals · ⚙️. The seasonal 🎃 is a floating HUD button, not a tab.
- **Popups, never alerts.** The manager interface is a bottom sheet with a 3D turntable of the manager, three slot circles and an item grid. Nudges are non-blocking chips.
- **Lifecycle:** black-screen-on-return is a hard requirement and belongs to P0-C architecture. Design-wise, on `visibilitychange` → visible the game shows the last frame (or a snapshot) instantly plus the "While you were away" card, and never a blank canvas.

---

## 15. Juice list (what makes it feel amazing)

**Tapping:**
- A coin pops from the exact tap point, arcs to the cash counter and lands with a *tink*.
- Pitch rises with the combo (a pentatonic scale, so it never sounds bad), and the character's sweep speeds up with it.
- Crit taps: a bigger gold coin, a screen micro-shake (2 px, 80 ms), a heavier *clunk* and haptic `navigator.vibrate(15)` where supported.
- Dust and sparkle particles at the character's broom. A squash-and-stretch on the character for each stroke.

**Piles:**
- Units fly out in a staggered stream (20 ms apart) into the counter, each with a rising *plink*. The last one gives a satisfying *ka-ching*.
- The fresh-sale +25% label floats in gold.

**Buying:**
- The building pops up with overshoot (scale 0 → 1.15 → 1) and planks/props tumble into place.
- The glyph button depresses and fires a ring burst, and the cost text slides away.
- On MAX buys, the level number spins like a slot reel to its final value.
- Milestones: a radial gold flash on the card border, "×2" stamped like a rubber stamp, and the diorama morphs to its next tier with a dust cloud.

**Economy feel:**
- The cash counter rolls with easing, and the income/s badge briefly glows green when it rises.
- Big numbers get a one-time "NEW UNIT!" flourish the first time you cross into B, T, Qa…

**World:**
- Lots of idle life: pigeons, joggers, kids on scooters, traffic lights, day/night tied to local time (gentle, never too dark), weather drifts, and gulls in the Harbour.
- Deliveries leaving line frames and arriving in the main view is the signature "it's all real" moment.

**Life beats:**
- Moving house (a van with boxes), meeting the partner (a heart puff), births (a stork drone in Sky City; a stork before that), and retirement (warm vignette, music swell, portrait painting).

**Audio:** small WebAudio synth set (no large files): tink, plink, ka-ching, whoosh, pop, stamp, a season sting, and a mute toggle.

**Restraint:** juice scales down on Low quality and respects `prefers-reduced-motion` (no shake, fewer particles).

---

## 16. Scope: v1 vs later (ruthless)

### v1 (ship polished; target ~2 weeks of agent build)

- **5 districts, 15 businesses** (Old Town → Coast Resort), all with 3 visual tiers (L1/L25/L100). Sky City and Orbit are visible on the map and in the skyline as fogged teasers. The rival has 15 routes, so we match its count with far richer lines.
- The full line model: level, σ throughput, shelf, two themed boosts, manager, pile tapping, x1/x10/MAX.
- **15 default managers**, levels 1–10, 3 slots, **10 of the 16 items** × 5 rarities, crates and merge.
- Housing 1–6 (Bench → Mansion), age visuals (4 stages), partner, kids (talents), **pets: dog and cat**, rides up to the Sports car.
- Education: Hustle + Business + Life branches up to the Coast-tier courses (12 courses).
- Events: pigeon, celebrity, parade, wallet, bulk order, plus the **Rush Hour** mini-game.
- Contracts (districts 1–5), daily goals and gift.
- District twists: Suburbs commuter rush, Harbour tides, Downtown nightlife (Coast sunny spells in Phase 2).
- Smart-director main-view tour, single renderer with scissor viewports, and hold-to-buy.
- **Inheritance prestige** with heir choice, heirloom slot and family tree wall (the core differentiator; must be in v1).
- **Hollow's Eve** season with all 4 businesses, 25 ranks, Count Cuppula and Wanda Brew (it is live *now*).
- Achievements (~30 that apply to v1 content).
- Offline, save/export/import, quality setting and lifecycle robustness.

### Phase 2 (before Dec 1)

- **Frostbridge** Christmas world.
- Sky City (3 businesses) and its generation gate, Penthouse.
- Remaining 6 equipment items, Lucky Delivery mini-game, Food Critic / Rainy Day / Tourist Bus events.
- Parrot and goldfish pets, Weekend Market.

### Phase 3 (before Feb 7, then summer)

- Sweetheart Lane (Feb), Orbit (2 businesses), Orbital Villa, Dynasty layer with Crests, Sunny Pier (Jul).
- Wardrobe and hobbies, Spring Fair, the 4th visual tier (L250).

### Cut entirely (not worth it)

- Real-money IAP and ads of any kind; a gacha with paid currency.
- Leaderboards and multiplayer (a later br8t-account sync is possible, but not designed here).
- Character customisation editor (heir appearance is randomised from parents' palette instead).
- Negative events, needs or hunger meters (a life sim, but never a chore sim).
- Per-line worker hiring screens (the throughput glyph covers it).

---

## 17. Open questions for the manager

1. Do the main characters use the shared PolyPerfect 117-character rig (the `3d-animated-characters` skill) or a lighter custom capsule rig? The proposal assumes PolyPerfect for the hero, partner, kids and managers, with capsule crowds for customers. Architecture (P0-C) should confirm the draw-call budget with 15 line viewports.
2. Should seasonal windows use local time (proposed, friendlier) or UTC (harder to clock-cheat)? This is single-player and local-save, so the proposal is local time.
3. "Character (all games)" in the brief: interpreted as *across all generations/runs*. If Aaron means across br8t games via the shared account layer, that is a Phase 3+ hook.

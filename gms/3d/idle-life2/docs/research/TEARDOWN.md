# Teardown: Idle Transport 2 + Idle Life 1 → the bar Idle Life 2 has to clear

2026-10-03, competitor-analysis agent. Read-only pass over `gms/3d/idle-transport2/` (Codex is still working on it; the working tree had uncommitted changes, and the season copy changed between my two runs) and `gms/pwa/idleLife/`.

Screenshots: compressed copies are in `docs/research/shots/*.jpg`. The full-res PNGs and the raw report are in `/private/tmp/claude-501/idle-life2-research/`, which is temporary, plus `t2-report.json`, `shoot.mjs` and `shoot2.mjs`, the raw-CDP harness that you can reuse. I captured them live in headless Chrome with `--use-angle=metal`, at 390×844 mobile (DPR 2 and 3) and at 1440×1000 desktop.

---

## 1. Idle Transport 2 ("NIGHTSHIFT Logistics")

### Architecture
- No build step. Code is dense, almost minified, single-line ES modules: `economy.mjs` 34 KB, `scenes.mjs` 50 KB, `app.mjs` 31 KB, `tap.mjs` 3 KB, `style.css` 35 KB. Three r160 is loaded locally through an importmap.
- **One offscreen WebGL renderer.** Each visible camera renders into a viewport of the shared source buffer and is then `drawImage`-blitted into its own DOM 2D canvas: the hero plus one per row. The browser handles scroll, sticky and clipping natively. `debug.rendererCount === 1`, and `presentationCount` is the hero plus the current region's rows. The source buffer grows to the largest viewport. Rows that are off screen keep their last image and skip rendering. **This pattern is good, and we should match it or beat it.**
- Hero and rows look at the *same* cached world and vehicle transforms. Truck 0's position is the economic `progress` (0..1), so the shared world is real, not faked.
- Lifecycle handling: it handles `webglcontextlost/restored`, `visibilitychange`, `freeze`, `pagehide/pageshow`, and exposes `debug.loseContext()/restoreContext()`. **I forced a context loss and restore: it recovered (`recoveries` counter went up) and the scene was intact afterwards** (`t2-portrait-after-ctxloss.png`). The suspend/resume path is sound. Our bar is equal robustness **plus** a test on a real iOS device. They have not tested on a phone (STATE.md admits it).
- Perf: 30 fps at mobile DPR 1.75 (DPR is capped), with **475 draw calls** in portrait and **~800 at desktop** after progression. They cap at 30 fps on purpose in some modes. That draw-call count is high for a phone. Static detail is batched and instanced, but each world is still a separate scene.
- Economy is a pure module with an injectable clock, storage and RNG, plus a Node test suite (`economy-test.mjs`) and a pacing benchmark: region gates at 3.7 / 8.2 / 18.7 / 57.6 min, all routes at 78 min. Saves are sanitised hard, imports are capped, and offline credit can't double-pay. The engineering hygiene is good.

### Content and economy depth
- 5 regions with 3 routes each (15 total), gated by cash and delivery count. Route kinds: farm, quarry, timber, factory, harbor, oil, alpine, airport, space.
- Each route has production level (1–200, +12% fare per level, cost +28% per level), fleet (≤30, parallel capacity), storage (0–50, +8% fare), and a manager (hire, then level 1–5 for +5% each, with tool slots 1/2/3).
- Unmanaged routes earn 45% of the fare; managers earn the full fare plus offline income (4 h, or 8 h with research). Dispatch: +30% progress and a full fare, 1.5 s cooldown.
- Fleet policies: Steady, Express (0.8× time, 0.85× fare), Heavy (1.3× time, 1.6× fare).
- Mastery at 10/50/150/500 deliveries gives +10/20/30/50%. There are 10 research nodes (linear pairs), 11 cash-reward contracts, and prestige at $2M for sqrt reputation points (+15% each).
- Events: rush, backhaul and supply. The first fires 45 s after owning a business, then every 80–140 s, with a 25 s window and a cash-only reward of at least $80.
- Season ("Halloween Haul"): an 8-minute run with 3 emoji businesses and 6 milestones that give 6 keepsake items. The items are +8–12% fare bonuses for character, business or manager slots. Practice is always available.
- **What this adds up to: one currency, one resource, and every upgrade is just +fare% or −time%.** Storage is cosmetic: the docs say "stockRatio … is a visualization, not a separately simulated commodity". **The "output piles up if not collected/transported" requirement in the brief is faked.** Cargo never actually blocks anything. Items are flat percentages, there are no mini-games (the brief wanted manager tools earned in mini-games), and the only route to equipment is the season.

### What looks impressive
- The low-poly diorama has real shadows, a warm sunset gradient, animated trucks with loads going out and empty racks coming back, dust puffs, river glints, and a windmill. Depots visibly grow at levels 5/15/30. The first impression in `t2-portrait-fresh.png` is decent.
- Tapping the scene at the start is clear: "Tap to earn" sits on the scene, 12 taps fund the $60 grain business, and taps produce ripples, 3D sparkles and up to 2× momentum.
- Row cards are edge-to-edge 3D with floating glass icon buttons (`+🌾 +🚚 +▣ 🕴`), a progress line along the bottom border, and an x1/x10/MAX selector. Structurally this follows the brief.
- The cockpit folds the hero from 230 to 156 to 118 px as you scroll down the list.

### What looks cheap or generic (attack these)
1. **Every row is the same diorama.** The river, two stone bridges, the stadium road loop, street lamps and grey "crumpled-paper" boulder clusters repeat on every card; only the depot prop changes. Compare Golden Harvest, Timber Trail and Stone Run in `t2-portrait-fresh`. In Orbital Gateway, "Skybridge Cargo" and "Precision Corridor" rows are **green meadows with a river**, and they look the same as each other (`t2-region-aerospace.jpg`). The hero in that shot is snowy while the rows are green, so the world is not consistent.
2. **The world visibly ends.** Every row camera shows the island's edge as a beige sky wedge in its lower-right corner, which reads like a floating tile and a framing bug.
3. **The hills along the horizon are oversized grey-green low-poly blobs** that look like crumpled paper or rocks, not mountains.
4. **The upgrade buttons sit right on top of the activity.** The 4 tiles are about 120×95 px each and land in the middle of the card, on the field and truck. Add the ×1/×10/MAX row and the title and ⓘ/⌖ chips, and **each row carries 9 controls** (`t2-portrait-progressed.png`). The scene becomes a background behind a button grid.
5. ×1/×10/MAX is one global setting but is drawn **on every row**, which is redundant clutter.
6. The look is a web-dashboard theme: corporate copy ("NIGHTSHIFT LOGISTICS COMPANY / IDLE TRANSPORT 2", "THE BIG PICTURE", "MAKE YOUR MARK / A new beginning. A lasting advantage.", "SHARED WORLD / TWO PERSPECTIVES") and dark-navy cards. It reads like a SaaS landing page, not a game.
7. **The world map is a flat SVG blob with 5 dots** (`t2-portrait-world-tab`), followed by "View region →" cards. That is not a progression map.
8. **The season is a text form.** "Work the seasonal shift" is a big orange button, the businesses are emoji, and there is **zero 3D** (`t2-season-run.jpg`, 0 canvases in the panel). The milestone list is a wall of text and repeats itself ("Earn 30 shift coins for Pumpkin crate. Assigned business fares +8%." then "Pumpkin crate · Assigned business fares +8%.").
9. The manager is a 🕴 emoji in a modal with a single "Upgrade manager · $575" button (`t2-portrait-manager.jpg`). It has no portrait or identity, and its slots are empty with no way to fill them other than the season.
10. The planning area (World/Fleet/Research/Contracts/Season tabs) is a long scroll of prose under the rows. Fleet repeats a 3-way policy block for each of 15 routes.

### UX friction and bugs found
- **Floating tap text piles into an unreadable smear** ("+$+$5.8 1.2×") when you tap quickly, and it renders over the event banner (`t2-tap-feedback.jpg`).
- **The event banner covers the whole folded hero.** At 156 px the "Backhaul opportunity · 9s | Claim $81" card hides the entire scene (`t2-portrait-progressed-scrolled.jpg`). Events are DOM cards, not anything in the world.
- **The event reward is not rescaled after import or prestige.** It still shows "Claim $81" at $5.87M/sec. The description text also changed during a live event.
- **In the folded hero, the route title ("Timber Trail") is clipped under the balance bar** (`t2-portrait-season.png`).
- After the first purchase, fleet and manager show "—" instead of a price, so the player can't tell what they are saving for (`t2-portrait-first-business.jpg`). The first business earns **$2/sec**, so the next upgrade is a dead wait.
- Buying a business doesn't move the camera or play any celebration on the row. A toast is the main feedback ("Company save imported." toasts also cover the bottom row).
- Fresh portrait has 70 visible words above the fold, 13 buttons and about 200 words in total. Once you open the tabs, thousands of words appear (research, contracts, season and fleet are all prose).
- Unmanaged routes earning only 45% plus the dispatch button inside the ⓘ dialog means the dispatch/tap loop is hidden two taps deep.
- It hasn't been tested on a real phone. The desktop wastes the right third on the tab panel, and the rows are 1070 px wide stretched dioramas.

### Gaps against Aaron's brief (where they are weakest)
| Brief item | Transport 2 status |
|---|---|
| Lines and main view share one world | ✅ real |
| Progression maps (easy → hard lands) | ⚠ 5 regions as tab cards + SVG blob; no explorable 3D map |
| First business earned by tapping | ✅ 12 taps |
| Random timed events, no penalty | ⚠ cash-only DOM banner, 3 kinds, not shown in the world |
| Output piles up if not collected | ❌ **cosmetic only**, so collection never matters |
| Floating icon upgrades + toast + x1/x10/max, ⓘ for words | ⚠ done, but too big, and they block the scene |
| Manager interface with equipment from **mini-games** | ❌ no mini-games; tools only from the season |
| Seasonal side worlds on dates; permanent bonus to char/business/manager | ⚠ one text-panel season; no themed 3D variant of the world |
| Never black-screen on return | ✅ handled + recovery counter (not tested on device) |

---

## 2. Idle Life 1 (`gms/pwa/idleLife/`, "Life Idle" v2.0)

A 2D emoji clicker PWA (sw.js and manifest). It has a big tap circle ("TAP TO EARN", broom icon) and tabs for Work/Biz/Upgrades/Prestige/Stats. A spritesheet spec exists, but `SPRITE.exists=false`, so it is emoji only.
- **Character stages (8):** 🧹 Street Sweeper → 🪧 Worker ($5K) → 👔 Employee ($500K) → 💼 Professional ($50M) → 🏪 Small Business ($10B) → 🏬 Entrepreneur ($10T) → 🏛️ Corporation ($10Qa) → 🚀 Space Mogul ($10Qi). The stage is driven by lifetime coins.
- **Jobs (6, hire workers at 1.07–1.12 cost growth, each adds a click bonus):** Street Sweeper, Sign Holder, Newspaper Delivery, Fast Food, Office Assistant, Security Guard.
- **Businesses (19, max level 10–15):**
  - Small: Food Truck, Barber, Café
  - Medium: Restaurant, Boutique, Car Wash
  - Large: Luxury Hotel, Shopping Mall, Tech Company
  - Corp: Restaurant Chain, Logistics Corp, Real Estate Empire
  - Multinational: International Corp, Tech Giant, Global Conglomerate
  - Space: Space Tourism, Space Mining, Space Megacity
  - Galactic: Galactic Corp
- **Upgrades:** 5 tap multipliers (2/2/3/5/10×), 2 per job (2× and 5×, e.g. Better Broom → Industrial Sweeper, Electric Bike → Drone Delivery, AI Copilot), 1 per business (Signature Menu, Michelin Star, Rooftop Bar, VIP Shopping, IPO…), and 4 global (Market Expansion, Investor Relations, Tax Optimization, Galactic Trade Routes).
- **Prestige:** unlocks at $100M per run. Stars = floor(log10(earned/1e4)×4), and each star gives +10% to income and taps.
- **Achievements (23):** lifetime earnings $1K…$1Qa, workers 10/50/200, taps 100/1K/10K, businesses 1/5/all, upgrades, max level, prestige 1/3/10, Space Age, Galactic.
- **Events (4, a scrolling banner every 90–210 s with a 15 s window):** Investment 2× income for 5 min, Going Viral 3× taps for 2 min, Tax Break (60 s of income instantly), Market Boom 5× for 1 min. Its events are *buffs*, which are more interesting than T2's flat cash.
- Offline earnings are capped at 8 h, and there is a milestone toast at each order of magnitude ("TRILLIONAIRE! Governments notice you.").

**What to carry forward:** the **rags-to-space life arc** is the theme and the differentiator. Transport 2 is "a company"; Idle Life 2 is **a person**. That gives us:
- a visible avatar that changes outfit and vehicle by stage, with the home growing from a bedsit to a penthouse to an orbital habitat
- jobs as a tap/active tier that comes before businesses
- the business tiers mapped onto lands (Street → Downtown → Coast resort → Skyline/Corporate → Orbit → Galactic)
- buff-type events
- the funny milestone lines
- a prestige that reads in life terms ("retire / new generation / heir") rather than as an abstract reset

---

## 3. Bar to beat: testable statements

Each line reads: Transport 2 does X; Idle Life 2 must do Y.

**Visuals**
1. T2 rows reuse one river/bridge/road diorama. **IL2: every business line has its own composition, silhouette and palette.** Test: a blind critic shown 6 row crops with titles removed matches ≥5 of them to the correct business.
2. T2 row cameras show the world's edge and sky wedge. **IL2: no row or hero frame at any width (320–1440) shows world edge or void.** Test: corner-pixel sampling in automated captures, which must be scene colour and never background.
3. T2's late regions reuse meadow assets. **IL2: each land has its own ground, sky, props and lighting.** Test: the average-colour histogram of the hero differs between lands by more than a set threshold, and a blind critic names the land.
4. T2's hero and rows disagree (snow hero, green rows). **IL2: the hero is literally the same location as the row it focuses on.** Test: the snapshot API shows the same actor positions, and a visual diff confirms the matching landmark.
5. T2 has humans only as an emoji. **IL2 has visible characters at work**: the player avatar plus workers and customers, either the shared rigged PolyPerfect people or a stylised crowd. The avatar changes across ≥6 life stages.

**Juice and feel**

6. T2's tap text smears into a pile. **IL2's floating numbers stack and fan out legibly, at most N on screen.** Test: 10 taps in 1 s, then OCR or bounding boxes show no overlap above 30%.
7. T2's purchases give a toast and nothing else. **Every IL2 purchase changes something visibly in the 3D line within 1 s** (a new worker, vehicle, building tier or pile size), plus a short sparkle/sound and an icon tooltip-toast. Test: a screenshot diff of the row before and after a buy exceeds a threshold.
8. T2's piles are cosmetic. **IL2's output really accumulates as countable 3D props**, so an uncollected, unmanaged line visibly overflows and stalls. Tapping the pile or the line collects it with burst feedback. Test: with no manager the line's income falls to zero at capacity, and the pile prop count tracks the stock state.
9. T2's events are DOM cards that hide the hero. **IL2's events appear in the world** (a VIP customer walks in, a delivery drone lands, a golden crate drops) **and are tapped in the scene**. A compact badge is allowed, but it must never cover more than 25% of the hero at any fold height.

**Onboarding**

10. In T2 the first business gives $2/s and the next price is "—". **IL2 shows the next buy's price at all times and reaches a second meaningful purchase within 20 s of the first.** Test: a scripted fresh run measures the time to purchases #1, #2 and #3, with a target of ≤90 s total and no wait longer than 30 s.
11. T2 teaches with a "Tap to earn" hint and a guide modal. **IL2 teaches through in-scene pointers only**, with no text tutorial screens. The fresh screen has **≤30 visible words above the fold** (T2: 70), and every word that isn't a number is reachable through ⓘ.

**Economy depth**

12. T2 has one currency and every upgrade is a ±%. **IL2 adds at least one real second-axis decision per line** (e.g. a stock/collection bottleneck, plus staff speed versus capacity) and **≥3 currencies or resources with distinct uses** (cash, prestige, season tokens, plus mini-game parts). Test: a pacing sim shows that different upgrade priorities lead to measurably different optimal orders per land.
13. T2 has 15 routes and a pacing curve tested only by an optimistic bot. **IL2 ships a Node sim with the same injectable clock** that reports time-to-each-land for both a greedy bot and a "casual" bot, ≥6 lands with ≥18 lines in total, no stall over 5 min in the first hour, and first prestige between 45 and 90 min.
14. T2's events are cash-only. **IL2's events include timed buffs** (Idle Life 1's 2×/3×/5× set) as well as cash and rare items, and never a penalty.

**Meta-progression**

15. T2's managers are emoji with 5 levels and empty slots. **IL2's managers are named characters with portraits or 3D figures, levels, traits and 2–3 equipment slots**, and the slots can be filled from **mini-games**. Test: ≥2 playable mini-games, each 30–90 s, that each drop equipment.
16. T2's season is a text panel. **IL2's seasonal side world is a 3D re-skin of real lines** (Halloween lighting and props on the same scenes) with its own short progression and a reward track. **Permanent rewards are assignable to character, business or manager.** Test: the season view renders ≥1 WebGL view, and date gating works with an injected clock.
17. T2's map is a flat SVG blob. **IL2's progression map is a 3D (or at least illustrated and animated) world map** with locked lands visible and teased, and unlocking a land plays a fly-over reveal.
18. T2's prestige reads "A new beginning. A lasting advantage." **IL2's prestige is themed in life terms** (retire and pass the empire to an heir, for example) and has a visible meta tree with ≥10 nodes, not one flat %.
19. Idle Life 1 had 23 achievements and T2 has 11 contracts. **IL2 has ≥30 achievements and collections** that persist through prestige and appear somewhere in-world (a trophy shelf in the avatar's home, for example).

**Mobile UX**

20. T2 puts 9 controls on each row and repeats ×1/×10/MAX on every row. **IL2 has ≤5 controls per row**, and the global quantity toggle appears **once**. Upgrade icons are ≤56 px (with a 44 px hit area) and sit along the bottom edge, so **≥60% of the row's scene area stays unobstructed.** Test: summed control rects divided by the row rect must stay at or below 40%.
21. T2 has a long prose tab panel under the rows. **IL2's meta screens are icon-first sheets**, with ≤40 words per screen and details behind ⓘ.
22. T2 clips the folded hero's title under the HUD. **IL2's layout test asserts no text overlap between HUD, hero title and banners** at 320, 390 and 430 widths, every fold height, and desktop.
23. T2 gives desktop a stretched 1070 px diorama plus a sidebar. **IL2's desktop layout is designed on purpose**: a bigger hero, a 2-column grid of lines, and the meta panel as a docked sheet. A blind critic must score it at least as high as the portrait layout.

**Robustness and performance**

24. T2 runs ~475–800 draw calls at 30 fps and hasn't been tested on a phone. **IL2 needs ≤250 draw calls in portrait with 3 rows plus the hero, and a sustained 60 fps on M-series Metal headless at DPR 2** (30 fps fallback tier). Also: a context-loss/restore test, a visibility-hidden-for-60-s test and a bfcache pageshow test, all with no black frames (mean frame luminance > threshold after resume), plus one real iPhone Safari check before shipping.
25. T2 has cash-only events, rewards not rescaled after import, and offline earnings only with managers. **IL2 recomputes event values from the live state when claimed**, its offline report credits honestly in one place with a capped, visible summary, and it has save-migration tests from the start.

---

## Screenshot index
| File | Shows |
|---|---|
| shots/t2-portrait-fresh.jpg | Fresh portrait: hero with tap hint, 3 near-identical rows |
| shots/t2-portrait-first-business.jpg | After the $60 buy: $2/s, "—" prices, button grid over the scene |
| shots/t2-portrait-progressed.jpg | 9 controls per row, event card over the hero, toast over the rows |
| shots/t2-portrait-progressed-scrolled.jpg | Event banner fully covers the folded hero; flat SVG map |
| shots/t2-tap-feedback.jpg | Floating tap text pile-up over the banner |
| shots/t2-season-run.jpg | Season = text form with emoji, no 3D |
| shots/t2-portrait-manager.jpg | Manager = emoji + one upgrade button |
| shots/t2-desktop-progressed.jpg | Desktop: stretched rows, sidebar tabs |
| shots/t2-region-aerospace.jpg | (T2's own capture) late-game "space" rows are green river meadows |

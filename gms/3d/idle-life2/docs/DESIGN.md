# Idle Life 2 — DESIGN (manager's ruling, v1)

This is the binding design. Detail lives in the research docs. Where they disagree, **this file wins**:
- research/DESIGN_PROPOSAL.md (DP): the dioramas in §5.2, the manager roster, the Hollow's Eve content and the juice list in §15 still apply unless overridden here.
- research/DESIGN_CHALLENGE.md (DC): its R1–R4 fixes and Hooks A/B/C are adopted as below.
- research/ARCHITECTURE.md (ARCH): the technical contract (see CONTRACT.md).
- research/TEARDOWN.md: the bar-to-beat list against the rival. Every item on it is a requirement.

## 0. One line
You live one life, then hand the town to your child. A charming low-poly 3D town where every number has a body. Each business is a live diorama you can watch working. Your character visibly grows up, moves house, has a family and retires, and **the town remembers every generation**.

Pillars (from DP §1, unchanged):
1. Every number has a body.
2. One world.
3. Words cost money.
4. Never punish.
5. Unfold, don't dump.

Added pillar 6: **life outranks business.** When a life beat happens (moving house, meeting the partner, a birth, a kid growing up, retirement), the director cuts to it even when the view is pinned.

## 1. Rulings on the disputes
| Topic | Ruling |
|---|---|
| Piles (DC R1) | **Real stock, no babysitting.** Production P; sales σ starts at 60%; the rest fills the shelf. **The shelf base is 3 min of output.** **Tapping a pile sells it at ×1.0**: you tap to rescue output, there's no bonus. Every σ upgrade also adds **×1.1 price**, so an upgrade is never worse than tapping. **Return harvest:** the first pile tap on a line after time away pays **×1.5** on that pile, once per away interval. An unmanaged line produces into its shelf only. |
| Tapping (DC R2) | The scene tap value is set so that **max combo tapping ≈ +1× income/s**, which means an active player earns about 2× an idle one. **Hard target: active ≤ 2.5× idle at every stage**, checked by sim. Crit 3% ×5 is cosmetic-heavy. No rides in v1. No butler auto-tap. |
| Bootstrap (DC §2.3) | You wake on the bench. Cans are scattered around. Tapping picks one up (each tap is a pickup), and they **pile next to you**. Tapping the recycling bin cashes the pile, which teaches the pile verb. **First stand $50 in ~25–40 s.** No idle income before the first purchase. |
| Age & life beats (DC R3) | Age is driven by **life progress, not raw $**: each life milestone advances age (18 → about 60–70 at retirement). Beats in order: Bedsit → Apartment (**partner ~10–15 min**) → Starter House (**first kid ~25–35 min**) → Family Home (2nd/3rd kid). **Kids grow visibly**: baby → toddler → kid → teen, who **works one of your lines in the diorama**. The heir's **talent comes from the line they worked longest** (DC Hook B). Ageing is never a penalty. |
| Education (DC R4) | **Cut from v1.** v1.1 may add "Family Knowledge" (persists across generations). |
| Retirement | Unlocks once the first kid is a teen **and** Harbour is open. The first retirement pays at least **×2 income** (a reward floor). Preview always visible. Recommended glow at ≥ +100%. Fast ceremony after the first time. |
| The town remembers (DC Hook A) | Each retired generation leaves a **landmark** in the shared world: their best business gets a heritage plaque ("EST. GEN 1", +5% that line forever), a statue in the square, and their house becomes "Grandma's House" (a family museum, +2% global). The heir wakes on the same bench in a town full of their family's history. |
| Postcard (DC Hook C lite) | A 📷 button frames a director shot with name, age and generation, and saves a PNG. Offered automatically at life beats (non-blocking chip). The Life Reel is v1.1. |
| Directed main view | Smart director (DP §0.5 #2) plus pin plus life-beat cut-ins. Tapping a plot in the main view scrolls to its card. |
| Line cards | Edge-to-edge live diorama, ~16:7 (or taller on desktop). Badge bottom-left (`Lv 37 · $1.2K/s`), ⓘ top-right, 📌 when 2+ lines. **At most 4 floating glyphs:** `⬆` (level, honours x1/x10/MAX, hold-to-buy) · the next **themed throughput** glyph (e.g. `+🧍`) · the next **themed boost** glyph (e.g. `+🧊`) · `🕴`. The shelf and everything else sit in the ⓘ sheet. Progress = bottom border (shimmer on fast cycles). **Calm lines collapse** to a slim live strip (~64 px) when the player opts in via settings "Compact calm lines" (default ON from 6+ lines). A line expands when it wants you: pile ≥ 80%, an affordable glyph, an event, a milestone close. |
| Tabs | At most 5, each revealed by play: 🏪 Lines · 🗺️ Town · 🏠 Life · 🕴 Crew · 🏆 Goals. ⚙️ sits in the HUD. Seasonal 🎃 is a floating HUD button. |
| Districts (DC §2.2) | Each district adds **one new verb** instead of time-window multipliers: **Suburbs: deliveries** (couriers cross the town; tap one en route = an instant small bonus). **Harbour: supply links** (Fish & Chips gets ×1.5 while the Boatyard/Ferry link van runs; physical van on the road). **Downtown: night shift** (pick 2 lines that earn ×2 from 18:00 to 06:00 local, including offline). |
| Managers | 12 default plus seasonal ones. Levels 1–5 (cash + 🎟️). Slots: 1 at Lv1, 2 at Lv3. Traits from DP §6.1, capped and simple. **Managers and items persist across generations** ("they work for the family"). An **Auto-equip best** button. |
| Equipment | 6 items × 3 rarities (Common/Rare/Epic). Merge 3 → 1. Crit chance capped at 15% total. Sources: Rush Hour, contracts, season ranks, daily gift, achievements. |
| Character keepsakes | "All games" = **across all generations and side worlds in Idle Life 2**. Keepsake data gets stable IDs and a `crossGame` flag so it can sync through /lib/auth later. |
| Characters | A custom procedural chibi crowd rig (ARCH §7.4). No PolyPerfect. |
| Time | Local time for seasons, night shift and day/night. Clock-back guard (max-seen timestamp). |

## 2. v1 content
- **4 districts, 12 businesses:**
  - Old Town: 🍋 Lemonade · 🌮 Food Truck · 💈 Barber
  - Suburbs: ☕ Café · 🧽 Car Wash · 🐩 Pet Salon
  - Harbour: 🐟 Fish & Chips · ⛴️ Ferry · ⛵ Boatyard
  - Downtown: 👗 Boutique · 🍝 Bistro · 💻 App Studio
  - Coast Resort is visible as a fogged teaser across the bay ("coming soon" lock). It is **stretch P5** only after the 12 pass critic review.
- **Each business:** a DP §5.2 diorama, **3 visual tiers** (L1 / L25 / L100) as additive prop kits, themed throughput and boost glyphs, a named manager, and a stock pile that matches its theme.
- **Homes:** Bench → Bedsit → Apartment → Starter House → Family Home → Mansion (6). Each is visible in the main scene, with an animated removal-van move. Housing gives a global ×, offline cap 1 h → 8 h, and unlocks a life beat.
- **Family:**
  - Partner: choose 1 of 3 at a café table meet event; cosmetic + 1 perk.
  - Up to 3 kids who grow up on screen.
  - One dog (fetches some golden pigeons; inheritable).
- **Events (diegetic, in-world, no penalty):**
  - 🕊️ golden pigeon
  - ⭐ celebrity limo (one line ×7 for 30 s)
  - 🎺 parade (all ×2, 60 s)
  - 👛 lost wallet (🎟️)
  - 📦 bulk order
  - ⏰ **Rush Hour** mini-game: the card zooms; tap glowing customers for 15 s; the crate tier depends on score. It is the main item source and never gates progression.
- **Goals:**
  - 4 district contracts per district (they gate permits, and are **once per family**: an heir finds districts reopened instantly, "the bridge is already built").
  - 3 daily goals.
  - A 7-day gift that **pauses** if you miss a day.
  - ~25 achievements (+1% each).
- **Prestige "Pass it on":** choose an heir (kid cards with talents), one heirloom, and a portrait on the family wall (+1% each). Legacy points come from lifetime earnings. Landmarks appear (§1). Starter cash.
- **Season: 🎃 Hollow's Eve (Oct 1 – Nov 2, live now):**
  - Old Town **at night** as a side world, using the same plots with a skin.
  - 3 variant lines: Witch's Brew, Pumpkin Pie Wagon, Haunted Haircuts.
  - Candy token.
  - **12 ranks** with permanent keepsakes assignable to Character / Business / Manager.
  - Count Cuppula as a seasonal manager.
  - Witching Hour from 18:00 to 24:00 (×2 candy).
  - On Oct 31, trick-or-treaters appear in the main town.
  - It is built from day 1 in parallel.
- **Juice:** DP §15 in full (coin arcs, pentatonic combo, squash/stretch builds, milestone stamps, rolling counter). WebAudio synth SFX with a mute toggle. `prefers-reduced-motion` respected.
- **World life:** pigeons, joggers, traffic, gulls, and a day/night cycle tied to local time (never too dark).

**Cut from v1:** education, rides, butler, Sky City, Orbit, Coast (stretch only), the Dynasty layer, Weekend Market, Life Reel video, neighbours, branching specialisations, and the other seasons. A **Christmas "Frostbridge" season is planned for P6, before Dec 1.**

## 3. Economy constraints (the economy lane proves these with tools/sim.mjs)
- The sim models the **full multiplier stack** and runs an **active** profile and an **idle-only** profile side by side.
- Falsify the sim first: plant the R1 bug and confirm the sim flags a negative-return upgrade.
- **Life 1 targets:**

  | Milestone | Target |
  |---|---|
  | First stand | 25–40 s |
  | Food Truck | ~1.5 min |
  | Suburbs | ~5 min |
  | Harbour | ~15–20 min |
  | Downtown | ~40–50 min |
  | Retire available | ~45–60 min |
  | Retire recommended | ~75–90 min |

- Gen 2 reaches Downtown in about 15 min and goes about 1.5× further.
- No dead gaps over ~4 min without a new purchase type or beat in life 1.
- No upgrade may have a negative return for either profile.
- Active income ≤ 2.5× idle.
- Offline: managed lines earn σ·P for min(away, cap); credited once per away interval.

## 4. Visual bar
**Aaron, 2026-10-03 (latest, overrides below): low-poly is NOT a goal in itself — looking great is. Hard perf target: runs well on his Samsung S22 Ultra (Adreno 730) in PORTRAIT.** FACET is a toolkit to borrow from (anti-blocky shapes, batching, lighting), not a mandated style. The look follows refs/ (concept stills) like HEIRFRAME, which ran PBR + env map + shadows + bloom on the S22 at ~1.5 DPR. Default quality = high on S22-class devices.
**Aaron, 2026-10-03: the scaffold's boxy placeholder art "looked like a 3yo designed it". Great-looking graphics are a hard requirement, not polish.**
- **Foundation = FACET** (`gms/3d/facet/`, AAA low-poly isometric test bed, 16 draw calls / 60 fps at the phone gate). Port its anti-blocky kit (`js/world/shape.js`, `palette.js`, `batch.js`, `lighting.js`, `terrain.js`, `rng.js`) into `js/render/kit/` and build EVERY plot through it. Read `facet/CLAUDE.md` and the style bible `~/cc/yru/gms/3d/aaa_refs/refs/lowpoly/CRAFT.md` (refs stay outside the repo — never copy them in).
- Hard bans (from CRAFT): no raw BoxGeometry, nothing axis-aligned/plumb, odd radial segments, everything tapers, no cube-ish props, no grey AmbientLight, fog = sky colour.
- One shared directional shadow map IS allowed (FACET's lighting rig) — supersedes ARCH "no realtime shadows" for mid/high tier; low tier keeps blob shadows.
- **Workflow = HEIRFRAME's** (Aaron's favourite result, gms/3d/heirframe/): concept stills in `idle-life2/refs/` are THE target; `tools/artgate.py` (ported from heirframe) measures shots vs ref crops; blind side-by-side critic rounds run by independent agents (self-scores run 1.5–2 high). Tone mapping, gentle bloom on emissives, glass/water sheen allowed if measured (heirframe D18: quality AND efficiency together).
- Every plot is judged by a blind critic (`facet/tools/compare.mjs` pattern) against the lowpoly ref plates and the Flux concept stills; a plot ships at ≥ 8/10.
- Tiny Glade / Townscaper / Pocket City charm: warm, saturated pastel, flat-shaded chunky low-poly.
- Vertex-colour AO and blob shadows. Soft sky gradient. Gentle bloom-free glow via emissive colours.
- **No grey boxes on screen at ship.**
- An art-direction agent produces concept stills with local Flux (:7867) as the target look.
- A blind critic compares our frames against those stills **and** against rival screenshots. The rival must lose.

## 5. Phases (manager)
- **P2a Scaffold:** stubs of every contract module, main.js, boot guard, tools/cdp.mjs, test-boot. Every lane boots end-to-end.
- **P2b Lanes in parallel:**
  - L1 Economy + sim
  - L2 Render core + lifecycle
  - L3a Art direction + kit + Old Town/Suburbs plots + home/characters
  - L3b Harbour/Downtown plots + Hollow's Eve skin
  - L4 UI
- **P3 Integration**, then adversarial reviews:
  - blind visual critic vs rival
  - fresh-eyes player (plays 30 min via CDP and reports boredom and confusion)
  - economy auditor
  - mobile/lifecycle breaker
- **P4 Fix rounds** until the critics score ≥ 8. Screenshot, register, commit, push, verify the deploy.
- **P5 Stretch:** Coast. **P6:** Frostbridge.

## 6. Teardown-driven additions (research/TEARDOWN.md bar-to-beat list is binding)
- Two mini-games in v1: ⏰ Rush Hour + 🎁 Lucky Delivery (runaway parcel bounces across the hero; tap it 3× → item). Both drop manager gear.
- 🗺️ Town tab is the **3D world** (hero camera pulls back to an establishing shot of all districts; tap a district/plot to fly there) — never a flat SVG.
- No frame (hero or card) ever shows the world's edge or sky wedge; each card camera is framed by its plot module and verified by screenshot.
- Every line diorama must be distinguishable by a blind critic from its silhouette alone.
- ≤ 5 controls per card; ≥ 60% of card scene unobstructed; < 30 words above the fold on a fresh start.
- Floating tap numbers merge/aggregate under fast tapping (never a smear). Event chips never cover the hero.
- Event rewards always scale with current income. Draw calls ≤ 250 at 60 fps (desktop Metal).

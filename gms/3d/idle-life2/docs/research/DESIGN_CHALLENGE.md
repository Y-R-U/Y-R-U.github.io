# Idle Life 2: design challenge (P0b)

An adversarial review of `research/DESIGN_PROPOSAL.md` and of Aaron's brief in `MANAGER_STATE.md`. Written 2026-10-03 by a reviewer who did not write the proposal. TEARDOWN.md did not exist yet, so rival claims below were checked directly against `gms/3d/idle-transport2/README.md` and `docs/ECONOMY.md`.

**Bottom line.** The proposal has a real soul: a life story, inheritance, and one shared world. Three things undermine it, though. Its core pile mechanic punishes the upgrades it sells. Its life story runs out of order, so the emotional beats land at the wrong time. And its v1 scope is roughly three times what can ship polished. Under the life-sim skin, its skeleton is also mostly the rival's skeleton. The fixes are below, ordered by how much damage each problem would do.

---

## 1. The ten biggest risks

### R1. The pile maths makes throughput upgrades lose money (an economy hole)
§2.1 sets line income to σ·P, sends the remaining (1−σ)·P to the shelf, and pays a tapped pile at ×1.25.

- **Active player at σ = 50%:** 0.5P + 0.5P × 1.25 = **1.125P**.
- **Same player after buying all five 🧍/🚚 throughput upgrades (σ = 100%):** **1.0P**.

So **every throughput purchase cuts an active player's income**, and the 📣 Megaphone (σ above 100%) is a pure loss. Taco Tom (+40%), Grip Gloves, the Magnet item and Dev Kai's auto-tap make the inversion worse.

The "never a loss" framing is also spin. A full shelf throttles production, so an unattended line forfeits (1−σ) of its output. With a 30 s base shelf, that means one tap per line every 30 s, across 15 lines. This is Idle Miner babysitting, and it breaks pillar 4 ("never punish").

**Fix:**
- A tapped pile sells at **×1.0**. The reason to tap is to avoid waste, not to earn a bonus.
- Base shelf becomes **3 min**, not 30 s.
- σ upgrades also carry a small price multiplier (×1.1 each), so they are never worse than tapping.
- The "fresh" moment moves to **the return-from-offline harvest**: the first sweep of full piles after time away pays a one-off ×1.5. That rewards coming back, not hovering.

### R2. Tapping beats idling by about 10× in the mid-game
§11.1 sets tap value to 3% of income/s, multiplied by combo ×2, ride (up to ×16 by the v1 Sports car, ×128 by the Shuttle), Street Smarts ×2, the Witch's Broom ×2, the Pumpkin hat and crits.

At 2.5 taps/s that comes to about **4–10× passive income**. The Mansion butler then adds about 2× passive income for free.

An idle game where not tapping costs you 90% of your income becomes a repetitive-strain-injury simulator. The rival is also tap-heavy (half a second of income per tap, ×2 combo, ×4 research), so this copies its flaw.

**Fix:**
- Cap tap income at **about 1× income/s at full combo**, so an active tapper earns roughly 2× an idle one.
- Rides become cosmetic and change how the main scene feels, not the maths.
- The butler gives an offline-cap bonus, not auto-taps.

### R3. The life story arrives in the wrong order, so the first retirement has no heir
Age is 18 + 3.5·log10(lifetime $). Lifetime has to exceed what you have spent, which gives these earliest ages:

| Beat | Requires | Earliest age |
|---|---|---|
| Partner | Starter House, $40M | ≈ 45 |
| Kids | Family Home, $15B | ≈ 54 |
| Retirement unlocks | age 55 | 55 |

So a first-time retiree at the proposal's 40–50 min mark usually has **no kids**, and gets the "distant cousin" fallback. When kids do arrive, they arrive minutes before retirement, as babies who instantly inherit.

The core differentiator's emotional payoff fails on its first and most important showing. In generation 2 and later, legacy multipliers rush the heir from 18 to 55 in about 10 minutes. Every life beat then fires in a burst and turns into skip-fodder.

**Fix:**
- Reorder the beats: partner at the Apartment (~age 28–32), kids at the Starter House (~35–40), Family Home becomes "bigger family / grandkids".
- Kids **visibly grow up** in the main scene (see Hook B).
- Age keys off **progress relative to the family's frontier** (districts and milestones this life), not raw log-dollars, so each life spans a similar emotional arc.
- Ceremonies get a fast version after their first viewing.

### R4. Education timers outlive the lives they belong to
Life 1 is about 2 h, and generation 2 reaches Downtown in about 7 min. The courses do not fit inside that:

- The Business branch path takes about 5.3 h (2 m + 15 m + 1 h + 4 h).
- MBA takes 4 h, the PhD 8 h and Estate Planning 6 h.
- Education **resets on retirement**.

The deep courses will almost never finish inside the life that started them. They get wiped, or players learn to avoid retiring, which fights the prestige loop. An appointment loop only works when the appointment survives.

**Fix:** education becomes **family knowledge that persists across generations**, with courses sized to a session. This also makes the Study tab a long-arc system instead of a reset chore. Alternatively, defer it entirely (see §4).

### R5. Scope: v1 is about three games
v1 lists:

- 15 bespoke animated dioramas × 3 tiers (45 scene states)
- 15 managers with traits
- 10 items × 5 rarities, crates and merge
- 6 houses with move cutscenes, partner, kids, 2 pets and rides
- 12 timed courses, 5 events plus a mini-game, contracts, daily goals and gift, ~30 achievements
- 3 district twists, the smart director, Inheritance
- a 4-business seasonal side town with 25 ranks

All of that is "~2 weeks". The rival's 15 lines are one archetype: vehicles moving goods between sites. Ours are 15 *different* animation rigs: a mesh-swapping haircut, a surfer on a wave, an elevator in a hotel shaft. The rival's own REVIEW.md had to fix overlay clutter and cargo pop-in on a far simpler scene set.

Polish dies first. A half-animated Surf School looks worse than the rival's working combine.

### R6. A line card can't hold everything the proposal puts on it
At 390 px wide and 16:7, a card is about 170 px tall. The proposal puts all of this on it:

- a badge
- ⓘ and 📌
- **6 glyph buttons**, each with a cost label
- the cycle border
- the pile

Measured against 44 px touch targets, the glyph row alone fills the card. The rival's review already logged "Overlay cards and bulk controls hid production".

The bottom bar also has **8 tabs**, plus a seasonal button, a contracts chip, daily goals and the HUD. The UI chrome then becomes the main thing on screen, burying the "minimal words" pillar.

**Fix:**
- At most **3 glyphs per card**: ⬆, one **smart slot** that shows whichever non-level upgrade is the best buy now, and 🕴.
- The full list goes behind ⓘ.
- At most **5 tabs**: Lines · Town · Life · Crew · Goals.

### R7. The mid-game wall in life 1, and replay tedium in later lives
The proposal's own sim shows long empty gaps in life 1:

- Harbour (5:50) to Downtown (27:40)
- Downtown to Coast (1:57)
- the sim ignores the 4-contract gates, which lengthen both

Each gap is long stretches of only number growth. The retire button meanwhile sits at 55, paying about **15 LP (×1.31)**. A player who presses it the moment it unlocks feels robbed.

From generation 2 on, the problem flips: you re-buy Old Town in seconds, and you redo the same contracts every life ("Move into the Bedsit", "Buy a Bike"). The bridge, move and permit cutscenes replay too.

**Fix:**
- Contracts are **one-time per family**. Districts already opened by an ancestor reopen instantly ("the bridge is already built").
- Gate the retire button on a reward floor (first retirement pays at least ×2), not on age.
- Put a new *mechanic*, not a multiplier, inside each long gap (see §2, point 2).

### R8. Too much of the rival's skeleton
These parts are near-copies of Idle Transport 2:

| Proposal | Rival |
|---|---|
| Tap to earn the first business ($50, ~20 s) | 12 taps for $60 |
| Combo ramps to ×2 at 20 chained taps | Combo ramps to ×2 at 20 taps |
| Auto-tour every 10 s, 📌 pin | Every 12 s, pin |
| HUD folds on scroll | HUD folds on scroll |
| x1 / x10 / MAX | x1 / x10 / MAX |
| Storage track | Storage track |
| Manager levels, slots unlocking 1/2/3 | Manager levels, slots unlocking 1/3/5 |
| Character / Business / Manager keepsakes | Character / Business / Manager keepsakes |
| Contracts | Contracts |
| Flat research | Flat research |
| Claim-for-reward random opportunities | Claim-for-reward random opportunities |

The proposal's comparison table also **understates the rival**:

- Its Halloween has **year-round Practice** with the same rewards, so it is playable today; "not live today" is misleading.
- It has **operating policies** (Steady / Express / Heavy), which is a real per-line decision; we have none.
- It has **route mastery**.
- Its lines are not all "truck drives A→B": the README describes saws, cranes, pumps and a combine.

Our genuine differentiators are inheritance, the life layer and the one-world renderer. The design should **lean everything into those**, not into more systems of the same kind (more items, more rarities).

### R9. Manager equipment is Diablo inventory on a phone, and nobody will read it
The planned system is 16 items × 5 rarities × 20 managers × 3 slots. Most items are micro-stats players will never parse: Wrench +0.05 milestone, Briefcase +5% contracts, Thermos, Top Hat, Shades, Lucky Bear +1% to everything.

Stacking is also unbounded. For example, Clover ×3 Legendary (+18%) plus Hex (10%) plus Lucky (5%) gives a crit chance of about 33%. At ×10 (Rocky Ore) that multiplies one line's income by about 4.

**Fix:** v1 ships 6 items × 3 rarities, an **auto-equip best** button, and a hard cap on crit chance (15%).

### R10. Mobile performance, the PolyPerfect rig, and the seasonal deadline
**One renderer with scissor viewports is right.** It has two traps:

- DOM-to-viewport rectangle sync lags during iOS momentum scrolling, so the diorama visibly slides under its card.
- The "whole town" establishing shot draws every plot's actors.

**Skinned PolyPerfect characters** compound this. The proposal puts an 80-bone rig on the hero, partner, kids and 15 managers, each drawn into 3–4 visible viewports plus the main view. The rig also needs the obfuscated asset-pack treatment in a public repo. And ageing visuals (grey hair, cane) need custom parts anyway.

**Hollow's Eve ends Nov 2.** A 2-week build ships around Oct 17–20, leaving under 2 weeks of season. The proposal designs it for 7–10 days of 20–30 min sessions. One slip and the season's whole 25-rank ladder becomes dead content until next October.

---

## 2. Where Aaron's brief is weaker than it could be

1. **"Each list line is its own mini Three.js scene."** The proposal fixed the context-count problem with one renderer and scissor viewports. The deeper issue is that a 15-row scrolling list of 3D cards mostly shows 3D *flicking past*.
   - **Better:** cards for lines that need nothing collapse to slim 60 px strips (still live 3D, cropped to the action). Lines that want you (full pile, milestone near, event) expand to full height.
   - That keeps the list short and the 3D meaningful. Tapping a plot in the main scene should also scroll to its card, so the world is the navigation.

2. **"Start easy, unlock harder areas."** The proposal's answer is bonus-only time-window multipliers (commuter rush 7–9 a.m., tides ×1.5). Nobody notices a ×1.5 that fires while they are asleep.
   - **Better:** each district introduces **one new verb**. All of them are bonus-only, but they are *felt*:
     - **Suburbs: deliveries.** Couriers physically cross the town, and tapping a courier en route speeds it.
     - **Harbour: supply links.** The trawler's pile feeds Fish & Chips; a linked line gets ×2.
     - **Downtown: day/night shifts.** Choose which lines run the late shift. This answers the rival's Policy system.
   - This also makes "one world" mechanically true, not only visual.

3. **"First business is NOT free; tap the scene."** It's good, but 20 s of sweeping teaches nothing.
   - **Better:** the bootstrap *is* the first pile. You collect cans into a pile and tap the recycling bin to cash them. The pile verb is taught before the first business exists, and the first business then feels like an upgrade to something you already understand.

4. **"Output piles up if not collected/transported."** This is right in spirit, but read literally it produces R1's babysitting.
   - Piles should matter at **return moments and during events**, not every 30 s (see the R1 fix).

5. **"Managers have equipment earned in mini-games."** Equipment is a weak fit for a *Life* game.
   - **Better:** managers grow through **friendship and years of service**. They age alongside you, retire, and can be succeeded by their own kid, who keeps the trait. Equipment can stay, but it is small (see R9).
   - The emotional version of a collectible is a person who was with your family for three generations.

6. **"Seasonal bonuses assignable to character (all games)."** Most likely this means *across br8t games*. `/lib/auth/` (auth, cloud, localsync) already exists for exactly this.
   - **Better:** keep the gameplay bonus local. Add a **cross-game cosmetic badge or title** synced through the shared account, which is cheap and something the rival does not do. Confirm the meaning with Aaron.

7. **"Timed highlight cycling."** The proposal's smart director is the right fix. Add one thing: the director **cuts to a close-up on a life event** (wedding, birth, move) the moment it happens, even when pinned. Life outranks business.

---

## 3. Hooks: the thing a player shows a friend

| # | Idea | What it is | Effort | Payoff | Verdict |
|---|---|---|---|---|---|
| A | **The town remembers** | Each retired generation leaves a permanent mark on the shared world. Grandma's stand becomes a heritage landmark with a plaque "EST. GEN 1" and a small permanent bonus. A street is renamed after her, and her statue goes in the square. Your old house becomes a family museum. The heir wakes on the same bench in a town full of *your* history, so prestige stops feeling like deletion. | M | Very high | **v1.** It is the single best answer to "why is this better than Transport". |
| B | **Kids grow up on screen and work your lines** | Kids appear as toddlers, then teenagers helping at a stall, then adults. A kid's talent comes from **where they worked**: the kid who helped at the Food Truck becomes a Chef. Choosing an heir becomes the consequence of what you watched, not a random roll. | M | High | **v1** (it pairs with the R3 reorder). |
| C | **Life Reel** | At retirement, the engine replays your life in 20 s: bench → stall → each house → wedding → kids → rocking chair. It is rendered from logged milestone snapshots (tier states plus a camera path), with a "Save video" button through `MediaRecorder` on the canvas. | M | Very high (the shareable artefact) | **v1.1.** Ship the cheap version in v1: a **Postcard** button that frames a director shot, overlays name, age and generation, and saves a PNG. |
| D | **The regulars** | About 12 named, recurring townsfolk with simple faces. They buy at your lines daily, age with you, return Lost Wallets and attend your retirement. One of them might become your partner. | M | Medium–high | v1.1 (start with 4 in v1). |
| E | **Neighbours via link** | Share a URL that encodes a family crest, portrait and house tier. A friend opens it, and your family moves in next door as an NPC household that visits and gives a small "neighbourly" bonus. Serverless, or later through `/lib/auth` cloud. | M | High (viral loop) | v1.1. |
| F | **Branching specialisation** | At L25, choose 1 of 2 identities per line (Lemonade → Juice Bar *or* Franchise), with a different perk and prop kit. Free to respec. It makes each town look like *yours* and answers the rival's Policies. | H (doubles tier art) | Medium | Phase 2. Prototype it on 2 lines first. |
| G | **Supply links** | A physical van carries goods from line A to line B (bakery → café). Bonus-only. | M | Medium–high | v1 for 1 link (Harbour), more later. |
| H | **Life cards** | Every ~10 min, a one-line BitLife-style moment with 2 glyph choices and no wrong answer ("🎸 join a band?" gives either a tap-pitch skin or +1 h offline). It costs almost no art and gives the life layer a voice. | L | Medium | v1.1. Keep it to one line of text. |

---

## 4. A ruthless v1 cut (stricter than §16)

The principle: **fewer lines, every one perfect, and the life and inheritance loop complete.** Count parity with the rival's 15 routes is a vanity metric. The rival cannot copy a story.

### Must ship

- **Tech:** single renderer, scissor viewports, rectangle sync verified on iOS momentum scroll, and black-screen-proof lifecycle (the rival's 3-cycle forced-context-loss test is the bar to beat). Save, export/import, quality setting, offline credit.
- **4 districts, 12 businesses** (Old Town → Downtown), each with **2 visual tiers built as additive prop kits** (L1 base, L25 adds props). Coast is a fogged teaser.
- **Line model:** ⬆ level (x1/x10/MAX plus hold-to-buy), σ (3 steps), shelf, **1 boost** (not 2), manager, pile with the R1 maths.
- **Smart director**, pin, life-event cut-ins, collapsing card strips.
- **Life:** 5 homes (Bench → Family Home), 4 age stages, partner and kids **reordered per R3**, kids visibly growing and working a line (Hook B), one pet (dog). Retire with heir choice, one heirloom slot, family wall, **The town remembers** landmarks (Hook A), and a Postcard button.
- **Managers:** 12, levels 1–5, 2 slots. **6 items × 3 rarities**, merge, auto-equip.
- **Events:** golden pigeon, celebrity, parade, bulk order, and **Rush Hour** as the main equipment source. Rewards from Rush Hour never gate progression.
- **Goals:** contracts that are one-time per family, 3 daily goals, a 7-day gift that pauses rather than resets, and about 20 achievements.
- **Hollow's Eve, lite.** The side town is **Old Town at night** (same plots, prop and palette overlay), with 3 variant lines, 12 ranks, 1 seasonal manager (Count Cuppula) and a costume.
  - Build it **in parallel from day 1**, not last.
  - Hard rule: if it is not playable by **Oct 22**, ship only an Oct 24–Nov 2 cosmetic town overlay plus one keepsake, and make Frostbridge the first full season.

### Defer

| Deferred item | When / instead |
|---|---|
| Coast, Sky City, Orbit, Penthouse, Orbital Villa | Later phases |
| Third visual tier | Later |
| Second boost per line | Later |
| District time-window twists | Replaced by the district verbs in §2, point 2 |
| **Education** | v1.1, rebuilt as persistent family knowledge (R4) |
| **Rides** | Cosmetic later (R2) |
| Butler, Lost Wallet, Food Critic, Rainy Day, Tourist Bus, Lucky Delivery | Later |
| Items 7–16, Epic and Legendary rarities, manager levels 6–10, slot 3 | Later |
| Cat, parrot, goldfish | Later |
| Weekend Market | Useless until a second season exists anyway |
| Dynasty, wardrobe, hobbies | Later |
| Hollow's Eve ranks 13–25 | Later |
| Cross-game badge | Later |

### Cut outright

- Megaphone σ above 100%
- Crit-stacking traits beyond the cap
- "Win a Gold Rush Hour" as a district gate (skill gates progression)
- "Earn $1B in one sitting" (ambiguous and punishes short sessions)

---

## 5. Verdicts on §17

1. **PolyPerfect or a custom rig: custom.** Use a lightweight procedural chibi rig for *everyone*: merged low-poly parts, animated by transforms, no skinning. The reasons:
   - It matches the flat-shaded diorama style.
   - Age stages become part swaps (grey hair, glasses, cane).
   - It avoids an 80-bone skinned mesh multiplied across 4–5 viewports, and the obfuscated-pack overhead.
   - PolyPerfect could still appear in the portrait wall or retirement close-up if a spike shows it is worth it. It is not on the critical path.

2. **Local time or UTC: local time.** It is single-player, and clock cheating only "harms" the cheater. The safeguards are:
   - Record the maximum timestamp ever seen. Give no offline credit when the clock goes backwards, and keep crediting bounded by the time since the last save, as the rival does.
   - Season windows use the local date.
   - Witching Hour uses the local hour; that is the point of it.

3. **What "character (all games)" means: probably across br8t games, so ask Aaron.**
   - **v1:** "character" means across generations within Idle Life 2. Shape the keepsake data (stable IDs, a `crossGame` flag) so it can sync later.
   - **v1.1:** a cosmetic title or badge through `/lib/auth/cloud.js`, never a gameplay bonus in other games, which would be a balance hole across the whole site.

### Other open questions the proposal should have asked

- **Who sims the full multiplier stack?** The §11.2 sim ignores housing, education, managers, events, kids, achievements and keepsakes. That is about 12 multiplicative layers.
  - The economy agent must sim the **whole** stack, with an *active tapper* and an *idle-only* profile side by side.
  - Hard targets: active ≤ 2.5× idle, and no upgrade with negative return for either profile.
  - Falsify the harness first: plant the R1 bug deliberately and confirm the sim flags it.
- **What does a 2-minute session look like at hour 10?** If the answer is "tap 12 piles", R1 is not fixed.

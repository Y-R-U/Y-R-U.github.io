# BREACHPOINT II — pipeline state

**Two workers may now run at once (Aaron lifted the one-at-a-time rule 2026-09-18), but ONLY when they
cannot interfere.** Two things make a pair unsafe:
- **Both editing `js/engine.js`** — it is ~5,200 lines and they will clobber each other.
- **Both driving a browser** — two headless WebGL contexts software-rendering on this machine corrupt each
  other's draw-call and timing numbers. Never pair a second browser worker with a perf-measuring one.
A docs-only or asset-only worker is always safe to pair.
That rule governs *code* workers. The **coordinator may edit `docs/` at any time** — if `BALANCE.md`
or `IMPROVEMENTS.md` changes under you mid-phase, that is the coordinator, not a second worker.
(P4a correctly flagged this as a possible violation. Good instinct; the answer is that docs are shared.)
Phases and their briefs live in `BUILD_PLAN.md`. Design backlog lives in `IMPROVEMENTS.md`.

| Phase | State | Notes |
|---|---|---|
| P1 Foundation | **done** | tiers/levels/upgrades/profile data, data-driven rosters, boss support, armour gate. 34/34 headless checks. |
| P1.5 File split | **done** | index.html 139 / css 222 / data 112 / profile 71 / engine 4349. Verbatim move, 38/38, `file://` proven. |
| P2 Training + controls | **done** | instruction screen, `doubletap` fire mode, 8-step drill, paintball, rifle-only. 56/56 + 7/7 + 39/39, both canaries fired. |
| P3 Progression | **done** | all six tracks applied at `startRound()`, `js/armoury.js` upgrade screen, threat readout, respec, weapon unlocks, SP breakdown, manual reload button, RESET PROGRESS. `upg()` moved to `profile.js`. 70/70 + 56/56 + 39/39 + 7/7, both canaries fired. |
| P4a Hub/dock/objectives | **done** | permanent dock + water + 2 cranes, 4 objective types, 8 lighting presets with AI-sight coupling, boss banner/bar, campaign hub, the war beat, paint persistence. `js/campaign.js` added. 97/97 + 56/56 + 70/70 + 40/40 + 7/7, both canaries fired. |
| P4c Balance + readout | **done** | `BALANCE.md` variant C applied to `js/data.js`; threat readout now leads with survival time from one shared model (`§SURVIVAL` in `armoury.js`), hub reads the same function. 33/33 + 97/97 + 70/70 + 56/56 + 40/40 + 7/7, both canaries fired. |
| P4b Level variety | **done — CONFIRMED by P5a** | five per-level container layouts (built once, toggled, NAV rebaked), per-level insertion points, spawn/cover/zone revalidation. P5a re-ran it clean at **63/63**; the one thing its own unfinished sweep found was a random `pickPatrol` null-deref that kills the round, now fixed (see P5a below). |
| P5a Confirm + numbers | **done** | per-tier cadence + armour pool in the survival model, spTarget, boss-announce latch, profile v1, `pickPatrol` crash fix. **26/26 + 63/63 + 33/33 + 97/97 + 69/70 + 56/56 + 40/40 + 7/7**, all four canaries fired. The only failure left is the known `p3_test` STEADY timing flake. |
| P5b Performance | **done** | rig palette baked to **vertex colours** (one material, one mesh per animation group), **three detail tiers** with an InstancedMesh far tier, name tags culled past the LOD distance. **L1 114 -> ~55, L8 302 -> ~135**, static world unchanged. **41/41 + 26/26 + 33/33 + 97/97 + 56/56 + 40/40 + 7/7**, 62/63 p4b (pre-existing L3 corner) and 69/70 p3 (the documented STEADY flake). Three canaries fired. |
| P5b Perf | **done** | vertex colours + distance LOD; L8 ~288 → ~150. Hit boxes must not move. |
| P5c Stuck player | **done** | escalating debrief (profile **v2**), RECRUIT mode, L5 `maxAttackers` 4, every `spTarget` re-set against MEASURED earnings, `p4b_test` §10 fixed at the cause. New suite `p5c_test` **60/60**, three canaries fired. |
| P5d Ship | **done** | full suite re-run, boot verification over both protocols and both orientations, screenshot, HANDOFF brought up to date, `PLAYTEST.md`, local commit. **`projects.js` untouched and nothing pushed — Aaron plays it first.** |
| P6 Story mode | backlog | see IMPROVEMENTS.md. |

## Verified numbers (any worker regressing these has broken something)
- `BP2.LEVELS.length` 10 (9 campaign + endless); `TIERS.praetor.apPen` **0.34** (was 0.6 — P4c variant C)
- Armour gate at PLATING 5: militia **0.900** HP/hit, shock **6.480**, praetor **9.680**
  (P4c: the old 13.750 / 22.400 are dead. militia 0.900 never moved.)
- `loadLevel(1)` → 5 militia, 0 bosses, 15 of 20 rigs deactivated
- `loadLevel(8)` → 18 + 1 boss, `maxHp 484`, `scale 1.18`, `apPen` **0.44**, THE MARSHAL, maxAttackers **4**
- Draw calls **pin `quality:'low'` first**: L1 **114** (was 112 before the dock), L8 **~305 ±25**.
  Unpinned figures are meaningless (see traps). P4c re-measured after variant C: L1 **114** exactly,
  L8 peaks over 7 runs **286 / 287 / 287 / 288 / 298 / 299 / 301** (median **288**), and the L8 static
  world with every rig hidden is **271**, dead stable across 11 samples. A peak sample that lands entirely
  on rig-free frames reads 271 and looks like a regression — it is the trap below, not a change.
- Touch: single tap does NOT fire; double-tap within 280 ms / 44 px fires; holding the 2nd tap empties a mag
- Paintball: 0 objects on the blood material, player survives 8 x 500 damage, only weapon 0 selectable
- Training completion awards exactly 300 SP and `trainingDone` survives a reload

## Verified numbers added by P3
- Rank 5 on the live player: `maxHp` **260**, `armorMax` **350**, rifle damage **34.5**, mag **51**,
  reserve **462**, reloadTime **1.435 s**, hip spread **0.014**, sprint **9.88 m/s** (1.30x of 7.6),
  assist cone **0.70 rad**, double jump on, fall-damage immune
- Multipliers are recomputed from `WBASE` every round: 5 consecutive rounds give identical numbers
- Full track clear costs **28,200 SP**; respec refunds exactly **80%** (`trackSpent` x 0.8)
- ~~Threat bands on HP-per-hit~~ **superseded by P4c** — bands are on survival time now, see below
- First clear `250 x level`, replay `100 x level` (40%), accuracy `round(60 x hits/shots)`, flawless `+100`
- `FALL_SAFE` 15 m/s: a 16 m drop costs ~74 HP at MOBILITY 0 and nothing at MOBILITY 5

## Verified numbers added by P4a
- Eight lighting presets; `Light.apply()` **never changes the world light count — it is 4, always**
- Preset fog, as measured: day 26→96, overcast 20→80, dusk 22→85, night 16→60, haze 14→52,
  fog **8→34**, storm 12→44, nightfog 6→26
- AI sight range per preset: day **48 m**, overcast 44, dusk 40, night **26**, haze 34,
  **fog 22**, storm 30, nightfog 18. Player aim-assist reach is `min(70, fog.far)`.
- **The fog measurement, live**: one lone enemy on a clear 40 m line, pinned and facing the player —
  spots you in `day` at 40 m and at 30 m; does **not** in `fog` at 40 m or at 30 m; sees you again
  at 18 m in `fog`. Fog is a range change, not blindness.
- LOW quality shortens fog (day 26→96 becomes 20→74) and **never** changes `Light.sight()`
- Dock geometry: quay x **22→26**, kerb top **0.40** `climb:false`, water plane y **−1.2**,
  x **26→120**, 8 crane legs, 9 bollards, **0** east-wall solids
- Out of bounds: back on the quay at the same z (±2 m), **14 HP** per dunk, 0.6 s re-arm,
  and walking east into the kerb stops the player at x **25.39**
- Draw calls, isolated in one frame with the rigs hidden: the water is **+1**, the zone marker is
  **+1** (zone levels only), and the quay, kerb, both cranes and the bollards are **+0** —
  they merged into the existing `wall`/`wallDark`/`steel`/`darkSteel` buckets
- Objectives: all four complete and all four fail. Capture on L1 fills in 20 s uncontested; one
  enemy in the zone takes 2.48 → 0.00 in under 3 s (it **decays**, it does not pause)
- Waves on L6: 5 / 5 / 5 across three waves, `rosterSize` still **15**
- Boss tag, alpha channel only (colour ignored entirely): diamond α **242** vs **1**, chevron
  α **235** vs **0**, total coverage **9530** vs **5145** px
- The war beat leaves `GAME.state==='play'`, `#radio` is `pointer-events:none`, the band is `auto`,
  and one tap takes the queue from 6 to 0
- Training paint: 7 splats survive into L1 at opacity **1.00**, then **0.55** (L2), **0.25** (L3),
  gone at L4

## Verified numbers added by P4c
- `TIERS` after variant C — apPen **0 / 0 / 0.10 / 0.18 / 0.26 / 0.34** and dmg **5 / 9 / 12 / 15 / 18 / 22**
  across paint / militia / regular / veteran / shock / praetor. **`paint` and `militia` are untouched.**
- `LEVELS.map(l=>l.maxAttackers)` = **1,2,2,3,3,3,4,4,4,6** (L0–L8 then endless). Endless is still 6 —
  variant C named L5/L7/L8 only, and endless escalating past the campaign cap looks deliberate. Flagged, not changed.
- Armour gate, straight from `gateCalc`: militia@5 **0.900** (absorb 0.90), shock@5 **6.480** (0.64),
  praetor@5 **9.680** (0.56), praetor BOSS@5 pen **0.44** absorb **0.46**. Spread is **10.76x**, not 25x.
- **Armour scales again**: praetor@PLATING 5 absorbs 0.56 — *more* than militia@PLATING 0 (0.50).
  Under the old table it absorbed 0.30, which is the flaw variant C existed to fix.
- L1 headline feature intact: 40 point-blank militia rounds at PLATING 5 / VITALITY 5 cost **36 of 260 HP**
  (armour 350 → 26) and through the **real `damagePlayer` pipeline** under sustained L1 fire the max build
  lasts **53.8 s** against rank 0's **13.2 s** — 4.08x.
- **`§SURVIVAL` in `armoury.js` is the single survival model.** `BURST 4`, `CADENCE 1.6 s`,
  `HIT_RATE 0.6`; landing rounds/s = `maxAttackers x 4 x (tier accuracy x 0.6) / 1.6`;
  seconds = `maxHp / (rounds x gateCalc().hp)`. `campaign.js` calls `A.survival(lvl)` — do not fork it.
- Survival bands: >=30 s TRIVIAL, >=15 s LIGHT, >=8 s SERIOUS, >=4 s SEVERE, else LETHAL.
- Readout spot values (plating rank, vitality rank): L1 P5V5 **229 s TRIVIAL** · L4 P2V3 **7.8 s SEVERE**
  · L6 P4V1 **3.5 s LETHAL** · L8 P5V5 **5.3 s SEVERE**. The rendered `#armThreat` text matches to 1e-9.
- **The plating trap is now surfaced.** At L6 from P4V1: PLATING 4→5 (2200 SP) buys 3.46 → **4.23 s**;
  the same 2200 SP in VITALITY 1→3 buys **4.98 s**, and the PLATING row says so in words.
- The measured TTD curve at each level's soft SP target, greedy-optimised against the **real** `gateCalc`
  (not the raw absorb the `BALANCE.md` optimiser used):
  L1 **17.6** · L2 **12.1** · L3 **9.7** · L4 **7.8** · L5 **9.4** · L6 **6.0** · L7 **7.3** · L8 **5.3** s.
  Through the real `damagePlayer` pipeline (armour pool depletes) the same builds give
  **13.2 / 10.9 / 8.1 / 7.2 / 9.4 / 5.9 / 6.9 / 5.3 s** — the pool only binds below PLATING 4.

## Verified numbers added by P4b
- **Five container layouts** (`§LAYOUTS` in `data.js`): YARD 22 containers · THE STACKS 24 ·
  OPEN GROUND 17 · THE FUNNEL 18 · QUAY WALL 17. Level → layout is **0,0,1,2,3,4,1,3,4,0**.
- **A layout costs exactly 6 draw calls** — 5 palette body meshes + 1 `darkSteel` frame mesh, which
  is what the six shared `cont0..5` buckets used to cost. Measured by isolation on L1, rigs hidden,
  quality pinned: no layout **30** → one layout **36** → all five visible **60**. The game draws 36.
  Five layouts cost the same as one because only the active one is `visible`.
- **`L1` is still exactly 114 and `L8` still in band** — but only **from the reference pose**.
  P4b gave every level its own insertion point, so the spawn pose (and the frustum) is level-specific
  now: at L1's own insertion point the same build reads **82**. `split_test` and `p4_test` `peakDraw`
  now pin `teleport(1.5,24.5); look(0,0)` as well as the quality. Measured: L1 **114**, L8 **318**.
- 143 container solids exist at once; **25–38 active** per level, the rest carry `.off`.
  `worldColliders` is **18** on every level (swapped, never grown).
- `NAV.bake()` **refills**: `blocked`, `coverH` and `cover[]` are the same objects after 8 relayouts.
  Heap **64001** for **6400** cells, never resized. Cover cells per layout (±10, crates are random):
  YARD ~**1150** · STACKS ~**1215** · OPEN GROUND ~**1120** · FUNNEL ~**1065** · QUAY WALL ~**950**.
- **Every enemy paths to the insertion point on every level** — 0 failures across L0–L9, 2–19 rigs,
  29–76 waypoints average. Live: 4–18 of each roster close >1 m on the player in 5 s.
- **The layouts change where you can shoot from, measurably.** 154 ray-traced sample points across the
  yard, from a body standing on the parapet: **THE STACKS 1%** · YARD (the pre-P4b baseline) **39%** ·
  THE FUNNEL 51% · QUAY WALL 68% · **OPEN GROUND 72%**. From a ground position at (−12, eye 1.62) the
  same points read 16 / 42 / 51 / 48 / 65%. THE STACKS' 3-high blinder wall really does take the perch
  out of the fight; OPEN GROUND really does hand it the map. Sample the WHOLE yard for this — the first
  version aimed at x = 10, which is inside the YARD corridor rows, and read 0% for both YARD and
  THE STACKS: it passed without distinguishing them (a believable-wrong-metric).
- Nine distinct insertion points over ten levels. L3 starts you **on the parapet** at y **4.4**
  facing east; L4 starts you **inside the building** at ground level facing east.
- **A free nav cell is not a reachable one.** `spawnPoints()` now ends its `free()` test with an A* to
  the insertion point. Without it, seed 7 `(22,10)` lands in a quay pocket on YARD and that enemy
  never moves — found by the pathing assertion, invisible to a screenshot.
- `LEVELS.map(l=>l.maxAttackers)` = **1,2,2,3,3,3,4,4,4,4** (the coordinator's endless 6 → 4 stands;
  no suite asserted the old value and all six suites pass with it).

## Verified numbers added by P5a

### The survival model is now derived, and it is checked against the pipeline
- **Per-tier fire cadence, from §ENEMIES' own constants.** Burst `randi(3,5)` (mean 4) **+1 above
  accuracy 0.7**, spaced 0.115 s; cooldown `rand(0.75,1.6)` (mean 1.175) **+0.5 s past 22 m**, all
  scaled by `lerp(1, reaction, 0.5)`. **`fireCD` runs DURING the burst**, so the period is
  `max(cooldown, burst length)` — *not* their sum, which is the easy mistake.
  Rounds FIRED per second by one attacker, past 22 m (the branch the model takes):
  militia **2.582** · regular **2.895** · veteran **3.142** · shock **4.204** · praetor **4.455**
  (inside 22 m: 3.68 / 4.13 / 4.48 / 5.99 / 6.35). The old flat model said **2.5** for every tier.
  A Monte-Carlo run of the engine's own loop at 1/60 s reads 2.574 / 2.875 / 3.107 / 4.176 / 4.426 —
  the model is **1% high in every tier** because it is the continuous limit and the loop rounds every
  wait up to the next frame. One-sided and tiny; the real game at 30 fps is slower still.
- **The coordinator's figures were half right**: militia **2.59** matches (it is the past-22 m rate);
  praetor **3.67** does not — the derivation gives **4.455**, because praetor's burst is 5, not 4.
- Rounds LANDING per second per attacker (`cadence x accuracy x HIT_RATE`, HIT_RATE still 0.6 and
  still invented): militia 0.651 · regular 0.955 · veteran 1.244 · shock **1.917** · praetor **2.272**,
  against the old flat 0.63 / 0.825 / 0.99 / 1.14 / 1.275. Late close-range fire was understated by
  **68% (shock)** and **78% (praetor)**, not 47%.
- **The armour pool is modelled.** Two phases: the pool absorbs `dmg x effAbsorb` per round until it
  is empty, then every round lands whole. Regen is in the model but never fires under sustained
  fire — the gap between landed rounds is under the plating delay at every level, **measured 0 regen
  on all eight**.
- **The L1 headline is honest now: `229 s` became `52 s`** against the 53.8 s the real pipeline gives
  (3% out). Nothing about the feature changed — the old number was the model ignoring the pool.
- **Model vs the real `damagePlayer` pipeline, all eight levels, at each level's spTarget build**
  (rounds driven one at a time through `G.hurt` in real time, with the game's own `updatePlayer`
  running so real regen applies):

  | lvl | build | land/s | hp/hit | pool | MODEL | REAL | diff |
  |---|---|---|---|---|---|---|---|
  | L1 THE DOCK | P0V0M0 | 1.301 | 4.50 | 50 | 12.81 s | 13.07 s | +2.0% |
  | L2 CONTAINER ROW | P1V1M0 | 1.910 | 6.24 | 90 | 9.38 s | 9.42 s | +0.4% |
  | L3 THE OVERLOOK | P2V1M1 | 2.866 | 5.28 | 140 | 7.71 s | 8.03 s | **+4.0%** |
  | L4 NIGHTFALL | P3V2M0 | 3.733 | 6.60 | 200 | 6.09 s | 6.16 s | +1.1% |
  | L5 SUPPLY LINE | P3V2M1 | 3.733 | 6.60 | 200 | 6.09 s | 6.16 s | +1.1% |
  | L6 THE SIEGE | P4V4M0 | 7.669 | 7.92 | 270 | 3.51 s | 3.52 s | +0.3% |
  | L7 BLACKOUT | P4V4M1 | 7.669 | 7.92 | 270 | 3.51 s | 3.52 s | +0.3% |
  | L8 BREACHPOINT | P5V5M3 | 9.089 | 9.68 | 350 | 2.96 s | 2.97 s | +0.3% |

  **Worst margin 4.0%, and the model is always the pessimistic side.** The residual is discretisation:
  the pipeline lands whole rounds, the model integrates. L4/L5/L8 die before the pool empties, exactly
  as the model says; L1/L2/L3/L6/L7 empty it within 10% of the predicted second.
- Readout spot values on the new model: L1 P5V5 **52 s TRIVIAL** · L1 P5V0 **38.427 s** ·
  L4 P2V3 **5.7 s SEVERE** · L6 P4V1 **2.1 s LETHAL** · L7 P5V0 **2.012 s** · L8 P5V0 **1.137 s** ·
  L8 P5V5 **3 s LETHAL**. The plating trap still reads the right way round at L6 from P4V1:
  PLATING 5 buys **2.52 s**, the same 2200 SP in VITALITY 1→3 buys **2.96 s**.

### spTarget: the curve cannot be made STRICTLY decreasing, and here is why
- `spTarget` L5 **3200 → 2000** and L7 **7500 → 5200**. `TIERS` untouched (md5 of the whole §TIERS
  block: `c0f0aa0c76059ece81d5f1ceeb94efaa`; lines 12–25 hashed the same before and after).
- Curve at the new targets: **12.81 · 9.38 · 7.71 · 6.09 · 6.09 · 3.51 · 3.51 · 2.96 s** — never
  gentler, 4.3x end to end, but **FLAT at L4/L5 and at L6/L7**.
- **It cannot be anything else.** L4 and L5 are the same threat (veteran, `maxAttackers` 3) and L6 and
  L7 are the same (shock, 4). TTD at a level is a function of the build, and the build is a function
  of `spTarget`, which can only go UP as the campaign goes on. So TTD(L5) < TTD(L4) would require
  L5's SP target to be *below* L4's. The new values sit inside the same rank-cost band as the level
  before (2000 buys what 1800 buys, 5200 what 5000 buys), so the recommendation still rises while the
  optimal build — and therefore the printed TTD — does not.
- If the coordinator wants it strictly decreasing, the lever is a **threat** change, not `spTarget`:
  L5 `maxAttackers` 3 → 4 gives L5 ≈ 4.6 s (below L4's 6.09) without touching `TIERS`. L7 has no such
  lever left — it is already at the cap of 4, with the same tier as L6 — unless the model starts
  counting the level's **bosses** as attacker slots, which L7 has two of and L6 one. Modelled, that
  narrows L6/L7 to 3.12 vs 3.38 s but still does not flip it. **Both are balance calls, not P5a's.**
- The old targets were also unearnable: clearing every prior level once pays **300 + 125n(n-1)** SP,
  so L5 could have 2800 (asked 3200), L7 5550 (asked 7500) and L8 7300 (asks 11000). L5 and L7 are now
  under that line. **L8's 11000 is still above it** — deliberately left alone, flagged here.

### The boss announce is latched (the flake was a gameplay bug)
- `ANN_DELAY` **3.0 s**, `ANN_RANGE` **42 m** in `js/campaign.js`. First sight still announces
  instantly (**measured 0.15 s**); otherwise the announce fires after 3 s of the boss being alive and
  either inside 42 m or already hunting you. `annT` resets with `announced` on every round start.
- Proven with the camera pointed the other way for the whole run and the boss parked **behind** the
  player: L4 announced WARDEN after **3.3 s**, L7 announced after **3.0 s**, `onScreen` false at every
  poll and the banner shut at t=0. Suppressing the banner makes the same check fail.
- **L7 fields two bosses and both announce** — the banner names whichever fired last. That is correct;
  a test asserting one specific name there will flake.

### Profile schema v1
- `Profile` carries `v:1`, `migrate()` and `SCHEMA`. A save with no `v` is v0: it is filled from the
  defaults, kept, and **rewritten as v1 on load**. Verified with a full v0 save (4200 SP, six ranks,
  three weapons, stats) and with a v0 save that is `{sp, ranks:{plating:2}, cleared}` and nothing else.
  A corrupt save still yields a blank **v1** profile.

### The crash P4b's sweep was cut off before it found
- **`pickPatrol` threw `Cannot read properties of null` and killed the round.** It samples 8 random
  free cells and keeps the farthest one **under 42 m**; an enemy spawned in a far corner can have all
  eight land past 42 m, and `best` stays null. Pre-existing in form (the function is not P4b's), but
  P4b's per-level insertion points and layouts changed where enemies start, which is what decides how
  often it is hit. Fixed by keeping the nearest sample as a fallback. It is **random**: it killed one
  `p4b_test` run and not the three before it.

## TRAPS ADDED BY P4b
- **A draw-call figure is a function of the camera pose, not just the build.** Now that every level has
  its own insertion point, `loadLevel(n)` no longer leaves the camera where the 112/114 figures were
  measured. Pin the pose (`teleport(1.5,24.5); look(0,0)`) as well as `quality:'low'`, or the number
  moves 30% for no reason. L1 reads 114 posed and 82 at its own insertion point on the same build.
- **A long container wall parallel to the perimeter makes a one-way pocket.** OPEN GROUND's first
  draft ran five stacks down x = −25; the strip between them and the west kerb was pinched shut by the
  building's back wall and A* could get in but not out. Keep perimeter blocks SHORT and staggered, and
  run the flood-fill check in `p4b_test` §11 (every free cell must be one component) after any layout edit.
- **Two diagonals prove nothing about connectivity.** The first version of that check passed on four
  layouts and only caught OPEN GROUND by luck of which corner it started in. Flood-fill instead.
- **The permanent world already has small nav pockets — YARD is the baseline, not zero.** Flood-filled:
  YARD (the pre-P4b container list) strands **8** of 3770 free cells, THE STACKS 6, OPEN GROUND 3,
  THE FUNNEL 22, QUAY WALL 41 — 0.1-1.0% each, all behind crane feet and kerb corners. Do not chase
  "zero stranded cells"; assert the main component is >=98% and that the level's own insertion point
  reaches all four corners, which is the property the game actually needs.

## TRAPS ADDED BY P5a
- **A boss-announce test can pass on an announce it did not cause.** `loadLevel(n)` leaves the round
  running, and the boss spawns in front of you, so the banner can fire by SIGHT during the setup sleep —
  the check then "passes" while the latch is broken. Load with `GAME.state='menu'`, park the camera and
  the boss, and only then set `'play'`; assert the banner is shut at t=0 and that the announce took
  **longer than 2 s** (a latch announce cannot be instant, a sight announce cannot be slow).
- **`announced` only resets in `GAME.start()`, not in `loadLevel()`.** A second check in the same run
  reads the first one's banner unless you go through `GAME.start()`.
- **A point 10 m behind the camera projects to ndc.z 1.013**, so `bossOnScreen` rejects it correctly —
  but only just. Do not loosen that `>1` test.
- **The survival model's cadence is the continuous limit and the game runs in frames**, so a
  frame-stepped Monte-Carlo of the same loop reads ~1% LOW at 60 fps and further below at 30. Assert a
  one-sided band, not equality.
- `applyRanks()` does **not** touch `player.armorMax` — that is set in `player.spawn()`. Reading
  `armorMax` after `applyRanks()` alone measures the last spawn, not the ranks.

## TEST-HARNESS TRAPS (P2 found these the hard way — they fabricate regressions)
- **`split_test.mjs` poisons its own draw-call baseline**: it writes `S` to `bp2_settings`, including a
  quality the auto-quality net may have lowered, so run 1 on a fresh browser profile and run 2 measure
  different frustums. Clear `bp2_settings` between runs or pin quality explicitly.
- **`Emulation.setDeviceMetricsOverride` resizes the real headless window and does not self-restore.**
  Snapshot and restore the window bounds, as `p2_test.mjs` does.
- **The auto-quality net is the 112 vs 208 draw-call figure.** `quality:'high'` turns the shadow pass on;
  `_autoQ` drops the page to `low` the moment fps < 34, at a nondeterministic point inside a 1.6 s peak
  sample. P3 measured the **P1 baseline build itself** at 208 and the current build at 112 in the same
  run, then both at exactly **112 / 316** once quality was pinned. `split_test.mjs` now pins
  `S.quality='low'` inside `peakDraw`. Never compare draw calls without pinning quality.
- **A headless window with no CDP traffic throttles `requestAnimationFrame`**, and `dt` is clamped to
  0.06, so the world runs in slow motion and any "hold a key for N ms then measure" check under-reads.
  `desktop.mjs` now polls while the key is held. The game's real walk speed is 4.75 m/s either way.
- **Re-using touch id 1 after a tap the browser never landed** (e.g. one dispatched below the fold)
  makes the NEXT `touchStart` a silent no-op. `p3_test.mjs` uses a fresh id per press.
- **The 112-vs-208 draw-call figure was the auto-quality net all along, not any build.** P3 measured the
  *P1 baseline build itself* at 208 and the current build at 112 in the same run: `_autoQ` flips shadows off
  mid-sample at a nondeterministic moment. **Pin `quality:'low'` before measuring** — then both give exactly
  112 / 316. Earlier "112 every run" readings were luck, not stability.
- A headless window with no CDP traffic throttles rAF and `dt` clamps at 0.06, so "hold W for 1.2 s then
  measure" under-reads. Poll during the hold.
- Re-using a touch id after a tap the browser never landed (e.g. dispatched below the fold) makes the NEXT
  `touchStart` a silent no-op. Use a fresh touch id per press.
- **The L8 draw-call figure was never stable and never can be.** 19 rigs are ~14.7 draw calls each
  and they start patrolling the moment the level loads, so a 1.6 s peak sample lands anywhere in
  291–317 on the *same build*. Do not treat a number in that band as a regression. To measure
  anything about the static world, hide every rig first and take the **median**, not the peak —
  a peak sample silently absorbs the delta you are trying to isolate. (P4a lost twenty minutes to
  "the zone marker costs 0 draw calls" when an enemy tag had wandered into the peak.)
- **`Log.enable` replays Chrome's buffered log**, so a CANARY thrown by a previous run can show up
  in a later run's error list. Splice CANARY out again before the final "zero errors" assertion.
- **`p4_test` section 8 "the boss announce banner appears, by NAME" is a PRE-EXISTING FLAKE.**
  It failed 2 of 4 P4c runs and passed the others on *identical* code. `announce()` only fires the frame
  `bossOnScreen()` first turns true, and the test's `look(Math.PI,0)` does not reliably put the L4 boss in
  the frustum — it only passes when state left by earlier sections happens to help. P4c falsified this
  properly: the same isolated probe fails **5 / 5 with the pre-P4c `data.js` restored**, so it has nothing
  to do with variant C. Fix the test (aim at the boss from `probe()`, or assert `announced`) before
  trusting it again.
- **A dead Chrome reads as a hung suite.** Several sessions share port 9223 on this machine; if another
  `cdp stop` (or the idle-kill) takes the browser out mid-run, `lib.mjs` just blocks on a dead socket with
  no output at all — it looks like an infinite loop in the test. `cdp stop && cdp start` before each suite
  and run them one at a time.
- Distrust the harness before the code when a number moves for no reason.

- Rank 5 measured live: maxHp **260** · armour **350**/absorb .90 · rifle dmg **34.5** · mag **51** / reserve **462** / reload **1.435 s** · assist cone **0.70 rad** · sprint **9.88 m/s** · double jump from rank 2 · fall immunity at 5
- Respec refunds exactly 80% (1700 invested → **1360**) and zeroes all six tracks
- First clear **+250**, replay **+100** (40%); accuracy up to +60; flawless +100 — both win-only
- ~~Threat readout: DOCK 0.9 TRIVIAL / BLACKOUT 13.8 SEVERE / BREACHPOINT 22.4 LETHAL~~ **superseded by P4c**

## P4a notes for whoever is next
- `js/campaign.js` wraps `GAME.start` and `GAME.end`; `js/tutorial.js` wraps `GAME.startRound`.
  Both wrappers call through. Keep that chain intact.
- `GAME.onKill` no longer ends the round. `OBJ.onKill()` does. A new objective type goes in
  `§OBJECTIVES` in `engine.js`, its HUD in `§OBJHUD` in `campaign.js`.
- `Tutorial.warVisible()` means "the radio beat is running" now. `#warScreen` still exists as the
  no-campaign fallback and nothing normally shows it.
- The zone marker is ONE mesh rebuilt on level load by `buildZoneMarker()`. Do not build it per
  frame and do not split it into several meshes — it is 1 draw call on purpose.
- `LEVELS[3].hold` is 45 s. The suite temporarily sets it to 5, completes the objective for real,
  then puts 45 back and asserts it.

## Open warts (fix when next in that file)
- ~~`upg()` lives in `data.js`~~ **fixed in P3** — it lives in `profile.js` and is published as `BP2.upg`.
- `clamp` is still defined three times (data, profile, engine). P3 deliberately did **not** add a
  sixth script tag for it: it is a one-line arrow function and a shared `util.js` would add a load-order
  dependency for less code than it removes. Revisit only if a third thing wants sharing.
- `document.styleSheets[0].cssRules` is unreadable over `file://` now CSS is external. Nothing reads it today.

## Standing rules for every worker
- Classic `<script>` only. **Never `type="module"`** — CORS-blocked over `file://`, and the game must open off disk.
- Never read whole files; grep the `§ANCHOR` then `sed -n 'A,Bp'`.
- Launch headless Chrome only via `~/.claude/bin/cdp start --port 9223`; `cdp stop` after. No puppeteer on this machine.
- Touch emulation: `Emulation.setTouchEmulationEnabled` BEFORE navigating; **empty `touchPoints` for `touchEnd`**.
- **Falsify every check.** A sweep from an assertion never proven capable of failing is not evidence.
- Mobile-first, no `alert()`, sparse comments, nothing committed by workers.


## P5 FOLLOW-UPS FROM P4c (all four are P5's, decided by the coordinator)
**ALL FOUR DONE IN P5a — see "Verified numbers added by P5a" above. Kept for the reasoning.**

1. **Per-tier fire cadence in the survival model.** The model's flat `4 rounds / 1.6 s` is not what the AI
   does: real rates are militia **2.59**/s → praetor **3.67**/s (burst `randi(3,5)` **+1 above accuracy 0.7**,
   `fireCD` scaled by `reactionMul`, +0.5 s past 22 m). The model understates close-range late fire by up to
   **47%** — a real L8 knife-fight is nearer **3.6 s** than 5.3. It cancels in comparisons, so it changes no
   decision the readout drives, but the **absolute number shown to the player is wrong**, and the readout's
   whole job is honesty. `MODEL:{BURST,CADENCE,HIT_RATE}` is exported for exactly this. **Take it.**
2. **Model the armour pool.** Below PLATING 4 the pool exhausts before the player dies, so real TTD runs
   8–25% under the model (L1 13.2 s real vs 17.6 s modelled). The L1 headline prints **229 s** but the real
   pipeline gives **53.8 s** — still emphatically the headline feature, just not that number.
3. **Make the curve monotone via `spTarget`, not `TIERS`.** L5 (9.4 s) is gentler than L4 (7.8 s) and L7
   (7.3 s) than L6 (6.0 s), because `spTarget` jumps 1800→3200 and 5000→7500 while the tier does not move.
4. **DONE by the coordinator:** endless `maxAttackers` 6 → **4**, matching every campaign level. Escalation
   past the campaign is per-wave damage/apPen scaling (see IMPROVEMENTS "ENDLESS MODE"), never more bodies.

## P5a: the boss-banner flake is a GAMEPLAY bug, not just a test bug
`announce()` fires only on the frame `bossOnScreen()` first turns true. That means **a player who never
happens to look at the boss is never told there is one** — and on the night and fog levels that is likely.
Fix it in the game, not the test: latch the announce so it fires on first sight **or** after a few seconds
of the boss being alive and in range, whichever comes first. The flaky assertion then stops being flaky as
a side effect. Do not "fix" this by making the test sweep the camera until it finds the boss — that would
hide the real defect.

## Known pre-existing flakes (NOT caused by the phase that found them)
- ~~`p4_test` §8 "boss announce banner appears, by NAME"~~ **FIXED IN THE GAME by P5a** — the announce is
  latched (3 s), so the check no longer depends on the camera happening to frame the boss. `p4_test` polls
  for 5 s, which now clears the 3 s latch with room to spare.
- ~~`scratchpad/test.mjs` is a **stale orphan**~~ **renamed by P4b** to `test.mjs.stale-orphan-p1` so nobody
  runs it by accident. It asserted `L8 maxAttackers = 6`, which is dead. `split_test.mjs` supersedes it.
- **`p3_test` §4 "MARKSMAN rank 5 really does 1.50x damage" flaked ONCE for P5a** (`dmg5` came back
  `null` — 120 attempts with no landed shot, while the rank-0 arm read 23 HP in the same run) and
  passed on the next run on the same code. Same family as the STEADY flake below: it depends on a
  live enemy staying alive and in front of the muzzle at 20-40 fps.
- **`p3_test` §3 "STEADY rank 5 widens the assist cone" is TIMING-FLAKY, roughly 1 run in 5.**
  P4b measured it 12 times in isolation on the current build:
  · as written, **4 of 6** passed — the failures were the **rank-0** arm acquiring a target 0.42 rad
    off a 0.28 cone (readings 0 / 0 / 0 / 0 / **0.42** / **0.42**);
  · with the target pinned for 300 ms **before** the look instead of only after it, **5 of 6** passed
    and the rank-0 arm read **0 every time** — but one **rank-5** arm then failed to converge (0.0).
  `RANKS.assist` read **1.00 / 2.50** correctly in all twelve runs, so the tracks are fine and the
  feature is fine. The cause is the window: the check gives the assist **900 ms**, and the approach is
  `k = dt*(6.5*strength+1.2)`, so at the 20–40 fps this headless renderer manages under load that is
  only ~20–35 frames and convergence is marginal at both ends. **Not a P4b regression** — P4b only
  changed where L1's enemies start (new insertion point) and where the crates land, which is enough to
  move a marginal check across its threshold. P5: give it a convergence loop with a deadline instead of
  a fixed 900 ms, and pin the target before aiming. Do NOT change the game for it.


---

## INTERRUPTED 2026-09-18 ~04:10 — 5-hour limit (resumed)

P4b finished its code work and recorded its numbers (they came from real runs), but its **final
confirmation sweep did not complete** — the worker was terminated by a 5-hour usage limit, not by a fault.
The 15-minute coordinator cron was cancelled at the same time so it would stop stacking.

**State on disk is sound**: all seven files present, `node --check` clean on every JS file, 7,171 lines
total, zero `type="module"` tags.

**Before trusting P4b as finished, re-run the full suite** — `p4b_test.mjs` (60), `p4c_test.mjs` (33),
`p4_test.mjs` (97, one known flake), `p3_test.mjs` (70), `p2_test.mjs` (56), `split_test.mjs` (40),
`desktop.mjs` (7). Everything else in this file was confirmed by a completed run.

**Remaining work**: P5a (the four P4c follow-ups, the perf pass, profile versioning, the stuck-player
debrief, and the boss-announce latch) then P5b (HANDOFF, screenshot, projects.js, ship).
**P5b's first item stands: a human plays it on a phone before it is registered.**

**Resumed.** Remaining work split into four smaller phases (P5a–P5d) rather than two: a phase cut off by a
usage limit costs more than one that lands, so keep them small.

---

## P5a CLOSED 2026-09-18

P4b is **confirmed**: `p4b_test` **63/63** on a clean re-run. The sweep that P4b never finished did find
something — a random `pickPatrol` null-deref that kills the round (fixed, see above) — and the boss-banner
flake in `p4_test` §8 turned out to be the gameplay bug PIPELINE predicted: with the announce latched,
`p4_test` is **97/97**.

Harness edits P5a made (game behaviour changed under them, the assertions did not):
`p3_test` §7's three readout constants and its PLATING row, `p4c_test` §4's independent recomputation
(rewritten from the engine's fire constants, plus the pool) and §5's plating-trap strings, and
`p4c_test` §7's gameplay canary, whose `>0.5 s` threshold was the old model's scale — it is a
**relative** 10% test now, which is what it always meant.

New suite: `scratchpad/p5_test.mjs` (26 checks: cadence, model-vs-pipeline on all 8 levels, the curve,
TIERS, the latch, profile v0→v1, four canaries).


## COORDINATOR DECISIONS ON P5a's OPEN QUESTIONS (for P5c to apply)

**1. Accept the flat TTD pairs. Strict monotonicity is the wrong goal.**
P5a proved `spTarget` alone cannot make the curve strictly decreasing: L4/L5 are the same threat (veteran,
3 attackers) and L6/L7 are the same (shock, 4), and TTD follows the build, which follows `spTarget`, which
only rises. But **the model measures incoming damage, not difficulty** — it cannot see that L7 BLACKOUT is
night + fog + *two* bosses where L6 THE SIEGE is dusk. L7 is plainly harder to play at identical TTD.
So L6/L7 flat is fine and stays.

**2. One exception — L5 gets `maxAttackers` 3 → 4.** L4 NIGHTFALL is night; L5 SUPPLY LINE is day+haze.
Same raw threat but *better* visibility means L5 would actually play **easier** than L4, which is a real
inversion rather than a modelling artefact. P5a measured this lever at ≈4.6 s. Apply it in P5c and re-run
the curve. Do not touch `TIERS`.

**3. L8's `spTarget` 11000 is probably unearnable — measure before choosing.** P5a found clear bonuses
alone total 7300. Kills, headshots, boss and accuracy bonuses add more, and nobody has measured the real
total. P5c: **measure the SP a clean first playthrough actually yields** (clears + in-level earnings), then
set every `spTarget` as a fraction of the running total at that point. A recommended power the player
cannot reach makes the threat readout permanently say "under-powered", which is worse than no advice.

## What P5a's first action proved
The re-run of P4b **crashed**: `pickPatrol` samples 8 random free cells and keeps the farthest *under 42 m*,
so an enemy spawned in a far corner can have all eight land past 42 m, leaving `best` null → `best.x` throws
inside `Enemies.reset()` and kills the round. Pre-existing in form, but **P4b's insertion points and layouts
changed where enemies start, which is what decides how often it fires** — it killed one run in four and
passed the other three. The recorded "P4b 60/60" was true of the runs that happened and still hid a crash.
**Re-confirm interrupted work. Do not inherit a number you did not watch being produced.**


---

## P5b CLOSED 2026-09-18 — the perf pass

### The baseline, re-measured (the brief was right to insist)
`quality:'low'` pinned, reference pose `teleport(1.5,24.5); look(0,0)`:

| | pre-P5b | post-P5b |
|---|---|---|
| **L1** live (peak == median, 16 samples) | **114** | **46-55** |
| **L8** live median | **302** (peak 302) | **128-142** (peaks to 151-163) |
| L1 static world, every rig hidden, median of 11 | **36** | **36** |
| L8 static world, every rig hidden, median of 11 | **35** | **35** |

**PIPELINE's old "L8 static world is 271" is wrong and was never the static world.**
Hiding every rig on L8 gives **35**, dead stable, and 302 - 35 = 267 over 19 rigs = **14.05 calls a rig** —
which is where 271 came from. The static world is 35/36 and always has been (p4b_test §8 measured
"no layout 30 -> one layout 36" on L1 and nobody reconciled the two numbers). Corrected here.

### What each fix contributed, isolated on the finished build
Every enemy pinned to tier 0 with the game's own never-LOD lever (`e.boss`), which re-runs no
`applyTier` and touches nothing on the hit path. Same run, same reference pose, `quality:'low'`,
median of 11. `scratchpad/p5b_isolate.mjs`.

| | L1 | L8 |
|---|---|---|
| **pre-P5b** | **114** | **302** |
| fix 1 only — vertex colours, every rig at tier 0 | **99** (-15) | **261** (-41) |
| + fixes 2 and 3 — the three detail tiers and the tag cull | **55** (-44) | **135** (-126) |
| of which fix 3, the tags, is | -1 | -2 |

- **Fix 1 is a flat 3 draw calls per rig IN THE FRUSTUM.** L1 has 5 rigs and all 5 are in shot:
  15 = 5 x 3, exactly. L8 has 19 and saves 41, so about 14 of them were being drawn — the rest were
  already frustum-culled and a "per-rig cost" that ignores the frustum over-counts.
- **Fix 2 is the whole story on L8**: -124 calls. At this pose 11 of the 19 are past 25 m.
- **Fix 3 is worth 1-2 calls and it is important to say so.** The old rule already hid a tag past
  38 m and the far tier starts at 34 m, so all the cull can save is tags in the **34-38 m band**.
  It is still right — a `Sprite` is a whole draw call and nothing batches it — but it is not a win.

As the build actually went, for the record: pre-P5b **114 / 302** -> vertex colours + a single-pose
far tier + the tag cull **63 / 168** -> adding the mid tier **47 / 134**.

### How it is built
- **`mergeGeos()` carries `color` now** (3 floats/vertex, **filled white** where a source geometry has
  none). The world merges through the same function; its materials have `vertexColors` false so a white
  attribute is inert. Verified two ways: every merged world geometry's colour attribute is all-1.0
  (38/38), and the static draw-call medians are unchanged (36/35, exactly).
- **`EMAT` collapsed from 10 materials to 2**: `rig` (one `MeshLambertMaterial({vertexColors:true})`)
  and `eye` (the unlit visor). The palette lives in `ECOL` and is baked per part by `tintGeo()`.
  A drawn rig is **12 meshes on 2 materials**, was 15 on 8.
- **`EMAT_BOSS` is one cloned pair**, not a `Map` over the whole palette: `color` **multiplies** the
  vertex colours (`0xff8a72`) and `emissive` is `0x531008`. Boss cost no longer scales with palette size.
- **Three detail tiers** (`§ENEMY-LOD`), hysteresis on both boundaries:
  **0 NEAR** < 22 m, the articulated rig, 12 meshes.
  **1 MID** 25-34 m, head+visor folded into the torso and the knee folded into the thigh — **8 meshes**.
  **2 FAR** > 34 m (back to mid under 30 m), one shared baked geometry through an `InstancedMesh`,
  capacity 20. **Every far enemy together is ONE draw call** — two when the squad is split between the
  slung and the aiming pose, because there are two baked poses. A far enemy in combat still reads as
  aiming; a single frozen patrol pose would have been a readability regression.
- **Bosses and the paintball drill never leave tier 0**, at any distance.
- **Name tags are hidden at tier 2.** A `Sprite` does not batch, so that was one draw call per living
  enemy; they are unreadable past 30 m anyway.
- **The paintball bib is its own mesh again** (`rig.bib`, hidden except in the drill) so it keeps its
  emissive material; the torso underneath swaps to a webbing-free geometry so nothing z-fights.

### The hit boxes did not move — proven, and the proof was proven capable of failing
One enemy parked at **40 m** on a clear line, frozen, and the same camera sweep run twice: once with
the instanced far mesh drawn, once with the articulated rig drawn (pinned with the game's own
`boss` never-LOD lever, so nothing on the hit path is touched).
- 37 rays from pitch -0.050 to +0.024 hit **the identical part at every single sample**:
  `.....llllllllllltttttttthhhh.........` in both states.
- head **-0.002**, torso **-0.018**, legs **-0.040** — the same pitch and the same range
  (39.87 / 39.80 / 39.84 m) to the centimetre in both.
- A real round **fired** at the far enemy lands (ADS, spread 0.0028) for **21.6363** damage against the
  rig's **21.6367** — the 2e-5 residual is the spread cone moving the impact a few cm inside the same
  box, which changes the range falloff.
- **Falsified**: with `rayTest` patched to follow the drawn mesh (return null at tier 2) the far enemy
  becomes unhittable and the sweep goes empty — the check fails. With the far hit box drifted 1 m the
  sweep shifts to `..................llllllllllttttttttt` — the check fails. Restored, it matches again.

### The other verified numbers
- **Swap thrash**: creeping the player through 28 -> 36 -> 28 m in 0.25 m steps, six crossings,
  costs **7 tier swaps**. The 4 m band (30 in / 34 out) is 16 steps wide at that speed.
- **Bosses**: a boss at 44 m is still `lodTier 0` with its body drawn, and no boss ever enters the
  instanced mesh.
- **Boss tint read from the RIG MATERIAL, not the tag**: boss `color 0xff8a72` / `emissive 0x531008`,
  grunt `color 0xffffff` / `emissive 0x000000`, and they are not the same material instance.
  P4a's shape-first identification is unchanged — **chevron alpha 235 vs 0**, tag coverage 9805 vs 5258.
- **Paintball**: every target still wears a bib, in a `PAINT.targets` colour, on an emissive material,
  distinct per target; and nothing in the drill ever LODs even parked 47 m away.
- **The world renders identically.** Screenshot of the yard from the reference pose with the rigs and
  HUD hidden, pre-P5b build vs post: mean absolute pixel difference **4.27**, against a
  **before-vs-before noise floor of 4.63** measured on the same build twice. The change is *below*
  the renderer's own frame-to-frame noise. (The noise is the grade/vignette pass; two captures of one
  build are never byte-identical, so a byte compare is useless here — measure the floor first.)

## TRAPS ADDED BY P5b
- **A draw-call number for the WORLD must hide the rigs; a number for the rigs must not.** The old
  "L8 static world = 271" conflated the two and stood in PIPELINE unchallenged for two phases.
  Hiding rigs gives 35. Subtract before you name a thing.
- **Two screenshots of the same build are not identical.** The post chain moves ~4.6 mean abs
  difference frame to frame. Any before/after image claim must measure the **before-vs-before floor
  first** or it will "detect" a regression that is only the grain.
- **A test that hides rigs with `e.rig.root.visible=false` must still work.** The instanced far mesh is
  a scene-level object, not a child of any rig, so it would have survived that hook and quietly added a
  call to every "static world" measurement. It is gated on `e.rig.root.visible`, and the tier machinery
  hides `rig.body`, never `rig.root`, so the existing hook still hides everything. Do not change that.
- **`updateLod()` runs every frame, so forcing `e.lodTier` from a test is overwritten before the next
  render.** Pin the tier with the game's own lever (`e.boss`), not by poking the field.
- **`__game.probe()` reads `camera.matrixWorld`, which is only refreshed by the render loop.**
  `look(); probe()` back to back reads the PREVIOUS frame's camera and produces nonsense that looks
  like a hit-box bug. Wait two `requestAnimationFrame`s between them.
- **Hip-fire spread at 40 m is wider than the torso box.** A single `fire()` at that range misses about
  half the time; the first version of the "a real round lands" check failed on a miss and looked like a
  broken hit path. Go to ADS (spread 0.0028) and fire until one lands.
- **Baking a LOD pose from `buildEnemyRig()` picks up meshes that are hidden by default.** The
  paintball bib is in the rig and invisible; `traverse` does not care. Filter on `o.visible`.
- **Never run a second CDP client while a suite is running on 9223.** P5b measured L8 at `quality:'high'`
  as *lower* than at `'low'` — nonsense produced by a probe sharing the browser with `p4b_test`, which
  restarts Chrome between suites. It also reported 7 of 19 enemies active on the same frame. Every
  figure in this file is a pinned-`low` figure taken with nothing else on the port; keep it that way.

## Suite results at the close of P5b
| suite | result |
|---|---|
| `p5b_test` (new, 41) | **41/41** |
| `p5_test` | **26/26** |
| `p4c_test` | **33/33** |
| `p4_test` | **97/97** |
| `p2_test` | **56/56** |
| `split_test` | **40/40** (L1 46, L8 151) |
| `desktop` | **7/7** |
| `p4b_test` | **62/63** — the failure is the pre-existing L3/OPEN GROUND corner above |
| `p3_test` | **69/70** — the documented STEADY timing flake (rank-0 arm read 0.4188) |

Two flakes were seen and re-run to ground, both on unchanged code:
- **`p4_test` run 2 failed four paint checks in a cascade from one root cause, `shots:0`** — the drill
  fired nothing, so there was no paint to persist. Run 1 and run 3 of the same build passed all four.
- **`p2_test` §3 "holding the second tap keeps firing" read `mag 8 -> 30`**, i.e. the magazine went
  *up*: the page had reloaded under the suite. That was **P5b's own fault** — a second CDP client
  (the corner probe) navigating the shared browser mid-run. Re-run alone: 56/56. See the trap above.

## Harness edits P5b made
The three suites that asserted the pre-P5b draw-call figures were rebased — the game changed under
them, the claims did not:
- `split_test.mjs` "draw calls on L1 === 114" and "L8 ~ 305 +-25" -> post-P5b bands (L1 36-70, L8 110-160)
- `p4_test.mjs` §the same two
- `p4b_test.mjs` §8's two headline figures (its **exact** claim, "one layout costs exactly 6 draw
  calls" against a rigs-hidden static world, is untouched and still passes)
New suite: `scratchpad/p5b_test.mjs` (41 checks: draw calls, the collapsed material set, the
white-fill mergeGeos claim, the three tiers, the hit-box headline at 40 m, two gameplay canaries plus
an error canary, thrash, bosses, boss tint from the material, paintball).

## A PRE-EXISTING FAILURE P5b's sweep found (NOT P5b's, and proven so)
`p4b_test` §10 **"from every level's insertion point the whole yard is walkable — all four corners"**
now fails on **L3 (OPEN GROUND), corner (24,24)** — `navPath` returns `ok:false`.

It is **not** a P5b regression and the proof is direct: P5b reverted its own edits into a
reconstructed pre-P5b build (5176 lines, the figure this phase inherited) and the identical isolated
probe fails **4 runs out of 4 on the OLD build and 4 out of 4 on the new** — same level, same layout,
same single corner, deterministically. P5b's whole diff is 417 lines in three regions: the file-map
comment, `mergeGeos`/`tintGeo`, and everything from `§ENEMIES` down. `§WORLD`, `§COLLISION`, `§NAV`,
`§LAYOUTS` and all five other JS files are **byte-identical**. Nothing P5b touched can reach A*.

So either it regressed between P5a's 63/63 and now for another reason, or P5a's run got a luckier
crate roll. Worth ten minutes in P5c: the level's own spawn test (`spawnPoints()` A*s to the insertion
point) means no enemy can actually be stranded by it, so it is a map-coverage wart, not a stuck round.

## Open, not P5b's
- `e.bibMat` is a plain `MeshLambertMaterial` with **no** `vertexColors`, so a paintball target's bib is
  the one rig mesh on a different render path from the rest of the rig. It is correct and deliberate —
  the bib wants its emissive — but it means the drill costs one extra draw call per target and the bib
  cannot be folded into the torso the way the normal webbing is. Six targets, all close: 6 calls.
- The mid tier's thresholds (22 in / 25 out) are the one number here chosen to land the target band
  rather than derived. At 25 m the knee bend is ~9 px of foot travel and the head nod is under a pixel;
  moving it out to 30 would cost ~20 draw calls on L8 and put the figure at ~155.


## P5b RESULT + a correction to this file
Draw calls, quality and reference pose pinned: **L1 114 → 46–55**, **L8 302 → 128–142** (target was 120–150).
Vertex colours are a flat 3 calls/rig; the detail tiers are the rest; the tag cull is worth only 1–2 because
the old rule already hid tags past 38 m. A drawn rig went from **15 meshes on 8 materials to 12 on 2**.

**This file said "L8 static world 271". That was wrong and it was never the static world** — it is the rig
cost (302 − 35 = 267 over 19 rigs = 14.05/rig). Hiding every rig gives **35**, stable. `p4b_test` §8's
independent "no layout 30 → one layout 36 → all five 60" had been saying the same thing all along and
**nobody reconciled the two numbers**. Two measurements of the same quantity disagreeing by 8x is a signal,
not a rounding difference; reconcile them next time instead of quoting whichever is nearer to hand.

## THE SUITES NOW LIVE IN THE REPO — `gms/3d/breachpoint2/tests/`
They spent the whole build in a session-scoped scratchpad, i.e. the entire evidence base for "this game
works" was one closed session from deletion. `tests/` holds the 8 suites + `lib.mjs` + the two balance
scripts; `tests/probes/` holds 56 one-off probes. `tests/README.md` carries the measurement discipline.
**Re-copy anything a later phase writes in the scratchpad.**

## New trap from P5b (it found this and then walked into it)
**Never run a second CDP client while a suite is live on 9223.** It produced a phantom `mag 8 → 30`
failure in `p2_test` and a nonsense `quality:'high'` reading. Same family as the two-browser rule above.

## P5d — REPO STATE BEFORE YOU COMMIT (checked by the coordinator 2026-09-18 12:13)

The tree is shared with other live sessions. Three things to know:

1. **`gms/3d/breachpoint2/` is entirely untracked** — one clean `??` entry, nothing of ours is
   half-staged. Stage exactly `gms/3d/breachpoint2` (plus `projects.js` and
   `assets/screenshots/breachpoint2.jpg` when those are ready) and **nothing else**.
2. **53 other paths are dirty** — `games/`, `gms/2d/ragdojo/`, `assets/screenshots/emberwake.jpg` and
   more, all belonging to other sessions. **Never `git add -A`.** Never `git add .` from the repo root.
3. **`main` is already 2 commits ahead of origin, and neither is ours:**
   - `2dff48c2` Longshot B4: a city with people in it
   - `bd67ef4d` WIP B4 (manager checkpoint): work in progress, unverified
   **A push from here publishes both**, including one explicitly labelled *work in progress, unverified*.
   That is another session's call, not ours. **Do not push without asking Aaron first** — committing
   locally is fine, pushing is not. If he wants ours live without theirs, that needs a branch, not a push
   from `main`.

Also: 0 commits behind upstream, so no rebase is needed. If that changes, check behind/ahead before
rebasing — `--autostash` will pocket another session's live work.


---

## P5c CLOSED 2026-09-18 — the stuck player + balance polish

### 1. The debrief escalates, and nothing else moves
`Profile` is **v2**. Two additive maps: `fails{}` (consecutive losses per level) and `recruit{}`
(which clears were made on RECRUIT). A **v1** save — a real one, with SP, spend, six ranks, three
weapons, four clears, best times and career stats — migrates and keeps every field; a **v0** save
still lands on v2; a corrupt save still yields a blank v2. The migrated save is rewritten to disk
at v2, never dropped.

**§STUCK in `armoury.js`** renders into `#debrief` on the end screen, on a LOSS only, and the tier is
a pure function of the counter:

| losses | what it says |
|---|---|
| 1 | nothing at all (`#debrief` is empty, and `#debrief:empty{display:none}`) |
| 2 | the survival readout for this level + **one** BEST BUY row (name, price, `now → next` seconds, and whether it is affordable or how many SP short) |
| 3 | + the honest line: *"At your build this mission gives you 1.5 s of open ground. The build it is balanced around — PLATING 3, VITALITY 4, 3,700 SP — gets 3 s. You have earned 2,600 SP; this one is built for 4,300. **The wall is 1,700 SP high.**"* |
| 4+ | + *"THE LONG WAY ROUND — replay M4 NIGHTFALL, about 920 SP a run at your best time of 2:41, 342 SP a minute. 1 run pays for VITALITY 2."* |

- **BEST BUY only ever considers PLATING and VITALITY.** They are the only two tracks §SURVIVAL can
  measure; recommending a track the number cannot see would be guessing. It picks by seconds bought
  per SP, not by seconds bought — which is what stops it recommending the plating trap.
- **"the build it is balanced around"** is derived, not asserted: it is the greedy optimum over the
  two tracks at the level's own `spTarget`, run through the same model the readout prints.
- **The replay route is counted off the real award paths** (`100 x level` replay clear, `10 x level`
  a kill, `+120` a boss) and the player's own `bestTime`, so the SP/minute is the game's arithmetic,
  not a guess.
- `fails` is read by the debrief **and by nothing else**. No enemy, no timer, no tier and no gate
  reads it. There is no rubber-banding, no paid skip, and the debrief is asserted never to contain
  the string RECRUIT.

### 2. RECRUIT
`S.recruit`, default **0**, first row of the first settings section (**DIFFICULTY**, above CONTROLS).
It is exactly one line — `if(S.recruit) amount *= RECRUIT_MUL` with `RECRUIT_MUL = 0.6` — at the top
of the non-paint branch of `damagePlayer`, so it scales rounds, falls and the out-of-bounds dunk
alike. Measured through the live pipeline at PLATING 2: 50 damage costs **50.000** standard and
**30.000** on RECRUIT, and the armour bite and the HP bite scale by the same 0.6 (it is genuinely one
multiplier, not a table). `Profile.clearLevel(n, time, recruit)` stamps `recruit[n]`, and the hub card
shows a **RECRUIT** tag plus a `CLEARED ON RECRUIT` line instead of REPLAY.

### 3. L5 `maxAttackers` 3 → 4 (the coordinator's call), and the curve after it
`LEVELS.map(l=>l.maxAttackers)` is now **1,2,2,3,3,4,4,4,4,4**. **`TIERS` is byte-identical** —
md5 of the whole `§TIERS`→`§LAYOUTS` block is **`2204e395ca5b1588c99a6a62926c1012`** and the live
table still reads apPen 0/0/.10/.18/.26/.34 and dmg 5/9/12/15/18/22.
(PIPELINE's older `c0f0aa0c…` was over a different line range; this hash is over the anchored block,
which is what `p5c_test` asserts.)

**The TTD curve at each level's new `spTarget`, greedy-optimised on the real `gateCalc`:**

| lvl | name | spTarget | optimal build | cost | TTD |
|---|---|---|---|---|---|
| L1 | THE DOCK | 0 | P0V0 | 0 | **12.81 s** |
| L2 | CONTAINER ROW | 450 | P1V1 | 300 | **9.38 s** |
| L3 | THE OVERLOOK | 1000 | P2V2 | 1000 | **8.43 s** |
| L4 | NIGHTFALL | 1800 | P3V2 | 1700 | **6.09 s** |
| L5 | SUPPLY LINE | 2900 | P3V3 | 2400 | **5.09 s** |
| L6 | THE SIEGE | 4300 | P3V4 | 3700 | **3.00 s** |
| L7 | BLACKOUT | 4900 | P3V4 | 3700 | **3.00 s** |
| L8 | BREACHPOINT | 8000 | P4V5 | 7200 | **2.50 s** |

Never gentler, **5.12x** end to end, **L5 now strictly harder than L4** (the visibility inversion is
gone) and L6/L7 still flat, which is the shape the coordinator asked for.
P5a's estimate for the L5 lever was ≈4.6 s; that was at the old 2000 SP target. At 2900 it is 5.09 s —
the lever is the same size, the build under it is one rank richer.

### 4. `spTarget` — MEASURED, not guessed
A clean first playthrough was **driven** — every level loaded, every enemy killed through
`Enemies.damage` → `kill` → `GAME.onKill` → `Profile.award`, every objective completed for real,
every `end()` run. Career SP **on arrival** at each level:

| | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | after L8 |
|---|---|---|---|---|---|---|---|---|---|
| career SP | 300 | 700 | 1560 | 2830 | 4450 | 6570 | 9190 | **12400** | **16140** |

(300 is the drill. The driven run banks the flawless +100 every level and earns no accuracy or
headshot bonus, because a scripted kill fires no shots; a real clean player trades one for the other,
so the table is the right order of magnitude either way.)

**P5a's 7300 was the clear bonuses ONLY.** With kills, bounties and the flawless row counted, a clean
run pays **16,140** — so L8's old 11,000 was *technically* earnable, at **89% of a perfect run**, with
893 SP of slack against a 2,200 SP rank. In practice the hub said "under-equipped" for the whole
campaign.

New targets, each **~65% of what the campaign has paid by then**:
**0 · 0 · 450 · 1000 · 1800 · 2900 · 4300 · 4900 · 8000**, and ENDLESS copies L8 at 8000.
Fractions: L2 64% · L3 64% · L4 64% · L5 65% · L6 65% · **L7 53%** · L8 65%.
**L7 is the one exception and the reason is structural**: L6 and L7 are the same tier with the same
attacker cap, so the model cannot tell them apart, and *any* budget gap that crosses a rank-cost
boundary makes L7 read easier than L6. 4900 keeps both on the same optimal build. That constraint is
P5a's finding re-derived, not a new one.

The award model is asserted against a **real driven clear**: L2 pays exactly **860** (140 kills +
120 bounty + 500 first clear + 100 flawless) on 7 kills, which is what the model predicts.

### 5. `p4b_test` §10 — what it was actually catching
**Two defects, one on top of the other.**

**The map defect.** OPEN GROUND's `[23.2, 20]` block put a container on the quay whose north face
(z 23.03) and the `[19,26]` block's east face (x 22.03) left a **1.75 m** diagonal mouth into the
south-east quay corner. NAV inflates every solid by `AGENT_R` 0.44 and refuses to cut corners, so only
**~0.87 m** of that was walkable — narrower than the **1.66 m** band a single barrel blocks. And
`barrelStack(24.0, 24.5, 4)` scatters into that exact mouth. Measured by flood fill from L3's own
insertion point, over fresh prop rolls: with the old block the 3 corner cells were stranded in
**5 rolls of 6**; with the props removed entirely they were reachable **6 of 6**. So neither the
containers nor the barrels were the cause on their own — the **conjunction** was.
The player's collision radius is under the nav inflation, so he could walk into a corner **nothing
could follow him into**. That is a gameplay wart, not just a coverage one.

**The instrument defect.** `navPath()` runs `nearestFree()` on its *target*. When a barrel happened
to land on the target cell, the search was silently retargeted to a reachable neighbour and the check
**passed** — which is why a 5-in-6 defect read as a 1-in-3 flake. Measured directly: planting a barrel
on (24,24) flips `navPath` from false to true without changing reachability at all.

**The fix is in the layout, not the assertion**: `[23.2,20] → [23.2,18]`, a 3.75 m mouth with ~2.87 m
walkable. `p5c_test` §7 measures it by **flood fill** (every free cell within 2 m of the corner must
be in the insertion point's component), gets **12–17 of 12–17 on every roll**, and **falsifies itself**
by pushing the old block back and watching the same check strand the corner again.

`spawnPoints()`'s A* to the insertion point meant no enemy could ever be stranded by this, which is
why nothing in play ever broke.

### TRAPS ADDED BY P5c
- **`NAV.path()` is a lying instrument for "is this point reachable".** `nearestFree()` silently
  retargets a blocked target to a free neighbour, so blocking a cell can turn a failing path into a
  passing one. Flood-fill from the source and ask whether the cell is in the component. (`p4b_test`
  §10 has this shape and is left as-is deliberately — it is a *player-reachability* check, and the
  retarget is arguably what it should do. Just never read its pass as proof of coverage.)
- **`loadLevel(n)` does not rebake NAV if the level's layout is already active.** `setLayout` returns
  early on `id===activeLayout`. A probe that toggles `solids[].off` and then calls `loadLevel` to
  "refresh" measures the STALE grid — which made an entire prop-isolation experiment read
  "props make no difference" for twenty minutes. Call `NAV.bake()` explicitly.
- **"Keep props a walkable clearance off the walls" makes connectivity WORSE, not better.** The first
  attempt at fixing §10 gave `spotFree` an agent-radius margin against world solids. Measured: total
  stranded cells went from 8–41 up to 11–27 *per layout* and the corner still failed 3 in 12, because
  a prop pushed to the middle of a gap creates two sub-agent-width slots instead of one flush wall.
  Reverted. A prop against a wall costs nothing; a prop 0.5 m off it costs the corridor.
- **A scripted kill fires no shots**, so a driven playthrough earns 0 accuracy bonus and 0 headshots
  while banking `flawless` every time. Both are known and roughly cancel — but say which you measured.

### Suite results at the close of P5c
| suite | result |
|---|---|
| `p5c_test` (**new**, 60) | **60/60** (twice, back to back) |
| `p5b_test` | **41/41** |
| `p5_test` | **26/26** |
| `p4c_test` | **33/33** |
| `p4b_test` | **63/63** — §10 is fixed, not suppressed |
| `p4_test` | **97/97** |
| `p2_test` | **56/56** |
| `split_test` | **40/40** |
| `desktop` | **7/7** |
| `p3_test` | **69/70** — the documented STEADY assist-cone timing flake, twice in a row, same signature (rank-0 arm reads 0.4188 off a 0.28 cone). Untouched by this phase. |

`p5b_test` failed ONE check on its first run — `head 39.87 / 39.83`, a 4 cm difference in the 40 m
hit-box sweep — and passed 41/41 when re-run alone. Another session was driving a browser on this
machine at the time. Same family as P5b's own `mag 8 → 30`: **distrust the harness before the code.**

### Harness edits P5c made
The game changed under four suites; the claims did not:
- `p5_test` §3 the two `spTarget` literals (L5 2000 → 2900, L7 5200 → 4900) and §5's three
  `v===1` assertions → the current schema version. The "an old save is rewritten, never dropped"
  claim is the same claim, now doing two hops.
- `p4c_test` §1 and `p4b_test` §9 both pinned the `maxAttackers` string; L5 moved 3 → 4.
  Variant C's own changes (L7 5 → 4, L8 6 → 4) and P4b's endless 6 → 4 are still asserted.
- `p5_test`'s "L4/L5 and L6/L7 are FLAT" console note — L4/L5 is not flat any more.
No assertion was weakened and none was deleted.

### What P5c would argue with
- **`power` in the hub is `sp + spent`, i.e. everything ever earned, and `spTarget` is compared to
  it.** That means a player who respecs, or who buys all four weapons (4,200 SP), still reads as
  "equipped" — the readout measures *income*, not *fitness*. It is the right call for the advice it
  gives ("have you played enough to be here"), but the label POWER oversells it. A second line
  showing SP actually sunk into the two defensive tracks would say more.
- **ENDLESS copying L8's `spTarget` is meaningless.** ENDLESS escalates per wave, so no single
  number describes it. It should probably print no recommendation at all.
- **The `p4b_test` §10 instrument is still `navPath`**, which retargets a blocked destination and can
  pass on a search it did not make. It was left alone on purpose — it is a *player*-reachability
  check and the retarget is arguably correct there — but §10 should not be read as map coverage.
  `p5c_test` §7 is the coverage check.


## P5c's §10 finding — the best bug of this build, worth reading twice
`p4b_test` §10 was **not a flake**. It was two defects stacked:
- **A map defect.** OPEN GROUND left a 1.75 m diagonal mouth into the SE quay corner; NAV inflates by
  `AGENT_R` 0.44 and will not cut corners, so only **0.87 m** was walkable — narrower than the 1.66 m one
  barrel blocks — and `barrelStack(24.0, 24.5, 4)` scatters into exactly that mouth. Neither the containers
  nor the barrels caused it alone; the **conjunction** did. **The player's collision radius is under the nav
  inflation, so he could walk into a corner nothing could follow him into** — an exploit, not a cosmetic bug.
- **An instrument defect.** `navPath()` runs `nearestFree()` on its *target*, so a barrel landing on the
  target cell silently retargeted the search to a reachable neighbour and the check **passed**. That is why
  a 5-in-6 defect presented as a 1-in-3 flake.

**A "flaky" test is a hypothesis, not a diagnosis.** This one had been dismissed as intermittent twice.

## A rejected fix, recorded so nobody tries it again
Giving `spotFree` an agent-radius clearance against world solids made connectivity **worse** (stranded cells
per layout rose from 8–41 to 11–27, corner still failing 3/12): a prop pushed off a wall creates two
sub-agent-width slots where there was one flush wall. Reverted.

## Contention, third sighting
`p5b_test` failed once (4 cm on a hit-box sweep) while another session drove a browser on this machine, and
passed 41/41 alone. Same family as P5b's phantom `mag 8 → 30`. **One browser on this machine at a time.**


---

## P5d CLOSED 2026-09-18 — ship prep

### The full-suite ship run
Every suite on its own browser (`cdp stop && cdp start` between), nothing else on this machine.

| suite | result |
|---|---|
| `p5c_test` | **60/60** |
| `p5b_test` | **41/41** (40/41 and 39/41 on two earlier runs — see below) |
| `p5_test` | **26/26** |
| `p4c_test` | **33/33** |
| `p4b_test` | **63/63** |
| `p4_test` | **97/97** |
| `p2_test` | **56/56** |
| `split_test` | **40/40** — `L1: 46  L8: 134` draw calls |
| `desktop` | **7/7** |
| `p3_test` | **69/70** — the documented STEADY assist-cone flake, same signature (rank-0 arm reads 0.4188 off a 0.28 cone) |
| `boot` (**new**, 44) | **44/44**, twice |

### `boot.mjs` — new suite, now in `tests/`
Four combinations: **`file://` and `http://`** (a `python3 -m http.server` on the site root) x **portrait
390x844 and landscape 844x390**. Each asserts THREE / `BP2` / `__game` up with a canvas drawing and the
loading panel gone, **zero `type="module"` tags**, the instruction gate fitting the viewport with nothing
overflowing it, BEGIN TRAINING inside the viewport at >=40 px, **one real tap** shutting the gate and
starting the drill, both hold-drag thumb sticks raising **fully on screen** under a finger, RELOAD and PAUSE
on screen at >=40 px, **no horizontal page scroll** in the gate or in play, no visible text under 10 px,
**zero console errors**, and an **error canary** in each of the four proving the collector was alive.

Measured: L1 draw calls **34** portrait / **63** landscape at the boot pose. The only 404 anywhere is
**`/favicon.ico`**, which is the browser's own request (proved against the server log and the Network
domain) and never happens over `file://`.

### Screenshot
`/assets/screenshots/breachpoint2.jpg` — **1400x729, 154 KB** (`breachpoint.jpg` is 1400x729, 176 KB).
L3 THE OVERLOOK, the only dusk level with a boss: camera on the quay at `(22, -20)` facing `yaw PI`
(**`yaw PI` is +z; `yaw 0` is -z**), CAPTAIN staged at `(19.6, -12)` with an escort, gantry crane legs and
boom framing the left, the water beyond them, containers and barrels right, boss bar across the top.
Taken at `quality:'high'` — the auto-quality net fires once on this software renderer, so the script puts
HIGH back and re-applies *after* it has fired (`_autoQ` latches at 1 and will not fire again) and clears
its toast before the capture.

### TRAPS ADDED BY P5d
- **CDP wants EVERY active touch point in each `Input.dispatchTouchEvent`, not just the new one.** Sending a
  second `touchStart` carrying only the second finger drops the first, intermittently — which reads as "the
  thumb stick did not appear" in 1 of 4 runs, then all 4. Drive one finger at a time unless the check is
  actually about multi-touch.
- **A test that freezes an enemy and then measures it has not frozen it.** The game loop keeps running
  between the freeze and the read.
- **`#startScreen` is not what boots.** The game opens straight onto `#introScreen` (the gate) with
  `#startScreen` hidden and its buttons at 0x0. A layout check aimed at DEPLOY/CAMPAIGN/SETTINGS measures a
  screen that is not on screen and fails for no reason.
- **`GAME.start(n)` does not take a level number** — `campaign.js` wraps it and it takes a level *def*.
  `loadLevel(n)` is the entry point. `start(3)` silently leaves you on the day-lit training yard, which
  looks exactly like a lighting bug.

### Three low-rate failures, all diagnosed rather than re-run away
**1. `p5b_test` §4 "and it lands at the same range to the centimetre" — harness artefact, ~1 run in 2.**
The four assertions around it pass every time: identical part sweep (`.....llllllllllltttttttthhhh.........`
in both LOD states), identical part pitches, and a real fired round doing **21.6365 vs 21.6364** damage.
Only the range clause disagrees, by 2-11 cm. Re-run logging the enemy's position at each read: between the
check's `freeze` and its `probe()` the enemy had drifted to **`x 0.0763, z -19.9915`** — 7.6 cm. Sampled at
three fixed pitches back to back, the two states give **identical** `dist`, `epos`, `scaleY` and camera.
The tolerance is 1 cm against a target the test does not hold still. Fix the test, not the game.

**2. `p5c_test` §0 error canary "COLLECTOR IS BLIND" — start-up race, 2 runs in 4.** Thrown 280 ms after a
navigate on a freshly started browser; the `Runtime`/`Log` subscription is occasionally not yet delivering.
Every other canary in the suite fires in the same run. Needs a retry-with-deadline.

**3. `p5c_test` §7 "all four corners are reachable from every insertion point" — A REAL DEFECT.** See below.

### THE L5 QUAY-STRIP SPAWN POCKET — real, rare, measured, NOT fixed
The signature is always identical: **L5, all four corners at once**, plus sometimes L8 at one corner. All
four failing at once is what a blocked *source* looks like, not a corner problem — and the flood-fill
coverage check beside it (the one P5c wrote precisely because `navPath` lies) passed **5/5 on every run**,
with its falsification.

Flood-filled from `LEVELS[5].insert` = **(24, 18)** over **222 fresh prop rolls**: it lands in a component
that is **1.02% of the free grid on 4 of them (~2%)**. The distribution is **bimodal — 1.0% or 98.8%, never
marginal**. The pocket is **41 cells**, bbox `x 22.13-24.38, z 16.88-24.38`: the quay strip between the
QUAY WALL container line at x≈20 and the kerb at x 25.75-26.25. What walls it in, dumped from a failing
roll:
- **south:** the two crane legs at `x 22.44-22.96` and `x 25.04-25.56`, z≈15.6, `climb:false`, **1.20 m
  apart** — at `AGENT_R` 0.44 inflation that mouth is marginal at the 0.75 m cell size;
- **north:** a two-tier barrel at `(23.33, 25.91)` from **`barrelStack(24.0, 24.5, 4)`** landing beside the
  bollard at `x 24.69-25.31, z 25.69-26.31`, which together block `x 22.50-25.75`.

**It is the same `barrelStack` P5c caught plugging the SE quay corner, scattering into the same corridor
from the other end.** Removing the props in the z 12-17 band does **not** free it (1.02 -> 1.41%), so
`crateCluster(24.3, 14.0, 3)` is not the cause — the north mouth is.

Consequences: `spawnPoints()`'s A* to the insertion point rejects nearly every candidate and falls through
to its last try, so the roster spawns where it cannot path to you. The props are `climb:true`, so the player
can very probably mantle out — **not verified**, because the seal could not be reproduced on demand.

**Not fixed, deliberately.** It is world geometry that predates every phase that found it, the fix means
editing `js/engine.js` and re-running five suites on the day everything else was verified, and the build is
about to be played by hand rather than shipped to anyone. The lever, for whoever takes it, is
`barrelStack(24.0, 24.5, 4)` in `§WORLD` or L5's insertion point — **not** the nav inflation and **not** a
clearance margin around props (tried in P5c, measurably worse). Recorded in `HANDOFF.md` §9.6 and warned
about in `PLAYTEST.md`.

### What P5d changed on disk
- `docs/HANDOFF.md` brought to the shipped state: the perf pass and its numbers (new §4.6), profile v2 and
  RECRUIT, the measured `spTarget` table and L5's `maxAttackers`, `tests/` living in the repo, the new
  suites, the newer harness traps, the flake table, and **§9 re-checked item by item** — four of its five
  "check, don't assume" warnings are resolved and say so, one is still true and deliberate, and §9.6 is new.
- `docs/PLAYTEST.md` — new. What Aaron should look for, in the order he will hit it.
- `tests/boot.mjs` — new suite, copied out of the scratchpad per the standing rule.
- `/assets/screenshots/breachpoint2.jpg` — the one file written outside `gms/3d/breachpoint2/`.
- **No change to any `js/`, `css/` or `index.html` file. No change to `projects.js`. Nothing pushed.**

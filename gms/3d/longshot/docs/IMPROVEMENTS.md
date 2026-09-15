# LONGSHOT — ranked improvement backlog

Audit by **R0 (Reviewer)**, 2026-09-15. Read `CLAUDE.md` first — it is authoritative
and nothing here asks you to regress it. Every claim below is either **measured**
(headless Chrome over CDP at 1280×800 and 390×844, or node) or **cited to a line**.
Screenshots referenced live in the scratchpad paths given in §Evidence.

---

## Verdict

LONGSHOT is a **genuinely accomplished simulation wearing a thin coat of city**. The
ballistics are real and node-tested (17/17 green), the two-view scope, the walkable
perch, the per-rifle procedural viewmodel, the follow-bullet cam and a full
procedural Web Audio kit (`audio.js` exports 30 distinct sounds) are all better than
this genre usually gets. The sightline-corridor generator solves a hard problem
correctly. The bot clears **17 of 21** story missions.

Three things hold it back, in order:

1. **The city is one colour and one shape.** Not figuratively — measured. Ten
   distinct vertex tints in a whole scene, mean saturation **0.191**, and the single
   most common tint covers **58%** of sampled building geometry. Every roof in the
   city is one of three hardcoded greys, in a game played exclusively from roofs.
2. **The camera does not look at the mark.** `missions.js:180` flattens the opening
   aim to `setY(1.4)`, so on all five `room` missions the game opens aimed **4.8°–9.3°
   below** the target, filling **up to 63%** of the first frame with the shooter's own
   flat grey deck. This is the owner's "can't see the target" complaint, and it is
   ~one line.
3. **The reward layer is disconnected from the game.** The `moving` (+400) and
   `ghost` (+600) bonuses can never be awarded; **15 of 21 missions cannot reach
   gold and 9 cannot reach silver**; THE NEST ends after one kill; and the city holds
   **9 people**.

None of these is architectural. The expensive work is already done.

---

## Evidence appendix

All figures measured this session unless marked *(code)*.

### Harness
`node tools/test_ballistics.mjs` → **17/17 PASS**. Served from `yru/site` on :8841;
headless Chrome via `~/.claude/bin/cdp start --port 9223`, `Network.setCacheDisabled`
set before every navigation. `window.__game` exposes `rig`/`mission`/`city`/`pop`/
`walker` but **not `scene` or `renderer`** — `rig.scene`/`rig.camera` are the only
handles, and draw calls had to be measured by wrapping the WebGL context directly.
*(That missing handle is itself item B9.5.)*

### Render cost — `s03`, seed 1, day, 1280×800
| metric | value |
|---|---|
| draw calls / frame | **56.5** |
| triangles / frame | **59,107** |
| meshes / skinned / sprites / instanced | 60 / 9 / 33 / 1 |
| materials | 85 |
| city colliders | 527 (h: min 9.1, median 20.5, max 142.4) |

Draw calls and triangles are **healthy** — the merge-by-material strategy works.
Headless rAF pins fps at 20–32 and is not a useful perf signal (CLAUDE.md says the
same). **There is no evidence of a frame-time problem; do not "optimise" blind.**

### Palette — measured from live vertex-colour buffers (`s17`, seed 9, day)
| metric | value |
|---|---|
| distinct tints in the whole scene | **10** |
| mean saturation | **0.191** |
| max saturation | 0.389 |
| most common tint `0.20,0.21,0.23` | **1336 / 2305 sampled verts (58%)** |

Source *(code)*: `city.js:337–341` defines 3 districts × 4 tints. `city.js:344`
uses the district's default facade style **70% of the time** (`rr.chance(0.3)`), so a
district is overwhelmingly one style *and* one narrow tint band. The roofscape is
worse — three hardcoded constants, no jitter, no variation, city-wide:
`city.js:351` slab `0.16,0.17,0.19` · `city.js:360` parapet `0.20,0.21,0.23` ·
`city.js:367` clutter `0.26,0.27,0.30`.
See `shots/title.png` — from altitude the entire city is one tan mass.

### Population
**9 people** in a 780 m city (`s03`: 1 target + 8 civilians). `s13` 7, `s17` 11.
Source: `nCiv = setup.civs ?? 10` *(`missions.js:161`)*. 28 rigged characters ship in
`assets/chars.dat`; **9 distinct files were loaded** in an `s03` run.

### `?auto` bot — story, seed 4
17/21 won. Most wins are **1 shot in 5–9 s**.

| result | missions |
|---|---|
| won (1 shot, ≤10 s) | s02 s03 s04 s06 s07 s09 s12 s13 s15 s16 s17 s18 s19 s20 s21 |
| won (slow) | s05 (53 s, 10 shots), s11 (17 s) |
| **lost / timeout** | **s01**, **s08**, s10 *(known non-bug)*, s14 |

Re-tested across seeds:
- **s01 (the tutorial) is seed-dependent**: seed 1 → won, 3/3 plates, 15 s.
  seed 4 → 17 shots, **plate 3 never hit**. seed 9 → 15 shots, `plates:[true,true,false]`.
- **s08 (convoy) failed on every seed tried (1, 4, 9): 14 shots, 0 hits, every time.**
  Not on CLAUDE.md's known-non-bug list — this is new and deterministic.
- Contracts: `daily` won 7 s · `weekly` won 5/5 in 37 s · **`endless` "won" in 12 s
  after one kill** (confirms the `_checkWin` gap, `missions.js:1071`).

### Visibility audit — 7×7 = 49 standable spots on the perch roof, seed 4
Measured with the game's own `mission._losClear` from `walker.surfaceAt(x,z)+1.62`.

| id | mark | kind | dist | vis/49 | note |
|---|---|---|---|---|---|
| s01 | plate 3 | steel | 328 m | **0/49** | **real — tutorial unwinnable on some seeds** |
| s02 | MARCO BELLAN | plaza | 175 | 49/49 | |
| s03 | THE ACCOUNTANT | room | 227 | 0/49\* | \*instrument — see below |
| s04 | REMO / DINO | plaza/bench | 199/192 | 49, 48 | |
| s05 | THE BAGMAN | walk | 206 | **0/49** | **real — ground mark, see B1.6** |
| s06 | THE BUYER | plaza | 230 | 7/49 | normal |
| s07 | THE COURIER | walk | 269 | 25/49 | |
| s09 | THE CHEMIST | room | 264 | 0/49\* | |
| s11 | THE SMOKER | room | 341 | 0/49\* | |
| s12 | HEAD OF SECURITY | rooftop | **302** | 49/49 | briefed 520 m |
| s13 | DIRECTOR HALE | room | 420 | 0/49\* | |
| s14 | CELL LEADER A | plaza | 277 | **0/49** | **real** |
| s14 | CELL LEADER B / C | walk/roof | 327/301 | 19, 49 | |
| s15/s16/s18/s19 | — | walk/plaza/pair | 360/297/343/465 | 49,40,48,42 | |
| s17 | OPS CHIEF | room | 402 | 0/49\* | |
| s21 | AURELIUS VANE | rooftop | **307** | 49/49 | briefed 650 m |

**\* These five are my instrument, not the game — and finding that out uncovered a
real bug.** The bot kills every one of them in **one shot in 5–17 s**. Chasing the
contradiction: `losFrom` (`missions.js:26`) calls `raycast(..., max: dist-1.5)`, but
the room-exit clip returns a hit **beyond `max`** — the far wall of the very room the
mark stands in. Measured: s03 target at 227 m, reported blocker at **230.7 m**;
s09 264/269.2; s11 341/345.6; s13 420/423.7. Reduced to an 8-line node repro
(`scratchpad/repro.mjs`): target at 193.0 m, `max` 191.5, `raycast` returns
`building` at **196.0**. So `_losClear` calls **every `room` mark in the game blind**
while the ballistics kill him — precisely the disagreement `CLAUDE.md`
§"A building is not a tunnel" claims was fixed. See **B1.5**.

Independent cross-check: s12 briefed 520 m measured **302 m**, s21 briefed 650 m
measured **307 m** — confirming `rooftop` hardcodes `td.dist || 300` *(`missions.js:239`)*.

### Opening framing — the `setY(1.4)` bug, measured
`roofPct` = share of 100 screen rays hitting a mesh within 60 m (i.e. the shooter's
own deck). `tgtScreenY` = the mark's normalised screen height (0 = centre).

| id | shipped pitch | **aimed at the mark** | roofPct shipped → fixed | tgtScreenY shipped |
|---|---|---|---|---|
| s03 | −0.182 | −0.099 (**4.8° low**) | 57.0% → 52.9% | +0.16 |
| s09 | −0.171 | −0.008 (**9.3° low**) | 54.5% → **43.8%** | +0.31 |
| s13 | −0.137 | −0.098 | 39.7% → 36.4% | +0.07 |
| s17 | −0.128 | −0.022 (**6.1° low**) | 24.0% → **14.0%** | +0.20 |
| s11 | −0.145 | −0.093 | 22.3% → 19.0% | +0.10 |

Worst measured frame: `s03` day, **63.1%** of the frame is the deck
(`Mesh:24`, colour `#53565d` at 2.9 m — the gravel deck from `city.setVantage`,
`city.js:698`). See `shots/day_s03_s1_unscoped.png`.
`shots/night_s03_s1_scoped.png` is the same mission scoped: a flat dark navy field
with the mark clipped to the **top edge of the scope circle**.

### Mobile — 390×844, `Emulation.setDeviceMetricsOverride`
All eight HUD elements on-screen, correctly sized, **no overlap, nothing clipped**.
`shots/mob_s17_dusk.png` is the game at its best — warm dusk, lit windows, a readable
skyline. **The dusk/night look is a genuine strength; preserve it.**

### Screenshots saved
`/private/tmp/claude-501/-Users-aaronair-cc/3b261aa5-6a2a-403a-b9b9-71bdc2dd9ac4/scratchpad/shots/`
`title.png` · `day_s03_s1_unscoped.png` · `night_s03_s1_scoped.png` ·
`dusk_s17_s9_unscoped.png` · `palette_day_city.png` · `mob_s17_dusk.png` ·
plus day/dusk/night/rain × s03 and scoped variants.

---

## The backlog

Nine batches, **ranked by impact per unit effort, highest first**. Each is one solid
session for one agent. Effort: **S** ≈ under an hour · **M** ≈ half a session ·
**L** ≈ a full session.

Every worker: leave `node tools/test_ballistics.mjs` **green**, tick your items off
here with a note on what you actually verified, and stage **only** `gms/3d/longshot`
paths (another session is live in this tree).

---

### B1 — Correctness: the bugs that switch whole systems off
**Goal:** make the systems the game already advertises actually run.
**Do this first.** Every item is a handful of lines, each independently verifiable,
and between them they restore two scoring bonuses, an entire game mode, the campaign's
two longest shots, and the LOS contract the codebase documents as load-bearing.

- [x] **B1.1 — The `moving` +400 bonus can never be awarded.** `missions.js:692`
      tests `p.state === 'route'`; `people.js:73` sets `state: 'routine'` and
      `'route'` appears nowhere else in the tree. Dead on s05, s07, s15, s19, every
      `walk` daily and every weekly mover — while `story.js:61` explicitly advertises
      it. **Done:** kill a walker, see +400 in the results breakdown. `missions.js`, `people.js`. **S**
      **[x] VERIFIED** — `p.state` is already `'dead'` by the time `_onKill` runs (`pop.kill` precedes it), so the audit's `'routine'` swap would also have been dead; judged on `p.vel` instead. Results breakdown, s19/seed4: shipped `[Contract 1473, No shot wasted 800]` -> fixed adds `["Moving target x1", 400]`. Also fires on s05, s07, s14, s15, s18.
- [x] **B1.2 — The `ghost` +600 bonus is unreachable on 20 of 21 missions.**
      `_panicAt` (`missions.js:729–732`) sets `this.panicked = true` unconditionally,
      and every kill routes through it via `_onKill` (`:700`) — so the `!this.panicked`
      test at `:1103` is always false. Only s20 escapes, because `_hitSniper` never
      panics. Fix by having `pop.panicFrom` return a count (the comment at
      `people.js:181` already promises it does) and setting `panicked` only when
      non-zero. **Done:** a 400 m kill with nobody within 70 m pays the bonus. **S**
      **[x] VERIFIED** — `pop.panicFrom` now returns a count; `_panicAt` only burns the bonus when it is non-zero. Results breakdown s12/seed4: shipped `[Contract 1228, No shot wasted 800]` -> fixed adds `["Ghost - nobody panicked", 600]` on a 517 m kill. Bot story run seed 4: `panicked=false` on 9 of 21 missions (shipped: s20 only).
- [x] **B1.3 — THE NEST ends after one kill.** `_checkWin` (`missions.js:1071–1077`)
      has no `endless` guard, so an empty board wins. **Measured: `?m=endless` "won"
      in 12 s after a single kill.** **Done:** an endless run only ends on three
      escapes. `missions.js`. **S**
      **[x] VERIFIED** — `?m=endless` shipped "won" at t=3s after one kill (seed 4) and t=45s (seed 1); fixed ran 120s+/3 waves with no win, and an unattended run ended at t=122s with `escaped=3, "three marks slipped away"`.
- [x] **B1.4 — The campaign's two longest shots are 300 m.** `missions.js:239`
      `const want = td.dist || 300` ignores the briefed range; no def sets `td.dist`.
      **Measured: s12 "520 m" spawns at 302 m, s21 "650 m" at 307 m.** Fall back to
      `this.def.vantage?.dist`. Note the hard ceiling: the plaza is pinned at world
      (90, 0) *(`city.js:215–218`)* so the furthest perch is **~576 m** — either widen
      the grid or cap briefed ranges so the briefing screen stops lying. **Done:**
      measured spawn distance matches the brief within ~10%. `missions.js`, `city.js`, `story.js`. **M**
      **[x] VERIFIED** — `td.dist || this.def.vantage?.dist || 300`. Measured spawn distance over 10 seeds (1,2,3,4,5,7,9,11,13,21): s12 briefed 520 -> 505-529 m (worst -2.9%), s21 briefed 650 -> 640-661 m (worst -1.5%), all 49/49 visible. **No grid widening or brief cap needed** - the ~576 m ceiling is on the *perch block*, but a `rooftop` mark is picked relative to the eye and buildings exist beyond the plaza. Shipped measured 292-307 m on every seed.
- [x] **B1.5 — `losFrom` calls every `room` mark blind.** The room-exit clip in
      `raycast` returns a hit past the caller's `max`, so `losFrom`
      (`missions.js:26–33`) reports the mark's own back wall as a blocker. Repro,
      no browser needed — see §Evidence, and land it as a test:
      `raycast(eye, d, {buildings, holes, max: 191.5})` must never return
      `dist > 191.5`. Consequences today: `pop.losTest` (`missions.js:139`,
      "fleeing marks stay shootable") is wrong for room occupants, and the bot's
      `seen()` falls through to a blind fallback. **Done:** the repro returns `none`,
      the 5 room missions report non-zero vis/49, ballistics tests still green.
      `ballistics.js`, `tools/test_ballistics.mjs`. **M**
      **[x] VERIFIED** — the room-exit clip now returns `none` past `max` (three clamps in `raycast`). Repro: `max=191.5` returned `building @197.0` -> now `none @191.5`. Three new node tests (`raycast respects max at a carved room`, `the room back wall still blocks a longer look`, `raycast never overruns max` 0/501); all three FAIL on `git archive HEAD` (14/501 overruns). 7x7 audit: the five room missions went 0/49 -> 20-49/49 on seeds 1/4/9. `no tunnelling` + `room raycast` stay green.
- [x] **B1.6 — Unchecked spawn fallbacks put marks where nobody can see them.**
      `_visibleGroundSpot` returns `pts[0].clone()` (`missions.js:290`) and
      `_visibleBench` returns `bs[0]` (`:295`) when **no** candidate passes LOS —
      silently placing a mark that may be visible from nowhere. **Measured: s05 and
      s14 CELL LEADER A both 0/49**, both ground kinds. **Done:** the fallback widens
      the search (more plaza points / a nudge toward the corridor) and logs; s05 and
      s14-A report non-zero vis/49 across seeds 1/4/9. `missions.js`. **M**
      **[x] VERIFIED** — `_visibleGroundSpot` falls back to a polar `_sweepZone` of the kill zone, `_visibleBench` widens to park seating, `_visibleLoop` tries three radii plus a recentred ring, and all log via `_noLos`. s05: 0/49 -> 7/24/31 on seeds 1/4/9; s14 CELL LEADER A: 0/49 (seed 4) -> 7/49. **No mark anywhere in the 7x7 audit is 0/49 any more** (16 fixed, 0 regressions).
- [x] **B1.7 — The tutorial is unwinnable on some seeds.** s01 plate 3 at 328 m:
      **0/49 visible on seed 4, bot 17 shots / 2 hits; seed 9 `[true,true,false]`;
      seed 1 fine.** The range plates come from `_pickBuilding` with no guarantee.
      **Done:** plates LOS-checked at placement with a retry; bot clears s01 on seeds
      1, 4, 9, 13, 21. `missions.js:391–410`. **M**
      **[x] VERIFIED** — `_pickBuilding` now scans every candidate rather than the first 60, takes a `self` flag so roof-mounted things are LOS-tested *with* their own roof, and `_setupRange` keeps the three plates on separate roofs. Bot on s01, seeds 1/4/9/13/21: **5/5 won, 3 shots 3 hits each**. Shipped on the same seeds: seeds 4 and 9 never hit plate 3 (25-27 shots, timeout).
- [x] **B1.8 — The convoy never gets hit.** `?m=s08&auto` → **14 shots, 0 hits, lost,
      on seeds 1, 4 and 9.** Not a known bot limitation. Determine whether
      `convoyTyre` (`missions.js:16–18`) and the moving collider at `:526–538`
      disagree about the wheel, or the bot's intercept diverges. **Done:** root cause
      named in a comment; bot clears s08 on ≥2 of 3 seeds, or the failure is proven
      bot-only by a human/scripted shot that connects. **M**
      **[x] VERIFIED — real game bug, not the bot.** Root cause named in `_setupConvoy`: it was the only spawn in the file that never LOS-checked itself, and its fixed lane sat 0.62*zoneR to the *shooter's* side of the zone centre - outside the corridor, which only caps buildings up to `L - zoneR`. Measured seed 4: the sedan was invisible for its whole crossing (LOS true for 1.5 s of a 27 s run). Now the lane is scored by longest contiguous visible run over 2 axes x 4 offsets, and the car starts 90 m before that stretch: visible window 85-215 m over seeds 1/2/4/7/9/13/21, and the crossing axis (the design intent) survives on 6 of those 7 - it only flips to a going-away lane when the crossing road cannot give ~6 s of window. Bot on seeds 1/4/9/13/21: **5/5 won** in 5-17 s (was 0/3, 14 shots 0 hits, on every seed).
- [x] **B1.9 — The endgame rifle drops 6% of dead-centre body shots.** `segCapsule`
      (`ballistics.js:37–47`) samples a fixed 9 points per step; at the Meridian's
      v0 980 the spacing is 0.510 m against a 0.48 m capsule. Use
      `Math.max(8, ceil(len / (r*0.8)))`. **Done:** a range-sweep test over all seven
      v0 values reports 0 missed centre-mass hits. **S**
      **[x] VERIFIED** — `segCapsule` is now analytic (cylinder quadratic + cap spheres) rather than 9 fixed samples. Sweep over all seven v0 values: shipped missed 11/6300 centre-mass shots, all at v0=980 in the 40-140 m band (where spacing 0.51 m > the 0.48 m capsule); fixed 0/6300. New node test `no centre-mass hits lost at any muzzle velocity` FAILS on `git archive HEAD`. Also fuzzed 20k random segment/capsule pairs against a 20000-sample brute force: 0 false positives, 0 false negatives, entry point within 0.26 mm.
- [x] **B1.10 — Three one-liners with visible effects.** Music's first bar never
      plays (`audio.js:185–203` — `playBar()` is called before `music` is assigned;
      swap the two statements, every insert is silent for 4.2 s). All 21 missions
      share one window atlas (`city.js:429` seeds `facadeTex` with the *string
      length*; all `'city:sNN'` are 8 chars — use `hash32`, already exported from
      `utils.js:8`). Traffic direction is a tautology (`city.js:577`, a fractional
      part is always `>= 0`), so cars drive head-on in the same lane. **S**

      **[x] VERIFIED** — music: oscillators started on bar 0 went 0 -> 7 (shipped played nothing for the first 4.2 s). Atlas: distinct facade atlas sets across s02/s03/s05/s07/s09/s13/s17/s21 went **3 of 8 -> 8 of 8** (`hash32` instead of the string length; all `city:sNN` are 8 chars). Traffic: lanes containing opposing headings went **10 -> 0**.
---

### B2 — The city has to look like a city
**Goal:** kill "all the buildings are the same colour" with measurable palette,
material and silhouette variety — without touching the corridor.
This is the owner's #1 complaint and the biggest single perceived-quality win.

- [x] **B2.1 — Widen the palette.** `city.js:337–341`: 12 tints, **mean saturation
      0.191, max 0.389** — everything is a desaturated grey-beige. Give each district
      a real identity (downtown cool glass/steel, midtown warm stone, oldtown brick
      red/ochre with genuine chroma ~0.45–0.6) and add per-building hue jitter, not
      just brightness. **Done:** re-run the palette probe — ≥25 distinct tints,
      mean saturation ≥0.33, and no single tint over 25% of sampled facade verts. **M**
- [x] **B2.2 — Stop 70% of a district sharing one facade style.** `city.js:344`
      `rr.chance(0.3) ? rr.int(0,3) : styleFor[k]`. Add facade styles (spandrel bands,
      punched windows, warehouse/industrial, a blank party wall) and rebalance so a
      district reads as a *family*, not a clone. **Done:** ≥6 styles; no style over 40%
      of buildings in any district. `city.js:59–62`. **M**
- [x] **B2.3 — The roofscape is three greys, in a rooftop game.** `city.js:351`,
      `:360`, `:367` are hardcoded constants used for **every** roof, parapet and
      clutter box in the city — and roofs are the dominant surface from every
      vantage the game ever uses (**58% of sampled verts share one tint**). Give roofs
      tar/gravel/pale-membrane variants, per-roof tint jitter, and more clutter kinds
      (vents, ducts, skylights, stairwell huts, satellite dishes, roof signage,
      water towers — one exists already at `:371`). **Done:** roof tints ≥8 distinct;
      a rooftop-facing screenshot no longer reads as one flat plane. **M**
- [x] **B2.4 — Silhouette variety.** Every building is a plain extruded box
      (`city.js:67–87`). Add setbacks/stepped tops, the occasional spire or mast,
      varied roof pitches on `old`. **Done:** visible in a skyline screenshot at dusk. **M**
- [x] **B2.5 — Ground and street detail.** The ground is one painted plane
      (`city.js:284–329`): flat asphalt, a sidewalk ring, lane dashes. Add crossings,
      kerb colour variation, forecourts, parking bays, rooftop-visible street
      furniture. **Done:** a −60° look-down screenshot reads as streets, not a texture. **M**
- [x] **B2.6 — Neon and signage are downtown-only and sparse.** 12 signs city-wide,
      only on `down` buildings over 50 m (`city.js:517–519`). Extend to midtown
      storefronts and oldtown; add lit ground-floor retail bands. **Done:** night and
      dusk screenshots show signage at three depths. **S**
- [x] **B2.7 — Keep the dusk/night look.** It is already good (`shots/mob_s17_dusk.png`).
      Any palette change must be checked at **all four** `?time=` values — day is the
      weakest and the one to fix; do not regress dusk. **S**

> ⚠️ **Corridor invariant.** Nothing in B2 may change building *heights*, *footprints*
> or `capAt` (`city.js:266–279`). Tint, material, style index, roof props and signage
> only. Re-run the visibility audit after and compare vis/49 per mission.

---

**[x] B2 VERIFIED BY THE MANAGER.** The B2 worker was killed by a spend limit
before it could report or update this doc; its `city.js` work was left in the
tree and audited independently. Measured on `s17`, seed 9, day:

| criterion | target | measured |
|---|---|---|
| facade styles | ≥6 | **8** |
| no style over 40% of a district | <40% | old 33.3 / mid 33.3 / **down 34.3** |
| facade+roof mean saturation | ≥0.33 | **0.361** (was 0.191) |
| roof tints | ≥8 | **466** (was 3 hardcoded greys) |
| signage | three depths | **114 signs** (was 12) |

⚠ **It also introduced a corridor regression, caught by the 7×7 audit and fixed
before commit.** Its extra RNG draws shift the generator's stream, so every
layout re-rolls — and the room bay's carve height was rolled *once* with no
retry, leaving `s03@9` visible from **0 of 49** spots (the bug threshold) and
`s19@4` blind from the default stand. `_spawnTarget` now walks a band of carve
heights and `_pickBuilding` takes a `strict` flag so a blind pick can be retried
rather than silently accepted. After the fix: **no mark in the game is 0/49 on
seeds 1/4/9, nothing lost default-stand visibility**, s03@9 back to 20/49,
s19@4 41/49 (better than the 39 it had before B2), bot 11/11 on seed 4,
ballistics 21/21.

### B3 — Let the player find the mark
**Goal:** fix the opening framing and scope readability. Owner's #4, and mostly cheap.

- [ ] **B3.1 — Aim at the mark, not the pavement under it.** `missions.js:180`
      `.setY(1.4)` flattens the aim point even when the mark is in a window 19 m up.
      **Measured 4.8°–9.3° low on all five room missions** (table above). The comment
      at `:178–179` states the correct intent. Use the target's actual chest height.
      **Done:** `tgtScreenY` within ±0.05 of centre on s03/s09/s11/s13/s17. **S**
- [ ] **B3.2 — The shooter's own deck eats the frame.** Even aimed correctly, s03 is
      **52.9%** deck. Consider: a slightly higher default perch for short contracts,
      a small forward eye offset, or a modest pitch bias that trades deck for skyline.
      **Done:** no story mission opens with >35% of the frame inside 60 m. Verify with
      the `roofPct` probe. `missions.js`, `city.js`, `config.js`. **M**
- [ ] **B3.3 — The deck is a flat untextured grey.** `city.js:698` `0x53565d`, one
      MeshStandard with no map — so the half-frame it occupies carries zero
      information. Give it a gravel/asphalt texture, a few stains, edge trim.
      **Done:** see `shots/day_s03_s1_unscoped.png` for the before. **S**
- [ ] **B3.4 — Scope readability at night.** `shots/night_s03_s1_scoped.png`: the
      whole field is flat navy with the mark clipped to the top edge. Partly B3.1,
      partly that the corridor leaves nothing to look at. Consider a subtle horizon
      cue or reticle-relative range ladder. **Done:** the mark is centred and legible
      at 4× on s03 night. `scope.js`. **M**
- [ ] **B3.5 — Rooftop marks stand behind their own parapet.** A `rooftop` target
      spawns at the roof *centre* (`missions.js:241–244`) while a 1.1 m parapet rings
      the rim (`city.js:357–363`); a render-path raycast on s12 and s21 hits the
      parapet ~3 m in front of the mark. Spawn them nearer the vantage-facing edge.
      **Done:** the target's mesh is the first hit from `rig.eye` on s12, s14-C, s21. **S**

---

### B4 — A city with people in it
**Goal:** make Meridian feel inhabited. Owner's #2.

- [ ] **B4.1 — There are nine people.** `missions.js:161` `nCiv = setup.civs ?? 10`,
      **measured 9–11 total including the target**, in 780 m of city. Raise density
      hard, and *tier* it: a dense kill-zone crowd (which also makes the
      civilian-casualty rule mean something), a mid band, and cheap distant filler.
      **Done:** ≥60 visible humans near the kill zone with no frame-time regression —
      measure draw calls before/after with the GL-wrap probe (baseline **56.5/frame,
      59k tris**). `missions.js`, `people.js`. **L**
- [ ] **B4.2 — Spawning 16 characters is fully serialised.** `missions.js:145–163`
      awaits each `_spawnCiv` in turn; each is a Range fetch + gunzip + XOR + GLTF
      parse (`charrig.js:43–56`). Civilians and guards have no ordering dependency —
      `Promise.all` them. **Required before B4.1 is affordable.** **Done:** load time
      for a 60-civilian mission no worse than today's 10. **M**
- [x] **B4.3 — Use more of the cast.** 28 characters ship in `assets/chars.dat`;
      **9 distinct files loaded** in a measured s03 run. `CIV_FILES` is 16
      (`people.js:15–20`). The `3d-animated-characters` skill documents 117 available
      in the wider repo. **Done:** ≥20 distinct files in a single mission. **S**
      **[x] VERIFIED** — **9 → 27–32 distinct files loaded per mission** (measured
      s02/s03/s05/s13/s17/s20, seed 4). `CIV_FILES` 16 → 28 and the pack 28 → 40
      characters (3.17 → 4.50 MB): twelve more street civilians pulled from the
      local rigged cache via `tools/build_chars.py` (construction, carpenter,
      paramedic, skater, plus the missing female counterparts of post / doctor /
      homeless / mechanic). A crowd of sixty drawn from sixteen models read as the
      same four people over and over.
- [ ] **B4.4 — Ambient life beyond standing and walking.** Routines are
      `stand|loop|patrol|sit` (`people.js:104–117`). Add queueing, street vendors,
      dog-walkers, phone-checkers, smokers in doorways, people entering/leaving
      buildings. Park benches already exist and are barely used (`city.js:461–468`).
      **Done:** a 30 s dusk capture shows ≥6 distinct behaviours. **M**
- [x] **B4.5 — Sitting people are offset on one axis only.** `people.js:114` applies
      `sin(yaw)` to `x` with no matching `cos(yaw)` on `z` — so a bench mark's collider
      can sit 15 cm from where the model appears. **S**
      **[x] VERIFIED** — the offset is meant to shuffle a sitter BACK onto the seat
      along his own facing; with only the `x` term a sitter facing ±z slid 15 cm
      sideways off the bench instead. Now `x -= sin(yaw)*0.15` **and**
      `z -= cos(yaw)*0.15`. (The collider is not separately wrong — collider and
      model both read `p.group.position` — the model was in the wrong place.)

---

### B5 — Make the numbers mean something
**Goal:** a reward layer that tracks skill. Depends on **B1.1/B1.2/B1.4** landing first —
the pars were authored for a scoring model that doesn't currently run.

- [ ] **B5.1 — Re-derive every `par`.** Against max attainable score today,
      **15 of 21 missions cannot reach gold and 9 cannot reach silver** — including
      every mission s15–s21 except s14. s21 tops out at ~47% of its own gold par.
      A flawless late campaign scores seven bronze dots. Recompute after B1.
      **Done:** every mission's gold is attainable by a perfect run; show the
      arithmetic in a comment. `story.js`, `config.js`. **M**
- [ ] **B5.2 — Score has no purchasing power.** `ECON.cashPerScore: 0.1`
      (`config.js:44`) makes score **11%** of income; `def.pay` is 74%. A perfect s17
      vs a scraped one differs by **$113**. Raise the score share so playing well pays. **S**
- [ ] **B5.3 — Contracts are an unlimited money printer, ungated.** `main.js:247`
      pays full `def.pay` on **every** win, not just the first; the weekly pays a flat
      $2,000 per attempt with **no story gate** (`ui.js:92–114`). A new player can farm
      the Gauntlet before mission 1. Total story income ≈ **$58,396** vs a
      **$100,200** catalogue — the intended curve is real, and replay farming erases
      it. **Done:** replays pay a reduced rate; contracts gated behind an early
      mission. **M**
- [ ] **B5.4 — Dominated and non-functional shop items.** SUBSONIC ($2,600) is a pure
      debuff — `sub` is read nowhere, only `v0mul: 0.62` applies. PULSE MONITOR
      ($1,500) has **zero** implementing code (`'pulse'` appears once, at
      `config.js:87`). SPOTTER DRONE ($3,400) duplicates the free always-on marker HUD.
      LONGBOW ($14,000) loses to the $9,800 Whisper on four of five stats. AP's glass
      deflection can move a round only ~4 cm over the 3.37 m from pane to occupant,
      against a 14 cm head. **Done:** every purchasable item has a measurable effect
      the player can feel. `config.js`, `missions.js`, `shop.js`. **M**
- [ ] **B5.5 — The suppressed rifle deletes two systems, eight missions early.**
      The Whisper is affordable after mission 7; exposure is introduced at mission 15.
      Suppression zeroes exposure (`missions.js:586`) and cuts panic radius 70 m → 16 m.
      **Done:** suppression is a tradeoff (velocity? range? cost per shot?), not an off switch. **M**
- [ ] **B5.6 — The title screen's contract counter is wrong.** `ui.js:54` counts every
      def id including `daily:YYYY-MM-DD`, `weekly`, `endless` and `range`. Win the free
      Range once → "1/21 CONTRACTS" with zero story missions cleared. `save.missions`
      also grows one key per calendar day, forever. **S**
- [ ] **B5.7 — There is no endgame.** No completion check anywhere; s21 drops you back
      on the campaign list. No epilogue, no all-gold reward, no New Game+.
      `save.seenIntro` (`save.js:18`) is written and never read. **M**

---

### B6 — More game in the game
**Goal:** break the "shoot one stationary man" repetition. Owner's #3.
**Four modes are already fully wired and unused** — start there, it is nearly free.

- [ ] **B6.1 — Turn on the four dead flags.** All implemented, no def sets any:
      `setup.ordered` + `person.order` (kill order, `missions.js:679–685`, `:279`);
      `def.noCiv` (zero collateral, `:722`); `def.forceRifle` (loadout-restricted,
      `:63`); `td.dist` (per-target range, `:219`, `:239` — also fixes B1.4).
      **Done:** ≥4 missions or contracts use them. `story.js`, `events.js`. **S**
- [ ] **B6.2 — Rebalance mission kinds.** Measured usage: `plaza` 5, `room` 5,
      `walk` 5, `rooftop` 3, and **`bench`, `pair`, `sniper` once each**. Five of six
      specials appear in exactly one mission and are never revisited. **9 of 21
      missions are "shoot one stationary man"**; only 4 use a mechanic the others
      don't. **Done:** no kind over 4 uses; every special used ≥2 times. **M**
- [ ] **B6.3 — `def.special` is a single string.** `setup()` is an `if`-chain
      (`missions.js:166–170`), so missions can never combine specials. Make it an
      array and `appear`+`countersniper`, `protect`+`convoy`, `identify`+`window` all
      become available from code that already works. **Done:** one mission ships with
      two specials. **M**
- [ ] **B6.4 — Cheap new modes from existing systems.** COLD HUNT (markers off —
      `markers.js:40` already supports it; the single biggest difficulty lever, ~2 lines);
      SNIPER ALLEY (make `special.sniper` a list — `missions.js:464–475` already does one);
      TIME ATTACK (`timeLimit` + `SCORE.timeBonusPerS` exist, used by 2 of 21);
      LIMITED ROUNDS (`ammoLeft`/`rifle.mag`/`_reload` all exist). **M**
- [ ] **B6.5 — Escalate THE NEST.** After B1.3: range, wind, armour, guards and light
      are all fixed for the whole run (`events.js:73`); spawn interval floors at 9 s
      from wave 11 and never hardens again. **Done:** wave 20 is measurably harder
      than wave 12. **M**
- [ ] **B6.6 — The daily is 7 fixed jobs with a range slider.** Flavour is
      `DAY_FLAVOURS[getDay()]` (`events.js:21`), not seeded; the seed varies only
      `dist`, `height`, `civs`. Par, wind, time, kind and target count are fixed per
      weekday, so **gold is decided by the distance roll, not the player** (0/15
      attainable across Mon/Tue/Wed/Fri/Sat in a 21-day simulation). **M**

---

### B7 — Teach the game
**Goal:** stop the systems that fail the player being the ones nobody mentions.

- [ ] **B7.1 — The four unbriefed killers.** (a) *Hip-fire is randomly wrong by
      ±0.03 rad* = **±9 m at 300 m** (`missions.js:513–518`) and the FIRE button is
      live unscoped — a new player misses by nine metres and never learns why.
      (b) *A miss within 70 m voids the contract* — the most punishing rule in the
      game, first communicated as a toast **after** it has happened.
      (c) *Two civilian kills fail the mission* — first mentioned in **mission 16**.
      (d) *A miss near a room mark arms a silent 13 s sudden-death timer*
      (`missions.js:757–759`) — in **mission 3**, the glass tutorial, i.e. exactly
      where a first miss is most likely. Worse, the mark shows no sign of it: he
      keeps idling in the lit window (`people.js:194–196` changes no state).
      **Done:** each is taught before it can fail you. `story.js`, `ui.js`. **M**
- [ ] **B7.2 — There is no manual reload.** `_reload` fires only at `ammoLeft <= 0`
      (`missions.js:499`); no key, no button (`controls.js:113–141`). Entering s14's
      20 s three-target window on one round is unrecoverable and unexplained. **S**
- [ ] **B7.3 — Controls are pause-menu only.** The card at `ui.js:316–323` is the sole
      place any binding is documented. Add a title-screen controls entry / first-boot
      overlay (`save.seenIntro` already exists, unread). **S**
- [ ] **B7.4 — Two briefings advertise bonuses that don't exist.** `story.js:61`
      (moving) and `story.js:77` (ghost); `ui.js:160` prints "ghost (no panic)" on
      **every** briefing. Fix with B1.1/B1.2 or stop promising them. **S**
- [ ] **B7.5 — The tutorial teaches inputs, not systems.** s01 has `civs: 0`,
      `wind: [0,0]`, no MARK, no panic, no fail state; s02 then drops 9 civilians and
      the full ruleset at once. (The free Range is *harder* than the tutorial —
      `wind: [0,3]` vs `[0,0]`.) **Done:** a soft-failure first encounter with panic
      and collateral. **M**
- [ ] **B7.6 — Show par before the first attempt.** `ui.js:161–162` gates "Gold at N"
      behind `rec?.score`, so a first-timer never knows the target. **S**

---

### B8 — Code health and a real test suite
**Goal:** make the next ten sessions cheaper. No player-visible change — schedule it
when the visible work is landing, not instead of it.

- [ ] **B8.1 — Unlock node testing: 2 lines.** `config.js:140` and `save.js:4`
      evaluate `location.search` at module scope, so `config.js`, `save.js` and
      `events.js` cannot be imported in node at all. Guard them. **Everything below
      depends on this.** **S**
- [ ] **B8.2 — `tools/test_utils.mjs`.** `utils.js` is 56 lines of pure functions with
      zero coverage. Pin `rng` determinism (every seeded mission and city rests on it);
      `r.int` inclusivity — `missions.js:343` indexes `loop[r.int(0,3)]` into a
      4-element array; `weekKey`'s ISO-week arithmetic across the 2027-01-01 boundary
      and W53; `dayKey` zero-padding; `fmtTime` edge cases. **M**
- [ ] **B8.3 — Extract `js/scoring.js` and test it.** `missions.js:691–698` +
      `:1092–1108` are pure arithmetic on plain numbers — no THREE, no DOM. Extracting
      ~70 lines makes the whole medal/economy layer testable, and would have caught
      B1.1, B1.2 and B5.1. **Highest-value extraction in the codebase.** **M**
- [ ] **B8.4 — Collapse the triplicated perch eye.** Computed independently at
      `city.js:252–261`, `missions.js:126–134` and `main.js:387–390`; they agree only
      because the perch happens to be square. The slab thickness `1.4` is a bare
      literal in **seven** places and in no config key, and `1.62` is hardcoded in four
      despite `MOVE.eyeH` existing. `CLAUDE.md` records that this exact drift has
      already cost three debugging sessions. One `perchEye(b, zone)`. **M**
- [ ] **B8.5 — Split the two overgrown files.** `missions.js` (1116) → `scoring.js`,
      `specials.js` (~235, the biggest single win), `spawn.js`, `shooting.js`;
      `city.js` (812, with a **704-line `buildCity`**) → `citygeo.js`, `sky.js`,
      `ambient.js`, `rooms.js`, `perch.js`. Leaves ~350 and ~230 lines of actual
      engine/generator. Do it **incrementally**, one extraction per commit, ballistics
      green each time. **L**
- [ ] **B8.6 — Dead code.** The whole `BALLISTICS` export (`config.js:3–11`) is
      imported by `missions.js:8` and never dereferenced — `ballistics.js:9` redeclares
      the same values. `EXPOSURE.perSeen`, `PANIC.targetEscapeTime`,
      `VIEW.sensUnscoped` have no readers. Dead exports `ANIM_NAMES`, `TAU`. Dead
      branches: `def.ordered`/`noCiv`/`forceRifle` (→ B6.1 uses them instead), an empty
      `if` at `missions.js:591`, a no-op handler at `ui.js:42`. Dead state:
      `person.frozen`, `decoy.decoy`, `real.traits`. **M**
- [ ] **B8.7 — `perchReach` can put the shooter off the roof.** `city.js:104`
      `Math.max(3, edge - 3)`: for any roof under 12 m the floor wins and the stand
      point is outside the footprint. Unreachable today only because the perch is
      always 30 m — but `missions.js:132` and `main.js:389` both call it with an
      arbitrary collider. Add the assertion as a test. **S**

---

### B9 — Robustness, leaks and instrumentation
**Goal:** stop silent failures and make the next perf question answerable.

- [ ] **B9.1 — `_spawnKiller` can permanently break s10.** `missions.js:1043`/`:1066`
      increment/decrement `pr.pending` with **no `try/finally`**; the call at `:916` is
      bare — no `await`, no `.catch`. One rejection and `pending` never returns to zero,
      so the win condition at `:932` can never be satisfied. Exactly the failure mode
      that is indistinguishable from a bot limitation. **S**
- [ ] **B9.2 — Unhandled promises.** `startMission` (`main.js:143`) is used as an event
      handler, never awaited, never caught — if `buildCity` throws, the loading screen
      hangs forever with no message. Same shape at `missions.js:956`, `:997`.
      `charrig.js:50–55` caches *rejected* promises permanently, so one blip kills that
      character for the page's lifetime. **M**
- [ ] **B9.3 — Timers outlive their world.** `missions.js:581` (up to 1.2 s),
      `:1001` (**14–26 s**), `:1082`, `city.js:798` are never cancelled — they fire
      against a disposed population and a removed scene. Reachable double-payout: win,
      pause, then abandon → `endMission` runs twice, `grantCash` twice. Follow the
      guarded pattern already at `main.js:205`. **M**
- [ ] **B9.4 — Leaks.** `autoTrack` (`main.js:295`) is keyed by person objects and
      never cleared between missions — it retains every target and its meshes, so the
      soak test's own memory profile is meaningless. `scope.js:318` never calls the
      `disposeViewmodel` that exists for it. `fx.js:199` skips its two textures.
      `people.js:306` disposes no materials. **M**
- [ ] **B9.5 — Expose the renderer.** `window.__game` has no `scene` or `renderer`, so
      no harness can read `renderer.info` — I had to wrap the WebGL context by hand to
      get draw calls. Add both. **S**
- [ ] **B9.6 — A boot failure is silent.** `index.html` has no inline error handler;
      the only listener is inside `main.js` itself (`:29`), so any parse/404 failure in
      the module graph leaves the loading bar at 20% with a blank console. Four inline
      lines in `<head>` writing `window.onerror` into `#load-tip` turns every future
      boot failure into a readable line. **S**
- [ ] **B9.7 — `main.js:173` continues after a failed setup.** Deliberate and correct,
      but the player gets no signal. One `hud.toast` when `errors` is non-empty. **S**

---

## Recommended first batch

**B1 — Correctness.** Every item is a few lines, each independently verifiable, and
together they switch back on two advertised scoring bonuses, an entire game mode, the
campaign's two headline long shots, the LOS contract `CLAUDE.md` treats as
load-bearing, and the tutorial on a third of seeds. It is also a **precondition for
B5**: there is no point re-deriving pars against a scoring model that isn't running.
Highest impact per unit effort in the document by a wide margin, and it leaves the
tree in a strictly better state for every batch after it.

Then **B2** (the owner's #1, and the biggest perceived-quality jump), then **B3**
(cheap, and fixes the complaint that has failed two playtests).

---

## Do-not-regress

Invariants any worker must preserve, each with the check that proves it.

| # | Invariant | Proof |
|---|---|---|
| 1 | **The ballistics are correct.** | `node tools/test_ballistics.mjs` → 17/17. Run it before and after, every batch. |
| 2 | **The sightline corridor guarantees the shot exists.** Do not change building heights, footprints or `capAt` (`city.js:266–279`) for cosmetic reasons. | Re-run the 7×7 visibility audit; no mission may drop to 0/49 that wasn't already, and default-stand visibility must not regress. |
| 3 | **The firing position stays clear** — the 1.4 m slab, `perchReach` (not `w/2−3`), ankle-height sandbags, `noParapet` on the perch, props clamped inside the footprint, `MOVE.edge = 0.06`. | Per-mesh raycast from `rig.eye` to the mark: the first hit must be the target's `SkinnedMesh`. Set `rc.camera = rig.camera` or `Sprite.raycast` throws. |
| 4 | **The world moves while the round flies.** Shooting *at* a walker misses; leading him hits. | Two named node tests in the ballistics suite. Never "fix" a moving-target miss by removing the displacement. |
| 5 | **A building is not a tunnel.** A round entering a carved room stops at the back wall. | `no tunnelling` + `room raycast` tests. **B1.5 must fix `losFrom`'s `max` without weakening this** — both tests stay green. |
| 6 | **Look pitches to −80° and yaw is unclamped.** A mark in the doorway below you must be lookable-at. | `VIEW.minPitch = -1.4`; `atan(1.62 / MOVE.edge)` must stay steeper than it. |
| 7 | **Every action button carries an icon *and* a word** (`.ai`/`.al`), and popups are never `alert()`. | Two playtests failed on a bare `◈`. Check the mobile 390×844 capture. |
| 8 | **Objective markers stay on by default**, and IDENTIFY still withholds the mark. | `markers.js:40`; B6.4's COLD HUNT is opt-in per mission, never the default. |
| 9 | **Viewmodel local frame: −Z muzzle, +X right, +Y up**, origin at the grip; hang effects off `group.userData.muzzle`. `ScopeRig.update()` may only *add* to `vmBase`/`vmRestRot`. | Buy a longer rifle; the flash must stay on the barrel and the gun stay shouldered. |
| 10 | **No raw GLB/PNG in the repo** — characters stay packed in `assets/chars.dat`. | Commercial pack licence. Use `tools/build_chars.py`. |
| 11 | **No build step**, Three 0.160 via the local importmap. | `index.html:11–15` points at `../../lib/three/` — keep it local, not a CDN. |
| 12 | **Draw calls stay near baseline.** | **56.5 calls / 59k tris per frame** (s03, seed 1, day, 1280×800). Re-measure after B2 and B4 by wrapping the GL context (headless fps is rAF-capped at ~20 and proves nothing). |
| 13 | **Known bot losses that are not bugs:** the 4-wave `s10` protect and a clustered `weekly`. | Always A/B against `git archive HEAD` on a second port before believing a regression. s10's win path is proven by cutting `setup.protect.waves` to 1. |
| 14 | **Stage only `gms/3d/longshot` paths.** | Another session is live in `yru/site`. Never `git add -A`. |

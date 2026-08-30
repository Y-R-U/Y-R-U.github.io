# WATERLINE — decisions log

Rulings on things agents asked about. These are **settled**; implement them, don't re-litigate.
Where this contradicts `BUILD_PLAN.md`, this file wins.

---

### D1 — Reference plates get re-fetched and re-verified
The plate set was triaged from 4×4 contact sheets at 440px per tile. Too coarse to see HUDs, and
two captions were wrong from a miscounted row-major index. A dedicated agent now owns
`aaa_refs/naval/` and `tools/plates.json`, and is re-verifying every plate at full resolution.

New sources approved: **AC IV: Black Flag (242050)**, **War Thunder (236390)**,
**WoWS: Legends (2964090)** — chosen because they plausibly have HUD-free cinematic press shots of
the three things we're short of: splash columns, naval muzzle flash, open-ocean colour grade.

Explicitly **not** approved: Sea Power, HighFleet, Ultimate Admiral: Dreadnoughts. All three were
triaged as below the visual bar; adding them would lower the bar rather than fill a gap.

### D2 — Disclaimer caption wording
Short form, shown above the shell in flight: **"Positions dramatised"**.

Long form, shown **once** — the first time a shell is followed in a match: **"Ship and impact
positions are dramatised."** Every subsequent shell gets the short form.

The brief asks for this to be as short as language allows; two words is the floor that is still
honest, and the one-time long form covers the first exposure properly. Do not add "not to scale",
"for illustration only", or any legal-sounding padding.

### D3 — Ladder / progression storage
**localStorage only in phase 1**, behind a thin adapter in `js/save.js` — one module, swappable.

Multiplayer and the br8t account layer (`/lib/auth/`) are dormant until this ships to
games.br8t.com. Coupling single-player progression to an auth layer that isn't live on GitHub Pages
would mean the tournament ladder can't save on the one platform it actually runs on in phase 1.
`save.js` must be the only file that knows where progress lives.

### D4 — The perf gate scores counts, not GPU milliseconds
W0 measured the *unchanged* 14-call boot scene at 0.1, 1.4, 2.9, 8.1 and 12.4 ms GPU across runs
minutes apart, while fps and every count stayed bit-identical. The GPU timer on this machine is
noise at this scale.

So the budget in BUILD_PLAN §6 is enforced on **draw calls, triangles, texture MB and fps** —
numbers that are stable and attributable. GPU ms is advisory: use it to spot a 10× regression,
never to pass or fail a component. The only trustworthy latency number is Aaron's actual phone, and
that is a ship gate, not a per-component gate.

Corollary: when a component reports perf, it reports counts. "It runs at 60fps" on a desktop that
is coasting proves nothing about a phone.

### D5 — Plan revision is progressive, not a separate phase
`REVIEW.md` found 15 blocking issues. Rather than stop and rewrite `BUILD_PLAN.md` wholesale, each
component's brief names the findings it must honour, and W0's `HANDOFF_ENGINE.md` carries the
disposition table for everything already fixed in the scaffold.

Reading order for any coder: **`DECISIONS.md` → `HANDOFF_ENGINE.md` → `BUILD_PLAN.md` → the
`REVIEW.md` findings named in your brief.** Where they disagree, that order is the precedence order.

A consolidated `BUILD_PLAN` v2 happens before the visual components start, because that is where
the shot map and the scoring gates actually bite. The sim does not need it.

### D6 — Rules rulings forced by REVIEW.md (binding on C5)

**Fog of war is enforced by the sim, not by a promise.** `eventsFor(side)` redacts; the renderer
cannot see what that side doesn't know. Not "events carry a `vis` flag and the presenter filters" —
a contract the presenter can forget is not a defence. Invariant: replaying `eventsFor(side)` from
`newGame` must reconstruct exactly `view(game, side)`.

**Multi-cell resolution order is defined**, because C6 animates whatever order it gets: cells resolve
**row-major within the footprint**, then all `result`s, then all `sunk`s, then `turn`/`over`. A shot
at an already-resolved cell **does** emit a `result`, flagged `repeat:true` — that keeps "every
`fire()` returns ≥1 result" true for a fully-resolved salvo.

**`ShipView = { id, len, hits, sunk, cells: Cell[]|null }`** — `cells` is null for an enemy ship
until it sinks. That one field is the fog-of-war rule stated once.

**AI ordnance policy.** Tier 3 gets the naive policy. Tier 4 gets the good one: density normalised
by anchor multiplicity, footprints scored by *expected distinct ships touched* rather than summed
cell density, ordnance held while a hit run is open, and a per-game random tiebreak so the opening
isn't identical every game. Reworded AI rule: never fire a `shell` at a resolved cell, never fire
ordnance whose footprint is majority-resolved.

**The ladder gate is monotone *with separation*** — each tier ≥3 points above the last with
non-overlapping confidence intervals. Bare monotonicity over 2000 games is noise.

**The RNG is an integer state field on the game object.** A closure PRNG will not survive
`deserialize(serialize(g))`, which is a declared invariant.

### D7 — The player places their own fleet
Classic Battleship is a placement game and dropping it would be a real change to what we're
building. So: manual placement is in scope, with **auto-place as the prominent default** — on a
phone, dragging five ships before every match is friction, and most players will want one tap.

The sim supports both paths; `js/sim/index.js` exports `fleetLegal(w, h, lengths) → null | reason`
so the custom-fleet builder can tell a player their fleet won't fit *before* they commit to it. The
placement screen itself is C7's. If C7 slips, auto-place ships and the screen follows later.

### D8 — `layoutSeed` must be required, not defaulted
C5 pass 2 split the seeds: `game.rng` (fleet layout) derives from `layoutSeed`, `game.aiSeed` from
the public `seed`. Good split. But `state.js:85` is
`const layoutSeed = opts.layoutSeed ?? hash(seed, 0x1a7011, w * 31 + h)`.

Measured on the default path — the one `main.js` uses — an attacker who knows the shareable `?seed`
reproduces the enemy fleet in **100/100 games**. The oracle is closed only if a caller remembers to
pass a private seed. That is a documented request (R8), not a defence.

**Ruling: make `layoutSeed` required.** `newGame` throws without it. The shot harness passes an
explicit one when it wants a reproducible board; the game passes one drawn from real entropy at the
UI layer. The sim is pure and has no clock or `Math.random`, so it genuinely cannot draw its own —
which is exactly why the caller must be forced to, rather than trusted to.

Same principle as the `aiMove(view)` fix that worked: convert "the next component must remember"
into "the code will not run unless they do."

### D9 — The examiner's harness must be ported before its score means anything
`tools/adversarial_sim.mjs` reports 2 broken / 14 held after pass 2, versus 15/10 before. Those
numbers are **not comparable**: four sections (`redaction`, `play`, `hostile`, `ergo`) now throw and
abort part-way, because fixes I asked for changed the API they were written against. Assertions
after the throw never run.

Of the two still reported broken, I verified both are stale:
- **C1** (`fire()` unredacted) is a **false positive**. Measured: 0 enemy `shipId`s leaked across
  3,384 result events, with 741 own-ship IDs correctly visible. The harness reads a `side` field
  whose meaning changed; the rule is `at !== viewer`. C5's per-session redaction (`game.localSide`)
  is correct and protects brief step 6 — a per-firer rule would have deleted the red hit indicator.
- **F1** asserts about a round-robin gate that was replaced by adjacent head-to-head.

So: the coder does not touch its own examiner, but the examiner is now stale. **Review round 2's
first job is to port the harness to the current API and re-run it**, before attacking anything new.
Only then is a pass/fail number meaningful again.

Untested-by-anyone, and therefore round 2's real target: the tier-4 adaptive placement prior, the
fleet-hiding logic, and the seed split. All are new code written *in response to* a review, which is
the code most likely to be wrong and least likely to have been attacked.

### D10 — C1's sea shots get a placeholder hull, explicitly not scored
Nobody publishes a photograph of empty ocean. Every clean sea plate we have contains a ship, so a
bare-water render loses Composition against it for a reason that has nothing to do with the water.

So C1's sea scenarios include a **cheap grey blocked-in hull on the horizon, purely as a framing
device**. It is not C1's work and is not scored — the critic brief for those rounds says the
silhouetted vessel is a placeholder and must be ignored, and only the water, sky, light and
atmosphere are to be judged. C3 replaces it with the real ship kit when it lands, and the same
scenarios re-run.

The alternative — scoring bare water against a plate with a subject in it — measures framing we
didn't choose and would push C1 into faking a subject to chase points. Taking a known, stated
handicap on one criterion is cleaner than letting the plate mismatch leak into all six.

### D11 — Score the gap, and confirm borderline results with a second critic
Measured across C1's three rounds, on images verified unchanged between rounds:

- **Absolute scores drift ±2–3 points between rounds.** `sea_night`'s plate scored 4 in round 2 and
  7 in round 3 — same file, same crop. Our render scored 7 then 5, and I confirmed by extracting
  both from the sheets that it was visually identical.
- **Gaps are stable.** Two independent critics on the *identical* round-3 sheets returned −3.0/−3.0
  on dusk and −4.0/−4.0 on noon. Absolutes differed by ±1; the gaps agreed exactly.

So the gap-based gate works and the absolute number is close to meaningless. Consequences:

1. **Never record or compare an absolute score.** Only the gap, and only within a round.
2. **The calibration sheet does not detect drift.** Same image on both sides of one sheet tests
   intra-sheet consistency — which has been perfect (0.0) every time — and is blind to the scale
   moving between rounds. Keep it, because it does confirm a critic recognises professional work,
   but stop treating it as the guarantee.
3. **Run a second independent critic whenever a gap lands within 1.0 of the −2.0 threshold**, and
   take the median. Non-borderline results don't need it — they've been reproducing exactly.
4. Give critics an explicit scale anchor (10 = best shipped game water you've seen, 8 = solid
   professional, 5 = competent but obviously a game, 2 = placeholder). The second critic had this
   and landed within ±1 of the first on every panel.

Cost: one extra agent per borderline shot. Cheap next to three rework passes chasing noise.

### D12 — `texCap` was inert for every component until C2 found it
`main.js:42` calls `configureTextures(app.quality)` at boot; `?preset=` is not applied until
line 130, and `bake.configure()` never re-ran. So `cfg.texCap` was read once at the default and
every preset baked identical textures. Measured before the fix: potato and high both reported
`texMB 21.019687` — bit-identical. Triangles and draw calls *did* respond, so this was texture
sizing alone, which is exactly why it survived W0 and C1 unnoticed.

Fixed in `bake.js`, not `main.js`: `configure()` now subscribes to `quality.onChange` the first
time it runs. `materials/index.js:26` already did precisely this, so the fix is a consistency fix
rather than a new mechanism, and it does not touch the boot order every component is built against.

Verified after: potato/low **15.66 MB**, medium/high **21.02 MB**, with medium and high unchanged
from their pre-fix numbers.

**Consequence for anyone reading old numbers:** every texture-MB figure recorded before this —
including C1's 4.46 and C2's pass-1 21.0 — was measured at the *default* cap regardless of the
preset named on the command line. Do not treat a pre-fix texMB as evidence that a preset ladder
works.

It also unfroze `aniso`, which had been stuck at 4 while `high` specifies 8 and `ultra` 16.
**I claimed this measurably changed C1's old renders. That claim was wrong and is retracted** — see
D13, which is the more useful finding. **C1's recorded gaps stand; nothing needs re-running.**

### D13 — The sea shots are not reproducible run to run. Always render a control.
Chasing whether D12 had disturbed C1's work, I measured C1's archived `sea_dusk` against a fresh
render at matched resolution and preset: 3.86% of bytes differing, mean delta 0.065/255, max 49.
I attributed that to the anisotropy change and wrote it up as a real effect.

Then I rendered the **control I should have rendered first** — two consecutive renders, identical
code, identical flags:

| Comparison | bytes differing | mean delta | max |
|---|---|---|---|
| **Control: two runs, same code** | **4.54%** | **0.0857** | 49 |
| Archive vs post-D12 (my claim) | 3.86% | 0.0646 | 49 |

The control is *larger* than the effect. There was no effect. The ocean animates on `uTime` and the
harness captures at a slightly different phase every run, so any two sea renders differ by roughly
this much no matter what the code does.

Rules this buys, all of which apply to C3, C4 and C6:
1. **Never conclude anything from a pixel diff of a sea or VFX shot without a same-code control
   render in the same batch.** The control is the experiment; the diff alone is not evidence.
2. **A hash difference tells you *that* two renders differ, never *how much*.** Byte-identical and
   4.5%-differing-at-mean-0.09 are the same hash result and completely different findings.
3. **Compare at matched `dpr`.** My first attempt compared a `dpr=1` archive against `dpr=2`
   re-renders and produced an alarming total mismatch that was pure resolution. Check `w`/`h`/`dpr`/
   `preset` in the shot JSON before reading anything into a diff.
4. Static shots (the bridge interiors) *are* reproducible, which is why this never bit C2. The rule
   is only load-bearing where something animates.
5. **The noise floor is per-scenario, not a project constant.** Measured, same code, two runs:

   | Scenario | pixels differing | mean delta |
   |---|---|---|
   | `sea_dusk` (water only) | 4.54% | 0.086 |
   | `night_burn` (water + fire + smoke + rain) | 33.23% | **1.218** |

   A **14× higher floor**. On a shot like `night_burn`, forcing wave amplitude to zero — a change
   that should be dramatic — measured mean 3.145, only 2.6× its own control. Pixel diffing is close
   to useless on the VFX shots. Measure the control *for that scenario* before trusting any diff on
   it, and prefer a targeted probe (a luma traverse, a region histogram) over a whole-frame diff.

This is the D11 lesson in a second costume: I had a measurement whose noise floor I had never
established, and I read a number off it. Establish the noise floor first, every time.

### D14 — `ocean.setDetailFade()` added for the grazing-angle LOD line (C1 file, applied by me)
C2 escalated correctly: a bridge interior sees the water at a grazing angle C1's sea grades were
never tuned for, and gets a hard horizontal LOD line in the window. `GRADES[g].sea.fade` / `rip` /
`ripLod` were unreachable from outside `ocean.js`.

Added `setDetailFade({ fade, rip, lod })` next to `setSeaState`. Purely additive — it changes
nothing unless called, and `applyGrade()` still owns the defaults, so it must be called *after* the
grade is set.

Note for anyone acting on an escalation: **C2's proposed diff named uniforms that do not exist**
(`u.uRipFade.value.set(...)`; the real ones are `uFadeNear`/`uFadeFar`, `uRipN`/`uRipF`, `uRipLod`).
It was written from memory rather than from the file. The intent was right and the escalation was
worth raising — but read the target file before applying any diff an agent hands you.

This also gives C1's known gap "far-LOD mistuned in opposite directions" the seam it needs to be
fixed from a scenario, whenever that revisit happens.

### D15 — `lighting.setFog()` added; grade listeners were silently eating scenario fog
C3 found that `scene.fog` was being reset on every scenario that touched a sky knob.
`quality.set('skyCover', …)` → `sky.applyGrade()` → grade listeners → `lighting.js`'s `paint()`
rewrites `fog.near`/`fog.far` from the grade. Any scenario that set fog and *then* set a sky knob
silently got the grade's fog back. Measured: `fleet_wide` had been running at 250/2400 rather than
the 500/4200 its own handoff documented, since pass 1 — that was the reviewer's "fog starts too
near, the hero hull is milky at 15 m".

C3 worked around it by ordering its own setup knobs-first, which is correct for C3 and useless for
everyone else. This is a footgun aimed at C4 (smoke and fog interact) and C6 (the camera flies
through fog), so it is fixed centrally instead.

`lighting.setFog(near, far)` sets an override that survives `applyGrade`; `setFog(null)` clears it
and repaints from the current grade. Same shape as `ocean`'s `stateOverride`. Verified in one eval:

| | fog |
|---|---|
| grade default | 200 / 2600 |
| after `setFog(777, 4321)` | 777 / 4321 |
| after a sky knob fires | **777 / 4321** |
| after `setFog(null)` | **200 / 2600** |
| after another sky knob | 200 / 2600 |

The general lesson, which has now cost this project three separate bugs (`texCap`, `aniso`, this):
**a value written once at setup and also written by a listener belongs to the listener.** If a
component needs to own it, it needs an override the listener respects — not a later assignment.

### D16 — Ripple map to 256²; and texture MB is a PROJECT budget, not a per-shot one
C3 escalated the blocky whitecaps with proper file-and-line references (`RS = 128`, `chop.at(u*2,
v*2)` giving ~2.3 texels per noise-lattice cell, then magnified ~3× on screen at 250 m). It named
two causes. I fixed the cheap one — dropping the `*2`, which is genuinely under-sampled — and it
**changed pixels measurably (mean 0.361 against D13's 0.086 floor) while not fixing the artefact at
all.** Both 6× crops still showed the same rectangular lattice.

The dominant cause was the second one, the map resolution, which I had waved away as too expensive.
That was wrong by two orders of magnitude: 128²→256² RGBA is **+0.19 MB**, against roughly 6 MB of
headroom. `RS = 256` visibly resolves it. Cost measured: `fleet_wide` texMB 38.9 → **39.17**, draw
calls unchanged, `sea_only` still **1 draw call / 27.6k tris** against its 40k sub-budget.

Lesson: I rejected the right fix on a cost estimate I never checked, then spent an experiment on the
wrong one. **Price it before you rule it out** — the estimate took one multiplication.

**The bigger find, and it is a live integration risk.** `sea_only` reported texMB **33.67**, against
the **4.46** recorded when C1 closed. Nothing about the ocean changed. `budget.js` tracks every
*tracked texture in memory*, so the figure includes C2's bridge bakes and C3's hull maps even in a
shot where they are hidden.

So the 45 MB texture budget is a **project total**, not a per-component allowance, and it has been
read as per-component all project. Current standing with C1+C2+C3 resident:

| Shot | texMB |
|---|---|
| `sea_only` / `sea_noon` / `sea_dusk` | 33.67 |
| `fleet_wide` | 39.17 |

**C4, C6 and C7 have roughly 6 MB between them, not 45 each.** Every remaining component brief must
say so, and Wave C should expect texture memory — not draw calls or triangles — to be the binding
constraint. Draw calls are at 53 of 90 and triangles at 81k of 300k; neither is close.

### D17 — `ocean.setSeaState()` fixed; this is the FOURTH bug of one shape, so here is the rule
C4 found that `setSeaState(n)` did not stick. It wrote `stateIdx`, which `applyGrade()` overwrites
from the grade whenever anything touches the sky — and `sky.setSun()` runs after the scenario
preamble in two of three shots. **All three of C4's scored shots were rendering the dusk grade's
`slight` (0.7 m) regardless of what they asked for**, which is why a reviewer saw "a flat plane"
while wave displacement was demonstrably live. The knob path (`quality.set('seaState', n)`) wrote
`stateOverride`, the one value `applyGrade` respects — so the *same setting* worked through one
entrance and silently failed through the other.

Fixed in `ocean.js`: `setSeaState` now writes `stateOverride` and repaints; `setSeaState(null)`
follows the grade again. Verified: grade `slight` → set 3 `rough` → sky knob fires → **still
`rough`** → clear → `slight`.

**The running tally of this one bug:**

| # | Value | Written at setup by | Silently overwritten by |
|---|---|---|---|
| D12 | `texCap` / `aniso` | `main.js` boot | never re-read after `?preset=` |
| D15 | `fog.near` / `fog.far` | a scenario | `lighting.js` grade listener |
| D17 | `seaState` | a scenario | `ocean.js` `applyGrade` |

Each cost a component a meaningful fraction of a pass, and each was invisible — the code read
correctly, the setter existed, the value was simply gone by capture time.

**The rule, now load-bearing: a value written at setup and also written by a listener belongs to the
listener.** A component that needs to own one needs an override the listener respects. When you add
a setter to a graded subsystem, either route it through the override or make it throw — never let it
write the shadowed field.

**And the diagnostic that finds these: probe the value at capture time, not at set time.** C4 found
this by reading `seaState` from inside `--eval` during the shot, which is the only place the truth
is visible. Any agent that suspects a setting is not taking effect should do exactly that before
concluding anything about the visual.

### D18 — Two passes per component from here, not three (Aaron's call, 2026-08-06)
Phase 1 visual work is **accepted as it stands**. Aaron reviewed the progress board and signed off
on every current result for phase 1; improvements resume after the full game is testable.

**Remaining components get a maximum of 2 coder passes.** Measured across the eight shots that
received a third pass, pass 3 moved the gap by:

| +2.75 | +1.0 | +0.75 | +0.5 | +0.5 | 0 | 0 | −1.5 |
|---|---|---|---|---|---|---|---|

Median about **+0.5**, one transformative result (`bridge_night`), and one regression. A third of
the budget for half a point. Aaron's read — "most were decent on the first or second pass" — matches
the numbers.

Consequences for how a brief is written, since the second pass is now the last one:
- **Front-load.** The pass-2 brief must lead with the one or two findings that carry most of the
  gap, not an exhaustive list. Pass 3 was where the long tail used to get picked up; there is no
  pass 3.
- **Diagnose before briefing.** The manager verifies contested findings *before* the pass-2 brief
  goes out, not after. This already paid for itself twice: C3's "shadows are off" (they were on and
  rendering — measured) and C4's "the water is flat" (it was the setter, not the sea state). Either
  would have burned a pass, and now there is no spare one.
- A crashed or failed agent still does not consume a pass — that rule stands.

`C4` was already on pass 3 when this landed and is allowed to finish; the rule applies from C6.

### D19 — Measure the panel the critic scores, never the source plate (my error)
I set C4's pass-3 target from `exposure.mjs` run on the raw plate file. C4 checked it against the
sheet crop and found the two disagree:

| plate `1272010_01` | p1 | p5 | median | verdict |
|---|---|---|---|---|
| as the critic sees it (sheet crop) | **21** | 27 | 88 | `LIFTED` |
| raw source file — what I measured | 15 | 20 | 69 | ok |

`compare.mjs` applies a 16:9 fit plus the plate's crop rect, which removes the darkest regions and
moves the histogram by six points at p1. **The plate trips `LIFTED` itself when measured the way it
is actually scored.**

Rule: any figure quoted at an agent as a target must come from the **panel on the sheet**, extracted
with `.keys/` to pick the side — never from `refs/`. Same failure family as the calibration-plate
error in C1 (I scored a ship-dominated plate against a water-only brief): *the thing you measure
must be the thing being judged.*

Consequence for C4, and it is now the top phase-2 item on that component: it hit p1 14–15 against a
plate that really sits at 21, so both night shots are now **darker than the plate at the dark end**.
The real remaining shortfall is the middle and the top — `night_burn` median 48 against 88, p99 140
against 202. It is not too light; it is too dark and too flat.

---

## D20 — the shadow box is centred on the world origin, and that has been silently costing scored shots

`place()` at `js/world/lighting.js:36` sets `sun.position = dir × extent × 2.2`, and `sun.target`
stays at (0,0,0) for the life of the app. The orthographic shadow camera is therefore a box of
half-extent `extent` **centred on the origin** — not on the camera, not on the subject. Any
scenario that stages its subject further from the origin than its `shadow:` extent gets no shadows
at all, and reports nothing: there is no warning, the render simply comes back flat.

Measured on C4's three scored shots, extent as the only variable:

| Shot | shipped extent | shadow calls | at extent 300 |
|---|---|---|---|
| `splash_miss` | 140 | **0** | 12 |
| `night_burn` | (grade default) | 12 | **22** |
| `hit_explode` | 90 | 12 | 12 |

`splash_miss` shipped with every cast shadow missing, and a blind critic independently listed "no
lit side, no shadowed side, no cast shadows" among its top three fixes for our panel. Cost of
widening it there: +12 draw calls, +8k triangles, GPU 3.6 → 4.3 ms.

**The ruling.** Widening `extent` per scenario is a stopgap, not the fix — it trades shadow texel
density for reach, and at 2048² an extent of 300 already means 0.29 m per texel. The real fix is to
centre the shadow box on the camera or the subject, and it belongs to C1's lighting rig. **Wave C
owns it**, ahead of any per-scenario tuning, because every component's shots re-render against it.

Two general lessons, both of which this project has now paid for more than once:

- **`renderer.info.render` distinguishes shadow calls from main calls, and the keys already record
  both.** That counter said `shadowCalls: 0` in the round-3 key before any critic mentioned
  shadows. Read the numbers already on disk before theorising.
- This is the *fourth* instance of **a value that looks configured but is defeated by something
  else in the pipeline** (D12 `texCap`, D15 `fog`, D17 `seaState`, now the shadow box). The pattern
  is always the same: a scenario sets it, and something downstream — a listener, a default, a
  frustum — quietly wins. Probe the effect at capture time; never trust the call site.

Note also my own earlier wrong turn here: I once predicted C3's mast shadows were 1–2 texels and
"effectively off", disabled them, and got a 7.45% pixel shift proving they were rendering fine. The
difference this time is that the counter is zero, which is not a judgement call.

---

## D21 — the rig stomped every scenario's camera, and draw-call counts hid it

C6's `Rig` snapshots `app.camera.position` at construction — App's boot pose, because the rig is
built before any scenario runs — and `commit()` wrote those fields into the camera **every frame**,
via a `director.update()` that `main.js:67` registers unconditionally. Any scenario posing its own
camera through `seaCamera()` or `frameCamera()` had that pose overwritten on the next frame.

Probed at capture time, before the fix:

| Shot | authored | captured |
|---|---|---|
| `splash_miss` | `y:19, fov:33` | `pos:[24,12,34], fov:52` |
| `bridge_table` | its own framing | `pos:[24,12,34]`, target (0,0,0) |

Both are App's boot pose. C7 found it by probing; C6 fixed it with a `posed` flag that keeps the
rig off the camera until a timeline has authored a beat, plus `release()` / `posedByTimeline()`.
Verified after: `splash_miss` captures at `pos:[0,19,0], fov:33`, `bridge_table` at a real bridge
pose.

**The lesson, and it is the expensive one.** C6 ran a regression check and reported `guns_fire` at
52 calls / 66k tris, *bit-identical to C3's recorded figure*, and concluded nothing had broken. I
independently rendered `splash_miss` at 48 calls / 65,132 tris against a key recording 48 calls /
65,132 tris — an exact match — **with the camera completely wrong**. The ocean is one draw call at
any angle and the staged ships are not culled at these framings, so the counters simply cannot see
a camera error.

**Ruling: `renderer.info` is not a regression test for anything the camera does.** A camera check
means reading `camera.position`, `camera.fov` and `camera.rotation` at capture time from inside
`--eval` and comparing them against what the scenario authored. Any agent touching `js/cine/` or
`main.js`'s system list runs that probe on a scenario it does not own before reporting done.

This is the fifth instance of the D12/D15/D17/D20 pattern — a value that looks configured at the
call site and is defeated downstream — and the first where a plausible-looking regression check
actively certified the bug as absent.

---

## D22 — the `window_out` luma gate is measuring the wrong thing; the plot table stays

C6 reports `window_out` fails its luma-continuity gate: measured interior-to-exterior ratio **1.62**
against a required [3.0, 6.0], not monotone, while the reference plate sits at 6.7. Cause: the gate
assumes a dark room with a small bright window, and our bridge contains the self-luminous plotting
table, which holds the whole frame at ~60 mean on its own. C6 could not have both and kept the table.

**It kept the right one, and the gate is what is wrong.** The plotting table is the board — it is
the thing the player reads the game from, it is C2's scored work, and dimming it to satisfy a
brightness ratio would break a shipped component to pass a test.

**Ruling.** The gate stands in spirit and changes in measurement. What it exists to prove is that
flying out of the window reads as *emerging into daylight*. So:

1. Measure the ratio between the **window aperture** and the room's **non-emissive surfaces** —
   bulkheads, deckhead, console housings. Exclude the plot table, its glow spill, and any screen.
2. Keep the [3.0, 6.0] band on that measurement, and keep the monotonicity requirement across the
   move: no frame may be dimmer at the window than the frame before it.
3. The window aperture must be the brightest region in the interior frame *after* the table is
   excluded. If it is not, the shot has failed for real and no re-measurement saves it.

This is D19 again from the other direction — measure the thing being judged. There the error was
scoring a source plate instead of the panel; here it is scoring the whole room instead of the
contrast the cut depends on.

**Amendment, after C6 pass 2 reported a fail on one sampling and a pass on another.** Two dark
patches give a ratio of 7.0 (outside the band); six patches spanning bulkheads, deckhead and both
console runs give 4.7 (inside it). **The six-patch sampling is the one this ruling specified** —
"the room's non-emissive surfaces" means the room, not its two darkest corners, and a two-patch
sample is a subset chosen after the fact. `window_out@0.0` **passes D22**.

C6 chose the window glare over getting the two-patch sample into band, and said so plainly rather
than quietly picking the flattering number. That was the right call twice over: the glare is a real
improvement — aperture 145 → 211 sky, 108 → 185 sea, mullion 13 → 59 — and reporting the
unflattering sampling is what let me rule on it at all.

---

## D23 — C6 may edit `CINE.exposure` in `config.js`, and nothing else in that file

`config.js` is on every component's do-not-edit list, so C6 hard-coded `window_out`'s exposure ramp
at 1.02→0.90 locally while `fire_out` and `bridge_return` still read the config's 1.55→0.85, which
renders the bridge as a daylit cabin. The three sequences are now inconsistent, and the
inconsistency is invisible from any one of them.

**Ruling: C6 owns the `CINE.exposure` entry.** It may edit that key and its immediate neighbours
under `CINE`, and nothing else in `config.js` — not `UI`, not the sim tables, not the quality
presets. Remove the local hard-code and put the real numbers in the config so all three sequences
read one source.

The general rule this comes from: a do-not-edit list exists to stop agents fighting over shared
files, not to force a component to fork a value it legitimately owns. When the list is the reason a
value has two homes, the list is wrong for that value — escalate it rather than working around it,
which is what C6 correctly did.

---

## D24 — an assertion that passes is not evidence the effect works

Twice in one pass a component's own check certified a broken thing as fine:

- C6 reported the match cut passing **with 10× margin** — 0.44% of frame width against a 4% gate.
  A blind critic measured the subject jumping **50.6% of frame height** across the same cut.
  `matchError()` checks x only, at the cut instant, for one pair of points. It is a true statement
  about a quantity that does not determine whether the cut reads.
- C6 also cleared a camera regression on `guns_fire` because draw calls were bit-identical, while
  the camera was on App's boot pose (D21).

Neither was dishonest. Both were narrow measurements reported as broad conclusions.

**Ruling.** A component that asserts a visual property holds must state, in its handoff, **what the
assertion does not cover**. For a continuity gate that means naming the axes, the frames and the
subjects it ignores. An assertion with no stated blind spots is treated as unvalidated, because
every assertion has them and the useful information is which.

Corollary, and it is the reason the blind critics keep earning their cost: **the critic looks at
the artefact, the assertion looks at a number the author chose.** When they disagree, the critic is
describing what a player sees. Start from that.

---

## D25 — C7 owns the `UI` block in `config.js`, and owns the gameplay camera pose

Two seams left dangling by pass 1, ruled the same way D23 was.

**`config.js`'s `UI` export is still `{}`** because the do-not-edit list forbade C7 from filling it,
so every tunable lives in `flow.js`. Same defect as C6's forked exposure values: the list exists to
stop agents fighting over shared files, not to force a component to keep its own values somewhere
else. **C7 owns the `UI` block and nothing else in that file.**

**The gameplay camera.** C7 reported having to override the director's resting pose because it does
not frame the board. C6 has now used both its passes and cannot change; C7 has one left. But C6's
pass 2 built exactly the seam this needs — `rig.release()` and `rig.posedByTimeline()`, with the
`posed` flag from D21 keeping the rig off the camera when it has not authored anything.

**Ruling: after a sequence ends, the camera belongs to C7.** The director hands it back via
`release()`; C7 poses it for play. That is not an override and should not be written as one — it is
the documented handoff, and it wants a comment saying so rather than a workaround that reads like a
fight between two systems.

---

## D26 — the gate is finer than the measurement, and the score log has been overstating precision

Accumulated evidence, all of it from this project:

- **An accidental triple-blind repeat.** Pixel measurement showed `splash_miss` r2 and r3 were
  effectively the same image — PSNR 40.1 dB, and a column width profile agreeing to within a pixel
  at every height (34/123/154 against 34/123/153), where r1 differed at 25.5 dB and twice the width.
  Three independent critics scored that one image at **−3.0, −2.0 and −5.0**.
- **Both shots that landed on exactly −2.0 were contradicted by a second critic**, by 3.0 points
  (`splash_miss`) and 2.5 (`window_out@1.0`). Neither survived its median.
- Where a first critic scored −3.0 or −4.0, second critics have reproduced it **exactly**.

The reading is not that critics are unreliable — they agree closely away from the boundary and their
written evidence has held up under checking. It is that **a single reading carries roughly ±1.5**,
and a gate quoted to 0.5 cannot resolve that.

**Rulings.**

1. **A single-critic gap of −2.0 to −2.5 is not a pass.** It is a request for a second reading.
   D11 already said this; it is now measured rather than assumed, and the band is wider than D11's
   ±1.0 suggested.
2. **Never quote a round-to-round delta under 1.5 as an improvement** unless both readings were
   produced the same way. Much of `SCORES.md` compares single-critic rounds to two-critic medians;
   the direction is trustworthy, the decimal is not.
3. **Where a component is closed on a median and its earlier rounds were single-critic**, say so in
   the entry rather than tabulating them as if they were commensurable.
4. **Fix the side randomisation.** `oursSide` came out left/right/left in *both* C6 rounds. The
   critics are independent instances so no score is contaminated, but D11 assumes a property that is
   not holding, and it costs nothing to make it true.

**Correction to something I asserted between rounds.** I told Aaron that "ships brighter than their
own sky" and "a hard highlight ceiling on the sea" looked like one tone-mapping problem at the top
end. Re-reading the measurements, they are **two separate defects pointing opposite ways**: ship
materials are over-lit and blowing out (lit paint p50 237.6, 2,124 px above luma 220) while the sea
shader is *clamped* (zero pixels above luma 200 across 176,400). A single top-end change cannot fix
both — one needs less light, the other needs its ceiling removed. Wave C must treat them separately.

What this does **not** change: the gate stays at −2.0 and every component keeps the score it got.
Nothing here rescues a −3.5. It changes how confidently the numbers get reported, and it means
phase 2 should re-measure with two critics from the start rather than one.

---

## D27 — the one-line edit to FROZEN `main.js` is approved

Wave C set `ship.object3D.visible = false` on W0's scaffold hull and flagged it rather than hiding
it. `main.js` is marked FROZEN at line 1, so this needed a ruling.

**Approved.** The hull drew **13 main + 10 shadow calls that changed zero pixels** in a real match —
proven on a frozen clock by turning the whole ship magenta and measuring 0 of 1,024,000 pixels
changed. Every scored scenario already hid it by root name and the fleet builds its own ships, so it
was pure waste in a game 60% over its draw-call ceiling. `main.js:126` turns it back on for the
`boot` scenario, which I verified renders the hull correctly.

The FROZEN marker exists to stop components rewiring the app behind each other's backs, not to
preserve a measured waste of 23 draw calls. Wave C is explicitly allowed to edit any file; it
flagged this anyway, which is the behaviour I want.

## D28 — a persistent Chrome profile silently serves stale modules, and it nearly cost a false accusation

Measuring the live game after Wave C, I read **195 calls / 167 main** — bit-identical to the
pre-Wave-C figure — and was one step from reporting that its draw-call work had not landed. The
cause was my own harness: a persistent `--user-data-dir` plus a plain `http.server` with no cache
headers, so Chrome served the previous run's JS from disk cache. With `Network.setCacheDisabled` and
a fresh profile the same match reads **167 / 136 main**. The work was real; the measurement was
stale.

**Ruling: any CDP harness used for a before/after comparison must call
`Network.enable` + `Network.setCacheDisabled({cacheDisabled: true})` and use a fresh
`--user-data-dir`.** A scenario render via `tools/shot.mjs` is not affected — it builds a profile per
run — but the live-game harness is, and the live game is where integration numbers come from.

This is the same family as D13 (always render a same-code control) and D21 (`renderer.info` cannot
see a camera error): **before believing a number, establish that the thing you changed is the thing
being measured.** The failure mode here was the reverse of the usual one — the code was right and
the harness was lying.

---

## D29 — `tools/shot.mjs` now hard-fails on an unknown shot id, because it silently lied to me

I doubted Wave C agent 2's claim that my `window_out` shadow probe had measured the wrong scene.
It was right and I was wrong, and the reason is worth keeping.

`window_out@0.0` is an **output filename** — the harness canonicalises `--shot=window_out --at=0`
into that name. Passing it back in as `--shot` was an unknown id, and the harness **rendered the
page's default state anyway**: a plausible PNG, plausible counts (61 calls / 9 shadow), and a
plausible-looking probe result. I reported "9 shadow calls, so shadows are rendering there" to
Aaron on the strength of it.

Rendered correctly, `window_out` at t=0 probes `sunCast: false, sunI: 0.3, amb: 0.085` — exactly
what the scenario authors — with 54 calls and zero shadow calls **by design**: `shots.js:336` turns
the sun's shadow off so the room is lit by its own red practicals. Agent 2's explanation was right
in every particular.

**Fixed:** an unknown id now throws and prints the valid list. Verified both ways.

The lesson is not "trust the agent". It is that **a harness which accepts bad input and produces
confident-looking output is worse than one that crashes.** Every other trap in this log (D13, D21,
D28) has the same shape: the number looked fine, and the thing being measured was not the thing I
thought. This one I introduced into my own reasoning by using the tool wrongly, and the tool let me.

---

## D30 — the fleet frames are wrong, and it is why you never see your own guns fire

Aaron played the shipped build and reported two things that turn out to be one bug: "firing weapon —
you don't see a ship fire its weapons, appears to be just looking at water" and "the bridge is not in
a ship, it is floating".

Measured live, mid-match, from `fleet.ships[side][i].handle.object3D.getWorldPosition()`:

| | authored intent | measured |
|---|---|---|
| your fleet (side 0) | z ≈ 450 ± 250 | **z 798 … 923** |
| enemy fleet (side 1) | z ≈ −450 ± 250 | **z −9 … −152** |
| the gun `fire_out` looks at | in frame | **859 m from the camera** |

`fleet.layout()` calls `api.cellToWorld()`, which is `sides[side].localToWorld(local)` — a **world**
position — and then assigns it as the handle's **local** position inside that same side group. Side 0
double-counts the 450 m standoff; side 1 has a π rotation, so the standoff cancels instead. The net
effect is that your own fleet is 850 m out the window and the enemy fleet is parked on top of the
bridge.

`fire_out` then flies to a pose 120 m off the window and looks at a gun 738 m away. There is nothing
in frame but sea. Nothing was wrong with the sequence.

**Ruling — the world layout, stated once so nothing has to infer it:**

1. `layout()` places ships in **side-local** coordinates. `cellToWorld` stays as it is; it is
   correct and other callers depend on it.
2. **Your own side is centred on the bridge** (frame at z ≈ 0) and **the enemy is out the window**
   (frame at +standoff, the direction the window faces). The bridge stands in its own formation.
3. **The flagship is the bridge's own hull.** One ship of side 0 is pinned at the origin, bow +Z,
   and the bridge room sits on its bridge tier. Every other ship of side 0 keeps clear of it.
4. The three scored gunnery scenarios use `fleet.stage()`, not `layout()`, and must not move.

## D31 — the resting bridge camera is 7 cm above the deckhead

Aaron: "on the initial fly in it enters the roof of the bridge and shows inside the roof for a few
seconds." He proposed glass or a temporary transparency. Neither is the fix.

`ROOM.deck` 18 + `ROOM.h` 2.68 puts the deckhead at **20.68**. `sequences.js`'s `atTable()` is
`table + (−0.62, 1.80, −3.15)`, and the table is at 18.95, so the pose is **20.75** — above the
ceiling. `bridge_settle` starts higher still, at 21.17. Sampled live: the camera sits at 20.71–20.75
for **~2.3 seconds** at the end of `open_flyover`, then C7's `aim.take()` hands it down to 20.27.

`UI.camera.ceiling` is 1.30 and is right; C6's 1.80 is the outlier. **Ruling: `atTable()` drops to
1.30 above the table**, which also makes the hand-over to the play pose nearly a no-op. Nothing
becomes glass.

## D32 — the match opens at noon and turns to dusk once you are on the bridge

Aaron: the flyover's orange water with no sun in frame reads as broken; the same grade seen from
inside the bridge "looks amazing". He is right, and the difference is that the flyover looks *down*,
where a dusk sea has colour but no light source to explain it.

**Ruling: `playScene()` opens at `noon`. After the camera settles on the bridge, a caption states
the time and the grade eases to `dusk` over a few seconds.** The three grades are authored end
states, not samples of a continuum (`sky.js:15`), so the transition is a lerp *between two authored
grades* and must not be mistaken for a physical sun path. Two traps: `applyGrade()` fires the grade
listeners, which is how `lighting.js` and `ocean.js` repaint — that is wanted — and reading
`sky.env` with `envDirty` set regenerates the PMREM, which must **not** run every frame of the
transition.

## D33 — a mid-match layout change is legal only while your board is untouched

Aaron wants the top-right own-grid panel to open a fleet editor. `sim.setBoard()` refuses outside
`SETUP`/`PLACING`, and separately refuses once that side has been fired on.

The second guard is the one that matters — it is the actual cheat. The phase check is incidental.
**Ruling: `setBoard` may run in `AIM` provided `p.board` is still untouched**, i.e. before the enemy
has resolved a single shot on you. Keep the untouched guard exactly as it is, keep the phase in
`AIM` afterwards, and re-run `node sim.mjs 2000` — the sim is the one part of this project with a
real gate on it.

---

## D34 — the flagship is rigid, and the room is the reason

P1 put the bridge on a real hull. The room is fixed in world space and every `sequences.js`
generator reads `table()` / `win()` at **compile** time, so a hull that heaves opens a seam at the
deck and the deckhead every few seconds.

**Ruling: the flagship is `moored` — no heave, no roll, no trim.** The cost is that her painted
waterline no longer tracks the swell; the 2.5 m foam collar covers it and nothing rendered showed
it. If a later pass wants the bridge to ride the sea, the camera anchors must become children of
`body` and every generator that reads an anchor becomes frame-dependent. That is an architectural
change, not a tuning one, and it needs its own brief.

## D35 — a shell around a single-sided room needs a standoff, not a thickness

P1's first exterior house had a roof coplanar with the room's ceiling plate. It z-fought across the
whole surface and **striped the entire deckhead of `bridge_night`** — 9.85 mean against a 0.003
noise floor. Invisible from outside; only shows from within.

**Ruling: every face of the exterior shell stands 8 cm off the plate it covers (`GAP` in
`bridge.js`).** Same family as the standing trap in `MANAGER.md` — the value looked configured and
was defeated downstream — and it cost a full render cycle of the bridge trio to find.

## D36 — a close camera beat cannot be steered by a fraction of a distant target

`fire_out` used to move its look target `lerp(gun, aim, 0.5·u)` where `aim` is the objective, up to
900 m away. From a camera 40 m off the subject that is **445 m of look travel in 460 ms** — the ship
leaves frame on the beat's first frame.

**Ruling: a look target inside a close beat is authored in metres from the subject, never as a
fraction of the way to something far off.** P1's replacement frames `gun − bore · 0.55d`, i.e. back
down the firing ship's own deck, which is what put the bow, both forward turrets and the bridge on
the diagonal.

Two harness traps found in the same pass, recorded here so nobody pays for them twice:

- `Runtime.evaluate` with `awaitPromise: true` on `flow.fire()` **waits for the whole turn**, so any
  screenshot timed off it lands after the sequence it meant to sample. Fire without awaiting and
  time captures from `performance.now()`.
- `tools/shot.mjs` settles a fixed number of **frames**, not a fixed amount of simulated time, so a
  hull sits at a different point in its heave cycle run to run. That is the entire before/after
  pixel difference in the gunnery trio, and it is why D13's same-code control is not optional.

---

## D37 — D32 is a rule about the camera, not about the opening

"A dusk sea seen from above with no sun in frame reads as broken" is not a fact about the flyover.
It applies to **any** beat that looks down at water, and P3's first bird's-eye reproduced the fault
exactly — the same orange nothing Aaron filed in the first place.

**Ruling: a beat that looks down at the sea stands on the far side of its subject from the sun and
looks back across it.** `sky.sunDir` is the only input that needs. Every future overhead shot is
bound by this, not just the two that exist.

## D38 — a framing camera cannot be an authored pose on a mobile-first game

Portrait's horizontal half-angle is `tan(fov/2) · 0.46` against landscape's `tan(fov/2) · 1.78`.
A bird's-eye authored at 16:9 crops a third of its subject away at 390×844.

**Ruling: any beat that has to *contain* something solves its station from that subject's bounding
radius and the live viewport aspect**, arriving through `ctx`. `aim.js`'s `solve()` was the first
instance and `fleet_reform` is the second; there will be more. An authored pose is only safe when
what it frames is a direction rather than an object.

## D39 — two overlapping hulls in one colour read as one hull

P3's conflict state was a plain red fill and a player could not see that there were **two** ships in
the same water — it looked like one oddly-shaped ship. It had to become a hatch.

Recorded because of how it was found: by rendering the panel and looking at it, not by reasoning
about it. Same family as D24 — a state that is correctly computed and unreadable has not been
implemented.

Two smaller findings from the same pass:

- **Pointer capture belongs on a container that survives the repaint.** The editor rebuilds its ship
  elements on every cell a drag crosses, so capture taken on the dragged element is lost the first
  time it moves. Capture on the grid, which is never rebuilt.
- **`document.querySelectorAll('button')` finds the hidden HUD.** `.hud[hidden] { display: none }`
  does not remove it from the DOM, so a probe that identifies a screen by its buttons reports the
  title screen as present while the page is on `play` — and reports a reload that never happened as
  a successful resume. Identify a screen by `document.body.dataset.screen`, query inside
  `.screen-setup`, and prove a reload with a marker on `window`. This is D28's family again: the
  harness was the thing that was wrong.

**`tools/adversarial_sim.mjs` G5 now flips HELD→BROKEN by design** — D33 is what broke it, and it is
not a regression. G5b (rewriting an emitted `place` event in `PLACING` instead of appending a
corrective one) was **already broken before P3**, verified against a control tree; D33 only makes it
reachable more often. Neither should be read as new damage.

---

## D40 — the context-loss fix proved the handler works, not that the situation is handled

Aaron, after playing the shipped build: *"Returning to the website again after a while looked dark!?
a refresh still needed?"* — the same report as before P2.

P2's test called `ext.loseContext()` **and then `ext.restoreContext()`**. That is not what a phone
does. Reproduced here without the manual restore, at 390×844:

```
after loseContext()                 lost: true,  frames 2072
after a full hidden → visible trip  lost: true,  frames 2732     ← still lost
```

The rAF loop keeps running — 660 more frames — rendering into a dead context. The canvas is black,
the HUD is intact, and nothing but a reload recovers it. `webglcontextrestored` **never fires**,
because on a real device nothing calls `restoreContext()`; the UA restores when it feels like it, and
often not at all.

**Ruling: recovery is the page's job, not the browser's.** On returning to visible, the game checks
`gl.isContextLost()` itself and drives the recovery — `restoreContext()` if the extension is there,
and a reload if it is not or if the restore does not take within a short window. The match is already
saved on `visibilitychange` and resume works, so a reload costs nothing but a load screen. A black
canvas costs the session.

This is D24 stated again in the sharpest possible form: **an assertion that passes is not evidence
the effect works.** The handler was correct. The trigger did not exist.

## D41 — a marker on a lit chart cannot be additive

Aaron: *"I think it is meant to show a dark square where you have fired a shot? But I think that is a
bit buggy... none of them show a dark square. the hits are showing though."*

Nothing is buggy. Measured after five deliberate misses: `table:pegMiss` count 3, `visible: true`,
drawn every frame. The problem is that it **cannot be seen**:

- its material is `AdditiveBlending`, so it can only ever *add* light — a dark square is not
  reachable from that material at any colour
- it is a thin ring at `[0.20, 0.32, 0.44]`, ~4× dimmer than the hit mark's `[0.85, 0.24, 0.09]`
- the chart it sits on is **already covered in thin cyan rings** — compass roses, depth contours. A
  ring is the one shape that cannot read as a marker on this particular chart.

**Ruling: a resolved-miss cell reads as a filled cell that is DARKER than the chart, not as a ring
that is brighter.** That needs non-additive blending. Aaron's instinct — a dark square — is the
correct design, and it is also what a real plot looks like: something laid on the chart, not glowing
through it.

The general form, worth more than the fix: **a marker must contrast with the artwork it lands on,
not merely exist.** Nobody checked what the chart already looked like.

## D42 — D38 was ruled and then not applied to the beat that needed it most

Aaron: *"When we shoot, i can now see the ship/gun (on mobile) but it is very close, the guns barely
show on the screen, so we don't see most of explosion? maybe zoom out just a little more?"*

`fire_out` stations the camera at `d = clamp(len × 0.45, 30, 60)` — a constant fraction of the ship's
length, with no aspect term. At `len` 115 that is ~52 m. Portrait's horizontal half-angle is
`atan(tan(fov/2) · 0.46)` ≈ 12.6° at fov 52, so the frame is **~23 m wide** at that distance against
a 115 m ship. Landscape is 1.78 aspect and gets ~89 m — nearly four times as much.

D38 already ruled this: *any beat that has to contain something solves its station from that
subject's bounding radius and the live viewport aspect.* It was applied to `fleet_reform` and not
back-fitted to `fire_out`, which was written first.

**Ruling: `fire_out` is bound by D38.** So is every future beat with a subject. When a ruling is
made, the existing code it applies to is part of the ruling — check what else it lands on before
closing the pass.

## D43 — a hit has to land on a hull, and it is the dramatised fleet that must move

Aaron: *"when you hit someone there is no visible ship being hit. we should see a ship being hit —
atm it looks like the water being hit instead."*

He is describing the code exactly. Side 1's fleet is drawn from `dramaSeed` in `flow.js`
`layoutFleets()` and has **no relationship to the true enemy layout** — it cannot have one, because
the sim will not tell the renderer where the enemy's ships are. So `resolve()`'s
`fleet.shipAt(1, r, c)` returns null for almost every hit, `at` falls back to the bare cell, and
`vfx.hit` goes off on open water.

Measured, portrait 390×844, first hit of a real match: nearest dramatised enemy hull to the
explosion **46.3 m**, and the ship in question is a 3-cell destroyer steaming away from a fireball
that has nothing under it. The screenshot is unambiguous — a fire on the sea, beside an untouched
ship.

**Ruling: the dramatised enemy fleet is not a fixed fiction. It is a fiction that must stay
consistent with everything the player has already been shown.** A revealed hit cell has a hull on
it; a revealed miss cell has open water; a sunk ship's revealed cells are covered by a hull of
exactly that length. Nothing else about the arrangement is constrained, and nothing about the
*unrevealed* board may leak into it.

The mechanism is already built: these ships are steaming, and `fleet.reform()` tweens them along
Bézier courses. A ship moving to be where the shell is about to land is legal in this fiction and is
covered by the shell's own flight time, during which the camera is chasing the round and not looking
at the target.

**Not acceptable:** moving the camera so that a nearby hull happens to sit behind the fireball. The
explosion would still be on the water and Aaron would still be right.

## D44 — a ship taking a shell is a different effect from the sea taking one

The vocabulary for this already exists and has been blind-scored: the `hit_explode` scenario in
`js/world/vfx/impact.js` calls `emit.hit(target.hullSide(...))` plus two **hull-attached**
`emit.fire()` and `target.setDamage(0.55)`. Live play calls `vfx.hit(point)` and nothing else, and
only reaches for `vfx.fire` when a ship sinks.

**Ruling: a resolved hit uses the scored vocabulary — struck at the waterline of a real hull, fire
that rides the ship, and damage on the model that persists.** A point explosion with no hull under
it is the miss effect, and using it for a hit is why the two read the same.

## D45 — every beat with a subject, for the third time

D38 ruled it. D42 recorded that it had been ruled and not applied to `fire_out`. It is *still* not
applied to `shell_chase`, `impact_hit`, `impact_miss` or `enemy_volley`, every one of which is a
hard-coded eye offset with no aspect term:

```
shell_chase   fov 42, camera ~15 m off the round        portrait  ~5.3 m of frame   landscape ~20.5 m
impact_hit    eye = at + (-40, 26, -66), ~83 m out      portrait  ~29 m of frame    landscape ~113 m
```

Aaron, on the chase: *"zoom out a little more when it travels."* He is reading the 5.3 m.

**Ruling: no beat in `sequences.js` ships with a hard-coded eye offset. Every one solves its station
from its subject's extent and `ctx.aspect`, and the file gets no fourth chance at this.** When a
ruling is made, the code it already lands on is part of the ruling — grep for the pattern before
closing the pass, not after the next report.

## D46 — the dramatisation notice has to be seen to be a notice

Aaron: *"we also need the message to be clear (at top of screen?) that tells you ship/ship location
and hit location is not being shown reflected. i.e. mock view only being shown."*

The notice exists. D2 fixed its wording at "Positions dramatised", put the long form on once per
match, and set it to follow the shell for 1.4 s. Aaron has played whole matches and is asking for it
as though it were not there, which is the only evidence that matters: **a notice that is shown for
1.4 s, in a small font, tracking a moving object, while a shell is in the air, has not been read.**

**Ruling: D2's brevity stands for the in-flight caption. It is not the whole notice.** The player
must be able to learn — early, in a fixed place, without a shell competing for the same eye — that
both the ship positions and the impact positions on the sea are illustration, and that the chart is
the truth. D2's ban on legal-sounding padding stands: say the true thing plainly and once, don't
write a disclaimer.

## D47 — a beat and the thing it follows must share a clock

`shell_chase` follows a round. `Round.update()` runs its own `u` from 0 across the flight; the beat
mapped its pose time onto `start + (end − start) · u` with `start = 0.06`. The two clocks agree at
exactly one point, `u = 0.67`, and disagree everywhere else — by **54 m of arc at launch**, against a
camera standing about 30 m off. So the camera was not framing the round late or wide. It was framing
a point the round had not reached, with the round **behind the lens**.

Two passes were spent on the symptom. Pass 1 read it as a framing width problem, applied D38's
aspect solve, doubled the frame — and measured 80 of 156 frames with the round still outside the
viewport. The distance was right and the direction was never in question, because nobody had asked
whether the two `u`s were the same `u`.

**Ruling: when a beat follows a live object, it takes its parameter from that object — `round.u` —
and never re-derives one that ought to match.** Two expressions that are supposed to produce the
same number are a bug waiting for someone to change one of them.

The general form, which has now cost this project three separate faults: **a measurement can confirm
the fix you made and still be measuring the wrong quantity.** Pass 1's standoff search was searching
the gap between two clocks. It converged. It reported a real number. The picture was unchanged, and
only a screenshot of the played beat showed it.

## D48 — a look-ahead needs a leash

The same beat aimed at a point up to `0.09 + 0.16u` of arc ahead of the round, unbounded — tens of
metres at the start of a 900 m flight, which throws the subject outside a 42° cone at any standoff.
The look-ahead exists for a good reason and it earns its keep at the end of the beat, where the
impact should already be in frame when the round lands.

**Ruling: an aim offset from a subject is clamped by what the frame can hold, not by taste.** Slerp
it back toward the subject until the subject sits inside a fixed fraction of the *narrow* half-frame,
and let it release as the two converge.

---

## D49 — the shot never stops on its own, and there is one tap that stops it

Aaron, on 2026-08-30, after a long match on the phone: *"after a while the animation stopped
showing? I.e it stopped switching to outside view to watch the shot fly over to enemy … I think I
can see it from in the cabin."* He read it as ammunition — it happened as his salvos ran out and he
fired his last heavy — but the ordnance was a coincidence. `game.turns` counts BOTH sides, so his
seventh shot was turn 13, and turn 13 was where §7.4's third pacing tier took over: `instant`, which
does no camera work at all. The build was doing exactly what it was specified to do and it read as a
break.

The first fix kept the auto-degrade and made its last tier a shorter shot instead of no shot. Aaron
threw that out too: *"I wouldn't auto stop animation at all! it should just be an easy toggle to
turn off/on."*

**Ruling: pace is not a function of the turn count. There are two paces — the shot, and no shot —
and the player picks, from a control that is in the frame.** `PACE` carries no `fromTurn` at all;
`short` is gone; `paceForTurn` is gone; `present.pace()` reads one setting and returns `full` or
`instant`. The switch is a camera button next to pause in the HUD, one tap, with the same
struck-through-glyph treatment as the fleet-blank eye, and it writes the same setting the panel
does. Saves written before this hold `cine: 'auto'`; anything that is not an explicit `'off'` plays
the shot.

§7.4 is not wrong that forty turns of a nine-second cutscene is a risk. It is wrong that the fix is
to take the decision away from the player. Hold-anywhere fast-forward (4×, and it still lands the
result) is the in-the-moment escape hatch; the button is the standing one.

Two things fell out of the abandoned first attempt that are worth not rediscovering:

- **`paceForTurn` lived twice**, in `present.js` and in `director.js`, each a loop over
  `Object.entries(PACE)` taking the *last* match — correct only for as long as the keys happened to
  be in ascending `fromTurn` order. Both are gone now, but any future tier selection must be one
  function, not two that agree by accident.
- **A falsification arm has to reproduce the old world exactly.** Putting `instant.fromTurn = 13`
  back while a newer tier still sat on 13 tied, the newer tier won the tie, and the arm came back
  green while proving nothing.

And the second half of the same report: *"when a bullet type runs out, auto switch to the infinity
bullet."* Firing your last heavy greyed the button out and left `heavy` armed — the ghost was still
a four-cell footprint, FIRE was still live, and the shot came back refused at the rules with "no
heavy charges left". **A spent kind falls back to `shell`**, which has no charges and cannot run
out, with a toast saying so. `hud.setKind()` exists for that swap because `hud.arm()` calls back
into `onArm`, and doing it from inside `refresh()` would re-enter `refresh()`.

`tools/gates_pace.mjs` — 19 gates, four falsification arms, `--mobile` for portrait and `--png` for
frames. Three of its own bugs are the lesson:

- The instrumentation timed the **enemy's** shot, not the player's. `beat()` starts the enemy's beat
  synchronously inside `nextTurn()`, before the await on `fire()` resolves, so a patch left
  installed until `fire()` returns measures the wrong shot while every number it prints stays
  believable.
- The **first shot of a session runs 3× long** in headless while the tracer and impact shaders
  compile. Comparing it against a later shot measures the shader cache, not the pace. There is a
  warm-up shot now, and it is reported as not measured.
- The toggle gates went red and the obvious reading was "the first tap does nothing". The button was
  fine; the step before it had left cinematics off, so the first tap turned them **on**. A gate that
  does not set its own starting state is measuring the previous gate.

## Standing rules for every agent on this project

1. **Touch only `gms/3d/waterline/`.** The repo has unrelated uncommitted work in
   `gms/3d/monopole/`. Never `git add -A`.
2. **No git commands that write.** No commits, no staging, no branches. Aaron commits.
3. **Reference plates never enter `site/`.** They're copyrighted press screenshots.
4. **Comment style.** Aaron has ADHD and finds comment noise genuinely hard to read. Comment only a
   formula, a Three.js quirk, or a unit you can't guess. Never restate what a line does. No section
   banners, no JSDoc blocks. If in doubt, delete the comment.
5. **Don't exit on finishing.** Write your handoff, then hold for up to 10 minutes for follow-up
   instructions (`python3 -c "import time; time.sleep(300)"`, Bash timeout 310000, up to twice).
   Exception: a third and final rework pass — finish and go.
6. **Prove visual work by looking at it.** Render the PNG and read it back with the Read tool.
   Code that "should" render correctly is not a result.

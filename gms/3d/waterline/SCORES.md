# WATERLINE — blind critic score log

Protocol: `~/cc/yru/gms/3d/aaa_refs/naval/CRITIC_PROTOCOL.md`
Gate: **ours ≥ ref − 2.0**. Three passes per component, then we keep the score and move on.

| Round | Shot | Plate | Ours | Ref | Gap | Verdict | Top fix |
|---|---|---|---|---|---|---|---|
| C1 r1 | `sea_dusk` | 552990_08 | 3.0 | 8.5 | −5.5 | **fail** | No sky term on water; symmetric vertical shaft instead of a sun disc on the horizon |
| C1 r1 | `sea_night` | 494840_10 | 5.0 | 7.5 | −2.5 | **fail** | Global orange multiplier with no distance falloff; black sky the water reflects nothing of. *Water surface judged the better of the two — don't touch it* |
| C1 r1 | `sea_noon` | 236390_14 | 4.0 | 8.5 | −4.5 | **fail** | No sun specular; foam as flat decals that don't shrink with distance; fog so short the horizon vanished |
| C1 r1 | *calibration* | 236390_05 ×2 | 6.5 | 6.5 | 0.0 | **sound** | See note below |
| C1 r2 | `sea_night` | 494840_10 | **7** | 4 | **+3.0** | **PASS** | Beat the plate. Caveat: that plate is a dark, heavily-cropped, upscaled frame the critic marked down for a flat sky — an easy plate makes an easy gate |
| C1 r2 | `sea_dusk` | 552990_08 | 5 | 8 | −3.0 | fail | Sun disc overcorrected: 6.2% of frame width where ~1% is right, flattened 2.15:1 where refraction gives ≤1.15:1. Hard LOD seam under the horizon |
| C1 r2 | `sea_noon` | 236390_14 | 4 | 8 | −4.0 | fail | Sky flat (<4% zenith→horizon); sea meets sky in a hard 33-level step — no aerial perspective at all |
| C1 r2 | *calibration* | 2853730_08 crop ×2 | 8 | 8 | 0.0 | **sound** | Water-scoped plate this time; critic verified both halves pixel-identical before scoring |

**Calibration note — a process lesson, not a critic fault.** The calibration plate scored 6.5,
under `CRITIC_PROTOCOL`'s "either side below 8 → void" rule. Investigated before accepting the round:
the critic was perfectly consistent (0.0 variance on identical images), scored the three real plates
7.5–8.5, and correctly identified our render in all three sheets. Its stated reason for 6.5 — "the
water carries no sky reflection despite a bright cloud field above it" — is verifiably true of that
plate.

The real cause was my choice of calibration plate: it is ship-dominated, and the critic brief
instructs it to ignore all vessels and score only water, sky, light and atmosphere. That left it
grading a mediocre strip of water. **Rule going forward: the calibration plate must match the
scoring scope of the round.** For water rounds use a water-dominated plate. The round stands.

## C1 — ocean, sky, exterior light: CLOSED (3 passes used) — 1 of 3 shots passed

Final gaps are the **median across all measurements**, per D11. Two independent critics scored the
round-3 sheets; where they agreed exactly, one measurement was enough.

| Shot | r1 gap | r2 gap | r3 gap (A / B) | Final | Verdict |
|---|---|---|---|---|---|
| `sea_night` | −2.5 | +3.0 | −2.0 / 0.0 | **0.0** | **PASS** |
| `sea_dusk` | −5.5 | −3.0 | −3.0 / −3.0 | **−3.0** | fail |
| `sea_noon` | −4.5 | −4.0 | −4.0 / −4.0 | **−4.0** | fail |

Dusk and noon reproduced to the decimal across three independent measurements, so those failures
are real and not noise. Both improved materially from round 1 (−5.5 → −3.0, −4.5 → −4.0); neither
reached the bar.

**Counts, held flat across all three passes:** ocean **1 draw call**, `sea_dusk` 3, `sea_noon` 9,
`sea_night` 45 (38 of which are placeholder sprites C4 will pool into one), texMB 4.46, 60fps
everywhere, budget <90 calls / <300k tris / <45MB. Pass 3 is one texture fetch *cheaper* per water
pixel than pass 2. AA left off — MSAA4 measured 36.1MB, 80% of the texture budget, scaling with dpr².

### C1 known gaps — revisit after phase 1
| Gap | Detail |
|---|---|
| Near-water tile repetition | Both round-3 critics independently flagged directional tiling in the near field. The most cited defect that survived all three passes |
| Far-LOD mistuned in opposite directions | Detail fades out entirely below the horizon at dusk, but aliases at it on noon — one control, two scenes, wrong in both directions |
| `sea_dusk` water has almost no structure | A knowing trade: all of that shot's water is beyond 327 m at grazing angles, so relaxing the fade brings corduroy back. Real fix is a detail term modulating *radiance* rather than the normal, which wouldn't obey the slope-vs-grazing limit at all |
| Single cloud deck | Directional shading is real now, but every cloud is the same size and softness |
| Nothing validated in motion, or on a phone | All three passes were judged from stills. The grazing fade has never been watched move |

## C2 — bridge interior + planning table: round 1 of 3

| Round | Shot | Plate | Ours | Ref | Gap | Verdict | Top fix |
|---|---|---|---|---|---|---|---|
| C2 r1 | `bridge_table` | 1489630_00 | 4 | 7 | **−3.0** | fail | Table is the brightest object in the room and lights nothing — glow stops dead at the glass. Deck scuff decal repeats on a perfect 8×5 lattice |
| C2 r1 | `bridge_night` | 1489630_15 | 3 | 8 | **−5.0** | fail | ~70% of pixels crushed to near-black with no recoverable structure; chart table clips to featureless white; windows are luminance cards brighter than anything interior |
| C2 r1 | `bridge_lamp` | 494840_09 | 3.5 | 8.5 | **−5.0** | fail | Lamp is a faceted cone with its apex pointing **down** — a shaft widens away from its source. Nothing on the chart casts a shadow |

No second critic: D11's rule resolves pass/fail, and at −3.0/−5.0/−5.0 no second opinion could
flip the outcome. Spending an agent to refine a number we're going to act on identically is waste.

**One diagnosis explains all three sheets**, and the critic reached it independently: *emissives
that do not illuminate, objects that do not touch the floor, surfaces with no gradient across them.*
Every scored surface is lit by an ambient term instead of by the light sources visibly in frame.

The credit earned, because it says where **not** to spend pass 2:
- `bridge_table`'s interior/exterior exposure is **correct** — the dusk window holds a real
  sky-to-sea gradient without blowing out and the room isn't lifted to grey. That was §7.1, the
  problem flagged as most likely to sink this component, and it is solved.
- `bridge_night`'s cool pool on the deck under the table was called "the best single thing in the
  image" — keep it, extend the idea upward.
- `bridge_lamp`'s chart pool has real falloff with a specular band on the near rim. The lighting
  *idea* (one warm downlight, everything else dark) is right; the execution around it is what fails.

**Perf is not the constraint.** 70/85/71 draw calls against a budget of 120; 44k triangles against
260k; texture 21.0 MB against 45. There is room for real lights, shadow casters and prop geometry,
and pass 2 should spend it rather than protect a budget that isn't under pressure.

### C2 round 2 — big rework, gaps barely moved

| Round | Shot | Ours | Ref | Gap | vs r1 | Verdict |
|---|---|---|---|---|---|---|
| C2 r2 | `bridge_table` | 4 | 7 | **−3.0** | — | fail |
| C2 r2 | `bridge_night` | 3 | 7 | **−4.0** | +1.0 | fail |
| C2 r2 | `bridge_lamp` | 3 | 8 | **−5.0** | — | fail |

Pass 2 did substantial real work — real lights on every emissive, a shadow-casting pendant, prop
shadows, the deck lattice deleted, per-texel roughness — and bought one point on one shot. Worth
understanding why before spending the last pass.

**I gave pass 2 guidance that pointed the wrong way.** Round 1's critic praised `bridge_lamp`'s
"one warm downlight, everything else dark" as the right *idea*, and I passed that on as
load-bearing, told pass 2 not to break it, and ranked it above the items about raising the black
floor and spilling the light pool past the table edge. Pass 2 leaned into the darkness. Round 2
then measured that darkness as the largest single defect in all three shots. The information was
in round 1 — items 9 and 21 said exactly this — I just filed it below a compliment.

**Round 2's critic measured instead of eyeballing, which changes what we can do.** Luma histograms
per half-frame:

| Shot | ours ≤4/255 | ours median | plate ≤4/255 | plate median |
|---|---|---|---|---|
| `bridge_table` | 42.3% | 6 | 3.9% | 24 |
| `bridge_night` | 58.8% | 2 | 3.9% | 16 |
| `bridge_lamp` | 60.5% | 1 | **0.0%** | 32 |

The decisive observation is the UBOAT plate: **zero pixels below 5/255, and it still reads
unmistakably as a dark compartment lit by one lamp.** Darkness is not the same thing as no data,
and the plate proves the mood costs nothing to keep.

I verified this against the plates myself with a new instrument: **0.0% / 3.8% / 4.4%** dead on the
three plates against our **42.1% / 59.7% / 61.5%**. The target is real and demonstrably achievable.

**`tools/exposure.mjs`** — new, mine; agents may run it, not edit it. Reports the luma histogram
and a per-block void map (`#` = >55% of that block at luma ≤4). It reproduces the critic's numbers
to within 1%, so a coder can self-verify exposure **without ever seeing a score**. Same lesson as
D11: when a component keeps failing on one axis, build the instrument for that axis.

Credited by the critic unprompted, and therefore not to be disturbed in pass 3: `bridge_table`'s
sunset exposure relationship (nothing above 204/255, room not lifted to grey), and `bridge_lamp`'s
prop cast shadows — "genuinely correct and the strongest thing in the image".

## C2 — bridge interior + planning table: CLOSED (3 passes used) — 1 of 3 shots passed

Round 3 landed two shots on the gate, so per D11 a second independent critic scored the identical
sheets and the final figure is the median.

| Shot | r1 | r2 | r3 (A / B) | Final | Verdict |
|---|---|---|---|---|---|
| `bridge_night` | −5.0 | −4.0 | −2.0 / −0.5 | **−1.25** | **PASS** |
| `bridge_table` | −3.0 | −3.0 | −2.0 / −2.5 | **−2.25** | marginal fail |
| `bridge_lamp` | −5.0 | −5.0 | −4.0 / −5.0 | **−4.5** | fail |

Every shot improved every round; `bridge_night` moved 3.75 points across three passes. `bridge_table`
misses by 0.25 — inside the noise of a single judgement, but a fail is a fail and I did not go
looking for a third opinion to break it my way. C2 has spent its passes; we move on either way, so
sampling until the tie falls right is exactly the bias D11 was written to stop.

**The measurement held up well.** Both round-3 critics scored *our* `bridge_table` render at
**exactly 5** — the entire 0.5 gap disagreement is in how they graded the reference plate. Same
pattern as C1: absolutes wander, our own render scores consistently.

**What actually fixed this component was a bug, not lighting work.** Pass 3 found `materials/bridge.js`
baking the deck albedo *at* `#2b3036` and then multiplying it by a material `color` of the same
value: 0.025 linear squared is 0.0006, and Three's ACES fit maps anything under ~0.012 to exactly
zero. Those surfaces were **mathematically unliftable** — no lighting change could ever have
reached them, which is why two passes of genuine lighting effort bought one point between them.
The table bezel was black for a sibling reason (`metalness: 0.78`, and near-pure metal has almost
no diffuse term). Dead-pixel fraction went 42.1/59.7/61.5% → **0.3/1.0/3.9%**, against plates at
0.0/3.8/4.4%.

**Counts, final:** 95 / 99 / 114 draw calls against a budget of 120; 35k/30k/36k triangles against
260k; texture 24.22 MB against 45; 60fps; CPU p95 ≤3.5 ms. `bridge_lamp` is the tight one at 114.

### C2 known gaps — the revisit list, ranked

| # | Gap | Evidence |
|---|---|---|
| 1 | **The chart tabletop is not a shadow caster, so the pendant lights the deck straight through it.** One flag. Also explains the missing pedestal contact shadow | Both critics found it independently; I measured it myself — deck under the table 86–107 luma against 6–8 on open deck a metre away, a **13–17×** inversion |
| 2 | **Nothing on the chart casts a shadow** — mug, domes, parallel rule, red bar, pencil, puck all read as decals printed on the map | Both critics, at 5× |
| 3 | **The exterior through the windows is the weakest element in every shot** — flat black bars on the sunset, a warm brown smear at night contradicting the cool interior, a featureless brown wall in the lamp shot | Both critics ranked it their #2 fix. Partly C1/C3 territory: needs real horizon, night colour temperature, wave specular, vessel silhouettes with bloomed nav lights |
| 4 | **Bulkhead and deck repetition** — the pilaster+panel module repeats 6+ times at identical proportion and shading; deck tiles identical including their internal speckle | Both critics |
| 5 | **Crew are featureless mannequins** — two of the four largest silhouettes in a static shot | Both critics; flagged as a cheap win |
| 6 | Chart reads as dirt or rock rather than paper or a display; an unmotivated blown specular blob mid-chart | Critic B |
| 7 | Window mullion aliasing on the highest-contrast edge in frame. Left alone deliberately — MSAA4 measured 36 MB, 80% of the texture budget, scaling with dpr² | Both critics; D-level decision to leave |

Item 1 is a one-flag fix and item 2 is close to one. Both were found *after* the third pass closed,
so under the standing rule they wait — but they are the cheapest points on this whole project and
should lead the phase-1 revisit.

## C3 — ship kit + gunfire: round 1 of 3

| Round | Shot | Plate | Ours | Ref | Gap | Verdict | Top fix |
|---|---|---|---|---|---|---|---|
| C3 r1 | `fleet_wide` | 1272010_00 | 4 | 8 | **−4.0** | fail | Waterline is a dashed 1px seam — no contact darkening, no foam collar, no spray, no wash. The hull is a decal on the surface |
| C3 r1 | `guns_fire` | 1172620_07 | 3 | 8 | **−5.0** | fail | Muzzle blast is a clipped card that lights nothing — 6.00% of frame at luma ≥250 against the plate's 1.47%, and the barrels a metre in front stay cold |
| C3 r1 | `guns_broadside` | 236390_09 | 2 | 8 | **−6.0** | fail | Whitecaps are axis-aligned rectangular texel blocks — a low-res foam mask point-sampled into a countable grid |

Harsher than the full-frame view suggested, and the reason matters: **the critic worked at 4–10×
with nearest-neighbour crops for edges and found structural bugs invisible at 1:1.** Every earlier
round on this project has rewarded that and this one most of all. The pass-1 render looks
respectable in a thumbnail and falls apart under magnification.

**I verified the two headline findings myself at 4×:**
- **A mainmast is floating in mid-air** — a clean gap of sky between its base and the superstructure
  below, while the forward mast attaches correctly. A parenting or pivot-offset bug, free to fix.
- **The panelling is a projected grid, not strakes** — identical panel cell size on the near turret
  face, the funnel and the far bridge block, which are wildly different real sizes.

That second one is worth stating precisely, because it sits against C3's own claim that tiling is
structurally impossible. That claim is **true of the hull** — a unique unwrap per kit, ClampToEdge,
u bow→stern and v mirrored about the waterline, so rust and the scum line are painted at their real
positions. It is **not true of the superstructure**, which is where the critic found the lattice.
Solving repetition on one surface class does not solve it on the others.

Credit earned in round 1: no crushing or milkiness on any shot (a first for this project), distant
vessels carry silhouette and smoke rather than reading as flat black bars — the defect both C2
critics hit — and perf is the roomiest yet at **36–38 draw calls against 90**, 40–53k triangles
against 300k, 35.5–38.2 MB against 45.

The critic also marked the *plates* down where they deserved it (rainbow dispersion fringing on one,
a flat-lit hero ship with no terminator on another), which is a good sign it is not simply awarding
professional work a high number on sight.

### C3 round 2 — four real bugs fixed, one shot moved

| Round | Shot | Ours | Ref | Gap | vs r1 |
|---|---|---|---|---|---|
| C3 r2 | `guns_broadside` | 4 | 8 | **−4.0** | **+2.0** |
| C3 r2 | `fleet_wide` | 4 | 8 | **−4.0** | — |
| C3 r2 | `guns_fire` | 4 | 9 | **−5.0** | — |

Ours scored **4 / 4 / 4** — remarkably consistent, which says the build is uniformly at one level
rather than uneven. Pass 2's debugging was the best on the project (floating mast root-caused,
roll/trim swapped, the waterline seam isolated to the wake mesh, the muzzle's cold barrels traced to
a light sitting *on* the bore axis so `N·L ≈ cos 89°`), and it bought two points on one shot.

**The lesson is where the remaining gap lives.** Everything pass 2 fixed was a *bug*. What is left
is not bugs — it is the sea itself, shadow legibility, and scene density, none of which yield to a
root-cause hunt.

#### I resolved a direct contradiction before briefing pass 3

Pass 2 reported enabling superstructure shadow casting. The critic reported "not one cast shadow on
the deck from mast, funnel or bridge, and zero AO in any crevice", and ranked shadows its #1 fix.
Both cannot be right, and pass 3 only has one attempt.

Measured: shadow map **enabled**, sun casting, 30 casters / 51 receivers, hero ship at the origin
and inside the 130 m shadow box. Then the isolation, against D13's noise floor of mean 0.086:

| Experiment | pixels differing | mean delta |
|---|---|---|
| Shadow extent 130 vs 45 | 27.29% | 0.537 |
| **Shadows fully ON vs OFF** | **7.45%** | **0.584** |

Shadows **are** rendering — disabling them moves the frame at 6× the noise floor. They are simply
not *legible* on the deck. My own first hypothesis (a 1024 map over a 260 m box, so a mast shadow is
1–2 texels) was **wrong**: halving the extent changed plenty of pixels but produced no readable deck
shadow either, and the dark patches I first took for shadows are the dazzle camo.

So pass 3 is told the shadows are on and to find why the result is illegible. Briefing it to "turn
on shadows" would have spent the final pass re-enabling something already enabled.

#### What the last pass is actually up against
- **The sea is the biggest single item and most of it is C1's file.** A countable ~6–8px diagonal
  cross-weave that is the *same period at the horizon as in the foreground* — detail that never
  shrinks with distance destroys depth. A perfectly straight horizon with no crest breaking it.
  Whole-sea specular aliasing that will crawl in motion.
- **The flash core flatlines** — 0.942% of frame at exactly (255,255,255) in a ~90×110px
  structureless slab, against 0.000% on the plate, plus a countable circular sprite boundary and
  ~10 hard white bokeh discs. With no bloom pass the core has to be tone-mapped, not dimmed.
- **No aerial perspective on distant hulls** — far ships render *darker* than the haze they sit in.
  The critic called this the single largest reason the winning frame reads as an ocean.

## C3 — ship kit + gunfire: CLOSED (3 passes used) — 0 of 3 shots passed

| Shot | r1 | r2 | r3 | Final | Verdict |
|---|---|---|---|---|---|
| `fleet_wide` | −4.0 | −4.0 | **−3.5** | −3.5 | fail |
| `guns_fire` | −5.0 | −5.0 | **−4.0** | −4.0 | fail |
| `guns_broadside` | −6.0 | −4.0 | **−5.5** | −5.5 | fail |

No second critic: nothing is near the −2.0 gate, so a second opinion could not change an outcome.

**Counts, final:** 48–54 draw calls of 90, 62–84k triangles of 300k, texture **39.19 MB of 45**,
60fps, 0.0% dead and 0.0% clipped on all three. Perf was never the constraint for this component.

### Pass 3 was the best root-cause work on the project, and it still did not close the gap

- **The shadows were never the problem — the sun was.** On one patch of sunlit deck: 143.5 luma
  fully lit, 111.1 fully unlit. The whole lit→unlit range was **32 luma on a surface sitting at
  120**, and that was the best case; on the forecastle the same test moved 8. A shadow can only
  subtract the sun term, so the darkest any shadow could be was a 20% dip, which ACES compressed
  away. Ambient/IBL was carrying four fifths of the ship's radiance. Fixed by scaling *indirect*
  irradiance only.
- **The flash core went 0.956% pure-white → 0.000%, with a brighter core.** Additive blending
  happens *after* tone mapping, so N cards sum in LDR and clip. A soft knee in the blend function
  (`OneMinusDstColor, One`) asymptotes to 1 and cannot reach it. That is the two-line change a bloom
  pass would have bought — and C3 explicitly filed "**do not grant a bloom pass**" as an escalation.
- **A real pool bug:** the smoke field had 96 slots and each muzzle requested all 96, so the second
  gun of any salvo emitted no smoke. `guns_broadside` fires four.

### The critic's headline diagnosis for the regression is wrong — checked

`guns_broadside` regressed 1.5. The critic attributed it to depth of field producing a tilt-shift
miniature read, and called it "a one-line change with a disproportionate payoff".

**There is no depth-of-field pass anywhere in this codebase.** I grepped `post.js`, `quality.js` and
C3's files: nothing. I then tested the nearest real candidate — C3's `fade: { lod: 0.95 }` against a
grade default of 0.55, on a camera 150 m out where the entire frame is water — and rendered it at
0.55. **I have reverted that edit and restored C3's shipped state**, because the evidence did not
support the change and tuning a closed component's file on a hunch is a fourth pass by proxy.

The *observation* is sound even though the mechanism named is not: the shot does read as a model.
The real causes are the ones the critic listed second — an untextured flat-beige hull, a wake with
no spreading V, and no readable human-scale object at that framing. Which is C3's own top revisit
item, arrived at independently.

### C3 known gaps — the revisit list, ranked

| # | Gap | Detail |
|---|---|---|
| 1 | **The "battleship" is 90 m** (`lenMul 1.50` × 12 m cells) | Every human-scale object on it is correctly sized, so it is self-consistent — and it reads as a model. Critics measured it at 110–140 m against references at 215–235 m. Fixing it means re-framing all three cameras, which is not a final-pass change |
| 2 | **One-value paint** | The ship is a single beige or grey. The critic's #1 fix: split into four values (dark deck, mid topsides, lighter turret roofs, near-black funnel caps). Hours of work, biggest readability gain available |
| 3 | **The waterline still reads as an intersection** | No contact darkening, no wet band, no scum line at the hull/sea line; foam offset outboard of the hull on one shot; the wake is a thin streak with no rooster tail or spreading V |
| 4 | **The muzzle flash still emits no light onto its own ship** | Barrels stay cold grey while the *water* carries an orange reflection — the sea is lit by something the ship is not. Also built from a countable cluster of blurred spheres rather than a stretched cone with a soot core |
| 5 | Sky banding — 10–12 discrete quantisation steps at 9× stretch, no dither | |
| 6 | Whitecap patches share one footprint and do not shrink with range | |

**Four escalations filed (§0P3.8), all written from the file** — an `overcast` grade in `sky.js`
(`fleet_wide` is still 16 luma above its plate), swell displacement fading to a ruled horizon
(`ocean.js:150`), glint against an unfiltered normal (`ocean.js:255`), and the warning that
`vfx/index.js`'s shared `cardMat` will hand C4 and C6 the same countable bokeh discs unless they
copy C3's `softAdd()`. **That last one is a gift to the next two components and must be in their
briefs.**

## C4 — impact VFX: round 1 of 3

| Round | Shot | Plate | Ours | Ref | Gap | Verdict |
|---|---|---|---|---|---|---|
| C4 r1 | `splash_miss` | 2853730_08 | 4 | 9 | **−5.0** | fail |
| C4 r1 | `hit_explode` | 1272010_06 | 3 | 9 | **−6.0** | fail |
| C4 r1 | `night_burn` | 1272010_01 | 3 | 9 | **−6.0** | fail |

**The agent building this died mid-stream on an API error**, partway through `fire.js`. Per the
standing rule I did not try to resume it — but the code it left was essentially complete, all three
scenarios rendered, and I built the sheets myself rather than have a fresh agent redo finished work.
**I am not charging the crash as one of C4's three passes**: no sheets were built and no scoring
happened, so it would penalise the component for an infrastructure failure. `HANDOFF_VFX.md` was
never written and pass 2 must write it — C6 needs the trigger API.

**Best first-pass exposure on the project: 0.0% dead and 0.0% clipped on all three**, on the
brightest shots in the game. That is C3's `softAdd` lesson transferring exactly as intended — the
previous component spent most of a pass discovering that additive blending after tone mapping
clips, and C4 never paid it.

The critic confirmed it at frame level (luma ≥254 is ≤0.004% either side) but found the real
difference *inside* the fire: ours hits `R=255` **and** `G≥250` together on 1.53% of the hit
cluster — small neutral-white pips — while the plate clips red on 10.76% of the same region and
**never reaches G=255 anywhere**, so its hottest core stays chromatic and rolls red→orange→yellow.
Cap flame emissive near (255, 235, 170).

### The critic's #2 fix is "the water is a flat plane". It is not flat — it is too calm.

Worth resolving before pass 2, because "displace the water" points at C1's frozen `ocean.js` while
the real fix is one line in C4's own file.

Forcing wave amplitude to zero *does* change the frame (mean 3.145 against that scenario's own
control of 1.218), so displacement is live. The sea states are simply wrong for the plates:

| Shot | seaState | amplitude | plate |
|---|---|---|---|
| `hit_explode` | 1 `slight` | **0.7 m** | close-range hit |
| `night_burn` | 2 `moderate` | **1.5 m** | dusk **in rain** |
| `splash_miss` | 3 `rough` | 2.8 m | **storm-grey** sea |

A 0.7 m swell seen from several hundred metres is invisible, which is exactly the "dead-straight
1–2 px waterline" finding. `setSeaState` is a public seam. Note `rough` at 2.8 m is the table's
maximum, so if a storm plate needs more than that, *then* it is an escalation.

### Also worth carrying
The critic's other findings are countable-sprite defects, all of which C3 already solved once:
five near-identical rounded smoke lobes on one horizontal line; four parallel identical vertical
flame wedges; a circular sprite disc near the horizon; every rain streak identical in width,
opacity, length and tilt, and **staying cool grey where it crosses the fire's bright core** while
the plate's rain warms. That last one is the "emitter must light its surroundings" rule again, in
its cheapest possible form.

### C4 round 2 — all three improved

| Round | Shot | Ours | Ref | Gap | vs r1 |
|---|---|---|---|---|---|
| C4 r2 | `splash_miss` | 5 | 8 | **−3.0** | **+2.0** |
| C4 r2 | `hit_explode` | 3 | 8 | **−5.0** | +1.0 |
| C4 r2 | `night_burn` | 3 | 8 | **−5.0** | +1.0 |

**The sea-state fix worked better than the plate.** The critic, blind, said our `splash_miss` water
has "real varied-scale displacement, whitecap granularity, detail that shrinks with distance" and
called the plate's foreground "soupy, painterly" — *"that asset is worth copying in the other
direction."* First time on this project a critic has preferred our work on any criterion. It also
confirmed the splash column now scales correctly at ~25–30 m against the far ship's freeboard.

That is the D17 root cause paying off: the water was never wrong, the setter was.

### The remaining gap is one thing, and it is measurable
> "The right panels apply a global colour wash instead of lighting the scene."

Sampled: near water 169/92/46, far horizon 118/53/29 — **the sea two kilometres from the fire is as
orange as the sea twenty metres from it.** Zero falloff, and nothing has a shadow face. A global
tint is standing in for attenuated point lights, which is the "an emitter must light its
surroundings" rule failing in its most expensive form.

The side effect is milky blacks, and **`exposure.mjs` could not see it** — it measured crushing
only, so all three shots reported a clean 0.0% dead while reading as a grey wash. I added p1/p5
reporting and a `LIFTED` verdict. The correlation is immediate:

| | p1 | p5 | p99 | verdict | gap |
|---|---|---|---|---|---|
| `night_burn` | 26 | 32 | 159 | **LIFTED** | −5.0 |
| `hit_explode` | 22 | 39 | 200 | **LIFTED** | −5.0 |
| `splash_miss` | 10 | 25 | 166 | ok | **−3.0** |
| plate `1272010_01` | 15 | 20 | 200 | ok | — |
| plate `1272010_06` | 10 | 17 | 215 | ok | — |

The two `LIFTED` shots are the two worst scores. The plates carry more range at **both** ends —
darker shadows *and* brighter highlights — while ours is compressed into the middle. Target for
pass 3: **p1 ≤ 15** with p99 rising, achieved by real falloff rather than by a curve.

Other confirmed defects: ~eight identical smoke lobes at identical altitude on one depth plane,
several detached from any source; an unlit black quad lying flat on the water in `hit_explode`;
rain streaks of identical width, colour and tilt passing in front of fires without picking up their
colour; and no contact event anywhere — no crown or foam ring at a splash base, no steam where fire
meets water, no impact rings from rain.

## C4 — impact VFX: CLOSED (3 passes used) — 0 of 3 shots passed

| Round | Shot | Ours | Ref | Gap | vs r2 |
|---|---|---|---|---|---|
| C4 r3 | `splash_miss` | — | — | **−3.5** | −0.5 |
| C4 r3 | `hit_explode` | 3 | 8 | **−5.0** | 0.0 |
| C4 r3 | `night_burn` | 3 | 8 | **−5.0** | 0.0 |

`splash_miss` is the median of two critics who **disagreed by 3.0 points** — A gave −2.0 (a pass),
B gave −5.0. That is the widest split any shot has produced, and by D11 the median stands: −3.5,
fail. I did not go looking for a third opinion to break it. Worth noting for phase 2 that B's
review is the more evidential of the two — it measured the column's width profile down the
scanline, the splash core against the whitecaps in its own frame, and the highlight population —
whereas A's was largely impressionistic. If one of them is wrong it is more likely A.

**B's central finding, and it is a good one: our splash is darker than ordinary foam in its own
frame.** Splash core median 116 / max 159, while foreground whitecaps in the same panel reach 245.
Aerated impact water has to be the brightest thing in a marine scene; at 90 luma *below* the
whitecaps it reads as smoke, not water. It also measured the column widening monotonically downward
at about 3:1 base-to-top — a debris cone. A shell splash is a stem that flares only near the crest.

### Zero cast shadows in `splash_miss` — confirmed at the counter, not inferred

B's third fix was "no lit side, no shadowed side, no cast shadows". The harness agreed before I
read the review: the round-3 key records `shadowCalls: 0`. Cause, probed live:

`place()` at `lighting.js:36` puts the sun at `dir × extent × 2.2` from the **world origin**, and
`sun.target` never moves off (0,0,0). So the ortho shadow box is centred on the origin, not on the
subject or the camera. `splash_miss` sets `shadow: 140` and stages its ships at z = −215 and −520 —
**both entirely outside the box**, so nothing was ever rendered into the shadow map.

Measured, same code, extent as the only variable:

| Shot | shipped extent | shadow calls, shipped | at extent 300 |
|---|---|---|---|
| `splash_miss` | 140 | **0** | 12 |
| `night_burn` | — | 12 | **22** |
| `hit_explode` | 90 | 12 | 12 |

`splash_miss` lost every caster and `night_burn` lost about half. Cost of the fix on `splash_miss`
is +12 draw calls, +8k tris, GPU 3.6 → 4.3 ms — trivially affordable. This is C1's shadow rig, not
C4's file, and it silently taxed two components' scored shots. See D20.

### C4 known gaps — the revisit list, ranked

1. **Origin-centred shadow box** (D20). One number per scenario as a stopgap; the real fix is to
   centre the box on the camera or the subject. Cheapest real win on the board.
2. **Splash column shape and brightness.** Narrow the emitter to a 5–10 m stem, spread only in the
   top 40%, push the core to 210–235 so it outshines its own whitecaps.
3. **Fire lights nothing.** Confirmed by both C4's instrumentation and two critics independently:
   `hit_explode` warmth peaks +62 near and is still +23 at 700 px; `night_burn` is flat across
   890 px (+25, +24, +16, +40). Attenuated sources, not a global tint.
4. **Too dark at the bottom *and* too flat at the top.** `night_burn` median 47, p95 92, and
   **0.001% of pixels above 240** in a frame containing several burning ships. Pass 3 aimed at a p1
   target I derived from the wrong image (D19), so both night shots overshot into darkness while
   the real shortfall was the midtones and highlights.
5. **No contact events.** No crown or foam ring at a splash base — and where a second splash exists
   at range it gets no collar at all, which is an LOD asymmetry rather than a missing feature.
6. **Countable sprites, still.** ~6–8 separable gaussian billboards at the splash base with one
   visible circular sprite edge; streak assets at two fixed angles, one of them horizontal in open
   sky where nothing falling could be.

## C6 — director, sequences, shell, match cut: round 1 of 2

| Round | Shot | Plate | Ours | Ref | Gap | Verdict |
|---|---|---|---|---|---|---|
| C6 r1 | `shell_flight` | 242050_01 | 3.0 | 7.5 | **−4.5** | fail |
| C6 r1 | `window_out@0.0` | 1272010_02 | 2.5 | 7.5 | **−5.0** | fail |
| C6 r1 | `window_out@1.0` | 236390_14 | 3.0 | 7.5 | **−4.5** | fail |
| C6 r1 | `match_cut` | — | — | — | — | **does not hold** |

### The match cut fails, and C6's own assertion said it passed with 10× margin

C6 reported: *"Match-cut assertion passes with 10× margin — peg vs shell NDC across the cut = 0.44%
of frame width against the 4% gate."* The critic, looking at the same six frames, measured the
subject jumping **50.6% of frame height** across the cut (71.9% down → 21.3% down), then sliding a
further 24.9%.

Both numbers are correct. `matchError()` checks **x only, at the cut instant, for one pair of
points** — so it is blind to vertical displacement, blind to what the frames on either side do, and
blind to everything that is not that peg. It is a true statement about a quantity that does not
determine whether the cut reads.

Three more breaks, all measured, none of which the assertion could see:
- **The anchor column does not exist at t=0.0.** There is nothing to match *to* on the incoming side.
- **Velocity discontinuity of 52:1** — anchor screen-x moves −104.5 px then +2.0 px between
  equal-duration samples, and its base-y reverses direction.
- **A bloom/bokeh overlay switches on between t=0.2 and t=0.4** — region p95 goes 65.5 → 221.8 →
  255, turning a luma-38 ladder into clipped white discs.
- **21.3° of dutch roll plus all the motion blur unwinds between t=0.8 and t=1.0.**

Exposure continuity across the cut is the one thing that works — means within 3%.

### Defects shared across the three stills

- **Emitters still light nothing.** A 255-white fireball 80 px from the superstructure leaves it at
  B−R = **+23.5**, net *blue*. Same in `window_out@1.0`: a 252-luma flash 100 px away, superstructure
  at B−R = **+47**. This is the identical finding C4 closed on and C3 before it — it is now a
  project-wide defect, not a component one.
- **Rain vanishes over the sky** in `shell_flight` — streak density 6.5/kpx over sky against
  122.9/kpx over sea, a 1:19 ratio where the plate is 1:1.6. The streaks are a fixed additive
  quantity, so they are invisible against a 150-luma sky and pink where they do show (ΔR−ΔB = +14.8).
- **The sky is a literal linear ramp** in `window_out@1.0` — a straight line fits 230 rows at 1.04
  mean residual; clear sky varies 4.9 luma levels across 8,211 px. The plate departs from linear by
  9.89 mean / 30.4 max.
- **Foreground water detail runs backwards** — |dx| 4.09 at y355 falling to 0.46 at y505, 8.9×
  *smoother* as it approaches the camera.
- **Unlit black geometry**: a slab under the ship at x 757–777, y 343–378 with min RGB (13,11,18)
  against a sea whose *minimum* is luma 54, and its silhouette is unfiltered — 171→12 in one pixel.
  An open stern void at x 287–303, y 356–382, luma 11–19 against a 66–125 hull.

### `window_out@0.0` — the interior end, and D22 in evidence

The critic independently confirmed what D22 ruled on: the plot table **outshines the daylight**,
mean 97.1 against a 20.5 bulkhead, 4.7:1. My ruling stands — the table is the board and it stays —
but two findings in the same region are *not* covered by that ruling and are real bugs:

1. **The table frame is blue-dominant lavender, RGB(63,47,72), in a red-only room.** That is a
   colour error, not a brightness one.
2. **The windows have zero glare spill** — they max at 175.6 with no clipping, and the bulkhead
   beside them reads p99 = 24.4. A bright window in a dark room bleeds onto its surround.

Surface texture on the big faces measures 4× lower than the comparison panel (0.037 against
0.158–0.298).

### Worth recording about the plates themselves

The `window_out@0.0` reference is **crushed — 82.7% of the panel sits in luma 0–16** and the critic
called it unviewable on a phone. It still scored 7.5 against our 2.5. And the `shell_flight`
reference has **0.00% of pixels below luma 32** — no blacks at all — and contains no shell. Per D11
I score the gap and do not relitigate the plate, but both are worth knowing when reading these
numbers: two of C6's three targets are unusual frames.

### C6 round 2 — the best single pass on the project

| Round | Shot | Ours | Ref | Gap | vs r1 |
|---|---|---|---|---|---|
| C6 r2 | `shell_flight` | 4.0 | 7.5 | **−3.5** | **+1.0** |
| C6 r2 | `window_out@0.0` | 4.0 | 7.5 | **−3.5** | **+1.5** |
| C6 r2 | `window_out@1.0` | 5.0 | 7.0 | **−2.0** | **+2.5** |
| C6 r2 | `match_cut` | — | — | **half-holds** | up from "does not hold" |

Every shot moved, and `window_out@1.0` is **exactly on the gate**, so per D11 a second critic is
scoring it. `+2.5` is the largest single-shot improvement any component has recorded.

### D24 paid for itself within one pass

C6's `matchReport()` listed seven stated blind spots. **Number 4 was: "the peg's height is taken
from `mesh.scale.y`, which is exact, but the visible column is the emissive-blown silhouette and is
a little wider than the geometry."**

The critic, independently and without reading that list, found precisely this: across the cut the
anchor **width jumps 25 px → 70 px** and its aspect flips **4.2:1 → 1.33:1**, with anchor median
luma running 245, 253, **255**, **144**, 225, 202 — "the peg is a blown-white cut-out with no form,
the shell is a shaded solid."

The rule from D24 is one pass old and it has already converted an unknown-unknown into a known
limitation that the next pass can aim at. Position continuity, the thing `matchReport()` *does*
cover, is genuinely solved: screen X spans 8 px and Y spans 5 px across all six frames including
the cut, horizon dead level.

Two further cut breaks the report did not cover, both matching blind spot 1 ("it measures the anchor
and nothing else"): the table's specular sheen goes out entirely between F2 and F3 (mean 156.9 →
59.0) immediately before the cut, and a +30-level sky element covering about a quarter of the sky
vanishes between F4 and F5. And the exterior camera is **parked** — horizon 85/86/87, enemy ship
static — while the shell shrinks 8.5×. It does not follow the round.

### What is still wrong in the stills

- **A hard highlight ceiling on the sea.** In `shell_flight`, across 176,400 px at (20,300)–(900,510),
  **exactly zero pixels exceed luma 200**; the plate has 5.26% above 200 in the same band.
- **The hero shell is the least legible thing in frame** — median luma 60.6 (min 8.1) sitting on a
  144-luma wake, while the two *background* rounds have tracer trails and it does not.
- **The explosion is 4.4× softer than the ship 40 px away** (Laplacian 7.49 vs 32.75); the plate's
  fire/rigging pair is 1.33×.
- **Ships are brighter than their own sky** — superstructure p95 241.5 / max 254.9 against a sky
  maxing 174.3 in `window_out@1.0`; 255 vs 209 in `shell_flight`. Same bug in two shots.
- **Daylight through the windows plus a full red night rig** in `window_out@0.0`: console tops facing
  a blue sky read (54,51,47) while faces turned *away* read (71,42,28). No daylight bounce at all.
- **The sky is still nearly flat** in `window_out@1.0` — gradient 0.37 against the plate's 3.60, a
  9.7× shortfall, though up from round 1's linear ramp.
- **Rain still only falls below the horizon** — 0.30% of the sky band against 4.54% of the sea. C6
  escalated the cause as E3: `softAdd`'s `src·(1−dst)` gives a 145-luma sky 1.75× less increment
  than a 65-luma sea, so no amount of `tone` tuning fixes it. That is a Wave C fix in `fire.js`.
- **The plot table is genuinely good** — relative detail 0.264, competitive with the plate's props at
  0.10–0.32 — while everything architectural around it runs 0.029–0.084.
- Uncapped transom hole at (280,358)–(308,392), which is C6's escalation **E4** against C3's hull.

### A process note on the sides
`oursSide` came out **identical in rounds 1 and 2** on all three shots (left / right / left). The
critics are independent instances so nothing is contaminated, but the randomisation is not actually
randomising per round. Worth fixing before the next component so the property D11 assumes is real.

## C6 — director, sequences, shell, match cut: CLOSED (2 passes used) — 0 of 3 shots passed

| Shot | r1 gap | r2 gap | Final | Verdict |
|---|---|---|---|---|
| `shell_flight` | −4.5 | −3.5 | **−3.5** | fail |
| `window_out@0.0` | −5.0 | −3.5 | **−3.5** | fail |
| `window_out@1.0` | −4.5 | −2.0 / −4.5 | **−3.25** | fail |
| `match_cut` | does not hold | half-holds | — | position solved, shape not |

`window_out@1.0` landed on exactly −2.0 with the first critic; the second scored the same image at
**−4.5** (ours 3.0, ref 7.5). Median −3.25, so it fails by 1.25.

**Be careful comparing r1 to r2 here.** Round 1's gaps are single-critic readings; this one is a
two-critic median. The improvement is real but the two numbers were not produced the same way, and
I should not quote a precise delta across a change of method.

### The gate is finer than the measurement — this is now well evidenced

Two shots have landed on exactly −2.0 with one critic. **Both were contradicted by the second**, by
3.0 points (`splash_miss`) and 2.5 points (`window_out@1.0`). Add the accidental triple-blind
repeat on `splash_miss` r2/r3 — three independent critics scoring what pixel measurement showed was
effectively the same image returned **−3.0, −2.0 and −5.0**.

That is a spread of about ±1.5 around a true value, against a gate quoted to 0.5. See D26.

### C6 known gaps — the revisit list, ranked

1. **Exposure, and it blocks everything else.** Lit paint sits at p50 **237.6** — 93% of range, with
   2,124 pixels above luma 220 — while the plate's equivalent surface is p50 122.3. The muzzle flash
   peaks at 253.5, only **6 luma units above the ship's own paint**, which is why it reads as paint
   rather than fire. Re-expose to land lit paint at 120–140 with a filmic shoulder. Adding hull
   detail before this just produces washed-out hull detail.
2. **No ambient/IBL term and no contact shadow.** The stern transom measures mean luma **14.0**
   against 110.3 on the plate beside it — a 96-unit step between two aft-facing surfaces under the
   same daylight sky. Water outboard of the hull shows *zero* darkening (86.2 against 83.1/86.8
   open) where the plate darkens 17% at the bow foot. Both critics reached this independently; it is
   the strongest single "this is a render" cue in the frame.
3. **The flash still emits no light — and the falloff runs backwards.** Smoke binned by radius from
   the 253-luma core: 89.1 at 0–9 px, **103.4 at 60–69 px**. It gets *brighter* with distance. The
   barrel is darker 10 px behind the muzzle than at the breech. C6's pass-2 `flashLight()` fixed the
   *hull* (B−R +47 → −5.0) without fixing the smoke, which is a separate material.
4. **Foam is clamped.** One RGB triplet (157,173,179) covers **2.20%** of the foreground, top-6
   cover 4.9%, and there are **19 consecutive byte-identical rows** at x=200. p99.9 lands at
   174.7/174.7/174.5 across three disjoint blocks — a hard ceiling, not a distribution.
5. **Aerial perspective is inverted.** Sea B−R is +52 near the horizon and +37 in the foreground;
   the plate runs +14 → +35. The sea also dies at the horizon — sd 4.6 and h-gradient 0.53 two
   pixels below it, against the plate's 35.0 and 8.20.
6. **The match cut's shape discontinuity.** Anchor width 25 → 70 px, aspect 4.2:1 → 1.33:1, and the
   peg is a blown-white cut-out (luma 255) against a shaded solid (144). C6's own blind spot #4
   named this before the critic found it. Position continuity is solved and should not be touched.
7. **Two non-anchor cut breaks**: the table's specular sheen extinguishes between F2 and F3 (mean
   156.9 → 59.0) right before the cut, and a sky element covering a quarter of the sky vanishes
   between F4 and F5. The exterior camera is also **parked** — horizon 85/86/87 — while the shell
   shrinks 8.5×, so it does not follow the round.
8. **Rain only falls below the horizon** (0.30% of the sky band against 4.54% of the sea). Cause is
   C6's escalation **E3** in `fire.js` and cannot be fixed by tuning `tone`.

## C7 — UI, game flow, dormant multiplayer: CLOSED (2 passes used)

Not blind-scored — gated on the harness, like C5. **The game is playable, offline, from a plain
`index.html`.** Verified by me independently on a real page over raw CDP, not from the report:

- Title camera `[74.8, 30, 46.4]` fov 50, rig unposed — a real orbit pose.
- Battle starts a live match: "YOUR MOVE / You 5/5 / Enemy 5/5 / SHELL ∞ HEAVY 3 SALVO 2 / FIRE".
- **Resume works.** After a mid-match reload the title offers **Carry on** and **Discard** against a
  `waterline` v2 save, `hasMatch: true`, 4,078 bytes.
- **Zero console errors and zero exceptions** on every run.

### Three real defects pass 2 found by doing the D25 camera work
1. Pass 1's paraxial fit asked for 74% of frame width and **delivered 98.5%** — the table overflowed
   every edge. Now solved by projecting the board's four corners.
2. **Free-look was dead after every enemy turn**, because no sequence re-enabled it.
3. **`parkWide()` silently did nothing until a sequence had run**, so the title screen was a frozen
   boot-pose frame on a cold load. Same shape as D21 — a call that looks configured and is defeated
   by the rig's `posed` gate. My own pass-1 boot check missed it because I read the DOM and never
   probed the camera.

### C7 known gaps — the revisit list, ranked
1. **Portrait, and it is geometry rather than tuning.** The board occupies **13.7% of frame height**
   and the deckhead caps the camera at 1.73 m above the chart. Counts also worsen there: 170/139 at
   the settled landscape pose but **177–199 in portrait** — plan against 199, not 196. C7 judged the
   only real fix to be viewing the board along its *short* axis in portrait, a different composition
   it declined to attempt in a final pass. That is the right call and it is now Wave C's.
2. The hand-over from cinematic to play is a lerp, not a shot, and has only ever been seen as stills.
3. The presenter is still an adapter over C6's `present()`.
4. No sound anywhere in the game.

### C7 escalation E5, worth recording because it is a real trade
`present()` plays `bridge_return` only after *your* shot, so the enemy turn has no return beat. C7
eases the camera home itself — **right for the game, worse for the film**. C6 is closed, so this
stands as built.

## C5 — sim, AI, ladder: CLOSED (3 passes used)

Not blind-scored — gated on the soak, the ladder and an independent adversarial harness.
Examiner trajectory on the ten comparable sections: **15 broken/10 held → 6/36 → 1/43**.
Final overall, after the two must-fix items I applied by hand: **3 broken / 52 held**.

Gates all green and independently reproduced: purity (12 files), `sim.mjs 5000`
(302k shots, every invariant), ladder monotone-with-separation, rung curve monotone.
Seed oracle closed and verified with a positive control (0/120 cracked, 120/120 control).

## Known gaps (carried into phase 1, revisit later)

| # | Gap | Why it's deferred |
|---|---|---|
| G5b | `setBoard` in `PLACING` rewrites an already-emitted `place` event in place rather than appending, so a placement screen driven from the stream gets no event telling it the fleet moved | The fix is a new event type, which would churn the event vocabulary C6 and C7 are about to be written against. Cheaper after they land than before |
| K4 | Fleet-hiding makes Ghost's own placement ~10% *more* findable to a player who knows the algorithm — `avoidMap` is `coverageMap` and `staticPrior` is `coverage⁻¹`, so it hides exactly where its own opening looks first | Needs the two maps decoupled: a design change, not a tuning change. Hiding still works against a naive opponent |
| L1 | `auditAiModule()` lets 4/7 deliberate-evasion variants through | Accepted by design. It catches the three an agent writes *by accident*; regexes over source cannot catch an adversary, and `HANDOFF_SIM.md` says so plainly rather than overclaiming |

Fixed by hand after C5's passes ran out: the `replay()` `turn` getter (renderer-facing,
silently `undefined`, invisible to the soak); the placement-prior blend weight (`LEARN_W = 0.15`,
poisoning 12.0% → 5.2%, now *below* the 7.2% honest baseline); the audit's computed-specifier
guard, which only ever fired on a file with no literal imports at all.

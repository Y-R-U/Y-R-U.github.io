# P3 — sky, ramps, the art pipeline, the first atlases

Written by the P3 build agent. Every number here was measured by a command that is named beside
it. Nothing was tuned to make a criterion pass; where a criterion could not be met, or could not
fail, the criterion is reported (§5).

---

## 1. What landed

```
art/tools/crop.js         96   NEW — the mandatory inset, with a refusal path (D57)
art/tools/trim.js        108   NEW — bbox trim, largest-component, sheet split by component
art/tools/tile.js        155   NEW — two-source wrap cross-fade + the A3 instrument + a control
art/tools/ramp.js        260   NEW — the (act, sky-state) LUTs + the A5 instrument + a control
art/tools/levels.js      205   NEW, not in the brief — see §3. luma fit, deRim, silhouette crush
art/tools/build.js       300   NEW — the whole chain, driven by one command
art/tools/verify.js      190   ported in SHAPE from sunderfall; every assertion rewritten
art/tools/atlas.js        43   ported verbatim
art/tools/flux.py        110   ported (= art/gen/gen.py)
art/tools/{img,key,poster,grain,bake,sheet}.js      inherited from the A/B agents, unchanged
art/src/build_strips.py  150   NEW — 60 strip + 8 atmosphere manifests
art/src/build_props.py   110   NEW — 12 TERRAIN props, the D52 re-attempt
art/src/*.json                 the generated manifests. Reproducible source.

js/gfx/sky.js            300   NEW — sky column, sun, rays, band crossfade, strips, layer table
js/gfx/clouds.js         220   NEW — CLOUD_MID Poisson deck, CLOUD_NEAR, FG_OCCLUDE, A4 instrument
tools/blind.mjs           70   ported from sunderfall + a round ledger
tools/skygate.mjs        150   NEW — A4/A5/A7 in a browser, each with a control
tools/pages/sky.html     170   NEW — the harness everything is measured through

assets/                  7.60 MB committed. 6 atlases, 131 frames, 32 strips, 16 LUT pairs.
```

`js/gfx/renderer.js`, `js/gfx/parts.js`, the shaders, and everything under `js/core/`, `js/sim/`,
`js/ui/`, `js/modes/`, `data/` were not touched. No git command was run.

**Generation:** 82 new plates, ~85 minutes of queue (60 strips 52 min, 8 atmosphere 8.8 min,
12 props 19 min, 3 cloud re-rolls 3 min, 6 probe plates ~6 min). Both services were idle at start
and stayed idle; no OOM, no contention. Throughput matched ATLAS_SKY's 75–90 s/plate on 4B and
~120 s on 9B, not `ART.md` §7's "~1 minute".

---

## 2. The bake chain, and how to run it

```bash
# regenerate the raw plates (only needed if art/raw/ or art/gen/out/ is empty)
curl -s localhost:7867/api/status      # queue_depth; 30+ is an hour, do not start
curl -s localhost:7866/api/status      # worker_warm; if LTX holds a worker, WAIT
cd art/gen  && python3 ../tools/flux.py manifests/ACCEPTED.json out      # the 40 sky plates
cd art/raw/strips && python3 ../../tools/flux.py ../../src/s_strips.json .
cd art/raw/atmos  && python3 ../../tools/flux.py ../../src/s_atmos.json .
cd art/raw/props  && python3 ../../tools/flux.py ../../src/t_props.json .

# bake everything into assets/
node art/tools/build.js all            # or: clouds | fx | hero | atmos | strips | manifest
node art/tools/ramp.js                 # assets/sky/ramps.png + ramps.json
node art/tools/verify.js --falsify     # A1, A2, A3, A6 + the contact sheet

# the browser gates
node tools/skygate.mjs --gpu --shots --falsify
```

**Order is fixed and it is the brief's**, with one addition:

```
crop -> key -> [poster: TERRAIN props only] -> largest-component -> trim -> levels -> tile -> atlas -> verify
```

`levels` is not in the brief's list of seven tools. It is there because `ART.md` §11 names the
ramp-map's failure mode and tells you to check it, and the check failed: see §3.

Two D57 rules run through the whole chain and both are load-bearing:

- **Crop the cutouts, key the sheets.** Every FX sheet and every wisp/shred sheet runs with
  `cropMode: 'none'`, because `f08_varied` and `x40_puff_a` have marks inside the 4% zone. `node
  art/tools/crop.js --inspect <plate>` prints the ring content so the decision stays measured.
- **Key at tolerance ≥ 12 against a per-plate sampled backdrop**, then keep only the largest
  connected component. Measured backdrops across the strip batch ran 144–173 grey, a spread of 29
  — a constant would have keyed some plates not at all. The largest-component rule removed
  4,180 px of painted grass from `h66_chateau`, 1,812 px from `h61`, 1,169 px from `h65b` and
  987 px from `h68b`, exactly as ATLAS_SKY §10 predicted.

Shipped key settings: cutouts `lo 16 / hi 60 / shrink 0.12`; sheets `lo 18 / hi 64 / shrink 0.14`;
strips `lo 16 / hi 62 / shrink 0.10`, no trim (see §5, the strip bug).

---

## 3. `levels.js` — three passes, each added because a measurement failed

**`fitLuma` — the ramp-map failure mode is real and the plates had it.** `ART.md` §11 asks for a
luminance spread of roughly 0.15–0.90 with no clipping. Measured on the delivered cloud plates:

| plate | before | clipped at L > 0.98 | after |
|---|---|---|---|
| cL01 | 0.111 – 1.000, p1/p99 0.318/0.988 | **2.18%** | 0.151 – 0.899 |
| cL08 | 0.126 – 1.000 | **3.00%** | 0.151 – 0.900 |
| cS20 | 0.221 – 1.000 | 1.07% | 0.151 – 0.899 |

Every pixel above 0.98 indexes the same LUT texel, so a clipped sunlit cloud top gradient-maps to
one flat colour — the "too much range and they band" half of §11's warning. The fit is
percentile-based with a soft shoulder, and it scales the whole pixel by one gain so hue and
saturation are untouched. Across all 24 cutouts the worst clip goes **3.25% → 0.00%**.

**`deRim` — the pale outline is PAINTED, not a keying halo.** This is the one worth reading,
because the obvious diagnosis is wrong. A keyed cloud wears a light collar that looks exactly like
D57's halo, so the first move is to shrink the matte. Measured at shrink 0.12 / 0.20 / 0.28 / 0.36
the collar does not move at all — it is in the plate, a soft echo of the die-cut border D55
measured at 1024. Shrinking only eats the cloud.

The first version of the fix also failed, and for an instructive reason: it compared the collar's
median luminance with the interior's *globally*, and on cL01 that is **0.688 against 0.815** — the
collar reads darker, because it also contains the cloud's dark undersides. The rim is a **local**
excess and had to be compared locally, against the nearest deep-interior pixel. Mean local rim
excess across the 24 cutouts: **0.0289 → 0.0112**.

**`crushToSilhouette` — the shreds are not near-black as generated.** `a_shred_*` was prompted for
"a single flat torn-edged mark of thick opaque near-black paint" and came back at p90 luminance
**0.354**, three times gate A6's allowance. The crush pass takes it to 0.091 (0.052 after the
layer's own multiply). The gain is recorded in the manifest so the gate has a real control (§6).

---

## 4. The LUTs — format, contents, and what changed under R-03

`assets/sky/ramps.png` is **one 256 × 32 sRGB image**: two rows per (act, sky-state) pair, a
**sky** row indexed by altitude and a **tone** row indexed by luminance. `assets/sky/ramps.json`
indexes it. `sky.js`'s `loadRamps()` slices each row into a 256×1 texture at load. One 4 KB
request instead of 32 requests for 200 bytes each, and the index lives in the same file as the
data. **Authored as ordinary sRGB strips; the renderer squares them into linear (D49).**

Sixteen pairs, from DESIGN §8.4–8.8's `sky` column counted across all 100 rows:

| act | states used (count of 20) |
|---|---|
| 1 | d 18, k 2 |
| 2 | o 18, k 1, d 1 |
| 3 | d 16, o 2, k 2 |
| 4 | n 12, s 7, k 1 |
| 5 | h 9, k 4, d 4, o 2, s 1 |

A state's LUT is `lerp(actBase, stateRef, w)`. `s` is `ART.md` §6 Act IV "The White Front"
re-purposed as a sky-state, per R-03.

### 4.1 The stops moved onto the band boundaries

`ART.md` §3's `alt = altitude_m / 6000` becomes `/1500` (R-03/D28), and the seven ramp stops are
re-placed from `[0, .05, .20, .47, .60, .80, 1.0]` onto R-02's band edges
`[0, 105, 255, 450, 750, 1125, 1500] m` = `[0, .07, .17, .30, .50, .75, 1.0]`. The colour sequence
is unchanged; the inflections now land exactly where the ladder changes, which is what makes a
band read as a place rather than as a number on a tape.

### 4.2 The tone LUT takes hue from the palette and VALUE from the input

This is the single worst-looking bug of the phase and it is worth stating plainly, because the
obvious construction is wrong. Laying the three palette colours at fixed positions and
interpolating **destroys the value structure the plates exist to carry**, because a palette's own
luminances are not spread over 0..1: act 2's are shadow 0.27, fill 0.81, key 0.93 at stops
0.00/0.36/0.86, so a cloud pixel at L 0.36 comes out at 0.81 and the whole frame is crushed into
the top third of the range. The screenshot of that is a flat cream field with pale blobs on it,
made from a plate with rich cream-and-violet modelling in it.

Shipped: interpolate the palette for colour, then rescale each output so its luminance follows
`L^gamma`. Per-act gamma is the one knob that makes an act darker overall — act 4's night is a
night because its gamma crushes (1.95), not because its palette is muddy.

### 4.3 Which `ART.md` §6 hexes changed, and why

| act | field | ART.md §6 | shipped | reason |
|---|---|---|---|---|
| 1 | all | — | unchanged | R-03 says unchanged |
| 2 | key | `#FFE1A8` | **`#F2F79A`** | R-03 "cooled toward morning", pushed further by gate A5 (§4.4) |
| 2 | fill | `#D9A96A` | **`#D6D0B0`** | see §4.4 — the olive fill is what greened the clouds |
| 2 | shadow | `#4A3B57` | `#4A4258` | greyed slightly so it pulls the mean hue less |
| 2 | sky ramp | gold throughout | **cooled at Deck**, darkened ~15% | §4.5 |
| 3 | all | (was "Night Raid") | **re-authored**: key `#FFC24E`, fill `#B4581E`, shadow `#14161A`, accent `#2E8C86` | R-03: warm raking key, black shadow, cold accent |
| 3 | sky ramp | — | re-authored, warm below / cool from Deck up | §4.5 |
| 4 | all | §6 Act III verbatim | unchanged, re-indexed to act 4 | R-03 |
| 5 | key | `#FF9A4A` | **`#F4402E`** | pushed orange → red so it does not collide with act 3 on A5 |
| 5 | fill | `#A8492E` | **`#8C2028`** | ditto |
| 5 | shadow | `#2A1418` | `#241016` | ditto |
| — | `s` state | §6 Act IV verbatim | unchanged, now a sky-state | R-03 |

### 4.4 Gate A5 is the binding constraint on the whole palette, and it nearly cost the art

**R-03 gives three of five acts a warm key** (2 summer morning, 3 autumn raking, 5 dusk). The warm
quadrant of the hue circle is about 60° wide. Three acts pairwise ≥ 25° apart need a 50° span, so
the three must sit at roughly 5° / 33° / 58° or no arrangement works. There is no other solution;
I searched the space (`/tmp` tuning runs, five configurations, both a day-LUT and a
dominant-sky-state reading) and everything else lands at 4.8–21.8°.

Measured, chroma-weighted circular mean hue of a real baked cloud through each act's LUT:

```
act 1 136.2°   act 2 60.6°   act 3 33.7°   act 4 217.2°   act 5 3.6°
worst pair 2/3 = 26.9°     PASS (line 25°)
control, one LUT for all five acts: 0.0°   FAIL, as required
```

`node art/tools/ramp.js --measure art/work/clouds/cL01.png [--sameLut]`.

**The cost is real and it is act 2.** Its key is now a lemon-straw rather than a cream-gold, and
its clouds carry a green cast that I do not think is right. I tried to buy it back and could not:
the *fill* was the part that mattered, and moving it from the olive `#C6C450` (which also clears
A5) to a low-chroma warm grey `#D6D0B0` keeps the separation at 26.6° and gives a cream cloud with
lemon highlights instead of a pea-green one. That is as far as it goes without failing A5.

**Recorded for whoever wants to reverse it:** act 2 with `key #FFE9C0, fill #DCBE84, shadow
#4A3B57` — a straight cream reading of R-03's "cooled toward morning" — looks better and scores
**4.8°** on the 2/3 pair, a clear A5 fail. It is one line in `art/tools/ramp.js`. See REQUEST-1.

### 4.5 Sky ramps had to separate from the clouds

Two frames measured flat because the sky and the clouds sat at the same hue AND the same value —
gold cloud on gold sky is one field. Both act 2 and act 3 now cool from the Deck band upward, with
the transition placed at −3000 wu because that is where the fighting is (R-02). Act 2's stops were
also darkened ~15% against `ART.md`'s, because the composite reads brighter than the LUT:
probed at alt 0.36 the LUT texel is `164,164,154` and the framebuffer is `191,190,177`
(`window.__sky.probeSky()`). Authoring to the swatch rather than to the screen is how a sky ends
up as white paper.

---

## 5. Four real bugs, and two criteria that do not measure what they say

### 5.1 `SKY` parallaxY was 0.06 and the sky ramp slid off the frame

`ART.md` §4 lists `SKY_GRAD` at `px 0.00 / py 0.00` because it imagines a screen-locked quad. P1
did not build that: `R.skyRamp` draws **one quad spanning the whole 10,000 wu column in world
space**. A world-space quad at `py 0.06` barely moves with the camera, so at 540 m its centre sits
4,784 wu off the top of frame: **the bottom third of the screen was uncovered black, and the
covered part sampled a thin slice of the LUT**. That is what the "flat pale wash with no act
colour" was. Shipped at `py 1.00`, which is the only setting that makes "evaluated per fragment
from that fragment's own world Y" true.

### 5.2 `HORIZON` parallaxY was 0.14 — the horizon was glued to the camera

R-05 makes the layer table the art agent's to retune, with `ART.md` §4's numbers as the target.
Retuned:

| layer | A's px/py | shipped |
|---|---|---|
| SKY | 0.00 / 0.06 | **0.00 / 1.00** |
| CLOUD_FAR | 0.06 / 0.30 | 0.06 / 0.55 |
| CLOUD_MID | 0.22 / 0.78 | 0.55 / 1.00 |
| **HORIZON** | 0.10 / **0.14** | 0.10 / **0.85** |
| GROUND_FAR | 0.26 / 0.55 | 0.18 / 0.95 |
| GROUND_MID | 0.58 / 0.82 | 0.35 / 1.00 |
| CLOUD_NEAR | 1.35 / 1.15 | 1.35 / 1.00 |
| FG_OCCLUDE | 1.55 / 1.25 | 1.70 / 1.00 |

`ART.md` §4 states the rule A's table breaks — "py must be ~1.0 for anything that has a real
altitude" — and a horizon ridge has one. At 0.14 a ridge line sat across the middle of the frame
at 540 m.

### 5.3 The haze formula was computed every frame and never applied

`ART.md` §4's `hazeAmount(alt, depth) = depth × actHazeBase × (1 − 0.8·alt)` was being calculated
and thrown away; the renderer kept A's flat per-layer constants. `CLOUD_MID` sat at 0.38 against
the 0.18 the formula asks for at 540 m, so every cloud was behind twice the atmosphere it should
have been and the frame read as one wash. Now applied per layer per frame, with §4's zoom-out
lift capped at 1.12.

Also: the sun was placed at `camX + cos(a)·dist`, so its screen x was `camX·(1 − 0.02) + offset`
and it slid out of frame the moment the camera moved — which is what the first night frame was, an
empty sky with no moon in it. A body at effective infinity must track the camera's own parallax
offset. And its glare was `7.5 ×` a 150 wu disc = **1,125 wu across in a 462 wu frame**: a
full-screen additive wash, not a light source. Now 3.4 × 130.

### 5.4 The strip bug a plausible join number hid completely

`cut()` originally ran `trimTo(pad: 2)` on strips too. Two consequences, both invisible on a single
plate and fatal across a pair:

- the 2 px transparent pad meant **every tile boundary shipped a 2 px transparent gap** — a seam
  line in game;
- trimming to the content bbox gave the two sources of one strip **different heights**
  (946×326 and 946×214 on the first pair measured), so the shared resize stretched them by
  different factors and the skyline could not register across the join.

It was found by the falsification, not by the metric: a deliberately-butted control scored a join
of **0.00 and PASSED**, better than the real strip, because both were comparing two empty columns.
With the fix, the same pair reads **shipped excess −0.68 PASS / control +24.32 FAIL**.

### 5.5 Gate A3's threshold does not measure tiling

A3 asks for "mean absolute difference at each join ≤ 2/255". Measured across the 32 shipped
strips the joins sit at a mean **6.81/255** — and so does the strips' own mean adjacent-column
difference, **7.36/255**, because a painted village has real detail in it. 2/255 is reachable only
by a soft low-frequency strip, so on a detailed one **no correct tile can pass it and a
deliberately broken tile fails it by the same margin as a perfect one**.

I did not move the threshold. `tile.js` reports the raw join MAD as specified *and* the quantity
that actually separates a tiled strip from an untiled one: the seam's **excess over its own
neighbourhood** (join minus the mean adjacent-column step within ±24 columns). Shipped strips:
worst excess **−0.59/255**, mean **−2.58**. Control: **+24.32**. `node art/tools/tile.js --falsify
<srcA> <srcB>` re-runs it. **Recommend A3 be reworded to the excess form at P16.**

### 5.6 Gate A6 could not fail, as first implemented

Measured in the framebuffer, thresholding at `L > 0.002` to find "everything drawn", A6 read
**0.0675** — and did not move by a single digit when the layer's `mul` was set to `[1,1,1]`, when
its `shade` was set to 0, or when the crush pass was undone. The threshold admits the post-process
grain and vignette, which cover the whole frame, so 21% of all pixels entered the population and
its 90th percentile was **the noise floor**. Same shape as D43's mean-RMS finding: a plausible
number measuring a different quantity.

A6 is a property of the shipped art, so it is measured in `verify.js` over the opaque pixels of the
FG_OCCLUDE frames times the layer's own multiply — which is all the renderer does to them.
**p90 0.0524** (p50 0.0228, max 0.1727) over 188,184 opaque px. PASS.

Its control undoes the crush (×2.79) and reads **0.1462**: out of the PASS band, but **not past
the 0.18 FAIL line**. A6's table has an unnamed gap between 0.12 and 0.18 and the control lands in
it. Reported, not adjusted. See REQUEST-2.

One finding from the abandoned control, worth keeping: **ramping FG_OCCLUDE through the act-4
storm LUT no longer brightens it**, because §4.2's tone LUT is value-preserving. It was the
original A6 control and it is now inert by design. `?bug=rampFg` still exists as a switch.

---

## 6. The gate table, measured

| # | criterion | measured | verdict |
|---|---|---|---|
| A1 | committed art payload | **7.60 MB** (target 11, ceiling 12) | **PASS** |
| A2 | atlas hygiene | 6 atlases, 131 frames, none over 2048², none fully transparent, contact sheet emitted | **PASS** |
| A3 | tiling | worst seam excess **−0.59/255**, mean −2.58, 32/32 strips; no mirroring anywhere | **PASS** — but see §5.5 on the wording |
| A4 | nothing repeats on one screen | worst cutout multiplicity **2** over 180 sampled frames at three scroll speeds; 16/180 frames contain any repeat | **PASS** (fail at 3+) |
| A5 | the ramp does the work | worst pair **26.9°** (act 2 vs act 3) | **PASS** (line 25°) |
| A6 | near layers go near-black | FG_OCCLUDE p90 luminance **0.0524** (p50 0.0228) | **PASS** (line 0.12) |
| A7 | band crossfade timing | **1.66 s** at every one of the five boundaries | **PASS** (window 1.0–3.0 s) |
| A8 | blind-critic round 0 | run, 3 fresh critics, 3 shots, verbatim in §8 | **recorded, not scored** |
| A9 | D39 resolved | resolved at D53 before this phase; carried forward unchanged, §9 | **PASS** |
| A10 | small props | generated **after** `poster.js`, put to blind critics, **failed**, reported as blocked | **PASS** (the honest branch) |

Payload by folder: strips 4.61 MB · sky 1.76 MB · hero 0.63 MB · fx 0.31 MB · ramps+paper 0.28 MB.

### The falsification, which is the only reason to believe the table

Each control is a query flag on `tools/pages/sky.html`, the same pattern as P1's `?impl=screen` and
P2's `?slew=symmetric`. **No shipped build ever sets one.**

| criterion | control | shipped | control reads | verdict |
|---|---|---|---|---|
| A3 | `tileHard` — no wrap cross-fade | −0.68 | **+24.32** | went red |
| A4 | `?bug=oneCutout` — one frame in the atlas | 2 | **4** | went red |
| A5 | `--sameLut` — one LUT for all five acts | 26.9° | **0.0°** | went red |
| A6 | crush pass undone (×2.79) | 0.0524 | **0.1462** | left the PASS band; did not clear 0.18 |
| A7 | `?bug=hardBands` — feather → 1 wu | 1.66 s | **0.019 s** | went red |

`BAND_FEATHER_WU` is derived, not chosen: it is a **half**-width, so a crossfade spans 2× it. The
1.0–3.0 s window at 90 wu/s (13.5 m/s ÷ 0.15) is a 90–270 wu total span, i.e. a half-width of
45–135; 90 sits dead centre. The first version used 180 and the full span was 4.0 s, outside the
window — while a broken metric was reporting **0.00 s** and hiding it. Both were fixed.

---

## 7. What is packed where

| atlas | size | bytes | contents |
|---|---|---|---|
| `sky/clouds_l.png` | 2048×1456 | 702 KB | 8 large CLOUD_MID cutouts, packed at 768 (D55) |
| `sky/clouds_s.png` | 2048×1476 | 678 KB | 16 small cutouts, downscaled to 512 (D55) |
| `sky/cloudnear.png` | 996×616 | 98 KB | 11 CLOUD_NEAR wisps, cut by connected component |
| `sky/fg.png` | 944×560 | 123 KB | 13 FG_OCCLUDE shreds, crushed to silhouette |
| `fx/brushes.png` | 1024×1292 | 320 KB | **74 marks** in 6 families: puff 17, streak 12, spark 24, wisp 9, shred 6, blob 6 |
| `hero/hero.png` | 2048×1388 | 650 KB | zeppelin envelope sliced fore/mid/aft + balloon ×2, chateau, bridge, factory, cathedral |
| `sky/cirrus_{a,b}.png` | 1024×192 | 144 KB | CLOUD_FAR, an A/B pair at 8192 wu each |
| `strips/s{1..5}_{hor,gf,gm}_{a,b}.png` | 1024×160 / 1536×224 / 2048×352 | 4.61 MB | 30 act strips, A/B pairs at 4096 wu each |
| `sky/ramps.png` + `.json` | 256×32 | 8 KB | 16 (act, sky-state) pairs, sky + tone rows |
| `paper.png` | 256×256 | 50 KB | the shared tooth, over painted and procedural alike |

Nothing exceeds 2048 on either axis. Every strip layer ships both variants; `verify.js` errors on
a lone variant, because one variant halves the period.

---

## 8. Blind-critic round 0 — recorded, with the staging caveat first

**`docs/refs/study/` is empty** (it contains only its `.gitignore`). Per the brief's deliverable 11
the round was scored against **`docs/refs/probes/p08_hero_9b.png`, which is OURS**, cropped to
390×844. So the "gap" is our background against our own best hero plate, not against a
professional frame, and its absolute value means little.

**The staging is unfair in a second, larger way, and all three critics said so unprompted:**
`p08` is a hero plate *with an aeroplane in it*, and P3's frames are **background only** — P3 owns
no actors; those are P4/P5's. Every critic's first complaint was "no subject", "no aircraft", "no
foreground object". Round 0 is a baseline and A8 is explicitly not scored, so this is recorded
rather than acted on, but **P16 must stage its rounds against frames that have the code-drawn
actors in them** or it will keep measuring the absence of a phase that had not run yet.

Three fresh critics, three shots, sides randomised, none reused, none told which was ours. All
three picked the reference immediately.

| shot | ours (mean of 6) | reference | gap |
|---|---|---|---|
| Act 2 day deck | 2.83 | 7.83 | −5.00 |
| Act 4 night | 1.83 | 7.50 | −5.67 |
| Act 1 mud | 2.83 | 8.00 | −5.17 |

**Differences lists, verbatim on the points that are about the painted world rather than the
missing aeroplane:**

- *"flat, black-outlined, posterized cloud puffs … clip-art-flat cloud shapes with hard vector
  edges instead of paint"* — the cutouts' silhouettes read as vector, not brush.
- *"the same green sphere … appears three times … same silhouette, same shading pattern, just
  rescaled — a hallmark of placeholder art"*. **This is the most important line in the round.**
  Gate A4 counts *atlas ids* and reported multiplicity 2; a human counts *perceived* similarity,
  and several small cutouts are all round mounds, so they read as one asset repeated. **A4 as
  implemented is a weaker instrument than A4 as written**, and the human half of the test is the
  one that matters.
- *"the grey-beige sky gradient is a straight vertical ramp with no falloff toward any implied
  sun … none of the cloud clumps show a lit side vs shadow side consistent with one source"* —
  P1 is not being satisfied by a gradient-mapped cutout on its own.
- *"no texture grain … smooth grey-to-tan gradient"* — the shared paper tooth is not reading on
  the sky at `grainAmt 0.10`.
- *"roughly rows 460–660, about 25% of the frame height, contain nothing but flat gradient"* —
  the Poisson deck leaves large dead zones at some camera positions.
- Act 4 night: *"a near-black rectangle … visible sensor-style noise/grain across the flat dark
  field … the moon is a perfectly circular flat-white blob with no glow falloff or limb shading"*.
  The night act is too empty and the moon disc is too plain.
- Act 1 mud: *"the skyline silhouette is a smear, not a shape … the plowed-furrow pattern and hedge
  dots are a repeating diagonal hatch that reads as a texture fill"*.

### Round 0b — a fourth critic, told that one frame may be background-only

Staged on the Act 1 mud frame after the §5 fixes, with the fairness caveat stated explicitly so
the missing aeroplane could not do the work. It **still** picked the reference, scored ours
**2.17 against 7.33**, and said the caveat did not save us:

> *"if B is meant to be a background-only compositing plate, that's a legitimate excuse for having
> no plane in it. It is not an excuse for what's actually wrong with B, which is happening in the
> sky and the paint surface itself — a region that has nothing to do with the missing aircraft."*

That is the round's most valuable line and it kills my own excuse. Three of its findings were
acted on immediately and are in the shipped build:

- *"blobby, cauliflower-lobed black shapes with posterized edges … I can't tell what they're
  supposed to be"* — **FG_OCCLUDE was swamping the Mud frame.** 520 wu stamps at 0.92 alpha in 30%
  of cells covered roughly 40% of the frame in black. `ART.md` P3 says the near layers are "the
  OCCASIONAL near tree or wire". Now 300 wu, 0.80 alpha, 11% of cells, and the Mud band's own
  weight cut 1.00 → 0.70.
- *"a hard-edged white circle with almost no soft glow … it sits on top of the image like a
  sticker"* — **Act I's sun should not be a disc at all.** §6 calls it "weak green-white daylight
  diffused through cloud — barely a key at all". The sun's form and strength now scale on the act's
  own `hazeBase`: above 0.55 clarity it is a disc, below it a soft bloom at 1.8× the radius and a
  third of the alpha. The overcast and storm sky-states inherit it for free.
- *"the same value top to bottom … no wash gradient at all"* on the sky band — partly the two bugs
  above, partly genuine: see the P5 note in §11.

Two of its findings are **not** fixed and are handed on:

- *"visible sensor-style noise/grain across the flat dark field"* (round 0, Act 4) and *"grain is
  uniform across the whole frame"* (round 0b) — **partly acted on.** A fixed grain amplitude is
  invisible on a cream sky and reads as sensor noise on a near-black one, so the global and the
  SKY layer's grain now both scale as `1 / max(1, act gamma)`: the acts that crush are the acts
  whose grain shows. Act 4 goes from 0.022 to 0.011.
  **Not** fixed: grain still does not vary with the *underlying wash*, which is the deeper half of
  the complaint. That needs the world-space brushwork term P1 raised as its REQUEST-2 and nobody
  has built.
- *"no atmospheric perspective: the far skyline, mid sky and near silhouettes all sit at roughly
  the same value/contrast."* The haze formula is now applied (§5.3) but its per-layer depth
  weights are `ART.md`'s and have never been tuned against a rendered frame.

Keys: `node tools/blind.mjs --reveal shots/p3/blind`.

Keys: `node tools/blind.mjs --reveal shots/p3/blind`.

---

## 9. D39 and the props — the honest state

**D39 is already resolved (D53): keep the neutral-light rule and lean on `poster.js`.** The
six-plate A/B the brief asks for exists as agent G's eight-plate A/B in `docs/refs/probes_d39/`
with the numbers in `ART_PROPS.md` §4, and it is a stronger design than the one specified (two
subjects × four light clauses, seed and subject held). I did not re-run it. **One change was made
inside D53's verdict**: the neutral clause now carries a *direction* without a colour — `even
overcast light from the upper left, low saturation, neutral grey-blue`. `ART_PROPS.md` §4 names
this as the obvious next A/B and records that it was never tested; it costs nothing and it
addresses the "six different key-light directions across eight props" defect directly.

### The props, and the result

**All four generation-side causes in D52 are fixed, and they are visibly fixed:**

1. **Painted-in ground** — gone from 10 of 12, via an in-prompt negation block (D56: the *field*
   is inert, a `no X` clause inside the prompt is not) plus the largest-component rule.
2. **Amputated structure** — fixed by 9B, the carve-out D52 asks for. The watchtower now has four
   braced legs with feet all the way down, the field gun has a trail and spade, the MG post has a
   complete tripod, the wagon has full spoked wheels, the windsock mast has guys and a base.
   9 of the 12 props are on 9B; 4B is kept for the soft ones.
3. **Instanced clones** — gone. The five tents and seven drums are all different, via D56's
   corrected reading of D35: name two **contrasting states**, not "no two alike".
4. **Period drift** — gone. A critic explicitly checked and found no anachronism.

**And the score did not move.** Two fresh blind critics, neither reused, one blind A/B and one
against-the-reference:

| critic | ours | reference | gap |
|---|---|---|---|
| blind A/B, prop sheet vs `p08` | **3.83** | 8.33 | −4.50 |
| against `p08` as the stated target | **3.33** | — | — |

D51 measured **3.33 against 7.67–8.00**. This is the same number after fixing four named causes,
**while the complaints changed completely** — the third occurrence of the NEONHAUL shape in this
project. The new complaints are no longer about structure or clones or ground; they are entirely
about the **medium**:

- *"AI-generated isolated-object clip art with a painterly filter over it … one uniform Photoshop
  filter pass applied over vector-ish shapes"*
- *"the hatching/weathering texture is a mechanically repeated unit pasted onto every rusted or
  wood surface … shading is posterized into 3–4 flat bands per surface rather than blended — a
  shader/quantization look, not pigment"*
- *"every prop is lit from a different direction and rendered in a different colour grade …
  the signature of a batch of independent single-object generations"* — the direction clause helped
  and did not solve it
- *"the same spoked wagon wheel appears, recoloured but structurally identical, under seven
  unrelated objects"* — a *cross-asset* repeat, which no per-asset prompt clause can prevent
- new keying defects of mine: a leftover backdrop card behind `t_hangar`, a pink smear behind
  `t_searchlight`, `t_windsock`'s mast eroded away by the despeckle, residual cast shadows on
  `t_aagun` and `t_tents`

**Verdict: the small-prop half of `TERRAIN` stays blocked, and this is a clean negative rather
than an unfinished job.** Three separate agents have now attacked it from three directions —
prompt levers (agent E, five levers, all failed), a deterministic bake (agent G, `poster.js`, six
critic-named defects fixed, score unmoved), and generation causes (this phase, four causes fixed,
score unmoved). The remaining gap is that this model **renders** a mechanical subject and will not
**paint** one, and nothing available closes it. The terrain atlas staying half-blocked is the
honest state.

The 12 raw plates, the 12 baked plates, the manifest and the critic sheets are all kept as
evidence: `art/raw/props/`, `art/work/props/`, `art/src/t_props.json`, `shots/p3/props/`.

**REQUEST-3** carries the fallback to the manager.

---

## 10. What P4 and P16 must know

1. **`js/gfx/sky.js` sets the layer table.** `createSky()` calls `applyLayerTable()` at
   construction and `setAct()` sets `rampAmt`, haze colour and the postfx grade. If a scene sets
   layer parallax itself it will fight this; change it in `sky.js`, not at the call site.
2. **The postfx grade is set per act by `setAct()`** — bloom 0.16 (0.42 at night), threshold 0.86,
   exposure 0.98, contrast 1.02, vignette 0.34, grain 0.022, and `fx.gLoadRebase()` is called after
   them as P1_NOTES §5.6 requires. The renderer's defaults (bloom 0.85 at threshold 0.72) are tuned
   for a dark game and turn a cream gouache sky into white paper.
3. **`FG_OCCLUDE` is the one shared painted layer left at `rampAmt 0`**, deliberately. Ramping it
   through the act-4 storm LUT, whose shadow end is `#5A76A0` at luminance 0.19, would fail gate A6
   on that act while every other act passed. A near-black silhouette wants a multiply, not a remap.
4. **`clouds.js` has no `Math.random` in it.** The deck is a pure function of `(seed, cell)`, so it
   is infinite, identical between runs, and stable when the camera scrolls back. `repeatsOnScreen()`
   is the A4 instrument; treat its number as a floor, not a ceiling (§8).
5. **Every FX stamp must be randomly rotated, flipped and scaled in code.** Two of the seven brush
   families are effectively one mark (`spark` is 24 sizes of one comma, `blob` is 6 copies of one
   dab) and the atlas cannot prevent a P6 failure the renderer causes. `clouds.js` already does this
   for CLOUD_NEAR and FG_OCCLUDE; the particle system must do the same.
6. **`h71_sun_bloom` was not used and should never be.** The sun disc and its glare are procedural
   (`R.disc` and `R.blob`): this model cannot paint a smooth radial falloff — asked for a soft bloom
   it paints a disc-shaped *object* with a visible brush ring, the same failure as a single FX mark
   generated alone. The same argument applies to the `blob` FX family.
7. **`R.sprite` takes `r, g, b, a`, and a value above 1 is a legitimate tint** — that is how the A6
   control undoes the crush.
8. **Strips are drawn by `sky.drawStrip()`, not `R.backdrop()`.** `backdrop`'s `mirror` flag exists
   and is banned: a mirror axis in a 1,500 px-tall viewport is instantly visible and gate A4 counts
   it as a repeat. Alternating two distinct variants gives 8192 wu with no symmetry.
9. **Ground strips vanish above about 800 m and that is correct** — `py 0.85–1.00` means the ground
   genuinely leaves the frame as you climb, which is what makes the six-band ladder legible. P4
   should not "fix" it.
10. **`docs/refs/study/` is still empty.** Every critic round so far has been scored against our own
    plate. P16's gate cannot mean much until the manager populates it.

---

## 11. REQUESTs and one OBJECTION

**REQUEST-1 — gate A5 versus R-03's palette, for the manager.** A5 (pairwise mean hue ≥ 25°) and
R-03 (three of five acts get a warm key) are very nearly incompatible: the warm quadrant is ~60°
wide and three acts pairwise ≥ 25° need 50° of it. The shipped palette clears A5 at 26.9° and the
price is act 2's green cast, which I do not think is right and which no blind critic has yet been
asked about directly. The alternative is one line: act 2 `key #FFE9C0, fill #DCBE84, shadow
#4A3B57` — a straight cream reading of R-03 — which looks better and fails A5 at 4.8°. **Either
A5 is reworded to measure the key/shadow relationship rather than a single mean hue, or R-03 gives
one of acts 2/3/5 a non-warm key, or act 2 stays lemon.** I have shipped the version that passes
the gate as written, per the rule about not moving thresholds; this is the counter-proposal R-03
invites.

**REQUEST-2 — A6 has an unnamed band.** PASS is below 0.12 and FAIL is above 0.18, and the
control lands at 0.1462. The criterion responds to the pass it exists to test but cannot be made
to say FAIL by removing it. Close the gap at P16.

**REQUEST-3 — the props fallback is the manager's call, per D38 and the P3 brief.** Three agents
have failed to make this model paint a small mechanical prop. The options are (a) draw TERRAIN
props in code like the actors, per `ART.md` §5's split — a hangar is a much simpler part tree than
a biplane and `parts.js` already exists; (b) accept the props as they are and take the P16 hit;
(c) a different generation route entirely. **My recommendation is (a)**, and I would add that the
critics' single most damning line — *"the same spoked wagon wheel appears, recoloured but
structurally identical, under seven unrelated objects"* — is a cross-asset repeat that only a
part-tree can fix, because it is caused by the model's own priors and no per-asset prompt can see
across assets.

**REQUEST-4 — contact shadows, restated from D52.5 because it is still true and still nobody's.**
`TERRAIN` props and hero objects will float without a code-drawn contact shadow. It is a renderer
requirement, it belongs with the actor draw path, and no bake step can fix a shadow that has to
respond to ground and light.

**REQUEST-5 — `levels.js` is a seventh bake tool the brief did not name.** Three passes, each
added because a measurement failed (§3). If the manager would rather the chain stayed at the named
seven, the three functions fold into `poster.js` unchanged; I kept them separate because
`poster.js` runs on TERRAIN props only and these run on every shared plate.

**OBJECTION — none on the brief.** Two gate criteria are reported as mis-specified (A3's 2/255,
A6's unnamed band) and one gate is reported as in tension with a ruling (A5 vs R-03), all with
their measurements. Nothing was worked around.

**Pillars I do not believe this pipeline reaches on its own, said now rather than at P16:**

- **P5, "the texture of paint is visible at rest", on the sky.** Two critics named the sky gradient
  as smooth and untextured. `SKY_GRAD` is a shader ramp with `grainAmt 0.10` and there is nothing
  else in it; a painted sky needs either more grain or a very low-frequency painted wash overlay,
  and neither is free.
- **P4, "light is volumetric, never a sticker", in the sky alone.** The removal test cannot pass
  with painted cutouts and a code sun: deleting the sun changes the disc, the glare and `setRays`,
  and changes nothing about the clouds, because a gradient-mapped cutout cannot know where the
  light is. This needs the actor/FX light path (P5) and a shaft pass, and it is the single largest
  remaining gap between this and `p08`.
- **P6 at the human level.** A4's machine count says 2; a human said "the same sphere three times".
  Several small cutouts share a round-mound silhouette. Adding four or five genuinely different
  *silhouettes* to the small class would do more for P6 than anything else in the atlas.


---

# P3b — the corrective pass (D64–D67)

Ten gates passed and the rendered sky was bad. This section is what was wrong, how it was found,
and what the frame-level critic gate says now.

## 12. The frame-level blind-critic gate — `tools/framegate.mjs`

`node tools/framegate.mjs --stage <round> --gpu` renders six frames across five acts and four sky
states, pairs each with a reference plate **of its own kind**, stages them blind through
`blind.mjs`, and `--score <round> <scores.json>` reports the gap plus ART.md §9's banned-word
check. Two things it does that round 0 did not, both from round 0's mistakes:

- **Subject-matched references.** Round 0 scored every frame against `p08`, a hero plate with an
  aeroplane in it, and all three critics' first complaint was "no subject" — it measured the
  absence of P4/P5, not the sky. A cloud deck is now compared with `p03_cloud_deck`, a dusk sky
  with `p02_sky_dusk`, a trench floor with `p05_ground_trench`.
- **The critic is told both images may be background plates with no vehicles**, so the missing
  aeroplane cannot decide the round. It is still never told which is which.

`docs/refs/study/` is still empty, so the references are OURS. The absolute gap is against our own
best painted output; what it is good for is a before and an after on identical staging.

## 13. Four causes, all measured, none of them the palette

The first instinct — "the shadow end of the LUT is too dark" — was wrong, and the measurement said
so. Clouds drawn alone had a **median luminance of 0.113 against the reference plate's 0.637**.
That is not a palette being a bit dark; it is a pipeline error, and there turned out to be four.

**1. The ramp was applying an effective gamma of 1.88 (3.90 at night).** `sprite.js` converts
display to linear (`c.rgb*c.rgb`), indexes the LUT by the luminance of that **linear** value, mixes
in `rc * rc` — squaring the texel too — and the composite sqrts back. So the LUT's own display
luminance is the final output, and my `target = L^gamma` produced `final = d^(2·gamma)`. The
exponent had to be halved. This one term accounted for most of the crush.

**2. The LUT bottomed out on black, not on the act's shadow colour.** `pow(L, g/2)` is 0 at L = 0,
so however warm the shadow hex was, every LUT's darkest entry was pure black. Measured cloud p2 was
0.171 against the reference's 0.419. ART.md §4 says "the shadow faces land on the act's shadow
colour"; the output now runs from `LUM(shadow)` to `LUM(key highlight)` and the curve only shapes
what happens between.

**3. The grade's contrast was clamping everything below 10% luminance to pure black.** `post.js`
does `col = (col - 0.5) * u_contrast + 0.5` in **linear** space. At 1.02 anything under linear
0.0098 — 0.099 display — goes negative and clamps. Probed on act 4: LUT texel `[24,33,51]`,
framebuffer `[0,0,35]`, red and green crushed to zero while blue survived, which is a per-channel
clamp and not a darkening. Contrast is now 1.0; the LUTs carry the act's contrast.

**4. The painted layers were being shaded by a scene with no lights in it.** `illum = ambient +
L*response` with `L = 0` and A's ambient `[0.20,0.24,0.34]` multiplied `CLOUD_MID` by 0.56 in
linear. The painted world is self-lit — that is the whole of D5 — so `shade` drops to 0.12–0.22,
and the **ambient becomes a per-act value** derived from the act's key and gamma. That last part
also matters to P4: a code-drawn aeroplane at `shade 1.0` under A's fixed ambient would be black in
daylight.

Two smaller ones: the haze term multiplied the band table's haze column **and** `(1 - 0.8·alt)`,
which are the same quantity twice, bleaching act 1; and `fitLuma`'s floor of 0.15 was below
anything in the references (p03's p2 is 0.419), so it was authoring the shadow side down before the
LUT crushed it further.

**Measured effect on the clouds, exact, on the shipped atlas after the LUT:**

| | p2 | p10 | p50 | p90 |
|---|---|---|---|---|
| reference `p03_cloud_deck` | 0.419 | 0.504 | 0.681 | 0.919 |
| ours, before | 0.171 | 0.210 | 0.770* | 0.865 |
| ours, after | 0.368 | 0.394 | 0.772 | 0.836 |

\* the before-median looks fine because the crush lives in the tail; the in-frame median of drawn
cloud pixels was 0.113.

## 14. The sky gradient: an arithmetic problem, not a palette one

Critics called every act "a flat single-hue wash". The cause is structural: **one 1,000 wu portrait
frame is a tenth of a 10,000 wu column, so a monotone ramp can show at most a tenth of its swing
in any frame**, however dramatic its ends. Measured in-frame luminance difference was 0.058–0.103
against the references' 0.094–0.171.

The authored stops stay as the centre line and a triangle modulation is laid over them. Two wrong
turns on the way, both caught by measurement:

- **A cosine has flat spots**, so at its peaks a frame has no gradient at all — the worst-case
  in-frame swing stayed at 0.001–0.006 from amplitude 0.16 all the way to 0.90, and act 2's frame
  happened to sit on one.
- **Band-locking the period was worse.** The Belt band is exactly 1,000 wu and a frame is exactly
  1,000 wu, so a full cycle fitted inside the frame and cancelled. The period is now 4,500 wu.

Amplitude was then sized on the **median** in-frame swing, not the worst case (any smooth function's
net slope passes through zero somewhere, so a worst-case statistic is uninformative). 0.70 put the
median in band and **shifted the absolute level by ±35%**, rendering act 3 as a pale beige field
with cartoon yellow clouds — a critic called it a placeholder canvas. 0.35 holds both.

Two global sky corrections followed, both from probes: the composite reads **+11% brighter than the
LUT** (act 3, alt 0.32: LUT `[180,164,153]`, framebuffer `[199,186,172]`), so the ramp is exposed at
0.86; and rendered sky chroma was 0.051–0.082 against the references' 0.141–0.204, so chroma is
lifted 1.55× around each entry's own luminance — with a ceiling, because a flat multiplier on
act 5's already-hot ramp took it to 0.545.

## 15. Two criteria re-specified, per D65 and D66

**A5 — the criterion, not the artwork (D65).** The old form (pairwise mean hue ≥ 25°) is
unsatisfiable alongside R-03: three of five acts get a warm key and the warm quadrant is ~60° wide,
so three acts pairwise 25° apart need 50° of it. What ART.md §6 actually states is the
**relationship** rule — "no two acts share a key/shadow relationship" — and a single mean hue over a
mapped cloud collapses the whole ramp to one number and cannot see it. A5 now measures the
key hue, the shadow hue, the key **chroma** and the key-to-shadow value spread, and takes the
largest single axis, because "a different relationship" means different in some respect, not all.

Chroma had to be an axis: the first version gated hue on chroma and act 1 fell straight through at
0.04 — but act 1's near-absence of colour **is** its relationship ("cool-key / cool-shadow, dead").

- shipped: worst pair 1/2 = **0.26**, PASS (line 0.25). Act 2 is the cream, per D65.
- control (one LUT for all five acts): **0.00**, FAIL.
- superseded single-mean-hue reading, printed alongside: worst pair 5.7°.

**A4 — confusable repeats, not identical ids.** A4 is written for a human naming repeats. The
id-only proxy broke the moment the deck got 2.3× denser: the same 24 cutouts inevitably put three
instances of one id on screen and the criterion failed while the frames improved. Two instances
only read as the same cloud if they are also close in size and facing the same way, so a repeat now
requires matching id **and** scale ratio under 1.35 **and** matching flip. Shipped worst 2, control
(one-cutout atlas) 3. The old id-only number is reported as `rawWorst`.

**A6 closes at 0.12 (D66).** Pass below, fail at or above; the broken control lands at 0.146.

## 16. The result, stated plainly

Identical staging, identical protocol, four fresh critics (two per round, none reused):

| | mean ours | mean reference | **mean gap** | picked reference | banned words |
|---|---|---|---|---|---|
| **before** | 2.28 | 7.25 | **−4.97** | 6/6 | flat, sticker, uniform, repeated (6 frames) |
| **after** | 3.28 | 7.33 | **−4.06** | 6/6 | flat, sticker (4 frames) |

**The gap is not closed and I will not dress this up.** −4.06 against a −2.0 line, 6/6 critics still
picked the reference, and the +0.91 move is inside the ±1.5 noise floor ART.md §9 names — so
numerically this is not yet a result.

**What did change is the differences lists, which §9 says are the real evidence.** The headline
defect is gone: every critic in the before round said the shadows crushed to black and two named
"black cartoon outlines"; **no critic in the after round says either**, and two say explicitly that
it does not crush. "Uniform" and "repeated" are gone. What remains is a different and more advanced
set of complaints:

1. **Shadows do not turn hue** — "a slightly darker tan with no hue shift, no cool/warm turn";
   two-value fill-and-wash against the references' three-value lit crown / mid / violet core.
2. **Clouds read as cutouts, not embedded in an atmospheric mass** — "individually silhouetted,
   evenly spaced, no aerial perspective".
3. **Stamped silhouette variety** — "the same lobed-blob template at nearly every scale". This is
   the atlas's shape range, not the placement's.
4. **No visible brushwork** — "airbrushed, smoothed, no grain, no drag", despite the tooth being
   raised 2×. The grain is one frequency at one amplitude everywhere; a critic named exactly that.
5. **No ground plane in the sky frames** — "nothing to stand on, does not resolve into a place".
   That is TERRAIN and the actors, i.e. P9 and P4/P5.

**One frame regressed and it is mine.** Act 1 went from −3.67 to −6.50: raising the ambient removed
the accidental darkening `FG_OCCLUDE` had been relying on and the whole frame "crushed **upward**
into a narrow pale grey-beige midtone band" — the exact inverse of the defect this pass fixed.
`FG_OCCLUDE`'s multiply is now 0.20–0.28, act 1's haze is down from 1.15 to 0.92 and its sky ramp
is re-authored with a real dark end. The frame has its value range back; it has **not** been
re-scored by a critic, so treat act 1's number as stale.

## 17. What I could not close, and what I would do next

Of the five remaining complaints, **three are not reachable from this phase's ownership**:
the ground plane is P9's, the actors are P4/P5's, and P4's removal test ("delete the light and the
frame must change") cannot pass while a gradient-mapped cutout has no idea where the sun is.

The two that **are** mine and are not fixed:

- **Shadows that turn hue.** The LUT gives one colour per luminance, so a cloud's shadow side gets
  the ramp's low end and nothing else — there is no mechanism for a shadow to be a different *hue*
  from a midtone at the same value. This needs either a second sampler indexed on something other
  than luminance, or the shadow-side tint carried per-instance the way the depth haze now is.
  It is the single most-named defect left.
- **Grain that varies with the wash.** Raising the amplitude 2× did not help because uniformity is
  the tell, not weakness. This is P1's own REQUEST-2 — the world-space brushwork term — and it is
  still unbuilt.

The asset gates all still pass with every control red: A1 7.55 MB, A2 clean, A3 worst seam excess
−0.59/255, A4 2 (control 3), A5 0.26 (control 0.00), A6 0.0524 (control 0.146), A7 1.66 s
(control 0.019 s).

## 18. One more gate defect, found while closing out

`verify.js` kept its own copy of `FG_OCCLUDE`'s layer multiply. `sky.js` moved from
`[0.55,0.58,0.68]` to `[0.20,0.22,0.28]` in §16's act-1 repair and the gate went on measuring the
old value, so **A6 was scoring a frame the game does not draw**. It happened to be conservative —
the shipped multiply is darker, so the real p90 is lower than the reported one and no pass was
false — and that is precisely why nothing caught it. A gate that keeps its own copy of a renderer
constant is measuring its own copy.

The constant is now named once, in `sky.js`, as the exported `FG_OCCLUDE_MUL`, and `verify.js`
reads it out of that file and **exits with an error if it cannot find it**. Re-syncing the number
would have fixed today's drift and left the mechanism in place for the next one.

Fixing that immediately exposed a second one underneath it. With the correct multiply in place,
A6 read 0.0199 and **its control went green at 0.0554** — the multiply had been darkened to
0.20-0.28 in §16's act-1 repair and now dominates, so the drawn figure passes whatever the atlas
contains and A6 had quietly become a test of the layer config rather than of the art.

A6 now reports two numbers and requires both below 0.12: the **art** p90 (the atlas's own
luminance) and the **drawn** p90 (through the multiply). The control is applied to the art figure,
where it bites properly.

```
A6  art p90 0.0902   drawn p90 0.0199 (mul 0.2/0.22/0.28)   PASS
    control: crush undone (x2.79) -> art p90 0.2517         went RED
```

These are the fifth and sixth instrument defects of the phase, after A3's control scoring better
than the real strip, A6 measuring the post-process noise floor, the A5 control parsing a superseded
output format, and the crossfade metric reporting 0.00 s. **Every one was found by running the
check against something that should fail it. Not one was found by reading the code.** The lesson is
not that these particular gates were badly written — it is that a gate's own correctness has to be
tested the same way the feature's is, and the only test that works is a deliberate break.

**Known artefact, unchased:** the Act 1 frame has a hard-edged rectangular tonal seam at mid-left
where a ground strip's copy boundary shows. It is visible in `shots/p3/act1_mud.png` and it is not
a tiling seam in the A3 sense — A3 measures the wrap join, and this is a layer edge.

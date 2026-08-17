# NEONHAUL — blind critic scores

Protocol: `~/cc/yru/gms/3d/aaa_refs/naval/CRITIC_PROTOCOL.md`, plus `BUILD_PLAN.md` §12 and
§12.4.1's nine anti-tell fixes. Every sheet is built by `tools/compare.mjs`, sides randomised and
balanced per shot, named by opaque hex, with the answer key written **outside the repo** to
`~/.cache/neonhaul-keys/`. A critic is a separate agent handed the sheet path and the protocol's
prompt, and nothing else — not the plate id, not the shot id, not the repo path, not the fact that
one of the two images is ours.

**Gate:** `ours_overall >= ref_overall - 2.0`. Three passes per shot, then record and move on.

---

## Rounds

| Round | Shot | Plate | Ours | Ref | Gap | Verdict | Top fix |
|---|---|---|---|---|---|---|---|
| 1 | `fog_city` | `746850_01` | 4.5 | 6.0 | −1.5 | **PASS** | "no light hierarchy — every building face is lit by the same flat blue ambient" |
| 1 | `canyon_dive` | `746850_03` | 4.0 | 7.0 | −3.0 | FAIL | "the lit-window pattern is a literal repeating decal" |
| 2 | `fog_city` | `746850_01` | 3.0 | 7.5 | −4.5 | FAIL | "window lighting is a repeating tiled texture; no face-based shading" |
| 2 | `canyon_dive` | `746850_03` | — | — | — | not scored | round 2 was decision 10's isolated haze sweep; `fog_city` is the shot that decision names |
| 3 | `fog_city` | `746850_01` | 4.0 | 7.0 | −3.0 | FAIL | "rain is a stuck patch, not weather" — rain box was camera-centred, half its drops behind the camera |
| 3 | `canyon_dive` | `746850_03` | 4.0 | 7.5 | −3.5 | FAIL | "the window grid is uniform in size, spacing and colour — a tiling texture, not individual glazed openings" |
| 4 | **calibration** | `746850_01` both sides | 6.0 | 6.5 | Δ0.5 | **VOID — see below** | consistent (Δ ≤ 1.0) but both halves below 8 |
| 5 | **calibration** | `746850_01` both sides | 6.0 | 7.0 | Δ1.0 | **VOID — see below** | re-run with an anchored scale; still both below 8 |

| 6 | `hero_craft` | `1939970_00` | 3.0 / 3.0 / 3.0 | 9.0 / 9.0 / 9.0 | **−6.00 mean** (−6.0 −6.0 −6.0) | FAIL | "the hull has one broad soft gradient and no specular break, so it reads as a matte decal rather than painted metal" |
| 6 | `fog_city` | `746850_01` | 3.0 / 3.0 / 3.0 | 8.0 / 8.0 / 8.5 | **−5.17 mean** (−5.0 −5.0 −5.5) | FAIL | "every window is the same white at the same brightness, so each tower reads as one tiled decal" |
| 6 | `canyon_dive` | `746850_03` | 3.5 / 3.5 / 4.0 | 8.5 / 8.5 / 8.5 | **−4.83 mean** (−5.0 −5.0 −4.5) | FAIL | "emissives light nothing — the façade is as dark next to a sign as ten metres away" |

| 7 | `fog_city` | `746850_01` | 3.0 / 3.0 / 3.5 | 8.0 / 8.0 / 8.5 | **−5.00 mean** (−5.0 −5.0 −5.0) | FAIL | "the emissive windows do not light the wall around them, so each tower reads as a decal rather than a lit surface" |
| 7 | `canyon_dive` | `746850_03` | 4.0 / 4.5 / 4.0 | 9.0 / 8.5 / 9.0 | **−4.67 mean** (−5.0 −4.0 −5.0) | FAIL | "in LEFT every light source changes the surface next to it; in RIGHT no light source affects anything at all" |
| 7 | — | — | — | — | — | **VOID, off-pool** | a first `fog_city` pass was run with an explicit `model: sonnet` override on the `fp-critic` agent. That changes the POOL, which is the one thing SCORES.md says must not change between comparable rounds, and it scored ref 7.0 / ours 5.0 — visibly a different calibration from every other round-7 critic. Discarded before any of the six below were run. **Never pass a model override to a critic agent.** |

### Round 6 — P5, three fresh critics per shot (DECISIONS 12)

**The critic POOL changed between round 3 and round 6 and the absolute numbers are therefore not
comparable across that boundary.** Rounds 1–5 used the general pool; round 6 used `fp-critic`, which
is explicitly tuned to refuse a passing score to anything short of a shipped game. It marks BOTH
halves harder — the reference plates score 8.0–9.0 here against 6.0–7.5 in rounds 1–5 — so the gap
widens without the render changing. Read round 6 against round 6, and read the differences lists,
which is what DECISIONS 12 says to do anyway.

**Inter-critic variance within round 6 was small**: 0.0 on `hero_craft`, 0.0 on `fog_city`, 0.5 on
`canyon_dive`. Three independent critics agreeing to within half a point is a much better instrument
than the ±1.5 single-critic spread that made DECISIONS 12 necessary — the three-critic method works.

### DECISION 14's test: did a craft in frame move it?

`fog_city` and `canyon_dive` were re-scored with a hero craft added and **the camera untouched** —
pos, yaw, pitch, fov, variant and clock in `shots/*.json` are byte-identical to the P3b freeze, so
the only new thing in either frame is the subject. The answer is:

**Partly, and not in the way decision 14 predicted.**

- **The "no subject" complaint is gone.** No round-6 critic says the frame lacks a focal point in the
  way round 3 did. Composition is now the *highest*-scoring criterion on both shots (4–6 against 2–3
  for Materials), and the craft is named as the thing the eye goes to.
- **But the gap did not close**, because the complaints that dominate every list are the CITY's, not
  the composition's, and they are the same complaints round 3 made:
  *"emissive windows light nothing"*, *"no shadows or contact occlusion anywhere"*, *"the window
  grid is a tiling decal"*, *"one material everywhere"*, *"aliasing on every tower edge"*.
  Six of six critics led with a version of "every light source in this image is a sticker".
- The craft attracted its own criticism instead: it is *placed* against the busiest window field so
  its silhouette dissolves, and its thrusters *"light nothing, not even the hull they are bolted to"*.
  Both were acted on inside P5 (the shot offset now sits the craft against open fog; the plume got a
  view-dependent volumetric falloff, a hot core and a throttle-scaled wash on the hull's aft third).

**So decision 14's diagnosis was half right.** A subject was genuinely missing and the frames are
better for having one. It was not the *cause* of the gap. The cause is the one Aaron named in
`ART_PASS.md` and P3b's critics named before him: **the city has no lighting model — emissives that
emit nothing, no occlusion, one material, one window value.** That is now THREE independent
observers converging on it, and it is P11's work, not P5's.

Three passes are spent on `fog_city` and `canyon_dive` (rounds 1–3) and one on the P5 set. Per the
protocol the work is kept, the scores stand, and the remaining gaps are recorded here rather than
chased into a fourth round on a diagnosis that belongs to another phase.

---

## Round 7 — P11, the art pass. Six fresh `fp-critic` critics, three per shot.

Same pool as round 6, same prompt, same two plates, the same frozen §12.1 cameras. Read round 7
against round 6 and against nothing earlier.

| | ours | ref | gap | round 6's gap |
|---|---|---|---|---|
| `fog_city` | 3.0 / 3.0 / 3.5 | 8.0 / 8.0 / 8.5 | **−5.00** | −5.17 |
| `canyon_dive` | 4.0 / 4.5 / 4.0 | 9.0 / 8.5 / 9.0 | **−4.67** | −4.83 |

Inter-critic variance 0.5 on both shots, the same as round 6. **Both moves are 0.17 of a point,
which is a tenth of the ±1.5 noise DECISIONS 12 measured on this instrument. The correct reading is
that the number did not move.**

### The question ART_PASS actually asks — did the complaints change?

ART_PASS's gate is not the number: *"do the critics stop saying flat, uniform, no hierarchy, same
ambient?"* Answered honestly, one phrase at a time, against what rounds 1–6 said:

| complaint | rounds 1–6 | round 7 |
|---|---|---|
| *"the window grid is a literal repeating decal / a tiling texture"* | rounds 1, 3 and 6 | **GONE.** Not one of six critics describes the window field as a repeat or a tiled texture. |
| *"every window is the same white at the same brightness"* / *"one window value"* | round 6, all three | **GONE.** Nobody says the windows share a value. |
| *"every building face is lit by the same flat blue ambient"* | P3b's critics | **GONE as written.** Nobody attributes the flatness to one ambient any more. |
| *"no colour"* (Aaron's headline) | `ART_PASS.md` | **GONE.** Critics now name the colours — *"a green tower, a magenta tower, a maroon tower"*, *"the magenta and white towers at right of frame"*. Between-building variety registers. |
| **"every light source in this image is a sticker"** | round 6, six of six | **STILL SIX OF SIX.** Every round-7 critic led with it: *"emissive windows are decals on an unlit wall"*, *"each tower reads as a decal sheet, not a lit surface"*, *"in RIGHT no light source affects anything at all"*. |
| *"no shadows or contact occlusion anywhere"* | round 6 | **STILL THERE**, now stated as *"the two visible faces of the same box read at the same luminance, so the prism has no form"* — three of six, all asking for 15–30 % of face separation. |

**So the complaints moved and the number did not.** The colour half of ART_PASS's diagnosis is
answered and is no longer named. The LIGHTING half — emissives that light nothing — is not, and it
is now the only thing standing in every list. P11's spill term was measured (it moves the frame by
6.6 of a channel with a null control of 0.000) and it is still an order of magnitude too timid to
change what a critic sees.

### Three defects the round found that are NOT taste calls

1. **Five of six critics named §3.8's vertical corner strip as a rendering bug** — *"a stray edge
   or an untrimmed beam"*, *"the single most obvious unfinished-build tell in the frame"*, *"it
   looks like debug wireframe"*, *"a 1px line primitive rather than tapering geometry"*. It is a
   legitimate corner run drawn at a constant **0.30 m over a mass up to 464 m tall** — 1:1,500, a
   sub-pixel hairline no mip or AA can help. Fixed after the round: the width now scales with the
   run, 0.50–1.80 m.
2. **Three of six read the window field as *"rotated squares in no rows and no columns"*, *"randomly
   scattered, ignoring floor lines"*.** Real: with 26 % of panes dark and a 50 % inset there was no
   CONTINUOUS element left on the facade, so a regular grid seen at a steep oblique angle had
   nothing to tell the eye it was a grid. Fixed after the round with a lit spandrel band at every
   floor, on §3.4's own 3.6 m pitch.
3. **Six of six on the spill.** Fixed after the round by moving it from a per-fragment uniform lift
   (which washes the whole facade at any strength that reads next to a window) into a **baked halo
   and sill in the window atlas**, which is local per pane and costs nothing per frame.

**None of the three was re-scored.** Three passes on these two shots are spent (rounds 1–3), the
round-7 pass is spent, and the protocol says keep the work and move on. They are recorded here the
way round 3's post-round fixes were.

### A method error, recorded so it is not repeated

The first round-7 critic was launched with an explicit **`model: sonnet` override on the
`fp-critic` agent**. The agent definition's model is part of the pool, and the pool is the one
thing that must not change between rounds being compared — round 6's whole note exists because of
it. That critic returned ref 7.0 / ours 5.0, a visibly different calibration from all six that
followed. It was discarded before any real critic ran. **Do not pass a model override to a critic
agent.**

---

## What moved between rounds

**Round 1 → 2 — decision 10's haze sweep, and NOTHING else.**
Both round-1 differences lists named distance separation ("nothing shifts in hue or contrast
between near and far"; "sky and background tower sit at almost the same value, so depth
collapses"), which is decision 10's stated trigger. The rule is to sweep that one number and
re-run without changing anything else, so that is exactly what round 2 was.

**Round 2 → 3 — everything the three lists agreed on.** In the order they were acted on:

1. **The composer bloom was inert.** §4.4's threshold of 0.90 is derived from a table that prices
   a light source by its brightest CHANNEL, but `LuminosityHighPassShader` thresholds on
   LUMINANCE — and this game's sources are saturated by rule. A magenta `0xff2a9d` at intensity
   1.5 peaks at 1.50 in red and carries a luminance of 0.53. Measured across the whole frame:
   at threshold 0.90 the frame mean was 0.148 and the brightest cell 0.276; dropping to 0.20
   took the mean to 0.357. Nothing in the game was crossing 0.90. **0.90 → 0.55**, which is 6.5×
   above the brightest non-source (§4.4's own table) and below the median window.
2. **Per-window emissive variation.** Named by all four critics in near-identical words. The hash
   is on the window's own grid index, not on the repeat of the atlas cell — per-repeat variation
   was tried first and did not answer it, because within one repeat every pane still matched.
   8 % of panes go dark; the rest spread 0.45–1.35 with a warm/cool bias.
3. **Face shading.** `deepnight` had `dirI 0.00` and `stormnight` 0.08, so a HemisphereLight gave
   two faces of the same mass identical radiance. 0.10 and 0.24 — 0.003 of luminance on a lit
   face, which does not brighten the frame, it just stops the two faces being the same number.
4. **The pale vertical bars.** Round 1 called them "thin vertical white lines that don't
   correspond to any modeled structure … reads as a stray or z-fighting artifact". They are
   antenna masts: 90 % metal at roughness 0.38 mirroring §3.7(a)'s new city-glow band down their
   whole length. `envMapIntensity 0.9 → 0.08`, verified by rendering the A/B — 0.28 was not enough.
5. **Roof clutter.** "Flat rectangular cuts with zero detail." The roof-plant height gate came
   down from 80 m to 45 m and each roof can now take a second unit and a vent stack. Same
   instanced field, already allocated, running at 664 of a 2,200 cap.

**After round 3** (recorded, not re-scored — the passes are spent):

6. **The rain box was camera-centred**, so half its drops were behind the camera and a
   pitched-down shot put the rest above the sightline: round 3 read it as "a stuck particle patch
   in the top-left corner". The box is now pushed 34 % of its own width along the view direction.

---

## Decision 10 — the far-haze tunable, and where it settled

**Settled at `HAZE.gamma = 0.94`.** One named number in `config.js`, live-sweepable through
`__game.setHaze(g)`.

Measured by the same probe `gates_p1a` uses for §4.1.1 — the D1/D2/D3 unlit silhouettes at
300 / 600 / 850 m in `deepnight`, displayed luminance off the composited frame:

| gamma | D1 (300 m) | D2 (600 m) | D3 (far) | band = D3−D1 | fog_city frame mean |
|---|---|---|---|---|---|
| 1.00 | 0.0356 | 0.0659 | 0.0897 | 0.0541 | — |
| **0.94** | **0.0362** | **0.0731** | **0.1000** | **0.0638** | **50.3 / 255** |
| 0.90 | 0.0367 | 0.0787 | 0.1078 | 0.0711 | — |
| 0.86 | 0.0374 | 0.0851 | 0.1166 | 0.0793 | 57.2 / 255 |
| 0.78 | 0.0393 | 0.1010 | 0.1375 | 0.0982 | 60.3 / 255 |

Plate `746850_01` measures **48.7 / 255** mean. 0.94 lands 50.3 — a 3 % error — while keeping the
far plane at 0.1000, the bottom of decision 10's own 0.10–0.12 band, with the depth band 18 %
wider than P1a's.

**Two corrections to the decision's premise, both of which change what it asks for:**

1. **0.055 was the BAND SPAN, not the far plane's luminance.** `gates_p1a`'s own comment says so
   verbatim — "the whole displayed range of the deepnight fog band is ~0.055" — and the far plane
   at gamma 1.0 actually reads 0.0897. The decision's two instructions ("land far haze around
   0.10–0.12" and "roughly double our current value") therefore point at different numbers. This
   phase followed the absolute target, because that is the one stated against the plate.
2. **The sweep did not move the complaint it was run for.** Both the round-1 and the round-3
   differences lists named distance separation, at gamma 0.86 and at 0.94 respectively, in the
   same terms. The number moves the frame's overall brightness; it does not appear to move how
   deep the frame reads. That is itself the finding, and it says the depth complaint is about
   something else — most likely that our far layer is LOD2 boxes with a faint speckle and no hue
   shift, while the plates put warm sodium haze behind a cool foreground.

**Score movement across the sweep is not readable**, and this is the honest report: round 2 (gamma
0.94) scored worse than round 1 (gamma 0.86), but the SAME reference plate scored 6.0 in round 1
and 7.5 in round 2 from two different critics. The plate cannot have changed. See the calibration
note — the critic-to-critic spread is the same size as the effect being measured.

---

## `day_smog`'s expected deficit — written down BEFORE it is scored (§12.3)

`day_smog` is scored at P10. Recording the deficit now, per §12.3, so the gap is read as a
decision and not chased as a defect:

Opened at full resolution, `1091500_08`'s sky is a near-white blown grey occupying ~45 % of frame,
and the tower carries visible rust-orange and teal panels with warm-lit window rows — it is **not**
a silhouette. §4.3's `daysmog` sky (`0x585048` → `0x3b3a3e`) is deliberately far darker, because
the brief says "still fairly dark" and Aaron's rule wins over the plate. **`day_smog` will lose
Lighting and Atmosphere points for a deviation we chose.**

Its camera is frozen at the plate crop's aspect (0.844, portrait — obligation T4), and
`compare.mjs` pre-scales our half to the plate's cropped 444×526 before the shared upscale, so
resolution cannot be the tell (obligation T1's known gap). Same treatment applies to `wet_street`
at 528×472, which needed it for the same reason and had not been noticed.

---

## The calibration rounds, and what they say about these numbers

Rounds 4 and 5 put the same plate on both sides (a 1.5 % pan on one, a ±2 % exposure jitter on the
other — never the identical file, per §12.4).

| | LEFT | RIGHT | Δ | ≥ 8? |
|---|---|---|---|---|
| Round 4, protocol prompt verbatim | 6.0 | 6.5 | 0.5 ✓ | **no** |
| Round 5, same sheet content, prompt given an ANCHORED SCALE ("10 is the best-looking screenshot you have ever seen from a released title, 8 is a solid shipped AAA look, 5 is a competent indie, 2 is an unfinished prototype") and the word "harsh" removed | 6.0 | 7.0 | 1.0 ✓ | **no** |

- Both rounds are **self-consistent within the sheet** — Δ 0.5 and Δ 1.0, inside the protocol's
  ≤ 1.0 tolerance. Two different critics, shown two near-identical crops of one image, agreed with
  themselves.
- Both rounds put a **shipped commercial screenshot at 6–7**, so by the protocol's letter both are
  **void**. Round 5 was the re-run with a fresh critic, and anchoring the scale explicitly moved
  the number by 0.5. The offset is not a miscalibrated individual: it is where this critic pool
  sits.

The pattern across all six scored rounds is consistent and it matters for how the manager reads
this table: **the same reference plate — a shipped commercial screenshot — scored 6.0, 7.0, 7.5,
7.0, 6.0 and 6.5.** A 1.5-point spread on an unchanging image. So:

- **The gap is the statistic. The absolute numbers are not.** The protocol already says this
  ("a harsh critic is harsh on both images, so the gap is the signal"), and this run is the
  evidence for it.
- **A single round's gap carries roughly ±1.5 of noise.** `fog_city` moved −1.5 → −4.5 → −3.0
  across three rounds whose builds differed by one gamma value and then by five fixes. No
  narrative about which change helped survives that error bar.
- **The "either below 8" clause is measuring the critic pool, not the round.** Written for a human
  or a differently-prompted agent, it assumes the anchor plate scores near the top. This pool does
  not put a released AAA screenshot above 7 under any prompt tried. Voiding every round on that
  clause would void all six, including the one that passed. Recommend the manager read it as: the
  gap is the gate, and a calibration round is passed on the Δ ≤ 1.0 half alone.
- The recommendation for P5, P6 and P10: **score every round twice with two fresh critics and
  take the mean gap**, or hold one critic agent across a shot's rounds by resuming it rather than
  spawning a new one. Either halves the variance for the same cost as one extra round.
- If absolute numbers are wanted, put the anchored scale from round 5 into the standing prompt.
  It did not fix the offset but it makes the offset the same shape for every critic.

---

## Known gaps carried out of P3b

1. **Both scored shots fail the −2.0 gate at round 3** (`fog_city` −3.0, `canyon_dive` −3.5),
   with the caveat above about the error bar. Round 1's `fog_city` passed at −1.5 on the same
   build family.
2. **The critics agree on what is missing, and most of it is not P3b's scope:**
   - *No focal subject.* Named in four rounds. `fog_city` and `canyon_dive` are city-only shots;
     the plates both contain a hero craft. **P5 puts traffic and the player craft in frame** and
     this is the single largest structural gap.
   - *No street-level ground truth.* The canyon floor is past `stormnight`'s V(2.2) = 279 m and
     renders as flat haze. Traffic streaks on the canyon floor (P5) are the fix.
   - *Rain does not pick up colour from the lights it passes.* Real, and cheap enough to be worth
     a look at P10: sample the district tint per drop rather than a flat grey.
   - *Facades have no wet specular.* §3.7's mirror only reflects the emissive buckets (by design,
     §3.7b) and §3.7(a)'s env now carries a city-glow band, but neither puts neon on a wall.
3. **`wet_street` was not scored.** The manager's brief named `fog_city` and `canyon_dive` for this
   phase; §12.3 also lists `wet_street`. Its camera is frozen and its plate crop and resolution
   match are in place, so it is one `compare.mjs` command away. **Flagging the plate rather than
   the shot:** `1475810_04` at §12.1's crop is 528×472 of defocused wet tarmac — it is a genuine
   reflection test but it is soft, low-resolution and nearly empty, and it will score badly for
   reasons that have nothing to do with our render.

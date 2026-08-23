# KITEHAWK — sky, FX and hero-object generation

**Owner: agent J.** Covers the half of the art pipeline `DECISIONS.md` **D38** unblocked:
`CLOUD_MID`, the `FX` brush sheet, and the large painted hero objects. The small mechanical prop
half of `TERRAIN` is **not** in here and was deliberately not generated — that is agent G's, behind
`poster.js` (D37/D38).

Written 2026-08-24. Everything lives in `art/gen/`:

```
art/gen/
  gen.py                  the generator — same contract as docs/refs/gen_ab.py plus a manifest log
  keycheck.py             measures what a plate will cost the bake (see §5)
  manifests/ACCEPTED.json the 40 delivered plates, exactly as generated — USE THIS TO REGENERATE
  manifests/*.json        the per-batch history (see §1 — not a replay script)
  out/                    the plates + _manifest.jsonl + _log_*.txt
  out/_manifest.jsonl     ONE LINE PER PLATE — this is the artefact that matters
```

Nothing here has been placed in the game's asset folder. The bake (`crop` → `key` → `trim` →
`atlas`) does not exist yet; the manager moves these once a renderer can consume them.

---

## 1. How to regenerate

```bash
curl -s localhost:7867/api/status   # queue_depth
curl -s localhost:7866/api/status   # worker_warm — LTX and Flux cannot co-reside in 24 GB
cd art/gen && python3 gen.py manifests/ACCEPTED.json out
```

**`manifests/ACCEPTED.json` is the one to use.** It holds exactly the 40 accepted plates with the
prompt, seed, size, steps and model that actually produced each one — including the re-rolls. It is
generated from `out/_manifest.jsonl`, so it cannot drift from what was really run.

The per-batch manifests (`c_cloudmid.json`, `x_fxbrush.json`, `h_hero.json`, `r_reroll*.json`) are
the historical record of how the work was done, **not a replay script**: six clouds and three hero
objects were re-rolled at new seeds with reworded prompts, so `c_cloudmid.json` on its own no longer
reproduces the delivered atlas. Replaying by batch means running them in order —
`c_cloudmid` → `r_reroll` → `r_reroll3` → `r_reroll4` — and relying on `gen.py`'s skip-if-exists.
Use `ACCEPTED.json` instead.

`gen.py` **skips outputs that already exist**, so a batch resumes after a kill or an OOM. To
regenerate a single plate, delete its PNG and re-run.

Every finished plate appends a line to `out/_manifest.jsonl`:

```json
{"file":"cL01.png","batch":"c_cloudmid.json","job_id":"…","model":"flux2-klein-4b","seed":1,
 "steps":16,"w":768,"h":768,"guidance":1.0,"mode":"txt2img","refs":[],"prompt":"…",
 "negative_prompt":"…","bytes":…,"sha256":"…","secs":…,"at":"2026-08-24T…"}
```

Prompt + model + seed + steps + size reproduces the plate exactly. **The manifest is the
deliverable; the PNGs are a cache of it.** `sha256` is the first 16 hex chars, enough to tell
whether a re-run reproduced bit-for-bit.

### Seed allocation

Per `ART.md` §7 shared cross-act assets use seed base **0**. Within that base:

| range | assets |
|---|---|
| 1–8 | `CLOUD_MID` large cutouts `cL01`–`cL08` |
| 9–24 | `CLOUD_MID` small cutouts `cS09`–`cS24` |
| 40–48 | FX brush sheets `x40`–`x48` |
| 60–71 | hero objects `h60`–`h71` |
| 7707 / 7807 | inherited from `ART_AB_FINDINGS.md` — the two proven zeppelin seeds |
| 8808 | inherited — the proven flak-sheet seed (`f08_varied`) |
| 3303 | inherited — `p04_cloud_cutout`, used for every size-isolation test |

A re-roll is `seed + 100k`, `k` incrementing, written back into the manifest. Never regenerate
without recording the seed.

---

## 2. The prompt grammar actually used

**Stem — D34, verbatim, every plate:**

```
Hand-painted gouache painting in the style of a WWI aviation poster and a Studio Ghibli aviation
film, visible brush strokes and paper grain, romantic and beautiful,
```

`ART.md` §7's stem is superseded and was not used anywhere in this batch.

**Clouds** — D34 stem + one shape-specific subject clause + a constant lighting clause + the
isolation clause. Sixteen of the twenty-four use exactly this and nothing else:

```
… , sculpted painterly volume, warm cream sunlit top-left face and cool violet-grey shadowed
underside, crisp readable silhouette, completely isolated on a flat uniform neutral mid grey
background, 2D game asset cutout, no sky gradient, no ground, no aircraft, no cast shadow
```

Each cutout gets its **own subject clause naming a distinct cloud form** (anvil, congestus tower,
flat raft, lenticular, fractus scrap, …) rather than one clause on 24 seeds. Seed variation alone
does not produce 24 readably different silhouettes; naming the form does. This matters for P6 —
`CLOUD_MID` is placed by Poisson distribution and a repeat inside one screen is the failure mode.
**But the form must be named in cloud vocabulary — see the end of §3, where getting this wrong
cost six plates.**

**FX** — D35's rule, applied as the AB actually applied it, not as it reads. See §4; the
distinction cost two failed rounds.

**Hero objects** — the `z10_winner_9b` grammar from `ART_AB_FINDINGS.md` §3 verbatim, with the
subject clause swapped. `no cables, no ropes, no mooring lines` is kept: it works.

### On the neutral-light rule (D39, open)

Clouds and hero objects here are painted with **warm key / cool shadow**, not `even overcast light,
low saturation, neutral grey-blue`. That is a deliberate call and it does not break the ramp-map:

```glsl
float L = dot(albedo.rgb, vec3(0.2126, 0.7152, 0.0722));
vec3  c = texture(uRamp, vec2(L, 0.5)).rgb;
```

The gradient map reads **luminance only and discards hue entirely**. A baked cream/violet split is
therefore invisible after ramping — what survives is the value structure, which is exactly what the
warm/cool lighting produces most cleanly. The neutral-light rule buys nothing for a luminance LUT
and costs the thing that makes the plates read as painted (which is D39's own complaint). It would
matter for a plain multiply tint; it does not matter here.

**Caveat for whoever wires the LUT:** this only holds if the ramp is genuinely luminance-indexed.
If anyone changes it to a multiply or a hue-preserving blend, every plate in this batch has to be
regenerated neutral.

---

## 3. The size ladder — the main finding, and it is not what the A/B predicted

`ART_AB_FINDINGS.md` §4 concluded **"do not generate props small — generate large and downscale"**,
because 320×256 strengthened the "3D game asset" prior on a mechanical prop. For an **isolated
single subject on flat grey, the opposite failure appears going up**, and it appears hard.

Same prompt, same seed (3303), same model, only the canvas changed:

| size | plate | result |
|---|---|---|
| **768×768** | `iso_cb_d34stem` | **clean.** Flat backdrop, no furniture, no mount. The bar. |
| 896×896 | `iso_cf_896` | **cream paper mount on all four edges** + a sun glow behind the peak |
| 1024×768 | `iso_ce_1024x768` | **a sun with rays painted into the top-left corner** |
| 1024×1024 | `iso_cd_d34stem_1024` | **a die-cut sticker with a white border**, plus lens flare and sparkles |

The mechanism is the same one §8A of `ART.md` describes for the paper mount: given more canvas than
the subject needs, the model fills it — with scene furniture, or with the physical artefact the
painting is printed on. It is not resolution, it is **empty area**.

### The lever that works, and the one that does not

- **In-prompt negation works.** Appending `no sun, no sunburst, no sun rays, no glow, no lens
  flare, no sparkles, no white border, no paper mount, nothing else in the frame` to the subject
  clause removed the sun at 1024×768 (`iso_cg`). This is worth stating against **D22**: the
  `negative_prompt` *field* is inert, but a `no X` clause **inside the prompt** is not — the same
  way `no cables, no ropes, no mooring lines` works on the zeppelin. D22 should be read as "the
  field is inert", not "negation is inert".
- **It does not rescue 1024×1024.** `iso_ch_1024sq_nosticker` carries `no sticker, no die cut, no
  white border, no white outline` and came back with the die-cut white border anyway. **1024×1024
  is simply banned for an isolated cutout on this model.**

### 1024×768 was tried for the 8 large cutouts and abandoned

The first cloud batch generated `cL01`–`cL08` at 1024×768 with the negation block. Of the four that
finished before I stopped it, **`cL02` came back as a die-cut sticker anyway**. So the sticker prior
is not confined to 1024×1024 — it is **stochastic above 768**, and the negation block reduces its
rate without removing it. Those four plates were also visibly wetter and more mottled than their
768 equivalents: more canvas gave the model room to bleed.

The gain was never large enough to be worth a coin flip. A cloud at 1024×768 trims to roughly
750×500 of content against 700×450 at 768×768 — about 17% linear.

### What was adopted

| class | size | negation block |
|---|---|---|
| `CLOUD_MID`, all 24 | **768×768** | not used on the 18 first-pass plates — 768 is clean without it. Used on re-rolls, where a specific artefact had to be suppressed. |
| FX sheets | 768×512 | a margin clause, which half works — see §4 |
| hero objects | 1024×384 / 1024×576 / 768×768 / 768×1024 / 1024×768 | landscape and portrait formats do not trip the prior; only near-square-and-large does. 9B on a structured subject also seems less prone to it than 4B on a soft one. |

**Consequence for `ART.md` §4's budget, and it is a good one.** The 8 large cutouts are budgeted
1024² slots. Their real source is 768×768, and after the 4–8% crop and a bbox trim the content is
roughly 700×450. Packing them into 1024² slots would be storing empty resolution. Sourced at true
size, `CLOUD_MID` comes in **under** its ~2.2 MB line rather than over it, which buys headroom
against the 12 MB hard ceiling rather than spending it.

### The other subject-clause rule: clouds must be described in cloud words only

Separate from size, and it cost six plates. The first cloud batch used shape metaphors to make 24
distinct silhouettes, and **the model took every one of them literally**:

| asked for | came back as |
|---|---|
| "a tall narrow **chimney** of cloud" | a stone chimney / lighthouse column |
| "layered tower built of stacked **shelves and steps**" | clouds with metal scaffolding platforms bolted on |
| "split by a deep vertical **canyon**" | a brown rock canyon wedged into the cloud |
| "a domed cloud with a torn ragged **skirt**" | a dome over brown tree-roots |
| "top drawn out into a long **streamer**" | a stylised comet swoosh |
| "a **crescent**-shaped curved bank" | a jagged torn banner; a later plate made a literal crescent moon |

Re-rolled using **cloud vocabulary only** — cumulus, cumulonimbus, congestus, tower, lobe, tier,
mound, raft, wisp, plume, cleft, crown — plus plain geometric adjectives (tall, narrow, wide,
leaning, bowed). All six came back as correct clouds on the first attempt.

**Rule: a `CLOUD_MID` subject clause may contain no architectural, fabric or celestial noun.** The
same batch also produced stray sun and moon discs floating beside the cloud from words like
"lenticular" and "crescent"; `no sun, no moon, no stars, no rocks, no buildings` in the subject
clause suppresses them.

---

## 4. FX — D35 is right but it is not the rule it sounds like

D35 says *describe the paint mark, never the phenomenon*. Read literally — drop the phenomenon
noun, describe pure abstract marks — **it fails**, twice:

| plate | prompt | result |
|---|---|---|
| `x41_puff` | "nine ragged torn-edged blots of thick opaque near-black paint, all different… no two alike" | **six near-identical black discs** with spiky rims. Reads as bullet holes. `no two alike` ignored. |
| `iso_xa_f08form` | `f08` minus the orange core, plus `no hot orange core, no fire` | **six identical botanical seed-pods** with ink outlines |
| `iso_xb_single512`, `iso_xc_single768` | one single blot, no sheet | **a photoreal wax seal / bullet hole** on textured paper, at both sizes |

The winning plate `f08_varied` did **not** drop the phenomenon. It kept `anti-aircraft shell burst
smoke puffs` as the subject and then said *what kind of paint mark depicts it*:

```
a study sheet of eight anti-aircraft shell burst smoke puffs, all different shapes and sizes and
ages, some fresh and compact with a flat hot orange core, some old and torn and drifting into wispy
ragged tails, each one a ragged torn-edged blot of thick opaque paint, dirty charcoal and warm
brown, …, irregular scattered layout, no two alike
```

**The correct statement of D35 is: the paint-mark language replaces the *rendering* adjectives, not
the subject noun.** The noun is the anchor that stops the sheet collapsing into clones. Two further
things fall out of the failures:

1. **`no two alike` is not load-bearing on its own.** It is present in every failed sheet above.
   What actually produces variation is naming **two or more contrasting states** — `some fresh and
   compact` vs `some old and torn and drifting`. Remove the contrast and the clause is ignored.
   `iso_xa` is the clean proof: it differs from `f08` almost only by removing the orange core, and
   that removal collapsed the fresh/old distinction into one form and produced six clones.
2. **A single mark cannot be generated alone.** One centred mark on grey is read as a photographed
   object at 512 and at 768. Marks must be generated as a sheet and cut apart at bake time.

Sheets that describe marks **with no phenomenon noun still work when the mark is a stroke rather
than a blob** — `x43_streak` (drag strokes) is one of the best plates in this batch. The clone
failure is specific to compact roundish marks, where "blot on grey" has an object prior to fall
into.

### The crop bug — found by measurement, not by eye

`keycheck.py` on `f08_varied` reports `grain 149`, meaning content reaches into the **outer 3%** of
the frame. **D22's mandatory 4–8% crop will slice the outer marks off the reference plate**, and
the same is true of `x40_puff_a`, which reproduces it. `x43_streak` measures 23 — its topmost dry
tail is in the crop zone too.

The A/B did not catch this because a multi-item sheet looks fine at full frame; the damage happens
in `crop.js`. Fix applied to every FX sheet in `x_fxbrush.json`:

```
, every mark small and well inside the sheet with a wide empty grey margin all around it,
nothing touching or near the edge of the frame
```

**Renderer/bake note:** the FX sheets are cut apart by connected component, not by a grid. The
marks are deliberately scattered irregularly and the count the prompt asks for is not the count
returned (eight requested, six delivered, routinely). Any bake step that assumes an N×M grid will
mis-slice these.

---

## 5. Keying tolerance — `paper grain throughout` means an exact key removes nothing

`keycheck.py` samples the backdrop as the median of four 24 px corner patches, then measures the
worst per-channel deviation from it over the outer 3% ring.

| plate | backdrop | grain | tolerance needed |
|---|---|---|---|
| `p04_cloud_cutout` (the bar) | 156,157,159 | 4 | 8 |
| `z10_winner_9b` (the bar) | 163,165,159 | 4 | 8 |
| `iso_cb_d34stem` | 160,161,162 | 7 | 11 |
| `cL01` | 164,165,165 | 8 | 12 |

So:

- **The backdrop is not one colour.** It sits around **RGB 155–175 neutral**, and it *varies
  between plates by ±10*. `key.js` must sample the backdrop **per plate**, never use a constant.
- **Key tolerance must be ≥ 12 per channel**, and 16 is the safer setting. An exact-match key
  removes nothing, exactly as `ART_AB_FINDINGS.md` §2 predicted from `f01`: D34's stem contains
  `paper grain`, and the model paints that grain into the *backdrop* as well as the subject.
- **Tolerance alone is not enough.** At tolerance 12 the soft edge of a cloud is a smooth ramp from
  subject to backdrop, so `key.js`'s **colour decontamination step is not optional** — a cutout
  keyed without it wears a grey halo the moment it sits against Act III night sky. `ART.md` §7's
  bake step 2 already says this; these plates are the reason it must not be skipped.
- **Flood-fill from the border, do not global-threshold.** Several cloud plates have interior
  regions (the shadow side of a lobe) within tolerance of the backdrop grey. A global key punches
  holes in them.

### What `keycheck.py` does and does not catch

It catches: content inside the crop zone, a mount border that reaches the frame edge, content
clipped by the frame, backdrop drift.

**It missed the 1024×1024 die-cut sticker**, because that border is inset ~5% rather than sitting
at the very edge, so the corner-patch sampler reads the real backdrop and the ring test straddles
it. Eye caught it, measurement did not. **Both passes are required — an automated pass is not a
look**, which is `ART.md` §7 bake step 6's own rule and it held here.

---

## 6. What was generated

**40 accepted plates, 18.5 MB of raw PNG, 121 minutes of elapsed queue time across 75 jobs**
(75 includes the isolation rounds and the rejected plates, which are kept — they are the evidence).
64 jobs on `flux2-klein-4b`, 11 on `flux2-klein-9b-mlx-4bit`, per D36.

Mean job wall time was 153 s, but that is *not* throughput — agent G was on the same queue
throughout and I ran up to three `gen.py` processes, so each of my jobs also waited behind my own.
Real throughput was **75–90 s per plate**. `ART.md` §7's "budget ~1 minute per asset" is right for
an idle queue and roughly 50% optimistic for a shared one.

### `CLOUD_MID` — 24 cutouts, `manifests/c_cloudmid.json`

| | count | size | seeds | model |
|---|---|---|---|---|
| `cL01`–`cL08` large | 8 | 768×768 | 1–8 (re-rolls at +100/+200) | 4B |
| `cS09`–`cS24` small | 16 | 768×768 | 9–24 (re-rolls at +100) | 4B |

All 24 are one recipe: D34 stem + a **per-cutout subject clause naming a distinct cloud form** +
the constant lighting clause + the isolation clause. They key at tolerance 8–20 (see §5) and no
plate is clipped by the frame except `cL08`, noted in §7.

### `FX` brush sheets — 7 accepted, `manifests/x_fxbrush.json`

| plate | family | marks | grade |
|---|---|---|---|
| `x42_puff_b` | flak / smoke burst | 9, well varied, clean margins | **at bar** |
| `x40_puff_a` | flak / smoke burst | 8, reproduces `f08_varied` exactly | **at bar**, but edge-clipped — see §4 |
| `x46_wisp` | drifting smoke tail, vapour | 8 long dry-brush S-curves, genuinely varied | **at bar**, edge-clipped |
| `x43_streak` | motion streak, tracer smear, oil | 12 drag strokes, varied angles | **at bar**, mildly edge-clipped |
| `x47b_shred` | debris, torn fabric | 6 splinter shards | usable |
| `x45_spark` | spark, ember fleck | 24 sizes of one comma shape | usable for its purpose only — see §7 |
| `x48_blob` | soft glow / fire core | 6 copies of one good soft dab | usable for its purpose only — see §7 |

`x41_puff`, `x44_streak_b` and `x47_shred` are **rejected** and retained as evidence for §4.

### Large hero objects — 9 accepted, `manifests/h_hero.json` + `r_reroll2.json`

| plate | subject | model | grade |
|---|---|---|---|
| `h60_zeppelin_whole` | zeppelin, gondola and nacelles attached | 9B | at bar — **reproduces `z10_winner_9b` bit-for-bit** |
| `h60b_zeppelin_envelope` | envelope alone, no gondola — for the rig | 9B | at bar |
| `h60c_zeppelin_envelope_s2` | same, second seed | 9B | at bar, reproducible |
| `h61_balloon` | Drachen observation balloon envelope | 9B | usable, slightly off-spec (§7) |
| `h65b_balloon_sphere` | spherical observation balloon gasbag | 9B | usable |
| `h66_chateau` | chateau, side elevation | 9B | at bar |
| `h67_bridge_wrecked` | wrecked stone arch bridge | 9B | at bar |
| `h68b_factory` | industrial factory, chimneys intact | 9B | usable, carries a cast shadow (§7) |
| `h69_cathedral` | gothic cathedral, shell-torn roof | 9B | at bar |

**The zeppelin is delivered whole, not as the seven pieces `ART.md` §5 specifies.** Three
independently-generated envelope thirds would not butt together — the seams would not line up in
silhouette, value or seam spacing. `h60b`/`h60c` are single envelopes at 1024×384 and the bake
should **slice** them into fore/mid/aft. That is deterministic, seamless, and it is C's own
crop-don't-prompt lesson applied to a different problem.

**The gondola, engine nacelles and dorsal gun tub were deliberately NOT generated.** They are small
mechanical props — the exact class D37 says is unfixed until `poster.js` exists — and they belong
with agent G's half, not with the envelopes.


---

## 7. Below bar, and what is not here

### Rejected outright

| plate | what happened |
|---|---|
| `x41_puff`, `iso_xa_f08form` | D35 read literally — six identical black discs / botanical pods. §4. |
| `iso_xb_single512`, `iso_xc_single768` | one mark alone becomes a photoreal wax seal. §4. |
| `x44_streak_b` | eight identical horizontal bars. `x43_streak` covers this family. |
| `x47_shred` | eight identical spiky rectangles, reads as burnt matchboxes. Re-rolled → `x47b`. |
| `x40m_puff_margin` | the margin clause summoned a **white paper card with a drop shadow**. §4. |
| `h65_balloon_sphere` | returned a modern hot-air balloon **with a wicker basket**, despite `no basket`. Re-rolled → `h65b`. |
| `h68_factory_burning` | both chimneys clipped by the top of the frame. Re-rolled → `h68b`. |
| `h71_sun_bloom` | a hard-rimmed white disc with a visible brush ring, not a soft falloff. **Not re-rolled — see below.** |
| `iso_cd/ce/cf/ch` | the four size-isolation plates. §3. |

### Still below bar in the accepted set — the renderer must know these

1. **`x45_spark` and `x48_blob` are one mark each, not a varied sheet.** `x48` is six copies of the
   same soft dab; `x45` is one comma at 24 sizes. They are accepted because the FX contract (§5,
   *code owns the behaviour, paint owns the mark*) only needs one good mark per family — but
   **every stamp must be randomly rotated, flipped and scaled in code**, or a spark shower will be
   visibly 24 copies of one tick pointing the same way. This is a P6 failure waiting to happen and
   it is the renderer's job to prevent it, not the atlas's.
2. **`h71_sun_bloom` should be procedural, not painted.** A smooth radial falloff is the one thing
   this model reliably cannot paint — asked for a soft bloom it paints a *disc-shaped object*, the
   same failure as `iso_xb`. `ART.md` §5 already draws the sun disc in code; the glare bloom should
   join it. Three lines of shader beat any plate here. **Recommendation, not a decision.**
3. **`cL08` clips its plume** at the top-right corner (grain 24). Two re-rolls improved it — the
   cast shadow is gone — but the wind-sheared form wants to leave the frame. Usable; the plume tip
   is cut.
4. **`h68b_factory` carries a purple cast shadow** to the right of the building despite
   `no cast shadow`. It is a separate low-luminance blob under the content bbox — exactly what
   D37's `poster.js` step 4 is specified to detect and drop. **This is independent confirmation
   that step 4 is needed**, from a subject outside the prop set.
5. **`h61_balloon` reads as a whale.** The three tail lobes came out as fins and the envelope sits
   at an angle rather than in flat side elevation. It is a decent painting of the wrong thing.
   Low priority — it is a background silhouette.
6. **`h66_chateau` and `h67_bridge_wrecked` have a thin green grass strip** along the base.
   `no ground` did not remove it. It is a separate component below the building and trims off.

### Not generated, deliberately

- **All small mechanical props** (D37/D38, agent G's half, behind `poster.js`).
- **The zeppelin's gondola, nacelles and gun tub** — small mechanical props, as above.
- **`CLOUD_FAR` cirrus, `CLOUD_NEAR` wisps, `FG_OCCLUDE` shreds, the ground and horizon strips.**
  These are 2048-wide tiling strips. 2048 is past the service's soft dimension limit, and §3 above
  shows this model fills spare canvas with furniture — a 2048×512 strip is nearly all spare canvas.
  They need their own approach (generate at 1024 and tile, or generate in halves) and that is a
  separate piece of work, not a batch to bolt on here.


---

## 8. What the renderer needs to know

1. **These files are not game assets.** No crop, no key, no trim, no atlas. They are raw Flux
   output plus a manifest. Nothing has been placed in the game's asset folder.

2. **Key per plate, at tolerance ≥ 12, with flood fill from the border and colour
   decontamination.** All four parts matter; §5 has the measurements.

3. **Do not blanket-crop the FX sheets.** D22's 4–8% crop exists to remove the paper mount. The FX
   sheets have no mount (`ring ≈ 0`) and several have marks inside the crop zone, so the crop would
   destroy them. Crop the cutouts, key the sheets.

4. **Cut the FX sheets apart by connected component, never by grid.** The layouts are deliberately
   irregular and the delivered mark count is not the requested count.

5. **Randomise rotation, flip and scale on every FX stamp.** See §7 item 1 — two of the seven sheets
   are effectively single marks, and the game will show it if the code stamps them unrotated.

6. **`CLOUD_MID` sources are 768×768, not 1024².** `ART.md` §4 budgets 8 large cutouts at 1024² and
   16 small at 512². The sources are all 768 because that is the only size that does not summon a
   sticker border or a sun (§3). Pack the large class at 768 and downscale the small class to 512 —
   **do not upscale to 1024**, it is empty resolution. `CLOUD_MID` lands under its ~2.2 MB budget
   line rather than over it.

7. **Slice `h60b`/`h60c` into the zeppelin's three envelope sections**; do not expect three
   separately-generated pieces to meet.

8. **The ramp-map must stay luminance-indexed.** Every plate here is painted warm-key/cool-shadow
   rather than neutral overcast, which is fine for a luminance LUT and wrong for a multiply tint.
   See §2. If the LUT design changes, this whole batch has to be regenerated.

9. **`keycheck.py` is a triage tool with a known blind spot** — it misses a border that is *inset*
   from the frame edge rather than touching it (it missed the 1024² die-cut sticker and the white
   paper card). Run it *and* look at the contact sheet. `contact.py` builds one:
   `python3 contact.py out/_sheet.png 300 out/cL0*.png out/cS*.png`.

10. **Plates carrying a separate unwanted component** — `h68b` (cast shadow), `h66`/`h67` (grass
    strip), and any cloud with a stray sun or moon disc — are all fixed by the same deterministic
    rule: after keying, keep only the largest connected component (or drop components whose bbox
    does not overlap the main one). Worth writing once in the bake rather than re-rolling plates.


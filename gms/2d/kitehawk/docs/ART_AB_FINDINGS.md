# KITEHAWK — style-drift A/B findings

**Owner: agent E.** Resolves the one open pipeline question in `ART.md` §8C — hard-surface and FX
subjects drifting out of gouache into photoreal / generic-digital.

Written 2026-08-24. Evidence: `docs/refs/probes_ab/` — 30 plates, 5 rounds, ~29 minutes of queue
time. Manifests `ab_round1.json` … `ab_round5.json` reproduce them exactly via
`python3 gen_ab.py ab_roundN.json .`. `gen_ab.py` is `refs/gen.py` with one addition: `"refs": [...]`
on an entry switches the job to `mode: "edit"` and uploads the files through `POST /api/upload`.
Wall times are in `_log_round*.txt`.

Both services were idle at start (`queue_depth 0`, `worker_warm false` on 7867 and 7866) and
stayed that way. **No OOM, no stall, no contention observed** across all 30 jobs.

---

## 1. Verdict in one paragraph

C's three candidate fixes were tested in isolation against the two failing subjects, holding seed,
size and subject clause constant. **Fix 2 (fewer steps) is completely inert.** **Fix 1 (repeat the
medium clause at the end) is real but weak** — it adds paper grain and does not remove the
photographic handling. **Fix 3 (multi-ref edit mode) is not a general lever** — it rescues the
zeppelin, imposes a Japanese ink-wash look on FX, and does nothing at all to a mechanical prop.
The lever that actually worked is **a fourth one C did not list: the STEM clause itself.** The §7
stem is too weak; the `p07`/`p08` stem, which names two concrete artistic sources, is what moved
everything. With that plus subject-as-paint-marks language, **the zeppelin is fixed and FX are
decisively fixed. Small mechanical props are improved but not fixed** and need a bake-time step.

| subject class | status | best plate |
|---|---|---|
| large hard-surface (zeppelin, balloon envelope, bridge) | **FIXED**, reproducible across seeds | `probes_ab/z10_winner_9b.png` |
| FX sheets (flak, smoke, brush source) | **FIXED**, best plates in the whole project | `probes_ab/f08_varied.png` |
| small mechanical props (AA gun, hangar, wagon, wire) | **improved, not fixed** — finish at bake time | `probes_ab/t10_aagun_twotone_noassetphrase_4b.png` |

---

## 2. What was tested, and what each fix actually did

Baselines are C's `probes/p09_zeppelin.png` (seed 7707) and `probes/p10_flak.png` (seed 8808).
Every zeppelin plate below is seed 7707 at 1024×384; every flak plate is seed 8808 at 768×512,
unless stated.

### Fix 2 — fewer steps (10–12). **DEAD. Clean negative result.**

`z03_steps10_4b.png` and `f02_steps10_4b.png` are visually indistinguishable from `p09` and `p10`.
Same photoreal envelope, same airbrushed digital smoke. Step count between 10 and 18 does not touch
style on this model at guidance 1.0. **Do not spend queue time here again.**

### Fix 1 — repeat the medium clause at the end + anti-gloss terms. **Partial.**

Tail used: `, thick opaque gouache, matte, no gloss, no specular highlights, no photographic detail,
hand-painted gouache on textured paper, visible brush strokes and paper grain throughout`

- `z02_tail_4b.png` — adds real paper tooth to the backdrop and some wash texture, but the envelope
  is still a smoothly rendered object with a gloss ridge. Reads as a museum oil painting of a real
  airship, not as poster gouache. Not a pass.
- `f01_tail_4b.png` — a genuine improvement on `p10`: ink-blot puffs with visible paper grain.
- `z04_tail_9b.png` — the best result from fix 1 alone, and better than either component.
- **The decisive test is `f04` vs `f05`.** Identical prompts except `f05` omits the whole tail
  clause. They are near-identical plates. **Once the stem in §3 is in place, the tail clause adds
  almost nothing.** It is a weak substitute for the stem, not an addition to it.
- **Side effect worth knowing:** `paper grain throughout` puts visible grain in the *backdrop*
  (`f01`), which makes a flat-exact key harder. `key.js` needs a tolerance rather than an exact
  match, or the phrase should end at `visible brush strokes` with `throughout` dropped.

### Fix 3 — multi-ref edit mode with a style reference. **Subject-dependent. Not a general lever.**

Edit mode works on this service: `POST /api/upload` returns `{path}`, then `mode: "edit"` with
`image_paths: [path]`. It is ~30–50% slower than txt2img at the same size.

- `z05_edit_p04ref.png` (cloud cutout as ref) — kills the photorealism outright, but overshoots into
  flat vector illustration with no grain. `ART.md` §1 explicitly forbids that.
- `z09_edit_p08ref.png` (the hero plate as ref) — **good.** Lifts `p08`'s cream/violet palette and
  dry-brush handling onto the airship, keeps the flat grey backdrop, keys cleanly. Genuinely sits in
  `p08`'s world. This is the second-best zeppelin.
- `f06_edit_p08ref.png`, `f07_edit_p04ref_tail.png` — **bad.** Both collapse into sumi-e ink wash
  with metallic-looking hexagonal cores. Wrong medium entirely.
- `t04_aagun_edit_p04ref.png` — **no effect.** Still a clean 3D game-asset render.

**Conclusion: keep edit mode as a per-asset rescue for large painted hero objects, using `p08` as
the reference. Do not put it in the default grammar.**

### Model — 9B is the *structure* model, not the *style* model

`z01_9b.png` is `p09`'s prompt verbatim on `flux2-klein-9b-mlx-4bit`. It fixes the structure
(correct fins, nacelles, gun tub) and **does not fix the style at all** — still smooth airbrushed
metal. The model is not the style lever; D21 was right about what it buys and it does not buy this.

The reverse also shows up on props: `t08_aagun_brushlang_4b.png` (4B) has more paint quality than
`t05_aagun_brushlang.png` (9B, identical prompt). **9B renders better and paints worse.**

---

## 3. What actually worked — the winning prompt grammar

### The finding

`ART.md` §7's STEM is

> `Hand-painted gouache painting, WWI recruitment poster art, visible brush texture and paper grain,`

and it is **too weak to hold against a subject with a strong photographic prior.** "WWI zeppelin",
"anti-aircraft gun" and "flak burst" are nouns whose training mass is archive photography, 3D
renders and VFX stock. The stem names a *medium*; the subject names a *thing that has been
photographed a million times*, and the thing wins.

`p07` and `p08` — the two plates that worked — did not use that stem. They used one that names
**two concrete artistic sources and an emotional register**:

> `Hand-painted gouache painting in the style of a WWI aviation poster and a Studio Ghibli aviation
> film, visible brush strokes and paper grain, romantic and beautiful,`

**`z06_p08stem_9b.png` is the isolation test:** `p09`'s subject clause, `p09`'s seed, everything
identical except the stem swapped for `p08`'s. It goes from photoreal render to painted
illustration in that one change. That is the whole result.

### STEM (constant — replaces §7's)

```
Hand-painted gouache painting in the style of a WWI aviation poster and a Studio Ghibli aviation
film, visible brush strokes and paper grain, romantic and beautiful,
```

### The subject-clause rule for FX

**Describe an effect as the paint marks that depict it, never as the physical phenomenon.** `p10`
asked for "smoke puffs" and got smoke. `f04` asked for

> `each one a ragged torn-edged blot of thick opaque paint`

and got paint. This single substitution is what fixed FX, and it is more important than any
negative, tail or model choice.

**Winning FX grammar** (`f08_varied.png`, 4B, 14 steps — the best FX plate in the project):

```
[STEM] a study sheet of eight anti-aircraft shell burst smoke puffs, all different shapes and sizes
and ages, some fresh and compact with a flat hot orange core, some old and torn and drifting into
wispy ragged tails, each one a ragged torn-edged blot of thick opaque paint, dirty charcoal and warm
brown, limited palette, irregular scattered layout, no two alike, completely isolated on a flat
uniform neutral mid grey background, 2D game asset sheet, no sky, no aircraft, no ground,
no cast shadow
```

`all different shapes and sizes and ages` + `irregular scattered layout, no two alike` is load
bearing: without it (`f04`, `f05`) the model lays out six near-identical rosettes, which would be a
P6 repetition failure if stamped straight. With it, `f08` gives eight usable distinct marks.

**Model: 4B for FX.** 9B was not needed and 4B is faster and more opaque.

### Winning grammar for large hard-surface subjects

`z10_winner_9b.png` (seed 7707) and `z11_winner_9b_seed2.png` (seed 7807) are the same prompt on two
seeds. Both are clean painted cream/violet airships on a flat grey field with no photographic
handling. **Reproducible, so it is not seed luck.**

```
[STEM] one enormous WWI zeppelin airship seen from the side, doped fabric envelope with longitudinal
frame seams, tail fins, a control gondola and two engine nacelles slung beneath on short struts,
warm cream sunlight on the upper curve and cool violet shadow below, crisp readable silhouette,
no cables, no ropes, no mooring lines, completely isolated on a flat uniform neutral mid grey
background, 2D game asset cutout, no sky, no clouds, no ground, no cast shadow, thick opaque gouache,
matte, no gloss, no specular highlights, no photographic detail
```

**Model: 9B for large hard-surface** (structure), per D21. Confirmed.

`no cables, no ropes, no mooring lines` in the SUBJECT clause works — C's prediction was right and
`z10`/`z11` have far less stray rigging than `p09`. It is not perfect; a trim pass still helps.

### The clause that must NOT be used

> `a long simple ovoid envelope built from a few large flat poster shapes`

`z07_p08stem_paintlang_9b.png` and `z08_p08stem_paintlang_4b.png` overshoot into **flat vector /
naive illustration** — no grain, no brush, wrong structure. `ART.md` §1 forbids this explicitly.
**"Flat poster shapes" is too strong a lever. Do not use it on a hero object.** Ask for lighting
("warm cream sunlight on the upper curve and cool violet shadow below") instead of for flatness;
that is what `p04` and `z10` both do.

---

## 4. Where it still fails — small mechanical props, said plainly

**This is the honest negative and it is the one that matters, because the terrain prop atlas is
made almost entirely of small mechanical props.**

`t01_hangar_oldgrammar.png` → `t02_hangar_newgrammar.png` is a real improvement (photoreal
architectural render → soft washed drawing). But `t03_aagun_newgrammar.png` is a clean digital
concept render with airbrushed metal and a cast shadow, despite the full winning grammar. Four more
levers were tried on it and **all four failed**:

| lever | plate | result |
|---|---|---|
| edit mode with `p04` as ref | `t04_aagun_edit_p04ref.png` | no effect — pure 3D render |
| "painted with a loaded flat brush … every surface a visible brush stroke", 9B | `t05_aagun_brushlang.png` | still rendered metal + cast shadow |
| generate at native atlas size (320×256) | `t06_aagun_small.png` | **worse** — small size strengthens the "3D game asset" prior, not weakens it |
| "every surface painted as two flat tones with a hard edge between them, no gradients" | `t09`, `t10` | two-tone instruction simply ignored on cylinders |

The best prop plates are `t10_aagun_twotone_noassetphrase_4b.png` and `t08_aagun_brushlang_4b.png`
— both **4B**, both with visible paper tooth and matte dry-brush, both still carrying a smooth
gradient down the barrel and an unwanted cast shadow. Graded honestly against `p08`: **6/10.**
Usable after crop and key; not in the same painted world.

### Two secondary findings from that chase

1. **`2D game asset cutout` is double-edged.** `t11_hangar_twotone_4b.png` replaced it with
   `cut out on a flat uniform neutral mid grey field` and the *painting quality jumped* — it is the
   only genuinely gouache prop in the set — but the §8A paper-mount artefact came straight back,
   complete with a painted signature, and the subject was no longer isolated on grey. C's
   second-order finding is confirmed from the other direction: **that phrase is what suppresses the
   mount, and it is simultaneously what pulls mechanical subjects toward a 3D render.** Keep it; pay
   the cost; fix the cost at bake time.
2. **Do not generate props small.** Generate large and downscale into the atlas.

### Recommendation for props — stop prompting, add a bake step

C's own §8A lesson applies here: *fighting it in the prompt does not work; cropping always does.*
Five separate prompt levers failed to remove rendered-metal gradients from a gun barrel. The
remaining gap is a **value/texture** gap, and both are deterministic to close:

> Add **`poster.js`** to the bake, between `key.js` and `trim.js`, running on `TERRAIN` props only:
> 1. quantise luminance to **5–7 bands** with a small dither — this is exactly the two-tone read the
>    prompt refused to give, and it costs nothing;
> 2. multiply the shared **paper-grain** texture in at low opacity so props carry the same tooth the
>    clouds already have (P5);
> 3. erode the alpha edge by 1 px and re-dilate with a slightly irregular kernel so the silhouette
>    is not a clean vector boundary (P5's edge clause);
> 4. drop any residual cast shadow — it will already be a separate low-luminance blob under the
>    content bbox and is trivially detected.
>
> Then run C's §9 blind-critic protocol on a contact sheet of props before and after. If the
> posterise pass does not close the gap, the fallback is that `TERRAIN` props are drawn in code
> like the actors — expensive, but §5's split is already the project's answer to "this must look
> lit", and a hangar is a much simpler part tree than a biplane.

---

## 5. Changes this implies for `ART.md` (agent C / manager to merge)

1. **§7 STEM is replaced** by the `p08` stem in §3 above. This is the headline change.
2. **§8C fix 2 (fewer steps) is struck** as a dead end, with `z03`/`f02` as the evidence.
3. **§8C fix 1 is demoted** to a weak contributor that is redundant once the stem changes.
4. **§8C fix 3 is narrowed** to a per-asset rescue for large hero objects using `p08` as the
   reference, and explicitly ruled out for FX and props.
5. **New rule, FX subjects:** describe the paint mark, never the phenomenon; add an explicit
   "all different, no two alike" clause to any multi-item sheet or P6 will fail at bake.
6. **New rule:** never use "flat poster shapes" — it overshoots into the flat-vector look §1 bans.
7. **D21 gains a nuance:** 9B for *large* structured subjects; **4B for props and FX**, where its
   more opaque handling is closer to the target and 9B's extra render fidelity actively hurts.
8. **New bake step `poster.js`** for `TERRAIN`, as specified in §4 above.
9. **§7 neutral-light rule is in tension with the style fix.** Every prop plate above used
   `even overcast light, low saturation, neutral grey-blue` as §7 requires for ramp-mapped shared
   assets, and that clause strips out precisely the warm-key/cool-shadow colour contrast that makes
   `z10` and `p04` read as painted. The zeppelin plates that worked were *not* neutral-lit. Flagged
   as a **REQUEST** for C: either accept that shared props are the hardest case and lean on
   `poster.js`, or make `TERRAIN` props act-exclusive and prompt them in palette. This was not
   resolved here and it is the next thing worth a small A/B.

## 6. Is the terrain atlas safe to generate?

**Partly.** `CLOUD_MID`, the FX brush sheet and the large painted hero objects (zeppelin envelope
and its pieces, balloon envelopes, the bridge, the chateau) can be generated now with the §3
grammar. **The small-prop half of `TERRAIN` should not be generated at volume until `poster.js`
exists and one contact sheet has passed a blind critic** — generating 40 props at 6/10 and
discovering it at atlas time is exactly the waste this A/B was run to prevent.

---

## Appendix — plate index

`docs/refs/probes_ab/`

| plate | what it isolates | verdict |
|---|---|---|
| `z01_9b` | model only (9B, `p09` prompt) | structure fixed, style not |
| `z02_tail_4b` | fix 1 only | partial |
| `z03_steps10_4b` | fix 2 only | **no effect** |
| `z04_tail_9b` | fix 1 + 9B | best of fix 1 |
| `z05_edit_p04ref` | fix 3, cloud ref | overshoots to flat vector |
| `z06_p08stem_9b` | **stem swap only** | **the key result** |
| `z07`, `z08` | "flat poster shapes" | overshoot — do not use |
| `z09_edit_p08ref` | fix 3, hero ref | good, 2nd best zeppelin |
| `z10_winner_9b` | **winning grammar** | **best zeppelin** |
| `z11_winner_9b_seed2` | winning grammar, 2nd seed | reproducible |
| `f01_tail_4b` | fix 1 on FX | improvement, grainy backdrop |
| `f02_steps10_4b` | fix 2 on FX | **no effect** |
| `f03_edit_p04ref` | fix 3 on FX | mild improvement |
| `f04`, `f05` | stem + paint-mark language, ±tail | strong; tail redundant |
| `f06`, `f07` | fix 3 on FX | sumi-e ink wash — wrong medium |
| `f08_varied` | **winning FX grammar** | **best FX plate** |
| `t01_hangar_oldgrammar` | §7 grammar on a prop | **worst plate** — photoreal |
| `t02_hangar_newgrammar` | winning grammar on a prop | real improvement |
| `t03_aagun_newgrammar` | winning grammar, 9B | fails — concept render |
| `t04`–`t07`, `t09`, `t11` | four further prop levers | all fail |
| `t08`, `t10` | 4B + brush language | best props, 6/10 |

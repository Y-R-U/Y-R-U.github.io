# SUNDERFALL — blind critic log & ranked weaknesses

Scores come from blind A/B tests: our frame and a shipped-game reference are staged as `A`/`B` with
the side randomised and the key withheld (`tools/blind.mjs`), then judged against
`tools/critic-brief.md`, where **6 = competent indie, not good enough for this project** and 8 =
indistinguishable from a shipped commercial game.

The point of this file is the **ranked weakness list at the bottom** — once v1 is together, that is
the list we work down.

---

## Round 1 — scene art, static compositions (2026-08-09)

Blind, three pairs. The critic picked our frame as the weaker one in **all three pairs**, which
means the test is measuring something real rather than guessing.

| pair | ours | reference | ref scored |
|---|---|---|---|
| Ori: Will of the Wisps | **4** | 9 | Moon Studios |
| Blasphemous II | **4** | 8 | The Game Kitchen |
| Hollow Knight | **4.5** | 8 | Team Cherry |

Verdict on all three: `ONE MORE PASS`.

**The one-line diagnosis:** *competently drawn asset kits arranged in an editor, not lit scenes.*

Important caveat, which does not excuse the result but does bound it: these are **static
compositions authored outside the engine**. The runtime has a 256-light additive buffer, per-layer
light response and an HDR/bloom chain that none of these frames went through. Some of defect #1–#3
is therefore recoverable at runtime — but the critic is right that the art must carry baked value
structure too, because runtime lighting multiplies what is already there and cannot invent form.

**Follow-up required:** re-run this test against a **real in-engine frame** once the sim lands. That
is what players actually see, and it is the number that counts.

---

## Round 2 — intro cinematic (2026-08-09)

Blind, and structured differently: four of our intro frames were mixed with three shipped-game
frames under neutral names (`frame_1..7`), origins withheld. **The critic sorted them perfectly** —
all three references scored 8–9, all four of ours scored 2–4. Second independent confirmation that
the test measures something real.

| frame | what it is | score |
|---|---|---|
| frame_1 | Ori: Will of the Wisps | 9 |
| frame_2 | Blasphemous II | 8 |
| frame_5 | The Last Faith | 8 |
| frame_4 | **ours** — t24, Rook leaving Thornmere | **4** |
| frame_3 | **ours** — t52, the lifestone meld | **4** |
| frame_7 | **ours** — t3, the cold open | **3** |
| frame_6 | **ours** — t15, the seal + title | **2** |

Verdict on all four of ours: `REBUILD`.

**Caveat on frame_6 (scored 2):** the critic flagged "ghosted serif letterforms baked into the art"
as a hard artifact. That is the **title card mid-fade** — it is meant to be there, and the critic
judged a single frame of an animation out of context. Discount that specific point. Everything else
it said about that frame (monochrome orange wash, uniform particle blizzard at every depth, dead
black lower fifth) stands and is real.

**The intro agent self-scored its cold open 6/10; the blind critic said 3.** That gap is exactly why
this loop exists — self-assessment by the builder is systematically generous.

---

## Round 3 — scene art re-test after the improvement pass (2026-08-09)

Same three references, same filenames, same brief, sides re-randomised until they were **not** all on
one side (the first shuffle put all three of ours on B, which is a confound worth spending a re-roll
on). Like-for-like against round 1.

| pair | round 1 | round 3 | reference |
|---|---|---|---|
| Ori: Will of the Wisps | 4 | **4.5** | 9 |
| Blasphemous II | 4 | **5.5** | 8.5 |
| Hollow Knight | 4.5 | **4.0** ↓ | 8.5 |

**Mean 4.17 → 4.67. One frame went backwards.**

**A2b self-assessed 6.5–7.5. The measured result is 4.0–5.5.** That is the third time on this project
a builder's self-score has come in far above the blind score (the intro agent said 6 where the critic
said 3). Treat every self-assessment as a hypothesis; the pattern is now well established.

**I also called this wrong.** On seeing one regenerated frame I described it as "a real jump". It is
not — it is a marginal improvement. Eyeballing a single image is exactly the bias the blind test
exists to remove, and I should have run the test before commenting.

**Why the pass under-delivered, which matters more than the score:** A2b reported defects 1, 2, 3, 5,
6, 8, 9, 10 and 11 as *fixed*, and the critic independently found **no light model, emissives that
light nothing, nothing connecting to the ground, and no contact shading** still dominating. The work
was genuinely done — `art/tools/light.js` exists and bakes a key — but it is not reaching the frames
being judged. Most likely cause: `refs/ours/*.jpg` are composed by `art/tools/scene.js`, and either
the composition path does not apply the new lighting the way the atlas does, or the baked amounts
are too subtle to survive at composition scale. **Diagnose that before commissioning any further art
work** — otherwise the next pass will also do real work that does not reach the image.

New in this round, and cheap: **distance is being rendered as transparency.** The far arch is
alpha-faded to ~25% so the sky reads *through* the masonry. Distance lifts value and drops saturation
and edge contrast; it does not make stone see-through.

**No further art pass is being commissioned.** The user asked for one improvement round per area, and
scene art has now had it. Everything below is the ranked list for after v1.

---

## Round 4 — THE IN-ENGINE FRAME (2026-08-09) — the one that counts

A real gameplay capture from `game/index.html`, normalised to 1920×1080 JPEG so neither format nor
resolution was a tell, mixed blind with three shipped-game frames.

| frame | score |
|---|---|
| Ori: Will of the Wisps | 9 |
| Blasphemous II | 8 |
| Hollow Knight | 7 |
| **ours — in-engine** | **3** |

`REBUILD`. **Worse than the static compositions (4.0–5.5).** That answers the question round 1 left
open: the runtime lighting does not rescue the art, it currently costs us.

Asked "would this make someone stop scrolling?", the critic said of ours: *"No. At thumbnail size it
is a blue rectangle with three orange dots."* That is the project's stated bar, failed explicitly.

**Two findings were mechanical, not aesthetic, which makes them actionable:**

1. **A global flat tint is collapsing five parallax bands into one value** — visible as a seam at the
   far-left edge and dead-straight horizontal banding at y≈400 and y≈500. Far hills, mid tree and
   near foliage land within ~5% of each other. The haze is doing this. Distance must desaturate
   *and lighten*, not just darken.
2. **The newly-textured sub-ground had become the brightest, highest-contrast surface in frame**,
   dragging the eye off the play plane — a regression introduced this session by the ground fix.

**Fixed after this round was scored** (so the score above predates them):
- Post `saturation 1.06 → 1.0`, `contrast 1.12 → 1.06`. Saturation above 1 pushes a below-average
  channel negative and the composite clamps it; on a blue-dominant night frame that lands entirely
  on red. Measured: **86.4% of all pixels had red at exactly 0.**
- Moon key `(0.46,0.60,1.0) → (0.68,0.76,1.0)` and fill to match. Squared, the old value was a 5:1
  blue-to-red key over a blue ambient. **Red-at-zero 86.4% → 16.9%; mean red 5.4 → 30.9.**
- Sub-ground exposure `0.72/1.50/0.55 → 0.40/1.20/0.30`, so the braziers and fence line are again
  the brightest thing in frame.

Objective metric worth reusing: `scratchpad/chan.mjs`-style per-channel statistics on a captured
frame. **A channel pinned at 0 across most of the image is a bug, not a mood**, and it is measurable
without an opinion. Add it to the tooling properly.

**Still unfixed and now top of the list:** the haze/band collapse (#1 above), the player reading as a
featureless blob against a same-value background, and no contact shading at any junction.

---

## Ranked weaknesses — the working list

Ordered by cost to the image, not by ease of fix. Strike items as they are genuinely fixed.

**Pass 2 (agent `A2b-art-pass2`, 2026-08-09) worked this list down.** What changed, defect by
defect, is in the `A2b-art-pass2` section of `HANDOFF.md`. `refs/ours/*.jpg` have been regenerated
under the same five filenames, so round 1 can be re-run as a like-for-like blind test. Struck =
genuinely fixed in the art. The ones still standing are still standing.

1. ~~**No dominant light source.**~~ **Fixed.** One key for the whole game (`art/tools/light.js`
   `KEY`, upper-left) baked into every prop, debris chunk, ledge, decal and background element via
   `sculpt()`, at per-depth strength. The forest shafts were flipped to agree with it, and the pool
   where each shaft lands is drawn on the ground — the drawn key now lights something.
2. ~~**Local lights cast nothing.**~~ **Fixed.** Emissive props are relit from their own emitter;
   every scene light gets a ground falloff pool, a weak air halo, spill onto neighbours within 1.5×
   its radius, and a short cast shadow thrown away from it.
3. ~~**No cast shadows or contact shading.**~~ **Fixed in the art and in the compositions.** Contact
   darkening and cavity occlusion are baked per object; two-pass contact AO plus a key-direction
   cast shadow are drawn per prop, ledge and raised shelf. Caveat: **the engine still cannot draw a
   sprite cast shadow** — filed as a REQUEST to the renderer owner.
4. **Dead mid-ground — mostly fixed, not closed.** Every `mid` band now carries a knee-to-shoulder
   content layer (receding logs, bracken, fallen masonry), and far/mid/near are separated into three
   genuinely different values. But the three *atmosphere* steps had to be softened: a hard
   full-width value step is a ruled line across the screen and looked worse than the gradient it
   replaced. There is still no readable landmark out there.
5. ~~**Platforms read as level-editor rectangles.**~~ **Fixed.** Seven ledge variants per kind with
   varied width, thickness and surface height, asymmetric rock shoulders breaking the top edge,
   hanging roots and vines under every one, and one-end-open `jl`/`jr` pieces — every scene drives
   one platform into a trunk or a cliff face.
6. ~~**Everything pinned to one horizontal line, with a dead lower third.**~~ **Fixed.** Two ground
   shelves with a cliff between them in every scene, clumped spacing with real gaps, camera dropped
   so the soil cross-section is ~15% of frame, and five to eight near-black foreground elements
   cropped off the bottom edge.
7. **Visible stamp repetition — partly fixed.** 3–4 variants for the seven most-scattered props and
   3 per decal (mirrored, rescaled, value-drifted and **re-lit** after mirroring), published as
   `atlas.json.variants`, scattered in clumps. **Still outstanding:** the brief asked for the two or
   three most prominent instances to be hand-varied rather than instanced at all. They are not —
   these are procedural mirrors, and a close look still finds the same fern.
8. ~~**No focal hierarchy.**~~ **Fixed.** One bright emitter placed directly against the near-black
   base of the hero object in each scene: cyan mushrooms against the oak's roots, brazier against
   the pillar, lamp against the fence line.
9. ~~**Orphan saturated accents.**~~ **Fixed.** A pre-lighting `tone` grade takes 40–50% of the
   saturation out of the orange rock face, the orange brick and the whole timber/foliage set, with
   a cool tint on the worst offenders.
10. ~~**Uniform hard cut-out edges at every depth.**~~ **Fixed.** Progressive softening by depth
    (3.2 / 1.6 / 0.7 px on far / mid / near). Sky and the foreground occluder stay razor-crisp.
11. ~~**Structureless airbrush backdrops.**~~ **Fixed.** A moon — or a hazy sun in glyphglade —
    placed at the key's origin so the light is motivated, a cloud mass run through the same `sculpt`
    so it has a lit edge, and two heavily blurred low-contrast ridgelines.

**Still standing after pass 2:** #4's mid-ground landmark and #7's hand-varied hero instances;
ground runs still repeat every 1024 px with two variants per kind and no per-location tint; **the
art has still not been seen through the engine** (`refs/ours/` is `scene.js` output, and the ambient
has not been re-tuned to the new bands); nothing checked in portrait.

### Intro-specific list — for the single improvement pass, in cost order

Distinct from the scene-art list above, though defects 1 and 3 are the same disease.

**Pass 2 (agent `A3b-intro-pass2`, 2026-08-09) worked this list down.** What changed, defect by
defect, and what was deliberately left, is in the `A3b-intro-pass2` section of `HANDOFF.md`. Struck =
genuinely fixed. **Not re-blind-tested** — the next critic round should re-run frames t3/t15/t24/t52
against the same three references.

1. ~~**Nothing touches the ground.**~~ **Fixed.** Two mechanical causes: every band drifted
   vertically at its own parallax rate (now `parY: 1` everywhere, so a world y is one screen y in
   every band, and recession is staged explicitly at −125 / −72 / −12 / +10 / +85), and the bands
   had no soil of their own (every tree sheet now paints its own bank over the trunk bases at
   `groundY 0.74`, with basal flares, root limbs, a lit top surface and contact + cast shadows).
   `clearing` had no near-ground layer at all — added.
2. ~~**Far bands are barcodes.**~~ **Fixed.** Clustered placement with real gaps, three contrast
   tiers *inside* each band, trunk width decoupled from height, per-tree lean.
3. **Single-hue wash, no light model — largely fixed.** The shadow term was the warm base tinted by
   the ambient, so it stayed warm; it is now the cool ambient itself. One key direction per shot
   (`pal.keyDir`) drives every rim, so adjacent trunks agree about the light; two near bands in the
   two scenes with a practical light in frame opt into the local point light instead. The ambient
   fill was *inverted* against the painted value and is now proportional to it. **Still standing:**
   the grade is still doing some of the work, and `battle`/`clearing` still lean red.
4. **Character silhouettes — Rook fixed, Vayne improved.** Contact shadows under both, a
   negative-space gap between arm and torso, a solid head-and-hair mass instead of a spray of
   spikes, boots with a heel and toe, hands with a palm and thumb, and Vayne's staff planted through
   his hand. **Still standing:** Vayne is a slumped, foreshortened side pose and still does not read
   at 25% the way Rook now does.
5. ~~**Visible VFX bounding boxes.**~~ **Fixed.** The ward's alpha was cut flat at the dome's base
   (the full-width seam); it now fades out inside its own cut. The mist quad had no horizontal
   falloff, so its left and right edges were two vertical seams. A `uFeather` uniform now fades any
   additive quad's own borders.
6. **Undifferentiated particle field — partly fixed.** Ash is three depth tiers with size, opacity
   and speed keyed off depth, and the near tier leaves a hole around whoever is speaking. **Embers,
   fireflies and the title swarm are still uniform** — deliberately, they are subject not atmosphere.
7. **Dead mid-ground and dead black lower fifth — partly fixed.** A near-black foreground band of
   undergrowth (mounds with real gaps, three fern scales, three blade gauges, roots cropping the
   corners) now crops the bottom, and the camera was raised 65–100 px in every scene to make room
   for it. **Still standing:** the bottom ~20% has silhouette but no content, and there is still no
   mid-ground landmark.
8. **Flat-quad craft — partly fixed.** Trunks taper, flare at the base and carry bark striations
   (without interior value a flat fill is all edge and the wide rim lights one whole face — that is
   what made them planks). Grass at three gauges, ferns clumped at three scales. **Still standing:**
   `paintVillage` was not touched; the houses are flat triangles with a thin rim.

**What must survive the pass** (the critic named these unprompted): the ward-dome arch as a framing
device with the figure on the left third looking in is the best composition we have; the concentric
magic circle is correctly foreshortened and well constructed; the dusk gradient in the Thornmere
shot (purple zenith → amber horizon) is genuinely good; the moon-in-the-gap is a real compositional
device; the blue-vs-red complementary idea is sound — it is the execution of the blue that fails.

### Not yet tested (add rounds as these land)

- In-engine gameplay frame vs reference — **the one that actually counts**
- The intro cinematic's five-second wow moment
- Enemy silhouette readability at 25% size in flat black
- Spell impact frames
- HUD / cast circles against shipped-game UI
- Mobile portrait composition

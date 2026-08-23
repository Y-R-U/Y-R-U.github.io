# KITEHAWK — art bible

**Owner: agent C (art direction).** Read `MANAGER_BRIEF.md` first; this file assumes it.

This document exists so a build agent never has to guess a colour, a parallax factor or a prompt.
Where it states a number, use that number. Where it is wrong, say so in a report — do not silently
redesign around it.

Everything here was written against probe plates actually generated on the local Flux service.
They are in `docs/refs/probes/`, the prompts that made them are in `docs/refs/probes.json`, and
§8 says honestly which worked and which did not.

---

## 1. The direction

**We are a hand-painted gouache war poster that happens to move.** Every surface in KITEHAWK looks
like pigment laid on paper with a loaded brush: visible strokes, a paper tooth you can see when the
game is paused, soft airbrushed sky gradients broken by hard poster-flat shapes. The reference space
is *Porco Rosso* and *The Wind Rises* — clouds as sculpted, sunlit, physically-present objects, and
sky as the most beautiful thing in frame — filtered through the flatter, bolder, more graphic
language of WWI recruitment-poster gouache and the war art of C.R.W. Nevinson: strong silhouettes,
limited palettes, warm light against cool shadow, and no fear of leaving large areas of a frame as
one calm colour. The world is painted and the actors are drawn in code, so that every muzzle flash,
burning engine, searchlight and shell burst is a **real light** that falls on the aeroplane, the
cloud beside it and the water below it. Colour is the storyteller: five acts, five distinct theatres
and hours, so the hundredth mission cannot be mistaken for the first.

**We are NOT:**

- **not pixel art**, at any resolution, in any layer, including the UI
- **not cel-shaded anime** — no black ink outlines, no flat two-tone anime shading
- **not flat vector / geometric indie** — no perfectly smooth gradients, no shapes without edges
- **not photoreal, not 3D-rendered, not photobashed**
- **not rubber-hose 1930s ink** (Cuphead) — the era is right, the medium is wrong
- **not grimdark-brown WWI realism.** The subject pulls hard toward mud, khaki and misery. That is
  **Act I only**. A game that is brown for a hundred levels is a failure, however authentic.
- **not "gritty."** This is a WWI *that never was*. Romance beats accuracy every time they collide.

---

## 2. The pillars

Six rules. Each has a test a critic can actually run. A pillar without a failing test is decoration.

### P1 — One warm key light per scene, against cool shadow

Every frame has exactly **one** dominant source. Everything else is fill (large, cool, low contrast)
or an accent (small, hot, deliberate). The key is warm in four acts and cold-white in one (Act IV),
and the shadow is always the complement of the key, never a darker version of it. A shadow that is
just the lit colour multiplied by 0.5 is the single most common way painted art reads as cheap.

> **Test.** Desaturate the frame to luminance and ask a critic to point at the light source and then
> trace the shadow direction on the aeroplane, on the nearest cloud, and on the ground strip. If the
> three disagree, or the critic cannot find the source, P1 is broken. Second test: sample the shadow
> hue and the key hue; if their hue angle differs by less than 40°, the shadow is a multiply and P1
> is broken.

### P2 — Silhouette reads before detail

Every asset is designed as a black shape first. A biplane, a triplane, a zeppelin, a crate under a
canopy, a balloon and a church spire must all be nameable in pure black at 25% scale. Interior
detail is a bonus that arrives when the object is close.

> **Test.** Render the frame as a black-on-white alpha silhouette. Show it to someone who has not
> seen the coloured version and ask them to name every object. If two objects merge into one blob,
> or the answer is "some planes", P2 is broken.

### P3 — Near layers go near-black

The nearest layers — foreground cloud shreds, smoke, the occasional near tree or wire at low
altitude — are **silhouettes**, not illustrations. They sit at or below **12% luminance** and carry
no readable interior detail. This is what buys the illusion of depth for almost no memory, and it is
what stops a very tall viewport reading as a flat wallpaper.

> **Test.** Take the luminance histogram of everything drawn on `FG_OCCLUDE`. The 90th percentile
> must be below **0.12**. If a critic can describe what the foreground object is made of, P3 is
> broken.

### P4 — Light is volumetric, never a sticker

This pillar exists because it survived six rounds of blind critique on NEONHAUL: *"every light
source in this image is a sticker."* A light must put something **into the medium** — a shaft
through a gap in the cloud deck, a searchlight cone with a visible column, a burning engine that
warms the underside of the wing above it and the cloud it flies past, a tracer that briefly lights
the fabric it passes.

> **Test — the removal test.** Delete the light source from the frame and re-render. If nothing else
> in the image changed, it was a sticker and P4 is broken. Run this per source class: sun, flak
> burst, searchlight, fire, muzzle flash, tracer.

### P5 — The texture of paint is visible at rest

Pause the game, zoom in, and you should see brush direction and paper grain. This includes the
**procedural** actors: a code-drawn aeroplane with perfectly clean polygon edges sitting against a
painted sky is the single most obvious tell that the art is two different games. Every procedural
part carries the shared grain overlay and a very slightly irregular edge.

> **Test.** Pause, screenshot, crop a 200×200 patch from a cloud and a 200×200 patch from the
> player's upper wing. Both must have visible non-uniform texture. If the wing patch is a flat fill
> or a clean linear gradient, P5 is broken.

### P6 — Nothing repeats inside one screen

The portrait viewport is very tall, so it shows a great deal of every layer at once — which means
tiling that would be invisible in landscape is glaring here. Repetition is what critics name first.

> **Test.** Screenshot a full level scroll at three speeds and have a human name every repeat they
> can see. Every named repeat is **−1** on the rubric in §9. A visible mirror axis counts as a
> repeat. A landmark appearing twice in one level counts as a repeat.

---

## 3. Why a tall portrait viewport is the art opportunity

A side-scroller in landscape shows a strip of sky. In portrait it shows a **column of atmosphere**,
and atmosphere is the one thing a painter can make beautiful for free. Portrait is not a compromise
we are absorbing; it is the reason the art can be good. The player's eye travels top-to-bottom
through six genuinely different environments before it travels left-to-right through one.

All art keys off a single normalised term:

```
alt = clamp(altitude_metres / 6000, 0, 1)      // 0 = ground, 1 = service ceiling
```

Everything in this document — sky ramps, haze, layer fades, tint — is a function of `alt`. It is
deliberately unitless so it survives whatever world-unit scale architecture picks.

### The six altitude bands

| band | metres | `alt` | what lives here | how it is distinguished |
|---|---|---|---|---|
| **MUD** | 0–300 | 0.00–0.05 | trenches, wire, craters, flooded shell holes, wrecks, the airfield, ground fire, low smoke columns | **Warmest and dirtiest, and the lowest contrast in the game.** Near-monochrome umber and cold grey-green. Haze 0.85. Saturation multiplier 0.55. The most *detail density* of any band — it is crowded and it is claustrophobic. |
| **FLAK** | 300–1200 | 0.05–0.20 | archie bursts, observation balloons and their cables, church spires, factory chimneys, smoke columns rising from MUD | Still hazy (0.60) but contrast starts to climb because flak bursts are **hard black on soft grey** — the first genuinely high-contrast thing you meet. Cooler than MUD by ~15% on hue. |
| **WORK** | 1200–2800 | 0.20–0.47 | the main dogfight band; where crates are dropped and caught; enemy scouts loiter here | The **cleanest, most neutral** band — deliberately the least decorated, because this is where the game is read. Haze 0.35. The sky is the act's mid-ramp colour and largely empty. Emptiness here is a feature: it makes the aircraft the subject. |
| **DECK** | 2800–3600 | 0.47–0.60 | the cumulus deck itself — towers, canyons, gaps, the shafts of light through them | **The highest contrast in the game and the beauty beat.** Sunlit cream tops against violet shadowed undersides, hard-edged shapes, real volumetric shafts. Haze inside a cloud spikes to 0.95 and the whole screen goes near-white; haze in a gap drops to 0.20. This band is the only one whose haze varies *within* itself. |
| **SUNLIT** | 3600–4800 | 0.60–0.80 | above the deck: a white floor of cloud below you, the zeppelin, high bombers, the sun disc | Cold clean blue above, blinding white below. Saturation multiplier 1.0. Haze 0.12. Bottom-lit: everything up here catches **bounce light from the cloud floor**, so the *undersides* of aircraft are bright — the inversion of every other band, and the cheapest way to make this band feel different. |
| **THIN** | 4800–6000+ | 0.80–1.00 | almost nothing. The sun. Ice forming on the wings. The engine faltering. A contrail. | **Deep indigo, near-black at the top of frame, and empty.** Saturation multiplier 0.7, haze 0.04, highest contrast against the sun disc and the lowest object density in the game. Silence and altitude sickness rendered as a colour. |

The emotional shape is a **U in warmth and an inverted U in density**: warm and crowded at the
bottom, cold and clean at the top, with the DECK as the bright golden crown in the middle. Punching
up through the murk of MUD/FLAK into the gold of DECK is the single best-looking thing the game
does, and every act must contain at least one mission that forces the climb.

**A band is not a hard boundary.** All six transitions feather over **±120 m** of `alt`. Nothing in
this game ever changes at a line.

---

## 4. Layer and parallax spec

Drawn back to front. `px` is the horizontal parallax factor (0 = locked to camera, 1 = world speed);
`py` is the **vertical** factor and is a different number on purpose.

| # | layer | `px` | `py` | source | budget |
|---|---|---|---|---|---|
| 0 | `SKY_GRAD` | 0.00 | 0.00 | **shader**, samples the act's `alt` ramp | 0 bytes |
| 1 | `CELESTIAL` | 0.02 | 0.04 | procedural disc + painted glare bloom | 256×256 shared |
| 2 | `CLOUD_FAR` | 0.06 | 0.55 | painted cirrus/veil strip, tiling | 2048×512 RGBA, shared, ~400 KB |
| 3 | `HORIZON_FAR` | 0.10 | 0.85 | painted ridge/coast strip, per act | 2048×192, 5×, ~500 KB total |
| 4 | `GROUND_FAR` | 0.18 | 0.95 | painted field/terrain strip, per act | 2048×256, 5×, ~900 KB |
| 5 | `GROUND_MID` | 0.35 | 1.00 | painted trench/town strip, per act | 2048×384, 5×, ~1.5 MB |
| 6 | `CLOUD_MID` | 0.55 | **1.00** | painted cumulus **cutout atlas**, placed | 8×1024² + 16×512², 2 atlases, shared, ~2.2 MB |
| 7 | `TERRAIN` | 1.00 | 1.00 | painted prop atlas — hangars, guns, balloons, chateau, bridge, wrecks | 2 × 2048² shared, ~2.5 MB |
| 8 | `ACTORS` | 1.00 | 1.00 | **procedural** — aircraft, crates, canopies, pilots | 0 bytes |
| 9 | `FX` | 1.00 | 1.00 | **procedural** particles using a small painted brush sheet | 512×512 brushes, ~90 KB |
| 10 | `CLOUD_NEAR` | **1.35** | 1.00 | painted wisps, near-white, low alpha | 1024×1024, shared, ~350 KB |
| 11 | `FG_OCCLUDE` | **1.70** | 1.00 | painted near-black shreds and low-altitude occluders | 2048×512 mostly-alpha, ~250 KB |
| 12 | `GLASS` | 0.00 | 0.00 | oil spatter, scratches, rain, vignette, and the HUD | 1024×1024 shared, ~200 KB |

**Total painted payload target: ≤ 11 MB.** Hard ceiling **12 MB**. `verify.js` fails the build
above it. Rows 6 and 7 carry the dynamic-zoom surcharge — see *Dynamic camera zoom* at the end of
this section for where the extra 1.9 MB comes from and why 1.3× is the affordable cap.

### The rule that makes altitude legible

**`px` is for depth. `py` must be ~1.0 for anything that has a real altitude.**

If `CLOUD_MID` scrolls vertically at 0.6, then climbing 400 m only moves the deck 240 m up the
screen, and the player can never convincingly get *above* it. The whole design thesis dies quietly.
So the deck, the ground strips and everything the player interacts with sit at `py = 1.00` or very
near it. Only genuinely-distant things (cirrus at 10 km, the sun, the far horizon) get a low `py`,
and there it is physically correct rather than a cheat.

`CLOUD_FAR` at `py = 0.55` is the one deliberate exception: cirrus is far above the ceiling, so it
should approach slowly, and it keeps something alive in the top of a very tall frame.

### Tiling without seams in a tall viewport

Flux never returns a tileable image. Tiling is a **bake step**, not a prompt.

1. Every horizontally-scrolling strip is authored **2048 wide** and made to tile by cross-fading the
   last 128 px into the first 128 px (`tile.js`). Verify by rendering three copies side by side and
   diffing the two joins; a join whose mean absolute difference exceeds 2/255 fails.
2. **Mirroring is banned.** In a tall viewport you see 1500+ px of a strip at once and a mirror axis
   is instantly visible. Instead every strip layer ships **two variants A and B** which alternate,
   giving a repeat period of 4096 with no symmetry.
3. **Landmarks are never tiled.** A chateau, a wrecked bridge, a burning factory, a cathedral are
   placed by level data at authored X positions on `TERRAIN`, one instance each per level. This is
   the real anti-repetition mechanism; the strips are only the connective tissue behind it.
4. `CLOUD_MID` **does not tile at all.** It is a Poisson-distributed placement of atlas cutouts,
   each with a random scale (0.6–1.8), a random horizontal flip, and a per-instance tint jitter of
   ±4% on value and ±3° on hue. 24 distinct cutouts × flip × scale is enough that a repeat inside
   one screen is statistically rare, and P6's test catches it when it is not.

**Vertical is never tiled.** Layers are *placed at an altitude* and fade over a window:

```js
{ altLo: 0.44, altHi: 0.63, feather: 0.04 }   // e.g. CLOUD_MID for a normal act
```

Alpha ramps 0→1 across `feather` at each end. Nothing pops in.

### Lighting and time-of-day tint — the ramp-map

This is the most important technical idea in the document, because it is what lets one cloud atlas
serve five acts and is therefore the main defence against a 100-level game looking like one level.

Painted assets that are **shared across acts** (clouds, brushes, most terrain props, foreground
shreds) are generated deliberately **desaturated and lit from a neutral overcast**, so they carry
*value structure* — which face is lit, which is in shadow — and almost no colour of their own.

At draw time they are **gradient-mapped** through a per-act 256×1 LUT:

```glsl
float L = dot(albedo.rgb, vec3(0.2126, 0.7152, 0.0722));
vec3  c = texture(uRamp, vec2(L, 0.5)).rgb;          // act key→shadow ramp
c = mix(c, uHaze, hazeAmount(alt, layerDepth));       // atmospheric perspective
c *= uTintJitter;                                     // per-instance ±4%
```

One texture fetch. The lit faces land on the act's **key** colour and the shadow faces land on the
act's **shadow** colour, with everything between interpolated — which is exactly how a painter mixes
a limited palette, and it is why five acts can share geometry and still look like five places.

Assets that are **act-exclusive** (the ground strips, the horizon, hero landmarks) are prompted in
the act's palette directly and drawn with a plain multiply tint. They are the minority.

```
hazeAmount(alt, depth) = clamp(depth * actHazeBase * (1.0 - 0.8 * alt), 0.0, 0.95)
```

where `depth` is the layer's own haze weight — `CLOUD_FAR` 1.00, `HORIZON_FAR` 0.95, `GROUND_FAR`
0.80, `GROUND_MID` 0.55, `CLOUD_MID` 0.30, `TERRAIN` 0.18, `ACTORS` 0.06, `CLOUD_NEAR` 0.10,
`FG_OCCLUDE` 0.00 — and `actHazeBase` is in the palette table in §6.

---

### Dynamic camera zoom (DECISIONS D18)

The camera zooms automatically, 0.8×–1.3× of base (a 1.6× span), out to fit a fight and in when the
player is alone, slow, landing, or in a story beat. Three things follow, and the first one costs
real money.

#### How the stack behaves under zoom — the rule that stops layers sliding

**Parallax is a world-space camera offset. Zoom is a uniform magnification applied afterwards.**

```
camL = cam * pL                       // per-layer camera, pL = (px, py)
screen = (worldPos - camL) * zoom + centre
```

If parallax is instead implemented as a *screen-space* scroll multiplier — the obvious shortcut —
then changing zoom changes how much screen a given world motion covers per layer, and **the layers
visibly slide against each other every time the camera breathes**, which reads as the background
being made of loose sheets. That is the single worst thing dynamic zoom can do to painted parallax.
The formula above is not an optimisation; it is the correctness condition.

Consequences, stated so nobody has to reason them out again:

- **Every world layer scales by the same `zoom`.** This is also physically right: a real zoom
  magnifies distant and near things equally — it crops, it does not change perspective. So
  `CLOUD_FAR` at `px 0.06` magnifies exactly as much as `TERRAIN` at `px 1.00`.
- **`SKY_GRAD` and `GLASS` do not scale.** They are screen-locked. `SKY_GRAD` is a function of
  altitude, not of geometry, and `GLASS` is UI.
- **`CELESTIAL` does scale**, despite being at effective infinity, for the same reason a telephoto
  makes the sun bigger. It just moves almost not at all.
- **The sky ramp must be evaluated per-fragment from that fragment's world Y, never once per frame
  from the camera's Y.** Get this wrong and zooming out flattens the sky into one colour, because
  the frame now spans more altitude than the single sample knows about. This is the most likely
  zoom bug in the whole renderer.
- **Layer altitude fades (`altLo/altHi/feather`) are per-object, from the object's own altitude.**
  Zoom does not enter into them, so nothing pops when the camera breathes.
- **Haze rises slightly on zoom-out.** At 0.8× everything is smaller and the layers separate less by
  size, so let them separate by value instead: scale `hazeAmount` by `1 + 0.12 * (1 - zoom/1.0)`
  clamped to `[1.0, 1.12]`. Twelve percent is enough to keep the depth read and small enough that
  nobody notices it happening.

#### What zoom costs in texture memory — and why 1.3× is the right cap

Sharpness requirement: at maximum zoom-**in**, a layer must still have at least its budgeted texel
density per device pixel. Texels scale with the **square** of zoom, so 1.3× costs **1.69×** the
source resolution of a fixed camera on any layer that must stay sharp.

It does not cost that on every layer, because **the density budget is set by spatial frequency, not
by distance.** A deliberately soft painted haze layer at 0.35 texels per device pixel is
indistinguishable from one at 1.0 — the softness reads as atmospheric perspective, which is what we
wanted anyway. Undersampling the far layers is free and correct.

| layer | texels per device px at max zoom-in | why |
|---|---|---|
| `SKY_GRAD` | ∞ | shader — resolution-independent, and therefore zoom is free here |
| `CLOUD_FAR`, `HORIZON_FAR`, `GROUND_FAR` | **0.35** | low-frequency by design; softness reads as distance |
| `GROUND_MID` | **0.60** | has readable features, but sits behind 0.55 haze which hides softness |
| `CLOUD_MID` | **1.00** | the hero layer — the player flies through it and zoom-in frames it |
| `TERRAIN` | **1.00** | landmarks are the anti-repetition mechanism and go soft badly |
| `CLOUD_NEAR`, `FG_OCCLUDE` | **0.40** | near-black silhouettes moving fastest; motion hides everything |
| `ACTORS`, `FX` | ∞ | procedural — vector-sharp at any zoom, which is a real argument for §5 |
| `GLASS` | 1.00 | screen-locked, authored at device resolution, unaffected by zoom |

So the 1.69× bill lands on exactly **two** layers. Fixed-camera they would be `CLOUD_MID` 1.3 MB +
`TERRAIN` 1.5 MB = **2.8 MB**; at 1.3× zoom-in they become **≈ 4.7 MB**, a **+1.9 MB** delta.
`CLOUD_MID` splits into two size classes rather than authoring everything at the largest scale:
**8 large cutouts at 1024²** (the towers you fly past, placed at 1.2–1.8× world scale) and **16
small ones at 512²** (background puffs at 0.6–1.0×). Total art payload goes from ≈ 9 MB to
**≈ 11 MB**, against the 12 MB hard ceiling.

**That is affordable at 1.3× and it stops being affordable almost immediately after.** Because the
cost is quadratic:

| zoom-in cap | sharp-layer texels | sharp-layer payload | total payload |
|---|---|---|---|
| 1.0× (fixed) | 1.00× | 2.8 MB | 9.0 MB |
| **1.3× (D18)** | **1.69×** | **4.7 MB** | **11.0 MB — fits** |
| 1.5× | 2.25× | 6.3 MB | 12.6 MB — **over ceiling** |
| 1.6× | 2.56× | 7.2 MB | 13.5 MB — **well over** |

**Recommendation: hold zoom-in at 1.3× and buy any extra range on the zoom-out side.** Zoom-out
costs nothing in sharpness — it only risks composition and tiling, both of which are addressed
below and both of which are cheap to fix. A 0.7×–1.3× range would be a 1.86× span for no additional
texture memory at all, where pushing the top end to 1.5× would blow the budget for a 15% closer
view. If Aaron wants a bigger dynamic range, **widen it downward.**

#### Zoom-out: tiling and composition

At 0.8× the frame shows 25% more world width, which brings the §4 tiling period into view sooner.
Two adjustments, both free:

1. **Map each 2048-texel strip to 4096 world units** rather than 2048, giving the A/B pair an
   **8192-unit period**. At base the frame shows ~11% of that period and at 0.8× ~14%, so a seam and
   its neighbour can never be on screen together. The resulting texel density on those layers is
   0.5 — comfortably inside the 0.35–0.60 budgets above, so this costs nothing.
2. **Haze +12% on zoom-out**, as specified in the parallax rules. This is the composition fix: when
   objects get smaller they stop separating by size, so make them separate by value instead.

#### Zoom-in is the showcase — the close detail tier

The camera pushes in precisely when the player is alone, slow, landing, or in a story beat — which
means **the zoom-in detail tier is paid for by the enemies that are not there.** The actor and FX
budget is nearly empty in exactly the moments the camera wants to show off, so this tier is close
to free at runtime. Everything below activates on `zoom ≥ threshold` with an alpha fade over the
following 0.1 of zoom, and is simply not drawn below it.

| gate | what appears | why it is not worth it at combat framing |
|---|---|---|
| **≥ 1.05** | **rigging wires** between the wings, full shroud-line count on canopies | sub-pixel at 0.85× — they alias into shimmer and cost draws for nothing |
| **≥ 1.10** | **the pilot**: head turning to track the nearest threat, goggles catching the key light, a hand on the stick, scarf ribbon at 12 segments instead of 4 | the whole pilot is ~9 px tall at combat framing |
| **≥ 1.10** | **world-space brushwork** — visible stroke direction across wing and fuselage surfaces (see the two-grain rule below) | invisible under 20 px, and it fights readability during a fight |
| **≥ 1.10** | **god-ray step count 8 → 16**, and searchlight cones gain a second scattering sample | the extra samples are the calm moment's reward and the fight cannot afford them |
| **≥ 1.15** | **cloud interior volume** — near cutouts get a second offset copy at 0.98 scale and 0.25 alpha, so a cloud has an inside rather than an edge | only reads when a cutout fills a good part of the frame |
| **≥ 1.15** | **engine detail**: individual rotary cylinder heads, exhaust flicker, oil weeping back along the cowl | ~4 px of cowl at combat framing |
| **≥ 1.15** | **fabric ripple** on wing surfaces, catching the rim highlight | amplitude is under a pixel at combat framing |
| **≥ 1.10 and `alt < 0.20`** | **the ground detail tier**: fence posts, individual shell holes, wagons, duckboards, wire pickets — a second small-prop atlas placed only under these conditions | this is a landing/story-beat tier and it never loads during a fight |

**The two-grain rule.** Paper grain is applied in **screen space at a fixed pixel scale and is
always on.** If grain is applied in world space it magnifies with the camera and breathes, which
reads instantly as a post-process filter rather than as paper. But zoom-in must reveal *more* paint,
not the same paint bigger — so a **second, world-space brushwork term** fades in above 1.10×,
carrying actual stroke direction on the surfaces. Screen-locked grain says "this is a painting";
world-locked brushwork says "this was painted by a hand". You need both, and they are separate
textures for a reason.

---

## 5. Paint the world, code the actors

This is the rule that made Sunderfall read as expensive, and it is not an aesthetic preference — it
is a **lighting** decision. A painted sprite has its light baked in and can only ever be multiplied
by a tint. A procedurally drawn object can be lit, from any direction, by any number of moving
lights, in real time. So:

> **If a thing must respond to light that moves, or must deform, bank, break apart or burn, it is
> drawn in code. If it is large, distant, static and expensive to fake, it is painted.**

### The split, decided

| **PAINTED** (Flux → key → trim → atlas) | **PROCEDURAL** (drawn in code from primitives) |
|---|---|
| cirrus veils, cumulus cutouts, foreground shreds | **every aircraft** — player, enemy, bomber, boss |
| ground strips (far + mid), horizon ridges | **parachute canopies** and their shroud lines |
| terrain props: hangars, tents, AA guns, balloon envelopes, church, chateau, bridge, factory, wrecked tank, telegraph poles, wire | supply **crates** (they tumble, and they get shot) |
| the **zeppelin envelope** and its separable gondolas, nacelles and gun tubs | smoke, fire, oil, steam, dust |
| the sun's glare bloom sprite | **tracer**, muzzle flash, gun smoke |
| particle **brushes** (soft blob, streak, ragged puff, spark) | explosions, flak bursts, ground detonations |
| paper grain, oil spatter, scratches, vignette | water, rain, snow, ice accretion |
| the instrument coaming and HUD bezels | god rays / volumetric shafts, searchlight cones |
| | all damage: holes, torn fabric, oil streaks, flame trails |
| | the sun disc itself |

Two entries deserve their reasoning said out loud.

**The zeppelin is painted but rigged.** It is enormous, nearly static, and never banks, so painting
it is honest. But it must be *dismantled* by gunfire, so it is painted as **seven separate pieces**
— envelope fore, envelope mid, envelope aft, control gondola, two engine nacelles, one dorsal gun
tub — hung on a code-driven rig. Each has its own hp and detaches on death. When the envelope goes,
the gas fire is procedural and it lights everything within 900 m, including the player's aeroplane
and the underside of any cloud above it. That single moment justifies P4 on its own.

**Flak bursts are procedural, but they use painted brushes.** Particle *motion, count, colour and
life* are code. The texture each particle stamps is a painted ragged puff from the brush sheet, so a
flak cloud is made of gouache marks rather than soft Gaussian blobs. This is the general contract
for all FX: **code owns the behaviour, paint owns the mark.**

### Drawing spec — the aeroplane

Everything that flies is a **part tree** in the airframe's local frame, drawn back-to-front, then
rotated into the world by the airframe's attitude. There are no aircraft sprites and no sprite
sheets. Adding the triplane is adding a wing entry to a table.

**Part order (back to front).** "Far" means the side of the aeroplane away from the camera.

```
 1  wing_lower_far      8  cockpit_coaming + pilot head/shoulders + scarf ribbon
 2  wing_upper_far      9  tail_near   (fin, tailplane, rudder)
 3  tail_far           10  strut_near ×N, rigging_wire ×N
 4  strut_far ×N       11  wing_lower_near
 5  fuselage           12  wing_upper_near
 6  engine_cowl        13  aileron_near, elevator, rudder  (deflect with input)
 7  prop_disc          14  decals: roundel, serial, personal marking
                       15  damage overlay: holes, torn fabric, oil streak, flame
```

Far-side parts are drawn at **0.62× value and +0.10 haze**, which reads instantly as "that is the
other side of the aeroplane" without any 3D.

**Banking in 2D.** The camera is side-on, so a roll is sold three ways at once, and only the first
is obvious:

1. **Chord foreshortening.** Each wing's chord (its vertical extent on screen) scales by
   `|cos(roll)|`, so at 90° of bank the wings become near-lines and the aeroplane reads as a knife.
2. **Far-wing offset.** The far wing slides vertically by `sin(roll) * gap` where `gap` is the
   biplane's interplane gap, so the two wings scissor apart and back together. This is the cue that
   actually communicates roll direction.
3. **Draw-order swap.** Past 90° of roll the far and near sets exchange places in the part order.
   Forget this and the aeroplane turns inside out at the top of a loop.

**Shading — three tones per part, never one.** Each part declares a 2D **normal direction** (the
direction its surface faces on screen). It is drawn as a lit band and a shadow band split along the
line perpendicular to `lightDir`, plus a rim highlight on the edge facing the light:

```
lit    = base * (ambient + key * max(0, dot(n, L)))
shadow = base * (ambient + fill * 0.35)          // fill is the act's cool fill colour
rim    = key  * pow(max(0, dot(edgeNormal, L)), 3.0) * 0.8
```

`ambient` is the act's fill; `key` is the act's key. **Local lights add on top**: muzzle flash,
burning engine, flak flash, searchlight, tracer passing, ground fire. This is the payoff — the same
aeroplane looks different in every act and different every second in a fight, for zero art cost.

**Component damage.** Every part carries `hp`, and there are three visual states:

- **≥ 50%** — clean.
- **< 50%** — the part stamps 2–6 **holes** (alpha punches from a small painted hole brush, placed
  by the part's own RNG so they are stable frame to frame), and fabric parts gain a torn flap that
  animates with airspeed.
- **0%** — the part **detaches**. It becomes a free rigid body with the airframe's velocity plus a
  tumble, and the parent's silhouette is replaced by a **torn variant**: a jagged polygon boundary,
  not the same shape at lower alpha. P2 depends on this — a shed wing must make the aeroplane a
  visibly *different shape*, because that is how the player reads that it is dying.

Shedding a wing removes that wing's lift contribution, so the aeroplane departs into a spin on its
own. The art and the sim agree because they read the same part table.

**Trails.** Damage state drives emitters, not the other way round: engine < 60% emits grey-blue oil
smoke, engine < 25% emits black smoke plus intermittent flame, fuel tank hit emits a white fuel
mist that ignites on contact with any fire source. A burning aeroplane is a **moving light** and
must be registered as one.

**Scale.** A single-seat scout is drawn at a **heroic** scale, not a physical one — it must be a
readable, characterful object in a portrait frame, not an accurate 8.5 m speck. Exact world units
are architecture's to set; the art constraint is that a scout's span occupies **11–14% of the
portrait viewport width**, a two-seater 16–19%, a bomber 26–32%, and the zeppelin is measured in
screens, not percentages — it should not fit in one.

### Drawing spec — the parachute crate

The signature mechanic must be the best-drawn object in the game.

The **canopy** is a code-drawn ribbon of 12 segments forming a hemisphere-in-profile, each segment
independently shaded so the canopy has a lit crown and a shadowed skirt and a translucent rim where
the sun is behind it. It **breathes** — a low-amplitude sine along the segment index — and it
**collapses** when shot: the segment nearest the hit loses tension, the canopy folds asymmetrically,
the crate swings, and the descent rate roughly doubles. Silk is thin, so at `add`-blend the canopy
picks up a rim of the act's key colour when back-lit, which is the prettiest thing in the game and
costs one extra draw.

Shroud lines are 8 thin lines with a slight catenary sag. The **crate** is a painted-look box drawn
as six shaded quads with a stencilled marking decal, and it tumbles when the canopy dies.

---

## 6. Per-act palettes

Five acts, five theatres, five hours of the day, five weather premises. **This table is the main
defence against a 100-level game looking like one level.** Use these hex values literally.

The systematic rule underneath it: **no two acts share a key/shadow relationship.**
I is cool-key/cool-shadow (dead). II is warm-key/violet-shadow (classic). III is cool-key/black-shadow
with one hot accent. IV is white-key/blue-shadow (the only cold key). V is hot-key/black-red-shadow.
If a sixth act is ever added it must find a sixth relationship, not reuse one of these.

### Act I — *The Line* — Flanders, overcast morning, mud and wire

> **Mood:** the war as it actually was. Cold, dirty, close, and it does not want you up here.
> The one beauty beat is the moment you climb through the overcast and find blue.

| role | hex | notes |
|---|---|---|
| key | `#C9CEC4` | weak green-white daylight diffused through cloud — barely a key at all |
| fill | `#7E8A8C` | |
| shadow | `#2E3639` | |
| haze | `#9EA9A6` | `actHazeBase` **1.15** — the haziest act |
| accent | `#C2582A` | ember/tracer orange. The **only** warm thing in the act. Ration it. |

Sky ramp by `alt`:
`0.00 #6B6558` → `0.05 #8A8B7E` → `0.20 #A3A79A` → `0.47 #B9BDB2` → `0.60 #CFD3C9` → `0.80 #7FA2BE` → `1.00 #4E7FA8`

Saturation multiplier 0.60. Above `alt 0.62` the overcast breaks and the ramp swings blue — that
inflection is the act's entire emotional payload and no mission should hide it.

### Act II — *Gold Hour* — the Somme valley, late afternoon, high summer

> **Mood:** the beautiful war. This is the act that sells the game and the act every screenshot
> comes from. Towering cumulus, low gold sun, long violet shadows.

| role | hex | notes |
|---|---|---|
| key | `#FFE1A8` | |
| fill | `#D9A96A` | |
| shadow | `#4A3B57` | **violet, not brown.** The textbook warm-key/cool-shadow pair. |
| haze | `#E8C9A0` | `actHazeBase` **0.85** |
| accent | `#3E6B8C` | cool blue — the accent is the *complement* here, not another warm |

Sky ramp:
`0.00 #8A7350` → `0.05 #B39668` → `0.20 #D8B77E` → `0.47 #EBCF97` → `0.60 #F3DCA6` → `0.80 #9CBBD1` → `1.00 #3B6E9E`

Saturation multiplier 1.00.

### Act III — *Night Raid* — a blacked-out coast, moonlight, searchlights, zeppelins

> **Mood:** black, silver and one hot orange source at a time. You fly by the shape of things
> against the moon, and everything that lights up is trying to kill you.

| role | hex | notes |
|---|---|---|
| key | `#B9CBE6` | the moon |
| fill | `#2C3A55` | |
| shadow | `#0A0E18` | effectively black |
| haze | `#1A2436` | `actHazeBase` **0.70** |
| accent | `#FF8A2B` | fire, sodium searchlight, tracer. The whole act is built around this being rare and enormous when it happens. |

Sky ramp:
`0.00 #080B12` → `0.05 #0E1420` → `0.20 #162032` → `0.47 #1E2B42` → `0.60 #2A3A57` → `0.80 #38506F` → `1.00 #4A6688`

Saturation multiplier 0.75. **P3 is nearly free here and P1 is nearly impossible** — with no sun,
the key is whatever is burning. Every night mission must contain at least one large moving light.

### Act IV — *The White Front* — the Alps, high-altitude noon, snow and glare

> **Mood:** blinding, thin, silent. The most beautiful and the most hostile. The only act with a
> cold key, and the only act where the ground is brighter than the sky.

| role | hex | notes |
|---|---|---|
| key | `#FFFFFF` | |
| fill | `#C7D9E8` | |
| shadow | `#5A76A0` | blue snow shadow |
| haze | `#DCE9F2` | `actHazeBase` **0.55** — the clearest air in the game |
| accent | `#E8452F` | one red airframe, one flare, one flag. A single blood spot on white. |

Sky ramp:
`0.00 #D3DEE6` → `0.05 #C8D8E6` → `0.20 #A9C4DC` → `0.47 #8AB0D4` → `0.60 #6A98CC` → `0.80 #3F73B8` → `1.00 #12386F`

Saturation multiplier 0.85. Note the ramp *darkens* upward far harder than any other act — at
`alt 1.0` the top of the frame is near-space indigo while the bottom of the same frame is white
snow glare. That is the widest vertical value range in the game; use it.

### Act V — *The Burning Sky* — the final offensive, dusk, a sky full of smoke

> **Mood:** apocalyptic. The sun is a dull red coin behind smoke, ash is falling upward as often as
> down, and there is exactly one clean cold light left in the world.

| role | hex | notes |
|---|---|---|
| key | `#FF9A4A` | |
| fill | `#A8492E` | |
| shadow | `#2A1418` | black-red |
| haze | `#6E3428` | `actHazeBase` **1.00** — smoke, not moisture: haze is *dirty* here and should be given a slight per-band drift |
| accent | `#F5E2B0` | a pale cold star or a searchlight — the last clean thing |

Sky ramp:
`0.00 #160C0E` → `0.05 #3A171A` → `0.20 #6E2A22` → `0.47 #A8492E` → `0.60 #D9682F` → `0.80 #8C5A4E` → `1.00 #3C3A52`

Saturation multiplier 0.95. **The one act where the ramp is non-monotonic in warmth** — hot in the
middle, cold-grey at the very top — because the smoke thins out and you break into a dead evening
sky. It should feel like escaping.

### The daily / endless modes

Endless ("The Long Patrol") and the daily challenge do not get a sixth palette. They **cycle** the
five, transitioning across a ramp lerp over 40 seconds at each wave boundary, which turns the act
palettes into a time-of-day system for free and makes a long run look like a long day.

---

## 7. The generation pipeline

All painted art is generated locally. Nothing third-party ships.

### The service

`http://localhost:7867` — **mflux-queue**. Model **`flux2-klein-4b`**, **14–18 steps**, guidance 1.0,
all dimensions a **multiple of 16**. `POST /api/generate` returns `{job_id}`; poll
`GET /api/jobs/<id>` until `status == "done"`; fetch `GET /api/jobs/<id>/file/<n>`.

**Before any batch, check two things:**

```bash
curl -s localhost:7867/api/status   # queue_depth — a depth of 30+ is an hour, do not start
curl -s localhost:7866/api/status   # worker_warm — if LTX holds a worker, WAIT for it to drop
```

Flux and LTX cannot both hold a worker in 24 GB. LTX releases after 120 s of queue idle. The queues
serialise themselves — **never invent a lockfile.** Measured throughput on this machine at 14–18
steps: **33–70 s per plate**, roughly linear in pixel count. Budget ~1 minute per asset.

The generator is `docs/refs/gen.py` (moves to `art/tools/flux.py` when the build starts). It skips
outputs that already exist, so a batch resumes.

### Prompt grammar

Every prompt is exactly six clauses in this order. The first is **verbatim, always, in every
prompt** — a constant stem is the single largest consistency lever we have.

```
[STEM] , [SUBJECT] , [VIEW] , [LIGHT] , [PALETTE] , [ISOLATION]
```

**STEM (constant):**
> `Hand-painted gouache painting, WWI recruitment poster art, visible brush texture and paper grain,`

**SUBJECT** — one noun phrase and its parts. Concrete objects, no adjectives of quality.
**VIEW** — one of: `flat straight-on side elevation, orthographic` / `top-down oblique aerial view` /
`seen edge-on from the same altitude` / `shallow oblique from low altitude`.
**LIGHT** — direction and quality: `low warm sun raking from the left, cool violet shadow on the
undersides`. For **shared** assets that will be ramp-mapped, this clause is instead
`even overcast light, low saturation, neutral grey-blue` — see the neutral-light rule below.
**PALETTE** — for act-exclusive assets only, name the act's key/shadow/haze hexes as colour words.
Omit entirely for shared assets.
**ISOLATION** — for anything that gets keyed:
> `completely isolated on a flat uniform neutral mid grey background, 2D game asset cutout, no sky,
> no ground, no cast shadow`

### The neutral-light rule

Assets **shared across acts** (cumulus atlas, cirrus, foreground shreds, most terrain props, FX
brushes) are generated under *even overcast light, low saturation*. They must carry value structure
and almost no colour, because the ramp-map in §4 supplies the colour at runtime. **A cloud atlas
with a golden sunset baked in cannot be reused at midnight, and generating five atlases is five
times the memory for a worse result.**

Act-exclusive assets (ground strips, horizon ridges, hero landmarks) are prompted in the act
palette directly. They are the minority and they are the only place a baked-in colour is allowed.

### Seeds and consistency

- Each act has a **seed base**: I = 1000, II = 2000, III = 3000, IV = 4000, V = 5000. Shared
  cross-act assets use base **0**.
- Each asset in a manifest gets `seed = base + index`, recorded in the manifest, **never** implicit.
- A re-roll is `base + index + 100*k`, `k` incrementing, and the accepted `k` is written back into
  the manifest. **Never regenerate without recording the seed.** A batch must be reproducible from
  the manifest alone.
- **Proven:** holding the seed and the structural clause constant while swapping only the palette
  clause produces the *same composition in a different hour*. `p01`/`p02` in `docs/refs/probes/`
  are one seed (1701) and two palettes, and they share layout. This is how a family of act variants
  of the same landmark gets made.

### The bake

Flux output is never shipped. Six deterministic steps, all of which have a working precedent in
`gms/2d/sunderfall/art/tools/` — **port those, do not rewrite them.**

1. **`crop.js` — trim the artefact border.** Non-negotiable and it is the first step for a reason:
   this model has a strong prior toward painting *a photograph of a printed artefact*, so it adds a
   cream paper mount, and often a painted signature and a caption (see §8). A fixed inset crop of
   **4% on every edge, 8% on the top and bottom of wide strips**, removes all of it deterministically.
   Fighting this in the prompt does not work; cropping always does.
2. **`key.js` — cut the grey backdrop to real alpha.** Flat-key against the sampled backdrop, flood
   fill from the border so interior areas matching the backdrop stay opaque, then **colour
   decontamination** to unmix the grey out of the soft edge. Skip the decontamination step and every
   cutout wears a pale halo the instant it sits against a dark sky — which is most of Acts III and V.
3. **`trim.js`** — trim to the content bbox, record the offset in the manifest.
4. **`tile.js`** — strips only. Cross-fade the last 128 px into the first 128 px, then verify by
   compositing three copies and measuring the joins. Mean absolute difference over 2/255 fails.
5. **`ramp.js`** — build the per-act 256×1 LUT PNGs from the hex ramps in §6. These are generated
   from this document, not hand-painted, so a palette edit is a one-line change.
6. **`atlas.js` → `verify.js`** — pack into 2048² atlases, 4 px padding, emit JSON. `verify.js`
   asserts: no atlas over 2048², every manifest entry present, no fully-transparent entry, total
   committed bytes under the §4 ceiling — **and dumps a contact sheet that a human looks at.** An
   automated pass is not a look.

### Where files land

```
kitehawk/
  docs/refs/            THIS PHASE — gen.py, probes.json, probes/ (committed, they are the evidence)
  art/
    src/*.json          manifests: prompt, seed, size, steps, model. The reproducible source.
    tools/              crop key trim tile ramp atlas verify   (ported from sunderfall)
    raw/                gitignored — raw Flux output
    work/               gitignored — keyed / trimmed intermediates
  game/assets/          COMMITTED — atlases, ramp LUTs, JSON. The only art the game loads.
```

`art/raw/` and `art/work/` are gitignored; the manifest plus `gen.py` reproduces them.
`docs/refs/study/` is gitignored too — see §9, third-party reference plates never enter the repo.

---

## 8. PROVE IT — what the probes actually showed

Ten plates were generated on 2026-08-23 against a completely idle queue (`queue_depth: 0`,
`worker_warm: false` on both 7867 and 7866). Total wall time **~9.5 minutes** for ten plates at
14–18 steps. Every prompt is in `docs/refs/probes.json`; the generator is `docs/refs/gen.py`.

| file | what it was probing | verdict |
|---|---|---|
| `probes/p01_sky_dawn.png` | tall 512×1024 dawn sky column | **works** (with a caveat) |
| `probes/p02_sky_dusk.png` | same seed, dusk palette — the variant test | **works — the key result** |
| `probes/p03_cloud_deck.png` | 1024×384 sunlit cumulus deck seen edge-on | **excellent** |
| `probes/p04_cloud_cutout.png` | isolated cumulus on flat grey, keyable | **excellent — the pipeline result** |
| `probes/p05_ground_trench.png` | 1024×256 battlefield strip | **excellent** |
| `probes/p06_ground_fields.png` | 1024×256 farmland strip | **works after cropping** |
| `probes/p07_hero_4b.png` | the Act II money shot, `flux2-klein-4b` | **works — direction confirmed** |
| `probes/p08_hero_9b.png` | identical prompt and seed, `flux2-klein-9b-mlx-4bit` | **better — see below** |
| `probes/p09_zeppelin.png` | isolated hard-surface object on flat grey | keys fine, **style drifted** |
| `probes/p10_flak.png` | isolated FX puff sheet | keys fine, **style drifted** |

### What worked, and what it means

**1. The direction is achievable, and it is achievable on the first try.** `p07` and `p08` are a red
biplane banking over a sunlit cumulus deck with a supply crate under a canopy, warm key from the
left, violet shadow on the cloud undersides, visible paper grain. That is the game's target frame
and the local service produced it in about a minute from a prompt that follows §7's grammar. This
is the single most important thing this phase established: **"stunning" is not a hope, it is a
throughput question.**

**2. The grey-cutout clause is the whole asset pipeline, and it is clean.** `p04` returned a
painterly cumulus on a genuinely flat, uniform grey field with crisp edges — directly keyable by
Sunderfall's `key.js` in `flat` mode with no manual work. It also has real value structure: cream
sunlit top-left faces against violet-grey shadowed undersides, exactly the input the §4 ramp-map
needs. **The `CLOUD_MID` atlas of 24 cutouts is roughly 25 minutes of queue time.**

Second-order finding: the `2D game asset cutout` clause also **suppresses the paper-mount artefact**
described below. Cutout prompts come back clean; full-bleed scene prompts do not.

**3. Seed-locked palette variants work.** `p01` and `p02` share seed 1701 and structural clause and
differ only in the palette clause. They came back with the **same composition in two different
hours** — same banding, same horizon position, same weight distribution. This is the mechanism for
producing act variants of a landmark, and it means a chateau can appear in Acts II and V as
recognisably the same building in different light.

**4. Paint texture is free.** Every plate has visible brush direction and paper tooth without being
asked for it beyond the STEM clause. **Pillar P5 costs nothing on the painted side** — which moves
the entire P5 risk onto the *procedural* actors, where it belongs (see the risk below).

**5. `p05` is the strongest single plate.** The Nevinson reference landed exactly: zigzag trenches,
flooded shell holes, splintered black stumps, near-monochrome umber against cold grey-green, low
contrast, drifting smoke. Act I's MUD band is solved.

Note on obliquity: `p05` and `p06` came back as a fairly **steep** aerial view. That is right for
`GROUND_FAR` seen from the SUNLIT band and wrong for `GROUND_MID` seen from FLAK. Use
`shallow oblique from low altitude, strong horizontal banding` in the VIEW clause for `GROUND_MID`.
The differing obliquity between the two strip layers is itself a depth cue — exploit it.

### What did NOT work — say it plainly

**A. `negative_prompt` is close to inert on this model at guidance 1.0.** Every plate that was told
`no text, no signature, no border` produced at least one of them:

- `p07` painted garbled lettering on the fuselage (`ORÖIE`) **and** a painted artist's signature in
  the bottom-right **and** a cream paper mount around the whole image.
- `p06` invented printed captions along the top and bottom edges — it rendered *a plate from a
  book*, not the subject.
- `p05` has a signature bottom-right.
- `p01` was told `no clouds` and painted a cloud deck across the bottom third.

**This model has a strong prior toward depicting a photograph of a printed artefact** — mount,
signature, caption and all. Fighting it in the prompt does not work. **The fix is deterministic and
it is already in §7 step 1: crop 4% off every edge, 8% off the top and bottom of wide strips.** That
removes the mount, the caption and the signature every time, for free, with no re-rolls. Do not
spend queue time trying to prompt it away.

The corollary matters for the shipped game: **never ask Flux for lettering.** Every roundel, serial,
stencil and crate marking is drawn in code as a decal (§5). This is not a workaround, it is better —
decals need to be per-airframe and per-ace anyway.

**B. `flux2-klein-9b-mlx-4bit` beats `flux2-klein-4b` on structured subjects, and the brief's
default should change.** `p07` and `p08` are the same prompt and the same seed. The 9B took 96 s
against the 4B's 69 s — **39% slower** — and returned:

- no paper mount, no signature, no garbled text
- correct aircraft structure: real interplane struts, rigging wires, a visible pilot, a prop disc,
  an undercarriage that attaches to something
- a better read on the parachute and its shroud lines

The 4B's aeroplane is a pleasing smear; the 9B's is an aeroplane. **Recommendation: 9B for anything
with hard structure** — aircraft, the zeppelin, buildings, vehicles, HUD bezels — **4B for
atmospherics**, where it is faster and its more opaque, poster-like handling is actually closer to
the gouache target than the 9B's wetter watercolour. Manifests carry `model` per entry, so this is
a per-asset field, not a global.

**C. Hard-surface and FX subjects drag the style out of gouache.** `p09` (zeppelin) came back
looking like a photoreal render on a grey field, and `p10` (flak puffs) came back looking like
generic digital smoke. In both, the mechanical or effect-like subject overpowered the STEM. Three
things to try, in order, and this is the **one open pipeline question**:

1. Repeat the medium clause at the **end** of the prompt as well as the start, and add
   `thick opaque gouache, matte, no gloss, no specular highlights, no photographic detail`.
2. Drop to **10–12 steps** — fewer steps push the model away from photographic detail.
3. Use the **multi-ref edit mode** with `p03` or `p04` as a style reference, which is what that mode
   is for and which we have not yet exercised.

`p09` also produced mooring cables running off the frame edges, which will key badly — add
`no cables, no ropes, no mooring lines` to the SUBJECT clause rather than the negative, since
negatives do not work.

`p10` validates the §5 decision on its own terms: those puffs are fine as **brush source material**
but they are not flak. Flak has to be procedural particles that flash, expand, drift and light the
aeroplane. A stamped painted puff would have been a textbook P4 sticker.

**D. `p07`'s sun is the P4 failure mode, drawn for us.** It painted literal straight sun rays behind
the cloud. It looks nice in a static plate and it would be indefensible in motion, because nothing
else in the frame acknowledges it. That plate is a useful permanent example of why every light in
this game is code and why P4's removal test exists.

### What this changes in the plan

- §7 step 1 (crop) is promoted from housekeeping to **mandatory first step**.
- `model` becomes a **per-asset** manifest field, defaulting to 4B for atmospherics and 9B for
  structure. This contradicts the manager brief's blanket `flux2-klein-4b`; flagged as a REQUEST.
- All lettering moves to code decals, permanently.
- The style-drift fix for hard-surface subjects (C above) is the first thing the art build agent
  should resolve, with a five-plate A/B, before generating the terrain prop atlas.

## 9. The quality bar and the critic protocol

### Why this section exists

**Builders self-score 7–8 on work that critics score 3.** This is the most reliable finding in this
repo and it has been reproduced on multiple projects. The builder's own opinion of the art is not
admissible evidence. Neither is the manager's. The only evidence is a blind score.

### The method

1. Take our render and a **real reference plate**, both cropped to the same aspect.
2. Present them to a fresh critic agent **side by side, unlabelled, in randomised order**, and ask:
   *which of these is the shipped professional frame, and why?* Then ask for a score on each, on the
   rubric below, and for a **differences list**.
3. **Never tell the critic which is ours.** Never reuse a critic across rounds — a critic that has
   seen a previous round is contaminated.
4. **Three fresh critics per round**, on **three shots**: an Act II day frame, an Act III night
   frame, and an Act I mud frame. One shot is not a result.
5. Report the **gap** — our mean minus the reference mean — not our absolute score.

### The rubric — 0 to 10 on each axis

| axis | the question |
|---|---|
| **Light hierarchy** | Is there one dominant source with real falloff, or is everything lit by the same flat ambient? |
| **Colour depth** | Do the depth layers differ in *colour temperature*, or only in fog density? |
| **Silhouette read** | Can you name every object from its shape alone at 25% scale? |
| **Paint quality** | Does it look painted at rest, or does it look like flat vector and clean gradients? |
| **Composition** | Does the frame have a subject and a path for the eye, or is it wallpaper? |
| **Repetition** | Any visible tile seam, mirror axis or repeated element. **−1 per repeat named.** |

### The gate

Two conditions, both required, before the art is called done:

- **Mean gap ≥ −2.0** across three critics × three shots.
- **For two consecutive rounds, no critic uses the words** *flat*, *uniform*, *the same ambient*,
  *sticker*, *tiling*, *repeated*, or *wallpaper* in a differences list.

The second condition is the real one. On NEONHAUL the numeric gap moved −5.17 → −5.00 across a
whole art pass, which is inside a **±1.5 noise floor** and therefore not a result — while the
*differences lists* changed completely and told us exactly what was fixed and what was not. **Read
the differences lists, not the scores.** A gate that passes on a number while a critic is still
saying "sticker" has not passed.

### The reference plates

Study material only. **Third-party art never enters the repo** — it goes in `docs/refs/study/`,
which is gitignored, and the manager places it there locally.

| what | why it is the reference |
|---|---|
| *Porco Rosso* (1992), the Adriatic flight and cloud-canyon sequences | cumulus as sculpted sunlit objects; sea and sky colour; a red aeroplane that reads as a character |
| *The Wind Rises* (2013), the dream-flight and high-altitude sequences | light through air; the emotional use of altitude; restraint |
| C.R.W. Nevinson, *The Harvest of Battle* / his aerial war paintings | the MUD band, exactly. Aerial battlefield as near-monochrome design. |
| Frank Brangwyn and Norman Wilkinson WWI poster lithographs | poster-flat shapes, limited palette, heavy silhouette |
| *Ori and the Will of the Wisps* | painted parallax with genuine volumetric light — the bar for P4 |
| *Gris* | palette-driven acts; how far one colour relationship can carry a whole chapter |
| *Planet of Lana* | silhouette-first foreground against painted depth — the bar for P2 and P3 |

Our own probe plates in `docs/refs/probes/` are **ours** and may be used freely, including as
`img2img`/edit references, and `p07`/`p08` are the intended look of an Act II frame.

---

## 10. UI and HUD art

The image is the product. A HUD that sits on top of a painted sky and fights it is the fastest way
to make a beautiful game look cheap, and a phone gives us less room to be careless.

### The governing principle

**The HUD is on the glass or on the aeroplane. It is never floating in the sky.** Every element is
one of three things:

- **Coaming** — engraved into a painted instrument panel at the very bottom of the frame.
- **Glass** — drawn on the `GLASS` layer, at low alpha, reading as marks on a windscreen.
- **Diegetic** — it is not UI at all; it is a thing in the world you look at.

Nothing is a floating rectangle with a drop shadow.

### The elements

**The coaming.** The bottom **14%** of the portrait frame is a painted strip of doped canvas, brass
and worn leather — one generated asset, drawn once per frame, zero per-frame cost. It sits *below*
the safe-area inset and it is in the thumb dead-zone, so it costs no playable screen. It carries the
speed arc, the ammo belt and the engine gauge. In landscape it splits into two bottom corners.

**Altitude — the ribbon.** Not a number floating in space. A **24 px vertical ribbon pinned to the
right screen edge, running the full height of the playfield**, divided into the six bands of §3 as
coloured segments drawn from the act's own ramp — so it can never clash, in any act, by
construction. Your aircraft is a small brass chevron on it. This is the design thesis made visible
and it is the most important HUD element in the game. Alpha 0.35 for the ribbon body, 0.85 for the
marker and the band boundaries.

**Speed and energy — the arc.** A brass arc in the coaming's bottom-left with a needle, redline
painted in. Behind it a second **ghost needle showing total energy** (speed traded against altitude)
so the player learns the trade by watching the two diverge. That single second needle teaches the
entire flight model without a tutorial line.

**Ammo — the belt.** Not a number. A row of ticks along the coaming that visibly empties, left to
right, like a belt feeding. Below 20% the remaining ticks turn the act's accent colour. Reloading
after a crate is a visible refill animation.

**Damage — on the aeroplane.** There is *no* damage bar. You read your condition by **looking at
your aeroplane**: holes, torn fabric flapping, a dead prop, oil on the glass, smoke. The only
instrument is a small engine gauge in the coaming that creeps into the red. This is a beauty win
that also happens to be less UI, and it is the reason component damage in §5 must be legible.

**Crates.** A small painted parachute glyph rides **on the altitude ribbon** at the crate's real
altitude and slides down it in real time, so the ribbon answers "where is it and can I get there"
in one glance. White canopy = unclaimed; act-accent = falling to the enemy field. Off screen
horizontally, it also gets an edge chevron in its direction.

**Off-screen threats.** A thin **arc segment** on the frame edge in the threat's direction, drawn on
`GLASS`, ~18 units long, alpha ramping 0.25 → 0.80 with proximity, tinted by threat class. No boxes,
no exclamation marks, nothing that occludes the aeroplane. If more than three are on screen, merge
the nearest three and drop the rest — a cluttered edge reads as noise, not danger.

### The contrast rule, stated numerically so nobody guesses

The HUD must read against **both** `#FFFFFF` (Act IV snow) and `#080B12` (Act III night). So every
UI element is drawn twice: a **2 px dark outline at alpha 0.55** (offset 0,0 — an outline, not a
drop shadow), then the element itself. Any element whose luminance lands between 0.35 and 0.65 also
gets a 1 px light inner edge. This is cheap, it is uniform, and it removes every per-act UI
exception.

### The HUD does not zoom

Every element in §10 is on `GLASS` or on the coaming, both screen-locked, so the dynamic camera zoom
(D18) never touches the HUD. This is deliberate: an altimeter that changes size when the camera
breathes is unreadable, and the altitude ribbon in particular must stay pinned to the same screen
pixels or the player loses their reference. The only zoom-aware UI behaviour is that **off-screen
threat markers thin out on zoom-out** — the camera has already widened to fit the fight, so fewer
threats are off screen, and the merge rule handles the rest.

### Type

**One vendored typeface**, a stencil face — WWI crate and fuselage stencilling — as a local WOFF2.
**Never a CDN font**, for the reason in the manager brief. Numerals only where a number is genuinely
needed: altitude in feet on the ribbon, crate count, mission timer, hangar currency. Everything else
is a shape.

### What the HUD must never do

- No full-screen modal, ever. Callouts slide into the coaming.
- No red vignette on damage — we already have oil on the glass, which is prettier and diegetic.
- No white flash on hit; use a **chroma pulse plus a hitstop**, which reads harder and does not
  destroy the palette for three frames.
- No element on top of the aeroplane, at any time, including tutorial prompts.

---

## 11. Risks, assumptions and open requests

### The biggest risk to "stunning"

**It is not the painted art. It is the seam between the painted world and the code-drawn actors.**

§8 showed the painted half is solved: the local service produces genuinely beautiful gouache in
about a minute a plate. What it cannot produce is the aeroplane, because the aeroplane must bank,
shed a wing, burn, and be lit by a searchlight. So the aeroplane is code — and a code-drawn
aeroplane with clean polygon edges, flat fills and a linear gradient, flying across `p07`'s sky,
would be **instantly** identifiable as a different game pasted onto a painting. Every blind critic
would name it in round one, and no amount of further painted work would fix it.

The defence is P5 applied to procedural geometry, and it has to be built into the renderer from the
first commit, not retrofitted:

1. A **shared paper-grain overlay** multiplied over the actor layer at the same scale and
   orientation as the painted layers' grain, so the two share a surface.
2. **Three-tone shading per part** (§5), never a flat fill and never a smooth gradient.
3. **Slightly irregular edges** — every part polygon's vertices jittered by a stable per-part RNG so
   no edge is machine-straight.
4. **A hand-loaded edge**: parts carry a darker, slightly uneven outline on the shadow side only,
   the way a brush leaves more pigment where it lifts.

If those four are not in the renderer, the game will not hit the §9 gate however good the plates are.
**This is the single most important thing to hand to architecture.**

Two smaller risks, recorded so nobody rediscovers them:

- **Layer sliding under zoom.** If parallax is implemented in screen space rather than as a
  per-layer camera offset, dynamic zoom will make the painted layers visibly slide against one
  another — the background reads as loose sheets of paper rather than as depth. It is subtle enough
  to survive a code review and obvious enough to fail a critic round. See R3.
- **Portrait fill-rate.** A very tall viewport with 13 layers, a large `CLOUD_MID` population and
  additive FX is a lot of overdraw on a phone. If it does not hold 60 fps, the layer to cut is
  `CLOUD_NEAR` (10), then `HORIZON_FAR` (3) — never `FG_OCCLUDE`, which is P3 and is doing the most
  work per byte in the whole stack.
- **The ramp-map's failure mode.** If the shared assets are generated with too *little* value range
  they gradient-map to mush, and if with too much they band. Check the first cloud atlas by
  histogram before generating all 24: the cutouts want a luminance spread roughly 0.15–0.90 with no
  clipping at either end.

### Assumptions made (architecture and design must confirm or correct)

1. **World scale.** This document keys everything off `alt = altitude_m / 6000` precisely so it does
   not depend on world units. It assumes a **6000 m service ceiling** and a portrait viewport that
   shows roughly **a quarter to a third of the column at once**. If the ceiling changes, only the
   divisor changes; if the visible fraction is much smaller, §3's band distinctions get less room
   to read and the feather widths need revisiting.
2. **Renderer.** Assumes the Sunderfall `gfx/` contract is ported: `R.sprite` with a per-call
   `parallax`, `layer`, tint and `add`; `R.quad`/`R.poly`/`R.line` for procedural actors;
   `R.light`; a pooled particle system. §4's per-layer `px`/`py` needs the parallax term to become
   **two** numbers rather than Sunderfall's one — that is a small but real change and it is a
   REQUEST below.
3. **Five acts of twenty missions**, per the manager brief, mapping one palette per act.
4. **Time-of-day is per act, not per mission.** If design wants per-mission times, the ramp system
   supports it — it is a different LUT — but the §6 table then becomes five *families* rather than
   five entries, and someone has to author the intermediates.

### REQUESTs

**To the manager:**

- **R1 — model default.** The brief specifies `flux2-klein-4b` globally. §8B measured 9B as clearly
  better on structured subjects for 39% more time. Requesting the model become a **per-asset
  manifest field**, 4B for atmospherics and 9B for structure.
- **R2 — reference plates.** §9's critic protocol needs real reference frames on disk. They are
  third-party and must not be committed. Requesting the manager place them in `docs/refs/study/`
  locally, and that a `.gitignore` there be honoured at staging time. `docs/refs/study/.gitignore`
  is written and ignores everything in that folder.

**To agent A (architecture):**

- **R3 — two parallax factors, applied as a world-space camera offset.** `R.sprite` needs
  `parallaxX` and `parallaxY` as separate values, per §4. One combined factor makes altitude
  illegible and quietly kills the design thesis. **And parallax must be implemented as a per-layer
  camera offset applied before projection (`camL = cam * pL`), not as a screen-space scroll
  multiplier** — with dynamic zoom (D18) the shortcut version makes every layer slide against every
  other one whenever the camera breathes. See §4's zoom subsection.

- **R12 — hold the zoom-in cap at 1.3×; widen the range downward, not upward.** Texture cost is
  quadratic in zoom-in: 1.3× already adds 1.9 MB and takes the art payload to ~11 MB against a
  12 MB ceiling; 1.5× would put it at 12.6 MB and over. Zoom-*out* costs nothing in sharpness, so
  0.7×–1.3× buys a wider dynamic range for free where 0.8×–1.5× does not. Numbers and the table are
  in §4.

- **R13 — evaluate the sky ramp per-fragment from world Y**, never once per frame from camera Y.
  With a zooming camera the frame spans a varying amount of altitude and a single per-frame sample
  flattens the sky the moment the camera pulls out. This is the most likely zoom bug in the
  renderer.

- **R14 — expose the current `zoom` to draw-time.** The close-detail tier in §4 gates a dozen art
  features on zoom thresholds (rigging wires, the pilot, world-space brushwork, god-ray sample
  count, cloud interior volume, the ground detail tier). They need the live zoom value and a stable
  hysteresis band so features do not flicker on and off at a threshold.
- **R4 — a ramp-map sampler in the sprite shader.** One extra `sampler2D` uniform and one texture
  fetch, plus a per-draw flag for whether a sprite is ramp-mapped or plain-tinted. Everything in §4
  and §6 depends on this and it is much cheaper than five sets of atlases.
- **R5 — the four painterly-geometry features** listed under "the biggest risk" above, in the
  renderer from the first commit.
- **R6 — an actor part-tree draw path** that can shade a convex polygon in three tones from a 2D
  normal plus a light list (§5). This is the aircraft renderer and nothing else needs it.
- **R7 — confirm the world-unit ↔ metre mapping** and the portrait visible-column fraction, so §3's
  bands can be turned into real numbers.

**To agent B (design/systems):**

- **R8 — act theatres.** §6 assigns each act a theatre and an hour: I Flanders/overcast morning,
  II the Somme/late afternoon summer, III a blacked-out coast/night, IV the Alps/high-altitude noon,
  V the final offensive/dusk in smoke. If the story or mission design wants different theatres, tell
  me and the palettes move with them — but **the five key/shadow *relationships* in §6 must survive
  any reshuffle**, because they are the anti-monotony mechanism, not the settings.
- **R9 — at least one forced climb per act.** §3's best-looking moment is punching up through murk
  into the sunlit deck. It needs to be a mission objective somewhere in every act, not an accident.
- **R10 — the altitude ribbon is load-bearing UI** (§10) and it presumes altitude bands are a real
  mechanic the player must read. If the design does not make bands mechanically meaningful, tell me
  and the ribbon becomes decoration, which would be a waste of the best HUD idea we have.
- **R11 — no damage bar.** §10 reads damage off the aeroplane itself. This needs design to agree
  that component damage is legible enough to be the only readout, or to ask for the engine gauge to
  do more.

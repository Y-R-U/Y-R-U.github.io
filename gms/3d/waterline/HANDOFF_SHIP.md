# WATERLINE — C3 handoff: ship kit, fleet, hull materials, gun VFX

Files owned and rewritten: `js/world/ship.js`, `js/world/fleet.js`, `js/world/materials/hull.js`,
`js/world/vfx/gun.js`. **No new files.** Nothing outside those four was edited.

**Pass 3 of 3 — final.** §0 PASS 3 is the current state; §0 PASS 2 and §1–§9 are still true except
where §0 PASS 3 says otherwise. §0P3.10 is the phase-1 revisit list.

---

# §0 PASS 3

## 0P3.1 The shadow diagnosis — it was never the shadow map

The brief was right that shadows were on: 32 casters, 53 receivers, `shadowMap.enabled`, a 2048 map
over an 80 m half-extent, the hero ship at the origin and well inside it. Turning `sun.castShadow`
off moved 7.45% of pixels. They render. They were illegible for a reason that had nothing to do
with the shadow pass, and four things I isolated in order all say the same thing.

**The measurement that settled it.** One clean patch of sunlit wood deck in `guns_fire`, mean luma:

| render | woodDeck | what it isolates |
|---|---|---|
| pass 2 as shipped | 120.7 | — |
| `sun.castShadow = false` | **143.5** | fully lit |
| `sun.intensity = 0` | **111.1** | fully unlit |
| `scene.environment = null` | 102.2 | the env map's share |
| `ambient.intensity = 0` | 110.5 | the hemisphere's share |

Read that column. The **entire dynamic range between fully lit and fully unlit was 32 luma on a
surface sitting at 120** — and that is the *best* case, a deck normal square to a 42° sun. On the
forecastle the same experiment moved **8 luma**. A shadow can only ever remove the sun term, so the
darkest a shadow could possibly be was a 20% dip, and ACES at exposure 0.94 compresses a 20% dip at
that level into something a reviewer correctly reports as "not one cast shadow".

**The sun was carrying about a fifth of the ship.** Ambient + env carried the rest: roughly 111 of
143. Two independent contributors, neither of which casts anything — C1's `HemisphereLight`
(intensity 0.85) and the sky PMREM through my own `envMapIntensity` of 1.05–1.20.

Ruled out, each with a render:
- **Not acne.** `shadow.bias` −0.0008 → −0.006 (2.4 m of depth offset at this near/far) recovered
  2.5 luma; `normalBias 0.35` recovered 0.9. Acne would have gone to zero.
- **Not resolution or extent.** Confirmed by the brief at 130 and 45; I did not repeat it.
- **Not occlusion geometry.** A CPU raycast from twelve deck points toward the sun found nine of
  them CLEAR. There was no blanket occluder. The deck was lit and it did not look lit.
- **Not a stray caster.** 12 visible casters at capture, all one ship. `sea()`'s whitelist does hide
  `main.js`'s boot cruiser and C2's bridge from the shadow pass, which I checked because both are
  still in the scene graph at the origin.

**The fix is `materials/hull.js`'s `shipSurface()`.** One `onBeforeCompile` after
`<lights_fragment_maps>` scales the two indirect terms and leaves the direct sun alone:

```glsl
irradiance *= uAmbK;      // hemisphere + light probe
iblIrradiance *= uAmbK;   // env map diffuse
radiance *= mix(1.0, 0.72, uAmbK);
```

This had to be a shader edit rather than `envMapIntensity`, because the hemisphere light is C1's and
is half of the problem. `uAmbK` is a **shared uniform**, not a baked constant, and that matters:
`guns_fire` runs at **0.46** because it has a sun that can cast, and `fleet_wide` runs at **0.86**
because a flat overcast has no sun to carry anything and 0.46 turned the hero ship into a
silhouette. `setShipAmbient(k)` is exported; `sceneSetup(…, { amb })` in `fleet.js` is the seam.

After the change the same deck patch reads 95 shadowed against 120 lit — the shadow of the bridge
across the forecastle is a legible shape at 1:1, and the funnel's and the deckhouse's are legible at
4×. **The lesson worth keeping: a shadow's legibility is set by the ratio of direct to indirect
light, not by the shadow pass.** No amount of map resolution can make a 20% dip read.

## 0P3.2 AO — vertex colours, not a texture

D16 says texture MB is the binding project constraint, so the AO is a `color` attribute: one float
per vertex, zero texture memory, and it is the only term that can darken an inside corner at all —
a cast shadow cannot, because a corner is lit by the sky rather than by the sun.

`aoAttr(geo, fn)` in `ship.js` paints it at the point a geometry becomes a mesh (never on a merge
input, or `mergeGeometries` would see inconsistent attributes). Four separate darkenings:

- **Deck**: every footprint in the `ao` list darkens the deck plate's vertices around it, falling off
  over 1.6 m outside the footprint, plus a strip under the bulwark along the deck edge.
- **Structure**: `structAO` = height above the surface the vertex is standing on, `1 − 0.58·e^(−h/1.5)`.
- **Shelves**: the deck is *not* the only surface things stand on. A bridge is four blocks stacked
  and the join between two of them is as much a crevice as the join with the deck. `superstructure()`
  now returns a `shelves` list — each bridge tier top, each funnel cap, the aft deckhouse top, the
  mast house and the masthead platform — and `structAO` takes the nearest one below.
- **Hull**: the bulwark's inboard face (0.68), the strake tucked under the deck edge (0.86) and the
  **transom's inset panel** (0.52), which is a real recess behind a real rim.

`vertexColors: true` is now on the hull, deck, turret and distant materials. Every geometry those
four touch carries a `color` attribute; `flatAO()` supplies a constant 1 where none is wanted.

## 0P3.3 The muzzle-flash core — the answer was the BLEND, not the brightness

**0.956% of the pass-2 `guns_fire` frame sat at exactly (255,255,255). It is now 0.000%**, with the
flash brighter and larger in the core than the version that clipped.

The mechanism, which is worth writing down because it will bite C4 and C6 on the same cards:
**additive blending happens in the framebuffer, after each fragment has already been tone-mapped.**
ACES maps any finite radiance to under 1.0, so a single card can never clip — but N overlapping
cards sum in LDR and everything past 1.0 is a flat plateau. No amount of dimming fixes the shape;
it only moves where the plateau starts.

There is no bloom pass, so the soft knee goes in the blend instead:

```js
blendSrc: OneMinusDstColorFactor, blendDst: OneFactor    // dst' = src·(1 − dst) + dst
```

That approaches 1 asymptotically and **cannot reach it**, so the core keeps a gradient all the way
through. It costs nothing and it is one material flag. The catch: the blend factor is on the source
*colour*, so a fragment's alpha no longer modulates it — every texture on this path carries its
falloff **premultiplied into rgb**, and `volumeShade()` now emits `vec4(light · dk · a, 1.0)`.

What else changed, all of it downstream of that:
- **The two core cards are gone.** They were the 90×110 px white slab: the layer that pushed the sum
  past 1.0. The core is the flame body's job now and the flame body has a gradient.
- **The bokeh discs were the embers.** Ten crisp white circles at 4×, because a hard additive at
  colour (1, 0.85, 0.28) over a bright fireball saturates to a disc with the shared soft disc's rim
  on it. They are dim (0.42, 0.26, 0.10), small, and on the soft-additive path, where they cannot
  saturate.
- **The circular sprite boundary** was the shared `softDisc()`'s falloff, which stops at the quad
  edge. `fireCardTexture()` runs `(1−d)^2.8` to zero over the whole quad and is `NoColorSpace` —
  it is a ramp, not a colour, and an sRGB decode bends it.
- **The shock ring is now a halo.** A thin annulus drew a countable circle across the flash, which is
  the one shape a flash must not have. Same instanced slot, same cost, now the broad warm halo the
  scene has no bloom pass to give it — and soft-additive means a big halo cannot flatten what is
  under it, which is the other thing a bloom pass would have bought. It billboards to the camera:
  bore-aligned, it was edge-on from a camera near the line of fire.
- **gun.js owns its own additive `CardField`** (250 slots, +1 draw call), because `vfx/index.js` is
  frozen and its shared field is hard-additive on the disc.

**A real pool bug fell out of this.** The smoke field was `CardField(96)` and each muzzle asked for
96 puffs, so in a two-gun salvo **the second gun got no smoke at all** and its cards sat naked
against the sky as a pale ghost. `guns_broadside` fires four. Caps are 300 smoke / 250 fire and the
per-muzzle counts are 30·cards and 19·cards.

## 0P3.4 The flash now lights its own smoke, and the reason it could not

Smoke is `MeshBasicMaterial`. **No `PointLight` can ever reach it** — the warm term has to be
computed on the CPU, and pass 2 computed it from the *bore direction* (`n · fwd`). A puff two metres
to one side of the fireball has `n · fwd ≈ 0`, so it came back cold grey next to a white core, which
is the single clearest tell that a cloud is a stack of cards.

It is now computed from the **fireball's centre**: direction from the ball to the puff, `(−w · n)^1.5`
so there is a genuinely dark back hemisphere, and an inverse-square falloff on the distance to the
ball. Every puff has a lit face and a shadowed face and the lit ones are the ones facing the flash.

The `PointLight` also moved in (`fwd·R·0.20` rather than `0.34`) and went 1300 → 2100 cd, which lands
harder than it sounds because §0P3.1 dropped the indirect term the ship was floating on. The barrels
and turret face read as lit at 4×.

## 0P3.5 Aerial perspective on the distant hulls

`distantMaterial()` was `0x6a747f` — darker than the haze it stands in at 2.6 km, which the reviewer
named as the largest single reason the frame reads as a diorama. Linear fog alone does not get there:
at 2.6 km with `fog [620, 4600]` a hull is only 50% of the way to the fog colour, so a dark hull is
still visibly dark. Two changes, both in `materials/hull.js`:

- base colour `0xa4b0bc`, roughness 0.94, metalness 0;
- a second, super-linear handover appended to `<fog_fragment>`:
  `mix(colour, fogColor, pow(aerial, 1.4) · 0.92)` on top of the fog three already applied.

Measured on `fleet_wide`: a distant hull band reads **118 against 129 for the haze immediately above
it** — still slightly darker, which is correct for a real ship, rather than a cut-out.

## 0P3.6 The sea — what `setDetailFade` could and could not reach

The reviewer's "same 6–8 px period at the horizon as in the foreground" is the ripple LOD, and
`ocean.setDetailFade({ lod })` reaches it: `uRipLod` is the rate the ripple octave scale walks with
`log2(distance)`. The grade's 0.55 is too slow. `fleet_wide` now runs **1.15** (fade and rip
unchanged from pass 2), both gunnery shots **0.95**. At 4× on the horizon strip the salt-and-pepper
is visibly gone and the far water converges on a smooth haze.

I also tried pulling `fade`/`rip` in to `[120, 900] / [130, 1000]` with `lod 1.4`. **Rejected**: the
horizon improved but the near and mid field came back heavily mottled. The lod alone is the change
that helps without a cost.

The other two sea findings are `ocean.js` and are escalated in §0P3.8, not worked around from
`ship.js`.

## 0P3.7 Scale and density

- **The railing now runs the full length.** `railGeo` used to `continue` wherever `bulwark(u) > 0.05`
  — which is the entire forecastle, the one stretch of deck this project's closest camera looks
  straight down at. A bulwark carries a guardrail on top of it; a bare steel wall with nothing on it
  has no scale at all. Stanchions and three wires are legible at 4× along the whole bow.
- **Crew 12 → 20**, with eight of the new ones between `u` 0.14 and 0.42 — the forecastle, where
  `guns_fire` actually looks. Checked at 4×: they are 8–14 px tall in that shot and they read.
- **Deck fittings 14 → 19** per hero ship.
- Everything above is inside the existing merged meshes; the cost is triangles (58k → 66k main on
  `guns_fire`), not draw calls.

The ship is still a **90 m** "battleship" (`cells 5 × 12 m × lenMul 1.50`). Raising `lenMul` is the
honest fix for "reads as a desk model" and I did **not** take it on a final pass, because all three
cameras are framed for the current length and the shot would change. It is §0P3.9 item 2.

## 0P3.8 Escalations — three, all written from the file

**E1 — an `overcast` grade in `sky.js`'s `GRADES`.** Standing since pass 2 and still the honest fix
for `fleet_wide`. The shot is a flat North Atlantic afternoon; the only daylight grade is `noon`,
whose sky is blue and whose sun is a hard disc. `skyCover 2.0`, `skyHaze 1.85` and exposure 0.60 get
the *character* right and leave the median at **99 against the plate's 83**. Written from the file —
`js/world/sky.js:21–43` is the `noon` entry; an `overcast` sibling wants roughly:

```
zenith '#8d99a4', horizon '#a8b0b6', below '#7c838a',
cover 0.95, sharp 0.10, cloudLit '#c9d2d9', cloudDark '#6a737c', cloudH 900, cloudScale 3.4,
gradPow 0.30, hazeH 0.16, hazeAmt 0.45,
sun { colour '#e8eaec', intensity 1.1 },     amb { sky '#a8b6c2', ground '#4a545c', intensity 1.5 },
fog { colour '#8b9196', near 400, far 4200 }, exposure 0.62,
sea.deep '#101a20', sea.shallow '#22333d', sea.glint 0.012, sea.cap '#c2ccd2', sea.haze '#8b9298'
```

The two numbers that matter are `sun.intensity 1.1` with `amb.intensity 1.5` — an overcast inverts
the ratio §0P3.1 is about, which is why `fleet_wide` also needs `amb: 0.86` on my side and would not
need it under a real overcast grade.

**E2 — `ocean.js`, the horizon has no crest breaking it.** `js/world/ocean.js:150`,
`float fade = 1.0 - smoothstep(uFadeNear, uFadeFar, d);` — the swell displacement is faded out
entirely past `uFadeFar`, so beyond 1.5 km the surface is geometrically flat and the skyline is a
ruled line. That is correct for slope-versus-grazing-angle reasons (HANDOFF_OCEAN §0.1) and it is
why the horizon reads as drawn with a ruler. The fix is not to relax the fade: it is a **silhouette-
only** term — a small vertical displacement applied to the outermost rings that does not participate
in the normal, so it breaks the skyline without reintroducing corduroy. I have not touched the file.

**E3 — `ocean.js`, whole-sea specular aliasing.** `js/world/ocean.js:255`,
`float rough = mix(uRough, uRoughFar, smoothstep(uRipN * 0.4, uRipF * 1.6, vDist));` — roughness
walks with distance but the glint lobe is still evaluated per fragment against an un-mip-filtered
normal, so the sea carries constant-frequency salt-and-pepper glitter to the horizon. It is stills
here; **it will crawl badly in motion** and that is C6's problem more than mine. `uRoughFar 0.28` at
noon is probably too low; a distance-widened specular lobe (or clamping the glint by the same
`graze` term that flattens the swell) is the shape of the fix.

**E4 — not an escalation, a recommendation for C4 and C6.** Do not ask for a bloom pass. §0P3.3's
two-line blend change is what a bloom pass would have bought for the clipping problem, at zero cost,
and it works on any additive card field. `vfx/index.js`'s shared `cardMat` is still hard-additive on
`softDisc()`, whose falloff stops at the quad edge — every emitter using it will produce the same
countable discs at 4× that mine did. That file is frozen; the pattern to copy is `softAdd()` +
`fireCardTexture()` in `vfx/gun.js`.

## 0P3.9 Measured, pass 3

`--preset=high --dpr=1 --w=1280 --h=720`, and `--preset=medium --dpr=1 --w=844 --h=390 --mobile`.
Counts only, per D4.

| shot | calls (main) | tris (main) | texMB | fps | mobile calls / tris |
|---|---|---|---|---|---|
| `guns_fire` | **52** (40) | 66k (58k) | 36.51 | 60 | 52 / 55k |
| `guns_broadside` | **48** (36) | 62k (55k) | 36.51 | 60 | 48 / 50k |
| `fleet_wide` | **54** (44) | 84k (76k) | **39.19** | 60 | 55 / 75k |

Budget: < 90 calls, < 300k tris, < 45 MB **project total** (D16), 60 fps. Spend over pass 2 is
**+1 draw call** (gun.js's own additive card field) and +12k triangles (crew, fittings, the
forecastle rail). **Texture is 39.19 against pass 2's 39.17** — the only new map is one 64² fire
card, +0.02 MB. Nothing was baked. The vertex AO is a `color` attribute and costs no texture at all,
which is why it was done that way.

Regression: `sea_noon` at high/1280 is **9 calls / 30k tris**, identical to C1's recorded figure, so
nothing of C1's moved. `boot` is 117 calls / 66k tris.

**Exposure** (`tools/exposure.mjs`, ours vs the plate on the same axis), and the clipping measure the
reviewer used:

| shot | ours dead / median / clipped | pure (255,255,255) | plate dead / median |
|---|---|---|---|
| `guns_fire` | 0.0% / 130 / **0.0%** | **0.000%** (was 0.956%) | 0.1% / 138 |
| `guns_broadside` | 0.0% / 96 / 0.0% | 0.000% | 0.0% / 107 |
| `fleet_wide` | 0.0% / 99 / 0.0% | 0.000% | 0.0% / 83 |

No crushing, no milky lift, and the flash core is structured rather than clipped for the first time.

## 0P3.10 Still weak — the phase-1 revisit list, ranked

Written straight. This is the last pass, so this list is the plan, not an apology.

1. **The ship is 90 m and the brief calls it a battleship.** `KIT.battleship.lenMul = 1.50` on
   `SHIP.cellMetres = 12` gives 90 m at 5 cells and a 12.9 m beam. Every human-scale object on it is
   sized in real metres against a person, so the ship is *self-consistent* — but a viewer who knows
   what a battleship is reads a 90 m hull with four turrets on it as a model. **This is the single
   biggest remaining gap and it is a two-line change plus a re-frame of all three cameras.** It was
   out of scope for a final pass precisely because it moves the shot; it should be the first thing a
   phase-1 revisit does, with the camera work budgeted alongside it.
2. **The near flank and the superstructure are still flat at 30 m.** 512² unique unwrap gives ~5.7
   texels per metre on a 90 m hull, and `plateTile` correctly gives a 25 m bridge block an 8 m panel
   period, which means three seams across the biggest surface in the frame. Wants a **tiling detail
   normal under the unique map** rather than a bigger unique map — D16 says the texture budget has
   about 6 MB left for C4, C6 and C7 combined and a 1024² pair would eat it.
3. **`guns_broadside` still shows one flash cluster.** Unchanged and for the unchanged reason: from
   the port quarter a 26 m bridge sits on the sight line to the forward muzzles, and the aft pair
   fires to starboard, away from the camera. The camera is what has to move; I did not move it. The
   flash itself is much better and would read as four sources if it could be seen.
4. **The flame body still has a slightly crisp silhouette when the bore points at the camera.**
   `|N·V|^4.0` fades the rim correctly at grazing but the lathe's near-tip surface faces the camera
   square-on and reads as a hard-edged fin at 4×. Visible in `guns_fire`, not in `guns_broadside`.
   A second, softer body at 1.4× scale and a fifth of the brightness would hide it.
5. **`fleet_wide` is still 16 luma above its plate** (99 vs 83), down from 23. Everything past this
   point needs E1.
6. **Nothing is validated in motion or on a phone.** Still true, and now more load-bearing: the sea
   glint aliasing (E3) is a stills-only judgement and I expect it to crawl. The collar rewrites ~700
   vertices per hero ship per frame from `ocean.heightAt` and I have still never watched it move.
7. **The masthead junctions are still hard booleans.** The shelf AO catches block-on-block, but a
   yard passing *through* a mast is a vertical intersection with no shelf, and there is no darkening
   where they meet. A per-mast axis-proximity term in `structAO` is about ten lines and I ran out of
   pass.
8. **The wake still has no height.** Foam on a flat surface, with a bow wave, a quarter wave and a
   prop wash painted on it. Unchanged from pass 2 and correctly a phase-2 item.

---

# §0 PASS 2

## 0P.1 Four bugs found, three of them pass 1's own

**a. The aft mast floated.** `superstructure()` put every mast foot at a constant
`deck + 1.4 × freeboard`. Forward that lands inside the bridge stack, which is why it looked
attached; aft it lands **0.8 freeboards above a deckhouse only 0.60 freeboards tall**, so the pole
began in clear air. The pole now runs from `dk(u)` to the masthead — the lower part is buried in
whatever it passes through, so it cannot float again whatever moves — and the mast house and the
tripod legs sit on the measured top of the supporting structure (`bridgeTop` returned out of the
tier loop, `dk(uA) + free*0.60` aft). Yards are real boxes at `rr*1.9 × rr*1.5` with lifts, not
`rr*1.2 × rr*1.0` plates, plus a new `strut(a, b, r)` helper for any diagonal.

**b. Roll and trim were swapped.** `body.rotation.z = roll` and `body.rotation.x = trim`. In Three,
`rotation.x` mixes Y and Z (and Z is athwartships) so it is **roll**; `rotation.z` mixes X and Y
(and X is the bow) so it is **trim**. Pass 1 therefore heeled the hull sideways from the
fore-and-aft swell gradient and pitched it bow-up when it took damage. Swapped. This is most of why
the hull's waterline never agreed with the sea it sat in.

**c. `scene.fog` was silently reset on every scenario that touched a sky knob.**
`quality.set('skyCover'|'skyHaze'|'skyCloudSize')` calls `sky.applyGrade()`, which fires the grade
listeners, and `lighting.js:paint` resets `fog.near/far` from the grade inside one of them. Pass 1
set the fog first and the knobs after. Measured with `--eval=[scene.fog.near, scene.fog.far]`:
`fleet_wide` reported **250 / 2400**, not the 500 / 4200 §4 documents — noon's stock values, on
every run since pass 1. That is the round-1 "fog starts too near" finding, and it also explains the
convoy sitting in flat fog colour. **`sceneSetup()` now takes `sky`, `fog` and `fade` and applies
them in that order**, knobs first. `setSeaState` survives `applyGrade` (it is an override field),
`setDetailFade` does not — it is inside `sceneSetup` now too.

**d. The 1 px dashed waterline seam was the WAKE, not the hull.** Isolated by setting
`wake.visible = false` and re-rendering: the seam went with it. Pass 1 had pulled the wake strip's
inner edge to `sectionZ(u, 0.55) * 0.97`, which is within a percent of the hull's own waterline
half-beam — so the strip's brightest texel row (`across` peaked at `v = 0`) landed exactly on the
hull silhouette and drew a hard bright line that aliased into dashes. Fixed twice over: the inner
edge is `halfBeam(uh) * 0.88` (buried) and `foamTexture()`'s across-strip falloff now **fades in**
over the first 13% instead of starting at full. The gap that fix was originally guarding against is
covered by the new collar and skirt.

## 0P.2 The waterline — what is new

Three meshes, all pooled behind two module materials:

| mesh | parent | what it does |
|---|---|---|
| `collarGeo` → `collar` | `object3D` (sea frame) | contact shadow + foam collar on the water, bow wave, quarter wave, propeller wash astern of the transom |
| `skirtGeo` → `skirt` | `body` (hull frame) | the wet band clinging to the plating across the waterline; its job is coverage of the hull/sea intersection |
| transom rim | merged into `hullShell` | the stern is an inset panel behind a rim with `L*0.024` of real depth, not one flat card |

**The collar carries two per-vertex arrays in `geometry.userData`, and this is the load-bearing
idea.** `lift` is metres above the local sea. `hold` is 0..1: at 1 the vertex is welded to the
**hull's** own waterline (`bodyY + bx·sin(trim) − bz·sin(roll)`), at 0 it follows
`ocean.heightAt()`. The inner edge holds, the outer edge floats, and the ribbon is written between
them every frame. Without `hold` the ribbon sits on the swell while the hull heaves above it and
the inner edge shows as a lace line offset from the plating — which is what the first attempt did.

The bow wave is deliberately small (`free * 0.15`, a peeling sheet) because C1's sea is a low
single-frequency swell and a metre-high rooster tail on it is a physical contradiction the round-1
review named explicitly.

## 0P.3 The muzzle flash — why the answer was not a brighter light

**The barrels were cold because the light was ON the bore axis.** Isolation: colour the pooled
`PointLight` pure red and raise it 28×; the barrels went red, so the light was reaching them and
intensity was not the problem. A barrel is a cylinder running along the bore and the light sat on
that same axis extended, so `N·L` on every visible barrel surface was `cos 89°`. Moving the light
to `v + fwd·R·0.34 + up·R·0.30 + side·R·0.10` at 1300 cd × `cfg.light` lights the barrels, the
turret face and the deck at a fraction of pass 1's clipped brightness.

**The flash is now geometry.** Two new pooled `InstancedMesh`es (cap 8 each, 2 draw calls total,
both additive):
- a **lathed flame body** along the bore — profile `s^0.42 (1−s)^0.75`, so it swells just off the
  muzzle and tapers to a point, which is the silhouette every naval plate we have shows;
- a **shock ring** perpendicular to the bore, expanding and gone in 90 ms.

The flame is drawn with `volumeShade()`: `alpha *= |N·V|^2.3`. A lathed shell drawn flat is a conch
— its silhouette is exactly where its alpha is highest and the eye reads a hard rim, which is what
the first two attempts looked like at 4×. Fading by `|N·V|` inverts that: the shell is brightest
where a ray passes through the most of it, and the same geometry reads as a soft body of burning
gas. **This is the only way to get volume out of one draw call with no bloom pass**, and it is
worth stealing for C4's fires.

**Smoke.** The alpha in `smokeTexture()` now carries only low-frequency shape — the fine-noise
multiply is what resolved at 4× as clumps of dithered pixels. The rgb carries a baked top-to-bottom
light ramp and cards are rotated **only ±0.35 rad** so that ramp survives billboarding. Per puff,
two directions do the shading: `n·sunDir` gives a lit face and a shadowed face, `n·fwd` gives the
side of the mass the fireball is inside of its warm edge. Pass 1 gave every puff one flat value.

**Clipping**, which was the measured defect: `guns_fire` 6.0% → **1.1%** (plate 0.0%),
`guns_broadside` → **0.0%** (plate 0.2%). Core and fireball card brightness are roughly a third of
pass 1's; the read comes from the flame body, not from saturation.

## 0P.4 Repetition on the superstructure

`TILE = 13` was a constant, so a 3 m locker, a 9 m funnel and a 25 m bridge block all carried the
same 1.6 m panel cell — a projected grid, exactly as the review said. Now:

- `plateTile(size) = clamp(size * 0.46, 2.0, 8.0)` — metres of steel per texture tile, derived from
  the object's own largest dimension. `block()` and `cyl()` take an override for cases where the
  physical answer is different: **turrets use `R * 4.2`**, because turret armour is a handful of
  very large plates and not the panelling a deckhouse is built from.
- **Every block and cylinder gets its own UV origin** from `uvOff()`, re-seeded per ship in
  `buildShip`. Two blocks standing side by side can no longer line their seams up into a lattice.
  This is probably the bigger half of the fix.
- `steelSkin` now has 5 × 4 seams per tile rather than 8 × 8, at `sm * 0.10` rather than `0.16`.
  Eight dark seams per tile drew a wire grid at 4×.

The hull's unique unwrap is **untouched** — it was correct and the review said so.

## 0P.5 Human scale

- **Crew**: 12 figures per hero ship, five boxes each (legs, tapered torso, head, two arms), own
  merged mesh and `crewMaterial()`. The arms are not decoration: without them the silhouette is a
  post, and a post is not a scale cue.
- **AA mounts** with a tub a man stands in and two barrels on `strut()`s, **carley floats** stacked
  against the deckhouse, **cowl ventilators** with a bell, **ready-use lockers with an overhanging
  lid**, **hose reels**, **bollards in pairs** (0.62 m), and **ship's boats with a real boat hull in
  davits** with falls, instead of a lying-down cylinder. Everything here is sized in metres against
  a person, not as a fraction of the hull.
- **Inclined ladders** at human rise, on the rail material at no extra texture cost: transposing the
  rail strip's UVs turns its three wires into three stringers and its stanchions into rungs.
- **Contact shadow decals** (`contactGeo` + `contactMaterial`, one merged mesh, one draw call) under
  every superstructure block, funnel, deckhouse, AA tub, boat and float. There is no AO pass that
  reaches these, and "objects that do not touch what they rest on" has been found in every round on
  every component on this project.
- Everything on the deck is placed with `S.deckAt(u, z)`, which includes the camber. Pass 1 placed
  furniture at `deckY(u) - 0.05`, which floats it by up to 0.2 m on the centreline.

## 0P.6 Smaller

- **Quarterdeck UVs.** `deckPlate` mapped `v` 0→1 across each station's own beam, so the planking
  squeezed to a fifth of its width where the hull narrows aft. `v` is now scaled to the widest
  station, so a plank is the same real width from stem to stern.
- **Skies.** `guns_fire` and `guns_broadside` were empty gradients; both now set `skyCover` and
  `skyCloudSize` through the new `sky:` argument. `sky.js` already owned the cloud deck — nothing of
  C1's was touched.
- **Fog** actually applies now (0P.1c): 900/5200, 900/6000, 620/4600.
- **Hull/deck/turret `envMapIntensity`** 1.5/1.4/1.5 → 1.20/1.05/1.20 with roughness up a few
  points. The near hull was reading as a pale slab because the sky reflection was lifting every
  upward-facing surface.

## 0P.7 `fleet_wide` against a flat-overcast plate

`skyCover 2.0`, `skyHaze 1.85`, `exposure 0.67`, fog 620/4600, `setDetailFade({fade:[150,1500],
rip:[170,1600]})`. Median **113 → 106** against the plate's 83, with no crushing (0.0% dead) and no
clipping. The *character* is now a flat overcast deck rather than a blue noon sky, which matters
more than the last 20 luma. **That is as close as the knobs I own reach.** An `overcast` entry in
C1's `GRADES` remains the honest fix and it is additive work in a file I do not own.

## 0P.8 Escalation — the whitecap mask is `ocean.js`'s

Confirmed at 6× nearest-neighbour on `fleet_wide`: the sea's foam is a field of axis-aligned
rectangular texel blocks. It is not mine. Written from the file, not from memory:

- `js/world/ocean.js:21` — `const RS = 128;`
- `js/world/ocean.js:40` — `const lace = new Field({ size: RS, period: 3, octaves: 3, gain: 0.6, seed: 929 });`
- `js/world/ocean.js:49` — `a[y * RS + x] = 0.7 * lace.at(u, v) + 0.3 * chop.at(u * 2, v * 2);`
- `js/world/ocean.js:69` — `px[i + 3] = clamp(a[y * RS + x], 0, 1) * 255;`
- `js/world/ocean.js:319` — `vec4 rl = texture2D(uRipple, RIP_B * uv * uLaceScale + uTime * uRipSpeed * vec2(0.011, 0.006));`

Two compounding causes. (1) `chop` is sampled at `u*2, v*2`, so its finest octave has about
**2.3 texels per lattice cell**, and `Field.at` is bilinear on a value-noise lattice — the classic
axis-aligned box artefact, baked into the 128² alpha at build time where no filter can remove it.
(2) At `laceScale 1.1` one texel of that 128² map covers roughly a third of a metre of sea, so at
250 m it is magnified about 3× on screen. Suggested fix, for whoever owns the file: raise `RS` to
256 for the alpha channel or drop the `*2` on the `chop` term, and consider a second decorrelated
octave in the shader rather than in the bake. **I have not touched `ocean.js`.** Everything I needed
at the hull was buildable in `ship.js`.

## 0P.9 Measured, pass 2

`--preset=medium --dpr=1 --w=844 --h=390 --mobile --perf`. Counts, per D4.

| shot | calls (main) | tris (main) | texMB | fps |
|---|---|---|---|---|
| `guns_fire` | **51** (39) | 52k (45k) | 36.2 | 60 |
| `guns_broadside` | **47** (35) | 48k (41k) | 36.2 | 60 |
| `fleet_wide` | **54** (44) | 72k (66k) | 38.9 | 60 |

Budget < 90 calls, < 300k tris, < 45 MB, 60 fps. Desktop `--preset=high --w=1280 --h=720`:
51 / 47 / 53 calls, 64k / 60k / 81k tris, 60 fps. The spend is +13 to +15 calls and +20k tris over
pass 1, all of it collar, skirt, contact decals, crew, ladders and the two flash volumes.

**Texture is the one to watch: 38.9 of 45 on `fleet_wide`**, up from 35.5. My additions are one 256²
collar map, one 256² skirt map and three 64s (contact, flame, shock ring). C2's 24 MB bridge atlas
is still the bulk and is resident in a sea scene because it is built at boot.

Regression: `sea_noon` at `--preset=high --w=1280 --h=720` is **9 calls / 30k tris — identical to
pass 1's and to C1's recorded figure**, so nothing of C1's moved. `boot` at medium/mobile is
117 calls / 52k (was 110 / 55k); boot renders ships, so the +7 is the new per-ship meshes.

**Exposure** (`tools/exposure.mjs`, ours vs the plate on the same axis):

| shot | ours dead / median / clipped | plate dead / median / clipped |
|---|---|---|
| `guns_fire` | 0.0% / 132 / **1.1%** | 0.1% / 138 / 0.0% |
| `guns_broadside` | 0.0% / 101 / **0.0%** | 0.0% / 107 / 0.2% |
| `fleet_wide` | 0.0% / 106 / 0.0% | 0.0% / 83 / 0.0% |

No crushing and no milky lift anywhere, and `guns_fire`'s clipping is down from 3.7% (6.0% of the
frame at luma ≥ 250 by the review's measure) to 1.1%.

## 0P.10 Deliberately left alone, and what is still weak

**Left alone on purpose:**
- The hull's unique unwrap, the dazzle camo, the boot topping, the scum line and the rust weeps.
  Verified working by the review; nothing in pass 2 touches `hullSkin()`.
- Scenario ids, cameras, `frameCamera` arguments and framing. Score movement stops meaning anything
  if the shot changes.
- `detail 0`'s chunky masts and silhouettes. Called out as right pre-emptively.
- `ocean.js`, `sky.js`, `lighting.js`, every C2 file, `main.js`, `config.js`, `scenarios.js`. Zero
  edits outside my four files.

**Still weak, ranked:**
- **`guns_fire` still clips 1.1% against a plate that clips 0.0%.** The remaining core is the
  additive card stack, not the flame body. `engine/post.js` has GTAO and FXAA but no bloom; with a
  bloom pass and a soft knee this would go to zero and C4's fires would benefit too.
- **`fleet_wide` is still ~23 luma brighter than its plate.** See 0P.7. Needs an `overcast` grade.
- **`guns_broadside` still shows one flash cluster plus a glow, not four strung along the hull.**
  Unchanged from pass 1 §7 and for the same reason — from any camera on the disengaged side a 26 m
  bridge sits on the sight line. The flame bodies are now small enough to read as separate sources
  when they *are* separated; the camera is what would have to move, and I did not move it.
- **The near hull flank is still flat at 30 m.** ~5.7 texels per metre on a 512² map. Wants 1024²
  or a tiling detail-normal under the unique map; the texture budget cannot take 1024² today.
- **The crew are five boxes.** They read as figures at 30 m and they are the scale cue the review
  asked for, but nobody would call them animated or varied. They also do not appear at `detail 1`.
- **Nothing is validated in motion or on a phone.** Still true, and the collar now re-writes ~700
  more vertices per hero ship per frame from `ocean.heightAt`, none of which I have watched move.
  The `hold` blend assumes small angles (`sin θ` linearised about the hull centre); at a real list
  of 0.22 rad it will be a few centimetres out at the ends.
- **The wake is still one strip per side plus a trail.** It has a prop wash and a bow wave now, but
  no wake *height* — it is still foam on a flat surface.

---

## 0. The two things worth knowing before you read anything else

### 0.1 The hull is lofted, and its texture unwrap is the reason it can be

`shape(L, B, free)` in `ship.js` returns the station maths — half-beam, sheer, keel line, bulwark,
section girth — and **the shell, the deck plate, the rails and the wake are all generated from that
one set of functions**. Change `halfBeam()` and every one of them follows. A boxed hull cannot carry
sheer, a forecastle break, a raked stem or a transom, and those four things are the whole silhouette
at 800 m.

The unwrap is what makes the paint possible. **u runs bow→stern; v carries height above the
waterline, mirrored about v = 0.5 — port below, starboard above.** Two consequences you must not
break:

- `vBand(y) = (y + draft) / (draft + top)` puts **y = 0 at exactly `WATERLINE_V` (0.42)** on every
  station. That is why the boot topping is a straight texture row rather than a curve that has to
  follow a varying draft, and it is why **the draft is not a free parameter** — it is derived as
  `top * WATERLINE_V / (1 - WATERLINE_V)`. Nothing is ever seen below it, so a slightly deep
  destroyer costs nothing.
- The hull maps are **`ClampToEdgeWrapping`**, overriding `bake.js`'s default Repeat. They are a
  unique unwrap, not a tile. That single fact is why there is no repetition anywhere on a flank:
  the dazzle camo, the plating rows, the rust weeps and the scum line are painted once, at their
  real position on that particular hull, and cannot tile because there is nothing to tile.

### 0.2 The gun light is a real light, and it was the loudest bug in the component

`vfx/gun.js` acquires a pooled `PointLight` and drives it off the same `glow` term as the cards, so
the flash lights the turret face, the deck, its own smoke and (through `ocean.setSeaLights`) the
water. That is the "emissives must light their surroundings" requirement, and it is the reason the
file is bigger than a puff of sprites.

**It is also the term that made everything else look wrong, twice.** Pass 1 shipped
`intensity: 4200 cd, distance: R*14` and the entire 90 m battleship came back cream with no
material read at all — the plating, the camo and the boot topping were all still there and all
still unreadable. I isolated it by forcing `light.intensity = 0` and re-rendering: the ship came
back grey-blue and correct. It is **700 cd at `distance = R*7`** now, which lifts the near thirty
metres and falls off visibly across the hull.

The sea light had the identical failure at a larger scale: `radius: R*26` (416 m) put an orange
multiplier over the **entire frame**, which I first mistook for C1's documented noon warm-cast gap.
Same isolation, same answer — it was mine. It is `radius: R*1.6, intensity: 0.55` now. If a future
pass sees a brown or orange cast anywhere on the sea in a gunnery shot, **set `SEA[0].intensity` to
0 and render once before touching anything of C1's.**

---

## 1. API

### `buildShip(kitId, quality, cells, opts)` — `js/world/ship.js`

```js
{ object3D, length, beam, freeboard, kitId, cells, detail, shape,
  gunAnchors,          // Object3D[], one per turret, at the muzzle of the centre barrel
  turrets,             // [{ group, elev, anchor, recoil, base }]
  deckAnchor,
  hullPoint(t)         → Vector3,   // t: 0 bow → 1 stern, on the centreline at deck-ish height
  hullSide(t, side=1)  → Vector3,   // the same station on the FLANK — this is where a hit breaks
  fireGun(i)           → Object3D,  // recoils turret i and returns its anchor
  trainGuns(rad), elevateGuns(rad),
  setDamage(d), listAngle(rad), damage,
  update(dt), dispose() }
```

`opts`: `{ seed, detail }`. `detail` is `2` hero · `1` mid-field · `0` distant — see §3.

**`object3D` carries only the XZ position and the heading. The hull rides on an inner `body`
group** which carries heave, pitch and roll. That split is not cosmetic: the wake is a child of
`object3D`, so its vertices can be written straight from `ocean.heightAt()`. Under the hull's own
pitch a wake vertex 200 m astern picks up about ten metres of vertical error, and the stern trail
renders as torn sheets of paper floating over the swell. **If you parent anything to a ship that
must stay level with the sea, parent it to `object3D`, not to `body`.**

### `buildFleet(quality)` — `js/world/fleet.js`

W0's contract is unchanged and every method still means what it did:

```js
{ object3D, sides, ships, plumes,
  cellToWorld(side, r, c) → Vector3,
  layout(side, view)      → ships[side],
  shipAt(side, r, c)      → { ship, def, t } | null,
  gunFor(side, shipId)    → Object3D,
  mark(side, r, c, kind)  → handle,   clearMarks(),
  stage(list)             → handles,  clearStage(),      // scenario staging, new
  update(dt, app) }
```

New: **`stage([{ kit, cells, x, z, heading, detail, seed }])`** puts explicit ships at explicit
places outside the two side frames, and `clearStage()` disposes them and empties the plumes. That is
how all three scored scenarios are built and it is the seam a cinematic or a test scene should use.

`mark()` now lands on `hullSide()` rather than on the centreline, so the red indicator sits on the
flank a shell would actually have struck, and it uses the `hull:'marker'` surface (additive, fog-off)
instead of a bespoke material.

**The dramatised layout (`layout`) is authored, per D-note in HANDOFF_ENGINE §"Cell ⇄ world".** A
ship keeps its cell — `shipAt()` and the peg grid still agree — but its bearing, its range offset
and its lateral stagger all come out of `rng(def.r*131 + def.c*17 + def.len*7 + side*977)`, and the
whole formation is pulled 42% toward its own centre. A fleet on its true grid is a parade of
parallel ships at identical spacing, which is the exact lattice every critic on this project has
punished. First two ships get `detail: 2`, the rest `detail: 1`.

### `materials/hull.js`

`make(surface, quality)` covers **plate · deck · turret · rail · rust · boot · marker**. Also
exported directly, because they are ship-private and do not belong in the frozen dispatch:
`hullMaterial(kitId)` (one unique-unwrap material per kit), `windowMaterial()`,
`distantMaterial()`, `railTexture()`, `foamTexture()`, `WATERLINE_V`.

Pass 2 adds `collarTexture()` / `collarMaterial()`, `skirtTexture()` / `skirtMaterial()`,
`contactTexture()` / `contactMaterial()` and `crewMaterial()`.

`getMaterial('hull','plate')` returns the cruiser hull material, so the W0 stub call still works.

### `vfx/gun.js`

Registers `muzzle` as before. Exports for scenario authors:

```js
setMuzzlePhase(t, spread = 0)   // pin every live muzzle at absolute phase t; the nth gun
                                // emitted is spread seconds younger
resetGunOrder()                 // call before emitting a group, or ordinals accumulate
muzzlePhase()                   // → the pinned value or null
```

**Why pinning exists:** `shot.mjs` settles 45 frames before it captures, so an unpinned 1.35 s flash
is long dead by the time the frame we score is taken — and under D13 two renders of the same code
land on different phases anyway. A pinned still is bit-reproducible. `setMuzzlePhase(null)` returns
to real time for gameplay.

---

## 2. Anchors other components navigate by

**C4 (splash, hit, fire):**
- `ship.hullSide(t, ±1)` is where a shell breaks the skin — on the flank, at about a quarter of the
  deck height. `fleet.shipAt(side,r,c).t` gives you the `t`.
- `ship.hullPoint(t)` is the centreline equivalent, for a fire that should sit on the deck.
- `ship.deckAnchor` is amidships at deck height.
- `ocean.heightAt(x, z)` is what everything floating must be written onto; a splash column at a
  fixed y = 0 will be sliced by the swell. `gun.js` learned this the hard way with its blast wash,
  which now sits **2.2 m** above the local sea height for exactly that reason.
- **A flat additive plane on the water needs a radial falloff map.** A `RingGeometry` with a plain
  `MeshBasicMaterial` draws a hard-edged ellipse, which is the decal look the critics name. See
  `radialTexture()` in `gun.js`.

**C6 (camera, shell, tracer):**
- `fleet.gunFor(side, shipId)` → the anchor. `ship.gunAnchors[i]` if you know the turret.
- **The bore is the anchor's world-matrix column 0 (local +X), NOT `getWorldDirection()`**, which
  returns −Z and will fire every gun sideways. `gun.js` has this comment on the line.
- Barrels sit in an `elev` group at **0.30 rad (~17°)** elevation by default, so the muzzle is
  already above and outboard of the turret and a tracer leaving along the bore starts on a
  plausible trajectory. `ship.elevateGuns(rad)` and `ship.trainGuns(rad)` are independent —
  `rotation.z` on `elev` under `rotation.y` on the turret group, and Three's default XYZ Euler
  order composes them in the right order (elevate first, then train).
- `ship.fireGun(i)` applies the recoil shove and returns the anchor, so one call drives the camera
  shake, the vfx and the animation off the same event.
- Ships heave and trim on the swell every frame. **A camera generator must not read a ship's `y`
  at compile time** (HANDOFF_ENGINE cine rule 3) — take a fixed anchor or a pose.

**C7 / anyone:** `window.__waterline.world.fleet` is the fleet; ships are its `object3D` children
named `ship:<kit>`.

---

## 3. Detail levels, and where the draw calls go

```
detail 2  hero      hull · deck · structure · glass · rails · wake · turret ×N · barrels ×N
detail 1  mid       hull · deck · structure(+turrets+barrels merged) · wake
detail 0  distant   one merged mesh, one material
```

A ship is merged **by material, not by part**: every superstructure block, funnel, mast, barbette,
boat and piece of deck furniture goes into one `structure` geometry. Turrets and barrels stay
separate on the hero because they train, elevate and recoil.

`detail 0` still gets a bridge block, a funnel, a mast and turrets — **distant vessels as flat black
bars is a defect both C2 critics found independently**, and ours are the distant vessels in half the
shots on this project. Their features are also deliberately **chunky**: masts are 0.9 m instead of
0.3 m, because a sub-pixel pole at 2 km stipples into a dashed line and reads as unfinished
instantly. At that range nobody can tell a 0.9 m mast from a 0.3 m one; everybody can see the
stipple.

Railings are an **alpha strip, not tubes**, for the same reason — three 40 mm wires at 90 m are far
under a pixel. Mipped, they fade to the soft grey line the plates show instead of a dashed stipple.
`alphaTest: 0.38`, `depthWrite` on, so there is no sorting problem.

---

## 4. Scenarios registered (from `fleet.js`, at import time)

| id | ref | camera |
|---|---|---|
| `guns_fire` | `1172620_07` | starboard beam, 18 m, fov 50 — down the ship past the firing turrets |
| `guns_broadside` | `236390_09` | port quarter, 46 m, fov 32, no horizon in frame |
| `fleet_wide` | `1272010_00` | 46 m, fov 30, horizon at 0.34, hero at ~250 m, convoy at 2.1–3.6 km |

All three call C1's exported `sea(app, 'noon', ['fleet'])` — **without `'fleet'` in that array your
ships are hidden**, because `sea()` is a whitelist.

Things those scenarios do to state that is not mine, all runtime-only and all one page load:

- **`app.scene.fog.near/far`.** Noon's stock 250/2400 buries everything past 2.4 km in flat fog
  colour, and a convoy strung along the horizon comes back as a row of identically-coloured
  cut-outs. `fleet_wide` uses 500/4200; the gunnery shots push it out so the near ship is untouched.
- **`ocean.setDetailFade`** on `fleet_wide` only, after the grade, per D14.
- **`quality.set('skyCover'/'skyHaze'/'exposure')`** on `fleet_wide`, to get from noon's blue sky to
  the plate's flat overcast. Exposure 0.82 rather than the grade's 0.94 — measured, see §5.
- **`lighting.setShadowExtent()`**, so the hero ship is inside the sun's shadow camera and its
  turrets, funnels and masts actually shadow its own deck. Sea shots reported 0 shadow calls before
  this because C1's only caster was 640 m out.

`shot.mjs` loads a fresh page per shot, so none of this leaks between scenarios. If you ever drive
two scenarios in one page load, re-set what you need.

---

## 5. Measured

`--preset=medium --dpr=1 --w=844 --h=390 --mobile --perf`. Counts, per D4.

| shot | calls (main) | tris (main) | texMB | fps |
|---|---|---|---|---|
| `guns_fire` | **38** (27) | 29k (25k) | 35.5 | 60 |
| `guns_broadside` | **36** (25) | 28k (24k) | 35.5 | 60 |
| `fleet_wide` | **39** (30) | 44k (41k) | 35.5 | 60 |

Budget: < 90 calls, < 300k tris, < 45 MB, 60 fps. Comfortable on calls and triangles; **texture is
the tight one at 35.5 of 45**, and that figure includes C2's 24 MB bridge atlas, which is resident
in a sea scene because it is built at boot. My own contribution is about 11 MB: three 512² hull
pairs, one deck pair, one steel pair, plus rail, foam, gun-smoke, plume and blast-wash canvases.
Desktop `--w=1280 --h=720 --preset=high`: 38 / 36 / 38 calls, 41k / 40k / 53k tris, 60 fps.

Ladder: low 27.5 MB, medium 35.5, high 35.5. **`ultra` reports 27.5, the same as `low`** — that is
a texture-cap re-bake ordering artefact in the same family as D12 and it is not mine to chase, but
it means the ultra tier is not delivering its cap. Worth a look by whoever owns `bake.js`.

Regression check: `boot` 110 calls / 55k, `sea_noon` **9 calls / 30k — identical to C1's recorded
figure**, so nothing of C1's moved.

**Exposure** (`tools/exposure.mjs`, ours vs the plate on the same axis):

| shot | ours dead / median / clipped | plate dead / median / clipped |
|---|---|---|
| `guns_fire` | 0.0% / 129 / 3.7% | 0.1% / 138 / 0.0% |
| `guns_broadside` | 0.0% / 99 / 0.5% | 0.0% / 107 / 0.2% |
| `fleet_wide` | 0.0% / 113 / 0.0% | 0.0% / 83 / 0.0% |

No crushing anywhere and no milky lift. Two real misses: `guns_fire` clips 3.7% of pixels against
the plate's 0.0% — the flash core is genuinely blowing out where Sea of Thieves' does not — and
`fleet_wide` is still 30 luma brighter than a plate that is a flat grey North Atlantic afternoon,
even after dropping exposure to 0.82. Both are §7 items.

---

## 6. Quality knobs

**None registered.** Everything scales off preset fields that already exist: `texCap` sizes every
baked hull map through `bake.texSize`, `aniso` reaches the rail and foam textures through
`trackAniso`, `vfxCap` caps the shared card field, and `shadowMap`/`shadowDist` drive the self-
shadowing. The one knob I would have added — a flash-size multiplier — would have pinned all three
scenarios to one value at registration, which is the trap C1 documented for `seaState`.

`gun.js` owns **one extra `CardField` of 96 slots** on a normal-blended material, because the shared
field is additive and additive cannot draw dark smoke. It is pooled exactly like the shared one, it
is one draw call, and it is ticked from the first live muzzle each frame (guarded on
`window.__waterline.frames()`), because `vfx/index.js` only pumps its own field. It also carries a
per-instance `aAlpha` attribute patched in through `onBeforeCompile`, since `instanceColor` alone
cannot fade a normal-blended card and every puff would pop out of existence on the same frame.

`fleet.js` owns **one `Plumes` InstancedMesh** (130 slots, one draw call) for funnel smoke and
burning-ship columns. Puffs are placed once from a seeded drift path — a still has to be
reproducible, and animating them would put these shots under D13 for nothing. `round.js` still owns
all shell-trail smoke; this is ambient ship smoke and it is a different system on purpose.

---

## 7. Known gaps — honest, ranked by what I think each costs

- **Only one of the two flash clusters is visible in `guns_broadside`.** The forward superfiring
  pair fires, but from any camera on the disengaged side a 26 m bridge sits on the sight line to a
  muzzle 13 m above the water, and only the top of the fireball clears it. I bought most of the way
  out of this with 17° barrel elevation and by moving the camera nearly astern (the muzzles are 14 m
  outboard of a 4 m-wide tower, so from astern they clear it laterally) — but the plate has four
  distinct fireballs strung along the hull and we have one cluster plus a glow. The real fix is a
  longer ship relative to its superstructure, or firing the aft group and one forward group at
  visibly different phases from a camera chosen for that.

- **The flash core clips.** 3.7% of `guns_fire` is at 255 against the plate's 0.0%. Sea of Thieves
  gets a comparable bloom without clipping because it has a real bloom pass with a soft knee;
  `engine/post.js` has GTAO and FXAA but **no bloom**, so my "glow" is layered additive cards and
  the only way to make it big is to make it bright. I pulled the core from `#fffbf0` to `#e8d8b4`
  and the shell brightness down twice; further reduction starts to make it read as smoke rather
  than fire. A bloom pass would fix this properly and would help C4's fires too.

- **`fleet_wide` is 30 luma brighter and much bluer than its plate.** The plate is flat overcast;
  our only daylight grade is noon, with a blue sky and a blue sea. `skyCover 1.55`, `skyHaze 1.5`
  and exposure 0.82 get part of the way. An `overcast` grade in C1's `GRADES` is the honest fix and
  it is a small, additive piece of work in a file I do not own.

- **The near hull flank reads flat at close range.** The plating rows, camo and rust are all in the
  512² map and all visible at 200 m, but at 30 m in `guns_fire` a 90 m hull gets ~5.7 texels per
  metre and the plating detail is at the edge of resolution. Either the hull maps want 1024² (which
  the texture budget cannot take today without the ultra bug being fixed) or the hull wants a second
  tiling detail-normal layered under the unique map.

- **Deck furniture is generic.** Four kinds of box and cylinder, seeded per ship. It breaks up the
  deck and it is one draw call, but nothing on it is recognisably a ventilator, a boat davit or a
  ready-use locker at close range, and `guns_fire` puts it in the near foreground.

- **No crew.** C2's critics called featureless mannequins a defect; we have no figures at all, and
  both gunnery plates use crew as the scale cue that says "this thing is 200 m long".

- **Nothing is validated in motion or on a phone.** Every judgement here is from stills. The wake
  re-writes 340 vertices per hero ship per frame from `ocean.heightAt`, and I have never watched it
  move. The heave/trim term samples the swell a third of a length forward and aft; on a short sea
  state I expect it to look right and that is an expectation, not an observation.

- **The wake is one strip per side plus a trail.** It touches the hull now (the foam texture's
  across-strip falloff used to start 5% out, which left a metre of clear water between the hull and
  its own bow wave — the marine form of "objects that do not touch what they rest on"), but there is
  no quarter wave, no transom rooster tail and no wake *height*, only a foam decal on the surface.

---

## 8. D10 — C1's placeholder hulls can now be replaced

`ocean.js`'s `placeholderHull()` still stands in `sea_noon` and `sea_night`, and I did not touch it:
those files are C1's and D10 says the same scenarios re-run when the real kit lands. **They can be
re-run now.** `buildFleet().stage([{ kit:'cruiser', cells:4, x, z, heading, detail:0 }])` puts a
real silhouetted vessel wherever the placeholder sat, `sea()` already accepts `['fleet']`, and
`detail: 0` costs one draw call — cheaper than the 6-mesh placeholder and very much cheaper than
`sea_night`'s 38 sprites. Whoever does it owns re-scoring those two shots; I have not done it.

## 9. Escalations

None. Everything I needed was either mine or already exported — `sea()`, `seaCamera()`,
`setSeaLights()` and `setDetailFade()` covered the whole seam into C1's water, and `CardField` was
constructible from `pool.js` without touching the frozen VFX façade.

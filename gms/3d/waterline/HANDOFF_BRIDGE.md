# WATERLINE — C2 handoff: bridge interior + planning table

**Pass 3 of 3 — final.** Owns `js/world/{bridge,table,bridgeLights,bridgeKit}.js` and
`js/world/materials/{bridge,table}.js`. Nothing outside `gms/3d/waterline/` touched; no git writes.

**Start at §0 PASS 3.** It supersedes the levels, materials and lamp rigs described in §0 PASS 2,
which is kept below because its architecture (rigs, atlas, kit, contacts) is still what the file is
built on.

---

## 0. PASS 3 — the voids

### 0.0 The result

The gate was `node tools/exposure.mjs` on all three scored shots at `ok` with no `#` blocks. Final:

```
shots/bridge_table.png  1600x900
  luma<=4:   0.3%   median  25   p99 198   clipped   0.1%   → ok
  void map (# = >55% dead, + = >25%, . = >5%):
                    
                    
                    
                    

shots/bridge_night.png  1600x900
  luma<=4:   1.0%   median  19   p99 164   clipped   0.0%   → ok
  void map (# = >55% dead, + = >25%, . = >5%):
                    
                    
                    
                    

shots/bridge_lamp.png  1600x900
  luma<=4:   3.9%   median  17   p99 236   clipped   0.0%   → ok
  void map (# = >55% dead, + = >25%, . = >5%):
                    
   .        .  .  . 
   .           .    
   .
```

Was **42.1% / 59.7% / 61.5%** dead at medians **6 / 2 / 1**. The reference plates measure 0.0% / 3.8%
/ 4.4% at medians 32 / 23 / 16; we now sit at 25 / 19 / 17, which is inside that band on all three.
Nothing clips: `bridge_table`'s window p99 is 198 and 0.1% of the frame is at 255.

At `--preset=medium --mobile` (844×390, a wider crop than the scored frame, and a smaller lamp pool)
the same three read 0.5% / 4.8% / 7.3%. The mobile lamp shot is still `dark`; see §0.8.

### 0.1 Why the room was black, in one number

`materials/bridge.js` baked the deck plate's albedo texture **at** `#2b3036` and then multiplied it
by a material `color` of `0x2b3036`. sRGB `#2b3036` is 0.025 linear; squared it is **0.0006**. The
bulkhead did the same thing at `#39424b` × `0x545c66` → 0.004. Those are not dark surfaces, they are
surfaces no amount of light can lift: three's ACES fit maps any scene radiance below ~0.012 to
*exactly* zero, and a 0.0006-albedo deck under a plausible interior irradiance lands two orders of
magnitude under that.

So the paint colour now lives only in the bake and `color` stays white. Current values: bulkhead
`#6d757f`, deck `#2d3339`, seat `0x4a5058`, trim `0x8d949d`. That change alone took `bridge_lamp`
from 61.5% dead to 48.5% with no lighting change at all — which is how I knew it was the term that
mattered rather than the ambient.

Two more surfaces were black for the same class of reason:

- **The table bezel was `metalness: 0.78`.** A near-pure metal has almost no diffuse term, so in a
  compartment with nothing to reflect it renders solid black — 5 cm below the brightest surface in
  the room. That is the whole of "the glowing chart table does not light its own skirt". Now 0.35.
  `trim` (rails, pipes, the helm) had the same problem at 0.82 and is now 0.52.
- **The deck wear overlay is unlit.** `MeshBasicMaterial` at opacity 0.85 with polished lanes at
  rgba(196,206,214) put a flat luma ~20 on the deck *whether or not anything was shining on it*.
  That is a light source that does not respond to light, and it is most of why the deck read as a
  milky sheet once the albedo was fixed. Now tinted `0x3c424a` at 0.55.

### 0.2 Motivated fill, not a global lift

`RIGS[*].hemi` is a real irradiance now (1.25 / 1.55 / 1.00 with sky tints matched to each
compartment's dominant practical, ground tinted to the deck bouncing back up). Pass 2's values were
0.34 / 0.24 / 0.44 against colours around `0x18222e`, i.e. ~0.002 linear — a rounding error dressed
as an ambient term.

On top of that, per the brief, **one dim off-key practical per compartment**:

- A **port-side chart lamp** at `[-4.70, 1.06, 1.45]`, warm, in all three rigs.
- **The aft deckhead fixtures now have lamps.** `addFixture` has always built four long housings
  over the aft equipment wall and `RIGS` had no entry for any of them, which is exactly why the aft
  third of every frame was a void: an emissive with nothing behind it lights nothing. `aftDeckhead()`
  generates them from the same table the geometry comes from, the way `deckhead()` already did.
- **Two near-camera quarter fills** at `[±4.4, 1.65, -2.10]`, plus one more on the port chair in the
  night rig. Every camera in the set has those two corners behind it and nothing was ever aimed there.
- **A light at the table centre, 5 cm above the top, 2.2 m reach, decay 0.9.** Point lights do not
  occlude, so one lamp there puts the skirt, the pedestal and the deck on a single continuous
  falloff. This replaced the painted pool's job.

**The painted deck pool is gone as a lighting element.** It was a 3.2 m additive square, which is
where the "curved seam arc" and the "hard rectangular cut-off at lower left" came from — a decal
edge standing in for a falloff. It is now 5.6 m at about a fifth of the strength and carries colour
only; `setPool(colour, scale)` keeps its signature and scales the colour down internally.

**Lamp priority order matters again.** The preset cap cuts from the bottom of the rig list, and at
`medium` the fills that close the voids were exactly what fell off the end. They are now above the
decorative screen washes in every rig, and `TIER` went 2.8 → 3.2 (medium 14 → 16 lamps). Point
lights cost no draw calls, no triangles and no texture.

### 0.3 The emissives that did not emit

- **The pendant's shade was lit backwards, and the cause was not the shade.** The spot's origin sat
  *inside* the shade — the fixture hung 6 cm below the rig position, putting the emitter between the
  rim and the top — so the cone's outer surface was blasted white by its own bulb and had no
  gradient left to read. The fixture now hangs so the rim sits 1.2 cm **above** the emitter, which
  puts the whole shade outside the spot's angular cutoff. It gets a `uHot` emissive ramp off the
  cylinder's own local y (`pow(0.5 − y/0.20, 2.6)`), so the rim is the hottest part, plus a lit rim
  torus and an additive **aperture disc** in the mouth. Forcing `uHot` to black and re-rendering is
  what proved the ramp was working and the value was simply ten times too high.
- **The screen spill is an ellipse now, not a circle.** `bridgeKit.spillTexture()` is a 1:0.42
  radial squashed along the wall, centred **on** the emitter rather than 0.62 h below it, so a
  display brightens its own bezel first and the wash falls off along the surface it is mounted on.
  The old one was `radialTexture` at 2.4× — a perfectly round gaussian whatever the surface's
  orientation, which is the signature of a billboard sprite.
- **The light shaft reads as a cone.** The density profile was `pow(1−v, 1.35)`, which put
  essentially all of it within the first third and left a glow blob under the shade. It is
  `pow(1−v, 0.80)·0.52 + 0.07` with a firmer silhouette exponent, so the shaft has a penumbra edge
  the whole way down. The mask was already the cone's projected outline rather than a radial
  gradient and stayed that way.
- **A bounce.** The `chart` rig gains a wide weak lamp 10 cm above the paper aimed at nothing in
  particular — a deckhead directly over a lit sheet 90 cm below it cannot be black.

### 0.4 The dashed-bevel stipple

It was the bulkhead bake's **rivet row**, not a bevel loop. `rivet` fed the albedo at ×0.22 and the
height field at ×1.1, and on any strip narrower than about three pixels — every chamfer on every
console, the table skirt, both edges of the pedestal base — that row aliases into a run of evenly
spaced hard dashes at a constant screen pitch. It is now ×0.05 and ×0.30 with a wider smoothstep,
which keeps the rivets legible on a full-size bulkhead and removes them from every thin edge. The
same change removes the "repeating dash lattice" on the deckhead seams, because it was the same row.

The inter-seam mottle went from `f.grain.at(u*3, v*3)` to `u*0.38` — roughly the 8× the brief asked
for. It read as stucco; it now reads as a blotchy paint finish. Seam darkening dropped 0.50 → 0.34.

### 0.5 The rest of the list

- **The instrument atlas grew from 12 faces to 16**: a compass rose / gyro repeater, a
  hazard-striped alarm panel with individual lamps, a switch matrix with per-switch LEDs and
  labels, and an echo-sounder strip chart. The "standby" face gained a banner, a rule and a lamp
  instead of one dot. The base backlit wash went 0.07 → 0.15, so a dark screen is glass rather than
  a hole. All still one draw call.
- **Contact darkening on the chart.** `table.js` grows one instanced multiply mesh: a patch under
  every peg and under all seven pieces of chart clutter, positions in `CLUTTER_FEET` next to the
  `put()` calls that place them. A cast shadow only covers the side away from the lamp; without
  this the printed grid ran unbroken right up to and under every silhouette. +1 draw call.
- **Counter albedo** down 20% (`0.12 + 0.28·glow` → `0.095 + 0.22·glow`).
- **The chart's sandpaper speckle** was the paper-tooth normal at `u*20`. Now `u*5` at roughly half
  the amplitude, and the fine-grain channel is clamped to ±35%.
- **The room shell is subdivided** (ceiling and deck 12×8, walls 12×4 / 8×4) so a point light's
  falloff cannot resolve along a triangle diagonal. That was the "facetted falloff" on the red
  deckhead fixture.
- **The crew.** They were `0x171b21` with a cold fresnel rim, which is zero wherever a surface faces
  the lens square-on — i.e. across the whole of a crewman's back, the largest single dead region in
  two of the three frames. The rim term gains a **floor** (`mix(uRimFloor, 1.0, fresnel)`, 0.10) and
  `bridge.setCrewRim(colour, strength)` tints it per scenario, because a cold blue rim in a
  compartment lit by one tungsten lamp turns the watch into two pale ghosts.
- **The night windows are not empty.** `bridge_night` and `bridge_lamp` now set the night grade's
  sun to azimuth 12–18° at −1.2° elevation through `sky.setSun`, which puts C1's burning-hulk horizon
  glow band *out of the window* instead of behind the camera. Same seam pass 2 used for dusk. The
  bay glass went to `0x3a4f68` at opacity 0.55 so a dark pane carries the compartment's reflection.

### 0.6 The sea's cross-hatch — no escalation needed

The diamond lattice in `bridge_table`'s window is `ocean.js`'s ripple normal at a period short
enough to count. `ocean.js` registers a **public `seaRipple` knob** that scales `uRipScale`, so
`bridgeScene` takes a `ripple` argument and `bridge_table` runs at 2.6. `tools/shot.mjs` issues a
`Page.navigate` per shot, so quality knobs cannot leak from a bridge shot into a sea shot.

**The hard horizontal LOD line is still there and is an ESCALATION.** It is `GRADES[g].sea.fade` /
`ripFar` / `ripLod`, none of which is reachable from outside `ocean.js`. The change I want, in
`js/world/ocean.js`, is a public setter alongside `setSeaState`:

```js
    setRippleFade(near, far, lod) {
      u.uRipFade.value.set(near, far);          // currently written only from applyGrade()
      if (lod != null) u.uRipLod.value = lod;
      return ocean;
    },
```

so an interior shot can widen the dusk transition (`fade: [350, 1100]`) without editing C1's grade
table. I have not touched the file.

### 0.7 Perf, pass 3

`--preset=medium --dpr=1 --w=844 --h=390 --mobile --headed --perf`. Counts per D4.

| shot | draw calls (main) | triangles (main) | texture MB | fps | cpu p95 |
|---|---|---|---|---|---|
| `bridge_table` | **95** (85) | 35k (30k) | 24.22 | 60 | 3.1 ms |
| `bridge_night` | **99** (99) | 30k (30k) | 24.22 | 60 | 3.1 ms |
| `bridge_lamp` | **114** (94) | 36k (31k) | 24.22 | 60 | 3.5 ms |

Budget <120 calls / <260k tris / <45 MB. `bridge_lamp` is the tight one at 114, up 3 from pass 2:
the chart contact-decal mesh, the pendant's aperture disc and its rim torus. Twenty of those 114 are
still the pendant's shadow pass, which is what buys the prop shadows. Texture is up 0.06 MB (the
spill sprite). Ladder still responds: potato **18.86 MB**, medium/high **24.22 MB**.

Nothing added this pass casts a shadow. Every new light is a shadowless point light: no draw calls,
no triangles, no texture.

### 0.8 What is still weak, ranked — the revisit list for after phase 1

1. **The deck is the flattest thing in every frame.** Measured on a 400×150 crop of `bridge_table`'s
   near deck: ours reads median 23, the reference plate's equivalent crop reads 12, and ours has
   less spread across it. Hemi and env are both directionless and the deck faces both of them
   square-on. The real fix is a baked or SSAO-ish occlusion term under the console runs and the
   furniture rather than the eleven hand-placed contact quads there are now. This is the single
   thing I would attack first.
2. **`bridge_lamp` at `--preset=medium --mobile` is 7.3% dead — `dark`, not `ok`.** The scored frame
   passes; the phone crop is 2.16:1 at a fixed vertical FOV, so it shows more of the side bulkheads
   than any camera was authored for, and those are the darkest surfaces in the room. §7.7 calls
   portrait reframing Wave C's problem and this is the same problem wearing a different aspect.
3. **The window mullions still stair-step against the sky**, ~200:6 contrast with no coverage
   blending. I found no cheap targeted fix that is not MSAA, and MSAA4 measured 36 MB / 80% of the
   texture budget scaling with dpr². Left alone deliberately. If AA is ever revisited, a
   post-process FXAA/SMAA on `app.renderPath` is the route, not MSAA.
4. **The crew are still five boxes and a sphere.** They now read as warm-rimmed silhouettes instead
   of holes, which is enough at mid-ground, but `bridge_lamp` still has to hide the plotter and
   anything inside 1.5 m of the lens will expose them.
5. **The sea's LOD line** (§0.6). Escalated, not fixed.
6. **The lampshade is lit by a hack that depends on its own geometry.** The `uHot` ramp reads the
   cylinder's local y and the constant `0.20` is the shade height written twice. Change `SHADE_H`
   and remember the shader, or it silently mis-ramps.
7. **`bridge_lamp`'s surround is still sparse** next to UBOAT's plate — no pipework near the lens,
   no dogged door, no valve bodies. Unchanged from pass 2; the room now has light in its corners,
   but there is still not much in them.
8. **Nothing has been seen in motion or on a phone.** Unchanged from pass 1 and 2. The beam card and
   the haze cards are both view-dependent and have only ever been evaluated from fixed cameras.

### 0.9 New seam this pass

```js
bridge.setCrewRim(colour, strength = 1)   // what the room leaves on a uniform, per scenario
bridgeScene(..., { ripple })              // ocean.js's seaRipple knob, per scenario
```

`materials/bridge.js`'s `track_(m, share)` gives each surface its own **share** of
`scene.environment`: the deck sees 0.30 of it, the bulkhead 0.80, the seats 0.85. A deck's upper
hemisphere is deckhead, not sky, and at an equal share the floor came out as the brightest and
flattest thing in a dusk shot.

---

## 0b. PASS 2 — the rework (superseded where §0 PASS 3 says so)

The diagnosis I was handed was one sentence and it was right: *emissives that do not illuminate,
objects that do not touch the floor, and surfaces with no gradient across them.* Almost everything
below follows from fixing that, and several of the per-shot defects closed on their own once it was.

### 0.1 The one structural change: the room is lit by what is in the frame

Two things were doing the lighting before, and neither of them was a lamp in the shot.

- **`scene.environment` (the sky's PMREM) at `envMapIntensity` 1.** That is why a 7 m deck was the
  same brightness at the far bulkhead as under the glowing table, and why the deck had a step in it
  where two surfaces met. Bridge materials now register themselves in `materials/bridge.js` and
  `setEnvIntensity(v)` drives all of them at once; `bridge.setEnv(v)` exposes it and `bridgeScene`
  takes it as a per-scenario `env`. Values in use: **table 0.34, night 0.22, lamp 0.12**.
- **The rigs had 5 lamps at `medium`** because `bridgeLights` in the preset table was read as a
  literal count. It is a **tier** now: `bridgeLights.js` multiplies by `TIER = 2.8`, so medium gets
  **14** and potato still gets 6. Forward-rendered point lights cost no draw calls, no triangles and
  no texture, and D4 scores counts — this was budget that was never under pressure.

`RIGS` is now `{ hemi, lamps: [...] }` and **every lamp answers to something visible**: the plot
glass (above and below), each deckhead fixture, each bank of screens, the pendant bulb. The deckhead
entries are generated from the same `OVERHEAD` table the fixture geometry is built from, so a red
practical cannot end up lighting a place it is not bolted to. `hemi` is the only non-diegetic term
and exists so unlit steel sits at ~8% instead of at zero.

Two lighting facts worth keeping:

- **A glowing 2.3 m sheet of glass is an area source.** The plot lamp used to sit 15 cm above the
  paper with `decay: 2`, which is what blew the middle of the chart to clipped white while the
  corners stayed dark. It now sits at `TH + 0.62` with `decay: 1.15` — the falloff crosses the whole
  chart and the map lines stay legible in the hot area. That was defect 10 and it was not a
  clamping problem, it was a light-placement problem.
- **The `night` grade's sun is 0.05 intensity and its shadow map is ~28 draw calls of nothing.**
  `bridgeScene` sets `lighting.sun.castShadow = grade !== 'night'`. That is a property on C1's
  object, not an edit to C1's file, and it is what bought the budget for the pendant's shadow.

### 0.2 Shadows and contacts

- The chart pendant is a **shadow-casting `SpotLight`** (`spot: {...}, shadow: true` in the rig).
  `bridgeLights.js` grows spot support: `angle`, `penumbra`, `at` (target, room space), `near`,
  `far`. The rule, the pencil and the straight-edge throw short hard offset shadows on the paper,
  which was the single highest-value change in `bridge_lamp`.
- **Shadow casters are a whitelist, not a default.** Chart clutter only casts when
  `table.setLook('chart')` is active, and only the props whose shadow is legible (`userData.cast`).
  Twenty small meshes in a shadow pass is twenty draw calls for a smudge; this is 20 calls in
  `bridge_lamp` alone.
- **Contact darkening under everything that meets the deck** — table pedestal, three chair bases,
  three crew, the console runs along all four walls. One instanced mesh, `MultiplyBlending` against
  a white-at-the-rim texture. Multiply, not a black quad: a black quad's strength depends on
  whatever happens to be behind it, and half of these sit in shadow.

### 0.3 The flat regions

- **The tread-stud lattice is gone from the deck bake.** It was a perfect grid at the tile rate and
  no amount of contrast reduction fixes that. `deckPlate` now carries welded seams, rolled grain and
  pitting only.
- **All deck wear comes from `bridgeKit.deckWearTexture()`, one 512² mapped 1:1 across the whole
  plate, so it never repeats.** Traffic lanes (door → table, table → each chair, along the forward
  console run) are polished; ~110 scuffs are scattered with free rotation, radius and arc length and
  biased onto the lanes by `exp(-distance)`; nine big low-contrast stains break the mid-tone at a
  different scale. A deck is worn where feet go.
- **Per-texel roughness.** `bake.js` has always put roughness in the albedo's alpha and nothing read
  it. `roughFromAlpha()` in `materials/bridge.js` routes `diffuseColor.a` into `roughnessFactor` at
  the `<roughnessmap_fragment>` hook. Panel and deck roughness dropped to 0.56/0.62 with metalness
  up, so painted marine steel now has a broad low-gloss highlight along its top edges and the trim
  and bezels have tighter ones. That was defect 5 and it is mostly this line.

### 0.4 Per-shot work

**`bridge_table`**
- **The sun is out of the window.** The `dusk` grade's own sun is at azimuth 176° — directly behind
  the camera — which is why the sea was a flat orange wall. `bridgeScene` takes `sun: [az, elev]`
  and calls C1's public `sky.setSun`, and the shot uses `[23, 1.9]`. That buys the specular glitter
  column, the haze band above the waterline and a warm grazing bar across the deck and the mullions,
  all out of C1's existing shader. **No escalation was needed for defect 7.** `SUN0` snapshots every
  grade's authored sun at import and `bridgeScene` always sets it explicitly, so a bridge shot can
  never silently retune C1's sea shots.
- The helmsman moved off the centre window to the port wing, got a helm stand and wheel to hold, and
  crew arms now swing forward from the shoulder (`reach` per crew def).
- Crew use a **fresnel rim material** (`bridgeKit.rimMaterial`) — `totalEmissiveRadiance` gets a
  view-angle term. That is defect 6 and defect 16 in one material.

**`bridge_night`**
- Exposure 1.52 → **1.18**, `env` 0.22, hemi up to 0.44, plus a starboard fill and a moonlight lamp
  through the bay so port and starboard read at different values. The windows now sit *below* the
  chart table in the value hierarchy instead of being the brightest empty rectangles in frame.
- **The white squares outside were the foredeck's deck floods**, not the sea contacts —
  0.5 m unmapped quads on the additive grid material. Both they and the navigation lights are now
  soft radial sprites with a halo, and the nav lights are green/red/warm-white, never `#FFF`.
- The deckhead over the table is no longer black: a third plot lamp at `TH + 1.32` puts a cyan wash
  on it and up-lights the near consoles.

**`bridge_lamp`**
- **The pendant is rebuilt** (`bridgeKit.pendantLamp`): a truncated-cone shade that is *narrow at
  the top and wide at the rim*, a rim torus, a real bulb, a cable and a ceiling clamp. The light
  shaft is a camera-facing gradient card, **widest at the bottom**, with density falling along its
  length and alpha going to zero at both silhouette edges — it billboards about Y only, converting
  the camera into the beam's parent space so a yawed room cannot turn it edge-on. A halo sprite at
  the bulb and a warm patch on the deckhead above it. Nothing in the fixture casts a shadow: the
  bulb is *inside* the shade, so a shadow-casting shade puts a hard ring through its own pool.
- **The chart is paper.** A 16×16 plane with the edges lifting, one dog-eared corner and a slow sag;
  a `chartNormal()` map carrying paper tooth and three fold creases; roughness 0.52 so it takes a
  sheen. The bake gained a coastline with a hatched foreshore, depth soundings and printed creases —
  extended, per the brief, rather than restarted.
- **The props have real geometry**: the parallel rule is two 7 mm plastic bars on brass links, the
  pencil has a hex body, a sharpened cone and a ferrule, there is a straight-edge, a signal pad and
  a white-enamel mug with a handle and a rim highlight. New private prop materials live in
  `materials/table.js` behind `prop(name)` — **deliberately not in `SURFACES`**, which belongs to
  the frozen `materials/index.js`.
- The plotter is hidden in this shot (`crew.only(['helm','watch'])`). He stands 60 cm from the lens
  and the rim material made that much more obvious than the old flat black did.

**All three**
- Screens get a **lit bezel quad** behind each display and an **additive spill quad** on the console
  face under it, colour-matched per screen — one draw call each. The atlas bake gained scanlines, a
  corner falloff, a dark inner lip and a soft diagonal reflection per tile.
- Deckhead fixtures are **shallow recessed housings**: four housing bars around a lens that fades
  toward its own frame, with the matching lamp in `RIGS` at the same x/z.
- **Air.** Four soft additive cards stacked through the room (`bridge.setHaze(colour, strength)`).
  Near objects sit in front of one or two, the far bulkhead behind all four, so distance costs
  contrast. Scene fog would have to be shared with the ocean and this is a 7 m compartment.
- The bay glass carries a **reflection of the compartment** — instrument bands low in the pane,
  broken into segments, plus a cloth wipe. Not a real reflection, the recognisable look of one, for
  a 256² texture on a quad that already existed.

### 0.5 One debugging note that cost 40 minutes

The parallel rule looked like a **flat black bar** in `bridge_lamp` and I burned three hypotheses on
it — `shadowSide`, the shadow frustum's depth precision, `castShadow` itself. Forcing the prop
materials to flat magenta proved the geometry and the draw were fine; a top-down render
(`bridge_plot`) proved the top faces were brightly lit. **Zooming in at 10× showed the black bar was
the rule's own cast shadow, and the rule beside it was correctly lit grey plastic.** Isolate before
tuning works, but only if you also look at the thing at the size the defect actually appears.

### 0.6 Deliberately not changed

- **`bridge_table`'s interior/exterior exposure relationship.** Exposure stayed at 0.92 and the room
  was made *darker* (env 1 → 0.34) and then lit back up with practicals, never lifted to grey. The
  dusk window still holds a sky-to-sea gradient without blowing out.
- **The scenario ids, refs, cameras and `demoView` seed.** Score movement has to be attributable, so
  no camera moved. `bridge_lamp` in particular still frames a plate whose foreground I would
  otherwise reframe.
- **`js/world/lighting.js`, `sky.js`, `ocean.js`, `main.js`, `materials/index.js`, `config.js`.**
  The sun azimuth goes through `sky.setSun`, the sun's shadow through `lighting.sun.castShadow`, and
  the new prop materials avoid `SURFACES` entirely — all public seams, no file edits, **no
  escalation this pass.**
- **The screen atlas art.** The brief said the screen defect was about the light it casts and the
  bezel around it, not more screen art, and that is what was built.

### 0.7 Perf, pass 2

Measured `--preset=medium --dpr=1 --w=844 --h=390 --mobile --headed --perf`. Counts per D4.

| shot | draw calls (main) | triangles (main) | texture MB | fps | cpu p95 |
|---|---|---|---|---|---|
| `bridge_table` | **94** (84) | 34k (29k) | 24.16 | 60 | 2.9 ms |
| `bridge_night` | **98** (98) | 30k (30k) | 24.16 | 60 | 3.1 ms |
| `bridge_lamp` | **111** (91) | 35k (30k) | 24.16 | 60 | 2.2 ms |

Budget is <120 calls / <260k tris / <45 MB. `bridge_lamp` is the tight one — 20 of its 111 are the
pendant's shadow pass, which is exactly what it is spending them on. Texture is up 21.0 → 24.16 MB
(deck wear 512², chart normal 512², glass reflection 256², beam and lens sprites).

Post-D12 the texture ladder responds: **potato 18.80 MB, medium/high 24.16 MB**, verified.

### 0.8 What I still know is weak, ranked

1. **The deckhead fixtures are still the brightest thing in `bridge_night`.** They read as lit
   panels now rather than as emissive rectangles, but a red practical that saturates is one grade
   step from looking like a bug. The next lever is a per-scenario glow multiplier on `lensMesh`,
   which does not exist yet.
2. **The crew are still five boxes and a sphere.** The rim material buys them a silhouette and they
   survive the mid-ground, but `bridge_lamp` has to hide the plotter to keep him out of the lens.
   Anything that puts a crewman within 1.5 m of the camera will still expose them.
3. **The chart's holo look is busy.** The soundings and coastline that make the warm `chart` look
   read as paper turn into a lot of glowing cyan ink at `inkGlow` 1.30. It reads as a dense plot
   rather than as noise, but it is close to the line.
4. **`bridge_lamp`'s surround is still sparse** next to UBOAT's plate — no pipework close to the
   lens, no dogged door, no valve bodies. The haze and the console glow stop it falling to black,
   which is better than pass 1, but the eye has nowhere to travel after the chart.
5. **The sea's sun path is C1's shader doing its job at an azimuth I chose.** If C1 retunes `dusk`,
   `bridge_table`'s window changes with it and nobody will be watching for that.
6. **Nothing has been seen in motion or on a phone.** Unchanged from pass 1. The beam billboards and
   the haze cards are both view-dependent and have only ever been evaluated from one fixed camera.

### 0.9 New file

`js/world/bridgeKit.js` — bridge/table-private. One-directional: it imports `three` and
`engine/budget.js` and nothing else from `js/world/`, so `bridge.js` and `materials/bridge.js` can
both pull from it without a cycle. It holds the geometry helpers that used to live at the top of
`bridge.js` (`bevelBox`, `place`, `faceQuad`, `instanced`, `tileUV`), the procedural sprites
(`radialTexture`, `haloTexture`, `lensTexture`, `beamTexture`, `deckWearTexture`, `contactTexture`,
`glassTexture`), two materials (`contactMaterial`, `rimMaterial`) and `pendantLamp`. `radialTexture`
is no longer exported from `bridge.js`; import it from here.

---

## 1. What is built (pass 1 — still true except where §0 says otherwise)

### `world/bridge.js` — the room
A wheelhouse 11.4 × 7.2 × 2.68 m sitting at `ROOM.deck = 18` m above the waterline, origin still at
the waterline and centred per §2.2. Room space is **+Z forward (out of the window), +X starboard,
y = 0 at the deck plate**.

- **A three-facet forward bay** (`BAY`), not a flat wall: a centre run plus two angled wings, each
  with its own sill, header, mullions and pane. Two near-black stanchions stand at the bay joints.
  Every reference plate breaks its bright window band with dark vertical posts, and that silhouette
  is doing more work than the glass is.
- **~60 instanced console bodies**: a forward run following the bay with sloped instrument faces, six
  side racks with wall repeaters above them, five aft equipment cabinets, nine overhead pods on
  stalks. All one `bevelBox` geometry, three InstancedMeshes.
- **~70 lit displays in ONE draw call.** `materials/bridge.js` bakes an 8×8 atlas of 12 distinct
  instrument faces (PPI radar, bar meters, waveform, chart, gauge, lamp bank, seven-segment,
  attitude, contact list, standby, grid map, text block); each screen instance carries an `aTile`
  attribute picking its face and an `instanceColor` picking its hue and brightness. This is the
  single biggest thing separating our render from the plates and it costs one draw call.
- **Deckhead structure**: transverse and longitudinal beams, strip-light housings, and emissive
  discs under each overhead lamp so the red practicals have a visible source.
- **Three crew silhouettes** (helm, watch, plotter) as five instanced body parts — any number of
  crew costs five draw calls. `crew.only([...])` / `setPlotter(false)` pose the shot.
- **Three seats**, one deliberately in the near foreground as a framing silhouette.
- Pipe runs, handrails, a painted deck-light pool under the table.
- **A hanging chart-lamp fixture** (`setChartLamp(true)`) — cone shade, stem, emissive underside.
  A warm pool with no visible source is what makes a render look computed.

### `world/table.js` — the plot table
Origin is the **centre of the plot surface, y = 0 at the paper**; the pedestal hangs below.
2.0 m across on a 10×10 board (`TABLE.cell` retuned from 0.052 → 0.152; at the old value the
"planning table" was 56 cm wide).

- Chart surface, raised metal bezel, plinth/pedestal/foot, a real cell grid as geometry.
- **Markers**: only *resolved* cells get a peg. A hundred identical pegs is a checkerboard, not a
  plot. Miss cells get a flat pencilled ring, hit cells a burst decal plus a glowing peg, sunk ships
  a token laid along their cells.
- **A sheen quad** — the lamp's own pool on the surface. Both plates have one and it is the strongest
  single cue that the table is *lit* rather than painted.
- Chart clutter: bearing plotter, parallel rule, dividers, pencil, mug. Every plate of a real
  plotting surface is covered in instruments; an empty rectangle reads as a prototype.
- `setLook('holo' | 'chart')` switches the whole surface between a cold plot glass and warm lit paper
  from **one** baked texture — see §4.

### `world/bridgeLights.js` — interior lamps
Rewritten around **named priority-ordered rigs** (`RIGS` lives in `bridge.js`, next to the geometry
it lights). `useRig('bridge' | 'chart' | 'night')` re-fills a fixed pool from the top of that rig,
taking the first `quality.get('bridgeLights')` entries — 2 on potato, 9 on ultra. The plot glow is
element 0 of every rig because it is the one light a shot cannot lose.
`add()`, `setDim()`, `lamps` and `registerKnobs` keep their original shapes. **Nothing casts a
shadow**, as the file always said; the light on the deck is painted instead.

---

## 2. B8 — the lattice / anchor API, and how it was verified

Added to `buildTable`:

```js
latticeToLocal(r, c) → Vector3          // the corner shared by (r,c) (r,c+1) (r+1,c) (r+1,c+1)
localToAnchor(v3, kind) → {r,c}|null    // THE tap-resolution entry point, kind-aware
anchorToLocal(r, c, kind) → Vector3     // inverse; lattice for `heavy`, cell centre otherwise
anchorLegal(r, c, kind) → boolean
setAimMode(kind | null)                 // corner dots for `heavy`, 3×3 bracket for `salvo`
```

**Naming, honestly.** On this side a `Cell` is `r ∈ [0,h) c ∈ [0,w)` and an **`Anchor` is a
different type** whose domain depends on the kind and comes from `sim.anchorDomain()` — never
hard-coded here. `heavy` anchors are lattice points, `r ∈ [0,h-2]`. Nothing else in the file rounds
a coordinate by hand.

Verified headless (`--eval`, output pasted below in full):

```
{"fails":[],"snapAgree":"432/432","counts":{
  "null":"4,3,22,0,0,0,21,7,7,1","shell":"4,3,22,0,0,0,21,7,7,1",
  "heavy":"4,3,22,0,81,0,21,7,7,1","salvo":"4,3,22,9,0,4,21,7,7,1"},"nFail":0}
```

- `anchorLegal` matches `sim.anchorDomain` on every point in a ±3 window past the board edge, all
  three kinds. 0 disagreements.
- Anchor → local → anchor round-trips exactly for every legal anchor of every kind.
- `latticeToLocal(r,c)` is exactly the midpoint of `cellToLocal(r,c)` and `cellToLocal(r+1,c+1)`.
- **`localToAnchor` agrees with `sim.snapTarget` on 432/432 taps**, including off-board ones — the
  clamp behaviour is identical, so a tap resolved by the renderer and the same tap resolved by the
  sim can never disagree. This is the check worth re-running if either side moves.
- `setAimMode('heavy')` lights 81 corner dots on a 10×10 (= 9×9, the legal lattice); `'salvo'` draws
  4 bracket quads around the ghost's bounding box; `null`/`'shell'` draw neither.

**I did not modify the sim.** The domains agreed, so there is nothing to escalate there.

I also rendered the affordance and looked at it (`shots/bridge_plot.png` with `--pre` arming
`heavy`): the dots sit on cell corners and the ghost lights the 2×2 around the chosen corner.

---

## 3. Scenarios registered

| id | plate | note |
|---|---|---|
| `bridge_table` | `1489630_00` | scored |
| `bridge_night` | `1489630_15` | scored |
| `bridge_lamp` | `494840_09` | scored |
| `bridge_plot` | `1272010_04` | study, not scored this round |
| `bridge_red` | `1272010_02` | study, not scored this round. This is also the `bridge_look` seam REVIEW.md B3 asked for — the camera is already authored to that plate's framing, so C6 can hang `rig.freeLook()` off it |
| `bridge_dbg` | none | dev only, `ref: null`. The room from outside and above. It exists because *"the giant object blocking the right of frame"* turned out to be a crewman 1.3 m from the lens, and no amount of arithmetic found that — an exterior view did, in one render |

All are registered from `bridge.js` via `defineScenario` at import time. `bridgeScene()` sets the
sky/lighting grade, hides every root that is not `lighting/ocean/bridge/bridgeLights/vfx`, strips
`_ph*` and `_bd*` props, picks the lamp rig, sets the table look and paints a **deterministic**
demo board (`demoView`, fixed LCG seed) so the shot is bit-identical between rounds.

`_bd_deck` / `_bd_contacts` are **scenario dressing, not the ship kit** — a foredeck with rails and
deck floods, and two darkened vessels showing only navigation lights. C3 replaces the foredeck with
the real superstructure; the naming matches ocean.js's `_ph*` convention so any scenario strips them.

---

## 4. Knobs and the seams other components will use

| knob | file | what it does |
|---|---|---|
| `bridgeLights` | `bridgeLights.js` | lamp **tier**, ×2.8 → real lamp count; refills the pool from the active rig |
| `bridgeCrew` | `bridge.js` | crew silhouettes on/off |

Everything else is an API rather than a knob, because it is per-shot rather than per-device:

```js
bridge.setHeading(rad)        // which way the window faces, in world radians; anchors follow
bridge.setCrew(bool)  bridge.setPlotter(bool)  bridge.crew.only(['helm','watch'])
bridge.setChartLamp(bool)     // the hanging fixture
bridge.setPool(colour, scale) // the painted light on the deck under the table
bridge.screens                // the InstancedMesh, if anyone wants to animate a face
bridge.setEnv(v)              // pass 2: how much sky IBL the room's own materials see
bridge.setHaze(colour, k)     // pass 2: the four in-room aerial-perspective cards
bridgeLights.useRig(name)     // 'bridge' | 'chart' | 'night'
bridgeLights.hemi             // pass 2: the rig's ambient floor, so a dark room is not black
table.setLook('holo'|'chart')  table.setSheen(x, z, scale, colour)  table.setClutter(bool)
table.pulse(r, c, kind)       // pumped from bridge.update via table.js's pumpTables(dt)
```

**Anchors are unchanged in name and meaning**, which is what `cine/sequences.js` navigates by:
`tableAnchor` (world position of the plot surface centre, `y = ROOM.deck + TABLE.height`),
`windowAnchor` (centre of the bay, `y = ROOM.deck + (sill+head)/2`), `seatAnchors[]`, `glassPlane`,
`deckHeight`. `room` is exposed too if you need room-local space.

### For C6 and C7 specifically
- **Tap → shot is one call.** Raycast the chart, bring the hit into table-local space, then
  `table.localToAnchor(local, kind)`. Feed the result straight to `sim.footprint(game, {kind, r, c})`
  and hand those cells to `table.showGhost(cells)`. Do not round coordinates yourself, and do not
  assume the returned `{r,c}` is a Cell — for `heavy` it is not.
- **Two-stage commit** (§3.2) is C7's; the table gives you `setAimMode`, `showGhost` and `pulse` and
  holds no arm/fire state of its own.
- `table.setState(view)` takes a sim `View`: it reads `view.grid` and, if present, `view.enemyShips`
  (a ship with non-null `cells` is drawn as a sunk token).
- `table.pegWorld(r, c)` is the world position the match-cut (§7.3) should measure against.
- **The table is not `app.add()`ed** in frozen `main.js`, so it gets no update pump of its own.
  `table.js` exports `pumpTables(dt)` and `bridge.update()` calls it. If you build another table,
  it joins the same pump automatically.

### For C3
`ROOM.deck = 18` is where the bridge deck sits above the waterline. The foredeck dressing assumes a
weather deck 3.4 m below that; if the real superstructure puts it elsewhere, the window shots need
re-framing, not the room.

---

## 5. Perf (pass 1 — superseded by §0.7)

Measured `--preset=medium --dpr=1 --w=844 --h=390 --mobile --headed --perf`, reported as **counts**
per D4. GPU ms is quoted only to show it is not a 10× regression.

| shot | draw calls (main) | triangles (main) | fps | GPU |
|---|---|---|---|---|
| `bridge_table` | **70** (61) | 32k (27k) | 60 | 1.6 ms |
| `bridge_night` | **85** (76) | 33k (28k) | 60 | 1.7 ms |
| `bridge_lamp` | **71** (62) | 32k (27k) | 60 | 1.6 ms |

Texture memory **21.0 MB** at every preset (see the escalation below for why it does not fall).
CPU p95 ≤ 3.5 ms. Budget is <120 calls / <260k tris / <45 MB — passing with room, and the tri count
is nowhere near the limit because the room is instanced boxes rather than imported geometry.

`bridge_night` is the expensive one: it carries the foredeck, four deck-flood wash planes and two
contact vessels on top of the room.

Cuts already taken, in case a later pass needs headroom:
- Nothing in the interior casts a shadow. Every lamp is a shadowless PointLight, and the light on
  the deck is a painted quad. That is worth roughly 25 draw calls of shadow pass.
- The bulkhead and deck bakes were dropped from 1024² to 512² after measuring: 37.2 MB → 21.0 MB,
  **no visible difference at 1600×900** (rendered and compared). The screen atlas and the chart stay
  at 1024² — the atlas needs 128 px per tile and the chart is read at close to 1:1 in `bridge_lamp`.

---

## 6. ESCALATION — `texCap` is inert (pass 1; **fixed in `bake.js`, see DECISIONS D12**)

Not a blocker for me (I pass the budget at every preset by sizing textures so the worst case fits),
but it silently disables one rung of the quality ladder for **everyone**.

`js/main.js:41-42` runs

```js
configureMaterials(app.quality);
configureTextures(app.quality);
```

before any world module is constructed, and `?preset=` is not applied until line 130. So every
`bake.surface()` call bakes at the **default** preset's `texCap`, and a later `usePreset()` clears the
material cache without re-running `bake.configure()`. Measured: `--preset=potato` (texCap 512) and
`--preset=high` (texCap 1024) both report `texMB 21.019687`, bit-identical.

The fix I want, in `js/main.js`, immediately after the existing `?preset=` handling at line 130:

```js
if (params.has('preset')) app.quality.usePreset(params.get('preset'));
+configureTextures(app.quality);          // texCap is read at bake time; the preset moved after boot
 for (const [k, v] of params) if (app.quality.knobs.has(k)) app.quality.set(k, isNaN(+v) ? v : +v);
```

and, for runtime preset changes, in `js/world/textures/bake.js`'s `configure()` — have it subscribe
rather than be a one-shot:

```js
export function configure(quality) {
  quality.onChange(key => { if (key === 'texCap' || key === 'aniso' || key === '*') apply(quality); });
  apply(quality);
}
```
(with the current body moved into `apply`). I have not touched either file.

**Nothing else needed escalating.** In particular the sim's anchor domains matched mine exactly, so
`js/sim/` was not modified or requested to change.

---

## 7. What I know is weak (pass 1 — superseded by §0.8)

Ranked by what I would fix first if the critic hands back a fail.

1. **The exterior in `bridge_table` is a flat orange gradient.** It is C1's `dusk` grade seen from
   the anti-solar side; the plate's window is deep twilight blue. I tried `night` — at the exposure
   the interior needs, the window band goes to solid black and stops being a window. What is
   actually needed is a fourth grade (a blue twilight with a lit horizon band) and that is `sky.js`,
   which is C1's. I worked around it with distant navigation lights so the band is not empty.
2. **Repetition in the deck plate.** The tread-stud grid and the plate seams tile visibly on the
   floor, and both round-3 critics marked C1 down for exactly this class of defect. I reduced the
   stud contrast, halved the tiling rate and darkened the material, but the underlying texture has
   no large-scale variation breaking the repeat. The honest fix is a second low-frequency multiply
   layer at a non-integer scale, which I did not get to.
3. **The chart's ink is uniform across the surface.** The mottle and the sheen give a gradient, but
   the printed graticule has the same brightness in the corners as under the lamp, so a close read
   (`bridge_plot`) looks slightly flat. The markings should attenuate with the paper's own lighting.
4. **`bridge_lamp` has too little clutter in the surround.** UBOAT's plate is dense with pipes,
   valves, a door and a bulkhead close to the lens; ours falls to black instead. Falling to black is
   defensible but it is answering a hard question with an empty frame.
5. **The crew are five boxes and a sphere.** They read as silhouettes, which is all the plates ever
   ask of them, but any shot that puts one within 1.5 m of the lens exposes them. `bridge_lamp` is
   right on that line.
6. **Nothing has been seen in motion, or on a phone.** Same gap C1 closed its rounds with. The
   mobile renders are stills at portrait 390×844 and the table stays legible, but `pulse()` and the
   aim overlays have never been watched animate.
7. **Portrait framing is a crop, not a reframe.** The scenario cameras use a fixed vertical FOV, so
   portrait loses the sides rather than pulling back. §7.7 says that is Wave C's problem; noting it
   so it is not discovered as a surprise.

## 8. Two things that cost me time, so they do not cost the next person any

- **`instanceColor` never reaches the emissive term.** A `MeshStandardMaterial` with
  `instanceColor` tints the albedo and nothing else, so every "glowing" peg rendered white
  regardless of the colour written. Markers now carry their own `aGlow` instanced attribute that the
  shader routes into `totalEmissiveRadiance`. Same pattern as the screen atlas's `aTile`. If you
  want per-instance emissive anywhere else, do not reach for `instanceColor`.
- **Author a screen by its normal, not by Euler angles.** Screens on the bay wings are both yawed
  and pitched, and every combination of `rx`/`ry` I wrote by hand pointed something into a wall.
  `faceQuad(im, i, p, dir, w, h)` builds the matrix from `Matrix4.lookAt` with the target at
  `p − dir` (lookAt points +Z from the target *back* to the eye, which is the opposite of what you
  want for a quad). Everything landed first try after that. `place()` uses `'YXZ'` for the same
  reason — the default `'XYZ'` skews anything yawed and tilted.

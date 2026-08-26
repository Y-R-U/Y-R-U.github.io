# SKYHAMMER — ART DIRECTION

The target is the look of *Aircraft Evolution*: painterly, warm, atmospheric, and **quiet in the
background so the foreground reads**. Reference frames were studied by the manager; this file is
the summary you build against. Nothing here is a texture download — **every pixel is drawn
procedurally into offscreen canvases at boot.** That is deliberate: KITEHAWK died partly on
badly-keyed generated PNGs with magenta fringing and black mattes. We are not repeating it.

## 1. What the reference actually looks like

Bottom to top, at 1052×592:

- **Earth band, bottom ~10%.** Near-black warm brown, a *gently curved* horizon (a shallow arc
  across the whole screen, like a hilltop). Grass tufts and rock clumps break the edge. This band
  is nearly a silhouette — almost no interior detail.
- **Ground props sit on that curve** and are small: a farmhouse is ~55 px tall on a 592 px screen,
  i.e. **~9% of the viewport height, ~85 world units.** They are muted grey-brown-olive with clear
  silhouettes, lit warm from the horizon side. Thin **bright green health bars float above them**.
- **Mid distance:** snowy mountains and autumn trees, heavily hazed toward the sky colour,
  low saturation, no outlines.
- **Sky:** a vertical gradient — dusty blue at the very top → mauve → peach → a hot orange bloom
  sitting on the horizon. Cloud bands in **3 parallax layers**, soft-edged, low contrast, more
  opaque near the horizon. Clouds are wide and flat, not fluffy cumulus balls.
- **The aeroplane is small** — ~70 px wide on 1052, i.e. **~6.5% of screen width, ~120 world
  units** — and it is the single highest-contrast object in frame.
- **Bullets** are 4–10 px dashes with a faint streak. **Explosions** are a white-hot core, a thick
  orange rim, and dark grey smoke that rises and shears backwards.
- Everything has a **soft warm bloom**; nothing is pure saturated primary except fire and the
  green health bars.

## 2. Non-negotiable readability law

**The player's aeroplane must be the highest-contrast object on screen at all times.**
KITEHAWK failed this repeatedly: it passed a silhouette-size gate and you still had to hunt for
the plane. Enforce it in the drawing itself, not with a note:

- draw the plane with a **dark core + a bright warm rim light + a 1.5 px darker outline**;
- lay a **soft elliptical vignette-lift behind it** (a barely-visible lighter halo, ~2× plane size);
- keep the sky within a **narrow luminance band** near the plane's altitude so it can never
  camouflage;
- the contrast gate in `tools/contrastgate.mjs` measures RMS luminance contrast of the plane's
  bounding box against a 3× dilated ring around it. **Falsify the gate before trusting it**:
  make it run against a build where the plane is drawn in sky colour and confirm it FAILS.

## 3. Layer order (renderer draws in exactly this sequence)

1. sky gradient (prerendered strip, stretched)
2. far cloud band (parallax 0.06)
3. mountains / far skyline silhouette (0.14)
4. mid cloud band (0.18)
5. mid hills + treeline (0.35)
6. near cloud band, drawn ahead of terrain (0.55) — this one may pass in front of ground props
7. terrain fill + surface detail (1.0)
8. ground props, debris, wrecks (1.0)
9. actors: balloons, enemy planes, boss, player (1.0)
10. projectiles + tracers
11. FX: explosions, smoke, sparks, shockwave rings
12. near foreground grass / bokeh streaks (1.35) — thin, occasional, sells depth
13. HUD

## 4. Palette

Palettes live in `js/gfx/palette.js` keyed by `biome × timeOfDay`, each a frozen list of stops.
Ship these four first and add the rest per act:

| key | sky top → horizon | earth | accent |
|---|---|---|---|
| `farmland/dawn` | `#5b7fa6 → #b58fa0 → #f0b183 → #ffd9a0` | `#2b2016` | fire `#ffd27a` |
| `coast/day`     | `#4d86bd → #8fb6d6 → #d8e4e6` | `#22303a` | foam `#e8f2f4` |
| `city/dusk`     | `#2c3355 → #6d4a6b → #d1734f` | `#161219` | window `#ffc46b` |
| `alpine/overcast`| `#7a8a9a → #a9b3ba → #d3d6d4` | `#2a2f33` | snow `#eef2f4` |

Rules: background saturation stays **under ~35%**; the only high-chroma things on screen are
fire, the green health bars, and the player's rim light.

## 5. How things get drawn — SEE `CONTRACTS.md` §14

**The renderer is Three.js, not Canvas 2D.** Everything above in this file is still the law on
*what it should look like* — the palettes, the layer order, the prop scale, the readability law,
the quality bar for explosions. `CONTRACTS.md` §14 is the law on *how it is drawn*. Where this
file said "paint into an offscreen canvas", read "build geometry in code, light it, and let fog
and bloom do the atmosphere".

The two things that stay 2D: the **sky and cloud plates** (textures on planes at large negative
z, baked procedurally now, swappable for Flux plates later via `js/gfx/plates.js`) and the
**HUD** (a separate overlay canvas above the WebGL one).

Explosions and destruction still deserve the most effort of anything here (Aaron, item 7): a
white-hot core, additive particle fire, a real `PointLight` flash that lights the terrain and the
aeroplane, a rising sheared smoke column, an expanding shockwave ring, ember sparks under gravity,
and mesh debris that tumbles and settles into a wreck. Nukes get a mushroom silhouette and a
white-out. Scale all of it from a small pop to screen-filling.

## 6. Performance budget

60 fps on a mid phone. `devicePixelRatio` capped at 2, one tightly-fitted 1024 shadow map, bloom
behind the "reduce effects" toggle and the game correct without it, pooled particles and debris,
merged and instanced ground geometry, and level geometry streamed in chunks rather than built all
at once.

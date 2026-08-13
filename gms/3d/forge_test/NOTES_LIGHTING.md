# Lighting — sun, sky, shadow softness, night

Owned file: `js/world/lighting.js`. Nothing else was touched.

Three things this round: **shadow penumbra that grows with distance from the caster**, **the
lit-to-shade ratio and the colour of shade**, and **a night pass measured against the reference
plates instead of guessed at** — which is also what fixed the glowing bushes.

---

## 0. Re-measuring the critic before acting on it

The brief said to re-measure the blind critic's numbers because they predate the foliage env fix.
They were re-measured, at `--preset=medium`, with a tool that renders the shot twice
(`shadows=soft` / `shadows=off`) and reads lit and shade off *the same pixels* so albedo cancels.

| wall_day, before | critic said | measured |
|---|---|---|
| shade as % of lit | 29 % | **32.4 %** |
| shade colour | "cold teal stain" | rgb(61,78,79), **sat 0.224 against lit sat 0.142** |

So the critic's diagnosis held after the foliage fix and its headline number was close. Its
*prescription* did not survive contact:

- **"45–55 % of lit" is too high for our albedos.** Pushed to 42 % by fill alone, the frame went
  visibly flat and the lit faces lost their warmth (lit saturation fell 0.145 → 0.096) — the frame
  became grey-lit-with-a-teal-shadow instead of warm-lit-with-a-cool-shadow. The number that was
  actually broken was not the mean, it was the **deepest 10 %, which sat at 6.1 % of lit**. Nothing
  in a Tiny Glade plate is that crushed.
- **The "hard dark ellipse under every tree" is partly not a shadow.** `terrain.finish()` bakes a
  crown-shade disc into the ground decal, so some of what the critic read as a painted decal
  literally is one. The shadow-map half of it is fixed here; the decal is terrain's.

The number this round chased is therefore the deep end, not the mean.

---

## 1. Variable-penumbra shadows

One directional light gives one shadow map and therefore one penumbra width everywhere. Three's
`SHADOWMAP_TYPE_PCF` is a 17-tap box of radius `shadowRadius` texels — constant, so a tree's
shadow 30 m from its crown is exactly as crisp as the shadow under its own trunk.

`lighting.js` now rewrites `THREE.ShaderChunk.shadowmap_pars_fragment` at module load, replacing
the PCF and PCF_SOFT branches with a blocker search:

1. **9-tap search** at radius `rs` texels (centre + 4 at 0.55 + 4 diagonals at 0.707).
2. `hit == 0` → **return 1.0** (fully lit). `hit == 9` → **return 0.0** (fully occluded). Those two
   cases are almost the whole frame, and they now cost **9 taps where the stock PCF cost 17**.
3. Otherwise average the blocker depths and set the filter radius from
   `r = max(0.75, grow · min(z_receiver − z_blocker, 0.11))` texels, then a **16-tap Vogel disc**,
   rotated per pixel by interleaved-gradient noise so the low tap count does not band.

**Getting the growth rate into the shader without owning every material.** Three only uploads four
floats per directional shadow, and only one of them is spare: `shadowRadius`. So `fitShadow()`
repurposes it as the *growth rate* — blur texels per unit of normalised shadow-map depth:

```js
this.key.shadow.radius = min(72, shadowSoft · (c.far − c.near) / texel)
```

Both the depth span and the texel size are already known there, so a world-space rate
(`shadowSoft`, metres of penumbra radius per metre between caster and receiver) survives a change
of `shadowMap` or `shadowDist`. `FORGE_MAX_DZ = 0.11` caps the caster distance that counts, at
about 27 m — which is also what bounds the search radius, since `rs = grow · FORGE_MAX_DZ`.

The knob `shadowSoft` keeps its key but changes meaning and range: it was 0–8 (texels, default
2.2), it is now **0–0.07, default 0.05**, labelled *Shadow spread*. At 0 the filter collapses to
the 0.75-texel floor and shadows go near-hard, which is a usable A/B.

### Measured, on the same two rects, wall_day 1280×720

Penumbra = mean horizontal run of pixels the shadow map darkened by 10–65 %, computed on the
on/off ratio so grass texture cancels.

| rect | `shadowSoft=0` | `shadowSoft=0.05` | growth |
|---|---|---|---|
| wall shadow **close to its caster** | 2.69 px | 3.48 px | ×1.29 |
| tower shadow **~25 m from its caster** | 3.65 px | 8.21 px | **×2.25** |

The 0-column is the geometry/screen-scale baseline (far/near = 1.36 with no growth at all). With
the growth on, far/near = 2.36. That is the whole point of the change and it is the number to
regress against.

Contact shadows do not move: the walking figure's shadow and the tower's plinth line are the same
width at both settings, because their blocker depth equals their receiver depth.

### What did not work

- **Making the penumbra cap resolution-independent.** The cap is `grow · FORGE_MAX_DZ` texels, and
  `grow` already carries `1/texel`, so the cap tracks texel size for free — but the `min(…, 72)`
  clamp overrides it above 1024. At `shadowMap=2048` the maximum penumbra is therefore about half
  the world width it has at 1024. Raising the clamp is not free: 16 taps over a 16-texel radius
  bands visibly, rotation or not. Medium (1024) is the ship profile, so the clamp stays and high
  and ultra get crisper shadows. If that ever needs fixing the answer is more taps, not a bigger
  clamp.
- **A 5-tap search.** Cheaper on the common path, but with only 5 samples the "all blocked →
  return 0" early-out fires on partly-lit pixels and eats the inner half of the penumbra.
- **Skipping the per-pixel rotation.** A fixed 16-tap disc contours visibly once the penumbra is
  more than ~10 px on screen. The rotation costs one `sin`/`cos` and removes it entirely; it does
  not read as noise at dpr 1.

Note for whoever touches `app.js`: changing `renderer.shadowMap.type` at runtime does **not**
recompile materials, so switching the `shadows` knob between `hard` / `soft` / `softhigh` after
boot changes nothing but `castShadow`. `off` works because that path only toggles `castShadow`.
`ratio.mjs` is unaffected. This is pre-existing and is not mine to fix.

---

## 2. Lit-to-shade ratio, and why shade was a teal stain

The long comment in `apply()` is right and was obeyed: the previous failure was untinted ambient
making lit and shade the *same value*, and the fix is not "more fill". What was actually wrong was
that **almost all of the ambient came from a saturated-blue hemisphere and almost none from the
sky IBL**, whose horizon is near-white. Green grass × blue-only ambient = cyan, and cyan at 6 % of
lit is a stain.

So the shift was: more of the fill from `envPower` (directional, horizon-weighted, gives specular),
some from `skyFill`, the hemisphere's midday sky target much paler, and `sunPower` down so the lit
level does not blow out.

| default | was | now |
|---|---|---|
| `sunPower` | 5.6 | **4.4** |
| `envPower` (Sky bounce) | 0.28 | **0.58** |
| `skyFill` | 0.11 | **0.21** |
| hemisphere sky target at high sun | `#7fa8d8` | `#bcc8cf` |
| `desat` at high sun | 0.66 | 0.88 |
| `SUN_LUT` midday | `#ffe8ca` | `#ffe3bc` (warmer, to hold the lit face against the paler fill) |

### Measured

| shot | shade / lit | deepest 10 % | shade sat | lit sat |
|---|---|---|---|---|
| wall_day before | 32.4 % | **6.1 %** | 0.224 | 0.142 |
| wall_day after | **39.2 %** | **17.5 %** | 0.239 | 0.155 |
| street_dusk before | 45.0 % | 11.1 % | — | — |
| street_dusk after | **55.3 %** | **26.8 %** | 0.271 | 0.311 |
| creek_day before | 62.7 % | 21.2 % | 0.083 | 0.165 |
| creek_day after | **53.2 %** | **25.6 %** | 0.090 | 0.192 |

The deep end nearly tripled on wall_day, which is the fix that matters. creek_day's *mean* fell,
and that is correct rather than a regression: the old 17-tap PCF leaked light uniformly into every
shadow, so the mean was flattering while the deepest 10 % was still 21 %. Now the mean is lower
but the deep end is higher and the gradient in between is real.

wall_day sits at 39 %, under the critic's band. Pushing it to 45 % is one knob (`skyFill 0.25`) and
it looks worse — see §0.

### The anti-solar sky

The sky dome had one colour per elevation and none per azimuth, so a low sun painted every surface
in the frame the same pink and nothing had a cool side. `LUT` gained a **`cool`** column — the
horizon opposite the sun — blended in `drawSky` by `counter · dot²` where `dot < 0`, with
`counter` running 0.20 at midday to 0.62 at a grazing sun. It costs three lerps in a loop that only
runs when time or cloud cover changes, and it feeds the PMREM, so a wall facing away from the sun
now receives measurably cooler light than one facing across it.

---

## 3. Night — measured against `2198150_08` and `_04`, not guessed

This is where the biggest error was. Measuring the plates:

| | ours before | ref `_08` / `_04` | ours after |
|---|---|---|---|
| moonlit stone | Y 0.024, sat 0.57 | **Y 0.058–0.070, sat 0.72–0.84** | Y 0.041, sat 0.66 |
| night sky | Y 0.024, sat 0.57 | **Y 0.040–0.101, sat 0.76** | Y 0.062, sat 0.71 |
| ground | Y 0.015 | Y 0.054–0.067 | Y 0.074 |

**The reference night is two to four times brighter than ours was, and far more saturated blue.**
The last quick pass had darkened the LUT and taken the fill to a cool grey; both were the wrong
direction. What makes `_08` not read as a blue filter over a day frame is not that it avoids blue —
it is a near-primary cobalt everywhere — it is that the **value** range is 3:1 across it and the
only non-blue thing in the frame is a lamp. So: keep the saturated blue, restore the value.

- `LUT` night rows brightened and pushed to blue: `#080d1c → #12297d` (zenith),
  `#1a2742 → #213c8a` (horizon), and the same for the −0.16 row.
- Hemisphere night target `#3a4a63` (cool grey) → **`#2f4f9a`**, ground half `#1c212c` → `#17244e`.
- `nightLift` 2.2 → **4.6** (range widened to 0–10), `moonPower` 1.5 → **3.0** (range 0–6).
- `MOON` `#7fa8ff` → `#8ab0ff` — the key stays *paler and less saturated than the fill*, which is
  what gives moonlit faces a hue separation from shade rather than only a value one.
- Stars: 1.5× as many, each about 30 % dimmer. One equirect texel is ~8 screen pixels at fov 55, so
  a star can only ever be a soft disc; the fix is to make it a dusting, not a snowflake.

### The bushes that glowed green — cause and fix

Flagged in `NOTES_FOLIAGE.md` §9. Confirmed, and `scatter.js` did not need to change.

The mechanism was exactly the one guessed there. It was **not** env intensity: foliage's
`envMapIntensity` is `envPower × foliageEnv`, and it does *not* pick up the `×1.9 twilight ×1.7
night` boost that `setEnvIntensity` gives everything else, so at night foliage gets **less** env
than the world, not more. The cause was that the dominant night light — the hemisphere fill at
`nightLift` — was a **desaturated grey**, and a neutral light multiplies every albedo by roughly
the same factor in all three channels, so it preserves each surface's own hue. Grey light on a
green albedo is green; grey light on grey stone picks up whatever blue is left in the light.

| town_night bush patch | before | after |
|---|---|---|
| rgb | (17,33,31) — **G > B, green** | (35,68,83) — **B > G, blue-teal** |
| saturation | 0.483 | 0.601 |

Making the night fill a saturated blue (B/G ≈ 4 in linear) flips the hue. The bushes are still
*brighter* than the stone around them — Y 0.058 against 0.041 — and that part is albedo, not light:
`foliage.leaves`/`bush` in `zones.js` is a pale mint whose reflectance is roughly twice the stone's,
and no illuminant hue fixes a value difference.

**If it is worth chasing further, the change belongs in `zones.js`, not `scatter.js`:** drop the
`light`/`neutral` zones' `foliage.leaves[1]` (`#c2d9a4` and similar) by 15–20 % in value, or lower
`canopyLevel`'s default in `scatter.js` from 0.78 to ~0.66. Either takes the bush's night
reflectance under the stone's and the lumps stop reading as lit objects. It costs a little canopy
separation in daylight, which is why I am not asking for it blind — it is a trade, not a bug.

---

## 4. Fog

`street_dusk` and `creek_day` were milk past 60 m. Base density 1.6 → **1.15**, with the low-sun
multiplier raised 2.2 → **2.9** so dusk keeps its long-path haze (the reference dusk plate has no
black anywhere in it and that is most of why), and the night multiplier 0.45 → **0.6**.

Night fog at 0.85 was tried first and is what a blue filter actually looks like — the whole town
flattened to one value. 0.6 is the most that can go in before form starts to go.

---

## 5. Perf

Headed, real GPU, gate profile `--preset=medium --dpr=1 --w=844 --h=390`, measured back to back
with only `lighting.js` swapped.

| shot | gpu p95 before | gpu p95 after | cpu p95 after | calls | tris | tex MB |
|---|---|---|---|---|---|---|
| wall_day | 5.0 ms | **5.1 ms** | 3.1 | 87 | 496 k | 52.61 |
| street_dusk | 5.7 ms | **5.7 ms** | 2.7 | 86 | 495 k | 52.61 |
| gate_night | 5.9 ms | **5.9 ms** | 2.5 | 54 | 312 k | 52.61 |
| town_night | 7.7 ms | **9.0 ms** | 3.1 | 87 | 496 k | 52.61 |
| creek_day | 5.2 ms | **5.3 ms** | 2.8 | 86 | 495 k | 52.61 |

Budget 11 / 6 / 150 / 350 k / 60 MB. Worst case 9.0 ms of 11.

Three of the five are free, because the two early-outs cost 9 taps where the stock 17-tap PCF cost
17 and that pays for the 16-tap filter on the small fraction of pixels that are actually in
penumbra. `town_night` is the exception at +1.3 ms: a moon at 35° over a dense town puts far more
of the frame in penumbra than a high sun does. Splitting that: `shadowSoft=0` measures 8.1 ms, so
~0.4 ms is the shader swap and ~0.5–0.9 ms is the softness itself. Repeat runs vary ±0.4 ms.

No new textures; texture memory is unchanged.

---

## 6. Knob defaults changed

Defaults ship, so these are product decisions, not test settings.

| knob | was | now | note |
|---|---|---|---|
| `sunPower` | 5.6 | 4.4 | |
| `envPower` | 0.28 | 0.58 | multiplies `foliageEnv` too — foliage's ratios are preserved, checked below |
| `skyFill` | 0.11 | 0.21 | |
| `moonPower` | 1.5 | 3.0 | range 0–3 → 0–6 |
| `nightLift` | 2.2 | 4.6 | range 0–5 → 0–10 |
| `shadowSoft` | 2.2 | 0.05 | **meaning changed** — texels → metres per metre; range 0–8 → 0–0.07 |

`envPower` is the one to be careful with, because `scatter.js` derives foliage's
`envMapIntensity` from it. Re-ran `scratch/lum.mjs --shot=wall_day` against the figures in
`NOTES_FOLIAGE.md` §1: canopy 0.373 → 0.378, tufts 0.339 → 0.339, canopy p97 0.730 → **0.702**
(their ceiling is 0.72), tuft→ground separation 0.129 → 0.133, canopy→ground separation 0.301 →
0.262 (their floor is 0.12). Every target they set still holds — at midday world and foliage both
scale by `envPower`, so the ratio between them is unchanged.

---

## 7. Still open

- **wall_day shade saturation, 0.239 against a lit 0.155.** Shade is cooler *and* more saturated
  than light. It is not the illuminant any more — it is that the grass albedo is a saturated green,
  so any cool fill reads cyan on it. Reference plates get low-saturation shade from pale albedos,
  not from clever light. `zones.js`.
- **Max penumbra shrinks at `shadowMap ≥ 2048`.** See §1. Fix is more taps, not a bigger clamp.
- **Dappled canopy shadow.** The critic wanted the tree shadow "soft, dappled and lighter at its
  outer 30 %". Soft and lighter-at-the-edge it now is; dappled it cannot be, because the crowns are
  solid meshes in the shadow pass. That needs alpha-tested crowns rendering to the shadow map, and
  it is `scatter.js`'s to decide whether that is worth the depth-pass cost.
- **Dawn and dusk are still a strong overall pink** at times 5–7 and 18–19. The reference dusk plate
  is too, so this is only half wrong; what is wrong is that near ground loses its local colour. The
  anti-solar `cool` column helps the shaded side but the horizon row `#f0a6b4` still drives the
  hemisphere ground bounce. Next lever if anyone wants it.
- The `sunAngles` latitude (0.78 ≈ 45°) puts the sun at 49° at `wall_day`'s 10.5, which is high and
  flat. Raising `lat` to ~1.0 gives raking 37° light at the same clock time and barely moves
  sunrise/sunset — but it also lifts both night shots toward twilight, so it was left alone.

---

## 8. Where the renders are

- `shots/light_before/` — baseline, all five, 1280×720 medium.
- `shots/light_final/` — final, all five, 1280×720 medium. `shots/light_final_high/` — same at high.
- `shots/light_sweep2/t{4.8,6.5,19.0,20.2}/` — the day sweep either side of the terminator.
- `shots/gate_light_before/`, `shots/gate_light_after/` — the headed perf pair.

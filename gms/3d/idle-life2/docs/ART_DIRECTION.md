# Idle Life 2: Art Direction

The concept stills in `docs/art/` (the five key ones are copied into `refs/`: town hero portrait and wide, lemonade card, Hollow's Eve portrait, family) are **the target look**. Aaron approved this style on 2026-10-03 ("they look good"). Every plot, prop and character is judged side by side against them.

## The look in one line

A **warm, soft, toy-like miniature diorama**. Chunky rounded forms, gentle facets on trees and rocks, low golden light, long soft shadows that go cool and violet, sugared-almond pastels, and one small finite slab of town floating in a matching sky haze. Think Townscaper and Tiny Glade, lit like a tilt-shift photo of a model railway.

It is **not** strict low-poly. Aaron (2026-10-03): "looking great is the goal". Forms may be bevelled and lightly faceted. PBR, an env map and bloom are allowed where they are measured and fit the budget (see §3). It **must not read as blocky**: FACET/CRAFT anti-blocky rules still govern every silhouette (§5).

Performance target: a Samsung S22 Ultra in portrait at 60 fps, using `setPixelRatio(min(dpr, 2))`.

---

## 1. Stills: what to copy from each

| File | What it is | Copy this | Ignore this |
|---|---|---|---|
| `art/town_hero_portrait.jpg` | **Main hero view, portrait.** Dawn Old Town plaza, bench, lemonade stand, food truck, barber pole. | Camera: ~35° elevation, perspective fov 30–35°, framed so the street runs corner to corner. The bench character sits in the lower third, with a large readable head. Paving slabs in 3–4 close warm tints (vertex colour per slab, not a texture). Townhouses are 2–3 storeys with steep roofs (52°), a chimney on one side, and a different roof colour per house. Iron lamp posts with warm heads. Round trees made of 2–3 clustered blobs. | The sky's large flat peach area: keep a gradient, but let the town fill more of the frame. |
| `art/town_hero_wide.jpg` | **Main view, wide/desktop.** The same block as a finite slab. | **The diorama slab.** The ground ends in a crisp edge with a thin darker skirt, and fog/sky sits behind it in the same colour. Patchwork pastel paving (peach, butter, mint, lilac at low saturation). The park is a raised lawn with a kerb lip. Every house has a different hue but the **same value band**, so the roofs carry the contrast. | The perfectly straight row of houses: jitter yaw ±4° and vary the footprints. |
| `art/card_lemonade.jpg` | **Line card 16:7.** Lemonade stand with a queue. | Card framing: the business fills 60% of the width and is shot from ~40° above. The queue walks *into* the frame from the right. The pyramid of yellow cups is the **stock pile** and the brightest accent. A wooden plank stall with a striped awning (alternating stripes as separate vertex-colour quads). Potted plants as silhouette breakers. Chibi customers with heads ≈ 40% of their height. | Clipped houses behind it: card cameras should look past the plot into soft fogged greenery, not into a wall. |
| `art/card_carwash.jpg` | **Line card 16:7.** Car wash tunnel. | The tunnel as a **cutaway** (its open side faces the camera). Blue brush cylinders (odd segment count, spinning). **Foam = clustered white and pink spheres** with scale-pulse, which needs no particles. Rounded toy cars with tall cabins, plus dirty cars carrying brown decal patches (vertex colour) as the input queue. A kiosk with a hip roof. | |
| `art/card_ferry.jpg` | **Line card 16:7.** Ferry at the quay. | Water: a flat turquoise plane with a gentle facet shimmer and **hard white wake lines**, not a texture. Stone quay with timber bollards and rope swags. The ferry is chunky, red hull and white superstructure, about 2.5× the height of a person and roughly 6× as long. A ticket booth with a red roof. A lighthouse on the horizon gives scale and fades into haze. | The large empty water area at left: crop tighter or add a moored boat. |
| `art/hollows_eve_portrait.jpg` | **Hollow's Eve side world, portrait.** | The same plots, **re-paletted only**: walls go to dusk lilac/teal, roofs to deep purple. Windows become **the warm light source** (emissive amber `#FFB45A`). Jack-o'-lanterns line the kerbs as the accent. Green cauldron glow on the Witch's Brew stall. String lights in catenary swags between houses. A big pale moon disc in the sky. Purple ground fog lies under the slab. | |
| `art/hollows_eve_wide.jpg` | **Hollow's Eve, wide.** | The slab floating on a bank of violet fog. A cool, dim moonlight key, with warm local pools from windows and lanterns. Read value, not darkness: the scene average stays around 30% luma, so it is never murky. | |
| `art/family.jpg` | **Character family sheet.** Young adult, parent + kid, elder with cane. | Proportions in §4. Big rounded heads, simple hair caps in one colour, dot eyes and brows (no mouths needed at game scale), hoodie and jumper silhouettes, chunky shoes. **Ageing = hair colour + glasses + cane + slight stoop**, using the same rig. | Facial detail beyond eyes and brows; it vanishes at game scale. |
| `art/lighting_mood_wide.jpg` | **Mood reference only** (a richer render, not the approved style). | Copy **only the lighting ideas**: warm glowing shop windows and lamp heads against the dawn, chimney smoke puffs, string lights on the truck, and the thick earth skirt under the slab. | Its tiled roofs, cobbles and rendered-material detail. Those are texture work, outside the approved soft look and the no-texture kit. |

Raw alternates (other seeds) are not kept. They were generated with the prompts at the bottom of this file and can be regenerated the same way.

---

## 2. Palettes (sRGB hex; convert to linear before writing vertex colours)

Each district palette owns its light (CRAFT §4). Rules that hold everywhere:
- Every house in a row uses a different wall hue at the **same value**; roofs are 20–30 L\* darker than the walls. The value contrast lives in the roofs, the trim and the shadows.
- Shadows shift **cool and more saturated** (toward violet), never toward grey.
- Each district has **one accent**, which marks the money (the stock pile, the glyph targets).
- `fog.color` is exactly `sky.horizon`.

### Old Town (dawn, the hero district)
| Role | Hex |
|---|---|
| sky top / horizon (= fog) | `#F5A9A0` / `#FBD3B0` |
| paving (4 slab tints) | `#E9C7AE` `#F1D9B8` `#DDB8A8` `#E8D2C0` |
| kerb / slab edge | `#C9A48E` / skirt `#9C7468` |
| lawn lit / shade | `#9DB56A` / `#5E7A55` |
| walls (rotate per house) | peach `#F2B38E`, butter `#F3D79A`, mint `#B9D3B6`, powder `#AFC6D8`, rose `#EBB1B4`, lilac `#C7B3D6` |
| roofs | terracotta `#C8665A`, sage `#7E9A86`, slate-blue `#6E7FA8`, plum `#9A6A8C` |
| trim / window frames | `#FFF4E6` |
| glass | `#8FB4C9` (env-mapped) |
| wood (stall, bench) | `#A9774F` / dark `#7A5238` |
| lamp metal | `#3E3A44` |
| tree canopy lit / shade | `#8DB466` / `#4F7350` |
| accent (lemonade yellow) | `#FFD447` |
| barber pole | `#E2564A` + `#FFF4E6` |
| food truck | `#6FC1B0` |

### Suburbs (bright afternoon)
| Role | Hex |
|---|---|
| sky top / horizon | `#8CC8EA` / `#E4F1EC` |
| ground (concrete, drive) | `#DCD6CB` / `#C5BEB2` |
| lawn lit / shade | `#A6C76E` / `#5D8A5A` |
| walls | cream `#F4E9D6`, sky `#BFD8E8`, mint `#C4E0C8`, apricot `#F4C8A4` |
| roofs | coral `#DD7A5E`, slate `#7C8DA3` |
| accent (foam pink / café red) | `#F59AB8` |

### Harbour (late-afternoon gold)
| Role | Hex |
|---|---|
| sky top / horizon | `#F2D9A6` / `#FBEBCB` |
| water deep / shallow / wake | `#3E9EA6` / `#7FD1C7` / `#F4FBF8` |
| quay stone lit / shade | `#C9BFAE` / `#8E8494` |
| timber | `#8B6A4E` |
| walls | white `#F6F1E7`, sea-blue `#9CC3D6`, sand `#E8D3A8` |
| roofs / hulls | red `#C9483F`, navy `#3F5577` |
| accent (life-ring and ferry red) | `#E44B3C` |

### Downtown (golden hour, taller)
| Role | Hex |
|---|---|
| sky top / horizon | `#C8A2C8` / `#F7D2B4` |
| street / pavement | `#8F8899` / `#D8CCC4` |
| walls | stone `#E3D3C1`, lilac `#BBA8CF`, teal `#7FB2B0`, brick `#C47E68` |
| glass towers | `#9BB8D8` (env-mapped, high tier only) |
| accent (boutique gold) | `#F2C14E` |

### Night (any district, local-time day/night; "never too dark")
Night recolours light, not geometry. Lerp the district palette as follows:
| Role | Hex |
|---|---|
| sky top / horizon (= fog) | `#2C2F5E` / `#6B5C8E` |
| sun → moon key | `#AFC3F2`, intensity 0.9 |
| hemisphere sky / ground | `#5A6AB8` / `#4A3A52`, intensity 0.9 |
| window / lamp emissive | `#FFC46B` (×2.0 intensity into bloom) |
| floor: scene luma mean ≥ 0.28 | |

### Hollow's Eve (side world, always night)
| Role | Hex |
|---|---|
| sky top / horizon (= fog) | `#2A1E4A` / `#6C4A8E` |
| ground fog bank | `#8A6BB0` (alpha planes under the slab) |
| moon disc | `#F3EEDC` (unlit, with a faint `#C9C0E0` crater facet) |
| walls | dusk lilac `#8C7BB0`, teal `#4E8C8A`, plum `#7A5A8E`, ash `#9A95AE` |
| roofs | deep purple `#4A3570`, midnight teal `#2F5560` |
| paving | `#7E7896` / `#6A6484` |
| windows (emissive) | `#FFB45A` |
| jack-o'-lantern shell / glow | `#E8792E` / `#FFC24A` emissive |
| cauldron brew (emissive) | `#7BEA5A` |
| string lights | `#FFD27A` |
| accent | pumpkin orange `#F08A2C` |

---

## 3. Lighting recipe (Three.js r160, physical intensities)

The rig has three lights and no AmbientLight.

```js
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // or AgX; pick one and re-verify palette swatches through it
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Old Town dawn
const sun = new THREE.DirectionalLight('#FFD9AE', 2.8);   // elevation 28°, azimuth = camera azimuth + 45°
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);   // 2048 on high tier
sun.shadow.radius = 3; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
// shadow camera = the visible slab's bounding box × 1.05, refit per view (hero vs card)

const fill = new THREE.HemisphereLight('#8E9BE0', '#D9A27E', 0.85);  // cool sky, warm bounce: free hue-shifted shadows
const rim  = new THREE.DirectionalLight('#B9C8FF', 0.6);  // from behind and low (elev 15°, sun az + 160°), no shadow

scene.fog = new THREE.Fog(SKY_HORIZON, near, far);   // linear; near/far anchored to camera distance; colour === sky horizon
scene.background = skyGradientTexture;              // 2-stop canvas gradient top→horizon
```

| District | Sun colour / intensity / elevation | Hemi sky / ground / int | Rim |
|---|---|---|---|
| Old Town (dawn) | `#FFD9AE` / 2.8 / 28° | `#8E9BE0` / `#D9A27E` / 0.85 | `#B9C8FF` 0.6 |
| Suburbs (afternoon) | `#FFF1D8` / 3.0 / 45° | `#7FA6E6` / `#C9B48A` / 0.8 | `#C8DAFF` 0.5 |
| Harbour (late gold) | `#FFDDA0` / 3.0 / 32° | `#7FA9D9` / `#C9A77A` / 0.85 | `#A9D4FF` 0.6 |
| Downtown (golden hour) | `#FFC890` / 2.6 / 22° | `#8C86D0` / `#C98E7A` / 0.9 | `#BFB3FF` 0.7 |
| Night | `#AFC3F2` / 0.9 / 50° (moon) | `#5A6AB8` / `#4A3A52` / 0.9 | `#7A8CFF` 0.4 |
| Hollow's Eve | `#9FB0F0` / 0.7 / 55° (moon) | `#5B4A9E` / `#3A2848` / 0.8 | `#C79BFF` 0.5 |

**Emissives and glow.** Windows, lamp heads, lanterns, the cauldron and neon tiers use emissive vertex colour or a small shared emissive material, at 1.5–2.5× intensity.
- **High tier** (the S22 class): one half-res UnrealBloom pass, threshold 0.9, strength 0.35, radius 0.4. Only emissives cross the threshold.
- **Low/mid tier:** no bloom. A camera-facing soft additive disc behind each lamp (the `basicBlob` material) fakes the halo.

**Materials.** Ship two main programs:
- `MeshLambertMaterial` with vertex colours for the world.
- `MeshStandardMaterial` with vertex colours, roughness 0.55 and `envMapIntensity` 0.6 for hero accents: glass, car paint, the ferry hull, water (roughness 0.15).

Use one PMREM env map built from the sky gradient (`RoomEnvironment` tinted, or a tiny generated equirect). The two programs above plus blob, sky, crowd and emissive make six in total.

**Contact.** Bake vertex AO toward the ground and into corners on every plot. Add a blob shadow under every character and car on all tiers, even with the shadow map on, because it sells contact at card scale.

**Tilt-shift feel.** Do not use DOF post. Use fog plus a static vignette (a screen-space quad, 10–15% at the corners). In card views, pull the fog in so the background behind the plot softens.

---

## 4. Proportions (1 unit = 1 m)

The world is **slightly toy-scaled**. Characters are chibi and short, while buildings and vehicles are real-ish but chunky. Keep these ratios, because the stills depend on them.

| Thing | Size | Note |
|---|---|---|
| Adult chibi | **1.35 m** tall | Head 0.52 m tall (≈ 38% of height), torso 0.45, legs 0.38. Shoulders 0.5 wide. |
| Teen | 1.2 m | Head 36% |
| Kid | 0.95 m | Head 42% |
| Toddler / baby | 0.7 m / carried | |
| Elder | 1.28 m | 6° forward stoop, cane 0.75 m. White hair cap plus glasses ring. |
| Door | 2.0 × 1.0 m | Head of a character at ~0.7 of door height, as in the stills |
| Townhouse storey | 2.8 m | 2–3 storeys + a 52° roof. Footprint 4–6 m wide × 5–7 m deep; vary it. |
| Window | 0.9 × 1.3 m | Trim frame 0.08 m proud, glass recessed 0.06 m |
| Lemonade stand | 1.8 w × 1.0 d, counter 1.0 h, awning top 2.3 | Cup pyramid 0.35 m tall at L1 |
| Food truck | 4.6 L × 2.1 W × 2.7 H | Toy proportions: short bonnet, tall boxy-but-rounded body, wheels 0.75 m |
| Car | 3.6 L × 1.75 W × 1.5 H | Cabin is 55% of the length, wheels 0.6 m, all corners rounded |
| Car-wash tunnel | 9 L × 4.2 W × 4.0 H | Brushes 0.8 m diameter |
| Ferry | 16 L × 5 W, superstructure top 4.5 m | |
| Bench | 1.6 L, seat 0.42 h | Characters sit with their feet dangling slightly off the ground (cute) |
| Lamp post | 3.2 m | Lamp head 0.4 m |
| Trees | 3.5–6 m | Canopy 2–3 clustered blobs, trunk tapered 0.6 top/bottom |
| Pigeon | 0.25 m | Readable at hero scale, so slightly oversized |

---

## 5. Shape language

1. **Round the corners of everything.** Use a 3–6% bevel on every box-like form: walls, stalls, vehicles, crates. A sharp-cornered box is the "3-year-old" placeholder look Aaron rejected.
2. **Taper and lean.** Walls lean 1.5–3°, chimneys taper, trunks taper, and awnings sag slightly. Use no perfectly plumb verticals except lamp posts.
3. **Odd radial segments** (7, 9, 11) for cylinders: pole, brushes, trunks, cups, lamp posts. Use 7–9 for small ones.
4. **Soft vs faceted.** Characters, cars, foam, canopies and pumpkins are **smooth** (rounded masses). Rocks, roofs, paving and water are **gently faceted** (visible flat planes, low contrast between facets).
5. **Break every silhouette.** Each building gets a chimney, dormer, sign bracket, flower box or pole; each stall gets plants. Nothing in a row shares a yaw within ±4° or the same footprint.
6. **Stripes and patterns are geometry.** Awnings, the barber pole and paving slabs are separate quads in vertex colour. There are never texture maps.
7. **Stock piles are the brightest, most saturated thing on a card** (cups, foil parcels, cones). The eye should land on the money.
8. **Descending heights.** Each cluster has one hero building and smaller neighbours, so the skyline never runs flat.
9. **Finite world.** The hero view is a slab with a visible edge, fog-matched to the sky. Card views fade into fog rather than hit a hard edge.

## 6. Avoid

- Raw `BoxGeometry` and unbevelled cubes; grey placeholder colours; any prop whose bounding box is within 15% of a cube.
- A grey `AmbientLight`; shadows that go grey or black instead of violet-blue.
- Fog that does not match the sky horizon (a visible seam).
- Saturated primary colours across large areas. Large areas stay in the 30–55% saturation band, and >70% is for the accent only.
- Photographic or painted textures, normal maps and text on signs. Shop identity comes from silhouette and props (barber pole, lemon, taco, fish), never lettering.
- Pitch-black night. Night is blue-violet with warm windows, at a luma mean ≥ 0.28.
- Realistic human proportions next to chibi ones; mixing scales.
- Busy fills. Leave negative space (the lawn, the plaza) as the stills do.
- Outlines, SSAO and DOF post.

---

## 7. How the stills were made (to regenerate or extend)

Generated on mflux-queue `:7867` with model `flux2-klein-9b-mlx-4bit`, 4 steps, txt2img.
- Sizes: portrait 768×1344, wide 1344×768, cards 1536×672 (16:7).
- The style suffix appended to every prompt:

> stylized low-poly 3D game render, flat-shaded faceted polygons, chunky simple geometry, solid vertex colours, no textures, smooth untextured surfaces, soft pastel palette, warm saturated colours, Townscaper and Tiny Glade charm, cute miniature diorama, isometric three-quarter view from above, soft ambient light with warm key light, soft blob shadows, clean, toy-like, mobile game art, Three.js render

Scene prompts open with the subject, for example "tall portrait view of a charming tiny old town square at dawn … a street of large chunky flat paving stones in two soft colours …", and end with "no text, no lettering". For new plots (Café, Pet Salon, Fish & Chips, Boatyard, Downtown), reuse this suffix so they stay in family with the approved set.

# Idle Western 2: Art Direction

**Status:** proposal from the P0-B art lane, 2026-10-04. Aaron has not yet approved it. Show him `refs/a_*.jpg` first, then the B and C sheets for contrast.

The concept stills in `refs/` are **the target look**. Every plot, prop and character is judged side by side against them, in the same way as Idle Life 2 (`../idle-life2/docs/ART_DIRECTION.md`). Read that document too: its shape language, finite-slab, fog and budget rules all carry over unless this file overrides them.

## The look in one line (recommended: Look A, "Clay Caricature")

**A sun-baked toy western made of soft matte clay.** Chunky, rounded false-front buildings in faded barn-paint colours sit on a dusty diorama slab under a low golden-hour sun with long violet shadows. The townsfolk are big-headed caricatures whose **hats are the joke**: hats are often wider than the shoulders and sometimes taller than the body. Comedy is physical. People fly out of saloon doors in cartoon dust clouds, and builders bonk each other and see stars. Think *Rango* proportions, Looney Tunes timing, and the Idle Life 2 toy diorama lit at sunset.

It is the same family as Idle Life 2 (soft, bevelled, toy-like, tilt-shift), so the FACET-derived kit carries over almost unchanged. The difference is louder silhouettes, a warmer and dustier palette, and visible comedy.

---

## 1. The three candidate looks

| | A — Clay Caricature (**recommended**) | B — Spaghetti Pop Facet | C — Painted Peg Toy |
|---|---|---|---|
| Refs | `a_clay_*.jpg` | `b_facet_*.jpg` | `c_peg_*.jpg` |
| Feel | Rango / Pixar short in a model town; warm golden hour; soft clay | Crisp low-poly, flat faceted faces, high-noon sun, turquoise sky | Handmade painted wooden toys; peg-doll people; glossy enamel |
| Comedy | Best. The faces and poses are expressive, and the big hats and dust clouds read instantly | Good poses, but the faces are stiff and the jokes read as diagram | Charming and cute rather than rude; it fights the M15+ cheek |
| Buildability | High. Rounded slabs, lofted hats and blob clouds are already in the kit. Wood grain becomes plank strips plus a procedural noise map | Highest. Pure vertex colour and almost no texture. It is cheapest, but it looks like every other low-poly western | High. Peg people are just cylinder plus sphere. Glossy paint needs a good env map |
| Risk | It can go monotone orange-brown (see §2 accents) | It looks generic and drifts away from the Idle Life 2 family | It reads as "for kids", and the sheen costs env-map quality on phones |

**Why A:** the brief says "THIS ONE IS FUNNY", and A is the only look where the joke survives at thumbnail size. Big hats, expressive brows and dust clouds all read on a phone. It also re-uses the Idle Life 2 renderer, uber material and post chain as they are, so the art budget goes on silhouettes, not engine work. From **B**, steal the clean faceted rocks and mesas and the cool high-noon shadow colour for the midday palette. From **C**, steal the varied barn-paint facade colours and the turned-wood simplicity of the crowd rig.

---

## 2. Stills: what to copy from each (Look A)

Source: **Codex** = Codex image tool (cloud, GPT image), **Flux** = local mflux-queue `flux2-klein-9b-mlx-4bit`, 4 steps. Codex won every shot on comedy and composition. Flux won only on the more elevated, more buildable hero camera and on chibi proportions.

| File | Source | What it shows | Copy this | Ignore this | Three.js technique |
|---|---|---|---|---|---|
| `a_clay_hero.jpg` | Codex | **Main hero view, portrait.** Duel in the street, a cowboy thrown out of the red saloon, a horse, water tower, windmill, mesas, sunset | Street runs diagonally (bottom-left to top-right). The duellist in the foreground is seen from behind with a huge black hat, and the rival is mid-street. False fronts have **different heights and paint colours** (barn red, teal, mustard, weathered tan). Boardwalk steps up 0.35 m. Long violet shadows raking toward the camera | Ground-level blur on the near cacti (that is our tilt-shift, but keep it gentle). The sun disc in frame: the hero camera looks *down*, so the sky is a gradient band only | Facades are `b.slab` with a stepped/arched parapet from `shape.loft`. Plank walls are vertex-colour strips (alternate ±4% value) plus a shared procedural grain noise in the uber material's roughness channel. Hats are lofted (see §5). The dust cloud is a blob cluster (§7). |
| `a_clay_hero_flux.jpg` | Flux | Same scene from a **higher, ~40° camera** that matches the game rig | Camera height and framing for the hero. The **cartoon dust cloud** as a pile of 6–9 cream spheres. The thrown man mid-air with legs up. The tumbleweed. Readable boardwalks on both sides | Mushy faces and blurry signage | Use this framing for `cameras.js` hero, and Codex's for colour and character. |
| `a_clay_card_saloon.jpg` | Codex | **Line card 16:9, saloon working.** Ejection with dust cloud, piano player on the porch, queue, horses, barrel stack | Card framing at ~35° above, with the plot filling ~70% of the width. **The barrel and crate stack is the stock pile** (the brightest warm thing). The queue lines the boardwalk at right. Warm window glow even by day. Balcony with spindles | Stage-like extra depth behind; card cams should fog out into mesas | `P.pile({kind:'barrel'})`; window glass `g:-1` (night) plus a small constant `g:0.15` for the interior glow; spindles merged into the static mesh. |
| `a_clay_build.jpg` | Codex | **Building under construction.** Timber frame, scaffold, ladder, half-up false front, the plank bonk with stars, a foreman with a plan, a mule cart of lumber | Construction reads in **three stages**: (1) staked lot plus lumber pile, (2) bare frame plus scaffold, (3) false front up and sign blank. Then the finished building pops in with squash-and-stretch. Crew of 3–4. The plank-carrier gag. **Yellow cartoon stars** | Over-detailed tool clutter | Frame = instanced thin slabs (one draw). Scaffold planks are tier geometry revealed by a `progress` uniform/vertex attribute (clip by height), so a building visibly rises while the timer runs. Stars are a 5-point `shape.prism` billboard with `g:1`. |
| `a_clay_lineup.jpg` | Codex | **Character sheet:** sheriff, barkeep, madam, undertaker, drunk, snake-oil salesman | **Hat identity:** a giant tan ten-gallon (sheriff), a *tiny* bowler perched on a big head (barkeep: the joke is the inverse), a wide red brim piled with feathers (madam), a stovepipe ~60% of body height (undertaker), a crumpled droopy brim over the eyes (drunk), a straw boater (salesman). Props: star badge, beer mug, fan, tape measure, bottle, green glowing potion. Big noses and moustaches | Realistic proportions (heads here are ~25% of height); fishnets and other cloth detail | Use the proportions of `a_clay_lineup_chibi_flux.jpg` (§5), and the costumes and props of this sheet as vertex-colour regions. |
| `a_clay_lineup_chibi_flux.jpg` | Flux | Same six at **game proportions** (head ≈ 38–40%) | Head-to-body ratio and stubby limbs, which match our instanced crowd rig | Generic faces | The crowd rig as it is, plus a per-instance hat id (§6). |
| `a_clay_night.jpg` | Codex | **Night street.** Lantern pools, a catenary of bulbs, glowing saloon, a drunk staggering out, the sheriff with a lantern | Night is **blue-violet plus warm amber pools**, never black. Windows are the light source. Lantern posts sit every ~6 m on the boardwalks. Bulb strings sag across the street. Moon disc. Water tower and windmill silhouetted against a lighter sky band | It is slightly too dark (luma 0.27); the game targets ≥ 0.30 | `g<0` night-only glow on windows and lanterns, plus a fake light-pool decal (additive radial quad on the dirt, one instanced draw) instead of real point lights; bloom picks up the bulbs. |
| `a_clay_mood_thrown.jpg` | Codex (manager smoke test) | Mood and comedy only: the ejection pose at street level | The **pose**: the body horizontal, legs kicked up, an open-mouth scream, the hat lifting off, a dust burst at the doors | Camera, lettering and the realistic wood | The `thrown` clip: a ballistic arc with a 360° tumble on the root, the hat as a separate instance that lags 0.15 s and lands after the body. |

The B and C sheets (`b_facet_hero/card_saloon/build/lineup/night`, `c_peg_hero/card_saloon/build/lineup/night`) are kept for the choice and as steal-sources (§1). They are not targets.

---

## 3. Palette (Look A)

Large areas stay at 30–55% saturation. Values above 70% are for accents and the "money" pile only. Every facade gets a different hue in the **same value band**, so the roofs and awnings carry the contrast (the Idle Life 2 rule).

| Role | Hex | Notes |
|---|---|---|
| Street dirt (light / mid / rut) | `#E8B888` `#D49A6A` `#B97B52` | Per-vertex mottling, plus darker wheel ruts and hoof-print dents |
| Boardwalk planks | `#A8714A` `#8E5C3C` `#6E452D` | Alternate per plank |
| Weathered raw wood (frames, posts) | `#B88B60` `#7A5236` | |
| Facade paint: barn red | `#B5483A` | Saloon default |
| Facade paint: faded teal | `#5E8F8C` | |
| Facade paint: mustard | `#D9A441` | |
| Facade paint: sage | `#8FA27A` | |
| Facade paint: dusty rose | `#C98B7E` | Madam's parlour |
| Facade paint: bleached cream | `#EAD9B8` | Trim, sign boards (blank) |
| Roof / awning tin | `#8A8F93` with `#A86B4A` rust | Stripes on awnings are geometry |
| Cactus | `#6E9B57` / shadow side `#4E7A45` | |
| Mesa rock (near / far / haze) | `#C5653F` `#B8705A` `#D9A08A` | Faceted (steal from B) |
| Sky (golden hour, top → horizon) | `#8C8FC4` → `#F4B88A` → `#FCD9A6` | Fog colour = the horizon colour |
| Shadow tint | `#6C5A9E` at 35–45% | Shadows go violet, never grey |
| Accent: gold badge / coins | `#FFD27A` | |
| Accent: snake-oil green | `#7DFF6A` (glow) | |
| Accent: dust cloud | `#F3E2C4` | |
| Accent: cartoon stars | `#FFE45C` (glow) | |
| Window glow / lantern | `#FFB45A` / `#FFC978` | |
| Night sky (top → horizon) | `#2B2A5C` → `#5B4A86` | Moon `#FFF3D6` |

**Anti-monotone rule:** in any hero frame at least **3 non-wood paint hues** must be visible (red, teal, mustard, sage, rose). The Codex refs drift toward all-orange; the game must not.

## 4. Lighting per time of day

| Time | Key (sun) | Fill / hemi | Fog / sky | Notes |
|---|---|---|---|---|
| Dawn (5–8) | Low, pink-gold `#FFC7A0`, int 1.6 | Sky `#B9B6E0`, ground `#D9A47A` | Lilac to peach | Long shadows pointing west; dew-less, dusty haze |
| Midday (10–15) | High, near white `#FFF4E0`, int 2.4 | Cool `#9FD4D8` (steal B's teal) | Pale turquoise to cream | Shortest shadows, crisp cool-blue tint `#5F78A8`. Comedy reads by shape, not light |
| **Golden hour (16–19), default hero** | Low amber `#FFB070`, int 2.0, azimuth from the front-left so it rakes the facades | Sky `#8C8FC4`, ground `#E0A070` | Violet to peach (§3) | The money shot. Shadows stretch 3–4× the object height |
| Night (20–4) | Moon `#9FB0FF`, int 0.6 | Hemi `#4A4A8A` / `#3A2A40` | `#2B2A5C` to `#5B4A86` | Windows, lanterns and bulbs `g<0` on. Additive light-pool decals. Target luma mean ≥ 0.30. Bloom threshold lowered |

Night is when the saloon, madam's house and the gambling hall look best. Give them extra lanterns.

## 5. Proportions (1 unit = 1 m, slightly toy-scaled like Idle Life 2)

| Thing | Size | Note |
|---|---|---|
| Adult townsfolk | 1.35 m to the top of the head | Head 0.52 m (≈ 38%), torso 0.45, legs 0.38. Re-use the Idle Life 2 chibi rig |
| **Hat, baseline** | Brim **1.6–2.2× head width**; crown 0.5–0.8× head height | A "normal" hat in this town is already huge |
| Sheriff hat | Brim 3× head width (≈ 1.4 m) | It shades two people. Star badge glows a little (`g:0.2`) |
| Undertaker stovepipe | 0.8 m tall (≈ 60% of the body) | Wobbles on a spring when he walks |
| Barkeep bowler | 0.35× head width | Inverse joke |
| Madam hat | Brim 2.4× head width, plus 3–5 feather ribbons that sway | |
| Drunk hat | Droops over the eyes, crumpled crown | Sway clip ±8° |
| Snake-oil boater | Brim 2× head width, flat crown | Bottle glows green |
| Horse | 1.6 m at the withers (shrunken, chunky, big head) | Lofted body; legs are 4 tapered cylinders |
| Storey | 3.0 m | Saloon is 2 storeys plus a balcony; most shops are 1 storey plus a **false front to 5–6.5 m** |
| False front parapet | +1.2–2.0 m above the roofline | Shapes: flat, stepped, arched, gabled. Vary them along the street |
| Boardwalk | 0.35 m high, 2.0 m deep | Posts every 2.4 m carry a tin awning at 2.6 m |
| Swinging doors | 0.9 m tall, hung 0.4 m above the floor | Hinge spring animation |
| Water tower | Tank 3 m diameter on a 7 m trestle | It is the skyline's hero |
| Windmill | 9 m tower, 3.2 m wheel, 15 blades | Spins (dynamic draw) |
| Saguaro | 2.5–5 m, arms 1–3 | 9-side tapered cylinders with a rounded tip, vertical rib facets in vertex colour |
| Mesas | 40–120 m wide, 25–60 m tall, at 150–400 m | Background ring of faceted prisms in 3 haze layers |

## 6. Building kit vocabulary

Everything goes through `kit.builder` and the uber material. There are no new materials and no textures with lettering.

- **False-front shop**: a slab box with a 3–5% bevel and a 2° lean jitter. The parapet is lofted (flat / stepped / arched / gabled). A cream trim band and a **blank sign board** (identity comes from props: tooth for the dentist, anvil for the smith, bottle for snake oil, a big wooden boot for the cobbler, a gun silhouette for the gunsmith). Covered boardwalk in front.
- **Saloon** (hero plot): 2 storeys, a spindle balcony, swinging doors, a big window with a piano silhouette, barrels. A lantern each side of the doors.
- **Boardwalks**: plank strips merged per block; steps at the door; hitching rails (2 posts plus a rail) every 6–8 m.
- **Props**: barrels (9-side, hoops as darker bands), crates, water troughs, wagon wheel leaning on a wall, wanted-poster planes (a blank face sketch, no text), spittoons, rocking chair, tumbleweed (a ball of 5–7 bent ribbons, rolling), cow skull, anvil, hay bales, mine cart.
- **Skyline heroes**: water tower, windmill, church steeple at the far end, telegraph poles with sagging wire. One per cluster, so the skyline never runs flat.
- **Construction stages**: lot (stakes plus string, lumber pile) → frame (timber skeleton plus scaffold plus ladder) → shell (walls, false front without paint, sign blank) → done (paint pops on with a squash-and-stretch and a dust-cloud burst). Each stage is a tier builder; the transition is a height-clip reveal.
- **Ground**: a dusty finite slab with a crisp edge and a darker earth skirt (Idle Life 2), wheel ruts, scattered pebbles (instanced), dry grass tufts (instanced crossed quads).
- **Backdrop**: faceted mesas in 3 layers fading into fog; a few distant cacti and fence lines.

## 7. Characters and crowd

- **Re-use the instanced chibi crowd rig.** Add a **per-instance hat id** (an instanced attribute selecting one of ~8 hat meshes, drawn as a second instanced mesh that follows the head bone). Hats are therefore 1 extra draw per crowd.
- Hat library v1: ten-gallon, sombrero, stovepipe, bowler, boater, feathered, droopy, bonnet. Each hat is a `shape.loft` of a brim curve plus a crown curve (12–15 radial segments; the brim edge curls up 10–20°).
- Faces: dot eyes, thick expressive brows, and a **big nose blob** (the Codex lineup's caricature noses are the cheapest comedy). Moustache variants are 3 lofted shapes. No mouths at crowd scale; heroes and named characters get a mouth decal for scream/grin.
- Costume = vertex-colour regions (shirt, vest, trousers, boots, bandana) plus props (badge, apron, fan, bottle, guns on hips).
- Animation clips needed beyond Idle Life 2: `duel_stand`, `draw_fire`, `fall_dramatic` (overacted, then a hat drop), `thrown` (§2), `stagger_drunk`, `bar_brawl_punch`, `hammer`, `carry_plank`, `bonked` (stars orbit the head), `piano`, `tip_hat`.
- Townsfolk never share a hat and colour combination within the same 10 m.
- Named characters (sheriff, barkeep, madam, undertaker, drunk, snake-oil salesman) are **1.15× the crowd scale** so they read as stars.

## 8. VFX (all cheap, all geometry)

| Effect | Build | Budget |
|---|---|---|
| **Dust puff** (landings, footsteps, horse hooves, building pop) | 6–9 cream spheres (`#F3E2C4`) on an instanced pool, scale-up 0 → 1.1 then shrink while rising; slight squash | 1 draw for the pool of 64 |
| **Cartoon dust cloud / brawl ball** | Larger blob cluster that churns (spheres orbit a centre), with limbs and hats popping out | Shares the dust pool |
| **Gunsmoke** | 3–4 pale grey-violet spheres drifting from the muzzle, fading via vertex alpha | Shares the pool |
| **Muzzle flash** | 4-point star billboard, `g:2`, one frame on and 2 frames fading, plus a bloom kick | 1 draw |
| **Impact stars** | 5-point yellow star prisms orbiting the head, `g:1` | Pooled, 1 draw |
| **Coin pop** | Gold discs `#FFD27A` arc toward the HUD | Pooled |
| **Bullet hole / splinter** | Darker decal plus 3 wood-chip slabs | Rare |
| **Tumbleweed** | Rolling ribbon ball | 1 dynamic |
| **Night light pools** | Additive radial quads on the dirt under lanterns and windows | 1 instanced draw |
| **Heat shimmer at noon** | Skip on phones | — |

Post: bloom plus tilt-shift as in Idle Life 2 (hero only on phones). A static 10–15% vignette.

## 9. Avoid

- **Text and lettering anywhere** in the world (Flux and Codex love "SALOON" signs; we do not). Signs are blank boards or icons.
- An all-orange, all-brown frame: enforce the 3-paint-hues rule.
- Realistic proportions next to chibi ones. Heads stay ≥ 36% for everyone; the undertaker gets his height from the hat and longer legs, not from a smaller head.
- Photo textures, normal maps, real wood images. Grain = plank vertex colour plus a procedural roughness noise.
- Pitch-black or murky nights (luma < 0.28), and grey or black shadows (they must be violet).
- Gore and blood. Being shot means a dramatic overacted fall, a hat drop and stars; they get up later. The "risky M15+" tone lives in the jokes, the brothel's frilly pink lanterns and the drunks, not in viscera.
- Brothel imagery beyond PG-13: frilly curtains, a pink lantern, a can-can kick silhouette and winks are fine; nudity is not.
- Sharp unbevelled boxes, plumb walls, and same-height false fronts in a row.
- DOF and SSAO post; outlines.

## 10. Budget notes for the S22 Ultra

These are the same as Idle Life 2 (`../idle-life2/docs/RENDER.md`): per-view scheduling, warm-up, DPR caps, a hero pixel budget, and the shadow cache.

- Static plot geometry is merged per plot per tier (1 draw). Moving parts are ≤ 3 dynamic draws per plot (doors, windmill, piano lid).
- Crowd: 1 draw for bodies, 1 for hats, 1 for blob shadows.
- A hat is ~150–250 tris; a person ~400. Hats matter more than bodies: spend triangles on the brims.
- The FX pool is ≤ 3 draws in total (spheres, stars/flash, coins).
- The backdrop mesas are a single merged mesh, fogged.

## 11. How the stills were made (to regenerate or extend)

**Codex** (it won most shots): `codex exec --skip-git-repo-check -s workspace-write "Use your image generation tool to create one image (portrait 1024x1536 | landscape 1536x864): <scene>. <style>. Save it as NAME.png …" < /dev/null`. Run one at a time, ~1–2 min each. Without `< /dev/null` it hung for 25 min in a backgrounded shell. The prompts are kept in `docs/art/scratch/` (gitignored); the style suffix for Look A is:

> Chunky chibi caricature characters with big heads (about 38 percent of body height) and absurdly oversized hats. Soft matte clay-like materials, smooth rounded bevelled simple shapes, few large readable forms, no fine texture detail, tilt-shift miniature diorama, mobile game art, looks buildable from simple 3D primitives. No text, no lettering, no words on signs.

Scene prompts specify "elevated three-quarter camera about 35–40 degrees above, the main street running diagonally from bottom corner to top corner" for hero and night shots, and "golden hour, long soft violet shadows" for the light.

**Flux** (`:7867`, `flux2-klein-9b-mlx-4bit`, 4 steps, guidance 1.0; ~85 s per 1536×864 image). The B and C looks and the chibi lineup came from here. Its style suffixes:
- A clay: "Chunky stylized 3D cartoon render, soft matte clay-like materials, smooth rounded bevelled shapes, caricature characters with big heads and absurdly oversized giant cowboy hats, Rango and Looney Tunes comedy proportions, miniature tilt-shift diorama, warm golden hour desert light, long soft violet shadows, dusty terracotta, sand, cream and turquoise palette, toy-like Pixar quality, mobile game art, clean readable shapes, no text, no lettering"
- B facet: "Stylized low-poly 3D game render, gently faceted flat-shaded polygons, solid vertex colours, no textures, bold spaghetti-western palette of burnt orange, red rock, sun-bleached cream and teal sky, chunky simple geometry, caricature chibi characters with giant hats, high noon sunlight with crisp cool shadows, isometric three-quarter view from above, toy-like miniature diorama, Three.js render, clean, no text, no lettering"
- C peg: "Handmade painted wooden toy town, peg-doll characters with round wooden heads, simple painted faces and huge painted wooden hats, glossy enamel paint on chunky carved wooden blocks, simple lathe-turned shapes, rounded edges, miniature tabletop diorama, tilt-shift photo, warm late afternoon light, cream, tomato red, mustard yellow, mint and sky blue palette, charming and silly, no text, no lettering"

Rejected outputs and full-size PNGs stay in `docs/art/scratch/`. Round-1 Flux heroes were rejected for a street-level camera and missing gags. Codex refs are copied as ≤1280 px JPEGs at quality 85.

For new plots (bank, brothel, gunsmith, undertaker, mine, railway depot, …), reuse the Look A Codex suffix and the elevated card framing, so they stay in family with the approved set.

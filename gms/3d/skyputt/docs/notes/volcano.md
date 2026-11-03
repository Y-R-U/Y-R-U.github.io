# volcano agent: Volcano Forge theme

Status 2026-11-03: **Volcano Forge built** at `js/themes/volcano/`, registered in `THEME_LIST` (`js/app/menus.js`)
and with its own music track (`volcano` in `js/audio/music.js`). It implements THEME_CONTRACT and every engine
extension (`info.floor`, `info.voids`, `info.branches`, `info.viewDir`, the windmill blade layout, the loop's
eased x(θ), boost UVs, the `mover` skin). Structure follows Candy Land (same sweep, buckets, billboards).

## What is built
| file | contents |
|---|---|
| `index.js` | `createTheme(ctx)` → `{ id:'volcano', name:'Volcano Forge', materials, buildEnvironment, skins, dispose }` |
| `materials.js` | contract materials + internal ones, shared `uTime`, the island rock shader (molten cracks), the ember (flicker) shader, the amber glass |
| `textures.js` | canvas textures: scorched moss green, ash/cinder fringe (+ ember emissive), basalt column walls (+ molten seam emissive), forged-iron cap with brass edges/rivets, brass + molten trim (emissive flows along the wall), rock data map (column seams / grain / crack network), ash trap, obsidian, riveted iron deck, chevrons, molten lava (cellular crust), lava-fall streaks, loop band, tee pad (hammer-and-anvil sigil), forge banner, glow, spark, smoke atlas, fade |
| `sky.js` | smoky orange-red dome (charred zenith, hazy sun behind the player, noise smoke banks lit orange from below near the hot horizon), a **lava sea** far below (dark crust plates with glowing molten seams and pools), smoky fog, a warm hazy key (the one shadow caster), an orange lava up-light from below, hemi fill, PMREM env map |
| `island.js` | basalt slab under the course: scorched-moss top, a hot lip with a glowing seam, blocky columnar sides with occasional hot fissures and a molten vein band, a craggy base whose tip glows. Sweep frames, rounded caps, curvature limit, `voids`, one slab per solid run of `floor` (as candy). Lava falls (unlit, UV-scrolled, faded). Instanced basalt column clusters, obsidian crystals and charred dead trees on the crust |
| `props.js` | braziers (coals + flame tongues), brass lantern posts, anvils, crystal clusters, basalt columns, ember vents, giant hammers, brass gears, ingot stacks, chimneys |
| `backdrop.js` | **erupting volcano** (lathe-like cone with gullies, hot crater rim, molten streams down the flanks, lava crater disc) and the **dwarven forge** (stone hall with buttresses, iron gable roof, glowing arched furnace mouth under a brass gear, two smoking chimneys, a lean-to smithy, giant anvil + hammer statues, ingots, braziers, a molten channel pouring off its island); small basalt isles: `crystals`, `columns`, `braziers`, `anvil`, `vent`, `trees` |
| `embers.js` | ambient: rising flickering embers (additive) and drifting ash flakes (alpha), each one draw call in a box wrapping the camera, faded near the camera / box edge / fog |
| `env.js` | assembles everything (below) |
| `skins.js` | all contract skins + `mover` |
| `billboards.js`, `util.js` | copies of candy's; billboards gained a `smoke` mode (rises, grows, fades) |

Contract materials: `grass` scorched moss (olive, mid-bright, 2 m tile, mowing stripes, ash specks), `fringe`
ash and cinders with glowing ember specks, `wall` basalt columns with a few molten seams (also `under`),
`wallTop` forged iron with brass edging and rivets, `trim` brass bands with a molten channel that flows along
the walls and pulses, `tee` dark iron, `cupRim` brass with an orange glow, `flag` forge-red with a gold
hammer-and-anvil, `sand` pale volcanic ash with cinders (`sticky` too), `water` molten lava (unlit; unused by
the engine so far), `ice` obsidian glass, `boost` dark iron with glowing orange chevrons (tip at u = 0, scrolls
+v), `bridge` riveted iron deck plates, `rock` basalt.

`env.js` order: course island + spikes → sky/lights/fog → up to two lava falls on the sides the camera sees →
along the course (alternating, clear of voids/branches/gaps) braziers, basalt columns, lantern posts,
crystals/anvils → tee: braziers either side, ingots and crystals behind, a lantern post → a giant anvil and
hammer ~55 % along → scattered columns, crystals, ember vents (with smoke) and small lava pools →
instanced columns/crystals/dead trees → volcano (along `viewDir`, right of centre, rising from the lava sea;
peak ~5° above the horizon from the tee camera) with crater glow, eruption plume and thrown sparks → forge
island (along `viewDir`, left) → small isles → all rock in one mesh, all far lava in one mesh → glows, sparks,
smoke (plume/chimneys/vents) and smoke banks below/around → embers + ash → orange cup beacon.

**Heat shimmer:** not done (would need a post pass or a refraction copy of the frame; not cheap on mobile).

### Skins (tris / meshes, high, `--skins`)
- **windmill** (2.3k / 6): a basalt forge-furnace drum with iron hoops and brass rivets, glowing vents on the
  sides, an iron dome with a smoking chimney (ember mouth), brass-framed tunnel arch with a molten keystone.
  Rotor: brass hub with a glowing core, iron spars, riveted iron sail plates with molten seams in brass frames,
  an ember gem on each tip. Sail spans exactly x ∈ [0.018, 0.018 + bladeWidth], r 0.06 → bladeLength, ±0.022 Z.
- **loop** (3.0k / 3): dark riveted iron band with a molten seam (emissive scrolls), brass rails on the engine's
  eased x(u), brass edge piping, iron/copper studs, an anvil on top (horn along the shift) with a glowing gem.
- **tube** (≈3.1k for a 4 m tube / 2): smoked-amber glass (fresnel, normalize guarded), brass and copper rings,
  iron collars with brass lips.
- **flag** (0.2k): iron pole with brass bands, ember-gem finial, forge-red banner (heavier flutter).
- **pickup** (0.1k): spinning, bobbing ember gem in a brass ring with an orange glow sprite (`raycast = () => {}`,
  `noOcclude`, as the other themes).
- **bumper** (0.5k): octagonal basalt post (flat faces on the collider radius), brass bands, copper rivets,
  iron cap with a molten top and a glowing foot ring.
- **teePad** (1.0k): forged iron disc, brass ring and rivets, glowing hammer-and-anvil sigil and rune ring
  (hammer head faces back toward the tee), pulsing orange ring.
- **mover** (0.2k): an iron anvil filling w×h×d (base, waist, face, horn inside the box), brass/copper edge,
  a glowing heat strip on top.

## How to test
```
~/.claude/bin/cdp start --port 9600
node tools/volcano_shots.mjs --holes=1-18 --sizes=p,l,lp          # tee shots + draw calls/tris (exit 1 on console errors)
node tools/volcano_shots.mjs --holes=1-18 --sizes=p --q=low
node tools/volcano_shots.mjs --course=festival --holes=1-9 --sizes=p   # also woods, sugar
node tools/volcano_shots.mjs --skins                              # triangles / meshes per skin
node tools/volcano_shots.mjs --preview='view=row&hud=0&t=2' --sizes=l
node tools/volcano_shots.mjs --swap                               # title-screen theme swaps (dispose check)
```
`tools/volcano_shots.mjs` = candy_shots plus `--course=` (port 9600, output `docs/notes/volcano_shots/`).
Phone: http://192.168.0.236:8888/gms/3d/skyputt/?theme=volcano&hole=3&noflyover

## Results (all runs: no console errors)
Tested in the real game (fly-over skipped): sky 1–18 at 412x915, 844x390 and 1440x900 (9–11), sky 1–18 `q=low`,
`?course=festival` 1–9, `woods` 1–9, `sugar` 1–9 (portrait), the preview page, and title swaps
sky → spooky → frost → candy → volcano (geometry/texture counts settle; no errors).

## Performance (renderer.info, headless SwiftShader, tee view, shadow pass not counted)
| | draw calls | triangles |
|---|---|---|
| high, sky 1–18 portrait / 844x390 | 48–76 | 28.8k–41.2k (hole 18 heaviest) |
| high, festival / woods / sugar 1–9 | 43–78 | 28.4k–51.0k (sugar 9 heaviest) |
| low, sky 1–18 portrait | 44–75 | 17.1k–27.4k |

Per hole (high portrait, sky): 1 54/28.8k · 2 61/32.1k · 3 57/34.5k · 4 58/29.6k · 5 56/34.9k · 6 55/29.3k ·
7 48/30.9k · 8 58/29.1k · 9 63/37.0k · 10 58/30.2k · 11 64/38.6k · 12 62/41.0k · 13 53/30.3k · 14 54/31.5k ·
15 52/29.9k · 16 73/32.1k · 17 66/34.6k · 18 76/41.2k. Lighter than Candy (67–84k) and Frost (50–60k); draw
calls in the same range. Low halves textures, 1024 shadow map, coarser sweeps/volcano, fewer props/isles/
particles (60 embers + 50 ash vs 150 + 130), one course lava fall. Real-phone fps not measured; biggest fill
costs are the dome (smoke noise: 2 texture fetches), the lava sea (3 fetches) and the smoke billboards.

Shots (`docs/notes/volcano_shots/`, gitignored): `v3-p-hole*.png` (high), `v4-lp-hole*.png`, `v4-p-hole*-low.png`,
`v5-{festival,woods,sugar}-p-hole*.png`, `v5-l-hole9..11.png`, `v5-title-swap.png`, `v2-preview-l.png`;
`wav/music_volcano.wav` (12 s render).

## Known issues
- In portrait the volcano reaches the top edge on most holes and its plume is off-screen (it shows in landscape).
  It sits in the same view-relative spot every hole, like the other themes' hero pieces.
- The obsidian `ice` patch reads quite purple; distinct and readable, but could be darker if Aaron prefers.
- The loop band is opaque (as in every theme), so the ball hides in it from the side.
- `water` (lava) is supplied but the engine draws no water patches yet.
- Heat shimmer not implemented (cost). Music not auditioned by ear (levels: 90 s render peak 0.244, RMS
  -27.3 dB, in line with the other themes).

## Music: "Forge of the Deep" (`js/audio/music.js`, `VOLCANO`)
- 4/4 at 64 bpm, D minor with a Phrygian bII; key excursions to C minor and F minor. Chords i, bVI, bVII, iv, v,
  bII, 2–4 bars each.
- Low brass drones: new pad type `brass` (detuned saws, narrower detune) under a dark 720 Hz lowpass, sine root.
- Groove (`forge` option, new `forgeStep`): a taiko-style drum on beat 1 (sine pitch drop + short low noise
  thump), a lighter push on the "and" of 3 and sometimes on 4; anvil clangs (inharmonic FM, fast-falling
  index, an upper partial) on 2 and 4, sometimes a smith's double tap.
- Lead: a low dulcimer (KS pluck an octave down) on the beat, an inharmonic forge bell for sparkle.
- Extras: a swelling low brass horn (root + fifth, opening lowpass, far), bellows breaths (band-passed
  noise), a distant volcanic rumble (low-passed noise).
- CPU: one sine + one short noise burst per drum, three oscillators per anvil hit; extras are rare.
- `tools/sound_preview_cdp.mjs` now switches to volcano live and writes `music_volcano.wav` with `--wav`.
- **Not auditioned by ear** — Aaron should listen on the preview page (drum level, anvil brightness).

## Changes outside `js/themes/volcano/`
- `js/app/menus.js`: one `THEME_LIST` line.
- `js/audio/music.js`: `VOLCANO` theme + `forgeStep`, `drum`, `anvil`, `horn`, `bellows`, `rumble`; pad type `brass`.
- `js/events/calendar.js`: **weekend theme rotation fix.** The formula `themes[(ord + round) % n]` was tuned for
  4 themes × 4 kinds; with 5 themes it never picks the 5th, failing `events_test` ("weekend themes rotate
  through every theme"). Now the per-round offset is only added when the theme count shares a factor with the
  kind count (gcd > 1); with 5 themes plain rotation meets every kind/theme pair. Weekend themes from now on
  shift (as they did when candy was added).
- `tools/sound_preview_cdp.mjs`: volcano in the live switch and wav list. `tools/volcano_shots.mjs`: new.

## Mobile GPU rule
Sky directions use `safeDir` / length-guarded `hotSide`; the smoke ceiling divides by `max(h + 0.32, 0.08)`;
glass fresnel divides only when `length > 1e-4`; every `pow()` base is clamped; smoothstep edges are always
ascending (the rock heat uses `smoothstep(0.04, 0.16, r - g)`).

# Lane R, wave 4: themes, weather, zones, mid-match recolour, standing weaknesses

Every number below was measured in headless Chrome on Metal (`cdp start -- --use-angle=metal`, M5 Air) or in the iOS 26.5
Simulator (Safari engine). Shots are in `docs/notes/shots/r4_*` (quantised PNGs, about 13 MB).

Checks:
- `node tools/render_map_test.mjs 300`: ALL PASS. Min spawn gap is 44.3 m, min street 16.0 m and max obstacles 21, all unchanged.
  `map.js` only gained `export` on its `FACADES`/`ROOFS` palettes, and the rnd draw order is untouched.
- `node tools/sim_test.mjs`: PASS (247.9 s; run after lane G4 landed).
- Every capture listed here had 0 console errors and 0 page errors. That covers the real game in every theme, layout,
  weather and mode, the menu, every harness scene, and the Simulator runs.

Files touched:
- `js/render/`: `renderer.js` (rewritten around a rebuildable "world"), `city.js`, `ground.js`, `fx.js`, `crowd.js`,
  `people.js`, `cosmetics.js`, `camera.js`, `shared.js`, `geo.js` (one line), and the new `themes.js`.
- `js/world/map.js`: palette exports only.
- `tools/render_harness.html`: new params `zones=`, `zt=`, `recolor=`, `probe=plaza|road`, `horde=`, `boost=`. `theme=` and
  `weather=` work on any page through the renderer itself.
- `docs/CONTRACT.md`: renderer section only.
- `docs/notes/R_requests.md`: asks 20–29.

## 1. New renderer API (as built)

The full text is in CONTRACT.md → "Themes, weather, zones, mid-match recolour (R4)". Lane G's wave-4 `main.js` already
calls all of it, and every call I traced matches.

```js
r.setTheme(id) → id            // 'evening' | 'night-neon' | 'snow' | 'sunny-day' | 'festival'   (rebuild, ~0.2 s on M5)
r.setWeather(id) → id          // 'clear' | 'rain' | 'fog' | 'wind' | 'snow'; null = the theme's default (free)
r.setZones([{ id?, x, z, r, color?, style, progress? }])
                               // style: 'crown' | 'safe' | 'danger' | 'capture' | 'next' | 'safe-next';  [] clears
r.updateCrowdMeta(index, meta, { from: { x, z } }?) → bool
r.setCameraMode('showcase' | 'follow', { theme?, cycle? })
r.themes(), r.weathers()       // id lists;  stats() adds theme, weather, zones
```

- **URL test override:** `?theme=` and `?weather=` win over all calls, and a forced theme keeps its own default weather.
  This lets the real game be shot in any look (`index.html?auto=1&seed=7&t=75&theme=snow`).
- **setZones:** zones are matched by `id`, so position, radius, colour and progress glide between calls. New zones fade
  in and missing ones fade out.
  - Floors ride in the existing ring draw. Pickup pads moved into that draw too, which frees a draw call.
  - Walls and columns are one instanced draw for all zones (medium/high only).
  - The first `safe` zone drives a `uSafe` uniform. Outside it, ground and city fragments are desaturated, darkened and
    red-tinted, with hazard stripes sweeping inward at the wall. Figures get only 18 % of the tint: at 50 % (my first
    try) a red crowd outside the circle turned near-black in Safari.
- **updateCrowdMeta:** merges into that crowd's meta only. A colour change sends a wave through the figures from `from`
  (default: the leader). Each figure's delay is its distance over about the disc radius, up to about 1.2 s. As it flips,
  each figure flashes and hops, and the ring colour blends. Emblems are refreshed. Shot: `r4_recolor_wave.png` (six frames
  260 ms apart: the white front visibly crosses the crowd).

## 2. Themes

The map layout is identical in every theme (the same `generateMap` output). Only dressing changes, and the stalls are
renderer-only props that followers step around. Colours and lighting live in `themes.js`. Each theme rebuilds the city
and ground: facade and roof palettes are remapped by index, lit-window share, lamp state, ground paint, a coloured
light-spill texture, decor and neutral clothing all change.

| id | mood | what is in it |
|---|---|---|
| `evening` | the R3 look | unchanged apart from the shared fixes below |
| `night-neon` | deep blue night | moonlight from above, cool rim on figures, near-black navy streets, very wet (more and wider puddles, stronger reflection); every shopfront fascia is a magenta/cyan/violet/green/orange neon bar with a strip light under the cornice; blade signs on about half the street faces; lit billboards on flat roofs; more lit windows with some cool ones; neon-coloured light pools spilling onto the street (new `uSpill` texture) |
| `snow` | winter dusk | low pink-gold sun; snow on every up-facing city surface (roofs, ledges, tree tops, kerbs) in the city shader; snowy plazas and pavements with even grey slush on roads; **trodden paths**: crowds stamp a 256² mask, so their paths turn to slush (CPU stamp every 0.12 s); strings of warm bulbs across every street; dark winter-coat pedestrians (white neutrals vanished on snow); falling snow by default |
| `sunny-day` | Mediterranean midday | strong warm sun with visible cast shadows, blue ambient, light haze; lamps and windows off; Mediterranean facades and terracotta roofs; awnings on every shop; flower boxes under about half the windows; striped market stalls round the central plaza and parasol café tables on the side plazas; no reflection pass (dry), so medium drops to 14 draws; dark figure rims for silhouettes on bright paving; bloom threshold raised so high quality does not haze |
| `festival` | event night | warmer, pinker evening; colourful facades and roofs; bunting, bulbs and paper lanterns over every street; a festoon canopy from a mast over the grand fountain; confetti in the air; fireworks over the camera's view for 9 s after `phase: 'over'` |

Lane G's events map onto these: Double Crowd → festival, Night Market → night-neon, Rush Hour → sunny-day, Giant
Slayer → evening + rain. Snow is unused so far.

Shots:
- `r4_game75_{evening,snow,sunny-day}_{p,l,d}.png`
- `r4_game75_{night-neon,festival}_d.png`
- `r4_late_<theme>_p.png` (harness late scene, medium)

## 3. Weather

Weather is independent of theme and never triggers a rebuild.

- **On medium/high:** one shader-driven instanced draw. Every position is computed in the vertex shader and wraps around
  the camera in world space, so there is no CPU cost. Rain streaks fade out near the camera.
- **On lite:** weather uses the shared particle pool (a new streak sprite in the atlas), so there is no extra draw.

| id | effect |
|---|---|
| `rain` | streaks oriented along the wind-blown fall; much wetter ground (`uWet`), with more puddles and stronger reflection, so the city reflection is switched on even in sunny; animated ripple rings in puddles and on wet road; 14 % darker exposure and dimmer sun; blue-grey fog; splashes under running crowds |
| `fog` | fog starts just past the player's crowd and closes in fast beyond it, so your own crowd stays crisp; fog colour lightened; lamp halos 1.9× |
| `wind` | 260 tumbling leaves and paper scraps; hero flags wave faster and wider; lamp banners and bunting flutter; tree crowns sway (city vertex shader) |
| `snow` | soft falling flakes (the snow theme's default) |

Shots: `r4_weather_rain_fog_rainneon.png`, `r4_weather_fog_snowfog.png`, `r4_weather_wind_p.png`.

## 4. Zones and modes in the real game

`?mode=koth|lcs|infection|teams&auto=1&seed=7&t=N`; the shots point a fixed camera at the zone via `window.__game.state`.

- **King of the Plaza:** a gold rim, slow rotating rays, rings and a soft light column, with the holder's crowd inside
  (`r4_modes_koth_lcs.png`). The `next` preview is a dashed gold ring.
- **Last Crowd Standing:** a wall of light at the circle edge. Ground and buildings outside are desaturated red, and
  hazard stripes run just outside the wall (`r4_modes_koth_lcs.png`, `r4_zones_demo_med_lite_high.png`). `safe-next` is a
  dashed white ring. On lite the wall is skipped, but the floor band and the outside tint remain.
- **Infection:** the recolour wave on infection. Horde followers (`crowd.horde`) walk hunched with arms reaching forward
  and a lurching sway (encoded as gait + 2, so it costs no new instance data), and lime spores drift up
  (`r4_horde_close.png`).
- **Teams:** `boost > 0` crowds get a pulsing, brighter ring and sparks along the teammates' contact line.
- **Harness demo:** `zones=all` shows crown, capture (animated progress), danger and a shrinking safe circle
  (`r4_zones_crown_capture_danger.png`). The wall fades at grazing angles, because seen edge-on it stacked into a white
  bloom streak on high.

## 5. Standing weaknesses (from R3)

- **Sunk buildings are now a deliberate cutaway.** The ground floor is kept intact: shopfronts, awnings, colonnades and
  the cornice. Everything above collapses fully to 4.45 m under a flat lid at 4.5 m. The lid has a light 0.5 m outline of
  the footprint and a darker hatched "section" fill (a fragment-shader hatch that fades at distance).
  - The lid is hidden (collapsed to a degenerate point) until the building sinks, so it costs nothing at rest.
  - Shot: `r4_cutaway_lids.png`.
- **Hidden rivals show through.** A ghost pass of the ring draw shows a crowd's ring line and a hatched area through any
  building in front of it.
  - It runs only where the depth test is GREATER, in the opaque pass after the city and before the people, so figures
    never trigger it.
  - It is gated per crowd by the cutaway's CPU ray test, every 4th frame, so trees do not tint.
  - Medium/high only; one draw.
  - Shot: `r4_ghost_shot80_r3_vs_r4.png`: the cyan rival behind the dome block is visible now.
- **Plain mansard roofs:** big mansard caps (≥ 8 × 7.5 m) now have a **courtyard light well**: four slopes up to a ridge
  ring, then inner walls with lit windows down to a paved court with a small tree. The perimeter and corner roofs that
  were flat grey planes now read as real Paris blocks (`r4_before_after_game75_evening_p.png`, bottom building). The
  first version had a black floor and read as holes, so the floor is now paving and the opening narrower.
- **Hats and trails at gameplay zoom:**
  - Hats scale up to 1.55× with camera distance (on top of the figure scale), about the head, so cowboy and top hats read
    mid-game (`r4_ghost_shot80_r3_vs_r4.png`, cyan crowd).
  - Trail emission is now about (8 + 3.2R)/s and grows with speed. Particle size grows with zoom (up to 2.6×), and
    emission covers the whole trailing edge.
- **King's crown:** when the rank-1 crowd has a leader variant (2× tall), the rank-1 crown now floats clear of the
  leader's head instead of swallowing the king's own crown (`r4_king_crown_close.png`). `crownTop()` follows it.
- **Pigeons on lite:** back (7 per plaza). The draw was paid for by merging pickup pads into the decal draw.
- **Outer fogged ring:** not reworked. Per theme it now takes the theme's fog and outer-ground colours (night-neon's
  outer ring is a lit skyline).

## 6. Menu showcase

`setCameraMode('showcase')` now does three things:
- a slow continuous orbit (about 0.055 rad/s);
- a lower 40° pitch, for depth with the skyline at the top;
- a frame on the central plaza, pulled toward the count-weighted centre of the three biggest crowds.

`{ cycle: true }` cycles all themes every 14 s, fading through dark to hide the rebuild.

The attract match is only 18 s in, so the crowds are still small. I asked lane G (R ask 24) to fast-forward further and
steer bots to the plaza. Shot: `r4_before_after_menu.png`.

## 7. Contrast: team colours and neutrals vs the ground, per theme

**Method.**
- Harness `probe=plaza|road` puts all 8 team crowds (120 each) in a row on the central plaza or along a street, with
  pedestrians around. The sim is paused and the camera fixed, at medium quality.
- Each layout is rendered twice from the same frame: figures shown and figures hidden. Rings, blob shadows and particles
  are hidden in both, so the reference is the bare ground.
- Figure pixels are where the two differ. Each figure pixel is converted to CIELAB together with the ground pixel behind
  it.
- The score is the median per-pixel ΔE76; p75, which is mostly shirt pixels, is reported as well. **Pass = median ≥ 20.**

**Falsification.** The first version used ground *with rings* as the reference. A crowd dressed in ground-coloured
shirts then scored 51, because it was being measured against its own ring glow, so that instrument was rejected.
- With the bare-ground reference, the same camouflaged crowd (`palette=7d7266` on the evening plaza) scores **15.8**:
  FAIL, as it should (16.9 in the final run below).
- The real blue crowd at the same spot scores 60.1.
- The floor of about 16 comes from heads, skin and trousers, which always differ from the ground.

Median ΔE76 (p75 in brackets), medium quality, the theme's default weather off:

| theme | ground | blue | red | gold | purple | green | orange | pink | cyan | neutrals |
|---|---|---|---|---|---|---|---|---|---|---|
| evening plaza | L*a*b* [54.3, 8.7, 12.6] | 61.5 (67.3) | 66.9 (73.9) | 47.7 (52.5) | 100.1 (109.3) | 54.1 (62.5) | 50 (56) | 67 (79.9) | 46.2 (49.3) | 24.8 (35.2) |
| evening road | L*a*b* [53.1, 8.8, 12.6] | 60.1 (64.7) | 71.8 (79.7) | 71.2 (78.3) | 92.2 (104.4) | 87 (93.3) | 63.1 (71) | 67.9 (79) | 46.1 (59.2) | 25.4 (34.9) |
| night-neon plaza | L*a*b* [7.7, 6.6, -19.4] | 54.2 (60.8) | 81 (99.6) | 92.5 (106.3) | 73.2 (91.7) | 93.1 (104.3) | 81 (101.1) | 71.8 (85.6) | 75.6 (78.6) | 28.7 (45.4) |
| night-neon road | L*a*b* [7.8, 6.4, -19.1] | 54.6 (65.8) | 82.3 (97.6) | 85.1 (99) | 79.2 (98.4) | 92.7 (109.1) | 75.6 (95.2) | 75.3 (89.6) | 70.6 (75) | 32.5 (50.3) |
| snow plaza | L*a*b* [82.4, 2.4, -5.3] | 56.4 (61.1) | 88.4 (94.8) | 62 (66.2) | 102.3 (109) | 62.5 (68.2) | 66.6 (73.7) | 76 (83.7) | 28.9 (31.3) | 47.5 (56.8) |
| snow road | L*a*b* [82.4, 2.4, -5.3] | 48.6 (53.3) | 75.9 (89.6) | 72.8 (80.3) | 89.4 (99.5) | 77.8 (85.4) | 66.1 (74.9) | 69 (78.2) | 41.4 (44.1) | 53.7 (63.9) |
| sunny-day plaza | L*a*b* [83.6, 0.5, 11.1] | 64.5 (73.2) | 74.8 (81.4) | 47.1 (53.8) | 117.4 (120.7) | 52.2 (65.8) | 51.9 (56.6) | 82.3 (87.2) | 33.7 (45.4) | 30.7 (52.1) |
| sunny-day road | L*a*b* [82.1, 0.6, 11.1] | 55.2 (66.5) | 59.8 (76) | 55.4 (58.1) | 108.8 (112.2) | 57.6 (69.8) | 64 (71.2) | 75.7 (82) | 40 (40.7) | 30.5 (53) |
| festival plaza | L*a*b* [50, 18, 7] | 57 (63.9) | 59.7 (68.4) | 50.9 (59) | 85.9 (97.3) | 63.7 (74.3) | 50.4 (60.5) | 54.7 (67.5) | 53.1 (58.9) | 26.3 (36) |
| festival road | L*a*b* [48.8, 18.5, 7] | 58.4 (62.9) | 71 (81.9) | 76.8 (84.7) | 86.6 (98.6) | 97 (102.2) | 66.8 (76.1) | 63.2 (73.1) | 54 (66.8) | 26.8 (36.7) |
| CAMO test: blue crowd in ground-coloured shirts, evening plaza | L*a*b* [54.3, 8.7, 12.6] | 16.9 (27.8) | 67.3 (74) | 47.9 (52.6) | 100.1 (109.4) | 54.7 (63.1) | 50 (56) | 66.9 (80.1) | 46.3 (49.2) | 24.6 (35.2) |

Every team colour and the neutrals pass in every theme, on both plaza and street.
- **Weakest:** white/grey neutrals on the evening and festival plazas (24.8–26.8), and cyan on the snow plaza (28.9).
  The camouflage control scores 16.9.
- **What changed to get here:**
  - snow neutrals wear dark winter coats (white neutrals on snow were the obvious failure);
  - figures have a dark rim on bright themes;
  - the interior ring fill and glow under a crowd are lower: cyan on the evening plaza measured 15.4 against the
    ring-tinted ground before.

## 8. Performance

Late scene (player 1,200 + rivals 1,100/900/780/640 + 3 small crowds + 600 pedestrians), 390×844 at DSF 2, adaptive off.
"plain" = no cosmetics, no zones. "all on" = `cos=all` (every crowd has a hat, leader, flag, trail and ring style) + `zones=all` (crown, capture, danger and a safe circle). Baselines are this wave's first measurements of the R3 build, same URLs.

| tier | set | baseline draws / tris | worst draws (theme, weather) | worst tris (theme, weather) | range draws | range tris | budget |
|---|---|---|---|---|---|---|---|
| medium | plain | 17 / 0.935 M | 18 (evening, rain) | 0.949 M (sunny-day, rain) | 14–18 | 0.904–0.949 M | ≤ 20 draws, ≤ 1.076 M PASS |
| medium | all on | 19 / 1.204 M | 21 (evening, rain) | 1.203 M (sunny-day, rain) | 17–21 | 1.163–1.203 M | ≤ 22 draws, ≤ 1.385 M PASS |
| lite | plain | 10 / 0.346 M | 10 (evening, clear) | 0.341 M (festival, clear) | 10–10 | 0.333–0.341 M | ≤ 13 draws, ≤ 400 k PASS |
| lite | all on | 12 / 0.392 M | 12 (evening, clear) | 0.385 M (festival, rain) | 12–12 | 0.374–0.385 M | ≤ 13 draws, ≤ 400 k PASS |
| high | plain | 32 / 1.866 M | 33 (evening, rain) | 1.863 M (sunny-day, rain) | 28–33 | 0.984–1.863 M | (no budget set) PASS |
| high | all on | not measured | 36 (evening, rain) | 2.158 M (sunny-day, rain) | 31–36 | 1.283–2.158 M | (no budget set) PASS |

Runs: 120; runs with a console/page error or a failed capture: 0

Per theme × weather at medium, draws plain / all-on (triangles plain / all-on):

| theme | clear | rain | fog | wind | snow |
|---|---|---|---|---|---|
| evening | 17 / 20 (0.93 / 1.19 M) | 18 / 21 (0.93 / 1.19 M) | 17 / 20 (0.93 / 1.19 M) | 18 / 21 (0.93 / 1.20 M) | 18 / 21 (0.93 / 1.19 M) |
| night-neon | 17 / 20 (0.93 / 1.20 M) | 18 / 21 (0.94 / 1.20 M) | 17 / 20 (0.93 / 1.20 M) | 18 / 21 (0.93 / 1.20 M) | 18 / 21 (0.94 / 1.20 M) |
| snow | 17 / 20 (0.93 / 1.19 M) | 18 / 21 (0.93 / 1.20 M) | 17 / 20 (0.93 / 1.19 M) | 18 / 21 (0.93 / 1.18 M) | 18 / 21 (0.93 / 1.20 M) |
| sunny-day | 14 / 17 (0.90 / 1.16 M) | 16 / 19 (0.95 / 1.20 M) | 14 / 17 (0.90 / 1.17 M) | 15 / 18 (0.90 / 1.16 M) | 15 / 18 (0.91 / 1.17 M) |
| festival | 18 / 21 (0.94 / 1.20 M) | 18 / 21 (0.94 / 1.20 M) | 18 / 21 (0.94 / 1.20 M) | 18 / 21 (0.94 / 1.20 M) | 18 / 21 (0.94 / 1.20 M) |

- **Medium** stays at its R3 draw count with nothing on (17), and goes up to 21 with every cosmetic, every zone and
  weather on. The budget is +3 on 19 = 22. Triangles never go above the R3 baselines by more than 1.5 %.
- **Lite** never exceeds 12 draws or 385 k triangles, with every cosmetic, zones and weather. That is with pigeons back
  on lite, because the pickup pads were merged into the decal draw. Lite weather uses the particle pool; zone walls and
  the ghost pass are off on lite.
- **Sunny-day** is the cheapest theme: it has no reflection pass (14 draws on medium plain) until it rains.
- **Where the draws went:**
  - +1 ghost rings (medium/high);
  - +1 weather (medium/high, only when there is weather or confetti);
  - +1 zone walls (only while zones exist);
  - −1 pickup pads (merged into the ring draw);
  - +1 pigeons on lite.
- **Renderer JS**, median EMA ms over the plain runs (update / write / other / submit):

  | tier | update | write | other | submit |
  |---|---|---|---|---|
  | high | 1.17 | 0.49 | 0.21 | 0.48 |
  | medium | 1.10 | 0.41 | 0.22 | 0.30 |
  | lite | 0.40 | 0.16 | 0.18 | 0.32 |

  "other" (zones, decals, weather, cosmetics, the ghost occlusion test) never exceeded 0.30 ms.
- **Theme rebuild:** `buildCity` takes 167 ms and `buildGround` 38 ms on the M5, measured before the decor was added;
  the decor adds little geometry.
  the decor adds little geometry.

## 9. NaN check

Half-float scene readback, 3 frames each, with `cos=all`, `zones=all` and every theme at high, medium and lite, under rain:
**0 NaN, 0 Inf** in all 15 combinations. Festival under snow, wind, fog and clear at high and lite: also 0 / 0.

Falsified: adding a `sqrt(-1)` plane gives **54,507 NaN pixels**.

Every new `pow()` has a `max(…, 0)` base: the zone walls and the decal sprays. The precipitation shader has no `pow`.

## 10. iOS Simulator (Safari engine, iPhone 16 `clued-test`, iOS 26.5)

`tools/render_ios.html` POSTs the game's own error list, WebGL program diagnostics and renderer stats to a localhost log
server (scratchpad `logserve.py`).

| Page | Booted | Errors | Programs (failed) | GL | Quality / draws / tris |
|---|---|---|---|---|---|
| game `t=75&theme=evening` | yes | 0 | 18 (0) | no error, WebGL 2, not lost | lite (adaptive stepped down) / 11 / 253 k |
| game `theme=night-neon` | yes | 0 | 18 (0) | same | lite / 9 / 176 k |
| game `theme=snow` (snow falling) | yes | 0 | 19 (0) | same | lite / 9 / 154 k |
| game `theme=sunny-day` | yes | 0 | 15 (0) | same | lite / 9 / 181 k |
| game `theme=festival` | yes | 0 | 19 (0) | same | lite / 9 / 183 k |
| harness medium, night-neon, rain, all cosmetics, all zones | yes | 0 | 20 (0) | same | medium / 21 / 1.14 M |
| harness high, festival, snow, all cosmetics, all zones | yes | 0 | 30 (0) | same | high / 36 / 1.87 M |
| harness medium, sunny-day, wind, all cosmetics, all zones | yes | 0 | 18 (0) | same | medium / 18 / 1.16 M |

So every new shader compiles and runs in Safari's engine: decals with zone styles, the ghost pass (GREATER depth),
zone walls, precipitation, the city lid/sway/snow, ground spill, ripple and trodden snow, and the horde gait.

The Simulator screenshots (`r4_ios_sheet.png`) are what showed the near-black red crowd outside the safe circle, fixed
above. Simulator fps is the Mac GPU, not a phone.

## 11. Online "0 hats on a 4-person crowd" (G4 observation)

This is not a bug.
- **The path is intact.** Cosmetics reach guests: the server's `cleanCos` keeps `hat`/`hatShare`, and `buildMeta` copies
  each member's `cos`.
- **The leader always wears the crowd's hat** unless the crowd also has a leader variant, which replaces the hat.
- **Measured:** 24 seeded 4-person crowds in the harness (cowboy, cap, tophat with king, party with robot) showed 1–4
  hats every time.
- **So zero hats needs both of these:**
  - a leader variant on that crowd, plus all three followers missing at 40 % each, which is about 6 %;
  - or a team-coloured hat (cap, beanie, headband) that is simply invisible on four figures.

## 12. Still weakest (harsh)

1. **No real-phone numbers.** It is all Mac Metal plus the Simulator. Theme rebuild time on a phone is a guess
   (0.5–1 s). The snow trodden-mask upload (64 KB every 0.12 s while crowds move) and the extra full-screen ground work
   (spill texture, rain ripples) are unmeasured on mid-range Android.
2. **Sunny-day roads** are still a large flat warm grey. The shadows, stalls and flower boxes read close up, but from
   the mid-game camera the streets dominate. Festival's canopy over the central plaza is busy over the crowds there.
3. **Night-neon's lit paving** still shows faint tile blockiness under the cyan lamp pools, and neon detail (blade signs,
   billboards) is small at gameplay zoom. The mood carries the theme, not the signs.
4. **Snow** at very high zoom-out: falling flakes become sparse blobs. Roads are an even slush with no tyre tracks.
5. **The outer ring** was not reworked this wave. The 3D emote bubble (G2 ask) is still not done.
6. **White neutrals on mid-tone evening paving** are the lowest-contrast thing in the game (ΔE ≈ 25). They pass, but
   they are the first thing to go in fog or rain at a distance.
7. **Not seen in motion by a person:** the recolour wave, the zone glides, the theme cycle fade, fireworks, the trodden
   paths filling in, and leaves blowing. All were checked in stills and bursts only.

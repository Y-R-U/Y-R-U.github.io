# star agent: Star Station (theme + music + 9-hole course)

Status 2026-11-09: **built, nothing committed** (manager commits). Theme `js/themes/star/`, music track `star` in
`js/audio/music.js`, course `COURSES.star` (`star1..star9`, theme `star`, locked behind Sunken Reef hole 9,
`dailyFrom: '2026-11-23'`).

## Theme `js/themes/star/`
Implements THEME_CONTRACT and every engine extension (`info.floor`, `info.voids`, `info.branches`, `info.viewDir`,
windmill blade layout, the loop's eased x(θ), boost UVs, the `mover` skin, `sticky` material). Structure follows
Sunken Reef (same sweep, buckets with aliases, billboards, courseFrame). Built to a budget from the start.

| file | contents |
|---|---|
| `index.js` | `createTheme(ctx)` → `{ id:'star', name:'Star Station', materials, buildEnvironment, skins, dispose }` |
| `materials.js` | contract materials + internal ones, shared `uTime`; island shader (hull vs asteroid by vertex colour, deck plates on up-facing faces, teal glow strips emissive), polished-glass deck (fresnel sheen), airlock glass, instanced drifting-asteroid shader (tumble + drift in the vertex shader) |
| `textures.js` | canvas textures: teal-green deck turf (2 m tile, mowing stripes, faint triangle weave), anti-slip fringe plate, white hull wall panels (+ indicator-light emissive), brushed cap, trim (teal edge strip, dashes scroll), island data map (hull panels / deck plates / rock grain), regolith dust, magnetic plates (+ amber coil glow), glass deck, gantry grating, gravity chevrons (cyan-violet), loop band (hull + running lights), hex launch-pad tee, station pennant, glow, beacon flare (4-point star), fade |
| `sky.js` | **one dome shader** draws all of space: hashed star field (twinkle), violet/teal nebula, a big banded **ringed planet** (analytic ray-sphere + ring plane, sun-lit, rings in front / behind, planet shadow on the rings), a cratered **moon**, sun glare. White sun key (the one shadow caster), warm planet-shine rim, cool hemi, navy fog for the far backdrop, PMREM env (space + a station-light floor / panel) |
| `island.js` | the station platform under the course: grey-blue deck-plate top, white hull lip, glowing teal edge strip, white hull panels with a dark band and a second glow strip, then a flat-shaded low-poly **asteroid** tapering below (Reef's sweep: rounded caps, curvature limit, voids, one slab per solid run of `floor`). Round floating platforms, rock spikes, lone asteroids, `buildAsteroids` (one InstancedMesh) |
| `props.js` | beacon pylons, light posts, cargo crates, fuel canisters, antenna dishes, antenna masts, solar panels, hazard bollards, console terminals |
| `backdrop.js` | **main station** (hub with domed ends and window bands, habitat ring on spokes with a glow strip, docking modules + a docked shuttle, two solar wings, dishes, blinking beacons), **solar array farm** (truss of panel pairs, control pod, dish cluster), small floating platforms (`beacons`, `dish`, `crates`, `solar`, `tower`) |
| `env.js` | assembles everything (order below) |
| `skins.js` | all contract skins + `mover` |
| `billboards.js`, `util.js` | copies of reef's (util incl. polish2's bucket aliases + no-shadow glow); billboards gained a `blink` mode (beacon flash every ~1.8 s × `drift`, faint afterglow) |

Contract materials: `grass` teal-green deck turf, `fringe` anti-slip deck plate, `wall` white hull panels with a teal
stripe and tiny indicator lights, `wallTop` brushed grey-blue metal, `trim` glowing teal edge strip (dashes run along
it), `tee` light metal, `cupRim` metal with a teal glow, `flag` teal station pennant with a ringed-planet emblem,
`sand` **regolith dust**, `sticky` **magnetic deck plates** (amber coil glow pulses), `water` (unused), `ice`
**polished glass deck**, `boost` **gravity-accelerator chevrons** (tip at u = 0, scroll +v), `bridge` **gantry
grating**, `rock` asteroid rock.

`env.js` order: hull + asteroid under the course, spikes → space/lights/fog → along the course (alternating, clear of
voids/branches/gaps) beacon pylons (blink), light posts, bollards, crates / canisters / terminals → tee: pylons either
side, crate + canisters behind, an antenna mast → an antenna dish + solar panel + terminal ~55 % along → scattered
bollards / canisters / crates / panels (never within 2.6 m of the tee) → station (along `viewDir`, right, 88 m out)
and array farm (left, 70 m) → floating platforms (7 high / 5 low) → lone asteroids → all rock in one mesh →
drifting asteroids (one instanced mesh, 36 high / 18 low) → glow billboards → beacon billboards → teal cup beam.

Draw calls of the environment: dome 1, rock 1, near props ≤ 4 (panel, vc, metal, glow), backdrop ≤ 4, asteroids 1,
glows 1, beacons 1, cup beam 1. Low quality: half-size textures, 1024 shadow map, coarser sweep, the ALIAS_LO bucket
merge (gloss/metal/panel → vc), fewer platforms / asteroids / props, simpler skins.

### Skins (tris / meshes, `--skins`, high · low)
windmill — a reactor pylon: white hull drum with a teal band and glowing window slits, a dark glass dome with an
antenna and red beacon, a dark-metal tunnel frame with amber hazard lights; the **rotor is a cross of solar panel
arrays** (cells in gold frames on truss spars, a glowing hub, a light on each tip). Panels span exactly
x ∈ [0.018, 0.018 + bladeWidth], r 0.06 → bladeLength, ±0.022 Z. 1444 / 6 · 1152 / 4.
loop — an orbit ring of white hull panels with teal running lights, metal rails on the eased x(u), glowing edge
strips, struts, a beacon pod on top. 1712 / 4 · 1296 / 3.
tube — the **airlock**: clear glass (fresnel, guarded), white hull collars with amber rings at the ends, thin teal
light rings along it. 2800 / 3 (4 m) · 2384 / 3.
flag — metal mast, teal bands, a glowing finial, swallow-tail pennant with a slow vent ripple. 332 / 4.
pickup — a spinning energy crystal (octahedron) in a white + gold gyroscope ring with a star flare sprite
(`raycast = () => {}`, `noOcclude`). 260 / 2.
bumper — a beacon pylon (8 flat faces on the collider radius), teal / orange band, glowing cap. 160 / 2.
teePad — a hexagonal launch pad: hazard-ticked rim, dark hex inlay, glowing arrow down the hole, pulsing teal ring. 240 / 4.
mover — a **docking arm** block: white body, hazard-striped ends, glowing strips, a clamp. 84 / 2.

## Music: "Orbit Drift" (`STAR` in `js/audio/music.js`)
4/4 at 72 bpm, E Lydian (I, II major, vi, IV, Vsus, iii) with F# and C# excursions. Wide detuned-saw pads under a
slow, deep filter sweep (cut 1050 Hz, LFO ±520), a glassy FM lead (ratio 2, low index) and a harp through a long
ping-pong delay (send 0.4), soft FM bells. New: `seq` — a soft analog-style **arpeggio** (one filtered square per
eighth note, an up-and-down figure over the lowest five chord tones, alternate octave every bar, panned L/R; its level
and brightness drift every two bars and it drops out when the level is low). Extras: `sweep` (band-passed noise, a
ship passing), `ping` (sonar ping + echo on a chord tone), `comms` (faint telemetry beeps). One shared hunk in
`scheduleStep` (`if (th.seq) this.seqStep(...)`). **Not auditioned by ear.**

## Course: Star Station (`star1..star9`)
`js/course/holes/star1..star9.js`, theme-independent data (D6), existing pieces/features only, no engine changes.
`COURSES.star` (`theme: 'star'`), map tab after Sunken Reef, `lockedBy: { hole: 'reef9', course: 'reef' }`,
`dailyFrom: '2026-11-23'`. `?course=star&hole=N` works for dev. **Par 30**, 3 pickups per hole.

| # | id | name | par | idea | human-ish | planner |
|---|---|---|---|---|---|---|
| 1 | star1 | Docking Bay | 3 | beacon gate, a gravity-accelerator lane on the right, left bend round regolith, pylon + dust at the green | +0.13 | 1 |
| 2 | star2 | Slingshot | 3 | out along the boom to a banked hairpin with accelerators on its outer half that whip the ball back down the return leg; regolith on the return | -0.13 | 1 |
| 3 | star3 | Gantry Walk | 3 | wall-less 0.8 m grating gantry over the void with a gentle jink | +0.06 (×16) | 1 |
| 4 | star4 | Airlock | 3 | down into the airlock tube, swinging right and dropping across space; the inner door (mover) slides across the landing; magnetic plates | +0.38 | 2 |
| 5 | star5 | Orbit Loop | 2 | accelerator into the orbit ring, then a downhill banked S of polished glass with a pylon mid-S, magnetic plates, pylons at the cup | +0.38 | 1 |
| 6 | star6 | Asteroid Hop | 3 | three floating platforms: a ramp over the first drop, a bend round regolith, an accelerator launch over the long second gap | +0.13 | 1 |
| 7 | star7 | Docking Arms | 4 | a corridor where three docking arms sweep across out of step, magnetic plates either side, then a climbing bend through regolith | -0.25 | 2 |
| 8 | star8 | Wormhole Shortcut | 4 | the long way round a hairpin past a docking arm and an accelerator vs a 0.38 m wall-less gantry straight across the void | +0.75 | 2 |
| 9 | star9 | Star Gate | 5 | solar-array windmill gate, accelerator into the orbit ring, a leap across the void, a docking arm, four pylons round the cup | +0.38 | 2 |

Course ≈ **+0.20 / hole** (`holes_test --human=8`, star3 ×16) — a touch above Sunken Reef (+0.17). Tuning: star1 was
-0.5 (narrower green, bumper on the line, dust); star2 -0.38 (accelerators on the outer half only, wider dust,
narrower return); star3 +0.63/+0.88 (0.7 m, bigger jinks) → 0.8 m, gentler; star5 -0.63 at par 3 → par 2;
star7 -0.63 (wider, faster arms, narrower corridor, a second pylon); star9 +1.25 at par 4 → par 5.
Ladder `HARD` (js/meta/ladder.js): star4, star5, star8, star9 +1 (the holes over +0.3). The 8-sample numbers are noisy (±0.3).

### AI
`node tools/ai_test.mjs --course=star --rounds=20 --skills=0.1,0.3,0.5,0.7,1 --jobs=8 --json=F` then
`node tools/ai_calib.mjs F --merge` → `js/ai/calib.js` covers 63 holes (non-star entries unchanged, checked).
Per round (par 30) at skill 0.5: Professor +2.5, Pro +3.25, Carl +7.1, Lou +9.95, Mags +11.8, Zoe +12.25, Banks
+15.15, Bertha +16.3; skill 1: Pro -5.95, Professor -6.65. Harder for the AI than Reef (Pro +0.55 at 0.5), a bit
easier than Hollow Woods (Pro +5.0). Two statistical character checks fail on this course ("Bertha makes more
holes-in-one than Carl" 27 vs 41, "Banks bounces off more walls per shot than The Pro" 3.28 vs 2.93) — character
checks, not hole problems (reef / woods / festival each fail one or two of these the same way).

### Daily, boards, online, events
- `dailyFrom: '2026-11-23'` on `COURSES.star` and the star `THEME_LIST` entry. Checked against the pre-star fixture:
  **all 20 days before 2026-11-23 are identical** (global pick: hole, twist, theme; and every open-course set, old set
  ↔ same set with/without star: 320 comparisons, 0 changes). First star day in the global pick: 2026-11-24.
- `node tools/daily_pool.mjs` regenerated `server/dailypool.json` + `server/testdata/daily_picks.json` (now 4
  lockable courses → 15 open-set fixtures). `server/daily_test.go` also checks no star hole / theme before 2026-11-23.
  **The live server needs a redeploy** for star daily results from 2026-11-23 (until then it refuses them; harmless).
- `tools/daily_test.mjs`: "all open" store also finishes reef9; new checks: star locked until reef9, star holes only
  once open, days before dailyFrom unchanged (no star hole or theme), star holes and theme appear from dailyFrom. 83/83.
- Online: rooms / boards list Star Station via `COURSES` (main.js `roundList` gets `COURSES.star`); server untouched
  (id regex accepts `star`). `tools/online_test.mjs` gained a check (star room hole set 4-6 + courseForRoom).
- Weekend events pick star holes and the theme automatically; weekend theme picks shift (as with every added theme).

## Changes outside `js/themes/star/` and the new hole files (exact hunks)
- `js/app/menus.js` — one line after the reef entry in `THEME_LIST`:
  `{ id: 'star', name: 'Star Station', swatch: 'linear-gradient(160deg, #04060e 0%, #3a2a78 55%, #3a8e6a 56%, #c8d2dc 100%)', moon: '#e0b070', dailyFrom: '2026-11-23' },`
- `js/app/main.js` — two lines: map tabs `[course, COURSES.festival, COURSES.woods, COURSES.sugar, COURSES.reef, COURSES.star]`
  and the same list in `boards: { ... rounds: roundList([...]) }`.
- `js/course/holes/index.js` — 9 `import starN from './starN.js';` lines after reef9, and the `star: { ... }` block
  (with `lockedBy` and `dailyFrom`) after `reef`.
- `js/audio/music.js` — header comment line, the `STAR` const before `THEMES`, `star: STAR` in `THEMES`, one line in
  `scheduleStep` (`if (th.seq) this.seqStep(...)`), and four Player methods `seqStep / sweep / ping / comms` just
  before the `// ---- extras` comment.
- `js/meta/ladder.js` — `HARD` gains `star4: 1, star5: 1, star8: 1, star9: 1` (new line after reef's).
- `js/ai/calib.js` — regenerated with `ai_calib --merge` (adds star1..9).
- `server/dailypool.json`, `server/testdata/daily_picks.json` — regenerated by `tools/daily_pool.mjs`.
- `server/daily_test.go` — the dailyFrom loop also checks star (no star hole/theme before 2026-11-23).
- tools: `tools/daily_test.mjs`, `tools/online_test.mjs`, `tools/sound_preview_cdp.mjs` (star in the live switch and
  wav list); new `tools/star_shots.mjs` (reef_shots + default `--course=star`/`--theme=star`, port 9620, swap includes
  reef, extra size `pl` = 915x412).
- No holeview / builder change needed.

## Performance (renderer.info, headless SwiftShader, tee view; shadow pass not counted)
| | draw calls | triangles |
|---|---|---|
| high, star 1–9 portrait 412x915 | 36–61 | 24.2k–32.1k (star9 heaviest: windmill, loop, 4 pylons, docking arm) |
| high, 915x412 / 844x390 / 1440x900 | 42–61 | 24.2k–32.1k |
| low, star 1–9 portrait | 29–45 | 14.0k–20.7k |

Per hole (high portrait / low portrait): 1 48/25.1k · 37/15.0k — 2 36/24.4k · 29/14.0k — 3 45/24.2k · 35/14.5k —
4 51/30.6k · 40/19.4k — 5 53/29.5k · 41/18.7k — 6 44/28.5k · 35/17.7k — 7 40/25.8k · 31/15.3k — 8 47/27.1k · 37/16.7k —
9 61/32.1k · 45/20.7k. Budget (≤ ~80 calls, ≤ ~40k tris on the worst hole, high) met with room; Reef is 60–89 / 47–59k.
Low cuts ~25 % of the calls (small skins collapse to one lit draw, ALIAS_LO merges, pickup rings unlit, fewer
platforms) and ~40 % of the triangles. Biggest fill cost: the dome (2 noise fetches for the nebula + 2–3 for the
planet / rings / moon, star hash); everything else is plain MeshStandard.

## Needed CSS hunk (not applied: css belongs to polish2)
With a 7th course tab the map's tab row (`.seg.nines`) is wider than a 412 px phone and the map card is cut off on
the right. Verified by injecting this in the browser (tabs wrap to two rows, card fits):
```css
/* css/app.css, after `.seg.nines { margin: 0 0 10px; }` */
.seg.nines { flex-wrap: wrap; }
.seg.nines button { flex: 1 1 22%; }
```
(shots: `star_shots/map.png` before, `star_shots/map-wrap.png` with it.)

## Test results (2026-11-09, working tree incl. polish2's in-progress files)
- `physics` 25/25 · `story`, `events`, `meta`, `store`: all passed · `ballhit` 46/46 · `daily` 83/83 · `online` 31/31
- `holes_test`: 63/63 ok (planner ≤ par everywhere); `--human` numbers in the course table
- `boards_test` (vs a freshly rebuilt local server :8098, restarted for the new embedded pool): 26/26 ·
  `server/test.sh`: ALL PASS · `daily_pool.mjs --check`: fresh
- `ai_test --course=star`: all but two character checks (see AI)
- `sound_preview_cdp`: all passed (star switches live; 90 s render peak 0.192, RMS -28.4 dB; reef -27.7)
- Browser (CDP :9620, `star_shots.mjs`): star 1–9 at 412x915, 915x412, 844x390, 1440x900 and `q=low`; sky 1–18 and
  reef 1–9 in the star theme (34–65 calls, 24–36k tris); `--swap` sky → spooky → frost → candy → volcano → reef → star;
  title screen + course map. **No console errors.**

## Mobile GPU rule
Dome: every direction through `safeDir`; ray-sphere `sqrt(max(disc, 0))` and only when `b > 0`; the ring plane
divides only when `|dot(d, n)| > 1e-4`; nebula projection divides by `1.2 + d.y` (≥ 0.2); all `pow()` bases clamped
to [0, 1]; smoothstep edges ascending. Glass / glass-deck fresnel divide only when `length > 1e-4`. Asteroid drift
divides by `max(scale, 0.05)`. No `normalize()` of a possibly-zero vector in any shader (the one `normalize` is a
constant).

## Known issues
- Music not auditioned by ear (levels in line, see test results).
- `water` material supplied but the engine draws no water patches.
- The station and array farm sit in the same view-relative spots every hole (as Reef's ship / temple).
- The tee pad's hex inlay (texture) and hex disc (mesh) are a few degrees off from each other.
- AI character checks: two statistical failures on this course (see AI).

## How to test
```
~/.claude/bin/cdp start --port 9620
node tools/star_shots.mjs --holes=1-9 --sizes=p,pl,lp,l     # star course, tee shots + draw calls/tris, exit 1 on console errors
node tools/star_shots.mjs --holes=1-9 --sizes=p --q=low
node tools/star_shots.mjs --course=sky --holes=1-18 --sizes=p   # other courses in the star theme
node tools/star_shots.mjs --skins | --swap | --breakdown
node tools/holes_test.mjs star3 --human=8
```
Phone: http://192.168.0.236:8888/gms/3d/skyputt/?course=star&hole=5&theme=star&noflyover

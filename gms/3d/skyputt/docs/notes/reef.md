# reef agent: Sunken Reef (theme + music + 9-hole course)

Status 2026-11-08: **built, nothing committed** (manager commits). Theme `js/themes/reef/`, music track `reef`
in `js/audio/music.js`, course `COURSES.reef` (`reef1..reef9`, theme `reef`, locked behind Sugar Summit hole 9).

## Theme `js/themes/reef/`
Implements THEME_CONTRACT and every engine extension (`info.floor`, `info.voids`, `info.branches`,
`info.viewDir`, windmill blade layout, the loop's eased x(θ), boost UVs, the `mover` skin). Structure follows
Volcano Forge (same sweep, buckets, billboards, courseFrame).

| file | contents |
|---|---|
| `index.js` | `createTheme(ctx)` → `{ id:'reef', name:'Sunken Reef', materials, buildEnvironment, skins, dispose }` |
| `materials.js` | contract materials + internal ones, shared `uTime`, a **caustics injector** (`caustics(mat, k, up)`: two scrolling fetches of one caustic texture, min-combined, world-XZ projected, up-facing only; adds `caustic × albedo × k` so dark stays dark), mother-of-pearl iridescence, island rock shader (coral polyp glow), glow (pulsing unlit), swaying kelp (instanced vertex shader), sea glass |
| `textures.js` | canvas textures: sea-grass green, sand/grass fringe, coral-crusted reef-rock walls (+ polyp emissive), mossy temple-stone cap with a carved meander, verdigris trim with a sea-light channel, rock data map, rippled sand, seaweed mat, mother-of-pearl, ship deck planks, caustics, current chevrons (cyan), plank loop band, mosaic tee pad with a scallop sigil, tattered sail flag, glow, bubble, silt atlas, kelp blade, fade |
| `sky.js` | water dome: brightens to a rippling surface ("Snell's window") overhead, god-ray streaks fanning from the sun, deep blue below; a **sandy seabed** with caustics fading into the water (replaces the lava sea / sky floor); water fog; a cool sun key (the one shadow caster), teal bounce from below, hemi fill, PMREM env map |
| `island.js` | reef pinnacle under the course: sea-grass/sand top, mossy lip, lumpy reef-rock sides crusted with pink / orange / violet coral, craggy base; `spires()` rock columns from the seabed up under the reef (it stands on the sand instead of floating); `roundIsland`/`spikes` for outcrops; instanced branch corals, sea fans, sponges and **one instanced kelp mesh** (reef edge + seabed + backdrop forest) |
| `props.js` | glowing anemones, giant clams with pearls, amphorae, broken temple columns, fallen drums, ship lanterns on posts, barrels, anchor, treasure chest, starfish, brain coral, tube sponges |
| `backdrop.js` | **sunken ship** (parametric planked hull with weed line, barnacles and a breach, deck, stern cabin with glowing windows, foremast with a torn sail, the snapped mainmast over the side, bowsprit, lantern, spilled barrels / anchor / chest), **ruined temple** (stepped plinth, fluted columns, broken back row + fallen drums, architrave, pediment, a side arch, a half-buried statue head, sea-lamps, anemones, clam, amphorae), reef outcrops (`corals`, `kelp`, `clams`, `amphorae`, `anemones`, `columns`) |
| `fish.js` | schools of fish: ONE InstancedMesh for all schools, swimming entirely in the vertex shader (oval orbit, bob, tail wiggle, yaw from the tangent) |
| `rays.js` | god-rays: axis-billboard light shafts slanting down from the sun direction, one additive draw call |
| `particles.js` | around the camera: rising bubbles (rim + highlight) and drifting plankton / marine snow (some bioluminescent); one draw call each |
| `env.js` | assembles everything (below) |
| `skins.js` | all contract skins + `mover` |
| `billboards.js`, `util.js` | copies of volcano's; billboards gained a `bubble` mode (rise, wobble, pop at the top) |

Contract materials: `grass` sea-grass green (2 m tile, mowing stripes, sand flecks, light caustics), `fringe` sand
with grass tufts and shells, `wall` coral-crusted reef rock (glowing polyp dots), `wallTop` mossy temple stone with a
meander, `trim` verdigris bronze with a drifting cyan sea-light channel, `tee` sandstone, `cupRim` verdigris with an
aqua glow, `flag` tattered sea-green sail with a shell, `sand` pale rippled sand, **`sticky` seaweed mat** (see
holeview hunk below), `water` (unused by the engine), `ice` mother-of-pearl (iridescent sheen by view angle),
`boost` dark teal with glowing cyan current chevrons + streaks (tip at u = 0, scrolls +v), `bridge` weathered ship
deck planks, `rock` reef rock.

`env.js` order: reef rock + spikes → water/seabed/lights/fog → spires to the seabed → along the course
(alternating, clear of voids/branches/gaps) anemones, broken columns, lantern posts, amphorae / clams / brain
corals → tee: anemones either side, an amphora and a clam behind, a lantern post → a broken column, chest and
fallen drum ~55 % along → scattered brain corals, tube sponges, starfish, barrels, bubble vents → ship (along
`viewDir`, right) and temple (left) on the seabed → outcrops with spires → all rock in one mesh → foliage (corals,
fans, sponges, all kelp) → glows → bubble streams → silt clouds → god-rays → fish → bubbles + plankton → aqua cup beacon.

### Skins (tris / meshes, high, `--skins`)
windmill — a temple water-mill: stone drum in courses with a coral crust, glowing arched windows on the sides, a
dome with a conch spire, stone-framed tunnel with a pearl keystone; rotor = wooden plank paddles in bronze frames
with barnacles and a starfish, pearl hub. Paddles span exactly x ∈ [0.018, 0.018 + bladeWidth], r 0.06 → bladeLength.
loop — a ship's-rib hoop of barnacled planks with a glow seam, bronze rails on the eased x(u), coral knobs along the
edges, a giant clam with a pearl on top. tube — aqua sea glass (fresnel, guarded), bronze rings, stone collars with
coral. flag — tattered sail on a wooden mast, bronze bands, pearl finial, slow underwater undulation. pickup — a
spinning pearl (white / pink / aqua) in a scallop with a glow sprite (`raycast = () => {}`, `noOcclude`). bumper —
coral-crusted temple column drum (flat faces on the collider radius) with barnacles, moss and a glowing anemone top.
teePad — mosaic disc, bronze ring, shell studs, pulsing aqua ring. mover — a sliding temple block with bronze
corner straps, glowing rune lines and moss.

## Music: "Tides of the Reef" (`REEF` in `js/audio/music.js`)
4/4 at 68 bpm, Eb major with a Lydian IV and maj7/add9 colours (I, IVlyd, vi, ii, Vsus, iii), excursions to F and
C. Muffled strings (lowpass 760 Hz) under a deep slow filter swell, harp + soft vibraphone (low-index FM) through a
long ping-pong delay (send 0.36), glassy bells. Extras: `bubble` (existing), new `drip` (water-drop plips) and
`whale` (rare distant low glide). 90 s render: peak 0.206, RMS -27.7 dB (volcano -27.3). **Not auditioned by
ear.** `tools/sound_preview_cdp.mjs` switches to reef live and writes `music_reef.wav` with `--wav`.

## Course: Sunken Reef (`reef1..reef9`)
`js/course/holes/reef1..reef9.js`, theme-independent data (D6), existing pieces/features only, no engine changes.
`COURSES.reef` (`theme: 'reef'`), map tab after Sugar Summit, `lockedBy: { hole: 'sugar9', course: 'sugar' }`
(as Sugar is gated on fest9). `?course=reef&hole=N` works for dev (not gated). Par 30, 3 pickups per hole.

| # | id | name | par | idea | human-ish ×8 | planner |
|---|---|---|---|---|---|---|
| 1 | reef1 | Coral Gate | 3 | two coral posts form a gate, right-hand curve round a sand pocket | +0.13 | 1 |
| 2 | reef2 | Riptide Run | 3 | 21% sandbank to a raised green; a narrow current lane up the left carries you over | 0.00 | 1 |
| 3 | reef3 | Shipwreck Deck | 3 | wall-less 0.68 m plank deck kinking over open water (void) | 0.00 | 2 |
| 4 | reef4 | Temple Tunnel | 3 | glass tube swinging left and down under the temple arch over open water | +0.13 | 1 |
| 5 | reef5 | Pearl Slide | 2 | downhill banked S of mother-of-pearl (ice), a coral head mid-S, seaweed tuft at the bottom | +0.38 | 1 |
| 6 | reef6 | Sunken Loop | 3 | current into a loop, steep 21% climb past sand to a green with posts round the cup | +0.13 | 1 |
| 7 | reef7 | Kelp Fork | 4 | long way round past two sliding temple blocks + seaweed bend vs a wall-less mast across the drop | +0.63 | 2 |
| 8 | reef8 | Current Switchbacks | 4 | three legs up two banked hairpins, current on the middle (climbing) leg | +0.38 | 2 |
| 9 | reef9 | Poseidon's Gate | 4 | temple water-mill, pearl chute, current into a loop, sand, two sliding blocks, four coral heads round the cup | -0.25 | 2 |

Course ≈ **+0.17 / hole** (`holes_test --human=8`), a touch above Sugar Summit (≈ 0.0) and Festival (≈ +0.1),
below Hollow Woods (+0.46). Tuning: reef3 started at +1.13 (0.62 m deck, bigger kink) → 0.68 m, smaller kink;
reef5 was -0.63 at par 3 (steeper, narrower, coral head added, then par 2); reef9 -0.63 → sand + a second mover;
reef6 -0.5 → steeper climb, sand, posts flanking the cup. Ladder `HARD` (js/meta/ladder.js): reef5, reef7, reef8 +1.
The 8-sample numbers are noisy (±0.3).

### AI
`node tools/ai_test.mjs --course=reef --rounds=20 --skills=0.1,0.3,0.5,0.7,1 --jobs=9 --json=F` then
`node tools/ai_calib.mjs F --merge` → `js/ai/calib.js` now covers 54 holes. Per round (par 29 as measured — reef5
was still par 2) at skill 0.5: Professor +0.40, Pro +0.55, Carl +2.95, Lou +5.70, Mags +10.2, Zoe +12.2, Banks
+14.25, Bertha +14.4; skill 1: Pro -7.85, Professor -9.35. Harder for the AI than Sugar (Pro -2.35 at 0.5),
easier than Hollow Woods (Pro +5.0). All checks pass except the personality check "Lucky Lou is streakier than
The Pro at skill 0.5" (round sd 3.24 vs 3.84) — a statistical character check on this course, not a hole problem
(woods/festival failed other character checks the same way, see courses3.md).

### Daily, online, events
- **Daily** (js/daily/daily.js): adding a course changes the global pick on days where one of its holes wins, and
  adding a theme changes every day's theme (the theme index is `hash % themes.length`). So reef (course and theme)
  joins the daily pool only from `dailyFrom: '2026-11-16'` (on `COURSES.reef` and the reef `THEME_LIST` entry): the
  pool / theme list for a day only holds things live on that day, and the walk uses each day's own pool, so
  2026-11-03..15 are byte-identical to HEAD (checked against `git archive HEAD`: 13/13 same hole, twist, theme).
  The "locked player" key is now the set of live open courses (not hole ids), so a gated course never shifts the
  hole of a player with everything open. `tools/daily_test.mjs`: the "all open" store also finishes sugar9; new
  checks: reef locked until sugar9, reef holes only once open, days before dailyFrom unchanged (no reef hole or
  theme), reef holes and theme appear from dailyFrom. 79/79.
- **Online**: `js/net/form.js` / `rooms.js` are generic over COURSES, so rooms list Sunken Reef with no change;
  server untouched (its id regex accepts `reef`/`reefN`). `tools/online_test.mjs` gained two checks (every course/hole
  id fits the server id rule; reef hole set 7-9 + courseForRoom).
- Weekend events (`calendar.js allHoles()`/`themeIds()`) pick reef holes and the reef theme automatically; as when
  volcano/candy were added, weekend theme picks shift (known behaviour; events_test passes).

## Changes outside `js/themes/reef/` and the new hole files (exact hunks)
Shared-file hunks (each self-contained):
- `js/app/menus.js` — one line after the volcano entry in `THEME_LIST`:
  `{ id: 'reef', name: 'Sunken Reef', swatch: 'linear-gradient(160deg, #9ef0f0 0%, #1c88a4 55%, #60a05c 56%, #c8bc8a 100%)', moon: '#7af0e0', dailyFrom: '2026-11-16' },`
- `js/app/main.js` — map tabs: `courses: [course, COURSES.festival, COURSES.woods, COURSES.sugar, COURSES.reef].filter(Boolean)`
- `js/course/holes/index.js` — 9 `import reefN from './reefN.js';` lines after sugar9, and the `reef: { ... }` block
  (with `lockedBy` and `dailyFrom`) after `sugar`.
- `js/audio/music.js` — header comment line, the `REEF` const + `reef: REEF` in `THEMES`, and two new Player
  methods `drip()` / `whale()` just before the `// ---- extras` comment.
- `js/game/holeview.js` — `sticky: ['sticky', 'sand', 'grass']` (was `['sand', 'grass']`) so a theme can give
  sticky patches their own material (seaweed); themes without `sticky` fall back to `sand` as before.
- `js/meta/ladder.js` — `HARD` gains `reef5: 1, reef7: 1, reef8: 1`.
- `js/daily/daily.js` — `dailyFrom` handling (import THEME_LIST; `liveOn`/`fullAt`/`fullKey`, `walkPick(ymd)`,
  `pickFor(ymd, open, key)`, `dailyFor` uses the day's live pool and live themes).
- `js/ai/calib.js` — regenerated with `ai_calib --merge` (adds reef1..9).
- tools: `tools/daily_test.mjs`, `tools/online_test.mjs`, `tools/sound_preview_cdp.mjs` (reef in the live switch and
  wav list); new `tools/reef_shots.mjs` (volcano_shots + default `--course=reef`, port 9610, swap includes volcano).

## Test results (2026-11-08, working tree incl. ballhit's committed 3a59abaa)
- `physics` 25/25 · `store`, `story`, `events`, `meta`: all passed · `daily` 79/79 · `online` 30/30 (108/108 replays)
- `holes_test`: 54/54 ok (planner ≤ par everywhere)
- `ai_test --course=reef`: all but one character check (see AI)
- `sound_preview_cdp`: all passed (reef switches live; 90 s render peak 0.206, RMS -27.7 dB)
- Browser (CDP :9610, `reef_shots.mjs`): reef 1–9 at 412x915, 1440x900, 844x390 and `q=low`; sky 1–18 and sugar 7–9
  in the reef theme; title swaps sky → spooky → frost → candy → volcano → reef. **No console errors** (the `--skins`
  page logs a favicon 404 from tools/theme_preview.html, unrelated).

## Performance (renderer.info, headless SwiftShader, tee view)
| | draw calls | triangles |
|---|---|---|
| high, reef 1–9 portrait / 844x390 | 60–89 | 47k–59k (reef9 heaviest: windmill, loop, 4 bumpers, 2 movers) |
| high, sky 1–18 portrait | 48–80 | 48k–61k |
| low, reef 1–9 portrait | 47–86 | 23k–31k |
Volcano on reef9 for comparison: 82 calls / 38.7k. Reef draws ~5–8 more calls (fish, god-rays, bubble streams,
bubbles, plankton; kelp is one instanced mesh for the reef edge, seabed and backdrop) and ~40% more triangles
(foliage instances, ship hull, temple). Fish swim entirely in the vertex shader; no per-frame CPU work besides uTime.
Biggest fill costs: the dome (2 noise + 2 ray fetches), seabed (4 fetches), caustics (2 extra fetches on floors).

## Mobile GPU rule
Dome/seabed directions via `safeDir`; the surface projection divides by `max(h, 0.06)`; the god-ray angle uses
`atan(y, x)` with x clamped away from 0; fish yaw `atan(tx, tz)` with tz clamped and the orbit radius clamped > 0.2;
god-ray side vector length-guarded; glass / pearl fresnel divides only when `length > 1e-4`; every `pow()` base is
clamped or non-negative; smoothstep edges ascending.

## Known issues
- Music not auditioned by ear (levels match the other tracks).
- Draw calls / triangles a little over volcano (above); low quality halves triangles but keeps most draw calls.
- `water` material supplied but the engine draws no water patches.
- Backdrop outcrops near the tee in landscape are big and close; they stand on rock pillars to the seabed.
- reef_shots.mjs uses `?course=reef` by default; pass `--course=sky` for Sky Isles.
- Weekend-event theme picks shift with a 6th theme (as with every added theme).

## How to test
```
~/.claude/bin/cdp start --port 9610
node tools/reef_shots.mjs --holes=1-9 --sizes=p,l,lp      # reef course (default), tee shots + draw calls/tris, exit 1 on console errors
node tools/reef_shots.mjs --course=sky --holes=1-18 --sizes=p   # other courses in the reef theme
node tools/reef_shots.mjs --holes=1-9 --sizes=p --q=low
node tools/reef_shots.mjs --skins | --swap | --breakdown
node tools/holes_test.mjs reef3 --human=8
```
Phone: http://192.168.0.236:8888/gms/3d/skyputt/?course=reef&hole=4&theme=reef&noflyover

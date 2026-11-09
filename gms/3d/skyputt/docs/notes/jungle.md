# jungle agent: Jungle Temple (theme + music + 9-hole course)

Status 2026-11-09: **built, nothing committed** (manager commits). Theme `js/themes/jungle/`, music track `jungle` in
`js/audio/music.js`, course `COURSES.jungle` (`jungle1..jungle9`, theme `jungle`, locked behind Star Station hole 9,
`dailyFrom: '2026-11-30'`). Built in parallel with `events4` (no events files touched).

## Theme `js/themes/jungle/`
Implements THEME_CONTRACT and every engine extension (`info.floor`, `info.voids`, `info.branches`, `info.viewDir`,
windmill blade layout, the loop's eased x(θ), boost UVs, the `mover` skin, `sticky` material). Structure follows
Star Station (same sweep, buckets with aliases, billboards, courseFrame).

| file | contents |
|---|---|
| `index.js` | `createTheme(ctx)` → `{ id:'jungle', name:'Jungle Temple', materials, buildEnvironment, skins, dispose }` |
| `materials.js` | contract materials + internal ones, shared `uTime`; terrace shader (anything facing up reads mossy paving, stone sides read cut blocks, earth/moss sides read grain), wet jade (fresnel sheen, guarded), foliage (alpha atlas, world-position rustle), lianas (instanced ribbons pinned at the top, sway grows toward the free end), waterfall (scrolling alpha strip) |
| `textures.js` | canvas textures: mossy turf (2 m tile, mowing stripes, moss clumps, a few petals), mossy flagstone fringe, carved temple-stone walls (running bond, spiral glyphs, moss, vine tendrils), capstone with a **gold-inlaid meander** (+ emissive glint), gold trim band, terrace data map, temple dust, mud, jade, rope-and-plank bridge (planks across z, lashings), glyph-rune chevrons (boost), feathered-serpent scales (loop band), bark, carved sun-stone tee, woven banner flag, foliage atlas (monstera / fern / cluster / banana), liana strip, **bird atlas** (scarlet macaw + toucan, two flap frames), waterfall, glow, mist puff, fade |
| `sky.js` | **one dome shader**: warm humid haze (pale gold horizon, soft teal zenith), hazy sun, drifting cloud wisps, three layers of rainforest **ridge silhouettes** with bumpy crown tops (far ones bleached by haze), and below the horizon a **canopy sea sinking into mist** (what a void looks down on). Warm sun key (the one shadow caster), cool rim, green-gold hemi, warm haze fog, PMREM env |
| `island.js` | the temple terrace under the course: mossy paved top, carved lip with a gold inlay band, two courses of cut blocks with **moss-topped setbacks** (reaching 1.2× the top extent; the void clamp allows for it), then earth / rock with roots tapering below. Round ruin terraces, hanging root tangles, boulders |
| `props.js` | carved stelae with gold caps, stone braziers, bamboo torches, squat idol statues (jade eyes, plumed headdress), broken columns, clay urns, mossy boulders, ferns, monstera, banana plants, leaf bushes |
| `backdrop.js` | **stepped pyramid** (tiers, overgrowth, stair, shrine with a gold roof comb, braziers), **waterfall gorge** (two cliffs with canopy, the fall, mist at its foot), **giant trees** (trunk, branches, lumpy canopy crowns, liana anchors), small **ruin terraces** (`stelae`, `shrine`, `columns`, `idol`, `garden`) |
| `env.js` | assembles everything (order below) |
| `skins.js` | all contract skins + `mover` |
| `billboards.js`, `util.js` | copies of star's (util's bucket aliases re-keyed: vc / stone / gold / leaf / glow) |

Contract materials: `grass` mossy turf, `fringe` worn flagstones with moss joints, `wall` carved temple stone with
moss and vines, `wallTop` pale capstone with a gold-inlaid meander, `trim` gold band, `tee` sandstone, `cupRim` gold,
`flag` woven red banner with a gold sun, `sand` **temple dust**, `sticky` **mud** (wet, low roughness), `water`
(unused), `ice` **wet polished jade**, `boost` **glyph-rune chevrons** on dark stone (tip at u = 0, scroll +v),
`bridge` **rope-and-plank** planks, `rock` terrace rock.

`env.js` order: terrace + root tangles → sky/lights/fog → along the course (alternating, clear of voids/branches/gaps)
stelae, bamboo torches, ferns / monstera / bushes / bananas, urns / boulders / broken columns → tee: torches either
side, urns + a fern behind, a tall stele → an **idol shrine** (idol + two braziers) ~55 % along → scattered plants and
boulders → **rope rails** (two sagging ropes + posts each side) where the path runs inside a void and along
void-crossing branches → lianas over the terrace edges → pyramid (along `viewDir`, left, ~72 m) and gorge (right,
~58 m) → giant trees (7 high / 4 low; the two beside the tee carry no lianas) → ruin terraces (6 / 4) → all rock in one
mesh → waterfall → lianas (one instanced mesh) → glows, flames (flicker), **fireflies** (sparkle), **pollen** (drift,
high only), **parrots and toucans** (flapping billboards circling the canopy), mist (gorge spray + puffs under the
terrace) → gold cup beam.

Draw calls of the environment: dome 1, rock 1, near props ≤ 5 (vc, stone, gold, leaf, glow), backdrop ≤ 4, lianas 1,
waterfall 1, glows 1, flames 1, fireflies 1, pollen 1 (high), birds 1, mist 1, cup beam 1. Low: half-size textures,
1024 shadow map, coarser sweep, ALIAS_LO (stone + gold → vc), fewer props / trees / ruins / lianas / fireflies /
birds / mist, no pollen, simpler skins (one lit draw each).

### Skins (tris / meshes, `--skins`, high · low)
windmill — a **stone wheel totem**: three stacked octagonal drums, a carved face with jade eyes toward the ball, a
gold band and a fan of red / green / gold plumes on top, ember-lit niches at the tunnel; the rotor is a gold sun hub
with a jade gem and **carved stone slabs** (glyph grooves, gold tips) spanning exactly x ∈ [0.018, 0.018 + bladeWidth],
r 0.06 → bladeLength, ±0.022 Z. 1104 / 7 · 960 / 4.
loop — a **carved feathered serpent ring**: scaled band with a belly stripe, gold rails on the eased x(u), feather
spines along both edges, the serpent's head with jade eyes, fangs and a plume crest on top. 1176 / 5 · 928 / 3.
tube — a **hollow log** split open along the top (a ~86° slot, so the ball stays visible): bark outside, pale wood
inside, moss along the top, end rings, shelf fungi. 2716 / 2 (4 m test curve) · 1996 / 2.
flag — bamboo pole with nodes, a gold sun finial with a jade dot, a woven banner with a lazy breeze. 350 / 4.
pickup — a spinning gold sun coin with a jade centre (alternating with a jade gem in a gold ring and a copper coin),
glow sprite (`raycast = () => {}`, `noOcclude`). 184 / 2.
bumper — an **idol head**: 8 flat faces on the collider radius, brow, nose, mouth, gold ear spools and headband, a
stepped crest, jade or ember eyes. 252 / 2 · 252 / 1.
teePad — a carved **sun stone** (glyph bands, gold rays, arrow), gold ring, pulsing gold glow ring. 576 / 4.
mover — a **carved stone block**: glyph panels on both long faces, gold corner edges, moss on top, glowing eye
slits. 144 / 2 · 144 / 1.

## Music: "Temple Canopy" (`JUNGLE` in `js/audio/music.js`)
4/4 at 70 bpm, G major pentatonic colours (I 6/9, IV maj9, vi7, ii7, Vsus, Mixolydian bVII), excursions to A and F.
Soft strings low under the canopy (lowpass 680 Hz), a **marimba** (FM ratio 4, fast-falling index, an octave down)
and a **kalimba** (inharmonic FM ratio 5.4) trading the arpeggio through a ping-pong delay (send 0.3), a faint high
"insect" air bed. New: `hands` — a quiet **hand-drum** groove (a low "dum" on 1 and sometimes 3, finger "teks" on the
off-beats, ghost teks; ~1 bar in 5 rests). Extras: `birdcall` (runs of quick rising chirps), `coo` (a turaco's soft
"hoo HOO hoo"), `rainstick` (a thinning high noise shower). One shared hunk in `scheduleStep`
(`if (th.hands) this.handStep(...)`). 90 s render: peak 0.207, RMS -28.0 dB (star -28.2, reef -27.8). **Not
auditioned by ear.**

## Course: Jungle Temple (`jungle1..jungle9`)
`js/course/holes/jungle1..jungle9.js`, theme-independent data (D6), existing pieces/features only, no engine changes.
`COURSES.jungle` (`theme: 'jungle'`), map tab after Star Station, `lockedBy: { hole: 'star9', course: 'star' }`,
`dailyFrom: '2026-11-30'`. `?course=jungle&hole=N` works for dev. **Par 31**, 3 pickups per hole.

| # | id | name | par | idea | human-ish | planner |
|---|---|---|---|---|---|---|
| 1 | jungle1 | Temple Steps | 3 | up two terrace ramps: idol pair at the bottom step, glyph lane on the second ramp, dust on the bend, an idol + mud guarding the cup | -0.19 (×16) | 1 |
| 2 | jungle2 | Rope Bridge | 3 | wall-less 0.86 m rope-and-plank bridge over the gorge, a slight sag and drift left; mud + idol on the green | -0.25 (×16) | 1 |
| 3 | jungle3 | Hollow Log | 3 | into the hollow log, swinging left and dropping across the gorge; mud wallow and an idol on the landing | -0.13 | 2 |
| 4 | jungle4 | Serpent Ring | 3 | glyph runes into the serpent loop, out along a right bend through dust to a green flanked by idols | -0.13 | 1 |
| 5 | jungle5 | Jade Slide | 2 | downhill banked jade S, an idol mid-S, mud at the bottom, idols round the cup | +0.50 | 1 |
| 6 | jungle6 | Rolling Stones | 4 | three carved stone blocks grinding across a corridor out of step, mud either side, a climbing left bend through dust | +0.63 | 2 |
| 7 | jungle7 | Temple Stair | 4 | three legs up two banked switchbacks of the pyramid stair, glyph runes on the steep middle leg, mud inside, idols outside | +0.63 | 2 |
| 8 | jungle8 | Hidden Path | 4 | the long way round past a rolling stone and a glyph lane vs a hidden gap behind the tee idol onto a narrow (0.4 m) rope bridge across the gorge | +0.75 | 2 |
| 9 | jungle9 | Idol Court | 5 | stone wheel totem gate, the hollow log across the gorge, a court of five idols, a rolling stone in front of the cup | +0.38 | 2 |

Course ≈ **+0.24 / hole** (`holes_test --human=8`, holes 1-2 ×16) — a touch above Star Station (+0.20). Tuning:
jungle1 -0.38 (narrower, idol + mud in front of the cup); jungle2 +2.13 at 0.72 m with a deeper sag and bigger jink →
+1.50 at 0.8 m → -0.25 at 0.86 m, flatter (the ±0.3 noise of 8 samples is large on a bridge; somewhere between is the
truth). Ladder `HARD` (js/meta/ladder.js): jungle5..jungle9 +1 (the holes over +0.3).

### AI
`node tools/ai_test.mjs --course=jungle --rounds=20 --skills=0.1,0.3,0.5,0.7,1 --jobs=8 --json=F` then
`node tools/ai_calib.mjs F --merge` → `js/ai/calib.js` covers 72 holes (non-jungle entries unchanged, checked).
Per round (par 31) at skill 0.5: Professor -0.25, Pro +2.5, Carl +4.75, Lou +8.2, Zoe +11.8, Mags +12.5, Banks +14.9,
Bertha +15.15; skill 1: Professor -10.0, Pro -5.8. About Star Station's level for the AI (star: Pro +3.25 at 0.5).
One statistical character check fails on this course ("Lucky Lou is streakier than The Pro at skill 0.5", sd 3.31 vs
3.71) — a character check, not a hole problem (star failed two of these, reef / woods / festival one or two).

### Daily, boards, online, events
- `dailyFrom: '2026-11-30'` on `COURSES.jungle` and the jungle `THEME_LIST` entry. Checked against the pre-jungle
  fixture (`git show HEAD:…/daily_picks.json`): **all 27 days before 2026-11-30 are identical** in the global pick
  (hole, twist, theme) and in every old open-course set (16 sets ↔ the same sets with jungle locked: 208 entries
  compared both ways, 0 changes). First jungle day in the global pick: 2026-12-02 (jungle theme).
- `node tools/daily_pool.mjs` regenerated `server/dailypool.json` + `server/testdata/daily_picks.json` (now 5
  lockable courses → 31 open-set fixtures). `server/daily_test.go` also checks no jungle hole / theme before
  2026-11-30. **The live server needs a redeploy** for jungle daily results from 2026-11-30 (until then it refuses
  them; harmless).
- `tools/daily_test.mjs`: "all open" store also finishes star9; new checks: jungle locked until star9, jungle holes only
  once open, days before dailyFrom unchanged (no jungle hole or theme), jungle holes and theme appear from dailyFrom. 87/87.
- Online: rooms / boards list Jungle Temple via `COURSES` (main.js `roundList` gets `COURSES.jungle`); server untouched.
  `tools/online_test.mjs` gained a check (jungle room hole set 7-9 + courseForRoom).
- Weekend events: events4's working-tree calendar.js gates courses / themes by `dailyFrom`, so jungle joins weekends
  from 2026-11-30 on.

## Changes outside `js/themes/jungle/` and the new hole files (exact hunks)
- `js/app/menus.js` — one line after the star entry in `THEME_LIST`:
  `{ id: 'jungle', name: 'Jungle Temple', swatch: 'linear-gradient(160deg, #e8dcae 0%, #5e8460 55%, #4e8a3c 56%, #8a8e84 100%)', moon: '#e0b048', dailyFrom: '2026-11-30' },`
- `js/app/main.js` — two lines: map tabs `[course, COURSES.festival, COURSES.woods, COURSES.sugar, COURSES.reef, COURSES.star, COURSES.jungle]`
  and the same list in `boards: { ... rounds: roundList([...]) }`. (events4's own main.js hunks are separate.)
- `js/course/holes/index.js` — 9 `import jungleN from './jungleN.js';` lines after star9, and the `jungle: { ... }`
  block (with `lockedBy` and `dailyFrom`) after `star`.
- `js/audio/music.js` — header comment line, the `JUNGLE` const before `THEMES`, `jungle: JUNGLE` in `THEMES`, one line
  in `scheduleStep` (`if (th.hands) this.handStep(...)`), and five Player methods `handStep / hand / birdcall / coo /
  rainstick` just before the `// ---- extras` comment.
- `js/meta/ladder.js` — `HARD` gains `jungle5..jungle9: 1` (new line after star's; star's line now ends with `,`).
- `js/ai/calib.js` — regenerated with `ai_calib --merge` (adds jungle1..9).
- `server/dailypool.json`, `server/testdata/daily_picks.json` — regenerated by `tools/daily_pool.mjs`.
- `server/daily_test.go` — the dailyFrom loop also checks jungle (and its comment).
- tools: `tools/daily_test.mjs`, `tools/online_test.mjs`, `tools/sound_preview_cdp.mjs` (jungle in the live switch and
  wav list); new `tools/jungle_shots.mjs` (star_shots + default `--course=jungle`/`--theme=jungle`, port 9630, swap
  includes star, new `--map` mode: course map at 412x915, reports tab rows and any element past the viewport).
- `tools/sound_preview_levels.json` was rewritten by the sound check and restored with `git checkout`.
- No css / holeview / builder change needed (the `.seg.nines` wrap already handles 8 tabs: 2 rows of 4, `jungle_shots/map.png`).

## Performance (renderer.info, headless SwiftShader, tee view; shadow pass not counted)
| | draw calls | triangles |
|---|---|---|
| high, jungle 1–9 portrait 412x915 | 40–69 | 22.6k–30.6k (jungle9 heaviest: windmill, log, 6 idols, a stone) |
| high, 915x412 / 844x390 / 1440x900 | 50–69 | 22.6k–30.6k |
| low, jungle 1–9 portrait | 34–52 | 12.5k–18.6k |

Per hole (high portrait / low portrait): 1 56/23.7k · 46/13.3k — 2 50/22.6k · 42/12.5k — 3 53/26.6k · 44/15.3k —
4 57/26.5k · 46/15.6k — 5 54/24.4k · 44/13.6k — 6 46/24.0k · 38/13.2k — 7 40/24.8k · 34/13.8k — 8 55/26.6k · 45/15.9k —
9 69/30.6k · 52/18.6k. Budget (≤ 80 calls, ≤ 40k tris on the worst hole, high) met. Low cuts ~20 % of the calls and
~45 % of the triangles. Fill cost: the dome (2 cloud + 6 ridge + 2 canopy noise fetches, one atan), the waterfall and
mist are the only big translucent areas.

## Test results (2026-11-09, working tree incl. events4's in-progress files)
- `physics` 25/25 · `story`, `events`, `meta`, `store`: all passed · `ballhit` 46/46 · `daily` 87/87 · `online` 50/50
- `holes_test`: 72/72 ok, exit 0 (planner ≤ par everywhere); `--human` numbers in the course table
- `boards_test` (vs a freshly restarted local server :8098 via `tools/server_run.sh --bg`, for the new embedded pool): 26/26 ·
  `server/test.sh`: ALL PASS · `daily_pool.mjs --check`: fresh
- `ai_test --course=jungle`: all but one character check (see AI)
- `sound_preview_cdp`: all passed (jungle switches live; 90 s render peak 0.207, RMS -28.0 dB)
- Browser (CDP :9630, `jungle_shots.mjs`): jungle 1–9 at 412x915, 915x412, 844x390, 1440x900 and `q=low`; star 1–2 in
  the jungle theme; `--swap` sky → spooky → frost → candy → volcano → reef → star → jungle; `--map` at 412 px (2 rows
  of 4 tabs, document width = viewport, nothing overflowing). **No console errors.** (`--skins` loads
  theme_preview.html, whose missing favicon.ico logs one 404; not the game.)

## Mobile GPU rule
Dome: every direction through `safeDir`; `atan` only when `length(d.xz) > 1e-4`; cloud projection divides by
`0.25 + y` (y > 0), canopy by `0.3 - y` (y < 0); all `pow()` bases clamped to [0, 1]; smoothstep edges ascending
(descending ramps written as `1 - smoothstep(lo, hi, x)`). Jade fresnel divides only when `length > 1e-4`. Foliage /
liana sway are plain sin/cos offsets; no `normalize()` of a possibly-zero vector in any shader.

## Known issues
- Music not auditioned by ear (levels in line, see tests).
- `water` material supplied but the engine draws no water patches.
- The pyramid and gorge sit in the same view-relative spots every hole (as Star's station / Reef's ship).
- Rope rails are guessed from geometry: along path samples inside a void (offset = half width + 3 cm) and along
  branches that cross a void (fixed ±0.24 m, branches carry no width in `info`); on another course's wide void-crossing
  branch the ropes would sit on the deck (visual only).
- The serpent head and tree crowns are low-poly boxes / blobs — fine at play distance, plain up close.
- Bridge difficulty is noisy (jungle2 went +1.5 → -0.25 with 6 cm more width); a real-phone play is the better judge.
- AI character check: one statistical failure on this course (see AI).

## How to test
```
~/.claude/bin/cdp start --port 9630
node tools/jungle_shots.mjs --holes=1-9 --sizes=p,pl,lp,l   # jungle course, tee shots + draw calls/tris, exit 1 on console errors
node tools/jungle_shots.mjs --holes=1-9 --sizes=p --q=low
node tools/jungle_shots.mjs --map | --swap | --skins | --breakdown
node tools/jungle_shots.mjs --course=star --holes=1-9 --sizes=p   # other courses in the jungle theme
node tools/holes_test.mjs jungle2 --human=16
```
Phone: http://192.168.0.236:8888/gms/3d/skyputt/?course=jungle&hole=8&theme=jungle&noflyover

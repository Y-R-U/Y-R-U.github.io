# THRONG — code contract (M1)

Three.js 0.180.0 from the repo's vendored copy, ES modules, **no build step, nothing fetched
from another origin**. Importmap: `three` → `../../lib/three/0.180.0/three.module.js`,
`three/addons/` → `../../lib/three/0.180.0/addons/`.

Units: 1 unit = 1 metre. Ground plane is XZ, Y up. Map is centred on the origin.

## The one big idea

**The sim owns counts, not people.** A crowd is a leader position plus an integer `count`.
The hundreds of followers you see are cosmetic and live only in the renderer. Neutral
pedestrians ARE sim entities (everyone must see the same ones). This keeps the sim tiny,
deterministic and cheap to run on a server later (M3), and lets the renderer draw thousands
of figures without the sim caring.

## File ownership

| Lane | Owns |
|---|---|
| **G (gameplay)** | `index.html`, `css/`, `js/main.js`, `js/config.js`, `js/sim/**`, `js/input.js`, `js/audio.js`, `js/ui/**`, `js/meta/**`, `tools/sim_test.mjs`, `tools/meta_test.mjs`, `tools/ladder_tune.mjs` |
| **R (render)** | `js/render/**`, `js/world/**`, `tools/render_*.{mjs,html}` |

Never edit the other lane's files. If you need a change there, write it in
`docs/notes/<lane>_requests.md` and code against the contract. `js/config.js` is G's, but R may
append its own block under a `RENDER` key (say so in your notes).

## World (lane R) — `js/world/map.js`

Pure module: no three, no DOM, runs in node.

```js
export function generateMap(seed, opts = {}) → {
  seed, size,                 // playable square is [-size/2, size/2] on x and z (M1: 240)
  obstacles: [                // solid for leaders and pedestrians
    { type:'rect', x, z, w, d }            // axis-aligned, centre + full extents
    | { type:'circle', x, z, r }
  ],
  spawns: [{ x, z }],         // ≥ 12 leader spawn points, well apart, in open ground
  plazas: [{ x, z, r }],      // open areas; pedestrians cluster here
  walkable(x, z) → bool,      // inside bounds and not inside an obstacle
  // anything else the renderer wants (buildings, props, roads) — renderer-private
}
```

Streets must be wide (≥ 14 m) and there must be several big plazas: a crowd of 1,000 has a
radius of ~17 m and needs somewhere to be. Keep obstacle count modest (< 150); small props
(lamps, benches, trees) are visual only, not obstacles.

## Sim (lane G) — `js/sim/sim.js`

Pure module: no three, no DOM, runs in node. Deterministic for a given seed + inputs. Fixed step.

```js
export const SIM_DT = 1/30;
export function createSim({ seed, map, players, duration = 120 }) → sim
// players: [{ id, name, color (0xRRGGBB), isBot, skill (0..1), persona }]  — index 0..n-1

sim.setInput(crowdIndex, ax, az)   // desired move direction, length 0..1
sim.step()                         // advance SIM_DT
sim.drainEvents() → Event[]        // events since the last drain (array reused; copy if you keep it)
sim.state
```

```js
state = {
  tick, time, timeLeft,
  phase,                       // 'countdown' | 'play' | 'over'
  crowds: [{
    index, id, name, color, isBot,
    alive,                     // false while waiting to respawn
    x, z, vx, vz, heading,     // leader
    count,                     // people in the crowd, leader included (≥ 1 while alive)
    radius,                    // disc the crowd occupies ≈ RADIUS_K * sqrt(count)
    kills, best,               // crowds fully absorbed; peak count
    fx: { speed, magnet, double },   // seconds remaining on each power-up (0 = off)
    rank,                      // 1 = biggest
  }],
  neutrals: {                  // struct-of-arrays, fixed capacity
    cap, x: Float32Array, z: Float32Array, heading: Float32Array,
    state: Uint8Array,         // 0 = empty slot, 1 = wandering, 2 = pulled toward a crowd
    target: Int8Array,         // crowd index while state == 2
    look: Uint8Array,          // 0..255 random, renderer uses it for appearance variety
  },
  pickups: [{ id, kind: 'speed'|'magnet'|'double', x, z, active }],
  leader,                      // crowd index currently ranked 1
}
```

Events (all carry `tick`):

| type | fields | meaning |
|---|---|---|
| `recruit` | `crowd, slot, x, z` | neutral in `slot` joined `crowd` at that spot |
| `steal` | `from, to, n, x, z` | `n` people moved between crowds near the contact point |
| `elim` | `victim, by, x, z` | `victim` fully absorbed |
| `respawn` | `crowd, x, z` | |
| `pickup` | `crowd, id, kind, x, z` | |
| `lead` | `crowd` | new rank-1 crowd |
| `phase` | `phase` | countdown → play → over |

Rules for M1 (all numbers in `js/config.js`, tune freely):
- A neutral within a crowd's reach is pulled in and joins on contact with the disc.
- Overlapping crowds: the bigger one steals from the smaller at a rate that rises with overlap
  and size ratio. Equal sizes trade nothing. Hitting 0 = eliminated; the absorber gets a kill.
- Eliminated crowds respawn small after ~3 s at a spawn far from big crowds (protected ~2 s).
- Speed falls gently as a crowd grows, so small crowds can escape big ones.
- Pickups respawn on a timer. `double` multiplies recruits, not existing members.
- Leaders and pedestrians collide with `map.obstacles`; crowds do not (the disc may overhang).

### Game modes (M4, lane G)

`createSim({ ..., mode })` with `mode` one of `classic | teams | koth | lcs | infection` (`CONFIG.MODES` holds every
knob; `duration` defaults to the mode's). `classic` is the M1–M3 rules bit for bit (sim_test pins the stub-map hash).
Extra state the renderer and HUD may read:

```js
state.mode
state.zone = { x, z, r, holder }, state.zoneNext, state.zoneT     // koth: crown zone, the next one (last 6 s), seconds to the move
state.circle = { x, z, r, nx, nz, nr, shrinkIn, stage, tx, tz }    // lcs: safe circle now and the one it shrinks to
state.teams = [{ team, name, color, score }]                       // teams: score = sum of the side's counts
state.endReason                                                    // '' (time) | 'last' (lcs) | 'horde' (infection)
crowd.team, crowd.score, crowd.out (lcs, no respawn), crowd.horde (infection), crowd.infections, crowd.boost (teams)
```

New events: `bleed {crowd, n}` (lcs: people lost outside the circle), `infect {crowd, by}` (crowd joined the horde),
`zone {x, z, r}` (koth: the zone moved), `shrink {stage, r}` (lcs), and online only `emote {crowd, id}`. `elim.by` is
`-1` when a crowd bled out. Rank in a mode follows the mode's score (teams: team score first), so `state.leader` and
the crown follow the mode's leader.

Renderer calls lane G makes when the renderer has them (all optional, checked before each call):
`setZones([{ x, z, r, color, style: 'crown'|'next'|'safe'|'safe-next' }])`, `setTheme(id)`, `setWeather(id)`,
`updateCrowdMeta(index, meta, { from: { x, z } })`. Without `setZones` the HUD draws the rings itself with `project()`.

Bots live in `js/sim/bots.js` and drive crowds only through `setInput` — exactly what a network
player will do in M3.

## Renderer (lane R) — `js/render/renderer.js`

```js
export async function createRenderer({ canvas, map, quality }) → r
// quality: 'high' | 'medium' | 'lite'

r.setCrowds(crowdsMeta)            // [{ index, name, color }] once per match
r.frame(state, events, dt, alpha)  // draw one frame. events = this frame's drained sim events
r.setFocus(crowdIndex)             // whose crowd the camera follows
r.punch(strength)                  // camera punch-zoom, strength ~0..1 (renderer may also self-trigger from events)
r.project(x, y, z, out) → out      // world → { x, y } CSS pixels + out.visible; for DOM labels
r.groundPoint(clientX, clientY, out) → out | null   // screen → ground XZ
r.cameraYaw()                      // radians; G rotates drag input by this so "up" means "away from camera"
r.resize()                         // call on resize/orientation change
r.setQuality(q)
r.stats() → { fps, drawCalls, instances }
r.dispose()
```

Renderer responsibilities: city, ground, lighting, sky; neutrals; the cosmetic followers of every
crowd (filling the sim's `radius` disc, moving with the leader, running/idle gait, team colour,
convincing recruit and steal transitions driven by events); team glow ring; crown over the
rank-1 crowd; pickups; particles; camera (follow, zoom from crowd radius, punch, portrait and
landscape framing).

Lane G draws all text and HUD in DOM (count badges and "+N" floaters via `r.project`).

### Crowd cosmetics (R3) — optional fields on each `setCrowds` entry

Every field is optional. A missing field, or a value not in the list below, gives today's look.
The renderer parses them in `js/render/cosmetics.js` (`parseCosmetics`, and the id lists `HAT_IDS`,
`LEADER_IDS`, `EMBLEM_IDS`, `TRAIL_IDS`, `RING_IDS`).

```js
r.setCrowds([{ index, name, color,
  palette:       [0xRRGGBB, ...],   // 1–3 shirt colours mixed across the followers (two-tone crowds). Default: [color]
  hat:           'cap' | 'tophat' | 'beanie' | 'crown' | 'party' | 'cowboy' | 'hardhat' | 'headband' | 'chef' | 'wizard' | 'halo',
  hatShare:      0..1,              // share of followers wearing the hat (default 0.5); the leader always wears it
  hatLeaderOnly: false,             // true = only the leader wears it
  leader:        'caped' | 'king' | 'robot' | 'mascot',   // aliases: knight/hero → caped, astronaut → robot
  flag:          true | 'star' | 'heart' | 'bolt' | 'crown' | 'moon' | 'diamond' | 'skull' | 'paw' | 'flame' | 'sun'
                 | '<1–3 characters or an emoji>'          // drawn as a white silhouette on the cloth
                 | 'banner:<css colour>'                   // star on a cloth of that colour
                 | { emblem, color: 0xRRGGBB },            // cloth colour defaults to the team colour
  trail:         'sparkle' | 'petals' | 'dust' | 'lightning' | 'confetti' | 'hearts' | 'smoke',  // behind a moving crowd
  ring:          'solid' | 'dashed' | 'double' | 'flame' | 'pulse',
}])
```

Cost (all inside the existing draw-call budget; nothing creates a per-crowd material):
- `palette`, `ring`: free (instance data and one shader branch).
- `hat`: one instanced draw shared by every crowd, about 120 triangles per hatted figure (60 on lite).
- `leader` and `flag`: one instanced draw for all crowds, about 1.5k triangles per leader, at most 16.
- `trail`, and the embers of `flame`: these come from the shared particle pool (no extra draw), at about 12 + 2·R particles/s while moving.
  Rates are halved on lite and off-screen crowds emit nothing.

Behaviour:
- A leader variant replaces the hat on the leader and draws the leader at 2× follower size.
- A flag is held in the leader's right hand. Its pole height scales with zoom. When that crowd is rank 1, the crown sits on top of the pole, and `crownTop()` follows it.

Renderer extras added in R3:
- `stats()` also returns `hats`, `heroes`, `culled` (figures outside the view, not uploaded) and `uploadKB` (instance bytes per frame).
- It also returns `ms`: `{ update, write, other, submit }` (EMA ms of the renderer's JS stages).

### Themes, weather, zones, mid-match recolour (R4)

All optional; callers should feature-test (`if (r.setZones) ...`). Unknown ids are ignored.

```js
r.setTheme(id) → id in effect     // 'evening' (default) | 'night-neon' | 'snow' | 'sunny-day' | 'festival'
r.setWeather(id) → id in effect   // 'clear' | 'rain' | 'fog' | 'wind' | 'snow';  null/unknown = the theme's own default
r.themes() / r.weathers()          // the id lists
r.setZones(zones)                  // replaces the whole set; [] clears (zones fade out)
r.updateCrowdMeta(index, meta, { from: { x, z } }?) → bool
r.setCameraMode('showcase' | 'follow', { theme?, cycle? })
```

- **setTheme** rebuilds the city and ground for the same `generateMap` layout (obstacles, spawns, plazas and streets are
  untouched; dressing is visual only). It costs about 0.2 s on an M5 (expect 0.5–1 s on a phone), so call it before a match
  or behind a screen. Crowds, camera and zones survive it. Themes set lighting, palettes and dressing: night-neon (neon
  fascias, strip lights, blade signs, roof billboards, coloured light pools, very wet streets), snow (snow on every
  up-facing surface, trodden slush where crowds walk, string lights over every street, dark winter-coat pedestrians,
  falling snow by default), sunny-day (high sun with crisp shadows, Mediterranean palette, lamps off, window flower
  boxes, awnings everywhere, market stalls and parasols on the plazas; followers step around the stalls), festival
  (evening light, colourful facades, bunting and lanterns over every street, a festoon canopy over the central plaza,
  confetti, fireworks at the `phase: over` event).
- **setWeather** is independent of theme and cheap (no rebuild): rain (streaks, puddle ripples, wetter and darker,
  splashes under running crowds), fog (fog starts just past the player's crowd, lamp halos grow), wind (blowing leaves and
  paper, flags and banners flap harder, trees sway), snow (falling snow). The snow theme defaults to `snow`; the others to
  `clear`. Weather is one extra draw on medium/high and uses the shared particle pool on lite (no extra draw).
- **Test override:** `?theme=<id>` and/or `?weather=<id>` on the page URL win over every `setTheme`/`setWeather` call
  (a forced theme also keeps its own default weather), so the real game and the harness can be shot in any look.
- **setZones** shape: `[{ id?, x, z, r, color?: 0xRRGGBB, style, progress?: 0..1 }]`.
  `style`: `'crown'` gold rim, slow rays, soft column of light; `'capture'` like crown with a bright arc showing `progress`
  (send `progress` and include it in your change key); `'safe'` a wall of light at `r` with hazard stripes outside, and
  everything outside the circle (ground and buildings fully, figures lightly so team colours still read) desaturated and red-tinted;
  `'danger'` red hazard disc; `'next'` and `'safe-next'` dashed previews of the next crown zone / next safe circle.
  Zones are matched by `id` (default `<style><index>`), so moving or resizing one between calls glides instead of jumping;
  new zones fade in, missing ones fade out. Only the first `safe` zone tints the world. Cost: the floors ride in the ring
  draw (free); walls/columns are one draw for all zones on medium/high and are skipped on lite.
- **updateCrowdMeta** merges `meta` (any `setCrowds` field: name, color, palette, hat, leader, flag, trail, ring) into
  that crowd only. Nothing else is rebuilt and the camera does not move. A colour change runs through the crowd as a
  wave from `opts.from` (default: the crowd's leader) over about 1 s, each figure flipping with a flash and a hop; the ring
  colour blends over ~0.5 s. Late joiners and Infection both use this.
- **Showcase:** a slow continuous orbit at a lower pitch, framing the central plaza pulled toward the biggest crowds.
  `{ theme }` sets a theme; `{ cycle: true }` steps through all themes every 14 s with a short fade (each step is a rebuild).
- Also new: a crowd hidden behind a block shows a ghost of its ring and area through the building (medium/high);
  `state.crowds[i].remote` adds a pulsing inner ring to other humans' crowds; `stats()` reports `theme`, `weather`, `zones`.

## Test hooks (lane G wires, both lanes use)

- `?auto=1` player is driven by a bot · `?lite=1` cheapest quality · `?seed=N` fixed match
- `?shot=1` no menu, straight into a match, HUD hidden, for thumbnails
- `?t=N` fast-forward the sim N seconds before the first frame (R needs big crowds on screen fast)
- `window.__game = { state, sim, renderer, start(), ready, errors }`

## House rules

- No `alert/confirm/prompt`. No real ads. Popups are in-game DOM.
- Few comments; only where something would otherwise confuse.
- Do not touch anything outside `gms/3d/throng/`. Do not commit, push or deploy: the manager does.
- Other sessions work in this repo at the same time. Never run `git add -A`, `git stash`,
  `git checkout .`, `git reset` or a rebase.

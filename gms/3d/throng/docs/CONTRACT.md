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

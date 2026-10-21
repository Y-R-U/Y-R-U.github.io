# Krayzee — build contract (manager-owned)

Read `docs/BRIEF.md` (Aaron's words) and this file before anything else. Ask the manager (via your final report) before changing anything here.

## Standing rules
- Vanilla JS ES modules, NO build step. Three.js r180 vendored locally — importmap in index.html:
  `"three": "../../lib/three/0.180.0/three.module.js"`, `"three/addons/": "../../lib/three/0.180.0/addons/"`. Never a CDN.
- Site server already runs at `http://localhost:8888/` (repo root = `~/cc/yru/site`). Never start another.
  Game URL: `http://localhost:8888/gms/3d/krayzee/`.
- Headless tests: `~/.claude/bin/cdp start --port <YOUR PORT> -- --use-angle=metal` (see `cdp --help`). Raw CDP from node
  (`ws` is fine) or puppeteer-core. Call `Network.setCacheDisabled({cacheDisabled:true})` — headless Chrome serves stale ES
  modules otherwise. `cdp stop <port>` when done. Use ONLY your assigned port.
- Popups/modals are styled in-game DOM — never `alert/confirm/prompt`. Few comments: only where a reader would get it wrong.
- Mobile-first. BOTH portrait and landscape must work (test 390×844 and 844×390, plus desktop 1280×800).
  Target device: Samsung S22 Ultra. Provide quality tiers; `?lite=1` forces low.
- Agents NEVER `git commit`/`push`/`stash`/`reset`/`checkout`. Other sessions share this repo tree. Manager commits.
- Touch only files in your lane's ownership list. If you need a change elsewhere, write it in your report.
- Screenshots/evidence go under `docs/shots/<lane>/` (gitignored). Write your lane notes in `docs/<LANE>.md`.
- GPU (Qwen TTS :7876 at `http://192.168.0.236:7876`, Flux `:7867`, LTX `:7866`) — only the VOICE lane uses the GPU in phase 1.

## World frame
1 unit = 1 m, +Y up, +X east, -Z north. Heading 0 = north (-Z), 90 = east (+X). Shared airport geometry lives in
`js/world/layout.js` (manager-owned; read it, don't edit — propose changes in your report).

Aircraft local frame: **forward = -Z, up = +Y, right = +X**, origin at the centre of gravity.

## Module APIs (stubs exist; replace the internals, keep the signatures; additive extras are fine)

### `js/plane/index.js` — lane PLANE
```js
export async function createPlane(opts) // opts: { type:'c172', livery, quality:'high'|'low', cockpit:true }
// returns PlaneRig:
{
  root,            // THREE.Group, exterior, forward -Z
  cockpit,         // THREE.Group | null — interior, child of root
  eye,             // THREE.Vector3 pilot eye point in root-local space
  dims,            // { length, span, height, gearHeight }  gearHeight = CG height above ground when sitting on wheels
  setLivery(livery),
  setControls(c),  // { aileron, elevator, rudder: -1..1, throttle, flaps, brake: 0..1 }
  setView(v),      // 'cockpit' | 'chase'
  updateInstruments(s), // { airspeed (kt), altitude (ft), vsi (fpm), heading (deg), pitch, roll (rad), rpm, slip, flaps }
  update(dt),      // prop, surfaces, gauges easing
  dispose(),
}
```
Livery: `{ name, company, primary, secondary, accent, registration }` (colours `#rrggbb`). The display text is
`company || name`, **max 14 chars** (UI enforces; PLANE must lay out 1–14 chars legibly). `registration` like `K-DIRK`.

### `js/world/airport.js` — lane AIRPORT
```js
export async function buildWorld(scene, renderer, opts) // opts: { quality }
// returns:
{
  update(dt, camera),
  groundHeightAt(x, z),      // metres
  surfaceAt(x, z),           // 'runway' | 'taxiway' | 'apron' | 'grass' | 'building' | 'water'
  colliders,                 // [{ min:[x,y,z], max:[x,y,z], kind }]  axis-aligned, for buildings/tower/hangars
  sun,                       // the DirectionalLight (FLIGHT may retarget its shadow camera)
}
```
AIRPORT owns sky, fog, lighting and terrain (`js/world/*` except layout.js). FLIGHT owns the renderer, tone mapping, post.

### `js/ui/index.js` — lane UI
```js
export function initUI(hooks)  // hooks: { onPlay(mode), onSettings(settings), onProfile(profile) }
export function setLoading(fraction, label)   // 0..1
export function showMenu()     // attract screen visible behind it
export function enterGameplay() // menus away, account badge FADES out
export function openSettings()  // pause-style popup, account badge visible again inside/next to it
export function getProfile()   // { name, title, gender:'m'|'f', company, primary, secondary, accent, voice, registration }
export function getSettings()  // { view:'cockpit'|'chase', quality, sfx, voice, music, invertPitch, ... }
```
Account: shared login layer at `/lib/auth/` (read `/games/CLAUDE.md` first; see `gms/3d/heirframe/js/account.js` for a
wiring example). Non-blocking callout nudge only — never a blocking sign-in modal. gameId `krayzee`.

### `index.html`, `js/main.js`, `js/core/*`, `js/flight/*` — lane FLIGHT
Bootstrap, loop, renderer, flight model, autopilot + override, controls, cameras, in-game HUD, attract mode, test hooks
(`window.__game`, `?auto=1`, `?lite=1`, `?shot=1`, `?view=cockpit|chase`).

### `data/*`, `docs/DESIGN.md` — lane DESIGN.  `audio/voices/*`, `tools/voice/*` — lane VOICE.

## Voice roster (ids are fixed; DESIGN writes lines for them, VOICE designs them)
Pilot voices (player picks one; online = first come first served):
| id | character |
|---|---|
| toff | plummy upper-class English gentleman, braying, entitled |
| duchess | imperious elderly English grande dame |
| bubba | Southern US redneck good ol' boy |
| darlene | loud, sassy Southern US redneck woman |
| wingco | WWII-era RAF wing commander, handlebar-moustache energy |
| geezer | London Cockney wide boy |
| sheila | brash Australian larrikin woman |
| laird | gruff Scottish highland laird |
| heiress | spoilt young American heiress, vocal fry, bored |
| comte | disdainful French aristocrat |
| baronin | stern clipped German baroness |
| tex | booming Texas oil tycoon |
| nan | sweet-but-menacing Yorkshire grandma |
| prince | breathless, nervous young posh royal |
| charmer | silver-tongued Irish charmer |

Tower voices: `tower_m` (calm professional male controller, cracking), `tower_f` (calm professional female controller,
icy), `tower_trainee` (panicky junior controller). Keep the comedy affectionate — characters, not slurs.

## Lanes and CDP ports (phase 1)
| lane | owns | CDP port |
|---|---|---|
| PLANE | `js/plane/**`, `tools/plane.html`, `docs/PLANE.md` | 9411 |
| AIRPORT | `js/world/**` (not layout.js), `tools/airport.html`, `docs/AIRPORT.md` | 9421 |
| FLIGHT | `index.html`, `js/main.js`, `js/core/**`, `js/flight/**`, `css/game.css`, `docs/FLIGHT.md` | 9431 |
| UI | `js/ui/**`, `css/ui.css`, `docs/UI.md` | 9441 |
| DESIGN | `docs/DESIGN.md`, `data/**` | — |
| VOICE | `audio/voices/**`, `tools/voice/**`, `docs/VOICES.md` | — |
| ATC | `js/atc/**`, `tools/atc-sim.mjs`, `docs/ATC.md` | — (node) |
| AUDIO | `js/audio/**`, `audio/sfx/**`, `tools/audio.html`, `docs/AUDIO.md` | 9451 |
| RADIO | `js/radio/**`, `css/radio.css`, `tools/radio.html`, `docs/RADIO.md` | 9461 |
| ONLINE | `docs/ONLINE.md`, `server/**` (design + prototype only) | — |
| SCORE | `js/game/**`, `tools/score-sim.mjs`, `docs/SCORE.md` | — (node) |

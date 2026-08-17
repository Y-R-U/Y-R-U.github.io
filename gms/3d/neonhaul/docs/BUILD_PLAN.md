# NEONHAUL — build plan

Executable plan. Read `docs/MANAGER_BRIEF.md` first; it is the requirements and it wins any
conflict with this document. This file is the *how*, phase by phase. A builder agent should not
need to make a design decision that is not written here.

Everything numeric in here is a starting value, not a law of physics — but change one and say so in
the phase handoff, because several of them interlock (fog far / LOD ring radii / draw budget are
one system; damping / auto-stop / altitude hold are another).

---

## 1. Scope and shipping definition

### What "first playable" means

A build we can hand Aaron. All of the following true at once:

**Runs**
1. `https://y-r-u.github.io/gms/3d/neonhaul/` loads with no console errors on iOS Safari and
   Android Chrome, portrait **and** landscape, with safe-area insets respected.
2. 60 fps sustained on a recent iPhone at default quality; ≥ 30 fps on a mid Android at `?lite=1`.
   Measured, not guessed — `tools/budget.mjs` writes the numbers and they go in the ship handoff.
3. `?lite=1`, `?auto=1`, `?shot=<id>`, `?nosave` all work.
4. No `alert()` / `confirm()` / `prompt()` anywhere. `grep -rn "alert(\|confirm(\|prompt(" js/` is
   part of the ship gate.

**Looks**
5. All six critic shots have been scored at least once and logged in `SCORES.md`. At least four of
   six pass the gate (`ours_overall >= ref_overall - 2.0`). Any fail is recorded as a known gap
   with the critic's top fix, not silently dropped.
6. The frame is mostly black at night. Every saturated colour in frame is a light source.
7. `day_smog` reads as *daytime and still dark* — no blue sky anywhere in the build.

**Plays**
8. Boot → title → first delivery accepted within 30 s of touching the screen, first payment inside
   90 s. No tutorial wall; the first job is the tutorial.
9. A full loop works: fly → enter a zone → dock → panel with a client portrait + talking loop →
   accept → fly → dock → paid → toast → chatter line. Repeatable indefinitely.
10. Licence tier 2 reachable in ~8 minutes of ordinary play. Progression persists across reload.
11. There is no fail state. You cannot crash, die, or be stranded. Running the cell flat drops you
    to a limp speed and a free tow to the nearest CHARGE pad.

**Ships**
12. `projects.js` entry + `assets/screenshots/neonhaul.jpg` (1280×800, `?shot=hero_craft&nohud`).
13. `CLAUDE.md` written at the game root, house style (see hotwire/voidcast).
14. Staged paths only: `gms/3d/neonhaul/**`, plus our own hunk of `projects.js` and our own
    screenshot. Never `git add -A`.

### Explicitly out of scope for first playable

Multiplayer. Interiors. Weapons or combat. Any character model, rig, crowd or animation system —
see §1.1. Hand-authored districts (the city is seeded). A level editor. Cloud saves.

### 1.1 People — the hard rule, and what it buys us

Per the brief: **no character models anywhere in the 3D world.** No crowds, no pedestrians, no
figures on pads, and **no driver or passenger in the cabin**. No humanoid rig, no PolyPerfect
import, no GLB loader, no `pack.dat`, no `SkinnedMesh`, no `AnimationMixer`. **The game ships zero
3D model files.** All geometry is generated from primitives at boot, exactly as voidcast does it.
The only shipped binary art is one baked greyscale signage atlas (§3.5.1) and the client portraits
and loops (§9); every other texture is drawn into a canvas at boot.

The only person depicted is the client on the docking panel: a Flux still and an LTX talking loop,
both 2D media on a DOM surface (§9). Never geometry.

One optional in-world exception, and it is set dressing that must earn its place: **distant fabric
silhouettes** (§3.9). Never inside 140 m, never detailed, never animated beyond a drift, cut on
sight if the critic dislikes them.

**Where the freed budget goes.** A crowd system would have cost roughly 45k triangles, ~2.0 ms of
skinning and update, one texture pack, and a whole build phase. That is reallocated on purpose, and
the builder should treat these as funded line items rather than nice-to-haves:

| Reallocated to | Cost | Why |
|---|---|---|
| Reflect **three** emissive buckets — signs, strips, strobes (§3.7) | +2 draws, ~16k tris, **~1.1 ms** | The wet-ground double is the single most expensive-looking cheap trick we have. It is fill-bound, not geometry-bound; see §3.7(c) for the real price. |
| MSAA 2× on the composer target (§2.3, N3) | +0.4 ms | The default framebuffer's MSAA is unused once everything goes through the composer. Thin bright neon lines on black is the worst case for aliasing crawl, which is a "Finish" killer. |
| Env map 128² and 12 re-bakes per in-game day, not 64²/4 | +0.3 ms amortised | Glass towers and black bodywork live or die on the reflection |
| Grade pass gains ACES + blue-noise dither + split-tone (§4.6) | +0.35 ms total | Tone mapping *has* to live here (§4.6); banding in dark gradients is the #1 "Finish" score killer |
| Light shafts, **4** cards with depth-fade and a view-dot cull (§4.5) | **+0.55 ms** | The daytime variant has almost nothing else going on |
| +900 sign and +400 strip instances in the near ring (§3.5) | +0.3 ms | Density is what sells the megacity |

*(An earlier draft credited "+0.8 ms for bloom at half res instead of quarter". That is not an
option: `UnrealBloomPass.setSize()` does `Math.round(width / 2)` unconditionally — verified in
three@0.160.0's `examples/jsm/postprocessing/UnrealBloomPass.js:184` — so half res is the default and
quarter would require subclassing `setSize`. The line is removed rather than reworded.)*

And one structural win: with no art pipeline there is no import phase, no asset-protection scheme,
and no license risk. That is a whole phase removed from §13.

**Consequence for the cockpit.** §8 specifies an interior with no occupant. No hands on a yoke, no
body, no seat back in frame. Nothing in §6 (flight) or §8 (camera) may assume a visible body — the
camera is a point behind the glass, and the player's presence is implied by the frame, the
instrument glow and the voice on the radio. Checked at the P6 critic round.

**Consequence for the radio.** With people absent from the world, §10 and §11 carry the entire
sense of a populated city. They are weighted accordingly and the synth layer includes a procedural
"traffic net" bed so the city is never dead even before a single SUNO file exists.

---

## 2. Architecture

### 2.1 File tree

```
gms/3d/neonhaul/
  index.html                 all screens as static markup, hidden by class
  style.css                  one file, mobile-first, safe-area aware
  .gitignore                 shots/  critique/  tools/__pycache__/  *.log
  CLAUDE.md                  written in P10
  SCORES.md                  critic round log
  docs/
    MANAGER_BRIEF.md         requirements (exists)
    DECISIONS.md             settled manager calls — binding, and they win over this file
    BUILD_PLAN.md            this file
    PLAN_REVIEW.md           the review this revision answers
    REVISION_NOTES.md        what changed in this revision and why
    SUNO.md                  every SUNO prompt, copy-paste ready (§11 points here)
  data/
    districts.json           8 district defs
    landmarks.json           the authored core — 8 hand-placed landmarks (§3.1.1)
    names.json               district, pad and street display names (§3.1.2)
    clients.json             16 client records (drives tools/gen_clients.py)
    signs.json               baked sign atlas region table (written by tools/bake_signs.mjs)
    signwords.json           the English / Japanese / optional-Korean word lists (bake input)
  assets/
    signs.png                baked greyscale signage atlas, 2048², ≤ 400 KB      (§3.5)
    clients/                 <id>.jpg  <id>_thumb.jpg  <id>.mp4      (~3.2 MB, §9)
    audio/
      manifest.json          named SUNO slots, §10.3
      music/.gitkeep         Aaron drops files here
      chatter/.gitkeep
  shots/
    *.json                   shot scenario definitions — COMMITTED
    *.png                    renders — gitignored
  tools/
    shot.mjs                 headless CDP renderer + perf snapshot
    compare.mjs              blind side-by-side sheet builder
                             (answer keys go to ~/.cache/neonhaul-keys/, OUTSIDE the repo — §12.4)
    budget.mjs               draw call / triangle / frame-time gate
    soak.mjs                 long ?auto=1 run, samples __state
    bake_signs.mjs           OFFLINE signage atlas baker → assets/signs.png + data/signs.json
    signbake.html            the page bake_signs.mjs drives; also openable by hand to eyeball the atlas
    gen_clients.py           Flux + LTX client media generator
    split_chatter.py         silence-splits a SUNO chatter track into named slots
  js/                        28 modules, below
```

### 2.2 Modules

Every module takes what it needs as constructor arguments. Nothing imports the `Game` object;
that would create cycles and make the shot harness impossible.

| Module | Responsibility (one line) |
|---|---|
| `config.js` | Every tuning number, the two quality presets, and URL-flag parsing. |
| `utils.js` | xorshift32 rng, `hash2i`, clamp/lerp/damp/easing, a spatial-hash `Grid`, a `Pool`. |
| `save.js` | localStorage profile (`neonhaul.save.v1`): credits, tier, craft, upgrades, settings. |
| `atlas.js` | Generates the window / ground / droplet / halo / silhouette canvases at boot, and loads the **baked** `assets/signs.png` + `data/signs.json`. |
| `materials.js` | The shared material set plus the three `onBeforeCompile` patches (height fog, instanced UV+emissive attributes, fresnel rim). |
| `sky.js` | The five day variants, the clock, the blend, the sky dome, the env-map bake, light shafts. |
| `districts.js` | District table: palette, height band, density, signage rate, licence gate. |
| `city.js` | The chunk grid — deterministic descriptor generation, the authored-core lookup and keep-out, district assignment, lane and zone placement, the collision AABB store. |
| `blocks.js` | The 8 building prototype geometries plus the LOD1 and LOD2 geometries. |
| `render_city.js` | The three instanced LOD fields, slot allocation, chunk↔LOD migration, strip/antenna fields. |
| `signage.js` | The two sign instanced meshes (neon / lightbox), the five placement layers, atlas region selection, and the hero holo-billboard canvases with their 8 fps updater. |
| `weather.js` | GPU rain field, wind, lightning, windscreen droplets. |
| `reflect.js` | The mirrored emissive group, the wet-ground plane, the ripple scroll. |
| `craft.js` | The shared hull curve generator, the 9 vehicle defs, the shared light rig, thrusters. |
| `flight.js` | Thrust, damping, auto-stop, altitude hold, cosmetic auto-level, collision softening. |
| `controls.js` | Touch halves, floating stick, look drag, ALT buttons, side flip, desktop keyboard/mouse. |
| `camera.js` | Chase and cockpit cameras, speed FOV kick, shake, the dock ease-in. |
| `traffic.js` | Lane splines, near real craft, far instanced streaks, police craft. |
| `zones.js` | Dock zone volumes, proximity test, the dock/undock state machine, world markers. |
| `missions.js` | Job generation and selection, acceptance, tracking, payment, time and chain bonuses. **No heat system — see `docs/DECISIONS.md` decision 6.** |
| `economy.js` | Credits, licence tiers, the craft/upgrade shop, prices. |
| `dock.js` | The docking panel DOM — build, media, deal, haggle, accept/decline, animation. |
| `hud.js` | Cockpit mesh, dash canvas, holo panels, toasts, the chatter popup. |
| `minimap.js` | The circular 2D-canvas minimap and its rear arc. |
| `ui.js` | Title, settings, pause, help, shop, job board — every non-dock screen. Never alerts. |
| `audio.js` | The Web Audio synth graph (thruster, dock, pay, scrape, siren, rain, UI, traffic net). |
| `radio.js` | SUNO manifest loader, slot pools, the radio bus, ducking, chatter direction, read-time rule. |
| `main.js` | Boot, renderer, composer, the quality guard, the master loop, `__state`/`__game`, shot scenarios. |

### 2.3 Three.js and the importmap

Match the siblings exactly. Both hotwire and voidcast pin **0.160.0** from jsdelivr, and 68 of the
70 `gms/3d/*` games in this repo use that same line. Do not "upgrade" — `three@0.180` is used by
exactly one game (prismbreak) and there is no reason to be the second.

```html
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
} }
</script>
```

Addons used: `postprocessing/EffectComposer.js`, `RenderPass.js`, `UnrealBloomPass.js`,
`ShaderPass.js`, and `utils/BufferGeometryUtils.js` (`mergeGeometries`). That is the same set
`opus5_ironhail/js/render.js` uses, so the pattern is proven in this repo.

Renderer setup, copied from the house pattern:

```js
renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;   // ACES lives in the grade pass — see §4.6 and below
renderer.shadowMap.enabled = false;           // see §4.3 — we cast no shadows at all
renderer.info.autoReset = false;              // budget.mjs reads renderer.info
```

**`antialias` is deliberately absent.** It only affects the *default framebuffer*, and nothing is
ever drawn there — every scene render goes into an `EffectComposer` render target. MSAA has to be
asked for on that target instead:

```js
const rt = new THREE.WebGLRenderTarget(w * dpr, h * dpr, {
  type: THREE.HalfFloatType,        // EffectComposer's own default; state it so nobody "fixes" it
  samples: Q.msaa                   // HIGH 2, LOW 0
});
composer = new THREE.EffectComposer(renderer, rt);
```

`samples` is a real `WebGLRenderTarget` option in this version (verified: `three.module.js:2965`,
`this.samples = options.samples`) and multisampled targets work on WebGL2, which is what r160 uses
whenever the context supports it. `HalfFloatType` is what `EffectComposer` would have chosen anyway
(verified: `EffectComposer.js:27`) — it is written out here because a builder who hands the composer
a default `UnsignedByteType` target clips everything above 1.0 and bloom stops working entirely.

**`renderer.info.reset()` is called at the top of every frame, before `composer.render()`.**
`autoReset = false` is correct — the composer issues several render calls and we want one frame's
total — but without an explicit reset the counters climb monotonically forever and `__state.draws`,
`__state.tris` and every `budget.mjs` gate become meaningless.

**Tone mapping is not set on the renderer, and this is not a style choice.** In r160
`WebGLRenderer` computes the material's tone-mapping define as:

```js
let toneMapping = NoToneMapping;
if ( material.toneMapped ) {
  if ( _currentRenderTarget === null || _currentRenderTarget.isXRRenderTarget === true ) {
    toneMapping = _this.toneMapping;
  }
}
```

(verified verbatim at `three.module.js:30147–30155`). `_currentRenderTarget` is never `null` for us,
so setting `renderer.toneMapping = ACESFilmicToneMapping` would have **no effect whatsoever** — the
game would ship a linear frame with clipped neon and no filmic shoulder. That is also why
`OutputPass` exists and applies ACES itself. We are replacing `OutputPass` with our own grade pass,
so the grade pass must carry ACES. See §4.6.

Exposure moves with it: `renderer.toneMappingExposure` is only read by the renderer's own tone-map
define and by `OutputPass`, so under `NoToneMapping` it is inert. **Exposure is a `uToneExposure`
uniform on the grade pass**, driven by `sky.js` per day variant.

**Every `onBeforeCompile` patch must fail loudly.** `String.replace()` on a substring that is not
present is a silent no-op, so a renamed shader chunk on a future three.js bump deletes a visual
effect without any error. Every patch goes through one helper:

```js
function patch(src, find, replace, what) {
  if (src.indexOf(find) === -1) { console.warn('[neonhaul] shader patch MISSED:', what, '→', find); return src; }
  return src.replace(find, replace);
}
```

`__state.errors` collects these warnings too, so `budget.mjs` and `shot.mjs` fail the phase rather
than shipping a city with no fog.

### 2.4 Where state lives

Four buckets, no others.

1. **Persistent** — `save.js`. One object behind an `S()` accessor, written on a 2 s debounce.
   `?nosave` makes every write a no-op. The save stores a *seed*, never world data.
2. **World** — never stored, never mutated. Derived on demand from `WORLD_SEED` (in `config.js`,
   overridable with `?seed=`) and `hash2i(chunkX, chunkZ, salt)`. The same seed always produces the
   same city; asserted by a node hash test in P2. This is what makes a shot reproducible and a
   mission destination stable across a reload.
3. **Session** — a single `Game` object created in `main.js`, holding `player`, `city`, `zones`,
   `missions`, `economy`, `radio`. Passed down; never imported.
4. **Render** — owned privately by `render_city.js`, `reflect.js` and `materials.js`. Nothing else
   touches an instance buffer. If a system wants a building moved, it does not exist — buildings
   never move.

### 2.5 Quality tier

`config.js` exports one function:

```js
export function preset(low) { return low ? LOW : HIGH; }
```

Each preset is a flat object. Every module receives it as `Q` at construction and never re-reads
it, so a mid-session quality change means a rebuild, not a scatter of `if (low)` checks.

| key | HIGH | LOW (`?lite=1`) |
|---|---|---|
| `pixelRatio` | 2.0 | 1.25 |
| `msaa` | 2 (on the composer target, §2.3) | 0 |
| `bloom` | true (half-res, input clamped, §4.4) | **false** → halo sprites instead (§4.4) |
| `halos` | false | true, **capped** (400 signs / 500 strips / 300 strobes, 1.8× scale) |
| `grade` | true | true (never dropped — ACES and the dither are both load-bearing) |
| `ringNear` | 2 (5×5 chunks, **conservative radius 512 m**) | 1 (3×3, **radius 256 m**) |
| `ringMid` | 6 (13×13) | 4 (9×9) |
| `ringFar` | 4 far-chunks (9×9 @ 1024 m) | 0 (off) |
| `fogFar` | 900 m | **420 m** (not 520 — forced by the §3.2 interlock rule) |
| `rain` | 2500 instances | 900 |
| `trafficNear` | 26 real craft | 10 |
| `trafficFar` | 900 streaks | 320 |
| `reflect` | full (4 buckets) | signs + strips only |
| `signDensity` | 1.0 | 0.55 |
| `silhouettes` | true | false |
| `envSize` | 128 | 64 |
| `atlasSize` (window atlas only) | 1024 | 512 |
| `dashFps` | 12 | 6 |
| `holoFps` | 4 | 2 |
| `minimapFps` | 15 | 8 |
| `shafts` | **4** | **1** |
| `zonesDrawn` | nearest **3** (the rest fade to a marker) | nearest 2 |

Selection order in `main.js`: `?lite=1` forces LOW; otherwise the saved setting
(`auto`/`high`/`low`); `auto` picks LOW when `navigator.hardwareConcurrency <= 4`. Then the
**fps guard** — copy `voidcast/js/main.js:guardQuality()` verbatim in shape: a rolling 1 s fps
average, and if it sits below 26 fps and the user did not explicitly pick `high`, drop bloom, drop
`ringFar`, set pixelRatio 1.15, and toast *"Graphics lowered to keep it smooth"*. The guard is
disabled when `?shot` is present, or every thumbnail would be a lite render.

### 2.6 URL params

| param | effect |
|---|---|
| `?lite=1` | force the LOW preset |
| `?shot=<id>` | render a named shot scenario: fixed camera, seed, clock and variant; sets `window.__ready = true` when the scene has been drawn 3 times |
| `?auto=1` | autopilot soak — flies a lane circuit, docks, accepts, delivers, forever |
| `?nosave` | never touch localStorage |
| `?seed=<n>` | override `WORLD_SEED` |
| `?time=<0..24>` | force the clock and stop it advancing |
| `?var=<name>` | force a day variant (`deepnight predawn daysmog duskburn stormnight`) |
| `?tier=<n>` | start at licence tier n |
| `?crd=<n>` | start credits |
| `?dock=<zoneId>` | boot straight into a docking panel (for UI work without flying) |
| `?nohud` | hide every HUD layer including the cockpit mesh — clean plates |
| `?perf` | perf overlay: draw calls, triangles, ms breakdown, chunk queue depth |
| `?dpr=<n>` | force pixel ratio |

`?shot=1` (the literal value in the brief) is accepted as an alias for `?shot=hero_craft`.

**`?auto=1` — what the autopilot actually does.** It is required from P0, gated in P4, and driven by
`soak.mjs` and `budget.mjs`, so it needs a specification rather than "flies a lane circuit". It is a
state machine over the *public* game API, never a special code path inside `flight.js` — it presses
the same buttons a player would, which is what makes it a test:

```
IDLE      → pick the nearest job on the board, accept it
TRANSIT   → steer toward the target zone using the same stick vector the touch layer produces:
            heading = bearing to target, throttle = 1.0 above 120 m of range and
            ramping to 0 inside it; altitude buttons held toward the target's altitude ± 25 m
ARRIVE    → inside the cylinder, release everything and let §6.2's auto-stop do the work
DOCK      → wait for the panel, ACCEPT (or the delivery confirm), UNDOCK after 1.2 s
REFUEL    → whenever cell < 25 %, retarget the nearest CHARGE pad, buy a full refill
REPEAT    → forever
```

Two rules that make it useful as a harness rather than a demo: it must **never** call
`__game.teleport()` or bypass collision, and it must log a `stuck` event to `__state.errors` if its
distance-to-target has not decreased for 20 s — which is how a soak reports a wall it cannot get
around instead of quietly grinding against one for ten minutes.

### 2.7 Test hooks

`window.__state` — a read-only getter returning `{ fps, ms:{sim,gen,render,post}, draws, tris,
mode, variant, clock, player:{x,y,z,alt,speed,heading,cell,cargo}, city:{chunks,queued,lod0,lod1,
lod2}, zone, dock, job, credits, tier, lifetime, errors:[] }`.

There is no `heat` field. `lifetime` is lifetime gross credits, which is what drives the licence
ladder (§7.4) and what P7 asserts against.

`window.__game` — `{ scene, camera, renderer, quality, teleport(x,y,z), setVariant(n),
forceDock(id), grantCredits(n), completeJob(), setQuality(q), scenarios }`.

`window.__ready` — set true once the first three frames are drawn. Every headless tool waits on it.

### 2.8 Platform lifecycle

Seven things, none of them interesting, every one of them a shipped-game failure if omitted. They
are about forty lines of code in total and they are **P0 scope**, not polish. Each names the sibling
file to copy from, because every one of these has already been solved in this repo.

| Thing | What happens without it | Copy from |
|---|---|---|
| **AudioContext unlock** on the first pointer/key event | **No sound at all on iOS**, ever. §10 and §11 carry the entire sense of a populated city (§1.1) and the whole layer is inert. | `voidcast/js/audio.js:23` — `resumeAudio()`, called from the first `pointerdown`, `keydown` and `touchstart`, and again on `visibilitychange → visible` |
| **`visibilitychange`** | Backgrounding leaves the clock, `?auto=1`, the chatter director and the audio graph running. Returning produces one enormous `dt` and a teleporting craft. | `foulplay/js/save.js:135`, `firstfolk/js/main.js:459`. Park the loop, flush the save, suspend the audio graph; on return clamp `dt` to 0.05 s for the first frame and resume. |
| **`webglcontextlost` / `webglcontextrestored`** | Common on mobile after backgrounding; the game becomes a black canvas with no message. | `foulplay/js/render.js:483`. Three hard-won rules from `waterline/HANDOFF_P4.md:25–48`: (1) `e.preventDefault()` in the lost handler or the browser will never restore; (2) take `WEBGL_lose_context` in the **constructor**, while the context is alive — fetching it after the loss always yields `null`; (3) `restoreContext()` called synchronously from inside the lost listener is a silent no-op — defer it 400 ms. Park the render loop while lost. On restore, re-run `onResize()` and re-bake the env map. |
| **`resize` / `orientationchange`** | The brief requires portrait **and** landscape. `composer.setSize()` must be called too, not just `camera.aspect` — the render targets and `UnrealBloomPass`'s five internal mip chains are sized independently of the canvas. | `voidcast/js/main.js:69–70` — `orientationchange` → `setTimeout(resize, 120)`, because iOS reports the old size synchronously |
| **`touch-action: none; user-select: none; overscroll-behavior: none`** on `html, body, #stage` and the canvas | Double-tap zoom, rubber-band scroll, text selection on drag. §6.1 uses **double-tap-and-hold** for boost, so the zoom bug is not a risk here, it is a certainty. | `voidcast/style.css:25`, `hotwire/style.css:5` |
| **`window.addEventListener('error')` and `'unhandledrejection'`** → `__state.errors` | `__state.errors[]` is specified in §2.7 but nothing populates it, so the harness's error reporting is decorative and a black frame explains nothing. | `firstfolk/js/main.js:23`, `towered/js/main.js:24`, `whoami/js/main.js:25`. Also catches the §2.3 shader-patch warnings. |
| **Save guard and version migration** | One corrupt `localStorage` entry bricks the game with no recovery. | `hotwire/js/save.js:34`. `try { JSON.parse } catch { fall back to defaults }`; a `v` field; an unknown `v` is discarded rather than merged. `?nosave` bypasses the whole path. |

**P0 done-criteria additions**: `__state.errors` is populated by a deliberately thrown test error;
`document.hidden` toggling in CDP parks and resumes the loop with no `dt` spike; the CDP harness
loses and restores the WebGL context via `WEBGL_lose_context` and the page recovers without a
reload; a rotation between portrait and landscape resizes the composer (assert
`composer.renderTarget1.width` changed).

---

## 3. The city

### 3.0 The one idea

`746850_01` is the proof and the whole rendering plan comes out of it. Look at what is actually in
that frame: eight or nine near-black boxy masses with almost no surface modelling, a mid-grey fog
that swallows everything past ~30 % of the depth, and *emissive rectangles* — window grids, edge
strips, one yellow blade sign reading HOTEL. That is it. There is no material detail, no ambient
occlusion you can see, no geometry above the level of a box with a notch cut in it. The image reads
as an enormous city because of three things and only three:

1. **Fog with a gradient**, so silhouettes stack in front of each other at four or five separable
   depths.
2. **Emissive density that falls off with distance** — near towers show individual windows, far ones
   show a smear of coloured pixels.
3. **A consistent window pitch**, which the eye uses as a ruler.

`746850_08` and `746850_03` are the same trick at higher density with signage added.
`1939970_00` adds one hero element in the foreground (the black car, the ICARUS sign) against
exactly that background.

So: **spend nothing on building geometry, everything on emissive, fog and reflection.** That is not
a compromise forced by mobile — it is what the reference actually does.

### 3.1 Chunk and district scheme

The city is unbounded and deterministic in every direction, **around a small authored core**. That
is `DECISIONS.md` decision 3 and it is binding: seeded-infinite generation is the substrate and
covers everything beyond the core, and 6–10 hand-placed landmarks across 2–3 named districts give
the skyline a designed silhouette and give the minimap something to mean. There is no world edge;
there *is* a map file, and it is 8 rows of data (§3.1.1).

- **Near/mid chunk grid**: 256 m × 256 m in XZ, unbounded in Y.
- **Far chunk grid**: 1024 m × 1024 m (exactly 4×4 near chunks).
- A chunk's contents come from `hash2i(cx, cz, WORLD_SEED)` seeding an xorshift32. Generating the
  same chunk twice always gives the same buildings — no chunk state is ever stored.
- **Districts** are a low-frequency field, not a partition: `districtAt(cx,cz)` samples a value-noise
  field with a 6-chunk wavelength and quantises to 8 ids. This gives organic, irregular district
  shapes with zero data.

`data/districts.json`, 8 entries:

| id | name | heightBand (m) | density | palette (window/sign tint bias) | licence tier |
|---|---|---|---|---|---|
| `spine` | The Spine | 220–520 | 0.95 | ice white / cyan | 1 |
| `ribs` | The Ribs | 90–260 | 1.00 | amber / sodium orange | 1 |
| `vault` | Vault Row | 260–620 | 0.70 | cold cyan / ice | 2 |
| `soot` | Sootfields | 50–150 | 0.85 | sodium / blood red | 2 |
| `lantern` | Lantern Quarter | 70–200 | 1.00 | magenta / hot pink | 3 |
| `cradle` | The Cradle | 120–300 | 0.80 | green / cyan | 4 |
| `pale` | Pale Terrace | 300–700 | 0.55 | ice white only | 5 |
| `drown` | The Drownings | 30–110 | 0.90 | blood red / green | 6 |

`density` scales buildings per chunk (base 28). `heightBand` is sampled with a `pow(u, 2.2)` bias so
tall buildings are rare and the skyline has real peaks.

Licence tier gates *jobs*, not airspace — you can fly anywhere from minute one, which is the point of
a flying game. What a low tier cannot do is get paid there.

**District override in the core.** `districtAt(cx,cz)` is a noise field everywhere *except* inside
the three named core districts (§3.1.1), whose chunk rectangles are read from `data/landmarks.json`
and win over the field. Outside those rectangles the field is untouched, so the join is organic and
costs one rectangle test per chunk.

#### 3.1.1 The authored core — `data/landmarks.json`

Eight landmarks across three named districts, positioned at fixed chunk coordinates around the
player's start. **They are authored as data, not as bespoke meshes**: every one is an existing §3.3
prototype at a larger scale with hand-chosen signage and a palette override, so the marginal cost is
eight rows in a JSON file and zero new geometry, zero new materials, zero new draw calls.

```json
{ "districts": [
    { "id": "spine",   "name": "The Spine",       "rect": [-3, -3, 3, 3] },
    { "id": "ribs",    "name": "The Ribs",        "rect": [-8, -3, -4, 4] },
    { "id": "lantern", "name": "Lantern Quarter", "rect": [ 4, -4, 9, 3] } ],
  "landmarks": [
    { "id": "spindle",  "chunk": [ 0,  0], "off": [ 40,  30], "proto": "spire",
      "scale": [ 74, 640, 74], "radius": 190, "palette": "ice",
      "signage": ["hero_00","board_en:HAUL CONTROL"], "name": "The Spindle" }
  ] }
```

| id | district | proto | footprint × height | why it exists |
|---|---|---|---|---|
| `spindle` | The Spine | `spire` | 74 × 74 × **640 m** | The one silhouette you can see from anywhere. The HUB pad sits on its 92 m podium deck. |
| `hollow` | The Spine | `bridged` | 2 × 58 × **430 m**, bridge at 240 m | You fly *through* it. The sky bridge is the first "this city is enormous" moment. |
| `kiln` | The Spine | `drum` | ⌀ 96 × **300 m** | Breaks the box rhythm right next to the start. Sodium-lit, the only warm mass in a cold district. |
| `sever` | The Ribs | `terrace` | 120 × 80 × **310 m** | A sheer 310 m wall on one side, stepped on the other. The canyon south of it is the `canyon_dive` shot. |
| `ladder` | The Ribs | `stack` | 62 × 62 × **380 m**, ledges every 48 m | The scale ruler made literal (§3.10 #7). |
| `pennant` | Lantern Quarter | `spire` | 48 × 48 × **520 m** | Carries three of the twelve hero billboards (§3.5.5 L5). Magenta. |
| `market` | Lantern Quarter | `podium` | 180 × 140 × **160 m** | The signage showcase — a 3-storey base with every podium face flagged commercial. |
| `ninefold` | Lantern Quarter | `taper` | 90 × 90 × **470 m** | Closes the eastern skyline so the Quarter reads as a district and not a patch. |

Eight is inside decision 3's "6–10". Combined they are ~3,100 extra triangles — one LOD0 prototype's
worth — because they are the same eight prototypes at a different instance matrix.

**The keep-out rule, and it is a hard rule.** A chunk that contains or touches a landmark generates
at `density × 0.4`, and **no seeded building may be placed whose footprint intersects a circle of
`landmark.radius` around the landmark's world position**. Rejected placements are not retried
elsewhere — they are simply dropped, so the keep-out reads as a plaza rather than a crowd pushed to
the edges. Same rule for zone pads and traffic lane nodes.

**Lookup order in `city.js`, and nothing may reorder it:**

```
generateChunk(cx, cz):
  1. landmarksIn(cx, cz)            // from data/landmarks.json, an 8-entry table
  2. districtAt(cx, cz)             // core rectangles win over the noise field
  3. seeded field at density × (landmarks present ? 0.4 : 1.0)
  4. reject any placement inside a keep-out circle
  5. zones, lanes, signage — all subject to (4)
```

Consulting the landmark table *before* the seeded field is what makes the whole thing free: the
seeded pass already rejects overlapping footprints, so keep-out is one more circle test in a loop
that is already doing rectangle tests. **This is a P2 dependency and it must be in P2's brief.**

**Spawn** (this is the gap N9 names, and it is closed here). The player starts on the `spindle`
podium deck at world `(40, 92, 30)` — the HUB pad — facing **bearing 118°** so the Lantern Quarter's
signage is in the opening frame and the `hollow` sky bridge is in the left third. Starting craft
`wisp`, starting credits **250 CRD**, cell full, licence tier 1, no cargo. `?seed=` changes the
seeded field around the core; it never moves the core, because `data/landmarks.json` is not seeded.
That is deliberate: the shot cameras (§12.1) must frame the same landmarks every round.

#### 3.1.2 Names — `data/names.json`

The dock panel, dash, minimap, holo panels and chatter all print pad and district names, and there
is currently no table for them. One file, three lists, no code:

- **Districts** — the eight `name` fields already in §3.1's table, plus the three core names above.
- **Pads** — 40 names in a flat array, assigned to a pad by `hash2i(cx, cz, PAD_SALT) % 40`, so a
  pad's name is stable across reloads without storing anything. *Kell's Rest, Ardent Deck, Vane
  Street Upper, Tallow Yard, Sixteen Low, The Gantry, Ninefold Approach, Cinder Step, …*
- **Streets and corridors** — 24 names for the chatter and the minimap's canyon labels. *Vane
  Street, the Understack, Ardent Corridor, Lanes Four Through Nine, …*

The three names the existing chatter already uses — **Kell's Rest**, **Ardent**, **Vane Street** —
are pinned to fixed pads inside the core so the radio and the world agree. Kell's Rest is a **Ribs**
pad; it is also the destination in §7.3's panel mock, and The Ribs is a tier-1 district, which is
what makes that mock a legal first job.

### 3.2 Three LODs, and why not per-chunk instancing

The obvious scheme — one `InstancedMesh` per chunk per material — is wrong here. With 25 near
chunks × 4 material classes you are at 100 draw calls before a single sign, and you have paid a
per-chunk uniform upload for the privilege. Because every building shares one atlas and one
material, we can do the opposite: **a small number of very large global instanced meshes, with
chunks owning slot ranges inside them.**

| Field | Geometry | Instances (HIGH) | Draws | Tris |
|---|---|---|---|---|
| LOD0 building shells | 8 prototypes, 140–240 tris each | ~750 | 8 | ~135k |
| LOD1 building shells | 1 box, 12 tris | ~2000 | 1 | 24k |
| LOD2 far towers | 1 box, 12 tris | ~460 | 1 | 5.5k |
| Signs — neon tubes (`signsNeon`) | quad, 2 tris | 640 | 1 | 1.3k |
| Signs — lightboxes (`signsBox`) | same quad, normal blend | 260 | 1 | 0.5k |
| Hero holo billboards | quad, 2 tris | 12 | 1 | — |
| Edge / roof strips | thin box, 12 tris | 1200 | 1 | 14k |
| Warning strobes | quad, 2 tris | 700 | 1 | 1.4k |
| Antennae, masts, sky bridges | 3 protos merged into 1 | 300 | 1 | 9k |
| Distant silhouettes (optional) | cross-quad, 4 tris | ≤ 120 | 1 | 0.5k |

**Bands** (`Q.ringNear/ringMid/ringFar`). Note the radii carefully — an earlier draft quoted LOD0 as
"1280 m", which is the **full width** of the 5×5 ring, and LOD1 as "1664 m", which is a half-width.
Only one number matters and it is the **conservative radius**: the camera can sit at the far edge of
its own chunk, so the nearest point of the boundary is `ringNear × 256`, not `(ringNear + 0.5) × 256`.

- **LOD0** — near chunk ring radius 2 → 5×5 = 25 chunks. **Conservative radius `R₀ = 512 m`**
  (centred best case 640 m, far corner 905 m). Every building in the chunk. Full prototype geometry,
  full window atlas, signs, strips, collision AABBs.
- **LOD1** — near-grid ring radius 3..6 → 13×13 − 5×5 = 144 chunks. Conservative radius `R₁ = 768 m`
  out to 1,536 m. Only the tallest 40 % of each chunk's buildings (~14 of 28). One box each, same
  shell material, **same window atlas cell and the same 3.6 m / 3.2 m UV pitch as LOD0**. No signs,
  no strips, no collision.
- **LOD2** — far grid ring radius 4 → 9×9 = 81 far chunks minus the central 4 already covered, out to
  ~4600 m. Six towers per far chunk, taken from the *top* of the height distribution, one box each,
  unlit material with a low-frequency emissive speckle. This is the fog-swallowed skyline and it is
  ~460 boxes doing the work of ten thousand buildings.

> **The LOD1 window pitch is not halved.** An earlier draft said "window UV tiling halved" at LOD1.
> That is both the loudest half of the LOD0→LOD1 pop *and* a direct breach of §3.4's pitch rule and
> §3.10 #1 — the window pitch is the game's primary scale cue and it is the same 3.6 m everywhere,
> in every LOD, with no exceptions. Halving it makes the same tower change apparent size the moment
> it crosses the band. Delete the idea; it saves nothing (`iUvScale` is already per-instance).

#### 3.2.1 Fog, draw distance and LOD are one system — the interlock rule

**`fogNear`, `fogFar`, `uClearMul`, `uSmogMul` and `ringNear` are one system. Changing any one of
them requires recomputing the other four, and `budget.mjs` checks the result from `config.js` alone
with no rendering.** This subsection exists because the first draft's numbers did not interlock and
the failure was a city-wide LOD pop in the exact band where `fog_city` is framed.

Define the **effective visibility** `V(k)` — the distance at which fog is fully opaque — from §4.2's
corrected height-fog form, which scales the fog *distance* rather than multiplying the fog *factor*:

```
V(k) = fogNear + (fogFar − fogNear) / k
```

and the **residual visibility** at a distance `d`, using three.js's actual linear-fog chunk, which
is a `smoothstep` and not a lerp (verified: `three.module.js:13910`, `fog_fragment`):

```
vis(d) = 1 − smoothstep(fogNear, V, d)
```

Two constraints:

- **C1 — nothing pops.** `vis(R₀) ≤ 0.45`. Whatever residual visibility is left at the LOD0
  boundary is absorbed by the cross-fade below; more than 45 % and the cross-fade band has to be so
  wide it becomes its own artefact.
- **C2 — the far skyline still exists.** `V(uClearMul) ≥ 700 m` in the night variants, or `fog_city`
  has no depth left to band and §3.0's entire mechanism is gone.

Solving C1 at `R₀ = 512, fogNear = 60`: `vis = 0.45` needs `smoothstep = 0.55`, i.e. `t = 0.534`, so
`V ≤ 60 + 452/0.534 = 907 m`. With `fogFar = 900` that gives `uClearMul ≥ 840/847 = 0.99`.

**So `uClearMul = 1.0` and the clean-air multiplier disappears entirely.** The first draft's 0.45
was the whole bug: at 0.45 the clean-air visibility is `60 + 840/0.45 = 1,927 m`, nearly four times
the LOD0 radius, and the swap happens at 81 % visibility in plain sight. Worse, under the *old*
multiply-the-factor form it was not even 1,927 m — `clamp(smoothstep(…) × 0.45, 0, 1)` saturates at
**0.45 and never reaches 1.0 at any distance**, so above 260 m fog culled nothing, ever, and §3.6's
"beyond ~900 m the fog takes it entirely" and this section's "culling is done by the band scheme and
by fog" were both false above `uClearY`.

Final numbers, and the check:

| | value | |
|---|---|---|
| `uSmogMul` | **2.2** (unchanged) | `V(2.2) = 60 + 840/2.2 = ` **442 m** in the murk |
| `uClearMul` | **1.0** (was 0.45) | `V(1.0) = ` **900 m** in clean air |
| ratio | **2.04×** | this is what paints the band across the skyline |

The tower-top clarity the first draft wanted is still there — it is delivered by the murk being
2.2× thicker, not by clean air being thinner than base. Worked example at 400 m depth: in the murk
`smoothstep(60, 442, 400) = 0.966`; in clean air `smoothstep(60, 900, 400) = 0.359`. **97 % fogged
below the band, 36 % above it** — a huge, obvious horizontal line across every tower, which is
exactly §3.10 #5 and exactly `746850_03`.

Per-variant check of C1 (`vis(R₀)` must be ≤ 0.45):

| variant | fogNear | fogFar | `V(clear)` | `vis(512)` | |
|---|---|---|---|---|---|
| `deepnight` / `predawn` | 60 | 900 | 900 | **0.443** | ✓ (the binding case) |
| `duskburn` | 60 | 760 | 760 | 0.288 | ✓ |
| `stormnight` | 45 | 560 | 560 | 0.024 | ✓ (`fog_city` is this variant) |
| `daysmog` | 60 | 520 | 520 | 0.001 | ✓ |
| **LOW**, any variant | 60 | **420** | 420 | 0.434 | ✓ at `R₀ = 256` |

LOW's `fogFar` has to come down from 520 to **420 m**: at `ringNear = 1` the LOD0 radius is only
256 m, and `vis(256)` with `V = 520` is 0.605, which fails C1. `V ≤ 60 + 196/0.534 = 427 m` → 420, which lands at `vis = 0.434`.
Reduced draw distance on `?lite=1` is something the brief explicitly permits, so this costs nothing
we were not already allowed to spend.

#### 3.2.2 The LOD0 → LOD1 cross-fade

Fog alone cannot hide the swap at `ringNear = 2` — C1 leaves 44 % visibility at the boundary in the
night variants, and buying the rest with fog would mean `V < 640 m`, which breaks C2 and kills the
`fog_city` shot. So the swap is made invisible instead of hidden, in three parts, none of which
costs a draw call:

1. **The two geometries already match.** LOD1 boxes are sized to the LOD0 prototype's *bounding
   box*, and carry the same shell material, the same atlas cell (`iUvOffset`) and the same UV pitch
   (`iUvScale`). The only change across the boundary is that a chamfer, a setback or a ledge
   flattens out — a silhouette detail at 512 m is 2–4 px.
2. **Signage and strips ramp to zero over the outer 15 % of the band** rather than vanishing. A
   sign instance at distance `d` gets `iIntensity ×= 1 − smoothstep(0.85·R₀, R₀, d)`. One line in
   the existing sign shader; the outer 77 m of the band has nothing left to pop off.
3. **A screen-space dither cross-fade over that same outer 15 %.** A chunk entering the fade band
   has *both* its LOD0 and its LOD1 instances live. With `a = clamp((d − 0.85·R₀) / (0.15·R₀), 0, 1)`
   and the blue-noise texture the grade pass already generates (§4.6 item 4), LOD0 does
   `if (noise > 1.0 - a) discard;` and LOD1 does `if (noise > a) discard;`. Two `discard`s, zero new
   draws, zero new materials. The band is 77 m wide, crossed in **1.24 s** at 62 m/s.

**P2 gate for all of this**: a screenshot at 320 m altitude looking horizontally at the LOD0
boundary in `deepnight` shows no visible discontinuity, and a 10 s `?auto=1` video crossing four
chunk boundaries shows no sweeping line. Plus a static check in `budget.mjs`: read `config.js`,
compute `vis(ringNear × 256)` for all five variants at both presets, fail if any exceeds 0.45.

**Migration.** LOD assignment is evaluated **per chunk**, never per building, and only when the
chunk's centre crosses a band boundary. At 62 m/s a 256 m chunk boundary is crossed every ~4 s, and
one crossing rewrites at most ~40 instance matrices. Cost is negligible and, crucially, bounded.
During the 77 m cross-fade band a chunk holds slots in both fields; the LOD1 slots are allocated on
entry to the band, not at the boundary, so the swap itself writes nothing.

#### 3.2.3 Chunk generation budget

The first draft budgeted this twice and the two numbers did not agree: §3.11 allocated 1.5 ms
amortised while this section permitted 4 ms per chunk and deferred only past 12 ms — which licenses
a 12 + 4 = 16 ms frame *before post*, i.e. a guaranteed dropped frame on every generating frame, and
while streaming that is most frames. The cap has to sit **below** the budget, not above it.

- Generation is split into **four independently yieldable work units**, each ≤ **1.2 ms**:
  (1) descriptors + collision AABBs, (2) LOD0 matrices and per-instance attributes,
  (3) signage placement and matrices, (4) strips, strobes, antennae and bridges.
- **The cap is per *frame*, not per chunk: at most 1.2 ms of generation work per frame**, however
  many units that is (usually one).
- The next unit is deferred if `performance.now() − frameStart > 6 ms`.
- A near chunk therefore completes over ~4 frames = 67 ms, during which the player moves 4.1 m.
- The 5×5 near ring is pre-warmed at boot behind the loading bar, so the first flight frame is never
  the first generation frame.

**P2 gate**: over a 60 s `?auto=1` flight, worst `__state.ms.gen` ≤ **1.4 ms** and worst total frame
≤ **22 ms** (tightened from 33 — see §3.11 and §12.4 for why the old figure could not fail).

**Frustum culling.** All instanced fields set `frustumCulled = false`. A global instanced mesh has no
meaningful bounding sphere and the per-object test would only ever be a false negative. Culling is
done by the band scheme and by fog — which is the honest answer for this kind of scene, and is now
actually true at every altitude rather than only below `uClearY` (§3.2.1).

### 3.3 Building prototypes

Eight silhouette families in `blocks.js`. Each is built from boxes, merged with `mergeGeometries`,
and given atlas UVs. **Detail comes from emissive, never from tris** — the whole point of §3.0.

| proto | shape | tris | notes |
|---|---|---|---|
| `slab` | one box, chamfered top | 140 | the workhorse, ~35 % of all buildings |
| `taper` | 3 stacked boxes, each 12 % narrower | 180 | classic setback tower |
| `stack` | 4 boxes with 1.5 m ledges between | 220 | the strongest scale cue (§3.10) |
| `spire` | slab + a narrow 30 % upper shaft + mast | 200 | rare, tall, gets the hero billboards |
| `drum` | 10-sided cylinder + a flat cap | 160 | breaks up the grid |
| `terrace` | asymmetric stepped mass, one side sheer | 240 | fills corner lots |
| `podium` | wide 3-storey base + a thin tower off-centre | 210 | the base gets the street-level signage |
| `bridged` | two slabs + a sky bridge at 55 % height | 230 | one of the strongest depth cues |

Every prototype is authored in a **1 × 1 × 1 unit box** and placed by a non-uniform instance matrix
`(W, H, D)`. That distorts the window texture, which is why the UV *tiling* is per-instance (§3.4)
rather than baked.

### 3.4 Window emission — the technique

Not geometry (voidcast makes windows out of thousands of tiny boxes; that is right for a 900-object
sector and completely wrong for a megacity). Not a per-building texture either. One atlas, one
material, per-instance UV.

**The atlas** — `atlas.js` draws a 1024×1024 canvas at boot, 4×4 grid of 256×256 cells, each a
different window pattern drawn with `fillRect` from a seeded rng:

| cell | pattern |
|---|---|
| 0–3 | office grids at 4 pitches, 55–80 % of panes lit |
| 4–6 | residential — irregular, 25–40 % lit, warmer |
| 7–8 | ribbon windows (horizontal bands, no verticals) |
| 9–10 | banded — 3 lit floors, 2 dark, repeating |
| 11 | mostly dead, a dozen lit panes — for the Drownings |
| 12–13 | mechanical floors — louvres and vents, no light |
| 14–15 | curtain wall — a faint grid with occasional bright panes |

Zero bytes shipped. ~35 ms to build. `atlasSize` is 512 on LOW. (The *signage* atlas is different —
it is baked offline and shipped, for the reasons in §3.5.1.)

**The material** — one `MeshStandardMaterial` shared by LOD0 and LOD1:

```js
new THREE.MeshStandardMaterial({
  color: 0x0a0c11, metalness: 0.88, roughness: 0.17,
  map: baseAtlas,            // dark glass / dark metal panel, 2 cells
  emissiveMap: windowAtlas,
  emissive: 0xffffff, emissiveIntensity: 1.0,
  envMap: sky.env,
})
```

**Per-instance variation** via `onBeforeCompile` and four instanced buffer attributes:

| attribute | type | meaning |
|---|---|---|
| `iUvOffset` | vec2 | which atlas cell (window pattern variant) |
| `iUvScale` | vec2 | tiling repeat, computed from the instance's world size at placement |
| `iEmissive` | vec3 | this building's window tint, drawn from the district palette |
| `iSeed` | float | phase for flicker and for the strobe rhythm |

**The pitch rule, and it is not negotiable.** `iUvScale` is always computed so that **one window row
equals 3.6 m of world height and one window column equals 3.2 m of world width**, in *every* LOD:

```js
const COLS_PER_CELL = 32, ROWS_PER_CELL = 32;      // what atlas.js bakes into one 256 px cell
iUvScale.set(worldW / 3.2 / COLS_PER_CELL, worldH / 3.6 / ROWS_PER_CELL);
```

Never scale the texture to fit the building. This is the primary scale cue in the entire game
(§3.10) and it costs nothing.

**Which is exactly why the naïve `uv * iUvScale + iUvOffset` does not work, and this is the single
most important paragraph in §3.** Follow the arithmetic: a 400 m tower is `400 / 3.6 = 111` window
rows, so `iUvScale.y = 111 / 32 = 3.47`. A UV that runs from 0 to 3.47 does **not** tile inside a
0.25-wide atlas cell — it runs straight across the entire 4×4 atlas three and a half times, sampling
twelve other window patterns on the way and then clamping. Essentially every building in the game is
taller than one cell's worth of rows, so essentially every building renders garbage. It will "sort
of work" on the small ones, which is what makes it expensive to find later.

Atlas tiling needs **per-fragment wrapping with explicit derivatives**. `fract()` alone is not
enough: it creates a derivative discontinuity at every cell seam, and the hardware's automatic mip
selection reads that as "this pixel covers the whole texture" and picks the 1×1 mip — a black line
along every seam. So the wrap and the gradients both have to be done by hand.

Vertex shader passes the **untiled** coordinate and the cell origin, and `highp` is not optional —
`vTileUv` reaches ~6.1 on a 700 m `pale` tower and mediump would visibly quantise the wrap:

```glsl
varying highp vec2 vTileUv;      // = uv * iUvScale, unbounded
varying vec2 vCellUv;            // = iUvOffset, the cell's origin in the atlas
...
vTileUv = uv * iUvScale;
vCellUv = iUvOffset;
```

Fragment shader replaces the whole `#include <emissivemap_fragment>` chunk with:

```glsl
const float CELL = 0.25;                        // 4x4 atlas
vec2 tiled = fract(vTileUv);
vec2 auv   = vCellUv + tiled * CELL;
vec2 dx    = dFdx(vTileUv) * CELL;              // derivatives of the CONTINUOUS coord, not the wrapped one
vec2 dy    = dFdy(vTileUv) * CELL;
#ifdef texture2DGradEXT
  vec3 win = texture2DGradEXT(emissiveMap, auv, dx, dy).rgb;
#else
  vec3 win = texture2D(emissiveMap, auv).rgb;
#endif
float flick = 1.0 - 0.10 * step(0.985, fract(uTime * 0.7 + vSeed * 91.7));
totalEmissiveRadiance = vEmissive * win * uNeon * flick;
```

**`texture2DGradEXT`, not `textureGrad`.** three.js compiles material shaders as GLSL ES 1.00 source
and, on a WebGL2 context, prepends a compatibility block that includes
`#define texture2DGradEXT textureGrad` — verified in the pinned build at `three.module.js:20237`.
Writing `texture2DGradEXT` therefore works on both WebGL2 and a WebGL1 fallback with
`EXT_shader_texture_lod`, and it is exactly what three's own `cube_uv_reflection_fragment` chunk
does. The `#ifdef` guard is there for the same reason three uses one.

Two things `atlas.js` must do for this to be correct rather than nearly correct:

- **8-texel gutters around every cell**, filled with the *wrapped continuation* of that cell's own
  pattern. Every window cell is a periodic grid, so the true continuation is available for free and
  bilinear bleed at the seam becomes correct rather than wrong. Without a gutter, the filter pulls
  in the neighbouring cell's pattern along every seam.
- **Clamp the mip chain.** Stop generating mips below the level at which a cell is 8 × 8 texels
  (mip 5 of a 256 px cell), by building the chain by hand with `LinearMipmapLinearFilter` and a
  `texture.mipmaps` array of six levels. Past that point a "mip" is an average of several cells and
  the gutter cannot save it.

`uNeon` is the global neon multiplier from the day variant (§4.1) — one uniform dims every window in
the city for `daysmog`.

*(This bug is specific to the **tiling** case. §3.5.4's signage quads are fine as written: their
`uv ∈ [0,1]`, `iUvScale` is the region's size, and the sample never leaves its region — so signage
keeps the simple `uv * iUvScale + iUvOffset` form and needs no `fract` and no `textureGrad`.)*

### 3.5 Signage — a first-class subsystem

Signage is not decoration on top of the city; in the reference plates it *is* a large fraction of
the image. This section gets real design attention because it is very likely worth more critic
points than anything we could do to building geometry, and because with no human figures in frame it
is now one of our few scale cues (§3.10 #4).

#### 3.5.0 What the plates actually contain

`1488490_00` (the density plate) carries roughly **forty** distinct signage elements at five or six
different depths — huge lightbox billboards, mid-depth poster walls, small blade signs down the
canyon, thin light rules on bridges, window-grid glow.

**A correction to an earlier draft of this section, because the design below leans on it.** That
draft claimed "about four have legible glyphs; everything else is colour fields, bars, dot grids and
shapes". Re-opened at full resolution, that undercounts badly. The frame's four *most prominent*
signage elements are **large figurative poster art** — an anime face on the "EXOTIC" board, a
character on the blue 净跑者 board, a figurative green/pink mural, an illustrated orange panel — and
behind them sit several large real-CJK text blocks and dozens of small legible warm signs in the
mid-ground. The correct reading of the plate is: **the near field is figurative and legible, the mid
and far fields are not.**

That is still the justification for "abstract is the default", but it is a narrower one and it is
the honest one: **at the distances and through the fog where the great majority of our signage will
live — mid-field and beyond — a well-made abstract glyph string reads exactly as well as real text.**
It is only the handful of near-field hero elements where the reference does something we are not
doing. Aaron has settled that abstract is the default (`MANAGER_BRIEF.md`), so abstract it is; but
the plan should not justify that with a count the plate does not support, and §12.3's expectation
for the density shots should be set accordingly.

*(There is a live manager question underneath this, raised in `REVISION_NOTES.md` rather than
decided here: §1.1's "nothing figurative" on hero billboards is a reading of a rule that is about
**3D character models in the world**, and a greyscale poster tile of a face costs exactly the same
in the atlas as an abstract one. It is not this document's call to make.)*

Two other things that frame proves and which the placement rules below are built around:

- **Signs are at many depths simultaneously.** A big near board, a mid poster wall, a receding row
  of small blades, a distant smear. That layering is what produces depth; a uniform sprinkle of
  same-size signs on facades produces a flat wall of noise.
- **Lightboxes and neon tubes are different things.** The blue "EXOTIC" board and the green poster
  wall are *lit panels with dark artwork on them*. The red and cyan strips are *glowing tubes on
  black*. Building only the second kind — which is the obvious thing to do with additive blending —
  loses half the vocabulary.

(`979690_01`, which the brief cites for "magenta/cyan grade at extreme density", is in fact an
**inventory/menu screenshot** — an armoured character on a UI with ARMOR / AUGMENTATIONS / MAP &
MISSIONS / CODEX tabs. It contains no city signage at all. See §12.2 finding 6.)

#### 3.5.1 The atlas — baked offline, greyscale, tinted at runtime

**Runtime canvas generation is abandoned for signage.** It works for window grids (§3.4) because
those are rectangles, but it cannot render text reliably: CJK glyph coverage depends on which system
font the device happens to have, metrics differ between iOS and Android, and a missing glyph renders
as tofu. And a runtime CJK webfont is **megabytes and is banned** — we are on GitHub Pages with a
mobile budget.

So the atlas is **baked offline on the developer's Mac** by a committed script, where Hiragino Sans
and Apple SD Gothic Neo are guaranteed present, and shipped as one PNG.

| property | value |
|---|---|
| file | `assets/signs.png` |
| resolution | **2048 × 2048** (fall back to 1536² if the byte budget is missed) |
| format | **8-bit greyscale PNG**, white marks on pure black. **Never bake colour.** |
| regions | **242**, variable size, shelf-packed — *not* a uniform grid |
| region table | `data/signs.json`, ~18 KB |
| byte budget | **≤ 400 KB** for the PNG. Realistic 220–350 KB — glyph art on flat black is what zlib is best at. |

Greyscale is the whole trick: one atlas yields **unlimited neon colours**, because the runtime
multiplies the sampled luminance by a per-instance emissive tint. Baking colour would mean one atlas
per palette and would make the district colour scheme impossible.

**Packing.** Signs are not square, so a uniform grid wastes most of the sheet. The baker uses a
simple shelf packer (sort by height descending, fill rows left to right, new shelf when the row is
full) and writes the resulting rectangles to `data/signs.json`.

**≥ 8 px of padding between every pair of regions, and the mip chain is clamped.** 242 shelf-packed
variable-size regions with a full mip chain down to 1×1 will bleed neighbours into each other at
distance — a blade sign at 400 m picking up half of the poster packed above it. Two lines in
`bake_signs.mjs` (pad every rect by 8 px when packing, and leave the padding black) plus, at
runtime, a hand-built `texture.mipmaps` array that stops at the level where the *smallest* region is
still 4 texels tall. Invisible bug if missed; the symptom is "the signs look dirty at range" and
nobody connects it to packing.

```json
{ "atlas": "assets/signs.png", "size": 2048,
  "regions": [
    { "i": 0,  "kind": "board_en",  "script": "en",  "text": "NOODLES",
      "u": 0.0, "v": 0.0, "w": 0.25, "h": 0.0625, "aspect": 4.0, "mode": "tube" },
    { "i": 41, "kind": "blade_jp",  "script": "ja",  "text": "ラーメン",
      "u": 0.25, "v": 0.0, "w": 0.0469, "h": 0.1875, "aspect": 0.25, "mode": "box" }
  ] }
```

**How a sign quad picks its region**: the placement code chooses a region index `i`, and the
instance gets `iUvOffset = (u, v)` and `iUvScale = (w, h)` — the same two instanced attributes the
window system already uses (§3.4), so there is no new shader machinery. The quad's world size is
`bandHeight × region.aspect`, which is what keeps the fixed size bands honest (§3.10 #4).

#### 3.5.2 Atlas contents — 242 regions

| kind | count | px | content |
|---|---|---|---|
| `board_en` | 40 | 512×128 | English words, condensed sans — solid, outlined, or with an underrule |
| `board_abs` | 46 | 512×128 | abstract glyph strings (§3.5.3) — **the default** |
| `blade_en` | 22 | 96×384 | English letters stacked vertically |
| `blade_abs` | 34 | 96×384 | abstract glyph column |
| `panel_abs` | 30 | 256×256 | dense poster fields — dot grids, bars, one big glyph, a border |
| `mark` | 26 | 128×128 | logos, roundels, chevrons, arrows, hazard marks |
| `rule` | 14 | 256×32 | plain / double / dotted / zigzag neon tubes and edges |
| `ticker` | 10 | 512×64 | segment patterns designed to scroll their U |
| `hero` | 8 | 512×512 | large abstract poster art for the 90 m billboards |
| **`board_ja`** | **6** | 512×128 | **real short Japanese, horizontal** |
| **`blade_ja`** | **6** | 96×384 | **real short Japanese, vertical — the classic shop blade** |
| **total** | **242** | | |

**Real-script content: 12 tiles.** Inside the brief's 8–15 target, and the marginal cost is 12 more
rectangles in a texture we are baking regardless — roughly 6 KB of PNG and about four minutes of
work. The word list lives in `data/signwords.json` so it can be extended without touching code:

| tile | word | reading | meaning |
|---|---|---|---|
| `blade_ja` | ラーメン | rāmen | ramen |
| `blade_ja` | 食堂 | shokudō | canteen / eatery |
| `blade_ja` | 薬 | kusuri | medicine (pharmacy) |
| `blade_ja` | 酒 | sake | liquor |
| `blade_ja` | ホテル | hoteru | hotel |
| `blade_ja` | 電気 | denki | electric |
| `board_ja` | 営業中 | eigyōchū | open (for business) |
| `board_ja` | 駐車場 | chūshajō | car park |
| `board_ja` | 24時間 | nijūyo-jikan | 24 hours |
| `board_ja` | 出口 | deguchi | exit |
| `board_ja` | 入口 | iriguchi | entrance |
| `board_ja` | 東区 | higashi-ku | East Ward |

All twelve are one to four characters, all are ordinary shop-front or street signage, none is a
sentence, and none is a phrase whose idiomaticity is in doubt. That is the brief's rule followed
literally: **if a string's correctness is uncertain, do not use it.** Korean is listed in
`signwords.json` as an optional extra set (`노래방` karaoke, `편의점` convenience store) behind a
`--korean` flag on the baker, off by default.

**Fallback, and it is mechanical, not a judgement call.** The baker measures every real-script glyph
before drawing it. If `ctx.measureText` reports a zero advance, or the rendered bitmap matches the
`.notdef` tofu box, that word is **skipped, logged, and its slot is refilled with an abstract tile**.
If fewer than four real-script tiles survive, the baker drops the whole `ja` set and the atlas ships
as English + abstract only — which the brief explicitly permits. The game code never knows the
difference; it just reads `data/signs.json`.

#### 3.5.3 The abstract glyph generator — the primary path

This is 46 + 34 + 30 = **110 of the 242 tiles**, so it deserves to be done properly rather than as
`fillRect` noise. The insight is that random marks read as *noise*, but random marks that share a
grid and a stroke width read as *writing*. Four rules:

1. **A shared sub-grid.** Every stroke snaps to a 4 × 5 lattice inside the glyph's em box. This one
   rule is the difference between "an alien script" and "someone spilled paint".
2. **A constant stroke width** across the whole tile — `0.14 × em`. Real type has one pen.
3. **Varying glyph advance** — widths drawn from `[0.5, 0.7, 1.0, 1.0, 1.3] × em`, so the string has
   rhythm instead of being a picket fence.
4. **Word grouping** — 2–4 words of 3–7 glyphs, separated by a 0.5 em space, on a common baseline
   with a common x-height. Language has spaces; noise does not.

Strokes are drawn from a fixed vocabulary: vertical bar, horizontal bar, L-corner, closed box, short
diagonal, dot, quarter arc. Three families, never mixed inside one tile:

| family | stroke mix | reads as |
|---|---|---|
| `bars` | verticals + short horizontals, few enclosures | kana-ish |
| `boxes` | closed boxes, crossbars, dense enclosures | kanji-ish |
| `cursive` | arcs and diagonals, connected baseline | hangul / arabic-ish |

`panel_abs` tiles compose differently — one oversized glyph at 60 % of the tile, a dot-matrix field,
two rules and a border — because poster walls in the reference are graphic, not textual.

#### 3.5.4 Runtime — texture, materials, draws

**Texture setup**, and each line matters:

```js
tex.colorSpace   = THREE.NoColorSpace;                  // it is a mask, not colour — sRGB decode would crush it
tex.generateMipmaps = true;
tex.minFilter    = THREE.LinearMipmapLinearFilter;
tex.anisotropy   = Math.min(4, renderer.capabilities.getMaxAnisotropy());
```

Mipmaps are not optional. A 512×128 sign seen at 30 px across without them aliases into crawling
noise, and crawling signage is precisely what a critic marks under **Finish**. Anisotropy 4 keeps
blades legible at the grazing angles you get flying down a canyon.

**Two instanced meshes**, because tubes and lightboxes blend differently (§3.5.0):

| mesh | blending | fragment | share |
|---|---|---|---|
| `signsNeon` | `AdditiveBlending`, `depthWrite:false`, `renderOrder 4` | `gl_FragColor = vec4(vEmissive * tex.r * vIntensity, 1.0)` | ~70 % |
| `signsBox` | normal, `transparent:true`, `depthWrite:false`, `renderOrder 3` | `vec3 c = mix(vEmissive, vEmissive * 0.12, tex.r); gl_FragColor = vec4(c, vAlpha);` | ~30 % |

`signsBox` is the lit-panel-with-dark-artwork case: the *background* glows and the glyph is a
silhouette cut out of it. It is one extra draw call and it doubles the signage vocabulary.

Both use the same unit quad, the same atlas texture, and the same four instanced attributes as the
window system — `iUvOffset`, `iUvScale`, `iEmissive`, `iSeed` — plus `iIntensity`. Additive is
order-independent, and `signsBox` panels are opaque-ish on a black scene, so neither needs sorting.

**Animation, entirely in the shader from `iSeed`**, zero CPU:

- 15 % of signs flicker — a hard 40 ms dropout at a per-sign rate of 0.2–2 Hz.
- 10 % pulse on a slow sine, ±25 % intensity.
- `ticker` regions scroll their U at 0.08–0.2 /s.
- 3 % are "failing" — one segment dark, the rest at 60 %.

**Hero billboards** stay as they were: 12 quads sampling **three shared animated `CanvasTexture`s**
(256×512, redrawn at 8 fps) via `iUvOffset` into a 1×3 strip. Content is abstract fields, tickers and
colour wipes — nothing figurative, per §1.1. 1 draw call, ~0.3 ms. The static `hero` atlas tiles are
the fallback when `Q.holoFps === 0`.

**Total signage cost: 3 draw calls at HIGH** (`signsNeon`, `signsBox`, hero billboards), plus 1 halo
draw at LOW. ~2,600 triangles for ~900 signs.

#### 3.5.5 Placement — five depth layers

A uniform sprinkle of same-size signs is what makes an amateur cyberpunk scene look flat. The
reference has signage at five distinct scales and depths at once, so we place in five layers with
their own size bands, heights and densities.

| layer | world size | where | count (near ring) | proud of face |
|---|---|---|---|---|
| **L1 street blades** | 3–5 m tall | podium faces, y 6–30 m | 260 | **1.2 m — perpendicular** |
| **L2 facade boards** | 12–24 m wide | building faces, y 30–180 m, flush | 220 | 0.4 m |
| **L3 lightbox panels** | 8–16 m | ledges, setback faces, y 20–120 m, flush | 140 | 0.3 m |
| **L4 rules & tickers** | 2–40 m long | building edges, ledge lips, bridge undersides, any y | 210 | 0.15 m |
| **L5 hero billboards** | 60–110 m wide | `spire` / `pale` upper faces, y 180–420 m | 12 | 1.0 m |

Two placement rules that carry most of the look:

1. **Blades stick out perpendicular to the facade.** This is the single most important rule in the
   section. A sign flush to a wall is invisible when you fly parallel to that wall; a blade
   projecting 1.2 m is visible from everywhere and creates the receding row down a canyon that makes
   `746850_08` and `1488490_00` work. It also generates parallax, which is depth for free.
2. **Signage clusters; it does not sprinkle.** Each podium face rolls a *commercial* flag —
   45 % in `ribs` and `lantern`, 12 % in `pale`, per-district. A commercial face gets **4–9** signs;
   a non-commercial face gets **zero**. That produces the dense-block / dark-block rhythm of the
   reference instead of an even wash. Uniform density is the failure mode to watch for at the P3
   critic round.

Placement is deterministic per chunk from the same hash as the buildings, generated in the LOD0
pass, and discarded entirely at LOD1 and beyond — past ~1300 m signage is a smear that the window
emissive already provides. `Q.signDensity` scales every count (1.0 HIGH, 0.55 LOW).

#### 3.5.6 The baker — `tools/bake_signs.mjs`

Node, no Python, no imaging library. It reuses the `open()` CDP helper already written for
`tools/shot.mjs` (§12.4), so it adds no new dependency to the project:

1. Serve `tools/signbake.html`, a page that draws all 242 regions into one 2048² canvas using
   `ctx.fillText` with an explicit font stack —
   `'Hiragino Sans','Apple SD Gothic Neo','Helvetica Neue',sans-serif` — and the abstract generator
   of §3.5.3 for the rest. White on black, no colour, no anti-alias tricks beyond default.
2. Run the coverage check on every real-script glyph; skip and log failures, refill with abstract.
3. Read back the canvas with `toDataURL('image/png')` and the region table with
   `Runtime.evaluate`.
4. Write `data/signs.json`, and write the canvas PNG to a temporary file.
5. **Run `oxipng -o4 --strip all <file>`. This is a hard requirement, not an optimisation.** A
   canvas cannot emit an 8-bit greyscale PNG — `toDataURL('image/png')` always produces 8-bit
   **RGBA**, whatever is drawn into it, so the "8-bit greyscale PNG" this section mandates does not
   exist until something reduces the colour type. `oxipng` performs exactly that reduction
   automatically when all three channels are equal and alpha is opaque, which is guaranteed here
   because the sheet is white-on-black with no transparency. The RGBA sheet is roughly 2–3× the
   greyscale size at 2048² and would blow the 400 KB budget on its own, sending a builder to 1536²
   for no reason. `--strip all` also removes the metadata, which matters in §12.4.
   If `oxipng` is not on `PATH`, **fail the bake** with `brew install oxipng`. Do not ship the raw
   PNG and do not silently fall back to `pngquant` — `pngquant` is a lossy *palette* quantiser and
   would give us an indexed sheet, not a greyscale one.
6. Assert the result is colour type 0 (greyscale), 8 bits, by reading byte 25 of the IHDR.
7. Fail loudly if the PNG exceeds **400 KB**, with the instruction to drop to 1536².

`tools/signbake.html` is openable directly in a browser to eyeball the sheet, which is how a builder
should check the abstract generator before baking. Re-running the baker regenerates everything, so
the atlas can be extended later by editing `data/signwords.json` and the region counts and re-running
one command — which is the point of baking it with a committed script rather than by hand.

### 3.6 Ground

Street level is `y = 0`. There are no interiors and nothing below it.

- A 1400 × 1400 m plane, 1 segment, following the camera in 256 m snaps so the texture never swims.
  (The first draft said 2400 m; see the fog note below — 2400 m was sized against a fog model that
  never reached full opacity, and 1400 m is now more than enough.)
- **The ground is two surfaces, drawn either side of the mirror group** — see §3.7(b) for the order,
  because the reflection lives at `y < 0` and cannot survive an opaque depth-writing ground.
  - **The road**, opaque, `MeshStandardMaterial({ map: groundTex, roughnessMap: groundRough,
    metalness: 0.35, roughness: 0.30, envMap })`. `groundTex` is a generated 1024² tiling canvas:
    near-black asphalt, faint lane markings, drain grates, and irregular puddle masks. `groundRough`
    is the same canvas' puddle mask inverted — puddles are roughness 0.04, dry asphalt 0.62. That
    single map is what makes the ground read as *partly* wet rather than a uniform mirror, which is
    the difference between `1475810_04` and a plastic floor.
  - **The water film**, a second co-planar quad at `y = +0.02`, `transparent: true`,
    `depthWrite: false`, carrying the scrolling ripple normal and the puddle-mask alpha, drawn
    *after* the mirror group so the reflection sits under it.
- The ground lies at `y = 0`, which is inside the smog band, so its fog multiplier is `uSmogMul`
  and it is fully opaque past `V(2.2) = 442 m` (§3.2.1). There is no horizon seam to manage — and
  unlike the first draft, that is now true rather than aspirational: the old fog form capped the fog
  factor at 0.45 above `uClearY` and this plane's far edge was visible at 62 % through it.

### 3.7 Reflections — the cheap approximation, stated plainly

Real planar reflection is a second full scene render. On a phone that is unaffordable and we are not
doing it. Neither is SSR. Here is what we do instead, in three parts.

**(a) Environment reflection — one bake, not per frame.**
`sky.js` renders a 128×128 (64 on LOW) equirect canvas — sky gradient on top, a saturated horizon
band of "city glow" whose hue is the average of the nearby districts' palettes, warm sodium at the
bottom — through `PMREMGenerator` into `sky.env`. Assigned as `envMap` on glass, metal, ground and
every hull. Re-baked only when the day-variant blend has moved more than 0.08 since the last bake:
about **12 bakes per in-game day**, ~4 ms each. This is what puts a reflection in every glass facade
and on the black bodywork of the player craft for essentially zero per-frame cost.

**(b) The wet-ground double — the big win.**
Look at `1488490_08` and `1475810_04`: what is reflected in the wet ground is *only the light
sources*. The lit geometry contributes almost nothing; it is the neon that doubles. So we reflect
**only the emissive buckets** and never the lit geometry:

- A `THREE.Group` at `y = 0` with `scale.set(1, -1, 1)`.
- Inside it, **three** `InstancedMesh`es that **share the exact same instance buffers** as the sign,
  strip and strobe fields — `new InstancedMesh(geo, mirrorMat, n)` with `instanceMatrix` assigned by
  reference. Zero extra CPU when the source fields update. *(The first draft mirrored a fourth
  bucket, the 900 traffic streaks. It is dropped: it is the largest fill item of the four and
  doubled light streaks on water read as noise rather than reflection. Saving: 1 draw, ~1.8k tris,
  ~0.5 ms in the shot it exists for.)*
- `mirrorMat` is the source material cloned with `opacity: 0.42`, `depthWrite: false`,
  `depthTest: true`, and an extra fragment term fading the reflection with distance below the
  surface so it does not run forever.

**`side` stays as the source material's, or `DoubleSide` — never `BackSide`.** three.js already
compensates for a negatively-scaled object: `WebGLRenderer` computes
`const frontFaceCW = ( object.isMesh && object.matrixWorld.determinant() < 0 );` and hands it to
`state.setMaterial`, which does `if ( frontFaceCW ) flipSided = ! flipSided;` — verified in the
pinned build at `three.module.js:29177` and `:23433`, and `InstancedMesh` extends `Mesh` so
`isMesh` is true for all three of ours. A group at `scale(1, −1, 1)` therefore already renders its
front faces correctly. Adding `BackSide` applies the flip **a second time** and the mirrored quads
become invisible from the side you are looking at. These are quads on an additive, depth-write-free
pass, so `DoubleSide` costs nothing and removes the whole class of bug: use it, and do not re-add
the "(negative scale flips winding)" justification — it is the reason for a correction three.js has
already made.

**Draw order, stated explicitly, because the reflection lives at `y < 0` and nothing else in the
scene does.** Get this wrong in the obvious way — an opaque depth-writing ground drawn first — and
the mirror is entirely occluded and *nothing appears*; get it wrong in the other obvious way —
`depthTest: false` — and the reflection paints over buildings that are in front of it. The order is:

| # | what | `renderOrder` | depth |
|---|---|---|---|
| 1 | the opaque scene: shells, craft, cockpit — **and the road plane** (§3.6) | 0 | test ✓ write ✓ |
| 2 | **the mirror group** | 2 | test ✓ **write ✗** |
| 3 | the water film (§3.6), transparent, carrying the ripple normal and puddle alpha | 3 | test ✓ write ✗ |
| 4 | signs, strips, strobes, streaks, zones, shafts | 4–6 | test ✓ write ✗ |

The one rule that makes this work: **the road plane does not write depth.** It is drawn first in the
opaque list (`renderOrder: -1`, `depthTest: true`, `depthWrite: false`), and nothing in the game is
ever behind it, so it loses nothing by not writing. Buildings, craft and cockpit write depth
normally, so they still correctly occlude the reflection at step 2. The water film at step 3 then
sits over the reflection and the two read as one wet surface. This is the whole reason §3.6 splits
the ground into a road and a film.

**P3b gate**: a building standing between the camera and a sign must occlude that sign's *reflection*
as well as the sign. Screenshot it.

**What the mirror actually costs.** "4 draw calls, ~18k tris, ~0.6 ms" priced the geometry and
not the fill, and fill is the whole cost. In the `wet_street` framing (5 m above the street) the
mirrored sign, strip and strobe fields blend over roughly the lower half of the frame, on top of the
water film's own transparent pass — call it 0.9 screens of additive coverage at dpr 2. At §3.11's
0.35 ms per screen that is 0.32 ms of blend, plus the source fields' own vertex and matrix work
again, plus the distance-fade term. Realistic: **3 draws, ~16k tris, 1.1 ms** — and 1.1 ms in
exactly the shot it exists for, not 0.6. It is still the single best-value item in this plan; it is
just not free.

Restriction, stated so nobody is surprised: the mirror plane is at `y = 0` only. Elevated dock decks
get their own local mirror group at the deck's `y`, activated only when the player is within 200 m of
that deck and limited to that deck's own zone lights. Any other elevated surface gets no reflection —
fog hides it.

**(c) Vehicle bodywork.**
`envMap` plus a fresnel rim added in `onBeforeCompile`. **Both names in the first draft's version of
this snippet are wrong for the pinned version, and both fail silently** — a `.replace()` on a
substring that is not there is a no-op, so the builder gets no error and no rim light:

- The injection point is **`#include <opaque_fragment>`**, not `<output_fragment>`. `output_fragment`
  was renamed in r152 and survives only as a deprecated *include alias* — verified at
  `three.module.js:19613`, `[ 'output_fragment', 'opaque_fragment' ], // @deprecated, r154`. The
  material's own source contains `#include <opaque_fragment>` (verified by reading
  `ShaderLib.physical.fragmentShader`), so a search for the old string finds nothing.
- The view direction is **`geometryViewDir`**, not `viewDir`. r155 renamed the fragment shader's
  geometry struct fields; `geometryViewDir` is declared inside `<lights_fragment_begin>` (verified
  at `three.module.js:13940`) and is therefore in scope at `<opaque_fragment>`. `normalize(vViewPosition)`
  is the equivalent if you would rather not depend on the lighting chunk having run.
- `saturate` **is** fine — three defines it in the `common` chunk (`#ifndef saturate / #define
  saturate( a ) clamp( a, 0.0, 1.0 )`, verified at `three.module.js:13878`).

```glsl
// patch: '#include <opaque_fragment>'  ->  this + '\n#include <opaque_fragment>'
float f = pow( 1.0 - saturate( dot( normal, geometryViewDir ) ), 3.4 );
outgoingLight += uRim * f * 0.55;
```

`uRim` is the local district's neon tint. On a near-black hull this one line is the difference
between "glossy black car" and "silhouette", and it is what makes `1939970_00`'s hero craft read.

Route it through §2.3's `patch()` helper so a future three.js bump that renames the chunk again
fails loudly instead of quietly deleting the effect.

### 3.8 Draw call and triangle budget

**Target: ≤ 90 draw calls and ≤ 250k triangles at HIGH; ≤ 55 draws and ≤ 95k tris at LOW.**

(The first draft's headline said 230k while its own accounting summed to 250k. The accounting is the
real number, so the target moves to match it; `budget.mjs`'s gate stays at 260k, which is the
headroom above the target.)

Full accounting at HIGH, standing in a dense district at 200 m altitude:

| group | draws | tris |
|---|---|---|
| LOD0 shells (8 protos) | 8 | 135,000 |
| LOD1 shells | 1 | 24,000 |
| LOD2 far towers | 1 | 5,500 |
| Signs — neon tubes | 1 | 1,300 |
| Signs — lightboxes | 1 | 500 |
| Hero billboards | 1 | 24 |
| Edge strips | 1 | 14,400 |
| Warning strobes | 1 | 1,400 |
| Antennae / masts / bridges | 1 | 9,000 |
| Distant silhouettes | 1 | 480 |
| Traffic — real craft (hull, glass, lights) | 3 | 16,000 |
| Traffic — far streaks | 1 | 1,800 |
| Player craft (hull, glass, lights, thruster) | 4 | 6,200 |
| Ground: road + water film | 2 | 8 |
| Mirror group (3 buckets — signs, strips, strobes) | 3 | 16,200 |
| Rain | 1 | 5,000 |
| Sky dome + light shafts (4, not 8) | 5 | 2,590 |
| Dock zones (**nearest 3** × 2) | 6 | 1,425 |
| World markers / beacons | 3 | 600 |
| Cockpit (frame, glass, dash, 3 holo) | 6 | 4,400 |
| **World total** | **51** | **~246k** |
| Post: `UnrealBloomPass` — **13** internal passes | 13 | — |
| Post: grade `ShaderPass` | 1 | — |
| **Total** | **65** | **~246k** |

**`UnrealBloomPass` is 13 draws, not 5.** Counted from the pinned source
(`UnrealBloomPass.js:229–290`): 1 luminosity high-pass + `nMips`(5) × 2 separable blur passes +
1 composite + 1 additive blend = 13 `fsQuad.render()` calls, and `RenderPass` contributes the world
draws already counted above. That is 8 more than the first draft assumed; the headroom against the
≤ 90 gate is **25**, not 18, only because the zone and shaft cuts (§4.5, §7.1) gave back more than
bloom took.

The reason the world total is 51 and not the ~600 you would expect from a per-chunk scheme is
entirely §3.4 — atlasing the windows into the shell material collapses what would have been four
meshes per building into one.

If the tri count is the thing that bites first on a mid Android, the lever is `ringNear` (2 → 1
removes ~60 % of LOD0), not the prototype tri counts.

### 3.9 Distant fabric silhouettes (optional, §1.1 exception)

One `InstancedMesh`, cross-billboard (two quads at 90°, 4 tris), sampling a single 64×128 alpha cell
in the sign atlas — a dark hooded cloth shape, no face, no limbs. Placed only on ledges, bridges and
podium roofs. Hard rules:

- Never instantiated within **140 m** of the camera. Inside that radius the instance is parked at
  `y = -9999` with zero scale, exactly as voidcast's `PropField.hide` does.
- Unlit `MeshBasicMaterial` in near-black with fog on; they are silhouettes and nothing more.
- Motion is a ±0.15 m sine drift on a per-instance phase. No walking, no turning, no rig.
- ≤ 120 instances, `Q.silhouettes` off in LOW.

**Kill criterion**: if the P3b critic round mentions them as flat, cardboard, or "sprites", delete the
module. They are worth one draw call and nothing more.

### 3.10 Scale — how the towers read as enormous with no people in frame

This section exists because the usual answer (a human figure for scale) is unavailable. Seven cues,
all free, all already in the systems above. A builder must not weaken any of them for a local
aesthetic win.

1. **Window pitch is the ruler.** 3.6 m per row, 3.2 m per column, everywhere, every LOD (§3.4). A
   400 m tower shows 111 rows and the eye integrates them. This is the strongest cue we have.
2. **Traffic lane stacking.** Fourteen lanes at fixed altitudes — 30, 55, 85, 120, 160, 210, 270 m,
   two directions each. Craft on them are a known 6 m long. Seven stacked lanes between the street
   and a tower's midpoint says "that is a 500 m building" without a word.
3. **Aircraft warning strobes.** Red, at every **60 m** of height on every building over 180 m, all
   at 0.85 Hz with a per-building phase. A column of six strobes up a fog-dimmed silhouette is an
   instant, unambiguous height read, and it is six quads in the existing strobe field.
4. **Fixed signage size bands** (§3.5.5). Because street blades are always 3–5 m, facade boards
   12–24 m and hero billboards 60–110 m — and because the baked tile's aspect ratio is preserved, so
   a given sign is always the same physical size — the player calibrates on them in the first minute
   and then reads distance from apparent size for the rest of the game. Reinforcing this: glyph
   height inside a tile is a constant 62 % of tile height across the whole atlas, so **text height is
   a direct proxy for sign size, which is a direct proxy for distance.** A builder must not "fix" a
   sign that looks small at range by scaling it up; that breaks the ruler.
5. **Fog depth banding** (§4.2). The smog layer has a *top* at ~90 m and clean air above 260 m, so
   every tall building visibly emerges from the murk partway up. That transition line is an altitude
   marker painted across the whole skyline.
6. **The player craft.** 6 m long, in frame in third person, at a fixed camera distance. Everything
   is measured against it.
7. **Structural rhythm.** The `stack` and `terrace` prototypes put ledges every 40–70 m; `bridged`
   puts a sky bridge at 55 % height; sky bridges also span between towers at 90 / 150 / 220 m. These
   are repeated horizontal ticks up a facade, and repetition is what makes a surface countable.

### 3.11 Frame budget

**A 16.7 ms budget in a 16.7 ms frame is a budget that fails.** 16.7 ms is the vsync *period*, not
the engine's allowance: the browser's own compositing, Safari's canvas presentation, GC, the audio
thread, DOM layout and the ~1 ms of jitter any real device has all come out of the same period. A
frame that is 100 % allocated misses vsync constantly and falls to a 30 fps cadence, which reads
worse than a steady 45.

**The engine target is ≤ 13.5 ms**, leaving **3.2 ms** to everything that is not us.

| stage | ms | |
|---|---|---|
| JS sim — flight, traffic, zones, missions, LOD bookkeeping | 1.5 | 900 streaks are analytic; 26 near craft |
| Chunk generation — **hard 1.2 ms per-frame cap** (§3.2.3) | 1.2 | was 1.5 here and 4.0 in §3.2; now one number |
| three.js traversal, matrix updates, instance buffer uploads | 0.9 | ~51 objects, all `frustumCulled = false` |
| GPU main pass — ≤ 250k tris, opaque, no shadows | 4.6 | |
| MSAA 2× resolve on the composer target (§2.3) | 0.4 | |
| Mirror group — 3 buckets, **fill-bound** (§3.7b) | 1.1 | was 0.6, priced as geometry |
| Light shafts — 4 cards, view-dot culled (§4.5) | 0.55 | was 0.15 for eight cards |
| Dock zone volumes — nearest 3 (§7.1) | 0.25 | was unpriced |
| Rain, traffic streaks, strobes — blended | 0.45 | was unpriced |
| Bloom — half-res, 5 mips, 13 passes, input clamped (§4.4) | 1.3 | was 3.5 for "3 mips" |
| Grade pass — ACES + lift/gain/split/vignette/dither, full res | 0.35 | |
| Minimap 2D canvas @ 15 fps, amortised | 0.3 | |
| Dash + holo canvases @ 12 / 4 fps, amortised | 0.3 | |
| HUD DOM | 0.2 | |
| **Total engine work** | **13.4** | |
| **Headroom to the 16.7 ms period** | **3.3** | |

On LOW: bloom out (−1.3), halos in (+0.5, **capped** — see below), main pass 4.6 → 1.9 (ringNear 1,
dpr 1.25), MSAA off (−0.4), mirror 1.1 → 0.5 (2 buckets), shafts 0.55 → 0.15 (1 card), zones and
rain trimmed → about **8.9 ms**, which leaves real headroom under the 33.3 ms Android floor.

**Every number in this table is an estimate.** No code exists and nothing has been measured. Any
figure in this document that says "measured" and predates P1 is wrong (§4.4 said bloom was
"measured at ~3.5 ms at 1170×2532 dpr 2" — that resolution is a dpr-3 buffer, our `Q.pixelRatio`
caps at 2, and no measurement was taken). Relabel on sight; replace with real numbers as each phase
lands them.

#### 3.11.1 The rule this table exists to enforce

**Transparent and additive layers, not draw calls, are the mobile budget.** Draw calls and triangles
are not this game's risk — §3.8 lands at 65 and 246k and both are comfortable. Blended overdraw is
the risk, and it is the thing that gets added late by someone who has just checked the draw count
and concluded there is room.

> **Any new full-screen-ish blended layer must be costed at ~0.35 ms per screen of coverage at
> dpr 2 before it is added.**

Where 0.35 comes from: at `Q.pixelRatio = 2` a 390 × 844 CSS viewport is a 786 × 1704 = **1.34 Mpx**
buffer. One screen of additive blend with a single texture fetch into a `HalfFloatType` target is
1.34 M read-modify-writes at 8 bytes ≈ 10.7 MB of bandwidth; at a mid phone's ~50 GB/s effective
that is 0.21 ms, and at ~5 Gtexel/s of blended fill rate it is 0.27 ms. **0.35 ms is that, rounded
up** — deliberately, because the number is there to stop things being added, not to be precise.

The four items the first draft under-priced by roughly ten times, and what each becomes:

| item | was | why it was wrong | now |
|---|---|---|---|
| **Light shafts, 8 cards** | +0.15 ms | Eight large additive cards, `depthWrite: false`, `fog: false`, each covering 25–35 % of frame ≈ 2.4 screens ≈ 7 M blended fragments with a texture fetch each. Reducing *opacity* by the view-dot term does not reduce rasterisation — the card still shades every pixel it covers. | **4 cards HIGH, 1 LOW**; any card whose view-dot term is below 0.05 sets `visible = false` rather than fading; cards shrunk and bloom relied on to spread them. **0.55 ms** (§4.5) |
| **LOW halo sprites** | +0.5 ms, "three extra draw calls" | ~2,800 quads (900 signs + 1,200 strips + 700 strobes) redrawn at 2.5× scale = **6.25× the area**, additive, and *unbounded* — it scales with how many signs are on screen, on the weakest device, replacing bloom, which is a **fixed** cost. | Capped to the **nearest 400 signs / 500 strips / 300 strobes** at **1.8×** (3.24× area), ~0.8 screens at dpr 1.25. **0.5 ms**, and see the P3b gate below (§4.4) |
| **Dock zone volumes** | 16 draws, fill unpriced | 14 m × 26 m `DoubleSide` additive cylinders with `depthWrite: false` = 2× overdraw each; stand next to one and it fills the frame. Eight active was also 20 % of the entire draw budget for something you can only ever be near one of. | **Nearest 3**, the rest reduced to a world marker; when the camera is *inside* a cylinder that one switches to `FrontSide`. **0.25 ms** in flight; ~0.8 ms on final approach, which the 3.3 ms headroom covers and which is a frame with no chunk generation in it (§7.1) |
| **`backdrop-filter: blur(24px)`** on the docking panel | unpriced | On mobile Safari a 24 px backdrop blur over a **live WebGL canvas** forces a full-resolution readback and blur on every composited frame — of the main UI of the game. | **Never blur the live canvas.** One-shot offscreen still, see §7.3. **~0 ms** |

#### 3.11.2 The gates, and the one that could not be met

`tools/budget.mjs` renders each of the six shots plus a 60 s `?auto=1` flight, samples `__state` at
10 Hz, and fails the phase on any of:

| gate | value | |
|---|---|---|
| draws | > 90 | |
| triangles | > 260k | |
| worst `ms.gen` | > 1.4 ms | §3.2.3 |
| worst frame | > **12 ms** | was 33 |
| mean frame | > **6.0 ms** | was 18 |
| §3.2.1 static check | any variant/preset with `vis(ringNear × 256) > 0.45` | no rendering needed |

**Why 6 ms and not 18.** §1 requires "60 fps sustained on a recent iPhone… measured, not guessed —
`tools/budget.mjs` writes the numbers", but `budget.mjs` runs headless Chrome on a Mac with
`--use-angle=metal`. **An M-series GPU is not a phone GPU.** It is roughly 2.5–3× a mid phone at the
same resolution, it has no thermal cap over a 60 s run, and it would pass an 18 ms mean while
rendering something an A15 cannot hold. 13.4 ms of phone work ÷ 2.5 ≈ 5.4 ms; the gate is 6.0 ms.
This is a **proxy**, and it is labelled as one — it is a tripwire that catches a regression, not a
measurement of the shipping requirement.

**The actual measurement is a person with a phone, and it is in P10's done-criteria.** The Pages URL
is opened on Aaron's phone with `?perf`, in **portrait and landscape**, at **default and `?lite=1`**,
and the four resulting numbers (fps, draws, tris, worst frame) are written into the ship handoff.
Without that step §1's shipping definition has no evidence behind it and should not be ticked.

---

## 4. Lighting and atmosphere

### 4.1 Day variants

Five, on an **8-minute** in-game day. The player never sees a hard switch; `sky.js` lerps between
the two bracketing variants every frame.

| id | clock | look |
|---|---|---|
| `deepnight` | 00:00–04:00 | Near-black. Sky is 0x04060b flat. Hemi 0.06. No directional at all. Neon 1.00. Fog 60→900 m in **0x1c2029**. The purest expression of the brief. |
| `predawn` | 04:00–07:00 | A cold blue-grey lift on one horizon, still no readable sky. Hemi 0.13, a 0.18 directional from low east in 0x5f6f86. Neon 0.95. Fog 60→900 m in **0x1f2028**. |
| `daysmog` | 07:00–16:00 | **The day variant.** See §4.3. Fog 60→520 m in **0x4a4b50**. |
| `duskburn` | 16:00–19:00 | The best-looking one and the default for hero shots. A warm sodium/rose band on one horizon (0xd46a3c at 0.55), everything else cold cyan ambient. Hemi 0.20 sky 0x3a4a63 / ground 0x2a1a14. Neon 0.90. Fog 60→760 m in **0x2e2028** — warm near, cold far. This is `1488490_08`. |
| `stormnight` | 19:00–00:00 | Rain at full, fog 45→560 m in **0x2a2f38**, heaviest reflection, lightning: a 2-frame hemi spike to 0.9 plus a sky-dome flash, every 25–70 s. Neon 1.00. |

Each variant is a flat data object of 21 values — `fogColor, fogNear, fogFar, fogSmogTop,
fogSmogMul, fogClearY, fogClearMul, hemiSky, hemiGround, hemiI, dirColor, dirI, dirAz, dirEl,
neon, exposure, gradeLift, gradeGain, gradeSplit, rain, shafts`. Blending is ~25 `lerp` /
`Color.lerpColors` calls per frame; it does not show up in a profile.

#### 4.1.1 Why the fog colours moved, and the rule that keeps them there

Every fog colour above is **lighter than it was**, and this is the number the whole look hangs on.

§3.0 correctly identifies the mechanism: `746850_01` reads as an enormous city because "silhouettes
stack in front of each other at four or five separable depths". Opened at full resolution, the fog
in that plate is a **mid-grey, roughly `#3a3d42`** — noticeably *lighter* than the buildings. That
luminance gap **is** the mechanism. `1488490_00` is the same, with a clearly visible blue-grey
canyon haze.

The first draft specified `deepnight` fog `0x05070c` and `stormnight` `0x070910`. Both are *darker*
than the shell material's albedo `0x0a0c11`:

| | sRGB luminance | vs shell |
|---|---|---|
| shell albedo `0x0a0c11` | 0.047 | — |
| old `deepnight` fog `0x05070c` | 0.027 | **0.58×** — fog darker than the buildings |
| old `stormnight` fog `0x070910` | 0.036 | **0.77×** |
| reference `746850_01` haze `#3a3d42` | 0.238 | **5.07×** |
| new `deepnight` fog `0x1c2029` | 0.125 | **2.66×** |
| new `predawn` fog `0x1f2028` | 0.128 | **2.72×** |
| new `duskburn` fog `0x2e2028` | 0.145 | **3.10×** |
| new `stormnight` fog `0x2a2f38` | 0.182 | **3.89×** |
| new `daysmog` fog `0x4a4b50` | 0.295 | **6.29×** |

(Luminance is `0.299R + 0.587G + 0.114B` on the sRGB values — the same weights
`LuminosityHighPassShader` uses, so these numbers are directly comparable to the bloom threshold
discussion in §4.4.)

Dark buildings against darker fog do not separate — they merge into one black field and every depth
cue in §3.0 is lost. A builder copying the first draft's table would have shipped the black-on-black
version and then spent a critic round trying to fix it with geometry.

**The rule, and it goes in §4.2 as a one-liner a builder cannot miss:**

> **Fog colour must be measurably lighter than the shell material — target 2.5–4× its sRGB
> luminance at night, 5–6× in `daysmog` — or depth banding does not exist and §3.0's entire
> mechanism is gone.**

**This does not brighten the frame, and that is the point.** Fog colour is the colour of the *far
plane*, not the colour of the frame: `fogFactor = smoothstep(fogNear, V, d)` is near zero across the
near field, so raising the fog colour lifts *only* the distant bands. The near field stays as black
as it ever was. The frame stays mostly black through the buildings, the grade lift and the low
exposure — never through the fog, which is the one place darkness costs us the thing we are
building. Sanity check at `deepnight`, a tower at 400 m depth in clean air: `smoothstep(60, 900, 400)
= 0.359`, so that silhouette sits at `0.359 × 0.125 = 0.045` sRGB luminance — still under 5 % — while
one at 800 m sits at `0.961 × 0.125 = 0.120`. **Two clearly separable bands, both under 12 % grey.**
That is the whole trick.

**P1a gate for this**: render `fog_city` at `deepnight`, sample three towers at roughly 300 m, 600 m
and 850 m depth, and assert their mean luminances increase monotonically with a gap of at least 0.03
between each. That is a scriptable check, and it is exactly what §3.0 is claiming.

Forced with `?var=<id>` or `?time=<h>`. Every shot scenario pins one.

### 4.2 Fog model — linear base plus a height term

`THREE.Fog` (linear), not `FogExp2`: we need independent near/far control per variant, and the
smog band needs a hard-ish top.

> **Fog colour must be measurably lighter than the shell material — 2.5–4× its sRGB luminance at
> night, 5–6× in `daysmog`.** See §4.1.1. This is the one number in §4 that the entire look depends
> on, and it is the one a builder is most likely to "correct" downward.

Then the part that does the work. A shared `patchFog(material, mode)` helper rewrites the fog term.

**The vertex half.** `vWorldPosition` is not a varying three.js gives us on `MeshStandardMaterial`
— it is declared only under `#ifdef USE_TRANSMISSION` (verified: `ShaderLib.physical.vertexShader`
lines 3 and 40), and `MeshStandardMaterial` has no `transmission` property at all, so injecting the
varying is safe with no redeclaration conflict. The patch injects the declaration and, **after
`#include <worldpos_vertex>`**:

```glsl
vWorldPosition = worldPosition.xyz;
```

That is the whole vertex patch, and it is correct for instancing *for free*, because
`worldpos_vertex` already does the instanced transform:

```glsl
vec4 worldPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  worldPosition = batchingMatrix * worldPosition;
#endif
#ifdef USE_INSTANCING
  worldPosition = instanceMatrix * worldPosition;
#endif
worldPosition = modelMatrix * worldPosition;
```

(verbatim from the pinned build). `worldPosition` exists whenever `USE_ENVMAP` is defined, and every
lit material in this game has an `envMap`, so it is always there. **Do not hand-roll it.** The first
draft's prose warned that "for instanced meshes this must use the instanced-transformed position"
and then gave the code as `vWorldPosition = (modelMatrix * vec4(transformed,1.0)).xyz;` — which is
precisely the version that fogs every building in the city as if it were at the origin. A builder
copying that block ships the bug the paragraph above it predicts. For any material without an
`envMap`, use the explicit form instead:

```glsl
#ifdef USE_INSTANCING
  vWorldPosition = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
#else
  vWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
#endif
```

**The fragment half must replace the whole `#include <fog_fragment>`, not inject into it.** The
chunk declares `fogFactor` and consumes it in the same three lines — verified verbatim at
`three.module.js:13910`:

```glsl
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
```

— so there is nowhere to "inject between the two". The replacement body, and note that it scales the
fog **distance**, not the fog **factor**:

```glsl
#ifdef USE_FOG
  float y   = vWorldPosition.y;
  float sm  = 1.0 - smoothstep( uSmogTop, uClearY, y );   // 1 in the murk, 0 in clean air
  float k   = mix( uClearMul, uSmogMul, sm );
  float V   = fogNear + ( fogFar - fogNear ) / k;         // effective visibility, §3.2.1
  float fogFactor = smoothstep( fogNear, V, vFogDepth );
  // ... one of the three terminations below ...
#endif
```

Defaults: `uSmogTop = 90`, `uClearY = 260`, `uSmogMul = 2.2`, **`uClearMul = 1.0`** (was 0.45).

**Why the distance and not the factor.** The first draft did
`fogFactor = clamp(fogFactor * k, 0.0, 1.0)`. Because `fogFactor` is a `smoothstep` that already
saturates at 1.0 at `fogFar`, multiplying it by `uClearMul = 0.45` caps the result at **0.45 at any
distance whatsoever** — above `uClearY` the fog never reached full opacity, ever, at any range. That
silently falsified three separate claims elsewhere in this document: §3.2's "culling is done by the
band scheme and by fog", §3.6's "beyond ~900 m the fog takes it entirely", and the LOD0 boundary
being hidden. Scaling the distance instead makes `V` a real number you can compute, gate on, and
interlock the LOD bands against — which is exactly what §3.2.1 now does. `uClearMul = 1.0` falls out
of that interlock; see §3.2.1 for the derivation.

The result is still exactly `746850_03` and `746850_08` — the canyon floor choked and unreadable at
442 m, the tower tops crisp to 900 m, and the transition a visible horizontal band across the whole
skyline, a depth cue *and* an altitude cue (§3.10 #5). It is ten lines of GLSL and it is the
highest-value shader work in the project.

#### 4.2.1 Three terminations, not one — additive materials must not use `mix`

`patchFog` must be applied to every lit **and** every emissive material; missing one produces a
building that ignores the smog and it is instantly obvious. But **one helper cannot serve all of
them**, and applying the stock `mix` to an additive material produces a glowing grey wash at
distance that a builder will not connect to the fog code.

| `mode` | used by | termination |
|---|---|---|
| `'opaque'` | shells, ground, hulls, cockpit — anything lit and depth-writing | `gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );` (the stock line) |
| `'additive'` | `signsNeon`, strobes, traffic streaks, halos, light shafts, zone volumes, thruster, the mirror group | `gl_FragColor.rgb *= ( 1.0 - fogFactor );` |
| `'alpha'` | `signsBox`, the water film, rain, distant silhouettes | `gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor ); gl_FragColor.a *= ( 1.0 - fogFactor );` |

The reasoning for `'additive'`: `AdditiveBlending` *adds* the fragment to the framebuffer, so
`mix(colour, fogColor, f)` adds `fogColor × f` of grey haze on top of whatever is already there —
distant neon gets **brighter and greyer** as it recedes, which is the exact inverse of what fog is
for. Multiplying by `1 − fogFactor` fades it toward adding nothing, which is what "distance" means
for a light source.

The reasoning for `'alpha'`: a normally-blended lightbox that is fully fogged becomes a solid
`fogColor` rectangle at its own alpha — a visible grey card floating in the haze. Fading alpha as
well makes it disappear into the fog like everything else.

**This is the most likely bug in the whole rendering plan; check it first if the fog looks wrong** —
and check the *mode* before you check the maths.

### 4.3 "Daytime but still dark"

`1091500_08` is the target and it is worth being precise about why it works, because the instinct
when told "make it daytime" is to raise the ambient and lose everything.

What is actually in that frame: the *sky* is bright — a flat, blown, colourless white-grey with no
gradient and no blue whatsoever. The *buildings* are still near-black; the tower reads as a
silhouette with a few rust-and-teal panels. There is heavy particulate haze on the deck, and one
sickly yellow-green smoke source. Contrast is low, blacks are lifted, and saturation is almost gone
except where a light source is doing it.

So `daysmog` is built as five specific choices:

1. **Sky gradient**: 0x585048 at the zenith to 0x3b3a3e at the horizon. Warm-grey to cool-grey.
   There is no blue channel dominance anywhere in the palette, and a builder must not add one.
2. **Fog far pulled IN to 520 m** (from 900), **in `0x4a4b50`** — the lightest fog of the five, at
   6.3× the shell luminance (§4.1.1). This is the counter-intuitive one: in daylight the haze is
   *brighter*, so it hides more, not less. Reduced draw distance is a look choice here as well as a
   performance one, and at `V = 520` fog does the entire LOD0 job on its own (§3.2.1).
3. **Ambient stays low**: hemi 0.42, directional 0.55 in 0xb8ab96 at 22° elevation. Buildings remain
   silhouettes.
4. **Neon dimmed to 0.62 but never off.** Signs stay on. Windows dim. This is what keeps the frame
   from going flat — there is still saturated light in it, just less.
5. **The grade crushes contrast**: `gradeLift = 0.055` (blacks lifted off zero), `gradeGain = 0.88`,
   saturation ×0.72. That plus the raised fog is the whole "drained" feeling.

Plus light shafts (§4.5), which are the only place daylight is allowed to be interesting.

**No shadows, in any variant.** The scene has no directional light strong enough to cast a
believable shadow in four of five variants, and in `daysmog` the sun is diffused by definition. A
shadow map would cost 1.5–3 ms and a whole class of acne/peter-panning bugs to produce something the
reference plates do not contain. `renderer.shadowMap.enabled = false` permanently. Contact grounding
comes from the wet-ground reflection and from a small dark radial decal under docked craft.

### 4.4 Bloom, and what `?lite=1` replaces it with

`UnrealBloomPass`, `strength 0.85`, `radius 0.55`, **`threshold 0.90`**.

**Half resolution is not an option we are choosing; it is what the class does.**
`UnrealBloomPass.setSize(w, h)` does `Math.round(w / 2)` unconditionally and then quarters down the
mip chain (verified: `UnrealBloomPass.js:184–193`), and the `resolution` vector passed to the
constructor is overwritten by `EffectComposer.setSize()` on the first resize. So there is nothing to
configure and nothing to credit; running at quarter res would require subclassing `setSize`. What we
*do* choose is to **clamp the input**: our subclass caps at `min(w, 768) × min(h, 1664)` regardless
of dpr, because bloom is low-frequency by definition and nobody has ever seen a bloom halo alias.
That is where the 3.5 ms → 1.3 ms in §3.11 comes from.

**The threshold is in pre-tone-map linear scene light, and it has to be re-derived, because the
number it replaces was reasoned in display terms.** §4.6 moves ACES into the grade pass, which runs
*after* bloom, so the high-pass sees the raw linear HDR buffer. `LuminosityHighPassShader` does
`smoothstep(threshold, threshold + smoothWidth, dot(texel.rgb, vec3(0.299, 0.587, 0.114)))` with
`smoothWidth` hardcoded to **0.01** (verified: `UnrealBloomPass.js:78`) — a knee 1 % wide, i.e. a
hard cut. So the threshold has to sit cleanly above the brightest thing that is *not* a light
source, and below the dimmest thing that is.

| what | linear luminance | |
|---|---|---|
| lit shell surface (albedo `0x0a0c11` × hemi 0.06–0.42) | < 0.002 | never blooms ✓ |
| `deepnight` fog at full opacity (`0x1c2029`) | 0.015 | |
| `daysmog` fog at full opacity (`0x4a4b50`) | 0.071 | |
| `daysmog` sky dome, zenith (`0x585048`) | 0.084 | the brightest non-source in the game |
| a light shaft card at full additive opacity | ~0.3–0.5 | should **not** hard-bloom; bloom spreads it, it does not trigger it |
| an emissive window at `uNeon = 1.0` | 1.0–3.0 | must bloom ✓ |
| a neon sign at `iIntensity` 1–4 | 1.0–4.0 | must bloom ✓ |

**0.90** sits above every non-source with a factor of 1.8 over the brightest of them and below every
source. The first draft's 0.62 was justified as "in a mostly-black frame almost nothing is above
0.62" — a sentence about a *display-referred* frame — and it would have caught the light shafts and
part of the `daysmog` sky, smearing exactly the two things that are supposed to be soft already.
(For reference, post-ACES 0.62 at exposure 1.0 corresponds to linear 0.60, so the coincidence that
made the old number nearly work is real but is not a reason to keep it.)

Exposure is applied in the grade pass *after* bloom (§4.6), so the per-variant exposure swing of
0.86–1.06 does not move what blooms. Per-variant *strength* still does the shaping:
`deepnight 0.95, predawn 0.85, daysmog 0.55, duskburn 0.90, stormnight 1.05`.

**LOW has no composer bloom.** The substitute is **halo sprites**: the sign, strip and strobe
instanced fields each get a second instanced draw of the same buffers, using a generated 64²
radial-gradient alpha texture, additive, `opacity 0.40`, `depthWrite: false`. On a black frame it
genuinely reads as bloom — because bloom on a black frame *is* a halo around a point source. Built
in P3b alongside the real thing, never bolted on later.

**But it must be bounded, and the first draft's version was not.** At 2.5× scale over all ~2,800
instances (900 signs + 1,200 strips + 700 strobes) that is 6.25× the area of the entire signage
field, additive, and it scales with how many signs happen to be on screen — on the weakest device,
replacing bloom, which is a *fixed* cost. It could plausibly cost more than the thing it replaces.
So:

- Cap to the **nearest 400 signs, 500 strips, 300 strobes** — the halo field sorts by distance once
  per second, not per frame, and the cap is a slot range in the existing buffers, so it is free.
- **1.8× scale, not 2.5×** (3.24× area rather than 6.25×).
- **P3b gate, and it is a real gate**: measure LOW *with* halos against LOW *without*, over the same
  60 s `?auto=1` flight. **If halos cost more than the bloom they replace, the substitution has
  failed and LOW ships bloom-less** — which is a legitimate look, not a defeat. Put both numbers in
  the P3 handoff either way.

### 4.5 Light shafts

**Four cards (one on LOW), not eight.** Each is a soft-edged elongated quad with a generated 128×512
gradient texture, `depthWrite: false`, `renderOrder: 6`.

- Anchored to gaps between near-ring towers, chosen at chunk load from the widest gaps. **That makes
  their placement a P3 item, not P1** — chunks do not exist until P2. P1 builds the card geometry,
  the material, the gradient texture and the view-dot term against a fixed debug anchor; P3 hooks
  the anchors to real chunk gaps.
- Oriented along the variant's `dirAz/dirEl`, so they always agree with where the light is coming
  from.
- Opacity multiplied by `pow(saturate(dot(viewDir, -sunDir)), 2.5)` so they bloom when you look
  toward the light and vanish when you look away. Without that term they look like painted-on
  cardboard from the wrong angle.
- **Any card whose view-dot term falls below 0.05 sets `visible = false`.** Fading it is not enough
  and this is the whole reason the count came down: a nearly-transparent additive card still
  rasterises and shades every pixel it covers. Opacity is not a cost lever; visibility is.
- `fog: false` was in the first draft and is **wrong** — a shaft anchored 400 m away should recede
  like everything else. They take §4.2.1's `'additive'` fog mode.
- Amount driven by the variant's `shafts` value: `daysmog` 1.0, `duskburn` 0.7, `predawn` 0.4,
  `deepnight` 0.0, `stormnight` 0.15.

**Why four.** Eight large additive cards each covering 25–35 % of frame is ~2.4 screens of alpha
blend on a 1.34 Mpx target — roughly 7 M blended fragments with a texture fetch each, which is
0.6–1.5 ms, not the +0.15 ms the first draft carried. Four cards at ~0.3 screens each is 1.2 screens
≈ 0.42 ms, plus the fetch and the depth-fade term: **0.55 ms** (§3.11). Shrink the cards and let
bloom spread them — bloom is a fixed cost and the cards are not.

This is the "a tiny bit of daylight might sometimes get through" line in the brief, and it is
essentially the only reason `daysmog` is worth looking at.

### 4.6 Tone map and colour grade

**The pipeline order, and getting it wrong ships a game with no tone mapping at all.**

```
RenderPass  →  UnrealBloomPass  →  grade ShaderPass (renderToScreen)
   linear HDR      linear HDR         ACES + grade + sRGB → the screen
```

`renderer.toneMapping = THREE.NoToneMapping` (§2.3). **ACES lives in the grade pass and nowhere
else.** Setting `ACESFilmicToneMapping` on the renderer while rendering through a composer does
literally nothing — the renderer only compiles the tone-mapping define when `_currentRenderTarget`
is `null`, verified at `three.module.js:30147–30155`, and with a composer it never is. That is the
reason `OutputPass` exists and applies ACES itself; we are replacing `OutputPass`, so we inherit the
job. Left as the first draft had it, the game would have shipped a linear frame with clipped neon
and no filmic shoulder — on a mostly-black image full of saturated point sources, which is the worst
possible content for it.

The grade `ShaderPass` does six things, **in this order**:

1. **Exposure.** `c *= uToneExposure` — per variant (1.00 night, 0.86 `daysmog`, 1.06 `duskburn`),
   driven by `sky.js` and by the settings slider (0.8–1.4). This has to be a pass uniform, because
   `renderer.toneMappingExposure` is inert under `NoToneMapping`.
2. **ACES.** Copy `<tonemapping_fragment>`'s `ACESFilmicToneMapping()` body, or `#include` the
   chunk. Note that three's version folds exposure in as `color *= toneMappingExposure / 0.6`, so if
   you inline the function keep the `/ 0.6` — it is not a typo, it is the ACES reference exposure
   and dropping it darkens the whole game by a stop.
3. **Lift / gamma / gain**, three vec3 uniforms from the variant.
4. **Split tone** — push shadows toward teal (0x0d2a33) and highlights toward magenta (0x2a0d1f) by
   `gradeSplit` (0.10–0.22). This is the `1488490_00` / `746850_08` grade direction, and it is what
   makes a near-monochrome dark image feel like a photograph rather than an underexposed render.
5. **Vignette**, `1.0 - 0.28 * pow(r, 2.4)`, and **blue-noise dither**, ±1/255, from a generated 64²
   noise texture tiled in screen space. The same noise texture feeds §3.2.2's LOD cross-fade.
6. **`gl_FragColor = linearToOutputTexel( gl_FragColor );`** — the sRGB encode. This is the exact
   body of three's `colorspace_fragment` chunk, so `OutputPass` must **not** also be added.

Steps 3–5 are display-referred and must come *after* ACES; the first draft's list had the grade
operating on whatever the renderer happened to hand it, which was linear.

Item 5's dither is not optional and is **kept in LOW**. In a frame that is 80 % near-black gradient,
8-bit banding is visible on every phone, it looks like a bug, and it is precisely what a critic marks
under "Finish". A ±0.5 LSB dither removes it completely for ~0.05 ms.

Cost of the whole pass: **~0.35 ms** at full res — one full-screen quad, three texture fetches
(scene, bloom is already composited in, noise), and about forty ALU ops.

**P1a gate**: render the same shot with the grade pass's ACES step forced off and on. If the two
images are identical, ACES is not running and the pipeline order is wrong — which is exactly the
failure this section exists to prevent, and it is invisible without the A/B.

---

## 5. Vehicles

### 5.1 One curve language

All nine craft come from one generator in `craft.js`. It lofts a hull along **11 stations** from nose
(`t=0`) to tail (`t=1`), each station a superellipse ring of **12 points**:

```
halfW(t) = W * (0.18 + 0.82 * pow(sin(PI * pow(t, 0.72)), 0.85))
halfH(t) = H * (0.22 + 0.78 * pow(sin(PI * pow(t, 0.80)), 1.15)) + canopy(t)
n(t)     = 2.4 + 1.6 * smoothstep(0.15, 0.55, t)        // superellipse exponent
canopy(t)= H * 0.30 * smoothstep(0.28,0.40,t) * (1.0 - smoothstep(0.52,0.62,t))
x(t)     = L * (t - 0.5)
```

The nose is round and tapered, the midsection carries a canopy bulge, the tail is squarer and harder
— that is the shared language, and it is why every craft is recognisably from the same world. Ring
resolution 12 → 132 verts, ~240 triangles for the hull.

Added from a shared parts library: a canopy cap (clipped superellipse, 60 tris), a nacelle pod (40
tris, instanced 2 or 4 times), a tail fin (12 tris, 0/1/2), a belly plate (16 tris).

**Variation is L / W / H plus three integer options only** — nacelle count, fin count, canopy
fraction. That is exactly the brief's "length / height / width only". No bespoke silhouettes.

### 5.2 The family

| id | L | W | H | nac | fin | role | slots | top m/s |
|---|---|---|---|---|---|---|---|---|
| `wisp` | 5.4 | 2.0 | 1.15 | 2 | 1 | starter courier | 2 | 62 |
| `kestrel` | 6.2 | 2.4 | 1.50 | 2 | 1 | all-rounder | 3 | 66 |
| `lance` | 6.6 | 1.8 | 1.00 | 2 | 2 | racer | 2 | 84 |
| `drayman` | 7.8 | 2.6 | 1.90 | 4 | 1 | hauler | 4 | 54 |
| `nocturne` | 6.8 | 2.2 | 1.35 | 4 | 0 | premium, silent running | 3 | 72 |
| `mammoth` | 10.5 | 3.4 | 2.40 | 4 | 2 | freighter | 6 | 46 |
| `taxi_ai` | 6.0 | 2.2 | 1.40 | 2 | 1 | traffic only | — | — |
| `hauler_ai` | 9.0 | 3.0 | 2.10 | 4 | 1 | traffic only | — | — |
| `patrol` | 7.0 | 2.5 | 1.50 | 4 | 2 | police — the light exception, **traffic only** | — | 78 |

`patrol` is an **ambient traffic variant and nothing more** (`DECISIONS.md` decision 6). It flies
the same lanes as `taxi_ai` and `hauler_ai`, at a lower spawn weight, and the only thing that makes
it a police craft is its light rig (§5.4) and the fact that the radio talks about it (§11). **It
never reacts to the player, never follows, never scans, and there is no heat system for it to react
to.** Do not give it behaviour; the entire adversarial layer was cut before P0.

### 5.3 Materials

**One** hull material shared by every craft in the game:

```js
new THREE.MeshStandardMaterial({ color: 0x0a0b0e, metalness: 0.92, roughness: 0.16, envMap: sky.env })
```

plus the fresnel-rim patch of §3.7(c). Per-instance tint via `InstancedMesh.setColorAt` for the few
that are not black — traffic taxis get a dull ochre 0x3a2d16, the police hull stays black.

Canopy glass: `MeshStandardMaterial({ color: 0x05070a, metalness: 1.0, roughness: 0.05, envMap,
transparent: true, opacity: 0.55 })`. Not `MeshPhysicalMaterial` — transmission is a second render
target and is not happening on a phone.

Total: **3 materials for every vehicle in the world** (hull, glass, lights).

### 5.4 Lights — shared rig, one exception

The brief: lights are shared across civilian types; special vehicles are the exception. So the rig
is authored once in **normalised hull coordinates** and scaled by that craft's L/W/H, which means
adding a new craft never means placing lights.

| role | position (normalised) | colour | behaviour |
|---|---|---|---|
| forward lamps ×2 | `t=0.06`, `±0.55W`, `0.0H` | 0xdfeaff | steady, plus a soft additive cone 14 m long |
| tail strips ×2 | `t=0.97`, `±0.70W`, `+0.15H` | 0xff2b3a | steady, brighten 2× under braking |
| belly strobe | `t=0.55`, `0`, `−0.90H` | 0xffb04a | 1.4 Hz, 60 ms on |
| thruster discs ×n | at each nacelle, aft face | 0x35d6e8 | scale and brightness track throttle |
| edge rule | along the hull chine, `t` 0.25→0.85 | district tint at 0.25 | steady — the `1939970_00` hairline |

All of the above are unlit additive quads/discs in **one `InstancedMesh` per role**, shared across
every craft in the scene, so the whole city's vehicle lighting is 1 draw call.

**Police override**: `patrol` replaces the tail strips and belly strobe with a roof bar alternating
red 0xff2b3a / blue 0x2b5cff at 2.2 Hz, and adds a 40 m additive sweep cone. This is the *only*
per-type light data in the game.

**Thruster**: a stretched additive cone (12 tris) whose length is `1.2 + 5.0 * throttle` metres and
whose colour shifts cyan → white at boost, plus two ribbon trail quads that fade over 0.6 s while
boosting. The blue thruster bells in `1939970_00` are the target; they are the single most
recognisable feature of the hero plate and they are 3 quads.

### 5.5 Traffic — where the line is

| band | representation | count | draws |
|---|---|---|---|
| 0–220 m | **real meshes**, instanced, full light rig, lane-following with player yielding | ≤ 26 (10 on LOW) | 3 |
| 220–900 m | **instanced light streaks** — one stretched additive quad per craft, warm one direction, cool the other, length ∝ speed | 900 (320 on LOW) | 1 |
| > 900 m | nothing; fog has eaten it | — | 0 |

The line is at **220 m** because that is roughly where a 6 m craft stops being resolvable as a shape
at our FOV and becomes a smear of light — which is exactly what `746850_03` and `1939970_10`'s
traffic lanes look like. Past that point real geometry buys nothing.

Streaks are advanced analytically — `s += speed*dt` along a lane parameter, wrapped — with no AI, no
collision and no allocation. 900 instances cost one matrix write loop per frame (~0.25 ms) and one
draw call.

**Lanes**: 14 polylines through the district grid at the altitudes in §3.10 #2, deterministic from
`WORLD_SEED`, two directions per altitude. Near craft follow the lane with a 2 m lateral wander and
a `yield` behaviour that adds up to 12 m/s² of lateral acceleration away from the player inside 25 m
— so traffic gets out of your way, because the brief says there is no crashing as a fail state.

---

## 6. Flight model and controls

The requirement is "flying should feel extremely easy". That is a design constraint with a
mechanism, not a vibe. The mechanism is: **attitude is a decoration, not a state variable.**

### 6.1 The scheme

- **Movement half** (left by default, flippable in settings): finger down anywhere creates a
  floating stick with its origin at the touch point, radius **64 px**, with origin-drag past the
  ring so it never feels stuck (copy `voidcast/js/controls.js:_compute()` — it already does this).
  - Stick **Y** → forward / reverse thrust along the craft's heading.
  - Stick **X** → lateral strafe.
  - **The stick has no dedicated altitude axis.** Neither of its two axes is a climb axis, which is
    deliberate: coupling altitude to a thumb stick is the single biggest source of "I can't fly
    this" in mobile flight games. Altitude changes only from the `▲`/`▼` buttons and, indirectly,
    from the pitch component of look-relative flight below — the two are not in conflict and the
    look-relative version is the one that wins, because it is what makes flying feel free.
- **Look half**: finger down → drag to look. Yaw and pitch, no roll ever.
- **Altitude**: two buttons, `▲` and `▼`, bottom outer corner of the **look** half, 56 px, so the
  look thumb can reach them without lifting. Held = climb/descend. Released = **altitude hold**.
- **Boost**: a third button above the altitude pair, or a double-tap-and-hold on the movement half.
- **Look-relative flight**: the craft's heading chases the camera yaw at 2.6 rad/s, and forward
  thrust is applied along that heading *including its pitch component*, clamped to **±35°**. So
  pushing forward while looking up climbs, while looking down descends — and you can never end up
  pointed straight at the ground.

### 6.2 The numbers

| | value | note |
|---|---|---|
| `MAX_FWD` | 62 m/s | cruise; per-craft, see §5.2 |
| `MAX_BOOST` | 105 m/s | 2.2× cell drain |
| `MAX_REV` | 18 m/s | |
| `MAX_STRAFE` | 26 m/s | |
| `MAX_VERT` | 22 m/s | |
| `ACC_FWD` | 46 m/s² | |
| `ACC_STRAFE` | 30 m/s² | |
| `ACC_VERT` | 22 m/s² | |
| `DAMP_ACTIVE` | 0.9 /s | **applied only to velocity components that are not being commanded** — see below |
| `DAMP_RELEASE` | 4.5 /s | |
| `DAMP_VERT_RELEASE` | 6.0 /s | |
| `STOP_SNAP` | 0.6 m/s | below this, velocity is zeroed outright |
| `ALT_HOLD_DELAY` | 0.25 s | after the last altitude input |
| `ALT_HOLD_KP / KD` | 3.2 / 3.6 | PD, output clamped ±14 m/s² |
| `YAW_SENS` | 0.0042 rad/px | ×0.5–2.0 settings slider |
| `PITCH_SENS` | 0.0034 rad/px | deliberately lower than yaw — vertical flick is more disorienting |
| `PITCH_CLAMP` | ±62° | camera; thrust pitch is separately clamped to ±35° |
| `LOOK_SMOOTH` | 22 /s | exponential |
| `ALT_MIN / ALT_MAX` | 4 m / **760 m** | soft assists at both ends; haze warning from 620 m |

**Damping and the top speeds, with the arithmetic — because as first written they contradicted each
other.** If `DAMP_ACTIVE = 0.9 /s` is applied to the whole velocity while the stick is held, terminal
velocity is `ACC_FWD / DAMP_ACTIVE = 46 / 0.9 = 51 m/s`, which is **below** `MAX_FWD` 62. `MAX_BOOST`
105 would need ~95 m/s² of acceleration to reach at all. The entire "top m/s" column in §5.2 (46–84,
with `lance` at 84) would have been decorative, and a builder would have had to invent the fix.

**The rule: `MAX_*` are hard clamps, and `DAMP_ACTIVE` applies only to the axes not being
commanded.** Push forward and forward accelerates at a clean 46 m/s² until it clamps at that craft's
`MAX_FWD` (2.0 s from rest at 92 m of travel); meanwhile any residual lateral or vertical velocity
still bleeds off at 0.9 /s, which is where the sense of weight comes from without any of it fighting
the input. Release and every axis switches to `DAMP_RELEASE`. Boost raises the clamp to `MAX_BOOST`
and is reached in `(105 − 62) / 46 = 0.93 s`. Per-craft `MAX_FWD` is the §5.2 column; `ACC_FWD`
scales with it as `ACC_FWD = 0.74 × MAX_FWD` so every craft has the same 1.35 s feel from rest to
cruise regardless of top speed.

**`ALT_MAX` is 760 m, not 520 m.** `pale` reaches 700 m and `vault` 620 m, so a 520 m ceiling puts a
hard invisible wall below the top of a third of the skyline — in a game whose entire subject is a
very tall city. 760 m clears the tallest prototype with 60 m to spare. The haze warning and the soft
downward force start at 620 m; the hard clamp is 760 m. This also changes the minimap's altitude
ring band (§8.6) and §6.3 item 5.

**Auto-stop, with the arithmetic.** With `DAMP_RELEASE = 4.5 /s`, speed decays as `v·e^(−4.5t)`.
From 62 m/s: half speed at 0.154 s, under 5 m/s at 0.56 s, under the 0.6 m/s snap at **1.03 s**.
Then the snap zeroes it. That is the brief's "finger off = auto-stop, quickly", and it is a number a
test can assert — P4 gate: from full cruise, release, and `__state.player.speed === 0` within
**1.2 s**.

### 6.3 The assists

1. **Auto-level (cosmetic).** Visual bank is `clamp(−lateralAccel * 0.022, ±0.5 rad)`, visual pitch
   is `clamp(−forwardAccel * 0.010, ±0.22 rad)`, both damped toward the target at 5.0 /s and toward
   zero within 0.5 s of release. **Velocity never reads the visual attitude.** This is the core
   guarantee: the craft can look like it is banking hard while the physics is a damped point mass.
2. **Altitude hold.** Engages 0.25 s after the last `▲`/`▼` input *and* whenever stick Y is zero. A
   PD controller holds the altitude you were at. You can leave the game running and it hovers.
3. **Proximity repulsion.** Within 12 m of any near-ring building AABB, an extra acceleration along
   the surface normal of up to 18 m/s², scaled `(1 − d/12)²`. The effect is that you *slide along*
   facades instead of stopping dead against them — this is what makes flying between towers feel
   good rather than sticky.
4. **Collision softening.** A 3.2 m capsule against the LOD0 AABB set, queried through a 32 m spatial
   hash (~6 candidates). On penetration: push out along the shallowest axis, zero the velocity
   component into the surface, apply 0.35 restitution, play the scrape sound, shake the camera for
   0.18 s, flash a red edge on the cockpit frame. **No damage, no fail state, ever.** Integrity is
   cosmetic and only affects the repair line item in the shop.
5. **Floor and ceiling.** Below 4 m an upward assist ramps to 20 m/s². Above 620 m a haze warning and
   a soft downward force; hard clamp at 760 m.
6. **Cell empty.** Speed limps to 12 m/s, a toast fires, and the nearest CHARGE zone gets a free tow
   offer. **The tow is free and it restores 15 units of cell, also free** — see §7.4. Without that
   second half, a player who runs the cell flat with no credits is stranded with a tow animation,
   which is a fail state wearing a hat, and §1 item 11 says there are none.

### 6.4 Desktop fallback

| input | action |
|---|---|
| `W` `S` / `↑` `↓` | forward / reverse |
| `A` `D` / `←` `→` | strafe |
| `Space` / `C` | climb / descend |
| `Shift` | boost |
| mouse drag anywhere (or click for pointer lock) | look |
| `F` | dock / undock |
| `Tab` | job board |
| `M` | map |
| `Esc` | pause |

Detection is `(pointer: coarse)` for the touch layout, not user agent — but the CDP harness overrides
the user agent for mobile runs, so both must agree. Both layouts can be active simultaneously; a
laptop with a touchscreen gets both and nothing breaks.

### 6.5 Settings that affect flight

Movement side (left/right), look sensitivity (0.5–2.0), invert pitch, altitude button size
(48/56/68 px), camera mode (chase / cockpit), field of view (58–78), assists (on / reduced — reduced
halves the proximity repulsion for players who want it), exposure (0.8–1.4), quality
(auto/high/low), SFX, music, chatter, chatter hold time (normal / long / very long).

---

## 7. Docking, missions and economy

### 7.1 Zones

Six types. Colour is the primary identifier and it is consistent everywhere — world volume, minimap
dot, HUD marker, panel accent — **and it is never the *only* identifier**, see the glyph rule below.

| type | colour | glyph | purpose |
|---|---|---|---|
| `PICKUP` | cyan `0x35d6e8` | ▽ | collect a parcel from a client |
| `DROP` | green `0x6cff9c` | △ | deliver |
| `CHARGE` | amber `0xffb04a` | ◇ | refill the cell, **2.2 CRD/unit** (§7.4) |
| `WORKSHOP` | magenta `0xff3fa4` | ⬡ | buy craft, buy upgrades, repair |
| `HUB` | ice `0xdfeaff` | ⌂ | home pad — job board, save point |
| `RUSH` | red `0xff2b3a` | ⚡ | high-pay, tight timer |

**`RUSH`, not `HOT`.** The zone type is unchanged in every respect except the one that made it
"hot": it pays **2.2×** and it has a tight timer, and it no longer raises anything, because there is
no heat system (`DECISIONS.md` decision 6). No pursuit, no impound, no penalty for failing the
timer beyond losing the bonus. It is a fast job, not a dangerous one.

**Colour is not the only identifier.** Six types including green, red and amber makes the world
markers and minimap dots unusable for roughly 8 % of male players. The world volume already carries
a floating glyph and the right holo panel already carries a type glyph — so **carry the same glyph
onto the minimap dot and the HUD marker** and the problem disappears at zero cost. It is one
`fillText` in `minimap.js` and one character in the marker's DOM.

**The volume**: a 14 m radius, 26 m tall cylinder. `MeshBasicMaterial`, additive, `depthWrite: false`,
`side: DoubleSide`, with a scrolling vertical gradient texture (a 32×256 canvas, `offset.y -= 0.25*dt`),
plus a ground ring, six vertical pillar strips and a floating glyph 18 m up. Two draw calls each.

**Only the nearest `Q.zonesDrawn` volumes are drawn — 3 on HIGH, 2 on LOW.** The first draft had up
to 8 active, which is 16 draws (20 % of the entire draw budget) and, more importantly, 8 `DoubleSide`
additive cylinders each at 2× overdraw — for something you can only ever be near one of. Zones
beyond the nearest 3 reduce to their world marker, which is what you actually navigate by. And when
the camera is *inside* a cylinder, that one switches to `side: FrontSide`: you are looking at the far
wall, the near wall is behind you, and drawing it doubles the fill on the frame where the cylinder
fills the screen.

**World marker**: a vertical light column at the active job's destination, `depthTest: false` at 0.14
opacity so it is visible *through* buildings, plus a solid segment where it is actually in line of
sight. The single most important navigation aid in a vertical city.

Zone placement is deterministic per chunk: every chunk has a 22 % chance of a pad, always on a
building roof or a ledge, biased toward the district's tier, and **subject to §3.1.1's landmark
keep-out**. `HUB` is one fixed pad on the `spindle` landmark's 92 m podium deck (§3.1.1) — *not* at
the bare world origin, which chunk (0,0) would otherwise fill with 28 seeded buildings. `WORKSHOP`
and `CHARGE` are placed on a coarser grid so there is always one within ~700 m; §7.4's charging
rhythm depends on that number, so do not loosen it.

**Client ↔ pad assignment.** Each `PICKUP` pad's client is `clients[hash2i(cx, cz, CLIENT_SALT) % clients.length]`
— derived from the world seed, never stored, so it is stable across a reload exactly like the
buildings are. It is also why `clients.json`'s length is the only thing that needs to change to add
clients (§9.1).

### 7.2 Docking

**Enter** — all three true: inside the cylinder, speed < 3.5 m/s, held for 0.6 s. Then:
1. Ring closes with a sound (`js/audio.js:dockLock`, a 3-note descending sine + a click).
2. Controls lock; the craft is eased to the pad centre and to level attitude over 0.5 s
   (`camera.js:dockEase`).
3. The docking panel slides in.

There is also a `DOCK` button that appears in the HUD whenever you are inside a zone, for players who
would rather press a thing. Both paths run the same code.

**Exit** — the `UNDOCK` button, or `F` on desktop. Panel slides out over 0.22 s, control returns as
soon as it starts moving, and a 1.2 s re-dock grace prevents an instant re-entry.

### 7.3 The docking panel

This is the main UI of the game and the brief says it must look outstanding. It gets its own review
at the P7b boundary — it is a phase of its own (§13).

**Information architecture** — three blocks, in this order, because it is the order a player asks the
questions in: *who is this? what do they want? do I take it?*

**Portrait layout**
```
┌──────────────────────────────────────┐
│  ▸ CLIENT                            │  kicker, 10px, letterspaced, zone-tint
│  ┌────────────┐  MARA VELLS          │  hex-clipped 288×288 video (poster = the
│  │   [video]  │  ◇ TALLOW SYNDICATE  │  Flux still), 1px neon edge, scanline
│  │            │  ●●●●○  reliability  │  overlay, 2s "signal acquired" wipe on open
│  └────────────┘  "You're late. It    │
│                   happens."          │
├──────────────────────────────────────┤
│  ⬡ SEALED CRATE — 2 slots            │  parcel, icon + name + slot cost
│  → THE RIBS · Kell's Rest            │  destination district · pad name
│  1.8 km        ⏱ 1:05      ⚠ LOW     │  distance / limit / risk chips
│  ────────────────────────────────    │
│  PAYMENT            415 CRD          │  large, tabular numerals
│  + under 0:42                +45%    │  bonus lines, dimmed until earned
│  + chain (1 held)            +12%    │
├──────────────────────────────────────┤
│  [        ACCEPT        ]            │  full-width, zone-tint fill
│  [ HAGGLE ]      [ DECLINE ]         │  ghost buttons
└──────────────────────────────────────┘
```

**Landscape**: identical DOM, a CSS grid switch at `@media (orientation: landscape)` puts the media
block in the left column and the deal + actions in the right. No JS branch.

**Every number in that mock is produced by §7.4's formula and must stay that way.** `415` is
`round5(180 + 130 × 1.8 + 60 × 0)`; `0:42` is 65 % of the 1:05 limit, which is where the time bonus
saturates; `+45%` is that saturated bonus and `+12%` is one chained parcel.

**The limit numbers here were 3:20 and 2:10 and were corrected at integration (defect D1).** The
original pair came from §7.4.6/§7.4.7's two pinned points, `limit = 60 + 77.8·km`, which gives a
1.8 km job 200 s for 29 s of flight — measured over ~5,500 deliveries, the time bonus was saturated
on **100 %** of them and the panel's bonus row could never read anything but +45 %. The limit is now
`20 + 26·km`, swept by `tools/sim_p7a.mjs` against a target distribution rather than hand-picked.
**The payment numbers are unchanged**: 415 and 650 are exactly what the code still produces. If a builder changes a
constant in §7.4, this mock changes with it — a panel showing a number the code cannot produce is
how the first draft ended up with a 5× discrepancy nobody noticed.

**Visual design rules** (these are what make it "outstanding", and they are all cheap):
- Sheet background `#080a0f` at 0.96 over a **static blurred still** of the city, so the city is
  still faintly visible behind it and the panel feels *in* the world.

  **Do not use `backdrop-filter` over the live canvas.** On mobile Safari a 24 px backdrop blur over
  a live WebGL canvas forces a full-resolution readback and blur on **every composited frame** —
  5–15 ms of it, on the main UI of a mobile-first game, for an effect that is not even moving. The
  city behind the panel is static anyway, because the craft is docked.

  The replacement is one line of work and looks identical: on the frame the dock is triggered,
  **immediately after `composer.render()` and inside the same rAF callback**, do
  `blurCtx.drawImage(renderer.domElement, 0, 0, 96, 208)` into a small offscreen canvas, then set
  that canvas' data URL as the panel's `background-image` with `background-size: cover`. The upscale
  from 96 px *is* the blur; no filter is needed at all, and one CSS `filter: blur(4px)` on top
  smooths the last of it for nothing. The in-frame timing matters: reading the WebGL canvas outside
  the rAF callback returns an empty buffer unless `preserveDrawingBuffer: true`, which we do not
  want and do not need.
- Exactly one saturated colour per panel — the zone's tint — used on the kicker, the accept fill, the
  1 px frame and the divider glow. Everything else is greys. This is the same discipline as the
  scene: colour is a light source.
- Type: one family (system stack), three sizes (10 / 14 / 28), one weight change. Tabular numerals
  on every number so the credits do not jitter.
- Motion: panel arrives as a 180 ms `scale(0.96 → 1)` + `blur(6px → 0)` + fade; content rows stagger
  40 ms each. All CSS keyframes, no JS animation loop.
- The media frame gets a 1 px inner neon edge, a 3 px outer glow of the same colour at 20 % alpha,
  and a `repeating-linear-gradient` scanline at 4 % over `mix-blend-mode: screen`.
- Nothing bounces. Nothing is round except the reliability chips.

**HAGGLE**: once per client per session. 55 % success → +15 % payment; failure → the job is withdrawn
and that client is cooled down for 5 minutes. It exists to make the panel a decision rather than a
confirm dialog.

### 7.4 The mission loop and the economy

The whole economy is re-derived here, with the arithmetic, because the first draft's version did not
close: `base = 40 + 26·km + 30·risk` pays **87 CRD** for the 1.8 km job whose own panel mock showed
**420**, while the fuel for that trip cost **~150 CRD** at 3 CRD/unit. A delivery lost the player
63 CRD. A builder implementing it as written would have watched the player go bankrupt and invented
its own numbers, which is exactly the decision this document exists to prevent.

#### 7.4.0 The targets the numbers are solved against

1. **A normal delivery is clearly profitable.** Fuel is **8–12 % of a job's base pay** — a real cost
   you notice, never a tax you resent.
2. **Charging is a rhythm, not an interrupt.** A cell lasts about **5 deliveries**, and a CHARGE pad
   is always within ~700 m (§7.1), so a top-up is a ~20 s detour roughly once every five jobs.
3. **Tier 2 lands at 6 ± 1 jobs and inside 8 minutes** — that is the §1 item 10 / P7a gate.
4. **Nothing can strand you.** §1 item 11 forbids a fail state, and running the cell flat with an
   empty wallet is one.
5. **Every number on §7.3's panel mock is produced by these formulas.**

#### 7.4.1 The cell

- `cell` is 100 units. Drain is **throttle-proportional**, which is the fix for target 4:

  ```
  drain/s = 0.05 + 0.27 · (speed / MAX_FWD)          cruising
  drain/s = 0.05 + 0.65 · (speed / MAX_BOOST)        while boosting
  ```

- At full cruise that is **0.32 units/s** → `100 / 0.32 = 312 s` = **5.2 minutes of continuous
  flight per cell**. At ~60 s of flight per delivery that is **5.2 deliveries** ✓ target 2.
- At full boost, 0.70 units/s → 143 s of continuous boost. Boost stops being a resource you hoard.
- **Hovering is nearly free** at 0.05/s — 33 minutes. You can put the phone down mid-job and come
  back to a craft that is still airborne with charge in it. Without this, altitude hold plus a
  flat-rate drain strands anyone who takes a phone call.
- Cargo mass adds `0.012/s per occupied slot`, so a full `mammoth` costs 0.072/s more — visible on
  the dash bar, never decisive.

#### 7.4.2 Payment

```
base    = 180 + 130 · distance_km + 60 · risk           risk ∈ {0,1,2,3}
base    = round5(base)
payout  = round5( base × (1 + timeBonus + chainBonus) × rushMultiplier )
```

- **Time bonus**, up to **+45 %**: zero at the limit, rising linearly to the full 45 % at 65 % of the
  limit and holding there. `timeBonus = 0.45 · clamp((limit − t) / (0.35 · limit), 0, 1)`.
- **Chain bonus: +12 % per additional parcel held at the moment of delivery.** This is the thing that
  makes the game a *routing* game rather than a taxi sim, and it is the reason cargo slots are the
  most valuable upgrade.
- **`rushMultiplier`** is 2.2 for a `RUSH` job and 1.0 otherwise. It multiplies rather than adding,
  so a rush job that is also chained is genuinely worth chasing.
- Bonuses are **additive percentages of base**, not compounding, so the panel's arithmetic is the
  arithmetic a player can do in their head.

**`risk` is defined here, because nothing in the first draft ever assigned it.** It is a property of
the *job*, fixed at generation, displayed as the `⚠` chip (`LOW / MED / HIGH / EXTREME`), and it
depends on nothing dynamic — in particular not on heat, which does not exist. Three conditions, +1
each, capped at 3:

1. the **drop** district's licence tier is ≥ 4 (`cradle`, `pale`, `drown`),
2. the parcel type is `fragile` or `blackbox`,
3. the drop pad is above 300 m or below 30 m — a hard approach either way.

#### 7.4.3 Fuel price

A job burns ~60 s of flight = `60 × 0.32 =` **19.2 units**. Target 1 wants that to cost 8–12 % of a
typical base pay. Typical tier-1 base is ~415 CRD (below), so the target is 33–50 CRD, i.e.
`1.7–2.6 CRD/unit`. **CHARGE is 2.2 CRD/unit.**

- Fuel per job: `19.2 × 2.2 =` **42 CRD** = **10.2 %** of a 415 CRD base ✓ target 1.
- A full 100-unit refill is **220 CRD** — about half a delivery, bought roughly every five
  deliveries. Noticeable, never painful.
- Note this barely moved from the first draft's 3 CRD/unit. **The fuel price was never the bug**;
  the payment formula being 5× too small was.
- **The tow.** Cell at zero → limp at 12 m/s, toast, free tow to the nearest CHARGE pad, **and 15
  units restored free** (33 CRD of charge, ~47 s of flight). That last clause is what closes target
  4: without it a player at 0 credits and 0 charge is stranded at a pad they cannot afford to use.

#### 7.4.4 The licence ladder

Tiers are on **lifetime gross credits earned** (`__state.lifetime`), not on the current balance, so
spending in the shop never costs progress.

| tier | lifetime CRD | jobs to reach | unlocks |
|---|---|---|---|
| 1 | 0 | — | `standard`; The Spine, The Ribs |
| 2 | **2,400** | ~5.8 | `bulk`; Vault Row, Sootfields; `kestrel` |
| 3 | **7,000** | ~14 | `rush` (`RUSH` pads light up); Lantern Quarter; `lance` |
| 4 | **16,000** | ~26 | `fragile`; The Cradle; `drayman` |
| 5 | **36,000** | ~45 | `contested`; Pale Terrace; `nocturne` |
| 6 | **80,000** | ~75 | `blackbox`; The Drownings; `mammoth` |

The first draft's ladder (`0 / 900 / 2,600 / …`) was solved against payments five times too small.
At the corrected payments, 900 lifetime credits is **2.2 jobs** — tier 2 would arrive before the
player had finished learning to fly. The city is always fully flyable; tiers gate *income*, not
airspace.

#### 7.4.5 Job selection

The other thing a builder would otherwise have to invent:

- The board holds **3 jobs at the HUB, 2 at any other pad**, refreshed when one is taken and on a
  90 s timer, with the slot the player is looking at never swapped underneath them.
- Pickup is the pad you are standing on; the drop is drawn from pads within a **distance band set by
  tier**: 0.6–2.4 km at tier 1, widening by ~0.8 km per tier to 0.6–6.0 km at tier 6. Drops always
  resolve to a real generated pad, never a point in space.
- **At most one `RUSH` job on the board at a time**, and only from tier 3.
- A job's client, parcel and payment are derived from `hash2i(padChunk, jobIndex, seed)`, so
  declining and re-docking shows the same board — declining is a choice, not a reroll.

#### 7.4.6 Worked example — tier 1, the first job

This is §7.3's panel mock, computed.

| | |
|---|---|
| distance | 1.8 km |
| risk | 0 (drop is The Ribs, tier 1; sealed crate; pad at 46 m) → `LOW` |
| **base** | `180 + 130 × 1.8 + 60 × 0 = 414` → round5 → **415 CRD** |
| limit | 1:05 = 65 s; bonus saturates at 65 % = **42 s = 0:42** |
| delivered at | 0:42 = 42 s → time bonus **+45 %** |
| chain | 1 other parcel held → **+12 %** |
| **payout** | `round5( 415 × (1 + 0.45 + 0.12) ) = round5(651.6) =` **650 CRD** |
| flight | ~25 s to the pickup + ~29 s to the drop = 54 s |
| fuel | `54 × 0.32 = 17.3 units × 2.2 =` **38 CRD** — 9.2 % of base ✓ |
| **net** | **612 CRD** |

#### 7.4.7 Worked example — tier 2

| | |
|---|---|
| job type | `bulk`, unlocked at tier 2 |
| distance | 3.6 km |
| risk | 1 (drop pad at 380 m) → `MED` |
| **base** | `180 + 130 × 3.6 + 60 × 1 = 708` → round5 → **710 CRD** |
| limit | 1:55 = 115 s; bonus saturates at 75 s |
| delivered at | 1:25 = 85 s → `0.45 × (115 − 85)/(115 − 75) = 0.45 × 0.745 =` **+33.5 %** |
| chain | 2 others held → **+24 %** |
| **payout** | `round5( 710 × 1.575 ) =` **1,120 CRD** *(was 1,115 under the pre-D1 limit — one round5 step)* |
| flight | ~1.2 km to the pickup + 3.6 km to the drop = 4.8 km at 62 m/s = 77 s |
| fuel | `77 × 0.32 = 24.6 units × 2.2 =` **54 CRD** — 7.6 % of base ✓ |
| **net** | **1,061 CRD** |

#### 7.4.8 Time to tier 2 — the P7a gate

Tier-1 jobs run 0.6–2.4 km, mean 1.4 km, all risk 0 → mean base `180 + 130 × 1.4 =` **362 CRD**. A
player who is still learning the controls earns maybe +15 % of bonuses on average → **~416 CRD per
job** of lifetime credit.

`2,400 / 416 =` **5.8 jobs** ✓ target 3 (6 ± 1).

In minutes: the scripted first job is short (600–900 m) and the scripted second starts 200 m from
the first drop, so jobs 1–2 run ~60 s and ~70 s; jobs 3–6 run ~90 s.
`60 + 70 + 4 × 90 =` **490 s = 8.2 minutes**, of which one CHARGE detour (~20 s) is already
included by job 5. **P7a asserts tier 2 within 9 minutes** under `?auto=1`, with a minute of slack
because the autopilot flies less efficiently than a person.

#### 7.4.9 Shop prices

Anchored so a craft is a goal and an upgrade is a purchase, and so the ladder above pays for it:

| | price |
|---|---|
| `wisp` | starter, owned |
| `kestrel` | 1,800 |
| `lance` | 4,500 |
| `drayman` | 9,000 |
| `nocturne` | 20,000 |
| `mammoth` | 44,000 |
| upgrade L1 / L2 / L3 | 15 % / 35 % / 70 % of the *current* craft's list price |
| repair | 40 CRD flat, cosmetic only |

Four upgrade lines: **thrust** (+8/+16/+24 % `MAX_FWD`), **cargo** (+1 slot per level),
**cell** (+15/+30/+50 % capacity), and **cell efficiency** (−12/−22/−30 % cruise drain).

**"Silent running" is retargeted to cell efficiency** and keeps its name. Its only function in the
first draft was halving heat gain, and there is no heat, so the upgrade and the `nocturne` hull's
entire selling point would have gone with it. `nocturne` now carries an intrinsic −15 % cruise drain
on top of whatever the upgrade line adds, plus the quietest thruster and the best glass — it is the
long-range hull, which is a better fit for a delivery game than a stealth hull in a game with
nothing to hide from.

#### 7.4.10 What is deliberately absent

**There is no heat, no pursuit, no impound and no fail state** (`DECISIONS.md` decision 6). Nothing
in the flight model or the economy may depend on a heat mechanic. Specifically deleted from the
first draft: the 0–4 heat scale and its 90 s decay, the `patrol` tail at heat 3, the parcel impound,
the `HOT` zone's heat gain, the heat pip row on the right holo panel (§8.3), the `chase` music
trigger at heat ≥ 3 (§10.3), the `police` chatter weight at heat ≥ 2 (§10.4), the `TAIL` chip
(§8.7) and `heat` in `__state` (§2.7). If a builder finds a heat reference anywhere in this document,
it is a miss and it should be reported, not implemented.

**First-playthrough shape** — this is what the P7a gate tests:
`HUB` → board shows 3 jobs → accept the shortest → fly 600–900 m (~25 s) → dock at PICKUP → panel →
accept → fly to DROP (~29 s) → dock → paid, toast, chatter line → board again. **First payment inside
90 s.** Tier 2 at ~8.2 minutes (§7.4.8). The chain bonus is introduced by a scripted second job whose
pickup is 200 m from the first job's drop.

---

## 8. HUD

### 8.1 Cockpit — an interior with no occupant

Per §1.1 there is no driver, no passenger, no hands, no seat back. The cabin is furniture and glass,
and the player's presence is implied by the frame around their view and the instruments lit for
them. `1939970_04` is *not* our reference here (it has a character in frame); `746850_02` and
`746850_09` are.

A real 3D group parented to the camera at 0.45 m, camera near plane 0.1:

- Two A-pillars and a roof lip in near-black metal (`0x0c0e12`, metalness 0.85, roughness 0.35),
  each with a 4 mm emissive edge rule in the district tint at 0.2.
- A dash lip along the bottom third, angled 12° toward the viewer.
- A canopy glass plane with a faint fresnel sheen and the droplet texture from `weather.js`, which
  gets denser in `stormnight` and drifts upward with speed.
- On collision, the frame edge rule flashes red for 0.3 s. That is the entire damage feedback.

6 draw calls, ~4.4k tris.

### 8.2 Dashboard screen

One plane on the dash, textured with a **`CanvasTexture` redrawn at 12 fps** (6 on LOW). The
`746850_09` look — flat emissive strips on dark plastic, no gloss, no bevel:

- A 200° speed arc with a thin needle, redline past 85 % of max.
- An altitude bar, vertical, with a lane-altitude tick set so you can see which lane you are level with.
- A cell bar, amber, that turns red under 15 %.
- Cargo slots as N outlined squares, filled when occupied.
- One task line: `→ KELL'S REST  1.8 km  ⏱ 2:14`.
- A heading tape across the top.

One draw call, ~0.35 ms.

### 8.3 Floating holo panels

Three small planes hovering in the cabin, each a `CanvasTexture` at 4 fps (2 on LOW), additive,
tilted 8–14°, with a 2 px scanline and a `sin(t)` bob of ±6 mm:

- **Left** — active job: client name, parcel, destination, payment, time bar.
- **Right** — nearest zone: type glyph, name, distance, and the cell-range readout (how many minutes
  of cruise are left, and whether the nearest CHARGE pad is inside that). *(This replaces the heat
  pip row — there is no heat, `DECISIONS.md` decision 6. Cell range is the one genuinely useful
  number the panel can show instead, and §7.4.1 makes it meaningful.)*
- **Centre-low, only when relevant** — comms: the last chatter speaker and a level meter.

Panels fade to 0.35 opacity when the player is looking away from them (dot product with the camera
forward), so they never fight the city for attention.

### 8.4 Toasts

DOM, top-centre, under the safe-area inset. Max 4 stacked, each 2.6 s plus 0.35 s in/out. Kinds:
`pay` (green), `info` (cyan), `warn` (amber), `bad` (red). Never blocks input, never queues longer
than 4 — the fifth replaces the oldest. Copy the `voidcast/js/ui.js:toast()` shape.

### 8.5 The chatter popup and its read-time rule

DOM, bottom-centre, above the dash lip. One line, a speaker tag above it in the tag colour, a thin
left rule, and a hairline progress bar showing the remaining hold.

**Read-time rule:**

```
hold = 1.8 + 0.085 * charCount        seconds
hold = clamp(hold, 3.5, 13.0)
if (audioDuration) hold = max(hold, audioDuration + 1.2)
hold *= settings.chatterHold          // normal 1.0, long 1.35, very long 1.75
```

0.085 s per character is ~12 characters/second, about 150 wpm — comfortable slow-reader pace, not
average pace. A 60-character line holds for 6.9 s. The brief asks for "long enough for a slow
reader"; this is that number, with a settings multiplier for anyone who wants more.

Only one chatter line is on screen at a time. A new foreground line waits for the current hold to
finish, up to 6 s, then drops the queued line rather than backing up.

### 8.6 Minimap

**Circular, 2D canvas, not a render target.** 128 px CSS (256² backing), top-right in portrait,
right-of-centre in landscape. Redrawn at 15 fps (8 on LOW), ~0.4 ms.

It draws from the chunk *descriptor* data, which we already have on the CPU — so it costs nothing to
render and it is accurate:

- Building footprints as dark rects with a 1 px edge in the district tint. Alpha scales with the
  building's height, so tall towers read stronger. This is what makes the map *look* like a city.
- Zones as filled dots in their type colour **with the type glyph drawn inside them** (§7.1) so the
  map is readable without colour, pulsing at 0.8 Hz. The active job's drop pulses double and gets a
  ring. The HUD marker carries the same glyph.
- **The authored core reads as a place**: the three named districts (§3.1.1) get a faint label at
  their centroid and the eight landmarks draw as filled footprints at 1.6× the normal edge alpha.
  This is the payoff decision 3 is buying — a minimap of a purely seeded field has nothing on it a
  player could navigate by from memory.
- Off-map targets as a chevron on the rim at the correct bearing, with the distance in km beside it.
- The player as a triangle at centre; north tick on the rim.
- **Altitude ring**: a thin arc around the outside whose fill indicates altitude within the 4–760 m
  band (§6.2), with lane-altitude ticks. In a vertical city a 2D map without altitude is a lie.
- **Rear arc** (see §8.7): the 120° wedge behind the player is tinted 6 % darker, and near traffic
  in it draws as an arrow tick. It is a traffic indicator, nothing more — nothing pursues you.
- Setting: rotate-with-heading (default) or fixed-north.

`746850_02`'s circular dash minimap is the visual target — a dark disc, a cyan ring, flat coloured
marks, no 3D.

### 8.7 Rear-view — verdict: no

**We are not building a rear view, and here is the reasoning so it does not get relitigated.**

A rear view is a second scene render. Even at 320×90 it re-traverses, re-culls, re-uploads instance
data and re-runs the fog and grade for a second camera — measured on comparable scenes at **35–45 %
of a frame**. We would be spending a third of the mobile budget on it.

And it buys nothing, because of what this game *is*: there is no combat, no fail state, and nothing
that attacks from behind. Since `DECISIONS.md` decision 6 there is not even a `patrol` craft that
tails you — police are ambient traffic. Nothing in this game is ever behind you that you need to
know about, which makes the case against a rear view stronger than it was, not weaker.

**The fallback we build instead** is §8.6's rear arc: near traffic behind the player draws as an
arrow tick with a bearing and a distance. That is strictly more informative than a 90-pixel smear at
a hundredth of the cost. *(The first draft also specified a `TAIL` chip that lit when a police craft
was behind you during heat. Deleted with the heat system — there is nothing for it to report.)*

**If overruled**, the mirror strip is specced and budgeted so it can be added without redesign:
320×90 render target, quarter internal resolution, **20 fps** (not per-frame), a hard 250 m draw
distance, LOD1-only geometry, no bloom, no grade, no rain, no reflection. Budget **2.2 ms**. It is a
setting, defaults OFF, and is unavailable in `?lite=1`. Do not build it before P10.

---

## 9. Generated media pipeline

### 9.1 What we generate

**16 clients** (`DECISIONS.md` decision 4 — down from 24, because P9 is gated on serialised local
generation and 16 keeps it from becoming the long pole). Each gets three files:

| file | size | use |
|---|---|---|
| `assets/clients/<id>.jpg` | 384×384, JPEG q78, ~36 KB | the panel still; also the `<video poster>` |
| `assets/clients/<id>_thumb.jpg` | 96×96, JPEG q72, ~5 KB | the job board list |
| `assets/clients/<id>.mp4` | 288×288, H.264, ~160 KB | the talking loop |

Plus `assets/signs.png` at ≤ 400 KB and `data/signs.json` at ~18 KB (§3.5.1), the only other binary
asset in the project — everything else is generated at boot.

**Total shipped assets ≈ 3.7 MB.** Sane for this repo — `gms/2d/awake` ships 111 MB of video and 18 MB of stills,
and GitHub Pages' soft limit is 1 GB.

**The client count is data, not code.** `data/clients.json`'s **length** drives everything: the
generator loops it, the pad↔client hash in §7.1 takes it modulo, the job board reads it, and the
manifest has no client entries at all. **Raising 16 to 24 later is adding eight rows to a JSON file
and re-running `tools/gen_clients.py`** — no code change anywhere, which is what decision 4 requires
explicitly. Nothing in `js/` may contain the literal 16.

**Loading discipline** is what actually matters, more than the total:
- The job board uses **only** the 96×96 thumb.
- The 384×384 still is `<img loading="lazy">`.
- The video is `preload="none"`, and its `src` attribute is set **only when the docking panel opens
  for that client**. A typical session downloads 1–4 clips, not 16.
- Verified in P9 by reading the CDP network log: navigating to the board must fetch zero `.mp4`.

### 9.2 The ping-pong loop — baked, not scripted

The brief wants ~2 s of talking, reverse-played, then looped. `<video>` cannot play backwards
(`playbackRate` may not be negative), and a JS seek loop stutters. So we **bake the ping-pong into
the file** with ffmpeg and let the browser's own `loop` attribute do the work. Seamless, zero JS,
1.7× the bytes.

```
ffmpeg -y -i raw.mp4 -filter_complex \
 "[0:v]crop=384:384:0:40,scale=288:288,split[a][b];\
  [b]reverse,trim=start_frame=1:end_frame=48,setpts=N/FRAME_RATE/TB[r];\
  [a][r]concat=n=2:v=1[v]" \
 -map "[v]" -an -c:v libx264 -pix_fmt yuv420p -crf 30 -preset slow \
 -movflags +faststart -g 49 out.mp4
```

**Both ends of the reversed segment have to go, not just one.** The first draft used
`select='gt(n\,0)'`, which correctly drops the duplicate at the *turn* (reversed frame 0 == forward
frame 48) — but the **last** reversed frame equals forward frame 0, so every time `<video loop>`
wraps, frame 0 is shown twice and the loop hitches once per cycle rather than once per turn. It is a
subtle, permanent, once-every-four-seconds stutter on the main UI of the game.

`trim=start_frame=1:end_frame=48` keeps reversed frames 1–47 inclusive, dropping both ends:
**49 forward + 47 reverse = 96 frames = 4.00 s** at 24 fps, with no duplicate at either seam.
(The first draft's "49 + 48 = 4.04 s" arithmetic was right; it was the seam count that was wrong.)

### 9.3 The 24 GB constraint

Flux and LTX cannot both hold a worker. `tools/gen_clients.py` therefore runs in **two strictly
separated batches** and never interleaves:

```
1. queue_depth check on both servers; if either > 20, print and exit (§14 risk 5)
2. wait_for_ltx_idle({})                  # LTX drops its ~16 GB worker after 120 s idle
3. BATCH A — all 16 Flux portraits, sequential
4. best_effort_unload(MFLUX_API)
5. BATCH B — all 16 LTX loops, sequential
6. ffmpeg post-pass on everything
```

The helpers are **imported from `site/gms/2d/awake/regen_helper.py`**, not rewritten:

```python
import sys, os
sys.path.insert(0, os.path.expanduser('~/cc/yru/site/gms/2d/awake'))
from regen_helper import (wait_for_ltx_idle, best_effort_unload,
                          mflux_post, mflux_get, mflux_download,
                          MFLUX_API, LTX_API, IMAGE_MODEL)
```

**`wait_for_ltx_idle({})`, not `wait_for_ltx_idle()`.** The real signature at
`site/gms/2d/awake/regen_helper.py:712` is `wait_for_ltx_idle(local_job, timeout=150)` —
`local_job` is a **required positional argument** and the function mutates it
(`local_job["status"] = "waiting_ltx_idle"`). Calling it with no arguments raises `TypeError` on
line 2 of the pipeline. An empty dict is the correct throwaway.

Everything else about the import checks out against the source: `best_effort_unload(api)` takes the
api, the module has no import-time side effects (its server is under `__main__`),
`IMAGE_MODEL = "flux2-klein-9b-mlx-4bit"` matches §9.4 (the root `CLAUDE.md`'s `flux2-klein-4b` is
the stale one), `ALLOWED_RESOLUTIONS = {(384,640), (576,960)}` matches, and every LTX payload field
§9.4 uses is real.

**Import the three mflux primitives, not `mflux_generate()`.** The helper already implements the
submit-poll-download loop §9.4 spells out by hand, and rewriting it would be the same mistake as
rewriting `wait_for_ltx_idle` — but it is **not** a drop-in here, because it hardcodes
`"seed": int(time.time()) % 100000` (`regen_helper.py:735`). §9.4 requires a **stable per-client
seed**, and requires the LTX call to reuse the portrait's seed; a wall-clock seed makes the whole
client set unreproducible and makes `--force` regenerate a different person. So: import
`mflux_post` / `mflux_get` / `mflux_download` — which is where all the retry and error handling
actually lives — and wrap them in a twelve-line `flux_portrait(client)` that supplies the seed.

The script is **idempotent** — it skips any client whose three output files exist, unless `--force`.
Run it once; re-run it safely.

### 9.4 The exact API calls

**Portrait (Flux, `:7867`)** — 768×1280 so it doubles as the LTX start frame.

```json
POST http://localhost:7867/api/generate
{
  "mode": "txt2img",
  "prompt": "<see 9.5>",
  "model": "flux2-klein-9b-mlx-4bit",
  "width": 768, "height": 1280,
  "num_inference_steps": 10,
  "seed": <stable per client id>,
  "num_images": 1
}
→ {"job_id": "..."}
GET  /api/jobs/<id>            poll until status == "done"
GET  /api/jobs/<id>/file/0     → raw/<id>_flux.png
```

**Talking loop (LTX, `:7866`)** — LTX accepts only `(384,640)` or `(576,960)`, so the start frame
must be resized first:

```
ffmpeg -y -i raw/<id>_flux.png -vf scale=384:640 raw/<id>_ltxsrc.jpg
```

```json
POST http://localhost:7866/api/generate
{
  "prompt": "<see 9.5>, static camera, dark interior, neon rim light, film grain",
  "width": 384, "height": 640,
  "num_frames": 49, "fps": 24,
  "seed": <same seed as the portrait>,
  "num_inference_steps": 20,
  "cfg_scale": 3.0,
  "negative_prompt": "camera movement, zoom, pan, cut, morphing, extra limbs, text, watermark, blur",
  "image": "/abs/path/raw/<id>_ltxsrc.jpg",
  "image_strength": 1.0,
  "tiling": "aggressive",
  "no_audio": true
}
```

Then the two ffmpeg passes:

```
# panel still + thumb, cropped to the head from the 768×1280 Flux frame
ffmpeg -y -i raw/<id>_flux.png -vf "crop=768:768:0:96,scale=384:384" -q:v 4 assets/clients/<id>.jpg
ffmpeg -y -i assets/clients/<id>.jpg -vf scale=96:96 -q:v 6 assets/clients/<id>_thumb.jpg
# the ping-pong loop, §9.2
```

### 9.5 Prompt templates

`data/clients.json`, **16** records (add rows to raise the count — §9.1):

```json
{ "id": "mara_vells", "name": "Mara Vells", "faction": "Tallow Syndicate",
  "tint": "amber", "age": "40s", "build": "sharp-featured",
  "look": "shaved sides, oil-stained collar, brass ear cuff",
  "mood": "impatient", "line": "You're late. It happens." }
```

**Portrait prompt template** (Flux):

```
cinematic head-and-shoulders portrait of a {age} {build} person, {look},
cyberpunk courier client, lit only by {tint} neon from one side and cold cyan
rim light from behind, deep black background, dark rain-streaked window behind
them, shallow depth of field, 85mm, grimy near-future city interior,
photographic, high contrast, mostly black frame, no text, no logos
```

Constants across all 16: `deep black background`, `mostly black frame`, `lit only by neon`. That is
what makes the sixteen portraits look like one game rather than sixteen stock photos, and it
matches the scene grade so the panel does not feel pasted on.

Rotate `{tint}` across the six district palette colours — roughly three clients each — so the panel
accent always has a portrait that agrees with it. The rotation is `clients[i].tint = palettes[i % 6]`
so it stays correct at any list length.

**Loop prompt template** (LTX, image-to-video from the portrait):

```
the person speaks a few words to camera, small natural head movement, eyes blink
once, subtle jaw and lip motion, {mood} expression, lighting unchanged,
static camera, static background
```

`lighting unchanged, static camera, static background` are load-bearing — LTX will happily drift the
whole frame otherwise, and a drifting frame ping-ponged looks like a glitch.

### 9.6 The video element, exactly — and absence behaviour

**The element's attributes are a specification, not a suggestion, because three of them are the
difference between "it plays" and "it takes over the phone".**

```html
<video muted playsinline webkit-playsinline autoplay loop
       preload="none" disablepictureinpicture
       poster="assets/clients/<id>.jpg"></video>
```

- **`playsinline`** (and the legacy `webkit-playsinline`): without it, iOS Safari opens the **native
  fullscreen player** the moment the clip plays. The centrepiece of the main UI of a mobile-first
  game would eject the player out of the game, on the platform the brief names first.
- **`muted`**: without it, iOS refuses to autoplay at all without a user gesture. The clip has no
  audio track anyway (`-an` in §9.2), so this costs nothing.
- **`loop`**: the ping-pong is baked (§9.2), so the browser's own loop is the entire playback logic.
- **`disablepictureinpicture`**: stops a long-press offering to pop the client out of the panel.

And the play call must be allowed to fail:

```js
video.play().catch(() => showStillWithShimmer());   // never throws, never logs an error
```

A rejected play promise is a normal outcome (low-power mode, a browser that wants a gesture, a
`?nosave` cold load) and it must **degrade to the still-with-shimmer path below**, not throw and not
leave a black rectangle where a face should be.

**P9 done-criteria**: the CDP harness runs this in **mobile emulation** with an iPhone UA and touch
enabled, asserts the clip is playing inline (`video.webkitDisplayingFullscreen === false`,
`video.paused === false`), and asserts that a forced `play()` rejection lands on the still path.

**Absence behaviour.** If `assets/clients/<id>.mp4` 404s, the panel shows the still with a subtle
scanline shimmer and no video element at all. If the still 404s too, it shows a generated
placeholder — a hex silhouette in the zone tint with the client's initials. **The panel never shows a
broken image and never blocks on a fetch.** The game is fully playable with the entire
`assets/clients/` directory deleted; P9's gate includes running it that way.

---

## 10. Audio

With no people in the world (§1.1), audio is not garnish — it is how the city is populated. Budget
attention accordingly.

### 10.1 Synthesised sounds (`js/audio.js`)

All Web Audio, one persistent graph, no files, ~240 lines.

| sound | construction |
|---|---|
| thruster | 2 detuned sawtooths (110/113 Hz) → lowpass whose cutoff (300→2600 Hz) and gain track speed; plus pink noise → bandpass at 900 Hz for air |
| boost | the above plus a third saw an octave up and a 0.15 s filter sweep |
| dock lock | 3 descending sines (880/660/440) at 90 ms each + a 4 ms click |
| payment | two-note major stab (660 → 990) with a 0.4 s exponential tail |
| scrape | filtered noise burst (bandpass 1.8 kHz, Q 3) + a 60 Hz thunk, gain ∝ impact speed |
| zone proximity | a 220 Hz sine pulsing at `1 + 3·(1 − d/R)` Hz, gain 0.05 |
| rain / wind | pink noise → lowpass, gain ∝ `rain + 0.006·speed` |
| siren | two-tone square with a 0.7 Hz LFO on frequency |
| lightning | a filtered noise crack with a 1.2 s reverb-ish decay (a feedback delay), delayed by distance |
| UI | 8 ms filtered clicks at three pitches |
| **traffic net** | see below |

**The traffic net bed** is the important one and it is the reason the city is never dead. A
continuous, deliberately unintelligible radio murmur: a low male/female-ish formant pair driven by a
slow random envelope, pushed through the radio bus (§10.2), with squelch clicks at random 4–14 s
intervals and occasional distant siren fragments. It runs from the first frame, before any SUNO file
exists, at 0.10 gain, ducked to 0.04 under any real chatter. Ten minutes of listening should never
resolve into a word — it is texture, not content.

### 10.2 The radio bus

Every chatter clip — synth, SUNO, or the traffic net — routes through one shared chain:

```
source → bandpass(300–3400 Hz, Q 0.7) → waveshaper(mild, k=2.5) → compressor(-18 dB, 4:1)
       → squelch gate (a 12 ms noise burst at start and end) → radio gain → master
```

This matters practically: SUNO returns clean, well-produced audio. Clean audio does not sound like a
radio. Fifteen lines of Web Audio makes anything Aaron generates sit in the mix correctly, and means
he does not have to get the "radio" quality right in the prompt.

Ducking: music → 0.35× and traffic net → 0.4× while any foreground chatter plays, restored over
0.6 s.

### 10.3 The SUNO slot manifest

`assets/audio/manifest.json`. Committed with **every slot listed**, whether or not the file exists.

```json
{
  "version": 1,
  "music": [
    { "slot": "menu",       "file": "music/menu.mp3",       "gain": 0.55, "fade": 2.0, "pool": "menu" },
    { "slot": "cruise_a",   "file": "music/cruise_a.mp3",   "gain": 0.40, "fade": 3.0, "pool": "cruise" },
    { "slot": "cruise_b",   "file": "music/cruise_b.mp3",   "gain": 0.40, "fade": 3.0, "pool": "cruise" },
    { "slot": "cruise_day", "file": "music/cruise_day.mp3", "gain": 0.36, "fade": 3.0, "pool": "cruise_day" },
    { "slot": "docked",     "file": "music/docked.mp3",     "gain": 0.32, "fade": 1.2, "pool": "docked" },
    { "slot": "chase",      "file": "music/chase.mp3",      "gain": 0.50, "fade": 0.8, "pool": "rush" },
    { "slot": "storm",      "file": "music/storm.mp3",      "gain": 0.42, "fade": 3.0, "pool": "storm" },
    { "slot": "first_flight","file":"music/first_flight.mp3","gain": 0.55, "fade": 2.0, "pool": "intro" },
    { "slot": "pirate",     "file": "music/pirate.mp3",     "gain": 0.30, "fade": 1.5, "pool": "diegetic" }
  ],
  "chatter": [
    { "slot": "dispatch_01", "file": "chatter/dispatch_01.mp3", "layer": "fore",
      "speaker": "HAUL CONTROL", "tags": ["dispatch"], "cooldown": 240, "gain": 0.9,
      "text": "Haul Control to all couriers — the Vane Street corridor is open again. Lanes four through nine, keep it under two hundred." }
  ]
}
```

**Rules the loader (`js/radio.js`) must implement:**

1. At boot, for every slot, `fetch(file, { method: 'HEAD', cache: 'force-cache' })`. Non-200 marks
   the slot `absent`. Absent slots are removed from their pool. **All of this is fire-and-forget —
   the game never waits on it and never errors.**
2. If a music pool is empty, the synth bed plays instead. If a chatter pool is empty, foreground
   lines from that pool **still fire as text-only popups** using `text` and the §8.5 read-time rule.
   The city keeps talking whether or not Aaron has delivered a file.
3. `layer: "fore"` → plays at `gain`, shows the HUD popup. `layer: "back"` → plays at 0.22, ducked to
   0.10 under a foreground line, **never** shows text.
4. Music state machine: `menu → cruise → cruise_day (during daysmog) → docked → rush (a RUSH job
   with under 30 s left on its timer) → storm (during stormnight)`. Equal-power crossfade over the
   slot's `fade`. `intro` plays once, on the first flight of a save. `diegetic` (pirate radio) is
   offered as a togglable "station" in settings and plays *instead of* cruise.

   *(The `rush` trigger replaces `heat ≥ 3` — there is no heat, `DECISIONS.md` decision 6. The slot
   id and the filename stay `chase` / `music/chase.mp3` so anything Aaron has already generated
   still drops straight in; only the pool name and the trigger change. The track is retitled in
   `docs/SUNO.md` because "Blue And Red" was a police-lights title.)*
5. Aaron drops files into `assets/audio/music/` and `assets/audio/chatter/` with exactly the
   filenames above. Nothing else to do — no code change, no manifest edit, no rebuild.

### 10.4 The chatter director

Lives in `radio.js`. This is what keeps the radio feeling alive rather than random.

- A foreground line every **22–50 s**, jittered (mean 36 s), suppressed while the docking panel is
  open and for 4 s after any toast.
- Context weights: `dispatch` ×3 near the HUB; `police` ×2 when a `patrol` craft is within 200 m
  (flavour only — it does not react to you); `distress` ×2 in the Drownings and Sootfields; `ad` ×2
  in the Lantern Quarter; `weather` ×3 at a variant change; `pirate` ×1.5 at night; `life` ×1.5 in
  any commercial district. Everything is always possible at ×1.

**Selection is a two-stage shuffle bag, and this is the fix for the repeat problem.**

1. **Weights choose the *group*** (`dispatch`, `police`, `pirate`, `ad`, `distress`, `weather`,
   `life`).
2. **Each group holds its own bag**, drawn **without replacement**. When a bag empties it is
   refilled and reshuffled, and the line that was drawn last is moved into the second half of the
   new bag so a bag boundary can never play the same line twice in a row.

The first draft used a **12-line no-repeat window** over 33 lines and claimed "roughly 20 minutes
before a player hears a repeat". A window of 12 permits a repeat at line 13; at a mean 36 s interval
that is `13 × 36 =` **7.8 minutes**, not 20. A shuffle bag makes the claim true instead of adjusting
it downward, and it costs one array and one splice.

**The arithmetic on the new pools.** 41 ambient foreground lines across seven groups (§11 /
`docs/SUNO.md`). The binding case is a five-line group (`pirate`, `distress`, `weather`): at seven
groups it is drawn roughly every 7th line = every 252 s, so its bag of 5 lasts `5 × 252 =` **21
minutes**. **No foreground line repeats inside 21 minutes**, and the larger groups run much longer
than that. Per-slot `cooldown` still applies on top, as a floor.

- Background lines (`layer: "back"`) run continuously on their own 8–20 s timer, on top of the
  traffic net, with no popup, from their own bags.

**Job events draw from their own dedicated pools, and this is the other half of the fix.** The first
draft forced a `dispatch` *confirm* on every accept and a `dispatch` *pay* line on every delivery —
and there was exactly **one of each** in the whole game. At ~90 s per job the player heard the
identical "Courier, your parcel is logged…" and "Nice run. Credits are clearing now…" every ninety
seconds, forever. With people absent from the world (§1.1), that is the fastest possible route to
the city feeling dead.

| event | pool | size | how often a line repeats |
|---|---|---|---|
| job accepted | `dispatch_confirm` | **8** | 8 jobs ≈ **12 min** |
| delivery paid | `dispatch_pay` | **8** | 8 jobs ≈ **12 min** |
| a `RUSH` timer drops under 30 s | `dispatch` (weighted) | 6 | |
| entering `stormnight` | `weather` | 5 | |

Both event pools are shuffle bags on the same rule. Eight lines each is sized against a *long*
session: 45 minutes of play is ~30 jobs, so each confirm line is heard about four times across it,
roughly twelve minutes apart. Six would have been ~7.5 minutes apart and noticeable.

*(Nothing here triggers on heat — there is none, `DECISIONS.md` decision 6. The first draft's
"heat reaching 3 → a `police` line" is deleted; `police` lines are ordinary ambient flavour.)*

---

## 11. SUNO prompts — see `docs/SUNO.md`

**Every SUNO prompt lives in `docs/SUNO.md`.** It is a standalone file, grouped by type, with each
slot numbered, its target filename given, and each prompt formatted so it can be pasted straight
into SUNO with no editing. That is the point of extracting it: Aaron opens one short file and works
through it, rather than scrolling a 3,000-line build plan.

`docs/SUNO.md` is the source of truth for prompt text, slot ids and filenames. This section carries
only the things a *builder* needs, which are the rules the audio code has to honour:

- **Aaron's three formatting rules** are stated at the top of `SUNO.md` and every prompt in it obeys
  them: spoken word only with the Style field saying so; the lyrics field is a single prompt with
  simple instructions in `[square brackets]`; and shouted words carry **both** a bracket tag **and**
  capitalised text. A builder must not "tidy" a prompt.
- **73 slots**: 9 music, 7 background chatter, 57 foreground chatter. Every one is listed in
  `assets/audio/manifest.json` at all times whether or not the file exists (§10.3), and every one
  behaves correctly with zero files present — which is the P8 gate.
- **The foreground pools and their sizes are load-bearing**, because §10.4's no-repeat arithmetic is
  solved against them: `dispatch` 6, `dispatch_confirm` **8**, `dispatch_pay` **8**, `police` 6,
  `pirate` 5, `ad` 6, `distress` 5, `weather` 5, `life` **8**. Shrinking a pool shortens the repeat
  window; §10.4 says by how much.
- **`tools/split_chatter.py`** silence-splits one returned SUNO track into its numbered slots, in
  the order `SUNO.md` writes them. It must have a failure path: SUNO does not reliably honour "leave
  two seconds of silence" and frequently adds a musical bed despite the Style field. When the split
  yields the wrong number of segments the tool **prints the detected boundaries, writes
  `chatter/_unsplit_<group>.mp3`, and exits non-zero** so the operator can name them by hand.
  Silently writing six wrong files is the failure mode to avoid.
- Nothing in the build blocks on SUNO. Music prompts are stable and can be generated at any time;
  chatter is better generated after this revision, because the line set grew.

---

## 12. The critic loop

Protocol is `~/cc/yru/gms/3d/aaa_refs/naval/CRITIC_PROTOCOL.md`, unchanged. Log every round in
`SCORES.md`. The gate is `ours_overall >= ref_overall - 2.0`. Calibration round (same plate on both
sides) every fourth round; void and re-run with a fresh critic if the two overalls differ by more
than 1.0 or either is below 8.

### 12.1 The six shots

Each shot is fixed to one plate and **the plate never changes between rounds**.

| shot | plate | crop applied to the plate | camera / clock | what it tests |
|---|---|---|---|---|
| `fog_city` | `746850_01` | none | 320 m altitude, wide, level, `stormnight`, rain full | **The performance proof.** Does near-zero geometry read as a megacity through fog + emissive alone |
| `canyon_dive` | `746850_03` | none | 180 m, pitched down 38°, looking along a lit canyon, `stormnight` | Fog-layer depth banding, traffic streaks, signage density |
| `hero_craft` | `1939970_00` | none | 3rd person high-behind, craft in the left third, canyon falling away right, 210 m, `duskburn` | The hero look — black bodywork, thruster bells, neon doing all the work |
| `wet_street` | `1475810_04` | **`[0.00, 0.30, 0.44, 1.00]`** | 5 m above a wet street, looking along it at a sign wall, `stormnight` | Wet-ground doubling, roughness variation, reflection colour |
| `cockpit` | `746850_02` | trim top 12 % on **both** images | in-cockpit, city beyond glass, dash + minimap in frame, `stormnight` | Diegetic HUD, dash instruments, glass, cabin materials |
| `day_smog` | `1091500_08` | **`[0.63, 0.00, 1.00, 0.78]`** | low, looking up a tower, one light shaft active, `daysmog` | "Daytime, still dark" |

`day_smog`'s crop starts at **x₀ = 0.63**, not 0.58. The figure's right arm sits at roughly
x = 0.575–0.585 at full resolution, so a 0.58 left edge clips it — and a sliver of a character in
one half is both a tell (§12.4) and a scoring distraction. Eyeball the cropped result once before
round 1.

**Shot cameras are authored at P3, not P0.** §12.1 gives them as prose ("320 m altitude, wide,
level") with no coordinates, and there is no city to point them at until P2 — but P0's done-criteria
requires `shot.mjs --shot=fog_city` to write a PNG, and `shot.mjs` hard-fails on an unknown id. So:
**P0's six `shots/*.json` are placeholders** with plausible coordinates and the right ids, enough
for the harness to run end to end against an empty scene. **P3 authors and freezes the final
cameras before the first scored round**, because §12.4 is right that a shot which moves between
rounds makes score movement meaningless. After P3 they are frozen for the project.

### 12.2 Plate substitutions — read this, it is a deliberate deviation

The brief's plate table assigns roles that three of the plates do not actually contain. I opened all
sixteen. Findings, and my calls:

1. **`1939970_10` is not a canyon shot.** The brief captions it "Looking down the canyon — traffic
   lanes as light streaks". The image is an **interior scene**: a man in a striped shirt holding a
   glowing oval device, an explosion behind him, warm orange wood-panelled room. It is unusable for
   anything we render. **Substituted with `746850_03`**, which *is* the canyon-down plate with
   traffic corridors, layered fog and signage. `1939970_10` is dropped from scoring entirely.
2. **`1939970_04` has a character in frame.** It is a 1930s-style car interior with a woman in a red
   dress occupying the right third. Per §1.1 we will never render a person, so a critic scoring
   Composition and Materials on that plate is scoring something we are forbidden to build.
   **`cockpit` is scored against `746850_02`** — first-person, character-free, and the brief already
   names it "our dashboard target". `1939970_04` stays as a *mood* reference for warm instrument
   glow only.
3. **`1091500_08` is dominated by a character.** A yellow-jacketed figure, back to camera, occupies
   the centre from y≈0.25 to the bottom edge. The plate is still the correct *direction* for the day
   variant — flat drained sky, silhouetted megatower, haze, drifting craft — so rather than lose it I
   crop to `[0.58, 0.00, 1.00, 0.78]`, which keeps the tower's right half, the blown-out sky, a
   flying craft and the haze band, and excludes the figure. `compare.mjs` applies the crop to the
   plate and renders our shot at the matching ~0.96:1 aspect.
4. **`1475810_04` also has characters** (a man and a dog, centre). Cropping to the **left-lower
   region** `[0.00, 0.30, 0.44, 1.00]` gives pure wet asphalt with doubled neon, a tree, and sign
   reflections — which is actually the *ideal* isolated test for §3.7(b) and better than the full
   plate would have been.
5. **`1488490_08`** has tiny distant voxel figures on a pier. They are at exactly the scale our
   permitted "distant silhouette" exception (§3.9) covers, so it would be scorable — but it is warm
   dusk over water and we have no water. **Kept as a mood reference for the dock look, not scored.**
6. **`979690_01` is a menu screenshot.** The brief cites it for "magenta/cyan grade at extreme
   density" and §3.5 would want it for signage. It is actually an **inventory/UI screen**: an
   armoured character on a dark background behind ARMOR / AUGMENTATIONS / MAP & MISSIONS / CODEX
   tabs, with item slots down the left edge. It contains a character, heavy game UI, and no city
   signage whatsoever. **Dropped entirely — not scored, not used as a reference.** The magenta/cyan
   grade direction is taken from `1488490_00` and `746850_08` instead, and the signage design in
   §3.5 is derived from `1488490_00`, which is the genuine density plate.

**For the manager**: (2), (3) and (4) are substitutions/crops I have made unilaterally because a shot
we are forbidden to render cannot be a scoring target. If you would rather record `day_smog` as an
un-scored gap and drop the crop, say so before P1 — it changes nothing else in the plan.

### 12.3 When rounds run

| after phase | rounds |
|---|---|
| **P3b** (weather + reflections + halos) | `fog_city`, `canyon_dive`, **`wet_street`** — the three that decide whether the rendering plan works at all |
| **P5** (vehicles + traffic) | `hero_craft` |
| **P6** (cockpit + HUD) | `cockpit` |
| **P10** (polish) | `day_smog`, plus a re-run of any earlier shot that failed |

**`wet_street` moves from P10 to P3b.** The wet-ground double is called "the single best-value item
in this plan" and it ships in P3; scoring its dedicated shot five phases later, in the final phase,
means there is no time left to act on the result. It is scored in the round immediately after the
system it tests exists. `day_smog` stays at P10 — it depends on the light shafts being anchored to
real chunk gaps and on the final grade.

**Record `day_smog`'s expected deficit in `SCORES.md` *before* round 1.** Opened at full resolution,
`1091500_08`'s sky is a near-white blown grey occupying ~45 % of frame, and the tower carries visible
rust-orange and teal panels with warm-lit window rows — it is **not** a silhouette. §4.3's `daysmog`
sky (`0x585048` → `0x3b3a3e`) is deliberately far darker, because the brief says "still fairly dark"
and Aaron's rule wins over the plate. That is the right call, and it means the shot will lose
Lighting and Atmosphere points for a deviation we chose. Write that down before the round so the gap
is read as a decision and not chased as a defect.

Three passes per shot, per the protocol. Third fail → record in `SCORES.md`, keep the work, move on,
and note it as a known gap. Never tell a builder its own score before it has finished a pass.

**Where the points actually are.** If a P3 round fails, the first instinct will be to add building
detail. Resist it. In `1488490_00` and `746850_08`, a large share of what the eye reads as
"density" is **signage at many depths** — and in `746850_01` the buildings are near-featureless
boxes that still score well because the fog and the emissive are right. So the rebuild priority
after a failed round is, in order: (1) signage layering and clustering (§3.5.5), (2) fog banding
(§4.2), (3) reflection (§3.7b), (4) window pitch and tint variety (§3.4). Building geometry is
**last**, and it is almost certainly not the problem.

### 12.4 The tooling a builder must write

Copy the working versions from `gms/3d/forge/tools/` rather than starting from scratch — they are
proven in this repo and already contain the lessons.

**`tools/shot.mjs`** — headless render, no puppeteer, raw CDP over the WebSocket that ships with
node. Port it from `forge/tools/shot.mjs`, keeping:
- a tiny static file server rooted at the game dir, with the walk-up-until-free port logic (several
  agents run these at once and a fixed port dies with `EADDRINUSE`);
- `freePort()` before launching Chrome — a busy `--remote-debugging-port` does not fail loudly, it
  silently attaches to *another agent's browser*;
- `--headless=new --use-angle=metal --use-gl=angle`, `--window-size`, a per-pid `--user-data-dir`;
- `Emulation.setDeviceMetricsOverride` plus, for `--mobile`, touch emulation and an iPhone UA — the
  app picks its layout off `(pointer: coarse)` and its preset off cores, so a desktop window is not
  a test of what a phone does;
- console/exception capture, so a shot that rendered a black frame because of a throw says so;
- **an id validation step**: read `window.__game.scenarios` and hard-fail on an unknown `--shot`.
  A typo used to render the default camera at a wall and write the PNG anyway.

Usage: `node tools/shot.mjs --shot=fog_city --w=1600 --h=900 --dpr=2`, plus `--all`, `--mobile`,
`--headed`, `--perf`. Writes `shots/<id>.png` and `shots/<id>.json` (fps, draws, tris, ms, errors).

Shot scenarios are declared in `main.js` as data — `{ id, seed, variant, clock, pos, yaw, pitch,
fov, craft, hud }` — and committed as `shots/<id>.json` so the camera is identical every round. A
shot that moves between rounds makes score movement meaningless.

**`tools/compare.mjs`** — the blind sheet. Port from `forge/tools/compare.mjs`.

```
node tools/compare.mjs --shot=fog_city --round=1 [--ref=<plateId>] [--calib]
```

- `REFS = resolve(ROOT, '../../../../gms/3d/aaa_refs/cyber/refs/board')`. Verified: from
  `site/gms/3d/neonhaul/`, four levels up is `~/cc/yru/`, then `gms/3d/aaa_refs/cyber/refs/board`.
  **Plates are copyrighted press screenshots and live outside `site/`. They are never copied in,
  never committed, never shipped.**
- Reads the plate crop from `refs/../plates.json` *and* from the per-shot `CROP` table in §12.1,
  applying ours if present (the `plates.json` crops were authored for the board, not for scoring).
#### 12.4.1 The blind sheet must actually be blind — nine tells, and how each is closed

§12.4 claims the critic "never receives the plate id, the shot id, the repo path". The tool this
plan says to port, `forge/tools/compare.mjs`, breaks that in three ways and inherits four more from
how the two halves are produced. A critic agent has `Read`, `Bash` and `Glob` — it does not need to
guess, it can look. Every one of these is closed before round 1.

| # | The tell | The fix |
|---|---|---|
| 1 | **The filename is the answer.** `critique/fog_city_r1.png` is handed to the critic, and `cockpit`, `day_smog`, `wet_street`, `hero_craft` announce what the shot is *of*, which primes the entire scoring. | Write to **`critique/sheet_<8-hex>.png`**, where the hex is from `crypto.randomBytes(4)` and is **not** derived from the shot or round. Record the mapping in the key file. Hand the critic only that path. |
| 2 | **`.keys/` is inside the repo.** `const KEYS = resolve(ROOT, '.keys')` with a comment claiming it is "outside the critic's reading path". `.gitignore` hides it from git, not from an agent with `ls`. | Move it **outside the repo** to **`~/.cache/neonhaul-keys/`**. Say so in the tool and drop `.keys/` from `.gitignore` (§2.1). |
| 3 | **Compression generation.** Our render is a mathematically clean PNG; the plate is a press JPEG carrying ringing, chroma subsampling and block edges. Same geometry, different artefact floor — a learnable, visible tell, and the one a careful critic notices. | Encode **our** half to JPEG **q88** *before* the shared prep chain, so both halves have been through the same number of generations. Then encode the finished sheet as JPEG q88 as well, and add matched grain to both halves inside the shared chain: `noise=alls=4:allf=t+u`. Assert both halves have a non-zero noise floor — a region of exact `#000000` in one half and not the other is the same tell wearing a different hat. |
| 4 | **Ordering.** Randomising the side is right, but a critic that scores several rounds can learn a bias if the RNG is seeded from anything it can see. | Seed from `crypto.randomBytes`, never from the shot id or the round. Balance **per shot**: track the side in the key file and force a 50/50 split across each shot's rounds rather than trusting the coin. |
| 5 | **Metadata.** ffmpeg copies input metadata by default in several muxers; Chrome's screenshots and the press plates carry different tags, and `oxipng --strip safe` would preserve them. | `-map_metadata -1 -fflags +bitexact` on the sheet encode. |
| 6 | **Dimensions and resampling.** Both halves are already forced to 900×506 — but an *upscaled* half is softer than a downscaled one, which is visible. | Require the render input to be at least 900×506; `shot.mjs --w=1600 --h=900` is the minimum for anything feeding `compare.mjs`. Both halves are then always downsampled by the same filter. |
| 7 | **Colour profile.** Chrome may embed an sRGB or Display-P3 ICC; press plates usually carry none. | Force both through `-pix_fmt yuvj420p -color_primaries bt709 -color_trc bt709 -colorspace bt709` and strip the profile. A filtergraph re-encode does not carry ICC through, but state it so nobody adds `-map 0` later. |
| 8 | **Padding.** A half that is letterboxed to fit the other's aspect is instantly identifiable. | The render is authored at the plate crop's aspect (§12.1 already does this for `day_smog`); make it a general rule and assert equal input aspects before stacking. |
| 9 | **The prompt.** The shot id in the sheet path is closed by (1), but the prompt text must not reintroduce it. | The critic gets `CRITIC_PROTOCOL.md`'s prompt and the sheet path. It is never told what the shot is of, which game the other image is from, or that one of them is ours. |

- **Randomises the side**, writes the sheet to `critique/sheet_<8-hex>.png`, and writes the answer key
  to `~/.cache/neonhaul-keys/<8-hex>.json` — `{ sheet, shot, round, oursSide, ref, crop, stats }`.
- ffmpeg filter, both images through the identical chain so neither the crop nor the codec can
  become a tell:
  ```
  [0:v]{prep}[a];[1:v]{prep}[b];[a][b]hstack=inputs=2,pad=iw+24:ih+24:12:12:color=0x0b0d12
  prep = crop=…, scale=900:506:force_original_aspect_ratio=increase, crop=900:506, noise=alls=4:allf=t+u
  ```
- **A per-plate `TRIM` table**, applied to *both* sides. `746850_02` gets `top: 0.12` to remove the
  reference game's mission card — forge learned this the hard way: a critic that can see the other
  game's UI stops judging the render and starts reading the HUD, and named the toolbar as its
  evidence on both sheets.
  **The `TRIM` table currently covers exactly one plate, and that is not enough.** Every plate we
  score must be audited for the source game's HUD, watermark or logo before round 1 — a visible
  third-party HUD identifies the real game instantly and voids the round. `1488490_00` and
  `746850_03` in particular need confirming. Fill the table, then look at all six sheets once.
- `--calib` builds the every-fourth-round calibration sheet. **It must not put the identical file on
  both sides.** A critic that notices the two halves are pixel-identical will score them identically
  by inspection, and the check passes without measuring anything about that critic's reliability.
  Instead: **two different crops of the same plate**, or the same crop with a ±2 % exposure jitter on
  one side. The ≥ 8 / ≤ 1.0 rule stays exactly as it is — that part is a genuinely good check and
  this is the change that makes it mean something.
- **`--virtual-time-budget` does not advance a WebGL sim** (`MANAGER_BRIEF.md`, and it has cost real
  time before). `shot.mjs` and `soak.mjs` wait on `window.__ready` and on real elapsed time, never
  on virtual time. Stated here next to the software-renderer caveat because this is where a tooling
  builder looks.

**The critic receives exactly two things**: the sheet path from §12.4.1 item 1, and the prompt from
`CRITIC_PROTOCOL.md`. It is never given the key path, the plate id, the shot id, the repo path, or
any statement that one of the two images is ours. A critic agent is cheap and read-only, so this is
the one case where two agents run at once.

**`tools/budget.mjs`** — imports `open()` from `shot.mjs`, runs each shot plus a 60 s `?auto=1`
flight, samples `__state` at 10 Hz, and fails on the gates in **§3.11.2**: draws > 90, tris > 260k,
worst `ms.gen` > 1.4 ms, worst frame > **12 ms**, mean frame > **6.0 ms**, plus the §3.2.1 static
fog/LOD check which needs no rendering at all. Run **headed** for real GPU numbers; the software
renderer's 8–25 fps means nothing.

**It runs on a Mac and therefore cannot verify §1's shipping requirement.** `--use-angle=metal` on
an M-series GPU is not an A15 at native resolution — the 6 ms mean is a *proxy* chosen with a 2.5×
headroom factor, not a measurement. The real number comes from P10's phone step (§3.11.2). Do not
tick §1 item 2 on `budget.mjs` output.

**`tools/soak.mjs`** — a long `?auto=1` run sampling `__state`. Two caveats carried over from
voidcast, both learned the hard way: the software renderer runs the sim slower than wall-clock, so
read the sim's own `time` field and never wall-clock elapsed; and screenshot-only checks miss balance
and state bugs entirely — sample `__state` on a timer.

---

## 13. Phase plan

One agent at a time. Each phase ends in something a tool can verify. A phase that cannot state its
"done" as a command someone can run is not a phase.

**Fourteen phases, because three of the original eleven were too large for one agent** (`DECISIONS.md`
decision 7 requires a phase to be executable from its named sections alone). P1, P3 and P7 are split.
The split points are chosen so each half is independently verifiable and so the riskiest UI in the
project stops being the last thing a tired agent does.

| | phase | named sections |
|---|---|---|
| 1 | **P0** Scaffold, harness, platform lifecycle | §1, §2 (all), §3.11.2, §12.4 |
| 2 | **P1a** Atlases, materials, sky, grade | §2.3, §3.4, §4 (all) |
| 3 | **P1b** The offline signage bake | §3.5.1–§3.5.3, §3.5.6, §12.2 |
| 4 | **P2** City generation and rendering | §3.1–§3.3, §3.6, §3.8, §3.10 |
| 5 | **P3a** Signage placement, strips, strobes, antennae | §3.5.4–§3.5.5, §3.10 |
| 6 | **P3b** Weather, reflections, shafts, halos, silhouettes → **CRITIC** | §3.7, §3.9, §4.4–§4.5, §12 |
| 7 | **P4** Flight, controls, camera, collision | §5.2, §6 (all) |
| 8 | **P5** Vehicles and traffic → **CRITIC** | §5 (all), §12 |
| 9 | **P6** Cockpit, dash, holo, minimap, toasts → **CRITIC** | §8, §12 |
| 10 | **P7a** Zones, missions, economy, job board, shop | §3.1.2, §7.1, §7.2, §7.4 |
| 11 | **P7b** The docking panel, alone | §7.3, §9.6 |
| 12 | **P8** Audio | §10, §11, `docs/SUNO.md` |
| 13 | **P9** Generated client media | §9 (all) |
| 14 | **P10** Polish, perf, ship → **CRITIC** | §1, §3.11.2, §12, §14 |

**P1b can run first, or concurrently with P0** — the signage bake is fully offline, touches no game
code, and produces two files. It is the one place in the plan where the "one agent at a time" rule
could safely be relaxed if the manager wants the schedule back.

---

**P0 — Scaffold, harness and platform lifecycle**
`index.html`, `style.css` skeleton, `.gitignore`, `config.js`, `utils.js`, `save.js`, a `main.js`
with the renderer, the composer (§2.3 — `NoToneMapping`, `HalfFloatType`, `samples`, `info.reset()`),
master loop, quality preset selection, fps guard and URL-flag parsing. **All seven items of §2.8.**
`tools/shot.mjs`, `tools/compare.mjs` (with §12.4.1's nine fixes), `tools/budget.mjs`,
`tools/soak.mjs`. Six **placeholder** `shots/*.json` (§12.1 — P3b freezes the real cameras).
`docs/SUNO.md` already exists; do not regenerate it.
**Done:** the page boots to a graded black frame with a `?perf` overlay; `?lite=1` visibly changes
`__state.quality`; `node tools/shot.mjs --shot=fog_city` writes a PNG and a stats JSON;
`node tools/compare.mjs --shot=fog_city --round=0 --calib` writes `critique/sheet_<hex>.png` and a
key under `~/.cache/neonhaul-keys/`, and `ls` inside the repo finds no key; `window.__ready`,
`__state` and `__game` all exist; **and every §2.8 done-criterion passes** (thrown error lands in
`__state.errors`; `document.hidden` parks and resumes with no `dt` spike; a forced context loss
recovers without a reload; rotation resizes `composer.renderTarget1`).

---

**P1a — Atlases, materials, sky, grade**
`atlas.js`, `materials.js`, `sky.js`, `districts.js`. The window/ground/droplet/halo canvases
(runtime), including §3.4's gutters and clamped mip chain. The three `onBeforeCompile` patches, all
routed through §2.3's `patch()` helper. The five day variants with §4.1.1's fog colours, the clock,
the blend, the env bake. **The grade `ShaderPass` including ACES (§4.6) and the blue-noise dither.**
The light shaft geometry, material and view-dot term against a **fixed debug anchor** — their real
anchoring is a P3b job, because it needs chunk gaps and chunks do not exist yet (§4.5).
Also: **rebuild the reference board** at `~/cc/yru/gms/3d/aaa_refs/cyber/cyber_reference_board.html`
so it shows the corrected plate set (`DECISIONS.md` decision 1). It is outside `site/`, so it is a
tools task and nothing is committed.
**Done:** a debug scene of 40 boxes shows correct per-instance window emissive **and correct tiling
on a 400 m box** (the §3.4 case — a box taller than one atlas cell must show a continuous window
grid, not a smear of other patterns); the height-fog band is visibly at 90–260 m (screenshot at
three altitudes); §4.6's ACES A/B produces two visibly different images; §4.1.1's three-depth
luminance check passes; a `?time=` sweep crossfades all five variants with no pop; `daysmog` has no
blue in the frame (assert on a sampled pixel); no `patch()` warning appears in `__state.errors`;
`tools/budget.mjs` reports draws and tris.

---

**P1b — The offline signage bake** *(fully offline; may run first or alongside P0)*
`tools/signbake.html`, `tools/bake_signs.mjs`, `data/signwords.json` → `assets/signs.png` +
`data/signs.json` (§3.5.1–3.5.3, §3.5.6). A bake page, the abstract glyph generator with its three
families, a shelf packer with §3.5.1's 8 px gutters, 242 regions, the tofu coverage check, the CDP
driver, and the mandatory `oxipng` step. The abstract generator is the primary path and must be
built and eyeballed first; the 12 real-script tiles are added after it works and are cut on the
coverage check if they do not render.
**Done:** `assets/signs.png` exists, is **≤ 400 KB**, and is **verified colour type 0, 8-bit
greyscale** by reading the IHDR (§3.5.6 step 6) — not merely "looks grey"; `tools/signbake.html`
opened in a browser shows 242 legible regions with the three abstract families visibly distinct from
each other; the baker's log states how many real-script tiles survived the coverage check; a test
quad tinted three different colours from the same atlas region proves the greyscale-tint scheme;
the bake fails with an install instruction on a machine without `oxipng`.

---

**P2 — City generation and rendering**
`city.js`, `blocks.js`, `render_city.js`. Chunk grid, deterministic hashing, districts, **the
authored core and its keep-out (§3.1.1)**, `data/landmarks.json`, `data/names.json`, the 8
prototypes, the three LOD fields **at the same window pitch**, slot allocation, chunk↔LOD migration
with §3.2.2's cross-fade, the collision AABB store, and the streaming queue with §3.2.3's per-frame
budget.
**Done:** a free camera can fly anywhere with worst frame ≤ **22 ms** and worst `ms.gen` ≤ **1.4 ms**
(`tools/budget.mjs`); ≤ 55 world draws and ≤ 260k tris; a node determinism test hashes 1000 chunk
descriptors and matches a golden value across two runs; **all eight landmarks are present at their
authored coordinates with no seeded building inside any keep-out radius** (assert in the node test);
the player spawn (§3.1.1) is on the `spindle` deck and not inside geometry; **§3.2.2's screenshot at
320 m shows no LOD discontinuity** and a 10 s `?auto=1` video crossing four chunk boundaries shows
no sweeping line; `budget.mjs`'s §3.2.1 static check passes for all five variants at both presets.

---

**P3a — Signage placement, strips, strobes, antennae**
`signage.js` — the two instanced meshes, the five placement layers, atlas region selection, the
clustering rule, the shader animation, and the hero billboard canvases — plus the strip, strobe,
antenna and sky-bridge fields.
**Done:** signs render from the baked atlas with per-instance tint, both `signsNeon` and `signsBox`
present, mipmapped and not crawling when the camera moves (check a 10 s video, not a still); the
five depth layers are all populated and **blades visibly project perpendicular from podium faces**;
signage clusters rather than sprinkles (a screenshot must show dense blocks next to dark blocks);
§3.2.2's signage intensity ramp is live so nothing pops at the LOD0 boundary; the strobe column
spacing is exactly 60 m (§3.10 #3).

---

**P3b — Weather, reflections, shafts, halos, silhouettes** → **CRITIC**
`weather.js`, `reflect.js`, the LOW halo sprites, and the light shafts' real chunk-gap anchoring.
**This is the phase that decides whether the whole rendering plan works**, which is why the three
rendering shots are scored at the end of it.
**Done:** the mirror group renders with the correct winding and the §3.7(b) draw order — **a building
between the camera and a sign occludes that sign's reflection** (screenshot); the water film and the
road read as one surface; `?lite=1` halos are **measured** against `?lite=1` without them, and if
they cost more than the bloom they replace, LOW ships bloom-less and that is recorded (§4.4); the
shot cameras are authored and **frozen** (§12.1); `fog_city`, `canyon_dive` and `wet_street`
rendered and scored, three passes each per protocol; `day_smog`'s expected deficit is written into
`SCORES.md` **before** any round; `SCORES.md` has its first rows; the silhouette module is either
kept or deleted on the critic's say-so.

---

**P4 — Flight, controls, camera, collision**
`flight.js`, `controls.js`, `camera.js`, plus the settings that affect them.
**Done:** a 5-minute `?auto=1` soak with no NaN, no stuck-on-wall, no altitude runaway; a CDP touch
test drives both halves in portrait *and* landscape, with the side flipped and unflipped; the
auto-stop assertion passes (full cruise → release → speed 0 within 1.2 s); desktop keys all work;
proximity repulsion demonstrably slides the craft along a facade rather than stopping it.

---

**P5 — Vehicles and traffic** → **CRITIC**
`craft.js`, `traffic.js`. The hull curve generator, the 9 defs, the shared light rig, thrusters,
lanes, near craft, far streaks, and `patrol` **as an ambient traffic variant with no behaviour**
(§5.2).
**Done:** all 9 craft render from the shared generator with only L/W/H and the three integer options
differing (a contact sheet in the handoff proves it); traffic reads as light streaks past 220 m;
`patrol` craft fly lanes and never deviate toward the player (assert over a 60 s soak that no
`patrol` closes below 60 m of the player except by lane coincidence); `hero_craft` scored.

---

**P6 — Cockpit, dash, holo panels, minimap, toasts, chatter popup** → **CRITIC**
`hud.js`, `minimap.js`, and the non-dock parts of `ui.js`.
**Done:** cockpit renders with **no occupant, no hands, no seat** (explicit check); dash canvas at
12 fps; three holo panels, the right one showing cell range and **no heat pips**; minimap draws
footprints, zones **with their type glyphs**, the authored core's labels, the 4–760 m altitude ring
and the rear arc; toasts and the chatter popup work with the §8.5 read-time rule (assert the
computed hold for a 60-char line is 6.9 s); `cockpit` scored.

---

**P7a — Zones, missions, economy, job board, shop**
`zones.js`, `missions.js`, `economy.js`, and the job board and shop in `ui.js`. All of §7.4's
formulas and constants, §7.4.5's job selection, and §7.1's zone placement with the landmark keep-out.
**Done:** a CDP-driven script completes three deliveries and the navigating-autopilot soak
(`?courier=1` — see below) reaches licence tier 2 **within 9 minutes of sim time** (§7.4.8);
§7.4.6's worked example is reproduced exactly by the code — a 1.8 km risk-0 job shows base **415**,
and delivering it at **0:42** with one chained parcel pays **650**;

*Two criteria amended at integration, both because they were stated against something that turned
out not to be true.* (1) **"delivering it at 2:05"** was 2:05 only because the limit was 4.5× the
flight time; the payout of **650** is unchanged, see §7.4.6. (2) **`?auto=1`** is `js/autopilot.js`'s
fixed 120 s route, which four gate suites and `budget.mjs` measure against; a navigator that goes
wherever the board sends it cannot be the same flag. The soak runs under **`?courier=1`**, which is
the same flight model, the same input struct and the same economy.

**A third criterion is unmeetable as written:** `grep -rn "heat" js/` cannot return nothing — the
six hits are comments recording DECISIONS decision 6 in the code that implements it. Gate T14
strips comments and string literals and scans the code: 0 in code, 6 in comments, with F5 injecting
a real one to prove the scan catches it. `grep -rn "heat" js/` returns nothing; `grep -rn "alert(\|confirm(\|prompt(" js/`
returns nothing; a 20-minute soak never leaves the player with 0 credits and 0 cell (the §7.4.3 tow
is exercised at least once).

---

**P7b — The docking panel, alone** → **REVIEW GATE**
`dock.js` and nothing else. **§7.3's checklist is the entire brief for this phase**, plus §9.6's
element spec and absence behaviour.

This is a phase on its own because R4 in this document's own risk register predicts that the docking
panel "is the piece most likely to be rushed at the end of a long phase by an agent that has been
doing shader work all day" — and the first draft's P7 then did exactly that to it. It is the main UI
of the game and the brief says it must look outstanding.
**Done:** the panel renders correctly in portrait **and** landscape with a placeholder portrait; the
static-blur background is produced by §7.3's in-frame `drawImage` and **`backdrop-filter` appears
nowhere in `style.css`**; every number on the panel is produced by §7.4's formulas; the media element
carries all of §9.6's attributes and a rejected `play()` degrades to the still; a written design
review against the §7.3 checklist is in the handoff. **If that review is not satisfied, P7b does not
close.**

---

**P8 — Audio**
`audio.js`, `radio.js`, `assets/audio/manifest.json` with all **73** slots listed and the directories
empty. §10.4's two-stage shuffle bag. `tools/split_chatter.py` with its failure path (§11).
**Done:** with **zero** audio files present, the game runs, the traffic net plays, and foreground
chatter appears as text-only popups on schedule; the AudioContext unlocks on the first gesture and
**sound is verified present under an iOS user agent in CDP** (§2.8); a 25-minute virtual-clock run of
the director draws **no foreground line twice** (§10.4's shuffle-bag claim, asserted rather than
believed); dropping one dummy mp3 into `chatter/` makes it play, duck the music, and show its popup
for the computed hold; the radio bus audibly band-limits a clean input.

---

**P9 — Generated client media**
`tools/gen_clients.py`, `data/clients.json`, and the panel wiring.
**Done:** **16** clients generated in two separated batches (Flux then LTX, never concurrent), with
stable per-client seeds; ~3.2 MB committed; the panel plays a seamless ping-pong loop **with no seam
hitch at either the turn or the loop wrap** (§9.2 — watch three full cycles); the clip plays
**inline** under mobile emulation (§9.6); the CDP network log shows **zero** `.mp4` fetched when only
the job board has been opened; deleting `assets/clients/` leaves the game fully playable.

---

**P10 — Polish, perf, ship** → **CRITIC**
Final perf pass, `?shot=hero_craft&nohud` thumbnail at 1280×800, `day_smog` scored, any failed shot
re-run, `SCORES.md` completed, `CLAUDE.md` written, `projects.js` entry and
`assets/screenshots/neonhaul.jpg` added.
**Done:** every item in §1's shipping checklist is ticked; **the real-device measurement has been
taken** — the Pages URL opened on Aaron's phone with `?perf`, in portrait and landscape, at default
and `?lite=1`, with the four numbers written into the ship handoff (§3.11.2); staged paths are
`gms/3d/neonhaul/**` plus one hunk of `projects.js` plus one screenshot, and nothing else; pushed to
`main`.

---

Fourteen phases. Note what is *not* here: there is no art-import phase, no asset-pack phase, no
rigging or animation phase. That is the §1.1 people rule paying for itself.

---

## 14. Risks

**R1 — Chunk streaming hitches, and the whole thing feels bad at 40 fps average.**
A single 8 ms hitch every few seconds is more noticeable than a lower steady frame rate, and it is
the classic failure of every streamed open world.
*Mitigation:* §3.2.3 — four yieldable work units of ≤ 1.2 ms each, a **per-frame** cap of 1.2 ms of
generation regardless of how many units that is, and a defer threshold of 6 ms. The cap sits below
the budget rather than above it, which is what the first draft got backwards. The 5×5 near ring is
pre-warmed at boot behind the loading bar. LOD migration is per-chunk, not per-building, so it is
bounded at ~40 matrix writes, and §3.2.2's cross-fade allocates the LOD1 slots before the boundary
rather than at it.
*Gate:* `tools/budget.mjs` records the worst frame and worst `ms.gen` over a 60 s flight;
**> 22 ms or > 1.4 ms fails P2**, no exceptions.

**R2 — A mostly-black frame bands, crushes, or looks washed out on a real phone.**
This is the risk that is invisible on a desktop monitor and fatal on a cheap OLED. 8-bit banding in a
dark gradient looks like a rendering bug, and a phone in a bright room shows nothing at all.
*Mitigation:* the blue-noise dither in the grade pass lands in **P1a**, not in polish, and is kept in
LOW. ACES lands there too (§4.6) — an untone-mapped near-black frame with saturated point sources is
this failure in its purest form. An exposure slider (0.8–1.4) in settings from P1a, driving the grade
pass's `uToneExposure`. Every critic round is judged on a real screenshot, and "Finish" is the
criterion that catches banding. Test on a phone with the brightness at 40 %, not 100 %.

**R3 — Bloom cost sinks the mid-Android floor.**
`UnrealBloomPass` is **thirteen** passes (§3.8) and its cost scales with resolution, which is exactly
the axis a mid Android is worst on.
*Mitigation:* half res is the class's own default and cannot be turned off; what we add is the input
clamp to 768 × 1664 (§4.4). The halo-sprite substitute is built in **P3b alongside** the real thing,
so LOW is a designed look and not a degraded one — **and it is capped and measured against the bloom
it replaces**, because an uncapped halo field on the weakest device can cost more than the fixed
pass it stands in for. The fps guard drops bloom automatically before it drops anything the player
would notice more. If it still bites, the next lever is `ringNear` 2→1 — which per §3.2.1 also
requires pulling `fogFar` in to 420 m, since those two are one system.

**R4 — The docking panel is under-built because it is "just DOM".**
It is the main UI of the game, the brief says it must look outstanding, and it is the piece most
likely to be rushed at the end of a long phase by an agent that has been doing shader work all day.
*Mitigation:* **it gets its own phase.** P7b builds the panel and nothing else, with §7.3's checklist
as its entire brief and its own review gate, and its client media lands in P9 *before* ship so the
panel is never assessed empty. If P7b's review is not satisfied, P7b does not close. The first draft
identified this risk correctly and then put the panel at the end of the largest phase in the plan;
the phase split is the mitigation actually acting on the prediction.

**R5 — Flux/LTX queue contention with the other sessions on this machine.**
The awake and the-horrors sessions queue clips in bulk; a `queue_depth` of 30+ is an hour of waiting,
and 16 portraits plus 16 clips behind that is a dead afternoon. Worse, interleaving Flux and LTX
work will thrash the 24 GB.
*Mitigation:* **16 clients rather than 24** (`DECISIONS.md` decision 4) is itself the largest part of
this mitigation — it takes roughly a third off the phase. `gen_clients.py` checks `queue_depth` on
both servers first and **exits with a message rather than queueing** if either is above 20. Two
strictly separated batches with `wait_for_ltx_idle({})` between them, using the shared helpers from
`awake/regen_helper.py` rather than a reimplementation. The script is idempotent, so an interrupted
run resumes for free. And the game is built to be fully playable with no client media at all (§9.6),
so P9 can slip without blocking P10.

---

## 15. Open questions — see `docs/DECISIONS.md`

**There are none left in this document.** All six questions this section used to pose have been
answered by the manager, and the answers are binding:

| was asked here | answer |
|---|---|
| The plate substitutions in §12.2 | **Accepted.** `979690_01` and `1939970_10` dropped, `746850_03` substituted, `cockpit` scored against `746850_02`, the architect's crop rects used. `refs/board/` and `plates.json` are updated; **the board page is rebuilt at P1a.** |
| Rear-view | **No.** Ship the rear-arc fallback. The 2.2 ms mirror-strip spec stays in §8.7 in case Aaron overrules it after playing. |
| Seeded infinite vs authored districts | **Both** — seeded-infinite substrate plus an authored core of 6–10 landmarks across 2–3 named districts. Built in **§3.1.1**. |
| Client count | **16**, and `clients.json`'s length drives everything (§9.1). |
| The 12 real-script signage tiles | **Keep them**, with the mechanical tofu fallback. Abstract remains the primary path. |
| Heat and police | **Ambient only.** No heat, no pursuit, no combat, no fail state. Police are a traffic variant with distinct lights plus radio flavour. See **§7.4.10** for the full deletion list. |

`docs/DECISIONS.md` is the authority and it wins over this document wherever they disagree. **Do not
relitigate any of the six.** If one turns out to be wrong in practice, raise it with the manager
rather than working around it — that is what decision 7 asks for.

Anything genuinely still open is recorded in `docs/REVISION_NOTES.md`, not here, so that this
document never again contains a stale question a builder could mistake for an invitation.

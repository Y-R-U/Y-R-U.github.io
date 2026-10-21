# PERF lane — Krayzee on a phone

Target: Samsung S22 Ultra, 60 fps on low and medium (D6: boot low, step up once the device proves it can hold 60).
Lane owns `tools/perf.mjs` and this file. Read-only everywhere else, so every fix below names the lane that owns the code.

## How to measure

```
~/.claude/bin/cdp start --port 9551 -- --use-angle=metal      # never without metal: swiftshader fps is fiction
node tools/perf.mjs                                           # everything, ≈ 25 min
node tools/perf.mjs --only=matrix --quick                     # portrait, chase+cockpit, ≈ 4 min
node tools/perf.mjs --only=calls,uploads                      # draw calls by owner + per-frame re-uploads, ≈ 1 min
~/.claude/bin/cdp stop 9551
```

Sections: `boot` (first menu frame, bytes, long tasks, world-build stages at 1× and 4× CPU), `matrix` (2 orientations ×
3 locked tiers × 3 views × 5 moments), `forced` (`?quality=` builds content at that tier), `throttled` (4× CPU),
`profile` (5 s CPU profiles at 1× and 4×, by file and by inclusive game function), `governor` (60 s of D6 decisions at 1×
and 4×), `uploads` (which BufferAttributes/textures change version every frame), `calls` (draw calls of one frame by
owner, main vs shadow pass), `heap` (allocation sites incl. collected objects, retained heap after forced GCs).
JSON lands in `docs/shots/perf/perf-<stamp>.json` and `latest.json` (gitignored), phone screenshots of every moment too.
The reference run for this report is `perf-2026-10-21T22-00-07.json` (+ the `calls`/`uploads`/`heap`/`profile`
runs right after it).

Moments (runway 27 active): `runway` lined up at the 09 end, `climb` 150 m over the western woods, `downwind`
300 m with the village and castle in view, `final` 2.2 km out at 80 m, `apron` in front of the terminal.

How to read it: headless Chrome on an M5 with ANGLE-Metal. **Counts transfer exactly** (calls, triangles, uploads,
layout reads, allocations). **The 4× CPU-throttle column is the best stand-in for the S22 Ultra's main thread** (a
Snapdragon 8 Gen 1 / Exynos 2200 big core runs this kind of JS roughly 3–4× slower than an M5). GPU timer numbers are
real `EXT_disjoint_timer_query_webgl2` readings on the M5. The phone column multiplies them by 3–5×; treat that as an
estimate only.

The harness taps the page once after boot, so the AudioContext is running as it would be after a player's first
touch. Without that tap the numbers are badly wrong (see hotspot 6).

## Where the frame goes on a phone

Low tier, portrait, 4× CPU, medians over every view and moment:

| | ms / frame |
|---|---|
| rAF callbacks (whole game frame) | **16.6** (p95 22, max 27–44) |
| of which `renderer.render()` (main + shadow) | 7.4 (shadow pass 0.3) |
| of which game JS outside render | ≈ 7.5 (traffic/flight 1.5, controls paint 1.2, audio 0.8, ATC 0.8, markers 0.7, plane update 0.65, world update 0.6 avg (spiky), HUD 0.4) |
| forced layout from `innerWidth`/`getBoundingClientRect` reads | 1.2–2.3 |
| style recalc | 0.6–1.1 |
| resulting fps (headless GPU is not the limit here) | **47–57** |

**On a phone this game is CPU-bound before it is GPU-bound.** The tier mostly changes GPU load, so the CPU frame is about
the same on every tier (14–17 ms at 4×). Even low misses 60 on the main thread alone. The D6 governor steps up only at
≥ 56 fps, so a phone that sits at ~50 fps on low for CPU reasons will **never** reach medium, although its GPU has
room for it. The CPU fixes below matter more than any GPU tier tuning: they are what lets the governor step up on
phones at all.

## Ranked hotspots

Est. win = time saved per frame on the phone (4× column), unless it says otherwise.

### 1. Three's render CPU is ~7 ms for ~90 draw calls, and AI planes' far LODs are a third of the calls — ART3 (plane, world)
Evidence (`calls`, one frame, low chase): `plane-far2` (the *coarsest* AI LOD) = **26 calls for 5k tris** (2 AI planes ×
13 materials). Cockpit/final shows 39 calls for 3 planes. `towerCrew` = **13 calls for 2k tris**, drawn even from
the downwind leg (300 m up, 1 km away). By comparison the whole world (terrain, pavement, 4 tree batches, houses,
lights) is ~30 calls. Render CPU at 4× is ~75 µs per call.
Fix (low risk): merge each far LOD (`plane-far`, `plane-far2`) into one mesh with vertex colours and one material
(prop disc and glass dropped at far2; a second transparent mesh only if the glass must show). Merge `towerCrew` into one
mesh, or hide it when the camera is more than ~250 m away. Optionally drop AI planes beyond ~4 km to a single
billboard/dot.
Est. win: **−25 to −45 calls → ~2–3 ms**. The player's `plane-near` (17–21 calls) is next in line if more is needed.

### 2. Tree LOD refresh is a periodic 17–50 ms spike in flight — ART3 (`js/world/trees.js` `refresh`)
Evidence: `refresh` takes 121 ms per 5 s at low and 365 ms per 5 s with high content (4× profile). It runs every 24–60 m
of camera travel, which is every ~0.6–0.8 s at circuit speeds, so **≈17 ms per refresh with low content and ≈50 ms with
high content**, in one frame. That matches frameCpuMax 27–44 ms and dtP95 = 33 ms (a dropped frame) in climb, downwind
and final. Each refresh walks every tree in every visible chunk twice and rewrites the near and far buffers.
Fix: (a) give the far impostors their own, larger move threshold (2–3× the near one); (b) time-slice the refresh over
3–4 frames (fill back-buffers chunk by chunk, swap the counts when done); (c) longer term, keep static per-chunk impostor
ranges and only switch draw ranges.
Est. win: removes a 1–3-frame hitch every ~0.7 s, ≈1 ms on average.

### 3. Layout thrash from per-frame viewport reads plus DOM writes — GAMEPLAY (`controls.js`, HUD), ASSIST (`markers.js`), STORY (`missions.js`)
Evidence: 6.6 layout-forcing reads per frame. `controls.paint` → `R()` (controls.js:56) reads `innerWidth/innerHeight`
every frame, after `paint` has already written `style.bottom`, `style.height`, `textContent` and `dataset`, so each read
forces a synchronous style and layout. `markers.update` (markers.js:228) does the same, and `missions.js:57` reads
`innerWidth` + `offsetWidth`. Measured at 4×: 1.2–2.3 ms per frame of forced reads plus 0.6–1.1 ms of style recalc.
`R` alone is 216 ms per 5 s in the 4× profile.
Fix: cache W/H from a resize listener (`R.onResize` already exists). Write DOM only when the value changed (throttle %,
mode chips, view label, `dataset.hand`). Do all reads before all writes. The 20-frame `publishSafeZones` timer is fine.
Est. win: **~1.5–3 ms**.

### 4. Pilot CPU skinning re-uploads the whole mesh every frame and makes 20 % of all garbage — ART3 (`js/plane/pilot.js`)
Evidence (`uploads`): `pilot.position` + `.normal` change **7–8 times per frame**, and the full buffers go up every frame:
**42 KB/frame with low content, 146 KB/frame with high** (6,242 verts). The upload happens even in chase view at 300 m.
`heap`: `pose` allocates 54 MB per 20 s (2.7 MB/s, **20 % of all JS allocation**), mostly boxed doubles from
`Math.hypot` in the inner loop. Plane update costs 160 ms per 5 s at 4×.
Fix: `addUpdateRange` per posed part, so only the dynamic ranges go up. Replace `Math.hypot` with `Math.sqrt(x*x+y*y+z*z)`
(or skip the renormalise: the transforms are rigid). Pose at ≤ 30 Hz, or freeze the pose when the pilot covers only a
few pixels (chase beyond ~40 m). Best long-term: a per-vertex part index plus a small mat4 uniform array, skinned on the
GPU, so nothing uploads at all.
Est. win: −40–140 KB/frame of uploads, ~0.5 ms CPU, −2.7 MB/s of GC pressure.

### 5. Boot: one 3.8 s frozen task before the first menu frame — GAMEPLAY (`main.js` boot), ART3 (textures), manager (three build)
Evidence (`boot`, phone UA, low content):

| | 1× | 4× |
|---|---|---|
| first contentful paint | 1.19 s | 4.77 s |
| first menu frame after ready | 1.10 s | 4.70 s |
| longest task | 820 ms | **3,827 ms** |
| world build (`buildWorld` low) | 1.18 s | 2.18 s |
| one plane build | 0.12 s | 0.50 s |
| downloaded | 4.11 MB raw / 1.39 MB gzip, 130 requests | |

World-build stages at 4× (low): airport 694 ms, terrain 332, shade 271, plus trees. The top functions are
**`skidAtlas` at 334 ms** (262,144 `fillRect` calls, each with a fresh `rgba()` string; textures.js:152),
`getProgramInfoLog` at 104 ms (three's `checkShaderErrors` forces a synchronous wait on every shader compile), canvas
`drawImage`/`fillRect`, and `lakeDist`/`airfieldMask` (high content only: terrain alone is 1.8 s at 4×). `buildWorld` is
`async` but never awaits, so the loading bar cannot repaint during the build.
Fixes, all low risk:
- ART3: build `skidAtlas` streaks into an `ImageData` and `putImageData` once: **−330 ms at 4×**. Same treatment for any
  other per-pixel `fillRect` loops in `textures.js`.
- ART3: `await new Promise(requestAnimationFrame)` between the `mark()` stages in `buildWorld` (the API is already async),
  so the loading bar moves and no single task runs over ~700 ms on a phone.
- GAMEPLAY: `renderer.debug.checkShaderErrors = false` unless `?debug=1`. Replace the synchronous `renderer.compile` at
  main.js:102 with `await renderer.compileAsync(scene, camera)` (uses KHR_parallel_shader_compile on Android). Build only
  the first attract plane before the menu and the other three after the first frame.
- Manager: `three.core.js` + `three.module.js` are the unminified builds (2.0 MB raw, 396 KB gzip, 49 % of bytes).
  Vendoring the `.min.js` pair next to them under `gms/lib/three/0.180.0/` and pointing the importmap at them saves
  ~45 % of parse/compile and ~120 KB gzip. Other games are unaffected. This is a shared-lib decision.
- RADIO: `script.json` + `barks.json` (523 KB raw, 66 KB gzip) are fetched at boot with `cache: 'no-cache'`. They are
  async, so they do not block, but they could load after the first menu frame.
Est. win: first menu frame **4.7 s → ~3 s** at 4×, and no frozen loading bar.

### 6. Audio automation piles up while the AudioContext is suspended — AUDIO (`js/audio/index.js`), GAMEPLAY (`updateAudio`)
Evidence: on the first run, before the harness tapped the page, Web Audio cost grew **0.28 → 5.6 ms per frame over
4 minutes**, and frame CPU rose 1.5 → 7.6 ms at 1× (≈20 ms on a phone). It is the same ~124 `setTargetAtTime` calls per
frame every time. Each one inserts into a timeline whose `currentTime` is frozen, so nothing ever expires. With the
context running it stays flat at 0.08 ms (0.4–0.5 ms at 4×). On a phone this hits the **whole menu/attract phase
before the first tap**, and any time iOS re-suspends the context while rAF keeps running.
Fix: skip `apply()`/`ramp()`/listener updates while `ctx.state !== 'running'`. When the context resumes, call
`cancelScheduledValues(now)` once. Separately, skip a `ramp` whose target moved less than ~0.5 %: most of the 124
calls per frame re-send the same value.
Est. win: prevents unbounded growth (multi-ms) on the menu, plus ~0.3 ms steady.

### 7. A settings-forced tier on a phone builds desktop content (2× the triangles) — GAMEPLAY (`main.js` `contentQ`)
Evidence (`forced`, portrait chase): `?quality=medium` gives **306–317k tris and 65–115k shadow tris**, against 172–188k
for the governor's medium on low content. Uploads go 42 → 147–194 KB/frame. A player who picks "Medium" in Settings gets
a scene ~1.8× heavier than auto-medium.
Fix: on `isMobile()`, keep content at `low` (or a new `medium` content level) whatever the forced renderer tier. Only
desktop builds high content.
Est. win: −45 % tris and −100 KB/frame of uploads for phone users who force a tier.

### 8. GPU fill at medium and high is borderline for a phone — GAMEPLAY (`renderer.js` TIERS), ASSIST (`markers.js`)
Evidence: GPU time main + shadow on the M5 (median / max): low 2.8 / 4.3 ms, **medium 4.4 / 6.1, high 4.6 / 6.2**.
Drawing buffers: low 487×1055 (0.51 MP, no MSAA), medium 682×1477 (1.0 MP, MSAA), high 780×1688 (1.3 MP, MSAA).
At 3–5× for the phone GPU that is roughly low 8–14 ms, medium 13–22, high 14–23. The shadow pass is cheap everywhere
(0–37 calls, ≤ 50k tris, GPU ≤ 0.4 ms typical), so it is not where the cost is.
The `markers.js` overlay is a second full-screen canvas at DPR 2 (1.3 MP), cleared and redrawn every frame, with
`getComputedStyle` twice a second. On a phone that is an extra full-screen layer to raster and composite.
Fix: medium at DPR 1.5 instead of 1.75 (−27 % pixels; with MSAA it still looks better than low). Markers canvas at
DPR 1–1.5, and skip the clear+draw when no marker changed (or draw only dirty rects).
Est. win: medium GPU −20–25 %, plus ~1 ms of compositor/GPU from the markers layer (estimate).

### 9. The cockpit gauge canvas uploads 0.15–0.6 MB per frame — ART3 (`js/plane/instruments.js`)
Evidence (`uploads`): the `gauges` texture changes 0.29–0.33 times per frame (~20 Hz). It is 512×256 with low content
(**≈150 KB/frame**) and 1024×512 with high (**≈600 KB/frame**) in the inside views. With high content `draw()` also runs
in chase view, where the panel is hidden (the version bumps, but nothing uploads, so this is wasted canvas CPU).
Fix: skip `draw()` while the cockpit is hidden. Redraw at ≤ 15 Hz and only the gauges whose quantised key changed
(`texSubImage2D` of that cell via `texture.updateRanges`/a per-cell canvas). 512² is plenty on a phone.
Est. win: −100–450 KB/frame of texture upload in the inside views, ~0.2 ms.

### 10. Shared materials force three to re-resolve the program every frame — ART3 (plane materials)
Evidence: `getProgram → getParameters` + `getProgramCacheKey` (array `join`) run **13× per frame**: the `propDisc`
MeshBasicMaterial shared by near and far LODs (6/frame), the `glass` MeshPhysicalMaterial (2/frame), and the shadow
depth material switching between instanced and plain meshes (3/frame; three internal). `heap`:
`three getParameters` = 15 MB per 20 s of garbage.
Fix: one material instance per variant (near/far prop disc, each glass mesh variant).
Est. win: ~0.15 ms, −0.75 MB/s garbage.

### Smaller items
- **JS allocation runs at ≈13 MB/s** (sampled with collected objects). The retained heap after forced GCs is flat at
  45–49 MB over 80 s, so **there is no leak**. Top allocators besides the pilot: `landahead.scanLine/height` (ASSIST,
  7+ MB/20 s), autopilot `_pursue/proj/_finish/_airLoops`, `atc/geometry endInfo`, `cameras.update`, traffic `_mix`.
  `updateAudio` allocates two `Vector3` per frame (main.js:551–552). Each is small; together they drive a minor GC every
  1–2 s.
- Per-frame **DOM churn in `controls.paint`** (style strings, `textContent`, `dataset`, every frame) is part of hotspot 3's
  style cost.
- `lights.js` re-uploads `papiLens.instanceColor` + `papiGlow.color` and `windsocks.instanceMatrix` every frame (<1 KB,
  fine). Houses and trees re-upload only on LOD refresh (fine).
- Programs 36–41 and textures 22–30 across all tiers: fine, nothing grows over time.

## D6 governor over 60 s
| run | decisions | end tier | note |
|---|---|---|---|
| 1× CPU | `up:medium@60`, `up:high@60` | high | steps at 12 s and 18 s as designed |
| 4× CPU | `up:medium@60`, `up:high@58` | high | medium dipped to 52.8–53.6 fps for two windows, no step-down (47 threshold), then up at 58 |

The governor behaves as specified, with no thrash and nothing ever retried. Two observations for GAMEPLAY:
1. It cannot tell CPU-bound from GPU-bound. On a phone whose main thread holds ~50 fps on low (what the 4× numbers
   predict until hotspots 1–4 land), it will stay on low forever, because a higher tier costs GPU, not CPU. Cheap
   option: also step up when fps ≥ 50 and the measured rAF-callback CPU is below ~60 % of the frame interval (the frame
   is CPU-bound, so the GPU has headroom). The GPU timer extension is usually absent on Android Chrome, so don't rely on it.
2. Between 47 and 56 fps nothing happens. That is correct, but it means a device at 50–55 fps on medium keeps a
   visibly uneven 60/30 cadence. Consider a step-down at < 52 fps sustained for ~10 s.

## Phone budget per tier (S22 Ultra, 60 fps = 16.7 ms)

Target: main-thread frame ≤ 11 ms at 4× (leaves room for compositor/GC) and GPU ≤ 12 ms (estimate).

| tier | DPR / pixels | draw calls (main + shadow) | triangles (main / shadow) | shadow map | CPU frame @4× | GPU (M5 → phone est.) |
|---|---|---|---|---|---|---|
| low — budget | 1.25 / 0.5 MP, no AA | **≤ 80** | ≤ 160k / ≤ 25k | 1024², 45 m box | **≤ 11 ms** | ≤ 3 ms → ≤ 12 |
| low — now | | 74 median, 112 max | 146k (max 162k) / 17k | | 16.6 (p95 22) | 2.8 → 8–14 |
| medium — budget | 1.5 / 0.75 MP, MSAA | **≤ 90** | ≤ 200k / ≤ 40k | 2048², 70 m | ≤ 11 ms | ≤ 3.5 ms → ≤ 14 |
| medium — now (auto content) | 1.75 / 1.0 MP | 60–84 median, 102 max | 172–178k / 15–32k | | 15.0 (p95 23) | 4.4 → 13–22 |
| medium — now (forced, desktop content) | | 74 | 309k / 65k | | — | 3.8 |
| high — budget | 2.0 / 1.3 MP, MSAA | ≤ 110 | ≤ 250k / ≤ 60k | 2048², 90 m | ≤ 11 ms | ≤ 4 ms → ≤ 16 |
| high — now (auto content) | | 58–86 median, 103 max | 207–217k / 15–45k | | ≈ medium | 4.6 → 14–23 |

Per-frame upload budget on every tier: ≤ 16 KB of buffers outside LOD refreshes (now 42–80 KB, all pilot), and no
texture uploads outside inside views (now ≤ 150 KB/frame at 20 Hz in inside views).

Hotspots 1–4 together are worth roughly 5–7 ms at 4×. That brings low/medium to ~10–11 ms CPU and makes 60 fps on
the S22 Ultra realistic on low and medium.

## Harness notes / gotchas
- The page must be tapped once (`Input.dispatchMouseEvent`) or the suspended AudioContext makes every later measurement
  drift upwards (hotspot 6). `setup()` does this.
- The harness itself wraps `requestAnimationFrame`, `innerWidth/innerHeight`, `getBoundingClientRect`, the AudioParam
  methods and the GL upload calls. That adds roughly 0.1 ms per frame at 1× and ~0.5 ms at 4×, so the 4× frame times
  slightly over-state the game.
- The tier lock replaces `R.setQuality` after boot (the governor's calls are recorded in `__probe.blocked`, not applied).
  `?quality=` runs are the "content built at that tier" case.
- GPU timer readings on ANGLE-Metal jitter by ±1 ms between identical frames; use medians over many rows.
- `performance.memory` without a forced GC reads 400–600 MB late in a long run. That is uncollected garbage, not a
  leak: the `heap` section forces GCs and reads 45–49 MB.
- Another lane mid-edit can break boot (`ReferenceError` at main.js). The harness reports the console error; wait and
  re-run.

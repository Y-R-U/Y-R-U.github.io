# NOTES_RENDER_FIX — render/perf fixes off AUDIT_CODE + AUDIT_MOBILE

Working record. Appended to after each task so the next agent can resume mid-flight.

Owned files for this pass: `js/world/textures/*`, `js/engine/post.js`, `js/engine/aa.js`,
`js/engine/budget.js`, `js/world/vermin.js`, `js/world/chicken.js`, `js/world/people.js`,
`js/world/colliders.js`, `js/player.js`, `js/world/materials.js`.

Off limits: `js/game/**`, `js/main.js`, `js/game/game.css`, `style.css`, `index.html`, `data/**`,
`js/world/zones.js`.

Baseline: `node --test` → **312 pass / 0 fail**. Verified before the first edit.

## Tasks

1. Ground-field bounds are pre-A4 — contact skirt dead in Whitewall and Blackstone. **BLOCKER.**
2. Post / AO render targets untracked; `aa.js` skips `build()` while post is on.
3. Readout understates real footprint ~2.6× — vertex buffers, instances, retained CPU canvases.
4. Three copies of the `getMaterial('neutral','crest').envMapIntensity` lookup.
5. Two `stepUp` comments that state a falsehood.
6. `materials.js` `COURSE` overrides the frozen art bible — document only, change nothing.

---

## 1 — ground field bounds. DONE, verified visually.

`js/world/textures/groundfield.js` now imports `X0, X1, Z0, Z1` from `js/world/field.js` instead
of carrying its own pre-A4 copy (`-160…160 × -120…130`). The second copy was the bug; there is
now one source.

### Choosing W/H — the arithmetic

`project.js:68` is the only consumer:

```glsl
float pGy = texture2D(pGround, (vPPos.xz - pGrid.xy) * pGrid.zw).r;
float pSk = pSkirt.x * exp2(-clamp((vPPos.y - pGy) * pSkirt.y, 0.0, 9.0));
```

`pSkirt.y = 1 / skirtFall`, and `materials.js:37-38` sets `skirtFall: 0.5` for wall/trim (0.42 for
wood). So the skirt is `exp2(-(y - groundY) / 0.5)`: **half strength every 0.5 m**, visually spent
by ~1.5 m up the wall.

That fixes the tolerance. A height error of `e` metres scales the skirt by `2^(-2e)`:

| error | skirt off by |
|---|---|
| 0.05 m | 7 % |
| 0.10 m | 15 % |
| 0.25 m | 41 % |
| 0.50 m | 100 % (2×) |

Anything under ~0.1 m is invisible. Measured the actual bilinear error of the sampler (mirroring
`GRID`'s half-texel inset and clamp exactly) against `heightAt`, 80k uniform world samples plus
20k inside each town footprint:

| grid | texel | world p95 | world p99 | towns p99 | bytes | build |
|---|---|---|---|---|---|---|
| 256×200 *(old)* | 5.63 m | 0.058 | 0.277 | 0.306 | 100 KB | 25 ms |
| 512×256 | 2.81 m | 0.022 | 0.158 | 0.168 | 256 KB | 33 ms |
| 768×384 | 1.88 m | 0.010 | 0.078 | 0.082 | 576 KB | — |
| **1024×512** | **1.41 m** | **0.006** | **0.043** | **0.046** | **1024 KB** | **144 ms** |
| 1440×720 | 1.00 m | 0.003 | 0.022 | 0.023 | 2025 KB | 260 ms |

The terrain is smooth by construction — `field.js:117-121` caps `detail` at frequency 0.026 (a
38 m cell) — so accuracy alone would have accepted 512×256. The binding constraint is the
**second** one: a house is 5–8 m wide, and at 2.81 m/texel a house wall spans two texels, so the
skirt line smears across the whole facade instead of following the ground under it. **1024×512
gives ~4 texels across a 5.6 m wall and a p99 error of 0.043 m (6 % skirt error).** Picked that.

Cost: **1.00 MB** tracked (was billed 0.146, actually 0.098 — see below), +119 ms of `heightAt`
on the boot path (`lighting.js:189`, synchronous). If the phone test shows boot latency mattering
more than skirt fidelity, 768×384 halves the memory and the build time for a p99 of 0.078 m.

Also fixed the mis-billing AUDIT_CODE 4.2 flagged: `RedFormat` + `HalfFloatType` is 2 B/px, and
`track()` was passing `fmt: 'rgb'` (3 B/px, and 1 B/px for `r` would have been just as wrong).
Now `fmt: 'r', mult: 2` — `budget.js`'s existing `r: 1` entry finally has a user.

### Verification — I looked at the PNGs

`node tools/shot.mjs --shot=wall_day` (Whitewall, `cx = -520`) and `--shot=gate_night`
(Blackstone, `cx = +520`), 1280×720 dpr 1, before and after, plus a pixel diff of each pair.

- **wall_day**: 3.79 % of pixels changed, max Δ 49/255. The diff mask is unambiguous — a band
  hugging the foot of the curtain wall and flaring around the tower's battered base, following
  the terrain contour and fading upward. Exactly the skirt's footprint and nothing else.
  In the image the lowest courses of the tower and the curtain wall now carry a green-grey
  grade; before, the masonry held the same bright value straight down into the grass and the
  wall read as pasted on. Real improvement, subtle at 1× but clearly the missing grounding cue.
- **gate_night**: same story on the low precinct wall in the foreground, smaller in absolute
  terms because the scene is dim. Brightened 2.6× the wall/ground line goes from a flat cut to
  a graded join.

No change to counts: wall_day 77 calls / 187k tris, gate_night 37 / 118k, both identical to the
before run. `node --test` 312/0.


---

## 2 — post / AO texture accounting. DONE, measured.

`js/engine/post.js` now has `account()` / `release()`. `account()` runs at the end of `setAO()`
and `resize()`; `dispose()` releases. Tracked:

| row | what | bytes/px |
|---|---|---|
| `post composer 1×` ×2 | `renderTarget1` (the `outputSpaceTarget`) and `EffectComposer`'s cloned `renderTarget2` | 4 × (samples+1) |
| `post composer depth` | both composer targets' depth renderbuffers, **estimate** | 2 × 4 × samples |
| `post gtao ao` | `gtaoRenderTarget`, RGBA `HalfFloatType` | 8 |
| `post gtao denoise` | `pdRenderTarget` (a clone of the above) | 8 |
| `post gtao normal` | `normalRenderTarget`, RGBA `HalfFloatType` | 8 |
| `post gtao depth` | its `depthTexture`, `DepthStencilFormat` / `UnsignedInt248Type`, **estimate** | 4 |

Sizes are read off the live targets rather than recomputed, so `half` and every resize stay
honest without a second copy of `bufferSize()`.

**Measured**, 1280×720 dpr 1, preset medium, `aa: off`:

| state | tex MB |
|---|---|
| `ao: off` | **55.10** |
| `ao: half` | 75.32 *(+20.22)* |
| `ao: full` | **93.77** *(+38.67)* |
| `aa: msaa4`, `ao: off` | 86.74 |
| `aa: msaa4`, `ao: full` | 142.99 |
| back to `ao: off`, `aa: off` | **55.10** — returns exactly to baseline |

Scaled to 1920×1080 that is **+87 MB** for `ao: full`, against a 60 MB budget. The audit's ~40 MB
estimate was low, mostly because it did not count the depth attachments.

Note `half` only saves 18.5 of the 38.7 MB: the two composer targets and their depth are full
resolution whatever the AO mode is. That matches the fill-rate note in AUDIT_MOBILE §3.2(6).

### Second defect found and fixed while here
`setAO('off')` left the composer and all of GTAO's buffers allocated — it only set
`this.enabled = false`. Switching AO off therefore freed nothing. It now calls `dispose()`, which
is why `off1`/`off2` above come back to 55.10 exactly rather than staying at 93.77.

### One stated fact did not hold — `aa.js` needed no change
The brief (and AUDIT_CODE 4.1) say `aa.js:159` skipping `build()` while post is on compounds the
problem. It does not. `AA.apply()` takes the `post?.enabled` branch and calls `this.free()`, which
disposes **and untracks** the AA target, so while post owns the render path there is genuinely no
AA target to build or to bill. Measured: with `aa: msaa4` + `ao: full` the two `aa …` rows are
absent from the breakdown and the memory really has been released. `resize()` skipping `build()`
is correct as written.

So the readout's wrong-direction movement was entirely post's untracked allocations, and it is a
plain understatement, not a double error. **No edit made to `js/engine/aa.js`.**

### Residual not tracked
- `gtaoNoiseTexture` — a 5×5 `DataTexture` magic square. ~100 bytes.
- `pdNoiseTexture` — 64×64 RGBA from `generateNoise()`. 16 KB.
- three's internal fullscreen-quad geometry and the pass materials' programs.

Together well under 0.02 MB at any resolution. Left untracked deliberately rather than guessed at.

### Test state at this point
`node --test` → **316 tests, 312 pass, 4 fail**. The four failures are
`js/game/onboard.test.js` (3) and `js/game/packs.test.js` (1) — files another agent created at
00:31 today, in `js/game/`, which is outside this pass's ownership. The 312 passing is the exact
baseline; nothing here touches onboarding prompts or quest pack data.

---

## 3 — real footprint vs the readout. Freed 36 MB of CPU canvases; the rest measured, not guessed.

### What is actually there — measured, not derived

Scene-graph walk at 844×390 dpr 1, preset medium, `wall_day`:

| item | MB | note |
|---|---|---|
| vertex attributes, 288 unique geometries | 18.50 | |
| index buffers | 0.72 | |
| **vertex + index** | **19.22** | matches AUDIT_MOBILE §3.3 exactly |
| instance matrices + colours | **1.36** | matches exactly |
| retained `HTMLCanvasElement` backing stores | **36.00** | 6×1024² + 6×512² + 24×256², all from `bake.js` |
| retained `DataTexture` typed arrays | 1.66 | foliage atlases, ripple, plumage, fur |
| tracked texture memory | 55.10 | |

The audit's ~44 MB canvas figure counted the sky canvas and `skyImg` too; those live in
`lighting.js` and are genuinely still in use (`drawSky` writes into them on every time-of-day
change), so they are not freeable. The freeable part is the 36 MB above.

### The fix — release on first upload

`bake.js` `makeTex` now sets `t.onUpdate = releaseCanvas`. three calls `onUpdate` at the end of
`uploadTexture` once the pixels are on the GPU (verified in r160 `WebGLTextures`, line 25121);
`releaseCanvas` sets `image.width = image.height = 1`, which drops the backing store, and clears
the hook. Exported and reused by `stained.js` for the three 512² leaded lights (3.1 MB more).

**This is only safe because nothing re-uploads a baked texture.** `setTexture2D` re-uploads on any
`needsUpdate`, so the one code path that did — the anisotropy knob, which set `needsUpdate` to make
three rewrite sampler state — had to change. `configure()` now routes an anisotropy change through
`dropAll(); onRebuild?.()`, the same regeneration the `texCap` knob already used, so the pixels
come back from the generator rather than from a canvas. `setAniso` survives for the `foreign` set
(the foliage `DataTexture`s), whose arrays are retained anyway.

Verified live: `aniso` 4 → 16 propagates to every material's map *and* to the foreign atlases,
`texCap` 1024 → 512 still halves tracked memory to 30.98 and back, no console errors, and
`wall_day` renders **bit-identical** (0 pixels differ) to the run before the change.

### Result

Retained canvas bytes **36.00 → 22.00 MB** in the `wall_day` frame. The 22 MB left is 4×1024² +
16×256² + 2×512² belonging to zones that scenario never draws: a texture that has not been
uploaded has no `onUpdate` to fire yet. It releases the moment that town is first rendered, so a
session that visits all three towns converges on ~0. Nothing is leaked, it is deferred.

To collapse it at boot instead, `bake.js` would need the renderer to call
`renderer.initTexture(t)` right after `makeTex` — that forces the upload, fires `onUpdate` and
frees the canvas immediately. It would also make the tracked figure honest in the other
direction, since today an unvisited zone's textures are billed as GPU-resident when they are only
CPU-resident. That needs a renderer handle threaded through `configure()` from `lighting.js`,
which is outside this pass's files. **Left as a proposal.**

### The 19.22 MB of buffers is still untracked, deliberately

`WORLD.md §5.10-E` asks for buffer tracking. `budget.js` is a passive registry with no scene
access, and the walk that produces 19.22 belongs wherever the scene does — `app.js`, which this
pass does not own. Proposal for whoever does:

```js
// js/engine/budget.js — additive
export function trackGeometry(root) {
  const seen = new Set();
  let b = 0;
  root.traverse(o => {
    if (o.geometry && !seen.has(o.geometry)) {
      seen.add(o.geometry);
      for (const a of Object.values(o.geometry.attributes)) b += a.array.byteLength;
      if (o.geometry.index) b += o.geometry.index.array.byteLength;
    }
    if (o.isInstancedMesh) {
      b += o.instanceMatrix.array.byteLength;
      if (o.instanceColor) b += o.instanceColor.array.byteLength;
    }
  });
  track(geoKey, { w: 1, h: b / 4, fmt: 'rgba', mips: false, label: 'scene: vertex + index' });
}
```

called once from `app.js` after the world is built, and again on any rebuild. Expected 20.58 MB
(19.22 + 1.36), which would take the `wall_day` readout from 55.10 to 75.68 — **over the 60 MB
gate**. That is the honest number and the gate should be restated against it rather than the
number being hidden.

### No regression

`node tools/budget.mjs --shot=wall_day`: drawn 144.7k / resident 340.8k, ground 21.4k, foliage
34.3k, buildings 64.4k — all within rounding of AUDIT_MOBILE §3.5's decomposition. Triangle side
untouched.

---

## 4 — the three env-intensity copies. DONE.

`js/world/vermin.js`, `js/world/chicken.js` and `js/world/people.js` all polled
`getMaterial('neutral', 'crest').envMapIntensity` once a frame inside `update()`, with the same
two-line comment copied three times. All three now use `onEnvIntensity()`, the API `scatter.js`
already uses, registered in the constructor next to where the materials are made:

- `vermin.js` — sets `this.env` and walks the lazily-built `this.mat` Map. `this.env` is still
  read at `mesh()` so a material created later starts at the right value; the listener fires
  immediately on registration so it is never `undefined` now.
- `chicken.js` — one line over `ZONE_IDS`.
- `people.js` — gains an `applyEnv()` that reads `getEnvIntensity() * this.envScale`, mirroring
  `scatter.js:1084` exactly, so the vestigial `envScale` hook keeps working and a future writer of
  it can call `applyEnv()`.

`getMaterial` is no longer imported by any of the three. Verified live at `town_night`: only
`dark:crest` exists in the material cache — the phantom `neutral:crest` that the poll manufactured
and pushed into `built` is gone.

### The audit's night-dimming claim does not hold
AUDIT_CODE 1.5 (and the brief) say the three "miss the night-dimming the helper applies". They did
not. `setEnvIntensity` (`materials.js:153`) writes every material in `built`, and the neutral crest
was in `built`, so the polled number was always identical to `getEnvIntensity()`.

Measured before and after, three env intensities read straight off the robe and fowl materials:

| | envMapIntensity |
|---|---|
| 21:00 | 1.8734 |
| 12:00 | 0.58 |
| 12:00, `envPower` 2 | 2.0 |

Same values either way — the fix is real but it is about the *route*, not the value: a hardcoded
zone id in three world modules, a side-effectful getter manufacturing a material nothing draws,
and a per-frame Map lookup and string concat replaced by a listener. `wall_day` renders identical
(1 pixel of 921,600 differs, by 32 — an animated instance on a different sub-step).

---

## 5 — the two `stepUp` comments. DONE.

Confirmed the audit's reading: `colliders.js:47` gives every building `rise = 0`, `:66` gives kerbs
their own `2.25`, and the only box built with `WALK.stepUp` as its rise is the bridge deck at `:55`.
No doorstep is climbed with it, so the "0.66 house plinth" justification in both files was false.

- `js/world/colliders.js` — now says stepUp reaches only the bridge deck, names the two things
  that do not use it, and records the non-obvious part: the value is **copied into the box at
  build time**, so `setStepUp()` — and therefore the knob — only bites on the next collider
  rebuild. That was not written down anywhere.
- `js/player.js` — one line pointing at `colliders.js`.

The underlying fix (the five real 0.19 m risers from `buildings.js:420` into the collider set) is
**not** attempted; it is Aaron's call per AUDIT_CODE's closing section.

---

## 6 — `COURSE` overrides the frozen art bible. NOT FIXED. Proposal for Aaron.

`js/world/materials.js:18` and `:60-63`, unchanged:

```js
const COURSE = { light: 0.22, neutral: 0.20, dark: 0.235 };

function masonry(z) {
  const h = COURSE[z.id] ?? 0.21;
  return { ...z.stone, blockH: h, blockW: h * (z.stone.blockW / z.stone.blockH) };
}
```

So `zones.js`'s authored `stone.blockH` — light 0.42, neutral 0.35, dark 0.38 — survives only as
the numerator of a W/H ratio. Editing it in the art bible changes the block *proportion* and
nothing else; the absolute course height lives in a three-key, zone-id-indexed table in another
file, which is the exact thing rule 1 forbids. A fourth zone would need a code edit here.

The override is deliberate and the comment above it says why (the authored values are ~2× life
size and read as cartoon blockwork against a 6 m house). The fix is an additive `zones.js` field,
and `zones.js` is frozen. **Nothing changed. This is the diff to approve.**

### Proposed diff — `js/world/zones.js`, three lines, additive only

```diff
   light: {
     stone: {
       blockShape: 'rounded',
-      blockW: 0.9, blockH: 0.42, jointDepth: 0.55, chipping: 0.15,
+      blockW: 0.9, blockH: 0.42, courseM: 0.22, jointDepth: 0.55, chipping: 0.15,

   neutral: {
     stone: {
       blockShape: 'square',
-      blockW: 0.7, blockH: 0.35, jointDepth: 0.4, chipping: 0.3,
+      blockW: 0.7, blockH: 0.35, courseM: 0.20, jointDepth: 0.4, chipping: 0.3,

   dark: {
     stone: {
       blockShape: 'jagged',
-      blockW: 0.8, blockH: 0.38, jointDepth: 0.75, chipping: 0.55,
+      blockW: 0.8, blockH: 0.38, courseM: 0.235, jointDepth: 0.75, chipping: 0.55,
```

### and `js/world/materials.js`, on approval

```diff
-const COURSE = { light: 0.22, neutral: 0.20, dark: 0.235 };
-
 function masonry(z) {
-  const h = COURSE[z.id] ?? 0.21;
+  const h = z.stone.courseM ?? 0.21;
   return { ...z.stone, blockH: h, blockW: h * (z.stone.blockW / z.stone.blockH) };
 }
```

Pixel-identical: the numbers are the same, they just move into the bible. `blockH`/`blockW` stay
as the authored proportion, `courseM` becomes the authored size in metres, and the last zone-id
table outside `zones.js` in the material layer goes away. AUDIT_CODE 3.1 separately wants
`ROOF_VS_WALL` / `ROOF_FLOOR` / `WALL_GAIN` / `GROUND_MID` / `GROUND_PULL` turned into knobs;
those are not zone-keyed and are not blocked on this.

---

## Close-out

### Files changed
`js/world/textures/groundfield.js` · `js/world/textures/bake.js` · `js/world/textures/stained.js` ·
`js/engine/post.js` · `js/world/vermin.js` · `js/world/chicken.js` · `js/world/people.js` ·
`js/world/colliders.js` · `js/player.js`

Not touched: `js/engine/aa.js` (see §2), `js/engine/budget.js` (no change needed — the `r` format
it already carried is now used), `js/world/materials.js` (§6 is a proposal, not a change), and
everything outside this pass's ownership.

### Texture memory, before → after

| | MB |
|---|---|
| tracked, `ao: off`, before | **54.25** |
| tracked, `ao: off`, after | **55.10** |
| — of which the heightfield | 0.146 → **1.00** (and correctly billed at 2 B/px, not 3) |
| tracked, `ao: full`, before | 54.25 — *lied by 38.67* |
| tracked, `ao: full`, after | **93.77** |
| retained CPU canvases, `wall_day` | **36.00 → 22.00** (→ ~0 once all three towns have been drawn) |

Net: the readout costs 0.85 MB more and is now honest about ~39 MB it could not see, while ~14 MB
of real CPU memory is given back immediately in a one-town frame and ~36 MB over a full session.

### Still open, in priority order
1. `renderer.initTexture()` at bake time to collapse the remaining 22 MB of canvases at boot and
   make the tracked figure true for unvisited zones — needs a renderer handle through `lighting.js`.
2. `budget.js trackGeometry()` and its call site in `app.js` — 20.58 MB currently invisible, and it
   puts the honest total over the 60 MB gate.
3. `setStepUp()` is a no-op until the colliders rebuild.
4. AUDIT_CODE 3.1's five art constants in `materials.js` are still not knobs.
5. §6's `zones.js` `courseM` diff needs Aaron.

### Test state
`node --test` reached **329 / 329 / 0** with all of this landed. The count rose from 312 during the
session because other agents were adding tests in `js/game/`; theirs went red and green a few
times as they worked, and the last full run of this pass showed one of theirs red again
(`js/game/packs.test.js` — "Act 1 XP matches what STORY §8.1 publishes", 216 ≠ 188, a quest-data
edit in flight). Nothing in this pass can reach it.

The render/world/sim half of the suite —
`node --test "js/world/*.test.js" "js/world/textures/*.test.js" "js/editor/*.test.js" "js/sim/*.test.js"`
— is **157 / 157 / 0**.

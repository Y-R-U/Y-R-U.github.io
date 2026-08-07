# P2 — the match opens at noon and turns to dusk, and it survives the tab going to sleep

Pass 1 of 2. Both items in `BRIEF_P2.md` are landed and measured. No git command that writes was
run. Nothing outside `gms/3d/waterline/` was touched.

Files changed: `js/world/sky.js`, `js/engine/app.js`, `js/ui/flow.js`, `js/ui/overlay.js`,
`style.css`, `js/config.js` (`UI` only). All six are in the brief's "what you own" list; nothing
else was opened for writing.

---

## 1. Time of day — D32

### What it does now

`playScene(fromNoon)` **always applies the dusk end state first** and then, only for a fresh match,
steps back to noon. That is the whole reason the end state is safe: there is exactly one code path
to it and it is byte-for-byte the old one.

```
duskScene()   sky.setGrade('dusk') · sky.setSun(23, 1.9) · lighting.setGrade('dusk') · ocean.setSeaState(null)
noonScene()   lighting.setGrade('noon') · ocean.setSeaState(GRADES.dusk.sea.state)
```

`opening()` calls `beginDusk()` the moment `present.open()` resolves. It is **not awaited** — the
slate goes up, `flow.busy` drops on the same tick and the board is live. `tickDusk(dt)` runs off one
system registered in `boot()`: 700 ms hold, then 4.2 s of smoothstep, then `duskScene()` again.

`sky.blend(from, to, t)` is new. It builds an interpolated grade with `mixGrade()` and applies it
through the existing `applyGrade()`, so `lighting.js` and `ocean.js` repaint on every frame of it —
and it **never sets `envDirty`**.

### The order-of-operations trap that would have broken it

`sky.setSun(23, 1.9)` **mutates `GRADES.dusk` permanently** (azimuth 176 → 23, elev 2.6 → 1.9). The
first version of this eased toward the *authored* dusk and then `playScene`'s `setSun` snapped the
sun 153° across the sky on the last frame. `duskScene()` running first is what fixes it: the blend
target already carries the sun the match is played under before anything reads it.

### The sea state, and why it is pinned

`sea.state` is an **index into `SEA_STATES`**, not a scalar. A lerp produces 1.5 and
`SEA_STATES[1.5]` is `undefined` — `applyWaves()` throws on `s.amp`. `mixGrade` rounds it, but
rounding only moves the problem: noon is state 2 (`amp 1.5`) and dusk is state 1 (`amp 0.7`), so the
wave field would still **double in height in one frame** at the crossover.

So `noonScene()` pins the ocean to dusk's own state for the whole opening and `duskScene()` releases
it with `setSeaState(null)`. Measured across the entire opening the reported state is `slight` and
never changes. The cost is that the noon flyover's sea is calmer than authored noon; nothing scored
uses it.

### The slate

`overlay.slate(line, sub, ms)` — a fourth shape alongside `panel` / `toast` / `note`. Its own
`.slates` container, `pointer-events: none`, no dismiss, fades itself. It is **not** `caption.js` —
that is C6's, gated by `shouldShow()`, and says something else.

Text is `UI.opening`: **`1845`** over **`HOURS · SUNSET`**. 1845 is derived from the grade, not
picked: `GRADES.dusk.elev` is 2.6° above the horizon, and an evening sun descends 10–12°/hr at mid
latitudes, so that is roughly a quarter of an hour before sunset. It reads the way a bridge log
would and it is not a year.

### Measured

**The blend itself**, sampled every frame through one opening (1,416-frame trace,
`p2_o1_trace.json`; 252 frames of it are moving):

| ms | sunDir.y | horizon.r | zenith.b | sun.intensity | fog.near | ocean uRefl | grade | sea | PMREM |
|---|---|---|---|---|---|---|---|---|---|
| 7778 | 0.66911 | 0.27891 | 0.44519 | 3.0999 | 250.00 | 0.9000 | dusk | slight | 0 |
| 8245 | 0.64992 | 0.29405 | 0.44008 | 3.0197 | 248.17 | 0.8847 | dusk | slight | 0 |
| 8711 | 0.59879 | 0.33288 | 0.42696 | 2.8138 | 243.50 | 0.8454 | dusk | slight | 0 |
| 9178 | 0.52123 | 0.38844 | 0.40819 | 2.5193 | 236.80 | 0.7891 | dusk | slight | 0 |
| 9646 | 0.42329 | 0.45438 | 0.38591 | 2.1697 | 228.86 | 0.7224 | dusk | slight | 0 |
| 10111 | 0.31547 | 0.52323 | 0.36264 | 1.8047 | 220.56 | 0.6527 | dusk | slight | 0 |
| 10579 | 0.20935 | 0.58848 | 0.34060 | 1.4587 | 212.70 | 0.5867 | dusk | slight | 0 |
| 11046 | 0.11864 | 0.64302 | 0.32217 | 1.1696 | 206.13 | 0.5315 | dusk | slight | 0 |
| 11513 | 0.05550 | 0.68061 | 0.30947 | 0.9703 | 201.60 | 0.4934 | dusk | slight | 0 |
| end | **0.0332** | — | — | **0.9** | **200** | **0.48** | dusk | slight | **0** |

Four independent things are moving — a sky uniform, a lighting colour, a fog distance and an ocean
uniform — which is the point: `applyGrade()`'s listeners are firing every frame.

**PMREM regenerations across the whole opening: 0.** Counted by patching
`THREE.PMREMGenerator.prototype.fromScene` before the match; 0 calls over 1,920 rendered frames, of
which 252 were blend frames. (A context restore costs exactly 1 — see §2.)

**The end state is identical.** Two proofs, both with `crypto.getRandomValues` pinned so the board,
the fleet layout and the dramatised enemy are the same on both trees:

1. A full numeric dump of **every** grade-driven uniform at the settled bridge — all 40-odd sky
   uniforms, all 50-odd ocean uniforms, the sun/ambient/fog colours and intensities, tone-mapping
   exposure and the sea-state label — **diffs clean** between the pre-P2 tree and this one. Zero
   differing values.
2. The settled bridge frame, rendered from a hard-coded camera pose with the rAF loop stopped so
   the handheld sway cannot move under the diff:

| | mean abs diff | pixels > 8 |
|---|---|---|
| before vs after | **0.0165** | 0.00% |
| same-code control (before tree, twice) | 0.0202 | 0.00% |

The change is *below* its own noise floor.

**A resumed match** (`opening(false)`), sampled 24 times over the first 6 s of the resume:

| | observed |
|---|---|
| sky grade | `dusk` only — `noon` never appears |
| `uSunDir.y` | `0.0332` and nothing else, i.e. the end state from frame one |
| slate on screen | `false` at every sample |
| `dusking` | `false` at every sample |
| max camera y | 20.4 (an opening flyover peaks at 150) |

**Two matches in a session, and a third with `cine: 'off'`** — all three go noon → slate → dusk and
land on `{grade: dusk, sunY: 0.0332, sea: slight, fog.near: 200, sun.intensity: 0.9}`. No console
errors in any run.

**It does not block a tap.** Fired 1.6 s into the blend: `flow.busy` was `false`, the shot armed and
resolved (turns 0 → 1 → 2), the blend kept running through the whole turn presentation and finished
on the exact end state.

### `scene.environment` — the oddity, confirmed and now load-bearing

`main.js:65` evaluates the `sky.env` **getter once at boot**, under `noon`. The bridge is lit by a
noon env map under a dusk sky, and that is the look Aaron signed off. I did not reassign it during
the blend.

It stopped being merely an oddity in §2: my first context-restore fix rebuilt the env under the
*current* grade and **relit the whole bridge mauve** — 9.94 mean diff, pink bulkheads, pink chart. I
have the render (`p2_fix1_post.png`). `sky.refreshEnv()` now records which grade the live env was
built under and rebuilds under that one. **Anything that later wants a dusk env map has to move
`main.js` and re-score the bridge trio; it is not a free change.**

---

## 2. Coming back from sleep

### Reproduced first

`WEBGL_lose_context.loseContext()` / `restoreContext()` on a live match, pre-P2 tree, pinned board:

| | mean luma | mean abs diff | pixels > 8 |
|---|---|---|---|
| before the loss | 49.58 | — | — |
| after the restore | **42.04** | **16.05** | **53.6%** |

That is Aaron's report exactly: the bulkheads, the pillars, the table bezel and the deckhead all go
flat and dark, the chart dims. `p2_BEF_pre.png` / `p2_BEF_post.png`.

**Diagnosis.** three r160 `onContextRestore` calls `initGLContext()`, which builds a **new**
`WebGLProperties`, a new `WebGLPrograms`, a new `WebGLInfo` and a new `WebGLShadowMap`. Everything
whose pixels still live in JS re-uploads lazily. The PMREM env map's pixels do not live in JS — it
is a render-target texture with `image = {width, height, depth}` and no data — so it comes back
empty and every PBR material in the room loses its fill light.

### The fix

`app.js` handles `webglcontextlost` (preventDefault, flag) and `webglcontextrestored`:

- re-applies the `shadowMap.render` hook — `initGLContext()` builds a new `WebGLShadowMap`, so the
  monkeypatch that splits shadow calls from main calls in the perf readout is gone with the old one
- `info.autoReset = false` and `shadowMap.needsUpdate = true`
- re-fetches `EXT_disjoint_timer_query_webgl2` and drops every query in flight — a query from the
  dead context never reports available and `drainQueries()` wedges on it forever
- `material.needsUpdate` across the scene, then `resize()`
- calls a new `onRestore(fn)` registry

`flow.js` registers the one thing three cannot do for itself:
`app.scene.environment = hook.world.sky.refreshEnv()`.

### Proven on the same reproduction

| | mean luma | mean abs diff | pixels > 8 |
|---|---|---|---|
| **before tree**, context lost + restored | 49.58 → **42.04** | **16.05** | 53.6% |
| **after tree**, same event | 49.59 → **49.60** | **0.645** | 1.97% |
| **same-code control** — same wait, no context loss at all | 49.59 → 49.61 | **0.635** | 1.95% |

The fixed restore is **indistinguishable from not losing the context at all**. The residual 0.64 is
the sea moving during the 5.5 s the test takes; the control proves it.

A restore costs **exactly one** PMREM regeneration. After a restore I armed and fired a `heavy` and
the turn presented normally — the muzzle flash, the impact and the fire card all came back
(`p2_res1_postloss_fire.png`).

### The plain case — backgrounded with no context loss

`Page.setWebLifecycleState: frozen` for 20 s, then `active`:

| | before | after |
|---|---|---|
| calls / main / shadow | 84 / 67 / 17 | 84 / 67 / 17 |
| triangles | 84,444 | 84,444 |
| textures / programs / texMB | 48 / 59 / 39.61 | 48 / 59 / 39.61 |
| grade · phase · screen · busy | dusk · AIM · play · false | dusk · AIM · play · false |
| frame diff | mean 0.437, 1.39% > 8 — i.e. the sea moved and nothing else | |

**I could not reproduce any damage from the plain case.** `dt` clamped to 0.1 s is doing its job and
no accumulator drifted. Both cases were reproduced; only the context-loss one was ever broken.

---

## 3. The scenarios, and the draw calls

### The four scored renders — unchanged

`tools/shot.mjs --dpr=1 --w=1600 --h=900`. Per D13, against each scenario's own same-code control:

| | before → after | same-code control | counters | verdict |
|---|---|---|---|---|
| `sea_dusk` | 0.1245 (0.12% > 8) | 0.0135 / 0.0489 / 0.0557 / 0.0861 across four pairings | 3 calls, 30k tris | within the family's spread |
| `sea_noon` | 4.8971 | 4.4952 | 9 calls, 30k tris | within |
| `bridge_table` | **0.0027** | 0.0127 | 71/60 calls, 47k tris | below the floor |
| `guns_fire` | 1.6857 | see below | 28/22 calls, 55k/47k tris | drift, not code |

`guns_fire` needed 21 pairings across seven renders to settle. The result is unambiguous and it is
**not** the code: the diff scales with **elapsed wall-clock between the two renders**, not with which
tree they came from.

| pairing | mean abs diff |
|---|---|
| before ↔ ctrl (same code, adjacent) | 0.911 |
| ctrl ↔ after (different code, adjacent) | **0.925** |
| after ↔ after2 (same code, adjacent) | 0.252 |
| after3 ↔ after5 (same code, adjacent) | 0.162 |
| before ↔ after5 (different code, furthest apart in time) | 2.234 |
| ctrl ↔ after5 | 1.506 |

Adjacent-in-time pairs agree whether or not the code differs; distant pairs disagree whether or not
the code differs. That is D36's second trap — `shot.mjs` settles a fixed number of **frames**, so the
hull's heave phase drifts as the machine's frame pacing drifts. Every counter is identical.

Independently: under `?shot=`, `flow.boot()` returns before it assigns `hook`, so `tickDusk`,
`onRestore` and `beginDusk` are never wired; `sky.blend`/`refreshEnv` are never called; `.slates` is
an empty div inside `#ui`, which `body.shotmode #ui { display: none }` hides. There is no path by
which a scored capture can reach any of this.

### Draw calls from a live match, before and after

Both trees, same harness, same pinned entropy, 1280×800, cache disabled, fresh profile. The "before"
tree is a copy of the working tree with every P2 edit reversed by a script that refuses to run unless
each replacement matches exactly once (`scratchpad/wl_revert.py`); it reproduces the original
context-loss damage to within 1.5%, which is how I know the copy is faithful.

| | before | after |
|---|---|---|
| peak through the opening (flyover + blend) | 96 total / **80 main** / 16 shadow / 106,408 tris | **identical** |
| settled | 75 / **59** / 16 / 78,104 tris | **identical** |
| textures / programs / texMB settled | 35 / 34 / **39.03** | **identical** |
| peak, shell turn | 106 / **90** / 16 / 116,628 | **identical** |
| peak, salvo turn | 116 / **99** / 17 / 123,008 | **identical** |
| peak, heavy turn | 116 / **99** / 17 / 122,618 | **identical** |
| texMB after three turns | 39.61 | **identical** |

Every number matches on both trees. **Peak 99 main against the 120 ceiling; 39.61 MB against 45.**

---

## 4. What my tests could not have caught

Stating this plainly because the brief asks for it.

- **All of it is headless SwiftShader.** No fps, GPU-time or thermal claim is made. D4 still says
  only Aaron's device can gate that — and a real phone's context loss may drop more than
  `WEBGL_lose_context` does, since the extension is a clean simulated loss and a backgrounded iOS
  tab is not.
- **I never lost the context on a real device**, and I never lost it *during* a cinematic beat — only
  at rest and once mid-blend by code inspection, not by capture. A loss during `fire_out` or a shell
  flight is untested.
- **The blend was only ever watched at 1280×800 and 390×844**, and only with `pace: full`, turn 1.
  `short` and `instant` were never exercised against it.
- **`texs` drops from 35 to 31 immediately after a restore** and climbs back as things are drawn.
  That is three's lazy re-upload and it is correct, but it means the first turn after a restore pays
  a re-upload cost I did not time. On a phone that could read as a hitch.
- **The settled-frame diff is one pose on one board.** It cannot catch something that only differs
  from the wings, from the plotting-table close pose, or at a different fleet composition.
- **The state dump proves the uniforms are identical, not that nothing else is.** A material
  property, a light's shadow camera or a parked InstancedMesh could differ and the dump would not
  see it. The pixel diff is the backstop and it is one frame.
- **I did not watch the blend at 30 fps or under CPU load.** `tickDusk` uses the app's clamped `dt`,
  so a stalled frame stretches the blend rather than jumping it, but a long stall would show as a
  visible step and I have not seen one.
- **The slate's contrast was checked on two backgrounds** — landscape at the console band and
  portrait at the deckhead. Both legible. A pale sky behind it (it appears while the sky is still
  noon) is the worst case and in portrait it lands near the top-right own-grid panel without
  overlapping. On a narrower phone than 390 px it may.
- **No console errors, no exceptions, in any run.** `Runtime.exceptionThrown` and error/warning
  console events were captured on every probe; all empty. That is not the same as no bugs.

---

## 5. What I did not do, and what is still open

1. **`cine: 'off'` still gets the slate and the blend.** I left it deliberately: it is content, not a
   camera move, and it blocks nothing. If Aaron reads "off" as "show me nothing", the gate is one
   line in `opening()` plus a `duskScene()` in the else branch. Flagging it rather than deciding it.
2. **A slate can outlive a screen change.** Leaving to the title inside its 3.2 s leaves it fading
   over the title screen. `overlay.hide()` does not clear toasts either, so clearing slates there
   would have been inconsistent; I left both alone. Cosmetic, one line if it matters.
3. **`mixGrade` allocates.** ~55 small objects per blend frame, ~14k over four seconds. Trivial for
   the GC and it only ever runs for four seconds a match, but it is allocation in a per-frame path
   and I am declaring it.
4. **A grade key the target does not declare is dropped.** At `t = 0` the blend is therefore not
   *quite* pure noon: `sea.hazePow` reads dusk's 3.0 rather than noon's implicit 2.0, and
   `sea.glintCol` is absent so the ocean falls back to `sun.colour`. Both differences vanish as
   `t → 1` and neither is visible in the renders, but the first frame of the blend is a hair off the
   frame before it.
5. **The env map stays noon forever.** §1 explains why that is now deliberate rather than accidental,
   but it is still true that the bridge's fill light does not know the sun has set. A phase-2
   experiment that rebuilds it at the end of the blend is a one-line change to `refreshEnv`'s caller
   — and it will move `bridge_table`, `bridge_night` and `bridge_lamp`.

---

## 6. For `DECISIONS.md`

- **D-next(a) — `setSun` mutates the grade table, so the blend target must be established first.**
  `sky.setSun(23, 1.9)` writes into `GRADES.dusk` permanently. A transition authored against the
  *table* rather than against the applied state swings the sun 153° on its last frame. `playScene`
  now applies the end state and then steps back, which makes the end state reachable by exactly one
  code path and makes the blend target correct by construction. Same family as the standing
  `MANAGER.md` trap, inverted: here the value was configured *later* than it was read.
- **D-next(b) — a grade field that indexes a table cannot be interpolated.** `sea.state` indexes
  `SEA_STATES`; a lerp yields 1.5 and `SEA_STATES[1.5].amp` throws. Rounding only converts a crash
  into a wave field that doubles in height in one frame. **Any future blend must pin index-valued
  fields to one end, not average them.**
- **D-next(c) — `scene.environment` is a noon env map and the context-restore path now depends on
  it.** `main.js:65` evaluates a getter once at boot. Rebuilding the env under the *current* grade
  after a context loss relights the whole bridge mauve — 9.94 mean diff against a 0.64 floor.
  `sky.refreshEnv()` records the grade the live env was built under and rebuilds under that one.
  Changing which grade lights the bridge is a scored-shot change, not a bug fix.
- **D-next(d) — three r160's `onContextRestore` replaces `renderer.shadowMap` and `renderer.info`.**
  Any monkeypatch on those objects is silently lost. `app.js`'s shadow-call split was one.
  `EXT_disjoint_timer_query_webgl2` and every query in flight die with the context too, and a stale
  query never reports available, so `drainQueries()` wedges permanently.
- **D-next(e) — `tools/shot.mjs`'s diff scales with wall-clock, not with the code.** Twenty-one
  pairings of `guns_fire` across seven renders: adjacent-in-time pairs agree at 0.16–0.93 whether or
  not the code differs; distant pairs disagree at 1.5–2.2 whether or not it differs. This is the
  quantified form of D36's second trap and it means **a same-code control is only valid if it was
  rendered next to the thing it controls for.**

Two harness notes worth not paying for twice:

- **A sampler registered with `app.add()` reads `renderer.info` as zero.** `app.js` calls
  `info.reset()` at the top of the frame, *before* the system updates. Wrap `stats.endFrame` instead
  — it runs immediately after the render.
- **`ctx.drawImage(webglCanvas)` from a probe returns a blank image.** No `preserveDrawingBuffer`, so
  an in-page luminance readback silently reports 0. Screenshot through CDP and measure the PNG.

---

## 7. Images read back with the Read tool

All under the scratchpad.

| what | file |
|---|---|
| the opening flyover under noon, from 150 m | `p2_o1_1flyover.png`, `p2_strip_strip/00–05_noon_*.png` |
| the flyover's last frames — the flagship at noon | `p2_strip_strip/06_noon_cam34.17.png`, `07_noon_cam20.42.png` |
| **the slate, landscape** | `p2_o1_3slate.png` |
| **the slate, portrait 390×844** | `p2_port_3slate.png` |
| mid-blend, the sea going warm behind the slate | `p2_o1_4mid.png` |
| the settled bridge after the blend | `p2_a1_settled.png` (vs `p2_b2_settled.png`) |
| a resumed match — dusk, no slate | `p2_res1_resumed.png` |
| **context loss, the damage** | `p2_BEF_pre.png` → `p2_BEF_post.png` |
| **context loss, fixed** | `p2_AFT_pre.png` → `p2_AFT_post.png` |
| the mauve-bridge failure of the first fix | `p2_fix1_post.png` |
| a heavy fired after a restore | `p2_res1_postloss_fire.png` |
| the four scenarios | `p2_before/`, `p2_ctrl/`, `p2_after/`, `p2_after2–5/` |

Harnesses, all copies and none of them edits of the originals: `wl_lib.mjs` (shared CDP plumbing),
`wl_ctx.mjs` (context loss, `WL_CONTROL=1` for the no-loss control), `wl_open.mjs` (the opening,
`WL_STRIP=1` for a frame strip), `wl_scene.mjs` (end-state dump + frozen-pose render),
`wl_calls.mjs` (draw calls), `wl_resume.mjs`, `wl_again.mjs`, `wl_tap.mjs`, `wl_diff.py`,
`wl_revert.py` (builds the before tree). Nothing in the repo was written by any of them.

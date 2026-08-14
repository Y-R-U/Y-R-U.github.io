# AUDIT_CODE — enforcement pass against CLAUDE.md

Read-only audit, 2026-08-15. Enforces the seven binding rules in `CLAUDE.md` plus real defects.
Nothing here is a taste opinion the rulebook does not license.

**Headline:** two blockers. One is a stale world-bounds constant that has silently switched the
contact skirt off in two of the three towns (`groundfield.js`). The other is a per-zone art table
in `materials.js` that overrides frozen `zones.js` values from outside the art bible.

Counts: rule 1 — 5 · rule 2 — 0 · rule 3 — 5 · rule 4 — 3 · rule 5 — 0 · rule 6 — 1 ·
rule 7 — 19 deletions · defects — 8.

---

## Rule 1 — zone differences live only in `zones.js`

### 1.1 `COURSE` overrides the frozen `zones.js` block heights — BLOCKER, medium

`js/world/materials.js:18`

```js
const COURSE = { light: 0.22, neutral: 0.20, dark: 0.235 };
```

`masonry()` at `js/world/materials.js:60-63` reads this and *replaces* `z.stone.blockH`, keeping
only the authored W/H ratio. So `zones.js`'s `blockH` (0.42 / 0.35 / 0.38) is dead as an absolute
and the real per-zone course height lives in a three-key table in another file. This is the exact
failure mode the frozen-art-bible rule exists to prevent: editing `zones.js` `blockH` has no effect
on block height, and a fourth zone would need a code change in `materials.js`.

The comment above it explains *why* the values were rescaled, which is fair — but the fix is an
additive `zones.js` field (e.g. `stone.courseM`), not a zone-keyed table outside it. **Additive
`zones.js` fields are already signed off** (`BUILD_PLAN.md` § Signed off), so this needs Aaron's
nod on the field name only.

### 1.2 Flower colour and density branch on `z.id` — medium, one-liner

`js/world/textures/surfaces.js:251-252`

```js
const flower = hexRgb(z.id === 'light' ? '#e8d9e8' : z.id === 'neutral' ? '#e0d69a' : '#8d6a7e');
const flowerDensity = z.id === 'light' ? 0.972 : z.id === 'neutral' ? 0.984 : 0.991;
```

The only zone-id branch in the whole texture layer. Every other value in `ground()` comes off
`z.foliage` / `z.groundTint`. Textbook violation — additive `zones.js` fields
`foliage.flower` / `foliage.flowerDensity`, then two `z.foliage.*` reads.

### 1.3 Two flower palettes, already diverged — medium, medium

`js/world/scatter.js:28` carries a *global* flower palette:

```js
flowerHues: [0x7b62b8, 0x9a7fd0, 0xe4e2ea, 0xd8a94e],
```

used at `js/world/scatter.js:773` for every 3D flower card in all three towns, while
`surfaces.js:251` paints a *different*, per-zone flower into the ground texture. Blackstone's
painted flowers are dusty mauve `#8d6a7e`; its instanced flowers are the same lilac/purple as
Whitewall's. Fold both into the same `zones.js` field from 1.2.

### 1.4 The bell/horn rule is written twice, in two files — medium, one-liner

`js/game/session.js:716-718` decides which *sound* a town makes:

```js
if (town === 'neutral') return;               // Longacre rings nothing, and the silence is the point
const n = { rising: 1, high: 2, setting: 3, low: 4 }[bell.id] || 1;
if (town === 'dark') this.audio.play('horn', { level: 0.8 });
```

`js/game/hud.js:281-283` independently decides which *name* it shows:

```js
const names = s.town === 'dark' ? HORN_NAME : BELL_NAME;
const chip = s.town === 'neutral' || !names[bell.id] ? ... ;
```

Two copies of "Whitewall peals, Blackstone blows, Longacre is silent", in a UI file and a session
file, with two independent town branches. They agree today. `zones.js` already carries exactly
this kind of town character (`vermin.label`, `crest.type`, `staff`), so an additive
`bell: { kind, names }` field kills both branches at once.

### 1.5 `getMaterial('neutral', 'crest')` as a global-value proxy, three times — medium, one-liner ×3

`js/world/vermin.js:852`, `js/world/chicken.js:683`, `js/world/people.js:697` all run the same line
every frame:

```js
const env = getMaterial('neutral', 'crest').envMapIntensity;
```

with the same two-line comment copy-pasted three times. `materials.js:150-151` exports
`getEnvIntensity()` and `onEnvIntensity()` for precisely this — `scatter.js:8` already uses them
correctly. Three consequences: a hardcoded zone id in three world modules; a side-effectful getter
(`getMaterial` *creates and caches* on a miss, so this manufactures a neutral crest material
nothing ever draws and pushes it into `built`, which `setEnvIntensity` then walks every change);
and a per-frame Map lookup where a listener would do. Replace all three with
`onEnvIntensity(v => …)`.

### Checked and cleared

Everything else that mentions `'light'`/`'dark'`/`'neutral'` is legitimate:
`js/world/materials.js:87-92` (cache keys and texture seeds), `js/editor/ui.js:161,189` (iterating
`ZONE_IDS`), `js/world/field.js:37-39,336-339` (map layout), `js/world/demo.js`,
`js/editor/scene.test.js`, and the whole of `js/sim/` + `js/game/` campaign/faction/quest code,
which is gameplay identity, not art. `js/world/spell.js:188-193` reads the zone spell entirely
from data with no branch — correct. `js/world/buildings.js:2` claims "no zone ids are branched on
here" and that is true.

`js/game/towns.js:5-7` is a second per-town table but it is UI naming owned by `STORY.md §11` —
out of the art bible's scope, not a violation. Its `ground:` field is dead, see 8.4.

---

## Rule 2 — `zones.js` frozen, additive only

**Clean. No action.** All three spell signatures are intact:

| zone | core | void |
|---|---|---|
| light `zones.js:78` | `#ffffff`, warm edge `#ffeec2` / bloom `#fff8e2`, `flare: 1.5` | `null` ✓ |
| neutral `zones.js:133` | `#ffe6a8` — warm, light-like ✓ | `#2b2a14` ✓ **both signatures** |
| dark `zones.js:187` | `#e4d2ff` — cold violet ✓ | `#080309` ✓ |

`js/world/spell.js:190-192` and `:328-345` honour `void: null` and `flare` correctly, from data,
with no zone branch. Nothing anywhere mutates `ZONES` at runtime (grepped for `ZONES[`, `ZONES.`,
`zone(…).x =`). The section banners inside `zones.js` (`// ── stone ──` etc.) are **excluded** from
the rule-7 deletion list below — the file is frozen and they are data labels, not code banners.

One observation, not a finding: light's `core` is pure `#ffffff` rather than literally warm; the
warmth sits in `edge`/`bloom`. Neutral's core is therefore warmer than light's own. The invariant
holds at the signature level and the file is frozen — leave it.

---

## Rule 3 — everything tunable is a knob

113 knobs registered across 18 modules. `stream.js` and `lighting.js` are exemplary. The gaps:

### 3.1 The masonry / roof / ground art constants are not knobs — medium, medium

`js/world/materials.js:18` `COURSE`, `:25` `ROOF_VS_WALL = 0.62, ROOF_FLOOR = 0.30, WALL_GAIN = 0.88`,
`:30` `GROUND_MID = 0.44, GROUND_PULL = 0.55`.

These six numbers set how every wall, every roof and every metre of ground in the game reads —
they are hand-picked art values arrived at by looking at renders, which is the definition of a
knob under this rulebook, and `BUILD_PLAN.md` calls "easy to re-tune" the single highest-value
property of the codebase. `stoneVary` and `wallSkirt` next door *are* knobs. A blind critic asked
to fix a washed-out roof cannot currently move any of these without a code edit and a rebuild.
(`COURSE` should become a `zones.js` field per 1.1; the other five want `quality.register` with
`rebuild: true`.)

### 3.2 Ground-field extents are hardcoded and stale — see blocker 8.1

`js/world/textures/groundfield.js:9-10`. Not a knob, and wrong. Covered in full below.

### 3.3 Six `stream.js` defaults written twice — small, one-liner

`js/world/stream.js:15-19` sets `detail/cullK/groundK/foliageK/step` in the constructor;
`:82-91` sets the same five values again as knob defaults. `register()` applies immediately, so the
constructor copies are dead weight that will silently diverge the first time someone tunes one.
Delete the constructor initialisers (keep `this.on`, `this.at`, `this.counts`).

### 3.4 `stepUp` default written twice — small, one-liner

`js/world/colliders.js:144` `WALK = { stepUp: 0.93, … }` and `js/player.js:110` `default: 0.93`.
Same divergence risk. Let the knob own it; initialise `WALK.stepUp` to `null` and let
`setStepUp` fill it.

### 3.5 `ROAM` is a feel value with no slider — small, one-liner

`js/world/vermin.js:594` `const ROAM = 4.5;` — how far a nest wanders, in metres. Twelve vermin
knobs exist (`verminBob`, `verminLunge`, `verminSniff`, …) and this is the one behavioural number
that isn't one. `PER_MESH = 16` at `:590` is an instance cap, not a feel value — leave it.

`CAP` at `js/world/scatter.js:15` is scaled by the `foliage` knob and derives from the triangle
budget in `WORLD.md §6`. **Not a knob candidate** — correct as is.

---

## Rule 4 — every texture through `budget.js` `track()`

Every `new *Texture` site is tracked (`lighting.js:169`, `water.js:64`, `tree.js:44`,
`stained.js:27`, `groundfield.js:29`, `bake.js:52`, `aa.js:144-146`). Three accounting holes:

### 4.1 The post chain is entirely untracked, and it makes the readout go the wrong way — medium, medium

`js/engine/post.js:37-48`

```js
const rt = outputSpaceTarget(size.x, size.y, this.samples);
this.composer = new EffectComposer(renderer, rt);
…
this.gtao = new GTAOPass(scene, camera, size.x, size.y);
```

`outputSpaceTarget` (`aa.js:26`) is a bare factory — `AA.build()` at `aa.js:141-146` tracks what it
returns, `Post.build()` does not. Neither does `EffectComposer`'s cloned `renderTarget2`, nor
GTAOPass's depth / normal / AO / denoise buffers. That is roughly six full-resolution targets.

Worse than a simple omission: `AA.resize()` at `aa.js:159` skips `build()` while post is enabled,
so turning AO **on** untracks the AA target and allocates ~6 untracked ones — the memory readout
*drops* while real memory climbs. At 1920×1080 that is on the order of 40 MB invisible against a
60 MB budget (`stats.js:6`).

Fix: track `rt.texture` and `composer.renderTarget2.texture` in `build()`, untrack in `dispose()`,
and add an estimate row for the GTAO buffers using the same throwaway-key trick
`lighting.js:194` already uses for the PMREM.

### 4.2 The heightfield is billed as RGB8 but is R16F — small, one-liner

`js/world/textures/groundfield.js:24,29`

```js
tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.HalfFloatType);
…
track(tex, { w: W, h: H, fmt: 'rgb', mips: false, label: 'terrain:heightfield' });
```

`RedFormat` + `HalfFloatType` is 2 bytes/px; `fmt: 'rgb'` bills 3. 50 % over on a 100 KB texture —
trivial in absolute terms, but `budget.js:5` already has an `r: 1` entry that nothing uses, so this
is a one-token fix: `fmt: 'r', mult: 2`.

### 4.3 The PMREM estimate can never be untracked — small, one-liner

`js/world/lighting.js:194`

```js
track({ isTexture: false }, { w: 256, h: 256 * 6, fmt: 'rgb', mips: true, label: 'sky:pmrem' });
```

The key is a fresh object literal, so `dispose()` at `:518-522` (which untracks `skyTex` and
disposes the PMREM) leaves the registry entry behind forever. Store the key on `this` the way
`aa.js:39` does with `this.depthKey`, and untrack it in `dispose()`. Honest estimate, right idea —
just needs a stable key.

---

## Rule 5 — no build step, ES modules, `three` via the importmap

**Clean. No action.** Every bare specifier in `js/` is `three` or `three/addons/…`, both mapped in
`index.html:14-17`. No `require`, no `module.exports`, no `__dirname`, no `process.*`. `node:*`
imports appear only in `*.test.js` / `tools/*.mjs`, none of which is reachable from
`index.html:46` — verified by grep: no shipped module imports a `.test.js`.

---

## Rule 6 — K = 1.5, human-scale things not scaled

### 6.1 `stepUp` was K-scaled, and the stated justification is contradicted by the code — medium, medium

`js/world/colliders.js:142-144`

```js
// stepUp 0.93 is 1.5 × the old 0.62 and must stay above the 0.66 house plinth, or every front
// doorstep in the game is unclimbable.
const WALK = { stepUp: 0.93, cell: 12 };
```

Repeated verbatim at `js/player.js:109-110`.

Two problems.

*The scaling itself.* CLAUDE.md lists "step rise" among the things that **do not** scale, and
`js/world/buildings.js:420` gets it right for the visible geometry: `rise stays 0.19 — a step is
ergonomics, not architecture. Five of them clear a 0.66 plinth.` The walker's max step-up was
scaled 0.62 → 0.93 anyway. 0.93 m is mid-thigh on a human figure; the player can now stroll onto
anything under waist height.

*The justification is stale.* `js/world/colliders.js:47` gives every building `rise = 0`:

```js
put(o.x, o.z, hw + 0.18, hd + 0.18, o.ry, r.lo - 2, r.hi + tall(o), 0);
```

Buildings are solid walls with no walkable top — entry is the door hotspot only (stated at
`colliders.js:139-140`). So no front doorstep is ever climbed via `stepUp`, and the plinth can
never make one unclimbable. The only things carrying a `rise` are bridge decks
(`colliders.js:55`, which uses `WALK.stepUp`) and kerbs (`colliders.js:66`, which uses its own
`2.25`).

So `stepUp` today governs exactly one thing — stepping onto a bridge deck — and it was raised by K
for a reason that no longer holds. Either bring it back toward 0.62 and check the four crossings,
or keep 0.93 and rewrite both comments to say what it is actually for. Do not leave a wrong reason
in two files.

Everything else checks out: `walkRadius` 0.34 (`player.js:70`), `camRadius` 0.26, `armMin` 0.40
with an explicit "not scaled with the world" note at `player.js:65-68`, furniture in
`interior.js:278-295`, stair rise `rise / 0.2` at `stairs.js:101`. No pre-K hardcodes found.

---

## Rule 7 — comments

The codebase's comment discipline is, overall, **good** — the long comments in `terrain.js`,
`scatter.js`, `lighting.js` and `questrunner.js` are almost all non-obvious "why", which the rule
explicitly permits. There are no JSDoc blocks anywhere. The one systematic breach is decorated
section banners, which the rule bans outright.

Deletion list is a separate section at the bottom so it can be worked through mechanically.

---

## Defects — my own judgement

### 8.1 BLOCKER — the contact skirt is switched off in Whitewall and Blackstone

`js/world/textures/groundfield.js:9-10`

```js
const X0 = -160, X1 = 160, Z0 = -120, Z1 = 130;
const W = 256, H = 200;
```

The world is `X0 = -720, X1 = 720, Z0 = -400, Z1 = 320` (`js/world/field.js:6`). The towns sit at
`cx = -520 / 0 / +520` with `hw` 120 / 130 / 115 (`js/world/field.js:37-39`), and `demoScene.js:23`
places geometry at those centres today — this is live, not latent.

- Whitewall spans x ∈ [-640, -400] — **entirely outside** the field.
- Blackstone spans x ∈ [+405, +635] — **entirely outside**.
- Longacre spans x ∈ [-130, 130], z ∈ [-70, 150] — inside in x, and ~20 m past the north edge in z.

The texture is `ClampToEdgeWrapping` (`groundfield.js:26`), so every wall outside the window samples
the edge row. The skirt shader is

```glsl
float pGy = texture2D(pGround, (vPPos.xz - pGrid.xy) * pGrid.zw).r;
float pSk = pSkirt.x * exp2(-clamp((vPPos.y - pGy) * pSkirt.y, 0.0, 9.0));
```
(`js/world/textures/project.js:139-141`)

With `pGy` clamped to a height from 360 m away — and Blackstone's pads at 30/39/48 m above the
valley floor (`field.js:39`) — `vPPos.y - pGy` is tens of metres, `exp2` underflows, and `pSk` is
zero. **`VARY.wall`/`VARY.trim` carry `skirt: 0.62` (`materials.js:37-38`) and it lands nowhere in
two of the three towns.**

`forge_test/CLAUDE.md` names "contact occlusion wherever a surface meets the ground" as one of the
four things the entire visual bar rests on. `terrain.js:773-774` calls the companion ground collar
"the single thing that stops a building reading as a sticker". The ground-side collar still works
map-wide; it is the wall-side skirt that is dead.

These are the pre-A4 bounds from the 300 × 224 m world — `terrain.js:603` and `scatter.js:734`
both carry comments about that expansion, and this file was missed. Fix: widen to the `field.js`
bounds and re-pick `W`/`H` for an acceptable texel size (256×200 over 320×250 m is ~1.25 m/texel;
512×256 over 1440×720 m is ~2.8 m/texel and 262 KB at `fmt:'r', mult:2`). Then re-render
`wall_day` and `gate_night` and look at the PNGs.

Effort: two constants plus a memory/quality judgement call. Medium.

### 8.2 Duplicated env-intensity poll — see 1.5

Three copies, wrong API, hardcoded zone id, runs every frame. `one-liner ×3`.

### 8.3 Duplicated bell/horn rule — see 1.4

### 8.4 Dead exports and one dead field — small, one-liner each

Verified by grep across `js/`, `tools/`, `index.html` and `data/` — these have **exactly one**
occurrence in the tree, their own definition:

| where | what | note |
|---|---|---|
| `js/world/materials.js:419` | `disposeAll` | the whole material+texture teardown path, uncalled. `bake.js:24` already handles the `texCap` case via `dropAll`, so nothing needs it — delete it, or wire it into a real teardown |
| `js/engine/quality.js:30` | `MOBILE_PROFILE` | the reference profile "the hard gate in the brief is measured here" — and nothing reads it. `app.js:142` sniffs the UA independently and `shot.mjs:125` takes `mobile` as a caller flag. Either wire it into `shot.mjs --mobile` or delete the claim |
| `js/editor/scene.js:193` | `cloneScene` | |
| `js/game/boot.js:5` | `MODES` | `bootMode()` returns strings that are never validated against it |
| `js/world/vermin.js:264` | `verminName` | |
| `js/sim/rng.js:35` | `intBetween` | |
| `js/sim/combat.js:20` | `expectedHit` | |
| `js/sim/gather.js:47` | `expectedForage` | |
| `js/game/towns.js:5-7` | the `ground:` field | never read anywhere. Also wrong: Longacre's is `'thatch'`, which is a roof material (`zones.js:98`), not a ground |

Separately, ~24 exports in `js/sim/tables.js`, `js/sim/combat.js`, `js/sim/economy.js` and
`js/sim/schools.js` (`NODE_BUDGET`, `SPAWN_RADIUS`, `REGION_ENEMIES`, `INTEGRITY`, `ECHOES`,
`NEUTRAL_SCENARIOS`, …) have zero readers. These mirror `SYSTEMS.md` tables ahead of the systems
that will use them — `tables.js:1-2` says so explicitly. **Deliberate, leave alone**, but worth a
one-line note in `BUILD_PLAN.md` so a later pass doesn't reap them.

### 8.5 `main.js` registers a whole system after boot — small, one-liner

`js/main.js:143-145`

```js
import { Vermin } from './world/vermin.js';
window.__forge.vermin = app.add(new Vermin(demo.terrain));
refreshPanel();
```

Sits below `app.start()` (`:139`) and `window.__forge.ready = true` (`:141`). The `import` is
hoisted so it works, but Vermin's twelve knobs register *after* `applyParams()` at `:137`, which
means `?verminScale=…` and friends are silently ignored on a URL, and the panel needs the extra
`refreshPanel()` to notice. Move it up beside the other `app.add` calls at `:27-43`. It reads
exactly like a bolt-on from a parallel session.

### 8.6 Duplicated defaults — see 3.3 and 3.4

### 8.7 Stale comment in two files — see 6.1

### 8.8 The three largest files — no split

Asked and answered honestly: **no.**

- `js/world/scatter.js` (1108) — "everything growing out of the ground". Geometry generators,
  placement, focus/repack, scenarios. One subject, and the generators and the placement loops
  share `TUNING`, the RNG and the palettes. Splitting buys nothing.
- `js/world/vermin.js` (1012) — one parameterised rig, its fur atlas, its animation uniforms, the
  spawner and the update. Cohesive.
- `js/world/terrain.js` (913) — the closest call. Heightfield mesh, bank ribbon, water surface,
  road ribbons, contact-AO decals, reflections. The AO decal pass (`:770-860`) is the only piece
  that could leave cleanly, and everything else shares the occupancy grid and the arc-length
  station machinery (`:421-460`). Not worth the churn.
- `js/game/session.js` (836) — it *is* the god-object, and the seven banner comments are the file
  asking for it. But every section is short, the tick order genuinely wants one owner, and the
  house style prefers this. Delete the banners; leave the file.

---

## Comment deletions

Flat list, mechanical. Two tiers.

### Tier A — decorated section banners. Delete outright, no judgement needed.

Explicitly forbidden by `CLAUDE.md` ("Never write section-banner comments"). Where the banner also
carries a sentence of rationale, keep the sentence and drop the rule and the box-drawing.

```
js/world/colliders.js:135 — // ── walkable world ──────────────────────────────────────────────────────────────────────────
js/world/interior.js:304 — // ── the leaded light, and the sun through it ────────────────────────────────────────────────
js/world/scatter.js:72 — // ── alpha-tested foliage cards ──
js/world/scatter.js:165 — // ── soft blobs ──
js/world/scatter.js:246 — // ── conifers ──
js/world/tree.js:80 — // ── the leaf atlas ──
js/world/tree.js:200 — // ── geometry ──
js/game/session.js:348 — // ── settings ────────────────────────────────────────────────────────────
js/game/session.js:371 — // ── the two buttons ─────────────────────────────────────────────────────
js/game/session.js:428 — // ── the Graft, SYSTEMS §8.3 ─────────────────────────────────────────────
js/game/session.js:653 — // ── the market ──────────────────────────────────────────────────────────
js/game/session.js:679 — // ── §9.4 ────────────────────────────────────────────────────────────────
js/game/session.js:711 — // ── audio beds and the bell ─────────────────────────────────────────────
js/game/session.js:733 — // ── the context button's target ─────────────────────────────────────────
js/sim/faction.js:131 — // ── the Graft itself ──────────────────────────────────────────────────────────
js/sim/faction.test.js:151 — // ── the Graft state machine ───────────────────────────────────────────────────
js/game/quest.test.js:286 — // ── the Graft acceptance run ──────────────────────────────────────────────────
js/editor/build.js:414 — // --- v3 object types -------------------------------------------------------------------------
```

Note `js/world/colliders.js:135` and `js/world/interior.js:304` are banner-plus-content: keep the
lines that follow them (`:136-140` and `:305-308`), delete only the ruled line itself.

**Excluded on purpose:** the ten `// ── stone ──`-style labels inside `js/world/zones.js`
(`:13, 25, 33, 38, 41, 56, 61, 63, 70`). That file is frozen and they label data, not code.

### Tier B — restatement and duplication. Judgement calls, all defensible deletes.

```
js/world/vermin.js:850-851 — // lighting.js drives env intensity through materials.js only, and an untracked material sits / at 1.0 while the whole town is at ~0.3.
js/world/chicken.js:681-682 — // lighting.js drives env intensity through materials.js only, and an untracked material sits / at 1.0 while the whole town is at ~0.3.
js/world/people.js:695-696 — // lighting.js drives env intensity through materials.js only, and an untracked material / sits at 1.0 while the whole town is at ~0.3 — which blows the robes out to white.
js/world/colliders.js:142-143 — // stepUp 0.93 is 1.5 × the old 0.62 and must stay above the 0.66 house plinth, or every front / doorstep in the game is unclimbable.
js/player.js:109 — // Must stay above the 0.66 house plinth or every front doorstep is unclimbable.
js/game/quest.test.js:313 — // session.graftGranted()
js/game/quest.test.js:322 — // session.blocked()
js/game/quest.test.js:327 — // session.graftInto()
js/world/scatter.js:762 — // flowers — clustered, the one saturated accent in the palette
js/world/scatter.js:784 — // shrubs — thickets rather than single balls, so they read as one mass with a ragged edge
js/world/scatter.js:814 — // loose stone — screes on slopes, spill at wall feet, shingle at the water
js/world/scatter.js:841 — // trees — a wooded rim behind the walls and across the water, sparse inside the towns
js/world/buildings.js:530 — // chimney
js/world/interior.js:278 — // chest and a shelf against the +x wall
js/world/interior.js:292 — // a stool by the fire, and a low bed under the shelf wall
js/world/climb.js:175 — // Test hook: starts a climb without input.
js/world/doors.js:411 — // Test hook: drives a climb without input.
```

Reasoning, so these can be argued with rather than applied blind:

- The three env-intensity comments go **with** the fix in 1.5 — once the code calls
  `onEnvIntensity()` the explanation is unnecessary, and three copies of the same paragraph is
  itself the noise the rule is about.
- The two `stepUp` plinth comments are **factually wrong** (see 6.1). Delete rather than keep a
  wrong reason in two files; replace with one true line if `stepUp` survives.
- The `quest.test.js` trio name a method the method below already names (`granted` ≈
  `graftGranted`). Weakest three on this list — if you disagree, keep them; they cost little.
- The four `scatter.js` ones are in-function section labels dressed as prose. The two-word half
  ("flowers —", "shrubs —") is the banner; the clause after the dash is real rationale. If you
  want to keep something, keep the clause and move it onto the line it explains.
- `buildings.js:530 // chimney` and the two `interior.js` furniture labels are the honest
  borderline: geometry calls are genuinely opaque and a one-word label helps. Listed because the
  rule says "if in doubt it goes" — but this is the one group I would not argue hard for.
- The two "Test hook" lines are marginal and near-duplicates of each other. Low priority.

### Not deleted — checked and kept

The dense rationale blocks in `terrain.js` (113 comment lines), `scatter.js` (120), `lighting.js`
(79), `people.js` (75), `field.js` (68), `questrunner.js`, `quest.js`, `save.js` and
`materials.js` were read and are almost entirely non-obvious "why" — Three.js workarounds,
unguessable units, spec references, and records of a decision that would otherwise be re-litigated.
Those are what the rule *asks for*. No file-top lines were flagged. No JSDoc exists anywhere in the
tree.

---

## Where I think the rule, not the code, is the problem

**Rule 6 and `stepUp`.** The rulebook says step rise does not scale. The code scaled it, and the
comment's reason is wrong — but the *underlying* pressure is real: architectural heights (plinths,
kerbs, bridge deck trim) scaled by K while the walker did not, so something had to give at the
join. The right resolution is probably neither "unscale `stepUp`" nor "leave it": it is to put the
actual step geometry (`buildings.js:421`, five 0.19 m risers) into the collider set instead of
papering over its absence with a 0.93 m tolerance. That is a bigger job than this audit should
prescribe, so 6.1 asks only for the comments to stop lying. Flagging it here rather than filing a
refactor.

**Rule 3 and named module constants.** Read literally, "no magic numbers buried in a module" would
condemn `session.js:31-35` (`LOOK_SCALE`, `STUCK_SECONDS`, `REACH`), `sounds.js`, `faction.js`
`GRAFT`/`SUSPICION`, `buildings.js` `TUNING`, `scatter.js` `CAP`. I did not file any of those. A
named, commented constant at the top of a file is not "buried", and the codebase applies that
convention consistently and well. I read the rule as aimed at inline literals and at values a
critic would want to *slide while looking at a render* — which is why 3.1 (six art constants that
set how every wall and roof reads) is on the list and the rest are not.

**Rule 2 and light's core.** `#ffffff` is not literally a warm colour. The rule as written says
"warm core". The file is frozen and the signature reads correctly in motion, so this is the rule's
phrasing being loose, not the data being wrong. No action.

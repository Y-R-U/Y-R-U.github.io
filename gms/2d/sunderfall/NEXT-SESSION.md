# SUNDERFALL — resume brief

Written 2026-08-09 ~02:15 because the session was about to hit its 5-hour limit. If you are a fresh
session picking this up, **start here**, then read `CLAUDE.md` → `ARCHITECTURE.md` → `DESIGN.md` →
`HANDOFF.md` → `CRITIQUE.md`.

## Where the build actually is

The user asked for a 2D scrolling roguelite platformer built by orchestrated sub-agents, with blind
critic tests and **one improvement round per area for now**, ranking the rest for later.

| area | agent | state |
|---|---|---|
| engine core + WebGL2 renderer | A1 | **done, verified.** 60fps @ 11.4k sprites + 10k particles + 49 lights in 15 draw calls |
| painted art + atlases | A2 | **done.** 7.67 MB, 4 locations × 5 tiling bands, 116 prop / 249 debris / 31 terrain frames |
| art improvement pass | A2b | **done.** One key light for the whole game, baked into every asset |
| intro cinematic | A3 | **done, 76.2s, works.** Scored 2–4 blind; improvement pass NOT yet run |
| sim: player, physics, destruction | B1 | **was running at cutoff** |
| 18 spells + cast circles | B2 | **was running at cutoff** |
| enemies + boss | B3 | **was running at cutoff** |
| HUD + mobile controls | B4 | **was running at cutoff** |
| procedural audio | C1 | **was running at cutoff** |

## FIRST THING TO DO — check for agents cut off mid-write

Five or six agents were live when the session ended and **agents are not resumable**. Any that did
not reach their handoff may have left half-written modules. Before building anything:

```bash
cd /Users/aaronair/cc/yru/site/gms/2d/sunderfall
grep -c '^## ' HANDOFF.md                  # one section per finished agent
ls game/js/sim game/js/spells game/js/enemies game/js/ui game/js/core/audio.js
node tools/shot.mjs --url "http://localhost:8888/gms/2d/sunderfall/game/?nointro&dpr=1" \
  --out /tmp/sf --size 1440x900 --canvas --console
```

Expected handoff sections: orchestrator, A1-engine, A2-art, A3-intro, plus whichever of A2b/B1/B2/
B3/B4/C1 finished. **A module with no handoff section should be treated as suspect** — read it
before trusting it, and be ready to finish or discard it. `main.js` dynamically imports every
optional module inside try/catch, so a broken module degrades rather than bricking the game; use
`?nointro&scene=play` to check the game still boots.

The static server may need restarting:
`python3 -m http.server 8888 --bind 0.0.0.0 --directory ~/cc/yru/site`

## Two concrete bugs, already diagnosed — fix these first

**BUG 1 — the game is far too dark and drowned in blue. This is the single biggest visual problem.**
Evidence: `docs/shots/first-ingame-2026-08-09.png`, the first real in-engine frame. The game boots
clean (no console errors) and everything renders — braziers, lantern, fence, crates, barrels, tree,
parallax bands — but the whole frame is crushed into near-black blue and the ground plane is a flat
void. The braziers are the only readable thing.

This is **not the art**. It is the play scene's ambient tint compounding with the renderer's
pseudo-linear colour squaring (A1's gotcha 1). A2 predicted this exactly and filed it as a REQUEST
before anyone had run the game. Fix: tune `R.setAmbient` / `R.setHaze` / per-layer `shade` and
`response` in the play scene against `refs/ours/ori_wotw_00.jpg`, which is what the art is *meant*
to look like. Expect this alone to move the in-engine critic score by several points — do it before
commissioning any more art work, or you will be paying agents to fix art that was never broken.

**BUG 2 — sim API surface mismatch, filed by B3.** `sim/API.md` §8 documents `world.addProp()`,
`world.collapse()`, `world.queryProps()` and friends on the world object, but `sim/world.js`
currently exposes them under `world.props.*`. The enemy module — including **the boss's arena
teardown** — calls the documented form, so the climax of the game will throw. Add the aliases
(cheaper, keeps the published contract true) rather than editing the doc and every caller.

Also from B3: `game/js/enemies/testbed/world.js` is a shim its harness uses by default while the
real sim did not exist. `?sim=1` switches to the real one. **Delete the shim once the real sim
passes**, or it will rot into a second source of truth.

**BUG 4 — `R.fx.shockwave()` null-derefs when four shockwaves land in one frame** (`postfx.js:84`).
Two agents hit this independently and both worked around it, so fix it at source. **Root cause,
diagnosed by B2:** the slot-eviction loop initialises `oldest` to `0` rather than to the first
candidate, so no slot is ever selected and the code dereferences null. One-line fix. Until then, B1's
try/catching, rate-limited `world.shockwave()` is the safe call, and B2 has its own one-per-frame
limiter — **delete both workarounds once the engine call is safe**, or they will hide the next
regression.

Also outstanding from B2: `world.despawnProp(prop)` is the one sim API method missing — Gravewake
needs a prop to *cease*, not break. And confirm for it that a negative `shoveDebris` force pulls
inward, and that a spell may safely write `surfaces.wind`.

**Two test doubles must be deleted once the real sim is trusted** — `game/js/spells/testkit/` and
`game/js/enemies/testbed/world.js`. Both were written because the real sim did not exist yet, and
both are now second sources of truth for the same API.

**BUG 3 — every enemy grunts like a husk.** `enemies/fx.js` emits `enemy_hurt` / `enemy_die` with no
creature id, so all nine share one voice on hit. Deaths are rescued by the `enemy:died` bus hook
(which does carry `tag`), but hurt is not. Change those two call sites to `'enemy.' + e.tag + '.hit'`
— C1 flagged it as the biggest audible upgrade available for the least work, and it is a two-line fix.

## A job for a human, not an agent

**Nobody has heard the audio.** 231 procedurally-synthesised sounds shipped and every headless run is
`--mute-audio`. Structural verification proves nothing is silent, clipped or indistinguishable — it
cannot prove it sounds *good*. Ask the user to spend twenty minutes with
`http://localhost:8888/gms/2d/sunderfall/game/audio-test.html`; `window.__audioTest.verify()` will
tell them if a retune breaks a measured contrast. This is genuinely blocked on ears and should be
raised with them early, not discovered late.

## The queue, in priority order

1. **Integration pass.** Get `game/index.html` playable end to end: intro → play scene with player,
   terrain, spells, enemies, HUD, audio. Nobody has yet run all the modules together — every agent
   verified only its own harness. Expect the integration bugs to be here.
2. **Re-run the blind critic — twice, and in this order.**
   (a) **Round 1 re-test.** `refs/ours/` has been regenerated under the same five filenames by
   `art/tools/make_refs.sh`, so round 1 is a clean like-for-like. A2b self-assessed 6.5–7.5 against
   the previous 4; get the real number. Every builder in this project has self-scored high — the
   intro agent said 6 where the critic said 3 — so treat the self-assessment as a hypothesis.
   (b) **The in-engine frame.** This is the number that actually counts and it has never been
   measured; both rounds so far judged art outside the renderer. Do this only *after* the ambient
   fix (BUG 1), or you will be measuring the bug rather than the art.
   Stage with `tools/blind.mjs`, brief from `tools/critic-brief.md`.
3. **Intro improvement pass** — one round, against the intro-specific list in `CRITIQUE.md`. The
   defects are located to pixel coordinates and ready to hand straight to an agent. Do not let it
   rebuild the intro; the composition and the ward dome are good and must survive.
4. **Level assembly** — the four-movement level in `DESIGN.md` §5, using `world.addProp` /
   `world.addTree` / the support graph, plus `createDirector` from the enemies module.
5. Then work down the ranked list in `CRITIQUE.md`.

## Things that will waste your time if you rediscover them

- **`Page.captureScreenshot` hangs forever** — no error, no timeout — on an animating WebGL canvas
  under headless SwiftShader. Use `tools/shot.mjs --canvas`, which reads the drawing buffer and
  force-injects `preserveDrawingBuffer` at `getContext` time so it works on pages that did not ask
  for it. Add `--seek "t=>window.sfSeek(t)"` to scrub a timeline in one page load instead of
  reloading per frame. Always pass `?dpr=1` — at dpr 2 the software rasteriser takes minutes a frame.
- **`tools/shot.mjs --canvas` fails on large canvases.** B4 found that a full-resolution PNG data
  URL (~10 MB) never crosses the CDP socket, so the capture silently dies — and that
  `Page.captureScreenshot` hangs while *any* canvas exists on the page in this headless setup, not
  only an animating WebGL one. **Worth fixing properly in `shot.mjs`** (chunk the data URL across
  several `Runtime.evaluate` calls, or downscale into a smaller offscreen canvas before encoding);
  every visual agent will otherwise reinvent a workaround. `game/ui-test.html` already ships two:
  `?comp=1` (sliced `toDataURL`) and `?flat=<s>` (flatten to a mid-res background so plain
  `shot.mjs` captures the live DOM overlays).
- **Headless Chrome clamps the viewport to 500px minimum width** and lies about it. `shot.mjs` uses
  `Emulation.setDeviceMetricsOverride`, which gives a true 390×844 portrait.
- **The renderer squares all colours into pseudo-linear space** and square-roots at the end.
  `(1, 0.5, 0.2)` becomes `(1, 0.25, 0.04)`. Pick desaturated light colours; judge art in engine.
- **A parallax band that stops inside the view draws a hard ruled line** across the screen. Looks
  exactly like a renderer bug; is not one.
- `flux2-klein-base-9b` / `-base-4b` are **gated on HuggingFace and 401** here, so `--guidance` is
  unusable. Everything is `flux2-klein-9b-mlx-4bit` at 6 steps, ~36s at 1024×576.
- No ImageMagick, no PIL. `sips`, `ffmpeg`, Node 24 (with a built-in `WebSocket`), headless Chrome.
- The art pipeline is dependency-free JS with a hand-rolled PNG codec; `art/tools/build_all.sh`
  rebuilds everything in ~2 min and `art/tools/verify.js` fails on a bad frame or a blown budget.

## Open REQUESTs left by agents (in HANDOFF.md)

- **A2 → whoever tunes the play scene:** the ambient tint compounds with the colour squaring and
  makes everything very blue. Tune it against `refs/ours/ori_wotw_00.jpg`, which is the intended look.
- **A2 → level author:** ground runs need `wall_<kind>` tiled beneath them.
- **A1 → sim:** call `P.setTerrainQuery(...)` and `input.setAimOrigin(...)` (B1 said it would).
- **A1's own next steps, all worthwhile:** shadow-casting occluders in the light buffer (would turn
  god rays into real shafts), a soft shadow pass per actor, and a shared sprite-atlas animation
  helper before three modules each write their own.

## Not to be forgotten

- **Playable prologue** — `DESIGN.md` §7 records the user's idea, extended: make the cold open
  *playable* as Vayne at full power in an unwinnable fight. Explicitly **post-v1**, revisit once the
  level plays end to end.
- The user wants **one improvement round per area for now**, with everything else ranked for later.
  Do not spiral on polish; breadth to a complete v1 first, then work the ranked list.

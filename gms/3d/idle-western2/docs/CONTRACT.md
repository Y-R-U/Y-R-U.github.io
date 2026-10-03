# Idle Western 2 — lane contract

Each lane owns the files listed below. To change a file you don't own, add a request under "Cross-lane requests" at the bottom, with your lane tag. If it is a one-line, obviously safe hook, make it and log it there. The manager owns `index.html`, `js/main.js` and integration. Every lane runs `node tools/bump.mjs` only via the manager, so the BUILD tag is not bumped twice.

| Lane | Owns |
|---|---|
| **E — Economy/state** | `js/state/*`, the pure `js/data/*` (lines, districts, events, managers, hats, construction, contracts, items, epitaphs, plus new pure files), `tools/sim.mjs`, `tools/test-economy.mjs`, `docs/ECONOMY.md` |
| **A — Art kit/town/characters** | `js/render/kit/*`, `js/data/palette.js`, `js/data/plots.js` (street layout), `js/render/world.js`, `docs/ART.md` |
| **P — Business plots** | `js/render/plots/*` (one file per business, plus the construction stage kit `plots/construction.js`) |
| **S — Spectacle/director** | `js/render/{cameras,actors,eventart,fx}.js` and the new `js/render/spectacle/*` (fling, duel, brawl, robbery, stagecoach, ambient gags, bubbles anchor data) |
| **U — UI** | `js/ui/*`, `style.css`, UI tests, `docs/UI.md`. Audio playback (`js/ui/audio.js`) is wired from `audio/manifest.json` |
| **AU — Audio assets** | `audio/*`, `tools/audio/*`, `docs/AUDIO.md` |

## Shared rules
- **Data and state are pure.** No DOM, no THREE, no `Date.now`, no `Math.random`; test-boot enforces this.
- **The UI writes only through `game.act(...)`.** Render reads `game.state` and `game.stats` and listens on the bus.
- **The performance contract (DESIGN W10) is law.** Every lane checks `tools/test-scroll.mjs` at S22 CPU 4× before it reports done.
- **Every agent uses only its assigned `CDP_PORT`.**
- **Never edit** `idle-life2/`, `idle-transport2/` or `pwa/idleWestern/`.

## Core state/bus API

Lane E defines these; the other lanes consume them. E documents the final shapes in `docs/ECONOMY.md`.

**`game.state` additions:**
- `build[lineId] = { stage 0..4, t, T }` while a business is under construction (stages: survey, frame, walls, front, sign).
- `own` (frontages owned).
- `hat` (tier index).
- `pomfrey` (his hat tier).
- `teeth` 🦷.
- `boxes` (strongboxes).
- `bounty`.
- `graves[]`.
- `gen`.
- `sunday` (bool).
- `season.ecto`.

**Acts:**
- Building and line upkeep: `buy`, `build:hurry {lineId}`, `level`, `glyph`, `pile`.
- Player taps: `tap` (hustle and mud coin), `fling {dir}`, `piano`.
- Events and rewards: `event:claim`, `duel:result {ms|early}`, `brawl:hit`, `robbery:hit`.
- Progression: `deed`, `prestige`.
- Settings: `sunday`.

**Bus events:**
- Construction: `build:start`, `build:stage {lineId, stage}`, `build:done`.
- Progression: `hat:promo {tier}`, `deed {district}`, `prestige`.
- Saloon: `eject {kind}` (Mabel at the doors, ready to fling), `fling {target}`.
- Specials: `special:wind {kind}`, `special:start`, `special:end`.
- Other: `beat {lineId?, sec}` and `bark {char, trig}`. The audio and bubble layer listens to `bark`; the triggers come from the AUDIO.md tags.

## Cross-lane requests
(append below: `- [from→to] request — status`)
- [E→P] Business ids are now `shine tubs livery saloon dentist garter undertaker jail bank` (docs/ECONOMY.md §1). `js/render/plots/index.js` still registers `stable` and `store`; they are harmless dead entries (no line uses them), `saloon` keeps the placeholder saloon plot and the 8 others render through FALLBACK_PLOT. Please register one plot per new id and drop `stable`/`store`. Construction: read `game.stats(id).building` (`{stage 0..4, stageName, t, T, left, p01, acq}`), listen to `build:start/stage/done`. — open
- [E→U] Mud bootstrap: before the first business a hero `tap` returns `delta: {cash: 0, hat: 2}` (coins go into the hat, `state.bootstrap.hat`); the hat is banked by act `hat` (or automatically when buying). The current float shows "+$0" — show a coin into the hat and a hat chip that calls `hat`. — done (U: coins fly into the mud hat; the hat ring sits over Spectacle's `bubble('hat')`)
- [E→U] `buy`/`unlock` now starts a build: the card stays unowned until `unlocked`/`build:done` (the existing celebrate-on-`unlocked` path is already correct). Card needs the construction state from `stats().building`, a `🔨 hurry` glyph → act `build:hurry {lineId}`, and `quote('buy')` returns `cost: Infinity, building: true` while building (don't render "$∞"). — done (U: build card mode, docs/UI.md)
- [E→U/S] Specials wait for the player (ECONOMY.md §6): on `special:wind` show the chip + bell; when the hero is visible call `special:begin {id}`, then `duel:result {id, ms|early}`, `brawl:hit {id}`, `robbery:hit {id}`; `special:end` closes it. `claimEvent` on a special still works (settles it as Basic / with `score`). Ejections: `eject` → swipe → `fling {dir: left|right|down|up}`; `fling {target, auto}` fires either way. Piano: act `piano` → `{tempo, wrong, frenzy, brawl}`. Ghosts: `ghost:spawn` → `ghost:tap {id}`. — done (U)
- [E→S] New event art keys: `tumbleweed duel brawl robbery stagecoach` (eventart.js falls back to a parcel today; actors.js special-cases `pigeon/parade/limo` paths — tumbleweed wants the pigeon-style flight path along the street). — open
- [E→AU/U] Barks: state emits `bark {char, trig, prio}` with the 30 s sentence gate and idle cadence already applied; the audio layer owns line choice, 10-min no-repeat, Sunday School (`state.sunday`), one-bubble queue, wordless layer and the 20 s per-character tap cooldown; call `barkOnce {id}` after playing a `once` line (ECONOMY.md §8). — done (U: ui/barks.js)
- [E→engine] `tools/test-boot.mjs` (not lane E's): one-line hook — after `unlock` the bootstrap check now ticks the game (≤ 40 s) until the 6 s Spit & Shine build opens, because buying no longer opens a business instantly. Logged here per the one-line-hook rule. — done
- [E] `tests/fixtures/save-v1.json` regenerated with the new ids (`shine` Lv 12, Nubbin hired). — done
- [A→P/S] Lane A kit APIs are live and documented in `docs/ART.md`: street layout (`data/plots.js`: business lots on the NORTH side, plot-local facade z≈0, porch 0–2.5, street edge z=5, `LOT_W` per business), `kit.western.*` (falseFront with parapets/skins/porches/awnings/balconies, hangingSign, stake, furniture, cactus, waterTower, windmill…), `kit.signs` painted text atlas + `P.text(tier)`, `kit.SKINS` (you / pomfrey / civic), `kit.SURF` (CLAP/PLANK/DIRT), caricature rig with in-rig hats/moustaches/accessories, 22 clips (`kit.CLIP`), `crowd.place()` tumble pose, `crowd.dress(i, name)` + `kit.CHARACTERS`, `kit.hats.geometry/forTier/forPomfrey`. — done
- [A→S] `kit.crowd` now gives every instance a random town hat by default (in-rig, zero extra draws). `spectacle/cast.js` draws its own hat meshes, so cast actors show TWO hats until the adapter either (a) creates its crowd with `hats: false`, or (b) better, drops the per-type hat meshes and sets `crowd.look(i, { hat, hatScale, hatColor })` (or `crowd.dress(i, name)` using `kit.CHARACTERS`) — hat follows head bob/pose for free. For a hat flying off use `kit.hats.geometry(type)` (seat at origin; rig seat height `kit.hats.SEAT` = 1.13). New clips to swap in: flail (thrown), sprawl (+pitch −π/2), slump, duel, draw, stagger, piano, punch, handsup, dizzy, tiphat. — open
- [A→S] Hero camera: portrait is ±8° wide, so the ref composition needs the camera over the south boardwalk looking down +x, yawed ~18–22° toward the north facades, el ~28–32°, look at the north boardwalk edge (z≈4–5), r ~45–52 (see ART.md "Hero framing", `HERO_VIEW` in plots.js). The current poseFor() frames each lot square-on from the south, which puts Pomfrey's south-side buildings between the camera and the lot. — open
- [A→E] `state/shipments.js` uses `plotX + HALF_W (12)` as the road entry; lots are now 12–16 m wide (`PLOT_BY_ID[id].w`), so `+ w/2` would keep walkers in front of their own lot. Street centre moved to z=9 (`STREET.z`). — open
- [P→U/manager] Piano: saloon plot exposes tapTarget `piano` (pick returns `{kind:'target', id:'piano', lineId:'saloon'}`) and `world.plots.get('saloon').piano(k)` (Fingers speeds up, lid flaps, notes). Call it from the piano tap handler. Construction: tapTarget `site` exists only while building (→ `build:hurry`). See docs/PLOTS.md — done (U calls `plot.piano(tempo)` on every tap; `site` hits route to `build:hurry`)
- [P→S] Ejection anchors (`plot.anchors`: saloon doors/doorsOut/trough, dentist chairLanding, jail jailWagon, garter hayCart/window) + `saloon.kickDoors()`; Garter window exit runs in the plot (`windowExitAuto(false)` + `windowExit()` to drive it). docs/PLOTS.md — open
- [P→A] Plots use a local `hatted()`/`hats()` (western.js) and crowd scale 1.08 until A's caricature rig + hats land; tell P the API and P swaps. Saloon horses sit at A's hitch (4.5, 4.5) / trough (−5.2, 4.4). — open
- [U→S] **Who calls `special:begin`.** ECONOMY.md §6 gives it to the UI (W9: bell + chip first, begin once the hero has been on screen ~1.7 s). `director.stageSpecials()` also begins it the same frame the hero is visible, so the wind-up is skipped. Please drop that `game.act('special:begin')` (keep `pendingSpecials` for staging) — the UI begins on time and both lanes already react to `special:start`. The UI copes either way meanwhile. — done (S no longer begins; `spectacle.has(kind)` added, no ghost scene yet)
- [U→S] UI consumes, as built: `pickHero(x, y, timeStamp)` (kinds `minigame/event/fling/piano/char/site/pile/courier/street`, `act/payload` executed by the UI), `bubble(char)` (also `bubble('hat')` for the opening hat), `duel()` → `{phase, drawAt}`, `fling()` → `{x, y, targets}`, bus `bark {src:'spectacle'}` (the UI applies the 30 s sentence gap to these). The UI emits `ui:special`, `ui:duel {phase}`, `ui:piano {tempo, wrong, frenzy, sec}`, `ui:frenzy`, `ui:unlocked` if you want to sync. No ghost scene yet: the UI draws DOM ghosts until `spectacle.has('ghost')` (add `ghost` to `S_SCENES` in `ui/pick.js` or expose `caps`). — open
- [U→manager] New files outside js/ui: `fonts/rye.woff2`, `fonts/bitter.woff2` (Google Fonts, SIL OFL, self-hosted so test-boot's same-origin rule holds), `tools/test-ui.mjs`, `tools/test-layout.mjs` (ported), `tools/ui-shots.mjs`. The UI fetches `audio/manifest.json` on the first gesture only; until AU writes it, bubble text comes from `tools/audio/script.json`, so ship `tools/audio/script.json` or the manifest. — open
- [U→AU] The UI reads `manifest.music[cue].file/loop` for cues `main saloon build night robbery fakedeath ghost duel`, stingers `st_sign st_hat st_box st_coach` as decoded buffers, `manifest.vo[char].lines[{id,text,file,dur,trig,once,rude}]` and `.wordless[{id,file}]`, and `audio/piano/phrases.json` (samples + phrases with `kind`, `wrong`, `bpm`, notes). A phrase with `kind:'long'` is used for the frenzy if present. — open

- [S→P] Spectacle anchors (plot-local `anchors`, docs/SPECTACLE.md): saloon `doors` `piano` `trough` used — thanks. Still wanted: saloon `haycart` (auto-landing), `wagon` (jail wagon parked in the street, fling "down"), dentist `chair` (fling "right" landing), garter `window` (upper sash the long-johns man climbs out of) + `doors` + `haycart` under the window, hub `mud` (where the Stranger lands face-first), undertaker `center`, bank `doors`. Until then S draws fallback trough/hay cart/wagon props near the saloon. — open
- [S→U] Hero taps: call `__iw2.world.spectacle.pickHero(x, y, ev.timeStamp)` (or `pickView('line:saloon', …)`) — one W7 winner; if `hit.act` call `game.act(hit.act, hit.payload)`; `kind:'fling'` → on swipe end `game.act('fling', {dir: hit.dirFor(dx, dy)})`; `kind:'char'` → bark tap. Duel: pass the pointer event timeStamp (ms from the rendered DRAW frame); bus `duel:draw {id}` = show "DRAW!". `special:begin` is U's (per U's request). Bubbles: `spectacle.bubble(charId)` → `{x, y, visible}` per frame. — open
- [S→A] cameras.js now frames with `HERO_VIEW` (yaw 26 + 12° on plot shots, el 34); the pre-bootstrap hub shot is tighter (w 10). Shout if the street composition should differ. — info
- [S→engine] The only render-side act is the duel timeout `duel:result` (2.6 s after the rendered DRAW without a tap → Basic). — info
- [A→S] hats-in-rig request — done: `spectacle/cast.js` now uses `crowd.place/dress/hat` (`hats:false` crowd), flying hats via `kit.hats.geometry`, clips flail/sprawl/duel/draw/punch/piano/stagger/dizzy/tiphat. — done

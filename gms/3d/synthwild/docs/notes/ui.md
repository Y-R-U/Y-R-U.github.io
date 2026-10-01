# Lane 5 — UI / audio / intro notes

Owner of `css/*`, `js/ui/*`, `js/audio/*`, `audio/*`, `assets/*`, `tools/ui_*`, `tools/audio_*`, `tools/vo_*`.
Provides `ctx.ui`, `ctx.audio`, `ctx.settings`. Sole user of the GPU media services.

Status (2026-10-02): **M1 built** (+ the M2 hooks lanes 3/4 asked for). `node tools/qa_smoke.mjs --only mobile --quick` → 19 PASS. Title → (first-run intro) → loading → playing ⇄ paused works in the real game.

## Files
| File | What |
|---|---|
| `js/ui/settings.js` | `ctx.settings` store (contract keys + `musicOn/sfxOn/voiceOn`, `narrator`, `buildMobs`, `guide`, `treeFelling`, `introSeen`), `gain(ch)` folds mutes in |
| `js/ui/settings_panel.js` | Settings panel: Sound / Video / Controls / Easier play, one-line kid-friendly explanations |
| `js/ui/ui.js` | `ctx.ui`: `init(ctx, engine)`, `update(dt)`, `toggle('inventory'|'wheel')`, `closePanels()`, `blocking`, `toast`, `popup`, `handlesDeath` |
| `js/ui/shell.js` | screen flow, loading screen, pause menu, autosave (60 s, on pause, on hide), save & quit, visitor "Save a copy" |
| `js/ui/title.js` | title screen: wordmark over `assets/intro/forest.webp`, My Worlds / Public / New World, rename/delete/public |
| `js/ui/store.js` | world storage façade over `js/net/api.js` (local IndexedDB + cloud), difficulty kept in localStorage per world id |
| `js/ui/account.js` | sign-in panel (username + "Admin? Sign in with Google" link), admin player list (add/remove) |
| `js/ui/hud.js` | hotbar (tap = select, tap selected = inventory), Integrity cells, Charge pips (+charging glow), air, eat ring, droop chip, damage/water vignettes, FPS, scale chip (opens wheel), bag and pause buttons |
| `js/ui/inventory.js` | slide-over inventory: Backpack, Fabricate placeholder, Build-mode "All blocks" catalog; tap-to-move, drag, hold/right-click = split |
| `js/ui/wheel.js` | radial tool wheel: scale ring ¼–8, brush mode fill/hollow/shell/swap, W×H×D steppers, camera first/third |
| `js/ui/icons.js` | procedural isometric block icons from the `TILES` colours (+ glyphs for food/tools/materials), `fmtCount` (18¼) |
| `js/ui/intro.js` | voiced intro: Ken Burns stills, crossfades, subtitles, Skip chip, tap/any key skips |
| `js/ui/fullscreen.js` | fullscreen toggle + landscape orientation lock; re-enters on the first gesture if the setting is on |
| `js/ui/dom.js`, `glyphs.js` | `h()`, styled `popup/confirmPop/promptPop` (never alert/confirm/prompt), toasts, line icons |
| `js/audio/audio.js` | `ctx.audio`: `music(name)` crossfade (`title`/`day`/`night`/`intro`/null), `sfx(name, {pos, vol, mat|fam})`, `vo(key)` → Promise, `unlock()`, `duck()` |
| `js/audio/sfx.js` | procedural WebAudio SFX; material families soft/sand/stone/wood/metal/glass/gel guessed from block keys |
| `css/ui.css`, `css/hud.css` | glass tokens, shell, HUD, panels. `ui.js` injects both + Google Fonts (Exo 2, Orbitron; falls back to system-ui) |

## How the rest of the game talks to lane 5
- main.js already does it right: `settings.init(ctx)`, `audio.init(ctx)`, `ui.init(ctx, engine)`, then `ui.update(dt)`.
- Pause: shell calls `engine.pause(p)`; panels set `ctx.input.enabled = false` + `releasePointer()/releaseAll()`.
- `?auto=1`, `?shot=1`, `?cam=` → main.js starts the engine; the shell **adopts** that session (no title, no intro).
  `?intro=1` plays the intro then the title. `?play=1&seed=&mode=` starts a throwaway world from the shell.
- `document.body.dataset.swState` = `title|intro|loading|playing|paused` (CSS hides lane 3's crosshair/touch off-play).
- Audio listens on the bus itself: `block:break` (break sound by material), `block:place` (place + hologram chirp),
  `player:damage` (hurt), `player:death`, `player:respawn`, `item:pickup`, `time:night`/`time:day` (music switch).
  Don't also call `sfx()` for those. Other names: `step`, `splash`, `eat`, `fuse` (1.5 s rising hiss; `{dur}` optional),
  `fuseCancel`, `emp`, `visor`, `whiff`, `mobHit`, `mobDeath`, `burnout`, `cache`, `groan`, `chirp`, `swing`, `hit`,
  `bowDraw`, `bowFire`, `pulseHit`, `archerCharge`, `archerFire`, `spiderHiss`, `spiderLeap`, `voidShimmer`, `voidTeleport`,
  `gelHop`, `fabricate` (auto on `item:fabricate`), `goal`, `till`, `plant`, `treeGrow`, `treeFall`, UI clicks.
- Death screen: "SUIT OFFLINE" card (where you'll reboot: Sleep Pod / landing site; monsters scared off) with
  **Reboot suit** → `ctx.game.respawn()`. `ui.handlesDeath = true`.
- Dusk: ~60 s before night (time01 0.70) in survival → toast + narrator line `n01` + subtitle (`ui.say(key, text)`).
- Compass chip (top right): nearest `outpost`/`starter` from `world.structuresNear(x, z, 400)`, hidden once
  `game.journal.done.outpost` is set.
- Wheel lists `ctx.brush.actions` (undo/redo/copy/paste/rotate/mirror/pick) → `brush.run(id)`, disabled ones greyed;
  toasts on `brush:notUndoable`, `brush:copy`, `brush:pick {found:false}`. Inventory Fabricate tab mounts
  `game.stations.mountFab(container)`; an open station panel counts as blocking (Esc/pause closes it). Bow charge ring from
  `game.bow.charge`, eat ring from `survival.eatProgress`, charging glow from `survival.trickle`.

## Media
- **Music** (`audio/music`, 5.4 MB, all Aaron's Suno tracks reused): `title.mp3` = Skyhammer "Cold Start" (retro sci-fi
  synth arpeggio, Em 100 BPM); `day_a.mp3` = NEONHAUL "Smoglight" (ambient drone, slow pulse); `day_b.mp3` = Who Fights
  "Low Green Country" (pastoral harp/whistle, a C418-ish calm); `night.mp3` = NEONHAUL "Standing By" (patient dark synthwave).
  None was listen-checked. **Gap:** nothing in the library is genuinely bright, wondrous synth. Worth a Suno session:
  "wondrous solarpunk ambient electronica, instrumental, glassy arpeggios, warm pads, gentle pulse, bright major key".
- **Intro stills** (`assets/intro/*.webp`, Flux2 Klein 9B 4-bit, 1344×768 → 1280 wide webp q86): seed, forest, shore, ocean,
  quiet, wake, night, vista; `forest.webp` doubles as the title backdrop and the fallback for a missing still. Regenerate with `tools/ui_flux.py` (raw PNGs to `$RAW`)
  and `tools/ui_webp.sh <png> <name>`.
- **VO** (Aaron: default narrator = low rich baritone, labelled Male; female kept as the alternative): `audio/vo/male/` and
  `audio/vo/female/`, each `i01..i10` + `n01` (dusk warning) + `manifest.json` (durations drive the intro timing).
  Voices in Qwen Voice Studio: `Synthwild · Narrator Baritone` (design seed 5, ~90 Hz median F0, rendered at speed 0.9 ≈ 2.6
  words/s) and `Synthwild · Narrator Female` (seed 17, ~245 Hz, speed 1.0). An older duplicate named `Synthwild · Narrator`
  (= the female) exists in the studio; there is no delete endpoint. Text in `tools/vo_script.json`; `tools/vo_design.py
  male|female <seeds…>` / `save <job> <seed>`; `tools/vo_gen.py male|female [keys]`. Loudness-normalised to −16 LUFS.
  Not listen-checked: durations and pace are sane (2.4–2.9 words/s), loudness −16 to −19 LUFS.
- Settings → Sound → **Narrator voice** (Male / Female, ▶ plays `i10`). `audio.vo(key)` reads the folder from `narrator`.
- **Not done:** LTX clips for the intro (optional; the queues were busy with other sessions all afternoon).

## How to test
- `node tools/ui_test.mjs` (settings store + count formatting).
- Harness with stubbed engine: `tools/ui_harness.html?state=title|play|inv|wheel|pause|settings&mode=build&night=1&water=1&hurt=1`,
  `?intro=1` for the intro.
- Screenshots: `~/.claude/bin/cdp start --port 9315 -- --use-angle=metal`, then
  `DPR=1 node tools/ui_shot.mjs <url> out.png 915x412 [waitMs] [js]` (env `POST_WAIT` ms after the js).
  Headless at DPR 2 renders the blurred title backdrop grey; DPR 1 is correct. Check on a real phone.

## Open issues
- Item descriptions are thin ("A building block."); lane 4 could add `desc` to items/blocks.
- Fabricate tab is a placeholder until M2 recipes (lane 4 has `js/data/recipes.js` ready).
- Cloud thumbnails re-render one frame to the canvas on pause/quit and every 5th autosave (no preserveDrawingBuffer needed).

## Requests to other lanes
- **Lane 2:** main.js draws its own FPS box at top-left whenever `settings.showFps` is on, on top of the title wordmark and
  next to the HUD's FPS chip. Please show yours only for `?fps=1`/`?shot=1`. Also the default (post-enabled) headless frame is
  black at 1280×720 (`?q=med` renders) — same as lane 4 reported.
- **Lane 3:** done on your side (HUD owns crosshair/bag/pause/scale chip; `toggleView` → `view` setting here). My CSS also hides
  `.swp-*` overlays whenever `body[data-sw-state]` isn't `playing`.
  Settings you can read: `sensitivity`, `invertY`, `leftHanded`, `autoJump`, `aimAssist`, `uiScale`, `view` (the wheel calls
  `ctx.player.setView(v)` if it exists, and settings `view` changes too).
- **Lane 4:** `buildMobs` setting added (default off). HUD reads `survival.trickle`, `eatProgress`, `droop`, `underwater`, `air`.
- **Lane 6:** login panel, admin-only player panel, offline hiding and the 409 Overwrite / Save-as-copy choice are in.

## Mini-games (D10), lane 5 framework + Parkour Dash, Floor Fall, Treasure Hunt
| File | What |
|---|---|
| `js/minigames/registry.js` | `GAMES` (lazy loaders; `hideseek-seek` picks `seekGame`), `loadGame(id)`, `listGames()`, personal bests in localStorage `synthwild.mg` (`recordResult(key, result)`) |
| `js/minigames/index.js` | runner: `minigames.begin(ctx, root, id, {variant, actions})`, `update(dt)` (driven by `ui.update` → shell), `stop()`; `countdown(mg)` 3-2-1-GO helper |
| `js/minigames/arena.js` | `createArena(ctx, def, variant)` → `{ctx, world, origin, variant}` at `def.arenaY` (default 80) above the throwaway world's spawn; re-exports lane 4's `fill/put/W/pad/ring/mat`; `top()`, seeded `rng()` |
| `js/minigames/hud.js` | glassy mini-game HUD with lane 4's minihud API (`objective score timer big toast`) + `hint`, `add`, `results(r, actions, info)` (stars, new-best chip, Play again / Mini-games / Title) |
| `js/minigames/command.js` | command bar (`/` or `T` while playing; "Commands" chip in the pause menu). DOM exists only while open. `/play <game> [length]`, `/quit`, `/help`, `/time day|night`, `/tp spawn` (cheats: Build mode or a world created with Commands = On; never in mini-games) |
| `js/minigames/menu.js` | title "Games" tab: bots difficulty (Easy/Normal/Hard → `minigamesBots`), a card per game (icon, blurb, minutes, stars + best, length chips) |
| `js/minigames/games/parkour.js` | seeded spiral of floating platforms (Short 18 / Medium 30 / Long 46), checkpoints every 8, falls → last checkpoint, timer, ghost of your best run (`synthwild.mg.ghost.<length>`), 3 stars under 1.15 s/platform |
| `js/minigames/games/floorfall.js` | 3 glass floors 17×17, 7 apart; tiles under anyone turn coral then vanish after 0.6 s; 4 lane-4 `BotSquad` bots (built-in StubBot fallback); spectator ledge when you're out; 3-min cap |
| `js/minigames/games/treasure.js` | floating island with landmarks (tree, rocks, pool, hut, light tower with a climb rail); 5 Caches in random order, one riddle at a time, hot/cold pulse ring; 4 min |
| `css/minigames.css` | menu cards, HUD, results, heat ring, command bar |

Flow: title Games tab / `/play` → `shell.playMinigame(id, {variant})` (saves and leaves a real world first) → loading screen →
`engine.start({temp:true, mode:'minigame', seed:'mg-<id>'})` → `minigames.begin` → playing. The world is temp: never saved.
Pause in a mini-game: Resume / Restart / Settings / Leave (back to the Games tab). Results: Play again / Mini-games / Title.
HUD in mini-games: hotbar only when the game hands out items; Integrity only with `session.mgSurvival`; no compass/wheel.
Lane 4's CTF, Hide & Seek (both roles) and Glitch Siege start from the menu and from `/play` unchanged (verified).
Screenshots: `tools/ui_mgshot.sh <game> out.png [waitMs] [js]` (915×412, real game, `?q=low`).

Also fixed: the title's mote canvas had no CSS size, so at DPR ≥ 2 its backing store doubled every frame (grey title,
memory blow-up on phones). It's now sized from the parent only when that changes. Verified at DPR 2.

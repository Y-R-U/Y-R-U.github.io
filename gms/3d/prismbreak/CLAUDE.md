# Prism Break — glass & metal match-3 (Three.js)

Bejeweled-style match-3 with a glass/metal finish system, special-gem combos,
daily/weekly/event rewards, shard economy, and fake "watch ad" bonuses (a 5s
joke modal — never real ads). No build step; three.js **0.180** via importmap
(needs ≥0.168 for `dispersion` on the transmissive glass materials).

## Architecture

- `js/board.js` — **pure engine**, no DOM/three imports. Grid `[row][col]`,
  row 0 at top. Returns event lists (`clear` / `fall` / `swap`) that the
  renderer replays. Unit-tested via `node sim.mjs 200`.
- `js/game.js` — controller: replays board events as tweens + FX, owns HUD,
  modes, boosters, forge meter, hints, auto-player.
- `js/gems.js` (meshes/materials) · `render.js` (scene/bloom/theme/projection)
  · `fx.js` (particles, shards, beams, DOM text pops) · `audio.js` (procedural
  WebAudio, pentatonic cascade ladder) · `input.js` (tap-tap + swipe).
- `js/ui.js` — all screens/popups (never `alert()`); `rewards.js` — daily
  streak calendar + monthly chest, ISO-week seeded weekly challenge,
  date-driven events (Fri–Sun rotating by week number, Wed = Twilight Zen);
  `save.js` — one localStorage blob `prismbreak.save.v1`.
- `js/config.js` + `levels.js` — all tuning/content tables (node-safe).

## Game rules worth knowing

- Gems have `finish: glass|metal`; both match by colour, metal scores 2×.
- **Crush**: metal that just *fell* onto glass sitting on metal shatters the
  glass (`findCrushes` runs after every gravity step, feeds next cascade).
- Specials: 4-run → line blaster (along run), L/T → burst 3×3, 6+ cluster →
  nova 5×5, 5-run → prism orb. All special+special swap combos implemented in
  `comboClear()` (prism+prism = board wipe; prism+line converts a colour to
  blasters).
- Forge meter fills from metal clears/crushes → free 3×3 smash on tap-tap.

## Testing

- Engine: `node sim.mjs 500` — invariant checks (no holes, no dup ids, no
  unresolved runs) across thousands of random moves.
- Browser: headless Chrome needs `--use-angle=swiftshader
  --enable-unsafe-swiftshader`. Serve repo root, then:
  - `?auto=1&mode=zen|blitz` — AI plays forever (soak).
  - `?shot=1` — staged pretty board + frozen "SPECTACULAR!"; sets
    `window.__shotReady`.
  - `?lite=1` — no bloom/AA.
  - `window.__game` = `{ game, save, R, launch, show, params }`.

## Gotchas

- **Tone mapping is NeutralToneMapping on purpose** — ACES washes the saturated
  gem colours to pastel (Aaron flagged it). Don't "fix" it back.
- Glass gems = smooth round transmissive bubble (`shellGeo` sphere) + smaller
  OPAQUE faceted gem inside (`GemMesh.inner`). Anything that must be visible
  *through* the shell — inner gem, special glow rods/cores, board tiles — must
  be opaque, or it vanishes from the transmission buffer. The see-through look
  is fragile; each of these kills it if "improved": shell must have NO emissive
  (reads solid), NO flat shading (facets scramble refraction), LOW ior/thickness
  (1.12/0.35 — lensing smears the inner gem), WHITE body colour (tint dims the
  interior), low envMapIntensity (sheen reads as a rubber ball).
  `?lite=1` falls back to a cheap transparent shell.
- Clearing a glass gem: crack jitter → shell shatters (pale shards) → inner gem
  tumbles out via `FX.dropGem` (shares gem geo/mats — never dispose them there).
- Crush choreography lives in `playClear()` (squash tween + `slamCrusher()`),
  not in the engine — engine only reports `ev.crushes`.
- Keep flashes tame: full-screen `FX.flash` alphas ≤ ~0.3, no pure-white
  popFlash/shockwaves on routine clears — Aaron flagged the game as too
  white-flashy once already. Bloom is 0.4/0.6/0.88 on purpose.
- Fake-ad reward flows all route through `ui.js watchAd(onDone)` — keep it fake.
- `daily.claimed` only keeps the last 60 day-keys; month maths reads it, so
  don't trim below ~35.
- Theme swap must go through `applyTheme()` (mutates shared materials).
- Level curve is generated in `levels.js levelDef(n)` — no per-level data files.

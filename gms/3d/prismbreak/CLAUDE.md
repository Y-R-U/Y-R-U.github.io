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
- Glass = real `transmission` (+ dispersion, attenuation); board tiles must stay
  OPAQUE or they vanish from the transmission buffer and gems stop looking
  see-through. `?lite=1` falls back to cheap opacity glass.
- Crush choreography lives in `playClear()` (squash tween + `slamCrusher()`),
  not in the engine — engine only reports `ev.crushes`.
- Fake-ad reward flows all route through `ui.js watchAd(onDone)` — keep it fake.
- `daily.claimed` only keeps the last 60 day-keys; month maths reads it, so
  don't trim below ~35.
- Theme swap must go through `applyTheme()` (mutates shared materials).
- Level curve is generated in `levels.js levelDef(n)` — no per-level data files.

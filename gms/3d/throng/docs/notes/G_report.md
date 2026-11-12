# Lane G (gameplay) report — M1

## What exists

| File | What |
|---|---|
| `js/sim/sim.js` | Pure deterministic sim per CONTRACT. `createSim`, `SIM_DT`, `stateHash(state)` |
| `js/sim/rng.js` | sfc32 RNG + string seed hashing (integer-only, engine-independent) |
| `js/sim/collide.js` | Obstacle grid: `blocked`, `pushOut` (slide along walls), `segmentClear` |
| `js/sim/bots.js` | 7 personas, BFS nav grid (4 m cells), threat/prey/pickup/pedestrian-density scoring, drives crowds only via `setInput` |
| `js/sim/match.js` | `makePlayers()` — crowd 0 = local player, seeded persona→team assignment |
| `js/config.js` | Every tunable: `MATCH`, `SIM`, `TEAMS`, `BOTS`, `PERSONAS`, `INPUT`, `UI`, `NAME_POOL` |
| `js/main.js` | Boot, map/renderer loading with fallbacks, fixed-step loop + alpha, match flow, audio director, test hooks |
| `js/input.js` | Floating drag-anywhere joystick (touch + mouse, pointer capture), WASD/arrows, yaw-rotated, keep-moving-on-release flag |
| `js/audio.js` | Procedural Web Audio: recruit ticks (pitch climbs with streak), steal whooshes, absorb/absorbed, pickup, countdown beeps, last-10 s ticks, lead gained/lost, win/lose stings, crowd murmur bed scaled by your count, soft I–V–vi–IV pluck loop that adds hats in the last 30 s. Mute saved in `localStorage['throng.muted']` |
| `js/ui/hud.js` | Timer + kills, leaderboard (top 5 + your row, spring reorder), count pills over every crowd, "+N"/"-N" floaters, toasts, power-up rings, countdown, final-10 numbers, absorbed veil, off-screen leader arrow |
| `js/ui/minimap.js` | Player-centred circular minimap, DPR-aware, rotated with the camera yaw, rim-clamped dots |
| `js/ui/screens.js` | Menu (title, name field saved in `localStorage['throng.name']`, Play, mute) and results (ranking, stats, Play Again, Menu) |
| `js/ui/debug2d.js` | Top-down 2D stand-in implementing the renderer contract (`?debug2d=1`, and the automatic fallback) |
| `index.html`, `css/ui.css` | Importmap, inline classic boot watchdog (15 s → Reload with cache-busting URL), safe areas, no scroll/zoom/select/callout |
| `tools/stub_map.js` | Stand-in for `js/world/map.js` (node tests + browser fallback) |
| `tools/sim_test.mjs` | Headless batch test + balance table |

The menu runs an all-bot "attract" match behind the title (fast-forwarded 18 s so crowds are already
big), so the first thing a player sees is the live city.

## Running

```
node tools/sim_test.mjs                    # 24 matches on each map (stub + real if js/world/map.js loads); exit 1 on failure
node tools/sim_test.mjs --matches=8 --map=real
node tools/sim_test.mjs --set=speedFall:0.3,stealBoost:1   # quick tuning sweeps without editing config
node tools/sim_test.mjs --break=<determinism|nan|stuck|leak|events|distribution|jitter>   # falsification
```

Game: serve `/Users/aaronair/cc/yru/site` and open `gms/3d/throng/index.html`.
Hooks: `?auto=1` (skips the menu, bot drives you), `?lite=1`, `?seed=N` (fixes city + match),
`?shot=1` (no menu, no HUD, bot-driven, no countdown), `?t=N` (fast-forward the first match),
`?debug2d=1`. `window.__game = { state, sim, renderer, start(), menu(), ready, errors, mode, match,
setAuto(b), stepSeconds(s), audio, input, hud, map, mapStub }`.

## What sim_test asserts (each one proven to go red)

| Assertion | Broken with | Result |
|---|---|---|
| Same seed → identical state hash at tick 1800 and at the end | `--break=determinism` (one Math.random input at tick 500 in run 2) | FAIL, hashes differ |
| No NaN in crowds or pedestrians | `--break=nan` (radiusK = NaN) | FAIL, "NaN at tick 15" |
| Nobody stuck: no crowd stationary > 6 s, every crowd travels ≥ 300 m | `--break=stuck` (speedBase 0.15) | FAIL, "stationary 120s", "travelled only 15 m" |
| Counts conserved: per step, every crowd's delta = recruits + respawns + steals in − steals out | `--break=leak` (+1 person injected at tick 900) | FAIL in every match at tick 900 |
| Every event type occurs | `--break=events` (no pickups) | FAIL, "'pickup' never occurred" |
| Sane distribution: winner median 300..2500, no win under 120, ≥ 1 elim and ≥ 1 lead change per match, city never below 25 % pedestrians | `--break=distribution` (no pedestrians) | FAIL on all four |
| No jitter: mean bot steering turn rate < 120°/s | `--break=jitter` (one bot's input flips every tick) | FAIL, 5334°/s |

## Tuning (in `js/config.js` → `SIM`)

- Radius `0.55·√n` (1,000 people ≈ 17 m). Speed 8.6 m/s at 1 person, falling 40 % (log scale) by 1,500.
- Pedestrians: cap 650, 560 at start, refill 26/s, never spawn within 22 m of a crowd's edge;
  62 % head for the nearest plaza. Reach = radius + 3.2 m (+12 % of radius); magnet ×1.35 + 9 m.
- Steal: `(6 + 0.5·small) · overlap · ratioTerm · (1 + 1.2·min(ratio−1, 4))` people/s; ratio dead zone
  1.06; ratio term saturates at 1.86. Tiny crowds melt on contact, near-equals trade slowly.
- Eat drag / panic: a crowd that is absorbing moves at ×0.85, the victim at ×1.10, for 0.35 s after
  contact. This was the single most important change: without it a fleeing mid-size crowd and its
  chaser differ by ~0.5 m/s and the victim bled out over 10–20 s with no way out (the diagnostic found
  46 bleeds > 4 s in 12 matches; now about a third of that, and those are mostly cornered crowds).
- Respawn after 3 s at 5 people, at the spawn point furthest from big crowds, 2.2 s protection.
- Pickups: 5 on the map, 11 s respawn; speed ×1.45 for 6 s, magnet 8 s, x2 recruits 8 s.
- Bots in the last 30 s weight hunting ×1.4 and the leader as prey ×1.4 (tension at the end).

## Balance table (24 matches per map, `node tools/sim_test.mjs`)

Real map (lane R's `js/world/map.js`):

```
persona        mean  median  best  kills deaths  wins  travel  stuck  turn°/s  recruit  stolen
sprinter        457   371.5   520    0.8    0.4     7     754      2       35      387     246
collector       450     435   519    0.4    0.5     3     754      2       40      398     187
coward          402   337.5   471    0.3    0.2     4     751      3       45      422     106
opportunist     401   249.5   483    0.7    0.5     4     753      2       42      305     249
opportunist*    352   230.5   425    0.8    0.5     4     759      2       46      317     185
hunter          301   201.5   356    0.9    0.5     1     769      2       43      282     169
bully           268     222   297    0.6    0.6     1     773      2       40      334      94
wanderer         70    34.5   120    0.0    1.2     0     812      2       38      203       1
winner sources: recruited 389  stolen 655  lost 3
winner   mean 1046  median 988  min 600  max 1701
per match: elims 4.5  lead changes 10.1  steals 674  pickups 12.5  pedestrians avg 617
arc (mean count by rank 1/2/4/8): 17s 114/99/68/12  37s 261/186/112/13  57s 436/304/143/15
                                  77s 585/413/194/19  97s 783/505/206/24  117s 1022/563/252/22
```

Stub map: winner median 646, elims 2.8, lead changes 11.4 per match.

`opportunist*` is crowd 0 driven by the `?auto=1` bot (skill 0.8) — the stand-in for a competent
player: mean 350, best 425, wins 4 of 24. The arc has fast early growth (≈110 by 17 s), mid-game
steals that make up ~60 % of the winner's final count, and ~10 lead changes a match.

## Verified in headless Chrome (`cdp start -- --use-angle=metal`)

- Boots with zero console errors, menu → Play (real touch tap) → 3-2-1 → play → results → Play Again →
  countdown → … → Menu, all by real `Input.dispatchTouchEvent` taps.
- Full real-time `?auto=1` match with the 3D renderer ran 127 s to the results screen, 60 fps, no errors.
- Touch drag steers in screen space with the renderer's yaw (0.55 rad): drag right/left/down moved the
  crowd within 0–1° of the drag direction on screen (up was blocked by a building in that run).
- Joystick appears on touch; release keeps moving (flag on).
- AudioContext goes `running` from a touch tap (touchend), not suspended.
- Live rotation portrait → landscape mid-match re-lays the HUD (minimap moves bottom-left) and the canvas resizes.
- Blocking `renderer.js` and `map.js` with the Fetch domain → stub map + 2D view, game still plays.
- `?shot=1&t=40`, `?lite=1`, `?seed=`, `?t=` all checked.
- Screenshots of menu / mid-match / results at 390×844, 844×390 and 1440×900 looked at and fixed
  (oversized logo, badge stuck at 0,0, badges over HUD panels, pill inside the crown, leader arrow over
  the minimap, results stats wrapping).

## Known gaps

- Audio has only been verified to run, not listened to. The music loop and murmur are deliberately quiet;
  on a real phone they need an ear. iPhone silent-switch fix (`audioSession.type = 'playback'`) is in
  but untested on a device.
- The wanderer persona is weak by design (mean 70) and the hunter underperforms; hunting is less
  profitable than sweeping pedestrians because small crowds are faster. Fine for M1, worth a pass.
- The last-place crowd is usually tiny (it keeps getting eaten); a comeback mechanic could help.
- Tab hidden: the loop just stops with rAF; there is no explicit pause screen.
- `NAME_POOL` is unused until the M2 fake lobby.
- Headless Chrome on port 9231 was being driven by another session's render harness at the same time
  (it navigated my tab away); I moved to a private port. Lane R may have been using that browser.

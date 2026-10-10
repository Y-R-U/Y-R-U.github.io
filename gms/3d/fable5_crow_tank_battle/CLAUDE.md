# Murder Royale — Fable 5 dusk tank battle royale

Last-tank-standing free-for-all (player + up to 15 AI tanks with distinct
personalities) set in the Murder at Dusk farm world. The shrinking royale
wall is a circling murder of crows. Three.js 0.160 vendored at `../../lib/three/0.160.0/` (local
importmap, no CDN), no build step.

## Files

- `js/config.js` — tuning (TANK, MURDER ring + per-mode `MURDER_PACE`,
  `OPENING` awareness, PICKUP + `PICKUP_KINDS`, PERSONALITIES with glyph/verb,
  NAME_POOL, ACCENTS) and the `?shot` / `?lite` / `?auto` / `?speed` URL modes
- `js/main.js` — boot, match lifecycle (title/countdown/playing/spectate/
  over), ring shrink + peck damage, camera, main loop
- `js/state.js` — shared match state; keeps the module graph acyclic
- `js/world.js` — dusk farm arena + collidable cover (`obstacles` circles)
- `js/murder.js` — the closing crow ring: instanced crow flock, smoke wall,
  blood ground ring, ambient caws
- `js/tanks.js` — Tank entity (physics/turret/damage); controllers write
  moveInput/aimPoint/wantFire
- `js/tankFactory.js` — accent-tinted low-poly tracked tank mesh. Geometry is
  module-level and materials are cached per accent, so building a tank
  allocates nothing on the GPU (the old per-tank build leaked ~180 geometries
  per restart). The player's glow is ONE permanent `playerGlow` light in
  world.js, so the light count never changes (no shader recompiles)
- `js/ai.js` — personality-driven controller (engage/flee/collect/roam)
- `js/player.js` — input controller (mouse aim assist / touch auto-aim with
  line-of-sight, tap-a-tank lock, optional auto-fire) + the ground lock ring
- `js/combat.js` — pooled accent bolts, tank/obstacle collisions
- `js/pickups.js` — pumpkin repair + rapid-fire / shield / crow-ward buffs,
  each with its own shape and a canvas-drawn icon sprite
- `js/ui.js` — HUD, leaderboard, neon stem+underline name tags, kill feed,
  callsign modal (never `alert()`), banners, arrows
- `js/career.js` — the save layer: lifetime career stats + settings, load
  with defaults and merge unknown keys forward, one-time legacy migration,
  match scoring, and the in-memory (never persisted) live-match tracker
- `js/cloud.js` — br8t account glue (`syncLocalKeys`), imported dynamically
  by `main.js` and allowed to fail
- `js/particles.js`, `js/audio.js`, `js/input.js`, `js/utils.js`

## Saves + the br8t account

Two localStorage keys, both safe to move between devices:

| Key | Holds |
|---|---|
| `f5mr.career.v1` | per-mode (duel/skirmish/royale/frenzy) played, wins, best placement, kills, deaths, best kills, longest survival, best score; overall totals incl. best kill streak and time in the field; `killedBy` / `killed` personality tallies (nemesis / favourite prey); callsigns used and felled |
| `f5mr.settings.v1` | callsign, mute, last mode picked, `autoFire`, `daily` {date, best, plays} |

Device-only (never synced): `f5mr.quality.v1` {level} — the adaptive-quality
tier chosen on the first touch match (see below).

The old single-value keys `f5mr_name` / `f5mr_mute` / `f5mr_mode` are read
**once** (when no `f5mr.settings.v1` exists) and then left alone, so an existing
player keeps their name and mute. Nothing writes them any more.

`js/cloud.js` mirrors exactly those two keys to `users/{uid}/games/murderroyale`
via `/lib/auth/localsync.js`. **No in-progress match state is ever persisted** —
the live match lives in `state.js` plus the `live` tracker in `career.js`, both
memory-only. `matchCompleted()` fires once per match from `bankMatch()` in
`main.js`, as the defeat/victory screen goes up. Read `/games/CLAUDE.md` before
touching any of this.

The account avatar sits top-right, so `#leaderboard` is offset by
`var(--br8t-account-space, 0px)`.

`?test` skips the account layer entirely (hermetic automated runs); so do
`?auto` and `?shot`. Career stats **are** still recorded under `?auto`, so a
soak run does add matches to the local career.

## Systems added 2026-10-11

- **Pacing.** Spawns are scattered (min spacing, clear of cover) and every AI
  roams to nearby spots away from other tanks. AI awareness is ×0.35 for the
  first 20 s, then grows from ×0.45 to ×1 as the ring closes; `endgame` (all
  fight) is only `zoneR < 26`. AI-only (`?auto`) match lengths: duel ~1–1.5 min,
  skirmish ~2–2.3, royale ~3, frenzy ~1.5–1.8 (were 13–16 s / 28–41 / 29–36 / 22–39).
- **Pecks** land every `MURDER.peckEvery` (0.5 s) with one cue (`AudioFX.peck`,
  light shake, purple flash, swooping crows from murder.js `spawnSwoop`) and the
  get-inside arrow. `Tank.damage(amount, attacker, kind)` — kind `'bolt'|'peck'`.
- **Live alive list:** `state.alive`, maintained by `Tank.reset` / `die`.
  `aliveTanks()` returns it directly — never sort or mutate it.
- **UI:** tags/arrows/hitmarker move by `transform` and only write changed
  values; the leaderboard is built once per match and patched; on touch it
  folds to top 3 + you (tap to expand). `ui.callout(text, color, kind, cooldownS)`
  is the non-blocking toast (stalk / nemesis / pickup / quality notes).
- **Nemesis bounty:** the career nemesis personality spawns tagged NEMESIS
  (not in daily or `?auto`); killing it adds `BOUNTY_POINTS` (250) to the score.
- **Daily field:** the arena (cover, farm, scenery) is seeded by the date for
  everyone (`world.js` uses the `srand` layout stream); DAILY FIELD on the title
  seeds royale spawns/names/pickups too and saves the best placement in settings.
- **Adaptive quality** (touch only): `QUALITY` tiers in world.js; main.js
  samples fps 1.5 s into the first match, steps down if < 45, remembers it.
- **Boot safety:** inline watchdog in index.html (errors before
  `window.__mrBooted`, or 12 s with no boot → callout with a cache-busting
  reload); `webglcontextlost` shows a non-blocking reload callout.
- Audio unlocks on pointerdown + touchend + click + keydown for the page
  lifetime, resumes whenever not `running`, suspends while the tab is hidden.

## Testing

Headless Chrome + raw CDP from node: `~/.claude/bin/cdp start --port 92xx --
--use-angle=metal` (the helper defaults to swiftshader, which runs this at ~10 fps;
pass metal for real numbers). In the driver call `Network.setCacheDisabled` or
stale modules hide your edits. Phone checks: `Emulation.setTouchEmulationEnabled`
+ `Input.dispatchTouchEvent` at 390×844 and 844×390 (mouse clicks hide the
Android audio-unlock bug).

Hooks: `?auto=1` makes an AI drive the player so full matches run unattended;
`?speed=N` (1–16) runs N sim steps per rendered frame for long AI soaks
(read `__state.matchTime`, not wall-clock); `?shot=1` stages the thumbnail brawl;
`?test` keeps runs hermetic. `window.__state`, `window.__career`
(inspect/reset the save), `window.__fx` = { AudioFX, renderer (use
`renderer.info.memory` for leak checks — geometries plateau ~150 and stay
flat), setQuality, probe (set `probe.fake = 20` to force a slow-phone reading),
aim (lock target / manual / autoFire) }.

To force an outcome without waiting, drive the real code path:
`__state.tanks.filter(t => !t.isPlayer).forEach(t => t.damage(999, __state.player))`
(only counts once the countdown is over). Always include the reload-loop check
from `/games/CLAUDE.md`: exactly one top-level `Page.frameNavigated` over ~12s.

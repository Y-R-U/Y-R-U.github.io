# Murder Royale — Fable 5 dusk tank battle royale

Last-tank-standing free-for-all (player + up to 15 AI tanks with distinct
personalities) set in the Murder at Dusk farm world. The shrinking royale
wall is a circling murder of crows. Three.js 0.160 via CDN importmap,
no build step.

## Files

- `js/config.js` — tuning (TANK, MURDER ring, PERSONALITIES, NAME_POOL,
  ACCENTS) and the `?shot` / `?lite` / `?auto` URL modes
- `js/main.js` — boot, match lifecycle (title/countdown/playing/spectate/
  over), ring shrink + peck damage, camera, main loop
- `js/state.js` — shared match state; keeps the module graph acyclic
- `js/world.js` — dusk farm arena + collidable cover (`obstacles` circles)
- `js/murder.js` — the closing crow ring: instanced crow flock, smoke wall,
  blood ground ring, ambient caws
- `js/tanks.js` — Tank entity (physics/turret/damage); controllers write
  moveInput/aimPoint/wantFire
- `js/tankFactory.js` — accent-tinted low-poly tracked tank mesh
- `js/ai.js` — personality-driven controller (engage/flee/collect/roam)
- `js/player.js` — input controller (mouse aim assist / touch auto-aim)
- `js/combat.js` — pooled accent bolts, tank/obstacle collisions
- `js/pickups.js` — glowing pumpkin heals
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
| `f5mr.settings.v1` | callsign, mute, last mode picked |

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

## Testing

Headless Chrome + raw CDP from node (`~/.claude/bin/cdp start --port 92xx`,
which already passes `--use-angle=swiftshader --enable-unsafe-swiftshader`).
`?auto=1&lite=1` makes an AI drive the player so full matches run unattended
(`window.__state` hook, plus `window.__career` to inspect/reset the save);
`?shot=1` stages the thumbnail brawl. Chrome's `--virtual-time-budget` does NOT
advance the sim.

Under swiftshader the sim runs at roughly 10 fps and `dt` is capped at 0.05, so
**sim time is about half wall-clock** — count frames, not seconds. To force an
outcome without waiting, drive the real code path:
`__state.tanks.filter(t => !t.isPlayer).forEach(t => t.damage(999, __state.player))`.
Always include the reload-loop check from `/games/CLAUDE.md`: exactly one
top-level `Page.frameNavigated` over ~12s.

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
- `js/particles.js`, `js/audio.js`, `js/input.js`, `js/utils.js`

## Testing

Headless Chrome + puppeteer-core (`--use-angle=swiftshader
--enable-unsafe-swiftshader`). `?auto=1&lite=1` makes an AI drive the
player so full matches run unattended (`window.__state` hook); `?shot=1`
stages the thumbnail brawl. Chrome's `--virtual-time-budget` does NOT
advance the sim.

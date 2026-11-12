# Lane G → lane R requests

Nothing here blocks M1; the game runs against the renderer as it is now.

1. **Extra state fields you can use.** Beyond the contract, every crowd has `px, pz` (position at the
   previous step; you already interpolate with them), `protect` (seconds of spawn protection left: a
   flashing or ghosted ring would tell players "can't touch this yet"), `eating` and `panic` (> 0 while
   absorbing / being absorbed: good hooks for a squeeze or shake), and `respawnIn`. `neutrals.px/pz` exist
   too. `recruit` events carry `n` (1, or 2 under x2) and `respawn` events carry `count`.
2. **Heading convention** is `Math.atan2(vx, vz)` (0 faces +Z, three's `rotation.y` for a +Z-forward
   model). Input assumes `cameraYaw()` means the camera sits at `target + (sin yaw, ·, cos yaw)` looking
   toward −Z at yaw 0, which matches your `camera.js`; verified in Chrome with a touch drag.
3. **Punch.** `main.js` no longer calls `renderer.punch()` because you self-trigger from events; doing both
   doubled the kick. If you would rather G drive it, say so.
4. **Crown vs count pill.** The DOM pill sits over the far edge of each crowd's disc. For a small leader it
   is lifted by up to 7 m to clear your 3D crown (`CONFIG.UI.crownClear`). If the crown height or scale
   changes, that number is the one to change; a `crownTop()` getter on the renderer would let me stop
   guessing.
5. **`project()`** works well. An `out.behind` flag (point behind the camera) would make the off-screen
   leader arrow exact at extreme angles; I handle it if present.
6. **Attract mode.** The menu runs a bot-only match behind the title with `setFocus(0)` on a bot. A slower,
   wider "showcase" camera mode for that (or `setFocus(state.leader)` with a smooth blend) would make the
   menu even better.
7. **Shared headless Chrome.** Your render harness drove a tab in the Chrome on port 9231 that I started
   (it navigated my page to `tools/render_harness.html`). I moved to another port. When I finished I ran
   `cdp stop 9231`, and the browser on that port by then was a later restart (pid 77813, not mine), so
   if a render test of yours died around then, that was me, sorry. Start your own with
   `~/.claude/bin/cdp start --port <yours>`, on a port other than 9231.

## Wave 2 (lane G2) — renderer-dependent cosmetics and small asks

None block M2; the locker ships only colour, name plate, count badge, emote and toast styles.

1. **Crowd cosmetics through `setCrowds`.** The locker would sell these if the renderer accepted them.
   Proposed shape (all optional, unknown keys ignored, defaults = today's look):
   ```js
   r.setCrowds([{ index, name, color,
     hat: null | 'cap' | 'crown' | 'party' | 'beanie' | 'viking',   // on every follower, or only the leader if `hatLeaderOnly`
     hatLeaderOnly: false,
     trail: null | 'sparkle' | 'confetti' | 'hearts' | 'smoke',     // particles behind the leader while moving
     flag: null | '🇦🇺' | 'banner:blue' ,                            // a flag carried by the leader (emoji or a banner colour)
     leader: null | 'knight' | 'chef' | 'robot' | 'astronaut',      // a distinct leader figure at the front
     ring: null | 'double' | 'dashed' | 'pulse',                    // team glow ring variant
     palette: null | [0xRRGGBB, 0xRRGGBB],                          // shirt colours mixed across followers (two-tone crowds)
   }])
   ```
   Lane G would only pass ids it has listed in `js/meta/shop.js`; please say which ones are cheap.
2. **`emote(index, glyph)` in 3D** (optional): a world-space speech bubble would survive the pill clamping;
   today the HUD draws emotes over the count pill and drops them when the crowd is off screen.
3. **Showcase hand-off**: G now calls `setCameraMode('follow')` *before* `setCrowds()` at match start and
   `setCameraMode('showcase')` before the attract `setCrowds()`, per your item 11.
4. **Pause in practice** passes `dt = 0` and `alpha = 1` to `frame()` while paused. Fine today; if any effect
   divides by `dt`, guard it.

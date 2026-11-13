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

## Wave 4 (lane G4) — modes, events, cloud save

R4 already shipped `setZones`, `setTheme`, `setWeather` and `updateCrowdMeta` while G4 was working, with the same style
ids G4 picked, so these asks are about what G4 now calls and what would make it better. Everything is optional and checked
before each call; the game plays without any of it.

1. **`r.setZones(list)`, called by G (main.js `pushZones`) only when the list changes.** G sends:
   - King of the Plaza: `{ x, z, r, color: 0xffd23a, style: 'crown' }` for the live zone, plus `style: 'next'` for
     the next zone during the last 6 s before it moves (every 30 s).
   - Last Crowd Standing: `{ style: 'safe', color: 0x7fe3ff }` for the safe circle now (it shrinks every frame
     during a shrink, so the list changes every frame then), plus `style: 'safe-next'` (white) for the circle
     it is shrinking toward.
   - Nothing for Classic, Teams or Infection. `[]` at every match start.

   Asks:
   - (a) In LCS, tint everything *outside* the safe circle (a red danger veil on the ground). The HUD does a
     screen-edge vignette and a "GET INSIDE THE CIRCLE" banner when you are outside, but the ground itself
     does not say where safety ends when the ring is off screen.
   - (b) In King of the Plaza, pass a `holder` colour so the zone glows in the holding crowd's colour. The
     field is `state.zone.holder` (crowd index or -1). G can send it as `z.color` if you prefer; say which.
2. **`r.setTheme(id)` / `r.setWeather(id)`** are called at every match start and on the menu with the live event's
   look (`js/meta/events.js` `EVENTS[*].look`), or with `'evening'`/`'clear'` when nothing is live:
   Double Crowd Weekend → `festival`/`clear`, Night Market → `night-neon`/`clear`, Rush Hour → `sunny-day`/`clear`,
   Giant Slayer → `evening`/`rain`. Change these ids freely in `EVENTS` if other looks suit better. The theme
   rebuild takes about 0.2 s, and it runs behind the lobby or countdown.
3. **`r.updateCrowdMeta(i, meta, { from })`** is called (a) in Infection when a crowd joins the horde, with
   `color: 0xa4ff1a`, and `from` set to the infecting crowd's position so the recolour wave starts there. It is
   also called (b) online when a late joiner takes a bot crowd, with that player's cosmetics. Verified in Chrome: both work.
4. **Horde look (Infection).** The horde is only lime-coloured. A shambling gait or slight hunch for horde
   followers, or green "spore" particles, would sell it. The field is `state.crowds[i].horde`.
5. **3D emote bubble.** G2 ask 2 is still open. Emotes now also arrive from other players online (`emote` events)
   and show on the leaderboard row when the crowd is off screen. A world-space bubble would still read better than
   the pill-anchored DOM one.
6. **Out crowds (LCS)** have `alive: false` and `out: true` for the rest of the match. Nothing needs drawing, but
   the renderer should not keep a ring or figures for them (it doesn't today).
7. **Merge boost (Teams).** While two teammates touch, both have `crowd.boost > 0` (reach ×1.3). A brief linked glow
   between their rings would explain the mechanic without words.

## Wave 4 — for the manager (server change, not made: server/ is not G's)

**LCS results never reach the Online leaderboard.** `plausible()` in `server/hub.go` requires the match to have run
`duration + countdown − 8 s` of wall time. Last Crowd Standing ends when one crowd is left (median about 81 s of the
90 s), so these results are refused as implausible, and the client says "Not saved to the leaderboard this time".
Infection can also end early, when every crowd is horde (about 15 % of matches). Proposed change: the host
already sends the match meta at `begin`. Parse `mode` in `matchMeta` and, for `mode == "lcs" || mode == "infection"`,
accept an early end after at least 40 s of play:

```go
// matchMeta: add
Mode string `json:"mode"`
// begin(): r.Mode = meta.Mode
// plausible():
minRun := int64((r.Duration+r.Countdown)*1000) - 8000
if r.Mode == "lcs" || r.Mode == "infection" { minRun = int64((40+r.Countdown)*1000) }
if r.Duration < 90 || r.Duration > 180 || now-r.BeganAt < minRun { return false }
```

The server also records "best crowd" and "wins" for every mode in one board. If mode boards are wanted later, add
`mode` to the `results` rows.

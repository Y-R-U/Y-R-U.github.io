# aim agent (2026-11-08)

## Task 1 — edge-relative drag power (Aaron's playtest)
"Drag starts at the ball; on desktop you run out of browser before max power. More sensitive; just before
the screen edge must always be max power."

`js/game/aim.js`
- `dragReach(x0, y0, ux, uy, W, H)` (pure, exported): distance from the drag start to the viewport edge along
  the drag direction, minus a margin of 5% of min(W, H) (14..40 px), clamped to
  `[max(60, 15% of min(W,H)), min(420, 42% of min(W,H))]`. The minimum keeps usable travel for drags that
  start near the edge; the cap stops huge screens from needing long drags (old fixed reach was 50% of
  min(W, H) from the start point: 384 px desktop, 206 px phone).
- `dragPower(...)` → `{ power, cancel }`: `(len - c) / (reach - c)`, capped at 1. Cancel radius c = 24 px,
  shrunk to `max(12, 0.2 * reach)` when the room is tight (landscape phone, dragging down).
- `dragForPower(...)`: the inverse, used by test drivers.
- `AimInput.viewport()` = `[innerWidth, innerHeight]` (clientX/Y space). Pointer capture was already set on
  pointerdown, so a mouse leaving the window keeps reporting and clamps at power 1.
- The fine-putt curve is unchanged: it lives in `shotSpeed` (power^1.25, engine/constants.js).
- Power is direction-dependent now (it's distance-to-edge relative), so swinging the aim sideways at a fixed
  length changes the meter — that is the intended consequence of "edge = max".
- HUD meter / % label / guide line / aim tick sfx all read `aim.power` — unchanged. AI, replays, online
  (js/ai, js/net/driver.js, replay) use power values / velocities only, never pixels.

`tools/shots_cdp.mjs`: every scripted drag used the old `24 + power * 182` / `maxDrag` formula; now
`dragLen(c, power, rel, x0, y0)` asks the page (`import('./js/game/aim.js')` → `dragForPower`).

Verified in headless Chrome (CDP, real game, hole 1), drags starting on the ball:
| viewport | ball | down room | power at 30% / 60% / 90% of room | sideways |
|---|---|---|---|---|
| desktop 1366x768 (mouse) | 683,594 | 174 px | 25% / 72% / 100% | 61% at 30%, 100% by 60% (cap 322 px) |
| phone 412x915 (touch) | 206,626 | 289 px | 42% / 100% / 100% | 25% / 67% / 100% |
| phone 915x412 landscape | 458,319 | 93 px | 23% / 71% / 100% | 76% at 30% (cap 173 px) |
95% and 99% of the room always read 100%; a mouse dragged past the window edge stays 100%; returning to
the start shows "Release here to cancel" and releasing cancels (state stays `ready`); 40 px drags shoot
at 11-33%. `dragPower(dragForPower(p))` round-trips to 1e-15 on 1600 random cases incl. 4K.
(Test script was a scratch file, not kept.)

## Task 2
a) **Rival ghost on the obstacle clock** — `js/ai/ghost.js`: `GhostPlayer.update(dt, worldTime)` starts each
   shot when the live clock reaches the shot's recorded `t0` and samples its path at `clock - t0`
   (`GhostBall.update(dt, at)`). Records come from `playHoleSync` with t0 = 0 at the tee and the live
   `world.time` is also 0 at hole load, so the phases match. Without worldTime / t0 it falls back to `gap`.
   `js/game/play.js` line 409 (ballhit's file, one line): `if (this.ghost && !this.paused) this.ghost.player.update(dt, w.time);`
   — passes the clock and drops the `state !== 'flyover'` gate (the clock runs during the fly-over, so the
   ghost now tees off ~1-3 s in, possibly during the fly-over, instead of 1.4 s after it). Steady Hands
   slows the ghost along with the obstacles.
   Verified: re-simulating the rival's recorded shots in the live world on the recorded clock reproduces
   the paths exactly (max dev 0 / 0.008 m) on sky8/12/18, while 1.7 s off-clock they deviate up to 11.5 m
   (that was the pass-through); shots start within a frame of t0. `shots_cdp story` rival hole runs clean.
b) **Volcano** — env.js peak 5° → 3.3° above horizon (plume base now visible in portrait; top still crops);
   obsidian ice texture → near-black glass with cool grey ripples, emissive 0x24142e → 0x16181c,
   metalness 0.2 → 0.3. Crystal props keep their violet tint. Shots checked p/l holes 1, 2, 10.
c) **Daily locked-ratio** — measured "how often a player with locked courses gets the global hole on days
   whose global hole is on an open course" (was 205/240 = 0.854 vs a 0.85 floor). Cause: the locked player's
   no-repeat walk ran independently over a smaller pool, so its skip history drifted. Fix in
   `js/daily/daily.js` `pickFor`: a restricted pool now follows the global sequence; only locked-course days
   get a fallback, which avoids the player's last RECENT picks and the global picks of the next RECENT days.
   Now 240/240 (and 405/405, 400/400, 305/305 for woods-only / sugar-only / both locked over 500 days),
   0 repeats, no locked-course leaks. Test tightened to `same === all` + a no-repeat check for locked players.
   Note: changes the hole on some future days for locked players (a started day keeps its saved hole).

## Tests (all pass)
physics 25/25, holes, story, daily 75/75, events, meta, store, ai (565 s), online 28/28;
`shots_cdp story` (scripted drags through the new mapping, holes in one, rival ghost) no console errors;
`volcano_shots` no console errors.

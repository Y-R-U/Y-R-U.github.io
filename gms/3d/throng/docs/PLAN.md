# THRONG — plan

A hyper-casual crowd-gathering .io game. Steer a leader through a city, sweep up
neutral pedestrians, absorb smaller crowds, be the biggest when the clock runs out.
Mobile-first; must play well in mobile portrait, mobile landscape and desktop landscape.

Reference image: `refs/reference.png` (mood + HUD layout; not a spec).

The manager owns this file. Order within a milestone is priority order.

## M1 — Playable and beautiful (FIRST)
- Pure sim: leaders, neutral pedestrians, recruit, crowd-vs-crowd steal, respawn, pickups, 2:00 timer
- 7 bots with personalities
- Instanced crowd (thousands of figures, shader gait), stylised evening city, team glow rings
- Camera: close at start, pulls out as the crowd grows, punch-zoom on big moments
- HUD: timer, kills, live leaderboard, minimap, count badges, "+N" floaters, crown on the leader
- One-thumb drag steering; keyboard + mouse on desktop
- Menu → countdown → match → results → play again
- Procedural audio (crowd murmur that scales, recruit ticks, steal, power-up, win/lose)
- `?auto=1`, `?lite=1`, `?shot=1`, `?seed=`, `window.__game` test hooks
- Ship: push to Pages (unlisted), then registered once the manager has played it

## M2 — Fake online + progression
- Fake matchmaking lobby (names, flags, "finding players"), believable bot roster
- Ladder as a curve (rating → rank among ~hundreds of thousands), leagues with promotion
- XP / coins, crowd skins (colour, hats, flag, trail), leader characters
- Daily reward, daily challenge (date-seeded), first-win bonus
- Settings (sound, quality, left-handed), how-to-play, br8t account + cloud save
- More power-ups and map hazards

## M3 — Real online
- Authoritative Go room server on br8t (same pattern as SKYPUTT/Clued), sim ported with a JS↔Go parity fixture
- Quick match (humans + bot fill), private rooms by share link, reconnect
- Client prediction for own leader, interpolation for others
- Real leaderboards (daily / weekly / all-time)

## M4 — Events, modes, maps
- Modes: Teams, King of the Plaza (hold the crown zone), Infection, Last Crowd Standing
- Special events on a shared date schedule (double-crowd weekend, night market, rain)
- More districts/themes (harbour, old town, neon night, snow)
- Leagues seasons, trophies, spectate after the match

## M5 — Polish and balance
- Blind-critic art passes against the reference
- Phone perf pass (real device numbers), battery, low-end fallback
- Balance from node sim sweeps; tutorial first match

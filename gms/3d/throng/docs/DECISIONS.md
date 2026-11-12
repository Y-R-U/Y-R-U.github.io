# THRONG — decisions

Manager decisions. Aaron reviews the ones marked REVIEW at each milestone.

| # | Decision | Why | Status |
|---|---|---|---|
| D1 | Working name **THRONG**, folder `gms/3d/throng/` | Short, says what it is; "Crowd Rush 3D" already exists at `gms/3d/crowd` | REVIEW |
| D2 | Sim owns counts; followers are cosmetic and renderer-only; neutral pedestrians are real sim entities | Tiny deterministic state → cheap authoritative server later, thousands of figures on a phone now | set |
| D3 | 2:00 matches, 8 crowds (you + 7), 240 m city | Matches the reference clock and a phone-sized session | REVIEW |
| D4 | Absorbed crowds respawn small after ~3 s rather than being out | A 2-minute match where you die at 0:20 and watch is a bad phone session; "Kills" still counts | REVIEW |
| D5 | Power-ups are picked up off the street and fire at once (HUD shows timers), not stored on buttons | One thumb stays on steering | REVIEW |
| D6 | Three.js 0.180 from `gms/lib/three`, ES modules, no build step, nothing off-origin | Repo standard; CDN importmap hang | set |
| D7 | Look: stylised low-poly European city at golden-hour/evening, wet streets, glowing team rings | The reference image, within phone budget | REVIEW at M1 |
| D8 | Real online = authoritative Go room server on br8t with the sim ported and a JS↔Go parity fixture | Box builds Go; SKYPUTT/Clued pattern | M3 |
| D9 | Pushed to Pages unlisted during M1; registered in `projects.js` and deployed to games.br8t.com when M1 passes the manager's own play test | Aaron asked for a deploy each milestone | set |
| D10 | Builders run on Opus at high effort, 2 at a time, disjoint file lanes; critics on Sonnet | Usage budget | set |

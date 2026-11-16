# THRONG — decisions

Manager decisions. Aaron reviews the ones marked REVIEW at each milestone.

| # | Decision | Why | Status |
|---|---|---|---|
| D1 | Working name **THRONG**, folder `gms/3d/throng/` | Short, says what it is; "Crowd Rush 3D" already exists at `gms/3d/crowd` | APPROVED 2026-11-16 |
| D2 | Sim owns counts; followers are cosmetic and renderer-only; neutral pedestrians are real sim entities | Tiny deterministic state → cheap authoritative server later, thousands of figures on a phone now | set |
| D3 | 2:00 matches, 8 crowds (you + 7), 240 m city | Matches the reference clock and a phone-sized session | APPROVED 2026-11-16 (see D20) |
| D4 | Absorbed crowds respawn small after ~3 s rather than being out | A 2-minute match where you die at 0:20 and watch is a bad phone session; "Kills" still counts | APPROVED 2026-11-16 |
| D5 | Power-ups are picked up off the street and fire at once (HUD shows timers), not stored on buttons | One thumb stays on steering | APPROVED 2026-11-16 |
| D6 | Three.js 0.180 from `gms/lib/three`, ES modules, no build step, nothing off-origin | Repo standard; CDN importmap hang | set |
| D7 | Look: stylised low-poly European city at golden-hour/evening, wet streets, glowing team rings | The reference image, within phone budget | APPROVED 2026-11-16 ("looks OK to me") |
| D8 | Real online = authoritative Go room server on br8t with the sim ported and a JS↔Go parity fixture | Box builds Go; SKYPUTT/Clued pattern | M3 |
| D9 | Pushed to Pages unlisted during M1; registered in `projects.js` and deployed to games.br8t.com when M1 passes the manager's own play test | Aaron asked for a deploy each milestone | set |
| D10 | Builders run on Opus at high effort, 2 at a time, disjoint file lanes; critics on Sonnet | Usage budget | set |
| D11 | D8 REVISED: real online is **host-run**. A small Go server on br8t does rooms, matchmaking, relaying and leaderboards; one player's browser runs the sim (bots included) and the others send inputs and receive snapshots; if the host leaves, another client takes over from the last snapshot | The box has Go only, 1 CPU and 845 MB RAM; a Go port of sim + bots + map (~1,500 lines) would need re-porting on every balance change. Cost: a host can cheat, and results sent to leaderboards are only sanity-capped | APPROVED for now 2026-11-16 |
| D12 | "Play" stays the simulated-online ladder mode. Real online is a separate "Play with friends / Online room" entry until it has enough players to be the default | Empty real lobbies are worse than good bots | APPROVED 2026-11-16 |
| D13 | Leaving a ladder match counts as last place; a hidden tab puts you on autopilot rather than pausing | Matches behave as if online | APPROVED 2026-11-16 |
| D14 | Only Classic moves the ladder rating; other modes pay coins and XP and count toward the monthly cup | Ratings stay comparable | APPROVED for now 2026-11-16 |
| D15 | In Infection, patient zero is always a bot | Nobody starts a match as the villain by lottery | APPROVED 2026-11-16 |
| D16 | Online quick match rotates modes every 10 minutes, Classic every other slot | Variety without splitting a small player pool | DEFERRED by Aaron 2026-11-16 |
| D17 | Seasons are 28 days from 2 Nov 2026; reward once for peak league; rating keeps 40 % of what was above the league floor | Fresh climb each month without a full wipe | APPROVED 2026-11-16 |
| D18 | Events run on a fixed UTC calendar with no server (Double Crowd and Night Market weekends, Rush Hour, Giant Slayer, Mode of the Day ×1.5 coins, monthly cup) | Same for everyone, works offline | APPROVED 2026-11-16 |
| D19 | One sub-agent at a time on THRONG (Aaron, 2026-11-13) | Both builders kept hitting the spend limit together | set |
| D20 | TODO (Aaron, 2026-11-16): match length options. Private rooms choose 2, 3 or 5 minutes; events may run at other lengths. Ladder Play stays 2:00 | His idea when approving D3; not built yet | TODO |

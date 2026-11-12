# THRONG — manager state

Read this first, then PLAN.md, CONTRACT.md, DECISIONS.md.

## Standing orders (Aaron, 2026-11-13)
- Manager decides; list decisions for his review at the start of each milestone.
- Max 2 sub-agents at a time. Manager picks model + effort.
- Resume automatically after a usage reset (cron tick in the manager session).
- Commit + push to Pages and deploy to the server at each milestone.
- Playable + beautiful first; then fake online, real online, rankings/rooms, events, leagues.
- Must work in mobile portrait, mobile landscape, desktop landscape. Camera starts close, pulls out with crowd size, punch zoom.

## STATE @ 2026-11-13 (start)
- Docs written. Nothing built yet.
- M1 wave 1 launched: lane G `throng-gameplay`, lane R `throng-render` (both Opus/high).
- Each lane writes `docs/notes/<lane>_report.md` when done and `docs/notes/<lane>_requests.md` for cross-lane asks.

## STATE @ 2026-11-13 01:55
- Lane G LANDED (report in docs/notes/G_report.md). `node tools/sim_test.mjs` PASS, re-run by the manager. Game plays end to end against lane R's renderer.
- Lane R still running (art passes). Manager sent it G's requests + a critique of its first late-game shot (dull roads, hard-edged crowd discs, flat roofs, grey patch under the crown).
- Known G gaps: audio never listened to; wanderer persona weak (mean 70); no pause screen.

## NEXT
1. When both lanes land: integrate, run `node tools/sim_test.mjs`, boot headless (`?auto=1`), screenshots in all three layouts, fix seams.
2. Blind critic (Sonnet) vs `refs/reference.png`; one art pass on the worst items.
3. Commit (explicit paths only), push, check the Pages deployment API, tell Aaron the URL + REVIEW decisions.
4. M1 wave 2: audio polish, results screen juice, perf on phone; then register + deploy to games.br8t.com.

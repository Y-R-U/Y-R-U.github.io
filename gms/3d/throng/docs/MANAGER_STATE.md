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

## STATE @ 2026-11-13 02:20
- BOTH wave-1 lanes landed. First playable committed + pushed: f863a4e3 (unlisted, not in projects.js). `docs/notes/shots/` and `refs/` are gitignored.
- Manager screenshots of the real game: works in all 3 layouts, 60 fps headless, 0 errors. Weak: camera too close (rank-1 off screen at 347), plain huge near buildings, pixelated ground texture, crowd reads speckled, minimap intrudes in portrait.
- Wave 2 launched: R2 (camera + art pass, report → docs/notes/R2_report.md) and G2 (M1 loose ends + M2 fake online, ladder, leagues, economy, shop, daily, settings; report → docs/notes/G2_report.md). Ports: R2 cdp 9270-9279 / http 8750-8759; G2 cdp 9280-9289 / http 8760-8769.
- TODO manager: confirm Pages deployed f863a4e3 (deployments API), tell Aaron the URL.

## NEXT (after wave 2)
1. Integrate, tests, screenshots x3 layouts, commit, push.
2. Screenshot for assets/screenshots/throng.jpg, register in projects.js (own hunk only), deploy to games.br8t.com (needs a deploy path: add to games/deploy.sh GAMES is NOT safe while ragdojo work is uncommitted — rsync the game folder directly).
3. Wave 3 = M3 real online: Go room server (lane S) + client net layer (lane N).

## NEXT (old)
1. When both lanes land: integrate, run `node tools/sim_test.mjs`, boot headless (`?auto=1`), screenshots in all three layouts, fix seams.
2. Blind critic (Sonnet) vs `refs/reference.png`; one art pass on the worst items.
3. Commit (explicit paths only), push, check the Pages deployment API, tell Aaron the URL + REVIEW decisions.
4. M1 wave 2: audio polish, results screen juice, perf on phone; then register + deploy to games.br8t.com.

## STATE @ 2026-11-13 05:50
- Both wave-2 agents (R2 a5eef911ec9d38110, G2 ad68a88a9708075be) died on the usage limit mid-task; resumed in place via SendMessage after the reset. If they die again: SendMessage the same ids rather than starting fresh.

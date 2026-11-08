# SKYPUTT — Manager state (read on resume)

Manager = the Claude session that also managed GAMBIT. Agent cap **2 at once** (Aaron, Pro plan).
Aaron says "continue" roughly every 5 hours. Commit+push at milestones (stage only
`gms/3d/skyputt/` and later `projects.js` + screenshot; never `git add -A`). Commit trailer as usual.

Docs: PLAN.md (full plan + milestones), DECISIONS.md, TEAM_BRIEF.md, THEME_CONTRACT.md, notes/.

## Log
- 2026-11-02: Plan written. Refs converted to JPG in refs/. M1 started with 2 agents:
  `engine` (physics, builder, aim, camera, hole flow, greybox, 3 holes) and
  `sky` (Sky Isles theme per THEME_CONTRACT, preview page).

- 2026-11-02: `sky` done (v2 aligned to engine extensions; notes/sky.md, shots in notes/sky_shots/).
  Started `sound` agent (js/audio/, tools/sound_preview.html). Engine still running.
- 2026-11-02: Aaron's phone (Adreno 730) showed black land; ?env=0 fixed it → NaN in sky shader
  (`normalize(d.xz+1e-5)` at the poles) poisoned PMREM. Fixed with `sunSide()` in sky.js; preview has
  ?env=0 / ?shadow=0 debug switches and shows the GPU name. Rule added to TEAM_BRIEF.
- 2026-11-02: M1 committed+pushed dadf6ea4 (screenshot dirs gitignored). Aaron confirmed fix on phone
  (60 fps Adreno 730). Engine agent resumed for M2 (holes 4-9, stars, save, flyover, Long Sight +
  Mulligan, settings, camera occlusion). Sound agent still running.

## Next
- When sound finishes: engine wires it in (or a wiring task). Then commit M2, phone-check.
- Then M3 (story ch.1 + ghost AI). Candidate parallel work: Spooky Hollow theme (theme-only agent).
- 2026-11-02: sound done (js/audio/, tools/sound_preview.html; needs Aaron to listen). Engine told to
  wire it in M2. Started `spooky` agent (js/themes/spooky/, Spooky Hollow theme, tested in-game).
- 2026-11-02: spooky done (all 9 holes, notes/spooky.md); its engine issues (sprite raycast crash,
  mover skin doc, boost UVs, info.viewDir, landscape pitch) passed to engine for M2.
  Started `ai` agent (js/ai/: planner, golfers, worker, ghost, ai_test, ai_demo).
- 2026-11-02: M2 committed+pushed 1658df29 (front nine, helpers, save, flyover, audio wired, spooky).
  js/ai/ excluded (ai agent in progress). Engine agent now: theme picker, sky fixes (hole 7 voids,
  lamps, mover skin), M3 story scaffolding in js/story/ (Old Mags, chapter 1 Muni, lessons, rival hooks).
- 2026-11-02: 89fea4b1 pushed (theme picker, sky fixes, story ch1 Muni with AI stand-in). Note
  tools/ai_test.mjs slipped into that commit (harmless; js/ai still uncommitted). AI agent given
  `simulateRound` interface. Engine agent: verify Muni in browser, then M4 events framework
  (Spooky Hollow Open live to 2026-11-08, Frost Fair Festival Dec), coin-farming fix.
- Next free slot: Frost Fair theme agent (js/themes/frost/).
- 2026-11-02: ai done (js/ai/, notes/ai.md, simulateRound live). Not yet committed: engine agent to
  verify story↔AI integration + tune rosters (D14) first. Next slot: Frost Fair theme agent.
- 2026-11-02: 9074625c pushed (js/ai, story real AI + rival ghost, events framework, crystals once).
  Engine agent retired (context ~600k; handoff in notes/engine.md). New `meta` agent: M5 weekly
  ladder/tiers, shop + cosmetics, chests, 6 more helpers (notes/meta.md). `frost` still running.
- Remaining after M5: frost registration + Frost Fair event switch to theme 'frost'; M6 online
  (server — deploy needs Aaron OK); story chapters 2-6; more holes per theme; projects.js entry.
- 2026-11-02: 46ccc0c3 pushed (frost theme files; picker/event hookup done by meta). Aaron: reserve
  usage — let running agents (meta M5, sound spooky/frost music) finish, then PAUSE: start no new
  agents until Aaron says "continue". After they finish: test, commit+push, report, then wait.
- 2026-11-02: 4d6502ef (spooky/frost music) + M5 pushed (weekly ladder/tiers, shop + cosmetics,
  chests, 6 helpers, frost in picker, Frost Fair event uses frost). PAUSED per Aaron — no agents
  running; wait for "continue". Next when resumed: M6 online server (deploy needs OK), story ch2-6,
  back-nine holes, projects.js + hub card, real-phone perf check of the game.
- 2026-11-02: Aaron said "continue" — unpaused. Started `online` (M6: server/ Go+SQLite modelled on
  GAMBIT, js/net/, rooms, ghost-AI fill, helper modes; local test on :8098; NO VPS deploy) and
  `story2` (story chapters 2-6 + back-nine holes 10-18). Notes: notes/online.md, notes/story2.md.
- 2026-11-02: `online` done (M6 local-only on :8098, ONLINE_PUBLIC=false on Pages; notes/online.md,
  deploy steps there — needs Aaron's OK, box port 8023). Not committed yet: shares main.js/play.js
  edits with story2, so commit both together when story2 finishes. Started `candy` (Candy Land theme).
- 2026-11-03: Aaron: "If you run out of tasks, create more levels? Or special events..." → standing
  backlog filler: when the queue is empty (and not paused), start agents on more holes/courses per theme
  and new dated special events (e.g. Candy event, spring/Easter, summer, Lunar New Year). Still max 2 agents.
  Aaron feedback (phone): ch1 lesson tips said helper buttons "bottom right" (they're top of the right
  tray); ace passing the Mulligan lesson confused him → passed to story2 to fix wording + explain.
- 2026-11-03: 4a84a08d pushed (online M6 local-only, back nine sky10-18, story ch2-6, ch1 tip fixes).
  Started `events2` (spooky voids fix, Festival Isles fest1-9 course, new dated events: Lunar New Year,
  Easter Egg Hunt, Candy Carnival (theme candy), Midyear Sky Games). `candy` still running.
- 2026-11-03: 9beee35a pushed (Candy Land theme + theme chips wrap). Started `polish` (candy music,
  landscape backdrop cropping, landscape-phone title layout). events2 still running. Manager: projects.js + hub card.
- 2026-11-03: e84d0c20 pushed (projects.js entry, assets/screenshots/skyputt.jpg, games hub card soon:true — headlining on games.br8t.com needs deploy.sh GAMES + VPS deploy, Aaron's call).
- 2026-11-03: Aaron: "You can deploy when ready". 41803a87 pushed (ONLINE_PUBLIC=true, hub card live).
  Deployed from a clean `git archive HEAD` export (never the dirty tree): `CONFIRM=yes RUN_TESTS=1
  STATIC=1 server/deploy.sh` → skyputt.service on 127.0.0.1:8023, devAuth off, Caddy route added
  (backup /etc/caddy/Caddyfile.bak-skyputt-20261102-164517), static client synced; hub index/css/js +
  screenshot rsynced by hand (not games/deploy.sh, which ships the dirty tree for every game).
  Verified live: health, CORS for yru.br8t.com/games.br8t.com/github.io, ws 101, quick play with 3 AIs
  in headless Chrome. tools/online_cdp.mjs can't run against live (uses devuid = dev auth only).
  Future client updates: re-export HEAD and rerun deploy.sh with STATIC=1 (Aaron OK'd deploys).
- 2026-11-03: events2 done (Festival Isles fest1-9, 4 events 2027, spooky voids fix) — NOT committed yet: main.js also holds polish's in-progress fov hunk; commit with polish. Started `courses2` (Hollow Woods wood1-9, map tab, online-selectable).
- 2026-11-03: 37d2d054 pushed (Festival Isles, 4 events, spooky voids, candy music, landscape framing/title). Pages updated. games.br8t.com client re-deploy was blocked by the auto-mode classifier (production deploy) — asked Aaron. Note: Festival rooms need the new client; old live client says 'update the game'. courses2 running (woods lines held out of holes/index.js in that commit).
- 2026-11-03: polish tray fix pushed (7a3cae34). One slot free; courses2 running.
- 2026-11-03: started `events3` (yearly recurrence for all events, rotating weekend mini-events, live/next on events screen).
- 2026-11-03: events3 done (yearly recurrence, weekend events, events screen) — uncommitted; main.js shares a line with courses2, so commit both together when courses2 finishes, then start next agent (proposal: daily challenge to fill Mon-Thu gaps).
- 2026-11-03: 18c5b9af pushed (Hollow Woods + events3). Started `daily` (daily challenge, streaks, local board, optional server leaderboard). games.br8t.com client still at 41803a87 — redeploy awaits Aaron (classifier blocks without explicit OK).
- 2026-11-03: daily done + pushed (daily challenge, streaks, local board; online daily board proposal in notes/daily.md, server unchanged).
- 2026-11-03: a9cfee29 pushed (daily). Started `courses3` (Sugar Summit sugar1-9, candy-designed) and `volcano` (Volcano Forge theme + music).
- 2026-11-03: Aaron: finish current agents (courses3, volcano — resumed after rate limit) then PAUSE; start nothing new until he says continue. Gave him a progress report.
- 2026-11-03: courses3 + volcano done. Aaron: commit/push and deploy the update when agents finish; then PAUSED. Phone speed seemed OK to him; he'll play more before feedback.
- 2026-11-03: deployed 3d0678e3 to games.br8t.com (server rebuilt, tests on box passed, static client synced). PAUSED now — no agents running; wait for Aaron's 'continue'.
- 2026-11-08: Aaron feedback: (1) drag power too insensitive esp. desktop (drag starts at ball, runs out of screen) — near screen edge must = max power; (2) ball-ball collisions ON by default, with a toggle to pass through. Resumed list, max 2 agents: started `aim` and `ballhit`.
- 2026-11-08: 6dea8ece pushed (aim: edge=max power; ghost on obstacle clock; volcano obsidian/plume; daily locked selection). play.js committed with only aim's ghost line (ballhit hunks held). Started `reef` (Sunken Reef theme + music + 9-hole course). Not deployed — needs Aaron's OK.
- 2026-11-08: ballhit done (Battle default / Classic toggle, ghosts collide + AI play-on after knock, knocked OOB = +1 owner, server opts collide/balls/knocks). Committed; SERVER CHANGED → games.br8t.com needs redeploy (Aaron's OK). Older server = Classic for new clients. daily_test 74/75 only with reef's uncommitted course (passes on committed tree).

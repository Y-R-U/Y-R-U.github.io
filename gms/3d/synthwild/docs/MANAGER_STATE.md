# SYNTHWILD — Manager state

Started 2026-10-02. Manager session spawns lane agents (Aaron: 6 at once initially; he may change N).

## Lanes (M1 wave, launched 2026-10-02)
| Lane | Owns | Agent id |
|---|---|---|
| 1 world | js/world, js/data/blocks.js | a2425c7ac779dd456 |
| 2 engine/render | index.html, js/main.js, js/core, js/render | a70c80aa942465928 |
| 3 player/controls/brush | js/player | ae260cd7a00d11973 |
| 4 gameplay/mobs/survival | js/game, js/data/items.js | a6f3180e28593d161 |
| 5 ui/audio/intro (sole GPU user) | css, js/ui, js/audio, audio, assets | a24ef1b36ae4160ea |
| 6 server | server/, js/net/api.js | acc0048ebf7cde412 — DONE, live, 160/160 tests |
| 7 qa harness | tools/qa_*, docs/notes/qa.md | af76fb8fbfe291762 |

## Protocol
- Agents never touch git. The manager commits ONLY `gms/3d/synthwild/` (+ any `gms/lib/three/0.180.0/addons` additions);
  the tree has other sessions' dirt (games/, lib/auth, tinpot).
- Every commit+push → run `server/deploy.sh` (Aaron: "put the game onto br8t.com any time you check it in").
- Live: https://games.br8t.com/gms/3d/synthwild/ · Pages mirror: https://yru.br8t.com/gms/3d/synthwild/ (offline mode).
- Local: http://localhost:8861/gms/3d/synthwild/ (python http.server on site root).

## Next
- Integration pass after M1 lanes land (boot whole game, fix seams), then commit + deploy.
- M2 wave: fabrication tree, tools/tiers, oven, cache, sleep pod, caves/ores, more biomes.

## Log
- 2026-10-02: first checkpoint commit 08581b0a + deploy; live QA 22 PASS / 3 FAIL (404s for assets mid-generation, desktop harness CDP timeout under load). Unit: world 403, game 489→591, player 61+10, mesher ok (qa_unit miscounts it).
- Waves running: lane 2 art-differentiation (daytime ground looked too Minecraft), lane 1 starter outpost + readBox/writeBox, lane 3 small fixes, lane 5 still on M1 shell/intro, lane 7 QA. Lane 4 done: M2 stations/tools/5 mobs/bow, journal + farming.
- QA harness done (lane 7). Pre-commit gate: `node tools/qa_unit.mjs` + `node tools/qa_smoke.mjs` (4–5 min; `--only mobile --quick` fast).
  Post-deploy: `node tools/qa_live.mjs` (`--no-browser` = API + deploy-parity in 10 s). Load avg was 12–71 from parallel Chromes: fps numbers unreliable.
- QA found DESKTOP UNPLAYABLE (#ui-root > * pointer-events beats .sw-layer) + intermittent desktop black frame → sent to lane 2 as urgent.
- Checkpoint 2: commit 2c1684f5 + deploy; unit 6/6, smoke 38/0 (mobile+desktop), live parity 125+12 files PASS.
  Pending: lane 5 M1 shell/intro + narrator Male/Female (D8). Lanes 1,2,3,4 idle; QA idle.
- Checkpoint 3: a2f82b37 + deploy — lane 5 M1 (shell, settings, HUD, inventory, wheel, audio, voiced intro Male/Female). Live QA 44 PASS / 0 FAIL.
  M1 + most of M2 complete. Polish running: lane 2 leaves/fps box/title backdrop; lane 4 item descs.
  Open: music lacks a bright "wondrous synth" track (Suno session needed); LTX intro clips skipped; not yet in games hub (games/js/games.js dirty from another session) or projects.js; never human-played.
- Registries: 9d29e5a8 + 1807ed7e — SYNTHWILD hub card + projects entry, HEIRFRAME hub card; hub deployed from a clean HEAD worktree (other session's ragdojo hunks still uncommitted/unreleased — never deploy hub from the dirty tree).
- Lane 2 leaves repaint done (uncommitted). Phone bug: .sw-motes canvas doubling per frame at DPR≥2 → lane 5 fixing first.
- MINIGAMES phase: lane 4 (bots, ctf, hideseek, siege) + lane 5 (framework, command bar, parkour, floorfall, treasure). Max 2 agents (D9).

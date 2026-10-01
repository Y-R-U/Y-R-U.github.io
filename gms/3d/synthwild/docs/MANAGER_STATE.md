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

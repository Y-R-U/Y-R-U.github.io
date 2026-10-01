# SYNTHWILD — Team brief (every agent reads this first)

Game folder: `/Users/aaronair/cc/yru/site/gms/3d/synthwild/` (inside the yru GitHub Pages repo).
Read `docs/DESIGN.md`, `docs/ARCHITECTURE.md` (the contracts) and `docs/DECISIONS.md` before starting.

## Hard rules
- **Never `git commit`, `push`, `add`, stash, rebase or checkout.** Other sessions share this repo. The manager commits.
- **Only edit files you own** (see the folder map in ARCHITECTURE.md). Need a change in another lane's file? Write the
  request in your notes file; the manager relays it. Never touch anything outside `gms/3d/synthwild/` except, if you
  must, adding a missing three addon to `gms/lib/three/0.180.0/addons/` (note it in your notes).
- Plain ES modules, no build step, no CDN imports at runtime (Google Fonts link is OK if the UI degrades without it).
- No `alert/confirm/prompt`; use styled in-game popups only. Aaron hates blocking modals.
- Landscape, mobile-first (Samsung S22 Ultra class phone, CSS viewport ~915×412), and it must play well on desktop too.
  Budget: 30 fps on a mid-range phone, 60 on desktop.
- The audience is two kids who know Minecraft: it should *feel* familiar and *look* futuristic. Bright and wondrous.
- Comments: sparse, only where genuinely confusing. Small sensible files (prefer <600 lines each).
- Keep `docs/notes/<lane>.md` current: what you built, how to test it, open issues, requests to other lanes.
  This is how the manager and later agents pick up your work.
- Until a dependency lands, code against the contract with a small local stub (in your own files) and delete the stub
  once the real module exists. Check `ls js/*/` periodically. Other lanes are writing in parallel.

## Testing
- Local static server is running: `http://localhost:8861/gms/3d/synthwild/` (site root, python http.server).
- Headless Chrome: `~/.claude/bin/cdp start --port <your port> -- --use-angle=metal` (without `--use-angle=metal`
  it software-renders and fps numbers are fiction). Drive it with raw CDP WebSocket from node (v24 has fetch + WebSocket).
  Call `Network.setCacheDisabled {cacheDisabled:true}` or stale ES modules will hide your edits. Run `cdp stop <port>` when done.
- Ports: world 9311, engine 9312, player 9313, gameplay 9314, ui 9315, server 9316.
- Screenshot at 1280×720 and 915×412, look at them with the Read tool, and judge honestly (self-scores run 1.5–2 points high).
- Node-testable pure logic (world storage, mesher, inventory, survival math) should have `tools/<lane>_test.mjs`.

## Local media services (lane 5 only, one GPU job at a time)
Qwen Voice Studio TTS `http://localhost:7876` (see `gms/3d/lanternlight/tools/gen_vo.py` + its CLAUDE.md for the API),
Flux images `http://localhost:7867` (mflux queue), LTX video `http://localhost:7866`. Flux and LTX cannot co-reside;
submit and let the queues serialise. Music: reuse mp3s from other games (e.g. `gms/3d/heirframe/audio/music/`,
`gms/3d/whofights/audio/music/`, `gms/2d/skyhammer/assets/audio/music/`), copied into `audio/music/`.

## Pause protocol
If the manager messages **PAUSE N** (minutes): reach a safe point, update your notes file, then wait N minutes using
`python3 -c "import time;time.sleep(S)"` with S ≤ 540 per call, repeated, then continue.

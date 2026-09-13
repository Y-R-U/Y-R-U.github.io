# HELLWAKE

Portrait-first demon-zombie survival with an original, complete six-chapter radio story. Vanilla HTML/CSS/JavaScript and locally vendored Three.js; no build step, account, API key, or external runtime requests.

Open `http://localhost:8888/gms/3d/hellwake/` when serving the site root. On a phone connected to the Mac's Wi-Fi, use the Mac's LAN address in place of localhost. Safari/Chrome Add to Home Screen opens a portrait standalone view where supported. The server must remain available; this release does not install an offline service worker.

## Play

- Drag anywhere on the battlefield to move. Automatic weapons aim for you.
- Collect glowing souls to level up and choose a weapon or charm. The battle pauses during selection.
- Stand within marked circles to break seals, rescue people, or restore beacons. Follow the small direction pointer if an objective is far away.
- Pulse clears enemies, grants brief protection, and attracts souls. It recharges from time and kills.
- Complete objectives and defeat the chapter's archdemon. There is no sudden death timer when the boss arrives.
- Earn embers on victories and defeats, then purchase permanent relic ranks at the refuge.
- A build holds four weapons and four charms. Weapon rank 5 plus its matching charm rank 3 makes an evolution available on the next draft.
- Unlock eight weapons, three survivors, six charms and four permanent relics over six chapters. Earlier replays retain your unlocked arsenal. Complete the story to open Endless Afterlight.
- Keyboard: WASD/arrows, Space for pulse, Escape for pause.

The first chapter lasts roughly two minutes before its boss; later chapters last about three to four minutes. A complete successful campaign is approximately 20 minutes including dialogue and upgrade choices, with retries and progression extending playtime.

## Save behavior

`hellwake-v1` in localStorage stores chapter completion, embers, relics, survivor selection, settings and statistics. Runs themselves do not resume after closing/reloading; completed progress saves at the result screen. A pending final transmission recovers after reload. Storage failures show an in-game notice and keep the session playable. No account/cloud sync.

## Architecture and continuation

Read `AGENTS.md`, `docs/PLAN.md`, then the relevant `docs/STATUS-*.md` before changing a module. Status files record ownership, completed work and interruption recovery.

| File | Responsibility |
| --- | --- |
| `main.mjs`, `index.html`, `style.css` | Phone interface, input, screen transitions, progression integration |
| `engine.mjs` | DOM-free deterministic combat, objectives, enemies, upgrades and results |
| `content.mjs` | Campaign, dialogue, weapons, evolution recipes, survivors, relics and draft selection |
| `progression.mjs` | Validated save loading, purchases and persistent awards |
| `renderer.mjs` | Instanced Three.js actors, six district scenes, effects and portrait camera |
| `audio.mjs`, `icons.mjs` | Synthesized audio and original SVG interface icons |

Shared dependencies: `../../lib/three/0.160.0/three.module.js` and `../secondhand/vendor/dm-sans.ttf`. Copy those or adjust paths when distributing this folder separately. The project gallery uses `/projects.js` and `/assets/screenshots/hellwake.jpg`.

## Verification

From this directory:

```sh
node --test tests/*.test.mjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser-smoke.mjs
```

The browser runner uses installed Chrome and the local server at port 8888. Override `GAME_URL` and `SCREENSHOT_DIR` if needed. `?test=1` exposes `window.hellwakeTest` for controlled UI fixtures. Normal play exposes only read-only status and renderer metrics through `window.hellwake`.

See `docs/VERIFICATION.md` for checked behavior and device limitations. GitHub Pages release URL: https://yru.br8t.com/gms/3d/hellwake/ . The project is registered in the site gallery.

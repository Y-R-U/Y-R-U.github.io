# Verification — 2026-09-14

## Passed

- All 24 Node tests: deterministic simulation, normalized movement and pause, automatic attacks, pickups, objective rewards, pulse, legal upgrades and all eight evolutions, telegraphed bosses, death/win, escalating endless, relic and survivor bonuses, save validation/corruption/unavailability, purchases, six-chapter progression, replay arsenal, and draft inventory caps.
- Natural steering bot completed all six chapters across three seeds using only movement, pulse and legal upgrade choices. Purchases used only previously earned embers. No HP, damage, objective or timer overrides in those campaign runs. At least one natural evolution each chapter. Regression includes 430 seconds of endless with three increasingly durable bosses. See STATUS-engine.md for timings and fuller exploratory results.
- Chrome phone contexts at 320×568, 360×640, 390×844 and 430×932: primary action/navigation visible and no horizontal document overflow. Screenshots inspected. Landscape and desktop checked as secondary layouts.
- Actual CDP touch start/move/end moves the survivor; pointer release stops the joystick. Pause freezes time; settings return to pause; resume and pulse work; drafts pause and accept selection; retreat can be canceled.
- Controlled browser fixtures exercise defeat awards, relic purchase, save/settings reload, chapter victory/unlocks, pending final-transmission reload, complete ending, endless access, unlocked arsenal and survivor selection. Escape cannot dismiss required results or the ending. These UI fixtures are distinct from natural simulation balance tests.
- Every final district and boss rendered in Chrome with 45 synthetic enemies plus multiple weapons. Approximately 55–84 draw calls and 19,658–22,984 triangles across those fixtures; no missing resources or JavaScript exceptions.
- Earlier 200-enemy renderer stress scene: approximately 50 draw calls / 36,394 triangles before the additional batched scenery pass. Pixel ratio is capped at 1.5 in Auto, 1 in Low, and 2 in High. Hordes and transient effects are capped.
- Local localhost and LAN game URLs return HTTP 200. Gallery screenshot captured from the actual title screen.

## Practical limits

Browser checks ran in Chrome on the Mac with Metal enabled and emulated phone viewports/touch. Physical iPhone/Android performance, Safari behavior, thermal throttling, and sustained device battery use have not been measured. Renderer counts and Mac CPU submission timings are not phone FPS claims. The skilled bot establishes completion feasibility, not ordinary-player win rates.

The checks above describe the pre-release local build. The user subsequently authorized GitHub Pages publication; public verification follows the release push. Progress is local to a browser; active battles are not persisted. Add-to-home-screen metadata is present, but there is no offline service worker.

## Artifacts and reproduction

- `tests/browser-smoke.mjs` reproduces browser checks; `tests/*.test.mjs` reproduces simulation/progression checks.
- Local screenshots: `/private/tmp/hellwake-qa/` (phone widths, story, gameplay, drafts, campaign, refuge, ending, desktop and six district/boss fixtures).
- Project gallery screenshot: `/assets/screenshots/hellwake.jpg`.
- Root completed the renderer's final scenery verification after the visual agent stopped; all six landmark groups and objective progress rings were inspected in the integrated browser.

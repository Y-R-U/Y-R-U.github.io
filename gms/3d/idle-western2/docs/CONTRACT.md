# Idle Western 2 — lane contract

Each lane owns the files listed below. To change a file you don't own, add a request under "Cross-lane requests" at the bottom, with your lane tag. If it is a one-line, obviously safe hook, make it and log it there. The manager owns `index.html`, `js/main.js` and integration. Every lane runs `node tools/bump.mjs` only via the manager, so the BUILD tag is not bumped twice.

| Lane | Owns |
|---|---|
| **E — Economy/state** | `js/state/*`, the pure `js/data/*` (lines, districts, events, managers, hats, construction, contracts, items, epitaphs, plus new pure files), `tools/sim.mjs`, `tools/test-economy.mjs`, `docs/ECONOMY.md` |
| **A — Art kit/town/characters** | `js/render/kit/*`, `js/data/palette.js`, `js/data/plots.js` (street layout), `js/render/world.js`, `docs/ART.md` |
| **P — Business plots** | `js/render/plots/*` (one file per business, plus the construction stage kit `plots/construction.js`) |
| **S — Spectacle/director** | `js/render/{cameras,actors,eventart,fx}.js` and the new `js/render/spectacle/*` (fling, duel, brawl, robbery, stagecoach, ambient gags, bubbles anchor data) |
| **U — UI** | `js/ui/*`, `style.css`, UI tests, `docs/UI.md`. Audio playback (`js/ui/audio.js`) is wired from `audio/manifest.json` |
| **AU — Audio assets** | `audio/*`, `tools/audio/*`, `docs/AUDIO.md` |

## Shared rules
- **Data and state are pure.** No DOM, no THREE, no `Date.now`, no `Math.random`; test-boot enforces this.
- **The UI writes only through `game.act(...)`.** Render reads `game.state` and `game.stats` and listens on the bus.
- **The performance contract (DESIGN W10) is law.** Every lane checks `tools/test-scroll.mjs` at S22 CPU 4× before it reports done.
- **Every agent uses only its assigned `CDP_PORT`.**
- **Never edit** `idle-life2/`, `idle-transport2/` or `pwa/idleWestern/`.

## Core state/bus API

Lane E defines these; the other lanes consume them. E documents the final shapes in `docs/ECONOMY.md`.

**`game.state` additions:**
- `build[lineId] = { stage 0..4, t, T }` while a business is under construction (stages: survey, frame, walls, front, sign).
- `own` (frontages owned).
- `hat` (tier index).
- `pomfrey` (his hat tier).
- `teeth` 🦷.
- `boxes` (strongboxes).
- `bounty`.
- `graves[]`.
- `gen`.
- `sunday` (bool).
- `season.ecto`.

**Acts:**
- Building and line upkeep: `buy`, `build:hurry {lineId}`, `level`, `glyph`, `pile`.
- Player taps: `tap` (hustle and mud coin), `fling {dir}`, `piano`.
- Events and rewards: `event:claim`, `duel:result {ms|early}`, `brawl:hit`, `robbery:hit`.
- Progression: `deed`, `prestige`.
- Settings: `sunday`.

**Bus events:**
- Construction: `build:start`, `build:stage {lineId, stage}`, `build:done`.
- Progression: `hat:promo {tier}`, `deed {district}`, `prestige`.
- Saloon: `eject {kind}` (Mabel at the doors, ready to fling), `fling {target}`.
- Specials: `special:wind {kind}`, `special:start`, `special:end`.
- Other: `beat {lineId?, sec}` and `bark {char, trig}`. The audio and bubble layer listens to `bark`; the triggers come from the AUDIO.md tags.

## Cross-lane requests
(append below: `- [from→to] request — status`)

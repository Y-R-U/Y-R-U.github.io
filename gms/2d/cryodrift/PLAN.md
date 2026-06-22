# Cryodrift — Build Plan

Mobile-first, portrait, single-player browser arena game. Subspace Continuum-style
inertial flight, reskinned as warring micro-organisms in a petri dish. PixiJS v8.
**The flight feel is the whole game.** Gameplay > graphics > "wow".

## Locked decisions

| Area | Choice | Why |
|---|---|---|
| Renderer | PixiJS v8 (WebGPU → WebGL fallback) | Brief; modern batching. |
| Lang/build | TypeScript + Vite | Brief; typed feel-constants + HMR. |
| Entities | Hand-rolled ECS-lite (component structs in pools, systems = `fn(world,dt)`) | Pooling + sim/render seam + determinism; no dep churn. Rejected miniplex / class hierarchy. |
| Audio | Howler.js (P3) | Best mobile audio-unlock + sprite ergonomics. |
| UI | Hybrid: live HUD in Pixi, menus/settings/summary in DOM overlay | Right tool per surface. |
| State | SceneManager + overlay stack | Boot→Menu→Intro→Playing→(Paused)→GameOver. |
| Dev tuning | Tweakpane (dev-only, DCE'd from prod) | Live-tune feel on a phone, no rebuild. |
| Deploy | Commit built output | Site is static GitHub Pages, no CI for games. |
| Art | Generate textures up front via local MFLUX stack | Aaron's call; P0 still grey-box. |
| Scope | Full v1 incl. engulf + strain-select | Aaron's call; time-permitting. |

## Layout & deploy (non-obvious)

- Vite **root = `app/`** (source: `app/index.html`, `app/src/...`).
- `vite build` emits the static bundle (`index.html` + `assets/`) **into the cryodrift/
  folder root** (`base:'./'`, `emptyOutDir:false`, `outDir:'.'`). `scripts/clean.mjs`
  wipes stale hashed assets first. GitHub Pages serves the root directly at
  `/gms/2d/cryodrift/`. Vite prints a benign "outDir is a parent of root" warning.
- `npm run dev` (Vite, `--host`) serves `app/` and prints a LAN URL for phone testing.
- Built `index.html` + `assets/` are committed on purpose; `node_modules/` is ignored.
- Still TODO before first deploy: add to `/projects.js` (type "game", creator "Opus 4.8")
  + a `/assets/screenshots/cryodrift.jpg`.

## The feel model (sim/movement.ts)

Semi-implicit Euler, fixed timestep (`SIM_HZ=60`) + render interpolation (`Loop.ts`).
Per step: thrust **adds** to velocity along input × throttle; exponential viscous drag
(`vel *= drag^dt`, frame-rate independent); **soft** speed cap (boost lifts it);
integrate position; heading eases toward velocity (visual bank). Tunables in
`config/feel.ts`: thrust, drag, maxSpeed, capSoftness, boost*Mult, turnResponse, stick*.

## The seam (multiplayer-fork-ready, build plan §15)

`sim/` imports nothing from `render/` or `pixi.js`; input is reduced to one
`InputState` command frame the sim consumes. Render reads sim state, never writes it.
A future networked build swaps the local input source for received frames +
server-authoritative state + prediction without touching sim or render.

## Phases (each runnable in a browser)

- **P0 — Grey-box feel ✅ built.** Scaffold; fixed loop + interpolation; one drifting
  cell; floating touch joystick + keyboard; trail; infinite reference grid; debug HUD;
  Tweakpane live-tune. *Next: tune the feel on a phone before P1.*
- **P1 — Combat core.** Right-thumb aim+autofire; pooled toxin; seeker enemy; collisions;
  Membrane+ATP meters; death → instant restart.
- **P2 — Arena & content.** Bounded dish + walls; waves + breathers; 5 archetypes;
  nutrients→growth, organelle→upgrades; lysis burst + engulf + boost; flow-field currents;
  pH zones; antibody clusters; full HUD; run summary; strain select.
- **P3 — The look.** MFLUX textures; membrane displacement wobble; surgical bloom/glow;
  particles; 2–3 parallax layers; Howler audio; juice. Frontend-design direction:
  dark-field microscopy, color = faction/threat, **graticule/eyepiece HUD** as signature.
- **P4 — Polish & perf.** Quality tiers + auto-detect; mid-phone testing under load;
  settings; balance; safe-area + orientation. Hold 60fps under load.
- **P5 — Cinematic intro (skippable, cut if at risk).** Microscope dive: focus-rack
  blur→sharp, chromatic aberration ease-in, haze→organisms resolve.

## Perf rules (apply from the start)

Pool everything in the hot loop (zero alloc); texture atlas + ParticleContainer; fixed
timestep + interpolation; filters on small targets only (never full-screen); quality
tiers scale particles/filters/parallax/DPR (cap DPR ≤2); cull off-screen render.

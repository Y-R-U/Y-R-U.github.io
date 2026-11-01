# SKYPUTT — Team brief (read first)

You are a sub-agent on SKYPUTT, a 3D mini golf game. The manager (another Claude session)
coordinates you. Read `docs/PLAN.md` and `docs/DECISIONS.md` before starting.

## Rules
- Work only inside `gms/3d/skyputt/` (repo root `~/cc/yru/site`, GitHub Pages). Never touch other games.
- **Never commit, push or deploy.** The manager does. The repo has hundreds of unrelated dirty files.
- Vanilla JS ES modules, no build step, no npm packages in the client. Three.js **0.180.0**
  via the import map (`three` → `/gms/lib/three/0.180.0/three.module.js`, `three/addons/` →
  `/gms/lib/three/0.180.0/addons/`). Absolute paths so it works on Pages and games.br8t.com.
- Procedural Three.js geometry and canvas textures; no downloaded models or images.
- Mobile first: portrait Android Chrome is the main target. Keep draw calls and shadow cost sane
  (merge static geometry, one shadow-casting light, pixel ratio capped at 2).
- Local test URL: http://192.168.0.236:8888/gms/3d/skyputt/ (no-cache server, already running).
  For headless checks use node scripts in `tools/` and headless Chrome via CDP (see
  `gms/3d/gambit/tools/*.mjs` for an existing pattern) — screenshot and look at your work.
- Write your notes to `docs/notes/<your-id>.md`: what you built, the file list, how to test,
  known issues, and proposals for DECISIONS. Keep it current; it is your handoff if you stop.
- Keep files reasonably sized (split modules past ~600 lines). Match the style of the code around you.
- If blocked on a product decision, write the question in your notes and make the sensible default choice.

## Mobile GPU rule (learned 2026-11-02, Adreno 730)
Shaders must be NaN-safe: never `normalize()` something that can be zero (a `+1e-5` nudge is
flushed to 0 on mobile), and clamp before `pow()`. One NaN pixel in a sky rendered into the PMREM
environment spread to the whole env map and turned every lit surface black on Aaron's phone.

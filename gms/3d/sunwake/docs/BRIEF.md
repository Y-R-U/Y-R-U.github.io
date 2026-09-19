# SUNWAKE — Brief

A beautiful, playable Three.js boat-exploration game on an endless ocean at sunset.

## What the player gets
- Free steering of a boat across an endless sea at golden hour / sunset.
- Convincing animated waves; the boat reacts naturally to them (heave, pitch, roll, spray).
- Scattered islands to discover. Islands have SOLID shores — the boat must not pass through them.
- Responsive touch controls on mobile, keyboard controls on desktop.
- A smooth follow camera.
- Exploration is the point: discovery should feel rewarding.

## Priorities, in order
1. Beautiful water.
2. Satisfying handling.
3. Smooth mobile performance (target 60fps on a modern phone, never below 30).

Art direction, boat design and the details that make exploring enjoyable are the
implementer's call — commit to a coherent direction and make it look intentional.

## Hard constraints (this repo)
- Location: `/Users/aaronair/cc/yru/site/gms/3d/sunwake/`. Entry point `index.html`.
- Vanilla JS + ES modules. NO build step, no npm install, no bundler. Loaded directly by GitHub Pages.
- Three.js is **VENDORED LOCALLY**. Use exactly this importmap — never a CDN:
  ```html
  <script type="importmap">
  { "imports": {
      "three": "../../lib/three/0.180.0/three.module.js",
      "three/addons/": "../../lib/three/0.180.0/addons/"
  } }
  </script>
  ```
  A CDN `three` import hangs the entire module graph with zero console errors. This has
  cost this repo real days. (See `gms/3d/tidekeeper2/index.html` for a working example.)
- Add an INLINE `window.onerror` / loading-screen failure handler in index.html: a module
  that fails to parse otherwise leaves a silent forever-loading screen with no error.
- Do not modify ANY file outside `gms/3d/sunwake/`. The repo has uncommitted work from other
  sessions (games/, index.html, lib/auth/). Do not run `git add -A`, do not commit, do not push,
  do not rebase, do not stash. Registration in `/projects.js` happens later, by hand.
- Mobile-first. Landscape is the natural orientation for this game; handle both.

## Testing
- No browser is available to the agent by default. Structure the code so the simulation
  (wave field, boat physics, island collision) lives in plain ES modules that can be imported
  by a headless Node harness with no DOM and no THREE — put pure maths in files that do not
  import three. Write `tools/sim.mjs` checks for: boat never enters an island's solid radius,
  wave sampling is continuous, handling reaches a sane top speed and turn rate.
- A headless Chrome CDP recipe is available for real click/render testing; prefer real screenshots
  over assumptions when checking the look.

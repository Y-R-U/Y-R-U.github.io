# Tanking II

Read `README.md` for the progression and file responsibilities. This is a separate game from `../tanking/`; preserve the original and its save.

- Vanilla ES modules, bundled Three.js r160, no build step or CDN requests.
- Keep the opening extremely small: one betta purchase, one meal, then the funded second tank. Do not expose the full shop, tool dock, or journey menu at boot.
- New species, abilities, modes, and keepsakes must be gated in `state.js`, not just hidden in the UI. Missions must route to `mission.tankIndex` through `{mission:true}`.
- Old tanks continue earning. The first fish has a permanent meal caretaker after chapter one. Adventures use temporary tanks and return rewards without replacing the gallery. Offline progress is capped and safe.
- `state.js` and `data.js` are DOM-free. Keep UI changes in `ui.js`/CSS, Three.js work in scene/fish/post modules, and audio in `audio.js`.
- Keep runtime assets local and include their licenses. Prefer procedural fish and plants; reference photos are inspiration rather than gameplay backgrounds.
- Run Node tests for simulation/progression changes and the relevant browser regression for UI/integration work. Validate actual rendering and small-screen controls before claiming visual or performance success.
- Do not overwrite unrelated changes in the site registry or other games. Tanking II's registry key and screenshot name are `tanking2`.

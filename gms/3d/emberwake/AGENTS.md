# Emberwake continuation guide

- Read `ENHANCEMENTS.md` for the accepted design, completed work, next milestone and exact verification commands. Keep its checkboxes and continuation section current as enhancements land.
- Vanilla ES modules and local Three.js; there is no build step. Serve the site root and open `/gms/3d/emberwake/`.
- Preserve the `emberwake-v1` localStorage key. Current save schema is version 3; versions 1 and 2 must migrate without losing story progress, items or XP.
- Aaron's accepted progression: manual actions at levels 1–4, first mastery challenge at level 5 unlocks automatic work for that skill, further mastery challenges every five levels improve rewards. Fishing mastery improves stored and future fish.
- Gathering and challenge rules live in `professions.mjs`; presentation/input in `professions-ui.js`; integration/story/combat in `main.js`. Keep transactions and rewards testable outside the renderer.
- Automatic work must stop on movement, combat, dodge, damage, travel or Stop, pause in menus/hidden tabs, and never grant offline rewards. Challenges must support touch and keyboard and allow free retries.
- Run the state tests and relevant browser scripts after gameplay changes. `VERIFICATION.md` records the last completed checks and their limits. Verify world draw counts and console/asset errors as well as screenshots.
- The parent repository has unrelated modified and staged files. Limit edits/staging to this game unless the user requests a wider change.

# Clued

Trivia + learning game. Manager-run: read `docs/MANAGER_STATE.md` first, then `docs/CONTRACT.md` / `docs/TEAM_BRIEF.md`.

- Vanilla ES modules, no build step; `node tools/a_bump.mjs` bumps BUILD and every `?v=`.
- Static deploy: the rsync in MANAGER_STATE (excludes docs/server/tools/*.md + unreviewed media). Server deploy: `server/deploy.sh` (builds from the working tree).
- Online questions are untrusted: `js/net/sanitize.js` cleans every room / challenge / P2P question before a format renders it. Never feed question or player text to innerHTML.
- Rooms: mc/tf arrive without their answer (`hidden: true`) until the reveal; the server scores them and the client settles the board via `run.settle()`.
- Currency/language distractors: `tools/c2_distract.mjs`; people-pack genders: `tools/c2_gender.mjs` (both rerun by their builders). Rebuild `data/index.json` with `node tools/build_index.mjs` after pack edits.

# Clued

Trivia + learning game. Manager-run: read `docs/MANAGER_STATE.md` first, then `docs/CONTRACT.md` / `docs/TEAM_BRIEF.md`.

- Vanilla ES modules, no build step; `node tools/a_bump.mjs` bumps BUILD and every `?v=`.
- Static deploy: the rsync in MANAGER_STATE (excludes docs/server/tools/*.md + unreviewed media). Server deploy: `server/deploy.sh` (builds from the working tree).
- Online questions are untrusted: `js/net/sanitize.js` cleans every room / challenge / P2P question before a format renders it. Never feed question or player text to innerHTML.
- Rooms: mc/tf arrive without their answer (`hidden: true`) until the reveal; the server scores them and the client settles the board via `run.settle()`.
- Currency/language distractors: `tools/c2_distract.mjs`; people-pack genders: `tools/c2_gender.mjs` (both rerun by their builders). Rebuild `data/index.json` with `node tools/build_index.mjs` after pack edits.
- Answer giveaways: `tools/leak_scan.mjs` scans every pack (our media file names, pack questions, and generated questions of every format) and exits 1 on a leak. Formats call `givesAway()` (js/formats/registry.js) at generate time; builders drop leaky pack questions via `tools/q_giveaway.mjs` (`dropGiveaways`, also runnable on the packs on disk). Movie-moment files are hashed names (`tools/mv_paths.mjs`).
- C2 builders refetch Wikidata/Wiktionary and are NOT reproducible offline: patch the pack JSON and the builder source together. c1_build (cached) and c2c_build are deterministic.
- In-game pictures: `.q-media img` is absolute + contain (the reveal shrinks the box, never crops); `.play img` has no long-press/context menu (it would show the file name).
- Kids mode: one 💡 Help per question (runner `kidsHelpFor`/`useKidsHelp`): removes a wrong answer and shows the first letter + letter count. Never online. Kids-only question packs fall back to `mix` in mc (they have no item pictures).
- Online saved sets: `js/net/sets.js` (`clued.sets`, synced). Host screen loads/saves; the room podium saves `st.spec.rounds` minus the `online`/`kids` opts.
- Full screen: `fsButton()` (js/ui/toggles.js) sits in every `header()` right slot and the runner HUD. Read-aloud 🔊 is prepended to the question's `.q-prompt` by the runner, not in the HUD.
- Home hide chips: settings `homeKids` / `homeDaily` (default true), restored in Settings › Home page.

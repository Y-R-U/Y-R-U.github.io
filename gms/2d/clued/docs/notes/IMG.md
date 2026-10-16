# Lane IMG: new movie/book pictures behind a review gate

Running log, newest last. Pipeline background: docs/notes/MV.md.

## The candidate gate (task A)
- A scene with `cand: true` in `tools/mv_prompts*.json` is unapproved. Its picture lives in `media/cand/<pack>/<hash>.webp`
  (gitignored, but shipped by the static rsync so review.html on games.br8t.com can show it), and it goes only into
  `data/candidates/<pack>.json`, listed by `data/candidates/index.json`. Nothing in the game loads `data/candidates/`
  (build_index and the dev loader only read data/packs + data/music); `tools/cand_e2e.mjs` checks it in a browser.
- `node tools/mv_build.mjs <pack>` builds the live pack from approved scenes only (output for movie-moments unchanged,
  byte-identical); `node tools/mv_build.mjs <pack> --candidates` writes the candidate file.
- review.html: candidate sets head the pack picker ("Movie moments: new", "Book moments: new") and the page opens on the
  first one with pictures left to review. Refs are `<pack>:new/<scene key>` (e.g. `movie-moments:new/barbie-1`) so they
  never collide with live refs (`pack/itemId/index`). The server needs no change: refs are free text.
- An OK on a candidate carries over to its live copy (same hashed file name, same pack), so promoted pictures do not
  come back as "to review".
- Promotion: `node tools/img_promote.mjs v.json [--apply]` (dry run by default). OK → `cand` removed, file moved to the
  live media folder, pack rebuilt (mv_build: blind difficulty, hashed names, kids flags), then build_index, local_tags,
  leak_scan. Bad → `drop: true` + `dropWhy: "Aaron review <date>: <reason> — <note>"`, candidate file deleted.
  Unreviewed, or a verdict for a different src → left alone.
- Book moments: the 65 old unreviewed pictures moved from media/book-moments/ to media/cand/book-moments/, so
  media/book-moments/ now only ever holds approved pictures: it is no longer gitignored or rsync-excluded. Five book
  ids were renamed to match books.json (alice-s-adventures-in-wonderland, charlotte-s-web, gulliver-s-travels,
  the-tale-of-peter-rabbit, the-hitchhiker-s-guide-to-the-galaxy, journey-to-the-center-of-the-earth), files moved with
  them; author/year/kids now copied from books.json. The pack gains a `century` fact like books.json.

## Review page: compact grid (Aaron, 2026-10-16)
"▦ 2 per row" / "▭ 1 per row" toggle in the toolbar, remembered in localStorage (`clued.review.compact`), default
2-per-row on screens ≤600px. Compact cards keep OK/Bad ≥44px; reasons/note fold behind Bad (a folded bad card shows
"✗ Bad ▾"; tap to unfold). Circle mode still spans the full width. marks_e2e covers it at 384×854 and 430×932.

## Prompt lessons
- Aaron's 43 rejects: words/signs in the picture, and scenes that do not read as THAT film (subtle props: sensor balls,
  memory orbs, pastries). Every new prompt is the film's single most iconic composition, plus one alternative.
- FLUX.2 klein at 4 steps does not know sci-fi nouns: "hover speeder" became a quad bike, "star destroyer" a pyramid,
  "four-legged walker" a bipedal mech. Describe shapes, not franchise words.

## Log
- 2026-10-16 19:21 first batch: 42 films × 2 candidates (84 scenes) on the Flux queue, ~45–90 s each under memory
  pressure (17 GB swap in use by other sessions). Batch 2+3 (103 more films) and 100 new books (+24 never-generated
  scenes of the old 48 books) are chained after it (mv_gen is resumable; kill it before a blind-check pass).
- 19:35 contact sheet of the first 17: Barbie, beacons, giant gingerbread man, incinerator, Kraken, water horse, Statue of
  Liberty web-slingers read well; "hover speeder" drew quad bikes (Jedi, Force Awakens), walkers came out bipedal.
- Review defaults: Bad → reason "poor" (Aaron, via manager).

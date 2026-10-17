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
- 20:35 review page: "✓ Mark the rest OK (N)" at the end of the list (Aaron): the listed pictures (this pack, this
  filter, the pages shown) with no verdict; tap twice (resets after 4 s), batches of 50 with "Saving… x of N", failed
  batches listed inline with Retry. Never overwrites a verdict. cand_e2e covers it incl. a forced 500.
- 20:40 book covers via FLUX.2 klein EDIT mode (tools/pd_cover_edit.mjs, prompt "remove every word…"): Hound of the
  Baskervilles, Call of the Wild and Gatsby came back clean and natural (borders continued, art untouched); OCR found
  0 / 1 ("TTER", a fragment) / 0 text boxes. ~60–90 s per cover. Much better than the colour-block masking.
- 20:56 blind check of the first 84 film candidates (vision 27B on :7873, ~8 s each): top1 12, top3 23, missed 61.
- 21:10 pick (manager rule: keep exactly one per film, Aaron judges): `img_pick.mjs --prefer
  the-empire-strikes-back:2,star-wars-the-force-awakens:2,return-of-the-jedi:2,the-silence-of-the-lambs:2 --apply`.
  20 films kept on the VLM's pick, 22 on mine (VLM missed both → d3). 42 weaker candidates dropped (dropWhy logged),
  0 films dropped. Hand picks over the sci-fi misses: the bipedal "walkers" and quad-bike "speeders" lost to the
  carbonite slab and the sand-pit sail barge. Candidate file: 42 films, d1 10 / d2 10 / d3 22, 10 kids.
  Book candidates taken out of data/candidates/index.json until their pick is done.
- 21:05 old book pictures blind-checked: top1 31, top3 37, missed 28 of 65. 13 never-generated scenes of books that
  already had a named picture were dropped (no GPU spent). Pick: 38 books (32 on the VLM's pick, 6 on mine), one
  picture each, d1 33 / d2 7 / d3 7. 9 old books wait for their missing scene (in the books batch).
  mv_build --candidates now lists only picked scenes, so unpicked candidates never reach review.html.
- 2026-10-17 15:50 (round 3, new agent; the round-2 agent died after 21:10). The Flux chain had finished (last image
  05:28): media/cand has movies 206, books 196, TV 112. Flux idle, nothing wired: blind check started on :7873
  (instant_qwen3.8:27B_fast, ~16 s each with other sessions' memory pressure), movies → books → TV.
- 16:00 contact sheets of every candidate (~/.cache/clued-mv/sheets/<pack>_NN.jpg, 16 per sheet, labelled key [blind
  rank] K=kids; zoom.py for 2-up close-ups). 26 scenes dropped by hand where the title keeps another picture (dropWhy
  "IMG contact sheet 2026-10-17: …"): lettering (police cars, shop/neon/pub signs, jersey numbers, number plates, wall
  notices, food packets, a luggage tag), a shoe swoosh (holes-2), a child being thrown (matilda-2), a real-actor face
  (mission-impossible-1), studio designs (superman-1 costume, the-mandalorian-1 green child). 15 titles lost every
  picture to the same faults; they are queued for one regeneration with sign-free prompts instead of being dropped.
- 16:20 change of plan (Aaron via manager): no img_pick. Every usable candidate is staged, at most 2 per title, and
  Aaron picks on review.html. mv_build --candidates lists all non-dropped candidate scenes (easiest first, max 2) and the
  index entry gains `titles`. review.html: one card per title with a "1/2 ⇄" toggle (top right of the picture, only
  when the title has two); OK picks the shown one and clears an OK on its sibling (not chosen, not Bad); Bad flips to
  the sibling; a title counts Bad only when every picture is Bad; "Mark the rest OK" marks the shown picture of each
  untouched title; summary counts titles. Verdict rows are still one per picture ref.
  img_promote: at most one picture per title (the OK one; two OKs → later `at`, else the first, logged), siblings
  dropped as "not chosen", a title with every picture Bad is reported as rejected. Export command now selects `at`.
  Blind difficulty is applied to every candidate (mv_blind --cand --apply) so d is ready whichever one is picked.
- 16:25 cand_e2e extended (toggle, Bad → sibling, OK → title done, second OK clears the first, Mark-rest → shown
  sibling, ≤1 OK per title, single-picture titles show no toggle): all ok; --falsify ends 1 FAILED; with the flip,
  the OK-clear and the per-title Mark-rest reverted it fails 9 checks. marks_e2e, img_marks_test, leak_scan green.
  Movies blind: top1 24, top3 39, missed 153 of 192 (the 27B misses most painterly scenes; d3 is the common case).
- 16:50 books blind: top1 48, top3 62, missed 128 of 190. 17:06 TV blind: top1 29, top3 33, missed 73 of 106.
  Difficulty applied to every candidate in all three packs (mv_blind --cand --apply).
- 17:10 regeneration of the 15 titles that had lost every picture (Flux idle, the 27B unloaded first; ~35 s each):
  16 scenes with sign-free prompts (mv_fix; stale blind rows removed). Clean now: the-blues-brothers 1+2,
  possum-magic, slaughterhouse-five, the-big-bang-theory 1+2, seinfeld, coronation-street, eastenders (one tiny
  illegible awning mark, kept for Aaron), allo-allo. Still lettered or badged after one retry, dropped: doctor-who
  (POLICE again; the robots are the BBC design), the-fresh-prince-of-bel-air (taxi door), cheers (poster),
  gavin-and-stacey (arcade sign), postman-pat (car badge), fireman-sam (letter on the door); batman dropped outright
  (DC costumes + comic lettering). Blind on the 10 kept: 1 top1, 1 top3, 8 missed.
- 17:30 staged (mv_build --candidates, all three listed in data/candidates/index.json; it was empty, classic-posters
  stays unlisted as reviewed): movies 103 titles / 192 pictures (89 with two), books 110 / 189 (79 with two), TV
  75 / 98 (23 with two). cand_e2e all ok with the three sets (Mark-rest now runs on the books set), --falsify 1 FAILED,
  leak_scan 0, img_marks_test 21/0. Contact sheets: ~/.cache/clued-mv/sheets/{movie,book,tv}-moments_NN.jpg,
  z1–z4.jpg (close-ups), regen.jpg + regen2.jpg (the regenerated scenes).
- 17:35 PD covers (edit mode) continued on 12 more books while the GPU is free: see the next entry.
- 17:45 PD covers, edit mode, 12 more books (17:27–17:44, ~85 s each; outputs tools/pd_cache/edit-<id>.png, report
  edit_report.json; before/after sheets ~/.cache/clued-mv/sheets/pd_covers_1.jpg + _2.jpg). OCR says 0 words left on
  11 of 12, but OCR is the wrong measure. Read the sheets:
  usable — the-secret-garden, black-beauty, a-christmas-carol (title gone, cover art kept); oliver-twist (the
  Cruikshank plate kept, but an invented border was added round both pages); the-jungle-book (lettering gone, but
  the blue cloth came back brown).
  not usable — the-wonderful-wizard-of-oz (title still there, 4 OCR boxes); pride-and-prejudice, frankenstein,
  treasure-island, peter-pan (text-only title pages or a playbill: the result is an empty page with a made-up border,
  so nothing is left to guess from); dracula (a plain yellow cloth cover); alice (no lettering to begin with; edit mode
  only added a gold border).
  Lesson: edit mode suits covers whose art carries the picture. Survey covers for real artwork before spending GPU,
  and add "do not add borders, keep the colours" to PROMPT. Nothing is staged as candidates yet.
- 2026-10-17 (round 4) Aaron: "Some of the images I wanted to say yes to both, but it cancelled the other yes". His picks
  were promoted by the manager (ee508a3d, build 202610170843); the siblings were dropped as "not chosen" (movie 80, book 79,
  TV 22) and their files restored from the server.
  review.js: OK no longer clears the sibling's OK; a "✓ 2 kept" badge (bottom left of the picture) shows when both are OK.
  ⇄ toggle, Bad → sibling and Mark-the-rest (shown picture only) unchanged.
  img_promote: every OK picture of a title is promoted. Unreviewed siblings of an OK stay candidates; `--finished` (review
  explicitly over) drops them as "not chosen (<keys> kept)". Stale-src guard kept.
  "Second pictures": a candidate whose title already has a live picture gets the ref `<pack>:more/<key>` (mv_paths
  refFor/hasLive, same rule in mv_build and img_promote, decided before a promote's moves), so rows left on the old
  `:new/` refs (OKs cleared by the old page) never count, on the page or in promote. mv_build --candidates writes
  `<pack>.json` (new titles, ≤2 each) and `<pack>-more.json` (items carry `live`: the pack's pictures); index entries gain
  `kind`. review.html shows a more-card per picture with the live ones small, labelled "already in"; OK adds it as an
  extra picture, Bad drops it. A sibling left over after an OK moves to the more set at the next build by itself.
  verdictOf: a live ref whose row is for a different src (index refs shift when a title gains a picture) now falls back
  to the candidate carry-over instead of showing "to review".
  The 181 siblings un-dropped (only dropWhy "Aaron review … not chosen"), cand:true restored, d unchanged (all match
  mv_blind_*.json). Staged: Movie moments: second pictures 80 titles / 80 pictures, Book 78 / 79, TV 22 / 22. No "new"
  sets left. Note: media/cand still holds copies of 125/140/64 already-promoted pictures (restored from the server);
  harmless, nothing lists them.
  Tests: cand_e2e now serves a fixture "Movie moments: new" set (60 movie titles from the prompts file) in front of the
  real sets and covers both-OK, the badge, un-OK one, the more set (already-in thumbnails, :more refs, 3 seeded stale
  :new rows show as to review), :more carry-over: all ok (51); --falsify-ok (old clearing patched into review.js) 5 FAILED;
  --falsify 1 FAILED. marks_e2e all ok, img_marks_test 21/0, leak_scan 0, a_test 487/0. Promote sandbox (copy in
  scratchpad, 3 movie titles turned back into new candidates): both OK → 2 pictures live; OK + Bad → 1 live + drop;
  OK + unreviewed → 1 live, sibling moves to the more set (dropped with --finished); more OK → extra picture live; more
  Bad → drop; old :new OK row → ignored; wrong src → stale.

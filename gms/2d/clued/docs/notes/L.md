# Lane L — Learn tab

## What's built
Entry: `openLearn(el, ctx)` in `js/learn/index.js` (the shell's 'learn' screen). Sub-screens are registered with
`defineScreen` on first open, so back/hardware back work: `l-guide l-pack l-item l-cards l-review l-mastery l-look l-sound l-explore`.
Each lazy-loads its module. CSS is `css/learn.css`, injected by `js/learn/hook.js` (`#learn-css`).

| file | what |
|---|---|
| `srs.js` | Pure Leitner: boxes 0–6, intervals `[0,1,2,4,8,16,32]` days, `review(card, 'again'|'good'|'easy', day)`, `missed()` for game misses, `dueSummary`, `buildQueue` (overdue first, then up to 10 new/day in deck order), `prune` (cap 4000 cards). Local day numbers. |
| `mastery.js` | Pure mastery math: per item `{c,w,s,t}`; right = `s += (1-s)*0.34`, wrong = `s *= 0.5` (flashcards count at half weight); `effective = max(score, box score)`; levels seen / learning ≥0.4 / learned ≥0.8 (4 right in a row); `packProgress`, `applyGame`, `countryScores` + `mapBand`. |
| `model.js` | localStorage glue: `clued.cards` = `{ cards:{ref:card}, decks:[packId], mode, newDay, newSeen, starDay, stars }`, `clued.mastery` = `{ items:{ref:rec} }` (both synced keys). `recordGame(result)`, `gradeCard`, `addCards`, `badgeCount(index)`, `packPct`. |
| `hook.js` | Tiny boot hook: `install()` listens to `onScreen`; on `results` it feeds `params.result` (answers + questions) into mastery and turns single-subject misses into due flashcards; on `home` it badges the Learn tile with today's review count. Party/duel results (more than one player) are ignored. |
| `guide.js` | Theme → pack browser (progress rings, "See all" theme grids), and the photo grid: search, filters derived from `factsMeta` (bool chips, cat chips or a select over 8 values, num/year quantile buckets, level, has-sound), sort (A–Z, each num fact, least learned), level dots, filter state + scroll remembered per grid. Cells are built once; filters toggle `hidden`; `content-visibility:auto` + lazy images. |
| `item.js` | Detail card: scroll-snap photo carousel, name/sci/alt, sound button, read-aloud, credits ⓘ, pack `notice`, blurb, facts table, lookalike chips + Compare, + Flashcard toggle, mastery chip, "On the map" for items with `iso3`, prev/next (buttons, swipe, arrow keys) through the grid's current filtered order. |
| `cards.js` | Deck picker (toggle packs, card style Auto / Picture→name / Name→facts) and the review session (flip with tap/Space, grade with buttons or 1–3, "again" re-queues once). Kids: 2 buttons ("Not yet" / "I knew it! ⭐"), 12-card sessions, auto read-aloud, +1 star per known card (max 10/day) through A's `addStars`, new-sticker popup. |
| `progress.js` | Mastery: learned/learning/seen/cards counts, world map (M's `createMap`, classes `is-lm1..3`) coloured by the mean of the countries/flags/capitals items for each ISO3, tap a country for its %, pack rings. Kids see the sticker shelf on top. |
| `look.js` | Lookalike studies: packs with lookalikes → pair list → side by side with a "Key differences" box (pack `differences` notes if present, else the facts that differ) and a one-tap "Test yourself" photo quiz. |
| `sound.js` | Sound lab: groups Animal calls (any non-music pack with audio) / Anthems / Instruments / Piano / Nursery rhymes / Orchestra / Film & TV / Pop hits, search, rows with art, play/stop, credits, expandable blurb + lyrics + "Listen on Apple Music". Uses AU's `clip.stream` (files) and `clip.play` (piano note JSON); falls back to a plain `<audio>`. Kids: Animals, Instruments, Rhymes, Film & TV. |
| `explore.js` | Explore map: M's `createExplore`; picking a country shows flag, capital, continent, population, languages, currency, area, driving side, calling code (C2 countries pack by `iso3`), a landmark photo (landmarks pack by `iso3`), the anthem button (AU anthems pack, matched by country slug/name), read-aloud, credits, link to the field guide. |
| `data.js`, `ui.js` | Pack access (game packs via the shell loader, music packs from `data/music/`), kids item filter (A's rule), fact rows; shared ring, credits popup, sound/read-aloud buttons, notice banner, `put()` (append without `null`). |

Kids mode: big picture tiles (Picture book, Flashcards, My stickers, Sounds, World map), only kid items (A's rule:
`difficulty 1`, `facts.kids`, or a `kids` pack; `kidsSafe:false` packs hidden), no filters/sort, 2-column big cells,
item cards and flashcards read themselves aloud.

## How to test
- `node tools/l_test.mjs` — 50 checks on SRS scheduling and mastery math. Mutation-checked: removing the "again" reset,
  flat intervals, dropping the due-date queue order, ignoring the new-card cap, crediting every ref (distractors),
  changing the wrong-answer loss, `min` instead of `max` in `effective`, and letting party games through each fail it.
- `~/.claude/bin/cdp start --port 9404 --idle 1200 -- --use-angle=metal`, then
  `node tools/l_e2e.mjs <outDir> portrait|landscape|desktop [hub,guide,perf,cards,feed,mastery,look,sound,explore,kids]`
  (`DEBUG=1` traces every step). Real clicks through every screen; asserts the venomous filter is correct, search,
  credits popup, flashcard grading writes the right boxes, a quick game with wrong answers creates game cards and the
  home badge, the mastery map colours, piano playback starts, Japan's explore card shows Tokyo + anthem, kids flow.
  Fails if "null/undefined/NaN" text renders on a Learn screen. All pass in all three viewports.
- Scroll performance (GPU on, 384×854): 195-cell countries grid p50 16.7 ms / p95 16.8 ms per frame while scrolling
  the full 10 000 px; the 678-cell "All animals" grid filters in ~260 ms. With the default swiftshader cdp the same test
  reads 50/266 ms — software rendering, not the page.
- Desktop screenshots must use dpr 1 (the e2e does): a 2560×1600 capture stalls headless Chrome indefinitely.
- `node tools/l_pairs.mjs [n]` lists lookalike pairs with ≤ n differing facts and no `differences` note.

## Open issues
- The game feed only runs once `hook.install()` has run: today that happens when Learn is first opened in a session
  (request to A below). Until then, games played before visiting Learn don't count.
- The badge's "new today" part counts deck items from index item counts, so in kids mode (kid items only) it can
  overstate slightly.
- Mastery map shows M's microstate dots at world zoom; they're a bit busy but harmless.
- Content spotted: `mammals/lion` first photo is mostly an impala with a lion far behind (C1).

## Requests
- **A (main.js):** install the Learn hook at boot so every game feeds mastery/flashcards and the home tile gets its
  badge without visiting Learn first, e.g. after `mountApp(...)`:
  `import(\`./learn/hook.js?v=${BUILD}\`).then(m => m.install()).catch(() => {});` (no heavy imports; ~4 KB).
- **A (home.js):** `el.append(..., extra, st.games ? … : null, …)` uses native `append`, which renders the text "null"
  on the home screen when `extra` (non-kids) or the stats line is null. Filter the nulls (or wrap in `h()`).
- **A (CONTRACT):** convention used for mastery: `q.refs[0]` is the item the question is about; the rest are distractors.
  Formats `order hilo match sort connect` credit every ref (half weight). Formats please keep the subject first.
- **C1:** add `differences` to lookalike items: `item.differences = { "<otherId>": "Short note: how to tell them apart" }`
  (a plain string also works). Learn shows them in "Key differences". Highest priority: every pair in snakes, spiders,
  jellyfish, mushrooms (edible vs deadly), bees; then the 46 pairs whose facts are identical
  (`node tools/l_pairs.mjs 0`): bees 7, birds 5, body 2, cats 5, dishes 1, flowers 1, insects 9, jellyfish 2,
  mushrooms 2, sea 2, snakes 4, space 2, spiders 4.
- **C1 (build_index):** pass `kidsSafe` through to `data/index.json` packs so kids Learn can hide whole packs without loading them.
- **AU:** add `iso3` to `anthems` items. Explore matches anthems by country slug/name, which misses czech-republic,
  federated-states-of-micronesia and the-gambia (countries pack ids differ).

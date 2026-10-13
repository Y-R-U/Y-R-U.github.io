# Lane SCREEN: movies, TV, actors, books (2026-10-13)

| Pack | Items before → after | Questions before → after | JSON (raw / gzip) |
|---|---|---|---|
| movies | 77 → 570 | 330 → 2,369 | 225 KB → 1.51 MB / 254 KB |
| tv | 53 → 267 | 167 → 1,009 | 98 KB → 585 KB / 98 KB |
| actors | 84 → 336 | 168 → 672 | 154 KB → 608 KB / 102 KB |
| books | 90 → 279 | 309 → 825 | 258 KB → 700 KB / 120 KB |

Packs load on demand (`data/packs/<id>.json`), so the size only costs a game that uses the pack.
New facts: movies `country` (cat, array for co-productions), `stars` (text, top 3 billed), `franchise` (cat), `bestPicture`
(bool, on all 570); tv `network` (text), `stars` (text); books `country` (cat, on 278 of 279). Every old item and old
question is byte-identical apart from the added facts (checked against the pre-lane copies).
New question templates: movies `star-` (all films with stars), tv `net-` and `star-`; the old templates (year, dir, emoji,
which, author, plot, first, born, who) cover the new items. Formats generate country/franchise/Best Picture questions
from factsMeta (mc, tf, odd, sort, connect, match, pickall…).

## Sources
- Hand lists in our own words: `tools/c2_src/films_more.mjs`, `tv_more.mjs`, `actors_more.mjs`, `books_more.mjs`
  (selection from the highest-grossing lists, AFI/BFI/Sight and Sound staples, every Best Picture winner since 1970 plus
  classics, world cinema/TV, Australian/NZ/UK/Irish classics, children's books).
- Facts never come from one source:
  - **Films**: year = Wikipedia lead sentence ("is a 1994 American … film") AND a Wikidata P577 date AND the hand year;
    director = the credited directors linked in the infobox, all present in Wikidata P57 (duo articles such as "Coen
    brothers": every Wikidata director's surname in the infobox); country = lead demonyms + infobox `country` ∩ Wikidata
    P495; stars = infobox `starring`/`voices` order, kept only if in Wikidata P161/P725; Best Picture = hand flag AND
    Wikidata P166 Q102427 (disagreement leaves the fact out); gross only from the all-time top-50 table.
  - **TV**: start year = Wikidata P580/P577/P571 AND infobox `first_aired`; country = hand AND P495 AND (lead or
    infobox); network = infobox `network`/`channel` link that is also Wikidata P449 (labels mapped to familiar names,
    `NET_NAME`); stars as films.
  - **Actors**: birth year = Wikidata P569 exactly; nationality = hand demonyms ∩ Wikidata P27 (historic states mapped);
    films kept only if the actor is in the film's P161/P725; portraits = Wikidata P18 through `commonsImages` (licence
    enforced). `c2_gender.mjs` reruns after the add.
  - **Books**: author = Wikidata P50 surname AND the Wikipedia lead or infobox; year = P577 ±1 or (when P577 is empty)
    the lead/infobox year; country = hand ISO3 ∈ book P495 ∪ author P27; first lines only pre-1930 and found in the
    Gutenberg text; summaries ≤ 45 words.
- Difficulty: hand rating; films nudged by fame (Wikipedias with an article): 3 → 2 at ≥ 60, 2 → 1 at ≥ 95, 1 → 2 under 20.
- Posters/likenesses: none for films/TV (policy unchanged); actor portraits as before (Commons, licence-checked).

## Verification and drops
- Movies: 494 candidates → 493 (Fantasia: 12 Wikidata directors vs 7 in the infobox). The checks earlier caught 10 wrong
  article titles (franchise or disambiguation pages: Jumanji, John Wick, The Martian, Despicable Me, Atonement, Dangal,
  The Castle, Ringu, Once, Kung Fu Panda; fixed), my missing Best Picture flag on Oppenheimer (fixed), and the four old
  Harry Potter films resolving to the books (fixed, `OLD_TITLE`).
- TV: 237 → 214. Drops are real disagreements or no second source: Round the Twist, Open All Hours, Hey Duggee, Astro
  Boy (infobox year ≠ Wikidata), The Bill, Porridge, Flying Doctors, Bob the Builder, Wheel of Fortune (Wikidata year),
  Naruto/Sailor Moon/Attack on Titan (title = the manga), The Block, Little Britain, Top of the Pops, Wombles, Little
  House, Dora, Borgen, Skam (no Wikidata start date), Love Island/Phineas and Ferb (no Wikidata country), Rainbow.
- Actors: 253 → 252 (Mads Mikkelsen: no citizenship on Wikidata). Caught earlier: "Chris Evans" resolving to the radio
  presenter (fixed title).
- Books: 194 → 189 (The Last of the Mohicans 1826 vs Wikidata 1824, Magic Faraway Tree = series page, Dear Zoo =
  author page, Where Is the Green Sheep? and The Help not on Wikidata). Earlier 15 titles resolved to films, franchises
  or characters (fixed with "(novel)"-style titles); the Dostoevsky/Dostoyevsky spelling and Deathly Hallows' missing
  Wikidata date were handled by rule changes (5-letter surname stem, infobox year). Old books: Gulliver's Travels has no country (my IRL vs Wikidata GBR).
- Reports: `tools/c2_reports/screen_<pack>.txt` (every drop, fame per film, unconfirmed casts), gate fixes in
  `tools/c2_reports/gate/`.

## Additive build path
`node tools/c2_screen_add.mjs movies|tv|actors|books|all` loads the pack ON DISK, strips its own earlier additions
(items not made by the C2 builder, their questions, `star-`/`net-` questions, the new facts), then runs
`extendMovies`/`extendTv`/`extendActors`/`extendBooks` and `writePack` (giveaway drop + C1 gate). Idempotent; old items
and questions stay byte-stable. Network fetches go through the C2 cache (`$TMPDIR/clued-c2-cache`), so a rerun is fast.
The full builders (`c2_build_movies/tv/people/books.mjs`) call the same `extend*` before `writePack`, so a rebuild includes
everything (expect the usual Wikidata drift on the builder's own items).
Modules: `tools/c2_screen_lib.mjs` (lead/infobox/sitelinks helpers), `c2_screen_movies.mjs` (+ `screenFacts`, rules
`yearAgrees`, `agreedDirectors`, `agreedCountries`, `fameDifficulty`), `c2_screen_tv.mjs`, `c2_screen_actors.mjs`,
`c2_screen_books.mjs`.

### How to add an item
1. Add a row to the matching `tools/c2_src/*_more.mjs` (use the exact Wikipedia article title; `Title=Display` for films
   when the article title has "(film)"-style suffixes the regex doesn't strip). Plots/clues/summaries in our own words and
   free of title words (the leak checks drop them otherwise).
2. `node tools/c2_screen_add.mjs <pack>`; read the `DROPPED` lines in `tools/c2_reports/screen_<pack>.txt`. A drop means
   the sources disagree or one is missing: fix a wrong title, otherwise leave it out.
3. `node tools/build_index.mjs`, `node tools/local_tags.mjs`, `node tools/leak_scan.mjs` (exit 0), `node tools/c2_test.mjs`,
   `node tools/c2_screen_test.mjs`.

## Tests (2026-10-13)
- `node tools/c2_screen_test.mjs` 24/24: rule unit tests (year/director/country conflicts rejected, lead parsing,
  fame nudge), pack invariants (country names, star/director/network options, first-line rule, genders, licences),
  and five broken copies each caught.
- leak_scan 0 (48,362 generated) · c2_test: my packs pass (the 8 failures are CONTENT's `hq-his` order questions, pre-existing)
  · f_test 2,473,912 / 0 · suggest_test 91/91 · m_test 5433/5433 · a_test 477/0 · fresh_test 58/58 · local_test 5999 ok.
  f_test first caught two typed-answer clashes ("Invisible Man"/"The Invisible Man", "Prisoner"/"The Prisoner"): Ellison
  dropped, the Australian show renamed "Prisoner: Cell Block H".
- `CDP_PORT=9600 node tools/screen_e2e.mjs OUT portrait`: Quick game on Movies chosen with real picker clicks (10/10 from
  movies), then a two-round solo game (8 movies + 8 books, hard) answered by clicks; 23 of 26 questions about new items,
  no console errors. Screens looked right.

## Fix 2026-10-13: lead actors missing from `stars`
Cause: `starsOf` read only linked names in the infobox "starring" field, and Wikipedia links a person once per article,
so a lead who is also writer/director/producer (Stallone, Costner, Welles, Allen…) appears there as plain text and was
skipped. Now `ibEntries` (c2_screen_lib) reads linked and plain names in billing order, plain names matched to the
Wikidata cast labels; every star must be in P161/P725, and if the first-billed name can't be confirmed the item gets no
stars at all. Distractors for `star-` questions already excluded the film's whole Wikidata cast (P161+P725); TV uses the
same `starsOf`. Actors↔films links are checked by cast membership only, so crew roles never mattered there.
Changed: movies 63 star lists (47 with a different lead; 46 star-question answers), TV 27 (23 leads, 16 answers;
Bananas in Pyjamas, McLeod's Daughters, Last of the Summer Wine now have none). `c2_screen_test` has 30 famous films
whose lead must be in `stars` and never a wrong option; the pre-fix pack fails 19 checks.

## Open / for the manager
- Counts overshoot the brief (570/267/336/279 vs ~400/200/250/250): the hand lists were written long and nearly
  everything verified. Trimming is a row delete + rerun if Aaron wants smaller packs.
- Movie-moment art: 382 of the 493 new films have none (111 do); a later Flux pass.
- `data/index.json` was rebuilt from the tree: it now also lists another lane's new `records` pack (on disk, not mine).
- Not touched: media/movie-moments, data/music, pickall files.

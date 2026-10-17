# Lane DIRECTORS (2026-10-17)

Aaron: directors under Screen (picture → pick the director) and People (film title → director), and People split into
sub-categories.

- **Directors pack** (`data/packs/directors.json`, theme people, also listed under Screen): `node tools/c2_directors.mjs`
  rebuilds it from `tools/c2_src/directors.mjs` (rows, `DIRECTORS_IMG` portrait overrides, `DIRECTORS_LEVEL` hand levels),
  reruns c2_gender and patches movie-moments. Report: `tools/c2_reports/directors.txt`. Then build_index + local_tags.
  - Checks: human + sex on Wikidata (or a director lead on Wikipedia when Wikidata is vandalised: Jeunet's P31 read
    "Nero Inc"), born = P569 and the Wikipedia lead, films = Wikidata P57 by label/alias, else the film's Wikipedia
    infobox director line (Forrest Gump and La La Land had lost their P57 on Wikidata). Clue numbers vs the article.
  - Fame: English pageviews percentile (≥0.70 easy, ≥0.35 medium), then hand levels (news spikes: Mira Nair, Rob Reiner,
    David Lynch; classics under-viewed: Leone, Capra).
  - Questions: who-/born- (portrait), `dir-<film>-<year>` "Who directed X (year)?" for every movies.json film by a pack
    director (credit confirmed on Wikidata or the infobox) plus the hand-listed notable films, `films-<id>-<film>`
    "Which of these films did X direct?". Wrong directors: closest careers, same industry (Hollywood/UK/Aus vs Europe vs
    Asia vs India), family-film makers for family films. Level = 1 when an easy director made an easy/medium film, else
    the rounded-up mean of film and director levels. Non-family films carry `kids: false`.
- **Screen picture question**: movie-moments `factsMeta.director` has `askImg` ("Who directed this film?"), `near: 'year'`
  and `levelled: true`; `item.factLv.director` (written by `directorLevels()`, also called by mv_build) rates it and limits
  it to films whose single lead director is in the pack. mc `fromPicture` shows the easiest still, wrong names from films
  within 8 / 15 years (as trio.js), co-credits never offered; its level travels as `q.data.lv` (diffmix levelOf).
- **People sub-categories**: build_index `ALSO_IN` (actors → people, directors → screen), `UNLISTED` (people) and
  `THEME_ORDER`. `people.json` declares `groupPacks` (people~science / ~literature / ~music / ~sport, virtual by item.group)
  and `mergePack` (people~all "All famous people": people, actors, directors, leaders, explorers mixed; shared facts only,
  field = acting / film directing for actors and directors). Views come from `virtualView()` in js/core/packs.js, used by
  both build_index and the loader; local tags of a merged view read each source pack (js/core/local.js).
- **People additions**: `node tools/c2_people_add.mjs` (rows in `tools/c2_src/people_more.mjs`, additive, called by
  c2_build_people too): writers 11→44, scientists & inventors 29→40, musicians 17→37, sport 20→38.
- Tests: c2_test (directors checks + self-test), tools/directors_e2e.mjs (picker, Directors game, picture + text
  questions, virtual packs; blocks production URLs).

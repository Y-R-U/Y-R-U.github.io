# Lane GAPS: pack/format pairs the picker greyed out (2026-10-07)

Data only. Everything goes through the pack sources and their builders. No generated JSON was hand-edited, nothing
under `js/` was touched, movie-moments was left alone, and git was not used. The picker greys a pair when `generate()`
makes fewer than `minPerPack` questions (5; blitz60 is 2), as recorded in `caps.formats` by `tools/build_index.mjs`.

## Result

Usable pairs, counted from `data/index.json` before (build 202610051408) and after (build 202610071325):

| format | ≥5 before (of supported) | ≥5 after (of supported) | usable by the picker's real rule |
|---|---|---|---|
| blitz60 | 39/59 | 45/59 | 53 → 56 (min 2) |
| connect | 37/55 | 46/55 | 37 → 46 |
| fake | 23/23 | 24/24 | 23 → 24 |
| hilo | 42/42 | 46/46 | 42 → 46 |
| lookalike | 19/20 | 20/20 | 19 → 20 |
| number | 47/53 | 55/55 | 47 → 55 |
| odd | 53/56 | 56/56 | 53 → 56 |
| order | 35/49 | 45/53 | 35 → 45 |
| quote | 3/3 | 4/4 | 3 → 4 |
| sort | 48/56 | 55/56 | 48 → 55 |
| tf | 64/70 | 70/70 | 64 → 70 |
| listen, chain, ladder, match, mc, reveal, silhouette, type | unchanged | unchanged | unchanged |
| **total** | **682/759** | **738/771** | **696 → 749** |

56 pairs became playable, 12 of them for pack/format pairs that had not been supported at all (hilo/number/order on
birds, bees, insects and cats, fake on elements, quote on tv). Tests after the last rebuild: c1_test 109/0, c2_test all 18
pass, c2c_test 0 errors, au_test all passed, f_test 2,348,554 passed / 0 failed, build_index 71 packs and 0 errors.

## What was added (and where it came from)

| pack | new data | source / check | formats unlocked |
|---|---|---|---|
| birds | `kind` (Perching bird, Parrot, Bird of prey [owls included], Waterfowl, Pheasant or fowl, Ratite, Penguin, Hummingbird, Kingfisher), `massKg` (72 birds) | kind derived from the iNat order/family (new `taxoFacts` in c1_build); masses from each species' Wikipedia description (Wikidata P2067 cross-check warned only where Wikidata holds egg masses) | connect, odd, blitz60 categories, hilo, number, order |
| reptiles | `kind` (Lizard, Frog or toad, Crocodilian, Salamander or newt, Turtle or tortoise, Tuatara) | iNat order / suborder Sauria | connect (3×4) |
| flowers | `family` (Daisy family, Protea family, Asparagus family…) | iNat family (APG IV); 3 cultivars by genus | odd |
| gems | `colour` made exclusive; "Colourless" + "White" merged into "Colourless or white"; topaz, turquoise, fluorite and tanzanite lose the fact (no single best-known colour, or too close to blue) | hand review | odd |
| insects | `lengthMm` (23 species), `wingspanMm` (14) | Wikipedia descriptions, midpoint of the stated range; sexually dimorphic / caste-variable species left out | number, order, hilo |
| spiders | `bodyMm` (adult female body length, 24 species) | Wikipedia descriptions | order, number |
| bees | `lengthMm` (worker or female, 16 species) | Wikipedia descriptions; honey bee left out (no figure in its article) | number, hilo, order |
| body | `massG` for 7 organs (skin 3.3 kg ICRP tissue mass, liver, brain, lungs together, heart, spleen, thyroid) | Wikipedia | order, number |
| cats | `massKg` (17 breeds, average of the sexes) | breed articles on Wikipedia; Savannah left out | hilo, number |
| actors | `era` is now the birth decade ("1960s") for actors only | Wikidata-checked birth years | connect, sort, odd |
| paintings | `century` ("1500s") from the Wikidata-checked year | derived | connect, sort |
| hits-1960s…2020s, one-hit-wonders | `act` (Male solo artist / Female solo artist / Group or duo / Duet or team-up) | hand list `tools/au_lists/acts.json`, cross-checked with Wikidata P31/P21 (every disagreement was a Wikidata entity mix-up such as a discography item). Left out: non-binary or ambiguous acts (Sam Smith, Miley Cyrus), charity supergroups, solo-named bands (Santana, Nena, Berlin, OMC, Joan Jett & the Blackhearts), and hits whose best-known voice is a featured or credited-later singer (Timbaland, Gotye, Puff Daddy, Pitbull, The Chainsmokers, Dionne Warwick & Friends, M, Percy Faith) | sort, odd, connect, blitz60 |
| classical-recordings | `era` (Baroque / Classical / Romantic) by composer; Debussy has none | textbook periods | sort |
| dishes | 5 new lookalike pairs with difference notes: phở/ramen, lasagne/moussaka, borscht/gazpacho, bratwurst/hot dog, jiaozi/pierogi | hand-written notes in `_diffs.mjs` | lookalike |
| elements | `fakes` (Vibranium, Adamantium, Unobtainium, Draconium, Zephyrium, Glacium, Lunarium, Pandemonium) + `fakePrompt`; none is a real or historical element name (historic claims such as nipponium, coronium, florentium were avoided) | hand | fake |
| tv | `quote` on 17 shows + `quotePrompt` | each catchphrase must be found on the show's own Wikiquote page (main, season or "(TV series)" page; never films or spin-offs, which is why "Yabba dabba doo" now cites the series page and the Blackadder line was dropped); ≤10 words; 14 candidates failed and were dropped (see tools/c2_reports/tv.txt) | quote |
| currencies | 40 generated tf questions "The currency of X is the birr." | from the Wikidata-checked currency list; only unit words that are unique (no dollar/franc/dinar), false ones use a same-region unit | tf |
| general (c2c) | `tools/c2c_src/general_c.mjs`: 30 tf, 15 number, 16 order questions for the history, geography, art, music, books, screen and animals slices | textbook facts, checked; c2c_test dup check passes (two of my first drafts duplicated existing facts and were swapped) | tf, number and order on general~* slices |
| sport (c2c) | 5 order questions (Olympic hosts, World Cup hosts and first wins, Grand Slam calendar, ball sizes) | single-time hosts only, so no city/country is ambiguous | order |

## Wording fixes made on the way (data side)
- `{aValue}` instead of "a {lvalue}"/"an {lvalue}" in every C1 template ("The small intestine is a organ", "The komodo
  dragon is an reptile"): bees, body, cats, dinosaurs, dishes, dogs, elements, gems, jellyfish, mammals, reptiles, sea, space.
- Request from FIN: country names now get "the" in the C2 geo builder's currency and language prompts and explains
  ("What is the currency of the United Kingdom?", "…main language of the Bahamas?") and in the countries explains.
- birds kind "Duck, goose or swan" became "Waterfowl" (the generator's lower-casing skips values with a comma).

## Builder changes
- `tools/c1_build.mjs`: `taxoFacts: { key: { '<iNat taxon name>': value } }` derives a cat fact from the item's iNat
  lineage (most specific match wins); a hand value must agree or the build throws; `f: { key: null }` opts out.
- `tools/c1_src/_common.mjs`: `addFacts(items, key, { name: value })`, throws on unknown names.
- `tools/au_resolve.mjs`: reads `tools/au_lists/acts.json` (artist → act, plus per-song overrides); `act` in factsMeta.
- `tools/au_commons.mjs`: `ERA` map for classical-recordings.
- `tools/c2_build_art.mjs` (century), `c2_build_people.mjs` (actor decade), `c2_build_tv.mjs` (Wikiquote-verified
  catchphrases), `c2_build_geo.mjs` (currency tf, "the"), `c2c_build.mjs` (imports general_c.mjs).
Every rebuilt pack was diffed against its previous JSON: only the intended fields changed (media, clues and questions
identical), apart from the wording fixes above.

## Won't do (the picker should keep these hidden)
| pair | reason |
|---|---|
| order × hits-1960s…2020s | every song is from the same decade, so "order by release year" means 1–3-year gaps and is a coin toss |
| blitz60 × hits packs, classical-piano, classical-recordings, nursery-rhymes, pd-melodies, kids-film-tv | naming songs/pieces from a curated list rejects every correct answer that isn't on the list |
| connect × bees | 27 items with only two big natural groups (bee, wasp); hornets 3, flies 2 |
| connect × flowers | colour and native region are multi-valued; only the daisy family has 4+ members |
| connect × gems | no clean 3–4-way partition (QF found gemstone/mineral/rock isn't one); odd works on colour instead |
| connect × classical-piano / classical-recordings | composer groups are 2–4 pieces; period would need Beethoven and Schubert, whose period is genuinely disputed |
| connect × kids-film-tv, pd-melodies; sort × pd-melodies | 22 and 10 items, one thin split (film/TV, Christmas/other) |
| order × cats | breed weights only span 2–7.5 kg, so four breeds with fair gaps almost never exist (hilo and number work) |
| quote × people/leaders/explorers | their famous lines already live in the quotes pack (same speakers); song lyrics are copyrighted |
| silhouette × anything but countries | needs clean cut-out images, which no pack has |
| hilo/number/order × mushrooms, jellyfish, flowers, dishes, words, flags | no single fair quantity (puffballs vs brackets vs capped mushrooms; jellyfish pack mixes cone snails and stonefish) |
| hilo × capitals | capital populations depend on city-proper vs metro definitions |
| fake × body, actors, people, capitals | invented names risk being real obscure bones, people or towns |

## Requests (code, for lane I / the code agent)
- **connect is flaky on packs with a one-value cat fact.** hits-1970s and hits-1980s can make connect puzzles (any
  seed I tried makes 20), but build_index's `caps:` seed records 0: `make()` wastes its 6 tries picking the
  single-value `decade` or `artist` predicate, then `fits` caches the shape as impossible. Skip attributes with fewer
  than 2 qualifying values when choosing, and don't cache a failure after so few tries.
- **listen × kids-nature (0):** the pack's 8 sound questions are `questions[]` with `media.audio`; listen only reads
  items. Either let listen use mc questions that carry audio, or accept the pair as hidden (kids get animal sounds
  from birds/mammals/reptiles).
- lookalike prompt "Which one is a sashimi?" / "a gazpacho": mass nouns; use `pack.imgPrompt` or `{lname}` without
  an article for dishes.
- `fill()`'s lower-casing leaves values with a comma or parenthesis capitalised ("is a Duck, goose or swan"); I renamed
  the value, but `lc` could lower-case the first word whenever the rest isn't a proper noun.

## How to rerun
```
node tools/c1_build.mjs birds reptiles flowers gems insects spiders bees body cats dishes elements
node tools/c2_build_people.mjs; node tools/c2_build_art.mjs; node tools/c2_build_tv.mjs; node tools/c2_build_geo.mjs
node tools/au_resolve.mjs hits-1960s hits-1970s hits-1980s hits-1990s hits-2000s hits-2010s hits-2020s one-hit-wonders
node tools/au_commons.mjs classical
node tools/c2c_build.mjs
node tools/build_index.mjs && node tools/c1_test.mjs && node tools/c2_test.mjs && node tools/c2c_test.mjs && node tools/au_test.mjs && node tools/f_test.mjs
```

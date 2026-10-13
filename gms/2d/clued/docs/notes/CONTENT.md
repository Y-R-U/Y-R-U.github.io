# Lane CONTENT: classic pub-quiz staples (2026-10-13)

## What was added
| Pack | Before (d1/d2/d3) | After (d1/d2/d3) | Source |
|---|---|---|---|
| general | 729 (249/315/165) | 1140 (420/472/248) | `tools/c2c_src/general_e.mjs` (412 new) |
| history | 248 (38/103/107), all generated | 510 (103/246/161) | `tools/c2c_src/history_a.mjs` (262 hand-written, ids `hq-…`) |
| sport | 155 q + 120 items | 467 q + 120 items | `tools/c2c_src/sport_b.mjs` (312 new) |
| kids | 326 | 430 | `tools/c2c_src/kids_c.mjs` (104 new) |

`general~history` slice: 82 → 89. Totals ~1,090 new questions.

World spread of the new questions (keyword count, a question can hit several regions; ~300 are region-free science/maths/language):
Europe ~325, Asia ~170, North America ~160, Oceania ~130 (Australia/NZ heavy on purpose: the players are there), Africa ~100,
Latin America ~80, Middle East ~45. Sport covers football (Premier League, Scottish, European, African, South American),
cricket, both rugby codes, tennis, golf, F1/motorbikes/Bathurst, Olympics, athletics, NBA, MLB, NFL, NHL, cycling, boxing,
AFL, horse racing, netball, snooker/darts, kabaddi, sepak takraw, capoeira, Muay Thai and more.

## How it is built
- `node tools/c2c_build.mjs` (deterministic) now also merges `history_a.mjs` into `data/packs/history.json`: it removes every
  `hq-` question and appends the current set, so rerunning is idempotent.
- `tools/c2_build_history.mjs` (network builder, lane C2) now keeps the `hq-` questions already in history.json when it
  rewrites the pack. If it is ever rerun, rerun `c2c_build.mjs` afterwards anyway.
- Then `node tools/build_index.mjs` and `node tools/leak_scan.mjs` (exit 0).
- Questions name their country in the text where natural ("Which Australian…", "Which Nigerian author…") so LOCAL's
  tagger can pick them up. No `country` fields were added by hand.

## Rules followed
- Stable facts only. Anything that can change says "As of 2024" (most Premier League goals, Test runs/wickets, F1 wins,
  NBA points, Celtics titles, Stanley Cups, AFCON, Women's World Cup, Real Madrid European Cups, Duplantis, WBC, Saturn's moons).
  No current-champion questions.
- Four options in general/sport/history, three in kids; wrong options plausible but clearly wrong; no "X or Y" answers
  except genuine synonyms already in the bank (stag/buck, school/shoal).
- Difficulty: aim for well-known (general new set 41/39/20 %; the c2c_test 35/40/25 ±8 band still passes: 37/41/22).
- Giveaways: the builder's `dropGiveaways` flagged 14 new prompts; all were reworded, not lost (Animal Farm, Thorpedo,
  Saint Petersburg, East India Company, Copa América, World Series, hammer throw, penalty box, Iron Mike…).
- Dedupe: c2c_test (exact + Jaccard) passes with 0 errors; I also ran a cross-pack check against all 72 packs and dropped
  31 general questions that repeated item-pack facts (books pack authors, body pack, elements, birds, trees, tv, quotes,
  languages, landmarks) and 14 kids questions that repeated general/sport facts.

## Verification
Written from well-established facts, then a second sceptical pass over every new question. Spot-checked on the web:
Tour de France 2024 finishing in Nice (first non-Paris finish since 1905), Shane Williams 58 Wales tries, Tony Lockett
1,360 goals, Egypt 7 AFCON titles, Montreal Canadiens 24 Stanley Cups, Hamilton 105 wins (end of 2024), Mawsynram,
Lincoln Cathedral passing the Great Pyramid (1311), Gareth Bale 41 Wales goals, France's 12 time zones, Australia wider
than the Moon, Saturn retaking the moon lead in 2023.

Dropped as unsafe or unverifiable while writing/checking: Kalahari "mostly in Botswana" (depends on definition), largest
Muslim/most pyramids style contested counts, Penguins "only in the southern half" (Galápagos penguins cross the Equator),
"no two snowflakes are identical" (a 1988 identical pair was reported), elephants "only animals that can't jump",
Andean condor "largest flying bird", the origin of the word "joey", "most widely spoken language in Africa", Japan's
"national flower".
Fixed during the sceptical pass: Zidane called a "striker" (midfielder); Scotch whisky (grain whisky uses maize; now
"single malt"); hanami wrong option "Plum blossom" (also viewed) → Magnolia; Model T assembly-line date (1913, not 1908);
Ghana "first sub-Saharan colony" (Sudan 1956) softened; Australian women's 1902 vote now notes the Aboriginal exclusion;
"India's first and so far only woman PM" → "first"; Hugh Jackman "17 years" (he returned in 2024); Mozart "born in
Austria" (Salzburg was not then Austria); Charlotte Cooper "first woman champion" → first individual woman champion.

Existing questions changed:
- general_d "Which spice gives paella and many curries a yellow colour? → Saffron or turmeric" → "Which spice gives
  traditional Spanish paella its golden colour? → Saffron".
- general_d falafel "Chickpeas or fava beans" removed (two-answer; the dishes pack covers falafel).
- general_d unqualified "Which country has the most people? → India" removed (duplicate of the "As of 2024" version).

## Tests (2026-10-13)
c2c_test 0 errors · build_index 0 errors · leak_scan exit 0 (0 of 38,701 generated) · suggest_test 91/91 ·
m_test 5433/5433 · f_test 2,391,094 passed / 0 failed · a_test 477/0.

## Open / for the manager
- The `hq-` history questions are in the history pack, so the Classic Pub Quiz history round (history + general~history)
  now has 510 + 89 to draw from.
- No browser was started.

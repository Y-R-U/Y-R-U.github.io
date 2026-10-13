# Lane RECORDS: the World records pack (2026-10-13)

`data/packs/records.json` (theme `general`, `kids: true`, icon 🏆): **523 records, 713 pack questions** (625 mc incl. 23
range-band questions, 59 closest-guess, 6 pick-all), built deterministically from `tools/rec_src/*.mjs` by
`node tools/rec_build.mjs` (`--check` validates only, `--subs` prints counts per group › sub-type).

## Shape
- One item per record. `group` = the top group (Athletics, Animals, Materials…), `sub` = the sub-type (Whales, Metals,
  Middle & long distance…), `record` = the record's title, plus `value`/`unit`/`valueText`, `year`, `iso3`, `asOf`,
  `sources` (every page the record was checked against).
- Items are named after the holder when the holder is a thing you can compare (Mount Everest, Burj Khalifa, Jupiter);
  otherwise after the record ("Men's 100 m", "Largest seal"). Holder-named items carry one comparable number fact
  (`heightM`, `lengthKm`, `areaKm2`, `depthM`, `speedKmh`, `diameterKm`), so the stock formats make **hilo, order,
  number and mc "which is the tallest"** questions from them (82 items). `holder`/`country` facts are hidden from every
  format (`ask/stmt:false`, `exclusive:false`, `hard:true`); `country` (a country name) is what `local_tags` reads.
- Pack questions per record (all in the source, all deterministic):
  - holder mc (`q`, `w` = wrong options from the **same sub-type**, e.g. other whales, other 8,000 m peaks);
  - value mc (`vq`, `wv` = close realistic values, often earlier records: 9.58 vs 9.63 / 9.69 / 9.74); options are shown
    in ascending order (`ordered`);
  - closest guess (`tol`), only for decimal values (no clock times), with the unit in the prompt ("…, in metres?") and
    `answerText` so the reveal shows 9.58 s, not 9.6 s;
  - range bands (`bq`, value `bv` in unit `bu`, spread `bsp`): four exclusive bands from a 1-2-5 ladder ("Under 100 h /
    100–200 h / 200–500 h / Over 500 h"), built so the value ± its spread never touches an edge, the answer's position
    rotated through 1st–4th (23 questions: 4/9/6/4 by position; `bp` pins one where a top band would be silly, e.g.
    zircon ages above the age of the universe). Shown in ascending order, never typed;
  - `more`: extra hand-written mc / pick-all lists (8,000 m peaks, planets bigger than Earth, Bolt's records…).
- Difficulty: broad records are 1 (tallest animal, biggest ocean), sub-type ones 2–3; value questions are one step
  harder than holder questions, closest-guess one step harder again. `kids: true` marks 35 easy, famous ones.

Counts by group: Other sports 88 (cricket, football, rugby, tennis, golf, F1, NBA, NHL, MLB, NFL, AFL, Olympics, winter,
horse racing, darts, snooker, chess, sumo, cycling), Animals 75 (biggest & fastest, whales, sharks & fish, birds, mammals,
reptiles, bugs & spiders, sea creatures, venom & poison, pets), Natural world 71, Built world 34, Athletics 33,
Films/music/games 28, Space 27, Materials 26 (elements, metals, minerals & gems, man-made), Countries & cities 25,
Human body & people 23, Swimming 17, Oldest things 16, Weather & climate 14, Speed & vehicles 12, Plants 11,
Hot & cold 9, Loudest & brightest 7, Food 7.

## asOf policy
- Anything that can change (current champions' counts, active careers, tallest-building-style records) has
  `asOf: 2025` and says **"As of 2025"** in every prompt and blurb; the builder refuses a record whose prompt or blurb
  lacks it. 150 records carry it.
- A record is only stamped "as of 2025" if it was **still the same when checked in October 2026**, so the stamp is true
  and still current. Records that changed in 2025–26 were dropped instead: men's marathon (Sawe 1:59:30, 2026),
  110 m hurdles (Tharp 12.75), men's mile and men's 400 m hurdles (2026 marks pending), women's 100 m hurdles (Russell
  12.09), women's mile (two competing marks), men's pole vault and discus (falling every season), most men's World Cup
  goals (Mbappé passed Klose in 2026), highest-grossing film (Endgame re-passed Avatar in 2026), most WRC titles (Ogier
  tied Loeb in 2025), largest rice producer (India/China swap), and the swimming records set in 2025–26.
- Holder-only questions are kept where the count moves but the holder hasn't (Ronaldo's international goals, LeBron's
  points, Hamilton's wins: blurb gives the 2025 figure).

## Measurement spread
Natural values differ by survey: each such record has `sp` (spread). The builder fails a build if a wrong value sits
inside ±sp or a tolerance is narrower than sp, and range bands keep value ± spread inside one band. Island areas, river
lengths, ocean areas and depths use round "about" figures with wide spreads (e.g. Greenland 2.13 million km² ± 60,000:
current Wikipedia gives 2.11 M for the main island, older lists 2.17 M).

## Verification
- `node tools/rec_verify.mjs [--plant]` fetches every cited page (Wikipedia REST, politely, one page at a time, 60 s
  back-off on 429; cache in `$REC_CACHE` or the OS temp dir) and checks that the holder and the value (any figure within
  the record's spread, or its written forms) appear within 1,500 characters of each other; records without a number
  must have the title's superlative ("largest", "oldest", "only"…) near the holder. **Final run: 502 pass, 21 flagged
  NOSUPER** (the page words it differently: "widest", "the first Egyptian pyramid", a table row); all 21 were read and
  confirmed by hand. `--plant` re-checks each value multiplied by 1.37: 223 of 247 fail as they should; the 24 that
  still "pass" (common numbers on long pages) were checked by hand. A pass is a lead, not a verdict: every record was
  also reread by hand. A new pair check in the builder (every 2 of the wrong options, as 3-answer games show) caught
  10 prompts that would have given the holder away.
- WebSearch was used where Wikipedia had no page: Aerovelo Eta 144.17 km/h, Ahmed Gabr 332.35 m (Guinness), the LHC
  5.5 trillion K (Guinness), Solovyev's 82 h of spacewalks, Mount Baker's 1,140 in (NOAA, a US record), Volta's eel
  860 V, slowest mammal (Guinness), China's 650 km/h maglev test, Ogier's ninth WRC title, the Shaanxi toll dispute.
- Dropped or reframed while checking (beyond the 2025–26 changes above): longest river in the world (Nile vs Amazon),
  densest element (osmium vs iridium), lightest solid / hardest material (contested), heaviest flying bird, fastest
  bird in level flight, loudest land animal, wettest place, largest bear, largest amphibian, Shaanxi "deadliest
  earthquake" (direct toll now put near 100,000), weightlifting (categories reset in 2025), women's triple jump (indoor
  mark), women's marathon (record-holder banned), most Super Bowls / Tour de France wins / Wimbledon titles overall
  (ties), the 24-hour rain spot (now "Réunion": sources say Cilaos or Foc-Foc), largest hailstone wrong option Aurora
  (it holds the circumference record), most painful sting (now "the only 4 in Schmidt's original index"; he later rated
  the tarantula hawk 4 too), oldest lighthouse (now "only Roman lighthouse still in use"), fastest train (now "crewed
  train"; a small uncrewed Chinese test vehicle hit 650 km/h in 2025), Apollo 10 speed (Artemis II, April 2026, may have
  matched it).
- Sceptical-reader fixes: Olympus Mons height basis, Mercury vs Moon size, Welcome Stranger net weight, feldspar share
  (40–60%), Emperor penguin depth (535 m), inland taipan deaths, "only a diamond scratches diamond", Kosciuszko vs Mawson
  Peak wording, Merdeka 118's new name, island areas, Jerry Rice margin, Phelps "no one else above nine golds", lion's
  mane / oarfish wrong options that were nearly right (Nomura's jellyfish, beluga sturgeon).

## Adding or updating a record
1. Add an object to the right `tools/rec_src/*.mjs` (`g` group key from `lib.mjs` GROUPS, `s` sub-type, `t` title,
   `h` holder, `q` + 3 wrong `w` from the same sub-type, optional `v/u/vq/wv/tol/sp`, `bq/bv/bu/bsp`, `c` ISO3, `y`,
   `asOf: 2025` for anything that can change, `b` blurb, `d` 1–3, `src` page title(s) or URLs, `ent: true` +
   `dim` to make it comparable).
2. `node tools/rec_build.mjs --check` (giveaways, asOf stamps, spreads, duplicate names all fail the build).
3. `REC_CACHE=… node tools/rec_verify.mjs --only "<title words>"`, then read the page yourself.
4. `node tools/rec_build.mjs && node tools/local_tags.mjs && node tools/build_index.mjs && node tools/leak_scan.mjs`.
To refresh the stamp (e.g. to "as of 2026"): change `AS_OF` in `lib.mjs` and every `asOf`, rerun the verifier, and fix
or drop whatever moved; the builder lists every prompt and blurb that still says the old year.

## Engine edits (small, additive; for the manager to review)
- `js/formats/mc.js`: a pack question with `ordered: [...]` keeps its options in that order (range bands, values).
- `js/formats/type.js`: skips pack questions with `typeable: false` (bands, values, prompts that share a word with the answer).
- `js/formats/number.js`: a pack number question's `answerText` is used for the reveal and scale (`data.exact`).
- `js/formats/blitz60.js`: `pack.blitzAll === false` drops the "name any item" category (record titles are not nameable).
- `js/formats/registry.js` + `order.js`: comparison words deeper/shallower/deepest and faster/slower/fastest.
  (These four edits vanished from the tree once mid-session, around the 18:04 commit/bump, and were re-applied.)

## Tests
- `tools/rec_e2e.mjs <out> portrait|landscape` (CDP 9620): solo mc trivia round (asserts a range-band and a value
  question appear, bands ascending), number round typed on the keypad, hilo, order; no horizontal scroll, no errors.
- Suggested set (proposal, not built): **Records & Extremes**, 5 × 10, answer 15 s: (1) Record holders, mc, records,
  `source: questions`, Medium; (2) How big? Closest guess, number, records; (3) Higher or lower, hilo, records; (4) Put
  them in order, order, records; (5) Pick all, pickall, records + general~geography. A group filter (sport-only,
  animals-only rounds) would need a virtual pack per group (`records~sport`, like `general~science`); not built.

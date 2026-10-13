# PICKALL lane — "Pick all" round (2026-10-13)

"Which three of these are external territories of Australia?" — tap the right tiles, then Lock in.

## Files
- `js/formats/pickall.js` format (generate + render), `pickall_rules.js` (fact rules), `pickall_score.js` (scoring, shared with P2P).
- `tools/c2c_src/pickall_a.mjs` hand-written lists (default export → general pack, `KIDS` → kids pack), `P()` in c2c_src/lib.mjs,
  c2c_build wires both. c1_schema accepts kind `pickall` and checks it.
- Server: scoring.go (`partialFormats`, `longFormats` 30 s, `verifyCorrect` for pickall, `pickallScore`/`pickallCap`),
  rooms.go (caps the client's points), `pickall_test.go`. P2P mirror in js/net/p2p_room.js (PARTIAL, LONG, verify + cap).
- Wiring: formats/index.js, net/sanitize.js FORMATS, core/local.js ALL_REFS, net/suggested.js (Around the World: "Money &
  languages" → "Pick all the right ones" on countries/capitals/landmarks/general~geography, easy), leak_scan pick-all branch,
  f_test + f_validators, room.js `__cluedRoom.q()` test hook.

## Rules
- 6–8 tiles (option, default 6), 2–4 right, tiles ≥ 2n (6–7 tiles → at most 3 right). Kids: 4–5 tiles, 2 right, pictures when
  every option item has one, 🔊 reads tiles, auto lock-in at the 2nd pick (no button).
- Adults: Lock in is enabled at exactly n picks; a pick beyond n is refused ("Unpick one first"); tapping a picked tile unpicks.
- Score: right picks / n (picks are capped at n, so a wrong pick already costs a right one); more than n picks = 0. (Manager change 2026-10-13: the first rule scored 1 of 2 as 0.) All right = normal speed points (+ streak). Partial = speed base ×
  fraction, shown on the reveal ("+163 pts for a partly right answer"). With exactly n picks this means half right = 0 (n=2: 1+1 → 0).
- Reveal: ✓ green picked-right, ✗ red picked-wrong, dashed "missed" right ones, the rest dimmed. 50:50 removes half the decoys;
  kids 💡 removes one.
- Timeout: no answer (like other formats); the board shows what was right.
- Fairness: an option that shares a prompt word stem (≥4 letters, 6-letter prefix) with the prompt is dropped unless the other side
  has it too ("Western Australia" vs decoy "Australian Capital Territory" is fine); plus registry.givesAway on every right option.
- A list question is asked once per round; a rule value (e.g. countries in Africa) at most twice.

## Sources
- Facts (pickall_rules.js): countries (continent ex. North America, landlocked ex. Caspian states, drive on the left), capitals by
  continent, landmarks by country, element blocks / gases / liquids (Z ≤ 100, no group 3/12 or f-block in the transition-metal
  question), sea animals by kind / breathe air, amphibians/reptiles, flightless birds, venomous snakes (no "mildly"), conifers
  (no ginkgo), dinosaurs vs not (no Archaeopteryx), plant-eating dinosaurs, mammal diets (no pandas), insect orders, planets /
  moons / stars / dwarf planets, paintings by artist, books by author, films by director (no co-directors), language branches,
  dog breeds by country, TV by country (mixed productions out), sports stars by sport, hit songs by artist (solo credits only;
  same-title songs out). Transcontinental countries (arrays + ARM AZE CYP EGY GEO IDN KAZ PAN PNG RUS TLS TTO TUR) are out of
  continent questions on both sides.
- Lists: 80 adult (general pack, tagged by topic so they show in general~ slices) + 13 kids. Australia: external territories (6
  shown; the Antarctic one is in the explain since "Australian" would cue it), mainland territories (ACT, NT, Jervis Bay —
  manager's wording), states, state capitals.
- Counts (build_index caps, 20 = full): 29 supported packs. pickall_test: 486 fact questions at default options across packs,
  73+ list questions.

## Tests
- `node tools/pickall_test.mjs` — scoring edge cases (JS + P2P), every generated question re-derived from raw pack facts or its
  list, sizes, prompt count word, cues, preflight URLs, coverage of every list, sanitize, server tables. Falsified in-file.
- `go test ./...` in server/ (TestPickallScoring, TestPickallRoomCap — falsified by removing the cap).
- `CDP_PORT=9590 node tools/pickall_e2e.mjs OUT portrait|landscape` (solo adult 4 q: all right / one wrong / all wrong /
  over-pick; kids 3 q), `… OUT room` (local Go server build + Chromes on 9590/9591; host all right, Ann one wrong / all right /
  all wrong; server points checked against the rule).
- f_test includes pickall (validator in f_validators.mjs); leak_scan checks each right tile against the prompt.

## Open / for Aaron
- Half-right scores 0 with exactly-n picks (spec rule). Softer alternative: wrong pick −1/(2n).
- Lock in needs a tap for adults (lets you change your mind); kids auto-lock.
- Landscape reveal card covers the lower tile row on 8-tile boards (same known issue as ladder/chain).
- Suggested-set swap: Around the World lost "Money & languages".

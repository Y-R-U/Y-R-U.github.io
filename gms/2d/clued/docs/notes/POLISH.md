# Lane POLISH: question wording and the result line on tall boards (2026-10-08)

Two of Aaron's play reports. Nothing under `js/net/`, `js/ui/setup.js` or the pub quiz builder was touched (another
agent owns them); no git, BUILD not bumped.

## 1. "What is the from [artist]" → "Where is [artist] from?"

Cause: packs whose `factsMeta` entries had no wording templates fell back to `What is the {llabel} of {name}?` in mc
(and `{name}: {llabel} is {value}.` in tf, `Which has the highest {label}?` for numbers), so a label like "From",
"Directed by", "Decade" or "Released" became "What is the from of …", "What is the directed by of Wicked?", "Which has
the highest released?".

### Data: templates for every fact that makes questions (through the builders, no JSON hand-edited)
| builder | packs | added |
|---|---|---|
| `tools/au_resolve.mjs` | hits-1960s…2020s, one-hit-wonders | artist "Who recorded {name}?", year askHigh/askLow/askNumber, decade "In which decade did {name} come out?" (+ askReverse, stmt) |
| | screen-themes, kids-film-tv | composer "Who wrote or performed the music from {name}?" (the field holds performers for songs), year, decade; `type` (film/tv) gets `ask:false, stmt:false` and `display: {film:'Film', tv:'TV'}` (listen.js reads the raw values); track `noun` |
| | music-artists | origin "Where is {name} from?", breakthrough decade |
| `tools/au_commons.mjs` | anthems, instruments, classical-recordings | continent; family "Which family of instruments does the {lname} belong to?"; composer/year. Jew's harp and musical saw lose the made-up family "other"; Hammond organ / Jew's harp get `lname`; Bagpipes gets plural prompts ("These are bagpipes.") |
| `tools/au_pieces.mjs` | classical-piano, pd-melodies, nursery-rhymes | composer, year. pd-melodies "Kind of song" is `ask:false, stmt:false`: Joy to the World and Silent Night are carols and hymns at once, so a question would have two right answers |
| `tools/mv_build.mjs` | movie-moments (+ the unbuilt book/song defs) | year, decade, director, kids |
| `tools/c2_build_history.mjs` | history | century and year asks put the headline first: "The Eiffel Tower is completed. In which century did this happen?" (was "In which century did this happen: The Eiffel Tower is completed?") |
| `tools/c2_build_quotes.mjs` | quotes | `noun: 'speaker'` (blitz60 read "Famous quotes (known for: scientist)") |
| `tools/c1_src/space.mjs`, `inventions.mjs` | space, inventions | "What kind of object is the Pillars of Creation?"; inventions askNumber (number read "The telephone: year (year)?") |
| `tools/m_build.mjs` | data/geo/cities.json | Natural Earth names had double spaces ("St.  Petersburg", "Washington,  D.C."); whitespace collapsed |

Every rebuilt pack was diffed against a pre-run copy: only `factsMeta` (and `built`) changed, except instruments
(the two `lname`s, the two dropped "other" facts, Bagpipes' prompts) and cities.json (six names). C1/C2 packs already
had templates; text facts without `ask` (capital, anthem, songs…) make no questions, so they were left alone.

### Code: the fallback can no longer produce nonsense (`js/formats/registry.js`)
- `catAsk / catStmt / boolAsk / boolStmt / numAsk(meta, low)`: the pack template, else wording picked from the label
  (Composer → "Who composed {name}?", From → "Where is {name} from?", Directed by → "Who directed…", decade/century/
  continent/found in…, "kind of bird" → "What kind of bird is {name}?", vague kind/type/family → "Which of these
  describes {name}?"), else "What is the {noun} of {name}?" only when the label reads as a noun. Otherwise **null and
  the question kind is skipped** (mc `sources()`, tf `sources()`). `ask/stmt/askBool/askHigh/askLow: false` turns one off.
- `factNoun(meta)` (label → noun: From → home country, Born → birth year, Directed by → director, Lives in → habitat,
  Painted in the → century…, parentheses stripped; `factsMeta.noun` overrides), `factPhrase`, `factHeading` (null
  when the label trails off), `plainLabel`, `valueText` (`factsMeta.display`), `whenPhrase` ("when they were released").
- Used by match ("Match each one to its home country", was "…its from"), odd ("think habitat", was "think lives in"),
  sort headings ("Century: 1500s or 1600s?", was "Painted in the: …"; "Film or TV: Film or TV?", was "Tv"), order
  ("Put these in order of when they were released, earliest first", was "Put these in order: released, …"), hilo
  ("Burj Khalifa: completed 2010.", "Beauty and the Beast: 1991."), number ("{name}: in what year?" fallback),
  blitz60 category tags.
- `fill()`: "Where Is the Love??" → "?", "Ray Parker Jr.." → "Jr.", keeps "Help!?", never capitalises "iPhone" to
  "IPhone"; UK/US/USA/UAE/DRC take "the" like the other country names; `lc` keeps Mohs/Celsius/Christmas/Baroque… capitalised
  ("What is the Mohs hardness of gold?", was "mohs").

### Sweep: `node tools/polish_wording.mjs`
Generates questions from every registered format × every pack in data/index.json (incl. music and general~ slices) at
mixed, Easy, Hard and kids, 2–4 seeds, and flags: "the from"-style labels, label-as-noun "What is the decade/kind/act/…
of", label used as a quantity ("highest released"), "is released"/"of the year", doubled words, a/an mismatches,
missing "the" before countries, "the the", raw labels in parentheses ("(painted in the: …)", "Typical length (worker
or female):"), lower-case sentence starts, questions without "?", template leftovers ({value}, undefined, NaN), spacing,
bare label prompts. Item names and quotations are masked for the punctuation checks (titles like "Ice Ice Baby",
"Help!", "O Captain! my Captain!"). Options: `--all`, `--shapes` (distinct prompt shapes per format, names → Zed),
`--sample=60`, `--format=`, `--pack=`, and **`--strip`**, which deletes every pack template first so only the code
fallback is tested. Exit 1 when a generated prompt is flagged.

- Before: 2,697 generated prompts flagged (1,432 "What is the … of", 83 "the from"-style, 706 parentheses, …).
- After: **0 generated flagged** (n=60, 4 seeds, 534,478 prompts) and **0 with `--strip`** (149,129 prompts).
- Left on purpose: history events are present-tense headlines ("The Eiffel Tower is completed"), skipped by the
  "is completed" check for that pack. 8–11 hand-written prompts are listed for review only and are fine ("What is the
  largest instrument in the string family…?", "Arabic is written from right to left.", "What comes next in the
  Fibonacci sequence: 1, 1, 2, 3, 5, 8, …?").
- 60 random prompts read by hand at the end: all read naturally (e.g. "Who recorded I Get Around?", "In what year did
  APT. come out?", "Hallgrímskirkja: completed 1986. Was the Panama Canal completed earlier or later?").

## 2. Result line under tall boards on a phone

Cause: F formats draw into `.f-stage { flex: 1; min-height: 0 }`. When the reveal card was appended to the stage the
board **shrank** and overflowed underneath the card, so on a 384×854 phone the card covered the Check button and the
bottom rows (match with 6 pairs, ladder's answer buttons), and the stage never scrolled. The stage's scroll position
also carried over into the next question.

- Runner (`js/structures/runner.js`): format flag **`revealInline: true`** gives a compact result line (mark, "Not
  quite"/"Correct", points and **Next on the same line**, then the short detail such as "5 of 6 pairs right") and
  root class `rv-inline`; **`answerOnBoard: true`** drops the long "Answer: a: x · b: y · …" line when the board already
  marks the right answer (still shown on timeouts/skips). After answering, the stage scrolls only as far as needed to
  bring the card into view (smooth), and every new question starts at scrollTop 0.
- CSS (`css/play.css`): revealed `rv-inline` boards keep their full height (`.f-stage { flex: 0 0 auto }`) so the card
  sits directly under the board; the format's own Check/Submit footer (match, order, connect) hides after answering.
  Landscape keeps its side card (the board flex is restored there). Portrait map rounds (neighbours, continent,
  city-pick, map-click…): the card sits under the answer buttons and the map frame shrinks to make room, instead of the
  card covering the top of the map. Landscape/desktop map rounds unchanged.
- Flags set: match, connect, order, blitz60 (`revealInline` + `answerOnBoard`); sort, chain, ladder (`revealInline`).
- match tiles: the "→ North America" correction wraps under the name (it squeezed "Honduras" into "Ho/nd/ur/as").
- order (landscape): the prompt moves up out of the card's way after answering.

Measured with real answers through `window.__clued` on CDP 9450 (`--use-angle=metal`, cache disabled), card and Next
`getBoundingClientRect` against the viewport right after answering (top/bottom in CSS px):
| viewport | match | connect | order | others |
|---|---|---|---|---|
| 384×854 | card 538–639, Next 551–601 (6 pairs) | card 418–494 | card 435–561 | sort 463–699, blitz60 318–419, ladder 675–842 (scrolled 48 px), chain 477–759, neighbours/continent 650–846 |
| 854×384 | card 273–374 | 298–374 | 229–374 | sort, chain, ladder, blitz60 all inside 0–384 |
| 1280×800 | card 687–788 (scrolled 103 px, picture board) | 444–520 | 461–586 | |
All in view. Screenshots looked at for each.

Known, not changed: in landscape the side card still covers part of ladder's clue list and chain's portrait row (as
before; the answer column stays visible).

## Additive fields (for CONTRACT)
`factsMeta`: `noun`, `display` (value → text), `ask/stmt/askBool/askHigh/askLow: false`. Format: `revealInline`,
`answerOnBoard`. Item `imgPrompt`/`tfImgPrompt` now also used by au_commons (plural names).

## Tests
build_index 71 packs, 0 errors; a_test 467/0; f_test 2,378,549/0; au_test all passed; c1_test 109/0; c2_test all 18
pass; c2c_test 0 errors; m_test 5433/5433; geo2_test 12042/12042; l_test 50/0; fav_test 46/0; a_e2e portrait, landscape and desktop pass (CDP 9450).

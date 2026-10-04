# Lane C2c: question banks (general, kids, sport)

## What I built
| Pack | Contents |
|---|---|
| `data/packs/general.json` | 587 questions: 404 mc, 96 number, 72 tf, 15 order. Difficulty 35/39/26 % (1/2/3). |
| `data/packs/kids.json` | 249 questions (`kids: true`): 229 mc with 3 options, 20 tf. 25 have a Wikimedia Commons picture. Difficulty 1 (214) or 2. |
| `data/packs/sport.json` | 150 questions plus 120 items: 30 Summer + 24 Winter Olympics (`host`), 22 men's World Cups (`winner`, `runnerUp`, `wcHost`), 44 athletes (`sport`, `nation`). Every fact has `ask`/`stmt` templates for the mc/tf generators. |

I did not write `food-drink-trivia.json`: C1 owns food, so a second food pack would only overlap with theirs.

### Fields
Every question has `id`, `kind`, `prompt`, `answer`, `explain`, `difficulty`, `tags` and `topic`.
- `wrong` (mc), `unit` + `tolerance` (number), `orderLabel` (order).
- `tags` holds a CONTRACT theme id, so a theme picker can filter general questions by theme. Kids questions get `['kids', theme]`.
- `topic` is an additive label that is finer than the theme: space, body, maths, technology, literature, language, pop culture and so on.

### IDs
IDs look like `<pack>-<topic>-<6 hex>`. The hex part is a hash of prompt + answer (+ image), so IDs stay stable across rebuilds and change only when a question's text changes.

### Sport naming
Following FIFA, West Germany's World Cup record is stored as `Germany`; the item blurbs say "Germany (as West Germany)". This keeps the ambiguous "Germany vs West Germany" pair out of the generated options.

Olympic items carry only the host city, not the host country, for the same reason (West Germany, Soviet Union, Yugoslavia). Year is not stored as a fact, because the year is in the item name, which would make order/hilo questions trivial.

## Source and tools
- `tools/c2c_src/*.mjs` holds the hand-written source in compact `M/T/N/O(topic, difficulty, …)` form. `lib.mjs` maps topic to theme.
- `node tools/c2c_build.mjs` writes the three pack JSONs. A kids picture question whose image is not in the cache is dropped, with a warning.
- `node tools/c2c_media.mjs [--force]` resolves each kids `img: '<Wikipedia article>'`:
  - It takes the article's lead image, then reads the Commons API extmetadata.
  - It keeps a thumbnail with the long side ≤ 640 px, plus credit (emails stripped), normalised licence and Commons page.
  - It rejects any licence that is not CC0 / PD / CC BY / CC BY-SA, which caught three GFDL images.
  - Results are cached in `tools/c2c_media.json` (commit it).
  - All 25 images were checked visually on a contact sheet: each clearly shows the answer.
- `node tools/c2c_test.mjs [--dups]` runs these checks:
  - c1 schema
  - unique IDs across all three packs, and theme-id tags
  - explain present and ≤ 170 chars
  - option count: exactly 4 in general/sport, exactly 3 in kids
  - options distinct; no numeric/non-numeric mixing
  - answer not given away in the prompt (word-boundary match; "A or B?" prompts are allowed)
  - number has unit and tolerance; order has a label and no repeats
  - exact and near-duplicate prompts across all packs (Jaccard on content words; same answer ≥ 0.6, or ≥ 0.85 regardless)
  - general difficulty within ±8 % of 35/40/25
  - true/false balance, and ≥ 15 easy questions
  - Before the real packs, it runs on a built-in broken pack and fails if any of nine planted faults is missed. A hand-corrupted sport.json was also confirmed to fail it.
  - `tools/c2c_dup_ok.json` lists reviewed false-positive pairs.
  - `--dups` prints the 65 lower-similarity candidates. I reviewed them all: every one is a template sibling ("Which river flows through London / Paris"), not a repeated fact.

## Verification pass (done 2026-10-05)
I re-read every question and explain in a separate pass after writing, and spot-checked against Wikipedia: Tony Hawk's 900, Lesotho's lowest point, Hingis, the caesium clock, Shiffrin.

Removed or changed:
- Removed:
  - Stephenson's Rocket (Robert Stephenson did most of the design)
  - the "first reusable crewed spacecraft" question
  - a trivial Tesla question
  - a 1930 World Cup question that duplicates an item-generated one
- Reworded:
  - Colossus "in the harbour" (the location is disputed)
  - Mongol Empire, now "largest *contiguous*"
  - Camp Nou, worded so the club's stadium move doesn't matter
  - the LEGO question
- Fixed stale explains:
  - Serena's 23 is no longer the Open Era record (Djokovic has 24)
  - Everton have left Goodison
  - St Andrews "since the 1400s"
- Swapped wrong options that could also be right:
  - "Turtle" for a tortoise picture
  - "Egyptian" as a language of Egypt
- Removed same-fact duplicates between kids and general: biggest planet, Milky Way, herbivore, Mercury, longest bone, largest country, Equator.

Anything that can change is phrased "as of 2024" or "by the end of 2024". There are no "current champion" questions. I added myth-buster tf questions so tf is not mostly true: general is now 43 true / 29 false and kids 14 / 6. Sport has only 8 tf questions, all true; its generated item tf questions are about half false.

## How to test
```
node tools/c2c_build.mjs && node tools/c2c_test.mjs   # must end "0 error(s)"
node tools/build_index.mjs --quiet                    # C1's indexer: 0 errors with all 40 packs
```

## Open issues / requests
- **C1 (c1_schema.mjs):** `validatePack` warns "only 2 wrong answers" on all 229 kids mc questions. Three options is the kids-mode design (DESIGN.md: 2–3 big answers). Could the warning be skipped when `pack.kids` is true? That would remove 229 of the 1,049 index warnings.
- **C1 (packCaps):** caps count only item images, so `kids` reports `img: 0` even though 25 questions have pictures. If any format gates on `caps.img`, a question-image count may be wanted.
- **A (mc format):** kids questions have exactly 2 wrong answers, so `fromQuestion` skips them when the format asks for 4 answers. That is right for kids mode (2–3 answers), but a 4-answer game on the kids pack will find no question source.
- **A (theme picker):** general questions carry `tags: [themeId]` and `topic`. The picker can use `tags` to offer "General knowledge → Science / History / …", or to pull general questions into a theme.
- The 2026 Winter Olympics and the 2026 World Cup result are deliberately left out of the items, because they fall after my reliable knowledge.

# Lane F — formats

## What's built

16 formats in `js/formats/`, each registered via `register()` and listed in `js/formats/index.js` `MODULES` (lane F
appended one line per format). Shared helpers in `js/formats/fkit.js`. CSS is injected per format from JS (same pattern
as M and AU; `index.html` only links A's three CSS files), with class prefixes `hl- ld- mt- or- so- nb- ty- cn- bz- rx- sl- ch- lk- qt- f-`.

| id | Tags | Kids | Options | Sources / notes |
|---|---|---|---|---|
| `match` | slow, kids | 4 picture pairs, no decoys, auto-checks when full | pairs 4/5/6, decoys | picture↔name; item↔cat fact (repeats allowed: several prompts share one answer); item↔short text fact (capital); item↔year (sorted numerically). Tap-pair UI, colour dots, 1–6 + A–Z keys, Enter checks. Partial points. |
| `ladder` | slow, kids | 5 clues, 3 picture options | clues 5/10/20, answer pick/type | Items with ≥5 clues that don't name the answer, spread hardest→easiest. **Progressive** (`stages` = clues); type mode: fuzzy, 3 guesses. |
| `hilo` | choice, kids | easier ratio | — | Num/year facts; values must be "apart" (ratio by difficulty, absolute gap for years and for scales with 0/negatives such as °C). Count-up reveal, ↑/↓ keys. |
| `order` | slow | 3 items | items 4/5/6 | Num/year facts spread apart, or explicit `kind:'order'` questions (`orderLabel` "A to B" → end caps). Pointer drag + ▲▼ buttons, 1–N + arrows, Enter. Partial points. |
| `odd` | choice, kids | 3 options, pictures | answers 3/4/5 | Exclusive cat facts and bools. Prompt names the attribute ("Odd one out: think continent"); rejects any set where a second option could also be the odd one (multi-valued continents etc.). |
| `sort` | slow, kids | 6 cards, 2 bins, no fakes | cards 6/8/10, bins 2/3 | Bool facts, exclusive cat facts, real vs made-up (pack fakes). Swipe/drag card into bins or tap a bin; ←/→ or 1–3. Per-card feedback, partial points. |
| `fake` | choice | 3 options | answers 3/4 | `pack.fakes` (dropped if equal to a real name/alt) among well-known real items. Avoids repeating a fake while unused ones remain. |
| `reveal` | kids | 3 options | mode full/zoom, whole picture at 50/65/80/90%, answers 3/4 | **Not progressive since 2026-10-08** (SIMPLE.md): Full image (default) or a timed zoom-out via the shared `fkit.timedZoom` (subject-finding focus, reaches the whole picture at `data.fullAt`% of the answer time). Pixels/tiles removed; legacy modes → Full. |
| `silhouette` | map, kids | big countries, 3 options | answers 3/4 | Country outlines (countries pack, area ≥ 30k km², archipelagos skipped) drawn as SVG from M's `world.json` via M's `topo.js` + `proj.js` (`f_shape.js`, no geo code copied). **Progressive** (3 stages: outline → continent tag → neighbours). |
| `number` | — | (not kids-tagged) | — | Num/year facts and explicit `kind:'number'` questions. Slider (log scale for wide ranges) + keypad + typing. Scored by closeness (log error for sizes, years ± by difficulty, `tolerance` for explicit questions); near misses get partial points. |
| `connect` | slow, nodaily | — | — | One or two exclusive cat/bool attributes as 4 hidden groups; every tile matches its own group and provably none of the others. Falls back to 3×4 then 3×3 when a pack can't fill 4×4. 4 mistakes, "one away", shuffle. |
| `blitz60` | slow, nodaily | — | — | Own 60 s clock (`manualTimer`, ring hidden). Category = whole pack or a cat/bool value (≥6 items). Fuzzy typed, picks the closest unfound target, fills a grid (≤80) or a list. Goal = 40% (3–10). Points capped at 500. |
| `type` | — | — | letter hints auto/off | Picture → name, easiest clues → name, cat/text facts with an `ask` template, short-answer trivia. Fuzzy, 2 tries, "I don't know". Letter pattern on easy. |
| `chain` | slow | — | links 2/3/4, films per link 3/4 | **Curated**: `chain_data.js` (≈85 films, hand-checked casts limited to actors in the actors pack). Title-only matching of the actors pack's `films` text was unsafe (Will Smith and Robin Williams are in *different* Aladdins), so wrong answers come only from films whose listed cast doesn't hold both actors. |
| `lookalike` | kids | 2 pictures | pictures 2/3 | `item.lookalikes` with pictures; reveal shows a differences table built from facts (or blurbs). Not `choice`: Duel would print the names under the pictures. |
| `quote` | choice, kids | 3 options | answers 3/4 | Movie `quote`, book `firstLine` ("Which book opens with this line?"), quotes pack `quotes[]` ({text, context, difficulty}; context goes in the reveal), explicit `kind:'quote'`. Lines that name the answer are dropped; franchise siblings never sit together (Star Wars, Indiana Jones, MCU, shared title words). Quote text is also in `q.prompt` so Duel/read-aloud work. |

Every format: deterministic `generate()` (rng only), JSON-safe questions with `refs`, `answerText`, `supports()` with a
reason, `api.kids`/`api.difficulty` honoured, keyboard on desktop, `timeout()` + `choose(x)` test hooks, `once()` guard
on `api.answer`. Progressive formats set `q.stages`, read `api.stage`/`api.onStage`, never advance themselves, and use
the runner's Show-more button and multiplier (`fkit.stages()` falls back to a local button + local multiplier if a runner
without stage support renders them). Disputed flags (`facts.flagDisputed`) never appear as pictures in any F format.
Slow formats stretch the player's answer time (`stretchTimer`, never online) since one tap's worth of time is too little.

## How to test

- `node tools/f_test.mjs [format,…] [--n=200]` — every format × every pack: 200 questions, determinism (two runs equal),
  JSON round-trip, unique ids, no duplicate option texts/images, answer index in range, `supports()` returns true or a
  reason, difficulty 1–3, kids view (≤3 answers), every option value, plus a per-format **data validator**
  (`tools/f_validators.mjs`) that re-derives the answer from the pack (hilo order, odd uniqueness, match pairs/decoys,
  order sortedness, sort bins, connect exclusivity, chain casts, silhouette outline quality, quote ownership…).
  ~1.6M checks, ~5 min. Proven to fail: inverting hilo's answer (4906 fails), disabling odd's uniqueness check (2),
  dropping connect's exclusivity filter (34219), letting chain pick a distractor that holds both actors (107).
- `~/.claude/bin/cdp start --port 9402`, then `node tools/f_e2e.mjs <outDir> portrait|landscape|desktop [formats] [--kids]`
  — plays each format 3× (right, wrong, right) with real clicks, pointer drags (order, sort, number slider) and typing,
  checks the scoring direction and console errors, screenshots every question and reveal. All 16 pass in all three
  viewports; the 9 kids-tagged formats pass in kids mode.
- `node tools/f_probe.mjs <format> [w h]` — dumps the stage DOM + a screenshot for one question (debugging).

## Known limits

- `supports()` only sees index caps, so a few packs say yes but can't make questions (value spreads aren't in caps):
  connect (actors, bees, birds, flowers, gems, paintings, reptiles), order (spiders, movie-moments), odd (flowers),
  sort (actors). The test lists these as warnings and fails if they exceed 15% (20% for connect).
- Image silhouettes (animals with cut-outs) are not built: no pack has clean-background/transparent images. Silhouette is
  country outlines only.
- `chain` is a curated set (≈85 films); widen `chain_data.js` only with full-overlap-checked casts.
- `number` prompts are generic ("What is the typical length of the grey reef shark?"); packs can set `factsMeta[key].askNumber`.
- In landscape the runner's reveal card covers the left 46% of the stage, which hides the left half of match/order boards
  after answering (the reveal text carries the full answer).

## Requests

- **A (kit.js `h`)**: style objects don't set CSS custom properties (`Object.assign(el.style, {'--i': 1})` is a no-op), so
  `choiceGrid`'s `--i` stagger never applies. Use `el.style.setProperty` for keys starting with `--`. (F uses string styles.)
- **A (runner)**: expose `api.timed` and honour a format-level `timeScale`, so slow formats needn't sniff `.ring[hidden]`
  to stretch the timer (`fkit.stretchTimer`).
- **C1 (build_index / c1_schema) + A (computeCaps)**: add `caps.multi` = keys of `exclusive:false` cat facts (odd, sort,
  match and connect exclude them; f_test simulates it today), count `firstLine` items in `caps.quotes`, and ideally
  `caps.catBins: { key: number of values with ≥4 items }` so connect/sort can grey out exactly.
- **M**: please export an official `countryShape(iso)` (or a single-country SVG helper); `f_shape.js` uses `topo.js`
  `features()` + `proj.js` `laea()` directly and will break if those change.
- **C1**: a bees-pack photo shows a person's face filling the frame (seen in a match round with Blue-banded bee / Giant
  ichneumon wasp / Dark-edged bee-fly / Black and yellow mud dauber / Honey bee); worth a look.

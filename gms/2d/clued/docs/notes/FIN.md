# Lane FIN: finishing pass (picker UX, QF generator rules, I's open issues, pub quiz favourites)

Code only (js/, css/, tools tests). No pack data edited, no git, BUILD not bumped. `node tools/build_index.mjs` re-run
(the IUCN gate changes a few `caps.formats*` counts).

## 1. Theme picker: hide what can't play (`js/ui/picker.js`, `css/screens.css`)
Aaron: "I cannot select some themes; are they still to do? Should we hide them?"
- Packs a format can't use (unsupported, or under the `caps.formats` threshold) are **no longer listed**; themes left with
  no usable packs are hidden too. No more greyed rows or disabled theme ticks; a theme's count is its usable packs.
- One quiet line at the bottom of the tree: **"29 more topics don't suit this game ▾"**. Tapping it opens a muted list
  grouped by reason ("Needs number or year facts: Birds, Cat breeds, …"). `NOT_ENOUGH` reads "Too few questions for this
  game yet" (kids: "Not enough easy questions for this game yet"). Collapsed by default, stays open across redraws.
- Kids mode: same rules on the kids view; grown-up packs (`kidsSafe: false`) are simply left out, never listed.
- `hiddenPacks(index, why, kids)` is exported (node-tested in a_test).
- Favourites and pub quiz: unchanged paths still hold. The picker drops saved picks that aren't usable (as before),
  `cleanFav` already filters packs through `supportsPack`, pub quiz rounds resolve packs through `resolvePackIds`.

## 2. QF "For lane I" generator rules
Shared helpers in `js/formats/registry.js`:
- `factText` prints year facts below zero as "323 BC" (mc's num explain was "Alexander the Great: -323").
- `fill()` adds "the" before country names that need it ({value}/{lvalue}/{name}/{lname}) unless the template already
  says "the": "comes from the United States". New `{theValue}`; `theName(v)`.
- `lc`/`lcLabel` lower-cases only an ordinary first word: "conservation status (IUCN)", "order from the Sun",
  "United States" untouched. Used for labels everywhere they were `.toLowerCase()`d (match, order, odd, sort, mc, hilo,
  number, blitz60, fake's noun).
- `midName(item, pack)`: lname, else the name (lower-cased for animals/nature/science/food); animals/nature (not gems)
  get "the" ("the southern stingray", "the Atlantic horseshoe crab"); "the United Kingdom". hilo and number use it mid-sentence (and capitalise at sentence start).
- `isIucn`/`factAllowed(m, { kids, difficulty })`: conservation status only at Hard, never kids. Applied in mc, tf,
  sort, match, connect, odd, type; blitz60 drops it entirely; kids ladder drops IUCN clues; kids lookalike drops the
  IUCN row of its difference table.
- `nested(a, b)` ("Jellyfish" inside "Box jellyfish", word-bounded): connect rejects a set with two nested values on one
  fact, odd never picks an odd one whose value nests in the shared one, mc/tf never offer a nested distractor value.
- `comparison(meta)` from `higherLabel` (Bigger/Longer/Heavier/Taller/Wider/Harder/Denser) or an "…ago" unit:
  hilo asks "Is Peru bigger or smaller?" with Bigger/Smaller buttons; "Woolly mammoth lived 0.3 million years ago. Did
  T. rex live longer ago or more recently?"; order says "biggest first" / "longest ago first" with matching end caps.
  Other num facts keep higher/lower.
- `type`: never asks a fact whose values are bins or scales (`typeableFact`: era, century, danger, size, edibility,
  status, coat, habitat, field, type keys; values like "1900s or later", "Middle Ages", "Potentially deadly"; fewer than
  3 distinct values). Decades stay ("1980s", also accepts "80s"). `factsMeta.typeable: true|false` overrides.
  Typed answers accept aliases: UK/Great Britain/Britain/GB, USA/US/America, Holland, Czechia, Burma, UAE, DRC, … (and
  `factsMeta.alt[value]` if a pack ever adds it).
- `sort`: "Born in: 1900s or later / Ancient world" when a bin name has its own "or".
- `fake` uses `pack.nounPlural || pack.title` (type keeps the singular `pack.noun`).

Tests: `tools/f_test.mjs` gained `wordingCheck` (every F format plus mc/tf at normal/Hard/kids): no raw negative years,
"(iucn)", IUCN in kids, missing "the" before countries, "the the", capitalised animal names mid-sentence in hilo/number,
higher/lower or "highest first" on size/age facts, sort "or" bins, bin labels as typed answers, singular noun in fake,
nested connect groups, nested odd values. Each was falsified by reverting its fix (3147/2700/1978/827/364/301/171/68/63/36/
17/14/11 fails; 114 + 73 + 84 + 49 + 22 IUCN-in-kids; 174 negative years). Hand-written `/q:` prompts are skipped by the
"the" check (data, see Requests).

## 3. I's open issues
- **Portrait map rounds** (`js/geo/map.js`, `js/geo/formats/common.js`): the map dispatches `gm-fit` with the height
  its frame needs at the current width (× the portrait zoom it wants); in a portrait viewport the frame caps the map box
  to that (min 300 px, the size neighbours' kids tap targets are measured for) and centres the question block. No more
  ocean bands; the zoom decision now uses the viewport, not the box, so shrinking can't feed back, and the map refits
  synchronously after the box changes (an animated fly-to started on the stale size and showed Siberia for Nepal).
- **Landscape reveal over continent buttons**: after answering, only the picked and the right button stay (2-column),
  the card names the answer. Measured: buttons end at 173 px, card starts at 192 px.
- **Desktop/landscape buttons to the edge**: the side panel has right padding (16 px desktop, ≥10 px landscape).
- **Slow Wikimedia** (`js/structures/session.js`, `js/core/media.js`): spares ratio 0.4 → 0.8 by default; image timeout
  9 → 12 s with a 0.8–2 s back-off before the cache-busting retry (429 bursts); failed questions are swapped for spares
  from the same round (any format) preloaded with progress ("Swapping 3 that didn't load… 4/12"); if a round is still
  under 60% of its questions the failed URLs get a second, slower pass (3 at a time, 20 s). Remaining spares returned to
  structures are only unused ones that loaded. `thinRounds(spec, questions)` exported.

## 4. Pub quiz "Surprise me" uses favourites (`js/structures/pubquiz.js`)
The first round of each format takes one of the player's saved favourites for that format (`favKey`, kids slots in kids
quizzes), cleaned by `cleanFav`: its packs (when specific), options and difficulty. Preset options win (the Picture
round stays pictures), the final keeps Hard, a themed title ("Nature: Spot the fake") becomes the format title when the
fav's packs replace the theme. Round cards show a small ♥. Real-click check: listen fav 80s+90s + 2 s clip → "Music round
♥ · Hits of the 1980s, Hits of the 1990s", mc fav Mammals → Picture round on Mammals, still pictures; round 1 starts.

## Tests run
- Node: a_test 464/0 (15 new FIN checks, falsified: listing usable packs, listing grown-up packs in kids, same-format-only
  swaps each fail), f_test 2,305,895/0, m_test 5433/5433, l_test 50/0, au_test all passed, fav_test 46/0,
  geo2_test 12042/12042, p2p_test 96/0, s_unit_test ALL PASS.
- Browser (CDP 9440, `--use-angle=metal`, cache disabled; desktop dpr 1):
  - a_e2e all 11 scenarios pass in portrait, landscape and desktop; fav_e2e 25/25 in all three; geo2_ui_test 173/0
    (incl. kids neighbour tap targets measured in the new shorter portrait box); m_ui_test 65/0.
  - Picker real clicks (scratch driver): hilo, fake, listen, connect at 384×854, 854×384, 1280×800 and kids hilo/mc/
    listen/match portrait: no greyed rows or disabled ticks, quiet line present, tap expands the grouped list, picking a
    pack by click updates the summary, no console errors. Screenshots looked at.
  - Map rounds: map-click world + Europe and kids neighbours (Nepal) in portrait (box 300 px, no ocean bands, fly-to
    lands on the right place); continent portrait/landscape/desktop answered right and wrong by real clicks.
  - Pub quiz Surprise me with saved listen + mc favourites (real click), then round 1 starts.

## Requests (data, for the content lane)
- Hand-written prompts missing "the": currencies "What is the currency of United Kingdom / United States / Netherlands /
  Philippines / Bahamas / Gambia / Maldives / Comoros / Dominican Republic / Central African Republic / Solomon Islands /
  Marshall Islands / United Arab Emirates?" and languages "Which of these is a main language of Bahamas / …?". The C2
  builders should use `theC()` (tools/c1_src/_common.mjs) for these.
- Optional: `factsMeta.typeable` on any cat fact that should (or shouldn't) be typed, and `pack.nounPlural` where the
  title makes an odd plural in "Which of these … is made up?".

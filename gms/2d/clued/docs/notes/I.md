# Lane I — integration

Owns the shell/framework (A's files: index.html, css/, js/main.js, js/core/, js/ui/, js/structures/,
js/formats/registry.js + index.js + mc/tf), `tools/build_index.mjs` and A's tools. Other lanes' files were touched only
where a fix needed it (listed below).

## What changed

**Fix list**
1. `h()` (js/ui/kit.js): style keys starting with `--` go through `style.setProperty`, so choiceGrid's `--i` stagger works (verified in the browser: `--i` = 0,1,2,3).
2. Runner exposes `api.timed` and honours a format-level **`timeScale`** (number or `q => number`), applied to the player's
   answer time outside online rooms (rooms sync deadlines). `manualTimer` formats keep the ring hidden until they call
   `api.timer.start`. F's `fkit.stretchTimer` ring-sniffing hack is gone; `fkit.ownClock(api)` only stops the timer.
   Factors moved onto the formats unchanged: match `1+0.6·pairs`, order `1+0.5·items`, sort `1+0.35·cards`, chain
   `1+0.8·links`, connect 6, number 2, type 1.8, ladder `min(2, 1+clues/10)` (on top of the progressive ×1.5).
   Verified: 10 s answer time → match ring 39 s, order 29 s, mc 9 s, blitz60 ring hidden.
3. **Truthful supports().** `tools/build_index.mjs` now imports every module in `js/formats/index.js` in node and runs
   each format's `generate()` (seeded, `count: 20`, default opts; kids opts use `kidsDefault`) against every pack that
   `supports()` accepts, for difficulty 0, 1 and Kids (the kids view). Results go in `caps.formats`, `caps.formatsEasy`,
   `caps.formatsKids` (`{ formatId: questions made }`). Also new: `caps.multi` (exclusive:false cat facts),
   `caps.catBins` (`{ key: values with ≥4 items }`), and `firstLine` items now count in `caps.quotes`.
   `registry.supportsPack(fmt, info, { kids })` greys a pair below `fmt.minPerPack || 5` with **"Not enough for this game
   yet"** (blitz60 sets `minPerPack: 2`: each question is a 60 s round). The picker, formats grid, spec resolution and
   pub quiz all go through it. 755 pack/format pairs measured, 65 greyed (hits packs can't order/sort/connect, actors
   can't sort/connect, etc.). The run adds ~9 s; `--nogen` skips it.
   *Guarded import:* the geo formats fetch `data/geo/*.json` at import time, which node can't do for `file:` URLs, so
   build_index installs a tiny `fetch` shim that serves `file:` URLs from disk while it runs. Any format that needs more
   (DOM at import time) should guard with `typeof document !== 'undefined'`; a module that fails to import is skipped with
   a warning and its pairs fall back to `supports()` alone (a format missing from `caps.formats` is never greyed).
   `packless` formats are never measured.
4. M: official **`js/geo/shape.js`**: `await countryShape(iso3, { neighbours, zoomOut })` and sync
   `shapeFromTopo(topo, iso3, opts)`. `silhouette.js` uses it; `f_shape.js` is now a one-line re-export kept for
   `tools/f_validators.mjs`.
5. QA backlog:
   - Reveal photo: in landscape the card sat on top of the picture (only the top of the subject showed). The runner sets
     `--rv-h` (card height) on the stage and the picture shrinks above the card, contained and centred.
   - a_e2e: `fresh()` sets the timer Off (and bgm off). Also handles non-choice rounds (maps) in pub quiz via the test hook,
     and 3-option duels.
   - Sign-in pill: `.home-top` already pads with `--br8t-account-space` (avatar no longer covers the gear). The temporary
     "Save your progress" callout still sits over the tool icons for a few seconds; it's drawn by lib/auth (not ours).
   - No-image questions on landscape/desktop: content is centred (prompt left / answers right in landscape); nothing left to fix.
   - Credits: new "Maps, music and services" panel: Natural Earth (public domain), Apple Music previews + trademark line,
     Salamander Grand Piano (CC BY 3.0) + Mutopia, US military bands (PD), PeerJS (MIT), Wikidata/iNaturalist. Virtual packs are left out.
   - **`packless: true`** on the 7 map formats: always selectable; setup shows "Built-in world map" instead of the theme
     picker; rounds load the geography packs only for flags/landmarks/refs and never fail for lack of packs.
   - mc: 4-answer games fall back to 3 answers on questions with only 2 wrong answers (kids bank) instead of finding nothing.
   - General knowledge by theme: build_index adds **virtual packs** `general~<theme>` (general questions whose `tags`
     include the theme, ≥12 questions: science, geography, history, art, music, books, animals, nature, screen) listed
     inside that theme's tree ("Science questions"). `loadPack` builds them from `general`; "All" never double-counts them.
   - Landscape reveal vs boards: match hides its prompt column and Check button under the card, connect widens its left
     column to the card width, hilo's cards shrink, quote hides the quote card (the card repeats it). Map rounds (landscape
     and desktop) put the card over the side panel, never over the map.
   - Challenges replay with their structure's rules: structures can export `replay: { cfg(spec, questions), score(res, spec) }`
     (ladder: rungs, lifelines, banked score on a fall; blitz: 60 s deadline + auto-next; survival: 3 lives).
     `js/structures/index.js` exports `replayCfg`/`replayScore`, used by `js/net/challenge.js` and `js/net/linkchallenge.js`.
6. Music: the 17 `data/music` packs are in the index under Music (+ the kids ones under Kids) and play in `listen`
   (Hits of the 1980s tested end to end: question, Apple reveal, "Keep listening"). Background music starts on the first
   tap, is paused (`busy`) for the whole listen question and resumes after. Learn's sound lab passes l_e2e (piano playing).
7. `node tools/a_bump.mjs` run at the end: BUILD `202610042022`. a_bump now also rewrites `admin.html` (it was left on `?v=1`).

**Click-through fixes** (headless Chrome 9420, 384×854, 854×384, 1280×800 @dpr1)
- Setup / party / pub-quiz sticky start bar: content showed through underneath (sticky sat above the screen's bottom
  padding). Screens with a start bar drop that padding (`.screen:has(> .start-bar)`).
- Match/order tiles broke words mid-word ("Pomerania n", "Croati a"): `overflow-wrap: break-word; hyphens: auto`, and
  order names keep a 4.5em minimum next to their values.
- Lookalike difference table overflowed the card at 384 px: fixed layout, wrapping cells.
- Continent (portrait): the map started zoomed on the Atlantic, so the pulsing country could be off-screen (Cambodia,
  Mexico). It now uses `portraitZoom: false`.
- Desktop: picture answers capped at 22vh so the grid and the card fit on one screen.
- Daily screen showed the 📅 emoji (always "JUL 17"): now 🔎. The home date badge shows the UTC date, matching the daily rollover.
- mc's second "Questions" option row renamed "Question type" (two rows were both called "Questions").
- Settings pack count and credits skip virtual packs.

## Edits in other lanes' files
- F: `js/formats/{match,order,sort,chain,connect,number,type,ladder}.js` (+`timeScale`, −`stretchTimer` call),
  `reveal.js`/`silhouette.js` (−dead `stretchTimer` call), `silhouette.js` (uses `geo/shape.js`, guards the async path),
  `blitz60.js` (`minPerPack: 2`), `fkit.js` (stretchTimer removed, ownClock simplified), `f_shape.js` (re-export),
  `match.js`/`order.js` (word-break CSS), `lookalike.js` (table CSS).
- M: `js/geo/formats/*.js` (`packless: true`), `continent.js` (`portraitZoom: false`), new `js/geo/shape.js`.
- S: `js/net/challenge.js`, `js/net/linkchallenge.js` (spread `replayCfg`, apply `replayScore`).
- L: `js/learn/data.js` `packList()` skips virtual packs and packs with no items (the field guide/flashcards/mastery
  listed "Animals questions · 0 entries" style rows for the general~ slices).
- Tools: `tools/a_cdp.mjs` reads `CDP_PORT` (overrides any lane's hardcoded port, so I could run l_e2e etc. on 9420);
  `a_e2e.mjs` (timer Off, map rounds, 3-option duel and 50:50); page imports in au_bgm/au_shell/s_*_e2e/p2p_* (live BUILD).

## Tests (after the bump, BUILD 202610042022)
- Node: a_test 449/0 (9 new lane-I checks, falsified: removing the mc fallback or the virtual-pack filter fails them),
  f_test 1,680,964/0, m_test 5433/5433, l_test 50/0, au_test all passed (6 difficulty-1 warnings), c1_test 109/0,
  c2_test all 18 packs + self-test, c2c_test 0 errors/0 warnings, p2p_test 96/0, s_unit_test ALL PASS (7), s_qr_test ALL PASS.
- Browser (cdp 9420, `CDP_PORT=9420`): a_e2e all 11 scenarios pass in portrait, landscape and desktop (landscape
  kids/survival/blitz needed a rerun once: slow Wikimedia preflight); l_e2e all 10 scenarios pass in all three viewports.
- Own click-through: all 26 formats with a real pack at 384×854, 854×384, 1280×800 (+ kids mode portrait), daily
  main/kids/map/music to results, pub quiz, party, duel, survival, blitz, ladder, Learn, settings, credits, online hub
  + one private server room (JTCQJ, solo, 1 question). No console errors; no null/undefined/NaN text.
- Browser tools that import modules in the page (au_bgm, au_shell, s_*_e2e, p2p_e2e/rate) used `?v=1`, which loads a
  second module copy after any bump; they now use the page's live BUILD.

## For QF (data, not touched by I)
- `mammals/snow-leopard`: one photo shows only the tail (seen as the picture in "Which animal is this?").
- "Unknown authorUnknown author" credits (Commons extmetadata doubled): people 10, countries 7, flags 7, explorers 3,
  actors 2, leaders 2, artists, birds, elements, gems, inventions, sea 1 each.
- `data/music/anthems.json` (AU): `facts.continent` has "Insular Oceania" ×2 and 5 items with none; there's no `ask`
  template, so mc asks "What is the continent of Japan?" and offers "Insular Oceania" as an option. Either fix the
  values + add templates, or drop `continent` from that pack's factsMeta (countries already covers it).
- quotes: "God bless Us, Every One!" → Charles Dickens; it's Tiny Tim's line. Fine as "who wrote it", odd as "who said it".

## Remaining issues
- Portrait map rounds: tall map boxes leave wide empty ocean bands above/below the world (M's layout).
- Landscape continent: the card can cover the bottom row of continent buttons after answering (the card names the answer).
- Desktop continent buttons run to the right edge of the side panel.
- Network: when Wikimedia is slow (~2 s per image) a kids picture round can lose every question to preflight and say
  "Not enough questions"; one landscape e2e run hit this and then passed on rerun.
- neighbours' `choose('correct')` test hook doesn't redraw the "0 of N found" counter (real taps do).

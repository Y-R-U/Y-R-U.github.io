# SUGGEST — suggested sets (2026-10-13)

- `js/net/suggested.js`: `SUGGESTED` (6 adult) and `SUGGESTED_KIDS` (3) — `{ id, name, blurb, timing, rounds }`, rounds in the
  host shape `{ title, format, packs, count, opts, difficulty }`. Read-only constants; loading copies them.
- `js/net/sets.js` `pickSet(kids)`: tabs ⭐ Suggested / My sets (N); opens on My sets when N > 0. Suggestions resolve with
  `suggested: true`, have no ✕. Host button is always shown: "📂 Sets". Tab CSS lives with the other set CSS in rounds.js.
- Geography fame (`js/geo/formats/common.js`): `countryLevel` replaces size-only `geo.d` as byLevel's default.
  1 = `FAMOUS` (countries pack difficulty-1 list + Greenland) unless tiny (Iceland, Jamaica → 2); size-big but obscure
  (Chad, Mauritania…) → 2; rest unchanged. `byLevel(…, kids)` → `KIDS_EASY` (16) when the view has ≥ min(min,5) of them.
  Used by map-click, flag-map, continent, city-pick. Neighbours keeps size-based levels (its border difficulty test).
- map-click: new option `ask: 'tap' | 'name'` ("Which country is highlighted?", 4 buttons / 3 kids, region view from
  `regionForCountry`). World tap rounds may ask "Tap Greenland" (playable only when it is the answer); name mode never
  uses Greenland (not a country).
- Tests: `node tools/suggest_test.mjs` (validates every round in both modes, 5 seeds, prints pools; falsified by 6 bad
  rounds), `CDP_PORT=9540 node tools/suggest_e2e.mjs OUT both` (+ device room → podium save → host load; `--no-room`).
  sets_e2e updated (button always shows; opens on My sets).

Requests / open: kids-film-tv `ask: auto` can ask "Who wrote this theme?" with performers as answers (Julie Andrews) —
AU pack data; the kids suggestion pins `ask: 'title'`. `tools/a_test.mjs` crashes in node on js/ui/toggles.js `document`
(pre-existing, from fsButton).

# Lane FAV — favourite picks

Aaron: "Save picks… a heart with 5 number circles… if you pick a music round they can quick-pick one of their favs."

## What it does
- Every place that shows a format's options (`optionsPanel` in `js/ui/setup.js`: quick/survival/ladder… setup, the pub
  quiz round builder `pqround`, the online host setup in `js/net/join.js`) now has:
  - **Quick picks** (pink "♥ Faves" strip above the theme picker): one circle per *filled* slot with an auto label
    under it (portrait) or beside it (≥600 px). One tap applies the picks instantly (panel rebuilds, mint glow, toast).
    Hidden when nothing is saved.
  - **Save control** (panel under the options): ♥ + circles 1–5. ♥ = slot 1 (Aaron: "the first one is the default
    first spot"); a number saves into that slot. A filled slot with different picks goes **armed** (yellow, ↻, wobble,
    caption "Replace 1 (80s+90s · 2s clip)? Tap ♥ or 1 again.") for 4 s instead of a popup. Identical picks say
    "Already saved in N" and are never duplicated into an empty slot. × badge or long-press (600 ms) clears, with an
    inline **Undo** for 5 s. Hover shows the slot's label in the caption; the ♥ fills and the slot gets a mint ring
    when the current picks match a saved one.
- Slots are **per format** and per mode: key `<formatId>` or `<formatId>:kids` (same split as `clued.last`).
- Saved fields are only the ones the screen shows (pub quiz/host have no timer, ladder no count): applying a fav
  elsewhere leaves hidden fields alone, and matching ignores them.
- Pack updates: `cleanFav` drops packs that no longer exist / no longer support the format / aren't kids-safe, drops
  unknown option keys and values no longer offered, clamps count, drops bad difficulty/timer. If every saved pack is gone
  it falls back to All themes; the toast says "N packs are gone". Corrupt storage reads as empty and never throws.
- Kids mode: 58 px circles, 62 px ♥, slots on their own row under the ♥ + caption.
- Labels: packs (a fully-selected theme collapses to its name, "Hits of the 1980s" → "80s", >3 → "60s+70s +2"),
  then only what differs from defaults: "20 Qs", "Hard", "2s clip", "6 answers", "Album: blurred", "Tricky mode",
  "5s timer" (timer compared with the player's own default answer time).

## Storage
`clued.favs` = `{ v: 1, slots: { '<key>': [5 × { packs: 'all'|[ids], count?, opts, difficulty?, timer?, at } | null] } }`,
added to `KEYS`/`SYNCED` in `js/core/store.js` (so cloud.js syncs it with the br8t account) and to CONTRACT storage keys.
Store API: `getFavs(key)`, `setFav(key, slot, fav)`, `clearFav(key, slot)`, `FAV_SLOTS`.

## Files
- New: `js/ui/favs.js` (UI + injected CSS, id `fav-css`), `js/ui/favmodel.js` (pure: `cleanFav`, `sameFav`,
  `favLabel`, `favKey`, `shortTitle`), `tools/fav_test.mjs`, `tools/fav_e2e.mjs`.
- Changed: `js/core/store.js` (key, SYNCED, slot API), `js/ui/setup.js` (`optionsPanel` rebuilds itself on apply,
  calls `changed()` on every pick; new option `favs: false` to opt out; option rows carry `data-opt=<key>`).
  One small kids nuance: `kidsDefault` now only overrides an option the saved picks don't hold (was: whenever no opts saved).
- `js/structures/pubquiz.js`: one-line fix, the round-name input is `display: block` (it was inline, so on desktop it
  ignored the centred 560 px column and ran from the left edge). No other structure or `js/net/` edits were needed:
  both screens use `optionsPanel`.

## Tests
- `node tools/fav_test.mjs` — 46 checks: slots independent/per format/per kids, overwrite, clear, out-of-range, invalid
  favs refused, corrupt JSON survives, SYNCED + CONTRACT, pack/option cleaning, matching (order-insensitive, hidden
  fields ignored), labels. Falsified: removing the SYNCED entry, clearing all slots, skipping the pack filter,
  order-sensitive matching and an unguarded storage root each fail it.
- `node tools/fav_e2e.mjs <outDir> portrait|landscape|desktop` (CDP 9430, cache disabled) — 25 real-click checks, pass in all
  three: listen round → pick 80s+90s + 2s clip → ♥ (slot 1) → 6 answers → slot 3 → reload → quick-pick 3 applies packs +
  options → change clip → slot 1 arms, second tap replaces → × clears 3 → Undo → long-press clears 3 → pub quiz
  "+ Add round" → listen → quick-pick 1 → saved round carries the picks → Online → Host → listen → quick-pick applies →
  stale fav with a deleted pack + bad clip applies gracefully → kids: ♥ saves to `listen:kids`, duplicate refused, 58 px targets.
- `node tools/a_test.mjs` 449/0; `a_e2e` all 11 scenarios portrait, quick/picker/kids/ladder/pubquiz landscape (CDP 9430).

## Open / ideas
- Pub quiz "Surprise me" doesn't use favourites (could prefer a music fav for the music round).
- The quick-pick strip sits above the theme picker; on the long listen setup the save control is a scroll away (by design:
  pick, then save).

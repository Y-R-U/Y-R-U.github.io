# Flashcards rework (Learn tab)

Why: Aaron picked only Snakes and was shown songs and flowers. "Review" pulled in every due card from every pack,
including cards auto-added from missed game questions. Items without a photo were shown as "Name → facts", so the
front of a song card was its own title, and "Show answer" just repeated it.

## What changed
| file | change |
|---|---|
| `js/learn/face.js` (new, pure) | `cardFace(pack, item, {kids})` picks the front: **picture** if the item has one (plus a Sound button when it has audio too); otherwise **▶ Listen** for audio (songs, anthems, calls, instruments, piano); otherwise a **text prompt**: the easiest non-letter clues, a quote, the summary, the blurb or a fact line ("A 1972 hit by Gilbert O'Sullivan"), with every form of the name (name, lname, alt) blanked as `____`. A candidate that still contains the answer after redaction (accent variants, partial forms) is dropped. Returns null when nothing usable is left, and that item is skipped. Kids only get picture and sound cards. `mcOptions()` returns 4 options (3 for kids) from the same pack, using a lookalike and a same-group item first (not for kids), with names deduped. |
| `js/learn/srs.js` | Added a `hard` grade (keeps the box, at least 1, and repeats that box's interval), `studyQueue` (due cards from the chosen packs only, then new cards round-robin under a **10-per-pack** daily cap), `cramQueue` (for "Study anyway": unseen first, then low boxes, then oldest review), `packCounts`, `packOf`. |
| `js/learn/model.js` | `clued.cards` gains `study: 'mc'|'flip'` (default mc), `feed` (default true), `newBy: {pack: n}` (reset daily). The old `mode` field is dropped. `recordGame` only adds missed-question cards when `feed` is on (mastery is always recorded). `deckCounts`, `indexTotals`, `dueCount`. `badgeCount` = all due + today's new cards in the selected packs, kids-aware. |
| `js/learn/cards.js` | Rewritten. **Setup:** "Study: [chips of selected packs ×]", a Multiple choice / Flip toggle, a primary "▶ Study Snakes" (the subline says "N due + M new · only from this pack"; with nothing due it becomes "Study Snakes anyway"), and a secondary "Review all due (N)" that says it mixes every pack, including game misses. Pack chips show per-pack "N due · M new", there's a Clear link, and the setting "Add missed game questions to flashcards" sits at the bottom. **Session** (`l-review` params `{packs, cram}` or `{all:true}`): the mode toggle sits in the top bar and can be switched mid-session. MC: a correct first pick grades **Good**, a wrong one grades **Again**, the right option is highlighted and the back shown, then Next (Enter/Space); "Just show me the answer" reveals it and offers Again/Hard/Good/Easy. Flip: Show answer, then Again/Hard/Good/Easy (keys 1–4). An "Again" card comes back once later in the session. Audio cards auto-play through AU's clip player (via `ui.js playAudio`, so bgm pauses through the busy bus); "Need a hint?" shows the redacted text clue. With nothing due or new in the chosen packs, the session falls back to "extra practice". |
| `js/learn/guide.js` | A single-pack field guide has a "🃏 Flashcards for this pack" button (kids: "Play flashcards") that opens that pack's session straight away. |
| `js/learn/index.js` | The Learn hub's review button now opens the Flashcards screen (deck choice), not a mixed review. |
| `css/learn.css` | Flashcards section rewritten: segmented toggle, selection chips, per-pack counts, big Listen button, text clues, answer panel, and compact revealed cards (portrait hides the unpicked options and scrolls Next into view; in short landscape the photo moves to a thumbnail floated beside the name; desktop uses a 2-column card + answers layout). Kids get bigger options, ask text and play button. |

Kids: the picker only lists packs with pictures or sounds and kid items. MC has 3 options and FLIP has 2 buttons. The question is read aloud, the name is read on reveal, stars and stickers work as before, and a session has 12 cards. A due card for an item that has no kid face (e.g. a missed capital) falls back to the grown-up text front.

## Tests
- `node tools/cards_test.mjs [-v]`: builds a card for every item in every pack (data/packs + data/music; adult and kids sets). It checks that every card has a usable front, that no front shows the name/lname/alt (case- and accent-insensitive, names of 4+ characters), and that MC options are valid (answer present, right count, distinct). It also fails if more than 1% of adult items are skipped. Current result: 5777 cards (3646 picture, 1056 sound, 1075 text), 0 adult skips, 267 kids skips (text-only kid items), 17332 checks pass. Falsified three ways: no redaction (891 fails), a name-only text front (335), and dropping the answer from the options (5777).
- `node tools/l_test.mjs`: now 60 checks. The new ones cover hard, study queue selection, round-robin, per-pack cap, review-all, cram order and per-pack counts. Falsified: ignoring the selection (5 fails), ignoring the per-pack cap, hard = good, and reversed cram order each fail it.
- `CDP_PORT=9470 node tools/l_e2e.mjs <out> portrait|landscape|desktop` (port is now an env var, default 9404). New or rewritten scenarios:
  - `cards`: seeds a due song plus a due flowers game card, selects Snakes only, and checks that every card in both modes is a snake. It checks that a right MC pick is Good, a wrong one is Again, show-answer → Easy, switching to flip mid-session works (Hard, mode remembered), and no front leaks the answer.
  - `music`: hits-1970s with a Listen button, auto-play starts, and the title is hidden on the front and in the hint.
  - `reviewall`: a 4-pack mix, the mix note, and the separate count.
  - `guidecards`: the field guide button.
  - `kids`: 3 options, a picture card, 2-button flip, a sound pack, and text-only packs hidden.

  All pass at all three viewports. With the old behaviour (selection ignored) `cards` fails with "only snake cards: flowers/sunflower, hits-1970s/alone-again…".
- `node tools/a_test.mjs`: 467 passed.

## Notes / open
- Kids text-only items (books, capitals, words…) never become new kid cards.
- `js/core/stats.js` has an unused `recordStudy({cards, right, packs, kids})`. If A wants flashcard sessions in the stats history, `finish()` in cards.js is the place to call it. I didn't wire it because it isn't documented.
- Per-pack new counts on the chips come from index item counts. They can overstate slightly when a pack has a few items with no usable front (none for adults today).

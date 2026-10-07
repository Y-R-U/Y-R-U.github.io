# Lane STATS — proper play statistics

Aaron: the home line "9 games · 105/128 right · best streak 14" never changed after online games and didn't say what
it meant. Now every finished game in every mode is recorded with detail, the home line is a rotating, tappable
highlight, and there is a full stats page (home line, home footer "Stats", Settings → "Your stats").

## Files (new)
- `js/core/stats.js` — `summarize(mode, runnerResult, extra)`, `applyGame(stats, summary)` (pure), `recordGame(summary)`,
  `recordStudy({cards, right, packs, kids, mode})`, `trackRoom(st, code, via)`, `roomSummary`, `statsView`, `highlights`,
  `resetStats`, `markPlay/playSecs` (game wall clock).
- `js/ui/statsline.js` — home highlight (rotation counter in `clued.statsTip`, device-only) + the play-clock screen hook.
- `js/ui/statspage.js` + `css/stats.css` (loaded on demand) — the `stats` screen.
- `tools/stats_test.mjs` (node), `tools/stats_e2e.mjs` (CDP 9480, real clicks), `tools/stats_room_e2e.mjs` (local Go server + Chrome 9480).

## Edited (A/I shell files)
- `js/core/store.js`: removed the old totals-only `recordGame` (one recording path now).
- `js/ui/results.js`: records every results-screen game (quick, survival, blitz, ladder, daily incl. kind/day/replay,
  party, pub quiz, **duel** — previously skipped) via `recordGame(summarize(...))`.
- `js/ui/home.js`: `statsLine(kids)` replaces the old line; footer gains "Stats".
- `js/ui/settings.js`: "Your stats → 📊 Open" row. `js/main.js`: imports `ui/statspage.js`. `css/screens.css`: `.stats-line` pill.

## Hook lines in other lanes' files (exact small edits)
- **TIMING** `js/net/room.js`: `+import { trackRoom } from '../core/stats.js?v=…';` and in `onState` after `ctx.st = st;`:
  `+trackRoom(st, code, via);` — covers server and P2P (device-hosted) rooms; records once at `phase === 'final'`.
- **TIMING** `js/net/challenge.js`: `+import { recordGame, summarize, playSecs } …`; in `run.done` after the aborted check:
  `+recordGame(summarize('challenge', res, { spec: c.spec, kids, secs: playSecs() }));`
- **TIMING** `js/net/linkchallenge.js`: same import; after `const rank = …`:
  `+recordGame(summarize('linkchallenge', res, { spec: p.s, kids, secs: playSecs(), players: shown.length, placing: rank }));`
- **CARDS** `js/learn/cards.js`: `+import { recordStudy } …`; in `finish()` after `sfx('fanfare');`:
  `+recordStudy({ cards: total, right, kids, packs: Object.keys(packs), mode: getCards().study });`
  (MC mode: `right` = answered right; Flip: = remembered. Duration from the play clock: the `l-review` screen opening.)

## Storage (`clued.stats`, cloud-synced, additive to the old fields)
Old fields stay and keep counting (`games answered correct bestStreak best daily kidsStars`), so cloud.js `describe`,
stickers and the daily screen are unchanged. New, compact:
```
v: 2
m  { mode:  [games, answered, correct, points, bestScore, bestStreak, seconds, wins, podiums] }
f  { format: [games, answered, correct, points] }   th { theme: … }   pk { pack: … }
kt { theme: kidsGames }   sd [sessions, cards, right, seconds]   dd { 'YYYY-MM-DD': kinds bitmask (main 1, kids 2, map 4, music 8) } ≤120 days
h  [newest first, ≤200] { t (unix s), m, f[], pk[], th[], d, k, x (not counted), p, s, n, pl, v ('p2p'), dk, r (daily replay), rk (room hash), sm (study mode), q, c, du (s) }
```
- **Migration**: nothing is rewritten. "Earlier games" = old totals − sum of the mode rows (never negative), so the
  existing 9 games / 105 of 128 show as "Earlier games (before detailed stats)", and games recorded by an older client on
  another device land there too instead of vanishing. Reading never writes (a boot write would move `savedAt` and beat a
  newer account save).
- **Cloud**: localsync mirrors the raw string and newest `savedAt` wins wholesale; nothing compares JSON. Room results
  carry `rk` = hash(code:game:playerId) so a refreshed/re-sent final records once. Size: 500 games + 40 study sessions
  = **34.7 KB** (history capped at 200; test budget 48 KB of the 1 MiB Firestore doc shared with mastery/cards/favs).
- Modes: quick survival blitz ladder daily pubquiz party duel online challenge linkchallenge study.

## Decisions
- **Party / pub quiz teams / duel on one phone: Player 1 is "you".** Only their answers count towards accuracy/topics;
  placing among the players is recorded. The glossary says so ("put yourself first"). Duels count as games and wins but
  never towards accuracy (a duel point = first right answer, not just right).
- Online: answered = questions from the one you joined; per-format results come from each reveal state (`you.last`);
  win = 1st with ≥2 players, podium = top 3 with ≥3 players. No names or room codes stored.
- Time played = first question (screen open after preflight) → results; online = first question state → final.
- Daily streak = consecutive UTC days with any daily; it runs to yesterday until today's is played.
- Reset (inline confirm, no popup) clears games/history/rows; keeps kids stickers and daily results (the daily screen needs them).
- Kids page: stars, sticker shelf, games / right-in-a-row / daily days, favourite topics, kids games list, "Grown-up stats ›".

## Tests
- `node tools/stats_test.mjs` — 63 checks: aggregation, party/duel rules, migration (no writes on read), cap 200 +
  size budget, cloud key-order / old-client / adopted-save / sticker-writer merge behaviour, room de-dup, daily streak +
  calendar, room tracking from state sequences (late joiner, p2p), highlights, reset, hook wiring. Falsified against
  broken copies (no cap, party counts everyone, no dedupe, read path writes, negative earlier, streak needs today):
  each fails (`STATS_MODULE=js/core/<copy>.js`).
- `CDP_PORT=9480 node tools/stats_e2e.mjs <dir>` — 27 checks: seeded old totals, real quick game, daily, link challenge,
  home highlight + rotation, stats page tiles/rows/details/sort/tabs, inline reset, Settings entry, kids page, empty
  state; no horizontal overflow at 384×854, 854×384, 1280×800.
- `node tools/stats_room_e2e.mjs <dir>` — local server room, host taps answers, API player; podium records one online
  game (n 2, placing), no code/names stored, refresh doesn't double. Fails with the room.js hook commented out.
- Real flashcard session via `l_e2e cards` records `{m:'study', sm:'flip', q:10, c:10}`.

## Open
- Highlights are only as interesting as the data: "You're N% on X" needs ≥60% and ~8 answers on a topic.

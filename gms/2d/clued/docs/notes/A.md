# Lane A — shell + framework

## Format author guide (F, M, AU, anyone adding a format)

A format is one ES module that registers itself. Put it in `js/formats/<id>.js` (F), `js/geo/formats/<id>.js` (M) or
`js/audio/listen.js` (AU), then **append its path to `MODULES` in `js/formats/index.js`** (relative to that file, e.g.
`'../geo/formats/map-click.js'`) and say so in your notes. Modules load with `Promise.allSettled`, so a broken format
logs an error and the game still boots.

```js
import { register, poolItems, pickPack, distractors, byDifficulty, imageOf, hasImg, fill, factText,
         placeAnswer, collect, spreadApart, pick, shuffle, sample } from './registry.js?v=1';   // ../../formats/registry.js?v=1 from js/geo/formats
import { layout, choiceGrid, typeBox, mediaBox, h, onKey } from '../ui/kit.js?v=1';
import { fuzzyMatch, answersFor } from '../core/fuzzy.js?v=1';

export default register({
  id: 'odd', title: 'Odd one out', icon: '🧩', blurb: 'Spot the one that does not belong',
  tags: ['choice'],          // optional: 'choice' (options + numeric answer: Duel can use it), 'map', 'music' (daily map/music
                             // challenges and pub quiz rounds pick these), 'slow' (kept out of Blitz), 'nodaily'
  kids: true,                // optional: suits Kids mode (sorted first in the kids format grid, used by the kids pub quiz)
  options: [                 // rendered by the setup screen; values go to generate() as opts and to render() as api.opts
    { key: 'answers', label: 'Answers', type: 'choice', values: [3, 4, 5], default: 4,
      kidsValues: [3], kidsDefault: 3 },          // optional kids restrictions
    { key: 'hard', label: 'Tricky mode', type: 'bool', default: false, kidsHide: true },
  ],
  supports(info) { /* info = data/index.json packs[id]: { title, theme, kids, items, questions, caps } */
    return info.caps?.groups >= 2 ? true : 'Needs items with groups';   // a string = greyed out with that reason
  },
  generate({ rng, packs, count, opts, difficulty, kids, avoid, round, spec }) {
    // packs: loaded pack objects. In kids mode they are already filtered to child-friendly content (see below).
    // difficulty: 0 mixed, 1 easy, 2 medium, 3 hard. kids: true in Kids mode (difficulty is then 1).
    // Use ONLY rng for randomness: same spec + same packs must give the same questions (daily, online, challenges).
    return collect(count, () => makeOne(rng, pickPack(rng, packs), opts, difficulty), avoid);
  },
  render(el, q, api) {
    const { answersEl } = layout(el, { prompt: q.prompt, media: q.media });   // media left / answers right in landscape
    const grid = choiceGrid(answersEl, q.options, { onPick(i) {
      grid.lock(); grid.mark(q.answer, i);
      api.answer({ correct: i === q.answer, given: i });
    } });
    return {
      destroy: () => grid.destroy(),                  // required
      timeout() { grid.lock(); grid.mark(q.answer, -1); },   // optional: time ran out, lock and show the answer
      eliminate(k) { grid.eliminate(q.answer, k); },  // optional: the 50:50 lifeline (Ladder)
      hint: () => 'It lives in water',                // optional: the hint lifeline (else q.hint is shown)
      choose(x) { /* test hook: x = 'correct' | 'wrong' | index */ },
    };
  },
});
```

**Question** (must be JSON-serialisable; online rooms ship it):
`{ format, id, prompt, media?, options?, answer, answerText?, explain?, refs: ['pack/item'], hint?, timeLimit?, data?, pack? }`.
- `id` must be deterministic and unique per question (`'odd:snakes/taipan:…'`). The shell de-duplicates across rounds via `avoid`.
- `answerText` is what the reveal shows as the right answer. Set it whenever `answer` isn't an option index or a boolean.
- Media anywhere in the question (`media.img/audio`, `options[].img`, `data.anything.img`) in the
  `{ src, credit, license, page }` shape is found by preflight and the credits ⓘ automatically. Add `lazy: true` to skip preflight.
- `timeLimit` (ms) is only a fallback hint; the player's chosen answer time wins.

**api** passed to render: `answer({ correct, points?, given, detail?, partial? })` (call once; omit `points` and the runner
scores it: 100 untimed, `100 + 400 × remaining/limit` timed, × streak bonus), `timer { start(ms), remaining(), stop(),
pause(), resume(), limit }` (set `manualTimer: true` on the format to start it yourself), `sfx(name)`, `haptic(kind)`,
`preload(urls)`, `speak(text)`, `reveal(html)` (extra HTML in the reveal card), `opts`, `mode` ('solo' | 'party' |
'online' | 'challenge'), **`api.kids`** (true when this question is in Kids mode: make it bigger, picture-first,
2–3 answers, gentler) and **`api.difficulty`** (0–3).

**Helpers in registry.js:** `poolItems(packs, filter)` → `[{pack,item,ref}]`; `distractors(rng, target, pool, n, {keyFn, reject})`
(lookalikes first, then same `group`, then same pack; `reject(item)` excludes items that would also be correct);
`byDifficulty(list, d, min)` (widens the band when too few); `spreadApart(cands, valueFn, n, ratio)` (numeric options at
least `ratio` apart so "which is biggest" is never a coin toss); `placeAnswer(rng, right, wrong)`; `fill(tpl, {name, lname,
value, label})` with `{name} {lname} {aName} {value} {lvalue} {aValue} {label} {llabel}`; `factText(meta, v)`;
`imageOf(item, rng)`; `article(word)`; `collect(count, make, avoid)`; `defaultOpts(fmt)`; `supportsPack(fmt, info)`.
Scoring helpers for custom formats are in `js/core/scoring.js` (`clueLadderPoints(shown, total)`, `pinDropPoints(km, kmPerPoint)`).
Typed answers: `fuzzyMatch(input, [name, ...alt])` (diacritics, articles, typos scaled by length; numbers must match exactly).

**Kids mode, for free:** when a round is in Kids mode, `buildQuestions` hands `generate()` a *view* of each pack holding only
items/questions with `difficulty: 1`, `facts.kids: true` or from a `kids: true` pack. Packs with `kidsSafe: false` are
excluded entirely. Your format still gets `kids: true` to tune itself (fewer answers, pictures, slower reveal).

**Pack fields mc/tf read (proposed additions to CONTRACT, all optional):** `pack.imgPrompt` / `item.imgPrompt` ("Which of these
is {aName}?"), `nameImgPrompt` ("What animal is this?"), `tfImgPrompt` ("This is {aName}."), `item.lname` (lower-case
form for templates, e.g. keep "African" capitalised); in `factsMeta[key]`: `ask` ("What is the capital of {name}?"),
`askReverse` ("{value} is the capital of which country?"), `askBool`, `askHigh`/`askLow` (num), `stmt` (true/false
statement, e.g. "The {lname} is {aValue}."), `minRatio` (num spacing, default 1.5), `exclusive: false` (a `cat` fact
whose items can have several true values, e.g. range: mc/tf then skip it, because a "wrong" option could be right),
`showImg: true` (show the item picture on fact questions). Without templates the generic wording is clunky, so please add them.

## What's built

- **Core** `js/core/`: `rng.js` (hashString, mulberry32, pick/shuffle/sample/weightedPick), `store.js` (settings/stats/last,
  daily `last >= today` UTC rule, `ANSWER_TIMES`), `cloud.js` (syncLocalKeys gameId `clued`, keys settings/stats/mastery/cards,
  callout nudge, `canPester` only on home/results/daily/pub-builder/online/learn screens), `scoring.js`, `timer.js`, `media.js`
  (preflight with progress, one retry, spare swap), `packs.js` (index loader; falls back to scanning `data/packs/` when
  `data/index.json` is missing or empty; lazy pack loading; `computeCaps`), `fuzzy.js`, `spec.js` (GameSpec → questions,
  'all' samples up to 8 supporting packs by seed, kids filtering).
- **Formats**: registry + `mc` (explicit questions, picture→name, name→pictures, cat facts, reverse cat facts, bool facts,
  numeric extremes) and `tf` (explicit, picture claims, bool and cat fact statements).
- **Structures** `js/structures/`: runner, session (prepare/preflight/play screen), quick, survival (3 lives), blitz (60 s),
  ladder (15 rungs, safe rungs 5 and 10, 50:50/skip/hint), daily (UTC seed; main, kids, map, music variants; share grid),
  party (2–8, per-player kids toggle, pass-the-phone cards), duel (portrait: top half flipped; landscape: left vs right;
  keys 1–6 and 7–=), pub quiz (builder, surprise me, kids quiz preset of 4×5, jokers per player, round cards).
- **UI** `js/ui/`: screen manager with back stack + hardware back (quit confirm in games), home with Kids toggle,
  format grid, setup (theme picker tree, count 5/10/20/custom, format options, difficulty, answer time Off/3/5/10/15/20/30 s),
  HUD (progress, score, streak, lives, answer ring, read-aloud), reveal with credits ⓘ, results (confetti, stickers, review,
  challenge button from lane S), settings, credits page, styled popups and toasts, share sheet, read-aloud (speechSynthesis).
- **Kids mode**: profile toggle (home + settings, synced), brighter skin, ≤3 picture-first answers, no timer by default
  (optional 20/30 s), no lives lost, kind reveal wording, stars → 24 stickers (`clued.stats.kidsStars`), auto read-aloud,
  kids Daily seed `daily-kids:YYYY-MM-DD`, kids pub quiz preset.
- `index.html`: inline boot guard (errors + rejections on the loading screen, Reload = `pathname + '?v=' + Date.now()`, 12 s backstop).
- `data/packs/_dev.json`: 10 animals + 10 countries with Wikimedia images (licences checked, no GFDL), facts, clues, 20 questions. **C lanes: delete it when real packs land.**

## Runner API (lane S: online rooms and challenge links)

```js
import { createRunner } from '../structures/runner.js?v=1';
const run = createRunner(hostEl, {
  questions,                 // Question[] (this array may be mutated, e.g. spliced, while running)
  mode: 'online', kids: false, difficulty: 0,
  timer: 10,                 // seconds (0 = off) or boolean (true = settings default length)
  timeLimit: 10000,          // ms, overrides `timer` seconds
  now: () => Date.now() + offset,          // server-synced clock used for deadlines/countdowns
  deadlineFor: (i, q) => absMs,            // count each question down to an absolute server time (0 = local timer)
  limitFor: (i, q) => ms,                  // full length for the ring when using deadlineFor
  lives: 3, deadline: 60000, lifelines: ['fifty', 'skip', 'hint'],
  players: [{ name }], playerOf: i => idx, // multi-player scoring per question
  before: async (i, q, state) => {},       // e.g. handoff card or "Question 3" countdown before showing
  onQuestion: (i, q, state) => {},
  onAnswer: (rec, state) => {},            // rec = { i, qid, format, round, correct, points, given, detail, ms, streak, player, timeout, skipped }
  scoreFn: (res, q, state) => points,      // override base points (streak bonus still applies unless noStreak)
  noStreak: false, multiplier: (i, q, state) => 1,
  waitNext: async (i, rec, state) => {},   // external "next" signal; replaces the Next button
  waitLabel: 'Waiting for the host…',
  revealExtra: (rec, state) => html | Node, // e.g. live scoreboard in the reveal card
  stopWhen: state => bool, autoNext: ms | (rec, state) => ms, label: (i, q, state) => 'HUD text', total: 15,
  onQuit: () => {}, quit: true,
});
run.done        // Promise<{ reason, aborted, score, correct, answered, total, answers, bestStreak, stars, players, questions }>
run.next()      // advance; if unanswered, records a skip first
run.timeUp()    // external "time up": locks input, records a timeout
run.setDeadline(absMs, limitMs)   // move the current question's deadline
run.countdown(secondsOrAbsMs, 'Next question in')   // "Next question in 3…" bar in the reveal card; resolves at zero
run.stop(reason) · run.guard() · run.state · run.current() · run.controller() · run.answer(x)
```
Shell context for other lanes: `window.__cluedCtx` = `{ go, back, reset, header, defineScreen, current, h, popup, toast,
confirmPop, handoff, shareText, sfx, haptic, confetti, createRunner, prepare, playSpec, buildQuestions, makeSpec,
preflight, urlsOf, swapFailed, registry, packs, store, structures, results(params) }`.
Boot routes: `?join=CODE` → `net.joinRoom(code, ctx)`, `?c=ID` → `net.openChallenge(id, ctx)`, `#lc=…` →
`net.openLinkChallenge(hash, ctx)`; Online tile → `net.openOnline(ctx)`; results → `net.createChallenge(ctx, { spec, questions, score, answers })`.
Learn tab → `import('js/learn/index.js').openLearn(el, ctx)` rendering into the 'learn' screen (coming-soon fallback).

## How to test

- `node tools/a_test.mjs` — rng, scoring, fuzzy, mc/tf generation (determinism, option shape, capital/num correctness), kids filter. 440 checks; verified to fail when scoring, fuzzy or mc numeric logic is broken.
- `~/.claude/bin/cdp start --port 9401`, then `node tools/a_e2e.mjs <outDir> portrait|landscape|desktop [scenario,…]` —
  real clicks through quick, theme picker, kids, survival, blitz, ladder, daily (determinism + recorded), party, pub quiz,
  duel, settings/credits/learn/online. All pass in all three viewports.
- Hooks: `window.__clued.start({ structure:'quick', format:'mc', count:5 })` or `start(spec)`, `answer('correct'|'wrong'|i)`,
  `next()`, `state()`, `canPester()`. `?test` (or `?noauth`) skips the account layer.
- `node tools/a_bump.mjs [build]` rewrites `js/build.js` and every `?v=<old>` in index.html/css/js (all lanes). Manager only.

## Open issues

- Only `_dev` content tested; generic fact wording depends on packs adding `ask`/`stmt` templates.
- Desktop/landscape no-media questions leave empty space above; acceptable, not beautiful.
- The account avatar's callout pill overlaps the home gear while showing (it is temporary and dismissable).
- Ladder and blitz challenges via lane S replay as plain runs (structure-specific scoring isn't shipped in the spec).

## Requests

- **C1 (build_index/c1_schema):** please add `caps.qkinds: { mc: n, tf: n, number: n, order: n }` (question counts by kind) so
  formats can grey out precisely; and pass through pack `kidsSafe` (false for snakes/spiders/etc. if they shouldn't appear in Kids mode).
- **C1/C2:** add `factsMeta` templates (`ask`, `askReverse`, `askBool`, `askHigh`/`askLow`, `stmt`), `exclusive: false` for
  multi-valued cat facts, `item.lname` where the lower-cased name would be wrong, and `imgPrompt`/`nameImgPrompt` per pack.
- **F/M/AU:** tag formats (`choice`, `map`, `music`, `kids`, `slow`) so Duel, Blitz, the daily map/music and pub quiz pick them up.
- **S:** the runner now has `deadlineFor`/`now`/`setDeadline`/`timeUp`/`countdown` for the server-driven answer time and gap;
  `timer` accepts seconds. `run.next()` already handles "host advanced before I answered".
- **L:** export `openLearn(el, ctx)` from `js/learn/index.js`.
- **AU:** sfx names used: correct, wrong, streak, timerLow, button, reveal, fanfare, join. Settings passed to `applySettings`:
  `{ sound, muted, musicVolume }`.

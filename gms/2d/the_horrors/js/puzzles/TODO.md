# Puzzle Task TODO

Shared puzzle code lives in `js/puzzles/` and must stay byte-identical between:

- `/Users/aaronair/cc/yru/site/gms/2d/awake/js/puzzles/`
- `/Users/aaronair/cc/yru/site/gms/2d/the_horrors/js/puzzles/`

Edit one, `cp` to the other, then `diff -rq` the two directories.

## Roster (15 live types)

Every run still generates exactly two challenges: one from the run location, one
from the run threat. The pools are:

**Location pool** (needs `ctx.location`; the first two also need `ctx.imageChoices`)

| type | verb | scales by |
|---|---|---|
| `image_tiles` | reassemble the room still from swapped pieces | grid 3x3 → 4x4, scramble depth, swap budget |
| `mirror_check` | tap the tiles of the room still that are flipped / rotated | grid, how many are wrong, flip vs 180° turn |
| `steady_hand` | drag along a corridor without touching the walls | bends, corridor width, strikes |
| `lock_deduce` | mastermind: guess a mark order, told only exact/misplaced | mark count, attempts, own clock |

**Threat pool** (needs `ctx.threat`; the first also needs `ctx.imageChoices`)

| type | verb | scales by |
|---|---|---|
| `find_the_face` | find the face hidden in a room still | peak opacity, face size, tap tolerance |
| `signal_echo` | Simon: it plays a pattern, you answer, it grows | rounds, start length, playback speed |
| `hold_still` | hold your breath while the presence is near, breathe in the gaps | passes, air drain vs refill, grace ticks |
| `dont_look` | tap the figure the instant it appears in an opening | openings, appearance window, misses allowed |

### Pack types

Shipped as separate files (see **Puzzle packs**), registered through the same
`register()` call as the built-ins and indistinguishable from them at runtime.

**`pack-sight.js`** — all three need `ctx.imageChoices`, and all three draw their
own targets over the still, so a near-featureless room (and a 404) stays playable.

| type | pool | verb | scales by |
|---|---|---|---|
| `blink_change` | threat | the room blacks out; find the one mark that changed | grid, marks, rounds, blackout length |
| `light_seam` | location | stop a travelling seam of light inside a band | strips, band width, sweep period |
| `dark_sweep` | threat | drag a pool of light to find marks before it drains | marks, light radius, drain rate |

**`pack-descent.js`** — a weight on a line and a row of lights; no technology named.

| type | pool | verb | scales by |
|---|---|---|---|
| `soft_landing` | location | lower a weight down a shaft and set it down quietly | gravity, grip, quiet threshold, gusts |
| `interceptor` | threat | catch falling pieces before they put your lights out | lights, pieces, fall time, catch radius |

**`pack-volley.js`** — fixed 1/120s timestep, so behaviour matches on any display.

| type | pool | verb | scales by |
|---|---|---|---|
| `swarm_line` | threat | hold the bottom line while the threat comes down in pieces | formation, descent speed, bar width, dives |
| `breach_wall` | location | clear a wall by rebounding a loose piece off a bar | wall size, ball speed, bar width |

`TUNING` at the top of `puzzles.js` holds the whole easy/medium/hard table — one
block per puzzle, so difficulty changes board size, tolerance and strike budget,
not only the clock. A block may carry its own `seconds` (only `lock` does) when
the shared clock does not suit it.

### lock_deduce numbers

3 slots at every difficulty; 4/5/6 marks and 6/5/5 attempts on easy/medium/hard,
with 55/50/45 s of its own clock. The answer never repeats a mark and the legend
says so, which cuts the space a reasoning player searches from marks^slots
(64/125/216) to 24/60/120 arrangements. A consistency-only solver — one that
keeps every candidate matching the feedback so far and guesses one at random,
i.e. weaker than optimal play — finishes inside the attempt budget 100 / 100 /
99.8 % of the time, averaging 3.0 / 3.3 / 3.7 guesses. The clock, not the
attempt count, is the real pressure: 3 slots keeps a guess down to ~7 taps.

### find_the_face

The hidden shape is a face, not a blob: a lit head mass carrying its own shadow
halo, two dark sockets and a mouth, with seeded proportions (`face` in the
descriptor: `tilt squash gap eyeY eye mouthY mouthW mouthH`). The halo is what
makes it survive both a bright room and a dark one. It is nearly invisible at
the bottom of the breathe cycle and unmistakable at the top.

## Scrapped in the 2026-08 rewrite

`code`, `code_order`, `sequence_repeat`, `memory_grid`, `pressure_order`,
`dial_align`, `symbol_equation`, `wire_match`, `word_order`, `merge_2048`,
`spot_difference`.

Reasons: four of them were the same "memorise then repeat" puzzle; `dial_align`
displayed its own answer; `wire_match` paired each symbol with itself;
`merge_2048` was a 2048 clone with no connection to either fiction;
`word_order` was dead code (in the samples list but never generated).

`LEGACY` in `puzzles.js` remaps any of those descriptors found in an old save to
a live puzzle seeded from the same data, so a mid-run reload never hands the
player an empty board that costs a turn.

## Theming

`puzzles.css` reads **only** from the host game's `:root` custom properties
(`--ink --muted --dim --cyan --green --red --gold --line --glass --glass-strong
--bg --shadow`), re-exported as `--pz-*` with literal fallbacks. Tints are
derived with `color-mix()`, each preceded by a flat rgba fallback declaration.
Awake resolves cold cyan; The Horrors resolves warm sepia. There is no
per-game colour code anywhere in the module.

Per-run flavour is entirely `ctx`-driven, so nothing here breaks The Horrors'
diegesis-neutral rule: `location` fills the location prompts, `threat.name` /
`threat.label` / `threat.clue` fill the threat prompts, kicker line and the
italic whisper under the prompt.

## Runtime contract

- `window.HubPuzzles.createChallengeGroups(ctx)` → 2 groups, plain data only.
- `window.HubPuzzles.start(puzzle)` → Promise `{success, reason}`; cancel adds
  `noPenalty: true`.
- `window.HubPuzzles.samplePuzzles(ctx)` → one sample per registered type,
  used by the `?debug` panel's "Mini-game samples" section. Packs appear here
  with no extra wiring.
- `window.HubPuzzles.register(type, def)` → see "Puzzle packs" below.
- `window.HubPuzzles.registered()` → the registered type names, in order.
- `window.HubPuzzles.scoreLock(guess, answer)` → `{exact, near}`, the pure
  lock_deduce scorer, exported so `test-lock.mjs` can hammer it.
- Generated challenge objects stay JSON-serialisable — no functions — because
  they are persisted in `localStorage` and must survive a reload.
- Solving completes the task without spending a turn; timeout or failure costs
  one turn; backing out costs nothing.
- `ctx` fields consumed: `gameId`, `runKey`, `difficultyId`, `location`,
  `facility`, `threat{id,name,label,clue}`, `imageChoices[{src,label}]`.

## Puzzle packs

Further mini-games ship as separate files loaded **after** `puzzles.js`. A pack
registers itself; nothing in `puzzles.js` needs editing, and a registered type
is indistinguishable from a built-in — the 8 built-ins register through the
same call.

```js
window.HubPuzzles.register("candle_watch", {
  pool: "location",          // "location" | "threat" | "both"
  label: "Keep the candle lit",   // button label in the challenge list
  needsImage: true,          // optional: skipped when ctx.imageChoices is empty
  generate(seed, tune, ctx) {
    // ctx: the run ctx plus { image, location, threat }. tune is the
    // difficulty block (tune.seconds, tune.strikes, plus per-puzzle blocks).
    return {
      type: "candle_watch",  // must match the registered type
      title: "Keep It Lit",
      kicker: ctx.location,
      prompt: `Something in ${ctx.location} keeps blowing it out.`,
      image: ctx.image,      // only if you asked for needsImage
      seconds: tune.seconds,
      strikes: tune.strikes,
      seed,
    };
  },
  render(puzzle, api) {      // same contract as RENDERERS[type]
    api.body.innerHTML = `<button class="pz-mini" type="button">shield it</button>`;
    api.body.querySelector("button").addEventListener("click", () => api.win("LIT"));
  },
});
```

Rules the registry enforces:

- Descriptors are round-tripped through JSON before use — they are persisted to
  `localStorage`, so functions and other non-JSON values are dropped. Return
  plain data.
- A `generate()` that throws, returns nothing, or returns the wrong `type` is
  logged to console and skipped; the run falls through to the next candidate,
  so a broken pack never costs the player a turn or breaks the page.
- An unknown pool, a missing `generate`/`render`, an empty type or a duplicate
  type is a `console.error` and a `false` return — never a thrown exception.
- Load order sets pool order, and pool order feeds the seeded pick, so adding a
  pack changes which challenge a given run key draws. Already-generated
  challenges in a save are unaffected.
- Packs bring their own CSS (`pack-*.css`), themed from the same `--pz-*`
  variables — no per-game colour.

## Renderer API

`RENDERERS[type](puzzle, api)`. `api` gives `body`, `win(word)`, `lose(word,
reason)`, `strike(text)`, `strikesLeft()`, `note(text, tone)`, `shake()`,
`setDrain(mult)` (used by the image_tiles peek button to burn the clock),
`timeFraction()`, `teardown(fn)`, `setSubmit(label, handler)`. Puzzles that
resolve themselves never show a Submit button; only `lock_deduce` asks for one.

## Tests

`node js/puzzles/test-lock.mjs` loads the real `puzzles.js` in a bare `vm`
sandbox (it only touches `window` at load time) and checks `scoreLock` against
an independent reference over every 3- and 4-slot guess/answer pair in a
4-mark alphabet plus 40k randomised pairs with duplicates on both sides:
`exact + near <= slots`, marks absent from the answer score nothing, and the
score is symmetric. ~553k assertions, silent on success.

## Notes / next
- The stills for very plain rooms (bare walls in The Horrors) make 4x4
  `image_tiles` fiddly. The "hold to remember" peek and the correct-tile glow
  cover it, but a per-game 256px puzzle art pack is still the fix if it grates.
- No audio: the module deliberately does not touch the host `Audio` module, so
  it cannot ignore the player's sound toggles.

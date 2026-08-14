# AUDIT_TESTS — adversarial review of the 312-test suite

Read-only audit, 2026-08-14. Method: read every test file, then **mutation-test the real thing** —
`js/`, `tools/`, `data/`, `audio/` were copied to a scratch tree, 60 single-line mutations were
applied to the implementation there, and `node --test` was re-run against each. No file in this
repo was edited except this one. Every "survived" below means the mutation shipped a broken game
and all 312 tests still passed.

## Headline

The suite is better than most. 52 of 60 mutations were killed, including every one aimed at the
quest state machine's gating (`worn`, `via`, `verb`, `in`, `onDay`, `within`, `unseen`, prereq,
cooldown, offered-gate, survive-reset, branching `talk`). `tools/campaign.test.mjs` is a genuine
end-to-end ladder run, not a smoke test. The tautology hunt came back nearly empty: two
`doesNotThrow` calls, both of which are followed by real assertions.

What the suite does **not** cover is the seam between the pure reducer and the world — and that is
where the two live bugs are.

---

## 1. Every `recover` action is a no-op in the shipped build — BLOCKER, medium effort

**What.** `recover` is the design's only escape hatch from a stuck quest. `js/game/quest.js:204`
and `:212` emit `['recover', [...]]`; the adapter carries it out at
`js/game/questrunner.js:103`:

```js
case 'recover': for (const a of e[1]) this.world[a[0]]?.(...a.slice(1)); break;
```

The `world` object the real game supplies is `js/main.js:114-121` — `rev`, `groundAt`, `walkStep`,
`targets`, `doorIndex`, `jumpDoor`, plus `sound` added at `js/game/session.js:98`. **Four of the
five recover verbs — `moveTo`, `respawn`, `grant`, `arm` — have no handler anywhere**, so `?.()`
silently swallows them:

```
$ grep -rn "respawn\|moveTo" js/ | grep -v test | grep -v world/
tools/lintQuests.mjs:36:const RECOVER = { moveTo:'area', respawn:'enemy', grant:'item', arm:'object', sound:'any' };
# no producer, no handler — the only hits are the linter's own table
$ grep -rn "arm:\|grant:" js/game/ js/main.js      # nothing
```

**Why it matters.** `tools/lintQuests.mjs:130-141` spends twelve lines validating that every
recover argument names a real area / enemy / item / object, with the comment "a recover action that
names nothing is a *Reset this step* button that does nothing, and the player only ever presses it
when already stuck." The arguments are right and the button still does nothing. The player who is
stuck presses Reset, sees the counter go to zero (`quest.js:211` does work), and the world does not
change.

**Why no test caught it.** `js/game/questrunner.js` has **zero tests**:

```
$ grep -rl questrunner --include='*.test.js' --include='*.test.mjs' js tools   # (no output)
```

`quest.test.js:129` asserts only `r.effects.some(e => e[0] === 'recover')` — that the message was
posted, never that anyone is listening.

**The test that should exist** (`js/game/questrunner.test.js`, new file):

```js
import { RECOVER } from '../../tools/lintQuests.mjs';   // export the table
test('every recover verb the packs may author has a world handler', () => {
  const runner = new QuestRunner({ doc: blank(1), world: worldFromMain() });
  for (const verb of Object.keys(RECOVER)) {
    assert.equal(typeof runner.world[verb], 'function', `recover \`${verb}\` has nobody to call`);
  }
});
test('apply() lands every effect the reducer can emit on the doc', () => {
  // xp → schools, mk → purse, item → items, truth → journal, flag/unlock → flags, act → campaign.act
  // One assertion per case in questrunner.js:92-106. This is the whole untested adapter.
});
```

---

## 2. `retry` restarts at step 0 but only re-runs step 0's `recover` — BLOCKER, one-liner + data

**What.** `js/game/quest.js:198-206`:

```js
quests[event.id] = { s: 'active', i: 0, c: {}, t: ctx.hour ?? 0, e: 0 };
const first = required(def)[0];
if (first?.recover) fx.push(['recover', first.recover]);
```

The quest restarts from the beginning, but only the **first** step's recover list is run. Any world
state consumed by steps 1..k-1 before the failure stays consumed. Six live cases in the shipped
corpus:

| quest | failable step | earlier steps whose `recover` is never re-run |
|---|---|---|
| `light.20` | `watch` (#2) | `climb` |
| `dark.14` | `watch` (#1) | `spot` |
| `dark.16` | `fill` (#2), `hold` (#3) | `night`, `fill` |
| `neutral.15` | `yard` (#2) | `hinge` |
| `sandbox.20` | `carry` (#1) | `cook` |

Concretely, `light.20`: step `watch` is `interact wwa… ridge.dark.mark × 3`, `unseen: true`, with
`recover: [["arm","ridge.dark.mark"],["moveTo","ridge.dark"]]`. Get seen on the third mark → quest
fails → journal offers "Try again" (`js/game/journalscreen.js:140`) → `retry` restarts at step 0
`brief`, which has no recover → the three marks are still spent and `arm` is never called. Stacked
on finding #1, `arm` would not work even if it were called.

**Why no test caught it.** `quest.test.js:115-121` retries a **one-step** quest, so "step 0's
recover" and "every step's recover" are the same list. The fixture cannot distinguish the two.

**Severity is blocker because it is un-abandonable.** `t: 'abandon'` exists at `js/game/quest.js:214`
and is wired to nothing:

```
$ grep -rn abandon js/ tools/
js/game/quest.js:214:  } else if (event.t === 'abandon') {
```

**The test that should exist:**

```js
test('retry restores every step the quest had already consumed, not just the first', () => {
  const defs = pack([{ id:'q', title:'T', summary:'s', steps: [
    { id:'a', do:['interact','door',1], recover:[['arm','door']] },
    { id:'b', do:['goto','ridge'], unseen:true, recover:[['moveTo','gate']] } ]}]);
  let { state } = drive(defs, [{t:'accept',id:'q'},{t:'interact',id:'door'},{t:'seen'}]);
  const fx = step(defs, state, { t:'retry', id:'q' }, {}).effects
    .filter(e => e[0]==='recover').flatMap(e => e[1]);
  assert.deepEqual(fx, [['arm','door'],['moveTo','gate']],
    'a retry that restarts at step 0 must undo every step it is asking the player to redo');
});
```

Plus a lint rule: `error` if a quest has a failable required step at index *k* and any step at
index < *k* carries a `recover` list. That is the mechanical version of the table above.

---

## 3. A quest definition that loses a step permanently bricks in-progress saves — BLOCKER, one-liner

**What.** `js/game/save.js:150` clamps the step cursor at the bottom only:

```js
i: Math.max(0, Math.round(num(rec.i, 0))),
```

`clampAll` already receives `defs` (`save.js:88`, used at `:146` to drop dead quests) so the upper
bound is available and simply is not applied. Reproduced against the real modules:

```
save had  { s:'active', i:2 }   ·  new build's quest has 2 required steps
after load: { s:'active', i:2 }        no warning
after replaying every possible event:  s = active, i = 2   (advance() has cur === undefined)
retry:      refused — retry only fires on s === 'failed'   (quest.js:200)
progress(): { text:'T', have:0, need:0 }  — the tracker draws the quest title as its objective
anything gated on ['quest','q','done']:  never offered again
```

**Why it matters.** This is the brief's "what happens to an in-progress quest if its definition
changes under it", and the answer is: the save is dead and the player cannot tell. Removing one
step from one quest in a patch does it. So does marking an existing step `optional` — `required()`
(`quest.js:12`) shrinks and every mid-quest save overshoots.

**Why no test caught it.** Every save test round-trips the *current* shape. There is no test in the
repo that loads a save written against a different quest definition; the only drift case covered is
a quest id that vanished entirely (`save.test.js:103`).

**Fix (one line) and the test:**

```js
// save.js
const steps = defs?.[id] ? defs[id].steps.filter(s => !s.optional).length : Infinity;
i: Math.min(steps, Math.max(0, Math.round(num(rec.i, 0)))),
// …and warn when it clamps, so the drift is visible in the load report.

test('a save whose quest has lost a step is pulled back to the last step that exists', () => {
  const old = { ...blank(1), quests: { q: { s:'active', i:2, c:{} } } };
  const r = normalise(old, { defs: twoStepDefs });
  assert.equal(r.doc.quests.q.i, 2, 'clamped to the turn-in position, not left past the end');
  assert.match(r.warnings.join(' '), /q/);
  // and the load must still be finishable:
  const after = step(twoStepDefs, {quests:r.doc.quests,tracked:'q'}, {t:'enter',area:'y'}, {});
  assert.notEqual(after.state.quests.q.s, 'active');
});
```

---

## 4. Nothing would have caught the `light.22.out` soft-lock — BLOCKER to leave open, medium effort

**What.** The hand-fixed bug — a `once: true` dialogue node named by a step behind a step that can
fail and restart — has no automated check. `tools/lintQuests.mjs:267-288` (`lockedOutNodes`) only
catches the *other* shape: a `once` node with **two or more distinct callers**. `light.22.out` had
exactly one caller. The failure came from `retry` replaying that one caller, and the linter has no
notion of retry.

Confirmed against the live corpus — the trap is armed, it just is not currently sprung:

```
once nodes: 30 · quests with a failable required step: 8 · total quests: 99
```

Since `retry` resets `rec.i = 0` and `c = {}` (`quest.js:201`), **every** `once` node a failable
quest names is at risk, not only the ones after the failable step. `light.22` is precisely that:
step `night` is `unseen: true` at index 0, step `out` names `light.22.out` at index 4.

**The check to add** (prototyped and run against the real packs — 0 hits today, so it lands green
and stays a gate). Add to `lintQuests.mjs` beside `lockedOutNodes`:

```js
// A `once` node inside a quest that can fail is a node the retry can never re-open.
function onceBehindFailable(defs, dialogue) {
  const out = [];
  const req = d => d.steps.filter(s => !s.optional);
  const failable = s => s.within != null || s.unseen || s.fail;
  for (const d of Object.values(defs)) {
    const bad = req(d).find(failable);
    if (!bad) continue;
    for (const s of d.steps) {
      const nodes = [
        ...s.objectives.filter(o => o.k === 'talk' && o.node).map(o => o.node),
        ...(s.onDone || []).filter(e => e[0] === 'dialogue').map(e => e[1]),
      ];
      for (const id of nodes) if (dialogue[id]?.once) {
        out.push(`${d.id}.${s.id}: plays \`once\` node ${id}, but ${d.id}.${bad.id} can fail and `
          + `retry restarts the quest at step 0 — the second run cannot open it`);
      }
    }
    for (const e of d.onDone) if (e[0]==='dialogue' && dialogue[e[1]]?.once) out.push(`${d.id}.onDone → ${e[1]}`);
  }
  return out;
}
```

`js/game/packs.test.js:11` (`the shipped packs lint clean`) then gates it for free.

**Note while you are in here.** The `once` ledger is `dialoguebox.this.seen` (`js/game/dialoguebox.js:23`),
an in-memory array that is never written to the save document — `blank()` has no `seen` field. So
`once` today means "once per session", which accidentally softens this bug and simultaneously means
a reload replays every "once" scene. Whichever way that is decided, it needs a test.

---

## 5. Four predicate terms pass every test while returning `true` for everything — MEDIUM, one-liner

**What.** The brief's exact suspicion, confirmed by mutation. Each of these was replaced with
`() => true` and all 312 tests still passed:

| term | line | test coverage |
|---|---|---|
| `mk` | `js/game/predicate.js:41` | one positive assertion, `predicate.test.js:41` |
| `attunement` | `js/game/predicate.js:38` | none at all — only counted, `predicate.test.js:87` |
| `act` | `js/game/predicate.js:44` | none |
| `campaign` | `js/game/predicate.js:42` | none |

`predicate.test.js:41` is `assert.equal(evalPred(['mk', 200], ctx), true)` with `ctx.marks = 218`.
There is no `['mk', 300]` → `false`. `attunement` is referenced once, at `predicate.test.js:87`, and
only to count that two terms carry the `level` flag — its `fn` is never called.

By contrast the terms that *do* have a negative case (`item`, `standing`, `level`, `truth`, `flag`,
`worn`, `quest`, `damageDealt`, `not`) all killed the same mutation.

**Why it matters, calibrated.** The shipped corpus uses only four predicate terms today —

```
predicate terms used across 99 quests + all dialogue: { all: 8, quest: 108, flag: 1, damageDealt: 1 }
```

— so this is latent, not live. But `campaign` and `act` are the obvious terms for the next batch of
gating, and an always-true `campaign` term is a hole straight through the Light→Dark→Neutral ladder
that the existing ladder test would not see (it drives `ctx.quests`, not `ctx.campaign`).

**The test that should exist** — one line per term, in `predicate.test.js`:

```js
test('every term refuses as well as it accepts', () => {
  const cases = [ // [pred, ctx-that-passes, ctx-that-must-fail]
    [['mk', 200], { marks: 218 }, { marks: 199 }],
    [['attunement', 40], { schools: { cull: xpToReach(20) } }, { schools: {} }],
    [['act', 3], { campaign: { act: 3 } }, { campaign: { act: 2 } }],
    [['campaign','dark','done'], { campaign:{done:['dark']} }, { campaign:{done:['light']} }],
    [['campaign','dark','current'], { campaign:{current:'dark'} }, { campaign:{current:'light'} }],
    // …and the nine already covered, so the table is the contract for adding a term
  ];
  for (const [p, yes, no] of cases) {
    assert.equal(evalPred(p, yes), true,  `${JSON.stringify(p)} rejected a passing ctx`);
    assert.equal(evalPred(p, no), false, `${JSON.stringify(p)} accepted a failing ctx`);
  }
  assert.equal(cases.length, Object.keys(TERMS).length - 3, 'a new term needs a row here');
});
```

The last line is the part that matters: it makes the table mandatory for the next term added.

---

## 6. `retry` on a quest that has not failed silently wipes it — MEDIUM, one-liner

**What.** `js/game/quest.js:200` guards on `s === 'failed'`. Removing the guard —
`if (def) { … }` — survived the whole suite. There is no test proving `retry` refuses an `active`,
`turnin`, `cooling` or **`done`** quest.

**Why it matters.** With the guard gone, `retry` on a `done` quest resets it to `{s:'active', i:0}`,
which un-does the unlock ladder: anything gated on `['quest','light.24','done']` locks again, and
`light.24` has already paid its rewards so a re-run pays them twice. Today only
`journalscreen.js:140` calls it, and only for `rec.s === 'failed'` — so the invariant lives in the
UI, not in the reducer, and is one UI change away from being lost. The reducer is the layer that is
supposed to be safe.

**The test:** three lines in `quest.test.js`.

```js
test('retry refuses a quest that has not failed', () => {
  for (const s of ['active','turnin','done','cooling']) {
    const state = { quests: { q: { s, i: 1, c: { a: [3] } } }, tracked: 'q' };
    assert.deepEqual(step(defs, state, { t:'retry', id:'q' }, {}).state.quests.q, state.quests.q, s);
  }
});
```

---

## 7. The migration path is unreachable code with no test — MEDIUM, medium effort

**What.** `js/game/save.js:12-16`, `MIGRATIONS` is an empty object with the pattern in a comment,
and `SAVE_VERSION = 1`. The loop at `save.js:80-84` is therefore dead for **every possible input**:
`for (let from = Math.max(1, v|0); from < 1; from++)` never enters. So the migration mechanism, the
"upgraded vN → vN+1" warning, and the `no migration from vN` bail are all 0%-covered, and
`MIGRATIONS` is not exported, so they cannot be covered without a refactor.

**Why it matters.** This is the item the brief flags as biting hardest in a shipped game. The first
time someone adds a v1→v2 migration, the loop, the warning text and the ordering all run for the
first time in production, against a real player's only save. The rest of `save.js` is well
defended — the newer-build refusal, the hostile-input pass, the truth-preservation rule and the
combat-vs-economy timescale split all killed their mutations.

**The test that should exist** — requires exporting `MIGRATIONS` (or accepting an injected map as
an `opts` field, which is nicer because it does not widen the public surface):

```js
test('the migration ladder runs every rung in order and each rung defaults to old behaviour', () => {
  const rungs = { 1: r => ({ ...r, v: 2, pins: r.pins ?? [] }), 2: r => ({ ...r, v: 3 }) };
  const r = normalise({ ...blank(), v: 1 }, { migrations: rungs, version: 3 });
  assert.equal(r.doc.v, 3);
  assert.deepEqual(r.warnings.filter(w => /upgraded/.test(w)),
    ['upgraded v1 → v2', 'upgraded v2 → v3']);
  assert.match(normalise({ ...blank(), v: 1 }, { migrations: {}, version: 3 }).error,
    /no migration from v1/);
});
```

Ship it now, empty-laddered, so the machinery is proven before the first real migration rides it.

---

## 8. The determinism rule for `js/sim/` is a comment, not a gate — SMALL, one-liner

**What.** `js/sim/rng.js:1` says "Nothing in sim/ may call Math.random." It is currently true —

```
$ grep -rn "Math.random\|Date.now\|performance.now\|new Date" js/sim/
js/sim/rng.js:1:// Seeded xorshift32. Nothing in sim/ may call Math.random.
```

— and nothing enforces it:

```
$ grep -rn "Math.random\|Date.now" --include='*.test.js' --include='*.test.mjs' js tools   # (no output)
```

The pure-sim property is what makes `tools/soak.mjs`, `sim.mjs`-style balance runs and the whole
`campaign.test.mjs` ladder reproducible. One accidental `Math.random()` in a drop table and the
balance table stops being a transcript.

**The test** (put it in `js/sim/xp.test.js` or a new `js/sim/pure.test.js`):

```js
import { readdirSync, readFileSync } from 'node:fs';
test('js/sim is pure: no wall clock, no unseeded randomness', () => {
  for (const f of readdirSync(new URL('.', import.meta.url)).filter(f => f.endsWith('.js') && !f.includes('.test.'))) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
      .replace(/^\s*\/\/.*$/gm, '');                        // the rule may be stated in a comment
    for (const banned of ['Math.random', 'Date.now', 'performance.now', 'new Date']) {
      assert.equal(src.includes(banned), false, `js/sim/${f} calls ${banned}`);
    }
  }
});
```

---

## 9. Four hostile-input fields the hostile-input test does not attack — SMALL, one-liner

`save.test.js:55` (`clampAll never throws on hostile input`) is a good test with four blind spots.
Each of these mutations survived:

| survived mutation | line | what it lets through |
|---|---|---|
| `d.bank = arr(raw.bank)` instead of `stack(...)` | `save.js:128` | the bank keeps unknown ids, negative counts, non-objects — the fixture's `items` array is hostile, `bank` is absent entirely |
| `tier: num(ch.tier, 1)` instead of `clamp(…,1,4,…)` | `save.js:134` | a tier-99 charm; the fixture sets `charms: 'no'`, which is rejected before any charm object is read |
| `ferry: arr(raw.atlas?.ferry)` unfiltered | `save.js:141` | non-faction ferry unlocks |
| dropping `.slice(-200)` | `save.js:171` | unbounded log growth in localStorage |

**Fix:** four more keys in the existing `nasty` fixture and four assertions — no new test needed.

```js
bank: [{ id: 'renamed', n: 4 }, { id: 'silverling', n: -1 }],
charms: [{ id: 'c', tier: 99, integrity: 900 }, null, null],
atlas: { ferry: ['light', 'purple'], nodes: ['x', 3] },
log: Array.from({ length: 400 }, (_, i) => ({ day: i, line: ['a'] })),
```

---

## 10. Two small dead / half-tested knobs — SMALL

- **`bumpStreak`'s 90-second reset never runs in its own test.** `js/sim/xp.js:55` is the
  `nowSeconds - st.at > STREAK_RESET_SECONDS` branch; forcing it to `if (false)` survives. The test
  named "streaks reset after 90 s **or** three other keys" (`xp.test.js:126`) passes
  `nowSeconds = 0..9` throughout, so only the second half of its own title is exercised. One extra
  line — `assert.equal(bumpStreak(st, 'cull:grain_rat', 200), 0)` — closes it.
- **`ASH_MUL` is a knob nobody turns.** `js/sim/xp.js:33`/`:38`; deleting the multiplier survives
  because no caller ever passes `ash: true` (`grep -rn "ash:" js/` finds only
  `session.js:477`, which is the Graft's ash *count*, not this flag). Either wire it or delete it —
  right now it is untested because it is unreachable.

---

## What I could not check

`js/kv.js` and most of `js/game/savestore.js` (`load`, `save`, `slots`, `saveSlot`, `loadSlot`,
`deleteSlot`) need a `localStorage` stub and have no tests — only `Autosave` is covered
(`save.test.js:5`). In particular `savestore.js:19-24`, the "keep the unreadable bytes as
`forge.save.broken` rather than letting the next autosave overwrite the player's only copy" rule, is
the kind of thing that is only ever exercised on the day it matters. A ~15-line fake-storage module
would make all of it testable; I have not counted that as a numbered finding because it is
plumbing, not game logic.

`js/game/market.js` (142 lines, calls `Date.now()` at `:44`), `js/game/dialoguebox.js`,
`js/game/hud.js`, `js/game/menu.js`, `js/game/journalscreen.js` and `js/game/slate.js` are all
untested. Of those, `market.js` and `dialoguebox.js` are the two carrying real logic rather than DOM
assembly.

---

## Ranked summary

| # | finding | severity | effort |
|---|---|---|---|
| 1 | `recover` has no world handlers — the only un-stick mechanism is a no-op; `questrunner.js` has no tests at all | blocker | medium |
| 2 | `retry` restarts at step 0 but re-runs only step 0's `recover`; 6 live quests affected; `abandon` unwired | blocker | one-liner + lint |
| 3 | a quest that loses a step bricks in-progress saves — `rec.i` unclamped at `save.js:150` | blocker | one-liner |
| 4 | no check for a `once` node inside a failable quest — the exact `light.22.out` bug | blocker to leave open | medium |
| 5 | `mk`, `attunement`, `act`, `campaign` predicates pass every test while always returning `true` | medium | one-liner |
| 6 | `retry` on a non-failed quest silently wipes it; guard is untested | medium | one-liner |
| 7 | the migration ladder is unreachable, unexported, 0%-covered code | medium | medium |
| 8 | `js/sim` purity is a comment, not a test | small | one-liner |
| 9 | four hostile-input fields (`bank`, charm `tier`, `atlas.ferry`, log cap) unattacked | small | one-liner |
| 10 | `bumpStreak`'s 90 s branch untested; `ASH_MUL` unreachable | small | one-liner |

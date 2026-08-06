# REVIEW_SIM — adversarial review of C5 (`js/sim/`, `sim.mjs`, `HANDOFF_SIM.md`)

> **Newest round first. Rounds 2 and 1 follow, unedited, because the handoff cites their finding
> IDs.** Where rounds disagree, the later one wins.

---

# ROUND 3 — after pass 3, the final pass

`node tools/adversarial_sim.mjs` — **ported again**. D8 made `layoutSeed` required, which is my own
R2-1 landing, and it stopped all 13 sections at their first `newGame` (15 broken / 0 held). All 74
construction sites now state a layout seed and every section runs to completion.

```
ported sections (comparable to round 1's 15 / 10):  1 broken, 43 held
round-3 sections (the pass-2 and pass-3 code):      4 broken,  7 held
                                            total:  5 broken, 50 held
```

Trajectory on the ten comparable sections: **15/10 → 6/36 → 1/43.**

### How the port avoids manufacturing its own result

The seed-oracle section is the one place a careless port produces a false negative, so it is built
from three separate seed families and a control:

- `LS(k)` — used at every site **except** seed-oracle. Keyed on that site's own seed so a loop still
  gets a different board per game and a section that rebuilds "the same game" gets the same board.
  It is not the pre-D8 derivation and nothing outside the harness could guess it.
- `PRIVATE(k)` — what a real match draws from entropy. The seed-oracle section gives the real game
  one of these and lets the attacker know only the public `seed`.
- `LEGACY` — the pre-D8 default, reproduced exactly, **for the positive control**.

**`A0` runs first and must crack 120/120.** It does. `A1d`'s control cracks 100/100. Only then are
the live numbers (0/300 and 0/100) allowed to mean anything.

---

## VERIFICATION OF PASS 3

| round-2 finding | verdict |
|---|---|
| **R2-1** `layoutSeed` defaulted from the public seed | **closed, verified with a control.** Control 120/120, live **0/300**. Ghost's hidden fleet: control 100/100, live **0/100**. Eight entry points including `ladderGame(rung, seed)`, `autoplay(null, …)`, a fractional seed and a mistyped option name all refuse to build a game. Layout proven a function of `layoutSeed` alone: same seed + different `layoutSeed` ⇒ different layout, and the reverse |
| **R2-4** `view`/`eventsFor` ignored `localSide` | **closed.** Both refuse any side but `game.localSide`, both directions, as `RulesError`, with `viewAs`/`eventsAs` as named hatches — the shape `fireRaw` already had |
| **R2-5** the `opts.prior` channel | **closed.** Seven injection routes tried; six blocked. `priors`/`hide` rejected *by name* rather than ignored; a hand-edited save's `prior`/`hide` are **recomputed**, not validated; a Memory one-hotted at the true layout over 200 observations reaches a maximum multiplier of **3.44** against 20 for the raw array it replaced. For scale, the closed routes were worth 46.4 → 17.7 shots |
| **R2-5** `auditAiModule()` bypasses | **the three that mattered are closed** — `await import()`, and both comment-marker line tricks. 4 evasion-class bypasses remain, which regexes over source will never catch. One narrowing left, below |
| **R2-6** the aliases | **closed except one line**, below |
| **R2-7** `config.js` a live channel | **closed at the door.** `js/sim/tables.js` deep-freezes a snapshot at import and nothing under `js/sim/` imports `config.js`. All 4 of my hostile writes to `BOARD`/`ORDNANCE` succeeded and changed neither placement nor the rules |
| **R2-3** the ordnance-off control | **answered correctly for a design fact.** `sim.mjs` now runs the fourth condition every run — *aiming alone, both fleets forced from one family* — prints it, fails below a 42% floor, and says "tier 4 is NOT expected to lead here". `ai.js` and `HANDOFF §7` no longer credit the normalisation with the prior's six shots. I reproduce the decomposition: 56.6% as shipped, **45.8%** forced, 48.3% with the prior flattened |
| **R2-2** the poisoning clamp | **helped, did not close it.** See below |
| **R2-8** hiding | **half fixed, and I re-measured the half C5 did not.** See below |

---

## MUST FIX BEFORE THE RENDERING COMPONENTS ARE WRITTEN

Two, both one line.

### 1 — `index.js:164` still installs the `turn` getter inside `replay()` (harness `M1`)

The other three aliases are properly gone: `game.turn`, `game.first` and `player.start` are
undefined on the live object *and* on `deserialize`, `structuredClone`, JSON round-trip, spread and
`Object.assign` alike. This one survived, and it survived in the worst possible place:

```
view()                view.sideToMove=1   view.turn=undefined
replay(eventsFor)     view.sideToMove=1   view.turn=0
```

`replay()` and `view()` are the two functions D6 says must be interchangeable. A renderer written
against one reads `v.turn` fine and reads `undefined` the moment it is pointed at the other — the
exact silent-undefined failure R2-6 was about. **The soak cannot see it**: the property is
non-enumerable and `deepEq` walks `Object.keys`, so `replay(eventsFor(g,s))` still deep-equals
`view(g,s)` while the two objects behave differently. I confirmed the key lists are identical.

**Fix:** delete the `Object.defineProperty(v, 'turn', …)` line in `replay()`.

### 2 — `placementPrior` is still poisonable; the clamp bounded the wrong quantity (harness `K2`)

Rung 8, tier-2 player, 250–400 games per condition. Poison games now use a **realistic** player —
tier 2 playing properly, only the *layout* is the lie — because round 2's version had side 0 firing
at (0,0) every turn, which made `observeShots` degenerate and inflated the result. Channels split:

| the player's strategy | wins rung 8 |
|---|---|
| auto-place every game | 7.2% |
| one fixed layout, Ghost has no memory | 4.8% |
| the same fixed layout, Ghost learned it | **1.2%** ← honest learning works |
| **12 sacrificial corner games, then switch to centre** | **15.6%** |
| …through `observeLayout` alone | 16.4% |
| …through `observeShots` alone | 3.6% (below baseline — shot memory *helps* Ghost) |

Schedule sweep: `4 → 15.2%`, `8 → 15.2%`, `12 → 15.6%`, `24 → 14.8%`. **Four sacrificial games are
enough**; longer schedules add nothing, so `K=6` smoothing is not the brake it looks like.

The clamp did help — round 2 measured 2.3× over baseline, it is now 2.2× — but `LEARN_MIN`/
`LEARN_MAX` bound the learned factor's **magnitude**, and I verified that is not what carries the
exploit. After the clamp the composite prior sits at only **0.85–1.38×** the static one, and
tightening that ratio further to `[0.9, 1.5]` still leaves the player at 14.5%. What carries it is
the learned component's **authority over the search order**: `densityFor` weights each placement by
the mean prior over its cells, so even a 15% distortion reorders Ghost's opening and it spends
~10 of ~40 shots in the corners it was taught.

**Fix, measured at n=400.** Blend the learned deviation toward the static prior rather than applying
it whole — in `placementPrior`, `final = base · (1 + w·(learned − 1))`, renormalised:

| | poisoned-then-switch | honest repeat-layout |
|---|---|---|
| as shipped | 15.6% | 1.2% |
| `w = 0.5` | 15.3% | 2.8% |
| **`w = 0.3`** | **7.5%** | **2.5%** |
| `w = 0.15` | 7.2% | 3.8% |

At `w = 0.3` poisoning drops *below* the 7.2% auto-place baseline — it stops being worth doing —
while honest learning still holds a repeat-layout player to 2.5% against 5.5% with no memory.

**This is before-rendering because C7 decides it, not because a renderer touches it.** The
alternative is simply not to wire `aiMemory`: with memory unwired every strategy sits at 5.5–9.0%.
As it stands, wiring memory helps only the player who games it, and C7 needs that answer before it
writes the ladder screen.

---

## PHASE 1 KNOWN GAPS — for `SCORES.md`, revisit after phase 1

- **`avoidMap` is `coverageMap` and `staticPrior` is `coverage⁻¹`, so Ghost still hides where its own
  opening looks last (harness `K4`).** C5 flagged this as needing a design change and did not
  re-measure it; I did. An algorithm-aware player sweeping in ascending-coverage order clears a
  hidden tier-4 fleet in **109.7 shots** against **122.5** for a plain random one — a 10% discount,
  against 12% before the 48/4 randomisation. That is the expected result: randomising *which* of the
  quietest four is drawn does not move *where* the quiet region is. Decoupling the two maps is the
  real fix and it is a design change, not a tuning one. Note the discount is against a strategy that
  is poor in absolute terms (109.7 shots vs tier 4's own ~46), so nobody stumbles into it.
- **`auditAiModule()`'s computed-specifier guard is `if (/import\s*\(/ && !specifiers.length)`** — it
  only fires when there are *no* literal imports at all, and `ai.js` has three, so one concatenated
  `import('./sta'+'te.js')` beside them is invisible. Dropping `&& !specifiers.length` is a one-word
  edit. The remaining four bypasses (string-concatenated specifier, `v[K]` computed access,
  `gameState`/`seeds` defeating `\b`, a re-export smuggled through the allowed `./tables.js`) are
  deliberate evasion and regexes over source will never catch them. The right change there is to the
  handoff, not the code: call it a regression guard — which it is, and which is genuinely useful —
  rather than "the claim is now something you can grep".
- **`setBoard` in `PLACING` rewrites an already-emitted `place` event in place** (harness `G5b`). The
  mid-match case is properly refused. In `PLACING`, a stream a placement screen has already read
  changes content without changing length. `replay(eventsFor)` still equals `view`, so the screen
  can simply re-read; worth one line in the handoff for C7 rather than a code change.
- **`sim.chooseShot(view, tier, seeds, { prior })` is still exported and still takes a raw array.**
  It cannot be reached from the shipped path and it is the right shape for a testing entry point —
  this harness uses it to isolate what the prior is worth — but the handoff should name it a harness
  API rather than leaving it in the general export list.

---

## HELD UNDER ATTACK IN ROUND 3

Beyond the verification table: the redaction section is now **13 held / 0 broken** — `fire()` leaked
no enemy `shipId` over 200 shots at both `localSide` settings while your own struck hull's id
survives 32 times; no export but `unredactedEventsForDebugging` returns both fleets' placements
under any of five argument shapes a mistaken caller would try. `ergo` is **10/0**: all 20 nonsense
`newGame` arguments throw `RulesError`, including the removed `priors`/`hide` rejected by name, six
malformed `Memory` shapes, an invented option key and a non-object `opts`. `serial`, `play`,
`ladder`, `rung8`, `exploit` and `permutation` are clean. Rung 8 is winnable — a tier-3 player takes
it 52.5%, a tier-2 player 15.5%. The anti-edge prior's trade still holds exactly as measured in
round 2 (edges 51.2 → 42.0, corners 47.3 → 43.9, costing 3.4 shots on a clustered layout).

---

## VERDICT

**Yes. Build C1, C2, C3 and C6 on this.** Both round-2 conditions were real and both are met: D8 is
implemented and verified with a positive control, and the aliases are deleted rather than carried —
bar the one line in `replay()`.

What a renderer could trip over, in full:

1. **`replay(...).turn` exists and `view(...).turn` does not** — must-fix 1. This is the only item on
   this list that can produce a wrong frame, and it is one line.
2. **`view(game, side)` and `eventsFor(game, side)` now throw** when `side !== game.localSide`. That
   is the fix I asked for and it is correct, but it is a *behaviour change from the handoff C2/C6/C7
   will have read*. A component that reaches for the other seat — a spectator view, an AI-vs-AI demo
   reel, a replay of the opponent's turn — wants `viewAs`/`eventsAs` and will otherwise hit a
   `RulesError` at runtime rather than at review.
3. **`newGame` and `ladderGame` throw without `layoutSeed`**, and `newGame` throws on any unknown
   option key. Both are deliberate. Any snippet copied from an older handoff revision will fail
   immediately and loudly, which is the intended failure mode, but it will fail.

None of the five open findings changes an event shape, a rules outcome or a `View` field, so
rendering work started now cannot be invalidated by fixing them. The two must-fixes are each one
line, and neither blocks a component from starting today.

# ROUND 2 — after pass 2

`node tools/adversarial_sim.mjs` — **ported**. Round 1's harness had stopped executing four of its
ten sections part-way (DECISIONS D9); every section now runs to completion, and three new sections
attack the code pass 2 added.

```
ported sections (comparable to round 1's 15 broken / 10 held):  6 broken, 36 held
round-2 sections (new attack surface):                          6 broken,  4 held
                                                        total: 12 broken, 40 held
```

**6 broken / 36 held on the ported sections, against 15 / 10 in round 1.** The author's "2 / 14"
was not comparable and neither is it wrong in spirit — the mechanics genuinely improved a great
deal. It undercounted because four sections aborted, and it over-counted its two remaining
failures, both of which were stale.

### The two stale findings, adjudicated

**C1 — `fire()` returns unredacted events. REFUTED, and D9's reading is confirmed.** Round 1's
predicate was `at !== side`: redact for the *firing* side. Measured with the corrected predicate
`at !== viewer`, `fire()` leaks **zero** enemy `shipId`s across both `localSide` settings, while
your own struck hull's `shipId` still arrives 32 times in one game. The author was right to reject
the per-firer fix: applied literally it deletes `GAME_BRIEF` step 6, which needs exactly that field
to place the red indicator. The ported harness now asserts **both** directions, so a future "fix"
that redacts too much fails too. C1 was right about the defect and wrong about the fix, and pass 2
made the right call.

**F1 — the round-robin gate. STALE, deleted.** `sim.mjs` gates on the adjacent head-to-head now
(`sim.mjs:796`) and prints the round robin labelled "for reference only". The assertion is replaced
by one that checks the gate is still the adjacent one and that every step clears 55% against my own
independently-computed matrix. It does.

---

## BLOCKING

### R2-1 — `layoutSeed` still defaults to a hash of the public seed (harness `A1`, `A1b`, `A1c`)

Confirms **D8**, and it is worse than D8 states. Round 1's oracle reported 0/300 only because it
stopped one hash layer short: `game.rng = hash(layoutSeed, …)` and `layoutSeed = hash(seed,
0x1a7011, w*31+h)`. Chain both and the enemy fleet is reproduced from the public `?seed`:

| entry point | result |
|---|---|
| `newGame({seed})`, no `layoutSeed` | **300/300** cracked |
| `ladderGame(rung, seed)` | cracked |
| `autoplay(null, turns, {seed})` | cracked |
| `newGame({seed, layoutSeed: <private>})` | resisted |
| **tier 4's *hidden* fleet, rung-8 shape** | **100/100** cracked |

An attacker holding a shared `?seed` link clears the fleet in **7.6 shots** against tier 4's own
22.3. And `A1c` is the part D8 does not cover: fleet-hiding is a deterministic 24-candidate argmin
over `coverageMap`, so it costs an attacker thirty lines to reimplement and adds **zero** entropy.

**Fix:** exactly D8 — `newGame` throws without `layoutSeed`. Nothing else closes it, because the
defence has to be "the code will not run unless you pass one", not "R8 asks C7 to remember".

### R2-2 — the tier-4 adaptive prior is poisonable, and the payoff exceeds the exploit it closed (harness `K2`)

Rung 8, tier-2 player, 250 games per condition, memory fed exactly as `HANDOFF §8` tells C7 to:

| the player's strategy | they win rung 8 |
|---|---|
| auto-place every game, Ghost has no memory | 10.0% |
| one fixed layout, Ghost has no memory | 6.0% |
| the same fixed layout, Ghost has learned it | **0.4%** ← the prior works |
| **12 sacrificial CORNER games, then switch to CENTRE** | **22.8%** ← the prior inverted |

`placementPrior()` is an undecayed, unbounded running count. Twelve observations push a cell's
multiplier to ~3.9× and starve the rest of the board, so a player who deliberately teaches Ghost the
wrong map gets a **2.3× better** rung-8 win rate than by auto-placing — on the one rung that sets
`complete: true`. The poison games are nearly free: rungs 7 and 8 share the same `12x12` memory
bucket, and rung 7's opponent is tier 3, which never reads the prior at all.

Note this exists **only if C7 wires `aiMemory`**. As it stands, wiring memory is a net negative.

**Fix, measured (300 games each):** clamp the multiplier `placementPrior()` returns.

| | poisoned player wins | honest repeat-layout player wins |
|---|---|---|
| as shipped | 22.0% | 0.3% |
| clamp to `[0.9, 1.5]` | 8.7% | 1.7% |
| **clamp to `[1.0, 1.8]`** — never de-prioritise below flat, only ever *add* attention | **8.3%** | 1.3% |

Decay is *not* the fix: a decaying memory is poisoned just as easily by poisoning immediately
before the target match. Bounding the downweight is what removes the payoff.

### R2-3 — the ordnance-off control measures placement, not aiming (harness `K5`)

`HANDOFF §7` lists tier 4's edge as "three policy differences, none of them ammunition: normalised
aiming, an adaptive prior, and it hides its own fleet", and `sim.mjs` gates on tier 4 beating tier 3
with ordnance disabled (reported 58.6%, I reproduce 56–58%). Decompose it — hand both sides layouts
from the same plain-random family via `setBoard`, so the only difference left is how they *aim*:

| tier 4 vs tier 3, ordnance disabled, n = 1500–3000 | T4 |
|---|---|
| as shipped | 56.3% |
| both fleets forced to the same random family | **46.3%** (47.6% / 45.9% with the two layouts swapped, n=3000) |
| the same, and tier 4's prior flattened | 49.7% |

**Tier 4 loses that fight.** Every point of the ordnance-off margin is tier 4's *placement*, not its
aiming. Two consequences:

- The "normalised aiming" listed first is worth **−0.3 points**, i.e. nothing. Independently, over
  400 seeds at ±0.45 shots: `expectedField` vs summed density is +0.06 shots on random, +0.42 on a
  clustered layout, −0.91 on a touching one — a wash in every condition. The "worth six shots
  against a clustered or touching layout" in `HANDOFF §7` and in `ai.js:283` is the **prior's**
  effect being attributed to the normalisation. That matters because the next agent to simplify
  tier 4 will read that comment and delete the wrong half.
- `sim.mjs`'s control was written to rule out "the separation is ammunition" (BLOCK-1). It does not
  rule out "the separation is where it parked its ships", and that is the confound that is actually
  present. **Fix:** add a fourth condition to the control — both sides on the same forced layouts —
  and either accept that rung 8's difficulty is placement (and say so in the handoff), or make the
  aiming carry it.

---

## SHOULD FIX

### R2-4 — `view()` and `eventsFor()` ignore `game.localSide` (harness `C6`)

`fire()` was fixed to redact for the session viewer, which is right. `view(game, side)` and
`eventsFor(game, side)` were not: they take a side and trust it, so `view(game, 1)` from a
`localSide: 0` session returns the AI's exact ship cells with no complaint. That is the same class
of defect D6 called "a contract the presenter can forget", and the renderer *does* hold the Game.
Cheap fix: throw when `side !== game.localSide` unless an explicit escape hatch is passed, the way
`fireRaw` is the named escape hatch for `fire`.

### R2-5 — `auditAiModule()` is a guard the guarded party wrote, and it is bypassed 7/7 (harness `L1`, `L2`)

The real `ai.js` passes it, and against *accidental* regression it works. Against anything else:

| variant | |
|---|---|
| `await import('./state.js')` | **BYPASS** — the import regex only matches `from '…'` |
| a string-concatenated specifier | BYPASS |
| **a line that begins with a comment marker** | **BYPASS** — the filter deletes the whole line, code and all |
| a continuation line beginning with `*` or `/*` | BYPASS |
| computed property access, `v[K]` | BYPASS |
| `gameState` / `seeds` — `\b` has no boundary inside a word | BYPASS |
| re-export through the *allowed* `../config.js`, which nothing audits and `purity.mjs` does not walk | BYPASS |

The first three are things a future agent writes by accident, not by intent, and they are cheap to
close: also match `/\bimport\s*\(/` and `/require\s*\(/`, and strip comments with a real stripper
instead of dropping whole lines. Add `js/config.js` to `purity.mjs`'s walk (already open as R4).
The identifier regexes cannot be made sound — say so in the handoff rather than calling the claim
"something you can grep".

`L2` is the structural half: the audit reads `ai.js`, but what decides *what `ai.js` is handed* is
`aiMove()` in `index.js`, which nothing audits, and `chooseShot`'s fourth argument is an arbitrary
caller-supplied `number[]`. A `prior` that one-hots the enemy layout takes tier 4 from **45.9 to
17.5 shots** with `ai.js` byte-identical — and the soak's layout-permutation test passes too, since
permuting the defender does not change the prior and so does not change the shot. No shipped caller
does this, so it is not a live exploit; but "structurally blind" is currently a claim about one file
with the hole in the adjacent one. Narrow the channel: have `aiMove` accept a `Memory` and derive
the prior itself, rather than accepting a raw array from `newGame({priors})`.

### R2-6 — the deprecation aliases vanish across every copy except the sim's own (harness `M1`)

| | `game.turn` | `game.first` | `players[0].start` |
|---|---|---|---|
| the live object | 1 | 1 | ok |
| `deserialize(serialize(g))` | 1 | 1 | ok |
| `structuredClone(g)` | **undefined** | **undefined** | **undefined** |
| `JSON.parse(JSON.stringify(g))` | **undefined** | **undefined** | **undefined** |
| `{ ...g }` / `Object.assign({}, g)` | **undefined** | **undefined** | ok |
| `{ ...view }` | **undefined** | — | — |

They are non-enumerable getters, so `serialize`/`deserialize` keeps them (`deserialize` re-runs
`shim()`) and nothing else does. The failure mode is `undefined`, not a wrong side, so
`if (g.turn === 0)` is false for *both* sides and nothing throws. That is worse than the naming
confusion the rename was fixing.

**Fix: delete all four now.** R9 already schedules it; the only code that could rely on them is code
written against revision 1, and since C2, C6 and C7 all read `HANDOFF_SIM` cold, that code does not
exist. Carrying them past this pass buys nothing.

### R2-7 — `config.js` is a live mutable channel into the sim (harness `H10`)

`BOARD`, `ORDNANCE` and `LADDER` are plain mutable exports the sim reads live. `BOARD.placeTries = 0`
changes placement from any component; `ORDNANCE.salvo.offsets` changes the rules mid-match.
`sim.mjs` does exactly this to force the `packRows` path, which is the proof the channel is open.
`Object.freeze` on the three exports, or a snapshot at `newGame`, costs nothing. This is the one
round-1 ergonomics note nothing was done about.

### R2-8 — fleet-hiding hands an informed player a 12% discount (harness `K4`)

`avoidMap` is `coverageMap`; `staticPrior` is `coverage^-1`. Ghost hides on exactly the cells its own
aiming prior searches first, so the counter-strategy *is* the AI's own opening. A player sweeping in
ascending-coverage order clears a hidden tier-4 fleet in **106.8 shots** against **122.0** for a
plain random one. Against a naive opponent hiding buys difficulty; against an informed one it gives
it back, and per R2-1 it adds no secrecy at all. Not fatal — the sweep is a poor strategy in
absolute terms — but the handoff should stop describing hiding as a difficulty mechanism without
that caveat, and mixing a little genuine randomness into the candidate choice (rather than a strict
argmin) would cost nothing.

---

## NOTED — *not worth the last pass*

- **`setBoard` in `PLACING` rewrites the emitted `place` event in place** (`G5b`). The mid-game case
  is properly refused now. In `PLACING` a stream already read by a placement screen changes content
  without changing length. Real, but the screen can just re-read, and `replay(eventsFor)` still
  equals `view`.
- **`sim.mjs`'s "36,232 fire()-redaction checks" does not scale with the run.** The deep probes are
  gated on `gi < 300`, so `node sim.mjs 5000` reports the same number as `node sim.mjs 800`. Not a
  bug; the handoff's phrasing implies otherwise.
- **`fleetLegal` still returns `null` when legal.** D7 names the export, so it stays. I tripped over
  the inversion myself while writing this harness — worth one line in the handoff, not a rename.
- **The 400-game negative results are under-powered, not wrong** (Job 2.6). The SD of shots-to-clear
  is 8.99, so 400 games resolve nothing below ~1.8 shots. "45.07 → 45.20, nothing" is really "no
  effect larger than ~1.8 shots at 95%", and *"greedy density is at the ceiling for this ruleset"*
  is a stronger claim than the evidence carries. The conclusion is probably right — with touching
  allowed, the joint posterior loses its best inference — and the right test bed would have been
  constrained endgame positions rather than whole-game shots-to-clear, where the effect is diluted.
  Keep the result; soften the sentence. Do not spend the last pass rebuilding the experiment.

---

## HELD UNDER REAL ATTACK

Stated specifically, because these are where the engine is actually strong:

- **The redaction rule.** Attacked from four directions — `fire()` vs `fireRaw()` field by field for
  both `localSide` settings, `eventsFor` over full games, event count/ordering as a side channel,
  `ownGrid` against the mirrored enemy `grid`. 12 held, 1 broken (R2-4, and that one is an API
  shape, not a leak). Putting the rule in one function in `events.js` is why.
- **`replay(eventsFor(g, s))` == `view(g, s)` before either fleet is placed.** Round 1 broke this at
  `newGame`, which is where D6 says it must hold. All six cases now agree.
- **`deserialize`.** Six hostile saves, all rejected as `RulesError`, including `w` edited to 99.
  Round 1 got 5 of 6 through. The strict key set is what does it, and it also means the deprecation
  aliases cannot leak into the serialized shape (`M2`).
- **Nonsense arguments.** Nine variants — `seed:'abc'`, `first:5`, `tiers:[9,-3]`, `localSide:2`,
  a wrong-length prior, `ordnance:{salvo:1e9}` — all throw rather than coerce. Round 1 caught three
  of these silently coercing.
- **Ordnance symmetry.** Checked on all eight rungs and in the recharge ledger, not just rung 8.
  Round 1's central complaint (S6/BLOCK-1: "tier 4 is tier 3 with more ammo") is genuinely gone, and
  with charges symmetric tier 4 still takes 67.3% — that part of the separation is real policy.
- **The anti-edge static prior is a real correction, not a tuned constant** (`K6`). Shots for T4 to
  clear, flat prior → `coverage^-1`: edges 51.2 → 42.0, corners 47.3 → 43.9, at a cost of 3.4 shots
  against a clustered layout and 1.7 against a random one. That is a trade worth making and it
  survived everything I threw at it. It is *also* the thing R2-3 shows is being mis-credited to the
  normalisation.
- **The prior really learns** (`K1`). Repeating one layout for 12 games drops a tier-2 player from
  6.0% to 0.4% on rung 8, and memory built from a player who *varies* their layout is neutral
  (7.6% vs 10.0%) rather than noise. The mechanism works; R2-2 is that it works in both directions.
- **Rung 8 is winnable and the rungs are distinct** (`I3`, `I3b`). Round 1's "~0%, `complete` is
  dead content" came from building rungs with `newGame` and dropping `ordnance: cfg.ordnance`. Rebuilt
  through `ladderGame()`, a tier-3 player takes rung 8 and no two rungs are byte-identical any more.
- **The fuzz surface.** `snapTarget`/`footprint` total and idempotent over 12,675 wild inputs on five
  board shapes; `fleetLegal` and `newGame` agree over 2,178 fuzzed configs and every accepted config
  places; twelve hostile play sequences all reject with the right reason; no prototype pollution.

---

## VERDICT

**Yes — build the three rendering components on this, with two conditions.**

The parts a renderer touches are sound: the event stream, the redaction rule, `replay` ⇄ `view`,
serialisation, the fuzz surface. Those are what C2, C6 and C7 consume, and they are the parts that
held hardest. Nothing in R2-1 … R2-8 changes an event shape or a rules outcome, so no rendering work
built now gets invalidated by fixing them.

The two conditions:

1. **R2-1 before anything ships**, because it is a one-line signature change (`layoutSeed` required)
   and every day of renderer work makes the call-site churn larger.
2. **R2-6 before C2/C6/C7 write a line**, because the aliases are exactly the kind of thing a new
   component will pick up by autocomplete and then lose across a `{...spread}`.

R2-2 and R2-3 are about how the *game* plays, not about how it renders. They are the two findings
worth the author's last pass after R2-1; they can be fixed in parallel with rendering work.

---

# ROUND 1 — the 15 / 10 review, unedited

Reviewer's own harness: **`tools/adversarial_sim.mjs`** (`node tools/adversarial_sim.mjs [section]`;
round 1's sections were `seed permutation redaction serial play ladder hostile ergo rung8 exploit`,
and round 2 added `prior audit alias`). Every number
below is reproducible from it. The author's gates were not re-run; they reproduce and are not the
subject of this review.

Result: **15 broken, 10 held.** The engine's *mechanics* are in good shape — I attacked the rules,
the fuzz surface and the fog-of-war projection hard and most of it held (§Held, at the end, is
specific about what). What did not survive is the layer above the mechanics: **the AI tier
separation, the ladder as a thing a person plays, and two of the fog-of-war claims that guard the
wrong door.**

Disposition of the REVIEW.md findings the brief named:

| | verdict |
|---|---|
| B6 fog leaks through events | **partly fixed** — `eventsFor` is correct, but `fire()`'s return value is unredacted (BLOCK-3) and the invariant fails at `newGame`, the exact starting point B6 names (BLOCK-5) |
| B7 `legal()` truthiness | fixed (`null \| reason`); the inverted truthiness remains a footgun (NOTE-1) |
| B10 invariant holes | implemented; two are weaker than advertised (BLOCK-4, FIX-8) |
| S4 resolved cells / order / `repeat` | **fixed**, verified independently |
| S5 degenerate opening + centre bias | **partly fixed** — 4 distinct openings, not 1, but tiers 2–4 open in the centre in 100% of games and the centre bias is still exploitable (FIX-4, FIX-5) |
| S6 tier 4 is tier 3 with more ammo | **NOT fixed** (BLOCK-1) |
| S9 `ShipView` shape | **fixed**, verified |
| S10 `PLACING` / `fleetLegal` | **fixed**, verified over 2,178 fuzzed configs |

---

# BLOCKING

## BLOCK-1 — Tier 4 is still tier 3 with more ammo. REVIEW S6 was restated, not fixed, and the ladder gate is measuring ammunition.

**What's wrong.** `HANDOFF_SIM.md` §7: *"Tier 3 → tier 4 separation comes from the ordnance
*policy*, not from the extra charges — that was REVIEW S6's objection and it is why D6 split the two
policies."* That claim is untested by any gate. I tested it by equalising the charge grant and
replaying the same 1,200 pairings (`adversarial_sim.mjs play`, E5):

```
tier 3 vs tier 4, n=1200 each, opening alternated, side 0 = T3

  as shipped (T4 gets 1.5x charges)      T3 29.7%   T4 70.3%
  charges equalised at the table value   T3 47.6%   T4 52.4%
  charges equalised at 1.5x for both     T3 54.0%   T4 46.0%     <- tier 3 WINS
  ordnance disabled entirely             T3 48.8%   T4 51.2%
```

The 70/30 split collapses to 52/48 the moment both sides get the same charges — inside noise of the
50/50 you get with ordnance switched off entirely, which is the control, because tiers 3 and 4 share
tier 2's targeting exactly. And when both sides get the *generous* grant, `goodOrdnance` is
**worse** than `naiveOrdnance`: tier 3 wins 54.0%. The "expected distinct ships touched" objective
is not a better policy; it is a more *conservative* one (`goodOrdnance` returns null while any hit
run is open, and gates on `bestScore >= GAIN[kind] * shellBest`), and conservatism only pays when
charges are scarce. Give it charges and it hoards them.

So D6's ruling ("Tier 3 gets the naive policy. Tier 4 gets the good one") is implemented as written
and does not produce the effect it was written to produce.

**Downstream failure.** The `--ladder` gate is the only thing standing between this and eight rungs
of difficulty that don't differ. It currently passes on a 1.5× ammunition grant, which means the
gate would still pass if tier 4's policy were deleted and replaced with tier 3's. Every consumer —
the ladder screen, the tier names in the HUD, `SCORES.md` — is presenting "Ghost is smarter than
Admiralty" and it is not; it is better armed. The player who reaches rung 8 does not face a better
opponent, they face a richer one.

**Fix.** Two parts, both required:
1. **Add the control to the gate.** `sim.mjs --ladder` must run the T3/T4 pairing a second time with
   `ordnance: { heavy: base.heavy, salvo: base.salvo }` forced on both sides and fail if the gap is
   under, say, 8 points. A separation claim that isn't measured with the confound held constant is
   not a measurement.
2. **Give tier 4 a real edge, and it should not be the charge count.** The cheapest one that is
   genuinely a *policy* difference: tier 4 already computes `expectedShips`; make it use that as its
   **shell** objective too (`argmaxCell(v, model.sum, rng)` at `ai.js:239` is summed density for
   every tier ≥ 2, so tier 4's much better objective function is currently only consulted for the
   ~8 ordnance shots of a game and never for the other ~25). That is a one-line change with a real
   skill delta behind it. Then re-measure; if it still needs the 1.5× grant, delete the grant and
   say so, because per BLOCK-2 the grant is also a fairness problem.

---

## BLOCK-2 — The ladder is a step function with a wall at rung 7, rung 8 is effectively uncompletable, and the AI gets 63% more ordnance than the player on it.

**What's wrong.** Win rate for a player of fixed skill against each rung as `ladderGame()` actually
builds it, 300 games per cell, opening alternated (`adversarial_sim.mjs ladder` F3, `rung8` I2):

```
                 r1     r2     r3     r4     r5     r6     r7     r8
player T1     100.0%  99.7%  52.0%  48.0%  28.3%  25.0%   1.3%   0.0%
player T2     100.0% 100.0%  75.0%  67.0%  55.3%  53.3%   7.3%   0.0%
player T3     100.0% 100.0% 100.0%  99.0%  95.7%  98.3%  51.0%  28.0%
```

Read any row: it is flat, then it falls off a cliff between rung 6 and rung 7. There is no rung
between them because there is no *tier* between them — head-to-head, T3 beats T2 **95.5%** of the
time (F2), the largest gap in the whole tier set, and `LADDER` steps straight across it at rung 7.
Rungs 1 and 2 are byte-identical config; rungs 5 and 6 differ by one extra 4-ship. Eight rungs, five
distinct difficulties, and the entire difficulty budget spent in one step.

Compounding it, on the rung that *completes the campaign*:

```
rung 8 (Ghost of Leyte), fleet [6,5,4,4,3,3,2] = 27 cells
  player (tier null) starts with heavy 5, salvo 3   =  8 charges
  Ghost  (tier 4)     starts with heavy 8, salvo 5  = 13 charges
```

`startCharges(fleetCells, tier, override)` applies the 1.5× grant on `tier === 4`. A human's tier is
`null`. The grant is therefore **one-sided by construction against the player**, on the one rung
where the opponent is tier 4, and per BLOCK-1 the charge count is the single variable that decides
tier-3-vs-tier-4 fights. Equalising it is worth roughly half the match:

```
win rate vs rung 8      as shipped    charges equalised
  player skill T3          28.5%           51.7%
  player skill T2           0.3%            2.0%
```

**Downstream failure.** `ladder.js` drops a rung on a loss and sets `complete: true` only on a rung-8
win. A player good enough to reach rung 7 oscillates 6↔7 indefinitely and never sees the completion
state, so C7 will build an ending screen that essentially no one reaches. HANDOFF §6 describes the
1.5× grant as *"the only asymmetry in the ruleset"* without noting that in the ladder it always
points the same way.

**Fix.**
1. Remove the tier-4 charge grant, or make it symmetric by giving `ladderGame` a `playerTier`
   default that carries the same grant. It is an AI-tuning knob that leaked into the ruleset.
2. Rebuild `LADDER` around measured win rates rather than tier indices. The rungs need difficulty
   that varies *within* a tier — board size, fleet size and the AI's own ordnance budget are all
   free parameters that move the curve continuously, unlike the tier index. A target curve of
   roughly 85 / 75 / 68 / 60 / 55 / 50 / 45 / 40% for a T2-skill player is reachable with the tiers
   that exist; the harness in `adversarial_sim.mjs rung8` measures it in about a minute per config.
3. De-duplicate rungs 1/2.

---

## BLOCK-3 — `fire()` returns the unredacted event delta, so B6's fog-of-war fix guards a channel the renderer will not use.

**What's wrong.** `eventsFor()` is correct: I could not get an enemy `shipId` or an unplaced fleet
out of it (§Held). But `fire(game, side, shot)` — the documented, obvious, *only* way to make
something happen, listed in HANDOFF §3 as `fire(game, side, shot) → Event[]` — returns
`rules.js:64`'s raw `out` array, with `shipId` live on every enemy-board result:

```
32 enemy-board result events carried a live shipId in ONE 10x10 game
example: { t:'result', by:0, at:1, r:5, c:5, hit:true, shipId:1, repeat:false }
```

`eventsFor` nulls exactly this field. `fire` does not. The natural C6 animation loop —
`for (const e of sim.fire(g, side, shot)) present(e)` — hands the presenter the information that two
hits belong to the same enemy hull before it sinks, which is precisely what D6's `ShipView` rule
exists to prevent. This is the failure mode REVIEW B6 described ("a C6 that reasonably places enemy
models where the sim says they are"), moved from `place` to `result`, and D6's own words apply to it
unchanged: *"a contract the presenter can forget is not a defence."* No gate fires, because the soak
only ever checks `eventsFor`.

**Downstream failure.** C6 builds its splash/impact presentation off `fire()`'s return (it is the
only thing that arrives at the moment of the shot; `eventsFor` is a full-history rebuild). The first
time someone uses `e.shipId` to pick which hull model to shake, the enemy fleet's structure is
readable off the screen and every fog gate still says green.

**Fix.** Make `fire` return the attacker's redacted delta, and put the raw one behind a name that
warns: `fire(game, side, shot) → Event[]` applies the same three-line redaction as `eventsFor` with
`side` = the firing side, and `fireRaw` / `game.log.slice(mark)` serves the harness. One function,
reused: `out.map(e => redact(e, side))`. `sim.mjs` asserts the raw and redacted deltas differ in
exactly the `shipId` field and nowhere else.

---

## BLOCK-4 — "`js/sim/ai.js` cannot reach a Game" is false, and the seed is a complete layout oracle. The AI-blindness test's one known hole is wide open through the door the handoff says is bolted.

**What's wrong.** HANDOFF §7 states the residual honestly and then names the defence:

> *The defence against that is architectural, not behavioural: `ai.js` imports only `config.js`,
> `rng.js` and the View constants, and receives no Game.*

Both halves are false in the source:

- `ai.js:7` is `import { UNKNOWN, MISS, HIT, SUNK, view } from './state.js'` — it imports from the
  **Game module**, and `view` is a function that takes a Game, not a View constant.
- `ai.js:245` is `export function aiMove(game, side)`. The file's own header comment says *"nothing
  in this file can reach a Game"* six lines after that is contradicted by its last function.
  `aiMove` already dereferences `game.players[side].tier`, `game.seed` and `game.turns`.
  `game.players[1 - side].ships` is one property access away, in a file the handoff tells the next
  agent is structurally incapable of it.

And the seed really is a total oracle. `adversarial_sim.mjs seed` reimplements `randomPlacement`'s
stream *outside the sim* from nothing but the integer `seed`:

```
A1: the AI fleet is recoverable from the public ?seed alone on 300/300 classic games
A3: a seed-oracle attacker clears a 17-cell fleet in 6.0 shots and beats tier 4 60/60.
    Tier 4 needs 18.1.
```

Six shots, because knowing the layout lets you place salvos on it. That attacker is 3× faster than
Ghost and the permutation test in `sim.mjs:392` cannot see it, because permuting the board does not
change `game.seed`. `game.rng` is never touched after placement (D2), so `(seed, w, h, fleet)`
determines both layouts completely and nothing else does.

This is a **live cheat for the player too**, not only a hypothetical for the AI: `main.js` reads
`?seed` from the URL, and `js/sim/` is an ES module the browser console can import. Anyone can paste
twelve lines into devtools and read the AI's fleet off a shared link.

**Fix.** Make the architectural claim true, then the residual really is closed:
1. Change the signature to `aiMove(view, tier, seeds)` — the pure `chooseShot` already *is* that, and
   `index.js` can host the three-line `aiMove(game, side)` adapter that builds the view. `ai.js` then
   imports `config.js` and `rng.js` only, with no `state.js` import at all, and the sentence in the
   handoff becomes checkable by `grep`. `tools/purity.mjs` should assert it: `ai.js` may not import
   `state.js`.
2. Derive the AI's tiebreak streams from something that is *not* the placement seed —
   `hash(game.seed ^ 0x5bf03635, …)` is not enough; use a `game.aiSeed` field set from
   `hash(seed, 'ai')` at `newGame`, and split the placement stream off as `game.placeSeed`. Then
   even a compromised `ai.js` holding its own seed cannot reconstruct the layout.
3. Separately, if hidden layouts are ever meant to survive a shared URL (multiplayer is in
   `js/net/`), the layout must not be a function of a public parameter at all.

---

## BLOCK-5 — `replay(eventsFor(g, side))` does not equal `view(g, side)` before both fleets are placed, which is the exact starting point REVIEW B6's invariant names.

**What's wrong.** B6's fix text: *"replaying `eventsFor(side)` **from `newGame`** must reconstruct
exactly `view(game, side)`."* The soak only compares them from the first shot onward
(`sim.mjs:381`, inside the `while (game.phase === 'AIM')` loop). Before then they disagree
(`adversarial_sim.mjs redaction`, C2):

```
fresh newGame       side 0  DIVERGES at .enemy  (replay 5 ships, view 0)
fresh newGame       side 1  DIVERGES at .enemy  (replay 5 ships, view 0)
one side placed     side 0  DIVERGES at .enemy  (replay 5 ships, view 0)
one side placed     side 1  agrees
both placed         both    agrees
```

`index.js:96` builds the whole enemy roster from `start.fleet` before reading a single event;
`state.js:145` builds it from `them.ships`, which is empty until they place.

**Downstream failure.** R2 in the handoff instructs C6 and C7 to render from `eventsFor`. The
placement screen (D7, S10) runs entirely in `SETUP`/`PLACING`. A fleet-status HUD built from
`replay()` shows five intact enemy ships on the setup screen and five on the table; one built from
`view()` shows none. The two components disagree on screen and the invariant that exists to stop
exactly that is not evaluated in that phase.

**Fix.** In `replay()`, build `enemy` lazily: start it `[]` and populate from `start.fleet` on the
enemy's `place` event (which is present, redacted to `ships: null`, and is precisely the signal
"they now have ships"). Then extend the soak's `replay == view` check to cover `newGame`, after each
`placeFleet`, and after `over` — three extra call sites, all outside the `AIM` loop where it
currently lives.

---

# SHOULD FIX

## FIX-1 — `deserialize()` validates only `v === 1`; every hostile save I tried got through.

`adversarial_sim.mjs serial`, D3 — 6/6 tampered saves accepted:

```
{"v":1} (nothing else)          -> accepted, then TypeError "Cannot read properties of undefined"
w edited to 99, boards still 100 -> accepted AND PLAYED ON
winner:1 set while phase is AIM  -> accepted AND PLAYED ON
salvo charges edited to 999      -> accepted AND PLAYED ON
defender ships emptied           -> accepted, then TypeError reading 'hits'
turn set to 7                    -> accepted, then RulesError downstream
```

`save.js` (D3) loads this straight from `localStorage`. A truncated write or a curious player becomes
an unhandled `TypeError` inside a renderer frame — not a `RulesError` anyone can catch by contract,
which is the entire point of having `RulesError`. And `w: 99` with 100-cell boards *keeps playing*,
silently indexing off the end of every row.

**Fix.** `deserialize` validates structurally: `v`, `w`/`h` integers in `BOARD` range,
`board.length === owner.length === w*h`, `players.length === 2`, `ships.length === fleet.length`,
`turn ∈ {0,1}`, `phase` in the enum, `winner ∈ {0,1,null}`, `charges[k] <= start[k]`, and every
ship's `cells` consistent with `cellsOf`. Throw `RulesError('corrupt save')` otherwise. Also
(D4): `deserialize(obj)` currently returns the **same object**, not a copy —
`const snapshot = deserialize(game)` looks like a clone and is an alias. Always
`JSON.parse(JSON.stringify(...))`, or refuse non-strings.

## FIX-2 — The ladder gate's headline metric gives every tier a different opponent field.

`sim.mjs:524` computes each tier's "overall win rate across the round robin" over the four *other*
tiers. Tier 0's field is {1,2,3,4}; tier 4's is {0,1,2,3}. The strongest tier is scored only against
weaker opponents and the weakest only against stronger ones, so the metric stretches the ends
mechanically — and it is the metric D6's ≥3-point monotone-with-separation gate is computed on.
Including self-play (same games, one extra diagonal) compresses every gap by roughly a third
(`adversarial_sim.mjs ladder`, F1):

```
        excl-self   incl-self
  T0        0.0%       16.7%
  T1       32.8%       38.5%
  T2       44.2%       46.1%
  T3       81.4%       70.9%
  T4       91.7%       77.8%
  gaps   32.8/11.4/37.2/10.3   vs   21.9/7.6/24.8/6.9
```

Both still pass the 3-point floor here, so this is not currently masking a failure — but the gate is
reporting a number inflated by its own structure, and the honest one (the head-to-head matrix
printed directly above it) is not gated at all.

**Fix.** Gate on the **adjacent head-to-head** cells — `T1 vs T0`, `T2 vs T1`, `T3 vs T2`, `T4 vs T3`
— each ≥ 55% with a non-overlapping interval. Those are the numbers that describe what a player
climbing the ladder experiences, and they are already computed.

## FIX-3 — `sim.mjs`'s `playout` scores a non-terminating game as a win for the row tier.

`sim.mjs:471` — `while (game.phase === 'AIM' && guard++ < 4*10*10 + 10)`. If the guard trips,
`game.winner` is `null`, and `if (r.winner === 1) wins[b][a]++; else wins[a][b]++` (line 489) sends
it to `a`. It does not trip today, but the failure mode is silent, directional, and lands in the
ladder gate. Assert `winner !== null` and `fail()` if not.

## FIX-4 — Tiers 2, 3 and 4 open in the centre in 100% of games. REVIEW S5 is only half fixed.

`adversarial_sim.mjs play`, E1 — first shot over 400 distinct seeds:

```
classic 10x10   T0 99 distinct   T1 98 distinct   T2 4 distinct   T3 4 distinct   T4 4 distinct
rung 8 12x12    T0 133           T1 133           T2 4            T3 4            T4 4
rung 1 8x8      T0 64            T1 64            T2 4            T3 4            T4 4
```

The per-game tiebreak stream D6 asked for works — the opening is 4 shots, not 1 — but all four are
the centre 2×2, and T3/T4 always open with a `salvo` there. A player sees the identical opening
*move* every single game from rung 5 onward. The full distributions, which are also evidence for
BLOCK-1 — tier 3's "naive" policy and tier 4's "good" policy pick the **same opening shot on all 400
seeds**:

```
T2  shell@5,5 107   shell@5,4 102   shell@4,5 99   shell@4,4 92
T3  salvo@5,5 107   salvo@5,4 102   salvo@4,5 99   salvo@4,4 92
T4  salvo@5,5 107   salvo@5,4 102   salvo@4,5 99   salvo@4,4 92
``` (To be fair to the author: it does not run deep. By
shot 5 there are 161–196 distinct sequences in 200 seeds, E2. The problem is only the opening.)

**Fix.** Broaden the tiebreak pool rather than adding entropy to the score: take the top-k by score
(k ≈ 8, or all cells within 3% of the best) and pick from that with the per-game stream. Costs
nothing and makes the first shot unpredictable without weakening it measurably.

## FIX-5 — The placement prior is static and uniform, so under D7 one hand-placed layout beats every AI tier forever.

S5 warned that *"ships parked in a corner are systematically found last"*. That is still true, and
D7 made it exploitable by handing the player the placement screen. Shots for tier 4 to clear a
17-cell fleet, 200 seeds, AI unopposed (`adversarial_sim.mjs exploit`, J1):

```
auto (random)                  20.7 shots   (min 10, max 39)
flush to the edges             26.4 shots   (min 20, max 31)   +28%
all four corners               25.6 shots   (min 20, max 32)   +24%
clustered dead centre          16.9 shots   (min  9, max 40)   -18%
```

Note the variance as well as the mean: the edge layout's *worst* case (31) is barely worse than
random's mean, i.e. it is reliable, which is what makes it a strategy rather than a lucky roll. A
player who finds it once wins with it forever, against a ladder made entirely of these tiers.

**Fix.** Give tiers 3 and 4 a mild anti-edge correction: multiply the density model by a fixed
per-cell prior that is flat except for a small boost on the outer ring, or (cheaper and more
principled) score the first N shots against a *uniform-over-cells* objective rather than
uniform-over-placements — the placement-count measure is what creates the centre bias, since a
corner cell is covered by fewer legal placements than an interior one. Either way, re-run J1; the
gap should land under 10%.

## FIX-6 — `events()` (the god view) sits on the public surface with the shorter name, and `view(game, otherSide)` is unguarded.

`index.js` exports `events` and `eventsFor` adjacently. `events(game)` returns both fleets' exact
placements (verified, C5). The author already flagged this as R2 for someone else to fix in
`main.js` — but the export itself is the sim's, and the sim is the component that decided fog is
enforced rather than promised. Likewise `view(game, 1 - mySide)` returns the AI's exact ship cells
(C6); nothing distinguishes "a side" from "the local player's side".

**Fix.** Rename `events` → `unredactedEventsForDebugging` (verbosity is the feature), or drop it from
`index.js` entirely and let `sim.mjs` import `state.js` directly, which it can — nothing else needs
it. Then B6's "the renderer's only channel" is true because it is the only channel that exists.

## FIX-7 — `aiMove` silently plays tier 2 for a side whose tier is `null`.

`ai.js:246`: `const tier = game.players[side].tier ?? 2`. A human side has `tier: null`, so
`aiMove(game, 0)` on the player's side returns a real shot (`{kind:'shell', r:4, c:4}`) instead of
throwing. A UI bug that calls it for the wrong side auto-plays the player's turn and nothing
reports it. **Fix:** `if (tier == null) throw new RulesError('that side has no AI tier')`. Callers
that genuinely want a hint (an "auto" button, a tutorial) pass a tier explicitly.

## FIX-8 — `HANDOFF_SIM.md` overstates two pieces of coverage.

Both matter because the next agent will trust them instead of re-testing:
- §4: *"`snapTarget` is idempotent — fuzzed over 605 wild inputs **per game**."* It is fuzzed once,
  on game 0, on a single 10×10 (`sim.mjs:272`, `if (gi === 0) fuzzSnap(game)`). I ran the equivalent
  on five board shapes including 16×8, 8×16 and 16×16 — 12,675 inputs — and it **held** (see §Held),
  so the function is fine; the *claim* is not, and it is the kind of claim that stops someone
  re-testing after a change to `anchorInset`.
- §7 / §2: *"`ai.js` … Sees a `View` and two integers, never a `Game`"* — see BLOCK-4.

## FIX-9 — Unvalidated ordnance override, and a 1-cell fleet on 16×16 that `fleetLegal` accepts.

`newGame({ ordnance: { salvo: 1e9 } })` is accepted and yields a billion salvos (G3). `newGame({
ordnance: { salvo: -5 } })` clamps to 0 silently. C7's fleet/mode builder will feed this from a UI
control. **Fix:** clamp to `[0, w*h]` and reject non-integers with a `RulesError` matching
`fleetLegal`'s shape.

Separately, `fleetLegal(16, 16, [1])` returns `null` (legal). Self-play there takes 78 shots for the
winner and up to **478 turns** (G4, E4) — it terminates, so no invariant breaks, but it is a
coin-flipping simulator, and D7's custom-fleet builder will offer it as a valid fleet. A
`fleetLegal` minimum on total ship cells (e.g. `cells >= 0.08 * w * h`, which still allows every
`LADDER` config with room to spare) would keep the builder honest.

---

# NOTED

**NOTE-1 — the exported surface's footguns**, in descending order of how fast someone will hit them
(`adversarial_sim.mjs ergo`):

1. **`fleet` names two types on two objects a renderer holds simultaneously.** `game.fleet` is
   `[5,4,3,3,2]` (number[]); `view.fleet` is `ShipView[]`; `view.fleetLengths` is the number[] again
   under a third name; the `start` event calls the number[] `fleet` a fourth time. Rename the View's
   ship array to `view.ships` / `view.enemyShips` and let `fleet` mean lengths everywhere.
2. **`turn` vs `turns`** — side to move vs shot counter, on both `Game` and `View`, distinguished
   only by a plural. `sideToMove` and `turns` costs one rename and removes the class of bug entirely.
   (I misread it too, within a minute of opening the file.)
3. **`legal()` / `fleetLegal()` return null when legal.** B7's actual complaint — that
   `if (legal(...)) fire(...)` does the wrong thing — is technically fixed, but the natural call now
   silently *never* fires instead of always firing. `whyIllegal()` / `whyUnfit()` reads correctly at
   the call site and needs no comment.
4. **`players[i].start` is the starting ordnance; `game.first` is the starting side.** `View` gets
   this right with `ordnanceStart`; `Game` does not.
5. **Event side-naming is inconsistent**: `shot`/`result`/`sunk` use `{by, at}`, `place`/`turn` use
   `{side}`, `over` uses `{winner}`. `e.side` is `undefined` on three of six types, so a renderer
   switching on it fails silently rather than loudly.
6. **`newGame` accepts nonsense silently**: `{seed:'abc'}` → seed 1 (so `?seed=abc` and `?seed=1.5`
   from `main.js`'s `+params.get('seed')` are the *same fixed match*); `{first: 5}` → 0;
   `{tiers:[9,-3]}` → stored as 9 and −3, clamped only inside `chooseShot`, so
   `TIER_NAMES[game.players[0].tier]` is `undefined` in the HUD.
7. **`ladderRungs` is the live module array.** `sim.ladderRungs[0].fleet.push(9)` poisons every
   subsequent `ladderGame(1)`. `rungConfig()` copies; the export does not. Same shape of problem:
   `BOARD`/`ORDNANCE`/`LADDER` in `config.js` are mutable shared objects — `sim.mjs` itself sets
   `BOARD.placeTries = 0` mid-run, which is proof the sim's behaviour is changeable at a distance
   from any component that imports config.

**NOTE-2 — `setBoard` rewrites history in place.** `state.js:122` replaces the existing `place` event
in `game.log` rather than appending. It is legal mid-match for whichever side has not yet been fired
on — with `first: 0` that is the side about to move — so a stream already handed to a renderer
becomes retroactively false. `replay`/`view` still agree afterwards (G5), so nothing is *broken*
today; the risk is a saved replay or a spectator stream that was captured before the rewrite.
HANDOFF §8's "only legal while that side's board is untouched" is accurate but reads like "only
before the match starts", which it is not. Either append a `replace` event or forbid `setBoard` once
`phase === 'AIM'`.

**NOTE-3 — the permutation test's stop schedule is front-loaded.** Stops are at t = 3, 8, 15, 24, 33,
44 and the probe loop runs 50 turns; tier-3/4 probe games end around t≈36, so the last one or two
stops usually never fire. The positions where a hidden-information cheat pays most (endgame, hunting
the last 2-ship) are the ones sampled least. Cheap fix: make the stops proportional —
`Math.round(f * expectedLength)` for `f` in `[0.1 … 0.9]`.

**NOTE-4 — tier 2 can be worse than tier 1 on adversarial layouts.** Against the fixed
touching-ship/edge layout in E3, tier 1 clears in 51.5 shots and tier 2 in 52.8. It is the same
centre-prior problem as FIX-5 and it inverts one rung of the ladder for a player who places that way.

---

# What held

Stated specifically, because these were attacked and did not break:

- **`eventsFor()`'s redaction is airtight** over a full game. `place`/`result` redaction holds
  (C3); I looked for side channels in event ordering, counts, `sunk` payloads, the ordnance ledger,
  `turns`, and log length and found none — result events are one-per-footprint-cell regardless of
  ownership, `sunk` carries only cells that are public the moment it fires, and the stream's length
  is a function of shots fired, not of the layout (C3b). `view(g,0).ownGrid` is exactly
  `view(g,1).grid` with nothing extra either way (C4). The three-line rule is the right rule; it is
  applied on too few of the exits (BLOCK-3, BLOCK-5).
- **Serialisation round-trips exactly, including mid-hit-run with ordnance partly spent.** 40
  positions caught mid-run with charges already spent: `deserialize(serialize(g))` deep-equal, and
  crucially the *remaining transcript* from the round-tripped copy is identical shot-for-shot to the
  original's (D1). The integer-RNG ruling in D6 does what it was written to do. `game.rng` is not
  touched at all after placement (D2), so there is no hidden state to lose.
- **`snapTarget`/`footprint` are genuinely total and idempotent.** 12,675 wild inputs across 6×6,
  16×8, 8×16, 16×16 and 12×8, with kinds `bogus`/`undefined`/`null`/`42` and coordinates including
  `NaN`, `±Infinity`, `'3'`, `{}`, `[]`, plus fully malformed shot objects (`null`, `0`, `'shell'`,
  `Object.create(null)`). Zero failures, zero throws, every footprint 1/4/9 cells and on-board (G1).
- **`fleetLegal` and `newGame` agree over 2,178 fuzzed configs** — 11 dimensions × 11 dimensions ×
  18 fleets including `[0]`, `[-1]`, `[2.5]`, `[null]`, `[Infinity]`, `'abc'`, 13 ships, and
  fractional grids. Same reason string every time, no throw from `fleetLegal`, and every config it
  accepted actually placed (G2). This is stronger than the 11 hand-picked cases the soak checks and
  it held completely.
- **Every hostile call I could construct threw a `RulesError` with a player-readable reason**: fire
  after `over`, out of turn, before placement, side 2, double `placeFleet`, non-array placements,
  `NaN` coordinates, overlapping placements, salvo with 0 charges (G3). `__proto__` in a placements
  array does not pollute.
- **Termination and cell conservation hold on every degenerate board I could build** — 12 ships on
  6×6, exactly at the occupancy cap, 16×8 at max aspect, 6×12, 16×16 with a single 1-cell ship —
  720 games, none exceeding `4·w·h` (G4).
- **The permutation test's skip logic is honest.** I wrote an exhaustive alternative-layout counter
  and checked the harness against it: it never labelled a board "the resolved cells force the
  layout" when an alternative existed (55 probes), and the boards where no alternative genuinely
  exists are spread across the game rather than concentrated on the hard cases (B1/B3). The 52 skips
  in the author's run are what they are described as. The test's weakness is BLOCK-4, not the skips.
- **Tier 1's hunt/target handles sunk-adjacent hits correctly.** I expected it to lose the thread on
  a lone hit whose only continuation runs alongside a sunk hull; it picked the single correct cell
  40/40 (E3c), because the candidate filter tests `grid[i] === UNKNOWN` and `SUNK` fails that. The
  touching-ship weakness that does exist is a *density prior* problem (FIX-5, NOTE-4), not a
  target-mode bug.
- **S4 is fully implemented and correct**: row-major within footprint, all results then all sunks
  then exactly one of turn/over, `repeat: true` on re-resolution, ≥1 result from every `fire()`
  including a fully-resolved salvo.

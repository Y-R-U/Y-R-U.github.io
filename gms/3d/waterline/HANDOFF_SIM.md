# WATERLINE — C5 sim handoff

The rules engine, the five AI tiers and the tournament ladder. Everything under `js/sim/` plus
`sim.mjs`. **This is the only context transfer** — C2, C6, C7 and Wave C consume it cold.

Read `DECISIONS.md` D6, D7 and **D8** first if you have not; they are what this implements.
Revision 3, after `REVIEW_SIM.md` round 2. §11 lists what changed and what is still open.

```
node tools/purity.mjs         # purity: ok — 12 file(s) under js/sim/ are pure
node sim.mjs 5000             # sim: ok — every invariant held  (45s)
node sim.mjs 2000 --ladder    # the tier matrix, the separation gate and its three controls
node sim.mjs 600 --rungs      # the ladder curve a player of fixed skill actually meets
node tools/adversarial_sim.mjs   # the examiner's harness — READ §11 BEFORE RUNNING IT
```

**If you are C2, C6 or C7, the three things that will bite you:**
1. `newGame` needs a `layoutSeed` and throws without one (D8). So do `ladderGame` and `autoplay`.
2. `view(game, side)` and `eventsFor(game, side)` only accept `game.localSide`. `viewAs` /
   `eventsAs` are the named escape hatches.
3. `game.turn`, `game.first`, `player.start` and `view.turn` are **gone**, not deprecated.
   They are `sideToMove`, `firstMove`, `ordnanceStart`, `sideToMove`.

---

## 1. The rules that matter

**`js/sim/` is pure.** No three, no `window`, no `document`, no `performance`, no `Math.random`,
no `Date.now`. Randomness is an **integer** field, so `deserialize(serialize(g))` is deep-equal
to `g` — a closure PRNG would not survive that.

**`js/sim/ai.js` cannot reach a Game.** It imports `./tables.js`, `./rng.js` and `./consts.js`
and nothing else; it receives a `View`, a tier and two integers. `sim.mjs`'s `auditAiModule()`
fails the build if it grows an import, mentions `game`, or touches a Game-shaped field.

**Read that guard for what it is: it catches an accident, not an adversary.** The review broke it
seven ways — `await import('./state.js')`, a string-built specifier, computed property access,
`gameState` (no word boundary inside a word), a re-export through an allowed module. The first two
are now closed (`import(` and `require(` are matched, and comments are stripped with a real
stripper rather than by dropping whole lines, which used to delete code from any line beginning
with `//`). The identifier regexes **cannot be made sound and should not be trusted**. What holds
the property up is structural: `ai.js` is 300 lines, imports three files, and is handed a View.

**Nothing under `js/sim/` imports `js/config.js` any more.** `js/sim/tables.js` takes one frozen
copy at import and is the only door. `BOARD.placeTries = 0` from a renderer used to change
placement and `ORDNANCE.salvo.offsets` used to change the rules mid-match; the soak now asserts
that editing `config.js` underneath the sim changes nothing. `js/config.js` must still be pure —
`tools/purity.mjs` does not walk it (**R4**).

## 2. Files

| File | What lives there |
|---|---|
| `js/sim/index.js` | the public API. **Nothing else under `js/sim/` is imported from outside it** |
| `js/sim/consts.js` | grid values, phase names, `RulesError`. Knows nothing about a Game |
| `js/sim/tables.js` | the frozen snapshot of `config.js`'s `BOARD` / `ORDNANCE` / `AI`. The only door |
| `js/sim/state.js` | Game/Player/Ship shapes, `newGame`, `placeFleet`, `setBoard`, `view`, serialize |
| `js/sim/rules.js` | `footprint`, `snapTarget`, `whyIllegal`, `fire`, the ordnance ledger |
| `js/sim/events.js` | the redaction rule, in one function, used by every exit that hands events out |
| `js/sim/placement.js` | `packRows`, `fleetLegal`, random legal placement, `coverageMap` |
| `js/sim/memory.js` | what an opponent habitually does — where they place, where they shoot |
| `js/sim/ai.js` | the five tiers. A `View` and two integers, never a Game |
| `js/sim/ladder.js` | the eight rungs, progression, opponent names |
| `js/sim/rng.js` | integer-state PRNG |
| `sim.mjs` | the soak harness (project root) |

## 3. The exported API

```js
// --- setup -------------------------------------------------------------------------------
fleetLegal(w, h, lengths)              → null | 'reason'      // === whyFleetUnfit; D7 names this
whyFleetUnfit(w, h, lengths)           → null | 'reason'      // ask BEFORE you commit
newGame(opts)                          → Game                 // THROWS RulesError on bad input
placeFleet(game, side, placements)     → Event[]              // placements null ⇒ random legal
setBoard(game, side, ships)            → Event[]              // force a layout, before AIM only

// --- play --------------------------------------------------------------------------------
snapTarget(game, shot)                 → Anchor {kind, r, c}  // total + idempotent
footprint(game, shot)                  → Cell[]               // always 1/4/9, always on-board
whyIllegal(game, side, shot)           → null | 'reason'      // null MEANS LEGAL — hence the name
fire(game, side, shot [, viewer])      → Event[]              // REDACTED delta. Atomic. Throws
fireRaw(game, side, shot)              → Event[]              // unredacted. HARNESS ONLY
aiMove(game, side)                     → shot                 // pure; never mutates game
autoplay(game, turns, opts)            → Game                 // game may be null; see R1

// --- reading -----------------------------------------------------------------------------
view(game, side)                       → View                 // side MUST be game.localSide
viewAs(game, side)                     → View                 // escape hatch: spectator / harness
eventsFor(game, side)                  → Event[]              // side MUST be game.localSide
eventsAs(game, side)                   → Event[]              // escape hatch
replay(eventsForStream)                → View                 // rebuild a View from a stream
redactEvents(events, viewer)           → Event[]              // the rule, if you need it directly
unredactedEventsForDebugging(game)     → Event[]              // the god view. Never render this
revealedLayout(game, side)             → [{id,len,cells}]|null  // null until the match is OVER
shotHistory(game, side)                → Cell[]               // every cell that side fired at

// --- persistence -------------------------------------------------------------------------
serialize(game) / deserialize(str)     → string / Game        // JSON. deserialize validates hard

// --- ladder + memory ---------------------------------------------------------------------
ladderRungs                            → frozen Rung[]        // rungConfig() hands out mutable copies
rungConfig(rung)                       → Rung
newLadder() / applyLadderResult(s, won) → LadderState         // pure
ladderGame(rung, seed, opts)           → Game                 // placed and ready
newMemory()                            → Memory
observeLayout(mem, w, h, ships)        → Memory               // after a match, from revealedLayout
observeShots(mem, w, h, cells)         → Memory               // after a match, from shotHistory
memoryProblem(mem)                     → null | 'reason'      // newGame runs this on what you pass
placementPrior(mem, w, h, lengths)     → number[]             // read-only; derived internally now
shotPrior(mem, w, h)                   → number[] | null
memoryGames(mem, w, h)                 → int

// --- constants / helpers -----------------------------------------------------------------
UNKNOWN=0 MISS=1 HIT=2 SUNK=3   PHASES   KINDS = ['shell','heavy','salvo']
TIER_NAMES = ['Lookout','Gunner','Fire Control','Admiralty','Ghost']
anchorDomain(game, kind) → {rLo,rHi,cLo,cHi}    packRows(lengths,w,h)    cellsOf({r,c,len,dir})
packedPlacement(rng,w,h,lengths)   makeRng(seed)   coverageMap is internal
chooseShot(view, tier, {turn, match}, {prior})  // the AI, with no Game anywhere near it
RulesError    // .reason is the same string whyIllegal() would return
implemented   // true
```

### Removed in revision 3 — hard breaks

| was | now |
|---|---|
| `game.turn` / `game.first` / `player.start` / `view.turn` aliases | **deleted.** Use `sideToMove`, `firstMove`, `ordnanceStart`, `sideToMove` |
| `newGame({ priors, hide })` | **`newGame({ memories: [m0, m1] })`** — a Memory, never a raw array |
| `newGame({ … })` without `layoutSeed` | **throws** (D8) |
| `view(game, otherSide)` / `eventsFor(game, otherSide)` | **throws.** `viewAs` / `eventsAs` |
| any unrecognised `newGame` option | **throws**, so a removed option fails loudly |

The aliases were non-enumerable getters, which meant they survived `serialize`/`deserialize` and
**vanished across `structuredClone`, `JSON.parse(JSON.stringify(…))` and every spread** — reading
`undefined`, so `if (g.turn === 0)` was quietly false for both sides. The soak now asserts they are
absent and that `sideToMove` / `firstMove` / `ordnanceStart` survive all four copy routes.

### Renames in revision 2 — still current

| was | now | why |
|---|---|---|
| `legal(g, s, shot)` | **`whyIllegal(g, s, shot)`** | `if (legal(...)) fire(...)` compiles and does the wrong thing. The name now makes the wrong call read wrong |
| `events(game)` | **`unredactedEventsForDebugging(game)`** | the leaking one had the shorter name and sat next to `eventsFor` |
| `game.turn` | **`game.sideToMove`** | `turn`/`turns` were the side to move and the shot counter, told apart by a plural |
| `game.first` | **`game.firstMove`** | `first` next to `player.start` read as a pair, and was not one |
| `player.start` | **`player.ordnanceStart`** | it is the starting *ordnance*, not the starting side |
| `view.fleet` (ShipView[]) | **`view.ships`** | `fleet` now means ship lengths everywhere: `game.fleet`, `view.fleet`, `start.fleet` |
| `view.enemy` | **`view.enemyShips`** | |
| `view.fleetLengths` | **`view.fleet`** | |

`game.turn`, `game.first`, `player.start` and `view.turn` survive as **non-enumerable getter/setter
aliases**. They are invisible to JSON, to `Object.keys` and to every deep-equal, so they cannot
leak into the serialized shape — they exist only so code written against revision 1 keeps running.
**Delete them once nothing reads them** (R9).

### `newGame(opts)`

```js
newGame({
  w, h, fleet,          // required in practice; defaults are classic 10x10
  seed,                 // integer. Omitted ⇒ 1, which means a FIXED match. C7 must pass one
  layoutSeed,           // integer. REQUIRED — throws without it. See below
  tiers: [t0, t1],      // null | 0..4 each. null = a human
  first,                // 0 | 1, who opens. Default 0
  localSide,            // 0 | 1, who is watching. Default 0. fire() redacts for this side
  ordnance,             // false | { heavy, salvo } charge counts, applied to BOTH sides
  memories: [m0, m1],   // Memory objects. What the AI is allowed to have learned. Never a raw map
})
```

**It throws `RulesError` on anything it does not understand** — a non-integer seed, `first: 5`,
`tiers: [9, -3]`, `ordnance: { salvo: 1e9 }`, an unknown ordnance kind. Nothing is silently
coerced. For a fleet problem the `.reason` is byte-identical to `fleetLegal(w, h, fleet)`, so
`fleetLegal` is the predicate you show the player and a throw is a programming error.

Rejected fleets: empty · not laid out by `packRows` · a ship longer than `min(w,h)` · a grid
outside [6,16] · aspect over 2:1 · more than 12 ships · over 35% occupancy · **under 8% occupancy**
· fractional anything. The floor is new: one ship on 16×16 is legal geometry and a coin-flipping
simulator — 78 shots of noise in which every tier plays identically.

### `layoutSeed` is required (D8)

`?seed=` is a URL parameter, so anything derived from it alone is readable by whoever holds the
link. Revision 2 split the streams but let `layoutSeed` **default** to `hash(seed, …)`, which
bought nothing: chain the two hashes and the enemy fleet came out on **300/300** games, and tier
4's *hidden* fleet on **100/100**, because the hiding step was a deterministic argmin with no
entropy of its own. `ladderGame(rung, seed)` and `autoplay(null, …, {seed})` were cracked too.

So there is no default. `newGame`, `ladderGame` and `autoplay` all throw without one.

| field | derived from | who may know it |
|---|---|---|
| `game.rng` | **`layoutSeed`, caller-supplied, required** | nobody. `layoutSeed` is never stored — only its evolved state is |
| `game.aiSeed` | `hash(seed, …)` | the AI's tiebreak streams. Public by design |
| `game.seed` | you | public |

Fleet-hiding now also draws 48 candidate layouts and picks among the quietest four using that
stream, so the hidden layout is not reconstructable even by someone who has reimplemented the
algorithm.

The soak reimplements the attack from outside the sim and reports it every run, **with a positive
control** so the test cannot pass by being broken:

```
seed oracle: 0/150 fleets and 0/150 hidden fleets recovered from the public seed
             (150/150 with the layoutSeed, the positive control)
```

**What C7 must do:** draw `layoutSeed` from real entropy (`crypto.getRandomValues`, or
`Date.now() ^ Math.random()*2**32`) at the UI layer, keep it out of the URL, and persist it with
the save if a match must resume. The sim is pure — no clock, no `Math.random` — so it genuinely
cannot draw its own, which is exactly why the caller is forced to. **For a screenshot, deriving it
from `?seed` is fine**: there is no opponent to hide from in a still.

## 4. Shapes

```js
Cell   = { r, c }                       // r ∈ [0,h), c ∈ [0,w)
Anchor = { kind, r, c }                 // DIFFERENT domain per kind
shot   = { kind, r, c }                 // kind ∈ 'shell' | 'heavy' | 'salvo'
```

| kind | cells | anchor is | anchor domain |
|---|---|---|---|
| `shell` | 1 | the cell | `r ∈ [0,h-1]`, `c ∈ [0,w-1]` |
| `heavy` | 4 | the top-left of the 2×2 (a **lattice corner**) | `r ∈ [0,h-2]`, `c ∈ [0,w-2]` |
| `salvo` | 9 | the **centre** of the 3×3 | `r ∈ [1,h-2]`, `c ∈ [1,w-2]` |

Ask `anchorDomain(game, kind)` rather than re-deriving it. `footprint()` snaps first, so it is
total: any input, including off-board, `NaN`, `'3'`, `{}` or a bogus kind, returns exactly 1/4/9
in-bounds cells row-major. Fuzzed over **10,782** inputs across six board shapes including 16×8,
8×16 and 16×16.

```js
ShipView = { id, len, hits, sunk, cells: Cell[] | null }
```

`cells` is `null` for an **enemy** ship until it sinks, and an unsunk enemy ShipView also reports
`hits: 0` — knowing that two of your hits share a hull is information you do not have. Your own
ships always carry real cells and real hits.

```js
View = {
  w, h, side,
  grid:    Uint8Array(w*h),   // the ENEMY's board as you know it — the plotting table paints this
  ownGrid: Uint8Array(w*h),   // YOUR board — what the enemy has resolved on you
  ships:      ShipView[],     // YOUR ships. cells always present
  enemyShips: ShipView[],     // enemy ships. cells null until sunk. [] until they place
  fleet: number[],            // the ship lengths, same for both sides
  ordnance:      { heavy, salvo },   // your charges remaining
  ordnanceStart: { heavy, salvo },   // what you started with (the recharge cap)
  shots,                      // shots YOU have taken
  sideToMove,                 // 0 | 1
  turns,                      // shots taken by both sides
  phase,                      // 'SETUP' | 'PLACING' | 'AIM' | 'OVER'
  winner,                     // 0 | 1 | null
}
```

`grid` / `ownGrid`: `0` unknown, `1` miss, `2` hit, `3` sunk. Both are copies.
§3.3's `RESOLVE` is atomic inside `fire()` and is never observable.

## 5. Events — vocabulary, order, redaction

```js
{ t:'start',  viewer, side, w, h, fleet:[lens], first, ordnance:{heavy,salvo} }  // synthetic header
{ t:'place',  side, by, ships:[{id,len,r,c,dir}] | null }                        // dir: 'h'|'v'
{ t:'shot',   side, by, at, kind, anchor:{r,c}, cells:[{r,c}] }
{ t:'result', side, by, at, r, c, hit:Boolean, shipId, repeat:Boolean }
{ t:'sunk',   side, by, at, shipId, len, cells:[{r,c}] }
{ t:'turn',   side, by }
{ t:'over',   side, by, winner, turns }
```

**Every game event carries `side` and `by`, and they are the same value: the acting side.**
`shot`/`result`/`sunk` additionally carry `at`, the side whose board was affected. Revision 1 had
`{by,at}` on three types, `{side}` on two and `{winner}` on one, so a renderer switching on
`e.side` failed silently on half of them. `by`/`at` are kept because BUILD_PLAN §2.1 froze them;
`side` is the one field present everywhere. All events are plain and structured-clone safe.

**Order within one `fire()` (D6), asserted after every shot:** one `shot` → every footprint cell's
`result`, **row-major within the footprint** → every `sunk`, ascending `shipId` → exactly one of
`turn` or `over`.

A shot at an already-resolved cell **does** emit a `result`, flagged `repeat: true`, carrying the
value the cell already had. The soak saw **6,686** of them across 5,000 games, so the path is live
— C6 must decide what a repeat looks like (probably: no new splash, no re-pulse on the table).

### The redaction rule

One function, `js/sim/events.js`'s `redact`, applied on **every** exit that hands events out:

| Event | Redaction |
|---|---|
| `place` for a side other than the viewer | becomes `{ side, by, ships: null }` — you learn they placed, nothing else |
| `result` where `at !== viewer` | `shipId` forced to `null` |
| everything else | untouched. `sunk` keeps its cells: sinking a ship is when they become known |

**`fire()` returns the redacted delta**, redacted for **`game.localSide`** — the session's viewer,
set once at `newGame`, default 0. Revision 1 returned the raw delta here, so the one function a
renderer actually animates from leaked 32 enemy `shipId`s a game while `eventsFor` guarded a
channel nobody used.

It is deliberately **not** redacted for the *firing* side. Brief step 6: *"you see the enemy ships
fire, and because these are your ships you see exactly which one is struck and where — with a red
indicator"*. That indicator is `shipId` on a result whose `at` is you. Redacting per-firer would
delete it. Redacting per-**session** gives fog of war and brief step 6 at once, with no argument
for a presenter to forget. `fireRaw()` is the unredacted one and belongs to the harness.

`replay(eventsFor(game, side))` reconstructs `view(game, side)` **exactly** — checked at
`newGame`, after each `placeFleet`, after every shot and after `over`, both sides, all 5,000 soak
games. Revision 1 only checked inside the `AIM` loop and diverged at `newGame`, which is the exact
starting point D6's invariant names: `replay` invented the enemy roster from `start.fleet` before
they had placed. It now builds it from the enemy's `place` event.

## 6. Rules, as implemented

- A hit does **not** grant a bonus turn. Ships may touch. Firing at a resolved cell is legal and
  wasted; the AI never does it.
- `sunk` the instant a ship's last cell is hit; `over` when a side has no unsunk ships.
- `game.turns` increments on every `fire()`, both sides. Pacing (§7.4) keys off it.
- Ordnance starts at `ceil(shipCells/6)` heavy and `ceil(shipCells/12)` salvo — 3 and 2 on classic.
  Heavy recharges +1 every 8 of *your own* turns, capped at the start value. Salvo never
  recharges. Firing any kind ends your turn.
- **Ordnance is symmetric, always.** The 1.5× grant tier 4 used to get is gone. It was an
  AI-tuning knob that had leaked into the ruleset, and on ladder rung 8 it pointed one way only —
  the AI's, 13 charges to the player's 8 — on the one rung that sets `complete: true`.
  `newGame({ ordnance })` applies to **both** sides or neither.
- `newGame({ first })` picks who opens. Moving first is a real edge; anything measuring win rate
  must alternate it, and every gate here does.

## 7. The AI tiers

`aiMove(game, side)` builds `view(game, side)` and calls `chooseShot(view, tier, seeds, opts)`.
It **throws** if that side's tier is `null` — revision 1 silently played the human's turn as tier 2.

| Tier | Name | Behaviour |
|---|---|---|
| 0 | Lookout | uniform random over unresolved cells |
| 1 | Gunner | parity hunt on `(r+c) % L === k`, `L` = smallest surviving ship, `k` random per match. On a hit, works the connected run: two collinear hits extend that line only, a lone hit tries its four neighbours |
| 2 | Fire Control | placement-density argmax. Every surviving length, every position consistent with the misses and sunks, weight `1 + 8·(open hits covered)`; while a hit run is open only placements touching it count |
| 3 | Admiralty | tier 2 **plus the naive ordnance policy** — highest *summed* density block, spent as soon as a charge exists, outer ring avoided for its first three turns |
| 4 | Ghost | three policy differences, none of them ammunition: **normalised aiming**, **an adaptive prior**, and **it hides its own fleet**. See below |

Both ordnance policies obey D6's reworded rule: never a `shell` at a resolved cell, never ordnance
whose footprint is majority-resolved. Asserted over 302,063 shots.

The opening is drawn from the best 14 cells for the first two shots rather than the strict argmax.
Revision 1 had **4 distinct openings and the same shot 27% of the time** for every tier from 2 up;
it is now 14 distinct with a 9% mode, and 199–200 distinct five-shot openings over 200 seeds.

### What tier 4 actually does differently — in order of how much it is worth

Revision 2's handoff listed "normalised aiming" first and credited it with six shots. **That was
wrong**, and it is corrected here because the next agent to simplify tier 4 would otherwise delete
the half that works. Forced onto a common layout family with ordnance off — so that aiming is the
only difference left — tier 4 scores **46.9% against tier 3: it loses**.

1. **It hides.** This is the whole ordnance-off margin. `placeFleet(…, null)` for a tier-4 side
   draws 48 candidate layouts and picks among the quietest four on an avoid map: the static
   `coverageMap` (where every placement-counting opponent looks first) plus, when a memory exists,
   where this opponent has actually been shooting (`shotPrior`).
2. **An adaptive prior.** Its density model is reweighted by where this opponent has put ships
   before (`placementPrior`), falling back — with no memory at all — to `coverage^-1`, exactly
   uniform-over-**cells** rather than uniform-over-**placements**. This is what closes the
   hand-placed-layout exploit below, and it costs ~3.4 points against a plain-random opponent,
   which is the trade being made knowingly.
3. **The ordnance policy** — expected distinct hulls touched, held while a hit run is open, spent
   only when it clearly beats the best single cell.
4. **Normalised aiming**, `Σ_ships min(1, d_len / totalWeight_len)`. Measured: **+0.06 shots on
   random layouts, +0.42 clustered, −0.91 touching.** Nothing. It is kept because it is the
   natural objective for the ordnance scorer and costs nothing, not because it wins games.

**So rung 8's difficulty is largely placement.** That is a legitimate policy — parking your fleet
where this opponent does not look is a skill — but it should be described as what it is.

Randomness: `chooseShot` gets two integers, `hash(aiSeed, turns, side)` and `hash(aiSeed, side)`.
Neither is the layout seed, so even a compromised `ai.js` holding its own seeds cannot reconstruct
a layout.

### The placement exploit, closed

Shots for tier 4 to clear a 17-cell fleet the *player* chose, AI unopposed:

| the player's layout | revision 1 | now, no memory | now, after learning |
|---|---|---|---|
| auto (random) | 20.7 | 25.1 | 25.0 |
| flush to the edges | 26.4 (**+28%**) | 26.1 (+4%) | 12.6 |
| all four corners | 25.6 (+24%) | 28.0 (+12%) | 12.8 |
| clustered dead centre | 16.9 | 23.4 | 15.8 |

Under D7 the player places their own fleet, so one good layout used to beat every tier in the game
forever. It no longer does: the static correction flattens it on the first game and the learned
prior turns it into a liability by about the tenth. The reviewer's own harness now reports
*"the best adversarial layout I found costs tier 4 27.1 shots vs 25.1 random — under 15% and not a
usable exploit."*

### A negative result, recorded so nobody repeats it

Sampling whole consistent **fleets** — randomised joint layouts rather than counting each length's
placements independently — was built, measured over 400 games and deleted. It cost ~40× the
compute and moved shots-to-clear from 45.07 to 45.20.

Stated honestly, that is **"no effect larger than about 1.8 shots"**, not "no effect": the SD of
shots-to-clear is ~9, so 400 whole games cannot resolve less than that, and a whole-game mean
dilutes an effect that would only appear in constrained endgame positions. The theory says it
should be small *here* — under §3.1 ships may touch, which removes the "no ship adjacent to a sunk
hull" inference that makes a joint posterior pay in the no-touching variant. **Probably at the
ceiling; not proven at it.** The right test bed would have been endgame positions, not whole games.
Recorded so nobody repeats the experiment blind, not as a closed question.

### Measured ladder (`node sim.mjs 2000 --ladder`, 2,000 games per pairing, opening alternated)

```
head-to-head win rate, row beats column:
             T0     T1     T2     T3     T4
  T0        —    0.0%   0.0%   0.0%   0.0%
  T1    100.0%     —   30.7%   2.1%   1.5%
  T2    100.0%  69.3%     —    4.8%   2.1%
  T3    100.0%  97.9%  95.2%     —   33.1%
  T4    100.0%  98.5%  98.0%  66.8%     —

adjacent step — THE GATE: each >= 55% with the interval clear of 50%
  T1 vs T0: 100.0% ± 0.0   T2 vs T1: 69.3% ± 2.0
  T3 vs T2:  95.2% ± 0.9   T4 vs T3: 66.8% ± 2.1        all pass
```

The gate is the **adjacent head-to-head**, not a round-robin average. Averaging tier 0 only
against stronger tiers and tier 4 only against weaker ones stretches the ends mechanically; the
round robin is still printed, with and without self-play, labelled *for reference only*.

**The control, and it is the point:** tier 4's margin over tier 3 must survive holding ordnance
constant, or the ladder is measuring ammunition.

```
  table charges, both sides                                   T4 65.7% ± 2.1
  1.5x charges, both sides                                    T4 63.1% ± 2.1
  ordnance disabled entirely                                  T4 58.1% ± 2.2
  aiming alone (ordnance off, both fleets from one family)    T4 46.9% ± 2.2
```

The first three are gated and pass. The **fourth is a diagnostic, not a gate**, and it is the
honest one: hand both sides layouts from the same plain-random family via `setBoard` and tier 4
*loses*. Every point of the ordnance-off margin is where tier 4 parks its ships, not how it aims.
Revision 2's control was written to rule out "the separation is ammunition" and did; it did not
rule out "the separation is placement", and that is the confound actually present. The gate on the
fourth condition is only that tier 4's aiming is not *broken* (≥42%), and the handoff says plainly
that rung 8's difficulty is largely placement.

## 8. The ladder

Eight rungs. A win climbs one, a loss drops one but never below 1, a rung-8 win sets
`complete: true`. **The table lives in `js/sim/ladder.js`, not `config.LADDER`** — it needs a
per-rung ordnance budget, which that shape has no room for, and it is a measured curve rather than
a list of tier indices. See R8.

`node sim.mjs 600 --rungs` — a player of fixed skill against each rung as `ladderGame()` builds it:

```
  rung  opponent          tier  grid   ordnance         T1            T2            T3
   1    Tern             T0   8x8    none           99.8±0.3     100.0±0.0     100.0±0.0
   2    Harrier          T1   8x8    none           50.5±4.0      70.7±3.6      70.7±3.6
   3    Vigilant         T1   10x10  none           51.7±4.0      66.8±3.8      66.8±3.8
   4    Kestrel          T2   10x10  none           31.0±3.7      45.5±4.0      45.5±4.0
   5    Resolute         T3   8x8    h1 s0          11.8±2.6      23.3±3.4      48.8±4.0
   6    Indomitable      T3   10x10  h1 s0           7.8±2.2      21.7±3.3      46.8±4.0
   7    Wrath of Kanto   T3   12x12  h2 s1           4.3±1.6      13.7±2.7      48.2±4.0
   8    Ghost of Leyte   T4   12x12  h2 s1           4.5±1.7       8.0±2.2      40.8±3.9
```

Compare revision 1's curve for a tier-2 player: `100, 100, 75, 67, 55, 53, 7, 0` — flat, then a
cliff at 6→7, and a rung 8 nobody could ever win, which made `complete: true` unreachable and an
ending screen dead content. It is now monotone at every skill level with no step over 25 points,
and rung 8 is winnable (39% for a tier-3 player). `--rungs` asserts both, from rung 2 up — the
step off rung 1 is exempt because tier 0 loses to every other tier 100% of the time (0/8000 in the
matrix), so rung 1 is a guaranteed win by construction and the step off it says nothing.

**Ordnance is the difficulty dial**, applied symmetrically: rungs 1–4 have none, 5–6 give both
sides one heavy, 7–8 give two heavy and one salvo. That is also the shape of the learning curve —
the game teaches you ordnance at rung 5 and then makes you good at it. The remaining 25-point step
(rung 4→5 for a tier-2 player) is exactly that lesson: a player who never fires ordnance loses to
one who does, and no symmetric dial can hide it.

**Memory across a tournament.** `ladderGame(rung, seed, { layoutSeed, aiMemory })` gives Ghost the
priors. After each match, C7 feeds it:

```js
observeLayout(mem, g.w, g.h, revealedLayout(g, 0));   // where the player hides
observeShots(mem, g.w, g.h, shotHistory(g, 0));       // where the player looks
```

Both take only what the match already revealed. `save.js` persists `mem` (D3). Skip it and Ghost
falls back to the static prior — strictly weaker, never broken.

**Learning is bounded, and that is not a detail.** `placementPrior` clamps the learned multiplier
to `[1.0, 1.8]`: learning may only ever *add* attention to a cell, never take it away. Unbounded,
it inverted — twelve sacrificial games on a corner layout pushed a cell to ~3.9× and starved the
rest of the board, so a player who deliberately taught Ghost the wrong map won rung 8 **22.8%** of
the time against 10.0% for simply auto-placing. A better payoff than the exploit the prior exists
to close, on the rung that sets `complete: true`.

Decay is *not* the fix — a decaying memory is poisoned just as easily by poisoning immediately
before the target match. Bounding the downweight is. Measured every soak run:

```
rung 8, tier-2 player:  auto-place 10.0%  ·  one honest layout 0.0%  ·  12 poison games then switch 0.7%
```

Poisoning is now worse than not bothering, and the soak fails if it ever pays more than 5 points
over auto-placing. The static `coverage^-1` correction is applied *after* the clamp and keeps its
full range, because geometry is not something an opponent can lie about.

## 9. Driving the sim headlessly

```js
import * as sim from './js/sim/index.js';

const g = sim.newGame({
  w: 10, h: 10, fleet: [5,4,3,3,2],
  seed: 7,                             // public: ships in the URL, drives the AI's tiebreaks
  layoutSeed: 0x5eed1e55,              // REQUIRED and private: drives the fleet layouts (D8)
  tiers: [null, 3], first: 0,
});
sim.placeFleet(g, 0, null);            // or an explicit [{r,c,dir}, …]
sim.placeFleet(g, 1, null);

while (g.phase === 'AIM') sim.fireRaw(g, g.sideToMove, sim.aiMove(g, g.sideToMove));

sim.view(g, 0);                        // final board — `side` must be game.localSide
sim.replay(sim.eventsFor(g, 0));       // identical, rebuilt from the stream alone
sim.viewAs(g, 1);                      // the other seat, for a harness or a spectator
```

`autoplay(game, turns, opts)` does the same in one call and **accepts `game === null`**, creating
one from `opts` and returning it — the shape frozen `main.js` calls it in.

To frame a specific board: `newGame` → `setBoard(g, side, ships)` → `autoplay(g, 30)`. `setBoard`
is now legal only **before the match starts** (`SETUP`/`PLACING`). Revision 1 allowed it mid-match
for whichever side had not been fired on, and it rewrites the historical `place` event in place,
which retroactively falsifies a stream a renderer may already hold. To force one side and
auto-place the other, call `setBoard` first.

`sim.mjs` flags: `node sim.mjs <games> [--ladder] [--rungs] [--quiet]`.

## 10. What the soak checks

Every item in BUILD_PLAN §4.4, all nine of REVIEW.md B10's holes, and REVIEW_SIM's additions.
After **every shot** unless noted:

1. `ai.js`'s import list and identifiers — the structural blindness claim, checked not asserted
2. every `fire()` leads with `shot`, returns ≥1 `result`, and orders events D6's way
3. results row-major within the footprint; `side` and `by` present on every event
4. no cell resolves twice to a *different* value; `repeat:true` exactly on re-resolution
5. `sunk` once per ship, `cells.length === len`, every loser ship emits one
6. ship cell count conserved; no ship takes more hits than it has cells
7. `over` once; the winner has ≥1 unsunk ship; the loser has **zero** unhit cells, all `SUNK`
8. `view()` never exposes an unsunk enemy ship's cells or hit count, both directions
9. **`replay(eventsFor(g, s))` deep-equals `view(g, s)`** at `newGame`, after each `placeFleet`,
   after every shot, and after `over` — both sides
10. **`fire()` differs from `fireRaw()` in `shipId` and nowhere else**, for both viewers: never an
    enemy `shipId`, always your own — 36,232 comparisons
11. **termination**: `turns ≤ 4·w·h`, plus a loop guard that fails rather than hangs
12. **the AI does not cheat** — the layout-permutation test, all five tiers, stops at 10/25/40/55/
    70/85/95% of *this game's measured length* rather than a fixed schedule that ran off the end
13. `aiMove` does not mutate the game (serialize before/after)
14. `whyIllegal` ⇄ `fire` both directions: six probe shots per turn on throwaway copies
15. the AI never shells a resolved cell, never fires a majority-resolved footprint
16. `snapTarget` total and idempotent over 10,782 inputs on six board shapes; `footprint().length
    ∈ {1,4,9}`, always on-board, including for `null`, `0`, `'shell'` and `Object.create(null)`
17. ordnance ledger: never negative, never above the start, one charge per ordnance shot — **and
    both sides always start from the same table**
18. `deserialize(serialize(g))` deep-equal, and `view()` unchanged across it
19. **18 hostile saves** must each throw `RulesError` — including `w` edited to 99, an invented
    hit on open water, an inflated ship hit count, a cleared owner map, an unknown phase, a stray
    field. Revision 1's `deserialize` checked `v === 1` and nothing else
20. a fixed seed replays identically; two seeds do not
21. degenerate `newGame` — 12 rejected configs (reason matching `fleetLegal`), 5 accepted ones,
    10 nonsense-argument configs that must throw rather than coerce
22. the `packRows` fallback, forced (`BOARD.placeTries = 0`) over 5 grids × 200 seeds × 2 sides
23. six extreme boards — the occupancy cap, both 2:1 orientations, twelve 1-cell ships, 16×16 —
    60 games each, for termination and cell conservation
24. the opening spread: tiers ≥2 must have ≥12 distinct openings and no opening over 15%
25. no hand-placed layout may cost tier 4 more than 10% over a random one once it has learned
26. **the public seed is not a layout oracle** — the attack is reimplemented outside the sim and
    must recover 0/150 fleets and 0/150 *hidden* fleets, with a positive control (150/150 with the
    layoutSeed) so the test cannot pass by being broken
27. **`newGame`, `ladderGame` and `autoplay` all throw without a `layoutSeed`**; a raw `priors`
    array and four shapes of malformed `Memory` are all rejected
28. **`view` / `eventsFor` refuse a side that is not `game.localSide`**, and `viewAs` / `eventsAs`
    still work
29. **the deprecation aliases are absent**, and `sideToMove` / `firstMove` / `ordnanceStart`
    survive `structuredClone`, a JSON round trip, a spread and `deserialize`
30. **editing `js/config.js` underneath the sim changes nothing** — `placeTries`, `occupancy` and
    a salvo's offsets are all mutated mid-run and the resulting game must be byte-identical
31. **poisoning the adaptive prior must not pay** more than 5 points over auto-placing
32. tier 4's aiming, isolated by forcing both fleets from one layout family, must be ≥42%

### Latest run

```
purity: ok — 12 file(s) under js/sim/ are pure
sim: 5000 games, 302058 shots, 6476 repeat results, 3059 AI-blindness permutations (126 skipped),
     36306 fire()-redaction checks, 18 hostile saves rejected, 10782 snapTarget inputs,
     6 degenerate boards (longest 318 turns), 45.4s
  seed oracle: 0/150 fleets and 0/150 hidden fleets recovered from the public seed
               (150/150 with the layoutSeed, the positive control)
  rung 8, tier-2 player: auto-place 10.0% · one honest layout 0.0% · 12 poison games then switch 0.7%
sim: ok — every invariant held
```

The 126 skips are the *harness's* backtracking search declining to produce an alternative layout,
not sim failures.

Two counts do **not** scale with the run size, and the phrasing used to imply they did: the
`fire()`-redaction probes and the `whyIllegal`⇄`fire` probes are gated on the first 300 games,
because they deserialize a copy per probe. `node sim.mjs 5000` therefore reports the same 36,306
as `node sim.mjs 800`. Everything else is per-shot on every game.

## 11. Reading `tools/adversarial_sim.mjs` now

**It does not run against this revision.** Every one of its 15 sections aborts at its first
`newGame`, because it builds ~62 games without a `layoutSeed` and D8 makes that throw. The last
comparable full run, against revision 2, was **12 broken / 40 held**.

That is a real cost and it is the direct price of D8, which is a binding ruling and was pass 3's
first item. The harness is the examiner's and not mine to edit; porting it is one argument at each
game-construction site. Two smaller staleness points on top of the same wall: its `audit` section
carries its own copy of revision 2's `auditAiModule`, so it reports `import ./tables.js` as a
violation of an allowed list that has since changed, and its `prior` section builds
`newGame({priors})`, which is the channel R2-5 asked me to remove.

Until it is ported, every round-2 finding has an equivalent gate in `sim.mjs` (§10 items 26–32),
each of which fails the build rather than printing. Disposition of all twelve:

| finding | state | evidence |
|---|---|---|
| **R2-1** `layoutSeed` defaulted | **fixed** | required on all three entry points; oracle 0/150 fleets, 0/150 hidden, positive control 150/150 |
| **R2-2** poisonable prior | **fixed** | clamped to `[1.0, 1.8]`; poisoned 0.7% vs 10.0% auto-place (was 22.8%) |
| **R2-3** control measures placement | **fixed and re-attributed** | fourth condition added: aiming alone 46.9%. `ai.js` and §7 corrected |
| **R2-4** `view`/`eventsFor` ignore `localSide` | **fixed** | both throw off-session; `viewAs`/`eventsAs` added and gated |
| **R2-5** `opts.prior` channel | **fixed** | `newGame` takes a validated `Memory`, never an array; unknown options throw; audit hardened |
| **R2-6** deprecation aliases | **fixed** | deleted; replacements asserted across four copy routes |
| **R2-7** `config.js` a live channel | **fixed** | `tables.js` snapshot; soak mutates `config.js` mid-run and asserts nothing moves |
| **R2-8** hiding gives an informed player a discount | **partly** | not the strict argmin any more (48 drawn, quietest 4), so the counter-strategy cannot assume the layout. The ascending-coverage sweep discount is **not re-measured** — see §13 |
| C1 per-firer redaction | refuted by round 2, and now asserted in both directions | |
| F1 round-robin gate | stale, deleted by round 2 | |
| `setBoard` in `PLACING` rewrites history | **not done** — see §13 | |
| the "36,232 redaction checks" phrasing | **fixed** — §10 says which counts do not scale | |

## 12. Requests — files I do not own

**R1 — `main.js`'s `?seed`/`?turn` hook, now two problems (Wave C, one line).**
It discards the game — `autoplay: (turns, opts) => sim.autoplay(game, turns, opts)` with a frozen
`let game = null` — *and* it no longer runs at all, because `autoplay` needs a `layoutSeed` (D8).
Verified: `--seed=7 --turn=30` prints `?seed/?turn ignored: layoutSeed is required`. One line fixes
both:

```js
autoplay: (turns, opts) => (game = sim.autoplay(game, turns, { layoutSeed: opts.seed, ...opts })),
```

Deriving the layout from `?seed` **is correct here**: a screenshot has no opponent to hide from,
and the shot harness needs the board to repeat. It is only a real match that must pass a private
one (R8).

**R2 — `hook.sim.events` is now a dangling reference.** `main.js` wires
`events: () => sim.events(game)`; `sim.events` no longer exists, so calling it throws a TypeError.
Wave C should make it `events: side => sim.eventsFor(game, side)`. Until then **C6 and C7 must
call `sim.eventsFor(game, side)`** — reachable via the `...sim` spread, it just needs the game
passed. Note `hook.sim.fire(side, shot)` already returns the redacted delta with no edit to
frozen `main.js`; verified in the browser with `tools/shot.mjs --eval`.

**R3 — `buildTable` needs the lattice API (REVIEW B8, C2):** `latticeToLocal(r, c)`,
`localToAnchor(v3, kind) → {r,c}|null`, `setAimMode(kind|null)`. The sim side is ready —
`anchorDomain(game, kind)` and `snapTarget → {kind, r, c}`.

**R4 — keep `js/config.js` pure**, and add it to `tools/purity.mjs`'s walk list. `js/sim/` imports
it; a `window.` or `Date.now()` in there breaks `node sim.mjs` outright.

**R5 — C7 passes a real `seed`.** There is no clock in here; an omitted seed is 1, so every
unseeded match is the same match. A non-integer now throws rather than silently becoming 1.

**R6 — C7 calls `fleetLegal(w, h, lengths)` before `newGame`.** Same string, no throw. It is what
the custom-fleet builder shows the player (D7).

**R7 — placement screen (D7 / REVIEW S10).** `placeFleet(game, side, [{r, c, dir}])`;
`validatePlacements`'s reason string is player-facing. Auto-place is `placements: null`.

**R8 — two things now belong to other owners:**
- `config.LADDER` is **no longer read by the sim**. Delete it, or accept that it is decoration —
  `sim.ladderRungs` is the truth. It could not stay: rungs need a symmetric per-rung ordnance
  budget and that field has nowhere to live in `config.LADDER`'s shape.
- **C7 must pass a private `layoutSeed`** to `newGame` for real matches (any integer not derived
  from anything in the URL) and must not log it. Without it the layout is a function of `?seed`,
  which is shareable. `tools/shot.mjs`'s reproducibility is unaffected either way.

**R9 — done.** The deprecation aliases are deleted, not scheduled.

**R10 — port `tools/adversarial_sim.mjs` to D8** (the examiner's file, not mine). Every
game-construction site needs a `layoutSeed`; its `audit` section needs revision 3's allowed-import
list (`./tables.js`, not `../config.js`); its `prior` section builds `newGame({priors})`, which is
gone. Until then it reports 15 broken / 0 held for one reason, which is not a measurement.

---

## 13. What I did not get to

Three things, all known, none of them silent:

1. **R2-8 is only half-addressed.** Hiding is no longer a strict argmin — 48 layouts are drawn and
   one of the quietest four is taken from the private layout stream — so a player who knows the
   algorithm can no longer predict the layout, and A1c (the hidden fleet reconstructed from `?seed`
   on 100/100 games) is closed outright. But the *other* half stands: `avoidMap` is `coverageMap`
   and `staticPrior` is `coverage^-1`, so Ghost still hides roughly where its own opening searches
   last, and a player sweeping in ascending-coverage order still gets a discount. The review
   measured 106.8 shots against 122.0 for a random fleet. **I did not re-measure it after the
   change** and I do not know the current number. It is a poor strategy in absolute terms (both
   figures are far worse than simply playing well), so it is a curiosity rather than an exploit —
   but the number in the review is now stale in an unknown direction. Fixing it properly means
   decoupling the hiding map from the aiming map, which is a design change, not a tweak.

2. **`setBoard` during `PLACING` still rewrites the emitted `place` event in place** rather than
   appending. The mid-match case is refused outright; this is the narrow window where a placement
   screen has already read the stream. `replay(eventsFor)` still equals `view` afterwards, so
   nothing is inconsistent — the screen just has no event telling it the fleet moved and must
   re-read. Left alone deliberately: the fix is either a new event type (which changes the
   vocabulary C6 is about to be written against) or refusing a call the shot harness needs.

3. **`Object.freeze` on `config.js`'s own exports was deliberately not done.** The sim is immune by
   snapshot, which is the property that matters, and I verify it by mutating `config.js` mid-run.
   Freezing the source objects would make a renderer's assignment *throw* rather than be ignored —
   an ES module is strict — and `config.js` is not mine to change the failure mode of. It would
   also abort the examiner's `hostile` section, which tests the mutation directly.

Nothing above changes an event shape, a rules outcome or a serialized field, so none of it
invalidates rendering work started now.
